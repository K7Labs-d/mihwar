// QA pass 1 (before any pixel is rendered): structure lint + DOM geometry on EVERY frame.
//   node probe.mjs <prod> [--format WxH]
// Writes out/<fmt>/manifest.json (cues with resolved pan, read by the audio mixer) and
// out/<fmt>/qa/pass1.json. Exit code 1 on any FAIL.
import fs from 'node:fs';
import path from 'node:path';
import { serve, openPages, args, loadConfig, outDir, SKILL } from './lib.mjs';

const a = args(process.argv.slice(2));
const prod = path.resolve(a._[0]);
const cfg = await loadConfig(prod);
const format = a.format || cfg.formats[0];
const [W, H] = format.split('x').map(Number);
const out = outDir(prod, format);
const qa = outDir(prod, format, 'qa');
const brand = JSON.parse(fs.readFileSync(path.join(SKILL, 'brands', cfg.brand, 'brand.json'), 'utf8'));

// Safe areas. 16:9: EBU R 95 graphics-safe (5% each side). 9:16: social UI overlays.
const SAFE = W >= H
  ? { l: W * 0.05, r: W * 0.95, t: H * 0.05, b: H * 0.95, name: 'EBU R 95 graphics-safe 90%' }
  : { l: W * 0.06, r: W * 0.94, t: H * 0.14, b: H * 0.80, name: 'social 9:16 (top 14%, bottom 20%, sides 6%)' };
const MIN_TEXT_PX = Math.round(H * 0.03 * (W >= H ? 1 : 0.6));  // ~32 px on a 1080p master
const readSeconds = words => 0.5 + 0.3 * words;               // eye-find 0.5 s + 200 wpm
const SAMPLE_SPACING_PX = 6;  // motion-blur sub-frames closer than this blend into a smear; wider gaps strobe

const issues = [];
const add = (level, rule, msg, extra = {}) => issues.push({ level, rule, msg, ...extra });

