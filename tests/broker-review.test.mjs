import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createClientAuth } from '../server/clientAuth.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const origin = 'https://mahwar.example';
const draft = { entity: 'individual', name: 'طلب اختبار تكامل', identity: '1234567890', commercial: '', phone: '0501234567', email: 'contact@example.com', address: '', domains: 'معدات', regions: 'الرياض' };
const cookie = response => response.headers.get('set-cookie').split(';')[0];
async function start(databasePath, now = Date.now) {
  const auth = createClientAuth({ databasePath, origin, now });
  const app = express(); app.use('/api/client', auth.router); app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port + '/api/client';
  const service = {
    get: (route, Cookie = '') => fetch(base + route, { headers: { Cookie } }),
    send: (route, body, Cookie = '', method = 'POST', headers = {}) => fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Origin: origin, Cookie, ...headers }, body: JSON.stringify(body) }),
    close: async () => { await new Promise(done => { server.closeAllConnections(); server.close(done); }); auth.close(); },
  };
  service.account = async name => {
    const input = { name, email: name + '@example.com', password: 'Isolated-review-test-password-2468' };
    const response = await service.send('/register', input);
    assert.equal(response.status, 201);
    const user = (await response.json()).user;
    assert.equal(user.permissions.reviewBrokers, false);
    return { user, input, Cookie: cookie(response) };
  };
  service.submit = async account => {
    const response = await service.send('/broker-requests', draft, account.Cookie);
    assert.equal(response.status, 201);
    return (await response.json()).request;
  };
  return service;
}
function temporaryDatabase() {
  const directory = mkdtempSync(join(tmpdir(), 'mahwar-review-test-'));
  return { databasePath: join(directory, 'clients.sqlite'), cleanup() {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('mahwar-review-test-'));
    rmSync(directory, { recursive: true, force: true });
  } };
}
function permission(databasePath, action, email) {
  return spawnSync(process.execPath, ['scripts/broker-reviewer.mjs', action, email], { cwd: root, env: { ...process.env, AUTH_DB_PATH: databasePath }, encoding: 'utf8' });
}
function grant(databasePath, account) {
  const result = permission(databasePath, 'grant', account.input.email);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { userId: account.user.id, reviewBrokers: true });
}
const detailPath = id => '/broker-review/requests/' + id;
const decisionPath = id => detailPath(id) + '/decision';

