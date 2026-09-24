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
const application = { entity: 'individual', name: 'مؤجر اختبار معزول', identity: '1234567890', commercial: '', phone: '0501234567', email: 'equipment-contact@example.com', address: '', domains: 'معدات', regions: 'الرياض' };
const equipment = { name: 'حفار للموقع', category: 'excavator', description: 'حفار واحد جاهز للعمل في الموقع ضمن المواصفات المتفق عليها.', location: 'الرياض', hourlyRateHalalas: 12550, dailyRateHalalas: 90000, operatorMode: 'with_operator', availability: 'available', status: 'active' };
const request = { title: 'احتياج معدات للموقع', description: 'أحتاج معدة للعمل في الموقع خلال الفترة المقبلة حسب التفاصيل.', location: 'الرياض', quantity: 1 };
const cookie = response => response.headers.get('set-cookie').split(';')[0];
const decisionPath = id => '/broker-review/requests/' + id + '/decision';
const equipmentPath = id => '/equipment/' + encodeURIComponent(id);

function temporaryDatabase() {
  const directory = mkdtempSync(join(tmpdir(), 'mahwar-lessor-equipment-test-'));
  return { path: join(directory, 'clients.sqlite'), remove() {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('mahwar-lessor-equipment-test-'));
    rmSync(directory, { recursive: true, force: true });
  } };
}

function inspect(databasePath, callback) {
  const database = new DatabaseSync(databasePath);
  try { return callback(database); } finally { database.close(); }
}

async function start(databasePath, now = Date.now) {
  const auth = createClientAuth({ databasePath, origin, now });
  const app = express();
  app.use('/api/client', auth.router);
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port + '/api/client';
  const service = {
    get: (route, Cookie = '') => fetch(base + route, { headers: { Cookie } }),
    send: (route, body, Cookie = '', extra = {}, method = 'POST') => fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Origin: origin, Cookie, ...extra }, body: JSON.stringify(body) }),
    raw: (route, body, Cookie) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Cookie }, body }),
    close: async () => { await new Promise(done => { server.closeAllConnections(); server.close(done); }); auth.close(); },
  };
  service.account = async name => {
    const input = { name, email: name + '@example.com', password: 'isolated-lessor-test-password-2468' };
    const response = await service.send('/register', input);
    assert.equal(response.status, 201);
    return { input, user: (await response.json()).user, Cookie: cookie(response) };
  };
  service.submit = async account => {
    const response = await service.send('/broker-requests', application, account.Cookie);
    assert.equal(response.status, 201);
    return (await response.json()).request;
  };
  service.approve = async (owner, reviewer) => {
    const pending = await service.submit(owner);
    const response = await service.send(decisionPath(pending.id), { status: 'approved' }, reviewer.Cookie);
    assert.equal(response.status, 200);
    const profile = (await (await service.get('/lessor-profile', owner.Cookie)).json()).profile;
    assert.ok(profile?.id);
    return { profile, application: (await response.json()).request };
  };
  service.create = (Cookie = '', body = equipment, key = randomUUID(), headers = {}) => service.send('/equipment', body, Cookie, { 'Idempotency-Key': key, ...headers });
  return service;
}

function grant(databasePath, account) {
  // This helper only receives an isolated temporary database created above.
  assert.equal(basename(dirname(databasePath)).startsWith('mahwar-lessor-equipment-test-'), true);
  inspect(databasePath, db => assert.equal(db.prepare('UPDATE client_users SET can_review_brokers=1 WHERE id=?').run(account.user.id).changes, 1));
}

async function setupApproved(service, databasePath) {
  const owner = await service.account('equipment-owner');
  const reviewer = await service.account('equipment-reviewer');
  grant(databasePath, reviewer);
  return { owner, reviewer, ...(await service.approve(owner, reviewer)) };
}

