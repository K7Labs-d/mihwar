import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createClientAuth } from '../server/clientAuth.ts';
const origin = 'https://mihwar.example';
const draft = {
  entity: 'individual',
  name: 'مؤجر الاختبار',
  identity: '1234567890',
  commercial: '',
  phone: '0501234567',
  email: 'contact@example.com',
  address: '',
  domains: 'معدات',
  regions: 'الرياض',
};
const equipment = {
  name: 'معدة اختبار معزولة',
  category: 'excavator',
  description: 'مواصفات معدة في قاعدة اختبار مؤقتة فقط',
  location: 'الرياض',
  hourlyRateHalalas: 10000,
  dailyRateHalalas: null,
  operatorMode: 'without_operator',
  availability: 'available',
  status: 'active',
};
const cookie = (r) => r.headers.get('set-cookie')?.split(';')[0];
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'mahwar-phase1-')),
    path = join(dir, 'clients.sqlite');
  let now = Date.now();
  const auth = createClientAuth({ databasePath: path, origin, now: () => now });
  const app = express();
  app.use('/api/client', auth.router);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port + '/api/client';
  const f = {
    path,
    advance: (n) => {
      now += n;
    },
    get: (route, Cookie = '') => fetch(base + route, { headers: { Cookie } }),
    post: (route, body = {}, Cookie = '', extra = {}) =>
      fetch(base + route, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: origin,
          Cookie,
          ...extra,
        },
        body: JSON.stringify(body),
      }),
    db: (task) => {
      const db = new DatabaseSync(path);
      db.exec('PRAGMA foreign_keys=ON');
      try {
        return task(db);
      } finally {
        db.close();
      }
    },
    close: async () => {
      await new Promise((r) => {
        server.closeAllConnections();
        server.close(r);
      });
      auth.close();
      assert.ok(dir.startsWith('/tmp/mahwar-phase1-'));
      rmSync(dir, { recursive: true, force: true });
    },
  };
  f.account = async (n) => {
    const input = {
      name: n,
      email: n + '@example.com',
      password: 'test-password-phase1-123',
    };
    const r = await f.post('/register', input);
    assert.equal(r.status, 201);
    return { input, user: (await r.json()).user, Cookie: cookie(r) };
  };
  f.owner = async () => {
    const a = await f.account('platform-owner');
    f.db((db) =>
      db
        .prepare(
          'UPDATE client_users SET is_platform_admin=1,can_review_brokers=1,can_manage_requests=1 WHERE id=?',
        )
        .run(a.user.id),
    );
    const r = await f.post('/admin-login', a.input);
    assert.equal(r.status, 200);
    return { ...a, Cookie: cookie(r) };
  };
  f.submit = async (a) => {
    const r = await f.post('/broker-requests', draft, a.Cookie);
    assert.equal(r.status, 201);
    return (await r.json()).request;
  };
  f.review = (id, b, a) =>
    f.post('/broker-review/requests/' + id + '/decision', b, a.Cookie);
  f.create = (a) =>
    f.post('/equipment', equipment, a.Cookie, {
      'Idempotency-Key': randomUUID(),
    });
  return f;
}
test('role choice persists, cannot grant admin, regular login cannot enter owner dashboard, admin session expires and logout revokes', async () => {
  const f = await fixture();
  try {
    const a = await f.account('new-renter');
    assert.equal(a.user.selectedRole, null);
    assert.equal(
      (await f.post('/role', { role: 'admin' }, a.Cookie)).status,
      400,
    );
    assert.equal(
      (
        await f.post(
          '/role',
          { role: 'lessor', is_platform_admin: 1 },
          a.Cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (await f.post('/role', { role: 'renter' }, a.Cookie)).status,
      200,
    );
    assert.equal(
      (await (await f.get('/me', a.Cookie)).json()).user.selectedRole,
      'renter',
    );
    assert.equal(
      (await f.post('/role', { role: 'lessor' }, a.Cookie)).status,
      200,
    );
    assert.equal((await f.post('/admin-login', a.input)).status, 403);
    assert.equal((await f.get('/admin/overview', a.Cookie)).status, 403);
    const owner = await f.owner();
    const normal = await f.post('/login', owner.input);
    const ordinaryCookie = cookie(normal);
    assert.equal((await f.get('/admin/overview', ordinaryCookie)).status, 403);
    assert.equal(
      (await f.get('/broker-review/requests', ordinaryCookie)).status,
      403,
    );
    assert.equal((await f.get('/admin/overview', owner.Cookie)).status, 200);
    assert.equal((await f.post('/logout', {}, owner.Cookie)).status, 200);
    assert.equal((await f.get('/admin/overview', owner.Cookie)).status, 401);
    const relog = await f.post('/admin-login', owner.input);
    f.advance(7 * 86400000 + 1);
    assert.equal((await f.get('/admin/overview', cookie(relog))).status, 401);
  } finally {
    await f.close();
  }
});
test('anonymous discovery is blocked, pending/rejected lessors cannot publish or offer; correction approval and immutable audit work', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.get('/marketplace')).status, 401);
    assert.equal((await f.post('/offers')).status, 401);
    const lessor = await f.account('lessor'),
      admin = await f.owner();
    let app = await f.submit(lessor);
    f.db((db) => {
      assert.throws(
        () =>
          db
            .prepare(
              'UPDATE broker_requests SET status=?,decided_at=?,decided_by=? WHERE id=?',
            )
            .run('approved', new Date().toISOString(), lessor.user.id, app.id),
        /Authorized immutable lessor decision/,
      );
    });
    assert.equal((await f.create(lessor)).status, 403);
    assert.equal((await f.post('/offers', {}, lessor.Cookie)).status, 403);
    assert.equal(
      (
        await f.review(
          app.id,
          { status: 'rejected', reason: 'هوية غير مكتملة' },
          admin,
        )
      ).status,
      200,
    );
    assert.equal((await f.create(lessor)).status, 403);
    assert.equal(
      (await (await f.get('/broker-requests', lessor.Cookie)).json()).request
        .rejectionReason,
      'هوية غير مكتملة',
    );
    f.db((db) => {
      assert.throws(
        () =>
          db
            .prepare(
              'UPDATE broker_requests SET status=?,decided_at=?,decided_by=? WHERE id=?',
            )
            .run('approved', new Date().toISOString(), lessor.user.id, app.id),
        /Authorized immutable lessor decision/,
      );
    });
    app = await f.submit(lessor);
    assert.equal(
      (await f.review(app.id, { status: 'approved' }, admin)).status,
      200,
    );
    assert.equal((await f.post('/offers', {}, lessor.Cookie)).status, 501);
    const asset = await f.create(lessor);
    assert.equal(asset.status, 201);
    assert.equal((await asset.json()).equipment.reviewStatus, 'pending');
    const audit = (await (await f.get('/admin/audit', admin.Cookie)).json())
      .items;
    assert.equal(audit.length, 2);
    assert.ok(audit.every((v) => v.actor_id === admin.user.id && v.created_at));
    assert.ok(audit.some((v) => v.reason === 'هوية غير مكتملة'));
    f.db((db) => {
      assert.throws(
        () => db.exec("UPDATE admin_audit SET action='approved'"),
        /append only/,
      );
      assert.throws(() => db.exec('DELETE FROM admin_audit'), /append only/);
    });
  } finally {
    await f.close();
  }
});
test('equipment moderation binds version, reason and actor; competing decisions get one winner, edit removes discovery until reapproval', async () => {
  const f = await fixture();
  try {
    const a = await f.account('lessor'),
      admin = await f.owner(),
      other = await f.account('other');
    const app = await f.submit(a);
    await f.review(app.id, { status: 'approved' }, admin);
    const saved = (await (await f.create(a)).json()).equipment;
    const route = '/admin/equipment/' + saved.id + '/decision';
    assert.deepEqual(
      (await (await f.get('/marketplace', a.Cookie)).json()).equipment,
      [],
    );
    assert.equal(
      (await f.post(route, { status: 'approved', version: 1 }, other.Cookie))
        .status,
      403,
    );
    assert.equal(
      (
        await f.post(
          route,
          { status: 'rejected', version: 1, reason: 'x' },
          admin.Cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (await f.post(route, { status: 'approved', version: 99 }, admin.Cookie))
        .status,
      409,
    );
    const decisions = await Promise.all([
      f.post(route, { status: 'approved', version: 1 }, admin.Cookie),
      f.post(
        route,
        { status: 'rejected', version: 1, reason: 'مواصفات ناقصة' },
        admin.Cookie,
      ),
    ]);
    assert.deepEqual(decisions.map((r) => r.status).sort(), [200, 409]);
    const state = (
      await (await f.get('/admin/equipment/' + saved.id, admin.Cookie)).json()
    ).item;
    assert.equal(
      (await (await f.get('/marketplace', a.Cookie)).json()).equipment.length,
      state.review_status === 'approved' ? 1 : 0,
    );
    const edit = await f.post(
      '/equipment/' + saved.id,
      {
        ...equipment,
        description: 'مواصفات مصححة للعمل في الموقع',
        version: 1,
      },
      a.Cookie,
    );
    assert.equal(edit.status, 200);
    assert.equal((await edit.json()).equipment.reviewStatus, 'pending');
    assert.equal(
      (await f.post(route, { status: 'approved', version: 1 }, admin.Cookie))
        .status,
      409,
    );
    assert.equal(
      (await f.post(route, { status: 'approved', version: 2 }, admin.Cookie))
        .status,
      200,
    );
    const publicItem = (await (await f.get('/marketplace', a.Cookie)).json())
      .equipment[0];
    assert.equal(publicItem.id, saved.id);
    assert.equal(publicItem.owner_id, undefined);
    assert.equal(publicItem.decided_by, undefined);
    assert.equal(
      (
        await f.get(
          '/admin/equipment?status=approved&q=' +
            encodeURIComponent(saved.name),
          admin.Cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await f.get('/admin/equipment?from=2026-02-31', admin.Cookie)).status,
      400,
    );
    assert.equal(
      (
        await f.post(route, { status: 'approved', version: 2 }, admin.Cookie, {
          Origin: 'https://attacker.example',
        })
      ).status,
      403,
    );
    f.db((db) => {
      assert.throws(
        () =>
          db
            .prepare('INSERT INTO equipment_reviews VALUES (?,?,?,?,?,?)')
            .run(
              saved.id,
              3,
              'approved',
              null,
              other.user.id,
              new Date().toISOString(),
            ),
        /Authorized current review/,
      );
    });
  } finally {
    await f.close();
  }
});
test('dashboard counts only persisted records, missing services are null, visitors deduplicate and date/search filters apply', async () => {
  const f = await fixture();
  try {
    const admin = await f.owner();
    let stats = (await (await f.get('/admin/overview', admin.Cookie)).json())
      .stats;
    assert.equal(stats.users, 1);
    assert.equal(stats.requests, 0);
    assert.equal(stats.visitors, 0);
    assert.equal(stats.bookings, null);
    assert.equal(stats.disputes, null);
    const visit = await f.post('/visit');
    assert.equal(visit.status, 204);
    const visitorCookie = cookie(visit);
    await f.post('/visit', {}, visitorCookie);
    stats = (await (await f.get('/admin/overview', admin.Cookie)).json()).stats;
    assert.equal(stats.visitors, 1);
    const a = await f.account('renter');
    const request = await f.post(
      '/requests',
      {
        title: 'احتياج معزول',
        description: 'طلب اختبار ليس محتوى إنتاجيا حقيقيا',
        location: 'الرياض',
        quantity: 1,
      },
      a.Cookie,
      { 'Idempotency-Key': randomUUID() },
    );
    assert.equal(request.status, 201);
    const id = (await request.json()).request.id;
    stats = (await (await f.get('/admin/overview', admin.Cookie)).json()).stats;
    assert.equal(stats.users, 2);
    assert.equal(stats.requests, 1);
    assert.equal(stats.newRequests, 1);
    assert.equal(stats.waitingRequests, 1);
    await f.post(
      '/request-inbox/' + id + '/messages',
      { body: 'رد إدارة معزول' },
      admin.Cookie,
      { 'Idempotency-Key': randomUUID() },
    );
    stats = (await (await f.get('/admin/overview', admin.Cookie)).json()).stats;
    assert.equal(stats.newRequests, 0);
    assert.equal(stats.waitingRequests, 0);
    const all = await (
      await f.get('/admin/users?q=renter', admin.Cookie)
    ).json();
    assert.equal(all.items.length, 1);
    assert.equal(all.items[0].password_hash, undefined);
    const empty = (
      await (
        await f.get(
          '/admin/overview?from=2099-01-01&to=2099-12-31',
          admin.Cookie,
        )
      ).json()
    ).stats;
    assert.equal(empty.users, 0);
    assert.equal(empty.visitors, 0);
    assert.equal(
      (await f.get('/admin/users?from=2026-02-31', admin.Cookie)).status,
      400,
    );
    assert.equal(
      (
        await f.get(
          '/admin/audit?q=' + encodeURIComponent("%' OR 1=1 --"),
          admin.Cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await f.get('/request-inbox?from=2099-01-01', admin.Cookie)).status,
      200,
    );
    assert.equal(
      (
        await (
          await f.get('/request-inbox?from=2099-01-01', admin.Cookie)
        ).json()
      ).total,
      0,
    );
    f.db((db) =>
      db
        .prepare('UPDATE client_users SET is_platform_admin=0 WHERE id=?')
        .run(admin.user.id),
    );
    assert.equal((await f.get('/admin/overview', admin.Cookie)).status, 403);
  } finally {
    await f.close();
  }
});
test('equipment decision and audit roll back together on storage failure; data remains pending and retry is safe', async () => {
  const f = await fixture();
  try {
    const a = await f.account('lessor'),
      admin = await f.owner();
    const app = await f.submit(a);
    await f.review(app.id, { status: 'approved' }, admin);
    const asset = (await (await f.create(a)).json()).equipment;
    f.db((db) =>
      db.exec(
        "CREATE TRIGGER fail_audit BEFORE INSERT ON admin_audit BEGIN SELECT RAISE(ABORT,'isolated failure'); END;",
      ),
    );
    const route = '/admin/equipment/' + asset.id + '/decision';
    assert.equal(
      (await f.post(route, { status: 'approved', version: 1 }, admin.Cookie))
        .status,
      500,
    );
    f.db((db) => {
      assert.equal(
        db.prepare('SELECT COUNT(*) AS n FROM equipment_reviews').get().n,
        0,
      );
      db.exec('DROP TRIGGER fail_audit');
    });
    assert.equal(
      (
        await f.post(
          route,
          { status: 'rejected', version: 1, reason: 'صحح المواصفات' },
          admin.Cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await (await f.get('/equipment/' + asset.id, a.Cookie)).json()).equipment
        .rejectionReason,
      'صحح المواصفات',
    );
  } finally {
    await f.close();
  }
});

test('delegated staff also require administrative login; owner provisioning targets existing accounts and revokes sessions', async () => {
  const f = await fixture();
  try {
    const staff = await f.account('delegated-staff');
    f.db((db) =>
      db
        .prepare(
          'UPDATE client_users SET can_review_brokers=1,can_manage_requests=1 WHERE id=?',
        )
        .run(staff.user.id),
    );
    assert.equal(
      (await f.get('/broker-review/requests', staff.Cookie)).status,
      403,
    );
    assert.equal((await f.get('/request-inbox', staff.Cookie)).status, 403);
    const scoped = await f.post('/admin-login', staff.input);
    assert.equal(scoped.status, 200);
    assert.equal(
      (await f.get('/broker-review/requests', cookie(scoped))).status,
      200,
    );
    assert.equal((await f.get('/admin/overview', cookie(scoped))).status, 403);
    const command = (action, email) =>
      spawnSync(
        process.execPath,
        ['scripts/platform-owner.mjs', action, email],
        {
          cwd: new URL('..', import.meta.url),
          env: { ...process.env, AUTH_DB_PATH: f.path },
          encoding: 'utf8',
        },
      );
    assert.equal(command('grant', 'missing@example.com').status, 1);
    assert.equal(command('grant', staff.input.email).status, 0);
    assert.equal((await f.get('/me', staff.Cookie)).status, 401);
    assert.equal((await f.get('/me', cookie(scoped))).status, 401);
    const owner = await f.post('/admin-login', staff.input);
    assert.equal(owner.status, 200);
    assert.equal((await f.get('/admin/overview', cookie(owner))).status, 200);
    assert.equal(command('revoke', staff.input.email).status, 0);
    assert.equal((await f.get('/admin/overview', cookie(owner))).status, 401);
    assert.equal((await f.post('/admin-login', staff.input)).status, 403);
  } finally {
    await f.close();
  }
});
