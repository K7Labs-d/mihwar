// Uses a disposable in-memory database. No production accounts or requests are created.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = 'http://localhost:' + (process.env.MIHWAR_HUB_TEST_PORT || '3071');
const output = process.env.MIHWAR_HUB_ARTIFACTS || path.join(tmpdir(), 'mihwar-hub-visual');
mkdirSync(output, { recursive: true });
const server = spawn(process.execPath, ['scripts/start.mjs'], {
  env: { ...process.env, PORT: new URL(base).port, HOST: '127.0.0.1', AUTH_ORIGIN: base, AUTH_DB_PATH: ':memory:' },
  stdio: 'pipe',
});
let browser;
const errors = [], report = [];
try {
  let ready = false;
  for (let n = 0; n < 100; n++) {
    try { ready = (await fetch(base + '/api/health')).ok; } catch {}
    if (ready) break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(ready, 'Fixture server starts');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  assert.equal((await context.request.post(base + '/api/client/register', { data: { name: 'اختبار واجهة محور', email: 'hub-browser@example.com', password: 'hub-browser-password-123' } })).status(), 201);
  assert.equal((await context.request.post(base + '/api/client/role', { data: { role: 'renter' } })).status(), 200);
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  page.on('pageerror', e => errors.push(e.message));
  const center = () => page.locator('[data-wheel] .mahwar-core > button');
  const home = async () => { await page.goto(base + '/'); await center().waitFor(); await page.evaluate(() => document.fonts.ready); };
  const expanded = async expected => {
    await page.waitForFunction(value => document.querySelector('[data-wheel] .mahwar-core > button')?.getAttribute('aria-expanded') === String(value), expected);
    await page.waitForTimeout(350);
    assert.equal(await center().getAttribute('aria-expanded'), String(expected));
  };
  const tapPoint = async () => {
    await center().scrollIntoViewIfNeeded();
    const box = await center().boundingBox();
    return () => page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  };
  await home();
  let tap = await tapPoint();
  await tap();
  await page.waitForTimeout(90);
  await tap();
  await expanded(false);
  assert.equal(await page.getByRole('group', { name: 'أقسام المحور' }).count(), 0);
  report.push('A rapid second touch cancels opening instead of being ignored.');
  await tap();
  await expanded(true);
  await tap();
  await page.waitForTimeout(90);
  await tap();
  await expanded(true);
  report.push('The hub reopens during closing without a stale close timer.');
  await tap();
  await expanded(false);
  for (let n = 0; n < 8; n++) { await tap(); await page.waitForTimeout(90); }
  await expanded(false);
  assert.equal(new URL(page.url()).hash, '');
  report.push('Repeated touches retain the expected toggle state and do not hit an invisible branch.');
  await center().dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', button: 0, isPrimary: true });
  await center().dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'touch', button: 0, isPrimary: true });
  await expanded(false);
  await center().dispatchEvent('pointerdown', { pointerId: 2, pointerType: 'mouse', button: 2, isPrimary: true });
  await expanded(false);
  report.push('Cancelled gestures and secondary mouse buttons do not leave the hub pressed.');

  const capture = async name => {
    await page.evaluate(() => document.fonts.ready);
    for (const [width, height] of [[320, 740], [390, 844], [432, 640], [1440, 1100]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, name + ' overflow');
      if (name === 'home-open') {
        const geometry = await page.locator('[data-wheel]').evaluate(el => {
          const rect = el.querySelector('.mahwar-core > button').getBoundingClientRect();
          const nodes = [...el.querySelectorAll('[role="group"] > button')].map(button => {
            const box = button.getBoundingClientRect();
            return { width: box.width, height: box.height, x: box.x, right: box.right,
              gap: Math.hypot(box.x + box.width / 2 - rect.x - rect.width / 2,
                box.y + box.height / 2 - rect.y - rect.height / 2) - (rect.width + box.width) / 2 };
          });
          return { coreWidth: rect.width, nodes };
        });
        assert.ok(geometry.coreWidth >= 130, 'The hub stays readable on small screens');
        assert.equal(geometry.nodes.length, 5);
        for (const node of geometry.nodes) {
          assert.ok(node.width >= 44 && node.height >= 44, 'Branch touch target');
          assert.ok(node.x >= 0 && node.right <= width, 'Branch remains inside the viewport: '+JSON.stringify({width,geometry}));
          assert.ok(node.gap >= -2, 'Branch touch targets do not overlap the center');
        }
      }
      await page.screenshot({ path: path.join(output, name + '-' + width + '.png'), fullPage: true });
      report.push({ screen: name, width, horizontalOverflow: false });
    }
  };
  await capture('home-closed');
  await center().click();
  await expanded(true);
  await capture('home-open');
  for (const [label, route] of [['الطلب', 'request'], ['المؤجر', 'broker'], ['العرض', 'offer'], ['التنفيذ', 'execution'], ['العميل', 'client']]) {
    await home();
    await center().click();
    await expanded(true);
    await page.getByRole('group', { name: 'أقسام المحور' }).getByRole('button', { name: label, exact: true }).click();
    await page.waitForURL('**/#' + route);
    report.push('Branch navigation: ' + label);
    if (route === 'offer') {
      await center().focus();
      await center().press('Escape');
      await page.waitForFunction(() => !window.location.hash || window.location.hash === '#');
      await expanded(false);
      assert.equal(await center().evaluate(el => el === document.activeElement), true);
      report.push('Closing a branch returns to the home hub and restores keyboard focus.');
    }
  }
  await home();
  await center().focus();
  await center().press('Enter');
  await expanded(true);
  await center().press('Escape');
  await expanded(false);
  assert.equal(await center().evaluate(el => el === document.activeElement), true);
  await center().press('Space');
  await expanded(true);
  await page.getByRole('button', { name: 'إغلاق المحور', exact: true }).press('Enter');
  await expanded(false);
  assert.equal(await center().evaluate(el => el === document.activeElement), true);
  await page.getByRole('button', { name: 'فتح أقسام محور', exact: true }).press('Enter');
  await expanded(true);
  report.push('Enter, Space, Escape and the secondary open/close controls work with keyboard focus.');
  const reduced = await browser.newContext({ storageState: await context.storageState(), reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  const reducedPage = await reduced.newPage();
  await reducedPage.goto(base + '/');
  await reducedPage.getByRole('button', { name: 'فتح المحور', exact: true }).click();
  await reducedPage.getByRole('group', { name: 'أقسام المحور' }).waitFor();
  await reducedPage.getByRole('button', { name: 'إغلاق مركز المحور', exact: true }).click();
  await reducedPage.getByRole('button', { name: 'فتح المحور', exact: true }).waitFor();
  await reduced.close();
  report.push('Opening and closing also work with reduced motion.');

  await page.goto(base + '/#marketplace');
  await page.getByRole('heading', { name: 'لا توجد معدات معتمدة بهذه التصفية' }).waitFor();
  await capture('marketplace-empty');
  await page.getByLabel('البحث في المعدات', { exact: true }).fill('حفار');
  await page.getByLabel('الموقع', { exact: true }).fill('الرياض');
  const filtered = page.waitForRequest(r => r.url().includes('/api/client/marketplace?') && new URL(r.url()).searchParams.get('q') === 'حفار');
  await page.getByRole('button', { name: 'تطبيق التصفية', exact: true }).click();
  assert.equal(new URL((await filtered).url()).searchParams.get('location'), 'الرياض');
  // An isolated UI fixture exercises the unchanged equipment-detail response shape.
  await page.route('**/api/client/marketplace?*', route => route.fulfill({
    json: { equipment: [{
      id: 'visual-fixture', name: 'معدة اختبار الواجهة',
      description: 'وصف طويل لاختبار التفاف المواصفات داخل البطاقة وتفاصيل المعدة.',
      location: 'الرياض', operator_mode: 'with_operator', availability: 'available',
      hourly_rate_halalas: 25000, daily_rate_halalas: 200000,
    }] },
  }));
  await page.getByRole('button', { name: 'مسح التصفية', exact: true }).click();
  await page.getByRole('heading', { name: 'معدة اختبار الواجهة', exact: true }).waitFor();
  await capture('marketplace-results');
  await page.getByRole('button', { name: 'تفاصيل المعدة', exact: true }).click();
  await page.getByRole('heading', { name: 'كل ما تحتاجه قبل الاختيار', exact: true }).waitFor();
  await capture('equipment-details');
  await page.getByRole('button', { name: 'العودة إلى السوق', exact: true }).click();
  await page.unroute('**/api/client/marketplace?*');
  report.push('Market filters, reset, equipment cards and details retain their existing behavior.');

  await page.goto(base + '/#request');
  await page.getByRole('button', { name: 'إنشاء أول طلب', exact: true }).waitFor();
  await capture('requests-empty');
  await page.getByRole('button', { name: 'إنشاء أول طلب', exact: true }).click();
  await page.locator('.request-form button[type="submit"]').click();
  await page.locator('#request-title[aria-invalid="true"]').waitFor();
  await capture('request-form');
  await page.locator('#request-title').fill('طلب معدات لاختبار التنسيق');
  await page.locator('#request-description').fill('تفاصيل احتياج تجريبي محفوظ في قاعدة مؤقتة لفحص واجهة الطلب والمحادثة.');
  await page.locator('#request-location').fill('الرياض');
  await page.locator('#request-quantity').fill('2');
  await page.locator('.request-form button[type="submit"]').click();
  await page.locator('.request-details').waitFor();
  await page.getByLabel('رسالتك إلى الإدارة', { exact: true }).waitFor();
  await capture('request-details');
  report.push('Request validation, real fixture submission, details and the existing conversation UI work.');
  await page.goto(base + '/#offer');
  await page.getByRole('heading', { name: 'لا توجد بيانات عروض متاحة للعرض بعد', exact: true }).waitFor();
  await capture('offers');
  await page.locator('.section-overview nav').getByRole('link', { name: 'مقارنة العروض', exact: true }).click();
  await page.getByRole('heading', { name: 'مقارنة العروض غير متاحة بعد', exact: true }).waitFor();
  await capture('offer-comparison');
  assert.deepEqual(errors, []);
  writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: true, report }, null, 2));
  console.log(JSON.stringify({ passed: true, checks: report.length, output }));
} finally {
  await browser?.close();
  if (server.exitCode === null) server.kill('SIGTERM');
  await once(server, 'exit').catch(() => {});
}
