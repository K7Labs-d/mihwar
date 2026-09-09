import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createClientAuth } from '../server/clientAuth.ts';

const origin = 'https://mahwar.example';
const account = { name: 'اختبار طلب معزول', email: 'request-owner@example.com', password: 'isolated-request-password-123' };
const draft = { title: 'احتياج معدات للموقع', description: 'معدات للعمل داخل الموقع لمدة أسبوع حسب المواصفات المطلوبة.', location: 'الرياض', quantity: 2 };
const cookie = response => response.headers.get('set-cookie').split(';')[0];
function disk() {
  const directory = mkdtempSync(join(tmpdir(), 'mahwar-request-test-'));
  return { path: join(directory, 'clients.sqlite'), remove() {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('mahwar-request-test-'));
    rmSync(directory, { recursive: true, force: true });
  } };
}
async function start(databasePath = ':memory:', now = Date.now) {
  const auth = createClientAuth({ databasePath, origin, now });
  const app = express(); app.use('/api/client', auth.router);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port + '/api/client';
  const post = (route, body, Cookie = '', extra = {}) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Cookie, ...extra }, body: JSON.stringify(body) });
  return {
    post,
    create: (Cookie = '', body = draft, key = randomUUID(), extra = {}) => post('/requests', body, Cookie, { 'Idempotency-Key': key, ...extra }),
    get: (Cookie = '', suffix = '') => fetch(base + '/requests' + suffix, { headers: { Cookie } }),
    mutate: (Cookie, id, method) => fetch(base + '/requests/' + id, { method, headers: { Cookie, 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ status: 'approved', user_id: 'other' }) }),
    close: async () => { await new Promise(done => { server.closeAllConnections(); server.close(done); }); auth.close(); },
  };
}

test('client request is persisted in SQLite, owned by the session, and restored after refetch, logout/login and server restart', async () => {
  const database = disk(); let service;
  try {
    service = await start(database.path);
    const registration = await service.post('/register', account);
    assert.equal(registration.status, 201);
    const owner = (await registration.json()).user;
    const Cookie = cookie(registration);
    assert.deepEqual(await (await service.get(Cookie)).json(), { requests: [], page: 1, pageSize: 20, total: 0 });
    const response = await service.create(Cookie);
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const saved = (await response.json()).request;
    assert.match(saved.id, /^[a-f0-9-]{36}$/);
    assert.equal(saved.status, 'open');
    assert.equal(saved.createdAt, saved.updatedAt);
    assert.ok(Number.isFinite(Date.parse(saved.createdAt)));
    assert.equal(saved.ownerId, undefined);
    assert.equal(saved.submission_key, undefined);
    const db = new DatabaseSync(database.path);
    try { const row = db.prepare('SELECT * FROM client_requests WHERE id=?').get(saved.id); assert.equal(row.user_id, owner.id); assert.equal(row.title, draft.title); assert.equal(row.quantity, 2); assert.equal(row.status, 'open'); } finally { db.close(); }
    assert.deepEqual((await (await service.get(Cookie)).json()).requests, [saved]);
    assert.deepEqual((await (await service.get(Cookie, '/' + saved.id)).json()).request, saved);
    const otherRegistration = await service.post('/register', { ...account, email: 'request-other@example.com' });
    const otherCookie = cookie(otherRegistration);
    assert.equal((await (await service.get(otherCookie)).json()).total, 0);
    assert.equal((await service.get(otherCookie, '/' + saved.id)).status, 404);
    assert.equal((await service.get(otherCookie, '/' + saved.id + '?ownerId=' + owner.id)).status, 404);
    for (const method of ['PATCH', 'PUT', 'DELETE']) {
      assert.equal((await service.mutate(otherCookie, saved.id, method)).status, 405);
      assert.equal((await service.mutate(Cookie, saved.id, method)).status, 405);
    }
    assert.equal((await service.post('/logout', {}, Cookie)).status, 200);
    assert.equal((await service.get(Cookie)).status, 401);
    const login = await service.post('/login', { email: account.email, password: account.password });
    assert.equal(login.status, 200);
    const renewed = cookie(login);
    assert.deepEqual((await (await service.get(renewed)).json()).requests, [saved]);
    await service.close(); service = undefined;
    service = await start(database.path);
    assert.deepEqual((await (await service.get(renewed)).json()).requests, [saved]);
    assert.deepEqual((await (await service.get(renewed, '/' + saved.id)).json()).request, saved);
    assert.equal((await service.get(otherCookie, '/' + saved.id)).status, 404);
  } finally { await service?.close(); database.remove(); }
});

test('anonymous and expired sessions cannot create or read requests, including details', async () => {
  let clock = Date.now(); const service = await start(':memory:', () => clock);
  try {
    assert.equal((await service.get()).status, 401);
    assert.equal((await service.create()).status, 401);
    assert.equal((await service.get('', '/' + randomUUID())).status, 401);
    const Cookie = cookie(await service.post('/register', account));
    const saved = (await (await service.create(Cookie)).json()).request;
    clock += 7 * 86400000 + 1;
    assert.equal((await service.create(Cookie)).status, 401);
    assert.equal((await service.get(Cookie)).status, 401);
    assert.equal((await service.get(Cookie, '/' + saved.id)).status, 401);
  } finally { await service.close(); }
});

