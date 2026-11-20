(async () => {
  const { api, esc, fmtDate, fmtElapsed, toast } = UEP;
  await UEP.initTopbar('dashboard');

  const COLORS = { green: '#12805c', amber: '#e19a17', red: '#c0392b', blue: '#2f6fde', violet: '#6d3fc0', grey: '#9aa4b8', teal: '#16a085' };
  const DECISION_COLORS = { Accept: COLORS.green, Reject: COLORS.red, Transfer: COLORS.violet, Revise: COLORS.amber, 'Assign to PE': '#0e6a7d', Pending: COLORS.grey };
  let page = 1;
  let tab = 'active'; // 'active' = Open & In Progress, 'complete' = Complete
  let pageSize = Number(localStorage.getItem('uep.pageSize')) || 20;
  let data = { mscs: [], editors: [], reviewers: [] };
  let journals = [];
  let sort = { key: 'submittedAt', dir: -1 };
  const charts = {};
  const $ = id => document.getElementById(id);

  journals = await api('/api/journals');
  $('fJournal').innerHTML = '<option value="">All journals</option>' + journals.map(j => `<option value="${j.id}">${esc(j.shortName)}</option>`).join('');

  async function load() {
    data = await api('/api/editor/mscs');
    const authors = [...new Set(data.mscs.map(m => m.authorName))].sort();
    const keepA = $('fAuthor').value; const keepR = $('fReviewer').value;
    $('fAuthor').innerHTML = '<option value="">All authors</option>' + authors.map(a => `<option>${esc(a)}</option>`).join('');
    $('fReviewer').innerHTML = '<option value="">All reviewers</option>' + data.reviewers.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
    $('fAuthor').value = keepA; $('fReviewer').value = keepR;
    $('updatedAt').textContent = `Updated ${new Date().toLocaleTimeString()}`;
    render();
  }

  function filtered() {
    const f = {
      from: $('fFrom').value, to: $('fTo').value, author: $('fAuthor').value, reviewer: $('fReviewer').value,
      assigned: $('fAssigned').value, elapsed: $('fElapsed').value, journal: $('fJournal').value,
      status: $('fStatus').value, feedback: $('fFeedback').value, decision: $('fDecision').value,
      q: $('fSearch').value.trim().toLowerCase()
    };
    return data.mscs.filter(m => {
      const day = m.submittedAt.slice(0, 10);
      const localDay = new Date(m.submittedAt).toLocaleDateString('en-CA');
      if (f.from && localDay < f.from && day < f.from) return false;
      if (f.to && localDay > f.to && day > f.to) return false;
      if (f.author && m.authorName !== f.author) return false;
      if (f.reviewer && !(m.assignedReviewerId === f.reviewer && m.reviewStatus !== 'Complete')) return false;
      if (f.assigned === 'Assigned' && !m.assignedReviewerId) return false;
      if (f.assigned === 'Unassigned' && m.assignedReviewerId) return false;
      // Time-elapsed bands apply to Open / In Progress MSCs only.
      if (f.elapsed && (m.reviewStatus === 'Complete' || m.elapsedBand !== f.elapsed)) return false;
      if (f.journal && m.journalId !== f.journal) return false;
      if (f.status && m.reviewStatus !== f.status) return false;
      if (f.feedback && m.feedbackStatus !== f.feedback) return false;
      if (f.decision === 'none' && m.finalDecision) return false;
      if (f.decision && f.decision !== 'none' && m.finalDecision !== f.decision) return false;
      if (f.q && !(`${m.id} ${m.title} ${m.authorName}`.toLowerCase().includes(f.q))) return false;
      return true;
    });
  }

  function statusPill(s) {
    return `<span class="pill ${s === 'Open' ? 'blue' : s === 'In Progress' ? 'amber' : 'green'}">${s}</span>`;
  }

  function decisionCell(m) {
    if (!m.finalDecision) return '<span class="muted">Pending</span>';
    const cls = { Accept: 'green', Reject: 'red', Transfer: 'violet', Revise: 'amber', 'Assign to PE': 'teal' }[m.finalDecision];
    const extra = m.finalDecision === 'Revise' ? ` (${m.revisionType})` : m.finalDecision === 'Transfer' ? ` → ${m.transferredTo}` : m.finalDecision === 'Assign to PE' && m.publishingEditor ? ` → ${m.publishingEditor}` : '';
    return `<span class="pill ${cls}">${m.finalDecision}${extra}</span>${m.feedbackStatus ? `<div class="muted small">Feedback: ${m.feedbackStatus}</div>` : ''}`;
  }

  function fmtDateShort(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: '2-digit' })}<br><span class="muted">${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>`;
  }

  function renderTable(allRows) {
    const activeRows = allRows.filter(m => m.reviewStatus !== 'Complete');
    const completeRows = allRows.filter(m => m.reviewStatus === 'Complete');
    $('tabActiveCount').textContent = activeRows.length;
    $('tabCompleteCount').textContent = completeRows.length;
    const rows = tab === 'active' ? activeRows : completeRows;
    const k = sort.key;
    rows.sort((a, b) => {
      const va = a[k] == null ? '' : a[k]; const vb = b[k] == null ? '' : b[k];
      return (va > vb ? 1 : va < vb ? -1 : 0) * sort.dir;
    });
    document.querySelectorAll('#mscTable th[data-sort]').forEach(th => {
      th.textContent = th.textContent.replace(/ [▲▼]$/, '') + (th.dataset.sort === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : '');
    });
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    page = Math.min(Math.max(1, page), pages);
    const from = (page - 1) * pageSize;
    const pageRows = rows.slice(from, from + pageSize);
    $('countLabel').textContent = rows.length
      ? `Showing ${from + 1}–${from + pageRows.length} of ${rows.length} ${tab === 'active' ? 'open & in-progress' : 'complete'} MSCs`
      : `No ${tab === 'active' ? 'open or in-progress' : 'complete'} MSCs match the filters`;
    renderPager(pages);
    const tb = document.querySelector('#mscTable tbody');
    if (!rows.length) { tb.innerHTML = '<tr><td colspan="17" class="muted" style="text-align:center;padding:30px">No manuscripts in this tab match the filters.</td></tr>'; return; }
    tb.innerHTML = pageRows.map(m => {
      const active = m.reviewStatus === 'Open' || m.reviewStatus === 'In Progress';
      const blockedTip = !active ? 'Review is complete'
        : !m.assignedReviewerId ? 'Assign a reviewer first (Look up) to enable review'
        : m.invitationStatus === 'Pending' ? 'Waiting for the reviewer to accept the invitation' : 'Review not available';
      const j = journals.find(x => x.id === m.journalId);
      return `<tr>
        <td>${m.canReview ? `<a class="msc-link" href="/review/${encodeURIComponent(m.id)}" title="Open the MSC review &amp; annotation page">${esc(m.id)}</a>` : `<span class="msc-id" title="${blockedTip}">${esc(m.id)}</span>`}</td>
        <td class="title-cell" title="${esc(m.intro)}">${esc(m.title)}</td>
        <td>${esc(m.authorName)}</td>
        <td>${fmtDateShort(m.submittedAt)}</td>
        <td><span class="pill ${m.integrityPassed ? 'green' : 'red'}">${m.integrityPassed ? 'PASSED' : 'FAILED'}</span></td>
        <td><b>${m.integrityScore}</b> / 10</td>
        <td><b>${m.fitmentIndex ?? '—'}</b> <span class="muted small">${esc(j ? j.shortName : m.journalId)}</span>
          ${m.recommendedJournal && m.recommendedJournal.journalId !== m.journalId && m.recommendedJournal.fitmentIndex >= m.fitmentIndex + 15 ? `<div class="small" style="color:var(--violet)">Better fit: ${esc(m.recommendedJournal.journalId)} (${m.recommendedJournal.fitmentIndex})</div>` : ''}</td>
        <td>${m.revisions ? `<span class="pill violet">Yes (${m.revisions})</span>` : '<span class="pill grey">No</span>'}</td>
        <td>${esc(m.assignedEditor || '—')}</td>
        <td>${reviewerCell(m)}</td>
        <td>${active ? `<a href="#" data-lookup="${esc(m.id)}">🔍 ${m.assignedReviewer ? 'Change' : 'Look up'}</a>` : '<span class="muted">—</span>'}</td>
        <td>${statusPill(m.reviewStatus)}</td>
        <td><span class="pill ${m.elapsedBand}" title="${m.reviewStatus === 'Complete' ? 'Time from receipt to decision' : 'Time since receipt'}">${fmtElapsed(m.elapsedHours)}</span></td>
        <td>${fmtDateShort(m.reviewStartAt)}</td>
        <td><div class="progress"><div class="bar"><span style="width:${m.reviewProgress}%;background:${m.reviewProgress >= 100 ? COLORS.green : COLORS.blue}"></span></div><small>${m.reviewProgress}%</small></div></td>
        <td>${decisionCell(m)}</td>
        <td>${m.canReview ? `<a class="btn small" href="/review/${encodeURIComponent(m.id)}">Review →</a>` : active ? `<span class="btn small disabled" title="${blockedTip}">🔒 Review</span>` : '<span class="btn small disabled" title="Review is complete">Closed</span>'}</td>
      </tr>`;
    }).join('');
    tb.querySelectorAll('[data-lookup]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); openModal(a.dataset.lookup); }));
    tb.querySelectorAll('[data-invite]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); openInvitation(a.dataset.invite); }));
  }

  function reviewerCell(m) {
    if (!m.assignedReviewer) return '<span class="pill amber">Unassigned</span>';
    const pill = m.invitationStatus === 'Pending'
      ? `<span class="pill amber" title="Invitation sent ${esc(UEP.fmtDate(m.invitationSentAt))}">✉ Invited</span>`
      : '<span class="pill green" title="Reviewer accepted the invitation">✓ Accepted</span>';
    return `<div class="rv-cell"><b>${esc(m.assignedReviewer)}</b>
      <a class="rv-mail small" href="mailto:${esc(m.assignedReviewerEmail)}" title="${esc(m.assignedReviewerEmail)}">${esc(m.assignedReviewerEmail).replace('@', '<wbr>@')}</a>
      <div>${pill}${m.invitationSentAt ? ` <a href="#" class="small" data-invite="${esc(m.id)}" title="View the invitation e-mail">View invite</a>` : ''}</div></div>`;
  }

  function renderPager(pages) {
    const btn = (label, p, opts = {}) => `<button type="button" data-page="${p}" ${opts.disabled ? 'disabled' : ''} class="${opts.current ? 'current' : ''}">${label}</button>`;
    let html = btn('‹ Prev', page - 1, { disabled: page <= 1 });
    for (let p = 1; p <= pages; p++) html += btn(p, p, { current: p === page });
    html += btn('Next ›', page + 1, { disabled: page >= pages });
    $('pager').innerHTML = pages > 1 ? html : '';
    $('pager').querySelectorAll('button[data-page]').forEach(b => b.addEventListener('click', () => {
      page = Number(b.dataset.page);
      renderTable(filtered());
      document.getElementById('mscTable').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  function renderKpis(rows) {
    const active = rows.filter(m => m.reviewStatus !== 'Complete');
    const done = rows.filter(m => m.reviewStatus === 'Complete');
    const avgFul = done.length ? done.reduce((s, m) => s + m.elapsedHours, 0) / done.length : null;
    const avgScore = rows.length ? rows.reduce((s, m) => s + m.integrityScore, 0) / rows.length : null;
    const overdue = active.filter(m => m.elapsedBand === 'red').length;
    const unassigned = active.filter(m => !m.assignedReviewerId).length;
    const tiles = [
      ['Total MSCs', rows.length, `${journals.length} journals in portfolio`],
      ['Open', rows.filter(m => m.reviewStatus === 'Open').length, 'awaiting review start'],
      ['In progress', rows.filter(m => m.reviewStatus === 'In Progress').length, 'being reviewed'],
      ['Complete', done.length, 'decision made'],
      ['Delayed > 24 h', overdue, 'active MSCs in red', overdue ? 'var(--red)' : null],
      ['Unassigned', unassigned, 'active MSCs without reviewer', unassigned ? 'var(--amber)' : null],
      ['Avg time of fulfillment', avgFul == null ? '—' : fmtElapsed(avgFul), 'receipt → decision'],
      ['Avg integrity score', avgScore == null ? '—' : avgScore.toFixed(1), 'out of 10']
    ];
    $('kpis').innerHTML = tiles.map(([l, v, s, c]) => `<div class="kpi"><div class="label">${l}</div><div class="value" ${c ? `style="color:${c}"` : ''}>${v}</div><div class="sub">${s}</div></div>`).join('');
  }

  function chart(id, config) {
    if (charts[id]) { charts[id].data = config.data; charts[id].update(); return; }
    charts[id] = new Chart(document.getElementById(id), {
      ...config,
      options: Object.assign({ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 10 }, padding: 6 } } } }, config.options || {})
    });
  }

  function renderCharts(rows) {
    const active = rows.filter(m => m.reviewStatus !== 'Complete');
    const bands = ['green', 'amber', 'red'];
    chart('chElapsed', {
      type: 'doughnut',
      data: { labels: ['< 8 h', '8–24 h', '> 24 h'], datasets: [{ data: bands.map(b => active.filter(m => m.elapsedBand === b).length), backgroundColor: [COLORS.green, COLORS.amber, COLORS.red] }] },
      options: { onClick: (e, els) => { if (els.length) { $('fElapsed').value = bands[els[0].index]; render(); } } }
    });
    const decisions = ['Accept', 'Reject', 'Transfer', 'Revise', 'Assign to PE', 'Pending'];
    chart('chDecision', {
      type: 'bar',
      data: { labels: decisions, datasets: [{ label: 'MSCs', data: decisions.map(d => rows.filter(m => (m.finalDecision || 'Pending') === d).length), backgroundColor: decisions.map(d => DECISION_COLORS[d]) }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
        onClick: (e, els) => { if (els.length) { const d = decisions[els[0].index]; $('fDecision').value = d === 'Pending' ? 'none' : d; render(); } } }
    });
    const jIds = journals.map(j => j.id).filter(id => rows.some(m => m.journalId === id));
    const statuses = [['Open', COLORS.blue], ['In Progress', COLORS.amber], ['Complete', COLORS.green]];
    chart('chJournal', {
      type: 'bar',
      data: { labels: jIds.map(id => journals.find(j => j.id === id).shortName), datasets: statuses.map(([s, c]) => ({ label: s, backgroundColor: c, data: jIds.map(id => rows.filter(m => m.journalId === id && m.reviewStatus === s).length) })) },
      options: { scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } },
        onClick: (e, els) => { if (els.length) { $('fJournal').value = jIds[els[0].index]; render(); } } }
    });
    chart('chAssigned', {
      type: 'doughnut',
      data: { labels: ['Assigned', 'Unassigned'], datasets: [{ data: [rows.filter(m => m.assignedReviewerId).length, rows.filter(m => !m.assignedReviewerId).length], backgroundColor: [COLORS.blue, COLORS.amber] }] },
      options: { onClick: (e, els) => { if (els.length) { $('fAssigned').value = els[0].index ? 'Unassigned' : 'Assigned'; render(); } } }
    });
    chart('chEditor', {
      type: 'bar',
      data: { labels: data.editors.map(e => e.name.replace(/^Dr\.\s*/, '').split(' ').pop()), datasets: [
        { label: 'Open', backgroundColor: COLORS.blue, data: data.editors.map(e => rows.filter(m => m.assignedEditorId === e.id && m.reviewStatus === 'Open').length) },
        { label: 'In Progress', backgroundColor: COLORS.amber, data: data.editors.map(e => rows.filter(m => m.assignedEditorId === e.id && m.reviewStatus === 'In Progress').length) }
      ] },
      options: { indexAxis: 'y', scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }, y: { stacked: true } } }
    });
    const done = rows.filter(m => m.reviewStatus === 'Complete');
    const fj = journals.filter(j => done.some(m => m.journalId === j.id));
    chart('chFulfil', {
      type: 'bar',
      data: { labels: fj.map(j => j.shortName), datasets: [{ label: 'Avg hours to decision', backgroundColor: COLORS.teal, data: fj.map(j => { const d = done.filter(m => m.journalId === j.id); return Math.round(d.reduce((s, m) => s + m.elapsedHours, 0) / d.length); }) }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  }

  // ----- received today -----
  const TODAY_CATS = [
    ['Open', COLORS.blue, m => m.reviewStatus === 'Open' && m.elapsedBand === 'green'],
    ['In Progress', COLORS.amber, m => m.reviewStatus === 'In Progress' && m.elapsedBand === 'green'],
    ['Completed', COLORS.green, m => m.reviewStatus === 'Complete'],
    ['Delayed (> 8 h)', COLORS.red, m => m.reviewStatus !== 'Complete' && m.elapsedBand !== 'green']
  ];
  function renderToday(rows) {
    const today = new Date().toDateString();
    const list = rows.filter(m => new Date(m.submittedAt).toDateString() === today);
    const counts = TODAY_CATS.map(([, , fn]) => list.filter(fn).length);
    $('todayDate').textContent = new Date().toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' });
    $('todayTotal').textContent = list.length;
    $('todayBar').innerHTML = list.length
      ? TODAY_CATS.map(([l, c], i) => counts[i] ? `<span title="${l}: ${counts[i]}" style="width:${(counts[i] / list.length) * 100}%;background:${c}"></span>` : '').join('')
      : '';
    $('todayLegend').innerHTML = TODAY_CATS.map(([l, c], i) => `<span><i style="background:${c}"></i>${l} <b>${counts[i]}</b>${list.length ? ` <span class="muted">(${Math.round((counts[i] / list.length) * 100)}%)</span>` : ''}</span>`).join('');
    chart('chToday', {
      type: 'bar',
      data: { labels: TODAY_CATS.map(c => c[0]), datasets: [{ label: 'MSCs', data: counts, backgroundColor: TODAY_CATS.map(c => c[1]) }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 } } }, y: { ticks: { font: { size: 11 } } } } }
    });
  }

  // ----- processing outcome by week / month -----
  let period = 'week';
  function bucketStart(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    if (period === 'month') { d.setDate(1); return d; }
    const day = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - day);
    return d;
  }
  function renderPeriod(rows) {
    const done = rows.filter(m => m.reviewStatus === 'Complete' && m.finalDecision && m.completedAt);
    const count = period === 'week' ? 12 : 6;
    const buckets = [];
    let cur = bucketStart(new Date());
    for (let i = 0; i < count; i++) {
      buckets.unshift(new Date(cur));
      if (period === 'week') cur.setDate(cur.getDate() - 7); else cur.setMonth(cur.getMonth() - 1);
    }
    const label = d => period === 'week'
      ? `Wk of ${d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}`
      : d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    const decisions = ['Accept', 'Reject', 'Transfer', 'Revise', 'Assign to PE'];
    chart('chPeriod', {
      type: 'bar',
      data: {
        labels: buckets.map(label),
        datasets: decisions.map(dec => ({
          label: dec,
          backgroundColor: DECISION_COLORS[dec],
          data: buckets.map(b => done.filter(m => m.finalDecision === dec && bucketStart(m.completedAt).getTime() === b.getTime()).length)
        }))
      },
      options: { scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'MSCs decided' } } } }
    });
  }
  document.querySelectorAll('#periodSeg button').forEach(b => b.addEventListener('click', () => {
    period = b.dataset.period;
    document.querySelectorAll('#periodSeg button').forEach(x => x.classList.toggle('active', x === b));
    renderPeriod(filtered());
  }));

  function render() {
    const rows = filtered();
    renderKpis(rows);
    renderCharts(rows);
    renderToday(rows);
    renderPeriod(rows);
    renderTable(rows);
  }

  function clearFilters() {
    document.querySelectorAll('#filters input, #filters select').forEach(el => { el.value = ''; });
  }

  document.querySelectorAll('#filters input, #filters select').forEach(el => el.addEventListener(el.tagName === 'INPUT' && el.type === 'text' ? 'input' : 'change', () => { page = 1; render(); }));
  document.querySelectorAll('#mscTabs button').forEach(b => b.addEventListener('click', () => {
    tab = b.dataset.tab;
    document.querySelectorAll('#mscTabs button').forEach(x => x.classList.toggle('active', x === b));
    page = 1;
    renderTable(filtered());
  }));
  $('pageSize').value = String(pageSize);
  $('pageSize').addEventListener('change', () => {
    pageSize = Number($('pageSize').value);
    localStorage.setItem('uep.pageSize', pageSize);
    page = 1;
    renderTable(filtered());
  });
  // KPIs & Metrics panel: collapsed by default; resize charts when expanded.
  const panel = $('chartsPanel');
  panel.addEventListener('toggle', () => {
    if (panel.open) Object.values(charts).forEach(c => c.resize());
  });
  $('resetFilters').addEventListener('click', () => { clearFilters(); page = 1; render(); });
  document.querySelectorAll('#mscTable th[data-sort]').forEach(th => th.addEventListener('click', () => {
    sort = { key: th.dataset.sort, dir: sort.key === th.dataset.sort ? -sort.dir : 1 };
    render();
  }));
  $('refreshBtn').addEventListener('click', async () => {
    clearFilters();
    page = 1;
    sort = { key: 'submittedAt', dir: -1 };
    await load();
    toast('Dashboard refreshed and filters cleared');
  });

  // ----- reviewer selection & invitation modal -----
  let modalMsc = null; let selected = null; let modalRow = null; let reviewerList = [];
  function setFooter(mode) {
    $('mAssign').classList.toggle('hidden', mode !== 'select');
    $('mCancel').textContent = mode === 'select' ? 'Cancel' : 'Close';
  }
  function updateSendButton() {
    const r = reviewerList.find(x => x.id === selected);
    $('mAssign').disabled = !r || r.invitationStatus === 'Accepted';
    $('mAssign').textContent = r && r.current && r.invitationStatus === 'Pending' ? '✉ Re-send invitation e-mail' : '✉ Send invitation e-mail';
  }
  async function openModal(id) {
    modalMsc = id; selected = null;
    $('mErr').classList.add('hidden');
    setFooter('select');
    $('mAssign').disabled = true;
    $('mIntro').classList.remove('hidden');
    $('mList').innerHTML = '<p class="muted">Loading reviewers…</p>';
    $('modal').classList.remove('hidden');
    const res = await api(`/api/editor/mscs/${encodeURIComponent(id)}/reviewers`);
    modalRow = res.msc; reviewerList = res.reviewers;
    $('mTitle').textContent = `Select reviewer · ${res.msc.id}`;
    $('mSub').textContent = `${res.msc.title} — ${res.msc.journalName}`;
    const cur = reviewerList.find(r => r.current);
    const banner = cur ? `<div class="alert ${cur.invitationStatus === 'Pending' ? 'warn' : 'ok'} small">
        ${cur.invitationStatus === 'Pending'
          ? `Invitation sent to <b>${esc(cur.name)}</b> &lt;${esc(cur.email)}&gt; on ${esc(UEP.fmtDate(res.msc.invitationSentAt))} is <b>awaiting acceptance</b>. Re-send it, or pick another reviewer to withdraw it. <a href="#" id="mViewInvite">View invitation e-mail</a>`
          : `<b>${esc(cur.name)}</b> accepted the invitation. Choosing another reviewer sends them a new invitation and locks the review until they accept.`}
      </div>` : '';
    $('mList').innerHTML = banner + reviewerList.map(r => `
      <div class="reviewer ${r.available || r.current ? '' : 'disabled'} ${r.current ? 'selected' : ''}" data-id="${r.id}" data-ok="${r.available || r.current}">
        <input type="radio" name="rv" value="${r.id}" ${r.available || r.current ? '' : 'disabled'} ${r.current ? 'checked' : ''} aria-label="Select ${esc(r.name)}">
        <div>
          <div><b>${esc(r.name)}</b> <a class="rv-email" href="mailto:${esc(r.email)}" onclick="event.stopPropagation()">&lt;${esc(r.email)}&gt;</a>
            ${r.recommended ? '<span class="pill green">Recommended</span>' : ''}
            ${r.current ? (r.invitationStatus === 'Pending' ? '<span class="pill amber">✉ Invited · pending</span>' : '<span class="pill blue">✓ Accepted · assigned</span>') : ''}</div>
          <div class="small muted">${esc(r.affiliation)} · ${esc(r.expertise.join(' · '))}</div>
          <div class="small">${esc(r.reason)}</div>
        </div>
        <div style="text-align:right">
          ${r.onLeave ? '<span class="pill red">On leave</span>' : r.available ? '<span class="pill green">Available</span>' : '<span class="pill amber">Full</span>'}
          <div class="small muted">${r.activeReviews}/${r.capacity} active</div>
        </div>
      </div>`).join('');
    if ($('mViewInvite')) $('mViewInvite').addEventListener('click', e => { e.preventDefault(); openInvitation(id); });
    if (cur) { selected = cur.id; updateSendButton(); }
    $('mList').querySelectorAll('.reviewer').forEach(el => el.addEventListener('click', () => {
      if (el.dataset.ok !== 'true') return;
      $('mList').querySelectorAll('.reviewer').forEach(x => x.classList.toggle('selected', x === el));
      el.querySelector('input').checked = true;
      selected = el.dataset.id;
      updateSendButton();
    }));
  }

  function emailHtml(email, status) {
    const statusPill = status === 'Accepted' ? '<span class="pill green">✓ Accepted by reviewer</span>'
      : status === 'Pending' ? '<span class="pill amber">Awaiting reviewer acceptance</span>'
      : status ? `<span class="pill grey">${esc(status)}</span>` : '';
    return `<div class="email-preview">
      <div class="email-head">
        <div><span class="lbl">From</span> ${esc(email.from)}</div>
        <div><span class="lbl">To</span> <b>${esc(email.to)}</b></div>
        <div><span class="lbl">Subject</span> ${esc(email.subject)}</div>
        <div><span class="lbl">Sent</span> ${esc(UEP.fmtDate(email.sentAt))} · <span class="muted small">${esc(email.delivery)}</span> ${statusPill}</div>
      </div>
      <pre class="email-body">${esc(email.body).replace(esc(email.link), `<a href="${esc(email.link)}" target="_blank" rel="noopener">${esc(email.link)}</a>`)}</pre>
      ${status === 'Pending' ? `<div class="row"><a class="btn small" href="${esc(email.link)}" target="_blank" rel="noopener">Open invitation link (as the reviewer) ↗</a>
        <button class="secondary small" id="mCopyLink">Copy link</button></div>
        <p class="small muted">This prototype does not deliver real e-mail: the message is kept in the platform outbox. Open the link to accept or decline as the reviewer; the dashboard unlocks <b>Review</b> once it is accepted.</p>` : ''}
    </div>`;
  }
  function wireCopy(email) {
    const b = $('mCopyLink');
    if (b) b.addEventListener('click', async () => { try { await navigator.clipboard.writeText(email.link); toast('Invitation link copied'); } catch { toast(email.link, 6000); } });
  }

  async function openInvitation(id) {
    modalMsc = id;
    $('mErr').classList.add('hidden');
    $('mIntro').classList.add('hidden');
    setFooter('view');
    $('modal').classList.remove('hidden');
    $('mList').innerHTML = '<p class="muted">Loading invitation…</p>';
    try {
      const res = await api(`/api/editor/mscs/${encodeURIComponent(id)}/invitation`);
      $('mTitle').textContent = `Reviewer invitation · ${id}`;
      $('mSub').textContent = res.email.subject;
      $('mList').innerHTML = emailHtml(res.email, res.status);
      wireCopy(res.email);
    } catch (ex) { $('mList').innerHTML = `<div class="alert error">${esc(ex.message)}</div>`; }
  }

  function closeModal() { $('modal').classList.add('hidden'); }
  $('mClose').addEventListener('click', closeModal);
  $('mCancel').addEventListener('click', closeModal);
  $('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  $('mAssign').addEventListener('click', async () => {
    try {
      $('mAssign').disabled = true;
      const res = await api(`/api/editor/mscs/${encodeURIComponent(modalMsc)}/assign`, { method: 'POST', body: { reviewerId: selected } });
      toast(`Invitation e-mail sent to ${res.row.assignedReviewer}`);
      $('mIntro').classList.add('hidden');
      setFooter('sent');
      $('mTitle').textContent = `Invitation sent · ${res.row.id}`;
      $('mList').innerHTML = `<div class="alert ok small">✉ Invitation e-mail sent to <b>${esc(res.row.assignedReviewer)}</b> &lt;${esc(res.row.assignedReviewerEmail)}&gt;. Review &amp; annotation unlock once the reviewer accepts.</div>` + emailHtml(res.email, 'Pending');
      wireCopy(res.email);
      load();
    } catch (ex) {
      $('mAssign').disabled = false;
      $('mErr').textContent = ex.message;
      $('mErr').classList.remove('hidden');
    }
  });

  await load();
  setInterval(load, 60000);
})();
