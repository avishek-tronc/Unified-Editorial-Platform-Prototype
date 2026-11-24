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
  WEIGHTS, CATEGORY_LABELS, PASS_THRESHOLD, finalScore,
  parseStructure, detectCommunication, countTerm, words
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

// ---------- integrity (same rules as the Author upload page) ----------

const GUIDANCE = {
  completeness: {
    focus: 'Is the MSC complete and does each section do its job?',
    prompts: [
      'Does the abstract state the problem, the approach and the key quantitative result?',
      'Are the experimental / methods details sufficient for another lab to reproduce the work?',
      'Do the conclusions follow from the data presented, without over-claiming?'
    ]
  },
  typos: {
    focus: 'Is the language clear enough for the readership?',
    prompts: ['Flag passages where unclear wording changes the scientific meaning.', 'Note recurring spelling or terminology inconsistencies (units, compound names).']
  },
  plagiarism: {
    focus: 'Is the text original and are prior works properly cited?',
    prompts: ['Check that overlapping passages are quoted or cited.', 'Confirm the novelty claim against the cited prior work.']
  },
  figures: {
    focus: 'Do figures, schemes and equations support the claims?',
    prompts: ['Are all figures cited in the text in order and legible (axes, units, scale bars)?', 'Do figure captions explain the experiment without referring to the main text?', 'Are equations numbered and their symbols defined?']
  },
  tables: {
    focus: 'Is the tabulated data consistent and complete?',
    prompts: ['Do table values match the values quoted in the text?', 'Are units, uncertainties and sample sizes reported?']
  },
  conformance: {
    focus: 'Does the MSC meet the journal requirements and authorship integrity?',
    prompts: ['Are author contributions, conflict-of-interest and data availability statements present?', 'Are author identities / ORCID iDs and affiliations consistent?']
  },
  scope: {
    focus: 'Is the work a good fit for the selected journal?',
    prompts: ['Will the journal\'s readership find the advance significant?', 'If the fit is weak, would a transfer to a better-fitting journal serve the authors?']
  }
};

function band(score) {
  return score >= 8 ? 'strong' : score > PASS_THRESHOLD ? 'adequate' : score >= 4 ? 'weak' : 'poor';
}

function integrity(msc) {
  const r = msc.integrity;
  const categories = Object.keys(WEIGHTS).map(key => {
    const c = (r.categories || []).find(x => x.key === key) || { score: 0, issues: [] };
    return { key, label: CATEGORY_LABELS[key], weight: WEIGHTS[key], score: c.score, issues: c.issues || [], contribution: Math.round(WEIGHTS[key] * c.score * 100) / 100, band: band(c.score) };
  });
  const sim = (r.stats && r.stats.similarity) || 0;
  const result = finalScore(categories, sim);
  const issues = categories.flatMap(c => c.issues).filter(i => i.severity !== 'info');
  const sevOrder = { critical: 0, major: 1, minor: 2 };
  issues.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  // Reviewer guidance: weakest categories first, each with prompts and
  // ready-to-use feedback points drawn from the detected issues.
  const guidance = categories.slice().sort((a, b) => a.score - b.score).map(c => ({
    key: c.key,
    label: c.label,
    score: c.score,
    band: c.band,
    focus: GUIDANCE[c.key].focus,
    prompts: GUIDANCE[c.key].prompts,
    suggestions: c.issues.filter(i => i.severity !== 'info').slice(0, 4).map(i => ({
      severity: i.severity,
      text: `${i.message} Suggested action for the author: ${i.remediation}`
    }))
  }));

  const counts = {
    critical: issues.filter(i => i.severity === 'critical').length,
    major: issues.filter(i => i.severity === 'major').length,
    minor: issues.filter(i => i.severity === 'minor').length
  };
  const recommendation = !result.passed
    ? 'The MSC does not meet the integrity threshold. Focus the review on the critical and major items; a Revise or Reject decision is likely.'
    : counts.critical || counts.major
      ? 'The MSC passes the integrity threshold but has open major items. Ask the author to address them (likely a Minor/Major revision).'
      : 'The MSC passes with only minor items. Concentrate the review on scientific merit and novelty.';

  return {
    score: result.score,
    passed: result.passed,
    passThreshold: PASS_THRESHOLD,
    weightedScore: result.weighted,
    caps: result.caps,
    storedScore: r.score,
    categories,
    issues,
    counts,
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
