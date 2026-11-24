'use strict';

/**
 * Unified Editorial Platform — working prototype.
 *
 *   Author view : login → MSC upload & integrity check → submit / re-submit
 *   Editor view : login → MSC dashboard (table, filters, KPIs, reviewer modal)
 *                 → MSC review & annotation page (comments, highlight, decision)
 */
const path = require('path');
const express = require('express');
const session = require('express-session');
const multer = require('multer');

const store = require('./src/store');
const { buildSeed } = require('./src/seed');
const { analyzeManuscript, parseForPreview } = require('./src/integrity');
const { buildTemplate } = require('./src/template');
const { JOURNALS, getJournal } = require('./src/journals');
const service = require('./src/service');
const { buildOutline } = require('./src/outline');
const usage = require('./src/usage');
const analysis = require('./src/analysis');

const PORT = Number(process.env.PORT) || 3000;
const POC_USER = 'Admin';
const POC_PASS = 'Admin';

const app = express();
// Behind Render's (or any) HTTPS proxy: trust X-Forwarded-* so secure cookies work.
app.set('trust proxy', 1);
const IS_PROD = process.env.NODE_ENV === 'production';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

app.use(express.json({ limit: '1mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'uep-prototype-secret',
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: { httpOnly: true, sameSite: 'lax', secure: IS_PROD, maxAge: 8 * 3600 * 1000 }
}));

// Health check for hosting platforms (Render, load balancers)
app.get('/healthz', (req, res) => res.json({ ok: true, mscs: store.load() ? store.get().mscs.length : 0 }));

// ---------- auth ----------

function requireRole(...roles) {
  return (req, res, next) => {
    const u = req.session.user;
    if (!u) return req.path.startsWith('/api') || req.originalUrl.startsWith('/api') ? res.status(401).json({ error: 'Not logged in' }) : res.redirect('/login');
    if (roles.length && !roles.includes(u.role)) {
      return req.originalUrl.startsWith('/api') ? res.status(403).json({ error: 'Not permitted for this role' }) : res.redirect(u.role === 'Author' ? '/author' : '/dashboard');
    }
    next();
  };
}

app.post('/api/login', (req, res) => {
  const { username, password, role, client } = req.body || {};
  if (username !== POC_USER || password !== POC_PASS) {
    usage.audit(req, 'login.failed', { attemptedUser: String(username || '').slice(0, 60) });
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  if (!['Author', 'Editor'].includes(role)) {
    return res.status(400).json({ error: 'Choose the Author or Editor view.' });
  }
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Could not start a session.' });
    req.session.user = { username, role, displayName: role === 'Editor' ? 'Admin (Editor)' : 'Admin (Author)' };
    const s = usage.startSession(req, client || {});
    usage.audit(req, 'login', { footprint: s.footprint, location: s.location.label, browser: s.browser, device: s.device });
    res.json({ ok: true, redirect: role === 'Editor' ? '/dashboard' : '/author' });
  });
});

