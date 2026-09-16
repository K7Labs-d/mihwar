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
const application = { entity: 'individual', name: 'مؤجر سوق معزول', identity: '1234567890', commercial: '', phone: '0501234567', email: 'private-contact@example.com', address: 'عنوان خاص لا ينشر', domains: 'معدات', regions: 'الرياض' };
const equipment = { name: 'حفارة للموقع', category: 'excavator', description: 'معدة واحدة للعمل في الموقع ضمن المواصفات المعروضة.', location: 'الرياض', hourlyRateHalalas: 12550, dailyRateHalalas: 90000, operatorMode: 'with_operator', availability: 'available', status: 'active' };
const publicFields = ['id', 'name', 'category', 'description', 'location', 'hourlyRateHalalas', 'dailyRateHalalas', 'currency', 'operatorMode', 'availability', 'createdAt', 'updatedAt', 'lessor'].sort();
const cookie = response => response.headers.get('set-cookie').split(';')[0];
const query = parameters => '?' + new URLSearchParams(parameters).toString();
const detailPath = id => '/' + encodeURIComponent(id);

function temporaryDatabase() {
  const directory = mkdtempSync(join(tmpdir(), 'mahwar-marketplace-test-'));
  return { path: join(directory, 'clients.sqlite'), remove() {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('mahwar-marketplace-test-'));
    rmSync(directory, { recursive: true, force: true });
  } };
}

function inspect(databasePath, callback) {
  assert.ok(basename(dirname(databasePath)).startsWith('mahwar-marketplace-test-'));
  const database = new DatabaseSync(databasePath);
  try { return callback(database); } finally { database.close(); }
}

async function start(databasePath, now = Date.now) {
  const auth = createClientAuth({ databasePath, origin, now });
  const app = express();
  app.use('/api/client', auth.router);
  app.use('/api/marketplace/equipment', auth.marketplaceRouter);
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const service = {
    browse: (suffix = '', Cookie = '') => fetch(base + '/api/marketplace/equipment' + suffix, { headers: { Cookie } }),
    privateGet: (route, Cookie = '') => fetch(base + '/api/client' + route, { headers: { Cookie } }),
    post: (route, body, Cookie = '', headers = {}) => fetch(base + '/api/client' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Cookie, ...headers }, body: JSON.stringify(body) }),
    publicWrite: (suffix, method, Cookie = '') => fetch(base + '/api/marketplace/equipment' + suffix, { method, headers: { 'Content-Type': 'application/json', Origin: origin, Cookie }, body: JSON.stringify({ ...equipment, ownerId: 'forged' }) }),
    close: async () => { await new Promise(done => { server.closeAllConnections(); server.close(done); }); auth.close(); },
  };
  service.account = async name => {
    const input = { name, email: name + '@example.com', password: 'isolated-marketplace-password-2468' };
    const response = await service.post('/register', input); assert.equal(response.status, 201);
    return { input, user: (await response.json()).user, Cookie: cookie(response) };
  };
  service.approve = async (owner, reviewer) => {
    const submitted = await service.post('/broker-requests', application, owner.Cookie); assert.equal(submitted.status, 201);
    const pending = (await submitted.json()).request;
    const approved = await service.post('/broker-review/requests/' + pending.id + '/decision', { status: 'approved' }, reviewer.Cookie); assert.equal(approved.status, 200);
    return { applicationId: pending.id, profile: (await (await service.privateGet('/lessor-profile', owner.Cookie)).json()).profile };
  };
  service.create = async (owner, fields = {}) => {
    const response = await service.post('/equipment', { ...equipment, ...fields }, owner.Cookie, { 'Idempotency-Key': randomUUID() });
    assert.equal(response.status, 201);
    return (await response.json()).equipment;
  };
  service.list = async (parameters = {}) => {
    const response = await service.browse(query(parameters)); assert.equal(response.status, 200);
    return response.json();
  };
  return service;
}

