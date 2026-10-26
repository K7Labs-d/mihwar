// محور · قريبًا — 28 s teaser, 120 BPM (15 frames per beat at 30 fps), 56 beats.
// Story, copy and sources: story.md. Every beat number below is an absolute or shot-relative beat.
export const config = {
  title: 'MIHWAR — Coming soon',
  brand: 'mihwar',
  fps: 30,
  bpm: 120,
  beats: 56,
  formats: ['1920x1080'],
  fonts: ['600 96px "Noto Sans Arabic"', '400 52px "Noto Sans Arabic"', '500 170px "Noto Kufi Arabic"', '500 34px "Noto Sans"'],
  render: { samples: 4, shutter: 180 },
};

const CX = 960, CY = 540;

const ICON = {
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  box: '<path d="M12 2.8 20.5 7.5v9L12 21.2 3.5 16.5v-9Z"/><path d="M3.5 7.5 12 12.2l8.5-4.7M12 12.2v9"/>',
  shield: '<path d="M12 2.8 19.5 5.6v5.9c0 4.6-3.1 8-7.5 9.7-4.4-1.7-7.5-5.1-7.5-9.7V5.6Z"/><path d="m8.8 12 2.2 2.2 4.3-4.4"/>',
  file: '<path d="M14 2.8H6.5a1.7 1.7 0 0 0-1.7 1.7v15a1.7 1.7 0 0 0 1.7 1.7h11a1.7 1.7 0 0 0 1.7-1.7V8Z"/><path d="M14 2.8V8h5.2M8.5 13h7M8.5 17h5"/>',
  tag: '<path d="M3 11.6V4.5A1.5 1.5 0 0 1 4.5 3h7.1l9 9a1.5 1.5 0 0 1 0 2.1l-6.5 6.5a1.5 1.5 0 0 1-2.1 0Z"/><circle cx="7.8" cy="7.8" r="1.4"/>',
  chat: '<path d="M20.5 14.5a2 2 0 0 1-2 2H8l-4.5 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Z"/>',
  bubble: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2.5 21.5Z"/>',
};
const icon = (name, size, cls = '') =>
  `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;

// The mark, part by part, so each part can be animated. Proportions: brands/mihwar/mark.svg.
const MARK = size => `
<svg class="mark" width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" stroke-linecap="butt">
  <circle class="m-ring" cx="50" cy="50" r="40" stroke="var(--gold)" stroke-width="2.1" pathLength="1" transform="rotate(-90 50 50)"/>
  <path class="m-tick" d="M50 26.1V5.6" stroke="var(--gold)" stroke-width="2.1" pathLength="1"/>
  <path class="m-tick" d="M73.9 50H94.4" stroke="var(--gold)" stroke-width="2.1" pathLength="1"/>
  <path class="m-tick" d="M50 73.9V94.4" stroke="var(--gold)" stroke-width="2.1" pathLength="1"/>
  <path class="m-tick" d="M26.1 50H5.6" stroke="var(--gold)" stroke-width="2.1" pathLength="1"/>
  <g class="m-core"><circle cx="50" cy="50" r="19.5" stroke="var(--gold)" stroke-width="1.9"/><path d="M50 37.3 62.7 50 50 62.7 37.3 50Z" fill="var(--gold)"/></g>
</svg>`;

const NODE = (ic, size) => `
<div class="node" style="width:${size}px;height:${size}px">
  <div class="halo"></div>
  <svg class="node-ring" width="${size}" height="${size}" viewBox="0 0 100 100" fill="none"><circle cx="50" cy="50" r="46" stroke="var(--gold)" stroke-width="1.6" pathLength="1" transform="rotate(-90 50 50)"/></svg>
  <div class="node-ico">${icon(ic, size * 0.42)}</div>
