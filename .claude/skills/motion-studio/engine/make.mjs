// One command, the whole pipeline, stopping at the first failing gate.
//   node make.mjs <prod> [--format WxH] [--draft] [--sound-only]
// 1 probe (QA pass 1) -> 2 sound -> 3 picture -> 4 QA pass 2. Pass 3 is the eye review.
// --sound-only keeps the rendered master.mkv and only re-mixes, re-muxes and re-checks (skips the picture render).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { args, loadConfig, ENGINE } from './lib.mjs';

const a = args(process.argv.slice(2));
const prod = path.resolve(a._[0]);
const cfg = await loadConfig(prod);
const formats = a.format ? [a.format] : cfg.formats;

const step = (name, cmd, argv) => {
  console.log(`\n== ${name} ==`);
  const r = spawnSync(cmd, argv, { stdio: 'inherit' });
  if (r.status !== 0) { console.error(`\n${name} failed; fix it before going further.`); process.exit(r.status || 1); }
};

for (const format of formats) {
  step(`pass 1 · ${format}`, 'node', [path.join(ENGINE, 'probe.mjs'), prod, '--format', format]);
  step('sound', 'python3', [path.join(ENGINE, 'audio', 'mix.py'), prod, '--format', format]);
  step('picture', 'node', [path.join(ENGINE, 'render.mjs'), prod, '--format', format, '--mode', a.draft ? 'draft' : 'final', ...(a['sound-only'] ? ['--mux'] : [])]);
  if (!a.draft) step('pass 2', 'python3', [path.join(ENGINE, 'qa.py'), prod, '--format', format]);
}
console.log('\nAll automatic gates passed. Now pass 3: read qa/report.md, timeline.png, cuts.png and shots/*.png, and write review.md in the film folder.');
