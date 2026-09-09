import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createClientAuth } from '../server/clientAuth.ts';

const origin = 'https://mahwar.example';
const account = { name: 'اختبار معزول', email: 'broker-test@example.com', password: 'isolated-broker-password-123' };
const draft = { entity: 'individual', name: 'وسيط الاختبار', identity: '١٢٣٤٥٦٧٨٩٠', commercial: '', phone: '٠٥٠١٢٣٤٥٦٧', email: 'Contact@Example.com', address: '', domains: 'معدات، نقل، معدات', regions: 'الرياض\nجدة' };
const cookie = response => response.headers.get('set-cookie').split(';')[0];
async function start(databasePath = ':memory:', now = Date.now) {
  const auth = createClientAuth({ databasePath, origin, now });
  const app = express(); app.use('/api/client', auth.router);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port + '/api/client';
  return {
    get: (Cookie = '', query = '') => fetch(base + '/broker-requests' + query, { headers: { Cookie } }),
    post: (route, body, Cookie = '', extra = {}) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Cookie, ...extra }, body: JSON.stringify(body) }),
    close: async () => { await new Promise(done => { server.closeAllConnections(); server.close(done); }); auth.close(); },
  };
}

test('broker request is owned by the session, survives logout/login and database restart, and is isolated from other users', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mahwar-broker-test-'));
  const databasePath = join(directory, 'clients.sqlite');
  let service;
  try {
    service = await start(databasePath);
    assert.equal((await service.get()).status, 401);
    assert.equal((await service.post('/broker-requests', draft)).status, 401);
    const registration = await service.post('/register', account);
    assert.equal(registration.status, 201);
    const owner = (await registration.json()).user;
    const Cookie = cookie(registration);
    assert.deepEqual(await (await service.get(Cookie)).json(), { request: null });
    const sent = await service.post('/broker-requests', draft, Cookie);
    assert.equal(sent.status, 201);
    assert.equal(sent.headers.get('cache-control'), 'no-store');
    const saved = (await sent.json()).request;
    assert.equal(saved.status, 'pending');
    assert.equal(saved.data.identity, '1234567890');
    assert.equal(saved.data.phone, '+966501234567');
    assert.equal(saved.data.domains, 'معدات\nنقل');
    assert.equal(saved.data.email, 'contact@example.com');
    assert.equal(saved.userId, undefined);
    const inspect = new DatabaseSync(databasePath);
    const row = inspect.prepare('SELECT * FROM broker_requests').get();
    assert.equal(row.user_id, owner.id);
    assert.equal(row.id, saved.id);
    assert.deepEqual(JSON.parse(row.details), saved.data);
    inspect.close();
    assert.deepEqual((await (await service.get(Cookie)).json()).request, saved);
    const other = await service.post('/register', { ...account, email: 'separate@example.com' });
    assert.equal(other.status, 201);
    const otherCookie = cookie(other);
    assert.deepEqual(await (await service.get(otherCookie, '?userId=' + owner.id + '&id=' + saved.id)).json(), { request: null });
    assert.equal((await service.post('/logout', {}, Cookie)).status, 200);
    assert.equal((await service.get(Cookie)).status, 401);
    const login = await service.post('/login', account);
    assert.equal(login.status, 200);
    const newCookie = cookie(login);
    assert.deepEqual((await (await service.get(newCookie)).json()).request, saved);
    await service.close(); service = undefined;
    service = await start(databasePath);
    assert.deepEqual((await (await service.get(newCookie)).json()).request, saved);
    assert.deepEqual(await (await service.get(otherCookie)).json(), { request: null });
  } finally {
    await service?.close();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('mahwar-broker-test-'));
    rmSync(directory, { recursive: true, force: true });
  }
});

test('simultaneous and retried submissions create exactly one pending request', async () => {
  const service = await start();
  try {
    const Cookie = cookie(await service.post('/register', account));
    const responses = await Promise.all(Array.from({ length: 8 }, () => service.post('/broker-requests', draft, Cookie)));
    assert.equal(responses.filter(response => response.status === 201).length, 1);
    assert.equal(responses.filter(response => response.status === 409).length, 7);
    const results = await Promise.all(responses.map(response => response.json()));
    assert.equal(new Set(results.map(result => result.request.id)).size, 1);
    assert.equal((await (await service.get(Cookie)).json()).request.id, results[0].request.id);
  } finally { await service.close(); }
});

test('server validates types, lengths, entity-specific fields, ownership, status, documents and CSRF before saving', async () => {
  const service = await start();
  try {
    const Cookie = cookie(await service.post('/register', account));
    for (const body of [
      [], null, {}, { ...draft, entity: 'admin' }, { ...draft, name: 42 },
      { ...draft, identity: 'invalid' }, { ...draft, entity: 'company', commercial: '' },
      { ...draft, phone: '123' }, { ...draft, email: 'invalid' }, { ...draft, address: 'x'.repeat(251) },
      { ...draft, name: 'name\u0000' }, { ...draft, regions: '' }, { ...draft, domains: 'x'.repeat(611) },
      { ...draft, regions: Array.from({ length: 11 }, (_, i) => 'region' + i).join(',') },
      { ...draft, status: 'approved' }, { ...draft, userId: 'other-user' },
      { ...draft, documents: [{ name: 'file.pdf', size: 123 }] }, { ...draft, __proto__: null, files: [] },
    ]) assert.equal((await service.post('/broker-requests', body, Cookie)).status, 400);
    const invalid = await service.post('/broker-requests', { ...draft, phone: '' }, Cookie);
    assert.ok((await invalid.json()).fieldErrors.phone);
    assert.equal((await service.post('/broker-requests', draft, Cookie, { Origin: 'https://other.example' })).status, 403);
    assert.equal((await service.post('/broker-requests', draft, Cookie, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await service.post('/broker-requests', { ...draft, address: 'x'.repeat(18000) }, Cookie)).status, 413);
    assert.deepEqual(await (await service.get(Cookie)).json(), { request: null });
    const company = await service.post('/broker-requests', { ...draft, entity: 'company', commercial: '١٢٣٤٥٦٧٨٩٠' }, Cookie);
    assert.equal(company.status, 201);
    const saved = (await company.json()).request;
    assert.equal(saved.data.identity, '');
    assert.equal(saved.data.commercial, '1234567890');
  } finally { await service.close(); }
});

test('expired sessions cannot create or read broker requests', async () => {
  let timestamp = Date.now();
  const service = await start(':memory:', () => timestamp);
  try {
    const Cookie = cookie(await service.post('/register', account));
    timestamp += 7 * 86400000 + 1;
    assert.equal((await service.get(Cookie)).status, 401);
    assert.equal((await service.post('/broker-requests', draft, Cookie)).status, 401);
  } finally { await service.close(); }
});
