import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.6.1: pemeriksaan batang dan beban salju yang dikoreksi",
  "excerpt": "Hitung ulang pemeriksaan desain beton dan baja yang terdampak. Untuk beban salju yang dibangkitkan, bangkitkan ulang bebannya terlebih dahulu, lalu hitung ulang kasus beban, kombinasi, selubung, dan pemeriksaan desain turunan yang terdampak.",
  "blocks": [
    {
      "k": "p",
      "t": "Hitung ulang pemeriksaan desain beton dan baja yang terdampak. Untuk beban salju yang dibangkitkan, bangkitkan ulang bebannya terlebih dahulu, lalu hitung ulang kasus beban, kombinasi, selubung, dan pemeriksaan desain turunan yang terdampak. Menghitung ulang beban yang tersimpan sebelumnya saja tidak memperbaikinya. Bandingkan gaya yang bekerja, kapasitas, tulangan, pemanfaatan, kombinasi yang menentukan, dan sertifikat dengan hasil yang sudah digunakan. Tinjau perhitungan yang telah diserahkan dan penentuan ukuran yang didasarkan padanya. Penolakan, besaran yang tidak tersedia, atau tulangan yang tidak diperiksa tidak memberikan jawaban yang memenuhi dan bukan berarti gaya yang bekerja nol."
    },
    {
      "k": "note",
      "t": "Lima pemberitahuan berkeparahan Tinggi berikut diperbaiki di 0.6.1. Ikuti setiap pemberitahuan untuk masukan yang terdampak dan tindakan pengguna, meskipun hasil sebelumnya memenuhi atau tersertifikasi."
    },
    {
      "k": "h",
      "t": "Pemberitahuan keselamatan"
    },
    {
      "k": "table",
      "caption": "Pemberitahuan keselamatan",
      "head": [
        "Pemberitahuan",
        "Tingkat keparahan",
        "Apa yang berubah dan apa yang harus dilakukan"
      ],
      "rows": [
        [
          "SA-2026-064",
          "Tinggi",
          "Cb baja dapat berasal dari kombinasi lain atau dari bentang tak terbresing pendek yang tidak ditentukan lokasinya (#1316, #2088). Hitung ulang pemeriksaan baja CIRSOC 301 dan tinjau kapasitas lentur, pemanfaatan interaksi, dan kombinasi yang menentukan."
        ],
        [
          "SA-2026-065",
          "Tinggi",
          "Timbunan pada undakan atap dapat terlewat pada atap penerima yang miring (#2082). Bangkitkan ulang beban salju CIRSOC 104 dan hitung ulang analisis serta pemeriksaan desain yang terdampak."
        ],
        [
          "SA-2026-066",
          "Tinggi",
          "Cm beton dapat memperoleh kredit momen ujung padahal ada beban transversal di antara tumpuan (#2089). Periksa ulang kolom dan dinding beton langsing, momen yang diperbesar, dan tulangan."
        ],
        [
          "SA-2026-067",
          "Tinggi",
          "Rotasi denah dapat mengubah beban salju yang dibangkitkan (#2093). Bangkitkan ulang beban menggunakan geometri atap yang sebenarnya, lalu hitung ulang analisis dan pemeriksaan; memutar kembali model lama bukan perbaikan."
        ],
        [
          "SA-2026-068",
          "Tinggi",
          "Torsi dapat memenuhi syarat dengan sengkang desain yang tidak memadai (#2141). Hitung ulang pemeriksaan desain beton dan tinjau kapasitas transversal yang sebenarnya, jarak sengkang, dan kegagalan torsi. Tulangan longitudinal yang tidak diperiksa bukanlah sangkar tulangan yang memenuhi syarat."
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Indeks pemberitahuan keselamatan",
      "t": "Pemberitahuan keselamatan:"
    },
    {
      "k": "h",
      "t": "Setiap pemberitahuan perubahan hasil sejak v0.6.0"
    },
    {
      "k": "p",
      "t": "Registri pada v0.6.0 berakhir pada versi hasil 78; rilis ini mencapai 80. Tabel mencantumkan semua 24 pemberitahuan baru. Beberapa pemberitahuan berbagi satu versi. Jalankan ulang setiap pemeriksaan yang berlaku; untuk pemberitahuan salju, bangkitkan ulang beban sebelum menghitung ulang."
    },
    {
      "k": "table",
      "caption": "Setiap pemberitahuan perubahan hasil sejak v0.6.0",
      "head": [
        "Versi hasil",
        "Hasil yang berubah"
      ],
      "rows": [
        [
          "79",
          "Cakupan timbunan salju mengikuti tepi atap yang menerus"
        ],
        [
          "79",
          "Penggantian beban salju mempertahankan sisi tak seimbang dan rentetan penampang"
        ],
        [
          "79",
          "Portal salju datar mengikuti rentetan atap yang terhubung"
        ],
        [
          "79",
          "Beban salju menghormati posisi lokal dan batas timbunan"
        ],
        [
          "79",
          "Faktor salju mengikuti orientasi setiap atap"
        ],
        [
          "79",
          "Kasus salju mencakup setiap orientasi bubungan"
        ],
        [
          "79",
          "Fetch salju mengikuti atap yang menerus dan geometri yang dipilih"
        ],
        [
          "79",
          "Beban salju mempertahankan besarnya pada rotasi denah"
        ],
        [
          "79",
          "Timbunan pada undakan atap menggunakan bidang atap penerima"
        ],
        [
          "79",
          "Beban salju mengikuti setiap permukaan atap yang terhubung"
        ],
        [
          "79",
          "Luas tributari salju menggunakan permukaan atap bagian dalam"
        ],
        [
          "80",
          "Pemeriksaan batang memerlukan setiap kombinasi aktif"
        ],
        [
          "80",
          "Data titik tinjau yang lengkap diperlukan untuk pemeriksaan batang"
        ],
        [
          "80",
          "Pemeriksaan serentak mempertahankan gaya yang bekerja yang menentukan"
        ],
        [
          "80",
          "Desain menggunakan batang tulangan terpilih dan pembebanan bentang yang diketahui"
        ],
        [
          "80",
          "Pemeriksaan interaksi menggunakan gaya titik tinjau serentak"
        ],
        [
          "80",
          "Pemeriksaan beton mempertahankan kelangsingan sekunder"
        ],
        [
          "80",
          "Kasus serentak mempertahankan seluruh tulangan torsi yang diperlukan"
        ],
        [
          "80",
          "Tulangan tetap mempertahankan pemeriksaan maksimum praktis"
        ],
        [
          "80",
          "Gaya yang bekerja pada desain menghormati perilaku dan bentang sayap"
        ],
        [
          "80",
          "Torsi memeriksa setiap sangkar sengkang yang dihasilkan"
        ],
        [
          "80",
          "Balok bersama mempertahankan sumbunya; penyediaan torsi harus dinyatakan"
        ],
        [
          "80",
          "Cb interaksi baja menggunakan diagram kombinasinya sendiri"
        ],
        [
          "80",
          "Titik tinjau baja menggunakan panjang fisik dan mempertahankan gaya geser yang bekerja"
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.6.1.id.md",
      "label": "Catatan rilis 0.6.1 lengkap",
      "t": "Setiap pemberitahuan perubahan hasil sejak v0.6.0:"
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Dialog pemeriksaan ulang hasil di Stabileo Basic, yang mencantumkan perubahan yang memengaruhi proyek tersimpan yang lebih lama.",
      "caption": "Hasil Anda dapat berubah: jalankan ulang proyek yang terdampak"
    },
    {
      "k": "h",
      "t": "Perubahan lain"
    },
    {
      "k": "p",
      "t": "Pemeriksaan beton dan baja mempertahankan gaya dari kombinasi dan titik tinjau yang sama. Data kombinasi atau titik tinjau yang tidak lengkap kini ditolak, bukan meminjam hasil titik ujung. Keadaan tulangan yang diperlukan dan yang disediakan tetap terpisah, dan penyediaan torsi longitudinal yang hilang dilaporkan secara eksplisit."
    },
    {
      "k": "h",
      "t": "Keterbatasan yang diketahui"
    },
    {
      "k": "ul",
      "items": [
        "Hasil salah yang diketahui masih terbuka: #2096, #2142, #2143 dan #2144. Rilis ini tidak memperbaikinya. Lihat cakupan terdampaknya dan verifikasi secara independen hasil yang terdampak sebelum digunakan.",
        "SA-2026-056 tetap belum diperbaiki: verifikasi secara independen gaya dinamis yang bekerja pada model campuran portal dan cangkang yang dikekang dan berubah secara berarti setelah penomoran ulang, rotasi, atau konversi satuan. Tidak ada faktor koreksi konservatif yang ditetapkan.",
        "Keruntuhan plastis 2D tetap ditolak menunggu #758, seperti dijelaskan di SA-2026-044. Batas bawah 3D yang tersertifikasi tidak mensertifikasi riwayat sendi mentah.",
        "Riwayat waktu tidak menyediakan gaya tumpuan dinamis total yang bekerja. Gunakan analisis independen yang memperhitungkan inersia, redaman, dan pembebanan tumpuan. Analisis kabel yang tidak didukung dan gerak tumpuan yang ditetapkan tidak nol pada alur kerja kabel/riwayat waktu ditolak secara eksplisit.",
        "Solver panjang busur spasial dan kendali perpindahan tidak ditambahkan. Peringatan dan pembatasan yang ada tetap berlaku."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/CHANGELOG.md",
      "label": "Log perubahan",
      "t": "Log perubahan:"
    }
  ]
};

export default body;
