import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createTimeline } from '../src/utils/timeline.ts';

process.env.NODE_ENV = 'production';
process.env.AUTH_DB_PATH = ':memory:';
const { startServer } = await import('../server.ts');
const server = await startServer(0, '127.0.0.1', { frontend: false });
const base = 'http://127.0.0.1:' + server.address().port;
after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));

test('reset cancels all pending wheel walkthrough waits', async () => {
  const timeline = createTimeline();
  const pending = [timeline.wait(500), timeline.wait(700)];
  timeline.cancel();
  assert.deepEqual(await Promise.all(pending), [false, false]);
  assert.equal(await timeline.wait(1), true);
});

test('removed pages and services are not served', async () => {
  for (const route of ['/marketplace', '/rfqs', '/owner_fleet', '/my_rentals', '/admin_portal', '/about', '/how_it_works', '/escrow_security', '/api/admin/auth/status', '/api/gemini/advisor']) {
    assert.equal((await fetch(base + route)).status, 404, route);
  }
  assert.equal((await fetch(base + '/api/admin/auth/login', { method: 'POST' })).status, 404);
  const health = await fetch(base + '/api/health');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).mode, 'client-auth');
});
