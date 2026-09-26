import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createClientAuth } from '../server/clientAuth.ts';

const origin = 'https://mahwar.example';
const application = { entity: 'individual', name: 'مؤجر اختبار استرجاع', identity: '1234567890', commercial: '', phone: '0501234567', email: 'retry-contact@example.com', address: '', domains: 'معدات', regions: 'الرياض' };
const equipment = { name: 'حفار اختبار الاسترجاع', category: 'excavator', description: 'معدة واحدة في قاعدة اختبار معزولة للتحقق من حفظ التعديلات.', location: 'الرياض', hourlyRateHalalas: 12500, dailyRateHalalas: 90000, operatorMode: 'with_operator', availability: 'available', status: 'active' };
const cookie = response => response.headers.get('set-cookie').split(';')[0];
function temporaryDatabase() {
  const directory = mkdtempSync(join(tmpdir(), 'mahwar-equipment-retry-'));
  return { path: join(directory, 'clients.sqlite'), remove() {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('mahwar-equipment-retry-'));
    rmSync(directory, { recursive: true, force: true });
  } };
}
function inspect(path, callback) {
  assert.ok(basename(dirname(path)).startsWith('mahwar-equipment-retry-'));
  const db = new DatabaseSync(path);
  try { return callback(db); } finally { db.close(); }
}
async function start(databasePath) {
  const auth = createClientAuth({ databasePath, origin });
  const app = express();
  let dropNextEditResponse = false;
  app.use((req, res, next) => {
    const sendJson = res.json;
    res.json = function (body) {
      if (dropNextEditResponse && req.method === 'POST' && /^\/api\/client\/equipment\/[a-f0-9-]+$/.test(req.originalUrl) && res.statusCode === 200 && body?.equipment) {
        // Drop the real transport only after the handler has saved the real database transaction.
        dropNextEditResponse = false;
        res.destroy();
        return res;
      }
      return sendJson.call(this, body);
    };
    next();
  });
  app.use('/api/client', auth.router);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port + '/api/client';
  const service = {
    get: (path, Cookie = '') => fetch(base + path, { headers: { Cookie } }),
    send: (path, body, Cookie = '', headers = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Cookie, ...headers }, body: JSON.stringify(body) }),
    dropNextEditResponse: () => { dropNextEditResponse = true; },
    close: async () => { await new Promise(done => { server.closeAllConnections(); server.close(done); }); auth.close(); },
  };
  service.account = async name => {
    const credentials = { name, email: name + '@example.com', password: 'isolated-equipment-retry-password-2468' };
    const response = await service.send('/register', credentials);
    assert.equal(response.status, 201);
    return { user: (await response.json()).user, Cookie: cookie(response) };
  };
  service.approve = async (owner, reviewer) => {
    const submission = await service.send('/broker-requests', application, owner.Cookie);
    assert.equal(submission.status, 201);
    const id = (await submission.json()).request.id;
    assert.equal((await service.send('/broker-review/requests/' + id + '/decision', { status: 'approved' }, reviewer.Cookie)).status, 200);
    return (await (await service.get('/lessor-profile', owner.Cookie)).json()).profile;
  };
  service.create = async owner => {
    const response = await service.send('/equipment', equipment, owner.Cookie, { 'Idempotency-Key': randomUUID() });
    assert.equal(response.status, 201);
    return (await response.json()).equipment;
  };
  service.edit = (id, body, owner) => service.send('/equipment/' + id, body, owner.Cookie);
  return service;
}
async function setup(service, path) {
  const owner = await service.account('retry-owner');
  const reviewer = await service.account('retry-reviewer');
  inspect(path, db => db.prepare('UPDATE client_users SET can_review_brokers=1 WHERE id=?').run(reviewer.user.id));
  const profile = await service.approve(owner, reviewer);
  return { owner, reviewer, profile, saved: await service.create(owner) };
}

test('an edit whose committed HTTP response is lost can be retried unchanged and recovered after restart without another version increment', async () => {
  const temporary = temporaryDatabase(); let service;
  try {
    service = await start(temporary.path);
    const { owner, saved } = await setup(service, temporary.path);
    const edit = { ...equipment, name: '  معدة بعد حفظ التعديل  ', description: 'وصف محفوظ\r\nبتفاصيل المعدة الجديدة.', hourlyRateHalalas: null, dailyRateHalalas: 85000, version: saved.version };
    service.dropNextEditResponse();
    await assert.rejects(service.edit(saved.id, edit, owner), /fetch failed/);
    const committed = inspect(temporary.path, db => db.prepare('SELECT * FROM equipment WHERE id=?').get(saved.id));
    assert.equal(committed.version, 2);
    assert.equal(committed.name, edit.name.trim());
    const retry = await service.edit(saved.id, edit, owner);
    assert.equal(retry.status, 200);
    const recovered = (await retry.json()).equipment;
    assert.equal(recovered.version, 2);
    assert.equal(recovered.description, edit.description.replace(/\r\n/g, '\n'));
    assert.equal(recovered.updatedAt, committed.updated_at);
    assert.deepEqual(inspect(temporary.path, db => db.prepare('SELECT * FROM equipment WHERE id=?').get(saved.id)), committed);
    await service.close(); service = undefined;
    service = await start(temporary.path);
    const restartRetry = await service.edit(saved.id, edit, owner);
    assert.equal(restartRetry.status, 200);
    assert.deepEqual((await restartRetry.json()).equipment, recovered);
    assert.deepEqual(inspect(temporary.path, db => db.prepare('SELECT * FROM equipment WHERE id=?').get(saved.id)), committed);
  } finally { await service?.close(); temporary.remove(); }
});

