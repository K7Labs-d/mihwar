import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

// Launch the actual production entry point from a different directory.
const child = spawn(process.execPath, [fileURLToPath(new URL('./start.mjs', import.meta.url))], {
  cwd: tmpdir(),
  env: { ...process.env, PORT: '0', HOST: '127.0.0.1', AUTH_DB_PATH: ':memory:',
    RESEND_API_KEY: 'test-only-key', LOGIN_EMAIL_FROM: 'login@example.com' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const closed = once(child, 'close');
let output = '';
child.stdout.on('data', data => { output += data; });
child.stderr.on('data', data => { output += data; });
try {
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('Server startup timed out.')), 20000);
    function finish(error, value) {
      clearTimeout(timer);
      child.stdout.off('data', ready);
      child.off('error', failed);
      child.off('exit', exited);
      if (error) reject(error); else resolve(value);
    }
    function ready() {
      const match = output.match(/Mahwar: http:\/\/localhost:(\d+)/);
      if (match) finish(null, `http://127.0.0.1:${match[1]}`);
    }
    function failed(error) { finish(error); }
    function exited() { finish(new Error(`Server stopped before startup. ${output}`)); }
    child.stdout.on('data', ready);
    child.once('error', failed);
    child.once('exit', exited);
  });
  const get = route => fetch(base + route, { signal: AbortSignal.timeout(5000) });
  const home = await get('/');
  assert.equal(home.status, 200);
  assert.match(home.headers.get('cache-control'), /no-cache/);
  const html = await home.text();
  assert.match(html, /id="root"/);
  const bundle = html.match(/src="([^\"]+\.js)"/)?.[1];
  assert.ok(bundle, 'Built HTML must reference a JS bundle');
  const asset = await get(bundle);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('content-type'), /javascript/);
  assert.match(asset.headers.get('cache-control'), /immutable/);
  assert.equal((await (await get('/api/health')).json()).version, '0.3.0');
  assert.equal((await get('/api/admin/auth/status')).status, 404);
  assert.equal((await get('/assets/obsolete-bundle.js')).status, 404);
  const missingApi = await get('/api/missing');
  assert.equal(missingApi.status, 404);
  assert.ok((await missingApi.json()).error);
  for (const route of ['/marketplace', '/rfqs', '/owner_fleet', '/my_rentals', '/admin_portal', '/about', '/how_it_works', '/escrow_security']) {
    assert.equal((await get(route)).status, 404, route);
  }
  assert.equal((await get('/api/client/me')).status, 401);
  assert.equal((await get('/api/client/lessor-profile')).status, 401);
  assert.equal((await get('/api/client/equipment')).status, 401);
  assert.equal((await get('/api/client/equipment/missing')).status, 401);
  assert.equal((await get('/api/client/request-inbox')).status, 401);
  assert.equal((await get('/api/client/request-conversations/missing/messages')).status, 401);
  console.log('Production check passed: home, assets, client auth, health, and removed routes.');
} finally {
  if (child.exitCode === null) child.kill('SIGTERM');
  await closed;
}
