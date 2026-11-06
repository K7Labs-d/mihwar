// Shared node helpers: static server, browser pages, process helpers.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Playwright is installed globally in the sandbox, so resolve it through require (NODE_PATH), not ESM.
const { chromium } = createRequire(import.meta.url)('playwright');

export const ENGINE = path.dirname(fileURLToPath(import.meta.url));
export const SKILL = path.dirname(ENGINE);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json' };

export async function loadConfig(prodDir) {
  const mod = await import(path.join(path.resolve(prodDir), 'production.js'));
  return mod.config;
}

// Three mounts only: /engine, /brand, /prod. Nothing else on disk is reachable.
export function serve(prodDir, brand) {
  const mounts = { '/engine/': ENGINE, '/brand/': path.join(SKILL, 'brands', brand), '/prod/': path.resolve(prodDir) };
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (url === '/' || url === '/stage') return send(res, path.join(ENGINE, 'stage.html'));
    for (const [prefix, dir] of Object.entries(mounts)) {
      if (!url.startsWith(prefix)) continue;
      const file = path.resolve(dir, url.slice(prefix.length));
      if (!file.startsWith(dir + path.sep)) break;
      return send(res, file);
    }
    res.writeHead(404); res.end();
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port })));
}

function send(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  });
}

// One browser per page: pages in one browser share a single compositor (GPU) process, which
// becomes the bottleneck. Separate browsers render in parallel.
export async function openPages({ port, format, count = 1 }) {
  const [width, height] = format.split('x').map(Number);
  const browsers = [];
  const pages = await Promise.all(Array.from({ length: count }, async () => {
    const browser = await chromium.launch({ args: ['--disable-lcd-text', '--font-render-hinting=none', '--force-color-profile=srgb', '--disable-gpu-vsync'] });
    browsers.push(browser);
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`http://127.0.0.1:${port}/stage?format=${format}`);
    try {
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
    } catch (e) {
      throw new Error(`stage failed to build:\n${errors.join('\n') || e}`);
    }
    if (errors.length) throw new Error(`stage errors:\n${errors.join('\n')}`);
    const cdp = await ctx.newCDPSession(page);
    return { page, cdp };
  }));
  const browser = { close: () => Promise.all(browsers.map(b => b.close())) };
  return { browser, pages, width, height };
}

export async function capture({ page, cdp }, t) {
  await page.evaluate(x => window.__S.seek(x), t);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, captureBeyondViewport: false });
  return Buffer.from(data, 'base64');
}

export function run(cmd, args, { input = null, quiet = true } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; if (!quiet) process.stderr.write(d); });
    p.on('close', code => (code === 0 ? resolve({ out, err }) : reject(new Error(`${cmd} exited ${code}\n${err.slice(-2000)}`))));
    if (input) { p.stdin.end(input); }
  });
}

export function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; o[k] = v; }
    else o._.push(a);
  }
  return o;
}

export function outDir(prodDir, format, ...rest) {
  const d = path.join(path.resolve(prodDir), 'out', format, ...rest);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