test('server rejects invalid fields, forged ownership/status/timestamps, unsafe origins and malformed payloads without writing', async () => {
  const service = await start();
  try {
    const Cookie = cookie(await service.post('/register', account));
    for (const body of [null, [], {}, '', { ...draft, title: '  ' }, { ...draft, title: 8 }, { ...draft, title: 'x'.repeat(121) },
      { ...draft, description: 'قصير' }, { ...draft, description: 'x'.repeat(2001) }, { ...draft, location: '' }, { ...draft, location: 'x'.repeat(161) },
      { ...draft, quantity: 0 }, { ...draft, quantity: 1.5 }, { ...draft, quantity: '2' }, { ...draft, quantity: 1001 }, { ...draft, quantity: null },
      { ...draft, title: 'bad\u0000title' }, { ...draft, ownerId: randomUUID() }, { ...draft, user_id: randomUUID() }, { ...draft, userId: randomUUID() },
      { ...draft, status: 'open' }, { ...draft, status: 'approved' }, { ...draft, id: randomUUID() }, { ...draft, createdAt: '2000-01-01' },
      { ...draft, updated_at: '2000-01-01' }, { ...draft, files: [] }, JSON.parse('{"__proto__":{}}')]) {
      assert.equal((await service.create(Cookie, body)).status, 400, JSON.stringify(body).slice(0, 180));
    }
    const invalid = await service.create(Cookie, { ...draft, quantity: 0 });
    assert.ok((await invalid.json()).fieldErrors.quantity);
    assert.equal((await service.post('/requests', draft, Cookie)).status, 400);
    assert.equal((await service.create(Cookie, draft, 'bad-key')).status, 400);
    assert.equal((await service.create(Cookie, draft, randomUUID(), { Origin: 'https://other.example' })).status, 403);
    assert.equal((await service.create(Cookie, draft, randomUUID(), { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await service.create(Cookie, draft, randomUUID(), { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await service.create(Cookie, { ...draft, description: 'x'.repeat(18000) })).status, 413);
    assert.equal((await (await service.get(Cookie)).json()).total, 0);
  } finally { await service.close(); }
});

test('concurrent submissions across database connections and retries persist one request per idempotency key', async () => {
  const database = disk(); const service = await start(database.path); const replica = await start(database.path);
  try {
    const Cookie = cookie(await service.post('/register', account)); const key = randomUUID();
    const responses = await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? service : replica).create(Cookie, draft, key)));
    assert.equal(responses.filter(result => result.status === 201).length, 1);
    assert.equal(responses.filter(result => result.status === 200).length, 7);
    const results = await Promise.all(responses.map(result => result.json()));
    assert.equal(new Set(results.map(result => result.request.id)).size, 1);
    assert.equal((await service.create(Cookie, { ...draft, quantity: 3 }, key)).status, 409);
    assert.equal((await (await service.get(Cookie)).json()).total, 1);
    assert.equal((await service.create(Cookie)).status, 201);
    assert.equal((await (await service.get(Cookie)).json()).total, 2);
    const other = cookie(await service.post('/register', { ...account, email: 'separate-key@example.com' }));
    assert.equal((await service.create(other, { ...draft, quantity: 3 }, key)).status, 201);
    assert.equal((await (await service.get(other)).json()).total, 1);
  } finally { await service.close(); await replica.close(); database.remove(); }
});

test('a failed SQLite write returns an error, never a success; the unchanged retry is safe', async () => {
  const database = disk(); const service = await start(database.path); const db = new DatabaseSync(database.path);
  try {
    const Cookie = cookie(await service.post('/register', account)); const key = randomUUID();
    db.exec("CREATE TRIGGER fail_request_write BEFORE INSERT ON client_requests BEGIN SELECT RAISE(ABORT, 'isolated write failure'); END;");
    const response = await service.create(Cookie, draft, key);
    assert.equal(response.status, 500);
    const error = await response.json(); assert.ok(error.error); assert.equal(error.request, undefined);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM client_requests').get().n, 0);
    db.exec('DROP TRIGGER fail_request_write');
    assert.equal((await service.create(Cookie, draft, key)).status, 201);
    assert.equal((await service.create(Cookie, draft, key)).status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM client_requests').get().n, 1);
  } finally { db.close(); await service.close(); database.remove(); }
});

test('lists are bounded, consistently ordered and account-scoped; missing IDs and invalid pagination are handled', async () => {
  const service = await start(':memory:', () => 1700000000000);
  try {
    const Cookie = cookie(await service.post('/register', account));
    const responses = await Promise.all(Array.from({ length: 23 }, (_, i) => service.create(Cookie, { ...draft, title: 'طلب منفصل ' + i })));
    assert.ok(responses.every(response => response.status === 201));
    const first = await (await service.get(Cookie)).json(); const second = await (await service.get(Cookie, '?page=2')).json();
    assert.equal(first.total, 23); assert.equal(first.requests.length, 20); assert.equal(second.requests.length, 3);
    assert.equal(new Set([...first.requests, ...second.requests].map(item => item.id)).size, 23);
    assert.deepEqual((await (await service.get(Cookie)).json()).requests, first.requests);
    assert.equal((await (await service.get(Cookie, '?page=3')).json()).requests.length, 0);
    for (const query of ['?page=0', '?page=-1', '?page=1.5', '?page=1000000', '?page=1&page=2', '?ownerId=other']) assert.equal((await service.get(Cookie, query)).status, 400);
    for (const id of ['not-an-id', randomUUID(), "' OR 1=1 --"]) assert.equal((await service.get(Cookie, '/' + encodeURIComponent(id))).status, 404);
  } finally { await service.close(); }
});