test('approval and rejection persist with reviewer, timestamp and reason through owner relogin and server restart', async () => {
  const temp = temporaryDatabase(); let service;
  const timestamp = Date.parse('2026-09-08T09:00:00Z');
  try {
    service = await start(temp.databasePath, () => timestamp);
    const reviewer = await service.account('reviewer'); grant(temp.databasePath, reviewer);
    const ownerA = await service.account('owner-a'), ownerB = await service.account('owner-b');
    const pendingA = await service.submit(ownerA), pendingB = await service.submit(ownerB);
    const list = await service.get('/broker-review/requests', reviewer.Cookie);
    assert.equal(list.status, 200); assert.equal(list.headers.get('cache-control'), 'no-store');
    assert.equal((await list.json()).total, 2);
    const details = await service.get(detailPath(pendingA.id), reviewer.Cookie);
    const review = await details.json();
    assert.equal(review.request.owner.id, ownerA.user.id); assert.equal(review.canDecide, true);
    assert.equal(review.request.data.identity, '1234567890');
    const approvedResponse = await service.send(decisionPath(pendingA.id), { status: 'approved' }, reviewer.Cookie);
    assert.equal(approvedResponse.status, 200);
    const approved = (await approvedResponse.json()).request;
    const rejectionReason = 'يرجى توضيح نطاق عمل الوساطة قبل إعادة التقديم.';
    const rejectedResponse = await service.send(decisionPath(pendingB.id), { status: 'rejected', reason: rejectionReason }, reviewer.Cookie);
    assert.equal(rejectedResponse.status, 200);
    const rejected = (await rejectedResponse.json()).request;
    assert.equal(approved.status, 'approved'); assert.equal(approved.rejectionReason, null);
    assert.equal(rejected.status, 'rejected'); assert.equal(rejected.rejectionReason, rejectionReason);
    for (const request of [approved, rejected]) {
      assert.equal(request.decidedAt, new Date(timestamp).toISOString());
      assert.equal(request.decidedBy.id, reviewer.user.id);
    }
    const inspect = new DatabaseSync(temp.databasePath);
    const rows = inspect.prepare('SELECT id,status,decided_at,decided_by,rejection_reason FROM broker_requests ORDER BY id').all();
    assert.equal(rows.length, 2);
    assert.equal(rows.find(row => row.id === pendingB.id).rejection_reason, rejectionReason);
    assert.ok(rows.every(row => row.decided_by === reviewer.user.id && row.decided_at === new Date(timestamp).toISOString()));
    inspect.close();
    for (const [owner, expected] of [[ownerA, approved], [ownerB, rejected]]) {
      const refreshed = (await (await service.get('/broker-requests', owner.Cookie)).json()).request;
      assert.equal(refreshed.status, expected.status); assert.equal(refreshed.decidedBy, undefined);
      await service.send('/logout', {}, owner.Cookie);
      assert.equal((await service.get('/broker-requests', owner.Cookie)).status, 401);
      const login = await service.send('/login', owner.input); assert.equal(login.status, 200);
      owner.Cookie = cookie(login);
      assert.deepEqual((await (await service.get('/broker-requests', owner.Cookie)).json()).request, refreshed);
    }
    await service.close(); service = undefined;
    service = await start(temp.databasePath, () => timestamp + 1000);
    for (const [owner, expected] of [[ownerA, approved], [ownerB, rejected]]) {
      const restored = (await (await service.get('/broker-requests', owner.Cookie)).json()).request;
      assert.equal(restored.id, expected.id); assert.equal(restored.status, expected.status);
      assert.equal(restored.decidedAt, expected.decidedAt); assert.equal(restored.rejectionReason, expected.rejectionReason);
    }
    assert.equal((await service.send('/broker-requests', draft, ownerA.Cookie)).status, 409);
    const second = await service.submit(ownerB); assert.notEqual(second.id, rejected.id);
    const original = (await (await service.get(detailPath(rejected.id), reviewer.Cookie)).json()).request;
    assert.equal(original.status, 'rejected'); assert.equal(original.rejectionReason, rejectionReason);
    assert.equal((await (await service.get('/broker-review/requests?status=rejected', reviewer.Cookie)).json()).total, 1);
  } finally { await service?.close(); temp.cleanup(); }
});

test('ordinary accounts cannot read or decide reviews, mutate administrative fields, or grant themselves permission', async () => {
  const temp = temporaryDatabase(); const service = await start(temp.databasePath);
  try {
    const owner = await service.account('owner'), other = await service.account('other');
    const request = await service.submit(owner);
    assert.equal((await service.get('/broker-review/requests')).status, 401);
    for (const account of [owner, other]) {
      assert.equal((await service.get('/broker-review/requests', account.Cookie)).status, 403);
      assert.equal((await service.get(detailPath(request.id), account.Cookie)).status, 403);
      assert.equal((await service.send(decisionPath(request.id), { status: 'approved' }, account.Cookie)).status, 403);
      assert.equal((await service.send('/broker-requests/' + request.id, { status: 'approved', ownerId: other.user.id }, account.Cookie, 'PATCH')).status, 404);
      assert.equal((await service.send('/broker-requests', { ...draft, status: 'approved', ownerId: other.user.id }, account.Cookie)).status, 400);
      assert.equal((await service.send('/me', { can_review_brokers: 1 }, account.Cookie, 'PATCH')).status, 404);
    }
    assert.equal((await service.send('/register', { name: 'forged', email: 'forged@example.com', password: owner.input.password, can_review_brokers: 1 })).status, 400);
    assert.equal((await (await service.get('/me', owner.Cookie)).json()).user.permissions.reviewBrokers, false);
    assert.equal((await (await service.get('/broker-requests', owner.Cookie)).json()).request.status, 'pending');
    assert.deepEqual(await (await service.get('/broker-requests', other.Cookie)).json(), { request: null });
  } finally { await service.close(); temp.cleanup(); }
});

