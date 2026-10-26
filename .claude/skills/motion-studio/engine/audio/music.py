"""Score generator. The arrangement (production music.json) is written in beats on the same
grid as the picture, so every cut that sits on a beat sits on a musical event by construction.
Returns the music stem, a sidechain key, and the list of percussive onsets (for QA)."""
import numpy as np
from dsp import (SR, n_of, noise, sine, saw, env_ad, env_adsr, filt, sweep_filter, stereo, pan,
                 reverb, saturate, place, db)

NOTE = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}
QUALITY = {'': [0, 4, 7], 'm': [0, 3, 7], 'm9': [0, 3, 7, 10, 14], 'maj7': [0, 4, 7, 11], '7': [0, 4, 7, 10], 'sus2': [0, 2, 7], 'sus4': [0, 5, 7], 'add9': [0, 4, 7, 14], 'madd9': [0, 3, 7, 14]}


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def parse_chord(name):
    root = name[:2] if len(name) > 1 and name[1] in '#b' else name[:1]
    return NOTE[root], QUALITY[name[len(root):]]


def active(sections, layer, beat):
    return any(a <= beat < b for a, b in sections.get(layer, []))


def chord_at(chords, beat):
    cur = chords[0][1]
    for b, c in chords:
        if b <= beat:
            cur = c
    return cur


# ---------- instruments ----------
def kick(vel=1.0, seed=0):
    d = 0.5
    n = n_of(d)
    t = np.arange(n) / SR
    f = 44 + 110 * np.exp(-t / 0.035)
    y = sine(f) * env_ad(n, 0.0015, 0.42)
    y += filt(noise(d, seed), 'bandpass', (2000, 6000)) * env_ad(n, 0.0002, 0.006) * 0.25
    return saturate(y * vel, 1.5)


def clap(vel=1.0, seed=0):
    d = 0.6
    n = n_of(d)
    nz = filt(noise(d, seed), 'bandpass', (900, 5200))
    e = np.zeros(n)
    for i, off in enumerate([0, 0.009, 0.019, 0.028]):
        s = n_of(off)
        e[s:] += env_ad(n - s, 0.0005, 0.05 if i < 3 else 0.32) * (0.8 if i < 3 else 1.0)
    return reverb(stereo(nz * e * vel * 0.7), wet=0.3, dur=1.4, seed=31)


def hat(vel=1.0, open_=False, seed=0):
    d = 0.35 if open_ else 0.08
    n = n_of(d)
    y = filt(noise(d, seed), 'highpass', 7500) * env_ad(n, 0.0004, 0.28 if open_ else 0.035)
    return y * vel * 0.35


def bass_note(midi, dur, cutoff=600, seed=0):
    n = n_of(dur)
    f = hz(midi)
    y = 0.7 * saw(f * 0.998, dur) + 0.5 * saw(f * 1.002, dur)
    y = filt(y, 'lowpass', cutoff, 2)
    y = y * 0.6 + sine(f, dur) * 0.7
    return saturate(y * env_adsr(n, 0.004, 0.12, 0.7, min(0.06, dur * 0.3)), 1.3)


def pad_chord(midis, dur, cutoff=1800, seed=0):
    n = n_of(dur)
    out = np.zeros((n, 2))
    for i, m in enumerate(midis):
        for j, det in enumerate((-0.11, -0.04, 0.04, 0.11)):
            f = hz(m) * 2 ** (det / 12)
            v = saw(f, dur, phase=((seed + i * 7 + j * 3) % 11) / 11)
            out += pan(v, (j - 1.5) / 1.5 * 0.7) / (len(midis) * 2.5)
    out = filt(out, 'lowpass', cutoff, 2)
    return out * env_adsr(n, 0.6, 0.4, 0.85, min(1.2, dur * 0.4))[:, None]