</div>`;

// Category line drawings, after the dossier's p.1 illustrations (categories only, not listed stock).
const DRAW = {
  dig: `
    <path d="M14 188H286"/>
    <path d="M40 154h106a16 16 0 0 1 0 32H40a16 16 0 0 1 0-32Z"/>
    <circle cx="44" cy="170" r="7"/><circle cx="76" cy="170" r="7"/><circle cx="108" cy="170" r="7"/><circle cx="140" cy="170" r="7"/>
    <path d="M30 154V122h120l8 32"/>
    <path d="M44 122V84h40l14 38"/><path d="M52 114V92h26l9 22Z"/>
    <path d="M140 124 196 52l12 8-56 70"/>
    <path d="M202 56 252 122l-8 8-48-62"/>
    <path d="M160 116 188 78"/>
    <path d="M244 120l22 4-4 30-28-12Z"/>`,
  lift: `
    <path d="M14 188H286"/>
    <path d="M28 160V140h196v20Z"/>
    <path d="M224 160V112h30l16 22v26Z"/><path d="M232 134v-14h20l9 14Z"/>
    <circle cx="60" cy="172" r="13"/><circle cx="96" cy="172" r="13"/><circle cx="196" cy="172" r="13"/><circle cx="240" cy="172" r="13"/>
    <path d="M84 140v-18h56v18"/>
    <path d="M100 122 252 22l10 10-114 92"/>
    <path d="M118 112l16 2 10-18 16 2 10-18 16 2 10-18 16 2 10-18 16 2"/>
    <path d="M258 28v58"/><path d="M252 86h12v8a6 6 0 1 1-12 0"/>`,
  handle: `
    <path d="M14 188H286"/>
    <path d="M44 168V112h96l16 28v28"/>
    <path d="M44 112c-14 6-18 30-12 56"/>
    <path d="M70 112V56h62l14 56"/>
    <path d="M90 112V92h20"/>
    <path d="M170 34v144M184 34v144"/>
    <path d="M184 178h70"/>
    <path d="M194 128h52v46h-52Z"/><path d="M194 150h52"/>
    <circle cx="74" cy="170" r="16"/><circle cx="136" cy="170" r="16"/>`,
};
const drawing = (k, w) => `<svg class="equip" width="${w}" height="${(w * 200) / 300}" viewBox="0 0 300 200" fill="none" stroke="var(--gold)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${DRAW[k].replace(/<(path|circle)/g, '<$1 pathLength="1"')}</svg>`;

