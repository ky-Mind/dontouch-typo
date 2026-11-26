# TouchTyping (dontouch-typo)

Web app belajar mengetik sepuluh jari dalam bahasa Indonesia. Live: <https://touchtyping.xianzing.my.id>

## Fitur

- **94 pelajaran dalam 14 bab**: pengenalan, baris tengah/atas/bawah, angka, huruf besar & simbol, kata, kalimat, paragraf, kecepatan, akurasi, dan ujian akhir. Pelajaran terbuka berurutan (minimal 1 bintang), atau semua sekaligus lewat *mode bebas*.
- **Engine ketik per karakter**: status belum/aktif/benar/salah/dikoreksi; WPM, akurasi, dan akurasi murni (kesalahan yang dikoreksi tetap dihitung).
- **Keyboard virtual + tangan SVG**: jari yang tepat bergerak ke tombol tujuan, termasuk shift dari tangan seberang.
- **Suara keyboard dari sampel**: 9 profil hasil potongan rekaman keyboard asli dan 2 profil sintetis. Ditambah mixer volume (utama × keyboard / umpan balik / tutor).
- **Tutor suara**: klip yang dibuat sekali (tanpa panggilan API saat mengetik, tanpa kunci API di browser). Bahasa Indonesia dan Inggris.
- **Statistik yang memberi saran**: tombol dan jari terlemah, pola kesalahan antar-huruf, tren, rekomendasi pelajaran. Ada juga Latihan Pintar per tombol.
- **Pengaturan**: pencarian, atur ulang per bagian, indikator tersimpan, kontras tinggi, kurangi animasi, mode satu tangan, cadangan/pulihkan progres.

## Struktur

```
public/            situs statis (di-deploy ke Cloudflare Workers static assets)
  js/engine.js     engine ketik + filter input (murni, diuji)
  js/audio.js      audio engine: sprite sampel, bus volume, tutor suara
  js/keyboard.js   keyboard virtual + tangan
  js/course.js     kurikulum + generator teks
  js/store.js      progres & pengaturan (localStorage, migrasi versi)
  js/ui.js, app.js tampilan
  sfx/             sprite suara (.wav + offset .json)
  voice/<pack>/    klip tutor suara + manifest; voice/packs.json = daftar paket
tools/
  make_sfx.py      render suara sintetis
  slice_samples.py potong rekaman keyboard menjadi sprite per ketukan
  gen_voice.py     buat paket tutor suara lewat API (ElevenLabs "Putra" atau OmniVoice)
  align_pack.py    potong satu rekaman panjang menjadi klip per baris (faster-whisper)
tests/engine.test.cjs
```

## Menjalankan

```bash
python3 -m http.server 8765 -d public   # buka http://localhost:8765
node tests/engine.test.cjs              # tes engine & filter input
npx cf deploy                           # deploy ke Cloudflare
```

## Tutor suara ElevenLabs (Putra)

Paket `putra-id` dan `putra-en` dibuat dengan satu generate per bahasa di web app ElevenLabs (suara "Putra", model Multilingual v2; teks dari `tools/voice_lines*.json`, satu baris per paragraf). Rekaman panjang itu lalu dipotong per baris dengan pengenalan suara:

```bash
pip install faster-whisper
python3 tools/align_pack.py rekaman-id.mp3 --lang id --pack putra-id --label "Putra (ElevenLabs)"
python3 tools/align_pack.py rekaman-en.mp3 --lang en --pack putra-en --label "Putra (ElevenLabs)"
# baris berurutan yang salah potong bisa dipotong ulang berdasarkan jeda: --fix key_r,key_t,key_y
```

Alternatif lewat API (butuh kredit di akun API key): `python3 tools/gen_voice.py elevenlabs --lang id --pack putra-id --label "Putra (ElevenLabs)"`.

Paket baru otomatis muncul di Pengaturan › Tutor suara dan dipakai pada mode "Otomatis".

## Sumber suara

Profil rekaman dipotong dari video YouTube "ASMR Typing on a Honeycomb Keyboard" (Shifwithme101) dan "Keyboard sounds comparison" (LumeKeebs). Hak cipta rekaman ada pada pemiliknya. Minta izin atau ganti sampelnya sebelum dipakai secara komersial.
