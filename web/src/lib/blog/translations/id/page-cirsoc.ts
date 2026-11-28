import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Pemeriksaan desain CIRSOC di peramban Anda: apa yang tersedia dan apa yang belum",
  "description": "Stabileo memeriksa beton (CIRSOC 201) dan baja (CIRSOC 301, eksperimental) serta membangkitkan beban CIRSOC 101–104 di peramban. Apa yang tersedia dan belum.",
  "eyebrow": "CIRSOC",
  "lead": "Stabileo adalah perangkat lunak analisis struktur sumber terbuka yang memeriksa batang beton bertulang menurut CIRSOC 201 (edisi 2025) dan batang baja menurut CIRSOC 301-2018, serta membangkitkan beban dan kombinasi menurut CIRSOC 101-2025, 102-2025, INPRES-CIRSOC 103-2018 (Bagian I) dan CIRSOC 104-2005, peraturan struktur Argentina. Perangkat ini memakai model dan solver yang sama dengan yang Anda pakai untuk menganalisis, berjalan di peramban dan tidak perlu dipasang. Analisis gratis untuk semua orang. Desain menurut peraturan ada di PRO; masih dalam pengembangan, berbayar, dan gratis untuk universitas.",
  "blocks": [
    {
      "k": "h",
      "t": "Apa yang tersedia, dan seberapa jauh diverifikasi"
    },
    {
      "k": "p",
      "t": "Tersertifikasi berarti setiap hasil membawa batas galat numeriknya yang dihitung dengan aritmetika interval; itu tidak berarti modelnya benar atau bahwa seorang insinyur telah meninjaunya. Contoh yang dipublikasikan adalah contoh hitungan INTI-CIRSOC."
    },
    {
      "k": "table",
      "caption": "Apa yang diperiksa Stabileo terhadap CIRSOC saat ini, dengan tingkat verifikasi setiap bagiannya.",
      "head": [
        "Peraturan",
        "Apa yang dilakukannya",
        "Status"
      ],
      "rows": [
        [
          "CIRSOC 201 — beton bertulang",
          "Balok dan kolom: lentur, kombinasi aksial dan lentur, geser dan tulangan minimum; penampang, diagram interaksi dan pelat dari mesin",
          "Tersedia di PRO. Lentur dan geser balok tersertifikasi; kombinasi aksial dan lentur serta pelat diuji, belum tersertifikasi. 3 dari 5 pasal diperiksa terhadap contoh INTI-CIRSOC 201-2005"
        ],
        [
          "CIRSOC 201-2025 — detailing",
          "Penjangkaran, pengendalian retak, jarak dan tata letak batang tulangan",
          "Tersedia di PRO. Diuji"
        ],
        [
          "CIRSOC 301-2018 — baja",
          "Tarik, tekan (tekuk lentur dan tekuk lentur-torsi), lentur dan geser",
          "Tersedia, berlabel eksperimental sampai ada tinjauan independen. Tersertifikasi; 10 dari 14 pasal diperiksa terhadap contoh INTI-CIRSOC 301-2018"
        ],
        [
          "CIRSOC 301-2018 J — sambungan",
          "Las sudut dan sambungan baut",
          "Dalam pengembangan; 2 dari 4 pasal diperiksa terhadap contoh yang dipublikasikan"
        ],
        [
          "CIRSOC 201 — pondasi telapak",
          "Tekanan tanah, geser, geser pons dan lentur",
          "Dalam pengembangan; dibandingkan dengan implementasi kedua"
        ],
        [
          "CIRSOC 101-2025 — beban dan kombinasi",
          "Tujuh kombinasi dari §2.3.2, beban mati dan beban hidup",
          "Yang sudah diimplementasikan diverifikasi pasal demi pasal terhadap teks resmi; es, peristiwa luar biasa dan beberapa ketentuan belum tercakup"
        ],
        [
          "CIRSOC 102-2025 — angin",
          "Tekanan dan kombinasi layan",
          "Yang sudah diimplementasikan diverifikasi terhadap teks resmi; beberapa kasus belum tercakup"
        ],
        [
          "INPRES-CIRSOC 103-2018 Bagian I — gempa",
          "Spektrum, metode menurut zona, berat seismik dan kombinasi seismik",
          "Yang sudah diimplementasikan diverifikasi; beberapa ketentuan belum tercakup"
        ],
        [
          "CIRSOC 104-2005 — salju",
          "Beban salju menurut lokasi",
          "Diverifikasi terhadap tabel"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Cara kerjanya"
    },
    {
      "k": "ul",
      "items": [
        "Satu model: Anda menggambar atau mengimpor struktur (DXF, IFC atau templat Excel) dan pemeriksaan memakai gaya yang sama dengan analisis, tanpa ada yang disalin manual ke lembar kerja lain.",
        "Beban dan kombinasi menurut CIRSOC 101, 102, 103 dan 104 dibangkitkan dari data proyek.",
        "Setiap batang berakhir dengan rasio kebutuhan/kapasitasnya dan pasal penentu, dan setiap langkah dapat diperiksa.",
        "Solver berjalan di komputer Anda: model tidak dikirim ke server mana pun untuk dihitung. Kodenya terbuka (AGPL-3.0).",
        "Model yang sama selalu memberi angka yang sama, dan setiap laporan mencatat versi dan data yang menghasilkannya."
      ]
    },
    {
      "k": "link",
      "slug": "verificacion-flexion-cirsoc-201",
      "t": "Contoh hitungan langkah demi langkah, dengan model untuk dibuka di editor:"
    },
    {
      "k": "h",
      "t": "Cara kami memvalidasinya, dan di mana validasi berhenti"
    },
    {
      "k": "ul",
      "items": [
        "Pemeriksaan desain dibandingkan pasal demi pasal dengan contoh hitungan INTI-CIRSOC, dan bebannya dengan teks resmi; setiap perbedaan didokumentasikan beserta penyebabnya.",
        "Analisis dibandingkan dengan tujuh program elemen hingga lainnya.",
        "Belum ada tinjauan independen oleh insinyur struktur berlisensi, dan baja masih berlabel eksperimental.",
        "Tidak ada program yang memeriksa modelnya: beban, tumpuan dan idealisasi adalah keputusan insinyur."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Ketika kami menemukan cacat yang dapat memengaruhi hasil yang sudah dipakai, kami mempublikasikannya beserta apa yang perlu diperiksa ulang:"
    }
  ],
  "faqTitle": "Pertanyaan yang sering diajukan",
  "faq": [
    {
      "q": "Perangkat lunak apa yang memeriksa desain struktur menurut peraturan CIRSOC?",
      "a": "Stabileo memeriksa beton bertulang menurut CIRSOC 201 dan baja menurut CIRSOC 301-2018 (berlabel eksperimental), serta membangkitkan beban dan kombinasi menurut CIRSOC 101-2025, 102-2025, INPRES-CIRSOC 103-2018 dan CIRSOC 104-2005. Perangkat ini bersumber terbuka, berjalan di peramban dan menawarkan modul desain berbayar, gratis untuk universitas."
    },
    {
      "q": "Apakah Stabileo gratis untuk pemeriksaan CIRSOC?",
      "a": "Program inti, untuk analisis struktur di browser, bersifat sumber terbuka dan gratis untuk semua orang. Beberapa modul khusus berbayar; universitas mendapatkan modul tersebut secara gratis. Stabileo AI dan komputasi cloud berat dibayar oleh semua orang, termasuk universitas, dengan harga yang menutup biayanya."
    },
    {
      "q": "Bisakah saya memakai Stabileo untuk perhitungan yang akan saya tandatangani?",
      "a": "Tanggung jawab atas sebuah desain ada pada insinyur yang menandatangani, dengan program apa pun. Stabileo mempublikasikan apa yang sudah diverifikasi dan sampai tingkat apa; Stabileo belum pernah ditinjau secara independen oleh insinyur berlisensi dan baja berlabel eksperimental, jadi periksalah batang penentu secara manual."
    },
    {
      "q": "Edisi CIRSOC 201 yang mana yang dipakainya?",
      "a": "Edisi 2025. Edisi 2005 dapat dipilih pada peraturan proyek untuk proyek yang lebih lama, tetapi desain balok dan kolom dengan edisi itu belum tersedia. Pemeriksaan mesin dibandingkan dengan contoh hitungan INTI-CIRSOC 201-2005."
    }
  ]
};

export default body;
