/* Audio Engine
 * Keyboard + feedback sounds: preloaded sample sprites (/sfx/<profile>.wav) played through Web Audio.
 * Tutor voice: pre-generated clip packs (/voice/<pack>/), never a TTS API call while typing;
 * falls back to the browser's speech synthesis in the chosen language when a pack is missing.
 *
 * Volume hierarchy (one formula, applied in one place):
 *   keyboard sounds = master × keyboard
 *   error/finish    = master × feedback
 *   tutor voice     = master × voice
 */
"use strict";
window.TT = window.TT || {};
TT.Audio = (function () {
  const PROFILES = [
    { id: "honeycomb", name: "Honeycomb", desc: "Lengket, lembut, sangat memuaskan", src: "rekaman" },
    { id: "creamy", name: "Creamy", desc: "Halus dan dalam, seperti mentega", src: "rekaman" },
    { id: "thocky2", name: "Thocky", desc: "Berat, rendah, mantap", src: "rekaman" },
    { id: "poppy", name: "Poppy", desc: "Letupan kecil yang renyah", src: "rekaman" },
    { id: "marbly", name: "Marbly", desc: "Bening seperti kelereng beradu", src: "rekaman" },
    { id: "clacky", name: "Clacky", desc: "Keras dan berisik, khas keycap tebal", src: "rekaman" },
    { id: "clicky2", name: "Clicky", desc: "Klik tajam switch biru", src: "rekaman" },
    { id: "plasticy", name: "Plastic-y", desc: "Ringan, plastik, nyaring", src: "rekaman" },
    { id: "silent", name: "Silent", desc: "Nyaris senyap, untuk ruang bersama", src: "rekaman" },
    { id: "thock", name: "Linear (sintetis)", desc: "Dibuat dengan model fisik, tanpa rekaman", src: "sintetis" },
    { id: "clicky", name: "Clicky (sintetis)", desc: "Dibuat dengan model fisik, tanpa rekaman", src: "sintetis" }
  ];
  let ctx = null, master = null, keyBus = null, uiBus = null;
  let cfg = null;
  const sprites = {}, loading = {}, raw = {}, recent = {};
  let voiceEl = null, packs = null, lines = {};

  function ensureCtx() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC({ latencyHint: "interactive" });
    master = ctx.createGain(); master.connect(ctx.destination);
    keyBus = ctx.createGain(); keyBus.connect(master);
    uiBus = ctx.createGain(); uiBus.connect(master);
    applyVolumes();
    return true;
  }
  function prefetch(name) {
    if (!raw[name]) raw[name] = Promise.all([
      fetch(`/sfx/${name}.wav?v=5`).then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); }),
      fetch(`/sfx/${name}.json?v=5`).then(r => r.json())
    ]).catch(e => { delete raw[name]; throw e; });
    return raw[name];
  }
  function load(name) {
    if (sprites[name] || loading[name] || !ensureCtx()) return loading[name] || Promise.resolve();
    loading[name] = prefetch(name)
      .then(([ab, meta]) => new Promise((res, rej) => ctx.decodeAudioData(ab.slice(0), res, rej)).then(buf => { sprites[name] = { buf, meta }; }))
      .catch(() => { delete loading[name]; });
    return loading[name];
  }
  /** call from a user gesture (browser autoplay policy) */
  function unlock() {
    if (!ensureCtx()) return;
    if (ctx.state === "suspended") ctx.resume();
    if (cfg) load(cfg.profile); load("ui");
  }
  const curve = v => Math.pow(Math.max(0, Math.min(100, +v || 0)) / 100, 1.6);
  function levels() {
    if (!cfg) return { keys: 0, ui: 0, voice: 0 };
    const m = curve(cfg.master);
    return { keys: m * curve(cfg.keyVolume), ui: m * curve(cfg.uiVolume), voice: m * curve(cfg.voiceVolume) };
  }
  function applyVolumes() {
    if (!cfg) return;
    if (master) { master.gain.value = curve(cfg.master) * 1.4; keyBus.gain.value = curve(cfg.keyVolume); uiBus.gain.value = curve(cfg.uiVolume); }
    if (voiceEl) voiceEl.volume = Math.min(1, levels().voice);
    if (voiceEl) voiceEl.playbackRate = cfg.voiceRate || 1;
  }
  function setConfig(c) {
    cfg = c; applyVolumes(); prefetch(c.profile).catch(() => { }); prefetch("ui").catch(() => { });
    if (ctx) load(c.profile);
  }
  function playClip(name, kind, bus, opts = {}) {
    const sp = sprites[name];
    if (!sp) { load(name); return false; }
    const list = sp.meta[kind] || sp.meta.key; if (!list) return false;
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === recent[name + kind]) i = (i + 1) % list.length;
    recent[name + kind] = i;
    const [off, dur] = list[i];
    const src = ctx.createBufferSource(); src.buffer = sp.buf;
    src.playbackRate.value = opts.rate || (1 + (Math.random() - 0.5) * 0.03);
    const g = ctx.createGain(); g.gain.value = opts.gain || 1;
    src.connect(g); g.connect(bus);
    src.start(ctx.currentTime, off, dur);
    return true;
  }
  /** kind: key | space | back | enter | error | correct | done | badge. profile overrides the setting (previews). */
  function play(kind, profile) {
    if (!cfg || !ensureCtx()) return;
    if (ctx.state === "suspended") ctx.resume();
    const p = profile || cfg.profile;
    switch (kind) {
      case "key": if (cfg.keys || profile) playClip(p, "key", keyBus); break;
      case "space": if (cfg.keys || profile) playClip(p, cfg.space ? "space" : "key", keyBus); break;
      case "back": if (cfg.keys || profile) playClip(p, "back", keyBus); break;
      case "enter": if (cfg.keys || profile) playClip(p, "enter", keyBus); break;
      case "error": if (cfg.error) playClip("ui", "error", uiBus, { rate: 1 }); break;
      case "correct": if (cfg.correct) playClip("ui", "correct", uiBus, { gain: 0.6, rate: 1 }); break;
      case "done": if (cfg.correct) playClip("ui", "done", uiBus, { rate: 1 }); break;
      case "badge": if (cfg.correct) playClip("ui", "badge", uiBus, { rate: 1 }); break;
    }
  }
  /** preview a profile: load it, then play a short typing phrase */
  async function preview(profile) {
    unlock(); await load(profile);
    ["key", "key", "key", "space", "key", "key", "key", "back", "key", "enter"].forEach((k, i) => setTimeout(() => play(k, profile), 40 + i * 125));
  }

  /* ---------------- tutor voice ---------------- */
  async function listPacks() {
    if (!packs) { try { packs = (await fetch("/voice/packs.json?v=5").then(r => r.json())).packs || []; } catch (e) { packs = []; } }
    return packs;
  }
  async function linesFor(lang) {
    if (!lines[lang]) { try { lines[lang] = await fetch(`/voice/lines-${lang}.json?v=5`).then(r => r.json()); } catch (e) { lines[lang] = {}; } }
    return lines[lang];
  }
  /** resolve which pack speaks: explicit pack (if it matches the language), else best pack for the language, else browser */
  async function resolvePack() {
    const lang = cfg.voiceLang || "id", list = await listPacks();
    const ok = p => p && p.lang === lang && p.clips > 0;
    const chosen = list.find(p => p.id === cfg.voicePack);
    if (cfg.voicePack === "browser") return null;
    if (ok(chosen)) return chosen;
    return list.find(p => ok(p) && p.provider === "elevenlabs") || list.find(ok) || null;
  }
  function stopVoice() {
    if (voiceEl) { voiceEl.pause(); voiceEl.removeAttribute("src"); voiceEl = null; }
    try { speechSynthesis.cancel(); } catch (e) { }
  }
  /** say(lineId, {force}) — force ignores the on/off switch (used by previews) */
  async function say(id, opts = {}) {
    if (!cfg || (!cfg.voice && !opts.force)) return;
    stopVoice();
    const lang = cfg.voiceLang || "id";
    const pack = await resolvePack();
    if (pack) {
      const el = new Audio(`/voice/${pack.id}/${id}.mp3?v=5`);
      el.preservesPitch = true; voiceEl = el; applyVolumes();
      el.play().catch(async () => speak((await linesFor(lang))[id], lang));
      el.onerror = async () => speak((await linesFor(lang))[id], lang);
      return;
    }
    speak((await linesFor(lang))[id], lang);
  }
  function speak(text, lang) {
    if (!text || !("speechSynthesis" in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === "en" ? "en-US" : "id-ID"; u.rate = cfg.voiceRate || 1; u.volume = Math.min(1, levels().voice);
      const v = speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith(lang));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch (e) { }
  }
  async function voiceInfo() {
    const p = await resolvePack();
    return p ? `${p.label} · ${p.lang === "en" ? "English" : "Indonesia"}` : `Suara bawaan browser · ${cfg.voiceLang === "en" ? "English" : "Indonesia"}`;
  }
  return { PROFILES, unlock, play, preview, setConfig, say, stopVoice, listPacks, voiceInfo, levels, ready: () => !!(ctx && cfg && sprites[cfg.profile]) };
})();
