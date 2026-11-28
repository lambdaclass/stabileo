import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Cara kami memeriksa hasil Stabileo, dan di mana pemeriksaan itu berhenti",
  "excerpt": "Solver, verifikasi formal, dan AI: cara kami mencari kesalahan pada angka yang diberikan Stabileo, apa yang dibuktikan oleh sertifikat, dan apa yang tidak dapat dijamin oleh verifikasi apa pun.",
  "blocks": [
    {
      "k": "p",
      "t": "Program analisis struktur dapat memberikan angka yang salah tanpa tanda apa pun yang terlihat. Selama beberapa minggu terakhir kami menguji setiap bagian Stabileo dengan beberapa cara independen, menemukan puluhan cacat nyata, banyak di antaranya tidak konservatif, dan memperbaiki sebagian besar. Masing-masing dipilah dan, jika mungkin memengaruhi hasil yang sudah dipakai, dipublikasikan sebagai pemberitahuan keselamatan beserta langkah yang perlu dilakukan sementara itu; sebagian masih dalam proses pemilahan. Tulisan ini menjelaskan cara kami mencari cacat tersebut, apa yang dibuktikan oleh sertifikat yang menyertai hasil, dan sama terus terangnya, apa yang berada di luar jangkauan verifikasi mana pun."
    },
    {
      "k": "h",
      "t": "Satu mesin"
    },
    {
      "k": "p",
      "t": "Solver ditulis dalam Rust dan dikompilasi ke WebAssembly: ia berjalan di komputer pengguna sendiri, tanpa instalasi dan tanpa mengirim model ke server mana pun. Kodenya sama dengan yang berjalan di integrasi berkelanjutan. Pada Oktober 2026 kami menghapus perhitungan TypeScript paralel yang diam-diam menggantikan mesin ketika mesin tidak tersedia: kini aplikasi menyatakannya, bukan menghitung dengan salinan yang belum diverifikasi."
    },
    {
      "k": "h",
      "t": "Lima cara mencari kesalahan"
    },
    {
      "k": "p",
      "t": "Tidak ada satu pengujian pun yang menemukan semua kesalahan, sehingga kami memakai beberapa pengujian yang gagal dengan cara berbeda:"
    },
    {
      "k": "ul",
      "items": [
        "Perbandingan dengan program lain. Model yang sama, baik model tetap maupun model acak yang dibuat setiap malam, diselesaikan dengan OpenSees, Code_Aster, Frame3DD, PyNite, MYSTRAN, Kratos, dan CalculiX. Setiap perbedaan diselidiki sampai kami tahu apakah kesalahannya ada pada kami atau kedua program memodelkan kasus tersebut dengan cara yang berbeda.",
        "Acuan yang dipublikasikan. Rangkaian uji penerimaan berisi kasus yang hasilnya dipublikasikan oleh penulisnya, bukan oleh program komersial lain, dengan toleransi yang ditetapkan menurut ketelitian yang tercetak pada sumbernya. Pemeriksaan desain dibandingkan dengan contoh perhitungan yang dipublikasikan (INTI-CIRSOC, AISC, dan lainnya).",
        "Invarian fisik. Memutar, mencerminkan, atau menomori ulang sebuah model, atau mengubah satuannya, harus mengubah jawaban persis seperti yang dikatakan fisika; superposisi, resiprositas, dan keseimbangan energi harus terpenuhi. Pengujian ini sama sekali tidak memerlukan nilai acuan.",
        "Penurunan rumus. Matriks elemen portal diturunkan secara simbolik dari prinsip dasar dan dibandingkan suku demi suku dengan matriks pada kode; untuk elemen lain tersedia penurunan tertulis agar ditinjau oleh insinyur lain.",
        "Fuzzing dan pengujian mutasi. Jutaan masukan yang dibangkitkan mencari kegagalan program dan hasil tak hingga, dan kesalahan sengaja dimasukkan ke dalam kode untuk memeriksa bahwa pengujian menangkapnya."
      ]
    },
    {
      "k": "table",
      "caption": "Beberapa angka dari pekerjaan verifikasi, diambil dari dokumen di repositori.",
      "head": [
        "Apa",
        "Jumlah"
      ],
      "rows": [
        [
          "Program elemen hingga independen dalam perbandingan",
          "7"
        ],
        [
          "Kasus penerimaan dengan hasil yang dipublikasikan",
          "12"
        ],
        [
          "Nilai acuan yang dipublikasikan pada kasus-kasus tersebut",
          "105"
        ],
        [
          "Teorema Lean yang aksiomanya diperiksa oleh integrasi berkelanjutan",
          "37"
        ]
      ]
    },
    {
      "k": "note",
      "t": "105 nilai acuan tersebut sebagian besar adalah frekuensi portal gedung (SAC, IASC-ASCE, Bathe dan Wilson). Nilai-nilai itu mencakup analisis modal dan analisis linear portal dengan baik; namun bukan bukti untuk jenis analisis lain."
    },
    {
      "k": "h",
      "t": "Sertifikat: hasil dengan batas galat"
    },
    {
      "k": "p",
      "t": "Untuk hasil yang mendukungnya, Stabileo juga mengupayakan sertifikat di latar belakang: sebuah batas, dihitung dengan aritmetika interval, yang memuat solusi eksak dari sistem yang diselesaikannya. Jika tidak berhasil, hasil ditandai belum tersertifikasi beserta alasannya. Batas tersebut berlaku untuk galat numerik, bukan untuk galat diskretisasi mesh atau langkah waktu. Untuk analisis linear, kombinasi, analisis modal, dan keruntuhan plastis, matematika inti dari batas itu dibuktikan dalam Lean, sebuah asisten pembuktian yang setiap langkahnya diperiksa oleh komputer; beberapa langkah (kekangan, satu kondisi pada pemeriksaan modal) belum diformalkan. Analisis P-Delta, spektral, harmonik, dan riwayat waktu juga memiliki sertifikat, tetapi matematikanya belum diformalkan dalam Lean. Integrasi berkelanjutan menolak bukti yang tidak lengkap atau aksioma tambahan, dan untuk beberapa jenis sertifikat, pemeriksa yang dijalankan adalah kode Lean yang menjadi objek pembuktian itu sendiri."
    },
    {
      "k": "img",
      "base": "blog/certificate",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic dengan contoh portal yang sudah dihitung. Panel hasil menampilkan perpindahan titik simpul dan, di bawah Pemeriksaan hasil, “Tersertifikasi: galat perpindahan ≤ 3.41e-16” dengan tautan untuk mengunduh sertifikat, serta “Diperiksa ujung ke ujung: perakitan ulang model secara independen sesuai”.",
      "caption": "Portal yang sudah dihitung: batas sertifikat pada galat perpindahan, dan pemeriksaan ujung ke ujung, di bawah Pemeriksaan hasil."
    },
    {
      "k": "h",
      "t": "Apa yang tidak dinyatakan oleh sertifikat"
    },
    {
      "k": "ul",
      "items": [
        "Sertifikat membatasi galat penyelesaian sistem sebagaimana dirakit. Sertifikat tidak membuktikan bahwa sistem itu mewakili model: perakitan matriks kekakuan dan beban diuji dengan cara-cara di atas, tetapi tidak disertifikasi. Ketika tekuk torsi tidak ada (SA-2026-007), sertifikat mensertifikasi masalah yang salah. Sejak 0.3.0, sertifikat ujung ke ujung merakit ulang sistem secara independen untuk portal dan rangka batang, lalu memeriksa hasilnya terhadap model itu sendiri; cangkang, solid, dan konektor belum tercakup.",
        "Lean membuktikan matematikanya; bahwa kode Rust mengimplementasikan algoritma yang persis sama tidak dibuktikan, kecuali untuk pemeriksa yang berupa kode Lean.",
        "Pemeriksaan desain tersertifikasi mengevaluasi rumusnya dengan aritmetika interval, tetapi rumus itu sendiri tidak diformalkan: rumus dibandingkan dengan contoh perhitungan yang dipublikasikan bila ada, dan cakupan setiap peraturan (pasal mana, contoh mana) tercantum dalam matriks kematangan. Pasangan bata, sambungan, pondasi, dan kemampuan layan tidak disertifikasi.",
        "Tidak ada verifikasi program yang memverifikasi model. Beban, tumpuan, dan idealisasi adalah keputusan insinyur; tinjauan model memperingatkan kesalahan umum, tetapi tidak menggantikan pertimbangan profesional.",
        "Belum ada tinjauan independen oleh insinyur struktur berlisensi. Hasil CIRSOC 301 masih diberi label eksperimental."
      ]
    },
    {
      "k": "h",
      "t": "AI menyusun draf dan meninjau; AI tidak menghitung"
    },
    {
      "k": "p",
      "t": "Asisten AI menyusun draf model dari sebuah deskripsi dan meninjau model yang sudah ada, tetapi tidak menghitung hasil: angkanya berasal dari solver dan modul pemeriksaan desain aplikasi. Penjelasannya adalah teks model bahasa dan dapat keliru; nilai yang berlaku adalah yang ada di hasil. Sebelum suatu perubahan diterapkan, asisten menampilkan apa yang akan diubah, dan perubahan itu dapat diurungkan dalam satu langkah. Fitur AI mengirim deskripsi dan model ke server yang memanggil model bahasa; solver, hasil, dan pemeriksaan tidak memerlukannya dan bekerja secara luring."
    },
    {
      "k": "link",
      "slug": "the-determinism-boundary",
      "t": "Mengapa agen AI tidak boleh menghitung, dengan satu kasus nyata:"
    },
    {
      "k": "h",
      "t": "Ketika terjadi kegagalan"
    },
    {
      "k": "p",
      "t": "Cacat yang mungkin memengaruhi hasil yang sudah dipakai dipublikasikan sebagai pemberitahuan keselamatan, beserta cara mengenali model yang terdampak dan apa yang harus dilakukan sementara itu; cacat keselamatan lainnya sedang dipilah dan ditambahkan bila memang perlu. Pemberitahuan yang terbuka ditutup ketika perbaikannya sudah aktif di stabileo.com."
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Pemberitahuan keselamatan yang telah dipublikasikan beserta statusnya:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/TRUSTED_BASE.md",
      "label": "Dasar tepercaya sertifikat",
      "t": "Apa yang dibuktikan, apa yang diuji, dan apa yang dipercayai, komponen demi komponen:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/MATURITY.md",
      "label": "Matriks kematangan verifikasi",
      "t": "Untuk setiap analisis, elemen, dan peraturan desain: tingkat verifikasi yang telah dicapai dan buktinya:"
    }
  ]
};

export default body;
