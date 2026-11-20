'use strict';

/**
 * Builds the initial demo database: editors, reviewers, publishing editors
 * and ~75 manuscripts (about 50 Open / In Progress plus ~25 review-complete
 * over the last five months).
 *
 * The manuscript content comes from the three sample MSCs in samples/seed/
 * (real .docx files). Each is run through the integrity engine once per
 * target journal, so scores, fitment indices and review pages are genuine;
 * the records then reuse that content with different dates and workflow
 * states. Generation is deterministic (seeded pseudo-random numbers).
 */
const fs = require('fs');
const path = require('path');
const store = require('./store');
const { analyzeManuscript } = require('./integrity');
const service = require('./service');

const H = 36e5;
const SEED_DIR = path.join(__dirname, '..', 'samples', 'seed');

const CONTENT = [
  { file: 'ja6c20962.docx', journals: ['JACS', 'JACS', 'ORGLETT'] },
  { file: 'ja6c19336.docx', journals: ['JACS', 'INORGCHEM', 'ACSNANO'] },
  { file: 'ja6c20174.docx', journals: ['JACS', 'JPCC', 'JPCC'] }
];

const EDITORS = [
  { id: 'ED-1', name: 'Dr. Helen Carter', email: 'h.carter@editorial.example', journals: ['JACS', 'INORGCHEM'] },
  { id: 'ED-2', name: 'Dr. Rajesh Menon', email: 'r.menon@editorial.example', journals: ['JACS', 'ORGLETT', 'JMEDCHEM'] },
  { id: 'ED-3', name: 'Dr. Sofia Lindqvist', email: 's.lindqvist@editorial.example', journals: ['ACSNANO', 'JPCC', 'JACS'] },
  { id: 'ED-4', name: 'Dr. Kwame Asante', email: 'k.asante@editorial.example', journals: ['ESTECH', 'ANALCHEM', 'JPCC'] }
];

