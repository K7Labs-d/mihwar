// Integration/UI verification uses a disposable SQLite database and its own local server.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || 'playwright'
);
const port = Number(process.env.MIHWAR_TEST_PORT || 3038),
  base = 'http://localhost:' + port;
const folder = mkdtempSync(path.join(tmpdir(), 'mahwar-browser-')),
  database = path.join(folder, 'clients.sqlite');
const output =
  process.env.MIHWAR_BROWSER_ARTIFACTS ||
  path.join(tmpdir(), 'mihwar-phase1-visual');
mkdirSync(output, { recursive: true });
const server = spawn(process.execPath, ['scripts/start.mjs'], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: String(port),
    AUTH_ORIGIN: base,
    AUTH_DB_PATH: database,
  },
  stdio: 'pipe',
});
let browser;
const errors = [],
  report = [];
try {
  let ready = false;
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(base + '/api/health')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready, 'server starts');
  let options = { headless: true, ...(process.env.MIHWAR_BROWSER_PATH ? { executablePath: process.env.MIHWAR_BROWSER_PATH, args: ['--no-sandbox'] } : {}) };
  if (process.env.MIHWAR_CHROMIUM_MODULE) {
    const { default: c } = await import(process.env.MIHWAR_CHROMIUM_MODULE);
    options = {
      ...options,
      args: c.args.filter(a=>a !== '--single-process'),
      executablePath: await c.executablePath(),
    };
  }
  browser = await chromium.launch(options);
  // Run the same real flows in either palette without changing account behavior.
  async function setTestTheme(context) {
    if (process.env.MIHWAR_TEST_THEME === 'light') {
      await context.addInitScript(() => localStorage.setItem('mihwar-theme', 'light'));
    }
  }
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1120 },
    }),
    page = await context.newPage();
  await setTestTheme(context);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/#marketplace');
  await page.getByRole('heading', { name: 'حياك من جديد' }).waitFor();
  assert.equal(await page.locator('.product-navigation').count(), 0);
  assert.equal(
    (await context.request.get(base + '/api/client/marketplace')).status(),
    401,
  );
  await page.screenshot({
    path: path.join(output, 'login-desktop.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'إنشاء حساب جديد', exact: true })
    .click();
  await page.locator('#client-name').fill('حساب اختبار متصفح');
  await page.locator('#client-email').fill('browser@example.com');
  await page.locator('#client-password').fill('browser-test-password-123');
  await page.locator('#client-confirmation').fill('browser-test-password-123');
  await page.screenshot({
    path: path.join(output, 'register-desktop.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'إنشاء الحساب', exact: true }).click();
  await page.getByRole('heading', { name: 'كيف تبدأ مع محور؟' }).waitFor();
  await page.screenshot({
    path: path.join(output, 'roles-desktop.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'مستأجر ابحث عن معدة أو انشر احتياجك' })
    .click();
  await page
    .getByRole('heading', { name: 'لا توجد معدات معتمدة بهذه التصفية' })
    .waitFor();
  assert.equal(await page.locator('a[href="#admin"]').count(), 0);
  assert.equal(await page.locator('a[href="#admin-login"]').count(), 0);
  await page.goto(base + '/#client');
  await page.getByRole('button', { name: 'طلب تفعيل دور المؤجر' }).waitFor();
  await page.screenshot({
    path: path.join(output, 'account-desktop.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'طلب تفعيل دور المؤجر' }).click();
  await page.waitForURL('**/#broker-registration');
  assert.equal(
    (
      await context.request.post(base + '/api/client/offers', { data: {} })
    ).status(),
    403,
  );
  assert.equal(
    (
      await context.request.post(base + '/api/client/equipment', { data: {} })
    ).status(),
    403,
  );
  const me = (await (await context.request.get(base + '/api/client/me')).json())
    .user;
  const db = new DatabaseSync(database);
  db.prepare(
    'UPDATE client_users SET is_platform_admin=1,can_review_brokers=1,can_manage_requests=1 WHERE id=?',
  ).run(me.id);
  db.close();
  await page.goto(base + '/#admin-login');
  await page.locator('#client-email').fill('browser@example.com');
  await page.locator('#client-password').fill('browser-test-password-123');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await page.getByRole('heading', { name: 'لوحة خالد — إدارة محور' }).waitFor();
  await page.getByText('لا توجد سجلات في هذه الفترة').first().waitFor();
  await page.screenshot({
    path: path.join(output, 'admin-desktop.png'),
    fullPage: true,
  });
  // New browser context with an ordinary lessor: all data stays inside this fixture.
  const lessor = await browser.newContext();
  await setTestTheme(lessor);
  const lessorPage = await lessor.newPage();
  lessorPage.on('pageerror', (e) => errors.push(e.message));
  await lessorPage.goto(base + '/#client');
  await lessorPage.getByRole('heading', {name:'حياك من جديد'}).waitFor();
  await lessorPage
    .getByRole('button', { name: 'إنشاء حساب جديد', exact: true })
    .click();
  await lessorPage.locator('#client-name').fill('مؤجر اختبار متصفح');
  await lessorPage.locator('#client-email').fill('lessor-browser@example.com');
  await lessorPage
    .locator('#client-password')
    .fill('browser-test-password-123');
  await lessorPage
    .locator('#client-confirmation')
    .fill('browser-test-password-123');
  await lessorPage
    .getByRole('button', { name: 'إنشاء الحساب', exact: true })
    .click();
  await lessorPage
    .getByRole('button', { name: 'مؤجر أكمل طلب الاعتماد قبل نشر المعدات' })
    .click();
  await lessorPage
    .getByRole('heading', { name: 'ابدأ بتعريفنا على نشاطك' })
    .waitFor();
  await lessor.request.post(base + '/api/client/broker-requests', {
    data: {
      entity: 'individual',
      name: 'مؤجر اختبار متصفح',
      identity: '1234567890',
      commercial: '',
      phone: '0501234567',
      email: 'lessor-browser@example.com',
      address: '',
      domains: 'معدات',
      regions: 'الرياض',
    },
  });
  await page.goto(base + '/#admin-lessors');
  await page
    .getByRole('button')
    .filter({ hasText: 'مؤجر اختبار متصفح' })
    .click();
  await page
    .getByRole('button', { name: 'اعتماد الطلب', exact: true })
    .waitFor();
  await page.screenshot({
    path: path.join(output, 'lessor-review-desktop.png'),
    fullPage: true,
  });
  await page.locator('#rejection-reason').fill('أكمل بيانات الجهة');
  await page.getByRole('button', { name: 'رفض الطلب', exact: true }).click();
  await page.getByText('تم رفض الطلب وحفظ السبب والقرار.').waitFor();
  const correction = await lessor.request.post(
    base + '/api/client/broker-requests',
    {
      data: {
        entity: 'individual',
        name: 'مؤجر اختبار متصفح',
        identity: '1234567890',
        commercial: '',
        phone: '0501234567',
        email: 'lessor-browser@example.com',
        address: '',
        domains: 'معدات',
        regions: 'الرياض',
      },
    },
  );
  assert.equal(correction.status(), 201);
  await page
    .getByRole('button', { name: 'العودة إلى قائمة الطلبات', exact: true })
    .click();
  await page
    .getByRole('button')
    .filter({ hasText: 'مؤجر اختبار متصفح' })
    .click();
  await page.getByRole('button', { name: 'اعتماد الطلب', exact: true }).click();
  await page.getByText('تم اعتماد الطلب وحفظ القرار.').waitFor();
  const asset = await lessor.request.post(base + '/api/client/equipment', {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    data: {
      name: 'معدة متصفح معزولة',
      category: 'excavator',
      description: 'مواصفات اختبار محفوظة في قاعدة مؤقتة',
      location: 'الرياض',
      hourlyRateHalalas: 10000,
      dailyRateHalalas: null,
      operatorMode: 'without_operator',
      availability: 'available',
      status: 'active',
    },
  });
  assert.equal(asset.status(), 201);
  await page.goto(base + '/#admin-equipment');
  await page.getByRole('button', { name: 'تفاصيل', exact: true }).click();
  await page
    .getByRole('button', { name: 'اعتماد المعدة', exact: true })
    .click();
  await page.getByText('تم حفظ القرار في السجل الإداري.').waitFor();
  assert.equal(
    (await (await lessor.request.get(base + '/api/client/marketplace')).json())
      .equipment.length,
    1,
  );
  for (const [width, height] of [
    [1440, 1120],
    [390, 844],
    [320, 740],
  ]) {
    await page.setViewportSize({ width, height });
    for (const screen of [
      'admin',
      'admin-equipment',
      'admin-users',
      'admin-audit',
      'client',
      'marketplace',
      'broker-registration',
      'broker-management',
      'equipment',
      'request',
    ]) {
      await page.goto(base + '/#' + screen);
      await page.locator('.figma-content').last().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(200);
      const geometry = await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        font: getComputedStyle(document.body).fontFamily,
        theme: document.documentElement.dataset.theme,
      }));
      assert.equal(geometry.theme, process.env.MIHWAR_TEST_THEME === 'light' ? 'light' : 'dark');
      assert.equal(
        geometry.scrollWidth,
        width,
        screen + ' horizontal overflow',
      );
      await page.screenshot({
        path: path.join(output, screen + '-' + width + '.png'),
        fullPage: true,
      });
      report.push({ screen, width, geometry });
    }
  }
  await page.goto(base + '/#client');
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await page.getByRole('heading', { name: 'حياك من جديد' }).waitFor();
  await page.goto(base + '/#equipment');
  await page.getByRole('heading', { name: 'حياك من جديد' }).waitFor();
  assert.equal(
    (await context.request.get(base + '/api/client/admin/overview')).status(),
    401,
  );
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.screenshot({
      path: path.join(output, 'login-' + width + '.png'),
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      width,
    );
  }
  // Existing delegated administrators retain their permitted workspaces without owner access.
  for (const [permission, landing, heading] of [
    ['can_manage_requests', 'admin-requests', 'صندوق الطلبات'],
    ['can_review_brokers', 'admin-lessors', 'راجع الجهة قبل منح أهلية التأجير'],
  ]) {
    const delegated = await browser.newContext();
    await setTestTheme(delegated);
    const delegatedPage = await delegated.newPage();
    delegatedPage.on('pageerror', (e) => errors.push(e.message));
    const email = permission + '@example.com';
    const registered = await delegated.request.post(base + '/api/client/register', {
      data: {name: 'مفوض اختبار', email, password: 'browser-test-password-123'},
    });
    assert.equal(registered.status(), 201);
    const delegateId = (await registered.json()).user.id;
    const delegateDb = new DatabaseSync(database);
    delegateDb.prepare('UPDATE client_users SET ' + permission + '=1 WHERE id=?').run(delegateId);
    delegateDb.close();
    await delegatedPage.goto(base + '/#admin-login');
    await delegatedPage.locator('#client-email').fill(email);
    await delegatedPage.locator('#client-password').fill('browser-test-password-123');
    await delegatedPage.getByRole('button', {name: 'تسجيل الدخول', exact: true}).click();
    await delegatedPage.waitForURL('**/#' + landing);
    await delegatedPage.getByRole('heading', {name: heading, exact: true}).waitFor();
    assert.equal(await delegatedPage.locator('.admin-sidebar a[href="#admin-users"]').count(), 0);
    assert.equal((await delegated.request.get(base + '/api/client/admin/users')).status(), 403);
    await delegatedPage.goto(base + '/#admin');
    await delegatedPage.getByRole('heading', {name: 'غير مصرح', exact: true}).waitFor();
    await delegatedPage.goBack();
    await delegatedPage.getByRole('heading', {name: heading, exact: true}).waitFor();
    await delegated.close();
    report.push('Delegated ' + permission + ': correct landing, scoped sidebar, owner denial and browser Back passed.');
  }
  assert.deepEqual(errors, []);
  report.push(
    'UI registration, renter choice, lessor activation, blocked publishing/offers, separate admin login, rejection/correction/approval, equipment review, audit, logout/deep-link gate and no public admin links passed.',
  );
  writeFileSync(
    path.join(output, 'report.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify({ passed: true, checks: report.length, output }));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await once(server, 'exit').catch(() => {});
  assert.ok(folder.startsWith('/tmp/mahwar-browser-'));
  rmSync(folder, { recursive: true, force: true });
}
