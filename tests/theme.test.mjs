import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { resolveTheme, readTheme, saveTheme, applyTheme } from '../src/components/theme/theme.ts';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const boot = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function fixture(value, unavailable = false) {
  const root = { dataset: {}, style: {} }, meta = { content: '', setAttribute(name, value) { this[name] = value; } };
  const document = { documentElement: root, querySelector: () => meta };
  const localStorage = { getItem: () => { if (unavailable) throw new Error('blocked'); return value; }, setItem: () => { if (unavailable) throw new Error('quota'); } };
  return { document, localStorage, root, meta };
}

test('night remains default; only a valid explicit light choice enables day', () => {
  for (const value of [null, undefined, '', 'dark', 'system', 'LIGHT', '<script>']) assert.equal(resolveTheme(value), 'dark');
  assert.equal(resolveTheme('light'), 'light');
});
for (const [value, unavailable, expected] of [[null, false, 'dark'], ['light', false, 'light'], ['dark', false, 'dark'], ['invalid', false, 'dark'], ['light', true, 'dark']]) {
  test(`pre-paint bootstrap resolves ${value}, blocked=${unavailable} as ${expected}`, () => {
    const f = fixture(value, unavailable);
    runInNewContext(boot, f);
    assert.equal(f.root.dataset.theme, expected);
    assert.equal(f.root.style.colorScheme, expected);
    assert.equal(f.meta.content, expected === 'light' ? '#f5f1e8' : '#080b0e');
    assert.ok(html.indexOf('<script>') < html.indexOf('<style>'));
    assert.ok(html.indexOf('<script>') < html.indexOf('id="root"'));
  });
}
test('runtime helpers tolerate blocked storage and update the canvas metadata', () => {
  const f = fixture('light', true);
  globalThis.window = f;
  globalThis.document = f.document;
  try {
    assert.equal(readTheme(), 'dark');
    assert.doesNotThrow(() => saveTheme('light'));
    applyTheme('light');
    assert.equal(f.root.dataset.theme, 'light');
    assert.equal(f.meta.content, '#f5f1e8');
    applyTheme('dark');
    assert.equal(f.root.dataset.theme, 'dark');
  } finally { delete globalThis.window; delete globalThis.document; }
});
