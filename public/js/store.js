/* Progress Tracking + User Settings (localStorage with versioned migration) + Achievements. */
"use strict";
window.TT = window.TT || {};
TT.Store = (function () {
  const KEY = "touchtyping", VERSION = 4;
  const DEFAULT_SETTINGS = {
    sound: {
      master: 80, keys: true, profile: "honeycomb", keyVolume: 70, space: true, error: true, uiVolume: 60, correct: true,
      voice: true, voiceLang: "id", voicePack: "auto", voiceRate: 1, voiceVolume: 85, voiceIntro: true, voiceErrors: true, voiceResults: true
    },
    keyboard: true, hands: "both", zones: false, fontSize: 34, typingFont: "mono",
    theme: "light", highContrast: false, reducedMotion: false,
    strict: false, ignoreRepeat: true, unlockAll: false, dailyGoal: 10
  };
  const blank = () => ({ v: VERSION, lessons: {}, keys: {}, pairs: {}, history: [], typingMs: 0, points: 0, badges: {}, days: {}, settings: structuredClone(DEFAULT_SETTINGS) });
  let S;

  function migrate(d) {
    if (!d || typeof d !== "object") return blank();
    const out = blank();
    out.lessons = d.lessons || {}; out.keys = d.keys || {}; out.history = Array.isArray(d.history) ? d.history : [];
    out.pairs = d.pairs || {}; out.typingMs = +d.typingMs || 0; out.points = +d.points || 0; out.badges = d.badges || {}; out.days = d.days || {};
    out.history.forEach(h => { if (!h.day) h.day = dayKey(h.t); });
    const s = d.settings || {}, D = out.settings;
    if (!d.v || d.v < 2) {            // v1: flat booleans
      D.sound.keys = s.sound !== false; D.sound.voice = !!s.voice;
      D.hands = s.hands === false ? "none" : "both"; D.unlockAll = !!s.unlockAll;
      D.theme = s.theme === "dark" ? "dark" : "light";
    } else {                          // v2 and v3
      ["keyboard", "hands", "zones", "fontSize", "typingFont", "theme", "highContrast", "reducedMotion", "strict", "ignoreRepeat", "unlockAll", "dailyGoal"].forEach(k => { if (s[k] !== undefined) D[k] = s[k]; });
      Object.assign(D.sound, s.sound || {});
      if (d.v <= 3 && (D.sound.voicePack === "omni" || !D.sound.voicePack)) D.sound.voicePack = "auto";
      if (d.v === 2) { if (s.sound && s.sound.volume != null) D.sound.master = s.sound.volume; D.sound.voice = s.voice !== undefined ? !!s.voice : D.sound.voice; delete D.sound.volume; }
    }
    out.v = VERSION;
    return out;
  }
  function load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { raw = null; }
    S = migrate(raw);
    return S;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
  function dayKey(t) { const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

  function streak() {
    let n = 0; const d = new Date();
    if (!S.days[dayKey(d)]) d.setDate(d.getDate() - 1); // streak still alive if practiced yesterday
    while (S.days[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function totals() {
    const L = TT.Course.LESSONS; let stars = 0, done = 0;
    L.forEach(l => { const r = S.lessons[l.id]; if (r) { stars += r.stars || 0; done++; } });
    const H = S.history.filter(h => h.wpm > 0);
    const last = H.slice(-20);
    return {
      stars, done, total: L.length, pct: Math.round(done / L.length * 100),
      avgWpm: last.length ? Math.round(last.reduce((a, b) => a + b.wpm, 0) / last.length) : 0,
      avgAcc: last.length ? Math.round(last.reduce((a, b) => a + b.acc, 0) / last.length) : 0,
      best: H.reduce((a, b) => Math.max(a, b.wpm), 0), streak: streak(), todayMs: S.days[dayKey(Date.now())] || 0
    };
  }
  /** record a finished attempt; returns {prev, isBest} */
  function record(lesson, st, stars, points) {
    const now = Date.now(), day = dayKey(now);
    const prev = S.lessons[lesson.id] ? { ...S.lessons[lesson.id] } : null;
    S.history.push({ t: now, day, id: lesson.id, wpm: st.wpm, acc: st.realAccuracy, stars, ms: Math.round(st.timeMs) });
    if (S.history.length > 500) S.history.shift();
    S.typingMs += st.timeMs; S.points += points;
    S.days[day] = (S.days[day] || 0) + st.timeMs;
    Object.entries(st.pairMiss || {}).forEach(([k, n]) => { S.pairs[k] = (S.pairs[k] || 0) + n; });
    Object.entries(st.perKey || {}).forEach(([k, v]) => {
      const t = S.keys[k] || (S.keys[k] = { hit: 0, miss: 0, ms: 0 });
      t.hit += v.hit; t.miss += v.miss; t.ms += v.ms;
    });
    let isBest = false;
    if (stars > 0 && lesson.id !== "pintar") {
      if (!prev || stars > prev.stars || (stars === prev.stars && st.wpm > (prev.wpm || 0))) {
        S.lessons[lesson.id] = { stars, wpm: st.wpm, acc: st.realAccuracy, t: now }; isBest = true;
      }
    }
    save();
    return { prev, isBest };
  }
  function weakKeys(n = 5) {
    return Object.entries(S.keys).filter(([k, v]) => v.hit + v.miss >= 8 && k !== " ")
      .map(([k, v]) => ({ k, rate: v.miss / (v.hit + v.miss), ms: v.ms / Math.max(1, v.hit), n: v.hit + v.miss }))
      .sort((a, b) => (b.rate * 3 + b.ms / 2000) - (a.rate * 3 + a.ms / 2000)).slice(0, n);
  }

  const BADGES = [
    { id: "first", icon: "sprout", name: "Langkah pertama", desc: "Selesaikan 1 pelajaran", test: t => t.done >= 2 },
    { id: "ten", icon: "book", name: "Rajin belajar", desc: "Selesaikan 10 pelajaran", test: t => t.done >= 10 },
    { id: "home", icon: "home", name: "Ahli baris tengah", desc: "Lulus ujian baris tengah", test: () => !!S.lessons["home-t"] },
    { id: "top", icon: "mountain", name: "Penakluk baris atas", desc: "Lulus ujian baris atas", test: () => !!S.lessons["top-t"] },
    { id: "stars50", icon: "star", name: "Kolektor bintang", desc: "Kumpulkan 50 bintang", test: t => t.stars >= 50 },
    { id: "wpm20", icon: "gauge", name: "20 WPM", desc: "Capai 20 kata per menit", test: t => t.best >= 20 },
    { id: "wpm40", icon: "rocket", name: "40 WPM", desc: "Capai 40 kata per menit", test: t => t.best >= 40 },
    { id: "perfect", icon: "target", name: "Tanpa cela", desc: "Akurasi murni 100% di satu pelajaran", test: () => S.history.some(h => h.acc === 100 && h.wpm > 0) },
    { id: "streak3", icon: "flame", name: "3 hari beruntun", desc: "Latihan 3 hari berturut-turut", test: t => t.streak >= 3 },
    { id: "hour", icon: "clock", name: "Satu jam", desc: "Total 60 menit mengetik", test: () => S.typingMs >= 3600000 },
    { id: "final", icon: "trophy", name: "Lulus!", desc: "Selesaikan ujian akhir", test: () => !!S.lessons["final"] }
  ];
  /** returns newly earned badges */
  function checkBadges() {
    const t = totals(), fresh = [];
    BADGES.forEach(b => { if (!S.badges[b.id] && b.test(t)) { S.badges[b.id] = Date.now(); fresh.push(b); } });
    if (fresh.length) save();
    return fresh;
  }
  function reset() { const st = S.settings; S = blank(); S.settings = st; save(); }
  function resetSettings(keys) {
    if (!keys) { S.settings = structuredClone(DEFAULT_SETTINGS); save(); return; }
    keys.forEach(path => { const ks = path.split("."), last = ks.pop(); const src = ks.reduce((o, k) => o[k], DEFAULT_SETTINGS), dst = ks.reduce((o, k) => o[k], S.settings); dst[last] = structuredClone(src[last]); });
    save();
  }
  function importData(d) { S = migrate(d); save(); }

  load();
  return { get S() { return S; }, save, resetSettings, totals, record, weakKeys, BADGES, checkBadges, reset, importData, dayKey, DEFAULT_SETTINGS };
})();
