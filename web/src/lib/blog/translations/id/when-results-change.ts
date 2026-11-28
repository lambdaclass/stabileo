import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Ketika hasil berubah: versi hasil, pemeriksaan ulang, dan pemberitahuan",
  "excerpt": "Cara Stabileo memberi tahu Anda proyek mana yang berkaitan dengan suatu perbaikan, cara ia menahan hasil yang diketahui dapat keliru sampai perbaikannya ada, dan cara perbaikan dipublikasikan, dengan empat belas versi hasil yang digabungkan pada 4 dan 5 November.",
  "blocks": [
    {
      "k": "p",
      "t": "Setiap perbaikan pada solver struktur mengubah angka yang mungkin sudah dipakai seseorang. Faktor tekuk yang terlalu tinggi kini lebih rendah; model yang dulu dapat dihitung kini ditolak. Perbaikan yang sampai ke aplikasi secara diam-diam meninggalkan angka lama pada perhitungan yang sudah diserahkan, dan insinyur yang membuatnya tidak punya alasan untuk memeriksa lagi."
    },
    {
      "k": "p",
      "t": "Tulisan ini menjelaskan apa yang dilakukan Stabileo mengenai hal itu, sejak cacat ditemukan hingga perbaikannya dipublikasikan. Contohnya nyata: pada 4 dan 5 November 2026, empat belas versi hasil, 16 sampai 29, sampai ke stabileo.com."
    },
    {
      "k": "h",
      "t": "Apa itu versi hasil"
    },
    {
      "k": "p",
      "t": "Versi hasil adalah bilangan bulat, terpisah dari versi aplikasi. Angkanya naik satu setiap kali sebuah perubahan sampai ke situs yang membuat model tersimpan yang sama memberikan angka berbeda, atau menolak model yang dulu dapat dihitung. Setiap perubahan semacam itu dicatat beserta:"
    },
    {
      "k": "ul",
      "items": [
        "versi tempatnya masuk, tanggalnya, dan pull request-nya;",
        "model mana yang berkaitan, ditulis sebagai fitur model: model bidang dengan kekangan, analisis tekuk 2D dengan beban sepanjang batang, batang beton yang diperiksa menurut CIRSOC 201;",
        "judul dan penjelasan untuk insinyur dalam masing-masing dari enam bahasa aplikasi, beserta apa yang perlu diperiksa ulang;",
        "tautan ke uraian lengkap: pemberitahuan, catatan perubahan hasil, atau log perubahan."
      ]
    },
    {
      "k": "p",
      "t": "Setiap perhitungan memberi cap pada proyek dengan versi hasil yang menghasilkannya, bersama versi aplikasi, commit, versi mesin, hash biner mesin, dan analisis yang dijalankan. Cap itu menyertai proyek: berkas tersimpan, simpan otomatis, tab yang terbuka, atau tautan bersama semuanya membawanya."
    },
    {
      "k": "note",
      "t": "Versi hasil tidak pernah dipakai ulang. Setiap penggabungan ke cabang utama di-deploy dan memberi cap pada apa yang dihitungnya dengan versi saat itu, sehingga entri yang ditambahkan ke versi yang sudah ada di situs tidak akan pernah sampai ke proyek yang diberi cap oleh versi itu. Sebuah pengujian gagal pada penambahan semacam itu."
    },
    {
      "k": "h",
      "t": "Mengapa sebuah versi berubah"
    },
    {
      "k": "p",
      "t": "Sebagian besar perubahan adalah perbaikan: hasil yang tadinya salah kini benar. Sebagian adalah penolakan: model yang dulu memberikan angka kini memberikan pesan yang jelas, karena angka itu tidak bermakna. Dan sebuah versi juga dapat membatalkan: versi 15 menarik tiga perubahan versi 14 yang perbaikan tinjauannya tidak sampai ke situs bersama mereka, dan versi 27 sampai 29 mengembalikannya, setelah ditinjau. Proyek yang dihitung dengan versi 14 diberi tahu tentang keduanya."
    },
    {
      "k": "table",
      "caption": "Versi hasil 16 sampai 29, digabungkan pada 4 dan 5 November 2026.",
      "head": [
        "Versi",
        "Perubahan",
        "Jenis"
      ],
      "rows": [
        [
          "16",
          "Aluminium: geser sumbu lemah diperiksa",
          "Perbaikan"
        ],
        [
          "17",
          "Sambungan baja: momen sumbu lemah tidak lagi diabaikan",
          "Penolakan"
        ],
        [
          "18",
          "ACI 318 dan EN 1992: batang beton dengan torsi ditandai tidak diperiksa",
          "Penolakan"
        ],
        [
          "19",
          "Kolom beton bertulang juga diperiksa pada tekan terkecilnya (SA-2026-041)",
          "Perbaikan"
        ],
        [
          "20",
          "Generator beban: lantai yang sebagian berada di bawah struktur atap rendah tetap mendapat beban luasnya (SA-2026-033)",
          "Perbaikan"
        ],
        [
          "21",
          "Gambar cangkang yang diekspor menampilkan bidang dan skala layar",
          "Perbaikan"
        ],
        [
          "22",
          "2D: mekanisme di balik hubungan kaku atau diafragma ditolak",
          "Penolakan"
        ],
        [
          "23",
          "Tekuk 2D pada batang yang gaya aksialnya berubah sepanjang batang (SA-2026-042)",
          "Perbaikan"
        ],
        [
          "24",
          "Analisis korotasional 3D dengan rotasi besar terhadap beberapa sumbu (SA-2026-037)",
          "Perbaikan"
        ],
        [
          "25",
          "Kekangan model 2D yang dipotong dari bidang Y–Z atau X–Y (SA-2026-036)",
          "Perbaikan"
        ],
        [
          "26",
          "Nilai penentu suatu batang dan selubung 2D membaca puncak yang sebenarnya",
          "Perbaikan"
        ],
        [
          "27–29",
          "Tiga perubahan Basic yang ditarik oleh versi 15 kembali, setelah ditinjau: keruntuhan plastis, P-Δ, dan tanda garis pengaruh momen",
          "Perbaikan"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Pemberitahuan pemeriksaan ulang"
    },
    {
      "k": "p",
      "t": "Ketika proyek dibuka, aplikasi membandingkan capnya dengan registri dan mencantumkan perubahan yang dibuat sejak itu yang berkaitan dengan model tersebut. Portal bidang dengan analisis tekuk diberi tahu tentang perbaikan tekuk 2D; portal baja tanpa beton tidak diberi tahu tentang pemeriksaan kolom beton bertulang. Daftar itu bukan toast yang hilang: pemberitahuan tidak punya tombol tutup, mengabaikan Escape dan klik di luarnya, dan hanya ditutup dengan mencentang “Saya telah membaca perubahan ini” lalu memilih untuk melanjutkan atau menghitung ulang."
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic membuka portal bidang dari contoh, tersimpan sebagai sudah dihitung dengan versi hasil 15. Sebuah dialog berjudul “Hasil telah berubah sejak proyek ini terakhir dihitung” mencantumkan perubahan yang berkaitan dengannya, antara lain perbaikan tekuk 2D untuk batang yang gaya aksialnya berubah dan nilai penentu yang dibaca pada puncak sebenarnya, masing-masing dengan penjelasannya, dan meminta Anda mencentang “Saya telah membaca perubahan ini” sebelum melanjutkan atau menghitung ulang analisis.",
      "caption": "Portal bidang yang dihitung dengan versi 15, dibuka hari ini: hanya perubahan yang berkaitan dengan model ini yang dicantumkan, masing-masing dengan apa yang perlu diperiksa ulang."
    },
    {
      "k": "p",
      "t": "Sampai model dihitung lagi, hasilnya ditandai kedaluwarsa: sebuah spanduk menyatakannya, dan setiap laporan, buku kerja, dan CSV yang diekspor sementara itu mencetak peringatan STALE pada asal-usulnya. “Hitung ulang analisis dan desain” menghitung lagi dan, di PRO, memeriksa ulang batang beton dengan tulangan yang sudah dipilih; ia tidak mendesain ulang batang tersebut, karena itu akan menimpa tulangan pilihan insinyur."
    },
    {
      "k": "p",
      "t": "Sejak 4 November (#1406) pemberitahuan menjelaskan setiap perubahan dalam bahasa pembaca pada keenam bahasa aplikasi. Sebelumnya, pembaca bahasa Jerman, Prancis, dan Turki mendapat judul dan penjelasan dalam bahasa Inggris: 66 dari 72 perubahan terdaftar tidak memiliki teks dalam bahasa tersebut. Setiap terjemahan diperiksa dengan menerjemahkannya kembali ke bahasa Inggris tanpa teks asli dan membandingkan maknanya: angka, tanda, beban mana, pemeriksaan mana, sisi aman atau tidak aman. Pemeriksaan itu mengoreksi kalimat pada ketiga bahasa, dan menunjukkan bahwa empat penjelasan bahasa Inggris ambigu pada sumbernya; keempatnya diperbaiki dalam keenam bahasa."
    },
    {
      "k": "h",
      "t": "Sebelum perbaikan: peringatkan atau tolak"
    },
    {
      "k": "p",
      "t": "Cacat biasanya ditemukan sebelum diperbaiki, kadang beberapa hari sebelumnya. Selama waktu itu hasil yang terpengaruh masih ada di layar. Aturan yang kami ikuti adalah menanganinya dulu dan memperbaikinya kemudian (isu #447): setiap cacat terbuka yang dapat memberikan hasil keliru mendapat, pada setiap titik masuk yang dipengaruhinya, peringatan atau penolakan."
    },
    {
      "k": "ul",
      "items": [
        "Peringatan mempertahankan hasil dan menampilkan, di sampingnya, masalah diketahui mana yang mungkin memengaruhinya dan apa yang perlu diperiksa secara manual.",
        "Penolakan menahan hasil dan menyatakan alasannya, ketika angka dapat keliru dengan faktor besar tanpa cara untuk menyadarinya dari keluaran, seperti faktor yang berubah beberapa kali lipat menurut penomoran batang."
      ]
    },
    {
      "k": "img",
      "base": "blog/results-refusal",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic dengan contoh mekanisme tersembunyi: balok dua bentang pada tiga tumpuan yang semuanya bergerak rol secara horizontal, di bawah beban merata 10 kN/m. Setelah Hitung, tidak ada diagram yang digambar; sebuah pesan merah di sudut menyatakan “Struktur tidak stabil (mekanisme): tidak ada kekangan horizontal pada tumpuan mana pun.” dengan tombol untuk melihat analisis kinematik.",
      "caption": "Aturan yang sama di luar buku catatan: model yang merupakan mekanisme mendapat pesan yang menyatakan alasannya, dan tanpa angka."
    },
    {
      "k": "p",
      "t": "Penanganan dicatat dalam sebuah buku catatan yang mencantumkan setiap masalah keselamatan terbuka, peringatan atau penolakannya, kondisi yang memicunya, dan pengujian yang menunjukkan bahwa ia aktif, atau bukti bahwa tidak diperlukan penanganan. Sebuah pengujian menjaga buku catatan dan daftar masalah diketahui mesin tetap selaras, dan pekerjaan terjadwal membandingkan buku catatan dengan isu yang terbuka di GitHub. Kondisinya sengaja sempit: pada 39 model korpus hasil, setiap peringatan aktif pada paling banyak dua. Pull request yang melengkapi buku catatan ini untuk setiap isu terbuka (#807) masuk pada 5 November, sebelum rilis 0.5.0."
    },
    {
      "k": "p",
      "t": "Penanganan berakhir ketika perbaikannya masuk, dan berakhir dalam pull request yang sama. Minggu ini #1295 menghapus penolakan potongan 3D ke 2D yang melenturkan batang terhadap sumbu yang salah, karena potongannya kini benar; #1301 mengganti peringatan pada setiap perhitungan korotasional 3D dengan peringatan yang aktif hanya ketika ujung batang berputar lebih dari 0,02 rad terhadap tali busurnya, tempat pendekatan yang tersisa dapat berarti."
    },
    {
      "k": "h",
      "t": "Perbaikan minggu ini"
    },
    {
      "k": "p",
      "t": "Tekuk 2D dengan beban aksial sepanjang batang (#1324, versi 23). Kekakuan geometrik setiap batang memakai gaya aksial rata-ratanya. Di tempat tekan membesar menuju ujung yang paling banyak berputar, seperti akibat gravitasi pada balok atap atau beban titik aksial di dalam bentang, faktor tekuk menjadi terlalu tinggi dan tidak ada yang memperingatkannya. Setiap batang kini mengintegrasikan gaya aksialnya yang berubah."
    },
    {
      "k": "table",
      "caption": "Satu batang, λP·L²/EI. Sumber: SA-2026-042.",
      "head": [
        "Kasus",
        "Eksak",
        "Sebelum",
        "Sekarang"
      ],
      "rows": [
        [
          "Kantilever, tekan naik dari 0 di tumpuan menjadi P di ujung",
          "3.477",
          "4.972 (+43 %)",
          "3.542 (+1.9 %)"
        ],
        [
          "Kantilever, dorong P di ujung dan beban aksial berlawanan P di tengah bentang: tekan P hanya dari tengah bentang sampai ujung",
          "2.961",
          "4.972 (+68 %)",
          "3.056 (+3.2 %)"
        ],
        [
          "Kolom berat Euler, tekan terbesar di tumpuan",
          "7.837",
          "4.972 (−37 %)",
          "7.889 (+0.7 %)"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Beberapa persen yang tersisa adalah galat diskretisasi biasa dari satu elemen per batang, dan berkurang ketika batang dibagi. P-Delta masih memakai gaya aksial rata-rata, dan tekuk 3D dengan beban sepanjang batang mempertahankan peringatannya sampai perbaikannya sendiri."
    },
    {
      "k": "p",
      "t": "Analisis korotasional 3D (#1301, versi 24). Rotasi ujung batang dikurangkan sebagai vektor rotasi, yang eksak hanya bila semua rotasi memiliki satu sumbu. Tikungan 45° Bathe–Bolourchi menyimpang 1,3 % dari solusi yang dipublikasikan, dan memperhalus mesh menjauhkannya dari acuan, bukan mendekatkannya. Kini rotasi dikomposisikan sebagai matriks rotasi: tikungan yang sama berada dalam 0,4 % dari dua solusi independen yang dipublikasikan dan konvergen di antara keduanya. Batang yang kedua ujungnya berputar lebih dari 0,9π satu terhadap yang lain ditolak, karena hasilnya tidak dapat menyatakan putaran penuh mana yang dimaksud."
    },
    {
      "k": "p",
      "t": "Mekanisme tersembunyi dalam 2D (#1298, versi 22). Hubungan kaku atau diafragma dari titik simpul yang batangnya semua bersendi ke ujung batang rangka adalah mekanisme, tetapi solver menahannya dengan pegas buatan yang sangat kecil dan mengembalikan perpindahan ratusan kilometer, yang kemudian disertifikasi oleh sertifikat. Model semacam itu kini ditolak. Perbaikannya tidak mengusulkan pemberitahuan untuk kasus ini: pada kasus yang ditemukan perpindahannya tidak masuk akal, sekitar 10⁵ m, dan disertai peringatan aplikasi tentang kemungkinan mekanisme. Itu adalah penilaian tentang kasus-kasus tersebut, bukan bukti bahwa tidak ada hasil terdampak yang tampak masuk akal. Yang salah adalah klaim sertifikat, dan entri versi memberi tahu proyek yang berkaitan. Kasus serupa melalui konektor, bukan hubungan kaku, ditemukan kemudian (#1414); perbaikannya (#1415) masuk pada 5 November."
    },
    {
      "k": "p",
      "t": "Memotong model 3D menjadi 2D (#1295). Potongan memakai inersia sumbu kuat setiap penampang untuk setiap batang, sehingga kolom pada potongan Y–Z, balok pada potongan X–Y, dan batang yang diputar 90° melentur terhadap sumbu yang salah: portal IPN 300 yang berdiri pada Y–Z bergoyang 0,96 mm dalam 2D dibanding 13,0 mm dalam 3D. Setiap batang kini melentur dalam 2D terhadap sumbu yang menjadi sumbu lenturnya dalam 3D, dan potongan yang tidak dapat diwakili model bidang ditolak. Perbaikan ini tidak memiliki versi hasil, dan itu disengaja: model 2D tersimpan dihitung persis seperti sebelumnya, karena yang salah adalah model yang dihasilkan potongan. Pemberitahuan pemeriksaan ulang tidak dapat menjangkau berkas-berkas itu, sehingga pemberitahuan keselamatan (SA-2026-035) adalah salurannya: potong ulang model dari 3D, atau hitung dalam 3D."
    },
    {
      "k": "h",
      "t": "Setelah perbaikan: pemberitahuan keselamatan"
    },
    {
      "k": "p",
      "t": "Cacat yang dapat menghasilkan hasil keliru atau tidak konservatif pada versi yang dirilis mendapat pemberitahuan keselamatan: apa yang salah, model mana yang terdampak, cara mengenalinya, apa yang perlu diperiksa ulang pada hasil yang sudah diserahkan, dan kasus yang mereproduksinya. Pemberitahuan untuk perbaikan minggu ini sudah disusun di repositori dan dipublikasikan bersama rilis 0.5.0, seperti SA-2026-001 sampai 024 bersama 0.3.0 dan 0.4.0."
    },
    {
      "k": "table",
      "caption": "Pemberitahuan yang disusun untuk perbaikan yang digabungkan pada 4 dan 5 November 2026.",
      "head": [
        "Pemberitahuan",
        "Apa yang salah",
        "Tingkat keparahan"
      ],
      "rows": [
        [
          "SA-2026-033",
          "Generator beban melewatkan beban luas suatu lantai ketika satu batang rendah berdiri di atas sebagian lantai itu",
          "Tinggi"
        ],
        [
          "SA-2026-034",
          "Pemeriksaan keseimbangan sesuai untuk kasus yang pemeriksaannya melewatkan beban",
          "Sedang"
        ],
        [
          "SA-2026-035",
          "Potongan 3D ke 2D melenturkan batang terhadap sumbu penampang yang salah",
          "Tinggi"
        ],
        [
          "SA-2026-036",
          "Potongan 3D ke 2D pada Y–Z atau X–Y membaca kekangan seolah portal berdiri pada X–Z",
          "Tinggi"
        ],
        [
          "SA-2026-037",
          "Analisis korotasional 3D mengurangkan vektor rotasi",
          "Sedang"
        ],
        [
          "SA-2026-040",
          "Pemeriksaan ACI 318 dan EN 1992 meloloskan batang beton tanpa memeriksa torsinya",
          "Tinggi"
        ],
        [
          "SA-2026-041",
          "Pemeriksaan kolom beton bertulang hanya memasangkan momen terbesar dengan tekan terbesar",
          "Tinggi"
        ],
        [
          "SA-2026-042",
          "Tekuk 2D melebihkan faktor pada batang yang tekannya membesar sepanjang batang",
          "Tinggi"
        ]
      ]
    },
    {
      "k": "img",
      "base": "blog/results-changelog",
      "w": 1600,
      "h": 1000,
      "alt": "Halaman log perubahan Stabileo di situs web: entri terbaru di atas, untuk 6 November, berjudul “Hasil keliru pada pemeriksaan desain dan dinamika diperbaiki, beban hasil generator dikoreksi, dan mode analisis PRO dilengkapi”, dibuka dengan perubahan mesinnya, dan dapat disaring menurut area di kiri.",
      "caption": "Halaman log perubahan, terbaru di atas, dibuka dengan perbaikan minggu ini yang mengubah hasil."
    },
    {
      "k": "h",
      "t": "Yang tidak dapat dilakukannya"
    },
    {
      "k": "ul",
      "items": [
        "Pemberitahuan hanya mengetahui perubahan yang terdaftar. Cacat yang belum ditemukan tidak ada di registri mana pun; itulah gunanya verifikasi di balik solver, dan apa yang dicakup penanganan begitu sesuatu ditemukan.",
        "Ia membaca fitur model dari berkas tersimpan, dan bila tidak dapat memastikan, ia menganggap fitur itu ada: satu pemberitahuan berlebih lebih baik daripada perubahan yang tersembunyi dari model yang berkaitan.",
        "Ia tidak dapat mengikuti angka setelah keluar dari aplikasi, dalam gambar, spreadsheet, atau laporan yang sudah diserahkan. Itulah gunanya pemberitahuan keselamatan.",
        "Ditangani, ditolak, atau diperbaiki, hasil tetap menjadi tanggung jawab insinyur untuk diperiksa sebelum ditandatangani."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Setiap pemberitahuan yang dipublikasikan, beserta apa yang perlu diperiksa ulang untuk masing-masing:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/PROVENANCE.md",
      "label": "Pemberitahuan pemeriksaan ulang, asal-usul, dan reproduksibilitas",
      "t": "Cara kerja versi hasil, cap, dan pemberitahuan, secara rinci:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Indeks pemberitahuan keselamatan",
      "t": "Pemberitahuan, termasuk draf untuk 0.5.0:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/issues/447",
      "label": "Isu #447: tangani dulu, perbaiki kemudian",
      "t": "Kebijakan penanganan dan kemajuannya:"
    }
  ]
};

export default body;
