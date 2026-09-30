// Local presentation-layer fixtures only; no production requests or data writes.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const shell = process.env.MIHWAR_CHROMIUM_MODULE ? (await import(process.env.MIHWAR_CHROMIUM_MODULE)).default : null;
let browser;
const options = shell
 ? { executablePath: await shell.executablePath(), args: shell.args.filter(arg => arg !== '--single-process') }
 : process.env.MIHWAR_BROWSER_PATH ? { executablePath: process.env.MIHWAR_BROWSER_PATH, args: ['--no-sandbox'] } : {};
const launch=()=>chromium.launch({headless:true,...options});
const out=process.env.MIHWAR_SCENE_ARTIFACTS || '/tmp/mihwar-theme-visual/scenes';
await mkdir(out,{recursive:true});
const port=Number(process.env.MIHWAR_SCENE_PORT || 3041);
const base=`http://localhost:${port}`;
const server=spawn(process.execPath,['scripts/start.mjs'],{env:{...process.env,NODE_ENV:'production',PORT:String(port),HOST:'127.0.0.1',AUTH_ORIGIN:base,AUTH_DB_PATH:':memory:'},stdio:'pipe'});
const closed=once(server,'exit');
const errors=[]; const report=[];
const user={id:'qa-only',name:'مستخدم الفحص',email:'qa@example.test',selectedRole:'renter',adminSession:false,permissions:{platformAdmin:false,manageRequests:false,reviewBrokers:false}};
try {
let ready=false;
for(let i=0;i<100;i++) {
 try { if((await fetch(base+'/api/health')).ok) {ready=true;break;} } catch {}
 await new Promise(resolve=>setTimeout(resolve,100));
}
assert.ok(ready,'scene verification server starts');
for(const [device,width,height] of [['desktop',1440,1000],['mobile',390,844]]) {
 browser=await launch();
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce'});
 await context.route('**/api/client/me',r=>r.fulfill({json:{user}}));
 await context.route('**/api/client/visit',r=>r.fulfill({json:{ok:true}}));
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+'/',{waitUntil:'networkidle'}); await p.locator('[data-wheel]').waitFor(); await p.evaluate(()=>document.fonts.ready);
 for(const theme of ['dark','light']) {
  if(await p.locator('html').getAttribute('data-theme')!==theme) await p.locator('.theme-toggle').click();
  await p.waitForTimeout(300);
  assert.equal(await p.locator('html').getAttribute('data-theme'),theme);
  const widthReport=await p.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.equal(widthReport.scroll,width,`${device} ${theme} wheel has no horizontal overflow`);
  await p.screenshot({path:`${out}/${device}-wheel-${theme}-closed.png`,fullPage:true});
  await p.getByRole('button',{name:'فتح المحور',exact:true}).click();
  await p.waitForTimeout(550);
  assert.equal(await p.locator('.mw-branch').count(),5);
  await p.screenshot({path:`${out}/${device}-wheel-${theme}-open.png`,fullPage:true});
  const before=await p.locator('[data-wheel]').getAttribute('data-wheel-state');
  await p.locator('.theme-toggle').click();await p.locator('.theme-toggle').click();
  assert.equal(await p.locator('[data-wheel]').getAttribute('data-wheel-state'),before,'theme leaves wheel state intact');
  await p.getByRole('button',{name:'إغلاق مركز المحور',exact:true}).click();await p.waitForTimeout(500);
  report.push({device,theme,wheel:'closed/open, five branches, repeated theme toggles preserve state, no overflow'});
 }
 await p.goto(base+'/#live-map',{waitUntil:'networkidle'});
 await p.locator('.lm[data-phase="ready"]').waitFor();
 for(const theme of ['light','dark']) {
  if(await p.locator('html').getAttribute('data-theme')!==theme) await p.locator('.theme-toggle').click();
  await p.waitForTimeout(300);
  const geometry=await p.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,phase:document.querySelector('.lm').dataset.phase,ink:getComputedStyle(document.querySelector('.lm')).color,map:getComputedStyle(document.querySelector('.lm-map')).backgroundColor,slider:getComputedStyle(document.querySelector('#lm-time-range')).backgroundColor}));
  assert.equal(geometry.scroll,width,`${device} ${theme} map has no overflow`);
  assert.equal(geometry.phase,'ready');
  await p.screenshot({path:`${out}/${device}-map-${theme}-ready.png`,fullPage:true});
  await p.getByRole('button',{name:'إغلاق تفاصيل المعاملة',exact:true}).click();assert.equal(await p.locator('.lm-dna').count(),0);
  await p.locator('.lm-reopen').click();assert.equal(await p.locator('.lm-dna').count(),1);
  await p.getByRole('button',{name:'OPERATIONS',exact:true}).click();
  await p.getByRole('button',{name:'غير مطابق',exact:true}).click();
  assert.equal(await p.locator('[data-node]').count(),1);assert.match(await p.locator('.lm-dna-status').textContent(),/لا توجد مطابقة/);
  await p.screenshot({path:`${out}/${device}-map-${theme}-unmatched.png`,fullPage:true});
  await p.getByRole('button',{name:'التنفيذ',exact:true}).click();assert.equal(await p.locator('[data-node="OP-19"]').count(),1);
  await p.getByRole('button',{name:'MARKET PULSE',exact:true}).click();await p.getByRole('button',{name:'إعادة تشغيل المحاكاة',exact:true}).click();
  report.push({device,theme,map:geometry,flows:'dismiss/reopen, unmatched and operation filters, replay'});
 }
 await browser.close();
}
assert.deepEqual(errors,[]);
await writeFile(`${out}/scenes-verification.json`,JSON.stringify({passed:true,report,errors,scope:'Local UI QA with intercepted auth and visit endpoints, no production data or writes'},null,2));
console.log(JSON.stringify({passed:true,report,errors},null,2));
}finally{await browser?.close();server.kill('SIGTERM');await closed;}
