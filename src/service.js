'use strict';

/**
 * Editorial workflow logic shared by the API and the seeding script.
 */
const store = require('./store');
const { getJournal, proposeAlternates, JOURNALS } = require('./journals');

const ACTIVE = s => s !== 'Complete';

const DECISIONS = ['Accept', 'Reject', 'Transfer', 'Revise', 'Assign to PE'];

// Publishing Editors (PE) who take over an MSC on an "Assign to PE" decision.
const PUBLISHING_EDITORS = [
  { id: 'PE-1', name: 'Margaret Ellis', team: 'Production — Organic & Medicinal' },
  { id: 'PE-2', name: 'Tobias Kern', team: 'Production — Materials & Physical' },
  { id: 'PE-3', name: 'Nadia Farouk', team: 'Production — Environmental & Analytical' }
];

function publishingEditors() {
  const db = store.get();
  return db.publishingEditors && db.publishingEditors.length ? db.publishingEditors : PUBLISHING_EDITORS;
}

function peName(id) {
  const pe = publishingEditors().find(p => p.id === id);
  return pe ? pe.name : null;
}

/** Reviewer e-mail (seeded reviewers carry one; otherwise derived for the prototype). */
function reviewerEmail(r) {
  if (!r) return '';
  if (r.email) return r.email;
  const parts = r.name.replace(/^(prof|dr)\.?\s+/i, '').toLowerCase().normalize('NFD').replace(/[^a-z\s]/g, '').trim().split(/\s+/);
  return `${parts[0]}.${parts[parts.length - 1]}@reviewers.example`;
}

/**
 * Reviewer invitation state for an MSC: null (no reviewer), Pending, Accepted
 * or Declined. Records assigned before invitations existed count as Accepted.
 */
function invitationStatus(m) {
  if (!m.assignedReviewer) return null;
  return m.invitation ? m.invitation.status : 'Accepted';
}

/** Review & annotate is allowed only for open/in-progress MSCs whose reviewer accepted the invitation. */
function canReview(m) {
  return ACTIVE(m.reviewStatus) && !!m.assignedReviewer && invitationStatus(m) === 'Accepted';
}

/**
 * Invites a reviewer: records a pending invitation with a secret token and
 * puts the invitation e-mail in the outbox (simulated delivery). The review
 * stays locked until the reviewer accepts through the link in the e-mail.
 */
function inviteReviewer(msc, reviewer, { baseUrl, invitedBy }) {
  const db = store.get();
  const crypto = require('crypto');
  const now = new Date().toISOString();
  if (msc.invitation && msc.invitation.status === 'Pending') msc.invitation.status = 'Withdrawn';
  if (msc.invitation) msc.invitationHistory = (msc.invitationHistory || []).concat(msc.invitation);
  const token = crypto.randomBytes(18).toString('hex');
  const journal = getJournal(msc.journalId);
  const link = `${baseUrl}/invite/${token}`;
  const email = {
    id: store.nextId('EM'),
    to: `${reviewer.name} <${reviewerEmail(reviewer)}>`,
    from: 'Unified Editorial Platform <editorial-office@uep.example>',
    subject: `Invitation to review ${msc.id}: ${msc.title}`,
    sentAt: now,
    mscId: msc.id,
    delivery: 'Simulated (prototype outbox — no real e-mail is sent)',
    link,
    body: [
      `Dear ${reviewer.name},`,
      '',
      `On behalf of ${journal ? journal.name : msc.journalId}, you are invited to review the manuscript:`,
      '',
      `  ${msc.id} — ${msc.title}`,
      `  Authors: ${(msc.authors || []).join(', ')}`,
      '',
      `Abstract: ${(msc.abstract || '').slice(0, 600)}${(msc.abstract || '').length > 600 ? '…' : ''}`,
      '',
      'Please accept or decline the invitation using this link:',
      link,
      '',
      'The manuscript becomes available for review and annotation once you accept.',
      '',
      `Kind regards,`,
      `${invitedBy || 'Editorial Office'}`
    ].join('\n')
  };
  msc.assignedReviewer = reviewer.id;
  msc.assignedAt = now;
  msc.invitation = { id: store.nextId('INV'), token, reviewerId: reviewer.id, status: 'Pending', sentAt: now, respondedAt: null, emailId: email.id, sentCount: 1 };
  db.outbox = (db.outbox || []).concat(email).slice(-300);
  return email;
}