test('server-only permission grant and revocation apply immediately to current sessions; reviewer cannot decide own request', async () => {
  const temp = temporaryDatabase(); const service = await start(temp.databasePath);
  try {
    const reviewer = await service.account('reviewer');
    const own = await service.submit(reviewer);
    assert.equal((await service.get('/broker-review/requests', reviewer.Cookie)).status, 403);
    grant(temp.databasePath, reviewer);
    assert.equal((await (await service.get('/me', reviewer.Cookie)).json()).user.permissions.reviewBrokers, true);
    assert.equal((await service.get('/broker-review/requests', reviewer.Cookie)).status, 200);
    assert.equal((await (await service.get(detailPath(own.id), reviewer.Cookie)).json()).canDecide, false);
    assert.equal((await service.send(decisionPath(own.id), { status: 'approved' }, reviewer.Cookie)).status, 403);
    assert.equal((await service.send(decisionPath(own.id), { status: 'rejected', reason: 'سبب رفض' }, reviewer.Cookie)).status, 403);
    const revoked = permission(temp.databasePath, 'revoke', reviewer.input.email); assert.equal(revoked.status, 0);
    assert.equal((await service.get('/broker-review/requests', reviewer.Cookie)).status, 403);
    assert.equal((await service.send(decisionPath(own.id), { status: 'approved' }, reviewer.Cookie)).status, 403);
    const absent = permission(temp.databasePath, 'grant', 'absent@example.com'); assert.equal(absent.status, 1);
    const inspect = new DatabaseSync(temp.databasePath);
    assert.equal(inspect.prepare('SELECT COUNT(*) AS n FROM client_users').get().n, 1);
    assert.equal(inspect.prepare('SELECT can_review_brokers FROM client_users').get().can_review_brokers, 0);
    inspect.close();
  } finally { await service.close(); temp.cleanup(); }
});

