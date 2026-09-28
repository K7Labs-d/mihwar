import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
// Playwright stays outside application dependencies; see docs/LIVE_MAP_EXPERIENCE.md.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.LIVE_MAP_URL || 'http://localhost:3012/';
const output = process.env.LIVE_MAP_ARTIFACTS || path.join(tmpdir(), 'mihwar-live-map-browser');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
const report = [], errors = [], writes = [];
function listen(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/') && request.method() !== 'GET') writes.push(request.url()); });
}
async function seek(page, time) {
  await page.locator('#lm-time-range').evaluate((element, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, String(value));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, time);
  await page.waitForTimeout(100);
}
const phase = page => page.locator('.lm').getAttribute('data-phase');
const count = (page, selector) => page.locator(selector).count();
async function ready(page) { await page.locator('.lm[data-phase="ready"]').waitFor({ timeout: 15000 }); }
async function snapshot(page, name) { await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true }); }
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  listen(page); await page.goto(base + '#live-map', { waitUntil: 'networkidle' });
  for (const [time, expected, candidates, lines, sheet] of [
    [0,'request',0,0,0], [1000,'search',0,0,0], [2000,'candidates',1,0,0],
    [2700,'candidates',2,0,0], [3400,'candidates',3,0,0], [4000,'connections',3,1,0],
    [4700,'connections',3,3,0], [5500,'connections',3,3,0], [5700,'ready',3,3,1],
  ]) {
    await seek(page, time);
    assert.equal(await phase(page), expected, `phase at ${time}`);
    assert.equal(await count(page,'.lm-node--matched'), candidates, `candidate count at ${time}`);
    assert.equal(await count(page,'[data-connection]'), lines, `line count at ${time}`);
    assert.equal(await count(page,'[data-dna]'), sheet, `DNA visibility at ${time}`);
    if ([1000,2700,4700].includes(time)) await snapshot(page, 'mobile-stage-' + time);
  }
  await seek(page,1000); assert.equal(await count(page,'[data-dna]'),0); assert.equal(await count(page,'[data-connection]'),0);
  await page.getByRole('button',{name:'تشغيل المحاكاة',exact:true}).click(); await page.waitForTimeout(250);
  await page.getByRole('button',{name:'إيقاف المحاكاة مؤقتًا',exact:true}).click();
  const paused = await page.locator('#lm-time-range').inputValue(); await page.waitForTimeout(350);
  assert.equal(await page.locator('#lm-time-range').inputValue(), paused, 'pause freezes scene');
  await page.getByRole('button',{name:'إعادة تشغيل المحاكاة',exact:true}).click();
  assert.equal(await count(page,'[data-dna]'),0,'replay closes DNA'); await ready(page);
  report.push('Playback, pause, replay, deterministic rewind, sequential reveal, lines before DNA');
  await page.getByRole('button',{name:'توسيع تفاصيل المعاملة',exact:true}).focus(); await page.keyboard.press('ArrowUp');
  assert.equal(await page.locator('.lm-dna-details').isVisible(),true,'keyboard expands sheet');
  await page.keyboard.press('ArrowDown'); assert.equal(await page.locator('.lm-dna-details').isVisible(),false);
  const handle=page.getByRole('button',{name:'توسيع تفاصيل المعاملة',exact:true});
  const h=await handle.boundingBox(); await page.mouse.move(h.x+h.width/2,h.y+h.height/2); await page.mouse.down();
  await page.mouse.move(h.x+h.width/2,h.y-70,{steps:5}); await page.mouse.up();
  assert.equal(await page.locator('.lm-dna-details').isVisible(),true,'pointer drag expands sheet');
  await snapshot(page,'mobile-expanded'); await page.keyboard.press('Escape');
  assert.equal(await count(page,'[data-dna]'),0); assert.equal(await page.locator(':focus').getAttribute('data-node'),'REQ-8F21');
  await page.locator('[data-node="EQ-104"]').click();
  assert.match(await page.locator('.lm-dna-id').textContent(), /EQ-104/);
  await page.getByRole('button',{name:'إغلاق تفاصيل المعاملة',exact:true}).click();
  await page.locator('[data-node="REQ-2A10"]').click(); await seek(page,6000);
  assert.equal(await count(page,'[data-connection]'),0); assert.match(await page.locator('.lm-dna-status').textContent(),/لا توجد مطابقة/);
  await page.getByRole('button',{name:'OPERATIONS',exact:true}).click();
  await page.getByRole('button',{name:'غير مطابق',exact:true}).click(); await seek(page,6000);
  assert.equal(await count(page,'[data-node]'),1); assert.equal(await page.locator('[data-node]').getAttribute('data-node'),'REQ-2A10');
  await page.getByRole('button',{name:'التنفيذ',exact:true}).click();
  assert.equal(await count(page,'[data-node]'),1); assert.equal(await page.locator('[data-node]').getAttribute('data-node'),'OP-19');
  assert.match(await page.locator('.lm-dna-path').textContent(),/BOOKING/); assert.doesNotMatch(await page.locator('.lm-dna-path').textContent(),/REQUEST/);
  await snapshot(page,'mobile-operations');
  await page.getByRole('button',{name:'MARKET PULSE',exact:true}).click();
  assert.equal(await count(page,'[data-node="OP-19"]'),0);
  await page.getByRole('button',{name:'إعادة تشغيل المحاكاة',exact:true}).click(); await seek(page,6000);
  await page.getByRole('button',{name:'المعدات',exact:true}).click(); assert.equal(await count(page,'[data-connection]'),0);
  await page.getByRole('button',{name:'الكل',exact:true}).click(); assert.equal(await count(page,'[data-connection]'),3);
  report.push('Sheet gesture and keyboard controls, Escape/focus restoration, selection, filters, unmatched and operations states');
  await page.close();
  for (const [name,width,height] of [['mobile',390,844],['small-mobile',320,740],['tablet',920,1000],['desktop',1440,1000]]) {
    const view=await browser.newPage({viewport:{width,height},deviceScaleFactor:1}); listen(view);
    await view.goto(base+'#live-map',{waitUntil:'networkidle'}); await seek(view,6000);
    await view.waitForTimeout(500); await view.evaluate(()=>window.scrollTo(0,0));
    const geometry=await view.evaluate(()=>{
      const sheet=document.querySelector('.lm-dna').getBoundingClientRect();
      const blocked=[...document.querySelectorAll('[data-node]')].filter(e=>{const r=e.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;return x>=sheet.left&&x<=sheet.right&&y>=sheet.top&&y<=sheet.bottom;}).map(e=>e.getAttribute('data-node'));
      return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,blocked,iconMax:Math.max(...[...document.querySelectorAll('.lm-icon')].map(e=>e.getBoundingClientRect().width)),timeBottom:document.querySelector('.lm-time').getBoundingClientRect().bottom};
    });
    assert.equal(geometry.scrollWidth,width,`${name}: no horizontal overflow`);
    assert.deepEqual(geometry.blocked,[],`${name}: compact DNA does not block signal centers`);
    assert.ok(geometry.iconMax<=16,`${name}: icons remain small`);
    if(name==='mobile') assert.ok(geometry.timeBottom<=height, 'mobile time controls fit first viewport');
    await snapshot(view,name+'-ready'); report.push({name,geometry});
    await view.goto(base+'#request',{waitUntil:'domcontentloaded'});
    await view.locator('.mahwar-experience--live-map').waitFor({state:'detached'});
    await view.close();
  }
  const reduced=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}); listen(reduced);
  await reduced.goto(base+'#live-map',{waitUntil:'networkidle'}); await ready(reduced);
  assert.equal(await reduced.locator('.lm').getAttribute('data-playing'),'false');
  assert.equal(await reduced.locator('.lm-node-visual').first().evaluate(e=>getComputedStyle(e).animationName),'none');
  await seek(reduced,1000); await reduced.waitForTimeout(200); assert.equal(await phase(reduced),'search');
  await reduced.getByRole('button',{name:'إعادة تشغيل المحاكاة',exact:true}).click(); await ready(reduced);
  await reduced.close(); report.push('Reduced motion: no autoplay or CSS animation; manual timeline supported');
  assert.deepEqual(errors,[],'No browser runtime errors'); assert.deepEqual(writes,[],'No production/API writes');
  await writeFile(path.join(output,'verification.json'),JSON.stringify({passed:true,browser:'Chromium / Chrome',report,errors,writes},null,2));
  console.log(JSON.stringify({passed:true,report,output},null,2));
} finally { await browser.close(); }
