// Frame renderer.
//   node render.mjs <prod> [--format WxH] [--mode draft|final] [--stills t1,t2,...] [--workers N] [--bench] [--mux]
// final: sub-frames averaged into each frame (forward-opening 180° shutter, so a hard cut never
// blends two shots). The sample count per frame comes from probe.mjs (samples.json): fast frames
// get up to 32 so sub-frames stay <= 6 px apart and blur instead of strobing. Segments render in
// parallel (one browser each) to a lossless master, then one H.264 encode with BT.709 tags.
// draft: one sample per frame, half-size, fast. Output lands in <prod>/out/<format>/.
import fs from 'node:fs';
import path from 'node:path';
import { serve, openPages, capture, run, args, loadConfig, outDir } from './lib.mjs';

const a = args(process.argv.slice(2));
const prod = a._[0];
if (!prod) { console.error('usage: node render.mjs <production-dir> [--format WxH] [--mode draft|final] [--stills t,..]'); process.exit(2); }
const cfg = await loadConfig(prod);
const format = a.format || cfg.formats[0];
const mode = a.mode || 'final';
const fps = cfg.fps;
const baseSamples = mode === 'final' ? Number(a.samples || cfg.render?.samples || 4) : 1;
const shutter = (cfg.render?.shutter ?? 180) / 360;
const workers = Number(a.workers || 3);
const total = Math.round((cfg.beats * 60 / cfg.bpm) * fps);
const out = outDir(prod, format);

const { server, port } = await serve(prod, cfg.brand);
const { browser, pages } = await openPages({ port, format, count: a.mux ? 0 : a.stills || a.bench ? 1 : workers });
const duration = total / fps;
const plan = path.join(out, 'samples.json');
const perFrame = mode === 'final' && fs.existsSync(plan) ? JSON.parse(fs.readFileSync(plan, 'utf8')).perFrame : null;
if (mode === 'final' && !perFrame && !a.mux) console.warn('samples.json missing (run probe.mjs first); using a flat sample count');
const samplesAt = i => Math.max(baseSamples, perFrame ? perFrame[i] || baseSamples : baseSamples);
const sampleTimes = i => { const n = samplesAt(i); return Array.from({ length: n }, (_, k) => Math.min(duration - 1e-6, (i + (k / n) * shutter) / fps)); };