test('numbered migrations backfill approved lessors exactly once and preserve legacy account, session and application history', async () => {
  const temporary = temporaryDatabase(); let service;
  const timestamp = '2026-09-01T00:00:00.000Z';
  try {
    inspect(temporary.path, db => {
      db.exec(`CREATE TABLE client_users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,created_at TEXT NOT NULL,can_review_brokers INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE client_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES client_users(id),expires_at INTEGER NOT NULL);
        CREATE TABLE broker_requests(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES client_users(id),status TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL,decided_at TEXT,decided_by TEXT REFERENCES client_users(id),rejection_reason TEXT);`);
      for (const [id, permission] of [['legacy-owner', 0], ['legacy-pending', 0], ['legacy-reviewer', 1]]) {
        db.prepare('INSERT INTO client_users VALUES (?,?,?,?,?,?)').run(id, id, id + '@example.com', 'unchanged-password-hash', timestamp, permission);
      }
      db.prepare('INSERT INTO client_sessions VALUES (?,?,?)').run('unchanged-session-token-hash', 'legacy-owner', 2000000000000);
      db.prepare('INSERT INTO broker_requests VALUES (?,?,?,?,?,?,?,?)').run('old-rejection', 'legacy-owner', 'rejected', JSON.stringify(application), timestamp, timestamp, 'legacy-reviewer', 'سبب رفض محفوظ');
      db.prepare('INSERT INTO broker_requests VALUES (?,?,?,?,?,?,?,?)').run('old-approval', 'legacy-owner', 'approved', JSON.stringify(application), timestamp, '2026-09-02T00:00:00.000Z', 'legacy-reviewer', null);
      db.prepare('INSERT INTO broker_requests VALUES (?,?,?,?,?,?,?,?)').run('old-pending', 'legacy-pending', 'pending', JSON.stringify(application), timestamp, null, null, null);
    });
    const before = inspect(temporary.path, db => ({ users: db.prepare('SELECT * FROM client_users ORDER BY id').all(), sessions: db.prepare('SELECT * FROM client_sessions').all(), applications: db.prepare('SELECT * FROM broker_requests ORDER BY id').all() }));
    service = await start(temporary.path);
    const first = inspect(temporary.path, db => {
      assert.deepEqual(db.prepare('SELECT * FROM client_users ORDER BY id').all().map(user => ({ ...user })), before.users.map(user => ({ ...user, can_manage_requests: 0 })));
      assert.deepEqual(db.prepare('SELECT * FROM client_sessions').all(), before.sessions);
      assert.deepEqual(db.prepare('SELECT * FROM broker_requests ORDER BY id').all(), before.applications);
      assert.deepEqual(db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(row => row.version), [1, 2, 3]);
      const profiles = db.prepare('SELECT * FROM lessor_profiles').all();
      assert.equal(profiles.length, 1);
      assert.equal(profiles[0].user_id, 'legacy-owner');
      assert.equal(profiles[0].application_id, 'old-approval');
      assert.equal(profiles[0].display_name, application.name);
      assert.equal(profiles[0].status, 'approved');
      assert.equal(profiles[0].created_at, '2026-09-02T00:00:00.000Z');
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM equipment').get().n, 0);
      return profiles;
    });
    await service.close(); service = undefined;
    service = await start(temporary.path);
    inspect(temporary.path, db => {
      assert.deepEqual(db.prepare('SELECT * FROM lessor_profiles').all(), first);
      assert.deepEqual(db.prepare('SELECT * FROM broker_requests ORDER BY id').all(), before.applications);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n, 3);
    });
  } finally { await service?.close(); temporary.remove(); }
});

