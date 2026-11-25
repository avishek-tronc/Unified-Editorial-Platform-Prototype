'use strict';

/**
 * MSC validation on the 21 integrity clauses I-01 … I-21 (IA-04 … IA-12 of
 * the Integrity Assurance requirements, IA v1).
 *
 *   extractEvidence(ctx)      — runs once at upload: reads the .docx (text,
 *                               references, images, statements) and stores a
 *                               compact evidence record with the report.
 *   evaluateClauses(ev, env)  — turns the evidence plus the workflow context
 *                               (handling editor, reviewers, accounts, timing,
 *                               telemetry) into one result per clause and the
 *                               1–10 score. Re-run whenever the context changes
 *                               (e.g. a reviewer is assigned or submits).
 *
 * Scoring: every clause starts at "pass". A "fail" deducts the clause's
 * severity points (critical 3 · major 1.5 · minor 0.75); a "flag" (signal for
 * human review) deducts half of that. Score = 10 − deductions (min 1). Caps:
 * similarity over 25 % or a duplicate submission → max 4; two or more critical
 * failures → max 5. PASS needs a score above 6 (unchanged).
 *
 * External services (iThenticate, Proofig/ImageTwin, Crossref, ORCID, ROR,
 * OpenAlex, sanctions feeds) are not called by the prototype: each clause
 * says which service it stands in for and uses local, deterministic data.
 */
const crypto = require('crypto');
const L = require('./integrity-lists');

const PASS_THRESHOLD = 6;
const SEVERITY_POINTS = { critical: 3, major: 1.5, minor: 0.75 };

const AREAS = {
  'IA-04': 'Text similarity & plagiarism',
  'IA-05': 'Image & figure integrity',
  'IA-06': 'Citation & reference integrity',
  'IA-07': 'Data & supporting materials',
  'IA-08': 'AI-use disclosure & content signals',
  'IA-09': 'Identity & affiliation',
  'IA-10': 'Conflict of interest',
  'IA-11': 'Sanctions & restricted parties',
  'IA-12': 'Suspicious behaviour'
};

const CLAUSES = [
  { id: 'I-01', clause: 'IA-04', severity: 'critical', feasibility: 'Fully (screening)', check: 'iThenticate similarity: over 25% overall or over 10% from one source is flagged', tool: 'Crossref Similarity Check (iThenticate) — prototype: 8-word shingle index of published sources' },
  { id: 'I-02', clause: 'IA-04', severity: 'critical', feasibility: 'Fully', check: 'The text doesn\'t overlap with other ACS submissions (duplicate submission)', tool: 'Internal submission index (MinHash / shingling)' },
  { id: 'I-03', clause: 'IA-05', severity: 'critical', feasibility: 'Fully', check: 'No figure panels are duplicated within the manuscript and SI', tool: 'Image hashing across all embedded figures (Proofig / ImageTwin in production)' },
  { id: 'I-04', clause: 'IA-05', severity: 'critical', feasibility: 'Partly', check: 'Figures aren\'t reused from published papers', tool: 'Figure index of ACS submissions + reuse declarations (Proofig / ImageTwin published-figure database in production)' },
  { id: 'I-05', clause: 'IA-05', severity: 'critical', feasibility: 'Partly', check: 'No splicing, cloning or erased regions in images', tool: 'Image metadata forensics (region-level ELA / clone detection by Proofig / ImageTwin in production)' },
  { id: 'I-06', clause: 'IA-05', severity: 'critical', feasibility: 'Fully', check: 'Images, spectra or blots that look AI-generated or fabricated are flagged', tool: 'C2PA / generator metadata and AI-image markers (specialised detector in production)' },
  { id: 'I-07', clause: 'IA-06', severity: 'critical', feasibility: 'Fully', check: 'No cited work is retracted or under an expression of concern', tool: 'Crossref REST API with Retraction Watch data — prototype: demo retraction list' },
  { id: 'I-08', clause: 'IA-06', severity: 'major', feasibility: 'Fully', check: 'Excessive self-citation, citation stacking or predatory journals are flagged', tool: 'Reference parser + author matching + venue watch-list (Crossref / OpenAlex in production)' },
  { id: 'I-09', clause: 'IA-06', severity: 'minor', feasibility: 'Partly', check: 'Each citing claim is supported by the cited source', tool: 'Citation-to-reference linkage (LLM entailment on cited abstracts in production)' },
  { id: 'I-10', clause: 'IA-07', severity: 'major', feasibility: 'Partly', check: 'Data availability meets policy, and numbers in the text match the tables and SI', tool: 'Statement classifier + text-to-table number cross-check (statcheck / GRIM in production)' },
  { id: 'I-11', clause: 'IA-08', severity: 'major', feasibility: 'Fully', check: 'Leftover chatbot text, tortured phrases and AI-text scores are flagged', tool: 'Chatbot-artefact and tortured-phrase lists (Problematic Paper Screener style) + AI-style term score' },
  { id: 'I-12', clause: 'IA-09', severity: 'major', feasibility: 'Fully', check: 'Author name and affiliation match ORCID and ROR', tool: 'ORCID iD checksum + ROR institution ↔ e-mail domain (ORCID / ROR APIs in production)' },
  { id: 'I-13', clause: 'IA-09', severity: 'minor', feasibility: 'Fully', check: 'Duplicate or suspicious accounts are flagged', tool: 'Fuzzy match of authors against platform accounts (rapidfuzz-style)' },
  { id: 'I-14', clause: 'IA-10', severity: 'major', feasibility: 'Fully', check: 'Authors don\'t share a recent affiliation with the editor or reviewers', tool: 'Affiliation comparison (ORCID employment + ROR IDs in production)' },
  { id: 'I-15', clause: 'IA-10', severity: 'major', feasibility: 'Fully', check: 'No recent co-authorship between authors and the editor or reviewers', tool: 'Co-author sets from the reference list (OpenAlex / ORCID works in production)' },
  { id: 'I-16', clause: 'IA-10', severity: 'critical', feasibility: 'Fully', check: 'Reviewers the authors opposed, or with declared conflicts, aren\'t assigned', tool: 'Rules engine: opposed reviewers + reviewer-declared conflicts' },
  { id: 'I-17', clause: 'IA-11', severity: 'critical', feasibility: 'Fully (screening)', check: 'Authors, institutions and funders are screened against sanctions lists', tool: 'Fuzzy name match against restricted-party lists (OFAC / EU / UN / UK / BIS feeds in production — demo list here)' },
  { id: 'I-18', clause: 'IA-12', severity: 'major', feasibility: 'Fully', check: 'The same email, phone or address used by different people is flagged', tool: 'Normalised contact fields grouped across participants' },
  { id: 'I-19', clause: 'IA-12', severity: 'minor', feasibility: 'Fully', check: 'Free-mail, disposable or look-alike reviewer email domains are flagged', tool: 'Domain lists + edit distance to institutional domains' },
  { id: 'I-20', clause: 'IA-12', severity: 'major', feasibility: 'Fully (needs logging)', check: 'The same IP address or device used by an author and a reviewer is flagged', tool: 'Platform telemetry: IP and device fingerprint logged per action' },
  { id: 'I-21', clause: 'IA-12', severity: 'minor', feasibility: 'Fully', check: 'Implausibly fast reviews or bursts of submissions are flagged', tool: 'Workflow event log: invite / accept / decision timestamps and submission rate' }
];

// ---------- text helpers ----------