app.post('/api/logout', (req, res) => {
  const s = usage.endSession(req, 'Logged out');
  if (req.session.user) usage.audit(req, 'logout', s ? { durationSeconds: Math.round((new Date(s.endedAt) - new Date(s.startedAt)) / 1000), pageViews: s.pages.length } : {});
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', requireRole(), (req, res) => res.json(req.session.user));

// ---------- pages ----------

const page = name => (req, res) => res.sendFile(path.join(__dirname, 'public', `${name}.html`));
app.get('/', (req, res) => {
  const u = req.session.user;
  res.redirect(!u ? '/login' : u.role === 'Editor' ? '/dashboard' : '/author');
});
app.get('/login', page('login'));
app.get('/author', requireRole('Author'), page('author'));
app.get('/dashboard', requireRole('Editor'), page('dashboard'));
app.get('/review/:id', requireRole('Editor'), page('review'));
app.get('/metrics', requireRole(), page('metrics'));
// Reviewer-facing invitation page: reached from the invitation e-mail, no login needed.
app.get('/invite/:token', page('invite'));

app.use('/vendor/fonts', express.static(path.join(__dirname, 'node_modules', '@fontsource', 'roboto', 'files'), { maxAge: '30d' }));
app.use('/vendor/chart.js', express.static(path.join(__dirname, 'node_modules', 'chart.js', 'dist')));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use('/samples', requireRole(), express.static(path.join(__dirname, 'samples')));

// ---------- shared ----------

app.get('/api/journals', requireRole(), (req, res) => {
  res.json(JOURNALS.map(j => ({ id: j.id, name: j.name, shortName: j.shortName, genre: j.genre, context: j.context, limits: j.limits, coden: j.coden, cover: j.cover, homepage: `https://pubs.acs.org/journal/${j.coden}` })));
});

app.get('/api/template/:journalId', requireRole(), async (req, res, next) => {
  try {
    const j = getJournal(req.params.journalId);
    if (!j) return res.status(404).json({ error: 'Unknown journal' });
    const buf = await buildTemplate(j.id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${j.id}-MSC-Template.docx"`);
    res.send(buf);
  } catch (e) { next(e); }
});

// ---------- usage tracking & metrics ----------

app.post('/api/track/page', requireRole(), (req, res) => {
  const { path: p, title } = req.body || {};
  const s = usage.trackPage(req, { path: p, title });
  if (s) usage.audit(req, 'page.view', { path: String(p || '').slice(0, 160) });
  res.json({ ok: !!s });
});

app.post('/api/track/heartbeat', requireRole(), (req, res) => {
  res.json({ ok: !!usage.heartbeat(req) });
});

// sendBeacon on page hide/unload (text/plain or JSON body; either is fine)
app.post('/api/track/leave', express.text({ type: '*/*', limit: '2kb' }), (req, res) => {
  if (req.session.user) usage.heartbeat(req, { leaving: true });
  res.status(204).end();
});

app.get('/api/metrics', requireRole(), (req, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  res.json({ ...usage.metrics({ days }), currentSessionId: req.session.usageId || null });
});

app.get('/api/metrics/audit', requireRole(), (req, res) => {
  const { event, user, q } = req.query;
  res.json(usage.readAudit({ limit: Math.min(5000, Number(req.query.limit) || 500), event, user, q }));
});

app.get('/api/metrics/export/:kind', requireRole(), (req, res) => {
  let csv;
  if (req.params.kind === 'audit') csv = usage.auditCsv(usage.readAudit({ limit: 1e6 }).entries);
  else if (req.params.kind === 'sessions') csv = usage.sessionsCsv(usage.metrics({ days: 365 }).sessions);
  else return res.status(404).json({ error: 'Unknown export' });
  usage.audit(req, 'metrics.export', { kind: req.params.kind });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="uep-${req.params.kind}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

// ---------- reviewer invitation (public, token-protected) ----------

function invitationView(found) {
  const { msc, invitation } = found;
  const db = store.get();
  const reviewer = db.reviewers.find(r => r.id === invitation.reviewerId);
  const journal = getJournal(msc.journalId);
  return {
    status: invitation.status,
    sentAt: invitation.sentAt,
    respondedAt: invitation.respondedAt,
    reviewer: reviewer ? { name: reviewer.name, email: service.reviewerEmail(reviewer), affiliation: reviewer.affiliation } : null,
    msc: { id: msc.id, title: msc.title, authors: msc.authors, abstract: msc.abstract, journal: journal ? journal.name : msc.journalId, reviewStatus: msc.reviewStatus }
  };
}

app.get('/api/invitations/:token', (req, res) => {
  const found = service.findInvitation(req.params.token);
  if (!found) return res.status(404).json({ error: 'This invitation link is not valid or has been replaced by a newer invitation.' });
  usage.audit(req, 'invitation.viewed', { mscId: found.msc.id, reviewerId: found.invitation.reviewerId, status: found.invitation.status });
  res.json(invitationView(found));
});

app.post('/api/invitations/:token/respond', (req, res) => {
  const accept = !!(req.body || {}).accept;
  const out = service.respondInvitation(req.params.token, accept);
  if (out.error) return res.status(out.status).json({ error: out.error });
  store.save();
  usage.audit(req, accept ? 'invitation.accepted' : 'invitation.declined', { mscId: out.msc.id, reviewerId: out.invitation.reviewerId });
  res.json(invitationView(out));
});

// ---------- author ----------

app.post('/api/author/check', requireRole('Author'), (req, res, next) => {
  upload.single('msc')(req, res, err => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'The file is larger than the 15 MB limit.' : err.message;
      return res.status(400).json({ error: msg });
    }
    next();
  });
}, async (req, res, next) => {
  try {
    const { journalId, mscId } = req.body;
    if (!getJournal(journalId)) return res.status(400).json({ error: 'Select a journal for the MSC.' });
    if (!req.file) return res.status(400).json({ error: 'Choose an MSC file (.docx) to upload.' });
    const db = store.get();
    let revising = null;
    if (mscId) {
      revising = db.mscs.find(m => m.id === mscId && m.owner === req.session.user.username);
      if (!revising) return res.status(404).json({ error: 'MSC not found.' });
      if (!(revising.decision && revising.decision.type === 'Revise' && revising.feedbackStatus === 'In Progress')) {
        return res.status(409).json({ error: 'This MSC is not awaiting a revision.' });
      }
    }
    const report = await analyzeManuscript({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      journalId,
      corpus: service.corpusFor(revising ? revising.id : null)
    });
    const previous = db.checks.filter(c => c.owner === req.session.user.username && c.fileTitle === (report.meta.title || req.file.originalname)).length;
    const check = {
      id: store.nextId('CHK'),
      owner: req.session.user.username,
      createdAt: new Date().toISOString(),
      fileName: req.file.originalname,
      fileTitle: report.meta.title || req.file.originalname,
      journalId,
      revisingMscId: revising ? revising.id : null,
      attempt: previous + 1,
      report
    };
    db.checks.push(check);
    // keep only the latest 50 checks to bound file size
    if (db.checks.length > 50) db.checks.splice(0, db.checks.length - 50);
    store.save();
    usage.audit(req, 'msc.integrity-check', { checkId: check.id, file: check.fileName, journalId, score: report.score, passed: report.passed, revising: check.revisingMscId });
    res.json({
      checkId: check.id,
      attempt: check.attempt,
      revisingMscId: check.revisingMscId,
      fileName: req.file.originalname,
      report: service.compactReport(report),
      preview: report.html ? buildOutline(report.html, report) : null
    });
  } catch (e) { next(e); }
});

// Organized, read-only preview of an uploaded MSC — shown before the integrity check.
app.post('/api/author/preview', requireRole('Author'), (req, res, next) => {
  upload.single('msc')(req, res, err => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'The file is larger than the 15 MB limit.' : err.message });
    next();
  });
}, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Choose an MSC file (.docx) to upload.' });
    const parsed = await parseForPreview(req.file.buffer, req.file.originalname);
    if (!parsed.valid) return res.status(422).json({ error: parsed.formatErrors.map(e => `${e.message} ${e.remediation}`).join(' ') });
    res.json({ fileName: req.file.originalname, preview: buildOutline(parsed.html, parsed) });
  } catch (e) { next(e); }
});