test('migration three reconciles approvals made by the old main after migrations one and two without changing accounts, permissions, sessions or inbox history', async () => {
  const temporary = temporaryDatabase(); let service;
  try {
    service = await start(temporary.path);
    const owner = await service.account('legacy-main-owner'), reviewer = await service.account('legacy-main-reviewer'), existingOwner = await service.account('existing-lessor');
    grant(temporary.path, reviewer);
    inspect(temporary.path, db => db.prepare('UPDATE client_users SET can_manage_requests=1 WHERE id=?').run(reviewer.user.id));
    const existing = await service.approve(existingOwner, reviewer);
    const savedEquipment = (await (await service.create(existingOwner.Cookie)).json()).equipment;
    const pending = await service.submit(owner);
    const createdRequest = await service.send('/requests', request, owner.Cookie, { 'Idempotency-Key': randomUUID() });
    assert.equal(createdRequest.status, 201); const savedRequest = (await createdRequest.json()).request;
    assert.equal((await service.send('/request-conversations/' + savedRequest.id + '/messages', { body: 'استفسار محفوظ قبل ترقية المؤجر' }, owner.Cookie, { 'Idempotency-Key': randomUUID() })).status, 201);
    assert.equal((await service.send('/request-inbox/' + savedRequest.id + '/messages', { body: 'رد الإدارة محفوظ قبل ترقية المؤجر' }, reviewer.Cookie, { 'Idempotency-Key': randomUUID() })).status, 201);
    const conversation = await (await service.get('/request-conversations/' + savedRequest.id + '/messages', owner.Cookie)).json();
    await service.close(); service = undefined;
    // Reproduce the installed v1/v2 schema followed by old-main approval, which wrote only the application decision.
    const decidedAt = new Date().toISOString();
    inspect(temporary.path, db => {
      db.prepare('DELETE FROM schema_migrations WHERE version=3').run();
      db.prepare("UPDATE broker_requests SET status='approved',decided_at=?,decided_by=? WHERE id=?").run(decidedAt, reviewer.user.id, pending.id);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM lessor_profiles WHERE user_id=?').get(owner.user.id).n, 0);
    });
    const snapshot = () => inspect(temporary.path, db => ({
      users: db.prepare('SELECT * FROM client_users ORDER BY id').all(),
      sessions: db.prepare('SELECT * FROM client_sessions ORDER BY token_hash').all(),
      applications: db.prepare('SELECT * FROM broker_requests ORDER BY id').all(),
      requests: db.prepare('SELECT * FROM client_requests ORDER BY id').all(),
      messages: db.prepare('SELECT * FROM request_messages ORDER BY sequence').all(),
      equipment: db.prepare('SELECT * FROM equipment ORDER BY id').all(),
    }));
    const before = snapshot();
    const existingProfile = inspect(temporary.path, db => db.prepare('SELECT * FROM lessor_profiles WHERE id=?').get(existing.profile.id));
    inspect(temporary.path, db => db.exec("CREATE TRIGGER fail_reconciliation BEFORE INSERT ON lessor_profiles BEGIN SELECT RAISE(ABORT, 'isolated reconciliation failure'); END;"));
    assert.throws(() => createClientAuth({ databasePath: temporary.path, origin }), /isolated reconciliation failure/);
    inspect(temporary.path, db => {
      assert.deepEqual(db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(row => row.version), [1, 2]);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM lessor_profiles').get().n, 1);
      db.exec('DROP TRIGGER fail_reconciliation');
    });
    assert.deepEqual(snapshot(), before);
    service = await start(temporary.path);
    assert.deepEqual(snapshot(), before);
    const profile = (await (await service.get('/lessor-profile', owner.Cookie)).json()).profile;
    assert.ok(profile?.id); assert.equal(profile.status, 'approved'); assert.equal(profile.createdAt, decidedAt);
    inspect(temporary.path, db => {
      assert.deepEqual(db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(row => row.version), [1, 2, 3]);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM lessor_profiles').get().n, 2);
      const reconciled = db.prepare('SELECT * FROM lessor_profiles WHERE user_id=?').get(owner.user.id);
      assert.equal(reconciled.application_id, pending.id); assert.equal(reconciled.id, profile.id);
      assert.deepEqual(db.prepare('SELECT * FROM lessor_profiles WHERE id=?').get(existing.profile.id), existingProfile);
    });
    assert.deepEqual((await (await service.get('/me', reviewer.Cookie)).json()).user.permissions, { reviewBrokers: true, manageRequests: true });
    assert.deepEqual((await (await service.get('/me', owner.Cookie)).json()).user.permissions, { reviewBrokers: false, manageRequests: false });
    assert.deepEqual(await (await service.get('/request-conversations/' + savedRequest.id + '/messages', owner.Cookie)).json(), conversation);
    assert.equal((await (await service.get('/request-inbox', reviewer.Cookie)).json()).total, 1);
    assert.deepEqual((await (await service.get(equipmentPath(savedEquipment.id), existingOwner.Cookie)).json()).equipment, savedEquipment);
    await service.close(); service = undefined; service = await start(temporary.path);
    assert.deepEqual(snapshot(), before);
    assert.deepEqual((await (await service.get('/lessor-profile', owner.Cookie)).json()).profile, profile);
    assert.deepEqual(await (await service.get('/request-conversations/' + savedRequest.id + '/messages', owner.Cookie)).json(), conversation);
    inspect(temporary.path, db => assert.equal(db.prepare('SELECT COUNT(*) AS n FROM lessor_profiles').get().n, 2));
  } finally { await service?.close(); temporary.remove(); }
});