const { server, port } = await serve(prod, cfg.brand);
const { browser, pages } = await openPages({ port, format, count: 1 });
const { page } = pages[0];
try {
  const man = await page.evaluate(() => window.__S.manifest());
  const fps = cfg.fps, frame = 1 / fps, total = Math.round(man.duration * fps);

  // ---------- timing ----------
  if (Math.abs(man.fpb - Math.round(man.fpb)) > 1e-9) add('FAIL', 'integer-frames-per-beat', `${cfg.bpm} BPM at ${fps} fps = ${man.fpb.toFixed(3)} frames per beat; pick a BPM where 60*fps/BPM is an integer`);
  const shots = [...man.shots].sort((x, y) => x.at - y.at);
  let cursor = 0;
  for (const s of shots) {
    if (!Number.isInteger(s.at) || !Number.isInteger(s.beats)) add('FAIL', 'cut-on-beat', `${s.id}: cuts must be on whole beats (at ${s.at}, ${s.beats} beats)`);
    if (s.at !== cursor) add('FAIL', 'contiguous-shots', `${s.id} starts at beat ${s.at}, previous shot ended at ${cursor}`);
    if (s.beats < 2) add('FAIL', 'min-shot-length', `${s.id}: ${s.beats} beat(s); a shot needs at least 2 beats`);
    cursor = s.at + s.beats;
  }
  if (cursor !== cfg.beats) add('FAIL', 'contiguous-shots', `shots end at beat ${cursor}, film is ${cfg.beats} beats`);

  // ---------- motion and sound ----------
  const cueById = Object.fromEntries(man.cues.map(c => [c.id, c]));
  for (const m of man.motions) {
    if (m.kind === 'camera') continue;
    const hasSound = (m.cues || []).length > 0;
    if (m.kind === 'cut') continue; // checked against music onsets by the mixer
    if (!hasSound && !m.silent) add('FAIL', 'sound-for-every-motion', `${m.label} (${m.shot}) has no sound and no reason`);
    if (!hasSound && m.silent && /^(enter|exit)$/.test(m.kind) && /"/.test(m.label)) add('FAIL', 'sound-for-every-motion', `text motion cannot be silent: ${m.label}`);
    for (const id of m.cues || []) {
      const c = cueById[id];
      if (c.t < m.t0 - 0.25 || c.t > m.t1 + 0.25) add('WARN', 'cue-near-motion', `${m.label}: cue ${c.name} at ${c.t.toFixed(3)}s is far from its motion (${m.t0.toFixed(3)}-${m.t1.toFixed(3)})`);
    }
    if (m.kind === 'enter') {
      const beat = m.tSync / man.spb;
      if (Math.abs(beat * 4 - Math.round(beat * 4)) * man.spb / 4 > frame / 2) add('WARN', 'land-on-grid', `${m.label} lands at beat ${beat.toFixed(3)}, off the 16th-note grid`);
    }
  }
  // Cut on action: something must be moving into or across every cut.
  for (const s of shots) {
    const live = man.motions.filter(m => m.shot === s.id && m.kind !== 'camera' && m.kind !== 'cut' && m.t0 <= s.t0 + frame && m.t1 >= s.t0);
    if (!live.length) add('FAIL', 'cut-on-action', `${s.id}: nothing is moving on the cut frame`);
  }
  // Every shot keeps a camera move so no frame is dead.
  for (const s of shots) if (!man.motions.some(m => m.kind === 'camera' && m.shot === s.id)) add('FAIL', 'never-static', `${s.id} has no camera move`);

  // ---------- text: 3D, Arabic, copy, reading time ----------
  const story = fs.existsSync(path.join(prod, 'story.md')) ? fs.readFileSync(path.join(prod, 'story.md'), 'utf8') : '';
  const norm = x => x.replace(/\s+/g, ' ').trim();
  for (const tx of man.texts) {
    const shot = shots.find(s => s.id === tx.shot);
    if (!tx.enter) add('FAIL', 'text-moves-in-3d', `"${tx.text}" (${tx.shot}) has no entrance`);
    if (tx.arabic && tx.split === 'chars') add('FAIL', 'arabic-by-word', `"${tx.text}" is split by letters`);
    if (tx.arabic && tx.letterSpacing !== 'normal' && parseFloat(tx.letterSpacing) !== 0) add('FAIL', 'arabic-no-tracking', `"${tx.text}" has letter-spacing ${tx.letterSpacing}; tracking breaks Arabic joining`);
    if (!story.includes(norm(tx.text))) add('FAIL', 'story-first', `"${tx.text}" is not in story.md; write the copy there first`);
    if (/[0-9٠-٩]/.test(tx.text) && !brand.allowedNumbers?.some(n => tx.text.includes(n))) add('FAIL', 'no-fabricated-numbers', `"${tx.text}" contains a number; numbers need a sourced claim`);
    for (const p of brand.bannedPhrases || []) if (tx.text.includes(p)) add('FAIL', 'no-slop', `"${tx.text}" uses banned phrase "${p}"`);
    // An exit the cut interrupts reads as a glitch: finish it a frame before the cut, or let the cut be the exit.
    if (tx.exit && shot && tx.exit.t1 > shot.t1 - frame + 1e-6) add('FAIL', 'exit-before-cut', `"${tx.text}" is still leaving when ${tx.shot} cuts (${(tx.exit.t1 - shot.t1).toFixed(2)}s late); end the exit before the cut or remove it`);
    if (tx.enter && shot) {
      const until = tx.exit ? tx.exit.t0 : shot.t1;
      const need = readSeconds(tx.text.split(/\s+/).length);
      const have = until - tx.enter.tSync;
      if (have + 1e-6 < need) add('FAIL', 'reading-time', `"${tx.text}" is readable for ${have.toFixed(2)}s, needs ${need.toFixed(2)}s`);
    }
  }

  // ---------- DOM geometry, every frame ----------
  const runs = {};
  const flag = (key, level, rule, msg, f) => {
    const r = runs[key] || (runs[key] = { level, rule, msg, frames: [] });
    r.frames.push(f);
  };
  let prev = null;
  const samples = [], travel = [];
  const shutter = (cfg.render?.shutter ?? 180) / 360, baseSamples = cfg.render?.samples ?? 4;
  const cutFrames = new Set(shots.map(s => Math.round(s.t0 * fps)));
  for (let f = 0; f < total; f++) {
    const t = f / fps;
    const vis = await page.evaluate(x => window.__S.probe(x), t);
    for (const v of vis) {
      const r = v.rect;
      const strong = v.opacity > 0.5;
      if (r.l < -1 || r.r > W + 1 || r.t < -1 || r.b > H + 1) { if (strong && v.settled) flag(`off:${v.id}`, 'FAIL', 'in-frame', `"${v.text}" leaves the frame`, f); }
      else if (strong && v.settled && (r.l < SAFE.l || r.r > SAFE.r || r.t < SAFE.t || r.b > SAFE.b)) flag(`safe:${v.id}`, 'FAIL', 'safe-area', `"${v.text}" outside ${SAFE.name}`, f);
      if (v.settled && strong && v.fontPx < MIN_TEXT_PX) flag(`size:${v.id}`, 'FAIL', 'min-text-size', `"${v.text}" renders at ${v.fontPx.toFixed(0)}px (< ${MIN_TEXT_PX}px)`, f);
    }
    for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
      const p = vis[i], q = vis[j];
      if (p.opacity < 0.5 || q.opacity < 0.5) continue;
      const ix = Math.min(p.rect.r, q.rect.r) - Math.max(p.rect.l, q.rect.l), iy = Math.min(p.rect.b, q.rect.b) - Math.max(p.rect.t, q.rect.t);
      if (ix > 2 && iy > 2 && !(p.allowOverlap && q.allowOverlap)) flag(`ov:${p.id}:${q.id}`, p.settled && q.settled ? 'FAIL' : 'WARN', 'no-overlap', `"${p.text}" overlaps "${q.text}"`, f);
    }
    // A text that jumps in opacity between two frames of the same shot has popped (no motion).
    if (prev && !cutFrames.has(f)) {
      for (const v of vis) {
        const before = prev.find(x => x.id === v.id);
        if (!before && v.opacity > 0.6) flag(`pop:${v.id}`, 'FAIL', 'no-pops', `"${v.text}" appears without an entrance`, f);
        if (before && Math.abs(before.opacity - v.opacity) > 0.6) flag(`pop:${v.id}`, 'FAIL', 'no-pops', `"${v.text}" jumps in opacity`, f);
      }
    }
    prev = vis;
    // Motion blur budget: how far does anything travel while the shutter is open on this frame?
    const [r0, r1] = await page.evaluate(([x, dt]) => [window.__S.motionRects(x), window.__S.motionRects(x + dt)], [t, shutter / fps]);
    let disp = 0;
    for (let k = 0; k < r0.length; k++) {
      if (!r0[k] || !r1[k]) continue;
      for (let c = 0; c < 4; c++) disp = Math.max(disp, Math.abs(r1[k][c] - r0[k][c]));
    }
    const need = Math.ceil(disp / SAMPLE_SPACING_PX);
    samples.push([4, 8, 16, 32].find(n => n >= Math.max(baseSamples, need)) || 32);
    travel.push(Math.round(disp));
    if (f % 60 === 0) process.stdout.write(`\r  dom pass ${f}/${total}`);
  }
  process.stdout.write(`\r  dom pass ${total}/${total}\n`);
  for (const r of Object.values(runs)) add(r.level, r.rule, `${r.msg} (frames ${span(r.frames)})`, { frames: r.frames.length });

  // ---------- pan: where is the element when its sound plays ----------
  for (const c of man.cues) {
    if (!c.elId) continue;
    c.pan = await page.evaluate(([id, t, w]) => {
      window.__S.seek(t);
      const el = document.querySelector(`[data-ms="${id}"]`);
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      return Math.max(-1, Math.min(1, ((r.left + r.width / 2) / w) * 2 - 1)) * 0.6;
    }, [c.elId, c.t, W]);
  }

  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(man, null, 1));
  fs.writeFileSync(path.join(out, 'samples.json'), JSON.stringify({ spacingPx: SAMPLE_SPACING_PX, shutter, base: baseSamples, perFrame: samples, travelPx: travel }));
  const boosted = samples.filter(n => n > baseSamples).length;
  fs.writeFileSync(path.join(qa, 'pass1.json'), JSON.stringify({ format, safe: SAFE, minTextPx: MIN_TEXT_PX, frames: total, issues }, null, 1));
  const fails = issues.filter(i => i.level === 'FAIL'), warns = issues.filter(i => i.level === 'WARN');
  const sounds = man.cues.length, motions = man.motions.filter(m => !['camera', 'cut'].includes(m.kind));
  console.log(`pass 1: ${total} frames, ${shots.length} shots, ${motions.length} motions, ${sounds} cues, ${man.texts.length} texts`);
  console.log(`        ${motions.filter(m => m.silent).length} motions silenced with a reason (listed in pass1.json for review)`);
  console.log(`        motion blur: ${boosted} fast frame(s) get more than ${baseSamples} samples (max travel ${Math.max(...travel)} px per exposure)`);
  for (const i of issues) console.log(`  ${i.level} ${i.rule}: ${i.msg}`);
  console.log(fails.length ? `FAIL (${fails.length} fail, ${warns.length} warn)` : `PASS (${warns.length} warn)`);
  process.exitCode = fails.length ? 1 : 0;
} finally {
  await browser.close();
  server.close();
}

function span(frames) {
  const out = [];
  let a = frames[0], b = frames[0];
  for (const f of frames.slice(1)) { if (f === b + 1) b = f; else { out.push(a === b ? `${a}` : `${a}-${b}`); a = b = f; } }
  out.push(a === b ? `${a}` : `${a}-${b}`);
  return out.slice(0, 6).join(', ') + (out.length > 6 ? ', ...' : '');
}
