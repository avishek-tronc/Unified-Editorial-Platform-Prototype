'use strict';

/**
 * Minimal JSON-file persistence for the prototype (data/db.json).
 * Swap for a real database in production.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.UEP_DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let db = null;

function load() {
  if (db) return db;
  if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  }
  return db;
}

function set(newDb) {
  db = newDb;
  save();
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}

function get() {
  if (!db) throw new Error('Database not initialised');
  return db;
}

function nextMscId() {
  const d = get();
  d.counters.msc += 1;
  return `MSC-${new Date().getFullYear()}-${d.counters.msc}`;
}

function nextId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

module.exports = { load, set, save, get, nextMscId, nextId, DB_FILE };
