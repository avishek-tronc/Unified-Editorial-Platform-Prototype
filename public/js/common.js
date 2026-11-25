/* Shared helpers for all pages */

// ----- global "processing" spinner: shown while any request to the server is in flight -----
const UEPBusy = (() => {
  let count = 0; let showTimer = null; let shownAt = 0; let el = null;
  const QUIET = /\/api\/track\//; // background usage tracking never shows the spinner
  function node() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'busy-indicator';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<span class="busy-spinner" aria-hidden="true"></span><span class="busy-label">Processing…</span>';
    document.body.appendChild(el);
    return el;
  }
  function start(label) {
    count += 1;
    if (count === 1) {
      clearTimeout(showTimer);
      showTimer = setTimeout(() => {
        if (!count) return;
        const n = node();
        n.querySelector('.busy-label').textContent = label || 'Processing…';
        n.classList.add('show');
        document.documentElement.classList.add('is-busy');
        shownAt = Date.now();
      }, 150); // skip the spinner for very fast requests
    }
  }
  function stop() {
    count = Math.max(0, count - 1);
    if (count) return;
    clearTimeout(showTimer);
    const wait = shownAt ? Math.max(0, 350 - (Date.now() - shownAt)) : 0; // no flicker
    setTimeout(() => {
      if (count) return;
      if (el) el.classList.remove('show');
      document.documentElement.classList.remove('is-busy');
      shownAt = 0;
    }, wait);
  }
  /** Wraps any promise (or async function) so the spinner shows while it runs. */
  async function wrap(work, label) {
    start(label);
    try { return await (typeof work === 'function' ? work() : work); } finally { stop(); }
  }
  if (window.fetch && !window.fetch.__uepBusy) {
    const orig = window.fetch.bind(window);
    const patched = (input, init) => {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (QUIET.test(url)) return orig(input, init);
      const method = ((init && init.method) || 'GET').toUpperCase();
      const label = init && init.body instanceof FormData ? 'Uploading and processing…' : method === 'GET' ? 'Loading…' : 'Processing…';
      return wrap(() => orig(input, init), label);
    };
    patched.__uepBusy = true;
    window.fetch = patched;
  }
  return { start, stop, wrap };
})();