const REVIEWERS = [
  { id: 'RV-1', name: 'Prof. Anna Kowalski', affiliation: 'University of Warsaw', expertise: ['Organometallic catalysis', 'Nickel catalysis'], journals: ['JACS', 'ORGLETT', 'INORGCHEM'], capacity: 4, avgTurnaroundDays: 6 },
  { id: 'RV-2', name: 'Dr. Liam O\'Connor', affiliation: 'Trinity College Dublin', expertise: ['Synthetic methodology', 'Cross-coupling'], journals: ['ORGLETT', 'JACS'], capacity: 4, avgTurnaroundDays: 9 },
  { id: 'RV-3', name: 'Prof. Hiroshi Tanaka', affiliation: 'Kyoto University', expertise: ['Inorganic materials', 'Halide perovskites'], journals: ['INORGCHEM', 'JACS'], capacity: 3, avgTurnaroundDays: 5 },
  { id: 'RV-4', name: 'Dr. Fatima Al-Sayed', affiliation: 'KAUST', expertise: ['Nanocrystals', 'Ion exchange'], journals: ['ACSNANO', 'INORGCHEM', 'JACS'], capacity: 4, avgTurnaroundDays: 7 },
  { id: 'RV-5', name: 'Prof. Carlos Mendes', affiliation: 'University of São Paulo', expertise: ['2D materials', 'Nanodevices'], journals: ['ACSNANO', 'JPCC'], capacity: 3, avgTurnaroundDays: 8, unavailableInDays: 10 },
  { id: 'RV-6', name: 'Dr. Emily Zhang', affiliation: 'ETH Zürich', expertise: ['Electrochemistry', 'Energy conversion'], journals: ['JPCC', 'ACSNANO', 'JACS'], capacity: 5, avgTurnaroundDays: 4 },
  { id: 'RV-7', name: 'Prof. David Levi', affiliation: 'Weizmann Institute of Science', expertise: ['Physical organic chemistry', 'Mechanism'], journals: ['JACS', 'JPCC'], capacity: 3, avgTurnaroundDays: 12 },
  { id: 'RV-8', name: 'Dr. Ingrid Svensson', affiliation: 'Karolinska Institutet', expertise: ['Spectroscopy', 'Electron microscopy'], journals: ['ACSNANO', 'INORGCHEM', 'JACS'], capacity: 4, avgTurnaroundDays: 6 },
  { id: 'RV-9', name: 'Prof. Wei Chen', affiliation: 'Peking University', expertise: ['Thermoelectrics', 'Ionic conductors'], journals: ['JPCC', 'JACS'], capacity: 4, avgTurnaroundDays: 5 },
  { id: 'RV-10', name: 'Dr. Laura Rossi', affiliation: 'Politecnico di Milano', expertise: ['Perovskite optoelectronics', 'Photophysics'], journals: ['ACSNANO', 'JPCC', 'JACS'], capacity: 4, avgTurnaroundDays: 7 },
  { id: 'RV-11', name: 'Prof. Michael Okafor', affiliation: 'Imperial College London', expertise: ['Homogeneous catalysis', 'Ligand design'], journals: ['JACS', 'ORGLETT'], capacity: 4, avgTurnaroundDays: 8 },
  { id: 'RV-12', name: 'Dr. Sarah Becker', affiliation: 'Max Planck Institute for Kohlenforschung', expertise: ['Alkene functionalization', 'Radical chemistry'], journals: ['ORGLETT', 'JACS'], capacity: 3, avgTurnaroundDays: 6 },
  { id: 'RV-13', name: 'Prof. Arjun Rao', affiliation: 'Indian Institute of Science', expertise: ['Electrolytes', 'Solvation'], journals: ['JPCC', 'JACS'], capacity: 3, avgTurnaroundDays: 9, unavailableInDays: 5 },
  { id: 'RV-14', name: 'Dr. Chloé Martin', affiliation: 'CNRS Grenoble', expertise: ['Solid-state chemistry', 'Crystallography'], journals: ['INORGCHEM', 'JACS'], capacity: 3, avgTurnaroundDays: 5 },
  { id: 'RV-15', name: 'Prof. Kenji Watanabe', affiliation: 'University of Tokyo', expertise: ['Nanomaterials', 'Heterostructures'], journals: ['ACSNANO', 'JPCC', 'JACS'], capacity: 4, avgTurnaroundDays: 7 }
];

// Deterministic pseudo-random numbers so every seed looks the same.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A short phrase from the abstract, used as the anchor of sample annotations. */
function phrase(report, start, len) {
  const w = (report.meta.abstract || '').split(/\s+/).filter(Boolean);
  return w.slice(start, start + len).join(' ').replace(/[,.;:]$/, '');
}

const COMMENTS = [
  'Please clarify how this was quantified and add error bars.',
  'Consider citing recent related work here.',
  'The claim needs stronger supporting evidence in the main text.',
  'Define this term on first use.',
  'Please report the yields/values with standard deviations.'
];

async function analyzeAll() {
  const reports = {};
  for (const c of CONTENT) {
    const buffer = fs.readFileSync(path.join(SEED_DIR, c.file));
    for (const j of new Set(c.journals)) {
      reports[`${c.file}|${j}`] = await analyzeManuscript({ buffer, originalName: c.file, journalId: j, corpus: [] });
    }
  }
  return reports;
}

