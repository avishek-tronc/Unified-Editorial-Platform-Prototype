(async () => {
  const { api, esc, fmtDate, fmtElapsed, scoreColor, toast } = UEP;
  await UEP.initTopbar('dashboard');
  const $ = id => document.getElementById(id);
  const mscId = decodeURIComponent(location.pathname.split('/').pop());
  const paper = $('paper');
  const journals = await api('/api/journals');
  let msc;

  try {
    msc = await api(`/api/mscs/${encodeURIComponent(mscId)}`);
    if (msc.reviewStatus !== 'Complete') msc = await api(`/api/mscs/${encodeURIComponent(mscId)}/start`, { method: 'POST' });
  } catch (ex) {
    $('head').innerHTML = `<div class="alert error">${esc(ex.message)}</div>`;
    return;
  }
  const readOnly = () => msc.reviewStatus === 'Complete';
  const jName = id => { const j = journals.find(x => x.id === id); return j ? j.name : id; };

  // ---------- header ----------
  function renderHead() {
    $('head').innerHTML = `
      <div class="row" style="align-items:flex-start">
        <div style="flex:1;min-width:300px">
          <div class="muted small">${esc(msc.id)} · ${esc(jName(msc.journalId))}</div>
          <h1 style="margin:4px 0">${esc(msc.title)}</h1>
          <div>${esc((msc.authors || []).join(', '))} <span class="muted small">${esc(msc.authorEmail)}</span></div>
        </div>
        <dl class="kv" style="grid-template-columns:auto auto;min-width:420px">
          <dt>Submitted</dt><dd>${fmtDate(msc.submittedAt)} <span class="pill ${msc.elapsedBand}">${fmtElapsed(msc.elapsedHours)}</span></dd>
          <dt>Integrity</dt><dd><span class="pill ${msc.integrityPassed ? 'green' : 'red'}">${msc.integrityPassed ? 'PASSED' : 'FAILED'}</span> <b style="color:${scoreColor(msc.integrityScore)}">${msc.integrityScore}</b>/10 · fitment ${msc.fitmentIndex}/100</dd>
          <dt>Editor / reviewer</dt><dd>${esc(msc.assignedEditor || '—')} / ${msc.assignedReviewer ? esc(msc.assignedReviewer) : '<span class="pill amber">Unassigned</span>'}</dd>
          <dt>Review</dt><dd><span class="pill ${msc.reviewStatus === 'Complete' ? 'green' : msc.reviewStatus === 'In Progress' ? 'amber' : 'blue'}">${msc.reviewStatus}</span> started ${fmtDate(msc.reviewStartAt)} · <b id="progressLabel">${msc.reviewProgress}%</b></dd>
          <dt>Revisions</dt><dd>${msc.revisions ? `Yes (${msc.revisions}) — version ${msc.versions.length}` : 'No'}</dd>
        </dl>
      </div>`;
    $('immutableBar').innerHTML = `🔒 <b>Immutable manuscript</b> — version ${msc.versions.length}, ${esc(msc.fileName || '')} · SHA-256 <code title="${esc(msc.contentHash)}">${esc(msc.contentHash.slice(0, 16))}…</code> · annotations are stored separately`;
  }

  // ---------- manuscript + annotations ----------
  function textNodes(root) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const out = [];
    while (w.nextNode()) out.push(w.currentNode);
    return out;
  }

  function locate(a, full) {
    if (Number.isInteger(a.start) && Number.isInteger(a.end) && full.slice(a.start, a.end) === a.quote) return [a.start, a.end];
    const i = full.indexOf(a.quote);
    return i >= 0 ? [i, i + a.quote.length] : null;
  }

  function wrap(start, end, a) {
    let pos = 0;
    for (const node of textNodes(paper)) {
      const len = node.nodeValue.length;
      const s = Math.max(start, pos); const e = Math.min(end, pos + len);
      if (s < e) {
        let target = node;
        if (s - pos > 0) target = target.splitText(s - pos);
        if (e - s < target.nodeValue.length) target.splitText(e - s);
        const mark = document.createElement('mark');
        mark.className = `ann ${a.type}`;
        mark.dataset.id = a.id;
        mark.title = a.comment ? `${a.author}: ${a.comment}` : `${a.type} by ${a.author}`;
        target.parentNode.insertBefore(mark, target);
        mark.appendChild(target);
      }
      pos += len;
      if (pos >= end) break;
    }
  }

  function renderPaper() {
    const scroll = paper.scrollTop;
    paper.innerHTML = msc.html;
    const full = paper.textContent;
    msc.annotations.forEach(a => {
      const loc = locate(a, full);
      a._found = !!loc;
      if (loc) wrap(loc[0], loc[1], a);
    });
    paper.querySelectorAll('mark.ann').forEach(m => m.addEventListener('click', () => focusAnn(m.dataset.id, false)));
    paper.scrollTop = scroll;
  }

  function renderAnnList() {
    const filter = $('annFilter').value;
    const list = msc.annotations.filter(a => !filter || a.type === filter);
    $('annCount').textContent = `(${msc.annotations.length})`;
    $('annList').innerHTML = list.length ? list.map(a => `
      <div class="ann-item" data-id="${a.id}">
        <blockquote>${esc(a.quote.length > 160 ? a.quote.slice(0, 160) + '…' : a.quote)}</blockquote>
        ${a.comment ? `<div>${esc(a.comment)}</div>` : ''}
        <div class="meta"><span class="pill ${a.type === 'comment' ? 'blue' : a.type === 'highlight' ? 'amber' : 'red'}">${a.type}</span>
          ${esc(a.author)} · ${fmtDate(a.createdAt)} ${a._found === false ? '<span class="pill grey">text not found</span>' : ''}
          <span class="spacer"></span>
          ${readOnly() ? '' : `<button class="ghost small" data-edit="${a.id}">${a.comment ? 'Edit' : 'Add note'}</button><button class="ghost small" data-del="${a.id}" style="color:var(--red)">Delete</button>`}
        </div>
      </div>`).join('') : '<p class="muted small">No annotations yet.</p>';
    $('annList').querySelectorAll('.ann-item').forEach(el => el.addEventListener('click', e => { if (!e.target.closest('button')) focusAnn(el.dataset.id, true); }));
    $('annList').querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      await api(`/api/mscs/${encodeURIComponent(msc.id)}/annotations/${b.dataset.del}`, { method: 'DELETE' });
      msc.annotations = msc.annotations.filter(a => a.id !== b.dataset.del);
      renderPaper(); renderAnnList();
    }));
    $('annList').querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
      const a = msc.annotations.find(x => x.id === b.dataset.edit);
      const item = b.closest('.ann-item');
      if (item.querySelector('textarea')) return;
      item.insertAdjacentHTML('beforeend', `<textarea style="margin-top:6px;min-height:60px">${esc(a.comment)}</textarea><div class="row" style="justify-content:flex-end;margin-top:4px"><button class="small">Save</button></div>`);
      item.querySelector('.row button').addEventListener('click', async () => {
        const updated = await api(`/api/mscs/${encodeURIComponent(msc.id)}/annotations/${a.id}`, { method: 'PUT', body: { comment: item.querySelector('textarea').value } });
        Object.assign(a, updated);
        renderPaper(); renderAnnList();
      });
    }));
  }

  function focusAnn(id, scrollPaper) {
    showTab('feedback');
    document.querySelectorAll('.ann-item').forEach(el => el.style.borderColor = el.dataset.id === id ? 'var(--brand-2)' : '');
    const item = document.querySelector(`.ann-item[data-id="${id}"]`);
    if (item && !scrollPaper) item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const marks = paper.querySelectorAll(`mark[data-id="${id}"]`);
    marks.forEach(m => { m.classList.add('flash'); setTimeout(() => m.classList.remove('flash'), 1500); });
    if (scrollPaper && marks[0]) marks[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  $('annFilter').addEventListener('change', renderAnnList);

  // ---------- selection toolbar ----------
  const toolbar = $('selToolbar');
  const commentBox = $('commentBox');
  let pending = null;

  function selectionInPaper() {
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    if (!paper.contains(range.commonAncestorContainer)) return null;
    const pre = document.createRange();
    pre.selectNodeContents(paper);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = pre.toString().length;
    const quote = range.toString();
    if (!quote.trim()) return null;
    return { start, end: start + quote.length, quote, rect: range.getBoundingClientRect() };
  }

  paper.addEventListener('mouseup', () => setTimeout(() => {
    if (readOnly()) return;
    const s = selectionInPaper();
    if (!s) { toolbar.classList.add('hidden'); return; }
    pending = s;
    toolbar.style.top = `${window.scrollY + s.rect.top - 44}px`;
    toolbar.style.left = `${window.scrollX + s.rect.left + s.rect.width / 2 - 140}px`;
    toolbar.classList.remove('hidden');
  }, 0));
  document.addEventListener('mousedown', e => {
    if (!toolbar.contains(e.target) && !commentBox.contains(e.target) && !paper.contains(e.target)) toolbar.classList.add('hidden');
  });
  paper.addEventListener('scroll', () => { toolbar.classList.add('hidden'); });

  async function addAnnotation(type, comment) {
    const a = await api(`/api/mscs/${encodeURIComponent(msc.id)}/annotations`, { method: 'POST', body: { type, start: pending.start, end: pending.end, quote: pending.quote, comment } });
    msc.annotations.push(a);
    window.getSelection().removeAllRanges();
    toolbar.classList.add('hidden');
    commentBox.classList.add('hidden');
    if (msc.reviewStatus === 'Open') msc.reviewStatus = 'In Progress';
    renderPaper(); renderAnnList();
    toast(`${type[0].toUpperCase() + type.slice(1)} added`);
  }

  toolbar.querySelectorAll('button').forEach(b => b.addEventListener('mousedown', e => e.preventDefault()));
  toolbar.querySelectorAll('button').forEach(b => b.addEventListener('click', async () => {
    if (!pending) return;
    const act = b.dataset.act;
    if (act === 'comment') {
      commentBox.style.top = toolbar.style.top;
      commentBox.style.left = toolbar.style.left;
      $('commentQuote').textContent = `“${pending.quote.slice(0, 120)}${pending.quote.length > 120 ? '…' : ''}”`;
      $('commentText').value = '';
      toolbar.classList.add('hidden');
      commentBox.classList.remove('hidden');
      $('commentText').focus();
    } else {
      try { await addAnnotation(act, ''); } catch (ex) { toast(ex.message); }
    }
  }));
  $('commentCancel').addEventListener('click', () => commentBox.classList.add('hidden'));
  $('commentSave').addEventListener('click', async () => {
    const text = $('commentText').value.trim();
    if (!text) { $('commentText').focus(); return; }
    try { await addAnnotation('comment', text); } catch (ex) { toast(ex.message); }
  });

  // ---------- general feedback ----------
  $('general').value = msc.generalFeedback || '';
  async function saveGeneral() {
    if (readOnly()) return;
    await api(`/api/mscs/${encodeURIComponent(msc.id)}/feedback`, { method: 'PUT', body: { generalFeedback: $('general').value } });
    msc.generalFeedback = $('general').value;
    $('saveState').textContent = `Saved ${new Date().toLocaleTimeString()}`;
  }
  $('saveGeneral').addEventListener('click', saveGeneral);
  let genTimer;
  $('general').addEventListener('input', () => { $('saveState').textContent = 'Unsaved changes…'; clearTimeout(genTimer); genTimer = setTimeout(saveGeneral, 1500); });

  // ---------- reading progress ----------
  let lastSent = msc.reviewProgress; let progTimer;
  paper.addEventListener('scroll', () => {
    if (readOnly()) return;
    const pct = Math.round(((paper.scrollTop + paper.clientHeight) / paper.scrollHeight) * 100);
    clearTimeout(progTimer);
    progTimer = setTimeout(async () => {
      if (pct <= lastSent) return;
      const r = await api(`/api/mscs/${encodeURIComponent(msc.id)}/progress`, { method: 'POST', body: { percent: pct } });
      lastSent = r.reviewProgress; msc.reviewProgress = r.reviewProgress;
      const pl = $('progressLabel'); if (pl) pl.textContent = `${r.reviewProgress}%`;
    }, 800);
  });

  // ---------- decision ----------
  function renderDecision() {
    const pane = $('decisionPane');
    if (msc.decision) {
      const d = msc.decision;
      const cls = { Accept: 'ok', Reject: 'error', Transfer: 'info', Revise: 'warn' }[d.type];
      pane.innerHTML = `<div class="alert ${cls}"><b>Final decision: ${d.type.toUpperCase()}${d.type === 'Revise' ? ` (${d.revisionType} revision)` : ''}${d.type === 'Transfer' ? ` → ${esc(jName(d.alternateJournalId))}` : ''}</b><br>${esc(d.summary)}<div class="small" style="margin-top:4px">Decided ${fmtDate(d.decidedAt)}</div></div>
        ${d.type === 'Revise' ? `<p class="muted small">The MSC has been sent back to the author for revision. Feedback incorporation: <b>${esc(msc.feedbackStatus)}</b>.</p>` : ''}
        <a class="btn secondary" href="/dashboard">Back to dashboard</a>`;
      return;
    }
    const fit = msc.integrity.fitment || { index: 0, scores: {} };
    const proposed = msc.alternates[0];
    pane.innerHTML = `
      <p class="muted small">Based on the review, record the final decision. Completing the decision closes the review.</p>
      <div class="decision-opts">
        <input type="radio" name="dec" id="dA" value="Accept"><label for="dA" class="accept">ACCEPT</label>
        <input type="radio" name="dec" id="dR" value="Reject"><label for="dR" class="reject">REJECT</label>
        <input type="radio" name="dec" id="dT" value="Transfer"><label for="dT" class="transfer">TRANSFER</label>
        <input type="radio" name="dec" id="dV" value="Revise"><label for="dV" class="revise">REVISE</label>
      </div>

      <div id="reviseOpts" class="hidden">
        <div class="section-title">Revision type</div>
        <div class="row"><label style="margin:0;font-weight:400"><input type="radio" name="revType" value="Minor" checked> Minor revision</label>
        <label style="margin:0;font-weight:400"><input type="radio" name="revType" value="Major"> Major revision</label></div>
        <p class="muted small">The MSC will be sent back to the author, who must incorporate the feedback and re-submit.</p>
      </div>

      <div class="section-title">Journal applicability</div>
      <div class="small">Fitment of this MSC with <b>${esc(jName(msc.journalId))}</b>: <b>${fit.index}/100</b>
        ${fit.index < 50 ? '<span class="pill amber">weak fit</span>' : '<span class="pill green">good fit</span>'}</div>
      <div class="small muted" style="margin-top:4px">System-proposed alternate (journal mapping by genre, context &amp; subject): <b>${esc(proposed.name)}</b> (fitment ${proposed.fitmentIndex}/100${proposed.mapped ? ', mapped' : ''})</div>

      <div id="transferOpts">
        <label for="altJournal">Alternate journal <span class="muted small">(only for Transfer)</span></label>
        <select id="altJournal" disabled>
          ${msc.alternates.map((a, i) => `<option value="${a.id}" ${i === 0 ? 'selected' : ''}>${esc(a.name)} — fitment ${a.fitmentIndex}${a.mapped ? ' · mapped' : ''}${i === 0 ? ' · proposed' : ''}</option>`).join('')}
        </select>
        <div class="muted small" id="altGenre"></div>
      </div>

      <label for="summary">Decision summary for the author</label>
      <textarea id="summary" placeholder="Key reasons for the decision…"></textarea>
      <div id="decErr" class="alert error hidden"></div>
      <button id="submitDecision" style="width:100%;margin-top:12px" disabled>Submit decision</button>`;

    const alt = $('altJournal');
    const showGenre = () => { const a = msc.alternates.find(x => x.id === alt.value); $('altGenre').textContent = a ? a.genre : ''; };
    alt.addEventListener('change', showGenre); showGenre();
    pane.querySelectorAll('input[name=dec]').forEach(r => r.addEventListener('change', () => {
      const v = pane.querySelector('input[name=dec]:checked').value;
      $('reviseOpts').classList.toggle('hidden', v !== 'Revise');
      alt.disabled = v !== 'Transfer';
      $('submitDecision').disabled = false;
      $('submitDecision').textContent = `Submit decision: ${v.toUpperCase()}`;
    }));
    $('submitDecision').addEventListener('click', async () => {
      const type = pane.querySelector('input[name=dec]:checked').value;
      const body = { type, summary: $('summary').value };
      if (type === 'Revise') body.revisionType = pane.querySelector('input[name=revType]:checked').value;
      if (type === 'Transfer') body.alternateJournalId = alt.value;
      try {
        await saveGeneral();
        const updated = await api(`/api/mscs/${encodeURIComponent(msc.id)}/decision`, { method: 'POST', body });
        msc = { ...updated, annotations: msc.annotations };
        toast(`Decision recorded: ${type}`);
        renderAll();
      } catch (ex) {
        $('decErr').textContent = ex.message;
        $('decErr').classList.remove('hidden');
      }
    });
  }

  // ---------- integrity report ----------
  function renderIntegrity() {
    const r = msc.integrity;
    $('integrityPane').innerHTML = `
      <div class="row"><b style="font-size:22px;color:${scoreColor(r.score)}">${r.score}/10</b><span class="pill ${r.passed ? 'green' : 'red'}">${r.passed ? 'PASSED' : 'FAILED'}</span></div>
      <div class="small muted" style="margin:4px 0 10px">${esc(r.summary)}</div>
      ${r.categories.map(c => `<div class="cat" style="grid-template-columns:1fr 90px 34px"><div class="small">${esc(c.label)}</div><div class="bar"><span style="width:${c.score * 10}%;background:${scoreColor(c.score)}"></span></div><b class="small">${c.score}</b></div>`).join('')}
      <div class="section-title">Remaining items</div>
      ${r.issues.filter(i => i.severity !== 'info').map(i => `<div class="issue ${i.severity} small"><b>${i.severity}</b> · ${esc(i.message)}</div>`).join('') || '<p class="muted small">None</p>'}
      <div class="section-title">Version history</div>
      ${msc.versions.map(v => `<div class="small">v${v.version} · ${fmtDate(v.submittedAt)} · score ${v.score}</div>`).join('')}
      ${msc.decisionHistory.length ? `<div class="section-title">Decision history</div>${msc.decisionHistory.map(d => `<div class="small">${fmtDate(d.decidedAt)} · v${d.version} · <b>${d.type}${d.revisionType ? ` (${d.revisionType})` : ''}</b> — ${esc(d.summary)}</div>`).join('')}` : ''}`;
  }

  function showTab(name) {
    document.querySelectorAll('#side .tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('#side [data-pane]').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== name));
  }
  document.querySelectorAll('#side .tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  function renderAll() {
    renderHead();
    renderPaper();
    renderAnnList();
    renderDecision();
    renderIntegrity();
    const ro = readOnly();
    $('general').disabled = ro;
    $('saveGeneral').classList.toggle('hidden', ro);
    $('howto').classList.toggle('hidden', ro);
    $('readonlyNote').classList.toggle('hidden', !ro);
    $('readonlyNote').textContent = 'The review of this MSC is complete. Annotations and feedback are read-only.';
    if (ro) toolbar.classList.add('hidden');
  }
  renderAll();
})();