if (window.Chart) { Chart.defaults.font.family = 'Roboto, Helvetica, Arial, sans-serif'; Chart.defaults.color = '#4a4a52'; }
const UEP = (() => {
  async function api(url, opts = {}) {
    const o = { credentials: 'same-origin', ...opts };
    if (o.body && !(o.body instanceof FormData)) {
      o.headers = { 'Content-Type': 'application/json', ...(o.headers || {}) };
      o.body = JSON.stringify(o.body);
    }
    const res = await fetch(url, o);
    if (res.status === 401) { location.href = '/login'; throw new Error('Not logged in'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function fmtDate(iso, withTime = true) {
    if (!iso) return '—';
    const d = new Date(iso);
    const opts = withTime ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'short', year: 'numeric' };
    return d.toLocaleString(undefined, opts);
  }

  function fmtElapsed(hours) {
    if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
    if (hours < 24) return `${hours.toFixed(1)} h`;
    const d = Math.floor(hours / 24);
    const h = Math.round(hours - d * 24);
    return `${d} d ${h} h`;
  }

  function scoreColor(score) {
    return score > 6 ? 'var(--green)' : score > 4 ? 'var(--amber)' : 'var(--red)';
  }

  function toast(msg, ms = 2600) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  // ----- person logo beside "Signed in as": one look per role -----
  const ROLE_BADGE = {
    // pen nib: the author writes and submits the MSC
    Author: { color: '#12805c', glyph: '<path d="M-3.2 3.2 L1.6 -1.6 L3.2 0 L-1.6 4.8 Z M2.2 -2.2 L3 -3 L4.6 -1.4 L3.8 -0.6 Z" fill="#fff"/>' },
    // clipboard tick: the editor manages and decides
    Editor: { color: '#0039a6', glyph: '<rect x="-3.2" y="-3.4" width="6.4" height="7.6" rx="1" fill="none" stroke="#fff" stroke-width="1.2"/><path d="M-1.7 0.6 L-0.4 1.9 L1.9 -0.8" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>' },
    // magnifier: the reviewer examines the MSC
    Reviewer: { color: '#6d3fc0', glyph: '<circle cx="-0.8" cy="-0.8" r="2.6" fill="none" stroke="#fff" stroke-width="1.3"/><path d="M1.2 1.2 L3.6 3.6" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>' }
  };
  function personIcon(role) {
    const b = ROLE_BADGE[role] || ROLE_BADGE.Author;
    return `<span class="person-logo role-${esc(String(role).toLowerCase())}" title="${esc(role)}" aria-label="${esc(role)}" role="img">
      <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
        <circle cx="16" cy="16" r="15" fill="#fff"/>
        <circle cx="16" cy="12.2" r="5.2" fill="${b.color}"/>
        <path d="M6.2 26.4 C7.4 20.6 11.2 18.6 16 18.6 C20.8 18.6 24.6 20.6 25.8 26.4 C23.2 28.8 19.8 30 16 30 C12.2 30 8.8 28.8 6.2 26.4 Z" fill="${b.color}"/>
        <g transform="translate(25.4 24.6)"><circle r="6" fill="${b.color}" stroke="#fff" stroke-width="1.4"/>${b.glyph}</g>
      </svg></span>`;
  }

  async function initTopbar(active) {
    const me = await api('/api/me');
    const bar = document.querySelector('.topbar');
    if (!bar) return me;
    const nav = me.role === 'Author'
      ? `<a href="/author" class="${active === 'author' ? 'active' : ''}">MSC Upload</a>`
      : `<a href="/dashboard" class="${active === 'dashboard' ? 'active' : ''}">${me.role === 'Reviewer' ? 'My assigned MSCs' : 'MSC Dashboard'}</a>`;
    bar.innerHTML = `
      <div class="utility">
        <span class="site active">Unified Editorial Platform</span>
        <span class="spacer"></span>
        <span class="user">${personIcon(me.role)}Signed in as&nbsp;<b>${esc(me.displayName)}</b></span>
        <span class="sep"></span>
        <a href="/metrics" class="metrics-link ${active === 'metrics' ? 'active' : ''}" title="Usage analytics &amp; audit trail">Usage Metrics</a>
        <span class="sep"></span>
        <button class="small" id="logoutBtn">Log out</button>
      </div>
      <div class="mainbar">
        <div class="logo"><span class="name">Unified Editorial Platform</span><span class="tagline">ACS Publications · Editorial Office</span></div>
        <span class="role">${esc(me.role)} view</span>
        <span class="spacer"></span>
        <nav>${nav}</nav>
      </div>`;
    document.getElementById('logoutBtn').onclick = async () => {
      stopTracking();
      await api('/api/logout', { method: 'POST' });
      location.href = '/login';
    };
    startTracking();
    return me;
  }

  // ----- usage tracking: page view, heartbeat while visible, beacon on leave -----
  let hbTimer = null; let tracking = false;
  function post(url, body) {
    return fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).catch(() => {});
  }
  function beat() { if (document.visibilityState === 'visible') post('/api/track/heartbeat'); }
  function startTracking() {
    if (tracking) return;
    tracking = true;
    post('/api/track/page', { path: location.pathname + location.search, title: document.title });
    hbTimer = setInterval(beat, 20000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') beat(); });
    window.addEventListener('pagehide', () => {
      if (!tracking) return;
      if (navigator.sendBeacon) navigator.sendBeacon('/api/track/leave', new Blob(['{}'], { type: 'text/plain' }));
      else post('/api/track/leave');
    });
  }
  function stopTracking() { tracking = false; clearInterval(hbTimer); }

  // ----- journal cover thumbnails (current issue cover from pubs.acs.org) -----
  function journalCover(j, size = 'md') {
    if (!j) return '';
    const label = `${j.name} — current issue cover`;
    return `<a class="jcover jcover-${size}" href="${esc(j.homepage || '#')}" target="_blank" rel="noopener" title="${esc(label)}">
      <img src="${esc(j.cover || '')}" alt="${esc(label)}" loading="lazy" referrerpolicy="no-referrer"
        data-short="${esc(j.shortName)}" data-name="${esc(j.name)}" onerror="UEP.coverFallback(this)"></a>`;
  }
  // If the cover can't be loaded (offline, CDN blocked), draw a plain journal-style cover instead.
  function coverFallback(img) {
    img.onerror = null;
    const words = img.dataset.short.length > 12 ? img.dataset.short.split(' ') : [img.dataset.short];
    const lines = words.map((w, i) => `<text x="130" y="${170 + i * 34}" font-size="30" font-weight="700" text-anchor="middle" fill="#fff" font-family="Roboto,Arial,sans-serif">${esc(w)}</text>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 345"><rect width="260" height="345" fill="#0039a6"/><rect y="0" width="260" height="10" fill="#fdc82f"/>
      <circle cx="210" cy="290" r="90" fill="#412bfd" opacity=".55"/><circle cx="40" cy="70" r="60" fill="#3361b8" opacity=".5"/>${lines}
      <text x="130" y="320" font-size="13" text-anchor="middle" fill="#e6ebf6" font-family="Roboto,Arial,sans-serif">ACS Publications</text></svg>`;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    img.closest('.jcover').classList.add('fallback');
  }

  return { api, esc, fmtDate, fmtElapsed, scoreColor, toast, initTopbar, personIcon, journalCover, coverFallback, busy: UEPBusy.wrap };
})();
