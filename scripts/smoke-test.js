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

    const revs = await call('GET', `/api/editor/mscs/${mscId}/reviewers`);
    const pick = revs.body.reviewers.find(r => r.recommended);
    assert.ok(pick);
    assert.strictEqual((await call('POST', `/api/editor/mscs/${mscId}/assign`, { reviewerId: pick.id })).status, 200);
    const unavailable = revs.body.reviewers.find(r => !r.available);
    if (unavailable) assert.strictEqual((await call('POST', `/api/editor/mscs/${mscId}/assign`, { reviewerId: unavailable.id })).status, 409);
    step(`Reviewer proposed by availability and assigned (${pick.name})`);

    const started = await call('POST', `/api/mscs/${mscId}/start`);
    assert.strictEqual(started.body.reviewStatus, 'In Progress');
    const ann = await call('POST', `/api/mscs/${mscId}/annotations`, { type: 'comment', quote: 'aryl chlorides', comment: 'Define scope.' });
    assert.strictEqual(ann.status, 200);
    await call('POST', `/api/mscs/${mscId}/annotations`, { type: 'highlight', quote: 'copper' });
    await call('POST', `/api/mscs/${mscId}/progress`, { percent: 60 });
    step('Review started, annotations added, progress tracked');

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

    console.log('\nAll smoke tests passed.');
  } catch (e) {
    console.error('\n✗ Smoke test failed:', e.message);
    process.exitCode = 1;
  } finally {
    server.close();
    fs.rmSync(process.env.UEP_DATA_DIR, { recursive: true, force: true });
  }
})();
