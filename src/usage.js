'use strict';

/**
 * Usage analytics + audit trail for the prototype.
 *
 *  - Usage sessions (one per login) are kept in data/usage-sessions.json:
 *    user footprint, IP, OS/browser, location, pages visited and time on each
 *    page, and total duration of stay.
 *  - Every security- or workflow-relevant event is appended to
 *    data/audit-log.jsonl (append-only; never rewritten by the app).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.UEP_DATA_DIR || path.join(__dirname, '..', 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'usage-sessions.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit-log.jsonl');
const MAX_SESSIONS = 1000;
const MAX_PAGES_PER_SESSION = 400;
// A session with no heartbeat for this long is treated as ended (tab closed, laptop asleep…)
const IDLE_MS = 2 * 60 * 1000;

let sessions = null;
let saveTimer = null;

function loadSessions() {
  if (sessions) return sessions;
  try { sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8')); } catch { sessions = []; }
  return sessions;
}

function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(flush, 1500);
  if (saveTimer.unref) saveTimer.unref();
}

function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!sessions) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${SESSIONS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(sessions));
  fs.renameSync(tmp, SESSIONS_FILE);
}

// ---------- request details ----------

// Legacy IANA names some browsers still report
const TZ_RENAMED = { Calcutta: 'Kolkata', Saigon: 'Ho Chi Minh City', Kiev: 'Kyiv', Rangoon: 'Yangon', Katmandu: 'Kathmandu' };

function clientIp(req) {
  let ip = req.ip || (req.socket && req.socket.remoteAddress) || '';
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') ip = '127.0.0.1';
  return ip || 'unknown';
}

function isPrivateIp(ip) {
  return /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|fc|fd|fe80|unknown)/i.test(ip);
}

function parseUserAgent(ua = '') {
  let os = 'Unknown';
  let m;
  if ((m = ua.match(/Windows NT ([\d.]+)/))) os = `Windows ${{ '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' }[m[1]] || m[1]}`;
  else if ((m = ua.match(/(iPhone|iPad|iPod).*? OS ([\d_]+)/))) os = `iOS ${m[2].replace(/_/g, '.')}`;
  else if ((m = ua.match(/Mac OS X ([\d_.]+)/))) os = `macOS ${m[1].replace(/_/g, '.')}`;
  else if ((m = ua.match(/Android ([\d.]+)/))) os = `Android ${m[1]}`;
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  const family = os.split(' ')[0];

  let browser = 'Unknown';
  if ((m = ua.match(/Edg(?:e|A|iOS)?\/([\d]+)/))) browser = `Edge ${m[1]}`;
  else if ((m = ua.match(/OPR\/([\d]+)/))) browser = `Opera ${m[1]}`;
  else if ((m = ua.match(/HeadlessChrome\/([\d]+)/))) browser = `Headless Chrome ${m[1]}`;
  else if ((m = ua.match(/(?:Chrome|CriOS)\/([\d]+)/))) browser = `Chrome ${m[1]}`;
  else if ((m = ua.match(/(?:Firefox|FxiOS)\/([\d]+)/))) browser = `Firefox ${m[1]}`;
  else if ((m = ua.match(/Version\/([\d]+).*Safari/))) browser = `Safari ${m[1]}`;
  else if (/curl|node|axios|undici|python/i.test(ua)) browser = 'Script / API client';

  const device = /iPad|Tablet/i.test(ua) ? 'Tablet' : /Mobi|iPhone|Android/i.test(ua) ? 'Mobile' : 'Desktop';
  return { os, osFamily: family, browser, device };
}

/**
 * Location without calling an external geo-IP service: an edge/CDN country
 * header when the host provides one, otherwise the browser's time zone.
 */
function locationFor(req, ip, tz) {
  const country = req.get('cf-ipcountry') || req.get('x-vercel-ip-country') || req.get('x-country-code') || req.get('x-appengine-country') || null;
  const city = req.get('x-vercel-ip-city') || req.get('x-appengine-city') || null;
  let region = null;
  if (tz && /^[A-Za-z_]+\/[A-Za-z_\/-]+$/.test(tz)) {
    const parts = tz.split('/');
    const tzCity = parts[parts.length - 1].replace(/_/g, ' ');
    region = `${TZ_RENAMED[tzCity] || tzCity}, ${parts[0]}`;
  }
  const label = city && country ? `${decodeURIComponent(city)}, ${country}` : country ? `${region ? `${region} · ` : ''}${country}` : region || 'Unknown';
  return {
    label,
    country,
    timeZone: tz || null,
    network: isPrivateIp(ip) ? 'Local / private network' : 'Internet',
    source: country ? 'Hosting edge header' : tz ? 'Browser time zone' : 'Not available'
  };
}