async function setup(service, databasePath) {
  const owner = await service.account('marketplace-owner'), reviewer = await service.account('marketplace-reviewer');
  inspect(databasePath, db => assert.equal(db.prepare('UPDATE client_users SET can_review_brokers=1 WHERE id=?').run(reviewer.user.id).changes, 1));
  return { owner, reviewer, ...(await service.approve(owner, reviewer)) };
}

function assertPublicItem(item, saved) {
  assert.deepEqual(Object.keys(item).sort(), publicFields);
  assert.deepEqual(Object.keys(item.lessor).sort(), ['displayName', 'entity']);
  assert.deepEqual(item.lessor, { displayName: application.name, entity: application.entity });
  for (const field of publicFields.filter(field => field !== 'lessor')) assert.deepEqual(item[field], saved[field], field);
}

test('anonymous marketplace reads only real active equipment and the exact public projection; private ownership APIs and all public writes remain protected', async () => {
  const temporary = temporaryDatabase(); const service = await start(temporary.path);
  try {
    assert.deepEqual(await service.list(), { equipment: [], page: 1, pageSize: 20, total: 0 });
    const { owner, profile, applicationId } = await setup(service, temporary.path);
    const active = await service.create(owner), unavailable = await service.create(owner, { name: 'معدة غير متاحة حاليًا', availability: 'unavailable' });
    const archived = await service.create(owner, { name: 'معدة مؤرشفة', status: 'archived' });
    const listResponse = await service.browse(); assert.equal(listResponse.status, 200);
    assert.equal(listResponse.headers.get('cache-control'), 'no-store'); assert.equal(listResponse.headers.get('set-cookie'), null);
    const list = await listResponse.json(); assert.deepEqual(Object.keys(list).sort(), ['equipment', 'page', 'pageSize', 'total']); assert.equal(list.total, 2);
    assertPublicItem(list.equipment.find(item => item.id === active.id), active);
    assertPublicItem(list.equipment.find(item => item.id === unavailable.id), unavailable);
    const details = await service.browse(detailPath(active.id)); assert.equal(details.status, 200); assert.equal(details.headers.get('cache-control'), 'no-store');
    const detail = await details.json(); assert.deepEqual(Object.keys(detail), ['equipment']); assertPublicItem(detail.equipment, active);
    const serialized = JSON.stringify([list, detail]);
    for (const secret of [owner.user.id, owner.input.email, profile.id, applicationId, application.identity, application.phone, application.email, application.address]) {
      assert.equal(serialized.includes(secret), false, 'Private account or application value was exposed');
    }
    assert.equal((await service.browse(detailPath(archived.id))).status, 404);
    assert.equal((await service.privateGet('/equipment')).status, 401);
    assert.equal((await service.privateGet('/equipment/' + active.id)).status, 401);
    assert.equal((await service.post('/equipment/' + active.id, { ...equipment, version: 1 })).status, 401);
    for (const suffix of ['', detailPath(active.id)]) {
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        for (const Cookie of ['', owner.Cookie]) assert.equal((await service.publicWrite(suffix, method, Cookie)).status, 405);
      }
    }
    assert.deepEqual((await (await service.privateGet('/equipment/' + active.id, owner.Cookie)).json()).equipment, active);
    inspect(temporary.path, db => assert.equal(db.prepare('SELECT COUNT(*) AS n FROM equipment').get().n, 3));
  } finally { await service.close(); temporary.remove(); }
});

