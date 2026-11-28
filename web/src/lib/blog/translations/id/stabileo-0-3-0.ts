import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.3.0: enam belas perbaikan lagi dan semua pemberitahuan dipublikasikan",
  "excerpt": "Yang berubah sejak 0.2.0: enam belas cacat yang dapat memberikan hasil keliru, diperbaiki dan dipublikasikan sebagai pemberitahuan keselamatan; sertifikat yang memeriksa hasil terhadap model; dan angka yang sama pada setiap perhitungan.",
  "blocks": [
    {
      "k": "p",
      "t": "Versi 0.3.0 dirilis pada 21 Oktober 2026. Sejak 0.2.0 kami terus memeriksa solver dengan beberapa cara independen dan menemukan enam belas cacat lagi yang dapat memberikan hasil keliru. Semuanya sudah diperbaiki, dan masing-masing memiliki pemberitahuan keselamatan yang dipublikasikan, yang menjelaskan apa yang salah, siapa yang terdampak, dan apa yang perlu diperiksa ulang."
    },
    {
      "k": "note",
      "t": "stabileo.com mempublikasikan setiap perubahan segera setelah digabungkan, sehingga perbaikan ini sudah aktif sejak 19, 20, atau 21 Oktober. Aplikasi menyampaikan satu kali bahwa hasil mungkin berubah, dan proyek yang disimpan sebelum perubahan yang berkaitan meminta pemeriksaan ulang saat dibuka."
    },
    {
      "k": "h",
      "t": "Hitung ulang proyek Anda"
    },
    {
      "k": "p",
      "t": "Inilah kasus-kasus yang dapat menggeser hasil desain paling besar. Setiap pemberitahuan memuat kasus lengkap beserta langkah yang perlu dilakukan terhadap hasil yang sudah Anda serahkan."
    },
    {
      "k": "img",
      "base": "blog/recheck-notice",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo PRO membuka portal beton yang disimpan pada September. Sebuah dialog berjudul “Hasil telah berubah sejak proyek ini terakhir dihitung” mencantumkan perubahan yang berkaitan dengan model, antara lain perbaikan solver yang ditemukan oleh sertifikat hasil dan kompatibilitas regangan CIRSOC 201, lalu meminta Anda mencentang “Saya telah membaca perubahan ini” sebelum melanjutkan dengan hasil yang kedaluwarsa atau menghitung ulang.",
      "caption": "Membuka proyek yang dihitung sebelum perbaikan yang berkaitan: aplikasi mencantumkan perubahan tersebut dan menjaga hasil tetap kedaluwarsa sampai dihitung ulang."
    },
    {
      "k": "table",
      "caption": "Beberapa perbaikan 0.3.0: nilai yang benar dan nilai yang diberikan oleh versi sebelumnya.",
      "head": [
        "Pemberitahuan",
        "Kasus",
        "Benar",
        "Sebelum"
      ],
      "rows": [
        [
          "SA-2026-005",
          "Balok atap pelana: gaya aksial di pangkal (kN)",
          "-56.67",
          "-41.67"
        ],
        [
          "SA-2026-007",
          "Kolom salib 1,5 m: beban kritis (kN)",
          "2993",
          "5860"
        ],
        [
          "SA-2026-014",
          "Portal ruang yang dinomori ulang: faktor keruntuhan plastis",
          "176.47",
          "424.3"
        ],
        [
          "SA-2026-015",
          "Tiang menara berkabel pengikat: tarik pada kabel pengikat (kN)",
          "5.18",
          "4.34"
        ],
        [
          "SA-2026-013",
          "Kantilever cangkang lengkung: momen di pangkal (kN·m/m)",
          "35.0",
          "0"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Pemberitahuan lainnya mencakup spektrum respons dengan CQC, model bidang yang diselesaikan dalam 3D dengan momen pada titik simpul, tumpuan yang diubah dari pegas menjadi kaku, busur di luar bidang X–Z, kurva tanah p-y, t-z, dan q-z, cangkang solid pada pelat tipis, dan, bagi yang memakai mesin atau API-nya secara langsung, analisis nonlinear material, elemen MITC9 lengkung, dan beban suhu pada batang."
    },
    {
      "k": "h",
      "t": "Diperingatkan, bukan diam-diam keliru"
    },
    {
      "k": "ul",
      "items": [
        "Hasil yang dapat dipengaruhi oleh cacat yang masih terbuka disertai peringatan yang menyebutkannya, dalam bahasa Anda. Satu masih tersisa: analisis nonlinear material adalah model sekan seluruh batang.",
        "Jika beban suhu tidak menyebutkan koefisien muai atau tinggi penampang, hasil menyatakan nilai mana yang diasumsikan.",
        "Yang tidak memiliki solusi ditolak: momen pada titik simpul yang tidak dapat diputar oleh apa pun, beban cangkang pada elemen berjenis lain, kurva tanah tanpa masukan yang dibutuhkan acuannya."
      ]
    },
    {
      "k": "h",
      "t": "Diperiksa lebih dalam"
    },
    {
      "k": "ul",
      "items": [
        "Sertifikat ujung ke ujung untuk portal dan rangka batang: pemeriksa independen membangun ulang kekakuan dan beban dari model dan mensertifikasi perpindahan terhadap model, bukan hanya terhadap matriks yang dirakit mesin. Pemeriksa ini sudah menemukan tiga kasus ketika mesin dan model tidak sesuai.",
        "Model yang sama selalu memberikan angka yang sama, bit demi bit, dan setiap laporan, buku kerja, dan CSV mencatat versi dan data mana yang menghasilkannya.",
        "Desain beton CIRSOC 201 berasal dari satu implementasi di dalam mesin.",
        "Perkiraan galat mesh untuk pelat dan cangkang, ditampilkan sebagai perkiraan, tidak pernah sebagai tersertifikasi."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Daftar lengkap pemberitahuan, beserta apa yang perlu diperiksa ulang untuk masing-masing:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.3.0.md",
      "label": "Catatan rilis 0.3.0",
      "t": "Catatan lengkap, beserta keterbatasan yang diketahui:"
    }
  ]
};

export default body;