app.post('/api/author/submit', requireRole('Author'), (req, res) => {
  const db = store.get();
  const check = db.checks.find(c => c.id === (req.body || {}).checkId && c.owner === req.session.user.username);
  if (!check) return res.status(404).json({ error: 'Integrity check not found. Upload the MSC again.' });
  if (check.submittedMscId) return res.status(409).json({ error: `Already submitted as ${check.submittedMscId}.` });
  if (!check.report.passed) {
    return res.status(422).json({ error: `Integrity score ${check.report.score}/10 is not above 6. Incorporate the feedback and re-submit the MSC.` });
  }
  let msc;
  if (check.revisingMscId) {
    msc = db.mscs.find(m => m.id === check.revisingMscId);
    service.reviseMsc(msc, { report: check.report, fileName: check.fileName });
  } else {
    msc = service.createMsc({ report: check.report, fileName: check.fileName, owner: check.owner });
  }
  check.submittedMscId = msc.id;
  delete check.report.html;
  delete check.report.text;
  store.save();
  usage.audit(req, check.revisingMscId ? 'msc.resubmitted' : 'msc.submitted', { mscId: msc.id, journalId: msc.journalId, score: check.report.score });
  res.json({ ok: true, mscId: msc.id, revision: !!check.revisingMscId });
});

