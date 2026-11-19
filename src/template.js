'use strict';

/**
 * Generates a journal-specific MSC template (.docx) with the required
 * structure, placeholder guidance and the journal's author guidelines.
 */
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, Math: OMath, MathRun
} = require('docx');
const { getJournal } = require('./journals');

const GREY = '7F7F7F';

function guide(text) {
  return new Paragraph({ children: [new TextRun({ text, italics: true, color: GREY })] });
}

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({ text, heading: level, spacing: { before: 240, after: 120 } });
}

function labelled(label, placeholder) {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true }),
      new TextRun({ text: placeholder, italics: true, color: GREY })
    ]
  });
}

function bullet(text) {
  return new Paragraph({ text, bullet: { level: 0 } });
}

function cell(text, bold) {
  return new TableCell({
    width: { size: 2000, type: WidthType.DXA },
    children: [new Paragraph({ children: [new TextRun({ text, bold: !!bold })] })]
  });
}

async function buildTemplate(journalId) {
  const j = getJournal(journalId) || getJournal('JACS');
  const L = j.limits;

  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `${j.name} — Manuscript (MSC) Template`, bold: true, size: 28, color: '1F3864' })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Replace every grey [bracketed] instruction with your content. Delete the "MSC Template Guidelines" section at the end before submission.', italics: true, color: GREY, size: 18 })]
    }),
    new Paragraph({ text: '' }),
    labelled('Title', `[Insert a concise, specific title — maximum ${L.titleChars} characters]`),
    labelled('Authors', '[Insert author names in submission order, separated by commas, e.g. Jane A. Doe, John B. Smith and Wei Chen]'),
    labelled('Affiliations', '[Insert full affiliations: Department, Institution, City, Postal Code, Country]'),
    labelled('Corresponding author', '[Insert name and institutional e-mail, e.g. Jane A. Doe, jane.doe@university.edu]'),
    labelled('ORCID', '[Insert ORCID iD of the corresponding author, e.g. 0000-000X-XXXX-XXXX]'),

    heading('Abstract'),
    guide(`[Insert a single-paragraph abstract of at most ${L.abstractWords} words describing the problem, the approach, the key quantitative results and their significance. Do not cite references.]`),

    heading('Keywords'),
    guide(`[Insert 3–${L.maxKeywords} keywords separated by semicolons]`),

    heading('Introduction'),
    guide('[Insert the background and motivation. Place the work in the context of the current literature, citing references in order of appearance with superscript numbers or [1]-style brackets. End with a clear statement of the objective.]'),

    heading('Experimental Section'),
    guide('[Insert materials, instrumentation and procedures in sufficient detail for reproduction. Extended procedures and characterisation data belong in the Supporting Information.]'),

    heading('Results and Discussion'),
    guide('[Insert results and their interpretation. Refer to every figure, table and equation in the text, e.g. "as shown in Figure 1", "summarised in Table 1", "according to eq 1".]'),
    guide('[Figures: embed each figure in the document directly above a numbered caption, as in the example below.]'),
    new Paragraph({ children: [new TextRun({ text: 'Figure 1. ', bold: true }), new TextRun({ text: '[Insert caption describing the figure; define all symbols and abbreviations.]', italics: true, color: GREY })] }),
    guide('[Tables: use editable Word tables (never images), with a numbered title above and units in the header row.]'),
    new Paragraph({ children: [new TextRun({ text: 'Table 1. ', bold: true }), new TextRun({ text: '[Insert table title]', italics: true, color: GREY })] }),
    new Table({
      rows: [
        new TableRow({ children: [cell('Entry', true), cell('Conditions', true), cell('Yield (%)', true)] }),
        new TableRow({ children: [cell('1'), cell('[conditions]'), cell('[value]')] }),
        new TableRow({ children: [cell('2'), cell('[conditions]'), cell('[value]')] })
      ]
    }),
    guide('[Equations: insert display equations with the Word equation editor and number them, e.g.]'),
    new Paragraph({ children: [new OMath({ children: [new MathRun('k = A exp(−Ea/RT)')] }), new TextRun('    (1)')] }),

    heading('Conclusions'),
    guide('[Insert the main conclusions and their broader significance. Do not repeat the abstract.]'),

    heading('Author Contributions'),
    guide('[Insert each author\'s contribution using CRediT roles.]'),

    heading('Conflicts of Interest'),
    guide('[Insert competing interests, or state: "The authors declare no competing financial interest."]'),

    heading('Data Availability'),
    guide('[Insert where the data supporting this study can be accessed.]'),

    heading('Acknowledgments'),
    guide('[Insert funding sources with grant numbers and other acknowledgments.]'),

    heading('References'),
    guide('[Insert references in ACS style, numbered in order of first citation, e.g.: (1) Doe, J. A.; Smith, J. B. Title of the Article. J. Am. Chem. Soc. 2024, 146, 1234–1240.]'),

    heading('MSC Template Guidelines'),
    guide('Delete this entire section before submitting.'),
    new Paragraph({ children: [new TextRun({ text: `${j.name} (${j.shortName})`, bold: true })] }),
    new Paragraph({ text: `Scope: ${j.context}. Genre: ${j.genre}.` }),
    new Paragraph({ children: [new TextRun({ text: 'Specifications', bold: true })] }),
    bullet('File format: Microsoft Word .docx (legacy .doc, PDF and LaTeX source are not accepted by the integrity check).'),
    bullet(`Title: at most ${L.titleChars} characters.`),
    bullet(`Abstract: a single paragraph, at most ${L.abstractWords} words, with no references.`),
    bullet(`Keywords: 3–${L.maxKeywords}.`),
    bullet(`Total length: at most ${L.totalWords} words including references; move extended data to the Supporting Information.`),
    bullet(`References: ACS style, numbered in order of citation; typically at least ${L.minReferences}. Every reference must be cited in the text and every citation must have a reference.`),
    bullet('Figures and schemes: embedded in the document, numbered consecutively with captions, each referenced in the text.'),
    bullet('Tables: editable Word tables with a numbered title, header row and units in headers; no empty cells (use "—" or "n.d.").'),
    bullet('Equations: created with the Word equation editor, numbered and referenced in the text.'),
    new Paragraph({ children: [new TextRun({ text: 'Integrity and authorship', bold: true })] }),
    bullet('List every author and their affiliation; provide the corresponding author\'s institutional e-mail and ORCID iD.'),
    bullet('Include Conflicts of Interest, Data Availability and Author Contributions statements.'),
    bullet('Remove tracked changes and comments. Ensure the document properties do not list non-authors.'),
    bullet('Text similarity with published work must be minimal; quote and cite any reused text.'),
    new Paragraph({ children: [new TextRun({ text: 'Integrity score', bold: true })] }),
    bullet('The platform scores the MSC from 1 to 10. A score above 6 is a PASS and the MSC can be submitted; a score of 6 or below requires you to address the feedback and re-submit.')
  ];

  const doc = new Document({
    creator: 'Unified Editorial Platform',
    title: `${j.shortName} MSC Template`,
    description: `Manuscript template for ${j.name}`,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children }]
  });
  return Packer.toBuffer(doc);
}

module.exports = { buildTemplate };
