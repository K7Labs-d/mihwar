// Motion Studio runtime (browser side).
// Every pixel is a pure function of time t (seconds). There are no CSS transitions,
// no timers and no requestAnimationFrame loops: the renderer calls seek(t) and captures.
// Time is authored in beats; seconds are derived, so cuts cannot drift off the grid.

// ---------- easing ----------
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = t => ((ax * t + bx) * t + cx) * t;
  const sy = t => ((ay * t + by) * t + cy) * t;
  const dx = t => (3 * ax * t + 2 * bx) * t + cx;
  const solve = x => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x, d = dx(t);
      if (Math.abs(e) < 1e-6) return t;
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0, hi = 1; t = x;
    while (hi - lo > 1e-6) { if (sx(t) < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return t;
  };
  const f = x => (x <= 0 ? 0 : x >= 1 ? 1 : sy(solve(x)));
  f.curve = [x1, y1, x2, y2];
  return f;
}

// The whole vocabulary. Anything else is rejected by lint (see references/motion.md).
export const Ease = {
  out: bezier(0.16, 1, 0.3, 1),       // entrances: fast arrival, long settle
  in: bezier(0.7, 0, 0.84, 0),        // exits: leave with intent
  move: bezier(0.65, 0, 0.35, 1),     // A to B while visible
  snap: bezier(0.85, 0, 0.15, 1),     // convergence, things locking into place
  drift: bezier(0.37, 0, 0.63, 1),    // camera and ambient drift
  linear: Object.assign(t => t, { curve: 'linear' }),
};

// Fraction of the duration at which an eased motion reads as "arrived" (90% of travel).
// The arrival, not the end of the tween, is what lands on the beat.
export function arrivalFrac(ease, p = 0.9) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (ease(m) < p) lo = m; else hi = m; }
  return hi;
}
// Fraction of the duration with the highest speed; whooshes peak here.
export function peakVelFrac(ease) {
  let best = 0, at = 0; const n = 400;
  for (let i = 0; i < n; i++) { const v = ease((i + 1) / n) - ease(i / n); if (v > best) { best = v; at = (i + 0.5) / n; } }
  return at;
}

// ---------- deterministic noise ----------
// Integer hash in 32-bit arithmetic (Math.imul), mapped to [-1, 1).
function hash(n) {
  n = Math.imul((n | 0) ^ ((n | 0) >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n ^= n >>> 16;
  return (n & 0xffff) / 32768 - 1;
}
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash(i + seed * 7919) * (1 - u) + hash(i + 1 + seed * 7919) * u;
}

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const TRANSFORM_PROPS = ['x', 'y', 'z', 'rx', 'ry', 'rz', 's', 'sx', 'sy'];
const DEFAULTS = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1, sx: 1, sy: 1, o: 1, blur: 0, draw: 1, clipL: 0, clipR: 0, clipT: 0, clipB: 0, ls: 0 };

// ---------- studio ----------
export class Studio {
  constructor(stage, cfg) {
    this.stage = stage;
    this.cfg = cfg;
    this.fps = cfg.fps; this.bpm = cfg.bpm;
    this.spb = 60 / cfg.bpm;
    this.fpb = cfg.fps * this.spb;
    this.duration = cfg.beats * this.spb;
    this.tracks = new Map();        // el -> Map(prop -> tween[])
    this.hooks = [];
    this.shots = [];
    this.cues = [];
    this.motions = [];
    this.texts = [];
    this.uid = 0;
    stage.style.width = cfg.width + 'px';
    stage.style.height = cfg.height + 'px';
  }

  b(beats) { return beats * this.spb; }
  f(frames) { return frames / this.fps; }
  id(prefix) { return `${prefix}${++this.uid}`; }

  track(el, prop, from, to, t0, t1, ease = Ease.move) {
    if (!(prop in DEFAULTS) && prop !== 'fn') throw new Error(`unknown prop ${prop}`);
    if (!this.tracks.has(el)) this.tracks.set(el, new Map());
    const m = this.tracks.get(el);
    if (!m.has(prop)) m.set(prop, []);
    m.get(prop).push({ from, to, t0, t1, ease });
    m.get(prop).sort((a, b) => a.t0 - b.t0);
  }