def pluck(midi, seed=0, vel=1.0):
    d = 0.7
    n = n_of(d)
    f = hz(midi)
    y = saw(f, d) * 0.6 + sine(f * 2, d) * 0.2
    y = sweep_filter(y, 'lowpass', 300 + 4500 * np.exp(-np.arange(n) / SR / 0.06))
    return y * env_ad(n, 0.002, 0.45) * vel


def drone(root_midi, dur, beats_open, seed=0):
    n = n_of(dur)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for m, a in [(root_midi, 1.0), (root_midi + 7, 0.5), (root_midi + 12, 0.3)]:
        y += a * (saw(hz(m) * 0.997, dur) + saw(hz(m) * 1.003, dur)) / 2
    # Open enough from the first frame to be heard on a phone speaker (fundamental ~73 Hz is not).
    cutoff = 380 + 1400 * (t / dur) ** 2
    y = sweep_filter(y, 'lowpass', cutoff)
    y += 0.5 * sine(hz(root_midi), dur)
    air = sweep_filter(noise(dur, seed + 5, 'pink'), 'bandpass', 900 + 3000 * (t / dur) ** 2, bw=1.5) * 0.12
    swell_env = np.minimum(1, t / 0.08) * (0.6 + 0.4 * (t / dur) ** 1.5)
    return (y * 0.35 + air) * swell_env