test('owner edits, archive and approval changes affect public reads immediately and persisted public equipment survives a new server', async () => {
  const temporary = temporaryDatabase(); let service; let clock = Date.now();
  try {
    service = await start(temporary.path, () => clock);
    const { owner, applicationId } = await setup(service, temporary.path);
    const saved = await service.create(owner);
    clock += 1000;
    const updatedFields = { ...equipment, name: 'حفارة محدثة', location: 'جدة', dailyRateHalalas: 77000, hourlyRateHalalas: null, availability: 'unavailable', version: saved.version };
    const editedResponse = await service.post('/equipment/' + saved.id, updatedFields, owner.Cookie); assert.equal(editedResponse.status, 200);
    const edited = (await editedResponse.json()).equipment;
    assertPublicItem((await (await service.browse(detailPath(saved.id))).json()).equipment, edited);
    assert.equal((await service.list({ location: 'الرياض' })).total, 0);
    assert.equal((await service.list({ location: 'جدة', availability: 'unavailable' })).total, 1);
    await service.close(); service = undefined; service = await start(temporary.path, () => clock + 1000);
    assertPublicItem((await (await service.browse(detailPath(saved.id))).json()).equipment, edited);
    assert.equal((await service.list()).total, 1);
    inspect(temporary.path, db => db.prepare("UPDATE broker_requests SET status='pending' WHERE id=?").run(applicationId));
    assert.equal((await service.list()).total, 0); assert.equal((await service.browse(detailPath(saved.id))).status, 404);
    inspect(temporary.path, db => db.prepare("UPDATE broker_requests SET status='rejected' WHERE id=?").run(applicationId));
    assert.equal((await service.list()).total, 0); assert.equal((await service.browse(detailPath(saved.id))).status, 404);
    inspect(temporary.path, db => db.prepare("UPDATE broker_requests SET status='approved' WHERE id=?").run(applicationId));
    assert.equal((await service.list()).total, 1);
    const archivedResponse = await service.post('/equipment/' + saved.id, { ...updatedFields, status: 'archived', version: edited.version }, owner.Cookie);
    assert.equal(archivedResponse.status, 200);
    assert.equal((await service.list()).total, 0); assert.equal((await service.browse(detailPath(saved.id))).status, 404);
    assert.equal((await (await service.privateGet('/equipment/' + saved.id, owner.Cookie)).json()).equipment.status, 'archived');
  } finally { await service?.close(); temporary.remove(); }
});

test('public eligibility requires the matching approved profile and application rather than merely an active equipment row', async () => {
  const temporary = temporaryDatabase(); const service = await start(temporary.path);
  try {
    const { owner, profile } = await setup(service, temporary.path);
    const other = await service.account('ordinary-account');
    const saved = await service.create(owner);
    // Simulate inconsistent legacy data only in the isolated database, bypassing constraints deliberately.
    inspect(temporary.path, db => { db.exec('PRAGMA foreign_keys=OFF'); db.prepare('UPDATE lessor_profiles SET user_id=? WHERE id=?').run(other.user.id, profile.id); });
    assert.equal((await service.list()).total, 0); assert.equal((await service.browse(detailPath(saved.id))).status, 404);
    inspect(temporary.path, db => db.prepare('UPDATE lessor_profiles SET user_id=? WHERE id=?').run(owner.user.id, profile.id));
    inspect(temporary.path, db => { db.exec('PRAGMA ignore_check_constraints=ON'); db.prepare("UPDATE lessor_profiles SET status='pending' WHERE id=?").run(profile.id); });
    assert.equal((await service.list()).total, 0); assert.equal((await service.browse(detailPath(saved.id))).status, 404);
    inspect(temporary.path, db => db.prepare("UPDATE lessor_profiles SET status='approved' WHERE id=?").run(profile.id));
    assert.equal((await service.list()).total, 1);
    inspect(temporary.path, db => { db.exec('PRAGMA foreign_keys=OFF'); db.prepare('UPDATE equipment SET lessor_profile_id=? WHERE id=?').run(randomUUID(), saved.id); });
    assert.equal((await service.list()).total, 0); assert.equal((await service.browse(detailPath(saved.id))).status, 404);
  } finally { await service.close(); temporary.remove(); }
});

