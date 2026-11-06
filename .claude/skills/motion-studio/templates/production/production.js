// <title> — <length> s, <BPM> BPM (<frames per beat> frames per beat at <fps> fps), <beats> beats.
// Copy and sources live in story.md. Beat numbers are shot-relative unless noted.
export const config = {
  title: '<title>',
  brand: 'mihwar',
  fps: 30,
  bpm: 120,
  beats: 16,
  formats: ['1920x1080'],
  fonts: ['600 96px "Noto Sans Arabic"', '500 170px "Noto Kufi Arabic"'],
  render: { samples: 4, shutter: 180 },
};

export function build(S, rt) {
  const { Ease } = rt;

  // 1 · hook (0–4): the first element lands on the cut.
  {
    const s = S.shot('hook', { at: 0, beats: 4 });
    const h = s.text('<line 1 from story.md>', { cls: 'h1' });
    s.place(h, { x: 960, y: 540 });
    s.enter(h, 'rise', { land: 0 });
    s.exit(h, 'lift', { at: 3.25 });
    s.camera({ z: 90, ry: -3 });
  }

  // 2 · logo (4–16): the hit is the cut.
  {
    const s = S.shot('logo', { at: 4, beats: 12 });
    const mark = s.item('<img src="/brand/mark.svg" width="240" height="240">', { x: 960, y: 420, w: 240, h: 240 });
    s.enter(mark, 'dolly', { land: 0, sfx: ['whoosh', 'land'] });
    S.cue(s.t0, 'hit', { gain: -4 });
    const w = s.text('<wordmark>', { cls: 'wordmark' });
    s.place(w, { x: 960, y: 650 });
    s.enter(w, 'rise', { land: 1 });
    s.camera({ z: 120, ry: -2 });
  }
}
