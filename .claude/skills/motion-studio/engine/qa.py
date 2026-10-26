"""QA pass 2 (after render): the delivered file, EVERY frame and every sample.
    python3 qa.py <production-dir> [--format WxH]
Checks the final mp4 against the spec, scans every frame of the lossless master for dead,
frozen, popping and flashing frames, verifies loudness, A/V sync, a transient on every cut
and a sound under every cue, then draws the sheets for the eye pass (pass 3).
Writes out/<fmt>/qa/{pass2.json, report.md, timeline.png, shots/*.png, cuts.png}. Exit 1 on FAIL."""
import json
import os
import re
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.io import wavfile
from scipy import signal

GOLD = (198, 161, 91)


def sh(cmd, binary=False):
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode:
        raise SystemExit(f"{cmd[0]} failed: {r.stderr.decode()[-1500:]}")
    return r.stdout if binary else r.stdout.decode() + r.stderr.decode()


def probe(path):
    return json.loads(sh(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', path]))


def luma_frames(path, w, h):
    """Decode to 8-bit luma at a quarter size; one row of stats per frame."""
    qw, qh = w // 4, h // 4
    raw = sh(['ffmpeg', '-v', 'error', '-i', path, '-vf', f'scale={qw}:{qh}:flags=area,format=gray', '-f', 'rawvideo', '-'], binary=True)
    return np.frombuffer(raw, np.uint8).reshape(-1, qh, qw).astype(np.float32)


def loudness(path):
    out = sh(['ffmpeg', '-nostats', '-i', path, '-filter_complex', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-'])
    s = out[out.rfind('Summary:'):]
    return float(re.search(r'I:\s+(-?[\d.]+) LUFS', s).group(1)), float(re.search(r'Peak:\s+(-?[\d.inf]+) dBFS', s).group(1))


def decode_audio(path):
    raw = sh(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', '48000', '-'], binary=True)
    return np.frombuffer(raw, np.float32).reshape(-1, 2)


def onset_curve(x, sr, hop=240):
    """Spectral flux, one value per `hop` samples (5 ms)."""
    m = x.mean(axis=1) if x.ndim == 2 else x
    f, t, Z = signal.stft(m, sr, nperseg=1024, noverlap=1024 - hop, boundary=None, padded=False)
    mag = np.log1p(np.abs(Z) * 100)
    flux = np.maximum(0, np.diff(mag, axis=1)).sum(axis=0)
    times = t[1:]
    return times, flux


def main():
    args = sys.argv[1:]
    prod = os.path.abspath(args[0])
    fmt = args[args.index('--format') + 1] if '--format' in args else sorted(d for d in os.listdir(os.path.join(prod, 'out')) if 'x' in d)[0]
    out = os.path.join(prod, 'out', fmt)
    qa = os.path.join(out, 'qa')
    os.makedirs(os.path.join(qa, 'shots'), exist_ok=True)
    man = json.load(open(os.path.join(out, 'manifest.json')))
    audio = json.load(open(os.path.join(out, 'audio', 'audio.json')))
    fps = man['cfg']['fps']
    W, H = map(int, fmt.split('x'))
    final = os.path.join(out, 'final.mp4')
    master = os.path.join(out, 'master.mkv')
    issues = []

    def add(level, rule, msg):
        issues.append({'level': level, 'rule': rule, 'msg': msg})

    # ---------- delivery spec ----------
    meta = probe(final)
    v = next(s for s in meta['streams'] if s['codec_type'] == 'video')
    a = next((s for s in meta['streams'] if s['codec_type'] == 'audio'), None)
    expect_frames = round(man['duration'] * fps)
    spec = {
        'codec h264': v['codec_name'] == 'h264',
        'pix_fmt yuv420p': v['pix_fmt'] == 'yuv420p',
        f'size {W}x{H}': (v['width'], v['height']) == (W, H),
        f'{fps} fps': v['r_frame_rate'] == f'{fps}/1',
        'BT.709 tagged': v.get('color_space') == 'bt709' and v.get('color_primaries') == 'bt709' and v.get('color_transfer') == 'bt709',
        f'{expect_frames} frames': int(v.get('nb_frames', 0)) == expect_frames,
        'audio aac 48 kHz stereo': bool(a) and a['codec_name'] == 'aac' and a['sample_rate'] == '48000' and a['channels'] == 2,
        'faststart (moov first)': open(final, 'rb').read(64).find(b'moov') != -1 or b'moov' in open(final, 'rb').read(4096),
    }
    if a:
        vdur, adur = float(v['duration']), float(a['duration'])
        spec['A/V durations within 1 frame'] = abs(vdur - adur) <= 1 / fps + 1e-3
    for k, ok in spec.items():
        if not ok:
            add('FAIL', 'delivery-spec', k)

    # ---------- every frame (lossless master: exact pixels, no grain) ----------
    L = luma_frames(master, W, H)
    n = len(L)
    if n != expect_frames:
        add('FAIL', 'frame-count', f'master has {n} frames, expected {expect_frames}')
    cuts = sorted(round(s['t0'] * fps) for s in man['shots'])
    shot_of = np.zeros(n, int)
    for i, c in enumerate(cuts):
        shot_of[c:] = i
    bg = np.median(L[:, :2, :2])
    ymax = L.reshape(n, -1).max(axis=1)
    ymean = L.reshape(n, -1).mean(axis=1)
    diff = np.r_[0, np.abs(np.diff(L, axis=0)).reshape(n - 1, -1).mean(axis=1)]

    dead = np.where(ymax < bg + 25)[0]
    if len(dead):
        add('FAIL', 'no-dead-frames', f'{len(dead)} frame(s) with nothing but background: {runs(dead)}')
    still = diff < 0.004
    st = np.where(still)[0]
    frozen = [r for r in runs_list(st) if r[1] - r[0] + 1 >= fps // 2]
    if frozen:
        add('FAIL', 'never-static', 'frozen stretches (>= 0.5 s): ' + ', '.join(f'{a}-{b}' for a, b in frozen))
    # A pop: a jump far above the local motion level, not on a cut.
    med = signal.medfilt(diff, 9)
    pops = [i for i in range(2, n) if i not in cuts and diff[i] > max(6 * med[i], 1.2)]
    if pops:
        add('WARN', 'no-pops', f'sudden changes inside a shot at frames {pops[:12]} (inspect)')
    # Photosensitivity: count opposing mean-luma swings > 10% of range inside any 1 s window.
    swing = np.diff(ymean)
    big = np.where(np.abs(swing) > 25.5)[0]
    for i in big:
        win = big[(big >= i) & (big < i + fps)]
        signs = np.sign(swing[win])
        if np.sum(signs[1:] != signs[:-1]) >= 6:
            add('FAIL', 'flash-safety', f'more than 3 flashes per second around frame {i}')
            break

    # ---------- colour fidelity: brand gold survives the RGB -> BT.709 YUV encode ----------
    gold_check = colour_check(master, final, man, fps, W, H)
    if gold_check and gold_check['delta'] > 6:
        add('FAIL', 'brand-colour', f"gold drifts by {gold_check['delta']:.1f} (RGB distance) after encode")

    # ---------- sound ----------
    lufs, tp = loudness(final)
    if abs(lufs - (-14)) > 1:
        add('FAIL', 'loudness', f'{lufs:.1f} LUFS integrated (target -14 +-1)')
    if tp > -1.0:
        add('FAIL', 'true-peak', f'{tp:.1f} dBTP (max -1.0)')
    mix = wavfile.read(os.path.join(out, 'audio', 'mix.wav'))[1]
    dec = decode_audio(final)
    lag = xcorr_lag(mix[:48000 * 6, 0], dec[:48000 * 6, 0], 2400)
    if abs(lag) > 48000 / fps / 4:
        add('FAIL', 'av-sync', f'audio is offset by {lag / 48:.1f} ms after muxing')
    if np.max(np.abs(dec)) >= 0.999:
        add('FAIL', 'no-clipping', 'decoded audio reaches full scale')
    times, flux = onset_curve(mix, 48000)
    thr = np.median(flux) * 3
    for s in man['shots']:
        t = s['t0']
        win = (times >= t - 1 / fps - 0.006) & (times <= t + 1 / fps + 0.006)
        if not win.any() or flux[win].max() < thr:
            add('FAIL', 'cut-has-transient', f"no transient on the cut into {s['id']} ({t:.3f}s)")
    sfx = wavfile.read(os.path.join(out, 'audio', 'sfx.wav'))[1]
    sfx_mono = np.abs(sfx).max(axis=1)
    silent_cues = []
    for c in man['cues']:
        i = int(round(c['t'] * 48000))
        seg = sfx_mono[max(0, i - 1600):i + 3200]
        if len(seg) == 0 or 20 * np.log10(seg.max() + 1e-12) < -50:
            silent_cues.append(f"{c['name']}@{c['t']:.2f}")
    if silent_cues:
        add('FAIL', 'sound-for-every-motion', f'cues with no sound at their frame: {silent_cues[:10]}')

    # ---------- sheets for the eye pass ----------
    shot_sheets(final, man, fps, W, H, qa)
    cut_sheet(final, man, fps, W, H, qa)
    timeline(mix, man, audio, diff, ymean, fps, qa)

    fails = [i for i in issues if i['level'] == 'FAIL']
    res = {'frames_scanned': n, 'lufs': lufs, 'true_peak': tp, 'av_lag_ms': lag / 48, 'spec': spec, 'gold': gold_check, 'issues': issues}
    json.dump(res, open(os.path.join(qa, 'pass2.json'), 'w'), indent=1, ensure_ascii=False, default=float)
    report(prod, out, qa, man, res)
    print(f"pass 2: {n} frames scanned, {lufs:.1f} LUFS, TP {tp:.1f} dBTP, A/V lag {lag / 48:.2f} ms")
    for i in issues:
        print(f"  {i['level']} {i['rule']}: {i['msg']}")
    print('FAIL' if fails else 'PASS')
    return 1 if fails else 0


def runs_list(idx):
    if len(idx) == 0:
        return []
    out, a, b = [], idx[0], idx[0]
    for i in idx[1:]:
        if i == b + 1:
            b = i
        else:
            out.append((a, b))
            a = b = i
    out.append((a, b))
    return out


def runs(idx):
    return ', '.join(f'{a}-{b}' if a != b else f'{a}' for a, b in runs_list(idx)[:8])


def xcorr_lag(a, b, maxlag):
    n = min(len(a), len(b))
    a, b = a[:n] - a[:n].mean(), b[:n] - b[:n].mean()
    c = signal.correlate(b, a, mode='full', method='fft')
    mid = n - 1
    seg = c[mid - maxlag:mid + maxlag + 1]
    return int(np.argmax(seg) - maxlag)


def frame_png(path, i, fps, w=None):
    vf = [f"select='eq(n\\,{i})'"]
    if w:
        vf.append(f'scale={w}:-2:flags=lanczos')
    raw = sh(['ffmpeg', '-v', 'error', '-i', path, '-vf', ','.join(vf), '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-'], binary=True)
    from io import BytesIO
    return Image.open(BytesIO(raw)).convert('RGB')


def colour_check(master, final, man, fps, W, H):
    """Brand gold before vs after encode, on FLAT gold areas (5x5 erosion). Thin strokes are
    reported separately: 4:2:0 chroma subsampling desaturates 2-3 px lines on every platform,
    so they say nothing about the colour matrix."""
    from scipy.ndimage import binary_erosion
    i = round(man['duration'] * fps) - 1
    a = np.asarray(frame_png(master, i, fps)).astype(float)
    b = np.asarray(frame_png(final, i, fps)).astype(float)
    gold = np.linalg.norm(a - np.array(GOLD), axis=2) < 12
    flat = binary_erosion(gold, np.ones((5, 5)))
    if flat.sum() < 20:
        return None
    pa, pb = a[flat].mean(axis=0), b[flat].mean(axis=0)
    la, lb = a[gold & ~flat].mean(axis=0), b[gold & ~flat].mean(axis=0)
    return {'frame': i, 'flat_pixels': int(flat.sum()), 'master_rgb': pa.round(1).tolist(), 'final_rgb': pb.round(1).tolist(),
            'delta': float(np.linalg.norm(pa - pb)), 'thin_line_delta': float(np.linalg.norm(la - lb))}


def font(size):
    for p in ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf']:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def shot_sheets(final, man, fps, W, H, qa):
    """Per shot: first frame, 25%, 50%, 75%, last frame."""
    tw = 480
    for s in man['shots']:
        a, b = round(s['t0'] * fps), round(s['t1'] * fps) - 1
        picks = [a, a + (b - a) // 4, a + (b - a) // 2, a + 3 * (b - a) // 4, b]
        ims = [frame_png(final, i, fps, tw) for i in picks]
        th = ims[0].height
        sheet = Image.new('RGB', (tw * len(ims) + 8 * (len(ims) - 1), th + 30), (40, 40, 40))
        d = ImageDraw.Draw(sheet)
        for k, (im, i) in enumerate(zip(ims, picks)):
            x = k * (tw + 8)
            sheet.paste(im, (x, 30))
            d.text((x + 4, 6), f"{s['id']}  f{i}  beat {i / fps / man['spb']:.2f}", fill=(230, 230, 230), font=font(16))
        sheet.save(os.path.join(qa, 'shots', f"{s['at']:03d}_{s['id']}.png"))


def cut_sheet(final, man, fps, W, H, qa):
    """Every cut: last frame of the outgoing shot beside the first frame of the incoming one."""
    tw = 400
    rows = []
    shots = sorted(man['shots'], key=lambda s: s['at'])
    for prev, nxt in zip(shots, shots[1:]):
        c = round(nxt['t0'] * fps)
        rows.append((prev['id'], nxt['id'], frame_png(final, c - 1, fps, tw), frame_png(final, c, fps, tw), c))
    th = rows[0][2].height
    sheet = Image.new('RGB', (tw * 2 + 24, (th + 28) * len(rows)), (40, 40, 40))
    d = ImageDraw.Draw(sheet)
    for r, (pa, pb, ia, ib, c) in enumerate(rows):
        y = r * (th + 28)
        d.text((4, y + 4), f"{pa} | {pb}   cut at frame {c}", fill=(230, 230, 230), font=font(16))
        sheet.paste(ia, (0, y + 26))
        sheet.paste(ib, (tw + 24, y + 26))
    sheet.save(os.path.join(qa, 'cuts.png'))


def timeline(mix, man, audio, diff, ymean, fps, qa):
    """Waveform + spectrogram + picture motion on one time axis; cuts gold, cues grey."""
    W, H = 2400, 760
    im = Image.new('RGB', (W, H), (14, 15, 18))
    d = ImageDraw.Draw(im)
    dur = man['duration']
    X = lambda t: int(t / dur * (W - 1))
    # spectrogram (top)
    m = mix.mean(axis=1)
    f, t, Z = signal.stft(m, 48000, nperseg=2048, noverlap=2048 - 480)
    S = 20 * np.log10(np.abs(Z) + 1e-9)
    fmax = np.searchsorted(f, 12000)
    S = S[:fmax]
    # log-frequency rows
    rows = 260
    fr = np.geomspace(30, 12000, rows)
    idx = np.clip(np.searchsorted(f[:fmax], fr), 0, fmax - 1)
    S = S[idx][::-1]
    S = np.clip((S + 90) / 80, 0, 1)
    spec = Image.fromarray((np.stack([S * 210, S * 170, S * 100], axis=2)).astype(np.uint8)).resize((W, rows))
    im.paste(spec, (0, 20))
    # waveform
    y0, hh = 300, 180
    step = len(m) / W
    for x in range(W):
        seg = m[int(x * step):int((x + 1) * step)]
        if len(seg):
            d.line([(x, y0 + hh // 2 - seg.max() * hh / 2), (x, y0 + hh // 2 - seg.min() * hh / 2)], fill=(150, 160, 170))
    # picture motion and brightness
    y1, h1 = 500, 120
    dm = diff / (np.percentile(diff, 99) + 1e-9)
    pts = [(X(i / fps), y1 + h1 - min(1, v) * h1) for i, v in enumerate(dm)]
    d.line(pts, fill=(120, 200, 140), width=1)
    yl = ymean / 255
    d.line([(X(i / fps), y1 + h1 - v * h1 * 3) for i, v in enumerate(yl)], fill=(200, 120, 120), width=1)
    # beats, cuts, cues
    for b in range(int(round(dur / man['spb'])) + 1):
        x = X(b * man['spb'])
        d.line([(x, 640), (x, 650 if b % 4 else 662)], fill=(90, 90, 90))
    for c in man['cues']:
        x = X(c['t'])
        d.line([(x, 290), (x, 490)], fill=(110, 110, 120))
    for s in man['shots']:
        x = X(s['t0'])
        d.line([(x, 0), (x, H)], fill=GOLD, width=2)
        d.text((x + 4, 670), s['id'], fill=GOLD, font=font(16))
    d.text((6, 2), 'spectrogram 30 Hz - 12 kHz (log)', fill=(200, 200, 200), font=font(14))
    d.text((6, 282), 'mix waveform, grey ticks = cues', fill=(200, 200, 200), font=font(14))
    d.text((6, 488), 'green = frame-to-frame motion, red = mean luma', fill=(200, 200, 200), font=font(14))
    im.save(os.path.join(qa, 'timeline.png'))


def report(prod, out, qa, man, res):
    p1 = json.load(open(os.path.join(qa, 'pass1.json')))
    lines = [f"# QA — {man['cfg']['title']} ({os.path.basename(out)})", '',
             '## Pass 1 · structure and DOM, every frame', f"{p1['frames']} frames · {len(man['shots'])} shots · {len(man['cues'])} cues", '']
    lines += [f"- {i['level']} `{i['rule']}` {i['msg']}" for i in p1['issues']] or ['- no issues']
    lines += ['', '## Pass 2 · delivered file, every frame and sample',
              f"{res['frames_scanned']} frames · {res['lufs']:.1f} LUFS · {res['true_peak']:.1f} dBTP · A/V lag {res['av_lag_ms']:.2f} ms", '']
    lines += [f"- {'PASS' if ok else 'FAIL'} {k}" for k, ok in res['spec'].items()]
    if res['gold']:
        g = res['gold']
        lines.append(f"- gold (flat areas) after encode: {g['final_rgb']} vs master {g['master_rgb']} (Δ {g['delta']:.1f}); thin strokes Δ {g['thin_line_delta']:.1f} from 4:2:0 chroma")
    lines += [f"- {i['level']} `{i['rule']}` {i['msg']}" for i in res['issues']] or ['- no issues']
    lines += ['', '## Pass 3 · eye (write review.md in the film folder)', 'Open `timeline.png`, `cuts.png` and every sheet in `shots/`.', '']
    open(os.path.join(qa, 'report.md'), 'w').write('\n'.join(lines) + '\n')


if __name__ == '__main__':
    sys.exit(main())