test('marketplace search and combined category, location, operator and availability filters use real equipment fields', async () => {
  const temporary = temporaryDatabase(); const service = await start(temporary.path);
  try {
    const { owner } = await setup(service, temporary.path);
    const excavator = await service.create(owner, { name: 'حفارة مميزة', location: 'الرياض - شمال المدينة', description: 'وصف تشغيل حفر خاص للمعدات الموجودة في الموقع.' });
    const crane = await service.create(owner, { name: 'رافعة موقع', category: 'crane', location: 'جدة', operatorMode: 'without_operator', availability: 'unavailable' });
    const loader = await service.create(owner, { name: 'شيول متاح', category: 'loader', location: 'الرياض - جنوب المدينة', operatorMode: 'without_operator' });
    assert.deepEqual((await service.list({ q: 'مميزة' })).equipment.map(item => item.id), [excavator.id]);
    assert.deepEqual((await service.list({ q: 'حفر خاص' })).equipment.map(item => item.id), [excavator.id]);
    assert.deepEqual((await service.list({ category: 'crane' })).equipment.map(item => item.id), [crane.id]);
    assert.equal((await service.list({ location: 'الرياض' })).total, 2);
    assert.deepEqual((await service.list({ q: 'شيول', category: 'loader', location: 'جنوب', operatorMode: 'without_operator', availability: 'available' })).equipment.map(item => item.id), [loader.id]);
    assert.deepEqual((await service.list({ availability: 'unavailable', operatorMode: 'without_operator' })).equipment.map(item => item.id), [crane.id]);
    assert.equal((await service.list({ category: 'crane', location: 'الرياض' })).total, 0);
    assert.equal((await service.list({ q: 'كلمة غير موجودة' })).total, 0);
    assert.equal((await service.list({ q: '   ', location: '  ' })).total, 3);
    assert.deepEqual((await service.list({ q: '  مميزة  ', location: '  الرياض  ' })).equipment.map(item => item.id), [excavator.id]);
  } finally { await service.close(); temporary.remove(); }
});

test('search treats LIKE metacharacters and SQL fragments literally and normalizes Unicode without broadening results', async () => {
  const temporary = temporaryDatabase(); const service = await start(temporary.path);
  try {
    const { owner } = await setup(service, temporary.path);
    const special = await service.create(owner, { name: 'معدات 50%_test\\special', location: 'موقع 50%_test\\special', description: 'معدات Café بوصف محدد قابل للبحث الحرفي دون توسيع النتائج.' });
    await service.create(owner, { name: 'معدات 50AAtestZspecial', location: 'موقع 50AAtestZspecial' });
    await service.create(owner, { name: 'معدة عادية', location: 'الدمام' });
    for (const value of ['%', '_', '\\', '50%_test\\special']) {
      assert.deepEqual((await service.list({ q: value })).equipment.map(item => item.id), [special.id], value);
      assert.deepEqual((await service.list({ location: value })).equipment.map(item => item.id), [special.id], value);
    }
    assert.deepEqual((await service.list({ q: ' Cafe\u0301 ' })).equipment.map(item => item.id), [special.id]);
    for (const value of ["' OR 1=1 --", "x'; DROP TABLE equipment; --", '% OR %']) {
      assert.equal((await service.list({ q: value })).total, 0);
      assert.equal((await service.list({ location: value })).total, 0);
    }
    assert.equal((await service.list()).total, 3);
  } finally { await service.close(); temporary.remove(); }
});