async function buildSeed() {
  const now = Date.now();
  const rand = rng(20261120);
  const pick = arr => arr[Math.floor(rand() * arr.length)];
  const between = (a, b) => a + rand() * (b - a);

  const db = {
    meta: { seededAt: new Date(now).toISOString(), version: 2 },
    counters: { msc: 1000 },
    editors: EDITORS,
    reviewers: REVIEWERS.map(({ unavailableInDays, ...r }) => ({
      ...r,
      email: service.reviewerEmail(r),
      unavailableUntil: unavailableInDays ? new Date(now + unavailableInDays * 24 * H).toISOString() : null
    })),
    publishingEditors: service.PUBLISHING_EDITORS,
    mscs: [],
    checks: [],
    outbox: []
  };
  store.set(db);

  const reports = await analyzeAll();
  const reportFor = (i, journalPick) => {
    const c = CONTENT[i % CONTENT.length];
    const journalId = journalPick || c.journals[Math.floor(rand() * c.journals.length)];
    return reports[`${c.file}|${journalId}`];
  };
  const fileNameFor = (report) => `${(report.meta.title || 'manuscript').slice(0, 40).replace(/[^A-Za-z0-9]+/g, '_')}.docx`;
  const create = (report, hoursAgo, owner) => service.createMsc({
    report,
    fileName: fileNameFor(report),
    owner: owner || 'seed',
    seed: true,
    submittedAt: new Date(now - hoursAgo * H).toISOString()
  });
  const freeReviewer = (journalId) => {
    const options = db.reviewers.filter(r =>
      r.journals.includes(journalId) && !(r.unavailableUntil && new Date(r.unavailableUntil) > now) &&
      service.reviewerLoad(r.id) < r.capacity - (rand() < 0.3 ? 1 : 0));
    return options.length ? pick(options).id : null;
  };
  const annotate = (msc, report, reviewerId, n, atHoursAgo) => {
    const author = db.reviewers.find(r => r.id === reviewerId).name;
    for (let k = 0; k < n; k++) {
      const type = ['comment', 'highlight', 'underline'][k % 3];
      msc.annotations.push({
        id: `AN-seed-${msc.id}-${k}`, type, quote: phrase(report, 4 + k * 9, 6),
        comment: type === 'comment' || k === 1 ? COMMENTS[(k + msc.id.length) % COMMENTS.length] : '',
        start: null, end: null, author,
        createdAt: new Date(now - atHoursAgo * H).toISOString()
      });
    }
  };

  // ---- ~25 review-complete MSCs over the last five months (oldest first) ----
  const decisions = ['Accept', 'Accept', 'Revise', 'Reject', 'Transfer', 'Assign to PE', 'Accept', 'Revise', 'Assign to PE', 'Reject'];
  for (let k = 0; k < 25; k++) {
    const daysAgo = Math.round(150 - k * 5.8 + between(-2, 2));
    const report = reportFor(k);
    const msc = create(report, daysAgo * 24);
    const reviewer = pick(db.reviewers.filter(r => r.journals.includes(report.journalId))).id;
    const fulfil = between(20, 110);
    const submitted = new Date(msc.submittedAt).getTime();
    const decidedAt = new Date(submitted + fulfil * H).toISOString();
    const type = decisions[k % decisions.length];
    const best = report.fitment.recommended.journalId;
    const transferTo = best !== report.journalId ? best : (report.journalId === 'JACS' ? 'JPCC' : 'JACS');
    Object.assign(msc, {
      assignedReviewer: reviewer,
      assignedAt: new Date(submitted + 1 * H).toISOString(),
      reviewStatus: 'Complete',
      reviewStartAt: new Date(submitted + between(2, 10) * H).toISOString(),
      reviewProgress: 100,
      completedAt: decidedAt,
      feedbackStatus: type === 'Revise' ? 'In Progress' : null,
      decision: {
        type,
        revisionType: type === 'Revise' ? (k % 2 ? 'Major' : 'Minor') : null,
        alternateJournalId: type === 'Transfer' ? transferTo : null,
        publishingEditorId: type === 'Assign to PE' ? pick(service.PUBLISHING_EDITORS).id : null,
        summary: {
          Accept: 'Important and well-supported work. Accept after minor editorial corrections.',
          Revise: 'Promising work. Please address the reviewer comments and re-submit.',
          Reject: 'The conclusions are not sufficiently supported by the data presented.',
          Transfer: 'Sound work, but better suited to a more specialised journal in the portfolio.',
          'Assign to PE': 'Accepted; handed over to the Publishing Editor for production.'
        }[type],
        decidedAt,
        decidedBy: reviewer
      }
    });
    msc.decisionHistory.push({ ...msc.decision, version: 1 });
    if (k % 4 === 0) annotate(msc, report, reviewer, 2, daysAgo * 24 - 6);
  }

  // Author demo: one of Admin's own MSCs came back with a minor revision.
  {
    const report = reportFor(1, 'JACS');
    const msc = create(report, 62, 'Admin');
    const submitted = new Date(msc.submittedAt).getTime();
    const decidedAt = new Date(submitted + 22 * H).toISOString();
    Object.assign(msc, {
      assignedReviewer: 'RV-4', assignedAt: new Date(submitted + H).toISOString(),
      reviewStatus: 'Complete', reviewStartAt: new Date(submitted + 3 * H).toISOString(), reviewProgress: 100,
      completedAt: decidedAt, feedbackStatus: 'In Progress',
      decision: { type: 'Revise', revisionType: 'Minor', alternateJournalId: null, publishingEditorId: null, summary: 'Solid work. Please add the requested control data and clarify the highlighted statements.', decidedAt, decidedBy: 'RV-4' }
    });
    msc.decisionHistory.push({ ...msc.decision, version: 1 });
    annotate(msc, report, 'RV-4', 3, 45);
  }

  // ---- ~50 Open / In Progress MSCs ----
  const ACTIVE_COUNT = 50;
  // Ages (hours): a spread of on-track (< 8 h), attention (8–24 h) and delayed (> 24 h).
  const ages = [];
  for (let i = 0; i < ACTIVE_COUNT; i++) {
    const r = i % 10;
    ages.push(r < 2 ? between(0.2, 7.5) : r < 5 ? between(8.5, 23.5) : between(25, 170));
  }
  ages.sort((a, b) => b - a); // oldest first so IDs increase with recency
  ages.forEach((hoursAgo, i) => {
    const report = reportFor(i);
    const msc = create(report, hoursAgo);
    const submitted = new Date(msc.submittedAt).getTime();
    const wantsReviewer = !(i % 5 === 2) && !(hoursAgo < 3 && i % 2 === 0);
    const reviewer = wantsReviewer ? freeReviewer(report.journalId) : null;
    if (!reviewer) return; // stays Open & unassigned
    // Every assignment goes through an invitation e-mail (link is made absolute when served).
    const email = service.inviteReviewer(msc, db.reviewers.find(r => r.id === reviewer), { baseUrl: '', invitedBy: 'Editorial Office' });
    msc.assignedAt = new Date(submitted + Math.min(hoursAgo * 0.2, 2) * H).toISOString();
    msc.invitation.sentAt = email.sentAt = msc.assignedAt;
    const started = hoursAgo > 2 && rand() < 0.62;
    // Started reviews were accepted; of the rest, about half still await the reviewer's response.
    if (started || rand() < 0.45) {
      msc.invitation.status = 'Accepted';
      msc.invitation.respondedAt = new Date(submitted + Math.min(hoursAgo * 0.3, 6) * H).toISOString();
    }
    if (started) {
      msc.reviewStatus = 'In Progress';
      msc.reviewStartAt = new Date(submitted + Math.min(hoursAgo * 0.35, 8) * H).toISOString();
      msc.reviewProgress = Math.round(between(10, Math.min(88, 20 + hoursAgo)));
      if (rand() < 0.5) annotate(msc, report, reviewer, 1 + Math.floor(rand() * 3), hoursAgo * 0.2);
    }
    if (i % 11 === 5) {
      msc.revisions = 1;
      msc.feedbackStatus = 'Complete';
      msc.versions.unshift({ version: 0, submittedAt: new Date(submitted - 120 * H).toISOString(), fileName: msc.fileName, score: report.score, contentHash: report.contentHash });
      msc.versions = msc.versions.map((v, idx) => ({ ...v, version: idx + 1 }));
      msc.decisionHistory.push({ type: 'Revise', revisionType: 'Minor', summary: 'Please address the reviewer comments.', decidedAt: new Date(submitted - 48 * H).toISOString(), decidedBy: reviewer, version: 1 });
    }
  });

  store.save();
  return store.get();
}

module.exports = { buildSeed };
