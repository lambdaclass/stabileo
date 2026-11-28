import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.5.0: 23 pemberitahuan lagi; tiap hasil keliru yang terbuka kini diperingatkan atau ditolak",
  "excerpt": "Perubahan sejak 0.4.0: dua puluh tiga cacat yang dapat memberi hasil keliru atau tidak konservatif, ditulis sebagai pemberitahuan keselamatan dan semuanya diperbaiki kecuali satu; peringatan atau penolakan untuk setiap cacat yang masih terbuka; dan kursus langkah demi langkah di Basic.",
  "blocks": [
    {
      "k": "p",
      "t": "Sejak 0.4.0 kami terus memeriksa Stabileo dari beberapa sisi sekaligus: solver terhadap solusi yang dipublikasikan dan program lain, pemeriksaan desain terhadap contoh hitungan, struktur yang sama setelah dinomori ulang, diskalakan ulang dan dipindahkan, serta berkas yang disimpan oleh rilis-rilis sebelumnya. Dari situ ditemukan dua puluh tiga cacat lagi yang dapat memberi hasil keliru atau tidak konservatif. Setiap cacat memiliki pemberitahuan keselamatan yang menjelaskan apa yang salah, siapa yang terdampak, dan apa yang perlu diperiksa ulang. Dua puluh dua sudah diperbaiki; keruntuhan plastis 2D (SA-2026-044) tetap ditolak sampai #758 diperbaiki."
    },
    {
      "k": "note",
      "t": "stabileo.com menerbitkan setiap perubahan segera setelah digabungkan, sehingga sebagian besar perbaikan ini sudah aktif, masing-masing sejak hari penggabungannya. Proyek yang disimpan sebelum perubahan yang menyangkutnya akan meminta pemeriksaan ulang saat dibuka, dalam bahasa pembaca. Dua perbaikan tidak dapat melakukannya: model 2D yang dipotong dari 3D sebelum #1295 terbuka tanpa pemberitahuan, karena modelnya sendiri yang salah (SA-2026-035). Potong ulang dari 3D, atau hitung dalam 3D. Hal yang sama berlaku untuk persegi panjang atau tabung yang diimpor dari Excel atau IFC sebelum #1310 (SA-2026-039): impor ulang."
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic membuka portal bidang dari contoh, disimpan sebagai sudah dihitung dengan versi hasil 15. Sebuah dialog berjudul “Hasil telah berubah sejak proyek ini terakhir dihitung” mencantumkan perubahan yang menyangkutnya, di antaranya perbaikan tekuk 2D untuk batang dengan gaya aksial yang bervariasi dan nilai penentu yang dibaca pada puncak sebenarnya, masing-masing dengan penjelasannya, dan meminta Anda mencentang “Saya sudah membaca perubahan ini” sebelum melanjutkan atau menjalankan ulang analisis.",
      "caption": "Proyek yang disimpan sebelum perubahan yang menyangkutnya akan meminta pemeriksaan ulang saat dibuka, dan mencantumkan setiap perubahan."
    },
    {
      "k": "h",
      "t": "Jalankan ulang proyek Anda"
    },
    {
      "k": "p",
      "t": "Inilah kasus-kasus yang paling banyak menggeser hasil desain. Setiap pemberitahuan keselamatan memuat kasus hitungannya dan apa yang harus dilakukan terhadap hasil yang sudah Anda serahkan."
    },
    {
      "k": "table",
      "caption": "Beberapa perbaikan 0.5.0, sebagaimana didokumentasikan dalam setiap pemberitahuan keselamatan, beserta versi hasil yang membawanya; SA-2026-035 tidak memilikinya, sehingga pemberitahuannya adalah satu-satunya informasi.",
      "head": [
        "Pemberitahuan",
        "Versi hasil",
        "Apa yang salah",
        "Tingkat keparahan"
      ],
      "rows": [
        [
          "SA-2026-029",
          "7",
          "Pemeriksaan desain 3D membaca momen atau gaya geser lateral: kolom CIRSOC 201 yang melentur terhadap Mz diperiksa sepanjang tingginya, tulangan 36 % terlalu sedikit pada sebuah contoh",
          "Kritis"
        ],
        [
          "SA-2026-028",
          "8",
          "Lentur EN 1992-1-1 mengasumsikan baja tarik leleh: MRd hingga 22 % terlalu tinggi",
          "Tinggi"
        ],
        [
          "SA-2026-030",
          "12",
          "Tekan CIRSOC 301: penampang dengan Qa ≤ 0 mendapat kapasitas di atas beban leleh penuhnya, dan dinyatakan memenuhi",
          "Tinggi"
        ],
        [
          "SA-2026-041",
          "19",
          "Pemeriksaan kolom beton bertulang hanya memasangkan momen terbesar dengan tekan terbesar: hingga 15 % tidak konservatif pada sebuah contoh",
          "Tinggi"
        ],
        [
          "SA-2026-042",
          "23",
          "Tekuk 2D melebihkan faktor batang yang tekannya bertambah sepanjang batang: +43 % hingga +68 % untuk satu batang",
          "Tinggi"
        ],
        [
          "SA-2026-038",
          "35",
          "Tekuk 3D memakai gaya aksial rata-rata setiap batang: +43 % pada faktor satu batang yang dibebani sepanjangnya",
          "Tinggi"
        ],
        [
          "SA-2026-043",
          "32",
          "Analisis harmonik kehilangan koreksi ragam yang diabaikan ketika satu ragam jauh lebih lunak daripada yang lain: meleset 79 kali pada 2,3 Hz dalam sebuah contoh",
          "Tinggi"
        ],
        [
          "SA-2026-035",
          "—",
          "Pemotongan 3D ke 2D melentur batang terhadap sumbu penampang yang salah: portal Y–Z menjadi 13,5 kali terlalu kaku",
          "Tinggi"
        ],
        [
          "SA-2026-033",
          "20",
          "Pembangkit beban melewatkan seluruh beban merata lantai ketika satu batang rendah berdiri di atas sebagian lantai itu",
          "Tinggi"
        ],
        [
          "SA-2026-027",
          "11",
          "Selubung cangkang menyimpan kombinasi dengan Von Mises terbesar, bukan nilai ekstrem setiap komponen: mx 14 % terlalu rendah dalam sebuah contoh",
          "Tinggi"
        ],
        [
          "SA-2026-047",
          "49",
          "Pada model dengan cangkang, kasus beban yang memberikan perpindahan tumpuan kehilangan seluruh tegangan cangkangnya, sehingga kombinasi dan selubung hanya menjumlahkan tegangan cangkang dari kasus lain: tegangan cangkang kombinasi dapat tidak konservatif, tanpa peringatan. Pada 0.2.0, 0.3.0 dan 0.4.0 (#1676)",
          "Tinggi"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Setiap proyek dengan cangkang yang dihitung sebelum #1676 menyebut SA-2026-047 saat dibuka (#1691): sebagai terdampak ketika model memiliki kasus beban yang memberikan perpindahan tumpuan dan kombinasi beban, dan selain itu sebagai mungkin terdampak, karena proyek yang tersimpan tidak dapat menunjukkan bahwa ia tidak pernah memiliki kasus beban seperti itu. Menghitung ulang akan menghapus pemberitahuan; setelah itu bandingkan tegangan cangkang dari kombinasi yang memuat kasus tersebut."
    },
    {
      "k": "p",
      "t": "Pemberitahuan lainnya mencakup batang beton dengan torsi menurut ACI 318 dan EN 1992 (SA-2026-040), kekangan model yang dipotong ke 2D dari bidang Y–Z atau X–Y (SA-2026-036), analisis korotasional 3D dengan rotasi besar (SA-2026-037), beban pada t = 0 di titik simpul tanpa massa dalam riwayat waktu (SA-2026-031), ragam nol dari sebuah mekanisme dalam analisis modal (SA-2026-032), pemeriksaan keseimbangan laporan setelah analisis (SA-2026-034), keruntuhan plastis 2D, yang tetap ditolak sampai #758 diperbaiki (SA-2026-044), keruntuhan plastis 3D dengan batang yang tidak memiliki momen plastis yang dapat dipakai, kini ditolak (SA-2026-045), analisis harmonik yang memilih antara superposisi modal dan penyelesaian langsung untuk setiap beban, sehingga superposisi rusak (SA-2026-046), persegi panjang dan tabung yang diimpor dari Excel atau IFC dengan Iy dan Iz tertukar (SA-2026-039) dan, bagi yang memanggil mesin secara langsung, geser baja tanpa luas geser menurut AISC 360 dan EN 1993 (SA-2026-025 dan 026)."
    },
    {
      "k": "h",
      "t": "Perubahan lain yang menggeser hasil"
    },
    {
      "k": "p",
      "t": "Perubahan lain juga menggeser angka, sehingga masing-masing tercantum dalam pemberitahuan pemeriksaan ulang; sebagian besar tidak memiliki pemberitahuan keselamatan sendiri, dan ragam nol modal adalah SA-2026-032 di atas:"
    },
    {
      "k": "ul",
      "items": [
        "Nilai penentu sebuah batang dan selubung 2D membaca puncak sebenarnya dari diagram, bukan yang terdekat dari 21 titik tinjau: nilainya dapat naik, sebesar 0,23 % di bawah beban segitiga dan 1,05 % di bawah beban sebagian yang pendek pada kasus yang didokumentasikan, dan tidak pernah turun.",
        "Mekanisme ditolak alih-alih dihitung: di belakang penghubung kaku atau diafragma dalam 2D, di belakang konektor dalam 2D (#1415), dan dalam analisis modal, yang dahulu membuang ragam nol dan mengembalikan ragam lainnya seolah lengkap, termasuk mekanisme yang meluncur sepanjang tumpuan miring.",
        "Analisis nonlinier material 3D menghitung portal dengan dan tanpa konstanta pilin secara berdampingan, serta titik simpul yang hanya dicapai oleh rangka batang, alih-alih mogok atau menolaknya; model yang dahulu terhitung memberi angka yang sama.",
        "Nilai eigen berulang mempertahankan multiplisitasnya, dan hasil statik serta modal memeriksa keseimbangan dan ortogonalitasnya sendiri sebelum ditampilkan.",
        "Di Basic, P-Δ dan beban kritis membagi setiap batang menjadi elemen, keruntuhan plastis menutup sendi yang melepas beban, dan garis pengaruh momen lentur memakai momen positif pada serat bawah tertarik, seperti setiap momen lain di Basic.",
        "Pemeriksaan desain yang tidak dapat dievaluasi ditolak alih-alih dinyatakan memenuhi, dan rotasi titik simpul yang lunak tetapi nyata tidak lagi dikunci ketika model memiliki bagian yang jauh lebih kaku.",
        "Analisis linier memberi peringatan ketika rotasi melewati 0,1 rad, juga di dalam bentang batang (termasuk kemiringan yang ditambahkan deformasi geser pada sumbunya dan kelengkungan gradien termal pada ujung yang dilepas, #1569) dan pada perpindahan kombinasi itu sendiri, dan ketika tekan dapat memperbesar momennya lebih dari 10 %; selama peringatan kedua itu tampil, pemeriksaan CIRSOC 301 ditahan. Bila rotasi diperingatkan, jalankan analisis nonlinier geometri (rotasi besar); bila amplifikasi diperingatkan, analisis P-Δ atau orde kedua lainnya."
      ]
    },
    {
      "k": "h",
      "t": "Diperingatkan atau ditolak, sampai setiap perbaikan tersedia"
    },
    {
      "k": "p",
      "t": "Setiap masalah terbuka yang dapat memberi hasil keliru kini memiliki peringatan atau penolakan di setiap tempat ia dapat sampai ke insinyur (#807). Peringatan mempertahankan hasil dan menyebut masalahnya di sampingnya; penolakan menahan hasil dan menjelaskan alasannya. Sebuah daftar catatan di repositori mencantumkan setiap masalah keselamatan terbuka beserta peringatan atau penolakannya, kondisi yang memicunya, dan pengujian yang membuktikan ia berfungsi, dan sebuah pengujian menjaganya tetap selaras dengan mesin."
    },
    {
      "k": "ul",
      "items": [
        "Ditolak: faktor keruntuhan plastis 2D, yang dapat berubah hingga 4,6 kali menurut penomoran, arah batang dan satuan (#758); faktor tekuk di luar batas sertifikatnya sendiri (#741); cangkang MITC4 pada mesh terdistorsi di bawah lentur dalam bidang yang signifikan (#798); dan cangkang MITC4 dan MITC9 pada geometri terpuntir (#1057).",
        "Diperingatkan: antara lain riwayat waktu, superposisi modal 3D, model nyaris singular, kontak, analisis nonlinier material dan konektor dengan kekakuan tidak sama.",
        "Selain apa yang ditolaknya, pembatasan ini mengubah satu angka: reaksi 2D dari tumpuan yang mengalami penurunan dan juga memikul pegas pada arah penurunan itu kini mencakup gaya pegas tersebut. Setiap nilai lain dari 145.515 pada korpus hasil identik."
      ]
    },
    {
      "k": "note",
      "t": "Dua penolakan menyingkirkan hasil yang dipakai sebagian pembaca. Faktor keruntuhan plastis portal bidang ditahan sampai #758 diperbaiki. Beberapa mesh cangkang terdistorsi yang hasilnya berada dalam 2 % dari acuannya juga ditahan: kami memilih kelebihan satu penolakan daripada kekakuan keliru yang ditampilkan tanpa peringatan, dan penyempitannya ada dalam peta jalan."
    },
    {
      "k": "h",
      "t": "Juga di 0.5.0"
    },
    {
      "k": "ul",
      "items": [
        "Basic mengajarkan analisis struktur langkah demi langkah: statika, metode gaya dan metode perpindahan, garis pengaruh, orde kedua dan tekuk, analisis plastis serta dinamika, masing-masing dijelaskan langkah demi langkah di dalam aplikasi. Unit keruntuhan plastisnya ditahan bersama seluruh keruntuhan plastis 2D sampai #758 diperbaiki.",
        "Bahasa Jerman, Prancis, dan Turki ditawarkan kembali.",
        "Asisten AI bekerja dengan kunci Anthropic atau OpenAI Anda sendiri, yang disimpan hanya di peramban Anda, dan /tools memiliki model langsung yang dihitung ulang oleh mesin saat penggeser digerakkan.",
        "PRO: tingkat master dan tingkat serupa, hasil pelat per satuan lebar dengan momen utama dan arahnya, laporan setelah analisis, penampil baca-saja dengan “Duplikat dan edit”, dan IFC tertaut yang digambar sebagai acuan 3D.",
        "Berkas yang disimpan oleh 0.2.0, 0.3.0 dan 0.4.0 terbuka, bermigrasi dan memberi hasil yang sama pada setiap perubahan, kecuali bila perubahan hasil terdaftar berlaku; berkas yang disimpan oleh versi yang lebih baru ditolak dengan pesan yang menyatakannya.",
        "Struktur yang sama setelah diskalakan ulang, dinomori ulang, dibalik atau dipindahkan harus memberi jawaban yang sama, diperiksa pada 17 jenis analisis di setiap perubahan dan pada 8.192 model yang dibangkitkan setiap malam.",
        "Juga diperbaiki: interaksi tanah-struktur melaporkan reaksi tumpuannya, yang dahulu dikembalikan kosong (#1675); cangkang dari dua keluarga yang bernomor sama ditolak oleh kombinasi dan selubung alih-alih salah satunya digabungkan sebagai pengganti yang lain (#1669); dan tegangan von Mises serta tegangan utama cangkang tidak lagi meluap atau kurang pada besaran ekstrem, dengan hasil pada rentang normal identik bit demi bit (#1688).",
        "Proyek yang dihitung dengan versi yang memiliki bug hasil keliru yang diketahui pada fitur yang dipakainya menyebut pemberitahuan keselamatan itu sampai dihitung ulang (#1657), dan proyek mencatat setiap analisis yang dijalankannya, sehingga pemberitahuan tentang satu analisis tetap ada sampai analisis itu dijalankan lagi (#1663).",
        "Lebih cepat: simpan otomatis 30 s melewati proyek yang tidak berubah (#1664), ruang kerja 3D besar terbuka kembali dengan lebih sedikit sampah memori yang harus dikumpulkan (#1668), dan hasil 3D yang dipublikasikan dibekukan sehingga pemeriksaan penolakan masalah-yang-diketahui berjalan sekali per hasil (#1689).",
        "Lebih banyak pemeriksaan mesin: resiprositas dengan momen, kombinasi berfaktor, dan superposisi setiap komponen tegangan cangkang (#1665), serta satu catatan hasil per titik simpul, tumpuan, elemen dan cangkang untuk setiap analisis (#1674), yang menemukan cacat SSI dan kombinasi cangkang di atas.",
        "Stabileo Research dan Stabileo Tools: reproduksi yang dapat dijalankan dari makalah dan tolok ukur yang dipublikasikan, direvisi setelah tinjauan tiga penelaah, dan kalkulator gratis yang berjalan di mesin yang sama."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Cara kerja pemberitahuan keselamatan, dan dua puluh empat yang pertama:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Indeks pemberitahuan keselamatan",
      "t": "Setiap pemberitahuan keselamatan, dengan tingkat keparahan, masalah dan perbaikannya:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/CHANGELOG.md",
      "label": "Log perubahan",
      "t": "Catatan teknis lengkap:"
    }
  ]
};

export default body;
