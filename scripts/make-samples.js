'use strict';
/** Regenerates the demo files in /samples. Usage: npm run samples */
const fs = require('fs');
const path = require('path');
const { buildManuscriptDocx } = require('../src/msc-builder');
const { buildTemplate } = require('../src/template');
const { GOOD, WEAK } = require('../src/sample-specs');

(async () => {
  const dir = path.join(__dirname, '..', 'samples');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'sample-msc-pass-JACS.docx'), await buildManuscriptDocx(GOOD));
  fs.writeFileSync(path.join(dir, 'sample-msc-fail.docx'), await buildManuscriptDocx(WEAK));
  fs.writeFileSync(path.join(dir, 'JACS-MSC-Template.docx'), await buildTemplate('JACS'));
  console.log('Samples written to', dir);
})().catch(e => { console.error(e); process.exit(1); });