test('price filters and sorting use the selected hour or day unit, include boundary values, and never treat absent prices as zero', async () => {
  const temporary = temporaryDatabase(); const service = await start(temporary.path, () => 1700000000000);
  try {
    const { owner } = await setup(service, temporary.path);
    const hourly = await service.create(owner, { name: 'تسعير بالساعة فقط', hourlyRateHalalas: 10000, dailyRateHalalas: null });
    const daily = await service.create(owner, { name: 'تسعير باليوم فقط', hourlyRateHalalas: null, dailyRateHalalas: 50000 });
    const both = await service.create(owner, { name: 'تسعير بالوحدتين', hourlyRateHalalas: 20000, dailyRateHalalas: 70000 });
    const same = await service.create(owner, { name: 'سعر يومي مماثل', hourlyRateHalalas: null, dailyRateHalalas: 50000 });
    const max = await service.create(owner, { name: 'حد السعر الأعلى', hourlyRateHalalas: 1, dailyRateHalalas: 100000000 });
    assert.equal((await service.list()).total, 5); assert.equal((await service.list({ rateUnit: 'hour' })).total, 5);
    assert.deepEqual((await service.list({ minRateHalalas: '50000', maxRateHalalas: '50000' })).equipment.map(item => item.id).sort(), [daily.id, same.id].sort());
    assert.deepEqual((await service.list({ rateUnit: 'hour', minRateHalalas: '10000', maxRateHalalas: '10000' })).equipment.map(item => item.id), [hourly.id]);
    assert.equal((await service.list({ minRateHalalas: '0', maxRateHalalas: '100000000' })).total, 4);
    assert.deepEqual((await service.list({ minRateHalalas: '100000000', maxRateHalalas: '100000000' })).equipment.map(item => item.id), [max.id]);
    const priceAsc = await service.list({ sort: 'price_asc' });
    assert.equal(priceAsc.total, 4); assert.deepEqual(priceAsc.equipment.map(item => item.dailyRateHalalas), [50000, 50000, 70000, 100000000]);
    assert.deepEqual((await service.list({ sort: 'price_asc' })).equipment, priceAsc.equipment);
    assert.deepEqual((await service.list({ sort: 'price_desc' })).equipment.map(item => item.dailyRateHalalas), [100000000, 70000, 50000, 50000]);
    assert.deepEqual((await service.list({ rateUnit: 'hour', sort: 'price_asc' })).equipment.map(item => item.id), [max.id, hourly.id, both.id]);
    assert.deepEqual((await service.list({ rateUnit: 'hour', sort: 'price_desc' })).equipment.map(item => item.id), [both.id, hourly.id, max.id]);
    assert.equal((await service.list({ rateUnit: 'hour', maxRateHalalas: '0' })).total, 0);
  } finally { await service.close(); temporary.remove(); }
});

test('public query validation rejects unknown, repeated, nested, malformed and excessive parameters before querying', async () => {
  const temporary = temporaryDatabase(); const service = await start(temporary.path);
  try {
    const invalid = [
      '?unknown=1', '?ownerId=other', '?lessorProfileId=other', '?status=archived', '?limit=999', '?q=x&q=y', '?page=1&page=2',
      '?q[]=x', '?q[value]=x', '?category[]=crane', '?sort[direction]=asc', '?__proto__[q]=x', '?minRateHalalas[]=100', '?category=unknown', '?operatorMode=both', '?availability=booked',
      '?rateUnit=week', '?sort=hourly_rate_halalas', '?page=0', '?page=-1', '?page=1.5', '?page=1000000', '?page=1e2',
      '?minRateHalalas=-1', '?maxRateHalalas=-1', '?minRateHalalas=1.5', '?maxRateHalalas=100000001', '?minRateHalalas=100000001',
      '?minRateHalalas=Infinity', '?maxRateHalalas=NaN', '?minRateHalalas=1e3', '?maxRateHalalas=20&minRateHalalas=21',
      ...['category', 'operatorMode', 'availability', 'rateUnit', 'sort', 'page', 'minRateHalalas', 'maxRateHalalas'].map(key => '?' + key + '='),
      query({ q: 'x'.repeat(101) }), query({ location: 'x'.repeat(161) }), query({ q: 'bad\u0000value' }), query({ location: 'bad\nvalue' }), query({ sort: 'newest\n' }),
    ];
    for (const suffix of invalid) {
      const response = await service.browse(suffix); assert.equal(response.status, 400, suffix);
      const body = await response.json(); assert.equal(typeof body.error, 'string'); assert.equal(body.equipment, undefined);
    }
    for (const parameters of [{ q: 'x'.repeat(100) }, { location: 'x'.repeat(160) }, { page: '999999' }, { q: '', location: '' }]) {
      assert.equal((await service.list(parameters)).total, 0);
    }
  } finally { await service.close(); temporary.remove(); }
});

