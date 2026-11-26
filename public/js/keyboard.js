/* Keyboard Component + Finger Guide (virtual hands drawn in SVG, fingers reach for the target key). */
"use strict";
window.TT = window.TT || {};
TT.Keys = (function () {
  const FNAME = { L5: "kelingking kiri", L4: "jari manis kiri", L3: "jari tengah kiri", L2: "telunjuk kiri", R2: "telunjuk kanan", R3: "jari tengah kanan", R4: "jari manis kanan", R5: "kelingking kanan", TL: "ibu jari", TR: "ibu jari" };
  const FCOLOR = { L5: "#e0565b", L4: "#f08a24", L3: "#d9a800", L2: "#2f9e5b", R2: "#2a9fd6", R3: "#5b6ee1", R4: "#a35bd6", R5: "#d6559a", TL: "#7d8796", TR: "#7d8796" };
  const HOMEKEY = { L5: "a", L4: "s", L3: "d", L2: "f", R2: "j", R3: "k", R4: "l", R5: ";" };
  // QWERTY (US). [base, shifted, finger, width?] or special key object
  const ROWS = [
    [["`", "~", "L5"], ["1", "!", "L5"], ["2", "@", "L4"], ["3", "#", "L3"], ["4", "$", "L2"], ["5", "%", "L2"], ["6", "^", "R2"], ["7", "&", "R2"], ["8", "*", "R3"], ["9", "(", "R4"], ["0", ")", "R5"], ["-", "_", "R5"], ["=", "+", "R5"], { id: "Backspace", label: "backspace", w: 2, f: "R5" }],
    [{ id: "Tab", label: "tab", w: 1.5, f: "L5" }, ["q", "Q", "L5"], ["w", "W", "L4"], ["e", "E", "L3"], ["r", "R", "L2"], ["t", "T", "L2"], ["y", "Y", "R2"], ["u", "U", "R2"], ["i", "I", "R3"], ["o", "O", "R4"], ["p", "P", "R5"], ["[", "{", "R5"], ["]", "}", "R5"], ["\\", "|", "R5", 1.5]],
    [{ id: "CapsLock", label: "caps lock", w: 1.8, f: "L5" }, ["a", "A", "L5"], ["s", "S", "L4"], ["d", "D", "L3"], ["f", "F", "L2"], ["g", "G", "L2"], ["h", "H", "R2"], ["j", "J", "R2"], ["k", "K", "R3"], ["l", "L", "R4"], [";", ":", "R5"], ["'", "\"", "R5"], { id: "Enter", label: "enter", w: 2.2, f: "R5" }],
    [{ id: "ShiftLeft", label: "shift", w: 2.35, f: "L5" }, ["z", "Z", "L5"], ["x", "X", "L4"], ["c", "C", "L3"], ["v", "V", "L2"], ["b", "B", "L2"], ["n", "N", "R2"], ["m", "M", "R2"], [",", "<", "R3"], [".", ">", "R4"], ["/", "?", "R5"], { id: "ShiftRight", label: "shift", w: 2.65, f: "R5" }],
    [{ id: "CtrlL", label: "ctrl", w: 1.4, f: null }, { id: "AltL", label: "alt", w: 1.4, f: null }, { id: " ", label: "", w: 6.6, f: "TL" }, { id: "AltR", label: "alt", w: 1.4, f: null }, { id: "CtrlR", label: "ctrl", w: 1.4, f: null }]
  ];
  const CHARMAP = {}; // char -> {key, shift, f}
  ROWS.forEach(r => r.forEach(k => { if (Array.isArray(k)) { CHARMAP[k[0]] = { key: k[0], shift: false, f: k[2] }; CHARMAP[k[1]] = { key: k[0], shift: true, f: k[2] }; } }));
  CHARMAP[" "] = { key: " ", shift: false, f: "T" };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /** tapered finger outline from base b to tip t: widths wb (base) and wt (tip), rounded tip */
  function fingerPath(b, t, wb, wt) {
    const dx = t.x - b.x, dy = t.y - b.y, L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const r = wt / 2;
    const tx = t.x - ux * r * 0.2, ty = t.y - uy * r * 0.2; // tip circle centre slightly inside
    const p = (x, y) => `${x.toFixed(1)},${y.toFixed(1)}`;
    const b1 = p(b.x + nx * wb / 2, b.y + ny * wb / 2), b2 = p(b.x - nx * wb / 2, b.y - ny * wb / 2);
    const t1 = p(tx + nx * r, ty + ny * r), t2 = p(tx - nx * r, ty - ny * r);
    // knuckle bulge: control point slightly outside mid-length
    const mx = b.x + dx * 0.55, my = b.y + dy * 0.55, bulge = (wb + wt) / 4 * 1.06;
    const c1 = p(mx + nx * bulge, my + ny * bulge), c2 = p(mx - nx * bulge, my - ny * bulge);
    return `M${b1} Q${c1} ${t1} A${r.toFixed(1)},${r.toFixed(1)} 0 0 0 ${t2} Q${c2} ${b2} Z`;
  }

  /** Build keyboard + hands into `host`. Returns controller. opts: {hands:'both'|'left'|'right'|'none', zones:bool, keyboard:bool} */
  function mount(host, opts) {
    const showKb = opts.keyboard !== false;
    let h = `<div class="kbwrap ${opts.hands === "none" ? "nohands" : ""}" ${showKb ? "" : 'style="display:none"'}><div class="keyboard">`;
    ROWS.forEach(r => {
      h += '<div class="krow">';
      r.forEach(k => {
        if (Array.isArray(k)) {
          const w = k[3] || 1, letter = /[a-z]/.test(k[0]);
          h += `<div class="key ${opts.zones ? "zone" : ""} ${k[0] === "f" || k[0] === "j" ? "home" : ""}" style="flex-grow:${w};--fz:${FCOLOR[k[2]]}" data-k="${esc(k[0])}">${letter ? esc(k[0]) : `<span class="sh">${esc(k[1])}</span>${esc(k[0])}`}</div>`;
        } else {
          h += `<div class="key ${opts.zones && k.f ? "zone" : ""}" style="flex-grow:${k.w};--fz:${FCOLOR[k.f] || "transparent"}" data-k="${esc(k.id)}"><span class="lb">${k.label}</span></div>`;
        }
      });
      h += "</div>";
    });
    h += `</div><svg class="hands" aria-hidden="true"></svg></div><div class="fingertip"></div>`;
    host.innerHTML = h;
    const wrap = host.querySelector(".kbwrap"), svg = host.querySelector(".hands"), tip = host.querySelector(".fingertip");
    let current = null;
    const keyEl = id => host.querySelector(`.key[data-k="${CSS.escape(id)}"]`);

    function center(el, fx = 0.5, fy = 0.5) {
      const a = el.getBoundingClientRect(), b = wrap.getBoundingClientRect();
      return { x: a.left - b.left + a.width * fx, y: a.top - b.top + a.height * fy, w: a.width, h: a.height };
    }

    function drawHands(active) {
      if (opts.hands === "none" || !showKb) { svg.innerHTML = ""; return; }
      const W = wrap.clientWidth, H = wrap.clientHeight;
      svg.setAttribute("width", W); svg.setAttribute("height", H); svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      const aKey = keyEl("a"); if (!aKey) return;
      const kw = aKey.getBoundingClientRect().width;
      const kbBottom = host.querySelector(".keyboard").offsetHeight;
      const space = center(keyEl(" "));
      const fw = kw * 0.56;
      const shapes = { outer: "", inner: "", fill: "", act: [] };
      const add = (hand) => {
        const fingers = hand === "L" ? ["L5", "L4", "L3", "L2"] : ["R2", "R3", "R4", "R5"];
        const homes = fingers.map(f => center(keyEl(HOMEKEY[f])));
        const midX = (homes[0].x + homes[3].x) / 2;
        const palmTop = kbBottom - kw * 0.15;
        const lift = { L5: 0.55, L4: 0.12, L3: 0, L2: 0.2, R2: 0.2, R3: 0, R4: 0.12, R5: 0.55 };
        const bases = fingers.map((f, i) => ({ x: homes[i].x + (midX - homes[i].x) * 0.22, y: palmTop + kw * lift[f] }));
        // palm/wrist polygon
        const xs = bases.map(b => b.x), x0 = Math.min(...xs) - fw * 0.55, x1 = Math.max(...xs) + fw * 0.55;
        const pw = x1 - x0, inner = hand === "L" ? x1 : x0, outerX = hand === "L" ? x0 : x1;
        const top = palmTop + kw * 0.1, bot = H + 30;
        const wristIn = hand === "L" ? -pw * 0.05 : pw * 0.05, wristOut = hand === "L" ? pw * 0.16 : -pw * 0.16;
        const palm = `M${outerX},${top + kw * 0.6} Q${outerX},${top} ${outerX + (inner - outerX) * 0.25},${top} L${inner - (inner - outerX) * 0.2},${top} Q${inner},${top} ${inner},${top + kw * 0.5} L${inner + wristIn},${bot} L${outerX + wristOut},${bot} Z`;
        shapes.outer += `<path d="${palm}" stroke-width="3.5" stroke-linejoin="round"/>`;
        shapes.inner += `<path d="${palm}" stroke="none"/>`;
        shapes.fill += `<path d="${palm}" stroke="none"/>`;
        const seg = (f, b, t, w) => {
          const isAct = !!(active && active.hl && active.hl.has(f));
          const tp = (active && active.fingers[f]) || t;
          const d = fingerPath(b, tp, w * 1.12, w * 0.86);
          shapes.outer += `<path d="${d}" stroke-width="3.5" stroke-linejoin="round"/>`;
          shapes.inner += `<path d="${d}" stroke="none"/>`;
          shapes.fill += `<path d="${d}" stroke="none"/>`;
          if (isAct) shapes.act.push({ f, d });
        };
        fingers.forEach((f, i) => seg(f, bases[i], { x: homes[i].x, y: homes[i].y + kw * 0.12 }, fw * (f.endsWith("5") ? 0.9 : 1)));
        // thumb
        const tf = hand === "L" ? "TL" : "TR";
        const tb = { x: inner + (hand === "L" ? -fw * 0.4 : fw * 0.4), y: top + kw * 1.25 };
        const tt = { x: space.x + (hand === "L" ? -space.w * 0.17 : space.w * 0.17), y: space.y + 2 };
        seg(tf, tb, tt, fw * 1.08);
      };
      if (opts.hands !== "right") add("L");
      if (opts.hands !== "left") add("R");
      const clipY = kbBottom - kw * 0.05;
      let actSvg = "";
      shapes.act.forEach(a => {
        const col = FCOLOR[a.f];
        const clip = a.f.startsWith("T") ? "" : `clip-path="url(#ac)"`;
        actSvg += `<g ${clip}><path d="${a.d}" fill="${col}" fill-opacity=".16" stroke="${col}" stroke-width="2.6" stroke-linejoin="round"/></g>`;
      });
      svg.innerHTML = `<defs>
          <mask id="hm" maskUnits="userSpaceOnUse"><rect width="${W}" height="${H}" fill="white"/><g fill="black" stroke="black" stroke-linecap="round">${shapes.inner}</g></mask>
          <clipPath id="ac"><rect x="0" y="0" width="${W}" height="${clipY + kw * 1.2}"/></clipPath>
        </defs>
        <g fill="var(--panel)" stroke="var(--panel)" stroke-linecap="round" opacity=".42">${shapes.fill}</g>
        <g mask="url(#hm)" fill="var(--hand-line)" stroke="var(--hand-line)" stroke-linecap="round">${shapes.outer}</g>
        ${actSvg}`;
    }

    function clearTarget() {
      host.querySelectorAll(".key.target").forEach(e => e.classList.remove("target"));
    }
    // resting fingertip position for each finger (used as the start/end of the reach animation)
    function homeTip(f) {
      const aKey = keyEl("a"); const kw = aKey ? aKey.getBoundingClientRect().width : 40;
      if (f === "TL" || f === "TR") { const sp = center(keyEl(" ")); return { x: sp.x + (f === "TL" ? -sp.w * 0.17 : sp.w * 0.17), y: sp.y + 2 }; }
      const c = center(keyEl(HOMEKEY[f])); return { x: c.x, y: c.y + kw * 0.12 };
    }
    let shown = {}, anim = 0;
    function animateTo(end, hl) {
      cancelAnimationFrame(anim);
      const reduce = document.documentElement.classList.contains("rm") || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
      const fingers = [...new Set([...Object.keys(shown), ...Object.keys(end)])];
      if (reduce || !fingers.length) { shown = end; drawHands({ fingers: end, hl }); return; }
      const from = {}, to = {};
      fingers.forEach(f => { from[f] = shown[f] || homeTip(f); to[f] = end[f] || homeTip(f); });
      const t0 = performance.now(), D = 110;
      const step = now => {
        const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3);
        const cur = {};
        fingers.forEach(f => { cur[f] = { x: from[f].x + (to[f].x - from[f].x) * e, y: from[f].y + (to[f].y - from[f].y) * e }; });
        drawHands({ fingers: cur, hl });
        if (k < 1) anim = requestAnimationFrame(step); else { shown = end; }
      };
      anim = requestAnimationFrame(step);
    }
    /** highlight the key(s) and finger(s) for char ch (or null); the finger glides to the key */
    function target(ch, instant) {
      current = ch;
      clearTarget();
      if (ch == null || !CHARMAP[ch]) { tip.innerHTML = ""; if (instant) { shown = {}; drawHands(null); } else animateTo({}, new Set()); return; }
      const m = CHARMAP[ch];
      const end = {}, hl = new Set();
      const ke = keyEl(m.key);
      if (ke) {
        ke.classList.add("target");
        if (m.f === "T") {
          const f = opts.hands === "right" ? "TR" : "TL", sp = center(ke);
          end[f] = { x: sp.x + (f === "TR" ? sp.w * 0.17 : -sp.w * 0.17), y: sp.y + 2 }; hl.add(f);
        } else {
          const c = center(ke); end[m.f] = { x: c.x, y: c.y + c.h * 0.12 }; hl.add(m.f);
        }
      }
      let shiftF = null;
      if (m.shift) {
        const sid = m.f.startsWith("L") ? "ShiftRight" : "ShiftLeft";
        const se = keyEl(sid);
        if (se) { se.classList.add("target"); shiftF = sid === "ShiftRight" ? "R5" : "L5"; const c = center(se, sid === "ShiftRight" ? 0.3 : 0.7); end[shiftF] = { x: c.x, y: c.y + c.h * 0.1 }; hl.add(shiftF); }
      }
      const fname = m.f === "T" ? "TL" : m.f;
      tip.innerHTML = `<i style="background:${FCOLOR[fname]}"></i>Pakai <b>${FNAME[fname]}</b>${shiftF ? ` + <b>shift</b> dengan ${FNAME[shiftF]}` : ""}`;
      if (instant) { shown = end; drawHands({ fingers: end, hl }); } else animateTo(end, hl);
    }
    /** flash the physically pressed key green/red */
    function flash(ch, ok) {
      let id = ch;
      if (ch === "Backspace") id = "Backspace"; else if (CHARMAP[ch]) id = CHARMAP[ch].key;
      const ke = keyEl(id); if (!ke) return;
      const cls = ok ? "hit-ok" : "hit-bad";
      ke.classList.remove("hit-ok", "hit-bad"); void ke.offsetWidth; ke.classList.add(cls);
      clearTimeout(ke._t); ke._t = setTimeout(() => ke.classList.remove(cls), 170);
    }
    const ro = new ResizeObserver(() => { shown = {}; target(current, true); });
    ro.observe(wrap);
    return { target, flash, destroy: () => { ro.disconnect(); cancelAnimationFrame(anim); }, keyEl };
  }

  return { ROWS, CHARMAP, FNAME, FCOLOR, mount, esc };
})();
