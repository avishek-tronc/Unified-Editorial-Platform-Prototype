/* MSC validation breakdown on the 21 integrity clauses (I-01 … I-21).
 * Shared by the Author MSC Upload page, the Dashboard MSC analysis modal and
 * the Review & Feedback page so all three show the same parameters. */
const ClauseUI = (() => {
  const { esc, scoreColor } = UEP;
  const STATUS = {
    pass: { label: 'Pass', pill: 'green', icon: '✓' },
    flag: { label: 'Flagged', pill: 'amber', icon: '!' },
    fail: { label: 'Fail', pill: 'red', icon: '✗' }
  };
  const SEV = { critical: 'red', major: 'amber', minor: 'blue' };

  function statusPill(s) {
    const st = STATUS[s] || STATUS.pass;
    return `<span class="pill ${st.pill} cl-status"><span aria-hidden="true">${st.icon}</span> ${st.label}</span>`;
  }

  /** Tally line: 18 pass · 2 flagged · 1 fail */
  function tally(v) {
    return `<span class="pill green">${v.counts.pass} pass</span><span class="pill amber">${v.counts.flag} flagged</span><span class="pill red">${v.counts.fail} fail</span>`;
  }

  /** One bar per integrity area (V-1 … V-9). */
  function areaBars(v) {
    return `<div class="cl-areas">${v.areas.map(a => `
      <div class="cat cl-area" title="${esc(a.ids.join(', '))} · −${a.deduction} point(s)">
        <div><span class="muted small">${esc(a.code)}</span> ${esc(a.label)}</div>
        <div class="bar"><span style="width:${a.score * 10}%;background:${scoreColor(a.score)}"></span></div>
      </div>`).join('')}</div>`;
  }

  function clauseRow(r, opts) {
    const open = opts.openFailed && r.status !== 'pass';
    return `<details class="cl-row ${r.status}" ${open ? 'open' : ''}>
      <summary>
        <span class="cl-id">${esc(r.id)}</span>
        <span class="cl-check">${esc(r.check)}</span>
        ${statusPill(r.status)}
        <span class="cl-ded ${r.penalty ? 'neg' : ''}" title="Deduction from the score">${r.penalty ? `−${r.penalty}` : '0'}</span>
      </summary>
      <div class="cl-body">
        <div class="cl-finding"><b>Result:</b> ${esc(r.finding)}</div>
        ${r.evidence.length ? `<div class="cl-ev-h">Evidence</div><ul class="cl-evidence">${r.evidence.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
        ${r.remediation && r.status !== 'pass' ? `<div class="fix">${esc(r.remediation)}</div>` : ''}
        <div class="cl-meta muted small">${esc(r.code)} · ${esc(r.area)} · severity <span class="pill ${SEV[r.severity]}">${esc(r.severity)}</span> (fail −${r.maxPenalty}, flag −${r.maxPenalty / 2}) · automation: ${esc(r.feasibility)}<br>Method: ${esc(r.tool)}</div>
      </div>
    </details>`;
  }

  /**
   * Full breakdown: areas, then every clause grouped by area.
   * opts: { compact, openFailed, filter: 'all'|'open' }
   */
  function render(v, opts = {}) {
    if (!v) return '<div class="alert info">This MSC was screened before the clause-based MSC validation was introduced. Re-upload it to see the clause breakdown.</div>';
    const groups = v.areas.map(a => ({ a, rows: v.results.filter(r => r.clause === a.clause) }));
    const ctx = v.context || {};
    return `<div class="cl-wrap ${opts.compact ? 'compact' : ''}">
      <div class="row small cl-tally">${tally(v)}<span class="muted">−${v.deductions} point(s) from 10${v.caps && v.caps.length ? ` · ${v.caps.map(esc).join(' ')}` : ''}</span></div>
      ${opts.compact ? '' : `<div class="section-title">Score by integrity area</div>${areaBars(v)}`}
      <div class="section-title cl-head">Clause breakdown — I-01 to I-21
        <span class="cl-filter">${['all', 'open'].map(f => `<button type="button" class="ghost small ${(opts.filter || 'all') === f ? 'active' : ''}" data-clfilter="${f}">${f === 'all' ? 'All 21' : `Flagged & failed (${v.counts.flag + v.counts.fail})`}</button>`).join('')}</span>
      </div>
      ${ctx.stage ? `<div class="muted small cl-context">Screening stage: <b>${esc(ctx.stage)}</b>${ctx.editor ? ` · editor ${esc(ctx.editor)}` : ''}${ctx.reviewers ? ` · reviewers: ${esc(ctx.reviewers)}` : ''}</div>` : ''}
      <div class="cl-list">
        ${groups.map(g => `<div class="cl-group" data-status="${g.a.status}">
          <div class="cl-group-h"><span>${esc(g.a.code)} · ${esc(g.a.label)}</span>${statusPill(g.a.status)}</div>
          ${g.rows.map(r => clauseRow(r, opts)).join('')}
        </div>`).join('')}
      </div>
      <div class="muted small cl-method">${esc(v.method || '')} External services (iThenticate, Proofig/ImageTwin, Crossref, ORCID, ROR, OpenAlex, sanctions feeds) are simulated with local data in this prototype.</div>
    </div>`;
  }

  /** Wires the All / Flagged filter inside a rendered breakdown. */
  function wire(root) {
    root.querySelectorAll('[data-clfilter]').forEach(b => b.addEventListener('click', () => {
      const wrap = b.closest('.cl-wrap');
      wrap.querySelectorAll('[data-clfilter]').forEach(x => x.classList.toggle('active', x === b));
      const open = b.dataset.clfilter === 'open';
      wrap.querySelectorAll('.cl-row').forEach(r => r.classList.toggle('hidden', open && r.classList.contains('pass')));
      wrap.querySelectorAll('.cl-group').forEach(g => g.classList.toggle('hidden', open && g.dataset.status === 'pass'));
    }));
  }

  return { render, wire, areaBars, tally, statusPill };
})();
