#!/usr/bin/env python3
"""Render the keyboard / UI sound samples for TouchTyping (physically-inspired modal synthesis).

Output (16-bit mono WAV sprites + JSON offsets, loaded once as AudioBuffers in the browser):
  public/sfx/<profile>.wav + public/sfx/<profile>.json   (profiles: thock, clicky)
  public/sfx/ui.wav + public/sfx/ui.json                  (error, correct, done, badge)

A keystroke is modelled as: switch contact click (short filtered noise) + keycap bottoming out on
the plate (a handful of damped case/plate modes) + a quieter release a few dozen ms later, with a
tiny room reflection. Every variant is randomised so repeated keys do not sound like a loop.
Samples can be swapped for recorded or ElevenLabs-generated ones by replacing the WAV files.
"""
import json, wave, pathlib
import numpy as np

SR = 44100
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public/sfx"
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(7)


def t_axis(sec):
    return np.arange(int(SR * sec)) / SR


def bandnoise(n, lo, hi):
    x = rng.standard_normal(n)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    y = np.fft.irfft(X, n)
    return y / (np.abs(y).max() + 1e-9)


def modes(t, spec, jitter=0.05):
    """spec: list of (freq, decay_seconds, amp)."""
    y = np.zeros_like(t)
    for f, d, a in spec:
        f *= 1 + rng.uniform(-jitter, jitter)
        ph = rng.uniform(0, 2 * np.pi)
        y += a * rng.uniform(0.8, 1.15) * np.exp(-t / d) * np.sin(2 * np.pi * f * t + ph)
    return y


def env_click(n, ms):
    k = int(SR * ms / 1000)
    e = np.zeros(n)
    e[:k] = np.exp(-np.linspace(0, 7, k))
    return e


def room(y, amt=0.12):
    out = y.copy()
    for d_ms, g in ((7.3, 0.5), (11.9, 0.35), (17.1, 0.22), (23.7, 0.12)):
        d = int(SR * d_ms / 1000)
        out[d:] += amt * g * y[:-d]
    return out


def stroke(kind, profile):
    dur = {"key": 0.17, "back": 0.19, "enter": 0.22, "space": 0.26}[kind]
    t = t_axis(dur)
    n = len(t)
    y = np.zeros(n)
    # --- press -------------------------------------------------------------
    if profile == "clicky":
        click = bandnoise(n, 2500, 9000) * env_click(n, 4) * 0.9
        click += modes(t, [(4200, 0.004, 0.6), (6100, 0.003, 0.35)])
    else:
        click = bandnoise(n, 1200, 6500) * env_click(n, 2.5) * 0.45
    base = {"key": 1.0, "back": 0.88, "enter": 0.8, "space": 0.55}[kind]
    if profile == "thock":
        body = [(380 * base, 0.020, 1.0), (760 * base, 0.012, 0.55), (1450 * base, 0.008, 0.35), (2600, 0.005, 0.18)]
    else:
        body = [(520 * base, 0.014, 0.7), (1100 * base, 0.009, 0.45), (2300, 0.006, 0.3), (3900, 0.004, 0.2)]
    if kind == "space":
        body = [(f, d * 1.8, a * 1.2) for f, d, a in body] + [(150, 0.03, 0.6)]
    if kind == "enter":
        body = [(f, d * 1.4, a) for f, d, a in body]
    bottom_at = int(SR * rng.uniform(0.004, 0.007))  # travel time to bottom-out
    b = modes(t, body) * bandnoise(n, 80, 8000).__abs__().clip(0.6, 1)  # slightly rough
    y += click
    y[bottom_at:] += b[: n - bottom_at] * 0.9
    # stabiliser rattle for long keys
    if kind in ("space", "enter", "back"):
        r_at = int(SR * rng.uniform(0.009, 0.014))
        r = bandnoise(n, 1500, 5000) * env_click(n, 3) * 0.25
        y[r_at:] += r[: n - r_at]
    # --- release -----------------------------------------------------------
    rel_at = int(SR * rng.uniform(0.07, 0.095) * (1.25 if kind == "space" else 1))
    if rel_at < n - 200:
        m = n - rel_at
        rt = np.arange(m) / SR
        rel = bandnoise(m, 2000, 8000) * env_click(m, 2) * 0.22 + modes(rt, [(f * 1.3, d * 0.6, a * 0.25) for f, d, a in body[:3]])
        y[rel_at:] += rel
    y = room(y)
    # fade tail, normalise
    y *= np.minimum(1, np.linspace(6, 0, n)) ** 1.2
    peak = {"key": 0.62, "back": 0.66, "enter": 0.72, "space": 0.75}[kind]
    return y / (np.abs(y).max() + 1e-9) * peak


def marimba(freq, dur, amp=0.5):
    t = t_axis(dur)
    y = modes(t, [(freq, 0.18, 1.0), (freq * 3.93, 0.05, 0.25), (freq * 9.2, 0.015, 0.08)], jitter=0)
    att = np.minimum(1, t / 0.002)
    return y * att * amp


def ui_sounds():
    s = {}
    # error: soft muted "tuk-tuk" (lower, not harsh)
    t = t_axis(0.18)
    e = modes(t, [(196, 0.03, 1.0), (392, 0.015, 0.3)], jitter=0) * np.minimum(1, t / 0.003)
    e2 = np.zeros_like(e); d = int(SR * 0.075)
    e2[d:] = 0.7 * modes(np.arange(len(e) - d) / SR, [(165, 0.03, 1.0), (330, 0.015, 0.3)], jitter=0)
    s["error"] = (e + e2) / np.abs(e + e2).max() * 0.5
    # correct: single soft marimba note
    s["correct"] = marimba(1046.5, 0.3, 0.45)
    # done: rising 3-note arpeggio
    n = t_axis(1.1); y = np.zeros_like(n)
    for i, f in enumerate((523.25, 659.25, 783.99, 1046.5)):
        st = int(SR * 0.09 * i); m = marimba(f, 1.1 - 0.09 * i, 0.4)
        y[st:st + len(m)] += m
    s["done"] = room(y, 0.25) / np.abs(y).max() * 0.6
    # badge: two-note chime with shimmer
    n = t_axis(1.0); y = np.zeros_like(n)
    for i, f in enumerate((783.99, 1174.66)):
        st = int(SR * 0.12 * i); m = marimba(f, 1.0 - 0.12 * i, 0.45) + 0.12 * modes(t_axis(1.0 - 0.12 * i), [(f * 2, 0.3, 1)], jitter=0)
        y[st:st + len(m)] += m
    s["badge"] = room(y, 0.3) / np.abs(y).max() * 0.6
    return s


def write_sprite(name, clips):
    gap = np.zeros(int(SR * 0.05))
    data, meta, pos = [], {}, 0
    for k, arr in clips:
        meta.setdefault(k, []).append([round(pos / SR, 5), round(len(arr) / SR, 5)])
        data += [arr, gap]; pos += len(arr) + len(gap)
    pcm = (np.clip(np.concatenate(data), -1, 1) * 32767).astype("<i2")
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    (OUT / f"{name}.json").write_text(json.dumps(meta))
    print(name, {k: len(v) for k, v in meta.items()}, f"{len(pcm) / SR:.2f}s")


for profile in ("thock", "clicky"):
    clips = []
    for kind, count in (("key", 6), ("back", 3), ("enter", 2), ("space", 3)):
        for _ in range(count):
            clips.append((kind, stroke(kind, profile)))
    write_sprite(profile, clips)
write_sprite("ui", list(ui_sounds().items()))
