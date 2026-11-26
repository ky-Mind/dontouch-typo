#!/usr/bin/env python3
"""Split ONE long TTS recording of all tutor lines into a voice pack using speech recognition alignment.

  python3 tools/align_pack.py <recording.mp3> --lang id --pack putra-id --label "Putra (ElevenLabs)"

Needs faster-whisper (pip install faster-whisper). The recording is transcribed with word timestamps,
the transcript is aligned to the known script (difflib over normalised words), and every line is cut
between the last word of that line and the first word of the next one. Lines whose words could not be
found are reported instead of being guessed.
"""
import argparse, difflib, json, re, subprocess, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
norm = lambda w: re.sub(r"[^a-z0-9]", "", w.lower())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio"); ap.add_argument("--lang", required=True); ap.add_argument("--pack", required=True)
    ap.add_argument("--label", required=True); ap.add_argument("--provider", default="elevenlabs"); ap.add_argument("--model", default="small")
    ap.add_argument("--fix", default="", help="comma-separated consecutive line ids to re-split by pauses only")
    a = ap.parse_args()
    from faster_whisper import WhisperModel
    lines = json.loads((ROOT / ("tools/voice_lines.json" if a.lang == "id" else "tools/voice_lines_en.json")).read_text())
    ids = list(lines)
    script = []  # (line index, normalised word)
    for k, t in enumerate(lines.values()):
        for w in t.split():
            if norm(w): script.append((k, norm(w)))
    model = WhisperModel(a.model, device="cpu", compute_type="int8")
    import numpy as np
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", a.audio, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], capture_output=True, check=True).stdout
    audio = np.frombuffer(pcm, dtype=np.float32)
    # transcribe short pieces between pauses: long repetitive audio makes Whisper skip or loop
    hop0 = 160
    e0 = 20 * np.log10(np.sqrt(np.array([np.mean(audio[i * hop0:(i + 1) * hop0] ** 2) for i in range(len(audio) // hop0)])) + 1e-9)
    q0 = e0 < np.percentile(e0, 95) - 35
    pieces, st, i = [], 0, 0
    while i < len(q0):
        if q0[i]:
            j = i
            while j < len(q0) and q0[j]: j += 1
            if j - i >= 25 and (i - st) >= 60:  # pause >= 250 ms and piece >= 0.6 s
                pieces.append((st, (i + j) // 2)); st = (i + j) // 2
            i = j
        else: i += 1
    pieces.append((st, len(q0)))
    words = []
    for p0, p1 in pieces:
        chunk = audio[p0 * hop0:p1 * hop0]
        if len(chunk) < 1600: continue
        segs, _ = model.transcribe(chunk, language=a.lang, word_timestamps=True, vad_filter=False, condition_on_previous_text=False, beam_size=5)
        off = p0 * hop0 / 16000
        for sg in segs:
            for w in (sg.words or []):
                if norm(w.word): words.append((norm(w.word), w.start + off, w.end + off))
    sm = difflib.SequenceMatcher(a=[w for _, w in script], b=[w for w, _, _ in words], autojunk=False)
    span, firstw, lastw = {}, {}, {}
    pos_in_line = []; cnt = {}
    for k, w in script: pos_in_line.append(cnt.get(k, 0)); cnt[k] = cnt.get(k, 0) + 1
    for blk in sm.get_matching_blocks():
        for o in range(blk.size):
            si = blk.a + o; k = script[si][0]; _, s, e = words[blk.b + o]; wi = pos_in_line[si]
            lo, hi = span.get(k, (s, e)); span[k] = (min(lo, s), max(hi, e))
            if k not in firstw or wi < firstw[k][0]: firstw[k] = (wi, s)
            if k not in lastw or wi > lastw[k][0]: lastw[k] = (wi, e)
    WD = 0.3  # average seconds per word, used to extend spans over words the recogniser missed
    for k in list(span):
        s0 = firstw[k][1] - firstw[k][0] * WD
        e0 = lastw[k][1] + (cnt[k] - 1 - lastw[k][0]) * WD
        span[k] = (s0, e0)
    missing = [ids[k] for k in range(len(ids)) if k not in span]
    if missing: print("not recognised, placed between neighbours:", missing)
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", a.audio], capture_output=True, text=True).stdout)
    # cut inside the longest silence near each line boundary (word timestamps alone can be off by a syllable)
    x = np.frombuffer(pcm, dtype=np.float32); hop = 160  # 10 ms at 16 kHz
    db = 20 * np.log10(np.sqrt(np.array([np.mean(x[i * hop:(i + 1) * hop] ** 2) for i in range(len(x) // hop)])) + 1e-9)
    quiet = db < np.percentile(db, 95) - 35
    def best_cut(t0, t1):
        a0, a1 = int(max(0, t0) * 100), int(min(dur, t1) * 100)
        best, bl, i = None, 0, a0
        while i < a1:
            if quiet[i]:
                j = i
                while j < a1 and quiet[j]: j += 1
                if j - i > bl: bl, best = j - i, (i + j) / 2 / 100
                i = j
            else: i += 1
        return best
    # lines the recogniser missed: split their gap between known neighbours at the longest pauses,
    # proportionally to syllable count
    k = 0
    while k < len(ids):
        if k in span: k += 1; continue
        g0 = k
        while k < len(ids) and k not in span: k += 1
        group = list(range(g0, k))
        t0 = span[g0 - 1][1] if g0 > 0 else 0.0
        t1 = span[k][0] if k < len(ids) else dur
        syl = [max(1, len(re.findall(r"[aiueoy]+", list(lines.values())[q].lower()))) for q in group]
        tot = sum(syl); acc = t0
        for q, sy in zip(group, syl):
            w = (t1 - t0) * sy / tot
            span[q] = (acc + 0.05, acc + w - 0.05); acc += w
    cuts = [0.0]
    for k in range(len(ids) - 1):
        e_k, s_n = span[k][1], span[k + 1][0]
        lo, hi = (e_k - 0.05, s_n + 0.05) if s_n > e_k else (s_n - 0.3, s_n + 0.05)
        c = best_cut(lo, hi)
        cuts.append(c if c is not None else (min(e_k, s_n) + s_n) / 2)
    cuts.append(dur)
    if a.fix:
        # re-split listed consecutive lines between the cut before the first and after the last, by pauses
        fx = [ids.index(f) for f in a.fix.split(",")]
        t0, t1 = cuts[fx[0]], cuts[fx[-1] + 1]
        texts = list(lines.values())
        syl = [len(re.findall(r"[aiueoy]+", texts[q].lower())) + 1.5 for q in fx]
        cand, i = [], int(t0 * 100)
        while i < int(t1 * 100):
            if quiet[i]:
                j = i
                while j < int(t1 * 100) and quiet[j]: j += 1
                if j - i >= 8: cand.append(((i + j) / 200, (j - i) / 100))
                i = j
            else: i += 1
        best = None
        import itertools
        for combo in itertools.combinations(range(len(cand)), len(fx) - 1):
            pts = [t0] + [cand[c][0] for c in combo] + [t1]
            rate = (t1 - t0) / sum(syl)
            cost = sum(np.log((pts[q + 1] - pts[q]) / (syl[q] * rate)) ** 2 for q in range(len(fx))) - 0.3 * sum(np.log(1 + cand[c][1] / 0.3) for c in combo)
            if best is None or cost < best[0]: best = (cost, pts)
        for q in range(1, len(fx)): cuts[fx[0] + q] = best[1][q]
    for q in range(1, len(cuts)): cuts[q] = max(cuts[q], cuts[q - 1] + 0.2)
    outdir = ROOT / "public/voice" / a.pack
    outdir.mkdir(parents=True, exist_ok=True)
    report = []
    for k, lid in enumerate(ids):
        s, e = cuts[k], cuts[k + 1]
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{s:.3f}", "-to", f"{e:.3f}", "-i", a.audio, "-af",
                        "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,loudnorm=I=-16:TP=-1.5,apad=pad_dur=0.05",
                        "-ac", "1", "-ar", "44100", "-b:a", "80k", str(outdir / f"{lid}.mp3")], check=True)
        heard = " ".join(w for w, ws, we in words if ws >= s - 0.05 and we <= e + 0.05)
        want = " ".join(w for kk, w in script if kk == k)
        ratio = difflib.SequenceMatcher(a=want.split(), b=heard.split()).ratio()
        report.append((lid, round(e - s, 2), round(ratio, 2), heard))
    (outdir / "manifest.json").write_text(json.dumps({"pack": a.pack, "lang": a.lang, "label": a.label, "provider": a.provider, "lines": lines}, ensure_ascii=False))
    reg_path = ROOT / "public/voice/packs.json"
    reg = json.loads(reg_path.read_text()) if reg_path.exists() else {"packs": []}
    reg["packs"] = [p for p in reg["packs"] if p["id"] != a.pack] + [{"id": a.pack, "lang": a.lang, "label": a.label, "provider": a.provider, "clips": len(ids)}]
    reg_path.write_text(json.dumps(reg, ensure_ascii=False, indent=1))
    weak = [r for r in report if r[2] < 0.7]
    print(f"{a.pack}: {len(ids)} clips from {dur:.1f}s; word match per line: min {min(r[2] for r in report)}, mean {sum(r[2] for r in report) / len(report):.2f}")
    for r in weak: print("  check:", r)
    (outdir.parent / f"{a.pack}.alignment.txt").write_text("\n".join(f"{r[0]}\t{r[1]}s\t{r[2]}\t{r[3]}" for r in report))


if __name__ == "__main__":
    main()
