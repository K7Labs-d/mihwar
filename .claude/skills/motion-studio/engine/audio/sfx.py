"""SFX library. Every recipe returns (stereo signal, sync_index): sync_index is the sample
that must land on the cue time (a transient, the loudest instant, or the end of a swell).
`length` is the duration of the motion the sound belongs to, so sounds scale with motion."""
import numpy as np
from dsp import (SR, n_of, t_axis, noise, sine, saw, env_ad, filt, sweep_filter, stereo, widen,
                 reverb, saturate, fade, rng)


def _pitch(p):
    return 2 ** (p / 12)


def whoosh(seed, length=0.6, pitch=0.0, bright=1.0):
    """Air past the lens. Fast attack to the sync point (peak speed), long decay like an ease-out."""
    dur = float(np.clip(length * 1.3, 0.28, 1.1))
    pre = 0.07
    n = n_of(pre + dur)
    x = 0.6 * noise(pre + dur, seed, 'pink') + 0.4 * noise(pre + dur, seed + 1)
    k = _pitch(pitch)
    t = np.arange(n) / SR
    peak = pre
    f = np.where(t < peak, 700 + 2000 * (t / peak) ** 2, 2700 * np.exp(-(t - peak) / (dur * 0.45)) + 500) * k * bright
    y = sweep_filter(x, 'bandpass', f, bw=1.3)
    e = np.where(t < peak, (t / peak) ** 2.2, np.exp(-(t - peak) * 5.2 / dur))
    y = fade(y * e, 0.001, 0.03)
    y /= np.max(np.abs(y)) + 1e-9
    return widen(stereo(y), 0.35, seed), n_of(peak)


def swell(seed, length=0.5, pitch=0.0):
    """Reverse air that stops dead on the sync point (exit or cut)."""
    dur = float(np.clip(length, 0.25, 0.9))
    n = n_of(dur)
    t = np.arange(n) / SR
    x = noise(dur, seed, 'pink')
    f = (500 + 3800 * (t / dur) ** 2) * _pitch(pitch)
    y = sweep_filter(x, 'lowpass', f)
    y *= (t / dur) ** 3
    y = fade(y, 0.002, 0.004)
    y /= np.max(np.abs(y)) + 1e-9
    return widen(stereo(y), 0.4, seed), n - 1


def land(seed, length=None, pitch=0.0):
    """Soft low thump with a felt click: something settling into place."""
    dur = 0.32
    n = n_of(dur)
    t = t_axis(dur)
    k = _pitch(pitch)
    f = (60 + 90 * np.exp(-t / 0.025)) * k
    body = sine(f) * env_ad(n, 0.002, 0.22)
    click = filt(noise(dur, seed), 'bandpass', (1500, 5000)) * env_ad(n, 0.0005, 0.012)
    y = saturate(body * 0.9 + click * 0.35, 1.4)
    return reverb(fade(y, 0.0005, 0.02), wet=0.12, dur=0.9, seed=3), n_of(0.0015)


def tick(seed, length=None, pitch=0.0):
    """UI tick: tiny, dry, precise."""
    dur = 0.09
    n = n_of(dur)
    k = _pitch(pitch + (seed % 3) - 1)
    y = sine(2400 * k, dur) * env_ad(n, 0.0004, 0.03) * 0.6
    y += filt(noise(dur, seed), 'highpass', 3500) * env_ad(n, 0.0002, 0.006) * 0.8
    return reverb(stereo(y), wet=0.08, dur=0.5, seed=5), 1


def blip(seed, length=None, pitch=0.0):
    """A scattered message: two-note glide, pitch picked from D minor pentatonic by seed."""
    notes = [74, 77, 79, 81, 84, 86]
    m = notes[seed % len(notes)] + pitch
    f0 = 440 * 2 ** ((m - 69) / 12)
    dur = 0.32
    n = n_of(dur)
    t = t_axis(dur)
    f = f0 * np.where(t < 0.035, 1.0, 1.335)
    y = (sine(f) + 0.25 * sine(f * 2.01)) * env_ad(n, 0.003, 0.18)
    return reverb(fade(stereo(y * 0.7), 0.001, 0.02), wet=0.25, dur=1.2, seed=9), n_of(0.003)


def ping(seed, length=None, pitch=0.0):
    """Opening ping: an FM bell on D, long and clean."""
    dur = 2.4
    n = n_of(dur)
    t = t_axis(dur)
    fc = 587.33 * _pitch(pitch)
    mod = np.sin(2 * np.pi * fc * 3.5 * t) * 2.2 * np.exp(-t / 0.3)
    y = np.sin(2 * np.pi * fc * t + mod) * env_ad(n, 0.002, 2.2)
    y += 0.3 * sine(fc * 2, dur) * env_ad(n, 0.002, 0.9)
    return reverb(stereo(y * 0.5), wet=0.35, dur=2.8, seed=11), n_of(0.002)


def draw(seed, length=0.5, pitch=0.0):
    """Pen on paper: granular scratch for the whole stroke."""
    dur = float(np.clip(length, 0.15, 2.5))
    n = n_of(dur)
    r = rng(seed)
    x = filt(noise(dur, seed), 'bandpass', (1800 * _pitch(pitch), 6500))
    grains = np.zeros(n)
    pos = 0
    while pos < n:
        g = n_of(r.uniform(0.006, 0.022))
        grains[pos:pos + g] = r.uniform(0.3, 1.0) * np.hanning(min(g, n - pos))
        pos += g + n_of(r.uniform(0.0, 0.01))
    env = np.minimum(1, np.minimum(np.arange(n) / n_of(0.03), (n - np.arange(n)) / n_of(0.06)))
    y = x * grains * env
    y /= np.max(np.abs(y)) + 1e-9
    return widen(stereo(y), 0.2, seed), 0