# ---------- arrangement ----------
def render(arr, duration):
    bpm = arr['bpm']
    spb = 60 / bpm
    beats = arr['beats']
    sec = arr['sections']
    chords = arr['chords']
    n = n_of(duration) + n_of(4.0)
    drums = np.zeros((n, 2))
    tonal = np.zeros((n, 2))
    key = np.zeros(n)
    onsets = []

    def at(b):
        return n_of(b * spb)

    stops = arr.get('stops', [])

    def stopped(b):
        return any(s <= b < np.ceil(s + 1e-6) for s in stops)

    # Drone across the tension act.
    for a, b in sec.get('drone', []):
        d = drone(arr['root'] - 24, (b - a) * spb, b - a, seed=1)
        place(tonal, stereo(d * db(1)), at(a))

    # Heartbeat: lub-dub on each downbeat.
    for a, b in sec.get('heartbeat', []):
        for bar in np.arange(a, b, 4):
            for off, v in [(0, 1.0), (0.5, 0.55)]:
                if stopped(bar + off):
                    continue
                place(drums, stereo(kick(v, seed=int(bar)) * db(-3)), at(bar + off))
                key[at(bar + off):at(bar + off) + n_of(0.25)] = np.maximum(key[at(bar + off):at(bar + off) + n_of(0.25)], v)
                onsets.append(bar + off)

    # Build: 8th bass pulse with a filter opening, four-on-the-floor from the half point.
    for a, b in sec.get('pulse', []):
        steps = np.arange(a, b, 0.5)
        for i, s in enumerate(steps):
            if stopped(s):
                continue
            u = (s - a) / (b - a)
            place(tonal, stereo(bass_note(arr['root'] - 24, spb * 0.45, 260 + 2600 * u ** 2, seed=i) * db(-8)), at(s))
    for a, b in sec.get('four', []):
        for s in np.arange(a, b, 1.0):
            if stopped(s):
                continue
            place(drums, stereo(kick(0.9, seed=int(s * 4)) * db(-3)), at(s))
            onsets.append(s)
            key[at(s):at(s) + n_of(0.2)] = 1

    # Groove: half-time. Kick on 1 and the and-of-3, clap on 3, hats on 8ths.
    for a, b in sec.get('kick', []):
        for bar in np.arange(a, b, 4):
            for off, v in [(0, 1.0), (2.5, 0.75)]:
                s = bar + off
                if s >= b or stopped(s):
                    continue
                place(drums, stereo(kick(v, seed=int(s * 4)) * db(-2)), at(s))
                onsets.append(s)
                key[at(s):at(s) + n_of(0.22)] = np.maximum(key[at(s):at(s) + n_of(0.22)], v)
    for a, b in sec.get('clap', []):
        for bar in np.arange(a, b, 4):
            s = bar + 2
            if s < b and not stopped(s):
                place(drums, clap(1.0, seed=int(s)) * db(-7), at(s))
                onsets.append(s)
    for a, b in sec.get('hats', []):
        for i, s in enumerate(np.arange(a, b, 0.5)):
            if stopped(s):
                continue
            v = 1.0 if (s % 1) else 0.55
            place(drums, pan(hat(v, open_=(s % 4 == 3.5), seed=int(s * 8)), 0.25) * db(-10), at(s))
    for a, b in sec.get('hats16', []):
        for s in np.arange(a, b, 0.25):
            if stopped(s) or (s % 0.5) == 0:
                continue
            place(drums, pan(hat(0.5, seed=int(s * 16) + 3), -0.25) * db(-14), at(s))

    # Bass: root of the chord, re-struck on 1 and the and-of-3 with the kick.
    for a, b in sec.get('bass', []):
        for bar in np.arange(a, b, 4):
            root, _ = parse_chord(chord_at(chords, bar))
            midi = arr['root'] - 24 + ((root - (arr['root'] % 12)) % 12)
            for off, length in [(0, 2.4), (2.5, 1.4)]:
                s = bar + off
                if s >= b or stopped(s):
                    continue
                place(tonal, stereo(bass_note(midi, min(length, b - s) * spb, 700, seed=int(s)) * db(-7)), at(s))

    # Pad: chord per change, voiced around D3-A4.
    for a, b in sec.get('pad', []):
        changes = [c for c in chords if a <= c[0] < b]
        if not changes or changes[0][0] > a:
            changes = [(a, chord_at(chords, a))] + changes
        for i, (cb, name) in enumerate(changes):
            end = changes[i + 1][0] if i + 1 < len(changes) else b
            root, q = parse_chord(name)
            base = 50 + ((root - 2) % 12)
            if base > 56:
                base -= 12
            voicing = [base + iv for iv in q] + [base + 12]
            p = pad_chord(voicing, (end - cb) * spb + 0.8, 1500 + 400 * (i % 3), seed=i)
            place(tonal, p * db(-9), at(cb))

    # Arp: 16ths over chord tones, two octaves up, alternating sides.
    for a, b in sec.get('arp', []):
        for k, s in enumerate(np.arange(a, b, 0.25)):
            if stopped(s):
                continue
            root, q = parse_chord(chord_at(chords, s))
            tones = [62 + ((root - 2) % 12) + iv for iv in q]
            m = tones[[0, 1, 2, 1, 0, 2, 1, 2][k % 8] % len(tones)] + 12
            v = 1.0 if (s % 1) == 0 else 0.6
            place(tonal, pan(pluck(m, seed=k, vel=v), 0.35 if k % 2 else -0.35) * db(-17), at(s))

    # Sidechain: pull tonal parts down under kicks so the low end stays clean.
    from scipy.signal import lfilter
    r = np.exp(-1 / (0.14 * SR))
    env = lfilter([1 - r], [1, -r], key)
    env /= env.max() + 1e-9
    duck = 1 - 0.45 * env
    tonal *= duck[:, None]

    music = reverb(tonal, wet=0.18, dur=2.6, seed=37)[:n] + drums
    # A stop is real silence: the whole bus, reverb tails included, gates out until the next beat,
    # so the hit that follows lands on nothing (contrast is what makes it big).
    gate = np.ones(n)
    for s0 in stops:
        a, b = at(s0), at(np.ceil(s0 + 1e-6))
        f = n_of(0.015)
        gate[a - f:a] = np.minimum(gate[a - f:a], np.linspace(1, 0, f))
        gate[a:b] = 0
    music *= gate[:, None]
    music = music[:n_of(duration)]
    fade_n = n_of(arr.get('fade_out', 2.5))
    music[-fade_n:] *= np.linspace(1, 0, fade_n)[:, None] ** 1.5
    return music, sorted(set(round(o, 4) for o in onsets))
