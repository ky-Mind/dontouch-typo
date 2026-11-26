/* Course Management — curriculum, lesson goals and text generators. */
"use strict";
window.TT = window.TT || {};
TT.Course = (function () {
  const WORDS = ("ada dada lada gala kala jaga saja salah galah hal gas ajak kakak lagak sakal adalah gajah apa aku kamu dia kita kami mereka ini itu yang dan di ke dari untuk dengan pada dalam akan sudah belum bisa harus mau ingin suka tahu lihat buat kerja main jalan pulang pergi datang makan minum tidur baca tulis ketik belajar ajar guru murid kelas sekolah rumah kota desa pasar toko buku meja kursi pintu jendela lampu air api tanah angin hujan panas dingin pagi siang sore malam hari minggu bulan tahun waktu jam menit detik baru lama besar kecil tinggi rendah panjang pendek cepat lambat baik buruk benar mudah sulit senang sedih marah takut berani jujur sabar rajin malas pintar kaya muda tua anak ibu ayah kakak adik nenek kakek teman sahabat orang nama umur alamat kabar hidup sehat sakit dokter obat nasi roti sayur buah ikan ayam telur susu kopi teh gula garam daging sapi kambing kuda kucing anjing burung semut harimau monyet laut gunung sungai danau hutan pantai pulau langit bintang awan pelangi merah biru hijau kuning putih hitam ungu coklat satu dua tiga empat lima enam tujuh delapan sembilan sepuluh seratus seribu juta uang harga murah mahal beli jual bayar kirim terima tanya jawab cerita lagu musik gambar foto video film suara kata kalimat huruf angka jari tangan kaki kepala mata hidung mulut telinga rambut hati jiwa cinta rindu doa ilmu keras usaha hasil maju jaya merdeka bangsa negara rakyat adil damai aman kuat sejuk segar indah ramah sopan halal hadiah gaji kaos sepatu tas topi baju celana kain jahit sapu gelas piring sendok garpu dapur kamar halaman kebun sawah ladang padi jagung kelapa pisang mangga jeruk apel durian salak nanas tomat cabai bawang kecap saus sambal soto sate bakso tahu tempe kerupuk").split(/\s+/).filter((w, i, a) => w && a.indexOf(w) === i);
  const SENTENCES = [
    "Belajar mengetik itu seperti belajar naik sepeda.", "Jangan lihat papan ketik, percayalah pada jarimu.",
    "Sedikit demi sedikit, lama-lama menjadi bukit.", "Ketepatan dulu, kecepatan akan datang sendiri.",
    "Berakit-rakit ke hulu, berenang-renang ke tepian.", "Air beriak tanda tak dalam, air tenang menghanyutkan.",
    "Di mana bumi dipijak, di situ langit dijunjung.", "Rajin pangkal pandai, hemat pangkal kaya.",
    "Hari ini aku belajar mengetik dengan sepuluh jari.", "Posisi duduk yang tegak membuat tangan tidak cepat lelah.",
    "Letakkan telunjuk di huruf F dan J, lalu mulai mengetik.", "Bersatu kita teguh, bercerai kita runtuh.",
    "Ilmu itu seperti padi, makin berisi makin merunduk.", "Pagi ini langit cerah dan udara terasa sejuk.",
    "Setiap kesalahan adalah kesempatan untuk belajar lagi.", "Kopi hitam dan pisang goreng menemani sore yang hujan.",
    "Jika kamu lelah, istirahat sebentar lalu lanjutkan lagi.", "Siapa menanam, dialah yang akan menuai.",
    "Mengetik cepat tanpa salah adalah hasil latihan rutin.", "Tak ada rotan, akar pun jadi."
  ];
  const PARAGRAPHS = [
    "Mengetik dengan sepuluh jari adalah keterampilan yang sangat berguna. Saat jari sudah hafal letak tombol, mata cukup melihat layar. Pikiran pun bebas fokus pada isi tulisan, bukan pada papan ketik.",
    "Indonesia memiliki lebih dari tujuh belas ribu pulau. Setiap daerah punya bahasa, makanan, dan budaya yang berbeda. Keberagaman itu menjadi kekayaan yang patut kita jaga bersama.",
    "Latihan singkat setiap hari lebih baik daripada latihan panjang seminggu sekali. Mulailah pelan, jaga ketepatan, lalu biarkan kecepatan tumbuh dengan sendirinya. Konsisten adalah kuncinya."
  ];
  const UNITS = [
    { id: "intro", name: "Pengenalan", desc: "Posisi duduk, posisi tangan, dan cara memakai TouchTyping" },
    { id: "home", name: "Baris Tengah", desc: "Posisi dasar a s d f — j k l ; dan spasi" },
    { id: "top", name: "Baris Atas", desc: "Jari naik ke q w e r t — y u i o p" },
    { id: "bottom", name: "Baris Bawah", desc: "Jari turun ke z x c v b — n m , . /" },
    { id: "review", name: "Ulangan", desc: "Gabungan semua baris huruf" },
    { id: "num", name: "Angka", desc: "Baris angka 1 sampai 0" },
    { id: "sym", name: "Huruf Besar & Simbol", desc: "Shift, tanda baca, dan simbol" },
    { id: "words", name: "Kata", desc: "Kosakata bahasa Indonesia" },
    { id: "sent", name: "Kalimat", desc: "Kalimat dan peribahasa" },
    { id: "para", name: "Paragraf", desc: "Teks panjang" },
    { id: "adv", name: "Latihan Lanjutan", desc: "Campuran huruf besar, angka, dan tanda baca" },
    { id: "speed", name: "Latihan Kecepatan", desc: "Kata pendek, target WPM lebih tinggi" },
    { id: "acc", name: "Latihan Akurasi", desc: "Bintang hanya untuk akurasi sangat tinggi" },
    { id: "final", name: "Ujian Akhir", desc: "Buktikan kemampuanmu" }
  ];
  const ROWKEYS = { home: "asdfghjkl;", top: "qwertyuiop", bottom: "zxcvbnm,./" };
  const LESSONS = [];
  let pool = "";
  const L = (o) => { o.n = LESSONS.length + 1; o.pool = o.pool ?? pool; LESSONS.push(o); };

  // goals scale gently with lesson number
  const g = (wpm, acc) => ({ wpm, acc });
  L({ id: "L0", unit: "intro", type: "guide", title: "Kenalan dengan 10 jari", icon: "intro", desc: "Posisi tangan dan cara kerja latihan" });
  const pairs = { home: ["fj", " ", "dk", "sl", "a;", "gh"], top: ["ru", "ei", "wo", "qp", "ty"], bottom: ["vm", "c,", "x.", "z/", "bn"] };
  let w = 8;
  ["home", "top", "bottom"].forEach(u => {
    pairs[u].forEach(p => {
      const keys = [...p]; pool += p;
      const label = p === " " ? "Spasi" : keys.join(" & ");
      const id = p === " " ? "space" : p;
      if (p === " ") { L({ id: "k-space", unit: u, type: "intro", title: "Tombol Spasi", keys, icon: "space", goal: g(w, 80), desc: "Ibu jari menekan spasi" }); return; }
      L({ id: "k-" + id, unit: u, type: "intro", title: "Tombol " + label, keys, icon: "keys", glyph: p, goal: g(w, 80), desc: "Kenalan dengan tombol baru" });
      L({ id: "r-" + id, unit: u, type: "drill", title: "Ulangan: " + label, keys, icon: "review", glyph: p, goal: g(w + 1, 82), desc: "Ulangi tombol baru" });
      L({ id: "p-" + id, unit: u, type: "practice", title: "Latihan: " + label, keys, icon: "timer", goal: g(w + 2, 85), desc: "Campur dengan tombol sebelumnya" });
      w = Math.min(w + 1, 22);
    });
    L({ id: u + "-w", unit: u, type: "words", title: "Kata " + UNITS.find(x => x.id === u).name.toLowerCase(), icon: "words", goal: g(w, 85), desc: "Kata nyata dari huruf yang sudah dipelajari" });
    L({ id: u + "-g", unit: u, type: "game", title: "Main: Hujan Kata", icon: "game", desc: "Ketik kata sebelum jatuh" });
    L({ id: u + "-t", unit: u, type: "test", title: "Ujian " + UNITS.find(x => x.id === u).name, icon: "flag", goal: g(w + 2, 88), desc: "Tes satu baris penuh" });
  });
  L({ id: "rv-home", unit: "review", type: "rowmix", rows: "home", title: "Ulangan baris tengah", icon: "review", goal: g(20, 88) });
  L({ id: "rv-top", unit: "review", type: "rowmix", rows: "top", title: "Ulangan baris atas", icon: "review", goal: g(20, 88) });
  L({ id: "rv-bottom", unit: "review", type: "rowmix", rows: "bottom", title: "Ulangan baris bawah", icon: "review", goal: g(20, 88) });
  L({ id: "rv-all", unit: "review", type: "rowmix", rows: "all", title: "Ulangan semua huruf", icon: "timer", goal: g(22, 88) });
  ["47", "38", "29", "10", "56"].forEach(p => {
    pool += p; const label = [...p].join(" & ");
    L({ id: "k-" + p, unit: "num", type: "intro", title: "Angka " + label, keys: [...p], icon: "keys", glyph: p, goal: g(14, 82) });
    L({ id: "p-" + p, unit: "num", type: "numpractice", title: "Latihan angka " + label, keys: [...p], icon: "timer", goal: g(16, 85) });
  });
  L({ id: "num-t", unit: "num", type: "numtest", title: "Ujian angka", icon: "flag", goal: g(18, 88) });
  L({ id: "shift", unit: "sym", type: "caps", title: "Huruf besar (Shift)", icon: "keys", glyph: "Aa", goal: g(16, 85), desc: "Shift ditekan kelingking tangan seberang" });
  L({ id: "shift-r", unit: "sym", type: "capswords", title: "Nama & awal kalimat", icon: "review", goal: g(18, 86) });
  pool += "?!'\"-:";
  L({ id: "punc", unit: "sym", type: "punc", title: "Tanda baca", icon: "keys", glyph: "?!", goal: g(16, 85) });
  pool += "@#$%&*()+=_";
  L({ id: "symbols", unit: "sym", type: "symbols", title: "Simbol", icon: "keys", glyph: "@#", goal: g(12, 82) });
  L({ id: "w0", unit: "words", type: "common", title: "Kata sehari-hari", icon: "words", goal: g(24, 88) });
  L({ id: "w1", unit: "words", type: "long", title: "Kata panjang", icon: "words", goal: g(22, 88) });
  L({ id: "w2", unit: "words", type: "common", title: "Kata acak", icon: "words", goal: g(26, 88) });
  L({ id: "w-g", unit: "words", type: "game", title: "Main: Hujan Kata", icon: "game", pool: "abcdefghijklmnopqrstuvwxyz" });
  L({ id: "s0", unit: "sent", type: "sentence", count: 2, title: "Kalimat pendek", icon: "words", goal: g(24, 90) });
  L({ id: "s1", unit: "sent", type: "proverb", title: "Peribahasa", icon: "words", goal: g(24, 90) });
  L({ id: "s2", unit: "sent", type: "sentence", count: 3, title: "Kalimat panjang", icon: "words", goal: g(26, 90) });
  L({ id: "pg0", unit: "para", type: "paragraph", idx: 0, title: "Paragraf: Sepuluh jari", icon: "para", goal: g(26, 90) });
  L({ id: "pg1", unit: "para", type: "paragraph", idx: 1, title: "Paragraf: Nusantara", icon: "para", goal: g(28, 90) });
  L({ id: "pg2", unit: "para", type: "paragraph", idx: 2, title: "Paragraf: Konsisten", icon: "para", goal: g(28, 90) });
  L({ id: "adv0", unit: "adv", type: "advanced", title: "Campuran 1", icon: "timer", goal: g(26, 90) });
  L({ id: "adv1", unit: "adv", type: "advanced", title: "Campuran 2", icon: "timer", goal: g(28, 90) });
  L({ id: "spd0", unit: "speed", type: "speed", title: "Kecepatan 1", icon: "speed", goal: g(30, 85) });
  L({ id: "spd1", unit: "speed", type: "speed", title: "Kecepatan 2", icon: "speed", goal: g(35, 85) });
  L({ id: "spd2", unit: "speed", type: "speed", title: "Kecepatan 3", icon: "speed", goal: g(40, 85) });
  L({ id: "acc0", unit: "acc", type: "accuracy", title: "Akurasi 1", icon: "target", goal: g(22, 95) });
  L({ id: "acc1", unit: "acc", type: "accuracy", title: "Akurasi 2", icon: "target", goal: g(25, 96) });
  L({ id: "acc2", unit: "acc", type: "accuracy", title: "Akurasi 3", icon: "target", goal: g(28, 97) });
  L({ id: "final", unit: "final", type: "final", title: "Ujian Akhir", icon: "trophy", goal: g(35, 92) });

  // ---------- text generators ----------
  const rnd = a => a[Math.floor(Math.random() * a.length)];
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function groups(chars, heavy, count, minL = 2, maxL = 5) {
    const bag = [];
    [...chars].filter(c => c !== " ").forEach(c => { bag.push(c); if (heavy && heavy.includes(c)) bag.push(c, c, c); });
    const out = [];
    for (let i = 0; i < count; i++) { const n = minL + Math.floor(Math.random() * (maxL - minL + 1)); let s = ""; for (let j = 0; j < n; j++) s += rnd(bag); out.push(s); }
    return out.join(" ");
  }
  function wordsFrom(letters, count) {
    const set = new Set(letters);
    const ws = WORDS.filter(w => [...w].every(c => set.has(c)));
    if (ws.length < 6) return null;
    const out = []; for (let i = 0; i < count; i++) out.push(rnd(ws)); return out.join(" ");
  }
  const letters = p => (p || "").replace(/[^a-z]/g, "");
  const cap = w => w[0].toUpperCase() + w.slice(1);
  const num = () => String(Math.floor(Math.random() * 9000) + 10);

  /** returns {text, steps?} */
  function generate(l) {
    const lt = letters(l.pool);
    const kj = (l.keys || []).join("");
    switch (l.type) {
      case "intro": {
        const steps = []; l.keys.forEach(k => { for (let i = 0; i < 4; i++) steps.push(k); });
        if (l.keys[0] === " ") return { steps: [" ", " ", " ", " "], text: groups("fj", null, 10, 2, 3) };
        return { steps, text: groups(kj, null, 8, 2, 3) };
      }
      case "drill": return { text: groups(kj, null, 7, 2, 4) + " " + groups(l.pool, kj, 7, 3, 5) };
      case "practice": { const w = wordsFrom(lt, 6); return { text: groups(l.pool, kj, 10, 3, 5) + (w ? " " + w : "") }; }
      case "words": return { text: wordsFrom(lt, 16) || groups(l.pool, null, 14, 3, 5) };
      case "test": { const w = wordsFrom(lt, 12); return { text: w ? w + " " + groups(l.pool, null, 5, 3, 5) : groups(l.pool, null, 20, 3, 6) }; }
      case "rowmix": {
        const ks = l.rows === "all" ? ROWKEYS.home + ROWKEYS.top + ROWKEYS.bottom : ROWKEYS[l.rows];
        const w = wordsFrom(l.rows === "all" ? "abcdefghijklmnopqrstuvwxyz" : ks + "asdfghjkl", 10);
        return { text: groups(ks, null, 10, 3, 5) + (w ? " " + w : "") };
      }
      case "numpractice": return { text: groups(kj, null, 6, 2, 4) + " " + Array.from({ length: 6 }, () => rnd(WORDS) + " " + groups(l.pool.replace(/[^0-9]/g, ""), kj, 1, 2, 3)).join(" ") };
      case "numtest": return { text: Array.from({ length: 8 }, () => `${num()} ${rnd(WORDS)}`).join(" ") };
      case "caps": return { text: "Aa Ss Dd Ff Jj Kk Ll " + shuffle(WORDS.filter(w => w.length <= 6)).slice(0, 12).map(cap).join(" ") };
      case "capswords": {
        const names = ["Budi", "Siti", "Andi", "Rina", "Jakarta", "Bandung", "Surabaya", "Medan", "Bali", "Papua", "Indonesia", "Senin", "Jumat"];
        return { text: shuffle(names).slice(0, 6).map(n => n + " " + rnd(WORDS)).join(" ") + ". " + rnd(SENTENCES) };
      }
      case "punc": return { text: 'Apa kabar? Baik! Kata ibu: "makan dulu." Siap-siap, ayo! Kenapa? Karena hujan. Tanya: "jam berapa?" Wah, keren!' };
      case "symbols": return { text: "harga $25 diskon 10% email@contoh 2+3=5 (catatan) #belajar a&b 4*4=16 nama_file" };
      case "common": return { text: shuffle(WORDS.filter(w => w.length <= 6)).slice(0, 20).join(" ") };
      case "long": return { text: shuffle(WORDS.filter(w => w.length >= 6)).slice(0, 14).join(" ") };
      case "sentence": return { text: shuffle(SENTENCES).slice(0, l.count || 2).join(" ") };
      case "proverb": return { text: shuffle(SENTENCES.filter(s => s.includes(","))).slice(0, 3).join(" ") };
      case "paragraph": return { text: PARAGRAPHS[l.idx || 0] };
      case "advanced": return { text: shuffle(SENTENCES).slice(0, 2).join(" ") + ` Pada ${num()} orang, ${Math.floor(Math.random() * 90) + 10}% hadir. Kode: A${num()}-B. Siap?` };
      case "speed": return { text: shuffle(WORDS.filter(w => w.length <= 5)).slice(0, 24).join(" ") };
      case "accuracy": return { text: shuffle(WORDS.filter(w => w.length >= 5)).slice(0, 12).join(" ") + " " + rnd(SENTENCES) };
      case "final": return { text: rnd(PARAGRAPHS) + " " + shuffle(SENTENCES).slice(0, 2).join(" ") };
      case "smart": return { text: l.text };
    }
    return { text: "asdf jkl;" };
  }

  function gameWords(l) {
    const lt = letters(l.pool);
    let ws = WORDS.filter(w => [...w].every(c => lt.includes(c)) && w.length <= 7);
    if (ws.length < 8) ws = ws.concat(Array.from({ length: 30 }, () => groups(lt, null, 1, 2, 4)));
    return ws;
  }
  function smartText(weak, learned) {
    const ks = weak.join("");
    const ws = WORDS.filter(w => [...w].some(c => ks.includes(c)) && [...w].every(c => learned.includes(c)));
    return (groups(ks, null, 10, 2, 4) + (ws.length > 4 ? " " + shuffle(ws).slice(0, 10).join(" ") : "") + " " + groups(ks + learned.slice(0, 8), ks, 6, 3, 5)).trim();
  }
  return { UNITS, LESSONS, generate, gameWords, smartText, WORDS, rnd, shuffle, groups };
})();
