// Run: node tests/engine.test.js   (no dependencies)
"use strict";
const assert = require("node:assert/strict");
global.window = global; global.performance = { now: () => 0 };
require("../public/js/engine.js");
const { Engine, Input } = global.TT;

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; console.log("  ok  ", name); } catch (e) { fail++; console.log("  FAIL", name, "\n       ", e.message); } }
// type a string with a fixed gap (ms) per key; "\b" = backspace
function run(text, keys, opts = {}, gap = 200) {
  const s = Engine.create(text, opts); let t = 0;
  for (const k of keys) { t += gap; if (k === "\b") s.back(t); else s.input(k, t); }
  return s;
}
const statuses = s => [...s.s.text].map((_, i) => s.status(i)).join(",");

console.log("Typing engine");
test("normal typing: every char correct, done", () => {
  const s = run("the quick", "the quick");
  assert.equal(s.s.done, true); const st = s.stats();
  assert.equal(st.correct, 9); assert.equal(st.incorrect, 0); assert.equal(st.accuracy, 100); assert.equal(st.realAccuracy, 100);
});
test("one key = one character (100 inputs -> 100 positions)", () => {
  const text = "asdf jkl; ".repeat(10); const s = run(text, text);
  assert.equal(s.s.keystrokes, 100); assert.equal(s.s.pos, 100);
});
test("wrong char marks only that position, rest does not shift", () => {
  const s = run("the quick", "the quikc");
  assert.equal(statuses(s), "ok,ok,ok,ok,ok,ok,ok,bad,bad");
  assert.equal(s.stats().incorrect, 2);
});
test("explicit correction flow", () => {
  const s = run("keyboard", ["k","e","y","b","o","x","\b","a","r","d"]);
  assert.equal(s.s.done, true);
  assert.equal(statuses(s), "ok,ok,ok,ok,ok,fixed,ok,ok");
  const st = s.stats();
  assert.equal(st.accuracy, 100);          // final text is correct
  assert.equal(st.corrected, 1);
  assert.equal(st.mistakes, 1);
  assert.equal(st.realAccuracy, 89);       // 8 correct of 9 keystrokes
  assert.equal(st.backspaces, 1);
});
test("backspace at start does nothing", () => {
  const s = run("ab", ["\b", "\b", "a"]); assert.equal(s.s.pos, 1); assert.equal(s.s.backspaces, 0);
});
test("strict mode: wrong key does not advance", () => {
  const s = run("ab", ["x", "a", "b"], { strict: true });
  assert.equal(s.s.done, true); assert.equal(s.s.keystrokes, 3); assert.equal(s.status(0), "fixed");
});
test("uppercase and symbols compare exactly", () => {
  const s = run("Aa?!", "aA?!"); assert.equal(statuses(s), "bad,bad,ok,ok");
});
test("spaces count as characters", () => {
  const s = run("a b", "a b"); assert.equal(s.stats().typedChars, 3);
});
test("repeated characters", () => {
  const s = run("kkkk dddd", "kkkk dddd"); assert.equal(s.stats().correct, 9);
});
test("WPM = (typed chars / 5) / minutes", () => {
  const text = "x".repeat(50); const s = run(text, text, {}, 240);   // 50 keys * 240ms, first key starts the clock
  // active time = 49 gaps * 240ms = 11.76s -> 50/5/(11.76/60) = 51
  assert.equal(s.stats().wpm, 51);
});
test("idle gaps are capped at 2 s", () => {
  const s = Engine.create("ab"); s.input("a", 0); s.input("b", 60000);
  assert.equal(s.s.activeMs, 2000);
});
test("pause stops the clock", () => {
  const s = Engine.create("abc"); s.input("a", 0); s.pause(); s.input("b", 1500); s.resume(); s.s.last = 1500; s.input("c", 1700);
  assert.equal(s.s.activeMs, 200);
});
test("no input accepted after done", () => {
  const s = run("ab", "ab"); assert.equal(s.input("x", 999), null); assert.equal(s.s.keystrokes, 2);
});
test("stars: 0 below accuracy floor, 5 needs speed + accuracy", () => {
  assert.equal(Engine.stars({ realAccuracy: 70, wpm: 50 }, { wpm: 20, acc: 80 }), 0);
  assert.equal(Engine.stars({ realAccuracy: 99, wpm: 25 }, { wpm: 20, acc: 80 }), 5);
  assert.ok(Engine.stars({ realAccuracy: 99, wpm: 5 }, { wpm: 20, acc: 80 }) <= 2);
  assert.ok(Engine.stars({ realAccuracy: 85, wpm: 30 }, { wpm: 20, acc: 80 }) < 5);
});

console.log("Input filter");
const ev = (key, o = {}) => ({ key, repeat: false, ctrlKey: false, metaKey: false, altKey: false, isComposing: false, getModifierState: () => false, ...o });
test("letter -> char", () => assert.deepEqual(Input.classify(ev("k")), { type: "char", ch: "k" }));
test("shifted symbol -> char", () => assert.deepEqual(Input.classify(ev("?")), { type: "char", ch: "?" }));
test("space -> char", () => assert.deepEqual(Input.classify(ev(" ")), { type: "char", ch: " " }));
test("held key auto-repeat is ignored", () => assert.equal(Input.classify(ev("k", { repeat: true }), { ignoreRepeat: true }).type, "repeat"));
test("auto-repeat allowed when setting is off", () => assert.equal(Input.classify(ev("k", { repeat: true }), { ignoreRepeat: false }).type, "char"));
test("backspace (repeat allowed)", () => assert.equal(Input.classify(ev("Backspace", { repeat: true })).type, "back"));
test("ctrl/meta shortcuts pass through", () => { assert.equal(Input.classify(ev("r", { ctrlKey: true })).type, "pass"); assert.equal(Input.classify(ev("c", { metaKey: true })).type, "pass"); });
test("AltGr characters are typed", () => assert.equal(Input.classify(ev("@", { altKey: true, getModifierState: m => m === "AltGraph" })).type, "char"));
test("IME / mobile composition passes to input event", () => { assert.equal(Input.classify(ev("Process")).type, "pass"); assert.equal(Input.classify(ev("a", { isComposing: true })).type, "pass"); assert.equal(Input.classify(ev("Unidentified")).type, "pass"); });
test("dead key is reported", () => assert.equal(Input.classify(ev("Dead")).type, "dead"));
test("Escape pauses, Tab is swallowed, Shift alone passes", () => { assert.equal(Input.classify(ev("Escape")).type, "pause"); assert.equal(Input.classify(ev("Tab")).type, "swallow"); assert.equal(Input.classify(ev("Shift")).type, "pass"); });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