test('decision validation rejects invalid reasons, forged ownership/audit fields, cross-site requests and missing requests', async () => {
  const temp = temporaryDatabase(); const service = await start(temp.databasePath);
  try {
    const owner = await service.account('owner'), reviewer = await service.account('reviewer'); grant(temp.databasePath, reviewer);
    const request = await service.submit(owner);
    for (const payload of [
      {}, [], null, { status: 'pending' }, { status: 'rejected' }, { status: 'rejected', reason: '' },
      { status: 'rejected', reason: 'x'.repeat(1001) }, { status: 'rejected', reason: 'bad\u0000reason' },
      { status: 'rejected', reason: 1234 }, { status: 'approved', reason: 'not allowed' },
      { status: 'approved', ownerId: reviewer.user.id }, { status: 'approved', user_id: reviewer.user.id },
      { status: 'approved', decidedBy: owner.user.id }, { status: 'approved', decidedAt: 'yesterday' },
    ]) assert.equal((await service.send(decisionPath(request.id), payload, reviewer.Cookie)).status, 400);
    assert.equal((await service.send(decisionPath(request.id), { status: 'approved' }, reviewer.Cookie, 'POST', { Origin: 'https://other.example' })).status, 403);
    assert.equal((await service.send(decisionPath(request.id), { status: 'approved' }, reviewer.Cookie, 'POST', { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await service.send(decisionPath('missing'), { status: 'approved' }, reviewer.Cookie)).status, 404);
    assert.equal((await service.get(detailPath('missing'), reviewer.Cookie)).status, 404);
    assert.equal((await service.get('/broker-review/requests?status=invalid', reviewer.Cookie)).status, 400);
    assert.equal((await service.get('/broker-review/requests?page=-1', reviewer.Cookie)).status, 400);
    assert.equal((await (await service.get('/broker-requests', owner.Cookie)).json()).request.status, 'pending');
  } finally { await service.close(); temp.cleanup(); }
});

test('conflicting reviews through separate database connections persist exactly one immutable decision', async () => {
  const temp = temporaryDatabase(); let first, second;
  try {
    first = await start(temp.databasePath); second = await start(temp.databasePath);
    const owner = await first.account('owner'), reviewerA = await first.account('reviewer-a'), reviewerB = await first.account('reviewer-b');
    grant(temp.databasePath, reviewerA); grant(temp.databasePath, reviewerB);
    const request = await first.submit(owner);
    const responses = await Promise.all([
      first.send(decisionPath(request.id), { status: 'approved' }, reviewerA.Cookie),
      second.send(decisionPath(request.id), { status: 'rejected', reason: 'قرار متزامن آخر' }, reviewerB.Cookie),
    ]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    const results = await Promise.all(responses.map(response => response.json()));
    assert.deepEqual(results[0].request, results[1].request);
    const saved = results[0].request;
    const again = await second.send(decisionPath(request.id), { status: saved.status === 'approved' ? 'rejected' : 'approved', ...(saved.status === 'approved' ? { reason: 'محاولة تغيير القرار' } : {}) }, reviewerB.Cookie);
    assert.equal(again.status, 409); assert.deepEqual((await again.json()).request, saved);
    const inspect = new DatabaseSync(temp.databasePath);
    const row = inspect.prepare('SELECT status,decided_by,rejection_reason FROM broker_requests WHERE id=?').get(request.id);
    assert.equal(row.status, saved.status); assert.equal(row.decided_by, saved.decidedBy.id); assert.equal(row.rejection_reason, saved.rejectionReason);
    inspect.close();
  } finally { await first?.close(); await second?.close(); temp.cleanup(); }
});

test('migration preserves pre-existing accounts and pending broker data without granting permission', async () => {
  const temp = temporaryDatabase(); let service;
  try {
    const old = new DatabaseSync(temp.databasePath);
    old.exec(`CREATE TABLE client_users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE broker_requests(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES client_users(id),status TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL);`);
    old.prepare('INSERT INTO client_users VALUES (?,?,?,?,?)').run('existing-id', 'existing', 'existing@example.com', 'existing-password-hash', '2026-09-01T00:00:00Z');
    old.prepare('INSERT INTO broker_requests VALUES (?,?,?,?,?)').run('existing-request', 'existing-id', 'pending', JSON.stringify(draft), '2026-09-01T00:00:00Z'); old.close();
    service = await start(temp.databasePath); await service.close(); service = undefined;
    service = await start(temp.databasePath);
    const inspect = new DatabaseSync(temp.databasePath);
    const user = inspect.prepare('SELECT * FROM client_users').get(), request = inspect.prepare('SELECT * FROM broker_requests').get();
    assert.equal(user.password_hash, 'existing-password-hash'); assert.equal(user.can_review_brokers, 0);
    assert.equal(request.id, 'existing-request'); assert.equal(request.status, 'pending'); assert.equal(request.details, JSON.stringify(draft));
    assert.equal(request.decided_at, null); assert.equal(request.decided_by, null); assert.equal(request.rejection_reason, null);
    inspect.close();
  } finally { await service?.close(); temp.cleanup(); }
});

test('expired reviewer sessions lose read and decision access', async () => {
  const temp = temporaryDatabase(); let timestamp = Date.now(); const service = await start(temp.databasePath, () => timestamp);
  try {
    const reviewer = await service.account('reviewer'); grant(temp.databasePath, reviewer);
    const owner = await service.account('owner'), request = await service.submit(owner);
    timestamp += 7 * 86400000 + 1;
    assert.equal((await service.get('/broker-review/requests', reviewer.Cookie)).status, 401);
    assert.equal((await service.send(decisionPath(request.id), { status: 'approved' }, reviewer.Cookie)).status, 401);
  } finally { await service.close(); temp.cleanup(); }
});
