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

// Large manuscript bodies live in data/contents/<sha256>.json (one file per
// distinct uploaded .docx) so db.json stays small and fast to rewrite.
const CONTENT_DIR = path.join(DATA_DIR, 'contents');
const contentCache = new Map();

function putContent(hash, content) {
  if (contentCache.has(hash)) return;
  fs.mkdirSync(CONTENT_DIR, { recursive: true });
  const file = path.join(CONTENT_DIR, `${hash}.json`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(content));
  contentCache.set(hash, content);
}

function getContent(hash) {
  if (contentCache.has(hash)) return contentCache.get(hash);
  const file = path.join(CONTENT_DIR, `${hash}.json`);
  if (!/^[a-f0-9]{64}$/.test(hash || '') || !fs.existsSync(file)) return null;
  const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  contentCache.set(hash, c);
  return c;
}

function clearContents() {
  contentCache.clear();
  fs.rmSync(CONTENT_DIR, { recursive: true, force: true });
}

module.exports = { load, set, save, get, nextMscId, nextId, putContent, getContent, clearContents, DB_FILE };