test('the approved lessor can rent and own equipment while the existing request inbox keeps its separate permission and persisted conversation', async () => {
  const temporary = temporaryDatabase(); let service;
  try {
    service = await start(temporary.path);
    const { owner, reviewer } = await setupApproved(service, temporary.path);
    const equipmentResponse = await service.create(owner.Cookie); assert.equal(equipmentResponse.status, 201);
    const savedEquipment = (await equipmentResponse.json()).equipment;
    assert.equal((await service.get('/request-inbox', owner.Cookie)).status, 403);
    assert.equal((await service.get('/request-inbox', reviewer.Cookie)).status, 403);
    const response = await service.send('/requests', request, owner.Cookie, { 'Idempotency-Key': randomUUID() }); assert.equal(response.status, 201);
    const savedRequest = (await response.json()).request;
    inspect(temporary.path, db => db.prepare('UPDATE client_users SET can_manage_requests=1 WHERE id=?').run(reviewer.user.id));
    const inbox = await (await service.get('/request-inbox', reviewer.Cookie)).json();
    assert.equal(inbox.total, 1); assert.equal(inbox.requests[0].id, savedRequest.id); assert.equal(inbox.requests[0].customer.email, owner.input.email);
    assert.equal((await service.send('/request-conversations/' + savedRequest.id + '/messages', { body: 'طلب استئجار من حساب مؤجر معتمد' }, owner.Cookie, { 'Idempotency-Key': randomUUID() })).status, 201);
    assert.equal((await service.send('/request-inbox/' + savedRequest.id + '/messages', { body: 'وصل طلبك إلى إدارة محور' }, reviewer.Cookie, { 'Idempotency-Key': randomUUID() })).status, 201);
    const conversation = await (await service.get('/request-conversations/' + savedRequest.id + '/messages', owner.Cookie)).json();
    assert.deepEqual(conversation.messages.map(message => message.role), ['client', 'admin']);
    assert.ok(conversation.messages.every(message => message.author_id === undefined));
    inspect(temporary.path, db => {
      assert.equal(db.prepare('SELECT user_id FROM client_requests WHERE id=?').get(savedRequest.id).user_id, owner.user.id);
      assert.equal(db.prepare('SELECT author_id FROM request_messages WHERE request_id=? AND author_role=?').get(savedRequest.id, 'admin').author_id, reviewer.user.id);
    });
    await service.close(); service = undefined; service = await start(temporary.path);
    assert.deepEqual(await (await service.get('/request-conversations/' + savedRequest.id + '/messages', owner.Cookie)).json(), conversation);
    assert.deepEqual((await (await service.get(equipmentPath(savedEquipment.id), owner.Cookie)).json()).equipment, savedEquipment);
    assert.equal((await (await service.get('/request-inbox?filter=answered', reviewer.Cookie)).json()).total, 1);
    assert.equal((await service.get('/request-inbox', owner.Cookie)).status, 403);
  } finally { await service?.close(); temporary.remove(); }
});

test('approval atomically creates one lessor profile; pending, rejection and review permission alone do not grant equipment access', async () => {
  const temporary = temporaryDatabase(); const service = await start(temporary.path);
  try {
    const reviewer = await service.account('reviewer'), owner = await service.account('owner'), rejectedOwner = await service.account('rejected-owner');
    grant(temporary.path, reviewer);
    const own = await service.submit(reviewer), pending = await service.submit(owner), rejected = await service.submit(rejectedOwner);
    for (const account of [reviewer, owner, rejectedOwner]) {
      assert.deepEqual(await (await service.get('/lessor-profile', account.Cookie)).json(), { profile: null });
      assert.equal((await service.get('/equipment', account.Cookie)).status, 403);
      assert.equal((await service.create(account.Cookie)).status, 403);
    }
    assert.equal((await service.send(decisionPath(own.id), { status: 'approved' }, reviewer.Cookie)).status, 403);
    assert.equal((await service.send(decisionPath(own.id), { status: 'rejected', reason: 'سبب رفض' }, reviewer.Cookie)).status, 403);
    assert.equal((await service.send(decisionPath(rejected.id), { status: 'rejected', reason: 'نطاق العمل غير مكتمل' }, reviewer.Cookie)).status, 200);
    assert.deepEqual(await (await service.get('/lessor-profile', rejectedOwner.Cookie)).json(), { profile: null });
    inspect(temporary.path, db => db.exec("CREATE TRIGGER fail_lessor_profile BEFORE INSERT ON lessor_profiles BEGIN SELECT RAISE(ABORT, 'isolated approval failure'); END;"));
    const failed = await service.send(decisionPath(pending.id), { status: 'approved' }, reviewer.Cookie);
    assert.equal(failed.status, 500); assert.ok((await failed.json()).error);
    inspect(temporary.path, db => {
      const unchanged = db.prepare('SELECT * FROM broker_requests WHERE id=?').get(pending.id);
      assert.equal(unchanged.status, 'pending'); assert.equal(unchanged.decided_at, null); assert.equal(unchanged.decided_by, null);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM lessor_profiles').get().n, 0);
      db.exec('DROP TRIGGER fail_lessor_profile');
    });
    assert.equal((await service.send(decisionPath(pending.id), { status: 'approved' }, reviewer.Cookie)).status, 200);
    assert.equal((await service.send(decisionPath(pending.id), { status: 'approved' }, reviewer.Cookie)).status, 409);
    const profile = (await (await service.get('/lessor-profile', owner.Cookie)).json()).profile;
    assert.equal(profile.displayName, application.name); assert.equal(profile.entity, application.entity); assert.equal(profile.status, 'approved');
    assert.equal(profile.identity, undefined); assert.equal(profile.password_hash, undefined);
    inspect(temporary.path, db => {
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM lessor_profiles').get().n, 1);
      const row = db.prepare('SELECT * FROM lessor_profiles').get();
      assert.equal(row.user_id, owner.user.id); assert.equal(row.application_id, pending.id); assert.equal(row.id, profile.id);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM broker_requests').get().n, 3);
    });
  } finally { await service.close(); temporary.remove(); }
});

