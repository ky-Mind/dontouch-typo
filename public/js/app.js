/* App shell: routing, input + focus management, and the views
 * (course journey, onboarding, lesson, results, game, statistics, settings). */
"use strict";
(function () {
  const { Course, Store, Keys, Engine, Audio, Input, UI } = TT;
  const { esc, I, starRow, ring, illus, toast, dialog, TYPE_LABEL } = UI;
  const $ = s => document.querySelector(s);
  const app = $("#app");
  const set = () => Store.S.settings;
  const snd = () => Store.S.settings.sound;
  const LESSONS = Course.LESSONS;

  /* ---------- apply settings everywhere ---------- */
  const sysDark = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
  function applySettings() {
    const s = set(), root = document.documentElement;
    const dark = s.theme === "dark" || (s.theme === "system" && sysDark && sysDark.matches);
    if (dark) root.setAttribute("data-theme", "dark"); else root.removeAttribute("data-theme");
    root.classList.toggle("hc", !!s.highContrast);
    root.classList.toggle("rm", !!s.reducedMotion);
    root.classList.toggle("font-sans", s.typingFont === "sans");
    root.style.setProperty("--tsize", s.fontSize + "px");
    Audio.setConfig(s.sound);
  }
  if (sysDark && sysDark.addEventListener) sysDark.addEventListener("change", applySettings);
  applySettings();
  $("#brandlogo").innerHTML = UI.LOGO;

  /* ---------- small helpers ---------- */
  const fmtTime = ms => { const s = Math.round(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  const fmtMin = ms => { const m = Math.round(ms / 60000); return m < 60 ? m + " menit" : Math.floor(m / 60) + " jam " + (m % 60) + " menit"; };
  const ago = t => { const m = Math.round((Date.now() - t) / 60000); if (m < 1) return "baru saja"; if (m < 60) return m + " menit lalu"; const h = Math.round(m / 60); if (h < 24) return h + " jam lalu"; return Math.round(h / 24) + " hari lalu"; };
  const titleOf = id => (LESSONS.find(l => l.id === id) || { title: id === "pintar" ? "Latihan Pintar" : id }).title;
  const keyName = k => k === " " ? "spasi" : k;
  const fingerOf = k => { const m = Keys.CHARMAP[k]; return m ? Keys.FNAME[m.f === "T" ? "TL" : m.f] : ""; };
  const KEYLINE = { ";": "semicolon", ",": "comma", ".": "period", "/": "slash", "'": "quote", "-": "minus", "=": "equal", "[": "lbracket", "]": "rbracket", "\\": "backslash", "`": "backtick", " ": "space" };
  function sayKey(ch) { const m = Keys.CHARMAP[ch]; if (m) Audio.say("key_" + (KEYLINE[m.key] || m.key)); }

  function lessonState(i) {
    const l = LESSONS[i], r = Store.S.lessons[l.id];
    const unlocked = set().unlockAll || i === 0 || !!r || !!Store.S.lessons[LESSONS[i - 1].id];
    return { done: !!r, stars: r ? r.stars : 0, unlocked, rec: r };
  }
  const nextIndex = () => { for (let i = 0; i < LESSONS.length; i++) if (!Store.S.lessons[LESSONS[i].id]) return i; return LESSONS.length - 1; };

  function renderHeader() {
    const t = Store.totals();
    $("#chips").innerHTML = `
      <div class="hstat" title="${t.done} dari ${t.total} pelajaran selesai">${ring(t.pct, 34, 3.5)}<div><b>${t.pct}%</b><span>progres</span></div></div>
      <div class="hstat"><span class="hico star-ico">${I.star}</span><div><b>${t.stars}</b><span>bintang</span></div></div>
      <div class="hstat"><span class="hico flame-ico">${I.flame}</span><div><b>${t.streak}</b><span>hari beruntun</span></div></div>
      ${set().unlockAll ? `<a class="freemode" href="#/pengaturan/belajar" title="Semua pelajaran terbuka. Matikan di Pengaturan › Pembelajaran">Mode bebas</a>` : ""}`;
  }

  /* ---------- input + focus management ----------
   * One keydown listener for the whole app. While a lesson runs, focus is pinned to a hidden input so
   * keys never reach toolbar buttons or dropdowns. Each keydown is classified once (TT.Input) and
   * handled exactly once. */
  let handler = null;
  const hid = $("#hid");
  const focusInput = () => { if (document.activeElement !== hid) try { hid.focus({ preventScroll: true }); } catch (e) { } };
  document.addEventListener("keydown", e => {
    Audio.unlock();
    if (!handler || document.querySelector(".modal.dialog-open")) return;
    const inPop = e.target && e.target.closest && e.target.closest(".pop");
    if (inPop && e.target !== hid && ["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " ", "Home", "End"].includes(e.key)) return;
    if (pop && e.key === "Escape") { e.preventDefault(); closePop(); return; }
    const a = Input.classify(e, { ignoreRepeat: set().ignoreRepeat });
    if (a.type === "pass") return;
    e.preventDefault();
    if (inPop) { closePop(); focusInput(); }
    if (handler.caps && e.getModifierState) handler.caps(e.getModifierState("CapsLock"));
    handler.on(a, e);
  }, true);
  hid.addEventListener("input", () => { const v = hid.value; hid.value = ""; if (handler) for (const ch of v) handler.on({ type: "char", ch }); });
  document.addEventListener("mousedown", e => { if (handler && handler.typing && e.target.closest(".lbar button")) e.preventDefault(); });
  document.addEventListener("click", e => { if (handler && handler.typing && !e.target.closest("input,select,.pop,a,.modal")) focusInput(); });
  window.addEventListener("focus", () => { if (handler && handler.typing) focusInput(); });
  document.addEventListener("pointerdown", () => Audio.unlock(), { passive: true });

  let pop = null;
  function closePop() { if (pop) { pop.remove(); pop = null; if (handler && handler.typing) focusInput(); } }
  document.addEventListener("pointerdown", e => { if (pop && !e.target.closest(".pop,[data-pop]")) closePop(); });

  /* ---------- router ---------- */
  let cleanup = null;
  function route() {
    if (cleanup) { cleanup(); cleanup = null; }
    handler = null; closePop(); Audio.stopVoice();
    document.querySelectorAll(".modal,.pause").forEach(m => m.remove());
    const h = location.hash.replace(/^#\/?/, "");
    const lessonMode = h.startsWith("l/") || h.startsWith("pintar");
    document.body.classList.toggle("lesson-mode", lessonMode);
    document.querySelectorAll(".nav a").forEach(a => { const on = a.dataset.r === h.split("/")[0]; a.classList.toggle("on", on); if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    renderHeader();
    if (!h.startsWith("pengaturan/")) window.scrollTo(0, 0);
    if (h.startsWith("l/")) {
      const i = LESSONS.findIndex(l => l.id === decodeURIComponent(h.slice(2)));
      if (i >= 0 && lessonState(i).unlocked) return openLesson(i);
      location.replace("#/"); return;
    }
    if (h.startsWith("pintar")) return openSmart(decodeURIComponent(h.split("/")[1] || ""));
    if (h === "statistik") return viewStats();
    if (h.startsWith("pengaturan")) return viewSettings(h.split("/")[1]);
    viewHome();
  }
  addEventListener("hashchange", route);

  /* ================= HOME: learning journey ================= */
  const openChapters = new Set();
  function viewHome() {
    const t = Store.totals(), ni = nextIndex(), nl = LESSONS[ni];
    const goal = set().dailyGoal, today = Math.round(t.todayMs / 60000), gp = Math.min(100, today / goal * 100);
    const unitOfNext = nl.unit;
    let html = `<div class="mobile-warn">Latihan sepuluh jari paling optimal memakai keyboard fisik. Di HP kamu tetap bisa mempelajari posisi jari, melihat kursus, statistik, dan pengaturan.</div>
    <section class="hero">
      <div class="hero-main">
        <div class="eyebrow">${t.done > 1 ? "Lanjutkan perjalananmu" : "Mulai dari sini"}</div>
        <h1>${esc(nl.title)}</h1>
        <p class="muted">Pelajaran ${nl.n} dari ${t.total} · ${esc(TYPE_LABEL[nl.type] || "")} · ${esc(nl.desc || Course.UNITS.find(u => u.id === nl.unit).desc)}</p>
        <button class="btn lg" onclick="location.hash='#/l/${nl.id}'">${t.done > 1 ? "Lanjutkan" : "Mulai belajar"} ${I.arrow}</button>
      </div>
      <div class="hero-side">
        <div class="today">${ring(gp, 64, 6, `${today}`)}<div><b>${today} dari ${goal} menit</b><span>target latihan hari ini</span></div></div>
        <dl class="facts">
          <div><dt>Kecepatan rata-rata</dt><dd>${t.avgWpm ? t.avgWpm + " WPM" : "Belum ada"}</dd></div>
          <div><dt>Akurasi murni</dt><dd>${t.avgAcc ? t.avgAcc + "%" : "Belum ada"}</dd></div>
        </dl>
      </div>
    </section>
    <section class="journey" aria-label="Peta kursus">`;
    Course.UNITS.forEach((u, ui) => {
      const idx = LESSONS.map((l, i) => i).filter(i => LESSONS[i].unit === u.id);
      const done = idx.filter(i => Store.S.lessons[LESSONS[i].id]).length;
      const stars = idx.reduce((a, i) => a + (Store.S.lessons[LESSONS[i].id] ? Store.S.lessons[LESSONS[i].id].stars : 0), 0);
      const first = idx[0], unlocked = lessonState(first).unlocked;
      const state = done === idx.length ? "done" : u.id === unitOfNext ? "current" : unlocked ? "open" : "locked";
      const open = openChapters.has(u.id) || state === "current" || (state === "open" && set().unlockAll && false);
      const prevName = ui > 0 ? Course.UNITS[ui - 1].name : "";
      const status = state === "done" ? `Selesai · ${stars} bintang` : state === "current" ? `Sedang dipelajari · ${done} dari ${idx.length}` : state === "open" ? `${done} dari ${idx.length} selesai` : `Terkunci · selesaikan bab ${esc(prevName)} dulu`;
      html += `<div class="chapter ${state} ${open ? "open" : ""}" data-unit="${u.id}">
        <div class="rail"><span class="node">${state === "done" ? I.check : ui + 1}</span></div>
        <div class="chbody">
          <button class="chhead" aria-expanded="${open}" data-toggle="${u.id}">
            <div><span class="chnum">Bab ${ui + 1}</span><h2>${esc(u.name)}</h2><p>${esc(u.desc)}</p></div>
            <div class="chmeta"><span class="chstatus">${status}</span><div class="bar"><i style="width:${done / idx.length * 100}%"></i></div></div>
            <span class="chev">${I.chevron}</span>
          </button>
          <div class="grid">`;
      idx.forEach(i => {
        const l = LESSONS[i], st = lessonState(i);
        const lockMsg = st.unlocked ? "" : `Selesaikan pelajaran ${i} (${esc(LESSONS[i - 1].title)}) dulu`;
        html += `<button class="card ${st.unlocked ? "" : "locked"} ${st.done ? "done" : ""} ${i === ni && st.unlocked ? "next" : ""}" ${st.unlocked ? `onclick="location.hash='#/l/${l.id}'"` : `aria-disabled="true"`} title="${st.unlocked ? esc(l.title + (st.rec && st.rec.wpm ? ` · rekor ${st.rec.wpm} WPM` : "")) : lockMsg}">
            <span class="ctop"><span class="num">${String(l.n).padStart(2, "0")}</span><span class="tag">${esc(TYPE_LABEL[l.type] || "")}</span>${st.unlocked ? "" : `<span class="lk">${I.lock}</span>`}</span>
            <span class="ill">${illus(l)}</span>
            <span class="cfoot">${st.done ? (l.type === "guide" ? `<span class="okmark">${I.check} Selesai</span>` : starRow(st.stars)) : i === ni && st.unlocked ? `<span class="go">Mulai ${I.arrow}</span>` : ""}</span>
            <span class="name">${esc(l.title)}</span></button>`;
      });
      html += `</div></div></div>`;
    });
    html += `</section>`;
    app.innerHTML = html;
    app.querySelectorAll("[data-toggle]").forEach(b => b.addEventListener("click", () => {
      const id = b.dataset.toggle, ch = b.closest(".chapter");
      const open = !ch.classList.contains("open"); ch.classList.toggle("open", open); b.setAttribute("aria-expanded", open);
      if (open) openChapters.add(id); else openChapters.delete(id);
    }));
  }

  /* ================= LESSON ================= */
  const coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  let mobileOk = false;
  function openLesson(i) {
    const l = LESSONS[i];
    if (l.type === "guide") return viewOnboarding(i);
    if (coarse && !mobileOk) return mobileGate(() => openLesson(i));
    if (l.type === "game") return viewGame(i);
    runTyping(l, i);
  }
  function mobileGate(go) {
    app.innerHTML = `<div class="gate"><span class="dicon">${I.kb}</span><h1>Latihan ini butuh keyboard fisik</h1>
      <p class="muted">Mengetik sepuluh jari dilatih dengan jari di atas keyboard sungguhan. Di HP, keyboard layar tidak bisa mengajarkan posisi jari.</p>
      <div class="row center"><a class="btn" href="#/l/L0">Pelajari posisi jari</a><button class="btn ghost" id="anyway">Tetap coba di HP</button></div>
      <p class="muted small">Sambungkan keyboard Bluetooth/USB ke HP atau tablet untuk latihan penuh.</p></div>`;
    $("#anyway").onclick = () => { mobileOk = true; go(); };
  }
  function openSmart(keysArg) {
    const learned = Object.keys(Store.S.keys).filter(k => /[a-z]/.test(k)).join("") || "asdfjkl";
    const wk = keysArg ? [...new Set(keysArg)] : Store.weakKeys(5).map(w => w.k);
    if (!wk.length) { location.replace("#/statistik"); return; }
    runTyping({ id: "pintar", n: 0, type: "smart", title: "Latihan Pintar: " + wk.map(keyName).join(" "), text: Course.smartText(wk, learned), goal: { wpm: 20, acc: 90 } }, -1);
  }

  function lessonBar(l, opts = {}) {
    return `<div class="lbar">
      <button class="ib" aria-label="Kembali ke kursus" title="Kembali ke kursus" data-act="home">${I.back}</button>
      <h2>${l.n ? `<span>Pelajaran ${l.n}</span>` : ""}<b>${esc(l.title)}</b></h2><span class="sp"></span>
      <span class="capswarn" id="caps" hidden role="alert">Caps Lock aktif</span>
      ${opts.typing ? `<button class="ib" data-act="pause" aria-label="Jeda (Esc)" title="Jeda (Esc)">${I.pause}</button>` : ""}
      <button class="ib" data-act="redo" aria-label="Ulangi pelajaran" title="Ulangi pelajaran">${I.redo}</button>
      ${opts.typing ? `<button class="ib ${set().keyboard ? "on" : "off"}" data-act="kb" aria-label="Keyboard virtual" aria-pressed="${set().keyboard}" title="Keyboard virtual">${I.kb}</button>
      <button class="ib ${set().hands !== "none" ? "on" : "off"}" data-act="hands" aria-label="Panduan tangan" aria-pressed="${set().hands !== "none"}" title="Panduan tangan">${I.hand}</button>` : ""}
      <button class="ib ${snd().keys ? "on" : "off"}" data-act="sound" data-pop aria-label="Suara" title="Suara">${I.sound}</button>
      <button class="ib" data-act="gear" data-pop aria-label="Tampilan latihan" title="Tampilan latihan">${I.sliders}</button>
    </div><div class="lprog" role="progressbar" aria-label="Kemajuan pelajaran"><i id="lp"></i></div>`;
  }

  /* --- setting controls, shared by popovers and the settings page --- */
  function getP(path) { return path.split(".").reduce((o, k) => o[k], set()); }
  function setP(path, v) { const ks = path.split("."), last = ks.pop(); ks.reduce((o, k) => o[k], set())[last] = v; }
  const NUMERIC = ["fontSize", "dailyGoal"];
  const unitOf = p => p.endsWith("Rate") ? "x" : p === "fontSize" ? "px" : p === "dailyGoal" ? " menit" : "%";
  const fmtVal = (v, u) => u === "x" ? (+v).toFixed(2) + "×" : v + u;
  const tip = t => t ? `<span class="tipi" tabindex="0" role="note" aria-label="${esc(t)}" data-tip="${esc(t)}">${I.info}</span>` : "";
  const ctl = {
    sw: (p, label, desc, help) => `<label class="opt"><span class="ol">${label}${tip(help)}${desc ? `<small>${desc}</small>` : ""}</span><input type="checkbox" class="switch" role="switch" data-set="${p}" ${getP(p) ? "checked" : ""}></label>`,
    range: (p, label, min, max, step, desc) => `<label class="opt"><span class="ol">${label}${desc ? `<small>${desc}</small>` : ""}</span><span class="rg"><input type="range" min="${min}" max="${max}" step="${step}" value="${getP(p)}" data-set="${p}" aria-label="${esc(label)}"><output>${fmtVal(getP(p), unitOf(p))}</output></span></label>`,
    sel: (p, label, options, desc, help) => `<label class="opt"><span class="ol">${label}${tip(help)}${desc ? `<small>${desc}</small>` : ""}</span><select data-set="${p}">${options.map(([v, t]) => `<option value="${v}" ${String(getP(p)) === String(v) ? "selected" : ""}>${t}</option>`).join("")}</select></label>`,
    seg: (p, label, options, desc) => `<div class="opt"><span class="ol">${label}${desc ? `<small>${desc}</small>` : ""}</span><span class="segc" role="radiogroup" aria-label="${esc(label)}">${options.map(([v, t]) => `<button type="button" role="radio" aria-checked="${String(getP(p)) === String(v)}" data-seg="${p}" data-v="${v}">${t}</button>`).join("")}</span></div>`
  };
  let savedTimer = 0;
  function showSaved() {
    const el = $("#saved"); if (!el) return;
    el.classList.add("on"); el.textContent = "Tersimpan"; clearTimeout(savedTimer); savedTimer = setTimeout(() => el.classList.remove("on"), 1400);
  }
  function commit(p, v, onChange, quiet) {
    setP(p, v); applySettings(); Store.save(); showSaved();
    onChange && onChange(p);
    if (quiet) return;
    Audio.unlock();
    if (p === "sound.keys" && v) Audio.preview(snd().profile);
    if (/sound\.(master|keyVolume)$/.test(p)) Audio.preview(snd().profile);
    if (p === "sound.uiVolume" || (p === "sound.error" && v)) Audio.play("error");
    if (p === "sound.correct" && v) Audio.play("done");
    if (/sound\.voice(Lang|Pack|Rate|Volume)$/.test(p) || (p === "sound.voice" && v)) Audio.say("preview", { force: true });
  }
  function wireControls(root, onChange) {
    root.querySelectorAll("[data-set]").forEach(el => {
      const p = el.dataset.set;
      const read = () => el.type === "checkbox" ? el.checked : (el.type === "range" || NUMERIC.includes(p)) ? +el.value : el.value;
      if (el.type === "range") el.addEventListener("input", () => { setP(p, read()); applySettings(); el.nextElementSibling.textContent = fmtVal(read(), unitOf(p)); onChange && onChange(p, true); });
      el.addEventListener("change", () => { if (el.type === "range") el.nextElementSibling.textContent = fmtVal(read(), unitOf(p)); commit(p, read(), onChange); });
    });
    root.querySelectorAll("[data-seg]").forEach(b => b.addEventListener("click", () => {
      const p = b.dataset.seg, v = NUMERIC.includes(p) ? +b.dataset.v : b.dataset.v;
      b.parentNode.querySelectorAll("button").forEach(x => x.setAttribute("aria-checked", x === b));
      commit(p, v, onChange);
    }));
  }
  function soundPop() {
    return `<h4>Suara</h4>${ctl.sw("sound.keys", "Suara ketikan")}${ctl.sel("sound.profile", "Karakter suara", Audio.PROFILES.map(p => [p.id, p.name]))}${ctl.range("sound.keyVolume", "Volume keyboard", 0, 100, 1)}
      ${ctl.sw("sound.error", "Suara salah ketik")}${ctl.sw("sound.voice", "Tutor suara")}${ctl.range("sound.master", "Volume utama", 0, 100, 1)}
      <div class="poprow"><button class="btn ghost sm" data-preview>${I.play} Pratinjau</button><a class="sm-link" href="#/pengaturan/audio">Semua pengaturan suara</a></div>`;
  }
  function viewPop() {
    return `<h4>Tampilan latihan</h4>${ctl.sw("keyboard", "Keyboard virtual")}${ctl.sel("hands", "Panduan tangan", [["both", "Kedua tangan"], ["left", "Tangan kiri"], ["right", "Tangan kanan"], ["none", "Sembunyikan"]])}
      ${ctl.sw("zones", "Warna wilayah jari")}${ctl.range("fontSize", "Ukuran teks", 26, 52, 2)}${ctl.sw("strict", "Berhenti saat salah")}
      <div class="poprow"><span></span><a class="sm-link" href="#/pengaturan/keyboard">Semua pengaturan</a></div>`;
  }
  function openPop(kind, onChange) {
    const same = pop && pop.dataset.kind === kind; closePop(); if (same) return;
    pop = document.createElement("div"); pop.className = "pop"; pop.dataset.kind = kind; pop.setAttribute("role", "dialog");
    pop.innerHTML = kind === "sound" ? soundPop() : viewPop();
    $(".lbar").appendChild(pop);
    wireControls(pop, onChange);
    const pv = pop.querySelector("[data-preview]"); if (pv) pv.onclick = () => Audio.preview(snd().profile);
  }
  function wireBar(ctx) {
    $(".lbar").addEventListener("click", e => {
      const b = e.target.closest("[data-act]"); if (!b) return;
      const a = b.dataset.act;
      const sync = () => {
        const sb = $('[data-act="sound"]'); if (sb) sb.className = "ib " + (snd().keys ? "on" : "off");
        const kb = $('[data-act="kb"]'); if (kb) { kb.className = "ib " + (set().keyboard ? "on" : "off"); kb.setAttribute("aria-pressed", set().keyboard); }
        const hb = $('[data-act="hands"]'); if (hb) { hb.className = "ib " + (set().hands !== "none" ? "on" : "off"); hb.setAttribute("aria-pressed", set().hands !== "none"); }
      };
      if (a === "home") location.hash = "#/";
      else if (a === "redo") { closePop(); ctx.redo(); }
      else if (a === "pause") { closePop(); ctx.pause && ctx.pause(); }
      else if (a === "kb") { set().keyboard = !set().keyboard; Store.save(); sync(); ctx.onView("keyboard"); }
      else if (a === "hands") { set().hands = set().hands === "none" ? "both" : "none"; Store.save(); sync(); ctx.onView("hands"); }
      else if (a === "sound" || a === "gear") openPop(a, p => { sync(); ctx.onView(p); });
    });
  }

  /* ---------- onboarding (lesson 1) ---------- */
  function viewOnboarding(i) {
    const l = LESSONS[i];
    app.innerHTML = `${lessonBar(l)}<div class="onb"><ol class="steps" id="steps"></ol><div id="ostage"></div><div id="kbh"></div></div>`;
    let kb = Keys.mount($("#kbh"), { ...set(), keyboard: true, hands: set().hands === "none" ? "both" : set().hands });
    let step = 0, iv = 0, demo = null;
    const STEPS = ["Posisi duduk", "Baris tengah", "Membaca warna", "Memperbaiki salah", "Siap"];
    const finish = () => { Store.S.lessons[l.id] = { stars: 5, wpm: 0, acc: 100, t: Date.now() }; Store.save(); Audio.play("done"); location.hash = "#/l/" + LESSONS[i + 1].id; };
    const go = n => { step = n; clearInterval(iv); render(); };
    function render() {
      $("#steps").innerHTML = STEPS.map((s, k) => `<li class="${k < step ? "done" : k === step ? "now" : ""}"><span>${k < step ? I.check : k + 1}</span>${s}</li>`).join("");
      const st = $("#ostage");
      if (step === 0) {
        st.innerHTML = `<h1>Duduk nyaman, lihat ke layar</h1><p>Punggung tegak, kaki menapak lantai, layar sejajar mata, dan siku membentuk sudut sekitar 90°. Selama latihan, matamu melihat layar, bukan keyboard.</p><div class="row center"><button class="btn" id="nx">Lanjut <span class="kbd">enter</span></button><button class="btn ghost" id="skip">Lewati pengenalan</button></div>`;
        kb.target(null, true);
        if (snd().voiceIntro) Audio.say("welcome");
      } else if (step === 1) {
        st.innerHTML = `<h1>Temukan baris tengah</h1><p>Raba tonjolan kecil di tombol <span class="kbd">f</span> dan <span class="kbd">j</span>. Letakkan telunjuk kiri di F dan telunjuk kanan di J; jari lain berjajar di <span class="kbd">a</span> <span class="kbd">s</span> <span class="kbd">d</span> dan <span class="kbd">k</span> <span class="kbd">l</span> <span class="kbd">;</span>. Ibu jari di atas spasi.</p><p class="task" id="task">Coba tekan <span class="kbd">f</span> lalu <span class="kbd">j</span></p>`;
        const seq = ["a", "s", "d", "f", "j", "k", "l", ";"]; let hi = 3; kb.target("f");
        iv = setInterval(() => { if (!demo) { hi = (hi + 1) % seq.length; } }, 1000);
        demo = { need: ["f", "j"], got: 0 };
        if (snd().voiceIntro) Audio.say("onb_bumps");
      } else if (step === 2) {
        st.innerHTML = `<h1>Membaca warna</h1><p>Setiap huruf berubah warna saat kamu mengetik. Coba ketik kata di bawah.</p>
          <div class="legendrow"><span><i class="c ok">a</i> benar</span><span><i class="c bad">a</i> salah</span><span><i class="c cur">a</i> huruf berikutnya</span><span><i class="c fixed">a</i> salah lalu dikoreksi</span></div>
          <div class="mini text" id="mini"></div>`;
        demo = { text: "ada jalan", e: Engine.create("ada jalan") };
        paintMini(); kb.target("a");
        if (snd().voiceIntro) Audio.say("onb_colors");
      } else if (step === 3) {
        st.innerHTML = `<h1>Memperbaiki kesalahan</h1><p>Kalau salah ketik, tekan <span class="kbd">backspace</span> untuk menghapus, lalu ketik ulang huruf yang benar. Kesalahan tetap dihitung di <b>akurasi murni</b>, jadi lebih baik pelan dan tepat.</p><p class="task" id="task">Ketik huruf apa saja yang salah, lalu tekan <span class="kbd">backspace</span></p><div class="mini text" id="mini"></div>`;
        demo = { text: "kala", e: Engine.create("kala"), wrong: false };
        paintMini(); kb.target("Backspace" in Keys.CHARMAP ? null : "k");
        if (snd().voiceIntro) Audio.say("onb_fix");
      } else {
        st.innerHTML = `<h1>Siap mulai</h1><p>Pelajaran berikutnya mengenalkan tombol <span class="kbd">f</span> dan <span class="kbd">j</span>. Tombol tujuan menyala biru dan jari yang harus dipakai bergerak ke tombol itu. Raih minimal satu bintang untuk membuka pelajaran berikutnya.</p><div class="row center"><button class="btn lg" id="nx">Mulai pelajaran 2 <span class="kbd">enter</span></button></div>`;
        kb.target(null);
        if (snd().voiceIntro) Audio.say("start");
      }
      const nx = $("#nx"); if (nx) nx.onclick = () => step === 4 ? finish() : go(step + 1);
      const sk = $("#skip"); if (sk) sk.onclick = finish;
    }
    function paintMini() {
      const e = demo.e, t = demo.text;
      $("#mini").innerHTML = [...t].map((c, k) => `<span class="c ${e.status(k) === "untyped" ? "" : e.status(k)}">${c === " " ? " " : esc(c)}</span>`).join("");
    }
    handler = {
      typing: true,
      on: a => {
        if (step === 0 || step === 4) { if (a.type === "enter") step === 4 ? finish() : go(step + 1); return; }
        if (step === 1 && a.type === "char") {
          const ok = a.ch === demo.need[demo.got];
          Audio.play("key"); kb.flash(a.ch, ok);
          if (ok) { demo.got++; if (demo.got < demo.need.length) kb.target(demo.need[demo.got]); else { Audio.play("correct"); $("#task").innerHTML = `${I.check} Bagus! Itu posisi dasar kedua telunjuk.`; $("#task").classList.add("ok"); demo = null; setTimeout(() => go(2), 900); } }
          else Audio.play("error");
          return;
        }
        if (step === 2 || step === 3) {
          const e = demo.e;
          if (a.type === "back") { if (e.back()) { Audio.play("back"); kb.flash("Backspace", true); if (step === 3 && demo.wrong) { $("#task").innerHTML = `${I.check} Tepat. Begitu cara memperbaiki kesalahan.`; $("#task").classList.add("ok"); Audio.play("correct"); demo.wrong = false; setTimeout(() => go(4), 1000); } } }
          else if (a.type === "char") {
            const r = e.input(a.ch); Audio.play(a.ch === " " ? "space" : "key"); kb.flash(a.ch, r.ok);
            if (!r.ok) { Audio.play("error"); if (step === 3) demo.wrong = true; }
            if (r.done && step === 2) { Audio.play("correct"); setTimeout(() => go(3), 700); }
            if (r.done && step === 3) { demo.e = Engine.create(demo.text); }
          }
          paintMini(); kb.target(demo.text[e.s.pos] ?? null);
        }
      }
    };
    wireBar({ redo: () => go(0), onView: () => { kb.destroy(); kb = Keys.mount($("#kbh"), { ...set(), keyboard: true }); } });
    render(); focusInput();
    cleanup = () => { clearInterval(iv); kb.destroy(); };
  }

  /* ---------- typing lesson ---------- */
  function runTyping(l, idx) {
    if (cleanup) { cleanup(); cleanup = null; }
    closePop(); Audio.stopVoice();
    document.querySelectorAll(".modal,.pause").forEach(m => m.remove());
    const gen = Course.generate(l);
    const text = gen.text.replace(/\s+/g, " ").trim();
    const steps = gen.steps || null;
    app.innerHTML = `${lessonBar(l, { typing: true })}<div id="zone"></div><div id="kbh"></div>`;
    let kb = null, curTarget = null, engine = null, paused = false, finished = false, ticker = 0, capsSaid = false;
    let layoutText = () => { };
    const errCount = {}; let lastVoiceAt = 0;
    const mountKb = () => { if (kb) kb.destroy(); kb = Keys.mount($("#kbh"), set()); kb.target(curTarget, true); };
    const target = ch => { curTarget = ch; kb.target(ch); };
    mountKb();
    wireBar({
      redo: () => runTyping(l, idx),
      pause: () => togglePause(),
      onView: (k, live) => {
        if (live) return;
        if (["keyboard", "hands", "zones"].includes(k)) mountKb();
        if (k === "fontSize" && engine) layoutText();
        if (k === "strict" && engine) engine.s.strict = set().strict;
      }
    });
    const onResize = () => layoutText();
    const vis = () => { if (document.hidden && engine && engine.s.started !== null && !finished && !paused) togglePause(); };
    addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", vis);
    cleanup = () => { clearInterval(ticker); kb && kb.destroy(); handler = null; Audio.stopVoice(); document.querySelectorAll(".pause").forEach(p => p.remove()); removeEventListener("resize", onResize); document.removeEventListener("visibilitychange", vis); };
    const capsUI = on => { const c = $("#caps"); if (!c) return; if (on && !capsSaid && snd().voiceErrors) { capsSaid = true; Audio.say("caps"); } c.hidden = !on; };
    function togglePause() {
      if (finished || !engine) return;
      paused = !paused;
      if (paused) {
        engine.pause();
        const p = document.createElement("div"); p.className = "pause";
        p.innerHTML = `<div><h2>Dijeda</h2><p class="muted">Waktu berhenti. Tekan tombol apa saja untuk melanjutkan.</p><button class="btn">Lanjutkan</button></div>`;
        p.onclick = () => togglePause(); document.body.appendChild(p);
      } else { engine.resume(); document.querySelectorAll(".pause").forEach(p => p.remove()); focusInput(); }
    }

    if (steps) introPhase(); else typingPhase();

    function introPhase() {
      let si = 0, busy = false;
      const zone = $("#zone");
      const show = () => {
        const k = steps[si], m = Keys.CHARMAP[k], f = m.f === "T" ? "TL" : m.f;
        zone.innerHTML = `<div class="intro"><div class="eyebrow">Tombol baru</div>
          <div class="say" id="sayline">Tekan <span class="kbd big">${k === " " ? "spasi" : esc(k)}</span> dengan <b style="color:${Keys.FCOLOR[f]}">${Keys.FNAME[f]}</b></div>
          <div class="dots" aria-hidden="true">${steps.map((_, j) => `<i class="${j < si ? "on" : ""}"></i>`).join("")}</div></div>`;
        target(k);
        $("#lp").style.width = (si / steps.length * 25) + "%";
        if ((si === 0 || steps[si - 1] !== k) && snd().voiceIntro) sayKey(k);
      };
      handler = {
        typing: true, caps: capsUI,
        on: a => {
          if (a.type !== "char" || busy) return;
          const c = a.ch;
          if (c === steps[si]) {
            Audio.play(c === " " ? "space" : "key"); kb.flash(c, true); si++;
            if (si >= steps.length) { busy = true; Audio.play("correct"); setTimeout(typingPhase, 300); } else show();
          } else {
            Audio.play("key"); Audio.play("error"); kb.flash(c, false);
            const s = $("#sayline"); s.classList.remove("shake"); void s.offsetWidth; s.classList.add("shake");
          }
        }
      };
      show(); focusInput();
    }

    function typingPhase() {
      engine = Engine.create(text, { strict: set().strict });
      const goal = l.goal || { wpm: 20, acc: 85 };
      const zone = $("#zone");
      let html = `<div class="lstage"><div class="tcol"><div class="textwrap" id="tw" role="textbox" aria-readonly="true" aria-label="Teks latihan: ${esc(text)}"><div class="text" id="tx">`;
      const parts = text.match(/\S+\s?|\s/g); let ci = 0;
      parts.forEach(p => { html += '<span class="w">'; for (const ch of p) { html += `<span class="c${ch === " " ? " sp" : ""}" id="c${ci}">${ch === " " ? " " : esc(ch)}</span>`; ci++; } html += "</span>"; });
      html += `</div></div><div class="tline"><i id="tl"></i></div></div>
        <aside class="side" aria-label="Statistik langsung">
          <div><div class="lbl">Kecepatan</div><div class="val" id="vw">0<small>WPM</small></div></div>
          <div><div class="lbl">Akurasi</div><div class="val" id="va">100<small>%</small></div></div>
          <div><div class="lbl">Waktu</div><div class="val" id="vt">0:00</div></div>
          <div class="goal">Target <b>${goal.wpm} WPM</b><br>akurasi min. <b>${goal.acc}%</b></div>
        </aside></div>`;
      zone.innerHTML = html;
      const tx = $("#tx"), tw = $("#tw"), N = text.length;
      let lineH = 60, lastLine = -1;
      layoutText = () => {
        const fs = window.innerWidth < 820 ? 24 : set().fontSize;
        tx.style.setProperty("--tsize", fs + "px");
        const first = document.getElementById("c0");
        lineH = first ? first.parentNode.getBoundingClientRect().height : fs * 1.9;
        tw.style.height = Math.ceil(lineH * 3) + "px";
        lastLine = -1; scroll();
      };
      const paint = i => { const el = document.getElementById("c" + i); if (!el) return; const st = engine.status(i); el.className = "c" + (text[i] === " " ? " sp" : "") + (st === "untyped" ? "" : " " + st); };
      function scroll() {
        const cur = document.getElementById("c" + Math.min(engine.s.pos, N - 1)); if (!cur) return;
        const line = Math.round(cur.parentNode.offsetTop / lineH);
        if (line !== lastLine) { lastLine = line; tx.style.transform = `translateY(${-Math.max(0, line - 1) * lineH}px)`; }
      }
      function live() {
        const s = engine.s, st = engine.stats(), p = s.pos / N * 100;
        const liveMs = s.activeMs + (s.started !== null && !paused && !finished ? Math.min(performance.now() - s.last, 2000) : 0);
        const shownWpm = st.typedChars ? Math.round(st.typedChars / 5 / (Math.max(liveMs, 3000) / 60000)) : 0;
        $("#vw").innerHTML = shownWpm + "<small>WPM</small>";
        $("#va").innerHTML = st.realAccuracy + "<small>%</small>";
        $("#vt").textContent = fmtTime(liveMs);
        $("#tl").style.width = p + "%";
        $("#lp").style.width = (steps ? 25 + p * 0.75 : p) + "%";
      }
      layoutText(); paint(0); kb.target(text[0], true); curTarget = text[0];
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => layoutText());
      if (!steps && snd().voiceIntro && l.n && l.n <= 3) Audio.say("start");
      const onChar = c => {
        if (finished) return;
        if (paused) { togglePause(); return; }
        const r = engine.input(c);
        Audio.play(c === " " ? "space" : "key");
        kb.flash(c, r.ok);
        if (!r.ok) {
          Audio.play("error");
          errCount[r.expected] = (errCount[r.expected] || 0) + 1;
          if (snd().voiceErrors && errCount[r.expected] === 3 && performance.now() - lastVoiceAt > 8000) { lastVoiceAt = performance.now(); sayKey(r.expected); }
        }
        if (r.advanced) paint(engine.s.pos - 1);
        else { const el = document.getElementById("c" + engine.s.pos); if (el) { el.classList.add("bad"); setTimeout(() => paint(engine.s.pos), 160); } }
        if (r.done) { live(); finish(); return; }
        paint(engine.s.pos); target(text[engine.s.pos]); scroll(); live();
      };
      const onBack = () => {
        if (finished) return;
        if (paused) { togglePause(); return; }
        if (engine.back()) { Audio.play("back"); kb.flash("Backspace", true); paint(engine.s.pos + 1); paint(engine.s.pos); target(text[engine.s.pos]); scroll(); live(); }
      };
      handler = {
        typing: true, caps: capsUI,
        on: a => {
          if (a.type === "char") onChar(a.ch);
          else if (a.type === "back") onBack();
          else if (a.type === "pause") togglePause();
          else if (a.type === "enter") { if (paused) togglePause(); else { Audio.play("enter"); kb.flash("Enter", false); } }
          else if (a.type === "dead") toast("info", "Tombol aksen (dead key)", "Layout keyboard-mu memakai dead key. Pakai layout English (US) agar tanda petik langsung terketik.");
        }
      };
      focusInput();
      ticker = setInterval(() => { if (engine.s.started !== null && !paused && !finished) live(); }, 500);

      function finish() {
        finished = true; clearInterval(ticker); target(null);
        const st = engine.stats(); st.perKey = engine.s.perKey; st.pairMiss = engine.s.pairMiss;
        const stars = Engine.stars(st, goal);
        const score = stars ? Math.round(N * (1 + stars / 2) * (st.realAccuracy / 100)) : 0;
        const { prev, isBest } = Store.record(l, st, stars, score);
        const fresh = Store.checkBadges();
        renderHeader();
        Audio.play(stars ? "done" : "error");
        if (fresh.length) setTimeout(() => Audio.play("badge"), 900);
        if (snd().voiceResults) {
          if (!stars) Audio.say("fail");
          else if (isBest && prev) Audio.say("best");
          else if (stars === 5) Audio.say("perfect");
          else Audio.say("done");
        }
        showResult(st, stars, score, prev, isBest, goal, fresh);
      }
      function showResult(st, stars, score, prev, isBest, goal, fresh) {
        const nextL = idx >= 0 ? LESSONS[idx + 1] : null;
        const diff = prev && prev.wpm ? st.wpm - prev.wpm : null;
        const s = engine.s;
        const missed = {}; for (let k = 0; k < N; k++) if (s.everWrong[k]) missed[text[k]] = (missed[text[k]] || 0) + 1;
        const weak = Object.entries(missed).sort((a, b) => b[1] - a[1]).slice(0, 3);
        const m = document.createElement("div"); m.className = "modal"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-label", "Hasil pelajaran");
        const head = stars === 0 ? "Belum lolos" : stars >= 5 ? "Sempurna!" : stars >= 4 ? "Hebat!" : stars >= 3 ? "Bagus!" : "Lolos";
        const sub = stars === 0 ? `Butuh akurasi murni minimal ${goal.acc}%. Kamu mendapat ${st.realAccuracy}%. Pelan-pelan saja, ketepatan dulu.`
          : stars < 5 ? (st.realAccuracy < goal.acc + (100 - goal.acc) * 0.75 ? "Naikkan akurasi untuk bintang berikutnya." : `Capai ${goal.wpm} WPM untuk bintang penuh.`) : "Cepat dan tepat. Pertahankan!";
        const main = () => `<div class="res-head ${stars ? "win" : ""}"><h3>${head}</h3><p class="muted">${sub}</p><div class="bigstars">${starRow(stars)}</div></div>
          <div class="metrics">
            <div class="metric"><div class="v">${st.wpm}</div><div class="k">WPM</div>${diff != null ? `<div class="d ${diff >= 0 ? "up" : "down"}">${diff >= 0 ? "+" : ""}${diff} dari rekor</div>` : ""}</div>
            <div class="metric"><div class="v ${st.realAccuracy >= goal.acc ? "" : "down"}">${st.realAccuracy}%</div><div class="k">Akurasi murni</div><div class="d">akhir ${st.accuracy}%</div></div>
            <div class="metric"><div class="v">${st.mistakes}</div><div class="k">Kesalahan</div><div class="d">${st.corrected} dikoreksi</div></div>
            <div class="metric"><div class="v">${fmtTime(st.timeMs)}</div><div class="k">Waktu</div><div class="d">+${score} skor</div></div>
          </div>
          ${isBest && prev ? `<div class="banner win">${I.trophy}<span><b>Rekor baru!</b> Sebelumnya ${prev.wpm || 0} WPM, ${prev.stars} bintang.</span></div>` : ""}
          ${fresh.map(b => `<div class="banner badge">${I[b.icon] || I.trophy}<span><b>Pencapaian baru: ${esc(b.name)}</b> ${esc(b.desc)}</span></div>`).join("")}
          ${weak.length ? `<div class="practice"><div><b>Perlu dilatih</b><p>${weak.map(([k, n]) => `<span class="kbd">${esc(keyName(k))}</span> ${n}× <span class="muted">(${fingerOf(k)})</span>`).join(" · ")}</p></div><button class="btn ghost sm" data-a="drill">Latih tombol ini</button>${st.mistakes ? `<button class="btn ghost sm" data-a="review">Lihat kesalahan</button>` : ""}</div>` : ""}
          ${stars && nextL ? `<button class="nextup" data-a="next"><span class="nill">${illus(nextL)}</span><span><small>Berikutnya · ${esc(TYPE_LABEL[nextL.type] || "")}</small><b>${nextL.n}. ${esc(nextL.title)}</b></span><span class="kbd">enter</span></button>` : ""}
          <div class="row center"><button class="btn ghost" data-a="retry">Ulangi</button>${stars && nextL ? `<button class="btn" data-a="next">Lanjut ${I.arrow}</button>` : stars ? "" : `<button class="btn" data-a="retry">Coba lagi</button>`}<button class="btn ghost" data-a="home">Ke kursus</button></div>`;
        const review = () => {
          let t = "";
          for (let k = 0; k < N; k++) { const ch = esc(text[k]); t += s.everWrong[k] ? `<span class="e ${s.typed[k] === text[k] ? "f" : ""}" title="diketik: ${esc(keyName(s.wrongAs[k] || ""))}">${text[k] === " " ? "␣" : ch}</span>` : ch; }
          const pairs = {}; for (let k = 0; k < N; k++) if (s.everWrong[k]) { const key = keyName(text[k]) + "\u0000" + keyName(s.wrongAs[k]); pairs[key] = (pairs[key] || 0) + 1; }
          return `<h3>Kesalahan di pelajaran ini</h3><p class="muted">Merah: masih salah. Oranye: salah lalu dikoreksi (tetap mengurangi akurasi murni).</p>
            <div class="review">${t}</div>
            <table class="tbl">${Object.entries(pairs).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `<tr><td>Harusnya <span class="kbd">${esc(k.split("\u0000")[0])}</span>, diketik <span class="kbd">${esc(k.split("\u0000")[1])}</span></td><td style="text-align:right">${n}×</td></tr>`).join("")}</table>
            <div class="row center"><button class="btn ghost" data-a="main">Kembali ke hasil</button><button class="btn" data-a="retry">Ulangi</button></div>`;
        };
        const sheet = document.createElement("div"); sheet.className = "sheet result"; m.appendChild(sheet);
        const act = a => {
          if (a === "retry") { m.remove(); runTyping(l, idx); }
          else if (a === "next" && nextL) { m.remove(); location.hash = "#/l/" + nextL.id; }
          else if (a === "home") { m.remove(); location.hash = "#/"; }
          else if (a === "drill") { m.remove(); location.hash = "#/pintar/" + encodeURIComponent(weak.map(w => w[0]).filter(k => k !== " ").join("")); }
          else if (a === "review") sheet.innerHTML = review();
          else if (a === "main") { sheet.innerHTML = main(); sheet.querySelectorAll(".bigstars .star").forEach(x => x.style.opacity = 1); }
        };
        sheet.innerHTML = main();
        sheet.onclick = e => { const b = e.target.closest("[data-a]"); if (b) act(b.dataset.a); };
        document.body.appendChild(m);
        m.querySelectorAll(".bigstars .star").forEach((x, k) => x.style.animationDelay = (0.15 + k * 0.12) + "s");
        const armedAt = performance.now() + 800; // ignore keystrokes that spill over from the last word
        handler = { typing: true, on: a => { if (performance.now() < armedAt) return; if (a.type === "enter") act(stars && nextL ? "next" : "retry"); else if (a.type === "pause") act("home"); } };
      }
    }
  }

  /* ================= GAME ================= */
  function viewGame(i) {
    const l = LESSONS[i];
    const pool = Course.gameWords(l);
    app.innerHTML = `${lessonBar(l)}<div class="gamewrap">
      <p class="muted">Ketik kata yang jatuh sebelum menyentuh tanah. Kata yang cocok dengan ketikanmu akan menyala. Spasi menghapus ketikan. 3 nyawa, 60 detik.</p>
      <div class="ghud"><span id="gs">Skor 0</span><span id="gt">60 detik</span><span id="gl" aria-label="nyawa">❤❤❤</span></div>
      <div class="game" id="gm"><div class="ground"></div></div>
      <div class="typed" id="gty">&nbsp;</div>
      <div class="row center"><button class="btn" id="gstart">Mulai main <span class="kbd">enter</span></button></div></div>`;
    let drops = [], buf = "", score = 0, lives = 3, left = 60, raf = 0, tick = 0, spawnT = 0, running = false, lastT = 0, hits = 0, misses = 0;
    const gm = $("#gm"), rnd = Course.rnd;
    wireBar({ redo: () => start(), onView: () => { } });
    function spawn() { const w = rnd(pool), el = document.createElement("div"); el.className = "drop"; el.textContent = w; gm.appendChild(el); drops.push({ w, el, x: 10 + Math.random() * Math.max(10, gm.clientWidth - el.offsetWidth - 20), y: -30, v: 26 + Math.random() * 16 + score * 0.7 }); }
    function paintDrops() {
      const tgt = drops.find(d => buf && d.w.startsWith(buf));
      drops.forEach(d => { d.el.style.transform = `translate(${d.x}px,${d.y}px)`; if (d === tgt) d.el.innerHTML = `<span class="m">${esc(buf)}</span>${esc(d.w.slice(buf.length))}`; else if (d.el.children.length) d.el.textContent = d.w; });
      $("#gty").textContent = buf || " ";
    }
    function loop(t) {
      if (!running) return;
      const dt = Math.min((t - (lastT || t)) / 1000, 0.1); lastT = t;
      spawnT -= dt; if (spawnT <= 0) { spawn(); spawnT = Math.max(0.9, 2.2 - score * 0.03); }
      const H = gm.clientHeight - 40;
      drops.forEach(d => d.y += d.v * dt);
      drops.filter(d => d.y > H).forEach(d => { d.el.remove(); lives--; misses++; Audio.play("error"); });
      drops = drops.filter(d => d.y <= H);
      $("#gl").textContent = "❤".repeat(Math.max(lives, 0)) + "♡".repeat(3 - Math.max(lives, 0));
      paintDrops();
      if (lives <= 0) return end();
      raf = requestAnimationFrame(loop);
    }
    function end() {
      if (!running) return;
      running = false; cancelAnimationFrame(raf); clearInterval(tick);
      const st = score >= 20 ? 5 : score >= 15 ? 4 : score >= 10 ? 3 : score >= 6 ? 2 : score >= 3 ? 1 : 0;
      Store.S.points += score * 15;
      const now = Date.now(), day = Store.dayKey(now);
      Store.S.history.push({ t: now, day, id: l.id, wpm: 0, acc: Math.round(hits / Math.max(1, hits + misses) * 100), stars: st, ms: (60 - left) * 1000 });
      Store.S.days[day] = (Store.S.days[day] || 0) + (60 - left) * 1000;
      if (st) { const prev = Store.S.lessons[l.id]; if (!prev || st > prev.stars) Store.S.lessons[l.id] = { stars: st, wpm: 0, acc: 0, t: now }; }
      Store.save(); renderHeader(); Audio.play(st ? "done" : "error");
      Store.checkBadges().forEach(b => toast(b.icon, "Pencapaian baru: " + b.name, b.desc));
      $("#gty").innerHTML = `<b>Selesai!</b> ${score} kata · ${starRow(st)}`;
      $("#gstart").innerHTML = (st ? "Main lagi" : "Coba lagi") + ' <span class="kbd">enter</span>'; $("#gstart").disabled = false;
      if (st && LESSONS[i + 1] && !$("#gnext")) { const b = document.createElement("button"); b.className = "btn ghost"; b.id = "gnext"; b.textContent = "Lanjut"; b.onclick = () => location.hash = "#/l/" + LESSONS[i + 1].id; $("#gstart").after(b); }
      const armedAt = performance.now() + 800;
      handler = { typing: true, on: a => { if (a.type === "enter" && performance.now() > armedAt) start(); } };
    }
    function onChar(c) {
      if (!running) return;
      if (c === " ") { buf = ""; Audio.play("space"); paintDrops(); return; }
      const nb = buf + c; Audio.play("key");
      if (!drops.some(d => d.w.startsWith(nb))) { Audio.play("error"); misses++; return paintDrops(); }
      buf = nb;
      const done = drops.find(d => d.w === buf);
      if (done) { done.el.classList.add("hit"); setTimeout(() => done.el.remove(), 300); drops = drops.filter(d => d !== done); score++; hits++; buf = ""; $("#gs").textContent = "Skor " + score; Audio.play("correct"); }
      paintDrops();
    }
    function start() {
      running = false; cancelAnimationFrame(raf); clearInterval(tick);
      drops.forEach(d => d.el.remove()); drops = []; buf = ""; score = 0; lives = 3; left = 60; hits = 0; misses = 0; spawnT = 0; lastT = 0; running = true;
      $("#gs").textContent = "Skor 0"; $("#gt").textContent = "60 detik"; $("#gstart").disabled = true;
      const gn = $("#gnext"); if (gn) gn.remove();
      tick = setInterval(() => { left--; $("#gt").textContent = left + " detik"; if (left <= 0) end(); }, 1000);
      handler = { typing: true, on: a => { if (a.type === "back") { buf = buf.slice(0, -1); Audio.play("back"); paintDrops(); } else if (a.type === "char") onChar(a.ch); } };
      focusInput(); raf = requestAnimationFrame(loop);
    }
    $("#gstart").onclick = start;
    handler = { typing: true, on: a => { if (a.type === "enter") start(); } };
    focusInput();
    cleanup = () => { running = false; cancelAnimationFrame(raf); clearInterval(tick); };
  }

  /* ================= STATISTICS ================= */
  function lineChart(vals, { max, color, unit = "", labels }) {
    const W = 520, H = 190, pl = 38, pr = 12, pt = 14, pb = 26;
    max = max || Math.ceil(Math.max(...vals) * 1.2 / 5) * 5 || 5;
    const X = i => pl + i * (W - pl - pr) / Math.max(1, vals.length - 1), Y = v => pt + (1 - v / max) * (H - pt - pb);
    const ticks = [0, 0.5, 1].map(f => Math.round(max * f));
    const pts = vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik ${vals.length} sesi">
      ${ticks.map(t => `<line x1="${pl}" x2="${W - pr}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--line)"/><text x="${pl - 6}" y="${Y(t) + 3}" text-anchor="end">${t}${unit}</text>`).join("")}
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${vals.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="3" fill="var(--panel)" stroke="${color}" stroke-width="1.8"><title>${labels[i]}: ${v}${unit}</title></circle>`).join("")}
      <text x="${pl}" y="${H - 6}">${labels[0]}</text><text x="${W - pr}" y="${H - 6}" text-anchor="end">${labels[labels.length - 1]}</text></svg>`;
  }
  function barChart(days) {
    const W = 520, H = 170, pl = 38, pb = 24, pt = 12, max = Math.max(5, ...days.map(d => d.min));
    const bw = (W - pl - 10) / days.length;
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Durasi latihan 14 hari">
      ${[0, 0.5, 1].map(f => { const y = pt + (1 - f) * (H - pt - pb); return `<line x1="${pl}" x2="${W - 10}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${pl - 6}" y="${y + 3}" text-anchor="end">${Math.round(max * f)}m</text>`; }).join("")}
      ${days.map((d, i) => { const h = d.min / max * (H - pt - pb); return `<rect x="${pl + i * bw + bw * 0.2}" y="${H - pb - h}" width="${bw * 0.6}" height="${Math.max(h, d.min ? 2 : 0)}" rx="2" fill="${i === days.length - 1 ? "var(--orange)" : "var(--blue)"}"><title>${d.label}: ${d.min} menit</title></rect><text x="${pl + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle">${i % 2 === 1 ? d.short : ""}</text>`; }).join("")}
    </svg>`;
  }
  function insights() {
    const S = Store.S, out = [];
    const keys = Object.entries(S.keys).filter(([k, v]) => v.hit + v.miss >= 8 && k !== " ").map(([k, v]) => ({ k, r: v.miss / (v.hit + v.miss), n: v.hit + v.miss, ms: Math.round(v.ms / Math.max(1, v.hit)) }));
    const worst = keys.slice().sort((a, b) => b.r - a.r)[0];
    if (worst && worst.r >= 0.04) out.push({ icon: "target", title: `Tombol paling sering salah: ${keyName(worst.k).toUpperCase()}`, text: `${Math.round(worst.r * 100)}% salah dari ${worst.n} ketukan. Tombol ini ditekan dengan ${fingerOf(worst.k)}.`, cta: { label: `Latih ${keyName(worst.k).toUpperCase()} sekarang`, href: "#/pintar/" + encodeURIComponent(worst.k) } });
    const slow = keys.slice().sort((a, b) => b.ms - a.ms)[0];
    if (slow && slow.k !== (worst && worst.k) && slow.ms > 350) out.push({ icon: "clock", title: `Tombol paling lambat: ${keyName(slow.k).toUpperCase()}`, text: `Rata-rata ${slow.ms} ms sebelum ditekan. Biasanya karena jari masih mencari posisi.`, cta: { label: "Latih", href: "#/pintar/" + encodeURIComponent(slow.k) } });
    const fm = {}; Object.entries(S.keys).forEach(([k, v]) => { const m = Keys.CHARMAP[k]; if (m && m.f !== "T") { fm[m.f] = fm[m.f] || { hit: 0, miss: 0 }; fm[m.f].hit += v.hit; fm[m.f].miss += v.miss; } });
    const wf = Object.entries(fm).filter(([f, v]) => v.hit + v.miss >= 20).map(([f, v]) => ({ f, r: v.miss / (v.hit + v.miss) })).sort((a, b) => b.r - a.r)[0];
    if (wf && wf.r >= 0.04) { const ks = Object.keys(Keys.CHARMAP).filter(k => /[a-z;,./]/.test(k) && Keys.CHARMAP[k].f === wf.f && !Keys.CHARMAP[k].shift).join(""); out.push({ icon: "gauge", title: `Jari yang perlu dilatih: ${Keys.FNAME[wf.f]}`, text: `${Math.round(wf.r * 100)}% ketukan jari ini salah. Wilayahnya: ${[...ks].map(k => `<span class="kbd">${esc(k)}</span>`).join(" ")}`, cta: { label: "Latih jari ini", href: "#/pintar/" + encodeURIComponent(ks) } }); }
    const pair = Object.entries(S.pairs || {}).sort((a, b) => b[1] - a[1])[0];
    if (pair && pair[1] >= 3) out.push({ icon: "spark", title: `Pola kesalahan: "${esc(pair[0])}"`, text: `Kamu ${pair[1]}× salah mengetik <b>${esc(pair[0][1])}</b> tepat setelah <b>${esc(pair[0][0])}</b>. Perpindahan jari ini perlu diulang pelan.`, cta: { label: "Latih kombinasi", href: "#/pintar/" + encodeURIComponent(pair[0]) } });
    const H = S.history.filter(h => h.wpm > 0);
    if (H.length >= 6) { const a = H.slice(-10, -5), b = H.slice(-5); const avg = (x, k) => x.reduce((s, y) => s + y[k], 0) / x.length; const dw = Math.round(avg(b, "wpm") - avg(a, "wpm")), da = Math.round(avg(b, "acc") - avg(a, "acc")); out.push({ icon: dw >= 0 ? "rocket" : "flame", title: dw > 0 ? `Kecepatan naik ${dw} WPM` : dw < 0 ? `Kecepatan turun ${-dw} WPM` : "Kecepatan stabil", text: `Dibanding 5 sesi sebelumnya. Akurasi murni ${da >= 0 ? "naik" : "turun"} ${Math.abs(da)} poin${da < 0 && dw > 0 ? ": kamu mengetik lebih cepat tapi kurang tepat, pelankan sedikit." : "."}` }); }
    const low = LESSONS.map((l, i) => ({ l, r: S.lessons[l.id] })).filter(x => x.r && x.r.stars > 0 && x.r.stars <= 2 && x.l.type !== "game" && x.l.type !== "guide").sort((a, b) => a.r.stars - b.r.stars)[0];
    if (low) out.push({ icon: "book", title: `Ulangi: ${esc(low.l.n + ". " + low.l.title)}`, text: `Baru ${low.r.stars} bintang. Mengulang pelajaran dengan bintang rendah memperkuat dasar sebelum lanjut.`, cta: { label: "Buka pelajaran", href: "#/l/" + low.l.id } });
    return out;
  }
  function viewStats() {
    const S = Store.S, t = Store.totals(), H = S.history.filter(h => h.wpm > 0);
    if (H.length < 1) {
      app.innerHTML = `<div class="pagehead"><h1>Statistik</h1></div><div class="emptystate"><span class="dicon">${I.gauge}</span><h2>Belum ada data latihan</h2><p class="muted">Statistik, grafik, dan saran latihan muncul setelah kamu menyelesaikan pelajaran mengetik. Semua angka dihitung dari ketikanmu sendiri, tanpa data contoh.</p><a class="btn" href="#/l/${LESSONS[nextIndex()].id}">Mulai pelajaran ${LESSONS[nextIndex()].n}</a></div>`;
      return;
    }
    const recent = H.slice(-30);
    const labels = recent.map(h => new Date(h.t).toLocaleDateString("id-ID", { day: "numeric", month: "short" }));
    const period = `${recent.length} sesi terakhir · ${labels[0]}${labels.length > 1 ? " – " + labels[labels.length - 1] : ""}`;
    const days = []; for (let k = 13; k >= 0; k--) { const d = new Date(); d.setDate(d.getDate() - k); const key = Store.dayKey(d); days.push({ min: Math.round((S.days[key] || 0) / 60000), label: d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short" }), short: d.getDate() + "/" + (d.getMonth() + 1) }); }
    const totalDays = days.reduce((a, d) => a + d.min, 0);
    const fm = {}; ["L5", "L4", "L3", "L2", "R2", "R3", "R4", "R5", "T"].forEach(f => fm[f] = { hit: 0, miss: 0 });
    Object.entries(S.keys).forEach(([k, v]) => { const m = Keys.CHARMAP[k]; if (m) { fm[m.f].hit += v.hit; fm[m.f].miss += v.miss; } });
    const ins = insights();
    const chartOrEmpty = (vals, opts, what) => vals.length >= 3 ? lineChart(vals, opts) : `<p class="empty">Grafik ${what} muncul setelah 3 sesi. Saat ini baru ${vals.length} sesi.</p>`;
    app.innerHTML = `<div class="pagehead"><h1>Statistik</h1><p class="muted">Dihitung dari ${H.length} sesi latihan di browser ini.</p></div>
      <section class="insights" aria-label="Saran latihan">
        <h2>Saran untukmu</h2>
        ${ins.length ? ins.map(x => `<div class="insight"><span class="ii">${I[x.icon] || I.info}</span><div><b>${x.title}</b><p>${x.text}</p></div>${x.cta ? `<a class="btn ghost sm" href="${x.cta.href}">${esc(x.cta.label)}</a>` : ""}</div>`).join("") : `<p class="empty">Belum cukup data untuk saran. Saran muncul setelah sekitar 8 ketukan per tombol.</p>`}
      </section>
      <dl class="kpirow">
        <div><dt>Kecepatan rata-rata</dt><dd>${t.avgWpm}<small> WPM</small></dd><span>20 sesi terakhir</span></div>
        <div><dt>Akurasi murni</dt><dd>${t.avgAcc}<small>%</small></dd><span>rata-rata</span></div>
        <div><dt>Rekor pribadi</dt><dd>${t.best}<small> WPM</small></dd><span>sesi tercepat</span></div>
        <div><dt>Waktu mengetik</dt><dd>${fmtMin(S.typingMs)}</dd><span>beruntun ${t.streak} hari</span></div>
      </dl>
      <div class="two">
        <section class="panel chart"><h3>Kecepatan</h3><p class="cap">WPM per sesi · ${period}</p>${chartOrEmpty(recent.map(h => h.wpm), { color: "var(--blue)", labels }, "kecepatan")}</section>
        <section class="panel chart"><h3>Akurasi murni</h3><p class="cap">% per sesi · ${period}</p>${chartOrEmpty(recent.map(h => h.acc), { color: "var(--green)", max: 100, unit: "%", labels }, "akurasi")}</section>
      </div>
      <div class="two">
        <section class="panel chart"><h3>Durasi latihan</h3><p class="cap">Menit per hari · 14 hari terakhir · total ${totalDays} menit</p>${totalDays ? barChart(days) : `<p class="empty">Belum ada latihan dalam 14 hari terakhir.</p>`}</section>
        <section class="panel"><h3>Penguasaan jari</h3><p class="cap">% ketukan benar per jari</p>${Object.entries(fm).map(([f, v]) => { const n = v.hit + v.miss, a = n ? Math.round(v.hit / n * 100) : 0, fn = f === "T" ? "TL" : f; return `<div class="fbar"><span><i class="dot" style="background:${Keys.FCOLOR[fn]}"></i>${Keys.FNAME[fn]}</span><div class="bar thin"><i style="width:${a}%;background:${a >= 95 ? "var(--green)" : a >= 88 ? "var(--orange)" : "var(--red)"}"></i></div><span class="muted">${n ? a + "%" : "–"}</span></div>`; }).join("")}</section>
      </div>
      <section class="panel"><h3>Peta tombol</h3><p class="cap">Persentase salah ketik per tombol. Arahkan kursor untuk detail.</p><div id="heat"></div>
        <div class="legend"><span><i style="background:var(--green-soft);border-color:var(--green)"></i>di bawah 5%</span><span><i style="background:var(--orange-soft);border-color:var(--orange)"></i>5–12%</span><span><i style="background:var(--red-soft);border-color:var(--red)"></i>di atas 12%</span><span><i></i>belum cukup data</span></div></section>
      <section class="panel"><h3>Pencapaian</h3><div class="badges">${Store.BADGES.map(b => `<div class="bdg ${S.badges[b.id] ? "" : "off"}"><span class="bi">${I[b.icon] || ""}</span><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></div>`).join("")}</div></section>`;
    const kb = Keys.mount($("#heat"), { hands: "none", keyboard: true, zones: false });
    const ft = document.querySelector("#heat .fingertip"); if (ft) ft.remove();
    document.querySelectorAll("#heat .key").forEach(e => {
      const k = e.dataset.k, v = S.keys[k];
      if (!v || v.hit + v.miss < 3) { if (Keys.CHARMAP[k]) e.title = keyName(k) + ": belum cukup data"; return; }
      const r = v.miss / (v.hit + v.miss);
      e.style.background = r < 0.05 ? "var(--green-soft)" : r < 0.12 ? "var(--orange-soft)" : "var(--red-soft)";
      e.style.borderColor = r < 0.05 ? "var(--green)" : r < 0.12 ? "var(--orange)" : "var(--red)";
      e.title = `${keyName(k)}: ${Math.round(r * 100)}% salah · ${v.hit + v.miss} ketukan · rata-rata ${Math.round(v.ms / Math.max(1, v.hit))} ms`;
    });
    cleanup = () => kb.destroy();
  }

  /* ================= SETTINGS ================= */
  const SECTIONS = [
    ["audio", "Audio & suara", ["sound.master", "sound.keyVolume", "sound.uiVolume", "sound.voiceVolume", "sound.keys", "sound.profile", "sound.space", "sound.error", "sound.correct"]],
    ["tutor", "Tutor suara", ["sound.voice", "sound.voiceLang", "sound.voicePack", "sound.voiceRate", "sound.voiceIntro", "sound.voiceErrors", "sound.voiceResults"]],
    ["keyboard", "Keyboard & mengetik", ["keyboard", "hands", "zones", "strict", "ignoreRepeat"]],
    ["tampilan", "Tampilan", ["theme", "typingFont", "fontSize"]],
    ["aksesibilitas", "Aksesibilitas", ["highContrast", "reducedMotion"]],
    ["belajar", "Pembelajaran", ["dailyGoal", "unlockAll"]],
    ["data", "Data & progres", []]
  ];
  async function settingsBody() {
    const packs = await Audio.listPacks();
    const lang = snd().voiceLang;
    const forLang = packs.filter(p => p.lang === lang && p.clips > 0);
    const hasPutra = forLang.some(p => p.provider === "elevenlabs");
    const voiceOpts = [["auto", "Otomatis (terbaik yang tersedia)"], ...forLang.map(p => [p.id, p.label]), ["browser", "Suara bawaan browser"]];
    const groups = { rekaman: "Rekaman keyboard asli", sintetis: "Sintetis" };
    const lv = Audio.levels();
    const resetBtn = id => `<button class="linkbtn" data-reset="${id}">Atur ulang bagian ini</button>`;
    return `
    <section class="sgroup" id="s-audio" data-sec="audio"><div class="shead"><h2>Audio & suara</h2>${resetBtn("audio")}</div>
      <div class="panel">
        <h3>Karakter suara keyboard</h3><p class="cap">Pilih suara yang paling enak didengar. Ketik di kotak percobaan untuk mendengarnya langsung.</p>
        ${Object.entries(groups).map(([g, gname]) => `<div class="pgroup"><span class="pglabel">${gname}</span><div class="profiles" role="radiogroup" aria-label="${gname}">${Audio.PROFILES.filter(p => p.src === g).map(p => `<button type="button" class="prof ${snd().profile === p.id ? "on" : ""}" role="radio" aria-checked="${snd().profile === p.id}" data-prof="${p.id}"><span class="pn">${esc(p.name)}</span><span class="pd">${esc(p.desc)}</span><span class="pp" data-play="${p.id}" role="button" aria-label="Pratinjau ${esc(p.name)}">${I.play}</span></button>`).join("")}</div></div>`).join("")}
        <label class="trybox"><span>Kotak percobaan</span><input type="text" id="trysound" placeholder="Ketik apa saja di sini untuk mendengar suaranya…" autocomplete="off" spellcheck="false"></label>
        <p class="cap small">Sumber rekaman: video YouTube "ASMR Typing on a Honeycomb Keyboard" (Shifwithme101) dan "Keyboard sounds comparison" (LumeKeebs), dipotong per ketukan.</p>
      </div>
      <div class="panel">
        <h3>Mixer volume</h3><p class="cap">Volume akhir setiap saluran = volume utama × volume saluran itu.</p>
        <div class="mixer">
          ${[["sound.master", "Utama", "semua suara"], ["sound.keyVolume", "Keyboard", "bunyi tombol"], ["sound.uiVolume", "Umpan balik", "salah, selesai, pencapaian"], ["sound.voiceVolume", "Tutor", "suara pemandu"]].map(([p, n, d]) => `<div class="mx"><label for="mx-${p}">${n}<small>${d}</small></label><input id="mx-${p}" type="range" min="0" max="100" step="1" value="${getP(p)}" data-set="${p}"><output>${getP(p)}%</output>${p !== "sound.master" ? `<span class="eff" data-eff="${p}">terdengar ${Math.round((p === "sound.keyVolume" ? lv.keys : p === "sound.uiVolume" ? lv.ui : lv.voice) * 100)}%</span>` : `<span class="eff"></span>`}</div>`).join("")}
        </div>
      </div>
      <div class="panel">
        <h3>Kapan suara berbunyi</h3>
        ${ctl.sw("sound.keys", "Suara ketikan", "Bunyi setiap tombol ditekan")}
        ${ctl.sw("sound.space", "Suara tombol spasi", "Spasi terdengar lebih berat, seperti aslinya")}
        ${ctl.sw("sound.error", "Suara salah ketik", "Nada pendek yang lembut saat tombol salah")}
        ${ctl.sw("sound.correct", "Suara selesai dan pencapaian")}
        <div class="opt"><span class="ol">Coba umpan balik</span><span class="row"><button class="btn ghost sm" data-do="err">Salah ketik</button><button class="btn ghost sm" data-do="done">Pelajaran selesai</button></span></div>
      </div>
    </section>
    <section class="sgroup" id="s-tutor" data-sec="tutor"><div class="shead"><h2>Tutor suara</h2>${resetBtn("tutor")}</div>
      <div class="panel">
        ${ctl.sw("sound.voice", "Aktifkan tutor suara", "Tutor menyebut tombol, jari, dan hasil pelajaran")}
        ${ctl.seg("sound.voiceLang", "Bahasa tutor", [["id", "Indonesia"], ["en", "English"]])}
        ${ctl.sel("sound.voicePack", "Suara tutor", voiceOpts, "", "Klip tutor dibuat sekali lalu disimpan sebagai file, jadi tidak ada jeda dan tidak ada kunci API di browser.")}
        ${hasPutra ? "" : `<div class="notice">${I.info}<span>Suara <b>Putra (ElevenLabs)</b> untuk bahasa ${lang === "en" ? "Inggris" : "Indonesia"} belum tersedia: kuota ElevenLabs di akun habis. Paket suaranya akan otomatis dipakai begitu dibuat dengan <code>tools/gen_voice.py</code>.</span></div>`}
        ${ctl.range("sound.voiceRate", "Kecepatan bicara", 0.8, 1.3, 0.05)}
        <div class="opt"><span class="ol">Pratinjau<small id="vinfo">Memuat…</small></span><button class="btn ghost sm" data-do="voice">${I.play} Dengarkan</button></div>
      </div>
      <div class="panel"><h3>Kapan tutor berbicara</h3>
        ${ctl.sw("sound.voiceIntro", "Saat mengenalkan tombol baru", "Menyebut tombol dan jari yang dipakai")}
        ${ctl.sw("sound.voiceErrors", "Saat sering salah", "Mengingatkan jari yang benar setelah 3 kali salah di tombol yang sama", "Tutor tidak bicara di setiap kesalahan supaya konsentrasimu tidak terganggu. Paling sering sekali tiap 8 detik.")}
        ${ctl.sw("sound.voiceResults", "Saat pelajaran selesai", "Mengomentari hasil dan rekor baru")}
      </div>
    </section>
    <section class="sgroup" id="s-keyboard" data-sec="keyboard"><div class="shead"><h2>Keyboard & mengetik</h2>${resetBtn("keyboard")}</div>
      <div class="panel">
        ${ctl.sw("keyboard", "Keyboard virtual", "Tampil di bawah teks latihan")}
        ${ctl.sel("hands", "Panduan tangan", [["both", "Kedua tangan"], ["left", "Tangan kiri saja"], ["right", "Tangan kanan saja"], ["none", "Sembunyikan"]], "Jari yang tepat bergerak ke tombol tujuan")}
        ${ctl.sw("zones", "Warna wilayah jari", "Setiap tombol diwarnai sesuai jari yang menekannya")}
        ${ctl.sw("strict", "Berhenti saat salah", "Kursor tidak maju sampai tombol yang benar ditekan", "Cocok untuk pemula. Kesalahan tetap tercatat di akurasi murni.")}
        ${ctl.sw("ignoreRepeat", "Abaikan tombol yang ditahan", "Mencegah huruf berulang saat tombol tertahan", "Saat tombol ditahan, sistem operasi mengulang hurufnya otomatis. Opsi ini mengabaikan ulangan itu.")}
        <div class="opt"><span class="ol">Layout keyboard<small>Kurikulum disusun untuk QWERTY (US). Peringatan muncul bila Caps Lock aktif atau layout memakai dead key.</small></span><span class="pill">QWERTY (US)</span></div>
      </div>
    </section>
    <section class="sgroup" id="s-tampilan" data-sec="tampilan"><div class="shead"><h2>Tampilan</h2>${resetBtn("tampilan")}</div>
      <div class="panel">
        ${ctl.seg("theme", "Tema", [["light", "Terang"], ["dark", "Gelap"], ["system", "Ikuti sistem"]])}
        ${ctl.seg("typingFont", "Huruf teks latihan", [["mono", "Monospace"], ["sans", "Sans"]])}
        ${ctl.range("fontSize", "Ukuran teks latihan", 26, 52, 2)}
        <div class="preview-type text" aria-hidden="true"><span class="c ok">s</span><span class="c ok">e</span><span class="c bad">p</span><span class="c cur">u</span><span class="c">l</span><span class="c">u</span><span class="c">h</span><span class="c"> </span><span class="c">j</span><span class="c">a</span><span class="c">r</span><span class="c">i</span></div>
      </div>
    </section>
    <section class="sgroup" id="s-aksesibilitas" data-sec="aksesibilitas"><div class="shead"><h2>Aksesibilitas</h2>${resetBtn("aksesibilitas")}</div>
      <div class="panel">
        ${ctl.sw("highContrast", "Kontras tinggi", "Teks dan garis lebih tegas")}
        ${ctl.sw("reducedMotion", "Kurangi animasi", "Mematikan animasi, termasuk gerakan jari")}
        ${ctl.sel("hands", "Mengetik dengan satu tangan", [["both", "Tidak, dua tangan"], ["left", "Hanya tangan kiri"], ["right", "Hanya tangan kanan"], ["none", "Panduan disembunyikan"]], "Panduan hanya menampilkan tangan yang dipilih")}
        <p class="cap">Semua tombol bisa dipakai dengan keyboard (Tab dan Enter) dan memiliki label untuk pembaca layar.</p>
      </div>
    </section>
    <section class="sgroup" id="s-belajar" data-sec="belajar"><div class="shead"><h2>Pembelajaran</h2>${resetBtn("belajar")}</div>
      <div class="panel">
        ${ctl.range("dailyGoal", "Target latihan harian", 5, 60, 5, "Ditampilkan di halaman kursus")}
        <div class="opt"><span class="ol">Mode bebas${tip("Biasanya pelajaran terbuka satu per satu setelah kamu meraih minimal 1 bintang. Mode bebas membuka semuanya.")}<small>${set().unlockAll ? "Aktif: semua pelajaran terbuka. Urutan belajar yang disarankan tetap ditandai." : "Buka semua pelajaran tanpa harus menyelesaikan urutannya"}</small></span><button class="btn ghost sm" data-do="free">${set().unlockAll ? "Matikan" : "Aktifkan"}</button></div>
      </div>
    </section>
    <section class="sgroup" id="s-data" data-sec="data"><div class="shead"><h2>Data & progres</h2></div>
      <div class="panel">
        <p class="cap">Progres tersimpan di browser ini, belum di akun. Cadangkan untuk berpindah perangkat atau browser.</p>
        <div class="opt"><span class="ol">Cadangkan progres<small>Unduh file berisi pelajaran, bintang, statistik, dan pengaturan</small></span><button class="btn ghost sm" id="exp">Unduh cadangan</button></div>
        <div class="opt"><span class="ol">Pulihkan progres<small>Muat file cadangan. Progres di browser ini akan diganti.</small></span><button class="btn ghost sm" id="imp">Pilih file</button></div>
        <div class="opt"><span class="ol">Atur ulang pengaturan<small>Semua pengaturan kembali ke bawaan. Progres tidak terhapus.</small></span><button class="btn ghost sm" id="rset">Atur ulang</button></div>
      </div>
      <div class="panel dangerzone"><h3>Zona berbahaya</h3>
        <div class="opt"><span class="ol">Hapus semua progres<small>Pelajaran, bintang, skor, dan statistik dihapus permanen. Tidak bisa dibatalkan.</small></span><button class="btn sm danger-solid" id="reset">Hapus progres</button></div>
      </div>
    </section>`;
  }
  async function viewSettings(section) {
    app.innerHTML = `<div class="pagehead row-between"><div><h1>Pengaturan</h1><p class="muted">Perubahan langsung diterapkan dan tersimpan otomatis.</p></div><span class="saved" id="saved" role="status" aria-live="polite"></span></div>
      <div class="settings-layout"><nav class="snav" aria-label="Kategori pengaturan">
        <label class="search">${I.search}<input type="search" id="sq" placeholder="Cari pengaturan" aria-label="Cari pengaturan"></label>
        ${SECTIONS.map(([id, n]) => `<a href="#/pengaturan/${id}" data-s="${id}">${n}</a>`).join("")}
        <button class="linkbtn totop" id="totop">Kembali ke atas</button></nav>
      <div class="settings" id="sbody"></div></div>`;
    const root = $("#sbody");
    root.innerHTML = await settingsBody();
    const refreshEff = () => { const lv = Audio.levels(); root.querySelectorAll("[data-eff]").forEach(e => { const p = e.dataset.eff; e.textContent = "terdengar " + Math.round((p === "sound.keyVolume" ? lv.keys : p === "sound.uiVolume" ? lv.ui : lv.voice) * 100) + "%"; }); };
    const refreshVoice = async () => { const v = $("#vinfo"); if (v) v.textContent = "Sedang dipakai: " + await Audio.voiceInfo(); };
    const onChange = async (p, live) => {
      refreshEff();
      if (live) return;
      if (p === "hands") root.querySelectorAll('[data-set="hands"]').forEach(s => s.value = set().hands);
      if (p === "sound.voiceLang") { const y = window.scrollY; root.innerHTML = await settingsBody(); wire(); window.scrollTo(0, y); }
      refreshVoice();
    };
    function wire() {
      wireControls(root, onChange);
      root.querySelectorAll("[data-prof]").forEach(b => b.addEventListener("click", e => {
        const id = b.dataset.prof;
        if (e.target.closest("[data-play]")) { Audio.preview(id); return; }
        root.querySelectorAll("[data-prof]").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); });
        commit("sound.profile", id, onChange);
      }));
      const tryb = $("#trysound");
      tryb.addEventListener("keydown", e => {
        Audio.unlock();
        if (e.ctrlKey || e.metaKey) return;
        if (e.key === "Backspace") Audio.play("back", snd().profile); else if (e.key === "Enter") { Audio.play("enter", snd().profile); e.preventDefault(); } else if (e.key === " ") Audio.play("space", snd().profile); else if (e.key.length === 1 && !(e.repeat && set().ignoreRepeat)) Audio.play("key", snd().profile);
      });
      root.querySelectorAll("[data-do]").forEach(b => b.addEventListener("click", async () => {
        Audio.unlock();
        const a = b.dataset.do;
        if (a === "err") { Audio.play("key"); setTimeout(() => Audio.play("error"), 40); }
        if (a === "done") Audio.play("done");
        if (a === "voice") Audio.say("preview", { force: true });
        if (a === "free") {
          if (!set().unlockAll) { const ok = await dialog({ title: "Aktifkan mode bebas?", body: "Semua pelajaran akan terbuka. Progres dan bintangmu tetap tersimpan, tetapi kamu bisa melewati urutan belajar yang disarankan. Mode ini bisa dimatikan kapan saja.", confirm: "Aktifkan mode bebas" }); if (!ok) return; }
          commit("unlockAll", !set().unlockAll, onChange, true); renderHeader(); const y = window.scrollY; root.innerHTML = await settingsBody(); wire(); window.scrollTo(0, y);
          toast("check", set().unlockAll ? "Mode bebas aktif" : "Mode bebas dimatikan", set().unlockAll ? "Semua pelajaran terbuka." : "Pelajaran kembali terbuka berurutan.");
        }
      }));
      root.querySelectorAll("[data-reset]").forEach(b => b.addEventListener("click", async () => {
        const sec = SECTIONS.find(s => s[0] === b.dataset.reset);
        Store.resetSettings(sec[2]); applySettings(); renderHeader(); showSaved();
        const y = window.scrollY; root.innerHTML = await settingsBody(); wire(); window.scrollTo(0, y);
        toast("check", `${sec[1]} dikembalikan ke bawaan`, "");
      }));
      $("#exp").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(Store.S)], { type: "application/json" })); a.download = `touchtyping-cadangan-${Store.dayKey(Date.now())}.json`; a.click(); toast("check", "Cadangan diunduh", a.download); };
      $("#imp").onclick = () => {
        const f = document.createElement("input"); f.type = "file"; f.accept = ".json,application/json";
        f.onchange = async () => {
          try {
            const d = JSON.parse(await f.files[0].text()); if (!d.lessons) throw 0;
            const ok = await dialog({ title: "Pulihkan dari cadangan?", body: `Progres di browser ini akan diganti dengan isi file <b>${esc(f.files[0].name)}</b> (${Object.keys(d.lessons).length} pelajaran selesai).`, confirm: "Pulihkan" });
            if (!ok) return;
            Store.importData(d); applySettings(); toast("check", "Progres dipulihkan", ""); route();
          } catch (e) { toast("warn", "File tidak bisa dibaca", "Pilih file cadangan TouchTyping (.json)."); }
        };
        f.click();
      };
      $("#rset").onclick = async () => { if (await dialog({ title: "Atur ulang semua pengaturan?", body: "Suara, tampilan, dan preferensi kembali ke bawaan. Progres belajar tidak berubah.", confirm: "Atur ulang" })) { Store.resetSettings(); applySettings(); renderHeader(); toast("check", "Pengaturan diatur ulang", ""); route(); } };
      $("#reset").onclick = async () => {
        const t = Store.totals();
        if (await dialog({ danger: true, title: "Hapus semua progres?", body: `Ini akan menghapus <b>${t.done} pelajaran selesai, ${t.stars} bintang</b>, skor, dan semua statistik di browser ini. Tindakan ini <b>tidak bisa dibatalkan</b>. Unduh cadangan dulu bila ragu.`, confirm: "Hapus permanen", typeToConfirm: "HAPUS" })) {
          Store.reset(); renderHeader(); toast("check", "Progres dihapus", "Mulai lagi dari pelajaran pertama."); route();
        }
      };
      refreshVoice();
    }
    wire();
    // search
    $("#sq").addEventListener("input", e => {
      const q = e.target.value.trim().toLowerCase();
      root.querySelectorAll(".opt, .pgroup, .mx, .trybox").forEach(o => o.hidden = q && !o.textContent.toLowerCase().includes(q));
      root.querySelectorAll(".panel").forEach(p => { const any = [...p.querySelectorAll(".opt,.pgroup,.mx,.trybox")].some(o => !o.hidden); p.hidden = q && !any && !p.textContent.toLowerCase().includes(q); });
      root.querySelectorAll(".sgroup").forEach(s => s.hidden = q && ![...s.querySelectorAll(".panel")].some(p => !p.hidden));
      let em = $("#noresult"); if (!em) { em = document.createElement("p"); em.id = "noresult"; em.className = "empty"; root.appendChild(em); }
      em.textContent = q && ![...root.querySelectorAll(".sgroup")].some(s => !s.hidden) ? `Tidak ada pengaturan untuk "${e.target.value}".` : "";
    });
    const navs = document.querySelectorAll(".snav a");
    const mark = id => navs.forEach(a => { a.classList.toggle("on", a.dataset.s === id); if (a.dataset.s === id) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
    if (section) { const el = document.getElementById("s-" + section); if (el) setTimeout(() => el.scrollIntoView({ block: "start" }), 0); mark(section); } else mark("audio");
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) mark(e.target.dataset.sec); }), { rootMargin: "-25% 0px -65% 0px" });
    root.querySelectorAll(".sgroup").forEach(s => io.observe(s));
    navs.forEach(a => a.addEventListener("click", e => { e.preventDefault(); history.replaceState(null, "", a.getAttribute("href")); const el = document.getElementById("s-" + a.dataset.s); if (el) el.scrollIntoView({ behavior: set().reducedMotion ? "auto" : "smooth", block: "start" }); mark(a.dataset.s); }));
    $("#totop").onclick = () => window.scrollTo({ top: 0, behavior: set().reducedMotion ? "auto" : "smooth" });
    cleanup = () => io.disconnect();
  }

  route();
})();
