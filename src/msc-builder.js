'use strict';

/**
 * Builds a manuscript .docx from a structured description.
 * Used to produce the demo sample MSCs and the seeded dashboard data.
 */
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun,
  Table, TableRow, TableCell, WidthType, Math: OMath, MathRun
} = require('docx');
const { chartPng } = require('./png');

function heading(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 } });
}

function para(text) {
  return new Paragraph({ children: [new TextRun(text)], spacing: { after: 120 } });
}

function bold(label, text) {
  return new Paragraph({ children: [new TextRun({ text: label, bold: true }), new TextRun(text)] });
}

function block(item) {
  if (typeof item === 'string') return [para(item)];
  if (item.figure) {
    const out = [];
    if (!item.figure.noImage) {
      out.push(new Paragraph({
        children: [new ImageRun({
          type: 'png',
          data: chartPng({ values: item.figure.values, kind: item.figure.kind, color: item.figure.color }),
          transformation: { width: 420, height: 262 }
        })]
      }));
    }
    if (!item.figure.noCaption) out.push(bold(`Figure ${item.figure.n}. `, item.figure.caption));
    return out;
  }
  if (item.table) {
    const out = [];
    if (!item.table.noCaption) out.push(bold(`Table ${item.table.n}. `, item.table.caption));
    out.push(new Table({
      rows: item.table.rows.map((r, ri) => new TableRow({
        children: r.map(c => new TableCell({
          width: { size: 1800, type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: String(c), bold: ri === 0 })] })]
        }))
      }))
    }));
    out.push(new Paragraph(''));
    return out;
  }
  if (item.equation) {
    return [new Paragraph({ children: [new OMath({ children: [new MathRun(item.equation.text)] }), new TextRun(`    (${item.equation.n})`)] })];
  }
  return [];
}

async function buildManuscriptDocx(spec) {
  const omit = new Set(spec.omit || []);
  const children = [
    new Paragraph({ children: [new TextRun({ text: spec.title, bold: true, size: 32 })], spacing: { after: 200 } }),
    bold('Authors: ', spec.authors.join(', ')),
    bold('Affiliations: ', spec.affiliations.join('; ')),
    bold('Corresponding author: ', `${spec.corresponding.name}, ${spec.corresponding.email}`)
  ];
  if (spec.orcid) children.push(bold('ORCID: ', spec.orcid));
  (spec.frontLines || []).forEach(([label, text]) => children.push(bold(label, text)));

  const section = (key, title, items) => {
    if (omit.has(key) || !items || (Array.isArray(items) && !items.length)) return;
    children.push(heading(title));
    (Array.isArray(items) ? items : [items]).forEach(i => children.push(...block(i)));
  };

  section('abstract', 'Abstract', spec.abstract);
  section('keywords', 'Keywords', spec.keywords ? spec.keywords.join('; ') : null);
  section('introduction', 'Introduction', spec.introduction);
  section('methods', 'Experimental Section', spec.methods);
  section('results', 'Results and Discussion', spec.results);
  section('conclusions', 'Conclusions', spec.conclusions);
  section('contributions', 'Author Contributions', spec.contributions);
  section('coi', 'Conflicts of Interest', spec.coi);
  section('data', 'Data Availability', spec.data);
  section('acknowledgments', 'Acknowledgments', spec.acknowledgments);
  if (!omit.has('references') && spec.references) {
    children.push(heading('References'));
    spec.references.forEach((r, i) => children.push(para(`(${i + 1}) ${r}`)));
  }

  const doc = new Document({
    creator: spec.creator || spec.authors[0] || 'Author',
    title: spec.title,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children }]
  });
  return Packer.toBuffer(doc);
}

module.exports = { buildManuscriptDocx };
