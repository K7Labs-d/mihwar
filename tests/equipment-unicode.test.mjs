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
const draft = { name: 'حفارة الموقع', category: 'excavator', description: 'معدة واحدة بمواصفات مناسبة للعمل في الموقع.', location: 'الرياض', hourlyRateHalalas: 12550, dailyRateHalalas: null, operatorMode: 'with_operator', availability: 'available', status: 'active' };
const application = { entity: 'individual', name: 'مؤجر اختبار محارف معزول', identity: '1234567890', commercial: '', phone: '0501234567', email: 'unicode-contact@example.com', address: '', domains: 'معدات', regions: 'الرياض' };
const cookie = response => response.headers.get('set-cookie').split(';')[0];
const normalize = value => value.replace(/\r\n/g, '\n').trim().normalize('NFC');

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'mahwar-equipment-unicode-test-'));
  const databasePath = join(directory, 'clients.sqlite');
  const auth = createClientAuth({ databasePath, origin });
  const app = express(); app.use('/api/client', auth.router);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port + '/api/client';
  const post = (route, body, Cookie = '', headers = {}) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Cookie, ...headers }, body: JSON.stringify(body) });
  const inspect = callback => {
    const db = new DatabaseSync(databasePath);
    try { return callback(db); } finally { db.close(); }
  };
  const close = async () => {
    await new Promise(done => { server.closeAllConnections(); server.close(done); }); auth.close();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('mahwar-equipment-unicode-test-'));
    rmSync(directory, { recursive: true, force: true });
  };
  try {
    const ownerResponse = await post('/register', { name: 'unicode-owner', email: 'unicode-owner@example.com', password: 'isolated-unicode-password-2468' });
    assert.equal(ownerResponse.status, 201); const ownerCookie = cookie(ownerResponse);
    const reviewerResponse = await post('/register', { name: 'unicode-reviewer', email: 'unicode-reviewer@example.com', password: 'isolated-unicode-password-2468' });
    assert.equal(reviewerResponse.status, 201); const reviewerCookie = cookie(reviewerResponse), reviewer = (await reviewerResponse.json()).user;
    inspect(db => db.prepare('UPDATE client_users SET can_review_brokers=1 WHERE id=?').run(reviewer.id));
    const submitted = await post('/broker-requests', application, ownerCookie); assert.equal(submitted.status, 201);
    const pending = (await submitted.json()).request;
    const approved = await post('/broker-review/requests/' + pending.id + '/decision', { status: 'approved' }, reviewerCookie);
    assert.equal(approved.status, 200);
    return {
      inspect, close,
      create: body => post('/equipment', body, ownerCookie, { 'Idempotency-Key': randomUUID() }),
      update: (id, body, version) => post('/equipment/' + id, { ...body, version }, ownerCookie),
      rows: () => inspect(db => db.prepare('SELECT * FROM equipment ORDER BY id').all()),
      get: id => fetch(base + '/equipment/' + id, { headers: { Cookie: ownerCookie } }),
    };
  } catch (error) { await close(); throw error; }
}

async function savedEquipment(service, input = draft) {
  const response = await service.create(input); assert.equal(response.status, 201);
  return (await response.json()).equipment;
}

test('create and update reject text below SQLite code-point minima after trimming and NFC with field errors and no writes', async () => {
  const service = await fixture();
  try {
    const saved = await savedEquipment(service), before = service.rows();
    const cases = [
      ['name', '😀a'], ['location', '📍'], ['description', '😀'.repeat(5)],
      ['name', '  😀e\u0301  '], ['location', '  ا\u0654  '], ['description', '  ' + '😀'.repeat(9) + '  '],
    ];
    const actual = [];
    for (const [field, value] of cases) {
      const body = { ...draft, [field]: value };
      const created = await service.create(body), creationBody = await created.json();
      const updated = await service.update(saved.id, body, saved.version), updateBody = await updated.json();
      actual.push({ field, create: created.status, update: updated.status, createFieldError: typeof creationBody.fieldErrors?.[field] === 'string', updateFieldError: typeof updateBody.fieldErrors?.[field] === 'string' });
    }
    assert.deepEqual(actual, cases.map(([field]) => ({ field, create: 400, update: 400, createFieldError: true, updateFieldError: true })));
    assert.deepEqual(service.rows(), before);
    assert.deepEqual((await (await service.get(saved.id)).json()).equipment, saved);
  } finally { await service.close(); }
});

