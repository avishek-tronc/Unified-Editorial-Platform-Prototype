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
  const { username, password, role } = req.body || {};
  if (username !== POC_USER || password !== POC_PASS) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  if (!['Author', 'Editor'].includes(role)) {
    return res.status(400).json({ error: 'Choose the Author or Editor view.' });
  }
  req.session.user = { username, role, displayName: role === 'Editor' ? 'Admin (Editor)' : 'Admin (Author)' };
  res.json({ ok: true, redirect: role === 'Editor' ? '/dashboard' : '/author' });
});

app.post('/api/logout', (req, res) => {
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

app.use('/vendor/chart.js', express.static(path.join(__dirname, 'node_modules', 'chart.js', 'dist')));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use('/samples', requireRole(), express.static(path.join(__dirname, 'samples')));

// ---------- shared ----------

app.get('/api/journals', requireRole(), (req, res) => {
  res.json(JOURNALS.map(j => ({ id: j.id, name: j.name, shortName: j.shortName, genre: j.genre, context: j.context, limits: j.limits })));
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
  msc.assignedReviewer = option.id;
  msc.assignedAt = new Date().toISOString();
  store.save();
  res.json({ ok: true, row: service.dashboardRow(msc) });
});

// ---------- review & annotation ----------

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

app.post('/api/mscs/:id/start', requireRole('Editor'), (req, res) => {
  const msc = findMsc(req, res);
  if (!msc || !requireReviewable(msc, res)) return;
  if (msc.reviewStatus === 'Open') {
    msc.reviewStatus = 'In Progress';
    msc.reviewStartAt = msc.reviewStartAt || new Date().toISOString();
    msc.reviewProgress = Math.max(msc.reviewProgress, 5);
    store.save();
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
  const { type, start, end, quote, comment } = req.body || {};
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
    author: reviewerName(msc, req),
    createdAt: new Date().toISOString()
  };
  msc.annotations.push(a);
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
  a.comment = String((req.body || {}).comment || '').slice(0, 4000);
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