export function build(S, rt) {
  const { Ease, noise1 } = rt;

  // ---------- persistent background: blueprint grid with a slow drift ----------
  const bg = S.persistent('bg', { cls: 'bg' });
  const grid = bg.item('<div class="grid"></div>', { x: CX, y: CY, w: 2400, h: 1500 });
  S.tween(grid, { x: 0, z: -200 }, { x: -90, z: -120 }, 0, S.duration, Ease.linear);

  // ---------- 1 · need (0–4) ----------
  {
    const s = S.shot('need', { at: 0, beats: 4 });
    const node = s.item(NODE('user', 180), { x: 1260, y: 400, w: 180, h: 180 });
    pingNode(S, s, node, 0);
    const h = s.text('مشروع ينتظر معدة.', { cls: 'h1 hook' });
    s.place(h, { x: 1260, y: 630 });
    s.enter(h, 'rise', { land: 0.5 });   // the cut on beat 4 is its exit
    s.camera({ z: 90, x: -40, ry: -3.5 });
  }

  // ---------- 2 · idle (4–8): mirror of shot 1 ----------
  {
    const s = S.shot('idle', { at: 4, beats: 4 });
    const node = s.item(NODE('box', 180), { x: 660, y: 400, w: 180, h: 180 });
    pingNode(S, s, node, 0);
    const h = s.text('ومعدة تنتظر مشروعًا.', { cls: 'h1 hook' });
    s.place(h, { x: 660, y: 630 });
    s.enter(h, 'rise', { land: 0.5 });
    s.camera({ z: 90, x: 40, ry: 3.5 });
  }

  // ---------- 3 · scatter (8–16): tangled lines, scattered chat, then the axis ----------
  {
    const s = S.shot('scatter', { at: 8, beats: 8 });
    const XR = 1500, XL = 420, Y = CY, R = 64;
    const back = s.depth(-180);
    const svgEl = s.item(`<svg width="1920" height="1080" viewBox="0 0 1920 1080" fill="none">${Array.from({ length: 9 }, (_, k) =>
      `<path class="tangle" pathLength="1" stroke="var(--gold)" stroke-width="${1.4 + (k % 3) * 0.5}" stroke-opacity="${0.28 + (k % 4) * 0.12}"/>`).join('')}</svg>`, { x: CX, y: CY, w: 1920, h: 1080, parent: back });
    const paths = [...svgEl.querySelectorAll('path')];
    const nR = s.item(NODE('user', 120), { x: XR, y: Y, w: 120, h: 120 });
    const nL = s.item(NODE('box', 120), { x: XL, y: Y, w: 120, h: 120 });
    s.enter(nR, 'pop', { land: 0, sfx: 'tick' });
    s.enter(nL, 'pop', { land: 0.25, sfx: 'tick' });

    // Lines: drawn from the need (right) toward the equipment (left), wandering, then forced straight.
    s.draw(paths, { a: 0, b: 1.5, stagger: 3, ease: Ease.move, sfx: 'draw', gain: -14, label: 'tangle draws' });
    const chaosIn = s.t(0), chaosPeak = s.t(4), straight0 = s.t(5.5), straight1 = s.t(7), collapse0 = s.t(7), collapse1 = s.t(7.5);
    S.every(t => {
      if (t < s.t0 || t >= s.t1) return;
      const grow = Math.min(1, Math.max(0, (t - chaosIn) / (chaosPeak - chaosIn)));
      const calm = Ease.snap(Math.min(1, Math.max(0, (t - straight0) / (straight1 - straight0))));
      const shrink = Ease.in(Math.min(1, Math.max(0, (t - collapse0) / (collapse1 - collapse0))));
      const amp = (120 + 170 * grow) * (1 - calm);
      const xr = XR - R + (CX - (XR - R)) * shrink, xl = XL + R + (CX - (XL + R)) * shrink;
      paths.forEach((p, k) => {
        const pts = [];
        for (let i = 0; i <= 7; i++) {
          const u = i / 7, env = Math.pow(Math.sin(Math.PI * u), 0.7);
          pts.push([xr + (xl - xr) * u + env * 70 * noise1(t * 0.9 + k * 5.3 + i * 2.1, 3 + k) * (1 - calm),
            Y + env * amp * noise1(t * 0.7 + k * 3.7 + i * 1.9, 11 + k)]);
        }
        p.setAttribute('d', catmull(pts));
      });
    });
    // The riser climbs with the chaos and ends where the lines lock (90% of the snap ease).
    s.proc('tangle tightens', { a: 4, b: 6.5, sfx: { name: 'riser', at: 6.5, len: S.b(2.5), gain: -9 } });
    s.proc('lines snap into one axis', { a: 5.5, b: 7, sfx: [{ name: 'snap', at: 6.5, gain: -6 }] });
    s.move(nR, {}, { x: CX - XR, s: 0.2, o: 0 }, { a: 7, b: 7.5, ease: Ease.in, sfx: 'swell', gain: -12, label: 'right node collapses' });
    s.move(nL, {}, { x: CX - XL, s: 0.2, o: 0 }, { a: 7, b: 7.5, ease: Ease.in, sfx: false, silent: 'mirrors the right node; one swell covers both', label: 'left node collapses' });
    const spark = s.item('<div class="spark"></div>', { x: CX, y: CY, w: 28, h: 28 });
    s.enter(spark, 'pop', { land: 7.5, sfx: 'tick' });

    // Scattered chat: each bubble pops on a 16th note with its own pitch and pan.
    const blips = [[8.25, 1180, 380], [8.75, 760, 690], [9.25, 1010, 330], [9.5, 1290, 650], [10, 640, 410], [10.5, 1120, 720], [11, 860, 360], [11.5, 1340, 450], [12.25, 700, 640], [12.75, 1050, 680]];
    blips.forEach(([beat, x, y], i) => {
      const b = s.item(icon('bubble', 46, 'blip'), { x, y, w: 46, h: 46 });
      b.firstElementChild.style.transform = `rotate(${(i % 2 ? -1 : 1) * 8}deg)`;
      s.enter(b, 'pop', { land: beat - 8, sfx: 'blip' });
      s.exit(b, 'away', { at: 5.5 + (i % 3) * 0.25, sfx: false, silent: 'bubbles fold into the axis under the snap' });
    });

    const a = s.text('محادثات متفرقة، ومتابعة منفصلة.', { cls: 'h2' });
    s.place(a, { x: CX, y: 860 });
    s.enter(a, 'rise', { lands: [0.5, 0.75, 2.5, 2.75] });
    s.exit(a, 'sink', { at: 5.5 });
    s.camera({ z: 160, ry: -2, rx: 2 });
  }

  // ---------- 4 · reveal (16–24): the drop. The point becomes the mark ----------
  {
    const s = S.shot('reveal', { at: 16, beats: 8, persp: 1600 });
    const glow = s.item('<div class="glow"></div>', { x: CX, y: CY, w: 1100, h: 1100 });
    const shock = s.item('<div class="shock"></div>', { x: CX, y: CY, w: 320, h: 320 });
    const markBox = s.item(MARK(300), { x: CX, y: CY, w: 300, h: 300 });
    impact(S, s, { glow, shock, markBox });
    s.move(markBox, { y: 0, s: 1 }, { y: -150, s: 0.78 }, { a: 1, b: 1.75, sfx: 'whoosh', gain: -14, label: 'mark rises to make room for the name' });
    S.tween(glow, {}, { y: -150 }, s.t(1), s.t(1.75), Ease.move);

    const word = s.text('محور', { cls: 'wordmark' });
    s.place(word, { x: CX, y: 625 });
    s.enter(word, 'dolly', { land: 1.75, sfx: ['whoosh', 'land'] });
    const lat = s.text('MIHWAR', { cls: 'latin-mark latin', split: 'none' });
    s.place(lat, { x: CX, y: 770, w: 900 });
    s.enter(lat, 'rise', { land: 2.25, sfx: ['tick'] });
    S.track(lat, 'ls', 1.4, 0.62, s.t(1.9), s.t(3.25), Ease.out);
    const tag = s.text('منظومة رقمية لتأجير المعدات', { cls: 'tagline' });
    s.place(tag, { x: CX, y: 870 });
    s.enter(tag, 'rise', { land: 3 });
    s.camera({ z: 110, ry: -3 });
  }

  // ---------- 5 · connect (24–30): one straight line between the two sides ----------
  {
    const s = S.shot('connect', { at: 24, beats: 6 });
    const Y = 430;
    const nR = s.item(NODE('user', 130), { x: 1480, y: Y, w: 130, h: 130 });
    const nL = s.item(NODE('box', 130), { x: 440, y: Y, w: 130, h: 130 });
    const mk = s.item(MARK(170), { x: CX, y: Y, w: 170, h: 170 });
    s.enter(mk, 'pop', { land: 0, sfx: 'tick' });
    s.enter(nR, 'swing', { land: 0.25, sfx: 'whoosh' });
    s.enter(nL, 'swing', { land: 0.5, sfx: ['land'] });
    const line = s.item(`<svg width="1920" height="40" viewBox="0 0 1920 40" fill="none"><path class="axis" d="M1408 20H1048" pathLength="1"/><path class="axis" d="M872 20H512" pathLength="1"/></svg>`, { x: CX, y: Y, w: 1920, h: 40 });
    s.draw(line.querySelectorAll('path'), { a: 0.75, b: 1.75, stagger: 6, ease: Ease.move, sfx: 'draw', gain: -12, label: 'axis connects the sides' });
    const dot = s.item('<div class="pulse"></div>', { x: 1408, y: Y, w: 22, h: 22 });
    S.tween(dot, { o: 0 }, { o: 0 }, s.t(0), s.t(0), Ease.linear);
    for (const [a, b] of [[2, 3], [4, 5]]) {
      S.tween(dot, { o: 0 }, { o: 1 }, s.t(a), s.t(a) + S.f(3), Ease.linear);
      s.move(dot, { x: 0 }, { x: 512 - 1408 }, { a, b, ease: Ease.move, sfx: 'pulse', gain: -12, label: 'pulse crosses the axis' });
      S.tween(dot, { o: 1 }, { o: 0 }, s.t(b) - S.f(3), s.t(b), Ease.linear);
    }
    const h = s.text('يربط صاحب الاحتياج بمالك المعدة.', { cls: 'h2' });
    s.place(h, { x: CX, y: 760 });
    s.enter(h, 'rise', { land: 1 });
    s.camera({ z: 80, x: -30, ry: 3 });
  }

  // ---------- 6 · context (30–36): three panels become one ----------
  {
    const s = S.shot('context', { at: 30, beats: 6 });
    const h = s.text('الطلب والعرض والمتابعة', { cls: 'h2' });
    s.place(h, { x: CX, y: 220 });
    s.enter(h, 'swing', { lands: [0, 0.5, 1], sfx: ['whoosh', 'land'] });
    const xs = [1440, CX, 480], icons = ['file', 'tag', 'chat'];
    const cards = xs.map((x, i) => {
      const c = s.item(`<div class="card">${icon(icons[i], 52, 'card-ico')}<i class="sk" style="width:62%"></i><i class="sk" style="width:84%"></i><i class="sk" style="width:46%"></i></div>`, { x, y: 525, w: 400, h: 260 });
      s.enter(c, 'pop', { land: i * 0.5, sfx: 'tick' });
      return c;
    });
    const rim = s.item(`<div class="card rim"><div class="trio">${icon('file', 46)}${icon('tag', 46)}${icon('chat', 46)}</div><i class="sk" style="width:84%"></i><i class="sk" style="width:46%"></i></div>`, { x: CX, y: 525, w: 400, h: 260 });
    S.tween(rim, { o: 0 }, { o: 0 }, s.t(0), s.t(0), Ease.linear);
    s.move(cards[0], {}, { x: CX - 1440, z: -60 }, { a: 2.25, b: 2.75, ease: Ease.snap, sfx: 'whoosh', gain: -12, land: 'hit', landGain: -11, label: 'right panel merges' });
    s.move(cards[2], {}, { x: CX - 480, z: -60 }, { a: 2.25, b: 2.75, ease: Ease.snap, sfx: false, silent: 'merges with the right panel under one hit', label: 'left panel merges' });
    S.tween(cards[0], {}, { o: 0 }, s.t(2.7), s.t(2.9), Ease.linear);
    S.tween(cards[2], {}, { o: 0 }, s.t(2.7), s.t(2.9), Ease.linear);
    S.tween(cards[1], {}, { s: 1.06 }, s.t(2.6), s.t(2.85), Ease.out);
    S.tween(cards[1], {}, { s: 1.0 }, s.t(2.85), s.t(3.5), Ease.move);
    S.tween(rim, {}, { o: 1 }, s.t(2.6), s.t(2.8), Ease.out);
    S.tween(cards[1], {}, { o: 0 }, s.t(2.7), s.t(2.85), Ease.linear);
    S.tween(rim, { s: 1 }, { s: 1.06 }, s.t(2.6), s.t(2.85), Ease.out);
    S.tween(rim, { s: 1.06 }, { s: 1.0 }, s.t(2.85), s.t(3.5), Ease.move);
    const f = s.text('في سياق واحد.', { cls: 'h2 gold' });
    s.place(f, { x: CX, y: 840 });
    s.enter(f, 'rise', { land: 3 });
    s.camera({ z: 90, rx: -1.5, ry: -2.5 });
  }

  // ---------- 7 · fleet (36–42): the three categories, drawn on the beat ----------
  {
    const s = S.shot('fleet', { at: 36, beats: 6 });
    const cfgs = [['dig', 'حفارات', 1440], ['lift', 'رافعات', CX], ['handle', 'معدات مناولة', 480]];
    cfgs.forEach(([k, label, x], i) => {
      const at = 0.25 + i * 1.25;
      const card = s.item(`<div class="card tall">${drawing(k, 360)}<span class="arrow">←</span></div>`, { x, y: 500, w: 440, h: 470 });
      s.enter(card, 'swing', { land: at - 0.25, sfx: 'whoosh' });
      // Drawing starts before the card lands (and before the cut for the first card): no empty card on screen.
      const m = s.draw(card.querySelectorAll('.equip [pathLength]'), { a: at - 1, b: at + 0.5, stagger: 1, ease: Ease.move, sfx: 'draw', gain: -15, label: `${label} draws` });
      m.cues.push(S.cue(s.t(at + 0.5), 'clank', { gain: -13, pan: ((x - CX) / CX) * 0.6, motion: m.id }));
      const l = s.text(label, { cls: 'label' });
      s.place(l, { x: x + 180, y: 668, ax: 1 });
      s.enter(l, 'rise', { land: at + 0.5, sfx: ['tick'] });
    });
    s.camera({ z: 70, x: 30, ry: -3 });
  }

  // ---------- 8 · three (42–48): three parties, one system ----------
  {
    const s = S.shot('three', { at: 42, beats: 6 });
    const a = s.text('ثلاثة أطراف.', { cls: 'h1' });
    s.place(a, { x: CX, y: 170 });
    s.enter(a, 'rise', { land: 0 });
    const b = s.text('منظومة واحدة.', { cls: 'h1 gold' });
    s.place(b, { x: CX, y: 290 });
    s.enter(b, 'rise', { land: 1 });
    const MY = 610;
    const mk = s.item(MARK(170), { x: CX, y: MY, w: 170, h: 170 });
    s.enter(mk, 'dolly', { land: 1.5, sfx: ['whoosh'] });
    const nodes = [['user', 'المستأجر', 1420, MY], ['box', 'المؤجر', 500, MY], ['shield', 'الإدارة', CX, 850]];
    const lines = s.item(`<svg width="1920" height="1080" viewBox="0 0 1920 1080" fill="none">
      <path class="axis" d="M1355 ${MY}H1055" pathLength="1"/><path class="axis" d="M565 ${MY}H865" pathLength="1"/><path class="axis" d="M${CX} 785V705" pathLength="1"/></svg>`, { x: CX, y: CY, w: 1920, h: 1080 });
    s.draw(lines.querySelectorAll('path'), { a: 1.75, b: 2.5, stagger: 3, sfx: 'draw', gain: -14, label: 'parties connect to the mark' });
    nodes.forEach(([ic, label, x, y], i) => {
      const n = s.item(NODE(ic, 130), { x, y, w: 130, h: 130 });
      s.enter(n, 'pop', { land: 2 + i * 0.5, sfx: 'tick' });
      const l = s.text(label, { cls: 'label muted' });
      if (i === 2) s.place(l, { x: x + 90, y, ax: 0 });
      else s.place(l, { x, y: y + 112 });
      s.enter(l, 'rise', { land: 2.25 + i * 0.5, sfx: ['land'] });
    });
    s.camera({ z: 80, ry: 3 });
  }

  // ---------- 9 · end (48–56): mark, name, coming soon ----------
  {
    const s = S.shot('end', { at: 48, beats: 8, persp: 1600 });
    const glow = s.item('<div class="glow"></div>', { x: CX, y: 400, w: 1000, h: 1000 });
    const shock = s.item('<div class="shock"></div>', { x: CX, y: 400, w: 280, h: 280 });
    const markBox = s.item(MARK(250), { x: CX, y: 400, w: 250, h: 250 });
    impact(S, s, { glow, shock, markBox });
    const word = s.text('محور', { cls: 'wordmark' });
    s.place(word, { x: CX, y: 640 });
    s.enter(word, 'dolly', { land: 0.75 });
    const lat = s.text('MIHWAR', { cls: 'latin-mark latin', split: 'none' });
    s.place(lat, { x: CX, y: 782, w: 900 });
    s.enter(lat, 'rise', { land: 1.25, sfx: ['tick'] });
    S.track(lat, 'ls', 1.4, 0.62, s.t(0.9), s.t(2.25), Ease.out);
    const pill = s.item('<div class="pill"><i></i></div>', { x: CX, y: 905, w: 400, h: 120 });
    const soon = s.text('قريبًا', { cls: 'soon', parent: pill.firstChild });
    s.enter(pill, 'drop', { land: 2.25, sfx: ['whoosh', 'shimmer'] });
    S.cue(s.t(2.25), 'land', { gain: -12 });
    s.camera({ z: 120, ry: -2.5 });
    void soon; // entered through the pill
  }

  // ---------- persistent vignette on top ----------
  S.persistent('vignette', { cls: 'vignette' }).item('<div></div>', { x: CX, y: CY, w: 1920, h: 1080 });

  // ---------- helpers that need the studio ----------
  function pingNode(S, s, node, beat) {
    s.enter(node, 'pop', { land: beat, sfx: 'tick' });
    const halo = node.querySelector('.halo');
    S.tween(halo, { s: 0.8, o: 0.0 }, { s: 1.0, o: 0.9 }, s.t(beat), s.t(beat) + S.f(4), Ease.out);
    S.tween(halo, { s: 1.0, o: 0.9 }, { s: 2.2, o: 0 }, s.t(beat) + S.f(4), s.t(beat + 2), Ease.out);
    S.cue(s.t(beat), 'ping', { gain: -10, pan: 0 });
  }

  function impact(S, s, { glow, shock, markBox }) {
    // The cut is the hit: the frame at the downbeat already shows the burst.
    const t = s.t0;
    S.cue(t, 'hit', { gain: -4 });
    S.cue(t, 'sub', { gain: -6 });
    S.motion({ kind: 'move', label: `${s.id}: shockwave`, t0: t, t1: t + S.b(0.75), tSync: t, shot: s.id, silent: 'carried by the hit on the cut' });
    S.tween(shock, { s: 0.25, o: 1 }, { s: 3.2, o: 0 }, t, t + S.b(0.9), Ease.out);
    S.tween(glow, { s: 0.6, o: 1 }, { s: 1.0, o: 0.55 }, t, t + S.b(1.5), Ease.out);
    S.tween(markBox, { z: 420, rx: 0 }, { z: 0, rx: 0 }, t, t + S.b(0.6), Ease.out);
    const svg = markBox.querySelector('svg');
    const ring = svg.querySelector('.m-ring');
    ring.style.strokeDasharray = '1';
    S.track(ring, 'draw', 0.15, 1, t, t + S.b(0.5), Ease.out);
    const ticks = svg.querySelectorAll('.m-tick');
    ticks.forEach((p, i) => { p.style.strokeDasharray = '1'; S.track(p, 'draw', 0, 1, t + S.f(3 + i), t + S.b(0.5) + S.f(i), Ease.out); });
    const core = svg.querySelector('.m-core');
    S.tween(core, { s: 0, rz: -90 }, { s: 1, rz: 0 }, t + S.b(0.25), t + S.b(0.75), Ease.out);
    const m = S.motion({ kind: 'enter', label: `${s.id}: mark core lands`, t0: t + S.b(0.25), t1: t + S.b(0.75), tSync: t + S.b(0.5), shot: s.id });
    m.cues.push(S.cue(t + S.b(0.5), 'shimmer', { gain: -14 }));
  }
}

function catmull(p) {
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}
