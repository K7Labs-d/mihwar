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
const account = { name: 'عميل الاختبار', email: 'client@example.com', password: 'unique-test-password-123' };
async function start(databasePath = ':memory:', now = Date.now, sendLoginCode) {
  const auth = createClientAuth({ databasePath, origin, now, sendLoginCode });
  const app = express();
  app.use('/api/client', auth.router);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port + '/api/client';
  return {
    get: (route, Cookie = '') => fetch(base + route, { headers: { Cookie } }),
    post: (route, body, headers = {}) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...headers }, body: JSON.stringify(body) }),
    raw: (route, options) => fetch(base + route, options),
    close: async () => { await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }); auth.close(); },
  };
}
const cookie = response => response.headers.get('set-cookie').split(';')[0];

test('real account and hashed session survive restart; logout revokes the exact session', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mahwar-auth-test-'));
  const databasePath = join(directory, 'clients.sqlite');
  let service;
  try {
    service = await start(databasePath);
    assert.equal((await service.get('/me')).status, 401);
    const register = await service.post('/register', account);
    assert.equal(register.status, 201);
    const user = (await register.json()).user;
    assert.equal(user.email, account.email);
    assert.equal(user.password_hash, undefined);
    const firstCookie = cookie(register);
    assert.match(register.headers.get('set-cookie'), /HttpOnly/);
    assert.match(register.headers.get('set-cookie'), /Secure/);
    assert.match(register.headers.get('set-cookie'), /SameSite=Lax/);
    const inspect = new DatabaseSync(databasePath);
    const stored = inspect.prepare('SELECT password_hash FROM client_users').get();
    assert.match(stored.password_hash, /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    assert.ok(!stored.password_hash.includes(account.password));
    const token = inspect.prepare('SELECT token_hash FROM client_sessions').get().token_hash;
    assert.notEqual(token, firstCookie.split('=')[1]);
    inspect.close();
    await service.close();
    service = await start(databasePath);
    assert.equal((await (await service.get('/me', firstCookie)).json()).user.id, user.id);
    const wrong = await service.post('/login', { ...account, password: 'wrong-password-1234' });
    assert.equal(wrong.status, 401);
    const unknown = await service.post('/login', { ...account, email: 'absent@example.com' });
    assert.equal(unknown.status, 401);
    assert.deepEqual(await wrong.json(), await unknown.json());
    const login = await service.post('/login', { email: '  CLIENT@EXAMPLE.COM ', password: account.password }, { Cookie: firstCookie });
    assert.equal(login.status, 200);
    const secondCookie = cookie(login);
    assert.notEqual(secondCookie, firstCookie);
    assert.equal((await service.get('/me', firstCookie)).status, 401);
    assert.equal((await service.get('/me', secondCookie)).status, 200);
    const duplicate = await service.post('/register', { ...account, name: 'اسم آخر' });
    assert.equal(duplicate.status, 409);
    assert.equal((await service.post('/logout', {}, { Cookie: secondCookie })).status, 200);
    assert.equal((await service.get('/me', secondCookie)).status, 401);
    assert.equal((await service.get('/me', 'mahwar_client_session=%ZZ')).status, 401);
  } finally {
    await service?.close();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('mahwar-auth-test-'));
    rmSync(directory, { recursive: true, force: true });
  }
});

test('input limits and cross-site requests are rejected without creating accounts', async () => {
  const service = await start();
  try {
    assert.equal((await service.post('/register', account, { Origin: 'https://attacker.example' })).status, 403);
    assert.equal((await service.post('/register', account, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await service.raw('/login', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
    assert.equal((await service.raw('/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
    assert.equal((await service.post('/register', { ...account, name: 'x'.repeat(18000) })).status, 413);
    assert.equal((await service.post('/register', { ...account, password: 'short' })).status, 400);
    assert.equal((await service.post('/register', { ...account, email: 'invalid' })).status, 400);
    assert.equal((await service.post('/register', { ...account, name: '' })).status, 400);
    assert.equal((await service.get('/me')).status, 401);
  } finally { await service.close(); }
});

test('rate limits apply to registration with query strings and login attempts', async () => {
  const service = await start();
  try {
    let registration;
    for (let i = 0; i < 6; i++) registration = await service.post('/register?attempt=' + i, {});
    assert.equal(registration.status, 429);
    assert.ok(registration.headers.get('retry-after'));
    let login;
    for (let i = 0; i < 21; i++) login = await service.post('/login', {});
    assert.equal(login.status, 429);
  } finally { await service.close(); }
});

test('expired sessions cannot authenticate', async () => {
  let timestamp = Date.now();
  const service = await start(':memory:', () => timestamp);
  try {
    const registered = await service.post('/register', account);
    assert.equal(registered.status, 201);
    const Cookie = cookie(registered);
    timestamp += 7 * 86400000 + 1;
    assert.equal((await service.get('/me', Cookie)).status, 401);
  } finally { await service.close(); }
});

test('email code is required for every login, expires, and cannot be replayed', async () => {
  let timestamp = Date.now();
  const messages = [];
  const directory = mkdtempSync(join(tmpdir(), 'mahwar-auth-test-'));
  const databasePath = join(directory, 'clients.sqlite');
  let service;
  try {
    service = await start(databasePath, () => timestamp, async (email, code) => messages.push({ email, code }));
    const registered = await service.post('/register', account);
    const initialCookie = cookie(registered);
    await service.post('/logout', {}, { Cookie: initialCookie });
    const begin = await service.post('/login', { email: account.email, password: account.password });
    assert.equal(begin.status, 202);
    assert.equal(begin.headers.get('set-cookie'), null);
    const { challenge } = await begin.json();
    assert.match(challenge, /^[a-f0-9]{64}$/);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].email, account.email);
    assert.equal((await service.get('/me')).status, 401);
    assert.equal((await service.post('/login/verify', { challenge, code: '000000' })).status, 401);
    const verified = await service.post('/login/verify', { challenge, code: messages[0].code });
    assert.equal(verified.status, 200);
    assert.equal((await service.get('/me', cookie(verified))).status, 200);
    assert.equal((await service.post('/login/verify', { challenge, code: messages[0].code })).status, 401);
    const again = await service.post('/login', { email: account.email, password: account.password });
    assert.equal(again.status, 202);
    assert.equal(messages.length, 2);
    const next = (await again.json()).challenge;
    timestamp += 300001;
    assert.equal((await service.post('/login/verify', { challenge: next, code: messages[1].code })).status, 401);
  } finally {
    await service?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('delivery errors fail closed and five incorrect codes lock the challenge', async () => {
  const messages = [];
  const service = await start(':memory:', Date.now, async (_email, code) => messages.push(code));
  try {
    await service.post('/register', account);
    const begin = await service.post('/login', account);
    const { challenge } = await begin.json();
    const invalid = messages[0] === '111111' ? '222222' : '111111';
    for (let i = 0; i < 5; i++) assert.equal((await service.post('/login/verify', { challenge, code: invalid })).status, 401);
    assert.equal((await service.post('/login/verify', { challenge, code: messages[0] })).status, 401);
    assert.equal((await service.post('/login/verify', { challenge, code: invalid }, { Origin: 'https://attacker.example' })).status, 403);
  } finally { await service.close(); }
  const failing = await start(':memory:', Date.now, async () => { throw new Error('mail unavailable'); });
  try {
    await failing.post('/register', account);
    const response = await failing.post('/login', account);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('set-cookie'), null);
  } finally { await failing.close(); }
});