test('matching concurrent retries return the one stored edit; conflicting edits across database connections still produce a single winner', async () => {
  const temporary = temporaryDatabase(); let first, second;
  try {
    first = await start(temporary.path); second = await start(temporary.path);
    const { owner, saved } = await setup(first, temporary.path);
    const edit = { ...equipment, availability: 'unavailable', version: 1 };
    const matching = await Promise.all([first.edit(saved.id, edit, owner), second.edit(saved.id, edit, owner)]);
    assert.deepEqual(matching.map(response => response.status), [200, 200]);
    const matchingBodies = await Promise.all(matching.map(response => response.json()));
    assert.deepEqual(matchingBodies[0], matchingBodies[1]);
    assert.equal(matchingBodies[0].equipment.version, 2);
    const choices = [{ ...equipment, hourlyRateHalalas: 13000, version: 2 }, { ...equipment, hourlyRateHalalas: 14000, version: 2 }];
    const competing = await Promise.all([first.edit(saved.id, choices[0], owner), second.edit(saved.id, choices[1], owner)]);
    assert.deepEqual(competing.map(response => response.status).sort(), [200, 409]);
    const winnerIndex = competing.findIndex(response => response.status === 200);
    const winner = (await competing[winnerIndex].json()).equipment;
    const conflict = await competing[1 - winnerIndex].json();
    assert.doesNotMatch(conflict.error, /جلسة أخرى/);
    assert.equal(winner.version, 3);
    assert.equal((await first.edit(saved.id, choices[1 - winnerIndex], owner)).status, 409);
    assert.deepEqual((await (await second.get('/equipment/' + saved.id, owner.Cookie)).json()).equipment, winner);
  } finally { await first?.close(); await second?.close(); temporary.remove(); }
});

test('stale payloads must match every business field at exactly the next version; older identical state is not a confirmed retry', async () => {
  const temporary = temporaryDatabase(); const service = await start(temporary.path);
  try {
    const { owner, saved } = await setup(service, temporary.path);
    const edit = { ...equipment, version: 1 };
    assert.equal((await service.edit(saved.id, edit, owner)).status, 200);
    for (const changed of [
      { name: 'اسم آخر للمعدة' }, { category: 'crane' }, { description: 'وصف مختلف تمامًا عن البيانات المحفوظة.' },
      { location: 'جدة' }, { hourlyRateHalalas: null }, { dailyRateHalalas: 95000 },
      { operatorMode: 'without_operator' }, { availability: 'unavailable' }, { status: 'archived' },
    ]) assert.equal((await service.edit(saved.id, { ...edit, ...changed }, owner)).status, 409, Object.keys(changed)[0]);
    const next = await service.edit(saved.id, { ...equipment, version: 2 }, owner);
    assert.equal(next.status, 200);
    assert.equal((await next.json()).equipment.version, 3);
    assert.equal((await service.edit(saved.id, edit, owner)).status, 409);
    assert.equal(inspect(temporary.path, db => db.prepare('SELECT version FROM equipment WHERE id=?').get(saved.id).version), 3);
  } finally { await service.close(); temporary.remove(); }
});

test('recovery never exposes a foreign asset, including after ownership changes between attempts', async () => {
  const temporary = temporaryDatabase(); const service = await start(temporary.path);
  try {
    const { owner, reviewer, saved } = await setup(service, temporary.path);
    const other = await service.account('retry-other-owner');
    const otherProfile = await service.approve(other, reviewer);
    const edit = { ...equipment, availability: 'unavailable', version: 1 };
    assert.equal((await service.edit(saved.id, edit, owner)).status, 200);
    const foreign = await service.edit(saved.id, edit, other);
    assert.equal(foreign.status, 404);
    assert.equal((await foreign.json()).equipment, undefined);
    // Isolated data mutation models a future administrative transfer; there is no transfer product API.
    inspect(temporary.path, db => db.prepare('UPDATE equipment SET lessor_profile_id=? WHERE id=?').run(otherProfile.id, saved.id));
    const formerOwner = await service.edit(saved.id, edit, owner);
    assert.equal(formerOwner.status, 404);
    assert.equal((await formerOwner.json()).equipment, undefined);
    assert.equal((await service.get('/equipment/' + saved.id, owner.Cookie)).status, 404);
    const currentOwner = await service.edit(saved.id, edit, other);
    assert.equal(currentOwner.status, 200);
    assert.equal((await currentOwner.json()).equipment.version, 2);
    inspect(temporary.path, db => {
      const row = db.prepare('SELECT lessor_profile_id,version FROM equipment WHERE id=?').get(saved.id);
      assert.equal(row.lessor_profile_id, otherProfile.id);
      assert.equal(row.version, 2);
    });
  } finally { await service.close(); temporary.remove(); }
});
