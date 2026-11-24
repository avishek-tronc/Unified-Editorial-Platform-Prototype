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

  async function initTopbar(active) {
    const me = await api('/api/me');
    const bar = document.querySelector('.topbar');
    if (!bar) return me;
    const nav = me.role === 'Editor'
      ? `<a href="/dashboard" class="${active === 'dashboard' ? 'active' : ''}">MSC Dashboard</a>`
      : `<a href="/author" class="${active === 'author' ? 'active' : ''}">MSC Upload</a>`;
    bar.innerHTML = `
      <div class="utility">
        <span class="site active">Unified Editorial Platform</span>
        <span class="spacer"></span>
        <span class="user">Signed in as&nbsp;<b>${esc(me.displayName)}</b></span>
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

  return { api, esc, fmtDate, fmtElapsed, scoreColor, toast, initTopbar, journalCover, coverFallback, busy: UEPBusy.wrap };
})();