function footprintFor(ip, ua, tz, screen) {
  return crypto.createHash('sha256').update([ip, ua, tz || '', screen || ''].join('|')).digest('hex').slice(0, 12).toUpperCase();
}

function clean(s, max = 200) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').slice(0, max);
}

// ---------- audit trail ----------

function audit(req, event, details = {}) {
  const ua = req ? req.get('user-agent') || '' : '';
  const u = req && req.session && req.session.user;
  const entry = {
    at: new Date().toISOString(),
    event,
    user: u ? u.username : details.user || null,
    role: u ? u.role : details.role || null,
    ip: req ? clientIp(req) : null,
    os: req ? parseUserAgent(ua).os : null,
    usageSessionId: req && req.session ? req.session.usageId || null : null,
    details
  };
  delete entry.details.user;
  delete entry.details.role;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n');
  } catch (e) { console.error('audit write failed', e.message); }
  return entry;
}

function readAudit({ limit = 500, event, user, q } = {}) {
  let lines = [];
  try { lines = fs.readFileSync(AUDIT_FILE, 'utf8').split('\n').filter(Boolean); } catch { return { total: 0, entries: [] }; }
  let entries = [];
  for (const l of lines) { try { entries.push(JSON.parse(l)); } catch { /* skip a torn line */ } }
  const total = entries.length;
  const events = [...new Set(entries.map(e => e.event))].sort();
  if (event) entries = entries.filter(e => e.event === event);
  if (user) entries = entries.filter(e => e.user === user);
  if (q) {
    const needle = q.toLowerCase();
    entries = entries.filter(e => JSON.stringify(e).toLowerCase().includes(needle));
  }
  const matched = entries.length;
  return { total, matched, events, entries: entries.reverse().slice(0, limit) };
}

// ---------- usage sessions ----------

function startSession(req, { tz, lang, screen } = {}) {
  const list = loadSessions();
  const ua = clean(req.get('user-agent') || '', 400);
  const ip = clientIp(req);
  tz = clean(tz, 64) || null;
  const now = new Date().toISOString();
  const s = {
    id: `US-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`,
    user: req.session.user.username,
    role: req.session.user.role,
    footprint: footprintFor(ip, ua, tz, clean(screen, 20)),
    ip,
    ...parseUserAgent(ua),
    userAgent: ua,
    language: clean(lang, 35) || clean(req.get('accept-language') || '', 35).split(',')[0] || null,
    screen: clean(screen, 20) || null,
    location: locationFor(req, ip, tz),
    startedAt: now,
    lastSeenAt: now,
    endedAt: null,
    endReason: null,
    pages: []
  };
  list.push(s);
  if (list.length > MAX_SESSIONS) list.splice(0, list.length - MAX_SESSIONS);
  req.session.usageId = s.id;
  saveSoon();
  return s;
}

function current(req) {
  const id = req.session && req.session.usageId;
  return id ? loadSessions().find(s => s.id === id) || null : null;
}

function closeOpenPage(s, at) {
  const p = s.pages[s.pages.length - 1];
  if (p && !p.closed) {
    p.leftAt = at;
    p.durationMs = Math.max(0, new Date(at) - new Date(p.enteredAt));
    p.closed = true;
  }
}

function trackPage(req, { path: p, title }) {
  const s = current(req);
  if (!s) return null;
  const now = new Date().toISOString();
  // a session that went idle and came back keeps its id but restarts the clock
  if (s.endedAt) { s.endedAt = null; s.endReason = null; }
  closeOpenPage(s, s.lastSeenAt);
  s.pages.push({ path: clean(p, 160), title: clean(title, 120), enteredAt: now, leftAt: now, durationMs: 0, closed: false });
  if (s.pages.length > MAX_PAGES_PER_SESSION) s.pages.splice(0, s.pages.length - MAX_PAGES_PER_SESSION);
  s.lastSeenAt = now;
  saveSoon();
  return s;
}

function heartbeat(req, { leaving } = {}) {
  const s = current(req);
  if (!s) return null;
  const now = new Date().toISOString();
  s.lastSeenAt = now;
  const p = s.pages[s.pages.length - 1];
  if (p && !p.closed) {
    p.leftAt = now;
    p.durationMs = Math.max(0, new Date(now) - new Date(p.enteredAt));
    if (leaving) p.closed = true;
  }
  saveSoon();
  return s;
}

