import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Data penggunaan anonim apa yang dikirim Stabileo",
  "description": "Daftar lengkap data penggunaan anonim yang dikirim Stabileo, apa yang tidak pernah dikirimnya, dan cara menonaktifkannya.",
  "eyebrow": "Privasi",
  "lead": "Dengan akun, Stabileo membagikan data penggunaan anonim sejak akun dibuat; tanpa akun, hanya jika Anda memilih. Anda dapat mengubahnya kapan saja di Pengaturan atau di profil Anda. Data itu memberi tahu kami alat mana yang dipakai dan mana yang gagal, sehingga kami dapat memutuskan apa yang diperbaiki lebih dahulu. Inilah daftar lengkap apa yang dikirim.",
  "blocks": [
    {
      "k": "h",
      "t": "Apa yang dikirim"
    },
    {
      "k": "ul",
      "items": [
        "Alat yang Anda pilih (misalnya batang, tumpuan atau beban) dan diagram yang Anda tampilkan.",
        "Setiap perhitungan: berhasil atau gagal, berapa lama, apakah 2D atau 3D, dan ukuran model dalam rentang (misalnya, 11 sampai 50 batang).",
        "Contoh yang Anda buka, analisis lanjutan dan metode langkah demi langkah yang Anda gunakan.",
        "Ekspor, beserta formatnya.",
        "Mode (Basic atau PRO), versi aplikasi dan bahasa.",
        "Id acak untuk kunjungan ini. Jika Anda menjawab pemberitahuan dengan “Mengerti”, juga satu untuk peramban ini, disimpan di dalamnya untuk menghitung peramban yang berbeda. Keduanya tidak ditautkan ke akun Anda."
      ]
    },
    {
      "k": "h",
      "t": "Apa yang tidak pernah dikirim"
    },
    {
      "k": "ul",
      "items": [
        "Geometri, beban, penampang atau nilai apa pun dari model Anda.",
        "Nama proyek atau berkas Anda.",
        "Nama, email atau alamat IP Anda bersama peristiwa."
      ]
    },
    {
      "k": "h",
      "t": "Berapa lama disimpan"
    },
    {
      "k": "p",
      "t": "Peristiwa disimpan hingga tiga belas bulan dan dianalisis secara agregat."
    },
    {
      "k": "h",
      "t": "Cara mengubahnya"
    },
    {
      "k": "p",
      "t": "Di Pengaturan di bawah Privasi, atau di profil Anda jika Anda memiliki akun. Jika Anda berhenti berbagi, peristiwa yang belum terkirim dibuang."
    }
  ],
  "faqTitle": "Pertanyaan yang sering diajukan",
  "faq": []
};

export default body;
