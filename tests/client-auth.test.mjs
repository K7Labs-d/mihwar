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
async function start(databasePath = ':memory:', now = Date.now) {
  const auth = createClientAuth({ databasePath, origin, now });
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

test('password boundaries are consistent for registration, login and administrative login', async t => {
  for (const length of [0, 7, 8, 11, 12, 128, 129]) {
    await t.test(String(length) + ' characters', async () => {
      const service = await start();
      const input = { ...account, password: 'x'.repeat(length) };
      const accepted = length >= 8 && length <= 128;
      try {
        const registered = await service.post('/register', input);
        assert.equal(registered.status, accepted ? 201 : 400);
        if (!accepted) assert.match((await registered.json()).error, /من 8 إلى 128/);
        const login = await service.post('/login', input);
        assert.equal(login.status, accepted ? 200 : 400);
        if (!accepted) assert.match((await login.json()).error, /من 8 إلى 128/);
        const admin = await service.post('/admin-login', input);
        // A valid password still does not grant an ordinary account admin access.
        assert.equal(admin.status, accepted ? 403 : 400);
        if (!accepted) {
          assert.match((await admin.json()).error, /من 8 إلى 128/);
          assert.equal((await service.get('/me')).status, 401);
          assert.equal((await service.post('/register', account)).status, 201);
        }
      } finally { await service.close(); }
    });
  }
});

test('an eight-character password remains hashed and can log in after restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mahwar-auth-test-'));
  const databasePath = join(directory, 'clients.sqlite');
  const input = { ...account, password: 'Eight!42' };
  let service;
  try {
    service = await start(databasePath);
    const registered = await service.post('/register', input);
    assert.equal(registered.status, 201);
    const user = (await registered.json()).user;
    const Cookie = cookie(registered);
    const inspect = new DatabaseSync(databasePath);
    try {
      const stored = inspect.prepare('SELECT password_hash FROM client_users WHERE id=?').get(user.id);
      assert.match(stored.password_hash, /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
      assert.ok(!stored.password_hash.includes(input.password));
    } finally { inspect.close(); }
    await service.close();
    service = await start(databasePath);
    assert.equal((await (await service.get('/me', Cookie)).json()).user.id, user.id);
    assert.equal((await service.post('/logout', {}, { Cookie })).status, 200);
    assert.equal((await service.get('/me', Cookie)).status, 401);
    assert.equal((await service.post('/login', { ...input, password: 'Wrong!42' })).status, 401);
    const login = await service.post('/login', input);
    assert.equal(login.status, 200);
    assert.equal((await login.json()).user.id, user.id);
  } finally {
    await service?.close();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('mahwar-auth-test-'));
    rmSync(directory, { recursive: true, force: true });
  }
});

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

test('login limits isolate accounts sharing a peer and remain shared across login aliases', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mahwar-auth-test-'));
  const databasePath = join(directory, 'clients.sqlite');
  let timestamp = Date.now();
  const service = await start(databasePath, () => timestamp);
  const other = { ...account, name: 'عميل آخر', email: 'other@example.com' };
  const admin = { ...account, name: 'إدارة الاختبار', email: 'admin@example.com' };
  try {
    for (const input of [account, other, admin]) {
      assert.equal((await service.post('/register', input)).status, 201);
    }
    const inspect = new DatabaseSync(databasePath);
    try {
      inspect.prepare('UPDATE client_users SET can_manage_requests=1 WHERE email=?').run(admin.email);
    } finally { inspect.close(); }

    for (let i = 0; i < 21; i++) {
      const route = (i % 2 ? '/admin-login' : '/login') + '?attempt=' + i;
      const response = await service.post(route, {
        email: i % 2 ? '  CLIENT@EXAMPLE.COM ' : account.email,
        password: 'wrong-password-1234',
      }, { 'X-Forwarded-For': '198.51.100.' + (i + 1) });
      assert.equal(response.status, i < 10 ? 401 : 429);
      if (i >= 10) assert.equal(response.headers.get('retry-after'), '900');
    }
    assert.equal((await service.post('/login', account)).status, 429);
    const login = await service.post('/login', other);
    assert.equal(login.status, 200, 'another account on the same peer must still log in');
    assert.equal((await service.get('/me', cookie(login))).status, 200);
    const adminLogin = await service.post('/admin-login', admin);
    assert.equal(adminLogin.status, 200, 'the separate admin account must still log in');
    assert.equal((await adminLogin.json()).user.adminSession, true);

    timestamp += 900000 + 1;
    assert.equal((await service.post('/login', account)).status, 200);
  } finally {
    await service.close();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('mahwar-auth-test-'));
    rmSync(directory, { recursive: true, force: true });
  }
});

test('malformed login floods stay limited without blocking valid account logins', async () => {
  const service = await start();
  try {
    assert.equal((await service.post('/register', account)).status, 201);
    for (let i = 0; i < 21; i++) {
      const response = await service.post(i % 2 ? '/admin-login' : '/login', {});
      assert.equal(response.status, i < 20 ? 400 : 429);
    }
    assert.equal((await service.post('/login', account)).status, 200);
    assert.equal((await service.post('/admin-login', account)).status, 403);
  } finally { await service.close(); }
});

test('registration keeps its own limit for case-insensitive trailing-slash routes', async () => {
  const service = await start();
  try {
    for (let i = 0; i < 6; i++) {
      const response = await service.post('/REGISTER/?attempt=' + i, {
        email: account.email, password: account.password,
      });
      assert.equal(response.status, i < 5 ? 400 : 429);
    }
  } finally { await service.close(); }
});

test('unknown-email spraying stays limited without consuming registered account budgets', async () => {
  const service = await start();
  try {
    assert.equal((await service.post('/register', account)).status, 201);
    for (let i = 0; i < 21; i++) {
      const response = await service.post(i % 2 ? '/admin-login' : '/login', {
        email: 'absent-' + i + '@example.com', password: account.password,
      });
      assert.equal(response.status, i < 10 ? 401 : 429);
    }
    assert.equal((await service.post('/login', account)).status, 200);
  } finally { await service.close(); }
});

test('transient limiter capacity cannot lock out an existing account', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mahwar-auth-test-'));
  const databasePath = join(directory, 'clients.sqlite');
  const timestamp = Date.now();
  const service = await start(databasePath, () => timestamp);
  try {
    assert.equal((await service.post('/register', account)).status, 201);
    const inspect = new DatabaseSync(databasePath);
    try {
      inspect.exec('BEGIN');
      const insert = inspect.prepare('INSERT INTO client_auth_limits(key,count,expires_at) VALUES (?,1,?)');
      for (let i = 0; i < 10000; i++) insert.run('transient-test-' + i, timestamp + 900000);
      inspect.exec('COMMIT');
    } finally { inspect.close(); }
    assert.equal((await service.post('/login', account)).status, 200);
  } finally {
    await service.close();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('mahwar-auth-test-'));
    rmSync(directory, { recursive: true, force: true });
  }
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
