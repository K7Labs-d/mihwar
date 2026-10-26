"""Sound for the picture.
    python3 mix.py <production-dir> [--format WxH]
Reads out/<fmt>/manifest.json (cues with resolved pan, written by probe.mjs) and the
production's music.json, renders the score and every cue, mixes, and masters to the delivery
loudness. Writes out/<fmt>/audio/{music,sfx,mix}.wav and audio.json."""
import json
import os
import re
import subprocess
import sys
import zlib

import numpy as np
from scipy.io import wavfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dsp import SR, n_of, place, db, limiter, envelope_follower  # noqa: E402
from sfx import RECIPES  # noqa: E402
import music as score  # noqa: E402

TARGET_LUFS = -14.0      # streaming/social normalisation reference (YouTube, Instagram, TikTok)
CEILING_DBTP = -1.5      # leaves headroom for AAC encoding overshoot; delivered TP must be <= -1.0


def measure(path):
    out = subprocess.run(['ffmpeg', '-nostats', '-i', path, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    summary = out[out.rfind('Summary:'):]
    lufs = float(re.search(r'I:\s+(-?[\d.]+) LUFS', summary).group(1))
    tp = float(re.search(r'Peak:\s+(-?[\d.inf]+) dBFS', summary).group(1))
    return lufs, tp


def write(path, x):
    wavfile.write(path, SR, x.astype(np.float32))


def stable_seed(*parts):
    return zlib.crc32('|'.join(map(str, parts)).encode()) & 0x7FFFFFFF


def main():
    args = sys.argv[1:]
    prod = os.path.abspath(args[0])
    fmt = args[args.index('--format') + 1] if '--format' in args else None
    sys.path.insert(0, prod)
    if fmt is None:
        fmt = sorted(d for d in os.listdir(os.path.join(prod, 'out')) if 'x' in d)[0]
    out = os.path.join(prod, 'out', fmt)
    man = json.load(open(os.path.join(out, 'manifest.json')))
    arr = json.load(open(os.path.join(prod, 'music.json')))
    fps, spb, duration = man['cfg']['fps'], man['spb'], man['duration']
    assert abs(arr['bpm'] - man['cfg']['bpm']) < 1e-9, 'music.json bpm must equal production bpm'
    adir = os.path.join(out, 'audio')
    os.makedirs(adir, exist_ok=True)

    # ---- score ----
    mus, onsets = score.render(arr, duration)

    # ---- effects: each cue's sync sample lands on its frame ----
    n = n_of(duration)
    fx = np.zeros((n + n_of(4), 2))
    rendered = []
    last_pitch = {}
    for c in sorted(man['cues'], key=lambda c: c['t']):
        base = c['name'].split('.')[0]
        if base not in RECIPES:
            raise SystemExit(f"unknown sound '{c['name']}' (cue {c['id']})")
        seed = stable_seed(c['name'], c['id'])
        pitch = c.get('pitch', 0)
        if base in ('whoosh', 'swell', 'land', 'tick', 'draw'):
            pitch += (seed % 5 - 2) * 0.5          # +-1 semitone, so repeats never sound copied
            if last_pitch.get(base) == pitch:
                pitch += 0.5
            last_pitch[base] = pitch
        sig, sync = RECIPES[base](seed, length=c.get('len') or 0.5, pitch=pitch)
        sig = sig * db(c.get('gain', 0))
        p = float(np.clip(c.get('pan', 0), -1, 1))
        if abs(p) > 1e-3:  # equal-power balance on a stereo source
            th = (p + 1) * np.pi / 4
            sig = sig * np.array([np.cos(th), np.sin(th)]) * np.sqrt(2)
        start = n_of(c['t']) - sync
        place(fx, sig, start)
        rendered.append({'id': c['id'], 'name': c['name'], 't': c['t'], 'start': float(start / SR), 'sync': float(sync / SR), 'pan': p, 'pitch': float(pitch)})
    fx = fx[:n]

    # ---- mix: music sits under the effects ----
    mus = mus[:n]
    key = envelope_follower(fx, 0.003, 0.18)
    key /= key.max() + 1e-9
    mus_ducked = mus * (1 - 0.35 * key)[:, None]
    m_gain, f_gain = db(arr.get('music_gain_db', -2)), db(arr.get('sfx_gain_db', 0))
    mix = mus_ducked * m_gain + fx * f_gain
    fade = n_of(0.02)
    mix[:fade] *= np.linspace(0, 1, fade)[:, None]

    # ---- master: gain to target loudness, true-peak limit, re-measure ----
    tmp = os.path.join(adir, '_tmp.wav')
    g = 0.0
    for _ in range(4):
        y = limiter(mix * db(g), CEILING_DBTP)
        write(tmp, y)
        lufs, tp = measure(tmp)
        if abs(lufs - TARGET_LUFS) < 0.3:
            break
        g += TARGET_LUFS - lufs
    os.remove(tmp)
    write(os.path.join(adir, 'mix.wav'), y)
    write(os.path.join(adir, 'music.wav'), mus * m_gain * db(g))
    write(os.path.join(adir, 'sfx.wav'), fx * f_gain * db(g))

    # ---- static audio lint: every cut needs a transient on its frame ----
    frame = 1 / fps
    problems = []
    for s in man['shots']:
        t = s['t0']
        hits = [o * spb for o in onsets if abs(o * spb - t) <= frame + 1e-6]
        cues = [r for r in rendered if abs(r['t'] - t) <= frame + 1e-6]
        if not hits and not cues:
            problems.append({'level': 'FAIL', 'rule': 'cut-has-sound', 'shot': s['id'], 't': t, 'msg': 'no music onset or effect on the cut frame'})
    info = {'lufs': lufs, 'true_peak_dbtp': tp, 'master_gain_db': float(g), 'music_onsets_beats': [float(o) for o in onsets], 'cues': rendered, 'problems': problems}
    json.dump(info, open(os.path.join(adir, 'audio.json'), 'w'), ensure_ascii=False, indent=1)
    print(f"audio: {lufs:.1f} LUFS, true peak {tp:.1f} dBTP, {len(rendered)} cues, {len(onsets)} music onsets, {len(problems)} cut problems")
    for p in problems:
        print(f"  {p['level']} {p['rule']} {p['shot']} @ {p['t']:.3f}s: {p['msg']}")
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
