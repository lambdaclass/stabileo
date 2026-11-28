import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Alternatif SAP2000 yang gratis dan bersumber terbuka untuk analisis, di peramban Anda",
  "description": "Stabileo: analisis struktur gratis dan sumber terbuka di peramban. Portal 2D/3D, cangkang, P-Delta, modal dan spektrum; pemeriksaan peraturan berbayar.",
  "eyebrow": "Alternatif SAP2000",
  "lead": "Stabileo adalah perangkat lunak analisis struktur gratis dan bersumber terbuka (AGPL-3.0) yang berjalan di peramban Anda, tanpa pemasangan, kunci lisensi atau akun. Solver ditulis dalam Rust dan dikompilasi ke WebAssembly, sehingga model dihitung di komputer Anda sendiri. Mode Basic memodelkan, membebani, menghitung dan membaca hasil untuk portal dan rangka batang 2D dan 3D; mode PRO menambahkan pelat lantai dan dinding, impor DXF dan IFC, beban peraturan dan pemeriksaan batang. Analisis gratis untuk semua orang; modul desain berbayar, dan gratis untuk universitas.",
  "blocks": [
    {
      "k": "h",
      "t": "Kapan ia menjadi alternatif yang baik"
    },
    {
      "k": "ul",
      "items": [
        "Menganalisis portal, rangka batang dan gedung tanpa membayar lisensi atau memasang apa pun, di sistem operasi apa pun dengan peramban modern.",
        "Memeriksa hasil dari program lain: Stabileo dibandingkan dengan tujuh program elemen hingga lain, dan setiap baris kodenya dapat dibaca.",
        "Mengajar dan belajar: ia menunjukkan metode kekakuan langkah demi langkah.",
        "Memeriksa batang baja dan beton menurut AISC 360, EN 1993-1-1, AISI S100, ACI 318, EN 1992-1-1 dan peraturan CIRSOC Argentina, dalam mode PRO."
      ]
    },
    {
      "k": "h",
      "t": "Kapan belum"
    },
    {
      "k": "ul",
      "items": [
        "Jika Anda memerlukan ragam peraturan desain dan rekam jejak puluhan tahun dari program komersial yang mapan: desain menurut peraturan di Stabileo masih dalam pengembangan.",
        "Jika perusahaan Anda mensyaratkan perangkat lunak yang ditinjau secara independen oleh insinyur berlisensi: tinjauan itu belum terjadi."
      ]
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Cara kami memeriksa hasil, dan di mana pemeriksaan berhenti:"
    }
  ],
  "faqTitle": "Pertanyaan yang sering diajukan",
  "faq": [
    {
      "q": "Apa alternatif gratis terbaik untuk SAP2000?",
      "a": "Tergantung pada untuk apa Anda memakai SAP2000. Untuk analisis portal, rangka batang dan cangkang 2D dan 3D berbasis peramban tanpa apa pun yang perlu dipasang, Stabileo gratis dan bersumber terbuka. Untuk analisis riset nonlinier berskrip, OpenSees adalah pilihan sumber terbuka yang sudah lama."
    },
    {
      "q": "Bisakah saya memakai Stabileo alih-alih membayar lisensi SAP2000 atau ETABS?",
      "a": "Untuk analisis portal, rangka batang dan banyak gedung, dan untuk pemeriksaan batang menurut AISC 360, ACI 318, Eurocode dan CIRSOC, ya. Analisis gratis; modul desain khusus berbayar, dan gratis untuk universitas. Untuk ragam peraturan desain yang lengkap dan rekam jejak produksi yang panjang, program komersial masih menawarkan lebih banyak; desain menurut peraturan di Stabileo masih dalam pengembangan."
    },
    {
      "q": "Apakah Stabileo benar-benar gratis?",
      "a": "Program inti, untuk analisis struktur di browser, bersifat sumber terbuka dan gratis untuk semua orang. Beberapa modul khusus berbayar; universitas mendapatkan modul tersebut secara gratis. Stabileo AI dan komputasi cloud berat dibayar oleh semua orang, termasuk universitas, dengan harga yang menutup biayanya."
    },
    {
      "q": "Apakah berjalan di Mac atau Linux?",
      "a": "Ya. Berjalan di peramban modern mana pun, di sistem operasi apa pun."
    }
  ]
};

export default body;