test('equipment and lessor identity persist through create, edit, availability, archive, refresh, logout/login and server restart', async () => {
  const temporary = temporaryDatabase(); let service; let clock = Date.now();
  try {
    service = await start(temporary.path, () => clock);
    const { owner, profile } = await setupApproved(service, temporary.path);
    assert.deepEqual(await (await service.get('/equipment', owner.Cookie)).json(), { equipment: [], page: 1, pageSize: 20, total: 0 });
    const key = randomUUID(), created = await service.create(owner.Cookie, equipment, key);
    assert.equal(created.status, 201); assert.equal(created.headers.get('cache-control'), 'no-store');
    const saved = (await created.json()).equipment;
    assert.match(saved.id, /^[a-f0-9-]{36}$/); assert.equal(saved.version, 1); assert.equal(saved.currency, 'SAR');
    assert.equal(saved.createdAt, saved.updatedAt); assert.ok(Number.isFinite(Date.parse(saved.createdAt)));
    assert.equal(saved.submission_key, undefined); assert.equal(saved.submission_payload, undefined);
    inspect(temporary.path, db => {
      const row = db.prepare('SELECT e.*, p.user_id FROM equipment e JOIN lessor_profiles p ON p.id=e.lessor_profile_id WHERE e.id=?').get(saved.id);
      assert.equal(row.user_id, owner.user.id); assert.equal(row.lessor_profile_id, profile.id); assert.equal(row.hourly_rate_halalas, 12550); assert.equal(row.daily_rate_halalas, 90000);
    });
    const clientRequest = await service.send('/requests', request, owner.Cookie, { 'Idempotency-Key': randomUUID() });
    assert.equal(clientRequest.status, 201);
    inspect(temporary.path, db => assert.equal(db.prepare('SELECT user_id FROM client_requests').get().user_id, owner.user.id));
    assert.deepEqual((await (await service.get('/equipment', owner.Cookie)).json()).equipment, [saved]);
    clock += 1000;
    const changed = { ...equipment, name: 'حفار بعد تحديث البيانات', hourlyRateHalalas: null, dailyRateHalalas: 85000, operatorMode: 'without_operator', availability: 'unavailable', status: 'archived', version: saved.version };
    const updateResponse = await service.send(equipmentPath(saved.id), changed, owner.Cookie);
    assert.equal(updateResponse.status, 200);
    const updated = (await updateResponse.json()).equipment;
    assert.equal(updated.version, 2); assert.equal(updated.status, 'archived'); assert.equal(updated.availability, 'unavailable');
    assert.equal(updated.hourlyRateHalalas, null); assert.equal(updated.dailyRateHalalas, 85000); assert.equal(updated.createdAt, saved.createdAt);
    assert.ok(Date.parse(updated.updatedAt) > Date.parse(saved.updatedAt));
    assert.deepEqual((await (await service.get(equipmentPath(saved.id), owner.Cookie)).json()).equipment, updated);
    assert.deepEqual((await (await service.get('/equipment', owner.Cookie)).json()).equipment, [updated]);
    const retry = await service.create(owner.Cookie, equipment, key);
    assert.equal(retry.status, 200); assert.equal((await retry.json()).equipment.id, updated.id);
    assert.equal((await service.send('/logout', {}, owner.Cookie)).status, 200);
    assert.equal((await service.get('/equipment', owner.Cookie)).status, 401);
    assert.equal((await service.get('/lessor-profile', owner.Cookie)).status, 401);
    const login = await service.send('/login', owner.input); assert.equal(login.status, 200); owner.Cookie = cookie(login);
    assert.deepEqual((await (await service.get('/lessor-profile', owner.Cookie)).json()).profile, profile);
    assert.deepEqual((await (await service.get('/equipment', owner.Cookie)).json()).equipment, [updated]);
    await service.close(); service = undefined;
    service = await start(temporary.path, () => clock + 1000);
    assert.deepEqual((await (await service.get('/lessor-profile', owner.Cookie)).json()).profile, profile);
    assert.deepEqual((await (await service.get('/equipment', owner.Cookie)).json()).equipment, [updated]);
    assert.deepEqual((await (await service.get(equipmentPath(saved.id), owner.Cookie)).json()).equipment, updated);
    assert.equal((await (await service.get('/requests', owner.Cookie)).json()).total, 1);
    inspect(temporary.path, db => {
      const row = db.prepare('SELECT status,availability,version FROM equipment WHERE id=?').get(saved.id);
      assert.equal(row.status, 'archived'); assert.equal(row.availability, 'unavailable'); assert.equal(row.version, 2);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM equipment').get().n, 1);
    });
  } finally { await service?.close(); temporary.remove(); }
});