function findInvitation(token) {
  if (!/^[a-f0-9]{36}$/.test(token || '')) return null;
  const msc = store.get().mscs.find(m => m.invitation && m.invitation.token === token);
  return msc ? { msc, invitation: msc.invitation } : null;
}

/** Reviewer accepts or declines. Declining frees the MSC for another reviewer. */
function respondInvitation(token, accept) {
  const found = findInvitation(token);
  if (!found) return { error: 'This invitation link is not valid or has been replaced by a newer invitation.', status: 404 };
  const { msc, invitation } = found;
  if (invitation.status !== 'Pending') return { error: `This invitation was already ${invitation.status.toLowerCase()}.`, status: 409, msc, invitation };
  if (!ACTIVE(msc.reviewStatus)) return { error: 'The review of this MSC is already complete.', status: 409, msc, invitation };
  invitation.status = accept ? 'Accepted' : 'Declined';
  invitation.respondedAt = new Date().toISOString();
  if (!accept) {
    msc.invitationHistory = (msc.invitationHistory || []).concat({ ...invitation });
    msc.invitation = null;
    msc.assignedReviewer = null;
    msc.assignedAt = null;
  }
  return { msc, invitation };
}

function latestInvitationEmail(msc) {
  const db = store.get();
  const id = msc.invitation && msc.invitation.emailId;
  return id ? (db.outbox || []).find(e => e.id === id) || null : null;
}

/**
 * Manuscript bodies (rendered HTML + text) are stored once per file in
 * data/contents/, keyed by the SHA-256 of the uploaded .docx, so identical
 * files (e.g. seeded demo MSCs) are not duplicated in the database.
 */
function putContent(report) {
  store.putContent(report.contentHash, { html: report.html || '', text: report.text || '' });
}

function getContent(m) {
  if (m.html !== undefined) return { html: m.html, text: m.text || '' }; // legacy records
  return store.getContent(m.contentHash) || { html: '', text: '' };
}

/** Strips the bulky html/text fields from an integrity report. */
function compactReport(report) {
  const { html, text, ...rest } = report;
  return rest;
}

function briefIntro(report) {
  const src = (report.meta && report.meta.abstract) || '';
  if (src.length <= 220) return src;
  return `${src.slice(0, 217).replace(/\s+\S*$/, '')}…`;
}

/** Text used for similarity checks against later submissions. */
function corpusFor(excludeMscId) {
  const db = store.get();
  return db.mscs
    .filter(m => m.id !== excludeMscId)
    .map(m => ({
      id: m.id,
      source: `Prior submission ${m.id}: "${m.title}"`,
      text: m.seed ? `${m.title}. ${m.abstract || ''}` : getContent(m).text
    }));
}

function editorLoad(editorId) {
  return store.get().mscs.filter(m => m.assignedEditor === editorId && ACTIVE(m.reviewStatus)).length;
}

function reviewerLoad(reviewerId) {
  // Pending invitations count towards a reviewer's load.
  return store.get().mscs.filter(m => m.assignedReviewer === reviewerId && ACTIVE(m.reviewStatus)).length;
}

/** Picks the least-loaded editor who handles the journal. */
function pickEditor(journalId) {
  const editors = store.get().editors;
  const handling = editors.filter(e => e.journals.includes(journalId));
  const pool = handling.length ? handling : editors;
  return pool.map(e => ({ e, load: editorLoad(e.id) })).sort((a, b) => a.load - b.load)[0].e.id;
}

/**
 * Reviewer proposals for an MSC, ranked by availability:
 * free capacity, not on leave, expertise match with the journal, turnaround.
 */