app.get('/api/author/submissions', requireRole('Author'), (req, res) => {
  const db = store.get();
  res.json(db.mscs.filter(m => m.owner === req.session.user.username)
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
    .map(service.authorView));
});

// ---------- editor ----------

app.get('/api/editor/mscs', requireRole('Editor'), (req, res) => {
  const db = store.get();
  res.json({
    now: new Date().toISOString(),
    editors: db.editors.map(e => ({ id: e.id, name: e.name, activeLoad: service.editorLoad(e.id) })),
    reviewers: db.reviewers.map(r => ({ id: r.id, name: r.name })),
    mscs: db.mscs.map(service.dashboardRow).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
  });
});

app.get('/api/editor/mscs/:id/reviewers', requireRole('Editor'), (req, res) => {
  const msc = store.get().mscs.find(m => m.id === req.params.id);
  if (!msc) return res.status(404).json({ error: 'MSC not found' });
  res.json({ msc: service.dashboardRow(msc), reviewers: service.suggestReviewers(msc) });
});

app.post('/api/editor/mscs/:id/assign', requireRole('Editor'), (req, res) => {
  const db = store.get();
  const msc = db.mscs.find(m => m.id === req.params.id);
  if (!msc) return res.status(404).json({ error: 'MSC not found' });
  if (msc.reviewStatus === 'Complete') return res.status(409).json({ error: 'Review is complete; the reviewer can no longer be changed.' });
  const option = service.suggestReviewers(msc).find(r => r.id === (req.body || {}).reviewerId);
  if (!option) return res.status(404).json({ error: 'Reviewer not found' });
  if (!option.available && !option.current) return res.status(409).json({ error: `${option.name} is not available: ${option.reason}.` });
  if (option.current && service.invitationStatus(msc) === 'Accepted') return res.status(409).json({ error: `${option.name} has already accepted this review.` });
  if (msc.reviewStatus === 'In Progress' && msc.assignedReviewer && msc.assignedReviewer !== option.id && service.invitationStatus(msc) === 'Accepted') {
    return res.status(409).json({ error: 'The review is in progress with the current reviewer; it can no longer be reassigned.' });
  }
  const reviewer = db.reviewers.find(r => r.id === option.id);
  const previous = msc.assignedReviewer;
  const email = service.inviteReviewer(msc, reviewer, { baseUrl: `${req.protocol}://${req.get('host')}`, invitedBy: req.session.user.displayName });
  store.save();
  usage.audit(req, option.current ? 'invitation.resent' : 'invitation.sent', { mscId: msc.id, reviewerId: reviewer.id, to: email.to, replacedReviewer: previous && previous !== reviewer.id ? previous : undefined });
  res.json({ ok: true, row: service.dashboardRow(msc), email });
});

// Seeded invitation e-mails store a relative link; serve it against this host.
function absoluteLinks(email, req) {
  if (!email.link.startsWith('/')) return email;
  const link = `${req.protocol}://${req.get('host')}${email.link}`;
  return { ...email, link, body: email.body.split(email.link).join(link) };
}

app.get('/api/editor/mscs/:id/invitation', requireRole('Editor'), (req, res) => {
  const msc = store.get().mscs.find(m => m.id === req.params.id);
  if (!msc) return res.status(404).json({ error: 'MSC not found' });
  const email = service.latestInvitationEmail(msc);
  if (!email) return res.status(404).json({ error: 'No invitation e-mail has been sent for this MSC.' });
  res.json({ email: absoluteLinks(email, req), status: service.invitationStatus(msc), respondedAt: msc.invitation.respondedAt, history: msc.invitationHistory || [] });
});

// ---------- review & annotation ----------

// Highlight palette offered to reviewers (see public/js/review.js).
const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink', 'orange', 'purple'];

function findMsc(req, res) {
  const msc = store.get().mscs.find(m => m.id === req.params.id);
  if (!msc) { res.status(404).json({ error: 'MSC not found' }); return null; }
  return msc;
}

