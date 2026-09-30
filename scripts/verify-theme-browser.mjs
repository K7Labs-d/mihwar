// Theme-only UI verification. Uses an isolated local server and in-memory database.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const port = Number(process.env.MIHWAR_THEME_PORT || 3040);
const base = `http://localhost:${port}`;
const output = process.env.MIHWAR_THEME_ARTIFACTS || '/tmp/mihwar-theme-visual/behavior';
mkdirSync(output, { recursive: true });
const server = spawn(process.execPath, ['scripts/start.mjs'], {
  env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port), AUTH_ORIGIN: base, AUTH_DB_PATH: ':memory:' },
  stdio: 'pipe',
});
let browser;
const report = [], errors = [];
const theme = (page) => page.locator('html').getAttribute('data-theme');
const waitTheme = (page, value) => page.waitForFunction(value => document.documentElement.dataset.theme === value, value);
const open = async (context) => {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.getByRole('heading', { name: 'حياك من جديد' }).waitFor();
  return page;
};
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/api/health')).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready);
  let options = { headless: true, ...(process.env.MIHWAR_BROWSER_PATH ? { executablePath: process.env.MIHWAR_BROWSER_PATH, args: ['--no-sandbox'] } : {}) };
  if (process.env.MIHWAR_CHROMIUM_MODULE) {
    const { default: c } = await import(process.env.MIHWAR_CHROMIUM_MODULE);
    options = { ...options, executablePath: await c.executablePath(), args: c.args.filter(arg => arg !== '--single-process') };
  }
  browser = await chromium.launch(options);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, colorScheme: 'light', reducedMotion: 'reduce' });
  const page = await open(context);
  assert.equal(await theme(page), 'dark', 'OS light must not override original night default');
  const day = page.getByRole('button', { name: 'تفعيل الوضع النهاري' });
  await day.focus();
  await page.keyboard.press('Enter');
  await waitTheme(page, 'light');
  assert.equal(await page.evaluate(() => localStorage.getItem('mihwar-theme')), 'light');
  assert.equal(await page.evaluate(() => document.activeElement?.className), 'theme-toggle');
  assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'), '#f5f1e8');
  await page.emulateMedia({ colorScheme: 'dark' });
  assert.equal(await theme(page), 'light', 'explicit choice survives system changes');
  await page.locator('#client-email').fill('theme-fixture@example.com');
  await page.getByRole('button', { name: 'تفعيل الوضع الليلي' }).click();
  await waitTheme(page, 'dark');
  assert.equal(await page.locator('#client-email').inputValue(), 'theme-fixture@example.com', 'toggle preserves form values');
  await page.getByRole('button', { name: 'تفعيل الوضع النهاري' }).click();
  await page.reload();
  await waitTheme(page, 'light');
  await page.getByRole('heading', { name: 'حياك من جديد' }).waitFor();
  const second = await open(context);
  assert.equal(await theme(second), 'light');
  await page.getByRole('button', { name: 'تفعيل الوضع الليلي' }).click();
  await waitTheme(second, 'dark');
  await page.getByRole('button', { name: 'تفعيل الوضع النهاري' }).click();
  await waitTheme(second, 'light');
  await second.close();
  await page.goto(base + '/#admin-login');
  await page.getByRole('heading', { name: 'دخول الإدارة' }).waitFor();
  assert.equal(await theme(page), 'light');
  await page.goBack();
  await page.getByRole('heading', { name: 'حياك من جديد' }).waitFor();
  assert.equal(await theme(page), 'light');
  report.push('Default dark, keyboard, form preservation, reload, cross-tab, system preference and Back navigation passed');

  // Text contrast from actual computed colors, including legacy day overrides.
  const colors = await page.evaluate(() => {
    const root = document.querySelector('.mahwar-experience');
    const s = getComputedStyle(root);
    return Object.fromEntries(['--text', '--muted', '--accent', '--canvas', '--surface', '--raised', '--tint', '--edge'].map(key => [key, s.getPropertyValue(key).trim()]));
  });
  const luminance = hex => {
    const c = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
  };
  const contrast = (a,b) => { const l = [luminance(a), luminance(b)].sort((a,b) => b-a); return (l[0]+.05)/(l[1]+.05); };
  for (const fg of ['--text', '--muted', '--accent']) {
    for (const bg of ['--canvas', '--surface', '--raised', '--tint']) {
      const ratio = contrast(colors[fg], colors[bg]);
      assert.ok(ratio >= 4.5, `${fg} on ${bg}: ${ratio}`);
      report.push({ fg, bg, contrast: +ratio.toFixed(2) });
    }
  }
  assert.ok(contrast(colors['--edge'], colors['--surface']) >= 3, 'input border 3:1');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width > 400 ? 1050 : 844 });
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    for (const palette of ['light', 'dark']) {
      if ((await theme(page)) !== palette) await page.locator('.theme-toggle').click();
      await waitTheme(page, palette);
      await page.screenshot({ path: path.join(output, `login-${palette}-${width}.png`), fullPage: true });
      const hit = await page.locator('.theme-toggle').boundingBox();
      assert.ok(hit.width >= 44 && hit.height >= 44);
    }
  }
  await context.close();
  const blocked = await browser.newContext();
  await blocked.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage blocked', 'SecurityError'); } }));
  const blockedPage = await open(blocked);
  assert.equal(await theme(blockedPage), 'dark');
  await blockedPage.locator('.theme-toggle').focus();
  await blockedPage.keyboard.press('Space');
  await waitTheme(blockedPage, 'light');
  await blockedPage.reload();
  await waitTheme(blockedPage, 'dark');
  await blocked.close();
  report.push('Blocked localStorage remains usable; no persistent choice when storage is unavailable');
  assert.deepEqual(errors, []);
  writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: true, checks: report.length, output }));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await once(server, 'exit').catch(() => {});
}
