/* Typing Engine — pure logic, no DOM. Tracks every keystroke per character. */
"use strict";
window.TT = window.TT || {};
TT.Engine = (function () {
  const IDLE_CAP = 2000; // gaps longer than this count as 2 s (user looked away)

  /**
   * create(text, {strict}) — strict: wrong key does not advance.
   * input(ch) -> {ok, expected, done}
   */
  function create(text, opts = {}) {
    const N = text.length;
    const s = {
      text, N, pos: 0, strict: !!opts.strict,
      typed: new Array(N).fill(null),      // current typed char at each position
      everWrong: new Array(N).fill(false), // was a wrong key ever typed here (kept after correction)
      wrongAs: new Array(N).fill(null),    // first wrong char typed here
      keystrokes: 0, correctStrokes: 0, backspaces: 0,
      started: null, last: 0, activeMs: 0, paused: false, done: false,
      perKey: {},                          // expected char -> {hit, miss, ms}
      pairMiss: {}                         // "previous char + expected char" -> misses (error patterns)
    };
    function tick(now) {
      if (s.started === null) { s.started = now; s.last = now; return 0; }
      const gap = now - s.last; s.last = now;
      if (!s.paused) s.activeMs += Math.min(gap, IDLE_CAP);
      return gap;
    }
    function input(ch, now = performance.now()) {
      if (s.done) return null;
      const gap = tick(now);
      const exp = text[s.pos];
      const ok = ch === exp;
      s.keystrokes++;
      const k = exp.toLowerCase();
      const pk = s.perKey[k] || (s.perKey[k] = { hit: 0, miss: 0, ms: 0 });
      if (ok) { s.correctStrokes++; pk.hit++; if (gap && gap < IDLE_CAP) pk.ms += gap; }
      else {
        pk.miss++; s.everWrong[s.pos] = true; if (s.wrongAs[s.pos] == null) s.wrongAs[s.pos] = ch;
        if (s.pos > 0 && text[s.pos - 1] !== " " && exp !== " ") { const pr = (text[s.pos - 1] + exp).toLowerCase(); s.pairMiss[pr] = (s.pairMiss[pr] || 0) + 1; }
      }
      if (!ok && s.strict) return { ok, expected: exp, advanced: false, done: false };
      s.typed[s.pos] = ch; s.pos++;
      if (s.pos >= N) s.done = true;
      return { ok, expected: exp, advanced: true, done: s.done };
    }
    function back(now = performance.now()) {
      if (s.done || s.pos === 0) return false;
      tick(now); s.backspaces++;
      s.pos--; s.typed[s.pos] = null;
      return true;
    }
    function resume() { s.paused = false; s.last = performance.now(); }
    function pause() { s.paused = true; }
    /** char status: untyped | cur | ok | bad | fixed */
    function status(i) {
      if (i === s.pos && !s.done) return "cur";
      const t = s.typed[i];
      if (t == null) return "untyped";
      if (t !== text[i]) return "bad";
      return s.everWrong[i] ? "fixed" : "ok";
    }
    function stats() {
      let correct = 0, incorrect = 0, corrected = 0;
      for (let i = 0; i < N; i++) {
        const t = s.typed[i]; if (t == null) continue;
        if (t === text[i]) { correct++; if (s.everWrong[i]) corrected++; } else incorrect++;
      }
      const typedChars = correct + incorrect;
      // guard against impossible speeds (e.g. scripted input): at least 40 ms per character, i.e. max 300 WPM
      const minutes = Math.max(s.activeMs, (correct + incorrect) * 40, 1) / 60000;
      const mistakes = s.everWrong.filter(Boolean).length;
      return {
        typedChars, correct, incorrect, corrected, mistakes,
        keystrokes: s.keystrokes, backspaces: s.backspaces,
        timeMs: s.activeMs,
        // gross WPM = (typed characters / 5) / minutes (standard 5-char word)
        wpm: typedChars ? Math.round(typedChars / 5 / minutes) : 0,
        // net WPM removes uncorrected errors
        netWpm: typedChars ? Math.max(0, Math.round((typedChars / 5 - incorrect) / minutes)) : 0,
        // Accuracy: final text correctness (corrections count as fixed)
        accuracy: typedChars ? Math.round(correct / typedChars * 100) : 100,
        // Real accuracy: every keystroke counts; a mistake stays a mistake even if corrected
        realAccuracy: s.keystrokes ? Math.round(s.correctStrokes / s.keystrokes * 100) : 100
      };
    }
    return { s, input, back, pause, resume, status, stats };
  }

  /** stars 0..5 from goal {wpm, acc} — acc is the minimum real accuracy for 1 star */
  function stars(st, goal) {
    const a = st.realAccuracy, w = st.wpm, m = goal.acc;
    if (a < m) return 0;
    const span = 100 - m;
    let n = 1;
    if (a >= m + span * 0.45) n++;
    if (a >= m + span * 0.75) n++;
    if (w >= goal.wpm * 0.75) n++;
    if (w >= goal.wpm && a >= m + span * 0.75) n++;
    if (w < goal.wpm * 0.4) n = Math.min(n, 2); // too slow: max 2 stars
    return Math.max(1, Math.min(5, n));
  }
  return { create, stars };
})();

/* Input filter — decides what one keydown means. Pure function so it can be unit-tested.
 * Returns {type: 'char'|'back'|'pause'|'enter'|'repeat'|'dead'|'swallow'|'pass', ch?}
 *  - 'pass'    : let the browser handle it (shortcuts, IME/mobile text that arrives via the input event)
 *  - 'swallow' : prevent default and do nothing (Tab, so focus never leaves the lesson)
 *  - 'repeat'  : held-down key auto-repeat of a character (ignored when ignoreRepeat is on)
 */
TT.Input = (function () {
  function classify(e, opts = {}) {
    if (e.isComposing || e.key === "Process" || e.key === "Unidentified" || e.keyCode === 229) return { type: "pass" };
    const altGraph = e.getModifierState ? e.getModifierState("AltGraph") : false;
    if (e.ctrlKey || e.metaKey || (e.altKey && !altGraph)) return { type: "pass" };
    if (e.key === "Dead") return { type: "dead" };
    if (e.key === "Escape") return { type: "pause" };
    if (e.key === "Backspace") return { type: "back" };
    if (e.key === "Enter") return { type: "enter" };
    if (e.key === "Tab") return { type: "swallow" };
    if (e.key && e.key.length === 1) {
      if (e.repeat && opts.ignoreRepeat !== false) return { type: "repeat" };
      return { type: "char", ch: e.key };
    }
    return { type: "pass" };
  }
  return { classify };
})();