function requireReviewable(msc, res) {
  if (msc.reviewStatus === 'Complete') {
    res.status(409).json({ error: 'The review of this MSC is complete; it is read-only.' });
    return false;
  }
  if (!msc.assignedReviewer) {
    res.status(409).json({ error: 'Assign a reviewer to this MSC (Look up reviewer on the dashboard) before it can be reviewed and annotated.' });
    return false;
  }
  if (service.invitationStatus(msc) !== 'Accepted') {
    res.status(409).json({ error: 'The reviewer has not accepted the invitation yet. The review starts once the invitation is accepted.' });
    return false;
  }
  return true;
}

function reviewerName(msc, req) {
  const r = store.get().reviewers.find(x => x.id === msc.assignedReviewer);
  return r ? r.name : req.session.user.displayName;
}

app.get('/api/mscs/:id', requireRole('Editor'), (req, res) => {
  const msc = findMsc(req, res);
  if (msc) res.json(service.reviewPayload(msc));
});

// MSC analysis for the reviewer: summary, integrity check (same rules as the
// Author upload check) and fitment with the journal chosen by the author.
app.get('/api/mscs/:id/analysis', requireRole('Editor'), (req, res, next) => {
  try {
    const msc = findMsc(req, res);
    if (!msc) return;
    const out = analysis.analyze(msc, service.getContent(msc));
    usage.audit(req, 'review.msc-analysis', { mscId: msc.id, score: out.integrity.score, fitment: out.fitment.index });
    res.json(out);
  } catch (e) { next(e); }
});

app.post('/api/mscs/:id/start', requireRole('Editor'), (req, res) => {
  const msc = findMsc(req, res);
  if (!msc || !requireReviewable(msc, res)) return;
  if (msc.reviewStatus === 'Open') {
    msc.reviewStatus = 'In Progress';
    msc.reviewStartAt = msc.reviewStartAt || new Date().toISOString();
    msc.reviewProgress = Math.max(msc.reviewProgress, 5);
    store.save();
    usage.audit(req, 'review.started', { mscId: msc.id, reviewerId: msc.assignedReviewer });
  }
  res.json(service.reviewPayload(msc));
});

app.post('/api/mscs/:id/progress', requireRole('Editor'), (req, res) => {
  const msc = findMsc(req, res);
  if (!msc || !requireReviewable(msc, res)) return;
  const pct = Math.round(Number((req.body || {}).percent));
  if (Number.isFinite(pct)) {
    // reading progress counts up to 90%; the decision completes the review
    msc.reviewProgress = Math.max(msc.reviewProgress, Math.min(90, pct));
    store.save();
  }
  res.json({ reviewProgress: msc.reviewProgress });
});

app.post('/api/mscs/:id/annotations', requireRole('Editor'), (req, res) => {
  const msc = findMsc(req, res);
  if (!msc || !requireReviewable(msc, res)) return;
  const { type, start, end, quote, comment, color } = req.body || {};
  if (!['highlight', 'underline', 'comment'].includes(type)) return res.status(400).json({ error: 'Invalid annotation type' });
  if (!quote || typeof quote !== 'string') return res.status(400).json({ error: 'Select some text to annotate' });
  if (type === 'comment' && !(comment || '').trim()) return res.status(400).json({ error: 'Enter a comment' });
  const a = {
    id: store.nextId('AN'),
    type,
    start: Number.isInteger(start) ? start : null,
    end: Number.isInteger(end) ? end : null,
    quote: quote.slice(0, 2000),
    comment: (comment || '').slice(0, 4000),
    color: type === 'highlight' ? (HIGHLIGHT_COLORS.includes(color) ? color : 'yellow') : undefined,
    author: reviewerName(msc, req),
    createdAt: new Date().toISOString()
  };
  msc.annotations.push(a);
  usage.audit(req, 'review.annotation', { mscId: msc.id, type, annotationId: a.id });
  if (msc.reviewStatus === 'Open') {
    msc.reviewStatus = 'In Progress';
    msc.reviewStartAt = msc.reviewStartAt || a.createdAt;
  }
  store.save();
  res.json(a);
});

