import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Alternatif ETABS yang gratis dan bersumber terbuka",
  "description": "Bandingkan Stabileo dengan alur kerja ETABS Anda: analisis peramban gratis, sumber terbuka, bukti verifikasi, batasan saat ini dan impor yang direncanakan.",
  "eyebrow": "Alternatif ETABS yang gratis dan bersumber terbuka",
  "lead": "Stabileo menawarkan analisis struktur gratis dan bersumber terbuka di peramban Anda. Apakah ia cocok dengan alur kerja ETABS Anda bergantung pada analisis dan pemeriksaan yang Anda perlukan; ini bukan klaim kesetaraan fitur.",
  "blocks": [
    {
      "k": "h",
      "t": "Apa yang dicakup Stabileo saat ini"
    },
    {
      "k": "p",
      "t": "Matriks kemampuan solver mencatat analisis statik linier 2D dan 3D, portal dan rangka batang, kombinasi beban dan selubung, P-Delta, tekuk dan analisis modal. Matriks itu juga mendokumentasikan keluarga pelat dan cangkang. Analisis Basic dan PRO tersedia; desain menurut peraturan dan asisten AI masih dalam pengembangan."
    },
    {
      "k": "p",
      "t": "Untuk alur kerja gedung, bedakan kemampuan pelat dan cangkang pada solver dari antarmuka PRO untuk pelat lantai, dinding dan model kompleks. Desain menurut peraturan di PRO masih dalam pengembangan; adanya fitur solver tidak berarti alur kerja desain gedung yang lengkap sudah siap."
    },
    {
      "k": "h",
      "t": "Batasan saat ini"
    },
    {
      "k": "p",
      "t": "Impor model SAP2000/ETABS direncanakan, belum tersedia. Jangan berharap dapat membuka berkas .s2k atau .e2k. Matriks kemampuan mencatat kesenjangan yang tersisa pada ketangguhan nonlinier, kasus portal/cangkang campuran dan validasi model yang lebih besar. Asisten AI sedang dikembangkan, hadir kemudian."
    },
    {
      "k": "h",
      "t": "Bagaimana hasil diverifikasi"
    },
    {
      "k": "p",
      "t": "Tolok ukur yang dipublikasikan, perbandingan dengan implementasi independen, dan pengujian memberikan tingkat bukti yang berbeda. Analisis dan pemeriksaan desain yang didukung dapat membawa batas yang diperiksa mesin; ini tidak mensertifikasi setiap hasil atau model rekayasanya. Matriks kematangan mencantumkan bukti dan masalah terbuka setiap keluarga."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/BENCHMARKS.md#solver-capability-matrix",
      "label": "Kemampuan solver",
      "t": ""
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/MATURITY.md",
      "label": "Kematangan verifikasi",
      "t": ""
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/roadmap/PRODUCT_ROADMAP.md",
      "label": "Peta jalan produk",
      "t": ""
    }
  ],
  "faqTitle": "Sumber dan cakupan",
  "faq": [
    {
      "q": "Apakah ini pengganti lengkap ETABS?",
      "a": "Tidak ada klaim kesetaraan fitur demi fitur. Tinjau kemampuan dan batasan yang didokumentasikan untuk proyek Anda. ETABS disebut hanya untuk mengidentifikasi alur kerja yang dibandingkan; tidak ada afiliasi atau dukungan yang tersirat."
    }
  ]
};

export default body;
