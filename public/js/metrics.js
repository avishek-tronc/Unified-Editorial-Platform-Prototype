(async () => {
  const { api, esc, fmtDate } = UEP;
  await UEP.initTopbar('metrics');
  const $ = id => document.getElementById(id);
  const PALETTE = ['#0039a6', '#412bfd', '#3361b8', '#fdc82f', '#12805c', '#6d3fc0', '#c0392b', '#9aa4b8'];
  const charts = {};
  let data = null;
  let tab = 'sessions';
  const open = new Set();

  function dur(ms) {
    const s = Math.round((ms || 0) / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  }

  function chart(id, type, labels, values, opts = {}) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart($(id), {
      type,
      data: { labels, datasets: [{ data: values, backgroundColor: type === 'doughnut' ? PALETTE : '#0039a6', borderRadius: type === 'bar' ? 4 : 0 }] },
      options: Object.assign({
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: type === 'doughnut', position: 'right', labels: { boxWidth: 8, font: { size: 10 }, padding: 6 } } },
        scales: type === 'bar' ? { x: { ticks: { font: { size: 10 } } }, y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } } } } : undefined
      }, opts)
    });
  }

  function top(obj, n = 6) {
    const e = Object.entries(obj).sort((a, b) => b[1] - a[1]);
    if (e.length <= n) return e;
    const rest = e.slice(n - 1).reduce((a, x) => a + x[1], 0);
    return e.slice(0, n - 1).concat([['Other', rest]]);
  }

  function renderKpis() {
    const k = data.kpis;
    const tiles = [
      ['Sessions', k.sessions, `logins in the period`],
      ['Active now', k.activeNow, 'heartbeat in the last 2 min'],
      ['User footprints', k.uniqueFootprints, 'distinct device fingerprints'],
      ['Unique IPs', k.uniqueIps, 'distinct client addresses'],
      ['Page views', k.pageViews, 'pages visited'],
      ['Avg duration of stay', dur(k.avgSessionMs), `total ${dur(k.totalDurationMs)}`]
    ];
    $('kpis').innerHTML = tiles.map(([l, v, s]) => `<div class="kpi"><div class="label">${esc(l)}</div><div class="value">${esc(v)}</div><div class="sub">${esc(s)}</div></div>`).join('');
  }

  function renderCharts() {
    const days = Object.entries(data.byDay);
    chart('chDay', 'bar', days.map(d => d[0].slice(5)), days.map(d => d[1]));
    const os = top(data.byOs); chart('chOs', 'doughnut', os.map(x => x[0]), os.map(x => x[1]));
    const loc = top(data.byLocation); chart('chLoc', 'doughnut', loc.map(x => x[0]), loc.map(x => x[1]));
    const pages = data.pages.slice(0, 6);
    chart('chPages', 'bar', pages.map(p => p.path), pages.map(p => p.views), { indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } } }, y: { ticks: { font: { size: 10 } } } } });
  }

  function statusPill(s) {
    if (s.active) return `<span class="pill green">● Active${s.id === data.currentSessionId ? ' (you)' : ''}</span>`;
    return `<span class="pill grey">${esc(s.status)}</span>`;
  }

  function renderSessions() {
    const tb = $('sessTable').querySelector('tbody');
    if (!data.sessions.length) { tb.innerHTML = '<tr><td colspan="9" class="muted" style="text-align:center;padding:24px">No sessions recorded in this period.</td></tr>'; return; }
    tb.innerHTML = data.sessions.map(s => `
      <tr>
        <td>${esc(fmtDate(s.startedAt))}</td>
        <td><b>${esc(s.user)}</b><div class="small muted">${esc(s.role)}</div></td>
        <td><code title="${esc(s.userAgent)}">${esc(s.footprint)}</code></td>
        <td>${esc(s.ip)}</td>
        <td>${esc(s.location.label)}<div class="small muted">${esc(s.location.network)} · ${esc(s.location.source)}</div></td>
        <td>${esc(s.os)}<div class="small muted">${esc(s.browser)} · ${esc(s.device)}${s.screen ? ` · ${esc(s.screen)}` : ''}</div></td>
        <td><b>${dur(s.durationMs)}</b><div class="small muted">last seen ${esc(fmtDate(s.lastSeenAt))}</div></td>
        <td><a href="#" data-sess="${esc(s.id)}">${s.pageViews} page${s.pageViews === 1 ? '' : 's'} ${open.has(s.id) ? '▾' : '▸'}</a></td>
        <td>${statusPill(s)}</td>
      </tr>
      ${open.has(s.id) ? `<tr class="sub-row"><td></td><td colspan="8">
        <ol class="page-trail">${s.pages.map(p => `<li><span class="muted small">${esc(fmtDate(p.enteredAt))}</span> <b>${esc(p.path)}</b> <span class="muted">${esc(p.title)}</span> <span class="pill blue">${dur(p.durationMs)}</span></li>`).join('') || '<li class="muted">No page views.</li>'}</ol>
      </td></tr>` : ''}`).join('');
    tb.querySelectorAll('[data-sess]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      const id = a.dataset.sess;
      open.has(id) ? open.delete(id) : open.add(id);
      renderSessions();
    }));
  }

  function renderPages() {
    const tb = $('pageTable').querySelector('tbody');
    tb.innerHTML = data.pages.map(p => `<tr><td><b>${esc(p.path)}</b></td><td>${esc(p.title)}</td><td>${p.views}</td><td>${dur(p.totalMs)}</td><td>${dur(p.avgMs)}</td></tr>`).join('')
      || '<tr><td colspan="5" class="muted" style="text-align:center;padding:24px">No page views yet.</td></tr>';
  }

  function detailText(d) {
    return Object.entries(d || {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `<span class="muted">${esc(k)}:</span> ${esc(typeof v === 'object' ? JSON.stringify(v) : v)}`).join(' · ');
  }

  const EVENT_PILL = e => e.startsWith('login.failed') ? 'red' : e.startsWith('login') || e === 'logout' ? 'blue'
    : e.startsWith('invitation') ? 'amber' : e.startsWith('review') ? 'violet' : e.startsWith('msc') ? 'green' : 'grey';

  let auditTimer = null;
  async function loadAudit() {
    const q = new URLSearchParams({ limit: 500 });
    if ($('aEvent').value) q.set('event', $('aEvent').value);
    if ($('aSearch').value.trim()) q.set('q', $('aSearch').value.trim());
    const a = await api(`/api/metrics/audit?${q}`);
    const keep = $('aEvent').value;
    $('aEvent').innerHTML = '<option value="">All events</option>' + a.events.map(e => `<option>${esc(e)}</option>`).join('');
    $('aEvent').value = keep;
    $('aCount').textContent = `${a.matched} of ${a.total} events${a.matched > a.entries.length ? ` (latest ${a.entries.length} shown)` : ''}`;
    $('auditTable').querySelector('tbody').innerHTML = a.entries.map(e => `
      <tr><td style="white-space:nowrap">${esc(fmtDate(e.at))}</td><td><span class="pill ${EVENT_PILL(e.event)}">${esc(e.event)}</span></td>
      <td>${esc(e.user || '— (reviewer link)')}${e.role ? `<div class="small muted">${esc(e.role)}</div>` : ''}</td><td>${esc(e.ip || '')}</td><td>${esc(e.os || '')}</td>
      <td class="small">${detailText(e.details)}</td></tr>`).join('')
      || '<tr><td colspan="6" class="muted" style="text-align:center;padding:24px">No audit events match.</td></tr>';
  }
  $('aEvent').addEventListener('change', loadAudit);
  $('aSearch').addEventListener('input', () => { clearTimeout(auditTimer); auditTimer = setTimeout(loadAudit, 250); });

  $('mTabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    $('mTabs').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    ['sessions', 'pages', 'audit'].forEach(t => $(`tab-${t}`).classList.toggle('hidden', t !== tab));
    if (tab === 'audit') loadAudit();
  });

  async function load() {
    data = await api(`/api/metrics?days=${$('days').value}`);
    $('idleMin').textContent = data.idleTimeoutMinutes;
    $('updatedAt').textContent = `Updated ${new Date().toLocaleTimeString()}`;
    renderKpis(); renderCharts(); renderSessions(); renderPages();
    if (tab === 'audit') loadAudit();
  }
  $('days').addEventListener('change', load);
  $('refreshBtn').addEventListener('click', load);
  await load();
  setInterval(load, 30000);
})();
