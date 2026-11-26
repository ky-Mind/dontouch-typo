#!/usr/bin/env python3
"""Cut real keyboard recordings into per-keystroke sample sprites for TouchTyping.

  python3 tools/slice_samples.py <source.wav|mp4> <profile> <start_s> <end_s> [<profile> <start> <end> ...]

For each segment it detects keystroke onsets, scores every stroke (sharp transient, quiet before it,
no overlap with the next stroke), keeps the cleanest ones and writes public/sfx/<profile>.wav + .json
in the same sprite format as tools/make_sfx.py. The lowest-pitched heavy strokes become "space",
the next ones "enter"/"back", the rest "key". Source recordings are NOT stored in the repository.
"""
import json, subprocess, sys, wave, pathlib
import numpy as np

SR = 44100
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public/sfx"


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype="<i2").astype(float) / 32768


def onsets(x, hop=128):
    n = len(x) // hop
    e = np.sqrt(np.array([np.mean(x[i * hop:(i + 1) * hop] ** 2) for i in range(n)]) + 1e-12)
    db = 20 * np.log10(e)
    out, last = [], -999
    for i in range(4, n):
        floor = np.percentile(db[max(0, i - 160):i], 25)
        if db[i] - floor > 12 and db[i] - db[i - 3] > 8 and i - last > 20:
            # refine to the first sample above 20% of the local peak
            s = i * hop - hop * 3
            seg = np.abs(x[max(0, s):s + hop * 8])
            k = int(np.argmax(seg > seg.max() * 0.2))
            out.append(max(0, s) + k)
            last = i
    return out


def centroid(seg):
    S = np.abs(np.fft.rfft(seg * np.hanning(len(seg))))
    f = np.fft.rfftfreq(len(seg), 1 / SR)
    return float((S * f).sum() / (S.sum() + 1e-9))


def cut_segment(x, a, b):
    seg = x[int(a * SR):int(b * SR)]
    ons = onsets(seg)
    cands = []
    for j, o in enumerate(ons):
        nxt = ons[j + 1] if j + 1 < len(ons) else len(seg)
        gap = (nxt - o) / SR
        if gap < 0.07:                      # overlaps the next stroke too much
            continue
        L = int(min(gap - 0.004, 0.2) * SR)
        pre = int(0.004 * SR)
        clip = seg[max(0, o - pre):o + L].copy()
        if len(clip) < int(0.06 * SR):
            continue
        before = seg[max(0, o - int(0.03 * SR)):max(1, o - pre)]
        noise = np.sqrt(np.mean(before ** 2) + 1e-12)
        peak = np.abs(clip).max()
        score = 20 * np.log10(peak / noise) + 6 * min(gap, 0.2)
        # gentle tail: keep the body, then fade so background noise does not hang on
        n = len(clip); keep = min(n, int(0.05 * SR))
        env = np.ones(n); env[keep:] = np.exp(-np.linspace(0, 5, n - keep))
        env[:pre] = np.linspace(0, 1, pre) if pre else env[:pre]
        clip *= env
        cands.append({"clip": clip, "score": score, "cent": centroid(clip[: int(0.04 * SR)]), "peak": peak, "t": a + o / SR})
    cands.sort(key=lambda c: -c["score"])
    return cands


def build(profile, cands, want=12):
    best = cands[:want]
    if len(best) < 4:
        raise SystemExit(f"{profile}: only {len(best)} clean strokes found")
    # loudness-normalise each stroke to the same peak so variants feel consistent
    for c in best:
        c["clip"] = c["clip"] / (c["peak"] + 1e-9) * 0.7
    by_low = sorted(best, key=lambda c: c["cent"])
    space = by_low[:2]
    ids = lambda L: {id(c) for c in L}
    rest = [c for c in best if id(c) not in ids(space)]
    enter, back = rest[:1], (rest[1:3] if len(rest) > 6 else rest[1:2])
    keys = [c for c in rest if id(c) not in ids(enter) | ids(back)]
    clips = [("key", c["clip"]) for c in keys] + [("back", c["clip"]) for c in back] + [("enter", c["clip"]) for c in enter] + [("space", c["clip"] * 1.05) for c in space]
    gap = np.zeros(int(SR * 0.05))
    data, meta, pos = [], {}, 0
    for k, arr in clips:
        meta.setdefault(k, []).append([round(pos / SR, 5), round(len(arr) / SR, 5)])
        data += [arr, gap]; pos += len(arr) + len(gap)
    pcm = (np.clip(np.concatenate(data), -1, 1) * 32767).astype("<i2")
    with wave.open(str(OUT / f"{profile}.wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    (OUT / f"{profile}.json").write_text(json.dumps(meta))
    print(f"{profile:10s} {len(cands):3d} candidates -> " + ", ".join(f"{k}:{len(v)}" for k, v in meta.items()) + f"  ({len(pcm) / SR:.2f}s)")


if __name__ == "__main__":
    src = sys.argv[1]
    x = load(src)
    args = sys.argv[2:]
    for i in range(0, len(args), 3):
        name, a, b = args[i], float(args[i + 1]), float(args[i + 2])
        build(name, cut_segment(x, a, b))