function fold(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
function clip(s, n = 140) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
function round1(n) { return Math.round(n * 10) / 10; }
function md5(buf) { return crypto.createHash('md5').update(buf).digest('hex'); }
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function shingles(text, n = 8) {
  const w = fold(text).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const set = new Set();
  for (let i = 0; i + n <= w.length; i++) set.add(w.slice(i, i + n).join(' '));
  return set;
}

function expandNumbers(s) {
  const out = [];
  String(s).split(/\s*[,;]\s*/).forEach(part => {
    const m = part.match(/^(\d{1,3})\s*[-–—−]\s*(\d{1,3})$/);
    if (m) { const a = +m[1]; const b = +m[2]; if (b >= a && b - a < 60) for (let i = a; i <= b; i++) out.push(i); } else if (/^\d{1,3}$/.test(part)) out.push(+part);
  });
  return out;
}

/** "Prof. Anna Kowalski" → { first: 'anna', last: 'kowalski', initial: 'a' } */
function personName(name) {
  const parts = fold(name).replace(/^(prof|dr|mr|ms|mrs)\.?\s+/g, '').replace(/[^a-z\s.'-]/g, ' ').replace(/\./g, '. ').split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const last = parts[parts.length - 1].replace(/[.']/g, '');
  const first = parts[0].replace(/\./g, '');
  return { first, last, initial: first[0] || '', full: parts.join(' ').replace(/\s+/g, ' ') };
}
function samePerson(a, b) {
  const x = personName(a); const y = personName(b);
  return !!(x && y && x.last === y.last && x.last.length > 1 && x.initial === y.initial);
}
function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length; const n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/** Does a reference string list this person as an author? (surname + first initial, ACS and Vancouver styles) */
function refHasPerson(ref, name) {
  const p = personName(name);
  if (!p || p.last.length < 2 || !p.initial) return false;
  const r = fold(ref);
  const last = escapeRe(p.last);
  const i = escapeRe(p.initial);
  return new RegExp(`(^|[^a-z])${last},?\\s+${i}[a-z]*\\b`).test(r) || new RegExp(`(^|[^a-z])${i}[a-z]*\\.?\\s+(?:[a-z]\\.\\s*)*${last}([^a-z]|$)`).test(r);
}

function domainOf(email) { return (String(email).split('@')[1] || '').toLowerCase(); }
function baseDomain(d) {
  const parts = d.split('.');
  const sld = ['ac', 'edu', 'co', 'com', 'org', 'gov'];
  return parts.length > 2 && sld.includes(parts[parts.length - 2]) ? parts.slice(-3).join('.') : parts.slice(-2).join('.');
}
const GENERIC_LABELS = new Set(['edu', 'ac', 'com', 'org', 'net', 'gov', 'mail', 'email', 'cn', 'uk', 'de', 'it', 'be', 'fr', 'jp', 'in', 'ch', 'es', 'nl', 'se', 'us', 'ca', 'au', 'br', 'pl', 'ie', 'il', 'sa', 'sg', 'hk', 'kr', 'tw', 'chem', 'chemistry', 'dept', 'staff', 'student', 'students']);

function acronym(s) {
  return fold(s).split(/[^a-z]+/).filter(w => w && !['of', 'di', 'de', 'der', 'and', 'the', 'for', 'la', 'le', 'du', 'des', 'degli', 'della', 'y', 'e'].includes(w)).map(w => w[0]).join('');
}

/** Is an e-mail domain plausibly the institution named in one of the affiliations? */
function domainMatchesAffiliation(domain, affiliations) {
  const aff = fold(affiliations.join(' ; '));
  const ror = L.ROR_DOMAINS[baseDomain(domain)] || L.ROR_DOMAINS[domain];
  if (ror && ror.some(n => aff.includes(n))) return { ok: true, via: `ROR: ${baseDomain(domain)} → ${ror[0]}` };
  const labels = domain.split('.').filter(l => l.length >= 2 && !GENERIC_LABELS.has(l));
  const words = aff.split(/[^a-z]+/).filter(w => w.length >= 4);
  const acronyms = affiliations.flatMap(a => a.split(/[,;]/)).map(acronym).filter(a => a.length >= 2);
  for (const l of labels) {
    const flat = l.replace(/-/g, '');
    if (words.some(w => flat.includes(w) || (flat.length >= 4 && w.includes(flat)))) return { ok: true, via: `domain "${l}" matches the affiliation name` };
    if (acronyms.some(a => a === flat || (flat.length >= 3 && a.includes(flat)))) return { ok: true, via: `domain "${l}" matches the institution acronym` };
  }
  return { ok: false };
}

function institutionsOf(affiliation) {
  return affiliation.split(/[,;]/).map(s => s.trim()).filter(s => /(universit|institut|istituto|college|school|cent(er|re)|laborator|academy|politecnico|eth\b|cnrs|kaust|max planck|weizmann|karolinska|polytechnic|tu\s)/i.test(s));
}

// ---------- evidence extraction (upload time) ----------

const REF_START = /^\s*(?:\((\d{1,3})\)|\[(\d{1,3})\]|(\d{1,3})[.)])\s*/;

function parseReferences(structure) {
  const sec = structure.sections.references;
  if (!sec) return [];
  const items = [];
  sec.paragraphs.forEach(p => {
    const m = p.match(REF_START);
    if (m) items.push({ n: +(m[1] || m[2] || m[3]), text: p.replace(REF_START, '').trim() });
    else if (items.length && p.length < 400 && !/^(supporting information|for table of contents)/i.test(p)) items[items.length - 1].text += ` ${p}`;
    else if (!items.length && p.length > 30) items.push({ n: items.length + 1, text: p });
  });
  return items.filter(r => r.text.length > 10);
}

function citedNumbers(docXml, text) {
  const nums = new Set();
  // ACS style: superscript citation runs
  const runRe = /<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*?<w:vertAlign w:val="superscript"\/>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g;
  let superscripts = 0;
  (docXml.match(runRe) || []).forEach(run => {
    const t = (run.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(x => x.replace(/<[^>]+>/g, '')).join('').trim();
    if (/^\d{1,3}(\s*[,–—−-]\s*\d{1,3})*,?$/.test(t)) { superscripts++; expandNumbers(t.replace(/,$/, '')).forEach(n => nums.add(n)); }
  });
  // bracket style [1], [2–4], [1,3]
  (text.match(/\[(\d{1,3}(?:\s*[,–—−-]\s*\d{1,3})*)\]/g) || []).forEach(b => expandNumbers(b.slice(1, -1)).forEach(n => nums.add(n)));
  return { nums, superscripts };
}

function sectionText(structure, keys) {
  return keys.map(k => structure.sections[k] ? structure.sections[k].paragraphs.join(' ') : '').join(' ').trim();
}

function parseTables(html) {
  return (html.match(/<table[\s\S]*?<\/table>/gi) || []).map(t =>
    (t.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || []).map(c => c.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim()));
}

async function imageEvidence(zip, docXml, relsXml) {
  const files = Object.keys(zip.files).filter(n => /^word\/media\//.test(n) && !zip.files[n].dir);
  const rels = {};
  (relsXml.match(/<Relationship\b[^>]*>/g) || []).forEach(r => {
    const id = (r.match(/Id="([^"]+)"/) || [])[1];
    const target = (r.match(/Target="([^"]+)"/) || [])[1];
    if (id && target) rels[id] = `word/${target.replace(/^\.?\//, '').replace(/^word\//, '')}`;
  });
  const placements = {};
  (docXml.match(/r:(?:embed|id)="([^"]+)"/g) || []).forEach(m => {
    const id = m.match(/"([^"]+)"/)[1];
    if (rels[id] && rels[id].includes('/media/')) placements[rels[id]] = (placements[rels[id]] || 0) + 1;
  });
  const images = [];
  for (const name of files) {
    const buf = await zip.file(name).async('nodebuffer');
    const head = buf.slice(0, Math.min(buf.length, 2 * 1024 * 1024)).toString('latin1');
    const software = (head.match(/(Adobe Photoshop[^\0<"]{0,24}|GIMP[ \d.]{0,8}|Paint\.NET[ \d.v]{0,8}|Affinity Photo|Pixelmator[^\0<"]{0,12})/i) || [])[0];
    const ai = (head.match(/(trainedAlgorithmicMedia|c2pa|DALL[·\-]?E|Midjourney|Stable Diffusion|Adobe Firefly|openai|Imagen)/i) || [])[0];
    images.push({ name: name.replace('word/media/', ''), bytes: buf.length, hash: md5(buf), placements: placements[name] || 0, software: software ? software.trim() : null, aiMarker: ai || null });
  }
  return images;
}

