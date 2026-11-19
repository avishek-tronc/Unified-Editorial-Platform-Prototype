'use strict';
/** Deletes data/db.json and re-seeds the demo data. Usage: npm run reset */
const fs = require('fs');
const store = require('../src/store');
const { buildSeed } = require('../src/seed');

(async () => {
  if (fs.existsSync(store.DB_FILE)) fs.unlinkSync(store.DB_FILE);
  const db = await buildSeed();
  console.log(`Seeded ${db.mscs.length} MSCs, ${db.editors.length} editors and ${db.reviewers.length} reviewers into ${store.DB_FILE}`);
})().catch(e => { console.error(e); process.exit(1); });
