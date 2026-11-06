"""DSP primitives. 48 kHz float64, stereo arrays are shape (n, 2). Deterministic: every
random source takes an explicit seed, so the same cue always renders the same sound."""
import numpy as np
from scipy import signal

SR = 48000


def secs(n):
    return n / SR


def n_of(seconds):
    return int(round(seconds * SR))


def rng(seed):
    return np.random.default_rng(seed & 0xFFFFFFFF)


def t_axis(dur):
    return np.arange(n_of(dur)) / SR


def noise(dur, seed, color='white'):
    x = rng(seed).standard_normal(n_of(dur))
    if color == 'pink':
        # Voss-free approximation: 1/f via FFT shaping.
        X = np.fft.rfft(x)
        f = np.fft.rfftfreq(len(x), 1 / SR)
        f[0] = f[1]
        X /= np.sqrt(f)
        x = np.fft.irfft(X, len(x))
    return x / (np.max(np.abs(x)) + 1e-12)


def phase_from_freq(freq):
    return np.cumsum(np.asarray(freq, dtype=float) / SR)


def sine(freq, dur=None, phase=0.0):
    if np.isscalar(freq):
        return np.sin(2 * np.pi * (freq * t_axis(dur) + phase))
    return np.sin(2 * np.pi * (phase_from_freq(freq) + phase))


def _polyblep(t, dt):
    dt = np.broadcast_to(dt, t.shape)
    y = np.zeros_like(t)
    m = t < dt
    x = t[m] / dt[m]
    y[m] = x + x - x * x - 1
    m = t > 1 - dt
    x = (t[m] - 1) / dt[m]
    y[m] = x * x + x + x + 1
    return y


def saw(freq, dur=None, phase=0.0):
    """Band-limited sawtooth (polyBLEP)."""
    f = np.full(n_of(dur), float(freq)) if np.isscalar(freq) else np.asarray(freq, float)
    ph = (phase_from_freq(f) + phase) % 1.0
    dt = np.clip(f / SR, 1e-6, 0.5)
    return 2 * ph - 1 - _polyblep(ph, dt)


def square(freq, dur=None, phase=0.0):
    f = np.full(n_of(dur), float(freq)) if np.isscalar(freq) else np.asarray(freq, float)
    ph = (phase_from_freq(f) + phase) % 1.0
    dt = np.clip(f / SR, 1e-6, 0.5)
    return np.where(ph < 0.5, 1.0, -1.0) + _polyblep(ph, dt) - _polyblep((ph + 0.5) % 1.0, dt)


def env_ad(n, attack, decay):
    """Linear attack, then exponential decay reaching -60 dB after `decay` seconds."""
    a = min(n, n_of(attack))
    e = np.zeros(n)
    if a > 0:
        e[:a] = np.linspace(0, 1, a, endpoint=False)
    t = np.arange(n - a) / SR
    e[a:] = np.exp(-6.9 * t / max(decay, 1e-4))
    tail = min(n, n_of(0.004))
    e[n - tail:] *= np.linspace(1, 0, tail)
    return e


def env_adsr(n, a, d, s, r, hold=None):
    na, nd, nr = n_of(a), n_of(d), n_of(r)
    nh = max(0, n - na - nd - nr) if hold is None else n_of(hold)
    e = np.concatenate([np.linspace(0, 1, na, endpoint=False), np.linspace(1, s, nd, endpoint=False), np.full(nh, s), np.linspace(s, 0, nr)])
    return np.pad(e, (0, max(0, n - len(e))))[:n]


def fade(x, fin=0.002, fout=0.01):
    x = x.copy()
    a, b = n_of(fin), n_of(fout)
    if a:
        x[:a] *= np.linspace(0, 1, a)[:, None] if x.ndim == 2 else np.linspace(0, 1, a)
    if b:
        x[-b:] *= np.linspace(1, 0, b)[:, None] if x.ndim == 2 else np.linspace(1, 0, b)
    return x


def sos(kind, freq, order=2):
    if kind in ('lowpass', 'highpass'):
        return signal.butter(order, float(np.clip(freq, 10, SR / 2 - 100)), btype=kind, fs=SR, output='sos')
    lo, hi = float(freq[0]), float(freq[1])
    lo = max(20.0, min(lo, SR / 2 - 400))
    hi = min(SR / 2 - 100, max(hi, lo * 1.05))
    return signal.butter(order, [lo, hi], btype='bandpass', fs=SR, output='sos')


def filt(x, kind, freq, order=2):
    return signal.sosfilt(sos(kind, freq, order), x, axis=0)


def sweep_filter(x, kind, freqs, block=128, order=2, bw=1.0):
    """Time-varying filter: coefficients updated per block, state carried across blocks.
    For bandpass, `bw` is the bandwidth in octaves."""
    y = np.zeros_like(x)
    freqs = np.asarray(freqs, float)
    zi = None
    for i in range(0, len(x), block):
        f = float(freqs[min(i, len(freqs) - 1)])
        if kind == 'bandpass':
            lo, hi = f / 2 ** (bw / 2), f * 2 ** (bw / 2)
            s = sos('bandpass', (lo, hi), order)
        else:
            s = sos(kind, f, order)
        if zi is None or zi.shape[0] != s.shape[0]:
            zi = np.zeros((s.shape[0], 2))
        y[i:i + block], zi = signal.sosfilt(s, x[i:i + block], zi=zi)
    return y