test('valid emoji, Arabic and NFC boundaries save unchanged normalized text on create and update with matching SQLite lengths', async () => {
  const service = await fixture();
  try {
    const input = { ...draft, name: '  😀اب  ', location: '  📍ر  ', description: '  ' + '😀'.repeat(10) + '  ' };
    const saved = await savedEquipment(service, input);
    const lengths = service.inspect(db => db.prepare('SELECT length(name) AS name,length(location) AS location,length(description) AS description FROM equipment WHERE id=?').get(saved.id));
    assert.equal(lengths.name, 3); assert.equal(lengths.location, 2); assert.equal(lengths.description, 10);
    for (const field of ['name', 'location', 'description']) assert.equal(saved[field], normalize(input[field]));
    const updatedInput = { ...draft, name: '  ا\u0654بج  ', location: '  e\u0301ر  ', description: '  ' + 'e\u0301'.repeat(10) + '  ' };
    const response = await service.update(saved.id, updatedInput, saved.version); assert.equal(response.status, 200);
    const updated = (await response.json()).equipment; assert.equal(updated.version, 2);
    service.inspect(db => {
      const stored = db.prepare('SELECT name,location,description,length(name) AS name_length,length(location) AS location_length,length(description) AS description_length FROM equipment WHERE id=?').get(saved.id);
      for (const field of ['name', 'location', 'description']) {
        assert.equal(updated[field], normalize(updatedInput[field])); assert.equal(stored[field], updated[field]);
        assert.equal(stored[field + '_length'], Array.from(updated[field]).length);
      }
    });
    const arabic = await savedEquipment(service, { ...draft, name: 'حفر', location: 'جد', description: 'ع'.repeat(10) });
    assert.equal(arabic.name, 'حفر'); assert.equal(arabic.description, 'ع'.repeat(10));
    const newlines = await savedEquipment(service, { ...draft, description: 'وصف للمعدة\r\nتفاصيل\tعربية' });
    assert.equal(newlines.description, 'وصف للمعدة\nتفاصيل\tعربية');
  } finally { await service.close(); }
});

test('equipment Unicode validation retains the existing conservative maximum input sizes on create and update', async () => {
  const service = await fixture();
  try {
    const atLimit = { ...draft, name: '😀'.repeat(60), location: '📍'.repeat(80), description: '😀'.repeat(1000) };
    const saved = await savedEquipment(service, atLimit);
    const before = service.rows();
    for (const field of ['name', 'location', 'description']) {
      const invalid = { ...atLimit, [field]: atLimit[field] + 'ع' };
      for (const response of [await service.create(invalid), await service.update(saved.id, invalid, saved.version)]) {
        assert.equal(response.status, 400); assert.equal(typeof (await response.json()).fieldErrors?.[field], 'string');
      }
    }
    assert.deepEqual(service.rows(), before);
    const arabicLimits = { ...draft, name: 'ع'.repeat(120), location: 'ر'.repeat(160), description: 'و'.repeat(2000) };
    const updatedResponse = await service.update(saved.id, arabicLimits, saved.version); assert.equal(updatedResponse.status, 200);
    const updated = (await updatedResponse.json()).equipment;
    assert.equal(updated.name.length, 120); assert.equal(updated.location.length, 160); assert.equal(updated.description.length, 2000);
  } finally { await service.close(); }
});

test('invalid surrogate halves and forbidden controls cannot be silently replaced or truncated when equipment is saved', async () => {
  const service = await fixture();
  try {
    const saved = await savedEquipment(service), before = service.rows();
    const actual = [];
    for (const field of ['name', 'location', 'description']) {
      for (const invalidCharacter of ['\ud800', '\udc00', '\u0000', '\u0001', '\u007f']) {
        const input = { ...draft, [field]: draft[field] + invalidCharacter };
        const created = await service.create(input), createBody = await created.json();
        const version = service.rows().find(row => row.id === saved.id).version;
        const updated = await service.update(saved.id, input, version), updateBody = await updated.json();
        actual.push({ field, character: invalidCharacter.charCodeAt(0), create: created.status, update: updated.status, createFieldError: typeof createBody.fieldErrors?.[field] === 'string', updateFieldError: typeof updateBody.fieldErrors?.[field] === 'string' });
      }
    }
    assert.ok(actual.every(result => result.create === 400 && result.update === 400 && result.createFieldError && result.updateFieldError), JSON.stringify(actual));
    assert.deepEqual(service.rows(), before);
  } finally { await service.close(); }
});