test('equipment ownership comes from the session; other lessors, ordinary users, anonymous and expired sessions cannot read or change it', async () => {
  const temporary = temporaryDatabase(); let clock = Date.now(); const service = await start(temporary.path, () => clock);
  try {
    const { owner, reviewer } = await setupApproved(service, temporary.path);
    const other = await service.account('other-lessor'); await service.approve(other, reviewer);
    const ordinary = await service.account('ordinary');
    const saved = (await (await service.create(owner.Cookie)).json()).equipment;
    assert.deepEqual((await (await service.get('/equipment', other.Cookie)).json()).equipment, []);
    assert.equal((await service.get(equipmentPath(saved.id), other.Cookie)).status, 404);
    assert.equal((await service.send(equipmentPath(saved.id), { ...equipment, version: 1 }, other.Cookie)).status, 404);
    assert.equal((await service.get('/equipment', ordinary.Cookie)).status, 403);
    assert.equal((await service.get(equipmentPath(saved.id), ordinary.Cookie)).status, 403);
    assert.equal((await service.send(equipmentPath(saved.id), { ...equipment, version: 1 }, ordinary.Cookie)).status, 403);
    assert.equal((await service.get('/lessor-profile')).status, 401);
    assert.equal((await service.get('/equipment')).status, 401);
    assert.equal((await service.get(equipmentPath(saved.id))).status, 401);
    assert.equal((await service.create()).status, 401);
    assert.equal((await service.send(equipmentPath(saved.id), { ...equipment, version: 1 })).status, 401);
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      assert.equal((await service.send(equipmentPath(saved.id), { ...equipment, version: 1 }, owner.Cookie, {}, method)).status, 405);
    }
    assert.deepEqual((await (await service.get(equipmentPath(saved.id), owner.Cookie)).json()).equipment, saved);
    clock += 7 * 86400000 + 1;
    for (const route of ['/lessor-profile', '/equipment', equipmentPath(saved.id)]) assert.equal((await service.get(route, owner.Cookie)).status, 401);
    assert.equal((await service.create(owner.Cookie)).status, 401);
    assert.equal((await service.send(equipmentPath(saved.id), { ...equipment, version: 1 }, owner.Cookie)).status, 401);
  } finally { await service.close(); temporary.remove(); }
});