def pan(x, p):
    """Equal-power pan of a mono signal, p in [-1, 1] (-1 = left)."""
    th = (np.clip(p, -1, 1) + 1) * np.pi / 4
    return np.stack([x * np.cos(th), x * np.sin(th)], axis=1)


def stereo(x):
    return x if x.ndim == 2 else np.stack([x, x], axis=1)


def widen(x, amount=0.3, seed=0):
    """Haas-free width: decorrelate by a short allpass-ish delay on one side."""
    x = stereo(x)
    d = n_of(0.009 + 0.004 * (seed % 5) / 5)
    side = np.concatenate([np.zeros(d), x[:-d, 1]]) if d < len(x) else x[:, 1]
    out = x.copy()
    out[:, 1] = (1 - amount) * x[:, 1] + amount * side
    return out


def impulse_response(dur=2.4, seed=7, damp=5500, predelay=0.012, density_tail=1.0):
    """Synthetic stereo hall: decorrelated decaying noise, darker as it decays."""
    n = n_of(dur)
    t = np.arange(n) / SR
    ir = np.zeros((n, 2))
    for ch in range(2):
        nz = rng(seed + ch * 101).standard_normal(n)
        e = np.exp(-6.9 * t / dur)  # -60 dB at `dur`
        bright = filt(nz, 'lowpass', damp, 2)
        dark = filt(nz, 'lowpass', 1400, 2)
        mix = np.clip(t / dur * 1.6, 0, 1)
        ir[:, ch] = ((1 - mix) * bright + mix * dark) * e * density_tail
    pd = n_of(predelay)
    ir = np.concatenate([np.zeros((pd, 2)), ir])[:n]
    ir /= np.sqrt(np.sum(ir ** 2) / 2) + 1e-12
    return ir


_IR_CACHE = {}


def reverb(x, wet=0.25, dur=2.4, seed=7, damp=5500, predelay=0.012):
    key = (dur, seed, damp, predelay)
    if key not in _IR_CACHE:
        _IR_CACHE[key] = impulse_response(dur, seed, damp, predelay)
    ir = _IR_CACHE[key]
    x = stereo(x)
    tail = np.stack([signal.fftconvolve(x[:, 0], ir[:, 0]), signal.fftconvolve(x[:, 1], ir[:, 1])], axis=1)
    out = np.zeros_like(tail)
    out[:len(x)] = x * (1 - wet)
    out += tail * wet * 0.35
    return out


def saturate(x, drive=1.5):
    return np.tanh(x * drive) / np.tanh(drive)


def db(x):
    return 10 ** (x / 20)


def place(bus, x, start):
    """Add x into bus at sample `start` (negative starts are clipped)."""
    x = stereo(x)
    if start < 0:
        x = x[-start:]
        start = 0
    end = min(len(bus), start + len(x))
    if end > start:
        bus[start:end] += x[:end - start]


def envelope_follower(x, attack=0.002, release=0.12):
    """Peak envelope for sidechain keys."""
    m = np.max(np.abs(stereo(x)), axis=1)
    a = np.exp(-1 / (attack * SR))
    r = np.exp(-1 / (release * SR))
    # Fast path: attack via max filter, release via one-pole on the decaying part.
    env = signal.lfilter([1 - r], [1, -r], m)
    return np.maximum(env, m * (1 - a) + env * a)


def limiter(x, ceiling_db=-1.0, lookahead=0.005, release=0.08, oversample=4):
    """Look-ahead limiter on true peaks (oversampled detection), gain at 3 kHz control rate."""
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    x = stereo(x)
    n = len(x)
    up = signal.resample_poly(x, oversample, 1, axis=0)[:n * oversample]
    peak = np.abs(up).max(axis=1)
    peak = np.pad(peak, (0, n * oversample - len(peak))).reshape(n, oversample).max(axis=1)
    need = np.minimum(1.0, db(ceiling_db) / np.maximum(peak, 1e-9))
    k = 16
    nb = -(-n // k)
    gb = np.pad(need, (0, nb * k - n), constant_values=1.0).reshape(nb, k).min(axis=1)
    la = max(1, int(np.ceil(lookahead * SR / k)))
    # min over +-la then a box average over la: the ramp finishes before the peak and never overshoots it.
    gb = uniform_filter1d(minimum_filter1d(gb, size=2 * la + 1), size=la + 1)
    r = np.exp(-k / (release * SR))
    out = np.empty(nb)
    g = 1.0
    for i in range(nb):
        g = min(gb[i], g + (1 - g) * (1 - r))
        out[i] = g
    gain = np.interp(np.arange(n), np.arange(nb) * k + k / 2, out)
    return x * np.minimum(gain, need.max())[:, None]
