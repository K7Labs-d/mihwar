// Tests the checker, not the film: each case is a tiny production with one planted defect,
// and the matching gate must catch it. Run after any change to runtime.js or probe.mjs.
//   node selftest.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ENGINE } from './lib.mjs';

const STORY = '| 1 | مشروع ينتظر معدة. |\n| 2 | الأفضل في السوق |\n| 3 | يربط صاحب الاحتياج بمالك المعدة اليوم |\n';
const base = (bpm = 120, beats = 8) => `export const config = { title: 't', brand: 'mihwar', fps: 30, bpm: ${bpm}, beats: ${beats}, formats: ['1920x1080'], fonts: ['600 96px "Noto Sans Arabic"'] };`;
const shot = body => `export function build(S, rt) { const s = S.shot('a', { at: 0, beats: 8 }); s.camera({ z: 40 }); ${body} }`;
const ok = `const h = s.text('مشروع ينتظر معدة.', { cls: 'h' }); s.place(h, { x: 960, y: 540 }); s.enter(h, 'rise', { land: 0 });`;

const cases = [
  ['clean production passes', base(), shot(ok), null],
  ['BPM without whole frames per beat', base(125, 8), shot(ok), 'integer-frames-per-beat'],
  ['cut off the beat', base(), `export function build(S) { for (const [id, at, b] of [['a', 0, 2.5], ['b', 2.5, 5.5]]) { const s = S.shot(id, { at, beats: b }); s.camera({ z: 40 }); const h = s.text('مشروع ينتظر معدة.', { cls: 'h' }); s.place(h, { x: 960, y: 540 }); s.enter(h, 'rise', { land: 0 }); } }`, 'cut-on-beat'],
  ['copy that is not in the story', base(), shot(`const h = s.text('نص جديد غير موثق'); s.place(h, { x: 960, y: 540 }); s.enter(h, 'rise', { land: 0 });`), 'story-first'],
  ['banned phrase', base(), shot(`const h = s.text('الأفضل في السوق'); s.place(h, { x: 960, y: 540 }); s.enter(h, 'rise', { land: 0 });`), 'no-slop'],
  ['text outside the safe area', base(), shot(`const h = s.text('مشروع ينتظر معدة.', { cls: 'h' }); s.place(h, { x: 1480, y: 540 }); s.enter(h, 'rise', { land: 0 });`), 'safe-area'],
  ['text leaving the frame', base(), shot(`const h = s.text('مشروع ينتظر معدة.', { cls: 'h' }); s.place(h, { x: 1750, y: 540 }); s.enter(h, 'rise', { land: 0 });`), 'in-frame'],
  ['too little reading time', base(), shot(`const h = s.text('يربط صاحب الاحتياج بمالك المعدة اليوم', { cls: 's' }); s.place(h, { x: 960, y: 540 }); s.enter(h, 'rise', { land: 0 }); s.exit(h, 'lift', { at: 2 });`), 'reading-time'],
  ['text that pops without motion', base(), shot(`${ok} const p = s.text('مشروع ينتظر معدة.', { cls: 's' }); s.place(p, { x: 960, y: 800 }); s.enter(p, 'rise', { land: 0 }); S.track(p, 'o', 0, 0, 0, 3); S.track(p, 'o', 0, 1, 3, 3.02);`), 'no-pops'],
  ['exit still running at the cut', base(), shot(`${ok} s.exit(h, 'lift', { at: 7.6 });`), 'exit-before-cut'],
  ['Arabic split into letters', base(), shot(`s.text('مشروع ينتظر معدة.', { split: 'chars' });`), 'BUILD:never by letters'],
  ['motion without a sound or a reason', base(), shot(`${ok} s.move(h, {}, { x: 10 }, { a: 2, b: 3, sfx: false });`), 'BUILD:needs silent'],
];

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-selftest-'));
let failed = 0;
for (const [name, cfg, build, expect] of cases) {
  const dir = path.join(root, name.replace(/\W+/g, '-'));
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'production.js'), `${cfg}\n${build}\n`);
  fs.writeFileSync(path.join(dir, 'style.css'), '.h { font-size: 96px; font-weight: 600; } .s { font-size: 64px; }');
  fs.writeFileSync(path.join(dir, 'story.md'), STORY);
  const r = spawnSync('node', [path.join(ENGINE, 'probe.mjs'), dir], { encoding: 'utf8' });
  const text = r.stdout + r.stderr;
  let pass;
  if (expect === null) pass = r.status === 0;
  else if (expect.startsWith('BUILD:')) pass = r.status !== 0 && text.includes(expect.slice(6));
  else pass = r.status !== 0 && new RegExp(`FAIL ${expect}\\b`).test(text);
  console.log(`${pass ? 'ok  ' : 'MISS'} ${name}${expect ? ` -> ${expect}` : ''}`);
  if (!pass) { failed++; console.log(text.split('\n').slice(-12).map(l => '      ' + l).join('\n')); }
}
fs.rmSync(root, { recursive: true, force: true });
console.log(failed ? `${failed} gate(s) did not catch their defect` : 'every gate caught its defect');
process.exitCode = failed ? 1 : 0;