function suggestReviewers(msc) {
  const now = Date.now();
  const journal = getJournal(msc.journalId);
  return store.get().reviewers.map(r => {
    const load = reviewerLoad(r.id);
    const free = Math.max(0, r.capacity - load);
    const onLeave = r.unavailableUntil && new Date(r.unavailableUntil).getTime() > now;
    const expertiseMatch = r.journals.includes(msc.journalId);
    const available = !onLeave && free > 0;
    let score = 0;
    if (available) {
      score = free * 15 + (expertiseMatch ? 40 : 0) + Math.max(0, 20 - r.avgTurnaroundDays * 2);
    }
    let reason;
    if (onLeave) reason = `Unavailable until ${new Date(r.unavailableUntil).toLocaleDateString('en-GB')}`;
    else if (!free) reason = `At capacity (${load}/${r.capacity} active reviews)`;
    else reason = `${free} free slot(s)${expertiseMatch ? ` · expert in ${journal ? journal.shortName : msc.journalId} scope` : ''} · avg turnaround ${r.avgTurnaroundDays} d`;
    return {
      id: r.id, name: r.name, email: reviewerEmail(r), affiliation: r.affiliation, expertise: r.expertise,
      capacity: r.capacity, activeReviews: load, freeSlots: free, onLeave: !!onLeave,
      available, expertiseMatch, avgTurnaroundDays: r.avgTurnaroundDays, score, reason,
      current: msc.assignedReviewer === r.id,
      invitationStatus: msc.assignedReviewer === r.id ? invitationStatus(msc) : null
    };
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .map((r, i) => ({ ...r, recommended: i === 0 && r.available }));
}

function createMsc({ report, fileName, owner, seed, submittedAt }) {
  const db = store.get();
  const now = submittedAt || new Date().toISOString();
  const msc = {
    id: store.nextMscId(),
    seed: !!seed,
    owner: owner || 'Admin',
    title: report.meta.title || fileName,
    abstract: report.meta.abstract,
    intro: briefIntro(report),
    authorName: report.meta.correspondingAuthor || (report.meta.authors || [])[0] || 'Unknown author',
    authors: report.meta.authors || [],
    authorEmail: report.meta.correspondingEmail || '',
    journalId: report.journalId,
    fileName,
    submittedAt: now,
    contentHash: report.contentHash,
    integrity: compactReport(report),
    versions: [{ version: 1, submittedAt: now, fileName, score: report.score, contentHash: report.contentHash }],
    revisions: 0,
    assignedEditor: pickEditor(report.journalId),
    assignedReviewer: null,
    assignedAt: null,
    reviewStatus: 'Open',
    reviewStartAt: null,
    reviewProgress: 0,
    annotations: [],
    generalFeedback: '',
    decision: null,
    decisionHistory: [],
    feedbackStatus: null,
    completedAt: null
  };
  putContent(report);
  db.mscs.push(msc);
  return msc;
}

/** Author re-submits a revised MSC after a "Revise" decision. */
function reviseMsc(msc, { report, fileName }) {
  const now = new Date().toISOString();
  msc.versions.push({ version: msc.versions.length + 1, submittedAt: now, fileName, score: report.score, contentHash: report.contentHash });
  msc.revisions += 1;
  msc.title = report.meta.title || msc.title;
  msc.abstract = report.meta.abstract;
  msc.intro = briefIntro(report);
  putContent(report);
  msc.contentHash = report.contentHash;
  msc.fileName = fileName;
  msc.integrity = compactReport(report);
  msc.submittedAt = now;
  msc.reviewStatus = 'Open';
  msc.reviewStartAt = null;
  msc.reviewProgress = 0;
  if (msc.annotations.length) {
    msc.archivedAnnotations = (msc.archivedAnnotations || []).concat(msc.annotations.map(a => ({ ...a, version: msc.versions.length - 1 })));
  }
  msc.annotations = [];
  msc.generalFeedback = '';
  msc.decision = null;
  msc.feedbackStatus = 'Complete';
  msc.completedAt = null;
  return msc;
}

/** Shape of a row on the editor dashboard (no manuscript body). */
function dashboardRow(m) {
  const db = store.get();
  const editor = db.editors.find(e => e.id === m.assignedEditor);
  const reviewer = db.reviewers.find(r => r.id === m.assignedReviewer);
  const journal = getJournal(m.journalId);
  const end = m.reviewStatus === 'Complete' && m.completedAt ? new Date(m.completedAt) : new Date();
  const elapsedHours = (end - new Date(m.submittedAt)) / 36e5;
  return {
    id: m.id,
    title: m.title,
    intro: m.intro,
    authorName: m.authorName,
    submittedAt: m.submittedAt,
    journalId: m.journalId,
    journalName: journal ? journal.shortName : m.journalId,
    integrityPassed: m.integrity.passed,
    integrityScore: m.integrity.score,
    fitmentIndex: m.integrity.fitment ? m.integrity.fitment.index : null,
    recommendedJournal: m.integrity.fitment ? m.integrity.fitment.recommended : null,
    revisions: m.revisions,
    assignedEditorId: m.assignedEditor,
    assignedEditor: editor ? editor.name : null,
    assignedReviewerId: m.assignedReviewer,
    assignedReviewer: reviewer ? reviewer.name : null,
    assignedReviewerEmail: reviewer ? reviewerEmail(reviewer) : null,
    invitationStatus: invitationStatus(m),
    invitationSentAt: m.invitation ? m.invitation.sentAt : null,
    reviewStatus: m.reviewStatus,
    elapsedHours: Math.round(elapsedHours * 10) / 10,
    elapsedBand: elapsedHours < 8 ? 'green' : elapsedHours <= 24 ? 'amber' : 'red',
    reviewStartAt: m.reviewStartAt,
    reviewProgress: m.reviewProgress,
    feedbackStatus: m.feedbackStatus,
    finalDecision: m.decision ? m.decision.type : null,
    revisionType: m.decision ? m.decision.revisionType || null : null,
    transferredTo: m.decision && m.decision.alternateJournalId ? m.decision.alternateJournalId : null,
    publishingEditor: m.decision && m.decision.publishingEditorId ? peName(m.decision.publishingEditorId) : null,
    canReview: canReview(m),
    completedAt: m.completedAt,
    annotationCount: m.annotations.length
  };
}

/** Full MSC payload for the review & annotation page. */
function reviewPayload(m) {
  const db = store.get();
  const fitScores = m.integrity.fitment ? m.integrity.fitment.scores : {};
  return {
    ...dashboardRow(m),
    abstract: m.abstract,
    authors: m.authors,
    authorEmail: m.authorEmail,
    html: getContent(m).html,
    contentHash: m.contentHash,
    fileName: m.fileName,
    versions: m.versions,
    integrity: m.integrity,
    annotations: m.annotations,
    generalFeedback: m.generalFeedback,
    decision: m.decision,
    decisionHistory: m.decisionHistory,
    alternates: proposeAlternates(m.journalId, fitScores),
    publishingEditors: publishingEditors(),
    reviewerDetails: db.reviewers.find(r => r.id === m.assignedReviewer) || null
  };
}

/** Shape returned to the author for their own submissions. */
function authorView(m) {
  const journal = getJournal(m.journalId);
  return {
    id: m.id,
    title: m.title,
    journalId: m.journalId,
    journalName: journal ? journal.name : m.journalId,
    submittedAt: m.submittedAt,
    integrityScore: m.integrity.score,
    integrityPassed: m.integrity.passed,
    revisions: m.revisions,
    reviewStatus: m.reviewStatus,
    decision: m.decision ? { ...m.decision, publishingEditor: m.decision.publishingEditorId ? peName(m.decision.publishingEditorId) : null } : null,
    feedbackStatus: m.feedbackStatus,
    canRevise: !!(m.decision && m.decision.type === 'Revise' && m.feedbackStatus === 'In Progress'),
    reviewerFeedback: m.decision ? {
      summary: m.decision.summary,
      general: m.generalFeedback,
      comments: m.annotations.filter(a => a.comment).map(a => ({ quote: a.quote, comment: a.comment }))
    } : null
  };
}

module.exports = {
  reviewerEmail, invitationStatus, inviteReviewer, findInvitation, respondInvitation, latestInvitationEmail,
  DECISIONS, PUBLISHING_EDITORS, publishingEditors, peName, canReview,
  compactReport, corpusFor, pickEditor, suggestReviewers, createMsc, reviseMsc,
  dashboardRow, reviewPayload, authorView, reviewerLoad, editorLoad, JOURNALS
};
