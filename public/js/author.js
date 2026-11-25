(async () => {
  const { api, esc, fmtDate, scoreColor, toast } = UEP;
  await UEP.initTopbar('author');

  const journalSel = document.getElementById('journal');
  const journalInfo = document.getElementById('journalInfo');
  const templateLink = document.getElementById('templateLink');
  const fileInput = document.getElementById('file');
  const dropzone = document.getElementById('dropzone');
  const fileName = document.getElementById('fileName');
  const form = document.getElementById('uploadForm');
  const uploadErr = document.getElementById('uploadErr');
  const checkBtn = document.getElementById('checkBtn');
  const result = document.getElementById('result');
  const resultEmpty = document.getElementById('resultEmpty');
  const revisionBanner = document.getElementById('revisionBanner');
  const cancelRevision = document.getElementById('cancelRevision');
  const previewCard = document.getElementById('previewCard');
  document.getElementById('previewCheckBtn').addEventListener('click', () => form.requestSubmit());

  let journals = [];
  let revisingMsc = null;
  let lastCheck = null;

  journals = await api('/api/journals');
  journalSel.innerHTML = journals.map(j => `<option value="${j.id}">${esc(j.name)} (${esc(j.shortName)})</option>`).join('');
  function updateJournal() {
    const j = journals.find(x => x.id === journalSel.value);
    templateLink.href = `/api/template/${j.id}`;
    templateLink.textContent = `⬇ Download ${j.shortName} MSC template`;
    document.getElementById('journalCover').innerHTML = UEP.journalCover(j, 'sm');
    journalInfo.innerHTML = `<b>Scope:</b> ${esc(j.context)}.<br><b>Limits:</b> abstract ≤ ${j.limits.abstractWords} words · total ≤ ${j.limits.totalWords} words · ≥ ${j.limits.minReferences} references`;
  }
  journalSel.addEventListener('change', updateJournal);
  updateJournal();

  // file picking
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('drag');
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      showFile();
    }
  });
  fileInput.addEventListener('change', showFile);
  function showFile() {
    const f = fileInput.files[0];
    fileName.textContent = f ? `${f.name} (${(f.size / 1024).toFixed(0)} KB)` : '';
    if (f) loadPreview(f);
  }

  // Show the uploaded MSC, organized by section, before any MSC validation.
  async function loadPreview(f) {
    uploadErr.classList.add('hidden');
    result.classList.add('hidden');
    resultEmpty.classList.remove('hidden');
    const fd = new FormData();
    fd.append('msc', f);
    fileName.textContent = `${f.name} — loading preview…`;
    try {
      const res = await api('/api/author/preview', { method: 'POST', body: fd });
      fileName.textContent = `${f.name} (${(f.size / 1024).toFixed(0)} KB)`;
      renderPreview(res);
      resultEmpty.classList.add('hidden');
      previewCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (ex) {
      fileName.textContent = `${f.name} (${(f.size / 1024).toFixed(0)} KB)`;
      previewCard.classList.add('hidden');
      uploadErr.textContent = ex.message;
      uploadErr.classList.remove('hidden');
    }
  }

  function setRevision(msc) {
    revisingMsc = msc;
    if (msc) {
      revisionBanner.innerHTML = `<b>Uploading a revision of ${esc(msc.id)}</b> — “${esc(msc.title)}”. The revised MSC will be re-checked and returned to the reviewer.`;
      revisionBanner.classList.remove('hidden');
      cancelRevision.classList.remove('hidden');
      journalSel.value = msc.journalId;
      journalSel.disabled = true;
      updateJournal();
      checkBtn.textContent = 'Run MSC validation on revision';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      revisionBanner.classList.add('hidden');
      cancelRevision.classList.add('hidden');
      journalSel.disabled = false;
      checkBtn.textContent = 'Run MSC validation';
    }
  }
  cancelRevision.addEventListener('click', () => setRevision(null));

  form.addEventListener('submit', async e => {
    e.preventDefault();
    uploadErr.classList.add('hidden');
    const f = fileInput.files[0];
    if (!f) { uploadErr.textContent = 'Choose an MSC file (.docx) to upload.'; uploadErr.classList.remove('hidden'); return; }
    const fd = new FormData();
    fd.append('journalId', journalSel.value);
    fd.append('msc', f);
    if (revisingMsc) fd.append('mscId', revisingMsc.id);
    checkBtn.disabled = true;
    checkBtn.textContent = 'Checking…';
    try {
      lastCheck = await api('/api/author/check', { method: 'POST', body: fd });
      renderPreview(lastCheck);
      renderResult(lastCheck);
    } catch (ex) {
      uploadErr.textContent = ex.message;
      uploadErr.classList.remove('hidden');
    } finally {
      checkBtn.disabled = false;
      checkBtn.textContent = revisingMsc ? 'Run MSC validation on revision' : 'Run MSC validation';
    }
  });

  function sevPill(s) {
    return `<span class="pill ${s === 'critical' ? 'red' : s === 'major' ? 'amber' : s === 'minor' ? 'blue' : 'grey'}">${s}</span>`;
  }

  function issueHtml(i) {
    return `<div class="issue ${i.severity}">
      <div class="row" style="gap:8px">${sevPill(i.severity)}<span class="muted small">${esc(i.categoryLabel || '')}</span></div>
      <div style="margin-top:4px">${esc(i.message)}</div>
      ${i.remediation ? `<div class="fix">${esc(i.remediation)}</div>` : ''}
    </div>`;
  }

  function renderResult(check) {
    const r = check.report;
    const journal = journals.find(j => j.id === r.journalId);
    resultEmpty.classList.add('hidden');
    result.classList.remove('hidden');
    const pct = Math.round((r.score / 10) * 100);
    const color = scoreColor(r.score);

    if (!r.valid) {
      result.innerHTML = `
        <div class="score-hero">
          <div class="score-ring" style="--p:${pct};--c:var(--red)"><div><div><b>${r.score}</b><div class="muted small">/ 10</div></div></div></div>
          <div><div class="verdict fail">INVALID MSC FORMAT</div><div class="muted">${esc(r.summary)}</div></div>
        </div>
        <h3 style="margin-top:16px">What to fix</h3>
        ${r.formatErrors.map(issueHtml).join('')}
        <div class="alert error">Fix the file and upload it again.</div>`;
      return;
    }

    const fit = r.fitment;
    const counts = r.counts;
    const fitRows = Object.entries(fit.scores).sort((a, b) => b[1] - a[1]).map(([id, v]) => {
      const j = journals.find(x => x.id === id);
      return `<div class="cat"><div>${esc(j ? j.name : id)} ${id === r.journalId ? '<span class="pill blue">selected</span>' : ''} ${id === fit.recommended.journalId ? '<span class="pill green">best fit</span>' : ''}</div>
        <div class="bar"><span style="width:${v}%;background:${id === r.journalId ? 'var(--brand-2)' : '#9fbcd6'}"></span></div><b>${v}</b></div>`;
    }).join('');

    result.innerHTML = `
      <div class="score-hero">
        <div class="score-ring" style="--p:${pct};--c:${color}"><div><div><b style="color:${color}">${r.score}</b><div class="muted small">/ 10</div></div></div></div>
        <div style="flex:1">
          <div class="verdict ${r.passed ? 'pass' : 'fail'}">${r.passed ? 'PASS' : 'FAIL — REVISION NEEDED'}</div>
          <div>${esc(r.summary)}</div>
          <div class="row small" style="margin-top:6px">
            ${r.validation ? ClauseUI.tally(r.validation) : `<span class="pill red">${counts.critical} critical</span><span class="pill amber">${counts.major} major</span><span class="pill blue">${counts.minor} minor</span>`}
            <span class="muted">Attempt #${check.attempt} · ${esc(journal ? journal.shortName : r.journalId)} · 21 integrity clauses (I-01 to I-21)</span>
          </div>
          ${r.caps && r.caps.length ? `<div class="muted small" style="margin-top:4px">${r.caps.map(esc).join(' ')}</div>` : ''}
        </div>
        ${journal ? `<div class="hero-cover">${UEP.journalCover(journal, 'md')}<div class="small muted">${esc(journal.shortName)}</div></div>` : ''}
      </div>

      <div style="margin-top:16px">
        ${r.passed
          ? `<div class="alert ok"><b>The MSC passed the MSC validation.</b> You can submit it for editorial review now, or address the remaining suggestions first and re-check.</div>
             <button id="submitBtn">${check.revisingMscId ? `Submit revision of ${esc(check.revisingMscId)}` : 'Submit MSC for review →'}</button>`
          : `<div class="alert error"><b>The score is 6 or below.</b> Fix the failed and flagged clauses below (start with the largest deductions) and re-submit the MSC.</div>
             <button disabled title="Score must be above 6">Submit MSC for review</button> <button class="secondary" id="resubmitBtn">Upload corrected MSC</button>`}
      </div>

      <div class="tabs" style="margin-top:18px">
        <button class="active" data-tab="clauses">MSC validation breakdown (${r.validation ? r.validation.counts.flag + r.validation.counts.fail : 0} to fix)</button>
        <button data-tab="issues">Readiness feedback (${r.issues.filter(i => i.severity !== 'info').length})</button>
        <button data-tab="scope">Journal fit</button>
        <button data-tab="details">MSC details</button>
        <button type="button" id="jumpPreview" style="margin-left:auto">↑ View uploaded MSC</button>
      </div>
      <div data-pane="clauses">
        ${ClauseUI.render(r.validation, { openFailed: true })}
      </div>
      <div data-pane="issues" class="hidden">
        <div class="alert info small">Guidance on completeness, language, figures, tables and conformance. These items help the editor and reviewers but are <b>not</b> part of the MSC validation score, which is computed from the 21 integrity clauses.</div>
        ${r.issues.length ? r.issues.map(issueHtml).join('') : '<div class="alert ok">No issues found.</div>'}
      </div>
      <div data-pane="scope" class="hidden">
        <p>Journal fitment index for <b>${esc(journal.name)}</b>: <b>${fit.index}/100</b>.</p>
        ${fit.transfer
          ? `<div class="alert warn"><b>Recommended transfer path:</b> ${esc(fit.transfer.journalName)} (fitment ${fit.transfer.fitmentIndex}/100) is a better fit for this MSC.</div>`
          : fit.recommended.journalId === r.journalId
            ? `<div class="alert ok">${esc(journal.name)} is the best-fit journal in the portfolio.</div>`
            : `<div class="alert info">Closest alternative: ${esc(fit.recommended.journalName)} (${fit.recommended.fitmentIndex}/100).</div>`}
        ${fitRows}
      </div>
      <div data-pane="details" class="hidden">
        <dl class="kv">
          <dt>Title</dt><dd>${esc(r.meta.title) || '—'}</dd>
          <dt>Authors</dt><dd>${esc((r.meta.authors || []).join(', ')) || '—'}</dd>
          <dt>Affiliations</dt><dd>${esc((r.meta.affiliations || []).join('; ')) || '—'}</dd>
          <dt>Corresponding</dt><dd>${esc(r.meta.correspondingAuthor)} ${esc(r.meta.correspondingEmail)}</dd>
          <dt>ORCID</dt><dd>${esc((r.meta.orcids || []).join(', ')) || '—'}</dd>
          <dt>Keywords</dt><dd>${esc((r.meta.keywords || []).join('; ')) || '—'}</dd>
          <dt>Sections found</dt><dd>${esc((r.meta.sections || []).join(' · '))}</dd>
          <dt>Words</dt><dd>${r.stats.totalWords} (abstract ${r.stats.abstractWords})</dd>
          <dt>References</dt><dd>${r.stats.references}</dd>
          <dt>Figures / equations</dt><dd>${r.stats.images} image(s), ${r.stats.figureCaptions} figure caption(s), ${r.stats.equations} equation(s)</dd>
          <dt>Tables</dt><dd>${r.stats.tables}</dd>
          <dt>Similarity</dt><dd>${r.stats.similarity}%${(r.stats.similaritySources || []).length ? ' — ' + r.stats.similaritySources.map(s => `${esc(s.source)} (${s.overlapPct}%)`).join('; ') : ''}</dd>
          <dt>Typos</dt><dd>${r.stats.typoCount} (${r.stats.typosPer1000Words} per 1,000 words)</dd>
          <dt>File fingerprint</dt><dd class="small" style="word-break:break-all">SHA-256 ${esc(r.contentHash)}</dd>
        </dl>
      </div>`;

    result.querySelectorAll('.tabs button[data-tab]').forEach(b => b.addEventListener('click', () => {
      result.querySelectorAll('.tabs button[data-tab]').forEach(x => x.classList.toggle('active', x === b));
      result.querySelectorAll('[data-pane]').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== b.dataset.tab));
    }));
    ClauseUI.wire(result);
    const jump = document.getElementById('jumpPreview');
    if (jump) jump.addEventListener('click', e => { e.stopPropagation(); previewCard.scrollIntoView({ behavior: 'smooth' }); });
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) submitBtn.addEventListener('click', submit);
    const resubmitBtn = document.getElementById('resubmitBtn');
    if (resubmitBtn) resubmitBtn.addEventListener('click', () => { fileInput.value = ''; showFile(); fileInput.click(); });
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ----- organized MSC preview -----

  function renderPreview(check) {
    const pv = check.preview;
    if (!pv) { previewCard.classList.add('hidden'); return; }
    previewCard.classList.remove('hidden');
    const f = pv.front;
    document.getElementById('previewSub').textContent = `${check.fileName} · read-only preview, organized by section${check.report ? '' : ' · MSC validation not run yet'}`;
    document.getElementById('previewStats').innerHTML = `
      <span class="pill grey">${pv.sections.length} parts</span>
      <span class="pill grey">${pv.totals.words.toLocaleString()} words</span>
      <span class="pill grey">${pv.totals.figures} figure(s)</span>
      <span class="pill grey">${pv.totals.tables} table(s)</span>
      ${pv.missing.length ? `<span class="pill red">${pv.missing.length} required section(s) missing</span>` : '<span class="pill green">All required sections present</span>'}`;

    const counts = s => [s.words ? `${s.words} w` : '', s.figures ? `${s.figures} fig` : '', s.tables ? `${s.tables} tbl` : '', s.references !== undefined ? `${s.references} refs` : ''].filter(Boolean).join(' · ');
    document.getElementById('previewNav').innerHTML =
      pv.sections.map(s => `<a href="#${s.id}" data-target="${s.id}">${esc(s.label)}<span class="n">${counts(s)}</span></a>`).join('') +
      pv.missing.map(m => `<div class="missing">✕ ${esc(m)} <span class="n">missing</span></div>`).join('');

    document.getElementById('previewPaper').innerHTML = pv.sections.map(s => {
      if (s.key === 'front') {
        return `<section id="${s.id}"><div class="title-page">
          <h1>${esc(f.title) || '<span class="muted">Title not found</span>'}</h1>
          <dl class="kv">
            <dt>Authors</dt><dd>${esc(f.authors.join(', ')) || '—'}</dd>
            <dt>Affiliations</dt><dd>${f.affiliations.map(esc).join('<br>') || '—'}</dd>
            <dt>Corresponding</dt><dd>${esc(f.correspondingAuthor)}${f.correspondingEmail ? ` · <a href="mailto:${esc(f.correspondingEmail)}">${esc(f.correspondingEmail)}</a>` : ''}</dd>
            <dt>ORCID</dt><dd>${esc(f.orcids.join(', ')) || '—'}</dd>
          </dl></div></section>`;
      }
      return `<section id="${s.id}">
        <div class="sec-head"><h2>${esc(s.heading)}</h2><span class="meta">${counts(s)}</span></div>
        <div class="${s.key === 'references' ? 'refs' : ''}">${s.html || '<p class="muted">(empty)</p>'}</div>
      </section>`;
    }).join('');

    const paperEl = document.getElementById('previewPaper');
    paperEl.scrollTop = 0;
    document.querySelectorAll('#previewNav a').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      const target = document.getElementById(a.dataset.target);
      paperEl.scrollTo({ top: target.offsetTop - 8, behavior: 'smooth' });
      document.querySelectorAll('#previewNav a').forEach(x => x.classList.toggle('active', x === a));
    }));
  }

  async function submit() {
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    try {
      const res = await api('/api/author/submit', { method: 'POST', body: { checkId: lastCheck.checkId } });
      result.insertAdjacentHTML('afterbegin', `<div class="alert ok"><b>${res.revision ? 'Revision submitted' : 'Submitted'}:</b> ${esc(res.mscId)} is now with the editorial team for review.</div>`);
      btn.textContent = 'Submitted ✓';
      toast(`${res.mscId} submitted for review`);
      setRevision(null);
      loadSubs();
    } catch (ex) {
      btn.disabled = false;
      toast(ex.message);
    }
  }

  function decisionPill(d) {
    if (!d) return '<span class="muted">—</span>';
    const cls = { Accept: 'green', Reject: 'red', Transfer: 'violet', Revise: 'amber', 'Assign to PE': 'teal' }[d.type];
    const extra = d.type === 'Revise' ? ` (${d.revisionType})` : d.type === 'Transfer' ? ` → ${d.alternateJournalId}` : d.type === 'Assign to PE' && d.publishingEditor ? ` → ${d.publishingEditor}` : '';
    return `<span class="pill ${cls}">${d.type}${extra}</span>`;
  }

  async function loadSubs() {
    const subs = await api('/api/author/submissions');
    const el = document.getElementById('subs');
    if (!subs.length) { el.innerHTML = '<p class="muted">No submissions yet. MSCs that pass the MSC validation and are submitted appear here.</p>'; return; }
    el.innerHTML = `<div class="table-wrap"><table class="data"><thead><tr>
      <th class="nosort">MSC ID</th><th class="nosort">Title</th><th class="nosort">Journal</th><th class="nosort">Submitted</th><th class="nosort">MSC validation</th>
      <th class="nosort">Revisions</th><th class="nosort">Review status</th><th class="nosort">Decision</th><th class="nosort">Reviewer feedback</th><th class="nosort"></th></tr></thead><tbody>
      ${subs.map(s => `<tr>
        <td><b>${esc(s.id)}</b></td>
        <td class="title-cell">${esc(s.title)}</td>
        <td>${esc(s.journalName)}</td>
        <td>${fmtDate(s.submittedAt)}</td>
        <td><span class="pill ${s.integrityPassed ? 'green' : 'red'}">${s.integrityPassed ? 'PASSED' : 'FAILED'}</span> ${s.integrityScore}</td>
        <td>${s.revisions ? `Yes (${s.revisions})` : 'No'}</td>
        <td>${esc(s.reviewStatus)}</td>
        <td>${decisionPill(s.decision)}${s.feedbackStatus ? `<div class="muted small">Feedback: ${esc(s.feedbackStatus)}</div>` : ''}</td>
        <td style="min-width:260px">${s.reviewerFeedback ? `<div>${esc(s.reviewerFeedback.summary)}</div>
          ${s.reviewerFeedback.general ? `<div class="muted small" style="margin-top:4px">${esc(s.reviewerFeedback.general)}</div>` : ''}
          ${s.reviewerFeedback.comments.map(c => `<div class="small" style="margin-top:4px">“<i>${esc(c.quote)}</i>” — ${esc(c.comment)}</div>`).join('')}` : '<span class="muted">—</span>'}</td>
        <td>${s.canRevise ? `<button class="small" data-revise="${esc(s.id)}">Upload revision</button>` : ''}</td>
      </tr>`).join('')}
      </tbody></table></div>`;
    el.querySelectorAll('[data-revise]').forEach(b => b.addEventListener('click', () => setRevision(subs.find(s => s.id === b.dataset.revise))));
  }
  document.getElementById('refreshSubs').addEventListener('click', loadSubs);
  loadSubs();
})();