  // Animate several props at once: from/to objects.
  tween(el, from, to, t0, t1, ease) {
    for (const k of Object.keys(to)) this.track(el, k, from[k] ?? DEFAULTS[k], to[k], t0, t1, ease);
  }

  every(fn) { this.hooks.push(fn); }

  // Procedural animation: fn(progress, el, t) runs from t0 on; progress is eased and clamped.
  fn(el, fn, t0, t1, ease = Ease.linear) { this.track(el, 'fn', fn, null, t0, t1, ease); }

  cue(t, name, opts = {}) {
    const c = { id: this.id('c'), t, name, gain: 0, pitch: 0, len: null, pan: 0, ...opts };
    if (c.el) { c.elId = this.tag(c.el); delete c.el; }
    this.cues.push(c);
    return c.id;
  }

  motion(m) {
    const rec = { id: this.id('m'), cues: [], ...m };
    if (rec.el) { rec.elId = this.tag(rec.el); delete rec.el; }
    this.motions.push(rec);
    return rec;
  }

  tag(el) { if (!el.dataset.ms) el.dataset.ms = this.id('e'); return el.dataset.ms; }

  shot(id, { at, beats, cls = '', persp = 1400 }) {
    const s = new Shot(this, id, at, beats, cls, persp, false);
    this.shots.push(s);
    return s;
  }

  // A layer that spans the whole film (background, vignette). It is not a shot: no cut, no lint.
  persistent(id, { cls = '', persp = 1400 } = {}) {
    const s = new Shot(this, id, 0, this.cfg.beats, cls, persp, true);
    this.layers = this.layers || [];
    this.layers.push(s);
    return s;
  }

  valueAt(list, t) {
    if (t <= list[0].t0) return list[0].from;
    let tw = list[0];
    for (const x of list) { if (x.t0 <= t) tw = x; else break; }
    if (t >= tw.t1) return tw.to;
    const p = tw.ease((t - tw.t0) / (tw.t1 - tw.t0));
    return typeof tw.from === 'number' ? tw.from + (tw.to - tw.from) * p : (p < 1 ? tw.from : tw.to);
  }

  seek(t) {
    this.t = t;
    for (const s of this.shots) s.el.style.display = t >= s.t0 - s.pre && t < s.t1 + s.post ? '' : 'none';
    for (const [el, props] of this.tracks) {
      const v = {};
      for (const [k, list] of props) {
        if (k === 'fn') { for (const x of list) if (t >= x.t0 - 1e-9) x.from(Math.min(1, Math.max(0, x.ease((t - x.t0) / (x.t1 - x.t0)))), el, t); continue; }
        v[k] = this.valueAt(list, t);
      }
      apply(el, v);
    }
    for (const h of this.hooks) h(t);
  }

  // Is any tween on this element (or its tracked ancestors) mid-flight at t?
  active(el, t) {
    for (let n = el; n && n !== this.stage; n = n.parentElement) {
      const m = this.tracks.get(n);
      if (!m) continue;
      for (const list of m.values()) for (const x of list) if (t > x.t0 + 1e-6 && t < x.t1 - 1e-6 && !x.ambient) return true;
    }
    return false;
  }