test('server rejects forged administrative fields, unsafe rates, invalid enums and malformed or cross-origin equipment writes', async () => {
  const temporary = temporaryDatabase(); const service = await start(temporary.path);
  try {
    const { owner, profile } = await setupApproved(service, temporary.path);
    for (const body of [null, [], {}, '', { ...equipment, name: '' }, { ...equipment, name: 12 }, { ...equipment, name: 'x'.repeat(121) },
      { ...equipment, name: 'bad\u0000name' }, { ...equipment, description: 'قصير' }, { ...equipment, description: 'x'.repeat(2001) },
      { ...equipment, location: '' }, { ...equipment, location: 'x'.repeat(161) }, { ...equipment, category: 'unknown' },
      { ...equipment, operatorMode: 'both' }, { ...equipment, availability: 'booked' }, { ...equipment, status: 'approved' },
      { ...equipment, hourlyRateHalalas: null, dailyRateHalalas: null }, { ...equipment, hourlyRateHalalas: 0 },
      { ...equipment, hourlyRateHalalas: -1 }, { ...equipment, hourlyRateHalalas: 1.1 }, { ...equipment, hourlyRateHalalas: '100' },
      { ...equipment, hourlyRateHalalas: 100000001 }, { ...equipment, dailyRateHalalas: 0 }, { ...equipment, dailyRateHalalas: false },
      { ...equipment, dailyRateHalalas: 100000001 }, { ...equipment, currency: 'USD' }, { ...equipment, ownerId: owner.user.id },
      { ...equipment, userId: owner.user.id }, { ...equipment, user_id: owner.user.id }, { ...equipment, lessorProfileId: profile.id },
      { ...equipment, lessor_profile_id: profile.id }, { ...equipment, id: randomUUID() }, { ...equipment, version: 1 },
      { ...equipment, createdAt: 'yesterday' }, { ...equipment, updated_at: 'yesterday' }, { ...equipment, can_review_brokers: 1 },
      { ...equipment, quantity: 2 }, { ...equipment, files: [] }, JSON.parse('{"__proto__":{}}')]) {
      assert.equal((await service.create(owner.Cookie, body)).status, 400, JSON.stringify(body).slice(0, 180));
    }
    const invalidRate = await service.create(owner.Cookie, { ...equipment, hourlyRateHalalas: -1 });
    assert.ok((await invalidRate.json()).fieldErrors.hourlyRateHalalas);
    assert.equal((await service.send('/equipment', equipment, owner.Cookie)).status, 400);
    assert.equal((await service.create(owner.Cookie, equipment, 'bad-key')).status, 400);
    assert.equal((await service.create(owner.Cookie, equipment, randomUUID(), { Origin: 'https://other.example' })).status, 403);
    assert.equal((await service.create(owner.Cookie, equipment, randomUUID(), { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await service.create(owner.Cookie, equipment, randomUUID(), { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await service.create(owner.Cookie, { ...equipment, description: 'x'.repeat(18000) })).status, 413);
    assert.equal((await service.raw('/equipment', '{invalid', owner.Cookie)).status, 400);
    assert.equal((await (await service.get('/equipment', owner.Cookie)).json()).total, 0);
    const saved = (await (await service.create(owner.Cookie)).json()).equipment;
    for (const body of [{ ...equipment }, { ...equipment, version: 0 }, { ...equipment, version: '1' }, { ...equipment, version: 1.5 },
      { ...equipment, version: 2147483647 }, { ...equipment, version: 1, ownerId: randomUUID() }, { ...equipment, version: 1, lessor_profile_id: profile.id },
      { ...equipment, version: 1, status: 'approved' }, { ...equipment, version: 1, hourlyRateHalalas: null, dailyRateHalalas: null }]) {
      assert.equal((await service.send(equipmentPath(saved.id), body, owner.Cookie)).status, 400);
    }
    assert.equal((await service.send(equipmentPath(saved.id), { ...equipment, version: 1 }, owner.Cookie, { Origin: 'https://other.example' })).status, 403);
    assert.deepEqual((await (await service.get(equipmentPath(saved.id), owner.Cookie)).json()).equipment, saved);
  } finally { await service.close(); temporary.remove(); }
});

test('equipment creation retries across separate database connections create one physical asset per idempotency key', async () => {
  const temporary = temporaryDatabase(); const first = await start(temporary.path); const second = await start(temporary.path);
  try {
    const { owner, reviewer } = await setupApproved(first, temporary.path);
    const key = randomUUID();
    const responses = await Promise.all(Array.from({ length: 8 }, (_, index) => (index % 2 ? first : second).create(owner.Cookie, equipment, key)));
    assert.equal(responses.filter(response => response.status === 201).length, 1);
    assert.equal(responses.filter(response => response.status === 200).length, 7);
    const payloads = await Promise.all(responses.map(response => response.json()));
    assert.equal(new Set(payloads.map(payload => payload.equipment.id)).size, 1);
    assert.equal((await first.create(owner.Cookie, { ...equipment, name: 'معدة مختلفة' }, key)).status, 409);
    assert.equal((await (await first.get('/equipment', owner.Cookie)).json()).total, 1);
    const other = await first.account('other-lessor'); await first.approve(other, reviewer);
    assert.equal((await second.create(other.Cookie, equipment, key)).status, 201);
    assert.equal((await (await second.get('/equipment', other.Cookie)).json()).total, 1);
    inspect(temporary.path, db => {
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM equipment').get().n, 2);
      assert.equal(db.prepare('SELECT COUNT(DISTINCT lessor_profile_id) AS n FROM equipment').get().n, 2);
    });
  } finally { await first.close(); await second.close(); temporary.remove(); }
});

test('concurrent equipment edits use a version comparison and persist one complete winning change without a lost update', async () => {
  const temporary = temporaryDatabase(); const first = await start(temporary.path); const second = await start(temporary.path);
  try {
    const { owner } = await setupApproved(first, temporary.path);
    const saved = (await (await first.create(owner.Cookie)).json()).equipment;
    const choices = [
      { ...equipment, name: 'التعديل الأول للمعدة', hourlyRateHalalas: 14000, availability: 'available', version: 1 },
      { ...equipment, name: 'التعديل الثاني للمعدة', hourlyRateHalalas: 16000, availability: 'unavailable', version: 1 },
    ];
    const responses = await Promise.all([first.send(equipmentPath(saved.id), choices[0], owner.Cookie), second.send(equipmentPath(saved.id), choices[1], owner.Cookie)]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    const winnerIndex = responses.findIndex(response => response.status === 200);
    const winner = (await responses[winnerIndex].json()).equipment;
    assert.equal(winner.version, 2); assert.equal(winner.name, choices[winnerIndex].name);
    assert.equal(winner.hourlyRateHalalas, choices[winnerIndex].hourlyRateHalalas); assert.equal(winner.availability, choices[winnerIndex].availability);
    assert.deepEqual((await (await second.get(equipmentPath(saved.id), owner.Cookie)).json()).equipment, winner);
    assert.equal((await first.send(equipmentPath(saved.id), choices[1 - winnerIndex], owner.Cookie)).status, 409);
    inspect(temporary.path, db => {
      const row = db.prepare('SELECT name,hourly_rate_halalas,availability,version FROM equipment WHERE id=?').get(saved.id);
      assert.equal(row.name, winner.name); assert.equal(row.hourly_rate_halalas, winner.hourlyRateHalalas); assert.equal(row.availability, winner.availability); assert.equal(row.version, 2);
    });
  } finally { await first.close(); await second.close(); temporary.remove(); }
});

test('SQLite insert and update failures return errors, do not claim success, and permit safe retry without phantom equipment', async () => {
  const temporary = temporaryDatabase(); const service = await start(temporary.path);
  try {
    const { owner } = await setupApproved(service, temporary.path); const key = randomUUID();
    inspect(temporary.path, db => db.exec("CREATE TRIGGER fail_equipment_insert BEFORE INSERT ON equipment BEGIN SELECT RAISE(ABORT, 'isolated equipment failure'); END;"));
    const failed = await service.create(owner.Cookie, equipment, key);
    assert.equal(failed.status, 500); const failure = await failed.json(); assert.ok(failure.error); assert.equal(failure.equipment, undefined);
    inspect(temporary.path, db => { assert.equal(db.prepare('SELECT COUNT(*) AS n FROM equipment').get().n, 0); db.exec('DROP TRIGGER fail_equipment_insert'); });
    const retry = await service.create(owner.Cookie, equipment, key); assert.equal(retry.status, 201);
    const saved = (await retry.json()).equipment;
    assert.equal((await service.create(owner.Cookie, equipment, key)).status, 200);
    inspect(temporary.path, db => db.exec("CREATE TRIGGER fail_equipment_update BEFORE UPDATE ON equipment BEGIN SELECT RAISE(ABORT, 'isolated update failure'); END;"));
    const changed = { ...equipment, availability: 'unavailable', version: saved.version };
    const failedUpdate = await service.send(equipmentPath(saved.id), changed, owner.Cookie);
    assert.equal(failedUpdate.status, 500); const updateError = await failedUpdate.json(); assert.ok(updateError.error); assert.equal(updateError.equipment, undefined);
    assert.deepEqual((await (await service.get(equipmentPath(saved.id), owner.Cookie)).json()).equipment, saved);
    inspect(temporary.path, db => db.exec('DROP TRIGGER fail_equipment_update'));
    assert.equal((await service.send(equipmentPath(saved.id), changed, owner.Cookie)).status, 200);
    inspect(temporary.path, db => { const rows = db.prepare('SELECT availability,version FROM equipment').all(); assert.equal(rows.length, 1); assert.equal(rows[0].availability, 'unavailable'); assert.equal(rows[0].version, 2); });
  } finally { await service.close(); temporary.remove(); }
});

test('equipment pagination is bounded and stable; missing IDs and unrecognized query parameters never expose other records', async () => {
  const temporary = temporaryDatabase(); const service = await start(temporary.path, () => 1700000000000);
  try {
    const { owner } = await setupApproved(service, temporary.path);
    for (let index = 0; index < 23; index++) {
      assert.equal((await service.create(owner.Cookie, { ...equipment, name: 'معدة مستقلة ' + index, hourlyRateHalalas: 100000000, dailyRateHalalas: null })).status, 201);
    }
    const first = await (await service.get('/equipment', owner.Cookie)).json(), second = await (await service.get('/equipment?page=2', owner.Cookie)).json();
    assert.equal(first.page, 1); assert.equal(first.pageSize, 20); assert.equal(first.total, 23); assert.equal(first.equipment.length, 20); assert.equal(second.equipment.length, 3);
    assert.equal(new Set([...first.equipment, ...second.equipment].map(item => item.id)).size, 23);
    assert.deepEqual((await (await service.get('/equipment', owner.Cookie)).json()).equipment, first.equipment);
    assert.equal((await (await service.get('/equipment?page=3', owner.Cookie)).json()).equipment.length, 0);
    for (const query of ['?page=0', '?page=-1', '?page=1.5', '?page=1000000', '?page=1&page=2', '?ownerId=other']) {
      assert.equal((await service.get('/equipment' + query, owner.Cookie)).status, 400);
    }
    for (const id of ['not-an-id', randomUUID(), "' OR 1=1 --"]) {
      assert.equal((await service.get(equipmentPath(id), owner.Cookie)).status, 404);
      assert.equal((await service.send(equipmentPath(id), { ...equipment, version: 1 }, owner.Cookie)).status, 404);
    }
  } finally { await service.close(); temporary.remove(); }
});