app.put('/api/mscs/:id/annotations/:aid', requireRole('Editor'), (req, res) => {
  const msc = findMsc(req, res);
  if (!msc || !requireReviewable(msc, res)) return;
  const a = msc.annotations.find(x => x.id === req.params.aid);
  if (!a) return res.status(404).json({ error: 'Annotation not found' });
  const body = req.body || {};
  if (body.comment !== undefined) a.comment = String(body.comment || '').slice(0, 4000);
  if (body.color !== undefined) {
    if (a.type !== 'highlight' || !HIGHLIGHT_COLORS.includes(body.color)) return res.status(400).json({ error: 'Invalid highlight colour' });
    a.color = body.color;
  }
  a.updatedAt = new Date().toISOString();
  store.save();
  res.json(a);
});

app.delete('/api/mscs/:id/annotations/:aid', requireRole('Editor'), (req, res) => {
  const msc = findMsc(req, res);
  if (!msc || !requireReviewable(msc, res)) return;
  const before = msc.annotations.length;
  msc.annotations = msc.annotations.filter(x => x.id !== req.params.aid);
  if (msc.annotations.length === before) return res.status(404).json({ error: 'Annotation not found' });
  store.save();
  res.json({ ok: true });
});

app.put('/api/mscs/:id/feedback', requireRole('Editor'), (req, res) => {
  const msc = findMsc(req, res);
  if (!msc || !requireReviewable(msc, res)) return;
  msc.generalFeedback = String((req.body || {}).generalFeedback || '').slice(0, 20000);
  store.save();
  res.json({ ok: true });
});

app.post('/api/mscs/:id/decision', requireRole('Editor'), (req, res) => {
  const msc = findMsc(req, res);
  if (!msc || !requireReviewable(msc, res)) return;
  const { type, revisionType, alternateJournalId, publishingEditorId, summary } = req.body || {};
  if (!service.DECISIONS.includes(type)) return res.status(400).json({ error: 'Choose a decision: Accept, Reject, Transfer, Revise or Assign to PE.' });
  if (type === 'Assign to PE') {
    if (!service.peName(publishingEditorId)) return res.status(400).json({ error: 'Select the Publishing Editor (PE) to assign the MSC to.' });
  } else if (publishingEditorId) {
    return res.status(400).json({ error: 'A Publishing Editor can only be selected when the decision is Assign to PE.' });
  }
  if (!String(summary || '').trim()) return res.status(400).json({ error: 'Add a decision summary for the author.' });
  if (type === 'Revise' && !['Minor', 'Major'].includes(revisionType)) return res.status(400).json({ error: 'Choose Minor or Major revision.' });
  if (type === 'Transfer') {
    if (!getJournal(alternateJournalId) || alternateJournalId === msc.journalId) return res.status(400).json({ error: 'Select an alternate journal for the transfer.' });
  } else if (alternateJournalId) {
    return res.status(400).json({ error: 'An alternate journal can only be selected when the decision is Transfer.' });
  }
  const now = new Date().toISOString();
  msc.decision = {
    type,
    revisionType: type === 'Revise' ? revisionType : null,
    alternateJournalId: type === 'Transfer' ? alternateJournalId : null,
    publishingEditorId: type === 'Assign to PE' ? publishingEditorId : null,
    summary: String(summary).slice(0, 8000),
    decidedAt: now,
    decidedBy: msc.assignedReviewer || req.session.user.displayName
  };
  msc.decisionHistory.push({ ...msc.decision, version: msc.versions.length });
  msc.reviewStatus = 'Complete';
  msc.reviewProgress = 100;
  msc.reviewStartAt = msc.reviewStartAt || now;
  msc.completedAt = now;
  msc.feedbackStatus = type === 'Revise' ? 'In Progress' : msc.feedbackStatus;
  if (type === 'Transfer') msc.transferredFrom = msc.journalId;
  store.save();
  usage.audit(req, 'review.decision', { mscId: msc.id, decision: type, revisionType: msc.decision.revisionType, alternateJournalId: msc.decision.alternateJournalId, publishingEditorId: msc.decision.publishingEditorId });
  res.json(service.reviewPayload(msc));
});

// ---------- errors ----------

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error', detail: err.message });
});

async function init() {
  if (!store.load()) {
    console.log('No data found — seeding the prototype database…');
    await buildSeed();
  }
}

if (require.main === module) {
  init().then(() => {
    app.listen(PORT, '0.0.0.0', () => console.log(`Unified Editorial Platform running at http://localhost:${PORT}  (login: Admin / Admin)`));
  }).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { app, init };
