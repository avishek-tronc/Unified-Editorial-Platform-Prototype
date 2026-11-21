/* Shared helpers for all pages */
if (window.Chart) { Chart.defaults.font.family = '"Source Sans 3", "Segoe UI", Helvetica, Arial, sans-serif'; Chart.defaults.color = '#5d6b7e'; }
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
        <span class="org">American Chemical Society · Publications</span>
        <div class="spacer"></div>
        <span class="user">Signed in as <b>${esc(me.displayName)}</b></span>
        <span class="sep"></span>
        <a href="/metrics" class="metrics-link ${active === 'metrics' ? 'active' : ''}" title="Usage analytics &amp; audit trail">📈 Usage Metrics</a>
        <span class="sep"></span>
        <button class="small" id="logoutBtn">Log out</button>
      </div>
      <div class="mainbar">
        <div class="logo"><span class="mark">ACS</span><span class="divider"></span>Unified Editorial Platform <span class="badge">${esc(me.role)} view</span></div>
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

  return { api, esc, fmtDate, fmtElapsed, scoreColor, toast, initTopbar };
})();
