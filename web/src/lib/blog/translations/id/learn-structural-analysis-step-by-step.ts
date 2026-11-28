import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Belajar analisis struktur langkah demi langkah di Stabileo Basic",
  "excerpt": "Basic kini memiliki kursus: pilih sebuah metode dan aplikasi menyelesaikan struktur Anda, atau sebuah contoh, langkah demi langkah seperti di atas kertas. Statika, garis pengaruh, orde kedua, analisis plastis, dan dinamika. Gratis.",
  "blocks": [
    {
      "k": "p",
      "t": "Perangkat lunak analisis memberikan hasil sekaligus. Belajar membutuhkan kebalikannya: melihat dari mana setiap angka berasal, dalam urutan yang dikerjakan di papan tulis. Itulah “Dijelaskan langkah demi langkah”, kursus yang kini ada di dalam Stabileo Basic. Anda memilih sebuah metode, aplikasi menerapkannya pada struktur Anda dan mengerjakannya langkah demi langkah, dengan persamaan, gambar, dan angka dari model tersebut, dan diakhiri dengan membandingkan hasilnya dengan metode matriks."
    },
    {
      "k": "p",
      "t": "Kursus ini ditulis oleh Bautista Chesta, insinyur sipil (FIUBA), dan hadir dalam enam unit: dasar bersama, statika dan metode klasik, garis pengaruh, orde kedua dan tekuk, analisis plastis, dan dinamika. Kursus ini gratis, seperti seluruh Basic: dibuka di peramban, tanpa instalasi dan tanpa akun, dan teksnya tersedia dalam bahasa Spanyol, Inggris, Portugis, Jerman, Prancis, dan Turki."
    },
    {
      "k": "h",
      "t": "Cara membukanya"
    },
    {
      "k": "ol",
      "items": [
        "Buka stabileo.com/app/basic.",
        "Tekan Lanjutan. Di ponsel, tombolnya ada di pita bawah.",
        "Di bawah “Jelajahi dan pelajari”, tekan Dijelaskan langkah demi langkah. Katalog metode terbuka, dikelompokkan menurut topik.",
        "Setiap metode menyebutkan seperti apa struktur yang diperlukan untuk mencobanya dan apakah model Anda memenuhi syarat; tanda ? menjelaskan fungsinya. “Buka contoh” memuat model yang memenuhi syarat dan membuka metodenya; “Buka” menerapkannya pada model di layar.",
        "Berikutnya dan Sebelumnya berpindah antar langkah, dan tab bernomor melompat ke salah satunya. Metode kembali ke katalog."
      ]
    },
    {
      "k": "img",
      "base": "blog/course-catalog",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic dengan katalog “Dijelaskan langkah demi langkah” terbuka di panel samping: metode di bawah metode kekakuan, metode fleksibilitas, dan balok menerus, masing-masing dengan syarat struktur serta tombol Buka dan Buka contoh.",
      "caption": "Katalog: setiap metode menyebutkan apa yang dibutuhkan model dan dilengkapi contoh yang memenuhinya."
    },
    {
      "k": "note",
      "t": "Metode yang dijelaskan bekerja pada model bidang. Di ruang kerja 3D hanya dua wizard yang terbuka, kekakuan dan fleksibilitas; “Buka contoh” pada metode lain beralih kembali ke bidang terlebih dahulu."
    },
    {
      "k": "h",
      "t": "Statika, metode gaya, dan metode perpindahan"
    },
    {
      "k": "p",
      "t": "Ini adalah unit terbesar: balok menerus dengan persamaan tiga momen dan distribusi momen, portal dengan kemiringan-lendutan (slope-deflection), distribusi momen dengan dan tanpa pergoyangan serta metode perpindahan, rangka batang dengan titik simpul, dengan potongan (Ritter), dan dengan matriks kompatibilitas, serta lendutan dengan integrasi ganda, luas bidang momen, kerja virtual, dan Castigliano. Derajat ketidaktentuan dihitung dengan cara yang sama di mana-mana (GH = 3·m + r − 3·n − c untuk portal bidang, GH = m + r − 2·n untuk rangka batang), dengan sendi internal ditulis lengkap dan dibagi menjadi bagian eksternal dan internal."
    },
    {
      "k": "p",
      "t": "Pada metode gaya Anda memilih struktur primer: Anda melepas tumpuan atau ujung batang sampai gaya kelebihan sebanyak derajatnya, dan jika pilihan Anda menyisakan mekanisme, aplikasi menjelaskan alasannya alih-alih menyelesaikannya. Lalu berjalan melalui sembilan langkah, dengan kekakuan aksial aktif atau nonaktif dan batang serta pegas ditulis suku demi suku. Kerja virtual menghitung perpindahan, rotasi, dan gerak relatif, termasuk dengan pegas, penurunan tumpuan, dan suhu. Untuk mencobanya: Contoh → Portal → Lanjutan → Dijelaskan langkah demi langkah → Metode gaya → Buka."
    },
    {
      "k": "img",
      "base": "blog/course-force-method",
      "w": 1600,
      "h": 1000,
      "alt": "Wizard metode gaya pada contoh Portal, pada langkah struktur primer: tiga reaksi tumpuan kanan dilepas dan aplikasi mencantumkan tiga gaya kelebihan yang dipilih.",
      "caption": "Metode gaya: Anda memilih struktur primer, dan aplikasi memberi tahu apakah pilihan itu berhasil."
    },
    {
      "k": "h",
      "t": "Garis pengaruh"
    },
    {
      "k": "p",
      "t": "Contoh → Balok Menerus, lalu Lanjutan → Garis pengaruh, dan ketuk sebuah penampang balok. Tersedia garis untuk reaksi, momen, gaya geser, gaya aksial, perpindahan, dan rotasi, pada penampang mana pun, termasuk ujung batang, dan penampang dapat dipindahkan setelahnya. Panel membebani garis dengan beban permanen g, beban hidup q, dan beban terpusat P untuk nilai ekstremnya, menggambar selubung sepanjang batang, dan membuka penjelasan langkah demi langkah dengan gambar Müller-Breslau. “Kasus beban dan selubung” menemukan efek terbesar dan terkecil. Garis momen bernilai positif di tempat serat bawah tertarik, seperti diagram statik."
    },
    {
      "k": "img",
      "base": "blog/course-influence",
      "w": 1600,
      "h": 1000,
      "alt": "Contoh Balok Menerus dengan selubung momen yang diperoleh dengan membebani garis pengaruh, merah untuk maksimum dan biru untuk minimum, dan panel yang membebani garis momen 2 m dari tumpuan kiri dengan g = 10 dan q = 5 kN/m: maksimum 20,00 kN·m dan minimum 10,00 kN·m, masing-masing dikonfirmasi dengan perhitungan langsung.",
      "caption": "Garis pengaruh momen yang dibebani untuk nilai ekstremnya, dan selubung sepanjang balok."
    },
    {
      "k": "h",
      "t": "Orde kedua dan tekuk"
    },
    {
      "k": "p",
      "t": "Dengan portal berbeban, Lanjutan → P-Δ (orde ke-2) atau Pcr (Euler). Di bawah “Cara menghitungnya” Anda memilih metode, dengan fungsi stabilitas φ, matriks geometrik, atau matriks tali busur (P/L), dan berapa banyak elemen pada setiap batang. P-Δ menampilkan iterasinya, dan B₂ = 1/(1 − 1/λ₁) berasal dari tekuk model yang sama pada diskretisasi yang sama, di samping amplifikasi perpindahan pada titik simpul yang paling bergerak pada orde pertama. Tekuk secara bawaan memakai empat elemen per batang, dan bila diskretisasi tidak dapat merepresentasikan faktornya, ia menolaknya alih-alih melaporkannya. Dalam katalog, kelompok “Orde kedua dan tekuk” hadir dengan portal yang disiapkan untuk keempat metode."
    },
    {
      "k": "h",
      "t": "Analisis plastis"
    },
    {
      "k": "p",
      "t": "Contoh → Portal, lalu Lanjutan → Keruntuhan plastis. Unitnya ditulis: setiap langkah beban, kurva λ–perpindahan, rotasi plastis, mekanisme yang digambar pada model dan diperiksa dengan kerja virtual, dan mekanisme yang Anda pilih dengan mengetuk tempat sendi berada. Hasilnya untuk sementara ditahan. Kami menemukan bahwa analisis batas di baliknya dapat memberikan faktor keruntuhan yang berbeda hingga 4,6 kali ketika batang dinomori ulang atau dibalik, atau satuan berubah (#758). Sampai hal itu diperbaiki, panel menyatakannya dan menautkan isunya, dan metode statik dan kinematik dalam katalog dinonaktifkan dengan alasan yang sama: tidak ada angka lebih baik daripada angka yang bergantung pada cara model digambar."
    },
    {
      "k": "img",
      "base": "blog/course-plastic",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic dengan contoh Portal dan Lanjutan → Keruntuhan plastis dipilih: tidak ada kurva atau mekanisme yang ditampilkan; sebuah pesan berbingkai menyatakan hasil ditahan karena faktor keruntuhan plastis 2D dapat berubah hingga 4,6 kali menurut penomoran, arah batang, atau satuan, dan menautkan isu #758.",
      "caption": "Keruntuhan plastis portal, ditahan sampai #758 diperbaiki."
    },
    {
      "k": "h",
      "t": "Dinamika"
    },
    {
      "k": "p",
      "t": "Lanjutan → Dinamik membuka panel dinamika. Sistem derajat kebebasan tunggal diambil dari model, dengan respons bebasnya dan respons paksanya terhadap beban harmonik; sistem derajat kebebasan banyak diselesaikan dengan superposisi modal, termasuk gedung geser. Model massa, terkumpul atau konsisten dan dengan kondensasi, dibandingkan dengan frekuensi mesin, dan massa titik dapat ditempatkan pada titik simpul, dengan inersia rotasinya, yang juga dipakai analisis modal. Pada kelompok “Dinamika struktur” dalam katalog, “Buka contoh” memuat kolom dengan massa ujung, portal geser dua tingkat, atau, untuk massa terdistribusi, sebuah kantilever."
    },
    {
      "k": "img",
      "base": "blog/course-dynamics",
      "w": 1600,
      "h": 1000,
      "alt": "Kolom kantilever dengan massa ujung dan panel dinamika terbuka pada sistem derajat kebebasan tunggal yang diambil dari model: k = 2250 kN/m, m = 5 t, ω = 21,21 rad/s, getaran bebas teredam, dan respons terhadap gaya harmonik dengan faktor β.",
      "caption": "Satu derajat kebebasan: kolom dengan massa ujung di bawah gaya harmonik."
    },
    {
      "k": "h",
      "t": "Semua yang ada di katalog"
    },
    {
      "k": "table",
      "caption": "Metode dalam “Dijelaskan langkah demi langkah”, menurut kelompok, dalam urutan katalog.",
      "head": [
        "Kelompok",
        "Jumlah",
        "Metode"
      ],
      "rows": [
        [
          "Metode kekakuan",
          "1",
          "Metode matriks, sebagai wizard"
        ],
        [
          "Metode fleksibilitas",
          "1",
          "Metode gaya, sebagai wizard"
        ],
        [
          "Balok menerus",
          "2",
          "Tiga momen (Clapeyron); distribusi momen (Hardy Cross)"
        ],
        [
          "Portal",
          "4",
          "Hal yang tidak diketahui kinematik; distribusi momen tanpa dan dengan pergoyangan; kemiringan-lendutan (slope-deflection)"
        ],
        [
          "Rangka batang",
          "3",
          "Titik simpul; potongan (Ritter); matriks kompatibilitas"
        ],
        [
          "Deformasi dan energi",
          "5",
          "Integrasi ganda; luas bidang momen; kerja virtual; Castigliano; gaya dalam dengan potongan"
        ],
        [
          "Garis pengaruh",
          "1",
          "Garis pengaruh"
        ],
        [
          "Orde kedua dan tekuk",
          "2",
          "Orde kedua dengan fungsi φ dan dengan matriks geometrik; tekuk dengan jumlah ragam dan dengan nilai eigen"
        ],
        [
          "Analisis plastis",
          "2",
          "Metode kinematik; metode statik (ditahan sampai #758)"
        ],
        [
          "Dinamika struktur",
          "3",
          "Satu derajat kebebasan; banyak derajat kebebasan dengan dekomposisi modal; massa terdistribusi"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Jika Anda mengajar struktur, Anda dapat memakainya di kelas apa adanya: sebuah model dibagikan lewat tautan dan setiap mahasiswa membukanya di peramban masing-masing, dalam bahasa masing-masing. Jika sebuah langkah tidak jelas atau sebuah angka tidak sama dengan yang Anda peroleh secara manual, tulislah kepada kami: itulah yang persis perlu kami ketahui."
    },
    {
      "k": "link",
      "slug": "conceptual-side-advanced-tools",
      "t": "Alat lain yang dibuat untuk ruang kelas, analisis kinematik yang menjelaskan mengapa suatu struktur adalah mekanisme:"
    }
  ]
};

export default body;
