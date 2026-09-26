import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createClientAuth } from '../server/clientAuth.ts';
import { validateBrokerStep } from '../src/utils/brokerForm.ts';

const origin = 'https://mahwar.example';
const draft = { entity: 'individual', name: 'اسم مؤجر صحيح', identity: '1234567890', commercial: '', phone: '0501234567', email: 'unicode@example.test', address: '', domains: 'معدات', regions: 'الرياض' };
const decisionPath = id => `/broker-review/requests/${id}/decision`;
const inspect = (path, run) => { const db = new DatabaseSync(path); try { return run(db); } finally { db.close(); } };
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'mahwar-unicode-'));
  const path = join(directory, 'clients.sqlite');
  let auth, server, base;
  const start = async () => {
    auth = createClientAuth({ databasePath: path, origin });
    const app = express(); app.use('/api/client', auth.router);
    server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}/api/client`;
  };
  const stop = async () => { if (server) { await new Promise(done => { server.closeAllConnections(); server.close(done); }); server = undefined; } auth?.close(); auth = undefined; };
  const get = (route, Cookie) => fetch(base + route, { headers: { Cookie } });
  const post = (route, body, Cookie = '') => fetch(base + route, { method: 'POST', headers: { Cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  await start();
  const account = async name => {
    const input = { name, email: `${name}@example.test`, password: 'unicode-isolated-password-1234' };
    const response = await post('/register', input); assert.equal(response.status, 201);
    return { ...await response.json(), Cookie: response.headers.get('set-cookie').split(';')[0] };
  };
  const owner = await account('unicode-owner'), reviewer = await account('unicode-reviewer');
  inspect(path, db => db.prepare('UPDATE client_users SET can_review_brokers=1 WHERE id=?').run(reviewer.user.id));
  const submit = async (name = draft.name) => {
    const response = await post('/broker-requests', { ...draft, name }, owner.Cookie);
    return { status: response.status, body: await response.json() };
  };
  return { path, start, stop, get, post, owner, reviewer, account, submit, async close() {
    await stop(); assert.equal(dirname(resolve(directory)), resolve(tmpdir())); assert.ok(basename(directory).startsWith('mahwar-unicode-'));
    rmSync(directory, { recursive: true, force: true });
  } };
}
test('broker names count normalized Unicode code points in both the form and HTTP submission', async () => {
  const f = await fixture();
  try {
    for (const name of ['😀', 'e\u0301', '😀\u0000', 'a\ud800']) {
      assert.ok(validateBrokerStep({ ...draft, name }, 0).name, JSON.stringify(name));
      const response = await f.submit(name); assert.equal(response.status, 400); assert.ok(response.body.fieldErrors.name);
      assert.equal(inspect(f.path, db => db.prepare('SELECT COUNT(*) AS n FROM broker_requests').get().n), 0);
    }
    const valid = await f.submit('😀أ'); assert.equal(valid.status, 201);
    assert.equal((await f.post(decisionPath(valid.body.request.id), { status: 'approved' }, f.reviewer.Cookie)).status, 200);
    assert.equal((await (await f.get('/lessor-profile', f.owner.Cookie)).json()).profile.displayName, '😀أ');
  } finally { await f.close(); }
});
test('a legacy pending invalid name returns an actionable 422 and can be rejected and resubmitted', async () => {
  const f = await fixture();
  try {
    const pending = (await f.submit()).body.request;
    inspect(f.path, db => db.prepare('UPDATE broker_requests SET details=? WHERE id=?').run(JSON.stringify({ ...draft, name: '😀' }), pending.id));
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await f.post(decisionPath(pending.id), { status: 'approved' }, f.reviewer.Cookie);
      assert.equal(response.status, 422); assert.match((await response.json()).error, /اسم|بيانات/);
    }
    inspect(f.path, db => { assert.equal(db.prepare('SELECT status FROM broker_requests WHERE id=?').get(pending.id).status, 'pending'); assert.equal(db.prepare('SELECT COUNT(*) AS n FROM lessor_profiles').get().n, 0); });
    assert.equal((await f.post(decisionPath(pending.id), { status: 'rejected', reason: 'صحح اسم المؤجر وأعد التقديم' }, f.reviewer.Cookie)).status, 200);
    const corrected = await f.submit(); assert.equal(corrected.status, 201);
    assert.equal((await f.post(decisionPath(corrected.body.request.id), { status: 'approved' }, f.reviewer.Cookie)).status, 200);
  } finally { await f.close(); }
});
for (const ledger of [0, 2]) test(`legacy Unicode approval does not block startup from migration ${ledger}; correction is reconciled once`, async () => {
  const f = await fixture();
  try {
    const pending = (await f.submit()).body.request;
    const unaffected = await f.account('valid-legacy-owner');
    const validPending = (await (await f.post('/broker-requests', draft, unaffected.Cookie)).json()).request;
    await f.stop();
    const original = inspect(f.path, db => {
      db.prepare("UPDATE broker_requests SET details=?,status='approved',decided_at=?,decided_by=? WHERE id=?").run(JSON.stringify({ ...draft, name: '😀' }), '2026-09-01T00:00:00.000Z', f.reviewer.user.id, pending.id);
      db.prepare("UPDATE broker_requests SET status='approved',decided_at=?,decided_by=? WHERE id=?").run('2026-09-01T00:00:00.000Z', f.reviewer.user.id, validPending.id);
      if (ledger === 0) db.exec('DROP TABLE equipment; DROP TABLE lessor_profiles; DROP INDEX broker_request_identity_owner; DROP TABLE schema_migrations;');
      else db.exec('DELETE FROM schema_migrations WHERE version=3;');
      return { row: db.prepare('SELECT * FROM broker_requests WHERE id=?').get(pending.id), users: db.prepare('SELECT * FROM client_users ORDER BY id').all(), sessions: db.prepare('SELECT * FROM client_sessions ORDER BY token_hash').all() };
    });
    await f.start();
    inspect(f.path, db => {
      assert.deepEqual(db.prepare('SELECT * FROM broker_requests WHERE id=?').get(pending.id), original.row);
      assert.deepEqual(db.prepare('SELECT * FROM client_users ORDER BY id').all(), original.users);
      assert.deepEqual(db.prepare('SELECT * FROM client_sessions ORDER BY token_hash').all(), original.sessions);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM lessor_profiles').get().n, 1);
      assert.equal(db.prepare('SELECT user_id FROM lessor_profiles').get().user_id, unaffected.user.id);
      assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
      assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
    });
    const status = await f.get('/lessor-profile', f.owner.Cookie); assert.equal(status.status, 409);
    assert.equal((await status.json()).code, 'LESSOR_IDENTITY_REQUIRES_CORRECTION');
    assert.equal((await f.get('/equipment', f.owner.Cookie)).status, 403);
    assert.equal((await f.get('/me', f.reviewer.Cookie)).status, 200);
    const detail = await (await f.get(`/broker-review/requests/${pending.id}`, f.reviewer.Cookie)).json();
    assert.equal(detail.request.status, 'approved'); assert.ok(detail.request.identityIssue);
    const validProfile = (await (await f.get('/lessor-profile', unaffected.Cookie)).json()).profile;
    assert.equal(validProfile.displayName, draft.name);
    assert.equal((await f.get('/equipment', unaffected.Cookie)).status, 200);
    await f.stop(); await f.start();
    assert.equal((await f.get('/lessor-profile', f.owner.Cookie)).status, 409);
    await f.stop();
    // Authorized maintenance correction is simulated only in this disposable fixture; approval/audit data stays unchanged.
    inspect(f.path, db => db.prepare('UPDATE broker_requests SET details=? WHERE id=?').run(JSON.stringify(draft), pending.id));
    await f.start();
    const restored = (await (await f.get('/lessor-profile', f.owner.Cookie)).json()).profile;
    assert.equal(restored.displayName, draft.name);
    await f.stop(); await f.start();
    assert.deepEqual((await (await f.get('/lessor-profile', f.owner.Cookie)).json()).profile, restored);
    inspect(f.path, db => {
      const row = db.prepare('SELECT * FROM broker_requests WHERE id=?').get(pending.id);
      assert.deepEqual({ ...row, details: original.row.details }, { ...original.row });
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM lessor_profiles').get().n, 2);
    });
    assert.deepEqual((await (await f.get('/lessor-profile', unaffected.Cookie)).json()).profile, validProfile);
  } finally { await f.close(); }
});