try {
  if (a.bench) {
    // Capture cost per shot: find the expensive layer before a long render.
    const man = await pages[0].page.evaluate(() => window.__S.manifest());
    for (const sh of man.shots) {
      const f0 = Math.round(sh.t0 * fps), f1 = Math.round(sh.t1 * fps);
      const t = Date.now();
      for (let k = 0; k < 6; k++) await capture(pages[0], (f0 + Math.floor(((f1 - f0) * k) / 6)) / fps);
      console.log(`${sh.id.padEnd(10)} ${((Date.now() - t) / 6).toFixed(0)} ms/capture`);
    }
  } else if (a.mux) {
    // Sound changed, picture did not: re-encode final.mp4 from the existing lossless master.
    await encodeFinal(path.join(out, 'master.mkv'));
  } else if (a.stills) {
    // Times in seconds, or frames with an f suffix (e.g. 2.5,90f). Also writes a labelled sheet.
    const dir = outDir(prod, format, 'stills');
    for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f));
    const files = [];
    for (const tok of String(a.stills).split(',')) {
      const i = tok.endsWith('f') ? Number(tok.slice(0, -1)) : Math.round(Number(tok) * fps);
      const file = path.join(dir, `f${String(i).padStart(4, '0')}.png`);
      await stillAveraged(pages[0], i, file);
      files.push(file);
    }
    const cols = Math.min(4, files.length), rows = Math.ceil(files.length / cols);
    await run('ffmpeg', ['-y', '-pattern_type', 'glob', '-i', path.join(dir, 'f*.png'), '-vf',
      `scale=640:-2,drawtext=text='%{n}':x=10:y=10:fontsize=24:fontcolor=red,tile=${cols}x${rows}:padding=4:color=red`, '-frames:v', '1', path.join(dir, 'sheet.png')]);
    console.log(path.join(dir, 'sheet.png'));
  } else {
    const t0 = Date.now();
    // Segments: runs of frames with the same sample count, at most 48 frames, pulled from a queue.
    const queue = [];
    for (let i = 0; i < total;) {
      let j = i + 1;
      while (j < total && samplesAt(j) === samplesAt(i) && j - i < 48) j++;
      queue.push({ a0: i, a1: j, n: samplesAt(i), file: path.join(out, `seg${String(i).padStart(5, '0')}.mkv`) });
      i = j;
    }
    const segs = queue.map(q => q.file);
    let done = 0, captures = 0;
    await Promise.all(pages.map(async pg => {
      for (let q; (q = queue.shift());) {
        await renderSegment(pg, q.a0, q.a1, q.file, q.n);
        done += q.a1 - q.a0; captures += (q.a1 - q.a0) * q.n;
        process.stdout.write(`\r  ${done}/${total} frames`);
      }
    }));
    process.stdout.write('\n');
    console.log(`rendered ${total} frames (${captures} sub-frames, ${segs.length} segments) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    const list = path.join(out, 'segments.txt');
    fs.writeFileSync(list, segs.map(s => `file '${s}'`).join('\n'));
    // Lossless master (exact pixels, no grain): what QA pass 2 scans frame by frame.
    const master = path.join(out, mode === 'final' ? 'master.mkv' : 'draft-master.mkv');
    await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', master]);
    for (const s of segs) fs.rmSync(s);
    fs.rmSync(list);
    await encodeFinal(master);
  }
} finally {
  await browser.close();
  server.close();
}

async function encodeFinal(master) {
  const mix = path.join(out, 'audio', 'mix.wav');
  const audioIn = fs.existsSync(mix) ? ['-i', mix] : [];
  const audioOut = audioIn.length ? ['-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-shortest'] : [];
  const video = path.join(out, mode === 'final' ? 'final.mp4' : 'draft.mp4');
  const scale = mode === 'final' ? '' : 'scale=iw/2:-2:flags=lanczos,';
  // RGB -> BT.709 limited range (swscale defaults to BT.601, which shifts the brand gold);
  // light temporal luma grain dithers the dark gradients against banding.
  const vf = `${scale}scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p${mode === 'final' ? ',noise=c0s=3:c0f=t+u' : ''}`;
  await run('ffmpeg', ['-y', '-i', master, ...audioIn, '-vf', vf,
    '-c:v', 'libx264', '-preset', mode === 'final' ? 'slow' : 'veryfast', '-crf', mode === 'final' ? '16' : '23',
    '-profile:v', 'high', '-x264-params', 'aq-mode=3', '-r', String(fps),
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
    ...audioOut, '-movflags', '+faststart', video]);
  console.log(video);
}

async function renderSegment(pg, a0, a1, seg, n) {
  // Sub-frames arrive at fps*n; tmix averages each run of n, select keeps one per frame.
  const vf = n > 1
    ? `tmix=frames=${n},select='eq(mod(n\\,${n})\\,${n - 1})',setpts=N/${fps}/TB`
    : `setpts=N/${fps}/TB`;
  const { spawn } = await import('node:child_process');
  const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(fps * n), '-c:v', 'png', '-i', '-',
    '-vf', vf, '-r', String(fps), '-c:v', 'ffv1', '-level', '3', '-pix_fmt', 'bgr0', seg], { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = '';
  ff.stderr.on('data', d => { err += d; });
  const finished = new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error(err.slice(-1500))))));
  for (let i = a0; i < a1; i++) {
    for (const t of sampleTimes(i)) {
      const png = await capture(pg, t);
      if (!ff.stdin.write(png)) await new Promise(r2 => ff.stdin.once('drain', r2));
    }
  }
  ff.stdin.end();
  await finished;
}

async function stillAveraged(pg, i, file) {
  const ts = sampleTimes(i);
  if (ts.length === 1) return fs.writeFileSync(file, await capture(pg, ts[0]));
  const tmp = ts.map((_, k) => `${file}.${k}.png`);
  for (let k = 0; k < ts.length; k++) fs.writeFileSync(tmp[k], await capture(pg, ts[k]));
  const inputs = tmp.flatMap(f => ['-i', f]);
  await run('ffmpeg', ['-y', ...inputs, '-filter_complex', `${tmp.map((_, k) => `[${k}]`).join('')}mix=inputs=${tmp.length}`, '-frames:v', '1', file]);
  tmp.forEach(f => fs.rmSync(f));
}