function endSession(req, reason = 'Logged out') {
  const s = current(req);
  if (!s) return null;
  const now = new Date().toISOString();
  closeOpenPage(s, now);
  s.lastSeenAt = now;
  s.endedAt = now;
  s.endReason = reason;
  saveSoon();
  return s;
}

/** Public view of a session with derived duration/status. */
function view(s, now = Date.now()) {
  const last = new Date(s.lastSeenAt).getTime();
  const active = !s.endedAt && now - last < IDLE_MS;
  const end = s.endedAt ? new Date(s.endedAt).getTime() : last;
  const { userAgent, ...rest } = s;
  return {
    ...rest,
    userAgent,
    status: active ? 'Active' : s.endedAt ? s.endReason : 'Ended (idle / tab closed)',
    active,
    durationMs: Math.max(0, end - new Date(s.startedAt).getTime()),
    pageViews: s.pages.length,
    pages: s.pages.map(({ closed, ...p }) => p)
  };
}

function metrics({ days = 30 } = {}) {
  const now = Date.now();
  const since = now - days * 86400000;
  const list = loadSessions().filter(s => new Date(s.startedAt).getTime() >= since).map(s => view(s, now));
  const count = (arr, key) => arr.reduce((acc, x) => { const k = key(x) || 'Unknown'; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
  const allPages = list.flatMap(s => s.pages.map(p => ({ ...p, user: s.user, sessionId: s.id })));
  const pageAgg = {};
  for (const p of allPages) {
    const key = p.path.replace(/^\/review\/[^/?#]+/, '/review/:id').replace(/^\/invite\/[^/?#]+/, '/invite/:token');
    const a = pageAgg[key] || (pageAgg[key] = { path: key, title: p.title, views: 0, totalMs: 0 });
    a.views += 1;
    a.totalMs += p.durationMs;
  }
  const byDay = {};
  for (let i = Math.min(days, 14) - 1; i >= 0; i--) byDay[new Date(now - i * 86400000).toISOString().slice(0, 10)] = 0;
  for (const s of list) { const d = s.startedAt.slice(0, 10); if (d in byDay) byDay[d] += 1; }
  const totalDuration = list.reduce((a, s) => a + s.durationMs, 0);
  return {
    generatedAt: new Date(now).toISOString(),
    windowDays: days,
    idleTimeoutMinutes: IDLE_MS / 60000,
    kpis: {
      sessions: list.length,
      activeNow: list.filter(s => s.active).length,
      uniqueFootprints: new Set(list.map(s => s.footprint)).size,
      uniqueIps: new Set(list.map(s => s.ip)).size,
      pageViews: allPages.length,
      avgSessionMs: list.length ? Math.round(totalDuration / list.length) : 0,
      totalDurationMs: totalDuration
    },
    byOs: count(list, s => s.os),
    byBrowser: count(list, s => s.browser),
    byLocation: count(list, s => s.location && s.location.label),
    byRole: count(list, s => s.role),
    byDay,
    pages: Object.values(pageAgg).sort((a, b) => b.views - a.views)
      .map(p => ({ ...p, avgMs: Math.round(p.totalMs / p.views) })),
    sessions: list.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  };
}

function csvEscape(v) {
  const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function auditCsv(entries) {
  const head = ['at', 'event', 'user', 'role', 'ip', 'os', 'usageSessionId', 'details'];
  return [head.join(',')].concat(entries.map(e => head.map(h => csvEscape(e[h])).join(','))).join('\n');
}

function sessionsCsv(list) {
  const head = ['id', 'user', 'role', 'footprint', 'ip', 'location', 'os', 'browser', 'device', 'startedAt', 'lastSeenAt', 'status', 'durationSeconds', 'pageViews', 'pagesVisited'];
  return [head.join(',')].concat(list.map(s => [
    s.id, s.user, s.role, s.footprint, s.ip, s.location && s.location.label, s.os, s.browser, s.device,
    s.startedAt, s.lastSeenAt, s.status, Math.round(s.durationMs / 1000), s.pageViews,
    s.pages.map(p => `${p.path} (${Math.round(p.durationMs / 1000)}s)`).join(' > ')
  ].map(csvEscape).join(','))).join('\n');
}

function reset() {
  sessions = [];
  flush();
}

module.exports = {
  audit, readAudit, startSession, trackPage, heartbeat, endSession, metrics,
  auditCsv, sessionsCsv, parseUserAgent, clientIp, flush, reset, AUDIT_FILE, SESSIONS_FILE
};
