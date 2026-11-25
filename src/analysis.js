'use strict';

/**
 * Reviewer-side MSC analysis shown on the Review & Feedback page:
 *
 *   1. MSC summary       — extractive, section-aware summary of the uploaded MSC
 *   2. Integrity check   — the same engine, weights, caps and PASS rule as the
 *                          Author upload check, plus guidance for the reviewer
 *   3. Journal fitment   — % compatibility with the journal the author chose,
 *                          the term-level evidence behind it and feedback
 *
 * Everything is deterministic and runs offline, like the integrity engine.
 */
const {
  PASS_THRESHOLD, parseStructure, detectCommunication, countTerm, words
} = require('./integrity');
const { JOURNALS, getJournal } = require('./journals');

const STOP = new Set(`a about above after again against all also am an and any are as at be because been before being below
between both but by can could did do does doing down during each few for from further had has have having he her here hers
herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or
other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these
they this those through to too under until up very was we were what when where which while who whom why will with would you
your yours yourself yourselves via within without upon thus however therefore moreover furthermore whereas whether although
et al fig figs figure figures table tables scheme schemes eq eqs equation ref refs si supporting information shown show shows
using used use based respectively obtained observed found also two three one four five first second new ca approximately
well may might can cannot due e g i e vs per whereas toward towards among compared different several various each`.split(/\s+/));

const CUES = /\b(here,? we|we (report|show|demonstrate|present|describe|propose|develop|find|found|reveal|establish|identify)|our results|these results|this work|in summary|in conclusion|overall|taken together|for the first time|we anticipate)\b/i;

const SUMMARY_PLAN = [
  { key: 'overview', label: 'Overview', icon: '📄', sources: ['abstract'], take: 2 },
  { key: 'problem', label: 'Background & objective', icon: '🎯', sources: ['introduction', 'body'], take: 2 },
  { key: 'approach', label: 'Approach & methods', icon: '🧪', sources: ['methods', 'results', 'body'], take: 2, prefer: /\b(prepared|synthes|measured|performed|using|characteri|calculat|employ|method|procedure|protocol|condition)/i },
  { key: 'findings', label: 'Key findings', icon: '📈', sources: ['results', 'discussion', 'body'], take: 3, prefer: /(\d+(\.\d+)?\s?(%|nm|°c|k\b|ev|mv|mg|mm|μm|h\b|min|fold))|\b(increase|decrease|higher|lower|enhanc|improv|reveal|demonstrat|confirm|indicat|show)/i },
  { key: 'conclusion', label: 'Conclusions & outlook', icon: '✅', sources: ['conclusion', 'discussion', 'results', 'body'], take: 2, prefer: /\b(conclu|summary|overall|future|outlook|anticipate|potential|pave|enable|open)/i, fromEnd: true }
];