test('public pagination and counts use identical visibility and filters with stable ordering for equal timestamps and prices', async () => {
  const temporary = temporaryDatabase(); const service = await start(temporary.path, () => 1700000000000);
  try {
    const { owner } = await setup(service, temporary.path);
    const created = [];
    for (let index = 0; index < 23; index++) created.push(await service.create(owner, { name: 'معدة عامة ' + index, category: index % 2 ? 'crane' : 'excavator', dailyRateHalalas: 50000 }));
    await service.create(owner, { name: 'معدة مؤرشفة خارج النتائج', status: 'archived' });
    const first = await service.list(), second = await service.list({ page: '2' });
    assert.equal(first.total, 23); assert.equal(first.page, 1); assert.equal(first.pageSize, 20); assert.equal(first.equipment.length, 20);
    assert.equal(second.total, 23); assert.equal(second.page, 2); assert.equal(second.equipment.length, 3);
    const expected = created.map(item => item.id).sort().reverse();
    assert.deepEqual([...first.equipment, ...second.equipment].map(item => item.id), expected);
    assert.deepEqual((await service.list()).equipment, first.equipment);
    assert.deepEqual((await service.list({ page: '3' })).equipment, []);
    const filtered = await service.list({ category: 'crane' }); assert.equal(filtered.total, 11); assert.equal(filtered.equipment.length, 11);
    assert.ok(filtered.equipment.every(item => item.category === 'crane'));
    const sortedFirst = await service.list({ sort: 'price_asc' }), sortedSecond = await service.list({ sort: 'price_asc', page: '2' });
    assert.equal(new Set([...sortedFirst.equipment, ...sortedSecond.equipment].map(item => item.id)).size, 23);
    assert.deepEqual((await service.list({ sort: 'price_asc' })).equipment, sortedFirst.equipment);
    assert.equal(sortedFirst.total, 23); assert.equal(sortedSecond.total, 23);
  } finally { await service.close(); temporary.remove(); }
});

test('missing public equipment and database read failures return bounded errors without SQL, paths or stack traces', async () => {
  const temporary = temporaryDatabase(); const service = await start(temporary.path);
  try {
    const { owner } = await setup(service, temporary.path); const saved = await service.create(owner);
    assert.equal((await service.browse(detailPath(saved.id) + '?ownerId=other')).status, 400);
    for (const id of ['not-a-uuid', randomUUID(), "' OR 1=1 --"]) {
      const response = await service.browse(detailPath(id)); assert.equal(response.status, 404);
      assert.deepEqual(Object.keys(await response.json()), ['error']);
    }
    inspect(temporary.path, db => db.exec('ALTER TABLE equipment RENAME TO temporarily_unreadable_equipment'));
    for (const suffix of ['', detailPath(saved.id)]) {
      const response = await service.browse(suffix); assert.equal(response.status, 500);
      const body = await response.json(); assert.deepEqual(Object.keys(body), ['error']); assert.equal(typeof body.error, 'string');
      assert.equal(/SQLITE|SELECT|stack|Error:|clients\.sqlite|temporarily_unreadable/i.test(body.error), false);
    }
    inspect(temporary.path, db => db.exec('ALTER TABLE temporarily_unreadable_equipment RENAME TO equipment'));
    assert.equal((await service.list()).total, 1); assert.equal((await service.browse(detailPath(saved.id))).status, 200);
  } finally { await service.close(); temporary.remove(); }
});
