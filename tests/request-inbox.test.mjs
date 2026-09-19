import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createClientAuth } from '../server/clientAuth.ts';

const origin = 'https://mahwar.example';
const draft = { title: 'احتياج حفار للموقع', description: 'نحتاج حفارًا لمدة ثلاثة أيام في موقع العمل.', location: 'الرياض', quantity: 1 };
async function start(databasePath, now = Date.now) {
  const auth = createClientAuth({ databasePath, origin, now });
  const app = express(); app.use('/api/client', auth.router);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port + '/api/client';
  return {
    get: (path, cookie = '') => fetch(base + path, { headers: { Cookie: cookie } }),
    send: (path, data, cookie = '', key = randomUUID(), extra = {}, method = 'POST') => fetch(base + path, { method, headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json', 'Idempotency-Key': key, ...extra }, body: JSON.stringify(data) }),
    async account(name) {
      const input = { name, email: name + '@example.com', password: 'isolated-inbox-password-123' };
      const response = await this.send('/register', input);
      assert.equal(response.status, 201);
      return { input, user: (await response.json()).user, cookie: response.headers.get('set-cookie').split(';')[0] };
    },
    async request(account, input = draft) { const response = await this.send('/requests', input, account.cookie); assert.equal(response.status, 201); return (await response.json()).request; },
    async close() { await new Promise(done => { server.closeAllConnections(); server.close(done); }); auth.close(); },
  };
}
async function fixture(now) {
  const directory = mkdtempSync(join(tmpdir(), 'mahwar-inbox-'));
  const path = join(directory, 'clients.sqlite');
  const service = await start(path, now);
  const client = await service.account('client'), manager = await service.account('manager'), other = await service.account('other');
  const permission = action => spawnSync(process.execPath, ['scripts/request-manager.mjs', action, manager.input.email], { cwd: new URL('..', import.meta.url), env: { ...process.env, AUTH_DB_PATH: path }, encoding: 'utf8' });
  assert.equal(permission('grant').status, 0);
  const db = new DatabaseSync(path);
  return { path, service, client, manager, other, permission, db, async close() { db.close(); await this.service.close(); rmSync(directory, { recursive: true, force: true }); } };
}
const adminMessages = id => '/request-inbox/' + id + '/messages';
const clientMessages = id => '/request-conversations/' + id + '/messages';

test('client request reaches admin, replies reach only its owner, follow-up updates inbox, and all data survives restart', async () => {
  const f = await fixture();
  try {
    const request = await f.service.request(f.client);
    const snapshot = f.db.prepare('SELECT * FROM client_requests WHERE id=?').get(request.id);
    let list = await (await f.service.get('/request-inbox', f.manager.cookie)).json();
    assert.deepEqual(list.stats, { total: 1, unanswered: 1, answered: 0 });
    assert.equal(list.requests[0].customer.email, f.client.input.email);
    const response = await f.service.send(adminMessages(request.id), { body: 'وصل طلبك، ما موعد بداية العمل؟' }, f.manager.cookie);
    assert.equal(response.status, 201);
    const message = (await response.json()).message;
    assert.equal(message.role, 'admin'); assert.equal(message.author_id, undefined);
    const read = await f.service.get(clientMessages(request.id), f.client.cookie);
    assert.equal(read.headers.get('cache-control'), 'no-store');
    assert.deepEqual((await read.json()).messages, [message]);
    assert.deepEqual((await (await f.service.get('/request-inbox', f.manager.cookie)).json()).stats, { total: 1, unanswered: 0, answered: 1 });
    assert.equal((await f.service.send(clientMessages(request.id), { body: 'نحتاجها صباح الأحد.' }, f.client.cookie)).status, 201);
    list = await (await f.service.get('/request-inbox?filter=unanswered', f.manager.cookie)).json();
    assert.equal(list.total, 1); assert.equal(list.requests[0].waitingFor, 'admin');
    assert.deepEqual(f.db.prepare('SELECT * FROM client_requests WHERE id=?').get(request.id), snapshot, 'conversation must not rewrite request payload or business status');
    const replica = await start(f.path);
    try { assert.equal((await (await replica.get(clientMessages(request.id), f.client.cookie)).json()).messages.length, 2); }
    finally { await replica.close(); }
    await f.service.close(); f.service = await start(f.path);
    assert.equal((await (await f.service.get(adminMessages(request.id), f.manager.cookie)).json()).messages.length, 2);
    await f.service.send('/logout', {}, f.client.cookie);
    assert.equal((await f.service.get(clientMessages(request.id), f.client.cookie)).status, 401);
    const login = await f.service.send('/login', f.client.input);
    const renewed = login.headers.get('set-cookie').split(';')[0];
    assert.equal((await (await f.service.get(clientMessages(request.id), renewed)).json()).messages.length, 2);
  } finally { await f.close(); }
});

test('admin permission is independent, cannot be self-granted, is rechecked after revocation, and expired sessions fail', async () => {
  let clock = Date.now(); const f = await fixture(() => clock);
  try {
    const request = await f.service.request(f.client);
    assert.equal(f.client.user.permissions.manageRequests, false);
    f.db.prepare('UPDATE client_users SET can_review_brokers=1 WHERE id=?').run(f.other.user.id);
    for (const path of ['/request-inbox', '/request-inbox/' + request.id, adminMessages(request.id)]) {
      assert.equal((await f.service.get(path)).status, 401);
      assert.equal((await f.service.get(path, f.client.cookie)).status, 403);
      assert.equal((await f.service.get(path, f.other.cookie)).status, 403);
    }
    assert.equal((await f.service.send('/register', { ...f.other.input, can_manage_requests: 1 })).status, 400);
    assert.equal((await f.service.send('/register', { ...f.other.input, permissions: { manageRequests: true } })).status, 400);
    assert.equal((await f.service.get(clientMessages(request.id), f.other.cookie)).status, 404);
    assert.equal((await f.service.send(clientMessages(request.id), { body: 'تلاعب' }, f.other.cookie)).status, 404);
    assert.equal((await f.service.get(clientMessages(randomUUID()), f.other.cookie)).status, 404);
    assert.equal((await (await f.service.get('/me', f.manager.cookie)).json()).user.permissions.manageRequests, true);
    assert.equal(f.permission('revoke').status, 0);
    assert.equal((await f.service.get('/request-inbox', f.manager.cookie)).status, 403);
    assert.equal((await f.service.send(adminMessages(request.id), { body: 'رد' }, f.manager.cookie)).status, 403);
    assert.equal(f.permission('grant').status, 0);
    clock += 7 * 86400000 + 1;
    assert.equal((await f.service.get('/request-inbox', f.manager.cookie)).status, 401);
    assert.equal((await f.service.send(clientMessages(request.id), { body: 'رد' }, f.client.cookie)).status, 401);
  } finally { await f.close(); }
});

test('message validation, origin protection, method restrictions and safe literal search reject tampering', async () => {
  const f = await fixture();
  try {
    const request = await f.service.request(f.client);
    for (const body of [null, [], {}, { body: '' }, { body: '  ' }, { body: 2 }, { body: 'x'.repeat(2001) }, { body: 'bad\u0000text' }, { body: 'text', role: 'admin' }, { body: 'text', author_id: f.manager.user.id }]) assert.equal((await f.service.send(adminMessages(request.id), body, f.manager.cookie)).status, 400);
    for (const extra of [{ Origin: 'https://evil.example' }, { 'Sec-Fetch-Site': 'cross-site' }]) assert.equal((await f.service.send(adminMessages(request.id), { body: 'رد' }, f.manager.cookie, randomUUID(), extra)).status, 403);
    assert.equal((await f.service.send(adminMessages(request.id), { body: 'رد' }, f.manager.cookie, 'invalid')).status, 400);
    for (const method of ['DELETE', 'PATCH', 'PUT']) assert.equal((await f.service.send(adminMessages(request.id), { body: 'رد' }, f.manager.cookie, randomUUID(), {}, method)).status, 405);
    for (const suffix of ['?before=0', '?after=0', '?after=1&before=2', '?before=1&before=2', '?admin=true', '?after=9007199254740992']) assert.equal((await f.service.get(clientMessages(request.id) + suffix, f.client.cookie)).status, 400);
    for (const query of ['?page=0', '?filter=closed', '?page=1&page=2', '?ownerId=x', '?q=' + 'a'.repeat(121)]) assert.equal((await f.service.get('/request-inbox' + query, f.manager.cookie)).status, 400);
    assert.equal((await (await f.service.get('/request-inbox?q=%25', f.manager.cookie)).json()).total, 0);
    assert.equal((await (await f.service.get('/request-inbox?q=' + encodeURIComponent('حفار'), f.manager.cookie)).json()).total, 1);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM request_messages').get().n, 0);
  } finally { await f.close(); }
});

test('concurrent and ambiguous retries create one message and failed database writes never report success', async () => {
  const f = await fixture(); const replica = await start(f.path);
  try {
    const request = await f.service.request(f.client), key = randomUUID();
    const responses = await Promise.all(Array.from({ length: 6 }, (_, i) => (i % 2 ? replica : f.service).send(adminMessages(request.id), { body: 'رد محفوظ مرة واحدة' }, f.manager.cookie, key)));
    assert.equal(responses.filter(response => response.status === 201).length, 1);
    assert.equal(responses.filter(response => response.status === 200).length, 5);
    assert.equal(new Set((await Promise.all(responses.map(response => response.json()))).map(data => data.message.id)).size, 1);
    assert.equal((await f.service.send(adminMessages(request.id), { body: 'رد آخر' }, f.manager.cookie, key)).status, 409);
    f.db.exec("CREATE TRIGGER fail_message BEFORE INSERT ON request_messages BEGIN SELECT RAISE(ABORT,'isolated failure'); END;");
    const retryKey = randomUUID();
    const failed = await f.service.send(clientMessages(request.id), { body: 'رد العميل' }, f.client.cookie, retryKey);
    assert.equal(failed.status, 500); assert.equal((await failed.json()).message, undefined);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM request_messages').get().n, 1);
    f.db.exec('DROP TRIGGER fail_message');
    assert.equal((await f.service.send(clientMessages(request.id), { body: 'رد العميل' }, f.client.cookie, retryKey)).status, 201);
    assert.equal((await f.service.send(clientMessages(request.id), { body: 'رد العميل' }, f.client.cookie, retryKey)).status, 200);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM request_messages').get().n, 2);
  } finally { await replica.close(); await f.close(); }
});

test('inbox pagination and message cursors are bounded, ordered and private across multiple requests', async () => {
  const f = await fixture();
  try {
    const request = await f.service.request(f.client);
    for (let i = 0; i < 22; i++) await f.service.request(f.other, { ...draft, title: 'طلب آخر ' + i });
    const first = await (await f.service.get('/request-inbox', f.manager.cookie)).json();
    const second = await (await f.service.get('/request-inbox?page=2', f.manager.cookie)).json();
    assert.equal(first.total, 23); assert.equal(first.requests.length, 20); assert.equal(second.requests.length, 3);
    assert.equal(new Set([...first.requests, ...second.requests].map(item => item.id)).size, 23);
    const insert = f.db.prepare('INSERT INTO request_messages(id,request_id,author_id,author_role,body,created_at,submission_key) VALUES (?,?,?,?,?,?,?)');
    for (let i = 0; i < 125; i++) insert.run(randomUUID(), request.id, f.manager.user.id, 'admin', 'رد اختبار ' + i, new Date().toISOString(), randomUUID());
    const recent = await (await f.service.get(clientMessages(request.id), f.client.cookie)).json();
    assert.equal(recent.messages.length, 50); assert.equal(recent.hasMore, true);
    const earlier = await (await f.service.get(clientMessages(request.id) + '?before=' + recent.messages[0].sequence, f.client.cookie)).json();
    const oldest = await (await f.service.get(clientMessages(request.id) + '?before=' + earlier.messages[0].sequence, f.client.cookie)).json();
    assert.equal(earlier.messages.length, 50); assert.equal(oldest.messages.length, 25); assert.equal(oldest.hasMore, false);
    const all = [...oldest.messages, ...earlier.messages, ...recent.messages];
    assert.equal(new Set(all.map(item => item.id)).size, 125);
    assert.deepEqual(all.map(item => item.sequence), [...all.map(item => item.sequence)].sort((a, b) => a - b));
    const incremental = await (await f.service.get(clientMessages(request.id) + '?after=' + oldest.messages.at(-1).sequence, f.client.cookie)).json();
    assert.deepEqual(incremental.messages, earlier.messages); assert.equal(incremental.hasMore, true);
    assert.equal((await (await f.service.get('/request-inbox?filter=answered', f.manager.cookie)).json()).total, 1);
    assert.equal((await (await f.service.get('/request-inbox?filter=unanswered', f.manager.cookie)).json()).total, 22);
  } finally { await f.close(); }
});

test('message write limit is persistent, allows recovery of saved replies, and clears after its window', async () => {
  let clock = Date.now(); const f = await fixture(() => clock);
  try {
    const request = await f.service.request(f.client), key = randomUUID();
    for (let i = 0; i < 20; i++) assert.equal((await f.service.send(clientMessages(request.id), { body: 'رسالة ' + i }, f.client.cookie, i === 0 ? key : randomUUID())).status, 201);
    const limited = await f.service.send(clientMessages(request.id), { body: 'رسالة إضافية' }, f.client.cookie);
    assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '60');
    assert.equal((await f.service.send(clientMessages(request.id), { body: 'رسالة 0' }, f.client.cookie, key)).status, 200);
    clock += 60001;
    assert.equal((await f.service.send(clientMessages(request.id), { body: 'بعد الانتظار' }, f.client.cookie)).status, 201);
  } finally { await f.close(); }
});

test('permission setup defaults existing users to no access and CLI refuses missing accounts', async () => {
  const f = await fixture();
  try {
    f.db.prepare('UPDATE client_users SET can_manage_requests=0 WHERE id=?').run(f.manager.user.id);
    const reopened = await start(f.path);
    try {
      assert.equal((await reopened.get('/request-inbox', f.manager.cookie)).status, 403);
      const result = spawnSync(process.execPath, ['scripts/request-manager.mjs', 'grant', 'missing@example.com'], { cwd: new URL('..', import.meta.url), env: { ...process.env, AUTH_DB_PATH: f.path }, encoding: 'utf8' });
      assert.equal(result.status, 1); assert.match(result.stderr, /No existing account/);
      assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM client_users').get().n, 3);
      assert.equal(f.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    } finally { await reopened.close(); }
  } finally { await f.close(); }
});