  // QA probe: geometry of every visible text block at time t. Rects are glyph ink, not line
  // boxes: Arabic faces carry tall ascent/descent, so line boxes overlap where ink never does.
  probe(t) {
    this.seek(t);
    const out = [];
    const ctx = (this._ctx ||= document.createElement('canvas').getContext('2d'));
    for (const tx of this.texts) {
      const block = tx.el;
      if (block.closest('section').style.display === 'none') continue;
      let minO = 1, any = false, union = null, settled = true, scale = Infinity;
      const cs = getComputedStyle(block);
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      for (const w of tx.words) {
        let o = 1;
        for (let n = w; n && n !== this.stage; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
        if (o < 0.02) { minO = 0; continue; }
        any = true; minO = Math.min(minO, o);
        const r = w.getBoundingClientRect();
        const k = w.offsetHeight ? r.height / w.offsetHeight : 1;
        const m = ctx.measureText(w.textContent);
        const half = (w.offsetHeight - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2;
        const top = r.top + k * (half + m.fontBoundingBoxAscent - m.actualBoundingBoxAscent);
        const bot = r.top + k * (half + m.fontBoundingBoxAscent + m.actualBoundingBoxDescent);
        union = union ? { l: Math.min(union.l, r.left), t: Math.min(union.t, top), r: Math.max(union.r, r.right), b: Math.max(union.b, bot) } : { l: r.left, t: top, r: r.right, b: bot };
        if (this.active(w, t)) settled = false;
        scale = Math.min(scale, k);
      }
      if (!any) continue;
      out.push({ id: tx.id, shot: tx.shot, text: tx.text, opacity: minO, settled, rect: union, fontPx: parseFloat(cs.fontSize) * (isFinite(scale) ? scale : 1), allowOverlap: tx.allowOverlap || false });
    }
    return out;
  }

  // Screen rects of every animated element, in a fixed order; render uses them to size
  // motion-blur sampling to the actual speed on screen.
  motionRects(t) {
    this.seek(t);
    const out = [];
    for (const el of this.tracks.keys()) {
      const sec = el.closest('section');
      if (!sec || sec.style.display === 'none') { out.push(null); continue; }
      const r = el.getBoundingClientRect();
      out.push(r.width || r.height ? [r.left, r.top, r.right, r.bottom] : null);
    }
    return out;
  }

  manifest() {
    return {
      cfg: this.cfg, spb: this.spb, fpb: this.fpb, duration: this.duration,
      shots: this.shots.map(s => ({ id: s.id, at: s.at, beats: s.beats, t0: s.t0, t1: s.t1 })),
      cues: this.cues, motions: this.motions,
      texts: this.texts.map(x => ({ id: x.id, shot: x.shot, text: x.text, arabic: ARABIC.test(x.text), split: x.split, cls: x.el.className, letterSpacing: getComputedStyle(x.el).letterSpacing, enter: x.enter || null, exit: x.exit || null })),
    };
  }
}

function apply(el, v) {
  const has = k => k in v;
  if (TRANSFORM_PROPS.some(has)) {
    const g = k => (has(k) ? v[k] : DEFAULTS[k]);
    const s = g('s');
    el.style.transform = `translate3d(${g('x')}px,${g('y')}px,${g('z')}px) rotateX(${g('rx')}deg) rotateY(${g('ry')}deg) rotateZ(${g('rz')}deg) scale3d(${s * g('sx')},${s * g('sy')},1)`;
  }
  if (has('o')) el.style.opacity = Math.max(0, Math.min(1, v.o)).toFixed(4);
  if (has('blur')) el.style.filter = v.blur > 0.05 ? `blur(${v.blur.toFixed(2)}px)` : 'none';
  if (has('draw')) el.style.strokeDashoffset = (1 - v.draw).toFixed(4);
  if (['clipL', 'clipR', 'clipT', 'clipB'].some(has)) {
    const g = k => (has(k) ? v[k] : 0);
    el.style.clipPath = `inset(${g('clipT')}% ${g('clipR')}% ${g('clipB')}% ${g('clipL')}%)`;
  }
  if (has('ls')) el.style.letterSpacing = `${v.ls}em`;
}

// ---------- shot ----------
export class Shot {
  constructor(S, id, at, beats, cls, persp, persistent) {
    this.S = S; this.id = id; this.at = at; this.beats = beats;
    this.t0 = S.b(at); this.t1 = S.b(at + beats);
    this.pre = 0; this.post = 0;
    this.el = document.createElement('section');
    this.el.className = `shot ${cls}`;
    this.el.dataset.shot = id;
    this.el.style.perspective = `${persp}px`;
    this.cam = document.createElement('div');
    this.cam.className = 'cam';
    this.el.appendChild(this.cam);
    S.stage.appendChild(this.el);
    this.persistent = persistent;
    if (!persistent) S.motion({ kind: 'cut', label: `cut into ${id}`, t0: this.t0, t1: this.t0, tSync: this.t0, shot: id });
  }

  // Positioned box centred on (x, y).
  item(html, { x, y, w, h, cls = '', parent = this.cam }) {
    const el = document.createElement('div');
    el.className = `item ${cls}`;
    el.style.cssText = `position:absolute;left:${x - w / 2}px;top:${y - h / 2}px;width:${w}px;height:${h}px;transform-style:preserve-3d;`;
    el.innerHTML = html;
    parent.appendChild(el);
    return el;
  }

  // Static depth plane for parallax. Scale compensates so the plane keeps its framed size.
  depth(z, { parent = this.cam } = {}) {
    const el = document.createElement('div');
    el.className = 'layer';
    const persp = parseFloat(this.el.style.perspective);
    el.style.transform = `translateZ(${z}px) scale(${(persp - z) / persp})`;
    parent.appendChild(el);
    return el;
  }

  // Beat offset inside the shot -> absolute seconds.
  t(beat) { return this.S.b(this.at + beat); }

  add(html, { cls = '', parent = this.cam, style = '' } = {}) {
    const wrap = document.createElement('div');
    wrap.className = `layer ${cls}`;
    if (style) wrap.style.cssText = style;
    wrap.innerHTML = html;
    parent.appendChild(wrap);
    return wrap;
  }

  // Text block. Arabic is split by word only: splitting letters breaks cursive joining.
  text(str, { cls = '', parent = this.cam, split = 'words', allowOverlap = false } = {}) {
    const S = this.S;
    if (split === 'chars' && ARABIC.test(str)) throw new Error(`"${str}": Arabic text must be split by words, never by letters`);
    const el = document.createElement('div');
    el.className = `txt ${cls}`;
    const parts = split === 'chars' ? [...str] : str.split(/\s+/);
    el.innerHTML = parts.map(p => (p === ' ' ? ' ' : `<span class="w">${p}</span>`)).join(split === 'chars' ? '' : ' ');
    parent.appendChild(el);
    const rec = { id: S.id('t'), shot: this.id, text: str, el, words: [...el.querySelectorAll('.w')], split, allowOverlap };
    S.texts.push(rec);
    S.tag(el);
    el.words = rec.words; el.rec = rec;
    return el;
  }

  // Absolute placement: (x, y) is the anchor point in frame pixels.
  place(el, { x, y, ax = 0.5, ay = 0.5, w = null }) {
    el.style.position = 'absolute';
    if (w) el.style.width = `${w}px`;
    const r = { w: el.offsetWidth, h: el.offsetHeight };
    el.style.left = `${x - ax * r.w}px`;
    el.style.top = `${y - ay * r.h}px`;
    return el;
  }

  // Text or element entrance. `land` is the beat (shot-relative) where the motion reads as arrived.
  // `lands` (optional): one shot-relative beat per word, for phrases that build in parts.
  enter(el, preset, { land, lands = null, sfx = undefined, stagger = null, dur = null, silent = null } = {}) {
    const P = PRESETS.enter[preset];
    if (!P) throw new Error(`unknown enter preset ${preset}`);
    return runPreset(this, el, P, 'enter', preset, { tSync: this.t(lands ? lands[0] : land), lands: lands && lands.map(b => this.t(b)), sfx, stagger, dur, silent });
  }

  // Exit. `at` is the beat where the exit starts (exits end on their own; a cut can also end a shot).
  exit(el, preset, { at, sfx = undefined, stagger = null, dur = null, silent = null } = {}) {
    const P = PRESETS.exit[preset];
    if (!P) throw new Error(`unknown exit preset ${preset}`);
    return runPreset(this, el, P, 'exit', preset, { tStart: this.t(at), sfx, stagger, dur, silent });
  }

  // Free move between two beats. Emits a sound unless told why not.
  move(el, from, to, { a, b, ease = Ease.move, sfx = null, gain = -10, land = 'land', landGain = -12, label = 'move', silent = null }) {
    const S = this.S, t0 = this.t(a), t1 = this.t(b);
    if (!sfx && !land && !silent) throw new Error(`${label}: a motion without sound needs silent: '<reason>'`);
    S.tween(el, from, to, t0, t1, ease);
    const m = S.motion({ kind: 'move', label, el, t0, t1, tSync: t0 + peakVelFrac(ease) * (t1 - t0), shot: this.id, silent });
    if (sfx && !silent) m.cues.push(S.cue(m.tSync, sfx, { gain, len: t1 - t0, el, motion: m.id }));
    if (land && !silent) m.cues.push(S.cue(t1 - arrivalTail(ease) * (t1 - t0), land, { gain: landGain, el, motion: m.id }));
    return m;
  }

  // Procedural motion driven by an every() hook; declared here so lint and sound can see it.
  proc(label, { a, b, sfx = [], el = null, silent = null }) {
    const S = this.S, t0 = this.t(a), t1 = this.t(b);
    const m = S.motion({ kind: 'move', label, el, t0, t1, tSync: t0, shot: this.id, silent });
    for (const c of [].concat(sfx)) m.cues.push(S.cue(c.at !== undefined ? this.t(c.at) : t0, c.name, { gain: c.gain ?? -10, len: c.len ?? t1 - t0, pan: c.pan ?? 0, motion: m.id }));
    return m;
  }

  // Draw SVG strokes (paths need pathLength="1"). Sound: pen/scratch for the length of the draw.
  draw(paths, { a, b, ease = Ease.move, sfx = 'draw', gain = -10, stagger = 0, label = 'draw', silent = null }) {
    const S = this.S, t0 = this.t(a), t1 = this.t(b);
    if (!sfx && !silent) throw new Error(`${label}: a motion without sound needs silent: '<reason>'`);
    const list = paths.length !== undefined ? [...paths] : [paths];
    list.forEach((p, i) => {
      p.style.strokeDasharray = '1';
      S.track(p, 'draw', 0, 1, t0 + i * S.f(stagger), t1 + i * S.f(stagger), ease);
    });
    const m = S.motion({ kind: 'draw', label, el: list[0], t0, t1, tSync: t0, shot: this.id, silent });
    if (sfx && !silent) m.cues.push(S.cue(t0, sfx, { gain, len: t1 - t0 + S.f(stagger * (list.length - 1)), el: list[0], motion: m.id }));
    return m;
  }

  // Continuous camera move across the whole shot, so no frame is ever frozen.
  camera({ z = 60, ry = 0, rx = 0, x = 0, y = 0, from = {}, ease = Ease.drift, overhang = 0.5 }) {
    const S = this.S;
    const t0 = this.t0 - S.b(overhang), t1 = this.t1 + S.b(overhang);
    const f = { z: 0, ry: 0, rx: 0, x: 0, y: 0, ...from };
    S.tween(this.cam, f, { z: f.z + z, ry: f.ry + ry, rx: f.rx + rx, x: f.x + x, y: f.y + y }, t0, t1, ease);
    for (const list of S.tracks.get(this.cam).values()) for (const tw of list) tw.ambient = true;
    S.motion({ kind: 'camera', label: `camera ${this.id}`, t0, t1, tSync: t0, shot: this.id, silent: 'ambient camera drift is carried by the music bed' });
  }
}

// ---------- presets ----------
// Every text preset moves in depth (z and/or rotation). There is no flat fade or slide.
// d = frames, st = stagger frames per word (reading order: right to left in Arabic).
export const PRESETS = {
  enter: {
    rise: { d: 20, st: 3, ease: Ease.out, origin: '50% 100%', from: em => ({ y: 0.55 * em, z: -260, rx: 78, o: 0, blur: 10 }), sfx: ['land'] },
    swing: { d: 22, st: 3, ease: Ease.out, origin: '100% 50%', from: em => ({ x: 0.2 * em, z: -180, ry: -70, o: 0, blur: 8 }), sfx: ['land'] },
    dolly: { d: 26, st: 0, ease: Ease.out, origin: '50% 50%', from: () => ({ z: -1400, o: 0, blur: 16 }), sfx: ['land'] },
    drop: { d: 18, st: 2, ease: Ease.out, origin: '50% 0%', from: em => ({ y: -0.5 * em, z: 220, rx: -70, o: 0, blur: 10 }), sfx: ['land'] },
    pop: { d: 14, st: 2, ease: Ease.out, origin: '50% 50%', from: () => ({ z: -320, s: 0.82, o: 0, blur: 6 }), sfx: ['tick'] },
  },
  exit: {
    lift: { d: 12, st: 2, ease: Ease.in, origin: '50% 0%', to: em => ({ y: -0.45 * em, z: -220, rx: -72, o: 0, blur: 8 }), sfx: ['swell'] },
    push: { d: 12, st: 1, ease: Ease.in, origin: '50% 50%', to: () => ({ z: 700, o: 0, blur: 14 }), sfx: ['swell'] },
    sink: { d: 12, st: 2, ease: Ease.in, origin: '50% 100%', to: em => ({ y: 0.4 * em, z: -260, rx: 70, o: 0, blur: 8 }), sfx: ['swell'] },
    away: { d: 14, st: 0, ease: Ease.in, origin: '50% 50%', to: () => ({ z: -1200, o: 0, blur: 12 }), sfx: ['swell'] },
  },
};

const SFX_GAIN = { whoosh: -9, land: -12, tick: -14, swell: -12 };

function runPreset(shot, el, P, kind, name, { tSync, tStart, lands, sfx, stagger, dur, silent }) {
  const S = shot.S;
  const targets = el.words && el.words.length ? el.words : [el];
  const em = parseFloat(getComputedStyle(el).fontSize) || 100;
  const d = S.f(dur ?? P.d), st = S.f(stagger ?? P.st);
  const lead = arrivalFrac(P.ease) * d;
  if (lands && lands.length !== targets.length) throw new Error(`lands needs one beat per word (${targets.length})`);
  // Start time of each word. Enter: its arrival sits on the beat. Exit: starts at `at`, staggered.
  const starts = targets.map((_, i) => (kind === 'enter' ? (lands ? lands[i] : tSync + i * st) - lead : tStart + i * st));
  targets.forEach((w, i) => {
    w.style.transformOrigin = P.origin;
    const a = starts[i], b = a + d;
    if (kind === 'enter') S.tween(w, P.from(em), mapDefaults(P.from(em)), a, b, P.ease);
    else S.tween(w, mapDefaults(P.to(em)), P.to(em), a, b, P.ease);
  });
  const t0 = Math.min(...starts), t1 = Math.max(...starts) + d;
  if (kind === 'exit') tSync = t1;
  // Words that land more than half a beat apart are separate gestures and get separate sounds.
  const groups = [[0]];
  for (let i = 1; i < starts.length; i++) {
    if (starts[i] - starts[i - 1] > S.b(0.5)) groups.push([i]); else groups[groups.length - 1].push(i);
  }
  const rec = el.rec;
  // A text inherits the entrance/exit of the box that carries it (e.g. a word inside a pill).
  for (const tx of S.texts) if (tx.el === el || el.contains(tx.el)) tx[kind] = { preset: name, t0, t1, tSync, via: tx.el === el ? null : S.tag(el) };
  const m = S.motion({ kind, label: `${kind} ${name}${rec ? ` "${rec.text}"` : ''}`, el, t0, t1, tSync, shot: shot.id, preset: name, silent });
  const names = sfx === undefined ? P.sfx : sfx ? [].concat(sfx) : [];
  if (!names.length && !m.silent) throw new Error(`${m.label}: a motion without sound needs silent: '<reason>'`);
  for (const g of groups) {
    const g0 = starts[g[0]], gArrive = kind === 'enter' ? g0 + lead : starts[g[g.length - 1]] + d;
    for (const n of names) {
      const base = n.split('.')[0];
      const at = base === 'whoosh' ? g0 + peakVelFrac(P.ease) * d : gArrive;
      m.cues.push(S.cue(at, n, { gain: SFX_GAIN[base] ?? -10, len: starts[g[g.length - 1]] + d - g0, el: targets[g[0]], motion: m.id }));
    }
  }
  return m;
}

// Time from 90% travel to the end, as a fraction of the duration (the imperceptible settle).
function arrivalTail(ease) { return 1 - arrivalFrac(ease); }

function mapDefaults(o) { const r = {}; for (const k of Object.keys(o)) r[k] = DEFAULTS[k]; return r; }

// ---------- SVG helpers ----------
export function svg(markup, { w, h, vb = `0 0 ${w} ${h}`, cls = '' } = {}) {
  return `<svg class="${cls}" width="${w}" height="${h}" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" fill="none">${markup}</svg>`;
}
