#!/usr/bin/env python3
"""Pre-generate a TouchTyping tutor voice pack (one MP3 per line).

Clips are generated ONCE at build time and shipped as static files: the site never calls a TTS API
while someone types, and no API key ever reaches the browser.

  # ElevenLabs "Putra" voice, Indonesian and English packs (needs ELEVENLABS_API_KEY with credits)
  python3 tools/gen_voice.py elevenlabs --lang id --pack putra-id --label "Putra (ElevenLabs)"
  python3 tools/gen_voice.py elevenlabs --lang en --pack putra-en --label "Putra (ElevenLabs)"
  # OmniVoice server on the LAN (Indonesian)
  python3 tools/gen_voice.py omnivoice --lang id --pack omni --label "OmniVoice"

Lines: tools/voice_lines.json (id) and tools/voice_lines_en.json (en). About 2,750 characters per pack.
Output: public/voice/<pack>/<id>.mp3, public/voice/<pack>/manifest.json, and public/voice/packs.json (registry).
"""
import argparse, json, os, subprocess, sys, tempfile, urllib.request, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OMNI_SCRIPT = pathlib.Path.home() / ".claude/skills/omnivoice-tts/scripts/tts.py"
PUTRA = "RWiGLY9uXI70QL540WNd"  # ElevenLabs voice "Putra - Smooth, Clear and Engaging"


def to_mp3(src, dst):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-af",
                    "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5",
                    "-ac", "1", "-ar", "44100", "-b:a", "80k", str(dst)], check=True)


def omnivoice(text, out, lang):
    with tempfile.TemporaryDirectory() as td:
        r = subprocess.run([sys.executable, str(OMNI_SCRIPT), "--text", text, "--out", f"{td}/a.wav",
                            "--lang", "indonesian" if lang == "id" else "english"], capture_output=True, text=True, check=True)
        to_mp3(json.loads(r.stdout[r.stdout.index("{"):])["output"], out)


def elevenlabs(text, out, voice_id, lang):
    body = json.dumps({"text": text, "model_id": "eleven_multilingual_v2", "language_code": lang,
                       "voice_settings": {"stability": 0.55, "similarity_boost": 0.75, "style": 0.15}}).encode()
    req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128", data=body,
                                 headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "Content-Type": "application/json"})
    with tempfile.NamedTemporaryFile(suffix=".mp3") as tf:
        tf.write(urllib.request.urlopen(req, timeout=60).read()); tf.flush()
        to_mp3(tf.name, out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("provider", choices=["elevenlabs", "omnivoice"])
    ap.add_argument("--lang", choices=["id", "en"], default="id")
    ap.add_argument("--pack", required=True)
    ap.add_argument("--label", required=True)
    ap.add_argument("--voice-id", default=PUTRA)
    a = ap.parse_args()
    lines = json.loads((ROOT / ("tools/voice_lines.json" if a.lang == "id" else "tools/voice_lines_en.json")).read_text())
    outdir = ROOT / "public/voice" / a.pack
    outdir.mkdir(parents=True, exist_ok=True)
    done = []
    for i, (lid, text) in enumerate(lines.items(), 1):
        out = outdir / f"{lid}.mp3"
        if not out.exists():
            try:
                omnivoice(text, out, a.lang) if a.provider == "omnivoice" else elevenlabs(text, out, a.voice_id, a.lang)
            except Exception as e:  # keep going; the app falls back to browser speech for missing clips
                print(f"[{i}/{len(lines)}] FAILED {lid}: {e}", flush=True)
                continue
        done.append(lid)
        print(f"[{i}/{len(lines)}] {lid}", flush=True)
    (outdir / "manifest.json").write_text(json.dumps({"pack": a.pack, "lang": a.lang, "label": a.label, "provider": a.provider,
                                                      "lines": {k: lines[k] for k in done}}, ensure_ascii=False))
    reg_path = ROOT / "public/voice/packs.json"
    reg = json.loads(reg_path.read_text()) if reg_path.exists() else {"packs": []}
    reg["packs"] = [p for p in reg["packs"] if p["id"] != a.pack] + [{"id": a.pack, "lang": a.lang, "label": a.label, "provider": a.provider, "clips": len(done)}]
    reg_path.write_text(json.dumps(reg, ensure_ascii=False, indent=1))
    print(f"done: {len(done)}/{len(lines)} clips in {outdir}")


if __name__ == "__main__":
    main()
