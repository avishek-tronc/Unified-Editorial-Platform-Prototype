'use strict';

/**
 * Organizes the rendered MSC HTML (from mammoth) into its parts —
 * front matter, recognised sections, figures, tables and references —
 * for the author's preview pane. Read-only: nothing here alters the MSC.
 */
const { SECTION_DEFS, matchSection, COMMUNICATION_EXEMPT } = require('./integrity');

const BLOCK_RE = /<(p|h[1-6]|table|ul|ol|blockquote)\b[^>]*>[\s\S]*?<\/\1>/gi;

function text(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function wordCount(s) {
  return (s.match(/[A-Za-z0-9À-ɏ]+/g) || []).length;
}

function buildOutline(html, report) {
  const blocks = html.match(BLOCK_RE) || [];
  const sections = [];
  let current = { key: 'front', label: 'Title page', blocks: [] };
  sections.push(current);
  let inGuide = false;

  blocks.forEach(b => {
    const t = text(b);
    const isTableOrImageOnly = /^<table/i.test(b) || (!t && /<img/i.test(b));
    let hit = !isTableOrImageOnly && !inGuide && t ? matchSection(t) : null;
    if (hit && hit.inline && sections.some(s => s.key === hit.def.key)) hit = null;
    if (hit) {
      if (hit.def.key === 'templateGuide') inGuide = true;
      current = { key: hit.def.key, label: hit.def.label.replace(' (and Discussion)', ' and Discussion'), heading: t.length <= 80 && !hit.inline ? t : hit.def.label, blocks: [] };
      if (/discussion/i.test(t) && hit.def.key === 'results') current.label = 'Results and Discussion';
      sections.push(current);
      if (hit.inline) current.blocks.push(`<p>${hit.inline.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</p>`);
      return;
    }
    current.blocks.push(b);
  });

  // Communication: abstract followed directly by the main text (no IMRaD headings).
  const abs = sections.find(x => x.key === 'abstract');
  const isComm = abs && !sections.some(x => x.key === 'introduction' || x.key === 'results') && abs.blocks.length >= 4;
  if (isComm) {
    const body = { key: 'body', label: 'Main text (communication)', heading: 'Main text', blocks: abs.blocks.slice(1) };
    abs.blocks = abs.blocks.slice(0, 1);
    sections.splice(sections.indexOf(abs) + 1, 0, body);
  }

  const out = sections
    .filter(s => s.key !== 'front' || s.blocks.length)
    .map((s, i) => {
      const body = s.blocks.join('\n');
      const figures = (body.match(/<img\b/gi) || []).length;
      const tables = (body.match(/<table\b/gi) || []).length;
      const equations = 0;
      return {
        id: `sec-${i}-${s.key}`,
        key: s.key,
        label: s.label,
        heading: s.heading || s.label,
        html: s.key === 'front' ? '' : body,
        words: wordCount(text(body)),
        figures,
        tables,
        equations,
        references: s.key === 'references' ? s.blocks.filter(b => text(b).length > 15).length : undefined
      };
    });

  const present = new Set(out.map(s => s.key));
  const missing = SECTION_DEFS.filter(d => d.required && !present.has(d.key) && !(isComm && COMMUNICATION_EXEMPT.has(d.key)))
    .map(d => d.label);

  const meta = (report && report.meta) || {};
  return {
    front: {
      title: meta.title || '',
      authors: meta.authors || [],
      affiliations: meta.affiliations || [],
      correspondingAuthor: meta.correspondingAuthor || '',
      correspondingEmail: meta.correspondingEmail || '',
      orcids: meta.orcids || []
    },
    articleType: isComm ? 'Communication' : 'Article',
    sections: out,
    missing,
    totals: {
      words: out.reduce((n, s) => n + s.words, 0),
      figures: out.reduce((n, s) => n + s.figures, 0),
      tables: out.reduce((n, s) => n + s.tables, 0)
    }
  };
}

module.exports = { buildOutline };
