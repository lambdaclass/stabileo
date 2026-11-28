import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Seberapa andal Stabileo? Bagaimana hasilnya diperiksa",
  "description": "Cara Stabileo memeriksa hasilnya: tujuh program FE lain, contoh yang dipublikasikan, batas galat yang dibuktikan di Lean, dan pemberitahuan publik.",
  "eyebrow": "Keandalan",
  "lead": "Hasil Stabileo diperiksa dengan lima cara independen, termasuk perbandingan dengan tujuh program elemen hingga lain dan batas galat yang matematika intinya dibuktikan di Lean. Cacat yang dapat memengaruhi hasil yang sudah dipakai dipublikasikan sebagai pemberitahuan keselamatan (sebagian temuan masih dipilah, secara terbuka), dan daftar di bawah menyebut mana yang sudah diperbaiki dan di versi berapa. Seperti program analisis mana pun, program ini tidak memeriksa model Anda: beban, tumpuan dan idealisasi adalah keputusan insinyur.",
  "blocks": [
    {
      "k": "h",
      "t": "Lima cara mencari kesalahan"
    },
    {
      "k": "ul",
      "items": [
        "Perbandingan dengan program lain: model yang sama, baik yang tetap maupun yang acak yang dibangkitkan setiap malam, diselesaikan dengan OpenSees, Code_Aster, Frame3DD, PyNite, MYSTRAN, Kratos dan CalculiX, dan setiap perbedaan diselidiki.",
        "Acuan yang dipublikasikan: kasus yang hasilnya diterbitkan oleh penulisnya, dan pemeriksaan desain yang dibandingkan dengan contoh hitungan yang dipublikasikan (INTI-CIRSOC, AISC dan lainnya).",
        "Invarian fisik: memutar, mencerminkan atau menomori ulang model, atau mengubah satuannya, harus mengubah jawaban persis seperti yang dikatakan fisika.",
        "Penurunan rumus: matriks elemen portal diturunkan secara simbolik dan dibandingkan suku demi suku dengan kodenya.",
        "Fuzzing dan pengujian mutasi: jutaan masukan yang dibangkitkan mencari kegagalan, dan kesalahan sengaja dimasukkan untuk memeriksa bahwa pengujian menangkapnya."
      ]
    },
    {
      "k": "h",
      "t": "Hasil dengan batas galat"
    },
    {
      "k": "p",
      "t": "Untuk hasil yang mendukungnya, Stabileo menghitung, dengan aritmetika interval, sebuah batas yang memuat solusi eksak dari sistem yang diselesaikannya; bila tidak bisa, hasil ditandai tidak tersertifikasi, beserta alasannya. Matematika intinya dibuktikan di Lean untuk analisis linier, kombinasi, analisis modal dan keruntuhan plastis. Sejak 0.3.0, untuk analisis linier portal dan rangka batang, batas itu juga diperiksa terhadap model itu sendiri, dengan perakitan independen."
    },
    {
      "k": "link",
      "slug": "end-to-end-certificates",
      "t": "Cara kerja pemeriksaan terhadap model:"
    },
    {
      "k": "h",
      "t": "Mengapa kami mempublikasikan pemberitahuan keselamatan"
    },
    {
      "k": "p",
      "t": "Verifikasi ini menemukan cacat nyata, banyak di antaranya tidak konservatif. Kami mempublikasikan yang dapat memengaruhi hasil yang sudah dipakai, beserta cara mengenali model yang terdampak dan apa yang perlu diperiksa ulang, karena cacat yang tidak dilaporkan siapa pun tetap berada dalam perhitungan yang sudah diserahkan."
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-001 sampai 004 diperbaiki di versi 0.2.0.",
        "SA-2026-005 sampai 020 diperbaiki di versi 0.3.0.",
        "SA-2026-021 sampai 024 diperbaiki di versi 0.4.0.",
        "SA-2026-025 sampai 047 dipublikasikan bersama versi 0.5.0 dan diperbaiki di dalamnya (SA-2026-040 dibatasi: pemeriksaannya ditandai tidak lengkap), kecuali SA-2026-044: keruntuhan plastis 2D tetap ditolak sampai #758 ditutup.",
        "Aplikasi memberi tahu sekali ketika hasil mungkin telah berubah, dan proyek yang disimpan sebelum perubahan yang menyangkutnya akan meminta pemeriksaan ulang saat dibuka."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Daftar lengkap pemberitahuan keselamatan:"
    },
    {
      "k": "h",
      "t": "Apa yang tidak dijamin oleh pemeriksaan mana pun"
    },
    {
      "k": "ul",
      "items": [
        "Batas galat membatasi galat numerik; itu tidak membuktikan bahwa modelnya benar, dan tidak membatasi galat diskretisasi mesh.",
        "Belum ada tinjauan independen oleh insinyur struktur berlisensi, dan hasil baja CIRSOC 301 masih berlabel eksperimental.",
        "Analisis nonlinier material adalah model sekan seluruh batang.",
        "Desain menurut peraturan di dalam PRO (tulangan, detailing dan sambungan) masih dalam pengembangan dan nonaktif secara bawaan.",
        "Masalah keselamatan terbuka bersifat publik di GitHub, dan tingkat verifikasi setiap analisis, elemen dan peraturan ada dalam matriks kematangan."
      ]
    },
    {
      "k": "p",
      "t": "Singkatnya: Stabileo cocok untuk analisis yang dapat Anda periksa silang, pengajaran, dan pekerjaan desain yang hasil penentunya ditinjau oleh insinyur, seperti dengan program mana pun. Jika proses Anda mensyaratkan perangkat lunak komersial yang ditinjau secara independen atau tersertifikasi, Stabileo belum sampai ke sana, dan kami menyatakannya."
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Setiap pemeriksaan secara rinci, beserta batasnya:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/MATURITY.md",
      "label": "Matriks kematangan",
      "t": "Tingkat verifikasi setiap bagian:"
    }
  ],
  "faqTitle": "Pertanyaan yang sering diajukan",
  "faq": [
    {
      "q": "Apakah Stabileo andal untuk pekerjaan desain struktur sungguhan?",
      "a": "Hasilnya diperiksa dengan lima cara independen, termasuk perbandingan dengan tujuh program elemen hingga lain dan batas galat yang dibuktikan di Lean, dan cacat yang dapat memengaruhi hasil yang sudah dipakai dipublikasikan; yang masih dipilah bersifat publik di GitHub. Stabileo belum pernah ditinjau secara independen oleh insinyur berlisensi dan desain menurut peraturan masih dalam pengembangan, jadi, seperti dengan program mana pun, insinyur meninjau model dan hasil penentunya."
    },
    {
      "q": "Mengapa Stabileo mempublikasikan pemberitahuan keselamatan?",
      "a": "Karena verifikasinya menemukan cacat nyata, banyak di antaranya tidak konservatif, dan cacat yang tidak dilaporkan siapa pun tetap berada dalam perhitungan yang sudah diserahkan. Setiap pemberitahuan menjelaskan cara mengenali model yang terdampak dan apa yang perlu diperiksa ulang."
    },
    {
      "q": "Apakah pemberitahuan keselamatan yang dipublikasikan sudah diperbaiki?",
      "a": "Semuanya kecuali dua. SA-2026-001 sampai 004 diperbaiki di versi 0.2.0, SA-2026-005 sampai 020 di 0.3.0, SA-2026-021 sampai 024 di 0.4.0 dan SA-2026-025 sampai 047 di 0.5.0, kecuali SA-2026-040 dan SA-2026-044. SA-2026-040 dibatasi: pemeriksaannya ditandai tidak lengkap. SA-2026-044 belum diperbaiki: keruntuhan plastis 2D tetap ditolak sampai #758 ditutup."
    }
  ]
};

export default body;