/**
 * @param ctx { zip, docXml, html, text, paragraphs, structure, meta, emails, corpus, referenceCorpus, contentHash, imageIndex }
 */
async function extractEvidence(ctx) {
  const { zip, docXml, html, text, paragraphs, structure, meta, emails } = ctx;
  const body = Object.entries(structure.sections).filter(([k]) => !['references', 'templateGuide'].includes(k)).map(([, s]) => s.paragraphs.join(' ')).join(' ') || text;

  // IA-04 similarity against published sources
  const mine = shingles(body);
  const matched = new Set();
  const sources = [];
  (ctx.referenceCorpus || []).forEach(doc => {
    const theirs = shingles(doc.text);
    let overlap = 0;
    mine.forEach(s => { if (theirs.has(s)) { overlap++; matched.add(s); } });
    if (overlap) sources.push({ source: doc.source, pct: round1(100 * overlap / Math.max(1, mine.size)) });
  });
  sources.sort((a, b) => b.pct - a.pct);
  const similarity = { overall: round1(100 * matched.size / Math.max(1, mine.size)), sources: sources.slice(0, 5), shingles: mine.size };

  // IA-04 duplicate submission against other ACS submissions (seeded demo records excluded)
  const duplicates = [];
  (ctx.corpus || []).filter(d => !d.seed).forEach(doc => {
    if (doc.contentHash && doc.contentHash === ctx.contentHash) { duplicates.push({ id: doc.id, source: doc.source, pct: 100, exact: true }); return; }
    const theirs = shingles(doc.text);
    if (!theirs.size || !mine.size) return;
    let overlap = 0;
    mine.forEach(s => { if (theirs.has(s)) overlap++; });
    const pct = round1(100 * overlap / Math.min(mine.size, theirs.size));
    if (pct >= 5) duplicates.push({ id: doc.id, source: doc.source, pct, exact: false });
  });
  duplicates.sort((a, b) => b.pct - a.pct);

  // IA-05 images
  const relsXml = zip.file('word/_rels/document.xml.rels') ? await zip.file('word/_rels/document.xml.rels').async('string') : '';
  const images = await imageEvidence(zip, docXml, relsXml);
  const captionRe = /^(figure|fig\.?|scheme)\s*\d+/i;
  const reuseDeclared = paragraphs.filter(p => captionRe.test(p) && /(reproduced|adapted|reprinted|modified) (with permission )?from|copyright \d{4}|©/i.test(p)).map(p => clip(p, 120));
  const imageReuse = [];
  (ctx.imageIndex || []).forEach(x => { if (images.some(i => i.hash === x.hash)) imageReuse.push({ mscId: x.mscId, image: images.find(i => i.hash === x.hash).name }); });

  // IA-06 references and citations
  const refs = parseReferences(structure);
  const authors = meta.authors || [];
  const retracted = [];
  const predatory = [];
  const venues = {};
  const selfCites = [];
  refs.forEach(r => {
    const f = fold(r.text);
    const dois = (r.text.match(/10\.\d{4,9}\/[^\s,;]+/g) || []).map(d => d.replace(/[.)]+$/, '').toLowerCase());
    const hit = L.RETRACTIONS.find(x => dois.includes(x.doi) || f.includes(x.title));
    if (hit) retracted.push({ n: r.n, ref: clip(r.text, 110), notice: hit.notice, type: hit.type });
    const pv = L.PREDATORY_VENUES.find(v => f.includes(fold(v)));
    if (pv) predatory.push({ n: r.n, venue: pv });
    const venue = L.VENUES.find(([, re]) => re.test(r.text));
    if (venue) venues[venue[0]] = (venues[venue[0]] || 0) + 1;
    const self = authors.filter(a => a.includes(' ') && refHasPerson(r.text, a));
    if (self.length) selfCites.push({ n: r.n, authors: self.slice(0, 3) });
  });
  const { nums, superscripts } = citedNumbers(docXml, sectionText(structure, Object.keys(structure.sections).filter(k => k !== 'references')));
  const refCount = refs.length;
  const citedInRange = [...nums].filter(n => n >= 1 && n <= refCount);
  const missingRefs = [...nums].filter(n => n > refCount && refCount > 0 && n <= refCount + 40).sort((a, b) => a - b);
  const uncited = refCount ? refs.map(r => r.n).filter(n => !nums.has(n)) : [];

  // IA-07 data availability & numbers in text vs tables
  const dataText = sectionText(structure, ['data']);
  const dataType = !dataText ? 'none'
    : /(repositor|zenodo|figshare|dryad|ccdc|deposited|github|osf\.io|\bpdb\b|chemrxiv|doi\s*:|10\.\d{4,9}\/)/i.test(dataText) ? 'repository'
      : /(upon|on) (reasonable )?request|from the (corresponding )?authors?/i.test(dataText) ? 'request'
        : /(supporting information|supplementary|\bSI\b)/i.test(dataText) ? 'si' : 'other';
  const tables = parseTables(html);
  const tableNumberMismatches = [];
  let tableNumbersCompared = 0;
  paragraphs.forEach(p => {
    if (/^table\s*\d+/i.test(p)) return;
    const refsTo = [...p.matchAll(/\btables?\s*(\d+)/gi)].map(m => +m[1]).filter(n => tables[n - 1]);
    if (!refsTo.length) return;
    const cells = refsTo.flatMap(n => tables[n - 1]).join(' ');
    const cellNums = new Set((cells.match(/\d+(?:\.\d+)?/g) || []).map(Number));
    [...p.matchAll(/(\d+(?:\.\d+)?)\s?%/g)].forEach(m => {
      tableNumbersCompared++;
      if (!cellNums.has(Number(m[1]))) tableNumberMismatches.push({ table: refsTo[0], value: `${m[1]}%`, sentence: clip(p.slice(Math.max(0, m.index - 70), m.index + 40), 120) });
    });
  });

  // IA-08 AI content signals
  const lower = fold(text);
  const chatbot = L.CHATBOT_PHRASES.filter(ph => lower.includes(ph));
  const tortured = Object.entries(L.TORTURED_PHRASES).filter(([ph]) => lower.includes(ph)).map(([phrase, expected]) => ({ phrase, expected }));
  const bodyWords = Math.max(1, (body.match(/[A-Za-z]+/g) || []).length);
  const styleHits = {};
  L.AI_STYLE_TERMS.forEach(t => { const n = (fold(body).match(new RegExp(`\\b${escapeRe(t)}\\b`, 'g')) || []).length; if (n) styleHits[t] = n; });
  const styleCount = Object.values(styleHits).reduce((s, n) => s + n, 0);
  const styleRate = round1(1000 * styleCount / bodyWords);
  const aiScore = Math.min(100, Math.round(styleRate * 18));
  const disclosed = paragraphs.some(p => /\b(chatgpt|gpt-?[345o]|large language model|generative (ai|artificial intelligence)|ai[- ]assisted|ai[- ]based (writing|language) tool|copilot)\b/i.test(p) && /\b(used|use|using|assist|declare|disclos|edit|polish)/i.test(p));

  // IA-09 identity & affiliation
  const frontAffils = structure.front.filter(p => /^[\d†‡§¶*#,\s]{1,6}\S/.test(p) && p.includes(',') && p.length > 25 && !/@/.test(p) && words(p) > 4 && !authors.some(a => p.includes(a)));
  const affiliations = [...new Set([...(meta.affiliations || []), ...frontAffils].map(a => a.replace(/^[\d†‡§¶*#,\s]+/, '').trim()))].slice(0, 12);
  const orcids = (meta.orcids || []).map(id => ({ id, valid: ctx.validOrcid(id) }));
  const phones = [...new Set((text.match(/(?:tel(?:ephone)?|phone|ph\.)\s*[:.]?\s*(\+?\d[\d\s().-]{7,}\d)/gi) || []).map(s => s.replace(/^[^+\d]+/, '').replace(/[^\d+]/g, '')))];

  // Reviewer suggestions / oppositions declared in the MSC
  const listAfter = re => {
    const out = [];
    paragraphs.forEach((p, i) => {
      const m = p.match(re);
      if (!m) return;
      const rest = m[1] && m[1].trim() ? [m[1]] : paragraphs.slice(i + 1, i + 4).filter(x => x.length < 200 && !re.test(x));
      rest.join('; ').split(/;|\n/).map(s => s.trim()).filter(Boolean).forEach(s => {
        const email = (s.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/) || [])[0];
        const name = s.replace(/[(<]?[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}[)>]?/, '').replace(/[,(]\s*$/, '').split(/,\s*(?=[A-Z][a-z]+ (University|Institute))/)[0].trim().replace(/[,.]$/, '');
        if (name.length > 3) out.push({ name: clip(name, 60), email: email ? email.toLowerCase() : null });
      });
    });
    return out.slice(0, 8);
  };
  const SUGGESTED_RE = /^(?:suggested|preferred|recommended|potential) reviewers?\s*[:.]?\s*(.*)$/i;
  const OPPOSED_RE = /^(?:opposed|excluded|non-preferred|reviewers to exclude) reviewers?\s*[:.]?\s*(.*)$/i;
  const suggestedReviewers = listAfter(SUGGESTED_RE);
  const opposedReviewers = listAfter(OPPOSED_RE);
  // Author e-mails: those on the title page, not the ones given for suggested / opposed reviewers.
  const emailRe = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  const authorEmails = [...new Set(structure.front.filter(p => !SUGGESTED_RE.test(p) && !OPPOSED_RE.test(p)).flatMap(p => (p.match(emailRe) || []).map(e => e.toLowerCase()))
    .concat(meta.correspondingEmail ? [meta.correspondingEmail] : []))];

  // Funders (IA-11)
  const ack = sectionText(structure, ['acknowledgments']) || '';
  const funders = [...new Set((ack.match(/(?:supported|funded|financed|sponsored) by ([^.;]{4,140})|(?:funding|grant|support) from ([^.;]{4,140})/gi) || [])
    .map(s => s.replace(/^.*?(by|from)\s+/i, '').replace(/\s*\(.*$/, '').trim()))].slice(0, 8);

  return {
    version: 1,
    articleType: structure.articleType || 'Article',
    similarity,
    duplicates: duplicates.slice(0, 5),
    images: images.slice(0, 40),
    imageReuse,
    reuseDeclared: reuseDeclared.slice(0, 5),
    references: { count: refCount, authorsText: refs.map(r => ({ n: r.n, text: clip(r.text, 170) })).slice(0, 120), retracted, predatory, venues, selfCites },
    citations: { detected: nums.size, superscripts, inRange: citedInRange.length, missing: missingRefs.slice(0, 10), uncited: uncited.slice(0, 40), uncitedCount: uncited.length },
    data: { statement: dataText ? clip(dataText, 220) : null, type: dataType, hasSI: !!structure.sections.si, tablesCompared: tableNumbersCompared, tableMismatches: tableNumberMismatches.slice(0, 6), tables: tables.length },
    ai: { chatbot, tortured, styleRate, styleHits, aiScore, disclosed },
    identity: { authors, affiliations, emails: authorEmails.length ? authorEmails : (emails || []), correspondingEmail: meta.correspondingEmail || '', correspondingAuthor: meta.correspondingAuthor || '', orcids, phones },
    suggestedReviewers,
    opposedReviewers,
    funders
  };
}

function words(s) { return (String(s).match(/[A-Za-z]+/g) || []).length; }

// ---------- evaluation ----------

function result(def, status, finding, evidence, extra) {
  const points = SEVERITY_POINTS[def.severity];
  const penalty = status === 'fail' ? points : status === 'flag' ? points / 2 : 0;
  return {
    id: def.id, clause: def.clause, area: AREAS[def.clause], check: def.check, feasibility: def.feasibility, severity: def.severity,
    tool: def.tool, status, finding, evidence: (evidence || []).filter(Boolean), penalty: Math.round(penalty * 1000) / 1000, maxPenalty: points, ...(extra || {})
  };
}

function personList(list) {
  return list.map(p => p.name + (p.affiliation ? ` (${p.affiliation})` : '')).join('; ');
}

const EVALUATORS = {
  'I-01': (d, ev) => {
    const s = ev.similarity || { overall: 0, sources: [] };
    const top = s.sources[0];
    const evd = [`Overall similarity ${s.overall}% (threshold 25%) across ${s.shingles || 0} 8-word passages, references excluded`,
      top ? `Highest single source ${top.pct}% (threshold 10%): ${top.source}` : 'No matching source in the similarity index',
      ...s.sources.slice(1, 3).map(x => `Also matched: ${x.source} (${x.pct}%)`)];
    if (s.overall > 25) return result(d, 'fail', `Similarity ${s.overall}% exceeds the 25% overall threshold.`, evd, { remediation: 'Rewrite the overlapping passages in your own words and cite the original sources; quote any verbatim reuse.' });
    if (top && top.pct > 10) return result(d, 'fail', `${top.pct}% of the text matches a single source (over 10%).`, evd, { remediation: 'Paraphrase and cite the matched source; verbatim reuse must be quoted.' });
    return result(d, 'pass', `Similarity ${s.overall}% overall${top ? `, ${top.pct}% highest single source` : ''}: within thresholds.`, evd);
  },
  'I-02': (d, ev) => {
    const dup = ev.duplicates || [];
    const top = dup[0];
    const evd = [dup.length ? `Compared with other ACS submissions in the platform; top overlap ${top.pct}% with ${top.source}` : 'Compared with all other ACS submissions in the platform: no overlap above 5%',
      ...dup.filter(x => x.exact).map(x => `Identical file already submitted as ${x.id}`), 'Seeded demo records are excluded from the duplicate-submission index'];
    if (top && (top.exact || top.pct >= 40)) return result(d, 'fail', `Duplicate submission: ${top.exact ? 'the same file' : `${top.pct}% of the text`} matches ${top.id}.`, evd, { remediation: 'Withdraw the duplicate or explain the relationship between the two submissions to the editor.' });
    if (top && top.pct >= 15) return result(d, 'flag', `Partial overlap (${top.pct}%) with ${top.id}; check for redundant publication.`, evd, { remediation: 'Explain the overlap with your related submission in the cover letter.' });
    return result(d, 'pass', 'No substantial overlap with other ACS submissions.', evd);
  },
  'I-03': (d, ev) => {
    const imgs = ev.images || [];
    const byHash = {};
    imgs.forEach(i => { (byHash[i.hash] = byHash[i.hash] || []).push(i.name); });
    const dupFiles = Object.values(byHash).filter(x => x.length > 1);
    const reused = imgs.filter(i => i.placements > 1);
    const evd = [`${imgs.length} embedded image file(s) hashed and compared pair-wise`,
      ...dupFiles.map(x => `Identical image content in ${x.join(' and ')}`),
      ...reused.map(i => `${i.name} is placed ${i.placements} times in the document`),
      'Supporting Information is not part of the upload; SI panels are screened when the SI file is attached'];
    if (dupFiles.length || reused.length) return result(d, 'fail', `${dupFiles.length + reused.length} duplicated figure panel(s) found.`, evd, { remediation: 'Replace duplicated panels with the correct images, or state clearly where the same image is intentionally shown twice (e.g. a shared control).' });
    return result(d, 'pass', imgs.length ? `No duplicated panels among ${imgs.length} image(s).` : 'No embedded images to compare.', evd);
  },
  'I-04': (d, ev) => {
    const reuse = ev.imageReuse || [];
    const decl = ev.reuseDeclared || [];
    const evd = [`${(ev.images || []).length} image(s) compared with the figure index of other ACS submissions`,
      ...reuse.map(r => `${r.image} is identical to a figure in ${r.mscId}`),
      ...decl.map(c => `Reuse declared in caption: "${c}"`),
      'Comparison with the published-figure database (Proofig / ImageTwin) is simulated in this prototype'];
    if (reuse.length) return result(d, 'fail', `${reuse.length} figure(s) match images from other papers.`, evd, { remediation: 'Remove reused figures or cite the source and provide reuse permission.' });
    if (decl.length) return result(d, 'pass', `Figure reuse is declared and attributed in ${decl.length} caption(s); permission to be confirmed by the editor.`, evd);
    return result(d, 'pass', 'No figure reuse from other papers detected.', evd);
  },
  'I-05': (d, ev) => {
    const imgs = ev.images || [];
    const edited = imgs.filter(i => i.software);
    const evd = [`${imgs.length} image(s) screened for editing-software traces`,
      ...edited.map(i => `${i.name}: saved with ${i.software}`),
      'Region-level splicing / clone / erasure detection (error-level and noise analysis) is simulated: no regions returned'];
    if (edited.length) return result(d, 'flag', `${edited.length} image(s) were processed in image-editing software; inspect for splicing or erased regions.`, evd, { remediation: 'Provide the unprocessed original images and describe any adjustments in the figure legend.' });
    return result(d, 'pass', imgs.length ? 'No manipulation indicators in the image metadata.' : 'No embedded images to screen.', evd);
  },
  'I-06': (d, ev) => {
    const imgs = ev.images || [];
    const ai = imgs.filter(i => i.aiMarker);
    const evd = [`${imgs.length} image(s) checked for C2PA / generative-AI provenance markers`, ...ai.map(i => `${i.name}: marker "${i.aiMarker}"`)];
    if (ai.length) return result(d, 'fail', `${ai.length} image(s) carry generative-AI provenance markers.`, evd, { remediation: 'Replace AI-generated images with the original data, or disclose AI use where the journal policy allows it.' });
    return result(d, 'pass', imgs.length ? 'No AI-generation or fabrication markers found.' : 'No embedded images to screen.', evd);
  },
  'I-07': (d, ev) => {
    const r = ev.references || { count: 0, retracted: [] };
    const evd = [`${r.count} reference(s) checked against the retraction / expression-of-concern list`, ...r.retracted.map(x => `Ref ${x.n}: ${x.notice} — ${x.ref}`)];
    if (r.retracted.length) return result(d, 'fail', `${r.retracted.length} cited work(s) are retracted or under an expression of concern.`, evd, { remediation: 'Remove or replace retracted references, or acknowledge the retraction status where the citation is intentional.' });
    return result(d, 'pass', r.count ? `None of the ${r.count} references is retracted or under an expression of concern.` : 'No reference list found to check.', evd);
  },
  'I-08': (d, ev) => {
    const r = ev.references || { count: 0, selfCites: [], venues: {}, predatory: [] };
    const n = Math.max(1, r.count);
    const selfPct = Math.round(100 * r.selfCites.length / n);
    const [topVenue, topCount] = Object.entries(r.venues || {}).sort((a, b) => b[1] - a[1])[0] || ['—', 0];
    const venuePct = Math.round(100 * topCount / n);
    const evd = [`Self-citation: ${r.selfCites.length} of ${r.count} references (${selfPct}%; flagged above 25%)${r.selfCites.length ? ` — e.g. ref ${r.selfCites.slice(0, 4).map(s => `${s.n} (${s.authors[0]})`).join(', ')}` : ''}`,
      `Most-cited venue: ${topVenue} with ${topCount} reference(s) (${venuePct}%; flagged above 40%)`,
      `Predatory / hijacked venue watch-list: ${r.predatory.length ? r.predatory.map(p => `ref ${p.n} in ${p.venue}`).join('; ') : 'no matches'}`];
    if (r.predatory.length || selfPct > 50) return result(d, 'fail', r.predatory.length ? `${r.predatory.length} reference(s) to watch-listed predatory journals.` : `Excessive self-citation (${selfPct}%).`, evd, { remediation: 'Replace citations of predatory venues and limit self-citation to directly relevant work.' });
    if (r.count >= 8 && (selfPct > 25 || venuePct > 40)) return result(d, 'flag', selfPct > 25 ? `High self-citation share (${selfPct}%).` : `Possible citation stacking: ${venuePct}% of references are to ${topVenue}.`, evd, { remediation: 'Check that each self-citation or same-venue citation is necessary.' });
    return result(d, 'pass', r.count ? `Self-citation ${selfPct}%, top venue ${venuePct}%, no predatory venues.` : 'No reference list found to check.', evd);
  },
  'I-09': (d, ev) => {
    const c = ev.citations || { detected: 0, missing: [], uncitedCount: 0 };
    const count = (ev.references || {}).count || 0;
    const evd = [`${c.detected} citation marker(s) found in the text (${c.superscripts || 0} superscript runs), ${count} references`,
      c.missing.length ? `Citations to references that do not exist: ${c.missing.join(', ')}` : 'Every citation number points to a reference',
      c.detected ? `${c.uncitedCount} reference(s) never cited in the text${c.uncitedCount ? ` (e.g. ${c.uncited.slice(0, 8).join(', ')})` : ''}` : 'Citation markers not machine-readable; linkage could not be checked',
      'Semantic support (does the cited source back the claim?) needs the LLM entailment service and is reported as a signal only'];
    if (c.missing.length) return result(d, 'flag', `${c.missing.length} citation(s) point to references that are not in the list.`, evd, { remediation: 'Correct the citation numbering so every citation has a matching reference.' });
    if (c.detected >= 3 && count && c.uncitedCount / count > 0.3) return result(d, 'flag', `${c.uncitedCount} of ${count} references are never cited in the text.`, evd, { remediation: 'Cite every reference at the claim it supports, or remove unused references.' });
    return result(d, 'pass', c.detected ? 'Citations link to existing references.' : 'No machine-readable citations; nothing contradicts the reference list.', evd);
  },
  'I-10': (d, ev) => {
    const x = ev.data || { type: 'none', tableMismatches: [] };
    const label = { repository: 'deposited in a repository', si: 'provided in the Supporting Information', request: '"available on request" only', other: 'present but unclear', none: 'missing' }[x.type];
    const evd = [`Data availability statement: ${label}${x.statement ? ` — "${x.statement}"` : ''}`,
      `${x.tablesCompared} percentage value(s) quoted with a table reference were cross-checked against ${x.tables} table(s)`,
      ...x.tableMismatches.map(m => `Table ${m.table}: ${m.value} in the text is not in the table — "${m.sentence}"`)];
    const mism = x.tableMismatches.length;
    if (x.type === 'none' && !x.hasSI) return result(d, 'fail', 'No data availability statement and no Supporting Information.', evd, { remediation: 'Add a Data Availability statement that names the repository or the SI file holding the data.' });
    if (mism >= 2) return result(d, 'fail', `${mism} values in the text do not match the tables.`, evd, { remediation: 'Make the values quoted in the text identical to those in the tables and SI.' });
    if (x.type === 'none' || x.type === 'request' || mism) return result(d, 'flag', mism ? `A value in the text does not match the table it cites.` : x.type === 'request' ? '"Available on request" does not meet the data policy.' : 'No data availability statement (data presumably in the SI).', evd, { remediation: 'State where the data are deposited (repository or SI) and align the numbers in the text with the tables.' });
    return result(d, 'pass', `Data ${label}; ${x.tablesCompared ? 'quoted values match the tables' : 'no table values quoted in the text'}.`, evd);
  },
  'I-11': (d, ev) => {
    const a = ev.ai || { chatbot: [], tortured: [], styleRate: 0, aiScore: 0 };
    const top = Object.entries(a.styleHits || {}).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([t, n]) => `${t} ×${n}`).join(', ');
    const evd = [a.chatbot.length ? `Chatbot artefacts: ${a.chatbot.map(p => `"${p}"`).join(', ')}` : 'No leftover chatbot text',
      a.tortured.length ? `Tortured phrases: ${a.tortured.map(t => `"${t.phrase}" (for "${t.expected}")`).join(', ')}` : 'No tortured phrases',
      `AI-text indicator ${a.aiScore}/100 (${a.styleRate} AI-style terms per 1,000 words${top ? `: ${top}` : ''})`,
      `AI-use disclosure: ${a.disclosed ? 'present' : 'none found'}`];
    if (a.chatbot.length || a.tortured.length >= 3) return result(d, 'fail', a.chatbot.length ? 'Leftover chatbot text found in the manuscript.' : `${a.tortured.length} tortured phrases found.`, evd, { remediation: 'Remove the generated text, use standard terminology and disclose any AI assistance.' });
    if (a.tortured.length || (a.aiScore >= 60 && !a.disclosed)) return result(d, 'flag', a.tortured.length ? `Tortured phrase(s) found: ${a.tortured.map(t => t.phrase).join(', ')}.` : `High AI-text indicator (${a.aiScore}/100) without an AI-use disclosure.`, evd, { remediation: 'Use the standard scientific terms and add an AI-use disclosure if AI tools were used.' });
    return result(d, 'pass', `No chatbot text or tortured phrases; AI-text indicator ${a.aiScore}/100.`, evd);
  },
  'I-12': (d, ev) => {
    const id = ev.identity || { emails: [], affiliations: [], orcids: [] };
    const invalid = id.orcids.filter(o => !o.valid);
    const free = id.emails.filter(e => L.FREE_MAIL.includes(domainOf(e)));
    const checks = id.emails.filter(e => !L.FREE_MAIL.includes(domainOf(e))).map(e => ({ e, m: domainMatchesAffiliation(domainOf(e), id.affiliations) }));
    const unmatched = checks.filter(c => !c.m.ok);
    const evd = [
      id.orcids.length ? `ORCID iD(s): ${id.orcids.map(o => `${o.id} ${o.valid ? '✓ checksum valid' : '✗ invalid checksum'}`).join('; ')} (name lookup via ORCID API simulated)` : 'No ORCID iD in the MSC (collected in the submission form)',
      `${id.affiliations.length} affiliation(s) detected${id.affiliations.length ? `: ${id.affiliations.slice(0, 3).map(a => clip(a, 70)).join(' | ')}` : ''}`,
      ...checks.map(c => `${c.e}: ${c.m.ok ? `matches affiliation (${c.m.via})` : 'domain not linked to any listed institution'}`),
      ...free.map(e => `${e}: free-mail address — identity cannot be tied to an institution`)];
    if (invalid.length) return result(d, 'fail', `${invalid.length} ORCID iD(s) fail checksum validation.`, evd, { remediation: 'Copy each ORCID iD exactly from orcid.org.' });
    if (!id.emails.length) return result(d, 'flag', id.affiliations.length ? 'No author e-mail in the MSC to tie the authors to their stated institutions.' : 'No author e-mail or affiliation found to verify identity.', evd, { remediation: 'Add the corresponding author\'s institutional e-mail address and full affiliations.' });
    if (free.length || unmatched.length) return result(d, 'flag', free.length ? `Corresponding identity uses free-mail (${free.map(domainOf).join(', ')}).` : `${unmatched.length} e-mail domain(s) do not match the stated affiliations.`, evd, { remediation: 'Use an institutional e-mail address that matches the affiliation, and register ORCID iDs.' });
    return result(d, 'pass', `${checks.length} author e-mail domain(s) match the stated institutions${id.orcids.length ? '; ORCID iDs valid' : ''}.`, evd);
  },
  'I-13': (d, ev, env) => {
    const id = ev.identity || { authors: [], emails: [] };
    const findings = [];
    const seen = {};
    id.authors.forEach(a => { const k = fold(a).replace(/[^a-z]/g, ''); if (seen[k]) findings.push(`Author "${a}" is listed twice`); seen[k] = 1; });
    const accounts = env.accounts || [];
    const corr = id.correspondingAuthor || id.authors[0] || '';
    id.emails.forEach(e => {
      const acc = accounts.find(x => x.email && x.email.toLowerCase() === e && corr && !samePerson(x.name, corr) && !id.authors.some(a => samePerson(a, x.name)));
      if (acc) findings.push(`${e} is registered to another account: ${acc.name} (${acc.role})`);
    });
    if (corr) {
      const p = personName(corr);
      accounts.filter(x => x.email && id.correspondingEmail && x.email.toLowerCase() !== id.correspondingEmail && x.role === 'Author').forEach(x => {
        const q = personName(x.name);
        if (p && q && p.last === q.last && levenshtein(p.full, q.full) <= 2 && !findings.some(f => f.includes(x.email))) findings.push(`Near-duplicate account: "${x.name}" <${x.email}> resembles the corresponding author "${corr}" <${id.correspondingEmail}>`);
      });
    }
    const evd = [`${id.authors.length} author(s) compared with ${accounts.length} platform account(s) (authors, reviewers, editors)`, ...findings.slice(0, 6)];
    if (findings.length) return result(d, 'flag', `${findings.length} duplicate or suspicious account signal(s).`, evd, { remediation: 'Merge duplicate accounts and list each author once.' });
    return result(d, 'pass', 'No duplicate or suspicious accounts.', evd);
  },
  'I-14': (d, ev, env) => {
    const affText = fold((ev.identity || {}).affiliations.join(' ; '));
    const people = [];
    if (env.editor) people.push({ ...env.editor, role: env.editorMode === 'assigned' ? 'Handling editor' : 'Handling editor (proposed)', counts: env.editorMode === 'assigned' });
    (env.reviewers || []).forEach(r => people.push({ ...r, role: env.reviewerMode === 'assigned' ? 'Assigned reviewer' : 'Candidate reviewer', counts: env.reviewerMode === 'assigned' }));
    const hits = people.filter(p => p.affiliation && institutionsOf(p.affiliation).concat([p.affiliation]).some(inst => fold(inst).length > 5 && affText.includes(fold(inst))));
    const blocking = hits.filter(h => h.counts);
    const evd = [`Author affiliations compared with ${env.editor ? '1 editor' : 'no editor'} and ${(env.reviewers || []).length} ${env.reviewerMode === 'assigned' ? 'assigned' : 'candidate'} reviewer(s)`,
      ...hits.map(h => `${h.role} ${h.name} — ${h.affiliation} — appears in the author affiliations`),
      env.reviewerMode !== 'assigned' ? 'Re-screened when a reviewer is assigned' : null];
    if (blocking.length) return result(d, 'fail', `${blocking.map(b => b.name).join(', ')} share${blocking.length === 1 ? 's' : ''} an affiliation with the authors.`, evd, { remediation: 'Reassign the MSC to an editor / reviewer without a shared affiliation.' });
    return result(d, 'pass', hits.length ? `No conflict for the assigned editor/reviewer; ${hits.map(h => h.name).join(', ')} share an affiliation and will not be assigned.` : 'No shared affiliation with the editor or reviewers.', evd);
  },
  'I-15': (d, ev, env) => {
    const refs = (ev.references || {}).authorsText || [];
    const authors = (ev.identity || {}).authors.filter(a => a.includes(' '));
    const people = [];
    if (env.editor) people.push({ ...env.editor, role: env.editorMode === 'assigned' ? 'Handling editor' : 'Handling editor (proposed)', counts: env.editorMode === 'assigned' });
    (env.reviewers || []).forEach(r => people.push({ ...r, role: env.reviewerMode === 'assigned' ? 'Assigned reviewer' : 'Candidate reviewer', counts: env.reviewerMode === 'assigned' }));
    const hits = [];
    people.forEach(p => {
      const direct = authors.find(a => samePerson(a, p.name));
      if (direct) { hits.push({ p, text: `${p.role} ${p.name} is an author of this MSC` , hard: true }); return; }
      const shared = refs.filter(r => refHasPerson(r.text, p.name) && authors.some(a => refHasPerson(r.text, a)));
      if (shared.length) hits.push({ p, text: `${p.role} ${p.name} co-authored ref ${shared.slice(0, 3).map(s => s.n).join(', ')} with the authors — "${clip(shared[0].text, 90)}"` });
    });
    const blocking = hits.filter(h => h.p.counts);
    const evd = [`Co-author sets from ${refs.length} references compared with ${people.length} editor/reviewer name(s)`, ...hits.map(h => h.text), 'Name-based match; confirm with ORCID / OpenAlex author IDs'];
    if (blocking.some(h => h.hard)) return result(d, 'fail', 'An editor or reviewer is an author of this MSC.', evd, { remediation: 'Reassign the MSC.' });
    if (blocking.length) return result(d, 'flag', `Possible recent co-authorship with ${blocking.map(h => h.p.name).join(', ')}.`, evd, { remediation: 'Confirm the co-authorship date; reassign if it is within the conflict window.' });
    return result(d, 'pass', hits.length ? `No co-authorship with the assigned editor/reviewer; ${hits.length} candidate(s) to exclude.` : 'No co-authorship found between authors and the editor or reviewers.', evd);
  },
  'I-16': (d, ev, env) => {
    const opposed = (ev.opposedReviewers || []).concat(env.opposed || []);
    const authors = (ev.identity || {}).authors || [];
    const affText = fold(((ev.identity || {}).affiliations || []).join(' ; '));
    const conflicts = [];
    (env.reviewers || []).forEach(r => {
      const opp = opposed.find(o => samePerson(o.name, r.name) || (o.email && r.email && o.email === r.email));
      if (opp) conflicts.push({ r, why: 'opposed by the authors' });
      (r.declaredConflicts || []).forEach(c => {
        if (affText.includes(fold(c)) || authors.some(a => samePerson(a, c))) conflicts.push({ r, why: `declared conflict with ${c}` });
      });
    });
    const assigned = env.reviewerMode === 'assigned';
    const evd = [`Opposed reviewers named by the authors: ${opposed.length ? opposed.map(o => o.name).join('; ') : 'none'}`,
      `${(env.reviewers || []).length} ${assigned ? 'assigned' : 'candidate'} reviewer(s) checked for opposition and declared conflicts`,
      ...conflicts.map(c => `${c.r.name}: ${c.why}`)];
    if (assigned && conflicts.length) return result(d, 'fail', `${conflicts[0].r.name} is assigned but ${conflicts[0].why}.`, evd, { remediation: 'Withdraw the invitation and assign another reviewer.' });
    return result(d, 'pass', conflicts.length ? `${conflicts.length} candidate reviewer(s) excluded from assignment (${conflicts.map(c => c.r.name).join(', ')}).` : 'No opposed or conflicted reviewer is assigned.', evd);
  },
  'I-17': (d, ev) => {
    const id = ev.identity || { authors: [], affiliations: [] };
    const names = [...id.authors, ...id.affiliations, ...(ev.funders || [])];
    const hits = [];
    L.SANCTIONS.forEach(s => {
      const key = fold(s.name);
      const hit = names.find(n => fold(n).includes(key) || levenshtein(fold(n).slice(0, key.length + 3), key) <= 3);
      if (hit) hits.push(`${clip(hit, 70)} ≈ ${s.name} (${s.list})`);
    });
    const evd = [`Screened ${id.authors.length} author(s), ${id.affiliations.length} institution(s) and ${(ev.funders || []).length} funder(s)${(ev.funders || []).length ? ` (${ev.funders.slice(0, 3).map(f => clip(f, 50)).join('; ')})` : ''}`,
      ...hits, 'Demo restricted-party list stands in for OFAC SDN / EU / UN / UK / BIS feeds; matches are routed to compliance for resolution'];
    if (hits.length) return result(d, 'fail', `${hits.length} possible restricted-party match(es); route to compliance.`, evd, { remediation: 'Compliance must resolve the match before the MSC can proceed.' });
    return result(d, 'pass', 'No authors, institutions or funders match the sanctions lists.', evd);
  },
  'I-18': (d, ev, env) => {
    const id = ev.identity || { emails: [], authors: [], phones: [] };
    const hits = [];
    const authorNames = id.authors;
    (ev.suggestedReviewers || []).forEach(s => {
      if (s.email && id.emails.includes(s.email)) hits.push(`Suggested reviewer ${s.name} uses ${s.email}, an author e-mail address`);
    });
    (env.accounts || []).forEach(acc => {
      if (!acc.email) return;
      const e = acc.email.toLowerCase();
      if (id.emails.includes(e) && !authorNames.some(a => samePerson(a, acc.name)) && !samePerson(acc.name, id.correspondingAuthor || '')) hits.push(`${e} is also used by ${acc.name} (${acc.role})`);
      if (acc.phone && id.phones.includes(acc.phone)) hits.push(`Phone ${acc.phone} is also used by ${acc.name} (${acc.role})`);
    });
    (env.reviewers || []).filter(() => env.reviewerMode === 'assigned').forEach(r => {
      if (r.email && id.emails.includes(r.email.toLowerCase())) hits.push(`Assigned reviewer ${r.name} uses author e-mail ${r.email}`);
    });
    const uniq = [...new Set(hits)];
    const evd = [`${id.emails.length} e-mail(s) and ${id.phones.length} phone number(s) from the MSC compared across authors, suggested reviewers and ${(env.accounts || []).length} platform account(s)`, ...uniq.slice(0, 6)];
    if (uniq.length) return result(d, 'fail', `${uniq.length} contact detail(s) shared by different people.`, evd, { remediation: 'Each author and reviewer must use their own contact details.' });
    return result(d, 'pass', 'No e-mail, phone or address shared by different people.', evd);
  },
  'I-19': (d, ev, env) => {
    const list = [];
    (ev.suggestedReviewers || []).forEach(s => s.email && list.push({ who: `Suggested reviewer ${s.name}`, email: s.email }));
    if (env.reviewerMode === 'assigned') (env.reviewers || []).forEach(r => r.email && list.push({ who: `Assigned reviewer ${r.name}`, email: r.email }));
    const bad = [];
    const soft = [];
    list.forEach(x => {
      const dom = domainOf(x.email);
      if (L.DISPOSABLE_MAIL.includes(dom)) bad.push(`${x.who}: disposable domain ${dom}`);
      else if (L.FREE_MAIL.includes(dom)) soft.push(`${x.who}: free-mail domain ${dom}`);
      else {
        const base = baseDomain(dom);
        const look = L.INSTITUTION_DOMAINS.find(inst => inst !== base && levenshtein(inst, base) <= 2 && base.length > 5);
        if (look) bad.push(`${x.who}: ${dom} looks like ${look}`);
      }
    });
    const evd = [list.length ? `${list.length} reviewer e-mail(s) checked: ${list.map(x => x.email).join(', ')}` : 'No reviewer e-mails to check yet (no suggested or assigned reviewer)', ...bad, ...soft];
    if (bad.length) return result(d, 'fail', `${bad.length} disposable or look-alike reviewer e-mail domain(s).`, evd, { remediation: 'Replace the reviewer contact with a verified institutional address.' });
    if (soft.length) return result(d, 'flag', `${soft.length} reviewer e-mail(s) use free-mail.`, evd, { remediation: 'Verify the reviewer identity through an institutional address or ORCID.' });
    return result(d, 'pass', list.length ? 'Reviewer e-mail domains are institutional.' : 'No reviewer e-mail domains to check yet.', evd);
  },
  'I-20': (d, ev, env) => {
    const t = env.telemetry || {};
    const author = t.author;
    const revs = Object.entries(t.reviewers || {});
    const hits = [];
    if (author) {
      revs.forEach(([rid, r]) => {
        const name = ((env.allReviewers || []).find(x => x.id === rid) || {}).name || rid;
        if (r.device && r.device === author.device) hits.push(`Reviewer ${name} acted from the same device as the author upload (${author.device.slice(0, 8)}…)`);
        else if (r.ipHash && r.ipHash === author.ipHash) hits.push(`Reviewer ${name} acted from the same IP address as the author upload (${author.ip})`);
      });
    }
    const evd = [author ? `Author upload logged from IP ${author.ip}, device ${String(author.device).slice(0, 8)}…` : 'No author telemetry logged for this MSC',
      revs.length ? `${revs.length} reviewer session(s) logged` : 'No reviewer activity logged yet', ...hits];
    if (hits.length) return result(d, 'flag', hits.length === 1 ? hits[0].replace(/ \(.*\)$/, '') + '.' : `${hits.length} reviewer sessions share the author's IP or device.`, evd, { remediation: 'Confirm the reviewer is independent of the authors before relying on the review.' });
    return result(d, 'pass', revs.length ? 'Author and reviewer used different IP addresses and devices.' : 'No shared IP or device (no reviewer activity yet).', evd);
  },
  'I-21': (d, ev, env) => {
    const tm = env.timing || {};
    const hits = [];
    let hard = false;
    const minHours = (ev.articleType === 'Communication' ? 1 : 2);
    if (tm.completedAt && (tm.reviewStartAt || tm.acceptedAt)) {
      const start = new Date(tm.reviewStartAt || tm.acceptedAt).getTime();
      const hrs = (new Date(tm.completedAt).getTime() - start) / 36e5;
      if (hrs < minHours) { hits.push(`Review completed ${hrs < 1 ? `${Math.max(1, Math.round(hrs * 60))} min` : `${round1(hrs)} h`} after it started (minimum plausible ${minHours} h for an ${ev.articleType})`); if (hrs < 0.25) hard = true; }
    }
    const subs = (env.ownerSubmissions || []).map(s => new Date(s).getTime()).sort((a, b) => a - b);
    let burst = 0;
    subs.forEach((t0, i) => { const n = subs.filter(t => t >= t0 && t - t0 <= 24 * 36e5).length; if (n > burst) burst = n; void i; });
    if (burst >= 5) hits.push(`${burst} submissions from the same account within 24 h`);
    const evd = [tm.completedAt ? `Review: started ${tm.reviewStartAt ? new Date(tm.reviewStartAt).toISOString().slice(0, 16).replace('T', ' ') : '—'}, decision ${new Date(tm.completedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC` : 'Review not completed yet; timing checked when the decision is recorded',
      env.ownerSeed ? 'Submission rate: seeded demo account, not evaluated' : `Submission rate: at most ${Math.max(1, burst)} submission(s) in any 24 h from this account (flagged at 5)`, ...hits];
    if (hits.length) return result(d, hard ? 'fail' : 'flag', hits[0] + '.', evd, { remediation: 'Check that the review is substantive and that the submissions are not coordinated.' });
    return result(d, 'pass', 'Review timing and submission rate are plausible.', evd);
  }
};

/**
 * @param {object} ev   evidence from extractEvidence
 * @param {object} env  { editor, editorMode, reviewers, reviewerMode, allReviewers, opposed, accounts, telemetry, timing, ownerSubmissions, ownerSeed, stage }
 */
function evaluateClauses(ev, env = {}) {
  if (!ev) return null;
  const results = CLAUSES.map(def => {
    try { return EVALUATORS[def.id](def, ev, env); } catch (e) { return result(def, 'pass', 'Check could not run on this MSC.', [String(e.message)]); }
  });
  const deductions = results.reduce((s, r) => s + r.penalty, 0);
  let score = 10 - deductions;
  const caps = [];
  const fail = id => results.find(r => r.id === id).status === 'fail';
  if (fail('I-01') && (ev.similarity || {}).overall > 25) { score = Math.min(score, 4); caps.push('Score capped at 4 because of high text similarity (I-01).'); }
  if (fail('I-02')) { score = Math.min(score, 4); caps.push('Score capped at 4 because of a duplicate submission (I-02).'); }
  const criticalFails = results.filter(r => r.status === 'fail' && r.severity === 'critical').length;
  if (criticalFails >= 2) { score = Math.min(score, 5); caps.push('Score capped at 5 because of multiple critical clause failures.'); }
  score = Math.max(1, Math.min(10, round1(score)));
  const counts = {
    pass: results.filter(r => r.status === 'pass').length,
    flag: results.filter(r => r.status === 'flag').length,
    fail: results.filter(r => r.status === 'fail').length,
    critical: results.filter(r => r.status === 'fail' && r.severity === 'critical').length,
    major: results.filter(r => r.status !== 'pass' && (r.severity === 'major' || (r.severity === 'critical' && r.status === 'flag'))).length,
    minor: results.filter(r => r.status !== 'pass' && r.severity === 'minor').length
  };
  const areas = Object.keys(AREAS).map(key => {
    const rs = results.filter(r => r.clause === key);
    const max = rs.reduce((s, r) => s + r.maxPenalty, 0);
    const lost = rs.reduce((s, r) => s + r.penalty, 0);
    return { clause: key, label: AREAS[key], ids: rs.map(r => r.id), score: round1(10 * (1 - lost / max)), deduction: Math.round(lost * 100) / 100, status: rs.some(r => r.status === 'fail') ? 'fail' : rs.some(r => r.status === 'flag') ? 'flag' : 'pass' };
  });
  return {
    score, passed: score > PASS_THRESHOLD, passThreshold: PASS_THRESHOLD, deductions: Math.round(deductions * 100) / 100, caps, counts, results, areas,
    context: {
      stage: env.stage || 'upload',
      editor: env.editor ? `${env.editor.name}${env.editorMode === 'assigned' ? '' : ' (proposed)'}` : null,
      reviewers: env.reviewerMode === 'assigned' ? personList(env.reviewers || []) : `${(env.reviewers || []).length} candidate reviewer(s) for the journal`,
      reviewerMode: env.reviewerMode || 'pool'
    },
    method: 'Each clause passes, is flagged for human review (half deduction) or fails (full deduction: critical 3 · major 1.5 · minor 0.75). Score = 10 − deductions, minimum 1; capped at 4 for >25% similarity or a duplicate submission and at 5 for two or more critical failures.'
  };
}

module.exports = { CLAUSES, AREAS, SEVERITY_POINTS, PASS_THRESHOLD, extractEvidence, evaluateClauses, imageHashes: ev => (ev && ev.images || []).map(i => i.hash), samePerson, institutionsOf };