def clank(seed, length=None, pitch=0.0):
    """Struck steel: inharmonic bar modes (1 : 2.76 : 5.40 : 8.93) plus a hard transient."""
    dur = 1.4
    n = n_of(dur)
    f0 = 196 * _pitch(pitch + (seed % 3) * 2 - 2)
    y = np.zeros(n)
    for ratio, amp, dec in [(1, 1.0, 0.9), (2.76, 0.6, 0.5), (5.40, 0.4, 0.3), (8.93, 0.25, 0.18), (13.34, 0.15, 0.1)]:
        y += amp * sine(f0 * ratio, dur) * env_ad(n, 0.0005, dec)
    y += filt(noise(dur, seed), 'bandpass', (800, 7000)) * env_ad(n, 0.0003, 0.03) * 1.2
    y = saturate(y * 0.45, 1.3)
    return reverb(stereo(y), wet=0.22, dur=1.6, seed=13), 1


def hit(seed, length=None, pitch=0.0):
    """The drop: kick body, noise burst, a steel overtone, a long dark room."""
    dur = 3.2
    n = n_of(dur)
    t = t_axis(dur)
    k = _pitch(pitch)
    f = (38 + 85 * np.exp(-t / 0.06)) * k
    body = sine(f) * env_ad(n, 0.001, 1.1)
    burst = filt(noise(dur, seed, 'pink'), 'lowpass', 3500) * env_ad(n, 0.0005, 0.35)
    steel = sum(a * sine(110 * k * r, dur) * env_ad(n, 0.001, d) for r, a, d in [(2.76, 0.25, 0.9), (5.4, 0.15, 0.6), (8.93, 0.08, 0.4)])
    # Broadband crack on top: without it the hit is a low thump with no audible front edge.
    crack = filt(noise(dur, seed + 7), 'bandpass', (1200, 9000)) * env_ad(n, 0.0008, 0.07)
    y = saturate(body * 1.0 + burst * 0.55 + steel + crack * 0.9, 1.6)
    return reverb(stereo(y), wet=0.3, dur=3.0, seed=17, damp=3500), n_of(0.001)


def sub(seed, length=None, pitch=0.0):
    """Sub drop under the hit: felt more than heard."""
    dur = 2.2
    n = n_of(dur)
    t = t_axis(dur)
    f = (32 + 26 * np.exp(-t / 0.5)) * _pitch(pitch)
    y = saturate(sine(f) * env_ad(n, 0.004, 2.0), 1.8)
    return stereo(y), n_of(0.004)


def riser(seed, length=1.0, pitch=0.0):
    """Tension that ends on the sync point. Noise band and a detuned saw stack both climb."""
    dur = float(np.clip(length, 0.5, 4.0))
    n = n_of(dur)
    t = t_axis(dur)
    u = t / dur
    nz = sweep_filter(noise(dur, seed), 'bandpass', 300 * (20 ** u ** 1.5), bw=1.0)
    f = 146.83 * _pitch(pitch) * 2 ** (u ** 2 * 1.0)
    tone = sum(saw(f * d) for d in (0.993, 1.0, 1.007)) / 3
    tone = sweep_filter(tone, 'lowpass', 400 + 5000 * u ** 2)
    y = (nz * 0.8 + tone * 0.35) * u ** 2.5
    y = fade(y, 0.01, 0.003)
    y /= np.max(np.abs(y)) + 1e-9
    return widen(stereo(y), 0.45, seed), n - 1


def snap(seed, length=None, pitch=0.0):
    """Lines locking into one axis: a soft, low 'lock' (felt thump + short muted tick).
    No rising zip and no sharp click: that combination reads as a whip crack."""
    dur = 0.45
    n = n_of(dur)
    t = t_axis(dur)
    k = _pitch(pitch)
    f = (150 * np.exp(-t / 0.03) + 85) * k
    body = sine(f) * env_ad(n, 0.003, 0.2)
    tick = filt(noise(dur, seed), 'bandpass', (700, 2600)) * env_ad(n, 0.002, 0.025) * 0.25
    y = saturate(body * 0.9 + tick, 1.2)
    return reverb(fade(stereo(y), 0.001, 0.02), wet=0.18, dur=1.1, seed=19), n_of(0.003)


def pulse(seed, length=0.5, pitch=0.0):
    """Signal travelling along the axis: a soft tone with a slight doppler fall."""
    dur = float(np.clip(length, 0.2, 1.2)) + 0.2
    n = n_of(dur)
    t = t_axis(dur)
    f = 880 * _pitch(pitch) * (1 - 0.06 * t / dur)
    y = (sine(f) + 0.2 * sine(f * 2)) * env_ad(n, 0.01, dur * 0.9)
    return reverb(stereo(y * 0.5), wet=0.3, dur=1.4, seed=23), n_of(0.01)


def shimmer(seed, length=None, pitch=0.0):
    """Gold catching light: a fast D minor bell arpeggio."""
    dur = 2.0
    n = n_of(dur)
    y = np.zeros(n)
    for i, m in enumerate([86, 89, 93, 98, 101]):
        f = 440 * 2 ** ((m + pitch - 69) / 12)
        s = n_of(i * 0.028)
        tone = sine(f, dur) * env_ad(n, 0.002, 1.4 - i * 0.15)
        y[s:] += tone[:n - s] * (0.5 - i * 0.06)
    return reverb(stereo(y * 0.5), wet=0.4, dur=2.4, seed=29), n_of(0.002)


RECIPES = {f.__name__: f for f in [whoosh, swell, land, tick, blip, ping, draw, clank, hit, sub, riser, snap, pulse, shimmer]}
