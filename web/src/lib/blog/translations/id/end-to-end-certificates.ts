import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Sertifikat ujung ke ujung: memeriksa hasil terhadap model",
  "excerpt": "Sertifikat yang membuktikan bahwa sistem yang salah dirakit telah diselesaikan dengan benar tidak banyak berharga. Cara Stabileo membangun ulang setiap model portal secara mandiri dan mensertifikasi hasil terhadap model, apa yang ditemukan, dan apa yang tidak dicakupnya.",
  "blocks": [
    {
      "k": "p",
      "t": "Selama beberapa minggu, setiap analisis statik linear di Stabileo telah melalui sertifikat yang, bila diperoleh, memberikan batas galat yang diperiksa mesin untuk penyelesaian sistem persamaan K·u = f. Namun mesin merakit sistem itu sendiri. Jika perakitan memiliki kesalahan, misalnya tanda yang salah pada sebuah transformasi, suku Timoshenko yang hilang, atau gaya ujung jepit yang salah, sertifikat akan membuktikan dengan ketelitian penuh bahwa sistem yang salah telah diselesaikan dengan benar."
    },
    {
      "k": "p",
      "t": "Sertifikat ujung ke ujung menutup celah itu untuk portal dan rangka batang, dalam 2D dan 3D: hasil diperiksa terhadap model sebagaimana ditulis, bukan terhadap matriks yang dirakit mesin."
    },
    {
      "k": "h",
      "t": "Perakitan kedua yang independen"
    },
    {
      "k": "p",
      "t": "Pemeriksa yang ditulis terpisah membangun ulang kekakuan dan beban dari data model, tanpa memanggil satu pun fungsi elemen atau perakitan milik mesin. Pemeriksa ini memakai rumusnya sendiri dan penomoran derajat kebebasannya sendiri:"
    },
    {
      "k": "ul",
      "items": [
        "lentur setiap batang dari fleksibilitas kantilever, dibalik, dan ujung lainnya dengan keseimbangan, dengan deformasi geser Timoshenko;",
        "sendi dengan kondensasi statik, satu rotasi yang dilepas pada satu waktu;",
        "beban batang sebagai kerja pada bentuk lendutan eksak batang tanpa beban, dengan integral dalam bentuk tertutup;",
        "sumbu lokal, tumpuan miring, pegas, hubungan kaku, diafragma, dan kekangan multititik, diturunkan dari konvensi model."
      ]
    },
    {
      "k": "p",
      "t": "Semuanya dihitung dengan aritmetika interval, termasuk sinus dan kosinus, dengan batas yang ketat: setiap masukan model masuk sebagai desimal yang diketik, dilingkupi dalam sebuah interval. Ketika suatu keputusan bergantung pada ambang yang tidak dapat dipastikan oleh interval, pemeriksa menolak alih-alih menebak."
    },
    {
      "k": "h",
      "t": "Apa yang dinyatakan sertifikat"
    },
    {
      "k": "p",
      "t": "Dengan kekakuan eksak itu, pemeriksa membuktikan bahwa model memiliki solusi yang unik dan membatasi jarak antara perpindahan yang dikembalikan mesin dan solusi tersebut, pada setiap derajat kebebasan yang ditentukan model. Matriks mesin tidak berperan dalam pernyataan itu. Matriks tersebut dibandingkan secara terpisah: harus sesuai dengan matriks hasil bangun ulang hingga satu bagian dalam 10¹⁰, dan perpindahan harus memenuhi tumpuan dan kekangan model hingga satu bagian dalam 10⁹. Jika tidak, hasil dilaporkan sebagai tidak diperiksa ujung ke ujung, beserta alasannya."
    },
    {
      "k": "p",
      "t": "Teorema di balik batas itu dibuktikan dalam Lean. Di aplikasi, panel hasil menampilkan baris “Diperiksa ujung ke ujung” beserta batas galat perpindahan, atau alasan mengapa pemeriksaan tidak dapat dilakukan."
    },
    {
      "k": "img",
      "base": "blog/certificate",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic dengan contoh portal yang sudah dihitung. Di bawah Pemeriksaan hasil pada panel hasil, baris “Diperiksa ujung ke ujung: perakitan ulang model secara independen sesuai; galat perpindahan ≤ 3.68e-15” berada di bawah sertifikat.",
      "caption": "Baris pada panel hasil, pada contoh portal."
    },
    {
      "k": "h",
      "t": "Apa yang ditemukan"
    },
    {
      "k": "table",
      "caption": "Model yang diperiksa ujung ke ujung dalam integrasi berkelanjutan: pada semuanya, perakitan mesin sesuai dengan hasil bangun ulang.",
      "head": [
        "Kumpulan",
        "Model",
        "Tersertifikasi"
      ],
      "rows": [
        [
          "Model uji 2D",
          "82",
          "82"
        ],
        [
          "Model uji 3D",
          "32",
          "32"
        ],
        [
          "Portal 2D acak",
          "200",
          "200"
        ],
        [
          "Portal 3D acak",
          "150",
          "150"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Setiap model uji dan ratusan portal yang dibangkitkan secara acak sesuai dan tersertifikasi, dan galat perakitan yang sengaja ditanam di mesin membuat pemeriksaan gagal. Pemeriksaan ini juga menemukan masalah nyata:"
    },
    {
      "k": "ul",
      "items": [
        "diafragma 3D pada bidang XZ mengikat titik simpul dengan rotasi bertanda salah;",
        "dalam 2D, momen pada titik simpul tempat semua batang bersendi diserap oleh pegas buatan, dan sertifikat sistem yang dirakit meloloskannya padahal model tidak memiliki solusi;",
        "hubungan kaku dari titik simpul semacam itu menyembunyikan mekanisme yang sebenarnya."
      ]
    },
    {
      "k": "p",
      "t": "Dua yang pertama sudah diperbaiki: diafragma mengikuti rotasi benda kaku, dan momen tersebut ditolak sebelum perhitungan. Dan ketika mesin mengubah arti diafragma, sehingga seluruh lantai berputar sebagai satu benda, pemeriksa tidak meloloskan sesuatu yang salah: ia tetap jujur, dengan batas yang tidak berguna, sampai konvensinya diperbarui. Itulah tepatnya gunanya pemeriksaan independen."
    },
    {
      "k": "h",
      "t": "Apa yang tidak dicakup"
    },
    {
      "k": "ul",
      "items": [
        "Cangkang, solid, konektor, balok lengkung, dan torsi pilin belum dibangun ulang: semuanya dilaporkan di luar cakupan, tidak pernah sebagai diperiksa.",
        "Rumus pemeriksa mengodekan mekanika model. Rumus ditulis terpisah dari mesin dan dibandingkan dengannya, tetapi tidak dibuktikan.",
        "Implementasi Rust tidak dibuktikan setara dengan algoritma Lean, seperti pada setiap sertifikat.",
        "Sertifikat menyatakan bahwa hasil milik model. Sertifikat tidak menyatakan bahwa model mewakili struktur dengan baik: itu tetap pekerjaan insinyur."
      ]
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Cara lain kami mencari kesalahan, beserta batasannya:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/CERTIFY.md",
      "label": "CERTIFY.md, “Sertifikat ujung ke ujung”",
      "t": "Deskripsi teknis lengkap, dengan rumus dan pengujiannya:"
    }
  ]
};

export default body;
