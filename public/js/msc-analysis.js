/* MSC analysis overlay for the Review & Feedback page and the MSC Dashboard.
 * Three tabs: MSC Summary · MSC Integrity Check · Journal Fitment.
 * The overlay disables the page behind it (inert + scroll lock) until closed. */
const MscAnalysis = (() => {
  const { api, esc, scoreColor } = UEP;
  const $ = id => document.getElementById(id);
  const BRAND = '#2f6fde';
  const MUTED_BAR = '#a9bfdd';
  let state = null; // { msc, data, tab, onAddFeedback, readOnly, charts: [] }
  let lastFocus = null;

  const SEV_PILL = { critical: 'red', major: 'amber', minor: 'blue' };

  function background(disabled) {
    ['.topbar', 'main', '.site-footer'].forEach(sel => {
      const el = document.querySelector(sel);
      if (!el) return;
      if (disabled) { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); } else { el.removeAttribute('inert'); el.removeAttribute('aria-hidden'); }
    });
    document.body.classList.toggle('modal-open', disabled);
    ['selToolbar', 'commentBox'].forEach(id => { const el = $(id); if (el && disabled) el.classList.add('hidden'); });
  }

  function destroyCharts() {
    (state && state.charts || []).forEach(c => c.destroy());
    if (state) state.charts = [];
  }

  async function open(msc, opts = {}) {
    lastFocus = document.activeElement;
    state = { msc, data: null, tab: opts.tab || 'summary', onAddFeedback: opts.onAddFeedback, readOnly: !!opts.readOnly, readOnlyNote: opts.readOnlyNote, charts: [] };
    $('anSub').textContent = `${msc.id} · MSC analysis for the reviewer`;
    $('anTitle').textContent = msc.title;
    $('anIntBadge').textContent = ''; $('anFitBadge').textContent = '';
    $('anFoot').textContent = '';
    $('analysisModal').classList.remove('hidden');
    background(true);
    $('anClose').focus();
    $('anBody').innerHTML = `<div class="an-loading"><div class="spinner"></div><div><b>Analysing the MSC…</b>
      <div class="muted small">Summarising sections · screening the 21 integrity clauses · checking journal fitment</div></div></div>`;
    try {
      state.data = await api(`/api/mscs/${encodeURIComponent(msc.id)}/analysis`);
    } catch (ex) {
      $('anBody').innerHTML = `<div class="alert error">${esc(ex.message)}</div>`;
      return;
    }
    const d = state.data;
    $('anIntBadge').className = `pill ${d.integrity.passed ? 'green' : 'red'}`;
    $('anIntBadge').textContent = `${d.integrity.score}/10 ${d.integrity.passed ? 'PASS' : 'FAIL'}`;
    $('anFitBadge').className = `pill ${d.fitment.verdict.tone}`;
    $('anFitBadge').textContent = `${d.fitment.index}%`;
    $('anFoot').textContent = `Analysed ${UEP.fmtDate(d.generatedAt)} · deterministic, offline engine`;
    show(state.tab);
  }

  function close() {
    if (!state) return;
    destroyCharts();
    state = null;
    $('analysisModal').classList.add('hidden');
    background(false);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function show(tab) {
    if (!state || !state.data) return;
    state.tab = tab;
    document.querySelectorAll('.an-tabs button').forEach(b => {
      b.classList.toggle('active', b.dataset.an === tab);
      b.setAttribute('aria-selected', b.dataset.an === tab);
    });
    destroyCharts();
    const body = $('anBody');
    body.scrollTop = 0;
    if (tab === 'summary') renderSummary(body, state.data.summary);
    if (tab === 'integrity') renderIntegrity(body, state.data.integrity);
    if (tab === 'fitment') renderFitment(body, state.data.fitment);
    wireFeedback(body);
  }

  // ---------- helpers ----------
  function ring(pct, color, big, small) {
    return `<div class="score-ring" style="--p:${Math.max(0, Math.min(100, pct))};--c:${color}"><div><div><b style="color:${color}">${big}</b><div class="muted small">${small}</div></div></div></div>`;
  }
  function tile(label, value, sub) {
    return `<div class="an-tile"><div class="label">${esc(label)}</div><div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
  }
  function hbar(label, value, max, color, right, title) {
    const w = max ? Math.round(100 * value / max) : 0;
    return `<div class="an-hbar" title="${esc(title || '')}"><div class="lbl">${label}</div><div class="bar"><span style="width:${w}%;background:${color}"></span></div><div class="val">${right}</div></div>`;
  }
  function scoreHex(v) { return v > 6 ? '#12805c' : v > 4 ? '#b45309' : '#c0392b'; }
  function fitColor(v) { return v >= 70 ? 'var(--green)' : v >= 50 ? 'var(--amber)' : v >= 35 ? '#d97706' : 'var(--red)'; }

  function feedbackBox(id, title, items) {
    if (!items.length) return '';
    const ro = state.readOnly || !state.onAddFeedback;
    return `<div class="an-feedback" data-fb="${id}">
      <div class="row" style="justify-content:space-between"><b>${title}</b>
        ${ro ? `<span class="muted small">${esc(state.readOnlyNote || 'Review is complete (read-only)')}</span>` : `<span class="row small"><a href="#" data-all>Select all</a><button class="small" data-add disabled>Add selected to General feedback</button></span>`}</div>
      ${items.map((it, i) => `<label class="an-check"><input type="checkbox" ${ro ? 'disabled' : ''} value="${i}"><span>${it.tag ? `<span class="pill ${it.tagClass || 'grey'}">${esc(it.tag)}</span> ` : ''}${esc(it.text)}</span></label>`).join('')}
    </div>`;
  }

  function wireFeedback(root) {
    root.querySelectorAll('.an-feedback').forEach(box => {
      const items = state.fb[box.dataset.fb] || [];
      const add = box.querySelector('[data-add]');
      const boxes = () => [...box.querySelectorAll('input[type=checkbox]')];
      const sync = () => { if (add) { const n = boxes().filter(c => c.checked).length; add.disabled = !n; add.textContent = n ? `Add ${n} selected to General feedback` : 'Add selected to General feedback'; } };
      boxes().forEach(c => c.addEventListener('change', sync));
      const all = box.querySelector('[data-all]');
      if (all) all.addEventListener('click', e => { e.preventDefault(); const on = !boxes().every(c => c.checked); boxes().forEach(c => { c.checked = on; }); sync(); });
      if (add) add.addEventListener('click', async () => {
        const picked = boxes().filter(c => c.checked).map(c => items[+c.value].text);
        if (!picked.length) return;
        await state.onAddFeedback(picked, items.heading);
        boxes().forEach(c => { c.checked = false; });
        sync();
        UEP.toast(`${picked.length} point(s) added to General feedback`);
      });
    });
  }

  // ---------- Tab 1: summary ----------
  function renderSummary(body, s) {
    state.fb = state.fb || {};
    const c = s.composition;
    const maxSec = Math.max(1, ...s.sectionStats.map(x => x.words));
    const maxTerm = Math.max(1, ...s.keyTerms.map(t => t.count));
    body.innerHTML = `
      <div class="an-hero">
        <div class="an-hero-icon">📄</div>
        <div><div class="section-title" style="margin:0 0 4px">In one sentence</div><div class="an-lede">${esc(s.oneLiner)}</div>
          <div class="muted small" style="margin-top:6px">${esc(s.articleType)} · ${s.authors.length} author(s)${s.correspondingAuthor ? ` · corresponding: ${esc(s.correspondingAuthor)}` : ''}</div></div>
      </div>
      <div class="an-tiles">
        ${tile('Words', c.totalWords.toLocaleString(), `${c.readingMinutes} min read`)}
        ${tile('Figures', c.figures, `${c.figureCaptions} caption(s)${c.schemes ? ` · ${c.schemes} scheme(s)` : ''}`)}
        ${tile('Tables', c.tables)}
        ${tile('Equations', c.equations)}
        ${tile('References', c.references)}
        ${tile('Abstract', `${c.abstractWords}`, 'words')}
      </div>
      <div class="an-grid">
        <div>
          <div class="section-title">Structured summary</div>
          ${s.blocks.length ? s.blocks.map(b => `<div class="an-block">
              <div class="an-block-h"><span>${b.icon}</span><b>${esc(b.label)}</b><span class="muted small">from ${esc(b.source)}</span></div>
              <ul>${b.sentences.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')
            : '<div class="alert info">The MSC has no recognisable sections to summarise.</div>'}
        </div>
        <div>
          <div class="section-title">Where the words go</div>
          <div class="an-card">${s.sectionStats.map(x => hbar(esc(x.label), x.words, maxSec, BRAND, x.words.toLocaleString(), `${x.words} words`)).join('') || '<p class="muted small">No sections detected.</p>'}</div>
          <div class="section-title">Author keywords</div>
          <div class="an-chips">${s.keywords.length ? s.keywords.map(k => `<span class="chip kw">${esc(k)}</span>`).join('') : '<span class="muted small">None provided</span>'}</div>
          <div class="section-title">Key terms in the MSC</div>
          <div class="an-chips">${s.keyTerms.map(t => `<span class="chip" style="font-size:${11 + Math.round(5 * t.count / maxTerm)}px" title="${t.count} occurrences">${esc(t.term)} <span class="muted">${t.count}</span></span>`).join('')}</div>
        </div>
      </div>
      <details class="an-abstract"><summary>Show the full abstract</summary><p>${esc(s.abstract) || '<span class="muted">No abstract found.</span>'}</p></details>`;
  }

  // ---------- Tab 2: integrity (MSC validation on clauses I-01 … I-21) ----------
  const STATUS_PILL = { pass: 'green', flag: 'amber', fail: 'red' };
  function renderIntegrity(body, r) {
    const color = scoreColor(r.score);
    const fbItems = [];
    r.guidance.forEach(g => g.suggestions.forEach(sg => fbItems.push({ text: sg.text, tag: `${sg.id} · ${g.label}`, tagClass: STATUS_PILL[sg.status] })));
    fbItems.heading = 'MSC validation (integrity clauses)';
    state.fb = { ...(state.fb || {}), integrity: fbItems };
    const areas = r.areas || [];
    const changed = r.uploadScore != null && r.uploadScore !== r.score;

    body.innerHTML = `
      <div class="an-hero">
        ${ring(r.score * 10, color, r.score, '/ 10')}
        <div style="flex:1">
          <div class="verdict ${r.passed ? 'pass' : 'fail'}">${r.passed ? '✔ PASS' : '✖ FAIL'}</div>
          <div class="an-threshold"><div class="track"><span class="fill" style="width:${r.score * 10}%;background:${color}"></span><span class="mark" style="left:${r.passThreshold * 10}%" title="PASS needs a score above ${r.passThreshold}"></span></div>
            <div class="muted small an-scale"><span>0</span><span style="left:${r.passThreshold * 10}%">PASS &gt; ${r.passThreshold}</span><span style="right:0;left:auto">10</span></div></div>
          <div class="row small" style="margin-top:6px">${r.results.length ? ClauseUI.tally(r) : ''}</div>
          ${r.caps.length ? `<div class="muted small" style="margin-top:4px">${r.caps.map(esc).join(' ')}</div>` : ''}
          ${changed ? `<div class="muted small" style="margin-top:4px">Score at author upload: ${r.uploadScore}/10 — re-screened for the current editor, reviewer and review activity.</div>` : ''}
        </div>
      </div>
      <div class="alert ${r.passed ? (r.counts.fail || r.counts.flag ? 'warn' : 'ok') : 'error'}"><b>Reviewer guidance:</b> ${esc(r.recommendation)}</div>
      <div class="muted small" style="margin:-4px 0 8px">Same 21 integrity clauses (I-01 to I-21, V-1 to V-9) as the Author MSC validation. A failed clause deducts its severity points (critical 3 · major 1.5 · minor 0.75), a flagged clause half; the MSC passes when the score is above ${r.passThreshold}.</div>

      ${areas.length ? `<div class="an-grid">
        <div>
          <div class="section-title">Score by integrity area</div>
          <div class="an-card"><div style="height:270px"><canvas id="anRadar" aria-label="MSC validation score by integrity area"></canvas></div></div>
        </div>
        <div>
          <div class="section-title">Deductions by area</div>
          <div class="an-card">
            <table class="an-table"><thead><tr><th>Area</th><th>Clauses</th><th style="width:30%">Score</th><th>Deduction</th></tr></thead><tbody>
            ${areas.map(a => `<tr><td>${esc(a.label)} <span class="pill ${STATUS_PILL[a.status]}">${a.status === 'flag' ? 'flagged' : a.status}</span></td><td class="muted">${a.ids[0]}${a.ids.length > 1 ? `–${a.ids[a.ids.length - 1].slice(2)}` : ''}</td>
              <td><div class="bar"><span style="width:${a.score * 10}%;background:${scoreColor(a.score)}"></span></div></td><td><b>${a.deduction ? `−${a.deduction}` : '0'}</b></td></tr>`).join('')}
            <tr class="total"><td>Score</td><td></td><td class="muted">10 − ${r.deductions}${r.caps.length ? ' (capped)' : ''}</td><td><b>${r.score}</b></td></tr>
            </tbody></table>
          </div>
        </div>
      </div>` : ''}

      <div class="an-card" style="margin-top:12px">${ClauseUI.render(r.results.length ? r : null, { openFailed: true })}</div>

      <div class="section-title">Guide for your review — weakest areas first</div>
      <div class="an-guide">
        ${r.guidance.map((g, i) => `<details ${i < 2 && g.suggestions.length ? 'open' : ''}>
          <summary><span class="dot" style="background:${scoreColor(g.score)}"></span><b>${esc(g.label)}</b> <span class="muted">${g.score}/10</span> <span class="pill ${STATUS_PILL[g.status]}">${g.status === 'flag' ? 'flagged' : g.status}</span>
            ${g.suggestions.length ? `<span class="pill grey">${g.suggestions.length} finding(s)</span>` : ''}</summary>
          <div class="g-focus">${esc(g.focus)}</div>
          <ul class="g-prompts">${g.prompts.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
          ${g.suggestions.map(sg => `<div class="issue ${sg.status === 'fail' ? 'critical' : 'major'} small"><b>${sg.id} · ${sg.status === 'flag' ? 'flagged' : 'fail'}</b> · ${esc(sg.text)}</div>`).join('')}
        </details>`).join('')}
      </div>
      ${feedbackBox('integrity', 'Turn findings into feedback for the author', fbItems)}`;
    ClauseUI.wire(body);

    if (window.Chart && areas.length) {
      state.charts.push(new Chart($('anRadar'), {
        type: 'radar',
        data: {
          labels: areas.map(a => a.label.replace('AI-use disclosure & content signals', 'AI-use & content').replace('Citation & reference integrity', 'Citations & references').replace('Text similarity & plagiarism', 'Similarity & plagiarism').replace('Sanctions & restricted parties', 'Sanctions')),
          datasets: [
            { label: 'Area score', data: areas.map(a => a.score), borderColor: BRAND, backgroundColor: 'rgba(47,111,222,.18)', borderWidth: 2, pointRadius: 4, pointBackgroundColor: areas.map(a => scoreHex(a.score)), pointBorderColor: '#fff', pointBorderWidth: 2 },
            { label: 'PASS threshold', data: areas.map(() => r.passThreshold), borderColor: '#9aa4b8', borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0, fill: false }
          ]
        },
        options: {
          maintainAspectRatio: false,
          scales: { r: { min: 0, max: 10, ticks: { stepSize: 2, backdropColor: 'transparent', font: { size: 10 } }, pointLabels: { font: { size: 10 } }, grid: { color: '#e3e7ef' }, angleLines: { color: '#e3e7ef' } } },
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }, tooltip: { callbacks: { title: items => areas[items[0].dataIndex].label, label: ctx => `${ctx.dataset.label}: ${ctx.raw}/10`, afterLabel: ctx => ctx.datasetIndex ? '' : `Clauses ${areas[ctx.dataIndex].ids.join(', ')} · −${areas[ctx.dataIndex].deduction}` } } }
        }
      }));
    }
  }

  // ---------- Tab 3: journal fitment ----------
  function renderFitment(body, f) {
    const color = fitColor(f.index);
    const fbItems = f.feedback.map(t => ({ text: t }));
    fbItems.heading = 'Journal fitment';
    state.fb = { ...(state.fb || {}), fitment: fbItems };
    const matched = f.terms.filter(t => t.points > 0);
    const missing = f.terms.filter(t => !t.points);
    const maxPts = Math.max(1, ...matched.map(t => t.points));

    body.innerHTML = `
      <div class="an-hero">
        ${ring(f.index, color, `${f.index}%`, 'fitment')}
        <div style="flex:1">
          <div class="verdict" style="color:${color}">${esc(f.verdict.level)}</div>
          <div>with <b>${esc(f.journal.name)}</b> — the journal chosen by the author at upload.</div>
          <div class="muted small" style="margin-top:4px">${esc(f.journal.genre)} · Scope: ${esc(f.journal.context)}</div>
          ${f.recommended ? `<div class="alert info small" style="margin:8px 0 0">↪ <b>${esc(f.recommended.name)}</b> fits better (${f.recommended.fitmentIndex}%). Consider a <b>Transfer</b> decision.</div>` : ''}
        </div>
        <div class="hero-cover">${UEP.journalCover(f.journal, 'md')}<div class="small muted">${esc(f.journal.shortName)}</div></div>
      </div>

      <div class="an-grid">
        <div>
          <div class="section-title">Fitment profile</div>
          <div class="an-card">${f.profile.map(p => hbar(esc(p.label), p.value, 100, fitColor(p.value), `${p.value}%`, p.hint)).join('')}
            <div class="muted small" style="margin-top:6px">Hover a bar for how it is measured. The headline % is the subject-match index from the journal mapping used at upload.</div></div>
          <div class="section-title">Journal requirements</div>
          <div class="an-card"><table class="an-table"><tbody>
            ${f.format.map(x => `<tr><td>${x.ok ? '<span class="ok-mark">✓</span>' : '<span class="no-mark">✗</span>'} ${esc(x.label)}</td><td>${esc(x.value)}</td><td class="muted">${esc(x.limit)}</td></tr>`).join('')}
          </tbody></table></div>
        </div>
        <div>
          <div class="section-title">Fit across the ACS portfolio</div>
          <div class="an-card"><div style="height:${Math.max(180, f.ranking.length * 30)}px"><canvas id="anRank" aria-label="Fitment with each journal"></canvas></div></div>
        </div>
      </div>

      <div class="section-title">Scope evidence for ${esc(f.journal.shortName)} <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:400">— ${matched.length} of ${f.terms.length} topics found</span></div>
      <div class="an-card">
        <div class="an-chips">${matched.map(t => `<span class="chip match" style="--w:${Math.round(100 * t.points / maxPts)}%" title="${t.inCore} in title/abstract/keywords · ${t.inBody} in the body">${esc(t.term)} <b>${t.points}</b>${t.inCore ? ' ★' : ''}</span>`).join('') || '<span class="muted small">No scope topics of this journal were found.</span>'}</div>
        ${missing.length ? `<div class="muted small" style="margin:10px 0 4px">Not addressed:</div><div class="an-chips">${missing.map(t => `<span class="chip miss">${esc(t.term)}</span>`).join('')}</div>` : ''}
        <div class="muted small" style="margin-top:8px">★ = appears in the title, abstract or keywords (weighted ×3). Body mentions count up to 3 per topic.</div>
      </div>
      ${feedbackBox('fitment', 'Suggested fitment feedback', fbItems)}`;

    if (window.Chart) {
      state.charts.push(new Chart($('anRank'), {
        type: 'bar',
        data: {
          labels: f.ranking.map(j => j.shortName),
          datasets: [{ label: 'Fitment %', data: f.ranking.map(j => j.fitmentIndex), backgroundColor: f.ranking.map(j => j.selected ? BRAND : MUTED_BAR), borderRadius: 4, barThickness: 16 }]
        },
        options: {
          indexAxis: 'y', maintainAspectRatio: false, layout: { padding: { right: 64 } },
          scales: { x: { min: 0, max: 100, grid: { color: '#eef1f6' }, ticks: { callback: v => `${v}%` } }, y: { grid: { display: false } } },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { title: items => f.ranking[items[0].dataIndex].name, label: ctx => `${ctx.raw}% fit${f.ranking[ctx.dataIndex].selected ? ' (selected by author)' : ''}`, afterLabel: ctx => f.ranking[ctx.dataIndex].genre } }
          }
        },
        plugins: [{
          id: 'valueLabels',
          afterDatasetsDraw(chart) {
            const { ctx } = chart;
            chart.getDatasetMeta(0).data.forEach((bar, i) => {
              ctx.save(); ctx.font = `${f.ranking[i].selected ? 700 : 400} 11px Roboto, sans-serif`; ctx.fillStyle = '#1d2433'; ctx.textBaseline = 'middle';
              ctx.fillText(`${f.ranking[i].fitmentIndex}%${f.ranking[i].selected ? ' · selected' : ''}`, bar.x + 6, bar.y); ctx.restore();
            });
          }
        }]
      }));
    }
  }

  // ---------- wiring ----------
  function init() {
    document.querySelectorAll('.an-tabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.an)));
    $('anClose').addEventListener('click', close);
    $('anDone').addEventListener('click', close);
    document.addEventListener('keydown', e => {
      if (!state) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') { // keep focus inside the dialog
        const f = [...$('analysisModal').querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  return { open, close };
})();
