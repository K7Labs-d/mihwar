import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { spawnSync } from 'node:child_process';

test('unbuilt source package explains the build command and exits with a failure code', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mahwar-start-test-'));
  try {
    mkdirSync(join(dir, 'scripts'));
    copyFileSync(new URL('../scripts/start.mjs', import.meta.url), join(dir, 'scripts', 'start.mjs'));
    const result = spawnSync(process.execPath, [join(dir, 'scripts', 'start.mjs')], { encoding: 'utf8', timeout: 10000 });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /npm run build/);
    assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND/);
  } finally {
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    assert.ok(basename(dir).startsWith('mahwar-start-test-'));
    rmSync(dir, { recursive: true, force: true });
  }
});
