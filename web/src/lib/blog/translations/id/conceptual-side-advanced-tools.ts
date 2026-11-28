import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Apa yang dihitung perangkat lunak gratis, dan apa yang tidak dijelaskannya",
  "excerpt": "Ada perangkat lunak struktur gratis, dan kualitasnya baik: ia memodelkan, menghitung, menampilkan hasil. Yang tidak kami temukan adalah perangkat lunak yang mendekati alat-alat lanjutan dari sisi konseptual.",
  "blocks": [
    {
      "k": "p",
      "t": "Sebaiknya kita mulai dari apa yang sudah ada: jumlahnya banyak, dan kualitasnya baik. Siapa pun yang mengajar struktur saat ini memiliki alat gratis kelas satu, dan beberapa di antaranya menjalankan tugasnya lebih baik daripada kami."
    },
    {
      "k": "h",
      "t": "Apa yang sebenarnya dicakup alat gratis"
    },
    {
      "k": "table",
      "caption": "Alat analisis struktur gratis, dan apa yang mereka tunjukkan selain hasilnya.",
      "head": [
        "Alat",
        "Gratis",
        "Apa yang dikerjakan dengan sangat baik",
        "Sisi konseptual"
      ],
      "rows": [
        [
          "Ftool",
          "Ya",
          "Memodelkan portal bidang serta membaca diagram dan garis pengaruh, dengan kelancaran yang jarang tertandingi",
          "Menunjukkan perilakunya, bukan penalaran di baliknya"
        ],
        [
          "MASTAN2",
          "Ya (di MATLAB atau runtime-nya)",
          "Analisis matriks linear dan nonlinear, terkait dengan McGuire, Gallagher, dan Ziemian",
          "Teorinya ada di buku; programnya menjalankan analisis"
        ],
        [
          "SkyCiv",
          "Tingkat gratis",
          "Hitungan tangan langkah demi langkah: benda bebas, persamaan keseimbangan sebelum substitusi, distribusi momen untuk balok statis tak tentu",
          "Angka dimasukkan ke dalam rumus, untuk statika dasar"
        ],
        [
          "sectionproperties",
          "Ya, sumber terbuka",
          "Pilin, pusat geser, dan konstanta Saint-Venant dengan elemen hingga",
          "Pustaka Python: ia mengembalikan angka, tanpa antarmuka dan tanpa penjelasan"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Dari daftar itu, SkyCiv paling mendekati apa yang biasa kami sebut \"menunjukkan langkah pengerjaan\", dan harus dikatakan terus terang: hitungan tangannya bagus. Ia menggambar benda bebas, menulis ΣM = 0 sebelum angka apa pun dimasukkan, dan menyelesaikan dengan distribusi momen ketika baloknya statis tak tentu. Siapa pun yang mengklaim bahwa tidak ada program gratis yang menunjukkan langkahnya dapat dibantah dengan SkyCiv dalam sekitar satu menit."
    },
    {
      "k": "h",
      "t": "Menunjukkan langkah saja tidak cukup jika program tidak memberi tahu kapan rumus berhenti berlaku"
    },
    {
      "k": "p",
      "t": "Memasukkan angka ke rumus yang benar dan menjelaskan mengapa rumus itu yang tepat adalah dua hal yang berbeda. Yang pertama menghemat aritmetika Anda. Yang kedua menyelamatkan Anda dari kesalahan yang tidak dapat ditangkap aritmetika, karena kesalahan itu berada satu lapisan di atasnya."
    },
    {
      "k": "p",
      "t": "Kalkulator torsi yang ada di internet menggambarkan hal ini secara terbalik: Anda memilih jenis penampang (pejal, tabung tertutup, persegi panjang) dan program menerapkan rumus yang sesuai. Tidak satu pun yang kami lihat memberi tahu bahwa pilihan Anda keliru, apa yang akan diberikan teori lain, atau di sisi mana dari kesalahan Anda berada."
    },
    {
      "k": "quote",
      "t": "Program yang hanya menghitung tidak akan pernah memperingatkan Anda bahwa Anda sedang menghitung hal yang salah."
    },
    {
      "k": "h",
      "t": "Tiga fitur yang tidak kami temukan padanannya"
    },
    {
      "k": "ul",
      "items": [
        "Analisis kinematik, dengan penjelasan. Kami mencari dan tidak menemukan alat gratis yang melakukan ini: yang muncul adalah materi kuliah dalam PDF. \"Perangkat lunak edukasi untuk analisis kinematik\" yang kami temukan ditujukan untuk mekanisme mesin (penghubung dan engkol), bukan untuk mengklasifikasikan struktur.",
        "Detailing tulangan. Satu-satunya pilihan gratis yang kami temukan adalah AutoRebar, dan itu adalah add-on AutoCAD, sehingga menggunakan bagian gratisnya memerlukan lisensi yang mahal. Ia juga bekerja dari gambar Anda: Anda menempatkan batang, ia menyusun daftar tulangan. Selebihnya adalah uji coba tujuh hari atau perangkat lunak komersial. Kami tidak menemukan pilihan sumber terbuka.",
        "Analisis penampang, dengan penjabaran. Di sini ada pilihan gratis yang serius, sectionproperties, dan untuk pilin dengan elemen hingga ia mungkin mengalahkan kami. Tetapi ia adalah pustaka tanpa antarmuka: ia memberi Anda pusat geser tanpa menjelaskan mengapa letaknya di situ."
      ]
    },
    {
      "k": "p",
      "t": "Di antara alat yang kami tinjau, tidak ada yang mencakup dua dari ketiganya, dan kami tidak menemukan satu pun yang mendekati bahkan salah satunya dari sisi konseptual. Itulah kesenjangan yang kami lihat, dan ia lebih sempit dan lebih tepat daripada \"hanya kami yang mengajar\"."
    },
    {
      "k": "h",
      "t": "Satu layar yang menunjukkan seluruh perbedaannya"
    },
    {
      "k": "p",
      "t": "Di bawah ini adalah balok dua bentang di atas tiga tumpuan. Ketiganya hanya menahan gerak vertikal. Ini kasus buku teks, dan juga kasus yang paling sering saya lihat diterima sebagai benar dalam ujian."
    },
    {
      "k": "p",
      "t": "Rumus derajat ketidaktentuan memberikan GH = 3·m + r − 3·n − c = 3×2 + 3 − 3×3 − 0 = 0. Nol berarti statis tertentu, dan program mana pun yang berhenti pada rumus akan melaporkan persis itu. Tetapi tidak ada yang menahan balok secara horizontal: ia adalah mekanisme, dan tidak dapat diselesaikan."
    },
    {
      "k": "table",
      "caption": "Apa yang dikembalikan analisis kinematik pada balok itu, langkah demi langkah.",
      "head": [
        "Langkah",
        "Yang ditinjau",
        "Hasil"
      ],
      "rows": [
        [
          "2 · Ketidaktentuan statis",
          "GH = 3·m + r − 3·n − c",
          "0"
        ],
        [
          "3 · Matriks kekakuan",
          "Ragam mekanisme terdeteksi",
          "1"
        ],
        [
          "3 · Matriks kekakuan",
          "Derajat kebebasan yang tidak terkekang",
          "1"
        ],
        [
          "4 · Saran",
          "Putusan di layar",
          "Tidak dapat diselesaikan"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Aplikasi tidak sekadar melaporkan angka nol lalu cuci tangan. Ia membantahnya pada langkah 2 yang sama yang menghasilkannya: \"Rumus memberikan GH = 0 (syarat perlu untuk statis tertentu), tetapi TIDAK cukup\". Langkah 3 menyusun matriks kekakuan global, di sini berukuran 6×6, dan menandai \"Terdeteksi 1 ragam mekanisme\" meskipun GH = 0 ≥ 0. Ia menyebut titik simpul 3 dan perpindahan horizontalnya, menunjukkan bahwa persamaan langkah 2 menghitung kekangan tanpa memeriksa letaknya, dan menutup dengan \"✗ Mekanisme — tidak dapat diselesaikan\"."
    },
    {
      "k": "img",
      "base": "blog/hidden-mechanism",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic dengan balok dua bentang pada tiga rol horizontal di bawah 10 kN/m. Panel analisis kinematik menunjukkan GH = 3·2 + 3 − 3·3 = 0, dan sebuah pesan berbunyi “Struktur tidak stabil (mekanisme): tidak ada kekangan horizontal pada tumpuan mana pun”.",
      "caption": "Balok yang sama di aplikasi: rumus memberikan nol, dan solver tetap menolaknya sebagai mekanisme."
    },
    {
      "k": "embed",
      "query": "example=hidden-mechanism&kin=1",
      "label": "Balok pada tiga tumpuan vertikal, dengan panel analisis kinematik terbuka. Ikuti keempat langkahnya: langkah kedua memberikan GH = 0 dan langkah ketiga menemukan mekanisme yang disembunyikan oleh nol itu. Coba ganti satu tumpuan dengan tumpuan sendi lalu jalankan lagi: derajatnya menjadi 1 dan mekanismenya hilang."
    },
    {
      "k": "h",
      "t": "Mengapa sebuah jurusan mungkin peduli"
    },
    {
      "k": "p",
      "t": "Mahasiswa yang mempelajari rumus derajat tetapi tidak pernah melihat syarat cukupnya gagal pulang dengan aturan yang tidak lengkap dan tidak menyadarinya. Hal ini sulit ditunjukkan di papan tulis, karena contoh yang mematahkannya tampak seperti salah ketik. Di sini ia ada di satu layar, dengan angka dan kontradiksinya berdampingan."
    },
    {
      "k": "p",
      "t": "Tidak ada yang perlu dipasang atau dilisensikan, dan jurusan tidak perlu membeli apa pun. Aplikasi dibuka di peramban, dan model dibagikan sebagai tautan."
    },
    {
      "k": "note",
      "t": "Agar jelas: tidak satu pun dari ini berarti kami lebih baik. Ftool memodelkan lebih cepat dan dengan hambatan lebih sedikit daripada kami. MASTAN2 didukung buku teks yang tidak kami tulis. Hitungan tangan SkyCiv disajikan lebih baik daripada beberapa panel kami. Dan sectionproperties menyelesaikan pilin dengan elemen hingga sementara kami melakukan pendekatan. Klaim kami lebih sempit dan cukup spesifik: di antara alat gratis yang kami tinjau, tidak ada yang mendekati alat-alat lanjutan dari sisi konseptual. Jika Anda mengetahui alat gratis yang menjelaskan analisis kinematik, menghasilkan daftar tulangan, atau menjabarkan analisis penampang, tulis kepada kami dan kami akan mengoreksi tulisan ini."
    }
  ]
};

export default body;