function sentences(paragraphs) {
  return paragraphs.join(' ')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z(“"])/)
    .map(s => s.trim())
    .filter(s => s.length >= 40 && s.length <= 420 && words(s).length >= 8 && !/^(fig(ure)?|table|scheme)\s*\d/i.test(s) && !/^\(?[a-h]\)\s/.test(s));
}

function contentTerms(text) {
  return words(text.toLowerCase()).map(w => w.replace(/['’]s$/, '')).filter(w => w.length > 2 && !STOP.has(w) && !/^\d/.test(w));
}

function termFrequencies(text) {
  const tf = new Map();
  contentTerms(text).forEach(w => tf.set(w, (tf.get(w) || 0) + 1));
  return tf;
}

function keyTerms(text, title, limit = 14) {
  const toks = contentTerms(text);
  const uni = new Map(); const bi = new Map();
  toks.forEach((w, i) => {
    uni.set(w, (uni.get(w) || 0) + 1);
    if (i > 0) { const b = `${toks[i - 1]} ${w}`; bi.set(b, (bi.get(b) || 0) + 1); }
  });
  const titleTerms = new Set(contentTerms(title || ''));
  const cand = [];
  bi.forEach((n, b) => { if (n >= 3) cand.push({ term: b, count: n, weight: n * 2.2 + (b.split(' ').some(t => titleTerms.has(t)) ? 6 : 0) }); });
  uni.forEach((n, w) => { if (n >= 3 && w.length > 3) cand.push({ term: w, count: n, weight: n + (titleTerms.has(w) ? 8 : 0) }); });
  cand.sort((a, b) => b.weight - a.weight);
  const out = [];
  for (const c of cand) {
    if (out.length >= limit) break;
    // skip a unigram already covered by a chosen bigram (and vice versa)
    if (out.some(o => o.term.split(' ').includes(c.term) || c.term.split(' ').includes(o.term))) continue;
    out.push({ term: c.term, count: c.count });
  }
  return out;
}

function rankSentences(list, tf, titleTerms, prefer) {
  const maxTf = Math.max(1, ...tf.values());
  return list.map((s, idx) => {
    const terms = contentTerms(s);
    if (!terms.length) return { s, idx, score: 0 };
    let score = terms.reduce((sum, t) => sum + (tf.get(t) || 0) / maxTf, 0) / Math.sqrt(terms.length);
    score += terms.filter(t => titleTerms.has(t)).length * 0.12;
    if (CUES.test(s)) score += 0.45;
    if (prefer && prefer.test(s)) score += 0.3;
    if (/\[\d|\(\d+(,\s*\d+)*\)$/.test(s)) score -= 0.05; // citation-heavy
    return { s, idx, score };
  });
}

function stripCitations(s) {
  // Only bracketed citations are removed: trailing digits may be chemical formulae (CsPbCl3).
  return s.replace(/\s?\[(\d+\s?[,–-]?\s?)+\]/g, '');
}

function summarize(msc, content) {
  const r = msc.integrity;
  const paragraphs = (content.text || '').split(/\n+/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const structure = detectCommunication(parseStructure(paragraphs));
  const sec = structure.sections;
  const fullText = paragraphs.join(' ');
  const tf = termFrequencies(fullText);
  const titleTerms = new Set(contentTerms(msc.title || ''));
  const used = new Set();

  const blocks = [];
  SUMMARY_PLAN.forEach(plan => {
    const src = plan.sources.find(k => sec[k] && sec[k].paragraphs.length);
    if (!src) return;
    let list = sentences(sec[src].paragraphs);
    if (plan.fromEnd && list.length > 12) list = list.slice(-12);
    const ranked = rankSentences(list, tf, titleTerms, plan.prefer)
      .filter(x => !used.has(x.s))
      .sort((a, b) => b.score - a.score)
      .slice(0, plan.take)
      .sort((a, b) => a.idx - b.idx);
    if (!ranked.length) return;
    ranked.forEach(x => used.add(x.s));
    blocks.push({ key: plan.key, label: plan.label, icon: plan.icon, source: sec[src].label, sentences: ranked.map(x => stripCitations(x.s)) });
  });

  const sectionStats = structure.order
    .filter(k => !['templateGuide', 'keywords'].includes(k))
    .map(k => ({ key: k, label: sec[k].label, words: words(sec[k].paragraphs.join(' ')).length }))
    .filter(s => s.words > 0);

  const st = r.stats || {};
  const totalWords = st.totalWords || words(fullText).length;
  const oneLiner = blocks.length && blocks[0].sentences.length ? blocks[0].sentences[0] : (msc.abstract || '').slice(0, 300);

  return {
    title: msc.title,
    articleType: (r.meta && r.meta.articleType) || structure.articleType || 'Article',
    oneLiner,
    blocks,
    keywords: (r.meta && r.meta.keywords) || st.keywords || [],
    keyTerms: keyTerms(fullText, msc.title),
    sectionStats,
    composition: {
      totalWords,
      readingMinutes: Math.max(1, Math.round(totalWords / 230)),
      abstractWords: st.abstractWords || 0,
      references: st.references || 0,
      figures: st.images || 0,
      figureCaptions: st.figureCaptions || 0,
      schemes: st.schemes || 0,
      tables: st.tables || 0,
      equations: st.equations || 0,
      authors: st.authors || (msc.authors || []).length,
      affiliations: st.affiliations || 0
    },
    authors: msc.authors || [],
    correspondingAuthor: (r.meta && r.meta.correspondingAuthor) || msc.authorName,
    abstract: msc.abstract || ''
  };
}

// ---------- integrity (same 21 clauses as the Author MSC validation) ----------

// What the reviewer should look at for each integrity area (IA-04 … IA-12).
const AREA_GUIDANCE = {
  'IA-04': { focus: 'Is the text original and not a duplicate submission?', prompts: ['Check that overlapping passages are quoted and cited.', 'Confirm the novelty claim against the matched sources.'] },
  'IA-05': { focus: 'Are the figures, spectra and blots genuine and used once?', prompts: ['Look for repeated panels, unexplained splices or uniform backgrounds.', 'Ask for raw images where a panel looks processed.'] },
  'IA-06': { focus: 'Do the citations support the claims and are they sound?', prompts: ['Spot-check that key claims are backed by the cited work.', 'Question self-citation or same-venue citation that is not needed.'] },
  'IA-07': { focus: 'Are the data available and consistent?', prompts: ['Do the values in the text match the tables and SI?', 'Is the data deposited where the policy requires it?'] },
  'IA-08': { focus: 'Is any AI-generated content disclosed and acceptable?', prompts: ['Note unusual phrasing that may hide copied or generated text.', 'Check whether AI use is disclosed where it appears to have been used.'] },
  'IA-09': { focus: 'Are the authors who they say they are?', prompts: ['Do the e-mail domains and ORCID records match the stated affiliations?'] },
  'IA-10': { focus: 'Are editor and reviewers independent of the authors?', prompts: ['Declare to the editor any shared affiliation or recent co-authorship with the authors.'] },
  'IA-11': { focus: 'Are any parties on a sanctions list?', prompts: ['Matches are resolved by compliance; do not proceed until cleared.'] },
  'IA-12': { focus: 'Are there signs of coordinated or manipulated review?', prompts: ['Flag shared contact details, look-alike e-mail domains or implausibly fast reviews to the editor.'] }
};

function integrity(msc) {
  const service = require('./service');
  const r = msc.integrity;
  const v = service.liveValidation(msc);
  if (!v) {
    return { score: r.score, passed: r.passed, passThreshold: PASS_THRESHOLD, caps: r.caps || [], counts: { pass: 0, flag: 0, fail: 0, critical: 0, major: 0, minor: 0 }, results: [], areas: [], guidance: [], recommendation: 'This MSC was screened before the clause-based validation was introduced; re-upload it to see the clause breakdown.', stats: r.stats || {} };
  }
  const open = v.results.filter(x => x.status !== 'pass');
  const guidance = v.areas.slice().sort((a, b) => a.score - b.score).map(a => ({
    clause: a.clause,
    label: a.label,
    score: a.score,
    status: a.status,
    focus: AREA_GUIDANCE[a.clause].focus,
    prompts: AREA_GUIDANCE[a.clause].prompts,
    suggestions: v.results.filter(x => x.clause === a.clause && x.status !== 'pass').map(x => ({
      id: x.id,
      status: x.status,
      severity: x.severity,
      text: `${x.id} (${x.clause}) ${x.finding}${x.remediation ? ` Suggested action for the author: ${x.remediation}` : ''}`
    }))
  }));
  const recommendation = !v.passed
    ? `The MSC does not meet the validation threshold (${v.counts.fail} failed, ${v.counts.flag} flagged clause(s)). Focus the review on the failed clauses; a Revise or Reject decision is likely.`
    : open.length
      ? `The MSC passes the validation threshold with ${open.length} clause(s) needing attention. Confirm them during the review.`
      : 'All 21 integrity clauses pass. Concentrate the review on scientific merit and novelty.';
  return {
    score: v.score,
    passed: v.passed,
    passThreshold: PASS_THRESHOLD,
    deductions: v.deductions,
    caps: v.caps,
    counts: v.counts,
    results: v.results,
    areas: v.areas,
    context: v.context,
    method: v.method,
    uploadScore: r.score,
    guidance,
    recommendation,
    stats: r.stats || {},
    checkedAt: (msc.versions && msc.versions.length ? msc.versions[msc.versions.length - 1].submittedAt : msc.submittedAt)
  };
}

// ---------- journal fitment ----------

function fitment(msc, content) {
  const r = msc.integrity;
  const fit = r.fitment || { index: 0, scores: {} };
  const journal = getJournal(msc.journalId);
  const meta = r.meta || {};
  const core = [msc.title, meta.abstract || msc.abstract || '', (meta.keywords || []).join(' ')].join(' ').toLowerCase();
  const body = (content.text || '').toLowerCase();

  // Term-level evidence, using the same weighting as the integrity engine
  // (title/abstract/keywords ×3, body hits capped at 3 per term).
  const terms = journal.subjects.map(term => {
    const inCore = countTerm(core, term);
    const inBody = countTerm(body, term);
    return { term, inCore, inBody, points: inCore * 3 + Math.min(3, inBody) };
  }).sort((a, b) => b.points - a.points);
  const matched = terms.filter(t => t.points > 0);
  const raw = terms.reduce((s, t) => s + t.points, 0);
  const coreRaw = terms.reduce((s, t) => s + t.inCore * 3, 0);
  const index = Number.isFinite(fit.scores[journal.id]) ? fit.scores[journal.id] : Math.round(100 * (1 - Math.exp(-raw / 20)));

  const st = r.stats || {};
  const L = journal.limits;
  const format = [
    { label: 'Manuscript length', value: `${(st.totalWords || 0).toLocaleString('en-US')} words`, limit: `≤ ${L.totalWords.toLocaleString('en-US')}`, ok: (st.totalWords || 0) <= L.totalWords },
    { label: 'Abstract length', value: `${st.abstractWords || 0} words`, limit: `≤ ${L.abstractWords}`, ok: (st.abstractWords || 0) > 0 && (st.abstractWords || 0) <= L.abstractWords },
    { label: 'References', value: `${st.references || 0}`, limit: `≥ ${L.minReferences}`, ok: (st.references || 0) >= L.minReferences },
    { label: 'Keywords', value: `${(meta.keywords || st.keywords || []).length}`, limit: `1–${L.maxKeywords}`, ok: (meta.keywords || st.keywords || []).length > 0 && (meta.keywords || st.keywords || []).length <= L.maxKeywords },
    { label: 'Title length', value: `${(msc.title || '').length} chars`, limit: `≤ ${L.titleChars}`, ok: (msc.title || '').length <= L.titleChars }
  ];
  const formatPct = Math.round(100 * format.filter(f => f.ok).length / format.length);
  const coverage = Math.round(100 * matched.length / terms.length);
  const ranking = Object.entries(fit.scores || {}).map(([id, v]) => {
    const j = getJournal(id);
    return { id, name: j ? j.name : id, shortName: j ? j.shortName : id, genre: j ? j.genre : '', fitmentIndex: v, selected: id === journal.id };
  }).sort((a, b) => b.fitmentIndex - a.fitmentIndex);
  const best = ranking[0] || { id: journal.id, fitmentIndex: index };
  const relative = best.fitmentIndex ? Math.round(100 * index / best.fitmentIndex) : 0;
  const prominence = raw ? Math.round(100 * coreRaw / raw) : 0;

  const verdict = index >= 70 ? { level: 'Strong fit', tone: 'green' }
    : index >= 50 ? { level: 'Moderate fit', tone: 'amber' }
      : index >= 35 ? { level: 'Weak fit', tone: 'amber' }
        : { level: 'Poor fit', tone: 'red' };

  const feedback = [];
  feedback.push(`The MSC shows ${verdict.level.toLowerCase()} (${index}%) with ${journal.name}, whose scope is: ${journal.context.toLowerCase()}.`);
  if (matched.length) feedback.push(`Scope evidence: ${matched.slice(0, 6).map(t => `“${t.term}”`).join(', ')} appear in the MSC${coreRaw ? ', several of them in the title, abstract or keywords' : ''}.`);
  const missing = terms.filter(t => !t.points).slice(0, 6).map(t => t.term);
  if (index < 70 && missing.length) feedback.push(`Core ${journal.shortName} topics not addressed: ${missing.join(', ')}. The authors could make the relevance to these areas explicit.`);
  if (prominence < 40 && raw > 0) feedback.push('Most scope terms only appear in the body; the title and abstract do little to signal relevance to this journal.');
  const failedFormat = format.filter(f => !f.ok);
  if (failedFormat.length) feedback.push(`Journal format requirements not met: ${failedFormat.map(f => `${f.label.toLowerCase()} ${f.value} (required ${f.limit})`).join('; ')}.`);
  if (best.id !== journal.id && best.fitmentIndex >= index + 15) {
    feedback.push(`${best.name} is a noticeably better fit (${best.fitmentIndex}%). Consider recommending a Transfer.`);
  } else if (index >= 50) {
    feedback.push(`${journal.shortName} is an appropriate venue; no transfer is needed on scope grounds.`);
  }

  return {
    journal: { id: journal.id, name: journal.name, shortName: journal.shortName, genre: journal.genre, context: journal.context, cover: journal.cover, homepage: journal.homepage },
    index,
    verdict,
    profile: [
      { label: 'Subject match', value: index, hint: 'Fitment index from the journal mapping (same as the Author check)' },
      { label: 'Topic coverage', value: coverage, hint: `${matched.length} of ${terms.length} scope topics of ${journal.shortName} found` },
      { label: 'Scope prominence', value: prominence, hint: 'Share of the evidence that sits in the title, abstract and keywords' },
      { label: 'Format conformity', value: formatPct, hint: `${format.length - failedFormat.length} of ${format.length} journal limits met` },
      { label: 'Relative fit', value: relative, hint: 'Fit with the selected journal compared with the best-fitting journal' }
    ],
    terms,
    format,
    ranking,
    recommended: best.id !== journal.id && best.fitmentIndex >= index + 15 ? best : null,
    feedback
  };
}

function analyze(msc, content) {
  return {
    mscId: msc.id,
    journalId: msc.journalId,
    generatedAt: new Date().toISOString(),
    summary: summarize(msc, content),
    integrity: integrity(msc),
    fitment: fitment(msc, content)
  };
}

module.exports = { analyze, summarize, integrity, fitment, JOURNALS };
