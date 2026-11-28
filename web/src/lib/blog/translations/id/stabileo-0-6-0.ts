import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.6.0: jalankan ulang proyek yang terdampak",
  "excerpt": "Jalankan ulang analisis yang terdampak dan tinjau hasil yang sudah Anda pakai. SA-2026-048 sampai SA-2026-063 menjelaskan apa yang perlu diperiksa; SA-2026-056 tetap belum diperbaiki.",
  "blocks": [
    {
      "k": "p",
      "t": "Hitung ulang kasus beban, kombinasi, dan riwayat nonlinear atau bertahap lengkap yang terdampak. Bandingkan perpindahan, gaya dalam batang, reaksi tumpuan, dan gaya yang bekerja pada desain dengan hasil yang sudah digunakan. Tinjau perhitungan yang telah diserahkan dan penentuan ukuran yang didasarkan padanya. Ikuti setiap pemberitahuan untuk masukan yang terdampak dan tindakan pengguna. Penolakan atau besaran yang tidak tersedia tidak memberikan jawaban pengganti: itu bukan gaya yang bekerja nol dan bukan pemeriksaan yang memenuhi."
    },
    {
      "k": "note",
      "t": "Pemberitahuan SA-2026-048 hingga SA-2026-063 ditambahkan setelah v0.5.0. Perbaikan di bawah ini disertakan dalam 0.6.0, kecuali SA-2026-056, yang tetap belum diperbaiki. Periksa ulang fitur yang tercantum di sini meskipun analisis sebelumnya konvergen atau perpindahannya tampak masuk akal."
    },
    {
      "k": "h",
      "t": "Pemberitahuan keselamatan"
    },
    {
      "k": "table",
      "caption": "Pemberitahuan keselamatan SA-2026-048 sampai SA-2026-063",
      "head": [
        "Pemberitahuan",
        "Tingkat keparahan",
        "Apa yang berubah dan apa yang harus dilakukan"
      ],
      "rows": [
        [
          "SA-2026-048",
          "Tinggi",
          "CIRSOC 301 mengabaikan momen ujung dari Mmax untuk setiap penampang dengan segmen tak terbresing yang dipendekkan; kanal dan profil T pada lengkungan ganda juga dapat melewatkan perubahan tanda. Periksa ulang semua batang CIRSOC 301 dengan Lb yang dinyatakan lebih pendek daripada batang, termasuk pemeriksaan baja dan usulan optimizer."
        ],
        [
          "SA-2026-049",
          "Tinggi",
          "Kekangan kaku ditambah pegas dapat menjadi tumpuan elastis pada 3D. Pilih kondisi batas yang dimaksud secara eksplisit dan hitung ulang analisis yang terdampak."
        ],
        [
          "SA-2026-050",
          "Sedang",
          "Kelangsingan yang gagal dapat menjadi nol, dan hasil multikasus dapat memuat bilangan tak hingga. Buang nilai tersebut, tinjau masukan, dan hitung ulang."
        ],
        [
          "SA-2026-051",
          "Tinggi",
          "Beban bergerak 3D melewatkan puncak bagian dalam dan berat gandar aksial. Hitung ulang selubung dan tinjau penentuan ukuran batang serta gaya yang bekerja pada desain."
        ],
        [
          "SA-2026-052",
          "Tinggi",
          "Selubung aksial beban bergerak 2D/3D melewatkan batas beban merata. Hitung ulang dan periksa nilai ekstrem aksial bagian dalam; mengurangi langkah rangkaian beban saja tidak cukup."
        ],
        [
          "SA-2026-053",
          "Rendah",
          "Selubung beban bergerak menyertakan batas gaya luar pada beban di ujung batang. Hitung ulang selubung aksial/geser dan tinjau penentuan ukuran, dengan mempertahankan reaksi tumpuan dalam pemeriksaan kesetimbangan."
        ],
        [
          "SA-2026-054",
          "Tinggi",
          "Penyelesaian linear dapat mengembalikan respons kekakuan yang tidak terselesaikan atau melewatkan satu komponen beban. Hitung ulang kasus statik dan kombinasi; verifikasi secara independen gaya yang bekerja ketika solver yang telah dikoreksi menolak."
        ],
        [
          "SA-2026-055",
          "Tinggi",
          "P-Delta meremehkan amplifikasi pada beban bentang aksial. Hitung ulang analisis yang terdampak dan pemeriksaan turunannya, verifikasi konvergensi mesh, dan nilai ulang stabilitas."
        ],
        [
          "SA-2026-056",
          "Tinggi",
          "Belum diperbaiki: dinamika campuran portal/cangkang yang dikekang berubah pada deskripsi model yang setara. Verifikasi secara independen gaya yang bekerja yang terdampak sebelum menggunakannya; tidak ada faktor koreksi konservatif yang ditetapkan."
        ],
        [
          "SA-2026-057",
          "Sedang",
          "Tampilan plastis dapat menyebut faktor yang berada di luar sebagai berada di dalam intervalnya. Hitung ulang sertifikat dan bandingkan titik ujung yang tepat. Penolakan karena sumber daya tidak membuktikan bahwa tidak ada mekanisme."
        ],
        [
          "SA-2026-058",
          "Tinggi",
          "Model harmonik besar mempertahankan respons ragam yang diabaikan secara tidak akurat. Hitung ulang sapuan dan tinjau amplitudo, fase, dan puncak, termasuk frekuensi di luar peringatan pemotongan."
        ],
        [
          "SA-2026-059",
          "Tinggi",
          "Analisis web lanjutan memberikan tahanan tekan pada kabel. Gunakan solver kabel khusus yang didukung atau analisis independen; alur kerja kabel lanjutan kini menolak secara eksplisit."
        ],
        [
          "SA-2026-060",
          "Tinggi",
          "Kekakuan rotasi buatan pada analisis bertahap mengubah translasi dan aksi batang. Hitung ulang riwayat bertahap lengkap dengan pelepasan atau pegas tumpuan dan tinjau gaya yang bekerja pada desain turunan."
        ],
        [
          "SA-2026-061",
          "Tinggi",
          "Reaksi lintasan terlewat atau dipulihkan pada beban yang salah; gaya bertahap dan dinamis dapat hilang. Hitung ulang dan tinjau gaya yang bekerja pada tumpuan, sambungan, dan pondasi. Gaya yang tidak tersedia bukan nol; reaksi dinamis total tetap tidak tersedia."
        ],
        [
          "SA-2026-062",
          "Tinggi",
          "Penolakan elastis awal dapat menjadi faktor keruntuhan plastis 3D mentah nol yang berhasil. Hitung ulang analisis plastis yang terdampak; penolakan numerik bukan bukti keruntuhan pada beban nol."
        ],
        [
          "SA-2026-063",
          "Tinggi",
          "Kekangan mengabaikan gerak master terkekang yang ditetapkan. Hitung ulang riwayat lengkap dan tinjau perpindahan, gaya dalam batang, dan reaksi bersama dengan SA-2026-061. Gerak tumpuan kabel/riwayat waktu yang tidak didukung kini ditolak."
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Indeks pemberitahuan keselamatan",
      "t": "Baca setiap pemberitahuan keselamatan yang berlaku untuk masukan yang terdampak dan tindakan yang diperlukan:"
    },
    {
      "k": "h",
      "t": "Perubahan lain yang memengaruhi jawaban"
    },
    {
      "k": "p",
      "t": "Registri hasil berakhir pada versi 49 di 0.5.0 dan mencapai 78 di 0.6.0. Tabel ini memilih perubahan lain untuk ditinjau bersama pemberitahuan keselamatan di atas. Jalankan ulang setiap analisis yang tercakup oleh pemberitahuan yang berlaku dan bandingkan keluarannya. Daftar lengkap, termasuk pemeriksaan yang digantikan dan ditarik, ada dalam catatan rilis."
    },
    {
      "k": "table",
      "caption": "Pemberitahuan perubahan hasil terpilih sejak 0.5.0",
      "head": [
        "Versi hasil",
        "Hasil yang berubah"
      ],
      "rows": [
        [
          "50",
          "2D: rotasi yang hanya ditahan oleh konektor dan dibiarkan bebas oleh konektor ditolak"
        ],
        [
          "52",
          "3D: rotasi titik simpul yang dikopel konektor tetapi dibiarkan bebas ditolak"
        ],
        [
          "53",
          "Tekuk tidak lagi mengambil kekakuan geometrik dari gaya aksial galat pembulatan. Pada 2D dan 3D, batang yang gaya aksialnya tidak dapat dibedakan dari galat pembulatan tidak menyumbang kekakuan geometrik. Analisis ditolak jika kemungkinan tekan pada batang tersebut dapat menurunkan faktor kritis lebih dari 1 %."
        ],
        [
          "54",
          "Luas neto ujung berbaut zig-zag mengambil rantai terburuknya, dan ujung berbaut semua elemen memerlukan baut pada badan"
        ],
        [
          "56",
          "Tumpuan miring 3D menghitung kekangan dalam kerangka bersama"
        ],
        [
          "58",
          "Basis modal menggunakan skala pembulatan setiap entri Gram massa"
        ],
        [
          "59",
          "Analisis plastis 3D yang diperiksa mengembalikan batas bawah tersertifikasi"
        ],
        [
          "61",
          "Kendali beban serat beton memperhalus interval penghentiannya"
        ],
        [
          "63",
          "Analisis linear menolak mekanisme atau kekakuan yang tidak dapat diselesaikan, bukan menyelesaikannya dengan peringatan"
        ],
        [
          "65",
          "Kontak beku yang tidak valid dan analisis batang kabel ditahan"
        ],
        [
          "66",
          "Batas galat pembulatan tekuk mengikuti kopling kekangan yang sebenarnya"
        ],
        [
          "67",
          "Faktor tekuk menggunakan pensil kekakuan yang asli"
        ],
        [
          "68",
          "Keseimbangan plastis menggunakan ID model yang diselesaikan dan sertifikat menganggarkan kandidat yang sebenarnya"
        ],
        [
          "69",
          "Konvergensi nonlinear mengikuti kesetimbangan fisik"
        ],
        [
          "71",
          "Menyertakan aksi transversal rangka batang dalam keseimbangan batang bersyarat"
        ],
        [
          "72",
          "Kontinuasi panjang busur mengelompokkan ulang aritmetika beban acuan"
        ],
        [
          "73",
          "Analisis modal mempertahankan rentang massa fisik"
        ],
        [
          "75",
          "SSI mengoreksi plato residu elastis"
        ],
        [
          "76",
          "Reduksi kekangan mempertahankan ketidakpastian pembulatan terarah"
        ],
        [
          "78",
          "Beban yang kompatibel pada rotasi yang dilepas"
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.6.0.id.md",
      "label": "Catatan rilis 0.6.0 lengkap",
      "t": "Setiap pemberitahuan perubahan hasil, dengan tautan ke cakupan dan buktinya:"
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Dialog pemeriksaan ulang hasil di Stabileo Basic, yang mencantumkan perubahan yang memengaruhi proyek tersimpan yang lebih lama.",
      "caption": "Dialog pemeriksaan ulang hasil yang diilustrasikan dalam artikel 0.5.0."
    },
    {
      "k": "h",
      "t": "Dua pemberitahuan menjelaskan perilaku yang sudah ada di 0.5.0"
    },
    {
      "k": "p",
      "t": "Kedua pemberitahuan ini didaftarkan belakangan. Perubahan yang mendasarinya sudah ada di v0.5.0, sehingga bukan perubahan numerik baru dalam rilis ini. Keduanya tetap dapat muncul dalam pemberitahuan pemeriksaan ulang proyek."
    },
    {
      "k": "table",
      "caption": "Pemberitahuan belakangan untuk perubahan yang sudah dirilis di 0.5.0",
      "head": [
        "Versi hasil",
        "Hasil yang berubah"
      ],
      "rows": [
        [
          "72",
          "Galeri pelat lantai publik menggunakan tumpuan sederhana keras pada dinding"
        ],
        [
          "72",
          "SSI mengembalikan reaksi tumpuan dan menyertakan pegas tanah dalam gaya kekangan"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Keterbatasan yang diketahui"
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-056 tetap belum diperbaiki: verifikasi secara independen gaya dinamis yang bekerja pada model campuran portal dan cangkang yang dikekang dan berubah secara berarti setelah penomoran ulang, rotasi, atau konversi satuan. Tidak ada faktor koreksi konservatif yang ditetapkan.",
        "Keruntuhan plastis 2D tetap ditolak menunggu #758, seperti dijelaskan di SA-2026-044. Batas bawah 3D yang tersertifikasi tidak mensertifikasi riwayat sendi mentah.",
        "Riwayat waktu tidak menyediakan gaya tumpuan dinamis total yang bekerja. Gunakan analisis independen yang memperhitungkan inersia, redaman, dan pembebanan tumpuan. Analisis kabel yang tidak didukung dan gerak tumpuan yang ditetapkan tidak nol pada alur kerja kabel/riwayat waktu ditolak secara eksplisit.",
        "Solver panjang busur spasial dan kendali perpindahan tidak ditambahkan. Peringatan dan pembatasan yang ada tetap berlaku."
      ]
    },
    {
      "k": "h",
      "t": "Perubahan lain"
    },
    {
      "k": "ul",
      "items": [
        "Struktur planar yang dibangkitkan menerima kekangan eksplisit, dan gudang secara bawaan memakai bresing fisik. Bangkitkan ulang dan tinjau tumpuan serta bresing; model yang tersimpan tidak berubah.",
        "Eksperimen kendali bentuk strip lengkung Fehér, Sipos dan Várkonyi memiliki solver interaktif, lintasan aktuator dan perbandingan dengan makalah dalam bahasa Inggris, Spanyol dan Portugis. Ringkasan strip terpotong juga diterjemahkan ke bahasa Spanyol dan Portugis.",
        "Artikel rilis blog 0.5.0 kini memiliki terjemahan lengkap dalam bahasa Jerman, Prancis dan Turki. Peringatan sertifikat plastis dan penolakan sumber daya diterjemahkan ke setiap bahasa yang ditawarkan."
      ]
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
