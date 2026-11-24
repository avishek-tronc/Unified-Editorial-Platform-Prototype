'use strict';

/**
 * MSC integrity engine.
 *
 * Takes an uploaded Word (.docx) manuscript and a target journal and
 * produces a 1–10 integrity score with categorised, actionable feedback:
 *
 *   1. Accuracy & completeness of the content
 *   2. Typos
 *   3. Plagiarism (similarity against a reference corpus + prior submissions)
 *   4. Graphs, figures and equations
 *   5. Table data
 *   6. Technical conformance and identity/authorship integrity
 *   7. Journal scope fit (fitment index + best-fit / transfer recommendation)
 *
 * All checks are deterministic heuristics so the prototype runs offline.
 * Each check is isolated so it can later be swapped for a real service
 * (spell checker, Crossref Similarity Check, ORCID API, ML scope model...).
 */

const crypto = require('crypto');
const path = require('path');
const JSZip = require('jszip');
const mammoth = require('mammoth');
const { JOURNALS, getJournal } = require('./journals');
const REFERENCE_CORPUS = require('./corpus');

const PASS_THRESHOLD = 6; // score must be ABOVE this to pass

const WEIGHTS = {
  completeness: 0.25,
  typos: 0.10,
  plagiarism: 0.20,
  figures: 0.10,
  tables: 0.10,
  conformance: 0.15,
  scope: 0.10
};

const CATEGORY_LABELS = {
  completeness: 'Accuracy & completeness',
  typos: 'Typos & language',
  plagiarism: 'Plagiarism / similarity',
  figures: 'Graphs, figures & equations',
  tables: 'Table data',
  conformance: 'Technical conformance & authorship integrity',
  scope: 'Journal scope fit'
};

const PENALTY = { critical: 3, major: 1.5, minor: 0.5, info: 0 };

const SECTION_DEFS = [
  { key: 'abstract', label: 'Abstract', re: /^abstract\b/i, required: 'critical' },
  { key: 'keywords', label: 'Keywords', re: /^(key ?words|index terms)\b/i, required: 'major' },
  { key: 'introduction', label: 'Introduction', re: /^introduction\b/i, required: 'critical' },
  { key: 'methods', label: 'Experimental Section / Methods', re: /^(experimental( section| methods| procedures| details)?|materials and methods|methods|methodology)\b/i, required: 'major' },
  { key: 'results', label: 'Results (and Discussion)', re: /^results( and discussion)?\b/i, required: 'critical' },
  { key: 'discussion', label: 'Discussion', re: /^discussion\b/i },
  { key: 'conclusion', label: 'Conclusions', re: /^(conclusions?|concluding remarks|summary and outlook)\b/i, required: 'major' },
  { key: 'acknowledgments', label: 'Acknowledgments', re: /^acknowledge?ments?\b/i },
  { key: 'contributions', label: 'Author Contributions', re: /^author contributions?\b/i },
  { key: 'coi', label: 'Conflict of Interest statement', re: /^(conflicts? of interest|competing interests?|declaration of (competing )?interests?|notes)\b/i },
  { key: 'data', label: 'Data Availability statement', re: /^data availability\b/i },
  { key: 'si', label: 'Supporting Information', re: /^supporting information\b/i },
  { key: 'references', label: 'References', re: /^(references( and notes)?|bibliography|literature cited)\b/i, required: 'critical' },
  { key: 'templateGuide', label: 'MSC Template Guidelines', re: /^msc template guidelines\b/i }
];

// Common misspellings (subset) → suggestion
const MISSPELLINGS = {
  accomodate: 'accommodate', acheive: 'achieve', acheived: 'achieved', accross: 'across', adress: 'address',
  aquire: 'acquire', aquired: 'acquired', analize: 'analyze', analysed: null, anomolous: 'anomalous',
  apparant: 'apparent', arguement: 'argument', assesment: 'assessment', begining: 'beginning',
  beleive: 'believe', calender: 'calendar', catalist: 'catalyst', catalyts: 'catalysts', cataylst: 'catalyst',
  characterisitic: 'characteristic', charaterization: 'characterization', chemcial: 'chemical',
  comparision: 'comparison', compatable: 'compatible', completly: 'completely', concious: 'conscious',
  consistant: 'consistent', concentraion: 'concentration', definately: 'definitely', dependant: 'dependent',
  desribed: 'described', determing: 'determining', devide: 'divide', diffrent: 'different',
  effecient: 'efficient', efficency: 'efficiency', enviroment: 'environment', enviromental: 'environmental',
  equivelent: 'equivalent', exellent: 'excellent', existance: 'existence', experiement: 'experiment',
  experiemental: 'experimental', expirement: 'experiment', explaination: 'explanation', familar: 'familiar',
  finaly: 'finally', fourty: 'forty', foward: 'forward', fucntion: 'function', funtional: 'functional',
  goverment: 'government', gaurantee: 'guarantee', hydogen: 'hydrogen', hypothesys: 'hypothesis',
  immediatly: 'immediately', independant: 'independent', indicies: 'indices', intresting: 'interesting',
  intergrity: 'integrity', knowlege: 'knowledge', labratory: 'laboratory', lenght: 'length', levle: 'level',
  maintainance: 'maintenance', mechansim: 'mechanism', millenium: 'millennium', moleclue: 'molecule',
  molecuar: 'molecular', neccessary: 'necessary', necesary: 'necessary', noticable: 'noticeable',
  occured: 'occurred', occurence: 'occurrence', occuring: 'occurring', oxidaton: 'oxidation',
  paramter: 'parameter', paramters: 'parameters', particulary: 'particularly', peformance: 'performance',
  performace: 'performance', persue: 'pursue', posible: 'possible', potentialy: 'potentially',
  preperation: 'preparation', prefered: 'preferred', presense: 'presence', probalby: 'probably',
  proceedure: 'procedure', procesess: 'processes', publically: 'publicly', reaction: null,
  recieve: 'receive', recieved: 'received', recomend: 'recommend', reccomend: 'recommend',
  refered: 'referred', relevent: 'relevant', reproducable: 'reproducible', resistence: 'resistance',
  repsonse: 'response', reuslts: 'results', resutls: 'results', seperate: 'separate',
  seperated: 'separated', seperation: 'separation', signifcant: 'significant', significent: 'significant',
  similiar: 'similar', simplier: 'simpler', solvant: 'solvent', speciman: 'specimen', strucutre: 'structure',
  structual: 'structural', succesful: 'successful', successfull: 'successful', sufficent: 'sufficient',
  supress: 'suppress', surpress: 'suppress', synthsis: 'synthesis', sythesis: 'synthesis',
  temperture: 'temperature', tempreature: 'temperature', thier: 'their', threshhold: 'threshold',
  truely: 'truly', untill: 'until', usefull: 'useful', varience: 'variance', wich: 'which', whcih: 'which',
  wether: 'whether', withing: 'within', yeild: 'yield', yeilds: 'yields', yeilded: 'yielded'
};

