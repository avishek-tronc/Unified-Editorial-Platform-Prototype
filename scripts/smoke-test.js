'use strict';
/**
 * End-to-end API smoke test. Starts the app on a random port with a
 * temporary data directory and walks through the author and editor flows.
 * Usage: npm test
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

process.env.UEP_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'uep-test-'));
const { app, init } = require('../server');

const samples = path.join(__dirname, '..', 'samples');

(async () => {
  await init();
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (method, url, body, isForm) => {
    const res = await fetch(base + url, {
      method,
      headers: { cookie, ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
      redirect: 'manual'
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const ct = res.headers.get('content-type') || '';
    return { status: res.status, body: ct.includes('json') ? await res.json() : await res.arrayBuffer() };
  };
  const upload = (file, journalId, mscId) => {
    const fd = new FormData();
    fd.append('journalId', journalId);
    if (mscId) fd.append('mscId', mscId);
    fd.append('msc', new Blob([fs.readFileSync(path.join(samples, file))]), file);
    return call('POST', '/api/author/check', fd, true);
  };
  const step = (name) => console.log(`✓ ${name}`);

  try {
    // login
    assert.strictEqual((await call('POST', '/api/login', { username: 'admin', password: 'x', role: 'Author' })).status, 401);
    assert.strictEqual((await call('POST', '/api/login', { username: 'Admin', password: 'Admin', role: 'Author' })).status, 200);
    step('Admin/Admin login (Author) and bad credentials rejected');

    // template
    const tpl = await call('GET', '/api/template/JACS');
    assert.strictEqual(tpl.status, 200);
    assert.ok(tpl.body.byteLength > 5000);
    step('JACS MSC template download');

    // invalid format
    const fd = new FormData();
    fd.append('journalId', 'JACS');
    fd.append('msc', new Blob(['hello']), 'paper.pdf');
    const bad = await call('POST', '/api/author/check', fd, true);
    assert.strictEqual(bad.body.report.valid, false);
    step('Non-.docx upload rejected with remediation');

    // failing MSC
    const fail = await upload('sample-msc-fail.docx', 'JACS');
    assert.strictEqual(fail.body.report.passed, false);
    assert.ok(fail.body.report.score <= 6);
    assert.strictEqual((await call('POST', '/api/author/submit', { checkId: fail.body.checkId })).status, 422);
    step(`Weak MSC fails (score ${fail.body.report.score}) and cannot be submitted`);

    // passing MSC
    const pass = await upload('sample-msc-pass-JACS.docx', 'JACS');
    assert.strictEqual(pass.body.report.passed, true);
    const sub = await call('POST', '/api/author/submit', { checkId: pass.body.checkId });
    assert.strictEqual(sub.status, 200);
    const mscId = sub.body.mscId;
    step(`Good MSC passes (score ${pass.body.report.score}) and is submitted as ${mscId}`);

    // author cannot reach editor API
    assert.strictEqual((await call('GET', '/api/editor/mscs')).status, 403);

    // editor
    await call('POST', '/api/logout');
    assert.strictEqual((await call('POST', '/api/login', { username: 'Admin', password: 'Admin', role: 'Editor' })).status, 200);
    const dash = await call('GET', '/api/editor/mscs');
    const row = dash.body.mscs.find(m => m.id === mscId);
    assert.ok(row && row.reviewStatus === 'Open' && row.elapsedBand === 'green');
    step(`Dashboard lists ${dash.body.mscs.length} MSCs including the new one`);

    assert.strictEqual((await call('POST', `/api/mscs/${mscId}/start`)).status, 409, 'review must be blocked until a reviewer is assigned');
    assert.strictEqual(row.canReview, false);
    step('Review & annotate blocked until a reviewer is assigned');

    const revs = await call('GET', `/api/editor/mscs/${mscId}/reviewers`);
    const pick = revs.body.reviewers.find(r => r.recommended);
    assert.ok(pick);
    assert.ok(revs.body.reviewers.every(r => /@/.test(r.email)), 'every reviewer has an e-mail address');
    const inv = await call('POST', `/api/editor/mscs/${mscId}/assign`, { reviewerId: pick.id });
    assert.strictEqual(inv.status, 200);
    assert.ok(inv.body.email.to.includes(pick.email) && inv.body.email.link.includes('/invite/'));
    assert.strictEqual(inv.body.row.invitationStatus, 'Pending');
    assert.strictEqual(inv.body.row.canReview, false);
    const unavailable = revs.body.reviewers.find(r => !r.available);
    if (unavailable) assert.strictEqual((await call('POST', `/api/editor/mscs/${mscId}/assign`, { reviewerId: unavailable.id })).status, 409);
    step(`Reviewer selected with e-mail (${pick.name} <${pick.email}>) and invitation e-mail sent`);

    assert.strictEqual((await call('POST', `/api/mscs/${mscId}/start`)).status, 409, 'review must wait for the reviewer to accept');
    const token = inv.body.email.link.split('/invite/')[1];
    const saved = cookie; cookie = ''; // the reviewer opens the link without logging in
    const view = await call('GET', `/api/invitations/${token}`);
    assert.strictEqual(view.body.status, 'Pending');
    assert.strictEqual(view.body.msc.id, mscId);
    assert.strictEqual((await call('GET', '/api/invitations/' + 'f'.repeat(36))).status, 404);
    const acc = await call('POST', `/api/invitations/${token}/respond`, { accept: true });
    assert.strictEqual(acc.body.status, 'Accepted');
    assert.strictEqual((await call('POST', `/api/invitations/${token}/respond`, { accept: false })).status, 409);
    cookie = saved;
    assert.strictEqual((await call('GET', `/api/editor/mscs/${mscId}/invitation`)).body.status, 'Accepted');
    const refreshed = await call('GET', `/api/editor/mscs/${mscId}`);
    assert.strictEqual(refreshed.body.invitationStatus, 'Accepted', 'refresh icon endpoint reports the accepted invitation');
    assert.ok(refreshed.body.canReview);
    step('Review blocked until the reviewer accepts the invitation link (no login needed)');

    const other = dash.body.mscs.find(m => m.reviewStatus === 'Open' && !m.assignedReviewerId && m.id !== mscId);
    const orevs = await call('GET', `/api/editor/mscs/${other.id}/reviewers`);
    const inv2 = await call('POST', `/api/editor/mscs/${other.id}/assign`, { reviewerId: orevs.body.reviewers.find(r => r.available).id });
    const resend = await call('POST', `/api/editor/mscs/${other.id}/assign`, { reviewerId: inv2.body.row.assignedReviewerId });
    assert.strictEqual(resend.status, 200);
    assert.strictEqual((await call('GET', `/api/invitations/${inv2.body.email.link.split('/invite/')[1]}`)).status, 404, 'a re-sent invitation replaces the old link');
    const dec2 = await call('POST', `/api/invitations/${resend.body.email.link.split('/invite/')[1]}/respond`, { accept: false });
    assert.strictEqual(dec2.body.status, 'Declined');
    const otherRow = (await call('GET', '/api/editor/mscs')).body.mscs.find(m => m.id === other.id);
    assert.strictEqual(otherRow.assignedReviewerId, null);
    step('Re-sent invitation replaces the old link; declining frees the MSC for another reviewer');

    const started = await call('POST', `/api/mscs/${mscId}/start`);
    assert.strictEqual(started.body.reviewStatus, 'In Progress');
    const ann = await call('POST', `/api/mscs/${mscId}/annotations`, { type: 'comment', quote: 'aryl chlorides', comment: 'Define scope.' });
    assert.strictEqual(ann.status, 200);
    const hl = await call('POST', `/api/mscs/${mscId}/annotations`, { type: 'highlight', quote: 'copper', color: 'green' });
    assert.strictEqual(hl.body.color, 'green');
    assert.strictEqual((await call('PUT', `/api/mscs/${mscId}/annotations/${hl.body.id}`, { color: 'purple' })).body.color, 'purple');
    assert.strictEqual((await call('PUT', `/api/mscs/${mscId}/annotations/${hl.body.id}`, { color: 'black' })).status, 400);
    await call('POST', `/api/mscs/${mscId}/progress`, { percent: 60 });
    step('Review started, annotations (coloured highlights) added, progress tracked');

    const an = await call('GET', `/api/mscs/${mscId}/analysis`);
    assert.strictEqual(an.status, 200);
    assert.ok(an.body.summary.blocks.length >= 2, 'summary has sections');
    const reviewMsc = (await call('GET', `/api/mscs/${mscId}`)).body;
    assert.strictEqual(an.body.integrity.score, reviewMsc.integrity.score, 'reviewer integrity score matches the Author upload check');
    assert.strictEqual(an.body.integrity.passed, an.body.integrity.score > 6);
    assert.strictEqual(an.body.fitment.journal.id, reviewMsc.journalId);
    assert.strictEqual(an.body.fitment.index, reviewMsc.fitmentIndex);
    step(`MSC analysis: summary, integrity ${an.body.integrity.score}/10 (same rules), fitment ${an.body.fitment.index}% with ${an.body.fitment.journal.shortName}`);

    assert.strictEqual((await call('POST', `/api/mscs/${mscId}/decision`, { type: 'Accept', alternateJournalId: 'ORGLETT', summary: 'x' })).status, 400);
    const dec = await call('POST', `/api/mscs/${mscId}/decision`, { type: 'Revise', revisionType: 'Minor', summary: 'Please address comments.' });
    assert.strictEqual(dec.body.reviewStatus, 'Complete');
    assert.strictEqual(dec.body.feedbackStatus, 'In Progress');
    assert.strictEqual((await call('POST', `/api/mscs/${mscId}/annotations`, { type: 'highlight', quote: 'copper' })).status, 409);
    step('Alternate journal only allowed for Transfer; Revise decision closes review');

    // author revision
    await call('POST', '/api/logout');
    await call('POST', '/api/login', { username: 'Admin', password: 'Admin', role: 'Author' });
    const mine = await call('GET', '/api/author/submissions');
    assert.ok(mine.body.find(m => m.id === mscId).canRevise);
    const rev = await upload('sample-msc-pass-JACS.docx', 'JACS', mscId);
    assert.strictEqual(rev.body.report.passed, true, 'revision should not be flagged as plagiarising its own earlier version');
    const rsub = await call('POST', '/api/author/submit', { checkId: rev.body.checkId });
    assert.strictEqual(rsub.body.revision, true);
    const after = (await call('GET', '/api/author/submissions')).body.find(m => m.id === mscId);
    assert.strictEqual(after.revisions, 1);
    assert.strictEqual(after.reviewStatus, 'Open');
    assert.strictEqual(after.feedbackStatus, 'Complete');
    step('Author re-submits revision; MSC back to Open with revisions = 1');

    // transfer
    await call('POST', '/api/logout');
    await call('POST', '/api/login', { username: 'Admin', password: 'Admin', role: 'Editor' });
    const tr = await call('POST', `/api/mscs/${mscId}/decision`, { type: 'Transfer', alternateJournalId: 'ORGLETT', summary: 'Better suited to Org. Lett.' });
    assert.strictEqual(tr.body.finalDecision, 'Transfer');
    assert.strictEqual(tr.body.transferredTo, 'ORGLETT');
    step('Transfer decision with alternate journal');

    const inProg = dash.body.mscs.find(m => m.reviewStatus === 'In Progress' && m.assignedReviewerId);
    assert.strictEqual((await call('POST', `/api/mscs/${inProg.id}/decision`, { type: 'Assign to PE', summary: 'Ready for production.' })).status, 400);
    const pe = await call('POST', `/api/mscs/${inProg.id}/decision`, { type: 'Assign to PE', publishingEditorId: 'PE-1', summary: 'Ready for production.' });
    assert.strictEqual(pe.body.finalDecision, 'Assign to PE');
    assert.strictEqual(pe.body.publishingEditor, 'Margaret Ellis');
    step('Assign to PE decision requires and records a Publishing Editor');

    // usage metrics & audit trail
    assert.strictEqual((await call('POST', '/api/track/page', { path: '/dashboard', title: 'MSC Dashboard' })).body.ok, true);
    assert.strictEqual((await call('POST', '/api/track/heartbeat')).body.ok, true);
    await call('POST', '/api/track/page', { path: `/review/${mscId}`, title: 'Review' });
    const met = await call('GET', '/api/metrics');
    assert.ok(met.body.kpis.sessions >= 4 && met.body.kpis.pageViews >= 2);
    const me = met.body.sessions.find(x => x.id === met.body.currentSessionId);
    assert.ok(me && me.active && me.ip && me.os && me.footprint && me.location && me.pages.length === 2);
    assert.ok(met.body.pages.find(p => p.path === '/review/:id'));
    const aud = await call('GET', '/api/metrics/audit');
    for (const ev of ['login', 'login.failed', 'logout', 'page.view', 'invitation.sent', 'invitation.accepted', 'invitation.declined', 'review.started', 'review.decision', 'msc.submitted']) {
      assert.ok(aud.body.events.includes(ev), `audit trail records ${ev}`);
    }
    const csv = await call('GET', '/api/metrics/export/audit');
    assert.strictEqual(csv.status, 200);
    assert.ok(Buffer.from(csv.body).toString().startsWith('at,event,user'));
    step(`Usage metrics: sessions, IP, OS, footprint, pages and ${aud.body.total} audit events recorded`);

    console.log('\nAll smoke tests passed.');
  } catch (e) {
    console.error('\n✗ Smoke test failed:', e.message);
    process.exitCode = 1;
  } finally {
    server.close();
    fs.rmSync(process.env.UEP_DATA_DIR, { recursive: true, force: true });
  }
})();
