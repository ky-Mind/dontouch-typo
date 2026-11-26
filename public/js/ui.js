/* Shared UI helpers: icons, illustrations, toasts, dialogs, setting controls. */
"use strict";
window.TT = window.TT || {};
TT.UI = (function () {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ic = (d, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
  const I = {
    back: ic('<path d="M15 5l-7 7 7 7"/>'),
    redo: ic('<path d="M20 12a8 8 0 11-2.3-5.7M20 4v5h-5"/>'),
    pause: ic('<path d="M9 5v14M15 5v14"/>'),
    kb: ic('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>'),
    hand: ic('<path d="M8 13V5.5a1.5 1.5 0 013 0V11M11 11V4a1.5 1.5 0 013 0v7M14 11V5.5a1.5 1.5 0 013 0V13M17 9.5a1.5 1.5 0 013 0V15a7 7 0 01-7 7h-1a7 7 0 01-5.6-2.8L4 16a1.5 1.5 0 012.3-2l1.7 1.7"/>'),
    sound: ic('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/>'),
    sliders: ic('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
    lock: ic('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>'),
    check: ic('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 'stroke-width="3"'),
    arrow: ic('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    play: ic('<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>'),
    search: ic('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
    info: ic('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
    chevron: ic('<path d="M6 9l6 6 6-6"/>'),
    warn: ic('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>'),
    spark: ic('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>'),
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" fill="currentColor"/></svg>',
    sprout: ic('<path d="M12 21v-8M12 13c0-4-3-6-7-6 0 4 3 6 7 6zM12 11c0-4 3-6 7-6 0 4-3 6-7 6z"/>'),
    book: ic('<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 5v16M8 7h7"/>'),
    home: ic('<path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-5h4v5"/>'),
    mountain: ic('<path d="M3 20l6-10 4 6 3-4 5 8z"/>'),
    gauge: ic('<path d="M4 16a8 8 0 1116 0"/><path d="M12 16l4-5"/>'),
    rocket: ic('<path d="M5 19c1-3 2-4 4-5M14 4c3 0 6 3 6 6-2 4-6 7-10 8l-4-4c1-4 4-8 8-10z"/><circle cx="14.5" cy="9.5" r="1.5"/>'),
    target: ic('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".5"/>'),
    flame: ic('<path d="M12 21a6 6 0 006-6c0-5-6-8-6-12-1 3-6 6-6 12a6 6 0 006 6z"/>'),
    clock: ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    trophy: ic('<path d="M8 4h8v5a4 4 0 01-8 0zM8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4M12 13v4M8 20h8"/>')
  };
  const starRow = n => `<span class="stars" role="img" aria-label="${n} dari 5 bintang">` + [1, 2, 3, 4, 5].map(i => `<svg class="star ${i <= n ? "on" : ""}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>`).join("") + "</span>";
  const ring = (pct, size = 44, stroke = 4, label = "") => {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
    return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${Math.round(pct)}% selesai"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--ring,var(--green))" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>${label ? `<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle">${label}</text>` : ""}</svg>`;
  };
  const LOGO = `<svg class="logo" viewBox="0 0 40 40" aria-hidden="true"><rect x="3" y="5" width="34" height="31" rx="8" fill="var(--logo-base)"/><rect x="6" y="6" width="28" height="25" rx="6" fill="var(--logo-top)"/><path d="M14 13h12M20 13v12" stroke="var(--logo-ink)" stroke-width="3.2" stroke-linecap="round"/><rect x="16" y="27.2" width="8" height="2" rx="1" fill="var(--logo-ink)" opacity=".55"/></svg>`;

  const TYPE_LABEL = { guide: "Pengenalan", intro: "Tombol baru", drill: "Ulangan", practice: "Latihan", words: "Kata", game: "Permainan", test: "Ujian", rowmix: "Ulangan", numpractice: "Latihan", numtest: "Ujian", caps: "Tombol baru", capswords: "Latihan", punc: "Tombol baru", symbols: "Tombol baru", common: "Kata", long: "Kata", sentence: "Kalimat", proverb: "Kalimat", paragraph: "Paragraf", advanced: "Lanjutan", speed: "Kecepatan", accuracy: "Akurasi", final: "Ujian akhir", smart: "Latihan pintar" };

  function illus(l) {
    const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
    const glyph = esc((l.glyph || "").replace(" ", "␣"));
    const keycap = (g, x = 32, w = 30) => `<rect ${S} x="${x - w / 2}" y="16" width="${w}" height="28" rx="6"/><path ${S} d="M${x - w / 2 + 3} 44l2 6h${w - 10}l2-6"/><text class="lt" x="${x}" y="35" text-anchor="middle">${g}</text>`;
    switch (l.icon) {
      case "keys": { const gs = [...(l.glyph || "")]; return `<svg viewBox="0 0 64 64">${gs.length === 2 ? keycap(esc(gs[0]), 17, 24) + keycap(esc(gs[1]), 47, 24) : keycap(glyph, 32, 36)}</svg>`; }
      case "review": return `<svg viewBox="0 0 64 64"><circle ${S} cx="27" cy="27" r="15"/><path ${S} d="M38 38l13 13"/>${glyph ? `<text class="lt" x="27" y="32" text-anchor="middle">${glyph}</text>` : ""}</svg>`;
      case "timer": return `<svg viewBox="0 0 64 64"><circle ${S} cx="32" cy="35" r="19"/><path ${S} d="M32 35V24M27 10h10M32 10v6M47 19l3-3"/></svg>`;
      case "game": return `<svg viewBox="0 0 64 64"><path ${S} d="M32 8c-11 0-18 8-18 17 0 10 10 17 15 21h6c5-4 15-11 15-21 0-9-7-17-18-17z"/><path ${S} d="M26 46l2 7h8l2-7"/></svg>`;
      case "words": return `<svg viewBox="0 0 64 64"><rect ${S} x="14" y="9" width="36" height="46" rx="4"/><path ${S} d="M21 21h22M21 29h22M21 37h22M21 45h12"/></svg>`;
      case "para": return `<svg viewBox="0 0 64 64"><path ${S} d="M10 15h44M10 24h44M10 33h44M10 42h44M10 51h26"/></svg>`;
      case "flag": return `<svg viewBox="0 0 64 64"><path ${S} d="M17 56V8M17 10h29l-6 9 6 9H17"/></svg>`;
      case "speed": return `<svg viewBox="0 0 64 64"><path ${S} d="M36 7L17 36h14l-4 21 21-31H34z"/></svg>`;
      case "target": return `<svg viewBox="0 0 64 64"><circle ${S} cx="32" cy="32" r="21"/><circle ${S} cx="32" cy="32" r="12"/><circle ${S} cx="32" cy="32" r="3"/></svg>`;
      case "trophy": return `<svg viewBox="0 0 64 64"><path ${S} d="M20 10h24v14a12 12 0 01-24 0zM20 14h-8a9 9 0 009 11M44 14h8a9 9 0 01-9 11M32 36v10M22 54h20l-2-8H24z"/></svg>`;
      case "space": return `<svg viewBox="0 0 64 64"><rect ${S} x="6" y="22" width="52" height="20" rx="6"/><path ${S} d="M22 32h20"/></svg>`;
      case "intro": return `<svg viewBox="0 0 64 64"><path ${S} d="M14 46c0-12 6-22 18-22s18 10 18 22"/><path ${S} d="M22 34V18M28 30V13M34 30V14M40 34V19"/><path ${S} d="M10 50h44"/></svg>`;
    }
    return "";
  }

  /* toasts */
  let box = null;
  function toast(icon, title, text) {
    if (!box) { box = document.createElement("div"); box.className = "toasts"; box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
    const t = document.createElement("div"); t.className = "toast";
    t.innerHTML = `<span class="ti">${I[icon] || I.info}</span><div><b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ""}</div>`;
    box.appendChild(t); setTimeout(() => t.classList.add("out"), 3600); setTimeout(() => t.remove(), 4000);
  }

  /** confirm dialog. opts: {title, body, confirm, danger, typeToConfirm} → Promise<boolean> */
  function dialog(opts) {
    return new Promise(resolve => {
      const m = document.createElement("div"); m.className = "modal"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true");
      m.innerHTML = `<div class="sheet dialog ${opts.danger ? "danger" : ""}">
        ${opts.danger ? `<span class="dicon">${I.warn}</span>` : ""}
        <h3>${esc(opts.title)}</h3><p class="muted">${opts.body}</p>
        ${opts.typeToConfirm ? `<label class="confirmfield">Ketik <b>${esc(opts.typeToConfirm)}</b> untuk melanjutkan<input type="text" autocomplete="off" spellcheck="false"></label>` : ""}
        <div class="row end"><button class="btn ghost" data-r="0">Batal</button><button class="btn ${opts.danger ? "danger-solid" : ""}" data-r="1" ${opts.typeToConfirm ? "disabled" : ""}>${esc(opts.confirm || "Lanjutkan")}</button></div></div>`;
      document.body.appendChild(m);
      const ok = m.querySelector('[data-r="1"]'), input = m.querySelector("input");
      if (input) { input.addEventListener("input", () => ok.disabled = input.value.trim().toUpperCase() !== opts.typeToConfirm); setTimeout(() => input.focus(), 30); } else setTimeout(() => ok.focus(), 30);
      const done = v => { m.remove(); document.removeEventListener("keydown", key, true); resolve(v); };
      const key = e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); } };
      document.addEventListener("keydown", key, true);
      m.addEventListener("click", e => { const b = e.target.closest("[data-r]"); if (b && !b.disabled) done(b.dataset.r === "1"); else if (e.target === m) done(false); });
    });
  }
  return { esc, I, starRow, ring, LOGO, illus, toast, dialog, TYPE_LABEL };
})();