const GENERIC_EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'qq.com', '163.com', 'aol.com', 'icloud.com'];

// ---------- helpers ----------

function words(text) {
  return (text.match(/[A-Za-z0-9À-ɏ][A-Za-z0-9À-ɏ'’-]*/g) || []);
}

function wordCount(text) {
  return words(text).length;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function expandNumberList(s) {
  const out = [];
  s.split(/\s*,\s*/).forEach(part => {
    const m = part.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (m) {
      const a = +m[1]; const b = +m[2];
      if (b >= a && b - a < 50) for (let i = a; i <= b; i++) out.push(i);
    } else if (/^\d+$/.test(part)) {
      out.push(+part);
    }
  });
  return out;
}

function issue(severity, message, remediation, extra) {
  return Object.assign({ severity, message, remediation }, extra || {});
}

function scoreFromIssues(issues) {
  const penalty = issues.reduce((sum, i) => sum + (PENALTY[i.severity] || 0), 0);
  return Math.max(0, Math.min(10, 10 - penalty));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/** ORCID iD checksum (ISO 7064 11,2). */
function validOrcid(orcid) {
  const digits = orcid.replace(/-/g, '');
  if (!/^\d{15}[\dX]$/.test(digits)) return false;
  let total = 0;
  for (let i = 0; i < 15; i++) total = (total + Number(digits[i])) * 2;
  const result = (12 - (total % 11)) % 11;
  const check = result === 10 ? 'X' : String(result);
  return check === digits[15];
}

// ---------- structure parsing ----------

function stripNumbering(p) {
  return p.replace(/^((\d+(\.\d+)*)\.?|[IVX]+\.)\s+/, '');
}

function matchSection(paragraph) {
  const p = stripNumbering(paragraph);
  for (const def of SECTION_DEFS) {
    const m = p.match(def.re);
    if (!m) continue;
    const rest = p.slice(m[0].length);
    if (p.length <= 60 && /^[\s:.\-–—]*$/.test(rest)) {
      return { def, inline: '' };
    }
    const inline = rest.match(/^\s*[:.\-–—]\s*(.+)$/);
    if (inline && def.key !== 'references') {
      return { def, inline: inline[1].trim() };
    }
  }
  return null;
}

function parseStructure(paragraphs) {
  const sections = {};
  const order = [];
  const front = [];
  let current = null;
  paragraphs.forEach(p => {
    let hit = current === 'templateGuide' ? null : matchSection(p);
    // An inline label ("Keywords: …") for a section we already saw is body text, not a new heading.
    if (hit && hit.inline && sections[hit.def.key]) hit = null;
    if (hit) {
      current = hit.def.key;
      if (!sections[current]) {
        sections[current] = { label: hit.def.label, paragraphs: [] };
        order.push(current);
      }
      if (hit.inline) sections[current].paragraphs.push(hit.inline);
      // "Results and Discussion" also covers discussion
      if (current === 'results' && /discussion/i.test(p)) sections.discussion = sections.discussion || { label: 'Discussion', paragraphs: [], merged: true };
      return;
    }
    if (current) sections[current].paragraphs.push(p);
    else front.push(p);
  });
  return { sections, order, front };
}

// Communications/letters (e.g. JACS Communications) have no IMRaD headings:
// the abstract is followed directly by the main text. Detect that and split it.
const COMMUNICATION_EXEMPT = new Set(['introduction', 'methods', 'results', 'conclusion']);
function detectCommunication(structure) {
  const abs = structure.sections.abstract;
  if (!abs || structure.sections.introduction || structure.sections.results) return structure;
  if (abs.paragraphs.length < 4) return structure;
  structure.sections.body = { label: 'Main text (communication)', paragraphs: abs.paragraphs.slice(1) };
  abs.paragraphs = abs.paragraphs.slice(0, 1);
  structure.order.splice(structure.order.indexOf('abstract') + 1, 0, 'body');
  structure.articleType = 'Communication';
  return structure;
}

function parseMetadata(front, fullText) {
  const meta = { title: '', authors: [], affiliations: [], emails: [], correspondingEmail: '', orcids: [] };
  const remaining = [...front];

  let titleIdx = remaining.findIndex(p => /^title\s*[:.]/i.test(p));
  if (titleIdx === -1) titleIdx = remaining.findIndex(p => !/^(authors?|affiliations?|corresponding|orcid|e-?mail|journal|manuscript type|article type|running title)\b/i.test(p));
  if (titleIdx !== -1) {
    meta.title = remaining[titleIdx].replace(/^title\s*[:.]\s*/i, '').trim();
    remaining.splice(titleIdx, 1);
  }

  let authorLine = remaining.find(p => /^authors?\s*[:.]/i.test(p));
  if (!authorLine) {
    authorLine = remaining.find(p => p.length < 400 && /,|\band\b/.test(p) &&
      !/(university|institute|department|college|laborator|school|cent(er|re)|@|abstract|corresponding)/i.test(p) &&
      words(p).length >= 2);
  }
  if (authorLine) {
    meta.authors = authorLine
      .replace(/^authors?\s*[:.]\s*/i, '')
      .replace(/[\d*†‡§¶]+/g, '')
      .split(/\s*(?:,|;|\band\b|&)\s*/)
      .map(s => s.replace(/\s+/g, ' ').trim())
      .filter(s => s.length > 2 && /[A-Za-z]/.test(s) && words(s).length <= 5);
  }

  meta.affiliations = remaining
    .filter(p => /^affiliations?\s*[:.]/i.test(p) || /(university|institute|department|college|laborator|school of|cent(er|re) for|faculty)/i.test(p))
    .map(p => p.replace(/^affiliations?\s*[:.]\s*/i, '').trim())
    .filter(p => !/^corresponding/i.test(p));

  meta.emails = Array.from(new Set((fullText.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).map(e => e.toLowerCase())));
  const corr = front.find(p => /corresponding/i.test(p));
  if (corr) {
    const m = corr.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    if (m) meta.correspondingEmail = m[0].toLowerCase();
    const nameMatch = corr.match(/corresponding author\s*[:.]?\s*([A-Z][A-Za-z.\-' ]+?)(?:,|\(|$|\s+[A-Za-z0-9._%+-]+@)/i);
    if (nameMatch) meta.correspondingAuthor = nameMatch[1].trim();
  }
  if (!meta.correspondingEmail && meta.emails.length) meta.correspondingEmail = meta.emails[0];
  if (!meta.correspondingAuthor && meta.correspondingEmail && meta.authors.length) {
    const local = meta.correspondingEmail.split('@')[0].toLowerCase().replace(/[^a-z]/g, '');
    const norm = x => x.toLowerCase().replace(/[^a-z]/g, '');
    const byEmail = meta.authors.find(a => a.includes(' ') && norm(a).length > 4 && local.includes(norm(a))) ||
      meta.authors.filter(a => a.includes(' ')).find(a => {
        const last = norm(a.split(' ').pop());
        return last.length > 2 && local.includes(last);
      });
    if (byEmail) meta.correspondingAuthor = byEmail;
  }
  if (!meta.correspondingAuthor && meta.authors.length) meta.correspondingAuthor = meta.authors[0];

  meta.orcids = Array.from(new Set(fullText.match(/\b\d{4}-\d{4}-\d{4}-\d{3}[\dX]\b/g) || []));
  return meta;
}

// ---------- category checks ----------

function checkCompleteness(ctx) {
  const { structure, meta, journal, text, html } = ctx;
  const issues = [];
  const lim = journal.limits;

  if (!meta.title) {
    issues.push(issue('critical', 'Manuscript title could not be identified.', 'Place the title as the first line of the document (or prefix it with "Title:").'));
  } else if (meta.title.length > lim.titleChars) {
    issues.push(issue('minor', `Title is ${meta.title.length} characters; ${journal.shortName} recommends at most ${lim.titleChars}.`, 'Shorten the title so it states the key finding concisely.'));
  }

  SECTION_DEFS.filter(d => d.required && !(structure.articleType === 'Communication' && COMMUNICATION_EXEMPT.has(d.key))).forEach(def => {
    if (!structure.sections[def.key]) {
      issues.push(issue(def.required, `Required section missing: ${def.label}.`, `Add a "${def.label}" heading and content as laid out in the ${journal.shortName} MSC template.`));
    } else if (!structure.sections[def.key].merged && structure.sections[def.key].paragraphs.join(' ').trim().length === 0) {
      issues.push(issue('major', `Section "${def.label}" is empty.`, `Provide content for the "${def.label}" section.`));
    }
  });

  if (structure.sections.templateGuide) {
    issues.push(issue('critical', 'The "MSC Template Guidelines" section is still in the manuscript.', 'Delete the template guidelines section at the end of the document before submission.'));
  }

  const placeholders = text.match(/\[(insert|enter|add|type|your)[^\]]{0,80}\]|lorem ipsum/gi) || [];
  if (placeholders.length) {
    issues.push(issue('critical', `Template placeholder text left in the manuscript (${placeholders.length} occurrence${placeholders.length > 1 ? 's' : ''}, e.g. "${placeholders[0]}").`, 'Replace every bracketed template instruction with your own content and delete the guideline text.'));
  }

  const abstract = structure.sections.abstract ? structure.sections.abstract.paragraphs.join(' ') : '';
  const abstractWords = wordCount(abstract);
  if (abstract) {
    if (abstractWords > lim.abstractWords) {
      issues.push(issue('major', `Abstract has ${abstractWords} words; ${journal.shortName} allows ${lim.abstractWords}.`, `Trim the abstract to ${lim.abstractWords} words or fewer, keeping the problem, approach, key result and significance.`));
    } else if (abstractWords < 50) {
      issues.push(issue('major', `Abstract is very short (${abstractWords} words).`, 'Expand the abstract to summarise the motivation, methods, main quantitative results and conclusion (typically 100–200 words).'));
    }
  }

  const kw = structure.sections.keywords ? structure.sections.keywords.paragraphs.join('; ') : '';
  const keywords = kw.split(/\s*[;,•·]\s*/).map(s => s.trim()).filter(Boolean);
  if (structure.sections.keywords) {
    if (keywords.length < 3) issues.push(issue('minor', `Only ${keywords.length} keyword(s) supplied.`, 'Provide 3–6 specific keywords to help indexing and reviewer matching.'));
    if (keywords.length > lim.maxKeywords) issues.push(issue('minor', `${keywords.length} keywords supplied; maximum is ${lim.maxKeywords}.`, `Reduce the keyword list to the ${lim.maxKeywords} most specific terms.`));
  }

  const totalWords = wordCount(text);
  if (totalWords > lim.totalWords) {
    issues.push(issue('major', `Manuscript length ${totalWords} words exceeds the ${journal.shortName} limit of ${lim.totalWords}.`, 'Condense the text or move detailed procedures and additional data to the Supporting Information.'));
  }

  // References and in-text citations
  const refs = structure.sections.references ? structure.sections.references.paragraphs.filter(p => p.length > 15) : [];
  if (structure.sections.references) {
    if (refs.length < lim.minReferences) {
      issues.push(issue('major', `Only ${refs.length} references listed; ${journal.shortName} manuscripts typically cite at least ${lim.minReferences}.`, 'Ensure the work is placed in context of the current literature and that all prior work you build on is cited.'));
    }
    const bodyHtml = html.split(/<h\d[^>]*>\s*(?:\d+\.?\s*)?(?:references|bibliography)/i)[0].split(/<p>\s*(?:<strong>)?\s*(?:\d+\.?\s*)?references\s*(?:<\/strong>)?\s*<\/p>/i)[0];
    const cited = new Set();
    (bodyHtml.match(/<sup>\s*([\d,\s–—-]+)\s*<\/sup>/g) || []).forEach(s => expandNumberList(stripTags(s)).forEach(n => cited.add(n)));
    (stripTags(bodyHtml).match(/\[(\d+(?:\s*[,–—-]\s*\d+)*)\]/g) || []).forEach(s => expandNumberList(s.slice(1, -1)).forEach(n => cited.add(n)));
    if (refs.length && cited.size === 0) {
      issues.push(issue('major', 'No in-text citations were detected for the reference list.', 'Cite references in the text using superscript numbers or [n] in order of first appearance.'));
    } else if (refs.length) {
      const missing = [...cited].filter(n => n > refs.length).sort((a, b) => a - b);
      if (missing.length) issues.push(issue('major', `In-text citation(s) ${missing.slice(0, 5).join(', ')} have no matching entry in the reference list (${refs.length} entries).`, 'Add the missing references or correct the citation numbers.'));
      const uncited = [];
      for (let i = 1; i <= refs.length; i++) if (!cited.has(i)) uncited.push(i);
      if (uncited.length) issues.push(issue('minor', `Reference(s) ${uncited.slice(0, 6).join(', ')}${uncited.length > 6 ? '…' : ''} are listed but never cited in the text.`, 'Cite every listed reference in the text or remove unused entries.'));
    }
  }

  // Accuracy: quantitative claims in the abstract should be supported in the body.
  if (abstract) {
    const body = Object.entries(structure.sections)
      .filter(([k]) => !['abstract', 'keywords', 'references'].includes(k))
      .map(([, s]) => s.paragraphs.join(' ')).join(' ');
    const values = Array.from(new Set(abstract.match(/\b\d+(?:\.\d+)?\s?(?:%|°C|nM|µM|uM|mM|nm|eV|mAh|h\b|K\b)/g) || []));
    const unsupported = values.filter(v => !body.includes(v.match(/\d+(?:\.\d+)?/)[0]));
    if (unsupported.length) {
      issues.push(issue('minor', `Value(s) reported in the abstract (${unsupported.slice(0, 4).join(', ')}) do not appear in the main text.`, 'Make sure every quantitative claim in the abstract is reported and supported by data in the Results.'));
    }
  }

  return { issues, stats: { totalWords, abstractWords, keywords, references: refs.length } };
}

function checkTypos(ctx) {
  const { text, rawText } = ctx;
  const issues = [];
  let count = 0;
  const found = {};
  words(text).forEach(w => {
    const lw = w.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(MISSPELLINGS, lw) && MISSPELLINGS[lw]) {
      found[lw] = (found[lw] || 0) + 1;
      count++;
    }
  });
  Object.entries(found).forEach(([w, n]) => {
    issues.push(issue('minor', `Possible misspelling "${w}"${n > 1 ? ` (${n}×)` : ''}.`, `Did you mean "${MISSPELLINGS[w]}"?`, { kind: 'spelling' }));
  });

  const repeats = (text.match(/\b([A-Za-z]{2,})\s+\1\b/gi) || []).filter(r => !/^(that that|had had)$/i.test(r));
  if (repeats.length) {
    count += repeats.length;
    issues.push(issue('minor', `Repeated word(s): ${Array.from(new Set(repeats.map(r => `"${r}"`))).slice(0, 5).join(', ')}.`, 'Remove the duplicated word.', { kind: 'repetition' }));
  }

  const doubleSpaces = (rawText.match(/[^\s] {2,}[^\s]/g) || []).length;
  if (doubleSpaces) {
    count += Math.min(doubleSpaces, 5);
    issues.push(issue('minor', `${doubleSpaces} instance(s) of multiple consecutive spaces.`, 'Use single spaces between words; use tabs or table cells for alignment.', { kind: 'spacing' }));
  }

  const spaceBeforePunct = (rawText.match(/[A-Za-z] +[,.;:](?!\d)/g) || []).length;
  if (spaceBeforePunct) {
    count += Math.min(spaceBeforePunct, 5);
    issues.push(issue('minor', `${spaceBeforePunct} instance(s) of a space before punctuation.`, 'Remove spaces before commas, full stops, colons and semicolons.', { kind: 'punctuation' }));
  }

  const unbalanced = ctx.paragraphs.filter(p => (p.match(/\(/g) || []).length !== (p.match(/\)/g) || []).length).length;
  if (unbalanced) {
    count += unbalanced;
    issues.push(issue('minor', `${unbalanced} paragraph(s) contain unbalanced parentheses.`, 'Check that every opening parenthesis has a matching closing parenthesis.', { kind: 'punctuation' }));
  }

  const per1000 = count / Math.max(1, wordCount(text) / 1000);
  const score = Math.max(0, Math.min(10, 10 - per1000 * 1.5));
  return { issues, score, stats: { typoCount: count, typosPer1000Words: round1(per1000) } };
}

function shingles(text, n = 8) {
  const w = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const set = new Set();
  for (let i = 0; i + n <= w.length; i++) set.add(w.slice(i, i + n).join(' '));
  return set;
}

function checkPlagiarism(ctx) {
  const { structure, corpus } = ctx;
  const issues = [];
  const body = Object.entries(structure.sections)
    .filter(([k]) => k !== 'references')
    .map(([, s]) => s.paragraphs.join(' ')).join(' ') || ctx.text;
  const mine = shingles(body);
  if (mine.size === 0) return { issues, score: 10, stats: { similarity: 0, sources: [] } };

  const matched = new Set();
  const sources = [];
  [...REFERENCE_CORPUS, ...(corpus || [])].forEach(doc => {
    const theirs = shingles(doc.text);
    let overlap = 0;
    mine.forEach(s => { if (theirs.has(s)) { overlap++; matched.add(s); } });
    if (overlap > 0) {
      sources.push({ id: doc.id, source: doc.source, overlapPct: round1((overlap / mine.size) * 100) });
    }
  });
  sources.sort((a, b) => b.overlapPct - a.overlapPct);
  const similarity = round1((matched.size / mine.size) * 100);

  const top = sources.slice(0, 3).map(s => `${s.source} (${s.overlapPct}%)`).join('; ');
  if (similarity > 25) {
    issues.push(issue('critical', `High text similarity detected: ${similarity}% of the manuscript matches existing sources. Top matches: ${top}.`, 'Rewrite the overlapping passages in your own words and cite the original sources. Verbatim reuse must be quoted and referenced.'));
  } else if (similarity > 10) {
    issues.push(issue('major', `Moderate text similarity: ${similarity}% overlap. Top matches: ${top}.`, 'Paraphrase the matched passages and ensure all sources are cited; avoid recycling text from your own earlier publications without attribution.'));
  } else if (similarity > 3) {
    issues.push(issue('minor', `Minor text overlap (${similarity}%) with: ${top}.`, 'Review the matched phrases; common method descriptions are acceptable if cited.'));
  }
  const score = Math.max(0, Math.min(10, 10 - similarity * 0.35));
  return { issues, score, stats: { similarity, sources: sources.slice(0, 5) } };
}

function checkFigures(ctx) {
  const { paragraphs, docXml } = ctx;
  const issues = [];
  const images = (docXml.match(/<w:drawing\b/g) || []).length + (docXml.match(/<v:imagedata\b/g) || []).length;
  const equations = (docXml.match(/<m:oMath\b(?!Para)/g) || []).length;

  const captionRe = /^(figure|fig\.?|scheme)\s*(\d+)\s*[.:|—–\-．：]/i;
  const captions = paragraphs.map(p => p.match(captionRe)).filter(Boolean).map(m => ({ type: /scheme/i.test(m[1]) ? 'Scheme' : 'Figure', n: +m[2] }));
  const figCaptions = captions.filter(c => c.type === 'Figure');
  const bodyText = paragraphs.filter(p => !captionRe.test(p)).join(' ');
  const referenced = new Set((bodyText.match(/\b(?:figures?|figs?\.?)\s*(\d+)/gi) || []).map(s => +s.match(/(\d+)/)[1]));

  if (images === 0 && captions.length === 0) {
    issues.push(issue('major', 'No figures, schemes or graphs found.', 'Include figures that present the key data (and a table-of-contents graphic). Embed them in the document with numbered captions.'));
  } else {
    if (images > captions.length) {
      issues.push(issue('major', `${images - captions.length} embedded image(s) have no "Figure n." caption.`, 'Add a numbered caption directly below every figure or scheme describing what it shows.'));
    }
    if (captions.length > images) {
      issues.push(issue('major', `${captions.length - images} caption(s) found without an embedded image.`, 'Embed the figure image above its caption (figures must be inside the Word file, not linked).'));
    }
    const nums = figCaptions.map(c => c.n);
    const sequential = nums.every((n, i) => n === i + 1);
    if (nums.length && !sequential) {
      issues.push(issue('minor', `Figure numbering is not sequential (${nums.join(', ')}).`, 'Number figures consecutively in the order they are first cited.'));
    }
    const unref = nums.filter(n => !referenced.has(n));
    if (unref.length) {
      issues.push(issue('minor', `Figure(s) ${unref.join(', ')} are not referenced in the text.`, 'Refer to every figure in the text (e.g. "as shown in Figure 2").'));
    }
  }
  const missingFigs = [...referenced].filter(n => !figCaptions.some(c => c.n === n));
  if (missingFigs.length && (figCaptions.length || images)) {
    issues.push(issue('major', `Text refers to Figure ${missingFigs.join(', ')} which does not exist.`, 'Add the missing figure or correct the figure reference.'));
  }

  const eqReferenced = /\b(eqs?\.?|equations?)\s*\(?\d+/i.test(bodyText);
  if (equations > 0 && !eqReferenced) {
    issues.push(issue('minor', `${equations} equation(s) found but none are referenced in the text.`, 'Number display equations and refer to them in the text (e.g. "eq 1").'));
  }
  const plainEquations = paragraphs.filter(p => p.length < 100 && /=/.test(p) && words(p).length < 15 && /^[\w\s()+\-*/^.,=ΔαβγλμσπΣ√·×′'"\[\]{}|]+$/.test(p)).length;
  if (plainEquations) {
    issues.push(issue('minor', `${plainEquations} equation(s) appear to be typed as plain text.`, 'Use the Word equation editor (Insert → Equation) so equations are machine-readable and render correctly.'));
  }

  return { issues, stats: { images, figureCaptions: figCaptions.length, schemes: captions.length - figCaptions.length, equations, plainTextEquations: plainEquations } };
}

function parseHtmlTables(html) {
  const tables = [];
  (html.match(/<table[\s\S]*?<\/table>/gi) || []).forEach(t => {
    const rows = (t.match(/<tr[\s\S]*?<\/tr>/gi) || []).map(r => (r.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || []).map(c => stripTags(c)));
    tables.push(rows);
  });
  return tables;
}

function isNumeric(s) {
  return /^[<>~±+\-−]?\s*\d[\d,]*(\.\d+)?\s*(%|±\s*\d+(\.\d+)?)?$/.test(s.trim());
}

function checkTables(ctx) {
  const { paragraphs, docXml, html } = ctx;
  const issues = [];
  const tblCount = (docXml.match(/<w:tbl>/g) || []).length;
  const tables = parseHtmlTables(html);
  const captionRe = /^table\s*(\d+)\s*[.:|—–\-．：]/i;
  const captions = paragraphs.map(p => p.match(captionRe)).filter(Boolean).map(m => +m[1]);
  const bodyText = paragraphs.filter(p => !captionRe.test(p)).join(' ');
  const referenced = new Set((bodyText.match(/\btables?\s*(\d+)/gi) || []).map(s => +s.match(/(\d+)/)[1]));
  const tableStats = [];

  if (tblCount === 0 && captions.length === 0) {
    issues.push(issue('info', 'No tables found in the manuscript.', 'If you report quantitative comparisons (yields, conditions, IC50 values…), consider summarising them in a table.'));
  }
  if (tblCount > captions.length) {
    issues.push(issue('major', `${tblCount - captions.length} table(s) have no "Table n." caption.`, 'Add a numbered, descriptive title above every table.'));
  }
  if (captions.length > tblCount) {
    issues.push(issue('major', `${captions.length - tblCount} table caption(s) without an editable table (tables may have been pasted as images).`, 'Insert tables as editable Word tables, not images, so data can be validated.'));
  }
  if (captions.length && !captions.every((n, i) => n === i + 1)) {
    issues.push(issue('minor', `Table numbering is not sequential (${captions.join(', ')}).`, 'Number tables consecutively in order of first citation.'));
  }
  const unref = captions.filter(n => !referenced.has(n));
  if (unref.length) {
    issues.push(issue('minor', `Table(s) ${unref.join(', ')} are not referenced in the text.`, 'Refer to each table in the text (e.g. "summarised in Table 1").'));
  }

  tables.forEach((rows, idx) => {
    const n = idx + 1;
    const cells = rows.flat();
    const empty = cells.filter(c => c === '').length;
    const emptyPct = cells.length ? Math.round((empty / cells.length) * 100) : 0;
    tableStats.push({ table: n, rows: rows.length, columns: rows[0] ? rows[0].length : 0, emptyCellsPct: emptyPct });
    if (rows.length < 2) {
      issues.push(issue('minor', `Table ${n} has fewer than two rows.`, 'A table needs a header row and at least one data row; consider moving single values into the text.'));
      return;
    }
    if (emptyPct > 10) {
      issues.push(issue('minor', `Table ${n}: ${emptyPct}% of cells are empty.`, 'Fill empty cells or mark them explicitly (e.g. "—" or "n.d." with a footnote).'));
    }
    const header = rows[0];
    if (header.length && header.filter(isNumeric).length > header.length / 2) {
      issues.push(issue('minor', `Table ${n} appears to have no header row.`, 'Add a header row with column names and units.'));
    }
    const cols = Math.max(...rows.map(r => r.length));
    for (let c = 0; c < cols; c++) {
      const vals = rows.slice(1).map(r => r[c]).filter(v => v !== undefined && v !== '' && !/^(—|-|–|n\.?d\.?|n\/a|na)$/i.test(v));
      if (vals.length < 3) continue;
      const numeric = vals.filter(isNumeric).length;
      if (numeric / vals.length >= 0.6 && numeric < vals.length) {
        const bad = vals.filter(v => !isNumeric(v)).slice(0, 2);
        issues.push(issue('minor', `Table ${n}, column "${header[c] || c + 1}": inconsistent data (${bad.map(b => `"${b}"`).join(', ')} in a numeric column).`, 'Check the values for typos and keep units in the column header rather than in the cells.'));
      }
    }
  });

  return { issues, stats: { tables: tblCount, tableCaptions: captions.length, tableDetails: tableStats } };
}

function checkConformance(ctx) {
  const { meta, structure, docXml, coreXml, hasComments } = ctx;
  const issues = [];

  if (!meta.authors.length) {
    issues.push(issue('critical', 'Author list could not be identified.', 'List all authors under the title (e.g. "Authors: A. Author, B. Author").'));
  }
  if (!meta.affiliations.length) {
    issues.push(issue('major', 'No author affiliations found.', 'Provide the full institutional affiliation for each author.'));
  }
  if (!meta.correspondingEmail) {
    issues.push(issue('major', 'No corresponding author e-mail address found.', 'Add a "Corresponding author:" line with name and e-mail address.'));
  } else {
    const domain = meta.correspondingEmail.split('@')[1];
    if (GENERIC_EMAIL_DOMAINS.includes(domain)) {
      issues.push(issue('minor', `Corresponding e-mail uses a personal domain (${domain}).`, 'Use an institutional e-mail address so the corresponding author\'s identity and affiliation can be verified.'));
    }
  }
  if (!meta.orcids.length) {
    issues.push(issue('minor', 'No ORCID iD provided.', 'Add the ORCID iD of (at least) the corresponding author; it is required at submission for identity verification.'));
  } else {
    const invalid = meta.orcids.filter(o => !validOrcid(o));
    if (invalid.length) {
      issues.push(issue('major', `ORCID iD(s) failed checksum validation: ${invalid.join(', ')}.`, 'Copy the ORCID iD exactly from orcid.org; an invalid identifier blocks authorship verification.'));
    }
  }
  const dupes = meta.authors.filter((a, i) => meta.authors.findIndex(b => b.toLowerCase() === a.toLowerCase()) !== i);
  if (dupes.length) {
    issues.push(issue('minor', `Duplicate author name(s): ${dupes.join(', ')}.`, 'Each author should be listed once.'));
  }

  const creator = (coreXml.match(/<dc:creator>([^<]*)<\/dc:creator>/) || [])[1];
  if (creator && meta.authors.length) {
    const lastNames = meta.authors.map(a => a.split(' ').pop().toLowerCase());
    const matches = lastNames.some(l => creator.toLowerCase().includes(l));
    if (!matches && !/^(user|admin|author|microsoft|windows user|unknown|python-docx|un-named)$/i.test(creator.trim())) {
      issues.push(issue('minor', `Document properties list "${creator}" as creator, who is not in the author list.`, 'Confirm authorship: if this person contributed, add them as an author or in the Acknowledgments; otherwise clear the document metadata.'));
    }
  }

  if (!structure.sections.coi) {
    issues.push(issue('major', 'No Conflict of Interest / competing interests statement.', 'Add a "Conflicts of Interest" section (e.g. "The authors declare no competing financial interest.").'));
  }
  if (!structure.sections.data) {
    issues.push(issue('minor', 'No Data Availability statement.', 'State where the underlying data can be accessed (repository, Supporting Information, or on request).'));
  }
  if (meta.authors.length > 1 && !structure.sections.contributions) {
    issues.push(issue('minor', 'No Author Contributions statement for a multi-author paper.', 'Add a CRediT-style "Author Contributions" statement.'));
  }

  const tracked = (docXml.match(/<w:(ins|del)\b/g) || []).length;
  if (tracked) {
    issues.push(issue('major', `Document contains ${tracked} tracked change(s).`, 'Accept or reject all tracked changes (Review → Accept All) before submission.'));
  }
  if (hasComments) {
    issues.push(issue('minor', 'Document contains embedded Word comments.', 'Delete all comments (Review → Delete All Comments) before submission.'));
  }

  return { issues, stats: { authors: meta.authors.length, affiliations: meta.affiliations.length, orcids: meta.orcids.length, trackedChanges: tracked } };
}

function countTerm(hay, term) {
  const re = new RegExp(`(^|[^a-z0-9])${escapeRe(term)}(s|es)?(?=[^a-z0-9]|$)`, 'g');
  return (hay.match(re) || []).length;
}

function computeFitment(ctx) {
  const { structure, meta, text } = ctx;
  const core = [meta.title,
    structure.sections.abstract ? structure.sections.abstract.paragraphs.join(' ') : '',
    structure.sections.keywords ? structure.sections.keywords.paragraphs.join(' ') : ''].join(' ').toLowerCase();
  const body = text.toLowerCase();
  const scores = {};
  JOURNALS.forEach(j => {
    let raw = 0;
    j.subjects.forEach(term => {
      raw += countTerm(core, term) * 3 + Math.min(3, countTerm(body, term));
    });
    scores[j.id] = Math.round(100 * (1 - Math.exp(-raw / 20)));
  });
  return scores;
}

function checkScope(ctx) {
  const { journal } = ctx;
  const issues = [];
  const scores = computeFitment(ctx);
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [bestId, bestScore] = ranked[0];
  const selected = scores[journal.id];
  let transfer = null;

  if (bestId !== journal.id && bestScore >= selected + 15) {
    const best = getJournal(bestId);
    transfer = { journalId: bestId, journalName: best.name, fitmentIndex: bestScore };
    issues.push(issue(selected < 35 ? 'major' : 'minor', `Scope fit with ${journal.shortName} is ${selected}/100; ${best.name} is a better fit (${bestScore}/100).`, `Consider submitting to ${best.name} (${best.genre}) or strengthening the manuscript\'s relevance to ${journal.shortName}\'s scope: ${journal.context.toLowerCase()}.`));
  } else if (selected < 35) {
    issues.push(issue('major', `Low scope fit with ${journal.shortName} (${selected}/100) and no strong alternative in the portfolio.`, `Clarify in the title, abstract and keywords how the work relates to ${journal.context.toLowerCase()}.`));
  }
  const score = Math.max(0, Math.min(10, selected / 7.5));
  return {
    issues,
    score,
    fitment: {
      selectedJournal: journal.id,
      index: selected,
      scores,
      recommended: { journalId: bestId, journalName: getJournal(bestId).name, fitmentIndex: bestScore },
      transfer
    }
  };
}

/**
 * Overall 1–10 integrity score from the weighted category scores, with the
 * hard caps (high similarity, multiple critical issues) and the PASS rule.
 * Shared by the Author upload check and the reviewer's MSC analysis.
 */
function finalScore(categories, similarity) {
  let score = categories.reduce((s, c) => s + c.weight * c.score, 0);
  const criticalCount = categories.flatMap(c => c.issues).filter(i => i.severity === 'critical').length;
  const caps = [];
  if (similarity > 25) { score = Math.min(score, 4); caps.push('Score capped at 4 because of high text similarity.'); }
  if (criticalCount >= 2) { score = Math.min(score, 5); caps.push('Score capped at 5 because of multiple critical issues.'); }
  score = Math.max(1, Math.min(10, round1(score)));
  return { score, caps, passed: score > PASS_THRESHOLD, weighted: round1(categories.reduce((s, c) => s + c.weight * c.score, 0)) };
}

// ---------- main ----------

async function validateFormat(buffer, originalName) {
  const errors = [];
  const ext = path.extname(originalName || '').toLowerCase();
  if (ext === '.doc') {
    errors.push(issue('critical', 'Legacy Word 97-2003 (.doc) format is not supported.', 'Open the file in Word and use File → Save As → Word Document (.docx).'));
    return { errors };
  }
  if (ext !== '.docx') {
    errors.push(issue('critical', `Unsupported file type "${ext || 'unknown'}". The MSC must be a Word document (.docx).`, 'Export or save your manuscript as a .docx file and upload it again.'));
    return { errors };
  }
  if (!buffer || buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    errors.push(issue('critical', 'The file is not a valid .docx package (it may be corrupted or renamed).', 'Re-save the document from Word as .docx and upload again.'));
    return { errors };
  }
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (e) {
    errors.push(issue('critical', 'The .docx file could not be opened (corrupted archive).', 'Re-save the document from Word as .docx and upload again.'));
    return { errors };
  }
  if (!zip.file('word/document.xml')) {
    errors.push(issue('critical', 'The file does not contain a Word document body.', 'Upload a manuscript created in Microsoft Word or a compatible editor saved as .docx.'));
    return { errors };
  }
  return { errors, zip };
}

/**
 * @param {object} opts
 * @param {Buffer} opts.buffer        uploaded file contents
 * @param {string} opts.originalName  uploaded file name
 * @param {string} opts.journalId     selected journal id
 * @param {Array}  [opts.corpus]      [{id, source, text}] prior submissions for similarity
 */
async function analyzeManuscript({ buffer, originalName, journalId, corpus }) {
  const journal = getJournal(journalId);
  if (!journal) throw new Error(`Unknown journal: ${journalId}`);
  const contentHash = crypto.createHash('sha256').update(buffer || Buffer.alloc(0)).digest('hex');

  const { errors, zip } = await validateFormat(buffer, originalName);
  if (errors.length) {
    return {
      valid: false, score: 1, passed: false, journalId, contentHash,
      summary: 'The file failed format validation and could not be evaluated.',
      formatErrors: errors, categories: [], issues: errors, meta: {}, stats: {}, fitment: null
    };
  }

  const docXml = await zip.file('word/document.xml').async('string');
  const coreXml = zip.file('docProps/core.xml') ? await zip.file('docProps/core.xml').async('string') : '';
  const hasComments = !!zip.file('word/comments.xml');
  const [{ value: rawText }, { value: html }] = await Promise.all([
    mammoth.extractRawText({ buffer }),
    mammoth.convertToHtml({ buffer })
  ]);
  const paragraphs = rawText.split(/\n+/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const text = paragraphs.join('\n');

  const formatErrors = [];
  const totalWords = wordCount(text);
  if (totalWords < 200) {
    formatErrors.push(issue('critical', `The manuscript contains only ${totalWords} words and cannot be evaluated as a full MSC.`, 'Upload the complete manuscript (title page, abstract, main text and references) in a single .docx file.'));
  }
  if (formatErrors.length) {
    return {
      valid: false, score: 1, passed: false, journalId, contentHash,
      summary: 'The file failed format validation and could not be evaluated.',
      formatErrors, categories: [], issues: formatErrors, meta: {}, stats: { totalWords }, fitment: null, html, text
    };
  }

  const structure = detectCommunication(parseStructure(paragraphs));
  const meta = parseMetadata(structure.front, text);
  const ctx = { buffer, journal, docXml, coreXml, hasComments, rawText, html, text, paragraphs, structure, meta, corpus };

  const completeness = checkCompleteness(ctx);
  const typos = checkTypos(ctx);
  const plagiarism = checkPlagiarism(ctx);
  const figures = checkFigures(ctx);
  const tables = checkTables(ctx);
  const conformance = checkConformance(ctx);
  const scope = checkScope(ctx);

  const results = {
    completeness: { ...completeness, score: scoreFromIssues(completeness.issues) },
    typos,
    plagiarism,
    figures: { ...figures, score: scoreFromIssues(figures.issues) },
    tables: { ...tables, score: scoreFromIssues(tables.issues) },
    conformance: { ...conformance, score: scoreFromIssues(conformance.issues) },
    scope
  };

  const categories = Object.keys(WEIGHTS).map(key => ({
    key,
    label: CATEGORY_LABELS[key],
    weight: WEIGHTS[key],
    score: round1(results[key].score),
    issues: results[key].issues.map(i => ({ ...i, category: key, categoryLabel: CATEGORY_LABELS[key] }))
  }));

  const allIssues = categories.flatMap(c => c.issues);
  const criticalCount = allIssues.filter(i => i.severity === 'critical').length;
  const { score, caps, passed } = finalScore(categories, plagiarism.stats.similarity);

  const sevOrder = { critical: 0, major: 1, minor: 2, info: 3 };
  allIssues.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  const summary = passed
    ? `PASS — integrity score ${score}/10 for ${journal.shortName}. ${allIssues.filter(i => i.severity !== 'info').length} item(s) can still be improved, but the MSC may proceed to submission.`
    : `FAIL — integrity score ${score}/10 for ${journal.shortName}. Address the critical and major items below and re-submit the MSC.`;

  return {
    valid: true,
    score,
    passed,
    passThreshold: PASS_THRESHOLD,
    journalId,
    contentHash,
    summary,
    caps,
    categories,
    issues: allIssues,
    counts: {
      critical: criticalCount,
      major: allIssues.filter(i => i.severity === 'major').length,
      minor: allIssues.filter(i => i.severity === 'minor').length
    },
    meta: {
      title: meta.title,
      authors: meta.authors,
      affiliations: meta.affiliations,
      correspondingAuthor: meta.correspondingAuthor || '',
      correspondingEmail: meta.correspondingEmail,
      orcids: meta.orcids,
      abstract: structure.sections.abstract ? structure.sections.abstract.paragraphs.join(' ') : '',
      keywords: completeness.stats.keywords,
      articleType: structure.articleType || 'Article',
      sections: structure.order.map(k => structure.sections[k].label)
    },
    stats: {
      ...completeness.stats,
      ...typos.stats,
      similarity: plagiarism.stats.similarity,
      similaritySources: plagiarism.stats.sources,
      ...figures.stats,
      ...tables.stats,
      ...conformance.stats
    },
    fitment: scope.fitment,
    html,
    text
  };
}

/**
 * Parses an uploaded MSC for display only (no scoring): validates the
 * format and returns the rendered HTML plus the detected title-page data.
 */
async function parseForPreview(buffer, originalName) {
  const { errors } = await validateFormat(buffer, originalName);
  if (errors.length) return { valid: false, formatErrors: errors };
  const [{ value: rawText }, { value: html }] = await Promise.all([
    mammoth.extractRawText({ buffer }),
    mammoth.convertToHtml({ buffer })
  ]);
  const paragraphs = rawText.split(/\n+/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const structure = detectCommunication(parseStructure(paragraphs));
  const meta = parseMetadata(structure.front, paragraphs.join('\n'));
  return { valid: true, html, meta };
}

module.exports = { COMMUNICATION_EXEMPT, analyzeManuscript, finalScore, parseStructure, detectCommunication, countTerm, words, PENALTY, parseForPreview, PASS_THRESHOLD, WEIGHTS, CATEGORY_LABELS, SECTION_DEFS, matchSection, validOrcid, computeFitment };
