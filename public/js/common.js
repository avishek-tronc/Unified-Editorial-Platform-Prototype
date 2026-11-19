/* Shared helpers for all pages */
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
      <div class="logo">📚 Unified Editorial Platform <span class="badge">${esc(me.role)} view</span></div>
      <nav>${nav}</nav>
      <div class="spacer"></div>
      <div class="user">Signed in as <b>${esc(me.displayName)}</b></div>
      <button class="small" id="logoutBtn">Log out</button>`;
    document.getElementById('logoutBtn').onclick = async () => {
      await api('/api/logout', { method: 'POST' });
      location.href = '/login';
    };
    return me;
  }

  return { api, esc, fmtDate, fmtElapsed, scoreColor, toast, initTopbar };
})();
