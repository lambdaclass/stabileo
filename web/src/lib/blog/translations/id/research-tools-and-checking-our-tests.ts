import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Riset, alat, dan pemeriksaan pengujian kami",
  "excerpt": "Yang kami luncurkan beberapa hari terakhir: riset yang dapat dijalankan, delapan kalkulator, dan pemeriksaan pada model acuan itu sendiri. Apa yang berfungsi, apa yang salah, dan apa yang masih perlu ditinjau.",
  "blocks": [
    {
      "k": "p",
      "t": "Beberapa hari terakhir ini kami menambahkan Stabileo Research dan Stabileo Tools, serta memperketat pemeriksaan di baliknya. Stabileo adalah perangkat lunak teknik struktur gratis dan sumber terbuka dengan AI, diterbitkan oleh Ergodic Group. LambdaClass adalah lengan pengembangannya."
    },
    {
      "k": "h",
      "t": "Riset yang dapat Anda jalankan"
    },
    {
      "k": "p",
      "t": "Kami menaruh makalah teknik struktur yang telah dipublikasikan dan acuan klasik di dalam peramban, dengan penampil milik Stabileo sendiri. Setiap halaman menyatakan apa yang direproduksinya, bagaimana pemeriksaannya, dan batas perbandingannya. Kami sedang melengkapi halaman yang masih menampilkan perbandingan terbuka."
    },
    {
      "k": "img",
      "base": "blog/research",
      "w": 1600,
      "h": 1000,
      "alt": "Halaman Stabileo Research, “Riset dalam teknik struktur”, dengan catatan “Riset, bukan alat desain” dan entri pertama yang dapat dijalankan, portal Lee (1968), ditampilkan dengan jalur bebannya yang ditelusuri.",
      "caption": "stabileo.com/research: setiap halaman menyatakan apa yang direproduksinya dan bagaimana pemeriksaannya."
    },
    {
      "k": "p",
      "t": "Halaman makalah yang sudah aktif mencakup fraktur medan fase Shauer (2025); jaringan pegas Grossman dan Boudaoud (2026); optimasi topologi Andreassen dkk. (2011); stabilitas portal Roorda Ferrari dan Sigmund (2025); pencarian bentuk jaring kabel Pastrana dkk. (2026); busur lompat Zmyślony, Khan, dan Biggins (2026); dan gridshell Fairclough dkk. (2026)."
    },
    {
      "k": "p",
      "t": "Klasik mesin adalah MacNeal–Harder, rintangan cangkang, elastika Mattiasson, Riks/Crisfield, Newmark, CQC, keruntuhan plastis, pelat Navier, portal Lee, dan busur DaDeppo–Schmidt. Halaman membedakan perhitungan langsung dari pemutaran ulang rekaman dan menampilkan batas perbandingannya. Perbandingan Koiter oleh Ferrari belum selesai; Fairclough mencakup satu contoh dengan lima titik simpul; lompatan keseimbangan pada busur lompat bukan simulasi transien."
    },
    {
      "k": "p",
      "t": "Kami mempublikasikan cakupan dan buktinya, serta meninjaunya secara terbuka. Hasil riset bukan hasil desain, dan kesesuaian dengan acuan bukanlah sertifikasi."
    },
    {
      "k": "table",
      "caption": "Aktif hari ini:",
      "head": [
        "Penawaran",
        "Jumlah"
      ],
      "rows": [
        [
          "Halaman makalah yang dapat dijalankan",
          "7"
        ],
        [
          "Halaman acuan mesin",
          "10"
        ],
        [
          "Kalkulator",
          "8"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Pengujiannya pun perlu diperiksa"
    },
    {
      "k": "p",
      "t": "Beberapa halaman keliru karena model uji kami keliru. Setiap halaman acuan mesin dan pengujian CI mesinnya kini membaca berkas kasus yang sama, sehingga perbaikan model memperbarui keduanya. Beberapa perbandingan sementara tetap diabaikan secara eksplisit di CI dan belum menghalangi penggabungan; kami sedang melengkapi perbandingan tersebut."
    },
    {
      "k": "p",
      "t": "Kami memperbaiki acuan Mattiasson dan penanganan perpanjangan aksial (#845), portal berhubungan kaku yang dibandingkan dengan rumus rangka batang aksial saja (#846), dan model tumpuan serta pembebanan cangkang yang salah (#810). Kami mengubah cara acuan dibangun agar jenis kesalahan ini tidak dapat lolos lagi. Bagian pertamanya sudah masuk: setiap acuan adalah spesifikasi dengan dua acuan independen yang harus sesuai, dan pemeriksaan otomatis atas beban yang bekerja, keseimbangan reaksi, dan simetri, termasuk model setengah terhadap model penuh. Kami menambahkan konvergensi pada tiga mesh atau lebih, uji kesalahan tanda yang membuktikan setiap acuan dapat gagal, dan pengesahan oleh insinyur untuk set inti."
    },
    {
      "k": "img",
      "base": "blog/research-mattiasson",
      "w": 1600,
      "h": 1000,
      "alt": "Halaman acuan elastika kantilever Mattiasson (1981), tab Hasil: grafik u/L dan v/L terhadap PL²/EI dengan kurva Stabileo dan lingkaran untuk acuan analitis, serta tabel nilai beserta galat relatifnya. Di sebelah kiri, “5 dari 5 pemeriksaan lolos” dan “Riset, bukan alat desain”.",
      "caption": "Halaman Mattiasson yang telah diperbaiki: respons mesin terhadap dua acuan analitis independen."
    },
    {
      "k": "p",
      "t": "Kami juga membangun satuan ke dalam sistem tipe (#864), sehingga kekeliruan kN/N atau m/mm tertangkap saat kompilasi. Bagian pertamanya, untuk jalur material dan penampang portal 2D, masuk pada 3 November."
    },
    {
      "k": "h",
      "t": "Putaran 2: setiap halaman ditinjau lagi"
    },
    {
      "k": "p",
      "t": "Setiap halaman riset yang aktif kemudian menjalani tinjauan kedua oleh tiga model AI secara bergantian (Kimi, lalu Codex, lalu Claude), dan setiap temuan yang dapat kami verifikasi diperbaiki. Lima belas halaman direvisi bersama dan dipublikasikan pada 4 November (#1068): enam makalah (Shauer, Pastrana, Ferrari, Zmyślony, Grossman, dan Fairclough) dan sembilan acuan mesin (Newmark, Riks/Crisfield, Navier, Lee, MacNeal–Harder, DaDeppo–Schmidt, contoh keruntuhan plastis menurut Horne, SRSS/CQC, dan Mattiasson, yang menjalani putaran ketiga). Tidak ada toleransi yang dilonggarkan dan tidak ada pengujian yang dihapus. Tinjauan oleh insinyur praktisi masih akan menyusul."
    },
    {
      "k": "ul",
      "items": [
        "MacNeal–Harder membandingkan nilai absolut, sehingga hasil dengan tanda yang salah akan lolos. Kini acuan membawa tandanya, dan sebuah pengujian menolak respons yang terbalik untuk setiap kasus.",
        "Riks/Crisfield dapat melaporkan titik batas tanpa penurunan beban. Kini suatu batas memerlukan penurunan di antara langkah yang konvergen; halaman menyatakan bahwa proses melewati titik batas atas, bukan “menelusuri snap-through”, dan toleransinya turun dari 5 % menjadi antara 5e-3 dan 1e-5.",
        "Navier menjelaskan galat MITC4 alih-alih mengukurnya. Kini dibandingkan dengan deret Reissner–Mindlin independen, dan galat MITC4 tumpuan keras turun dari −1,951 % pada 4×4 menjadi −0,036 % pada 32×32, dengan orde kedua.",
        "Halaman menyatakan dengan apa ia dibandingkan. Newmark diperiksa terhadap solusi bentuk tertutup eksak, bukan “kode penulisnya”; SRSS/CQC adalah ilustrasi metode, bukan reproduksi gedung pada makalahnya; batas keruntuhan plastis adalah penurunan manual kami sendiri, bukan kutipan; acuan 1,83 kN pada portal Lee adalah pembacaan dari gambar yang dipublikasikan, sehingga hanya perbedaan persen bulat yang diklaim."
      ]
    },
    {
      "k": "h",
      "t": "Di ponsel dan tablet"
    },
    {
      "k": "p",
      "t": "Diukur pada situs aktif, halaman riset tidak meluap pada ponsel, tetapi eksperimen berada di bawah seluruh artikel, penampil sempit (356×189 px untuk pelat persegi), dan setiap halaman memiliki 25 hingga 40 kontrol di bawah 32 px serta 14 hingga 20 teks di bawah 12 px. Sekarang eksperimen berada tepat setelah judul, penampil disesuaikan dengan model, kontrol minimal 44 px dan teks minimal 12 px (#831)."
    },
    {
      "k": "img",
      "base": "blog/research-phone",
      "w": 1600,
      "h": 1000,
      "alt": "Dua tangkapan layar ponsel Stabileo Research berdampingan, lebar 390 px. Di kiri, halaman jaring kabel menurut Pastrana dkk. (2026), “Empat kabel, satu keseimbangan”, dengan penampil tepat di bawah judul; di kanan, acuan pelat Navier, yang penampilnya memenuhi lebar layar dan menampilkan perpindahan pelat ke bawah.",
      "caption": "Riset di ponsel: eksperimen setelah judul, dan penampil selebar layar."
    },
    {
      "k": "p",
      "t": "Pemeriksaan permanen merender galeri dan setiap halaman yang dapat dijalankan pada 360, 390, 844×390, dan 810 px, dalam bahasa Spanyol, Inggris, dan Portugis, dan gagal bila terjadi luapan horizontal, kontrol kecil, teks kecil, atau penampil yang hilang, terlalu kecil, atau terlalu jauh di bawah. Eksekusi pertamanya menemukan bug nyata, dan tata letaknya diperbaiki, bukan pemeriksaannya: penampil Mattiasson setinggi 187 px pada ponsel lanskap dan kini 280 px, dan sebuah plot konvergensi mencetak labelnya pada 9 px. Uji reflow menemukan bahwa tab Shauer meluap dalam bahasa Portugis dan Turki pada 360 px."
    },
    {
      "k": "h",
      "t": "Delapan kalkulator, dengan jalan masuk ke editor"
    },
    {
      "k": "p",
      "t": "Stabileo Tools kini memiliki kalkulator gratis untuk balok tumpuan sederhana, kantilever, tekuk kolom elastis, balok menerus, portal satu bentang, rangka batang bidang, garis pengaruh beban bergerak, dan frekuensi lentur balok. Kalkulator memakai mesin produksi, menampilkan perbandingan klasik independen, dan menyatakan asumsinya. Masing-masing membuka modelnya di editor penuh. Semuanya adalah alat analisis, bukan pemeriksaan desain peraturan yang lengkap."
    },
    {
      "k": "img",
      "base": "blog/tools",
      "w": 1600,
      "h": 1000,
      "alt": "Halaman Stabileo Tools, “Kalkulator teknik gratis”, dibuka dengan kalkulator balok tumpuan sederhana: balok dengan beban merata beserta bentuk terdeformasinya dan tombol Buka.",
      "caption": "stabileo.com/tools: delapan kalkulator pada mesin produksi."
    },
    {
      "k": "h",
      "t": "Menangani hasil yang keliru"
    },
    {
      "k": "p",
      "t": "Kami menangani setiap masalah hasil keliru yang diketahui: penolakan atau peringatan pada mesin membawa ID masalah yang diketahui, alih-alih mengembalikan angka yang belum diperiksa (#807, digabungkan pada 5 November). Setiap penolakan diuji, termasuk model dinamik yang tidak didukung dengan offset batang atau cangkang."
    },
    {
      "k": "p",
      "t": "Pengujian metamorfik menyingkap bug invariansi: model yang setara dapat ditolak setelah diputar, dicerminkan, atau diskalakan satuannya. Kini kami menjalankan rangkaian metamorfik pada setiap perubahan untuk menangkap regresi ini. Kami menambahkan eksekusi malam atas model acak yang mengelompokkan temuan menurut akar masalah dan membuat satu isu untuk setiap akar masalah."
    },
    {
      "k": "h",
      "t": "Sejak itu: 1 sampai 3 November"
    },
    {
      "k": "ul",
      "items": [
        "Mode analisis PRO sudah selesai. Hasil yang keliru tanpa peringatan diperbaiki: generator beban tidak lagi membebani tepi atap gudang sebagai lantai, dan berat seismik suatu level kini mencakup pelat lantai dan dinding yang digambar sebagai cangkang, yang sebelumnya terlewat (#1076).",
        "Ekspor bekerja pada gedung nyata. Lembar Excel besar ditulis baris demi baris, dan laporan gedung enam tingkat memerlukan sekitar sepuluh detik, bukan empat menit. “Periksa laporan yang diekspor” kini membandingkan angka yang tercetak, bukan hanya sidik jarinya (#1076).",
        "PRO mendapat bantuan sebaris yang dapat dimatikan, status penyimpanan di header, laporan setelah analisis, hasil pelat, dan penampil baca-saja untuk model bersama dengan “Duplikat dan ubah” (#1077, #1078).",
        "Faktor tekuk di atas batas atasnya yang tersertifikasi secara independen kini ditolak, dalam 2D dan 3D (#817, versi hasil 6). Jalankan ulang sertifikasi sebelum mengandalkan sertifikat tekuk sebelumnya.",
        "Tautan berbagi dengan angka tak hingga, atau dengan batang, tumpuan, atau beban yang menunjuk ke sesuatu yang hilang, ditolak alih-alih dibuka (#1058).",
        "Rangkaian invariansi kini memeriksa enam analisis prioritas pada rotasi, pencerminan, dan superposisi, dan empat di antaranya pada penskalaan kekakuan seragam (#1060)."
      ]
    },
    {
      "k": "h",
      "t": "Pemeriksaan yang menjawab dalam dua puluh menit"
    },
    {
      "k": "p",
      "t": "Sebelum mencapai main, setiap perubahan pada Stabileo melewati pemeriksaan yang dapat dipengaruhinya, dan perubahan pada mesin melewati semuanya: pengujian mesin, pengujian unit web, build produksi, pengujian ujung ke ujung di peramban, snapshot hasil, dan pemeriksaan determinisme. Perbaikan keselamatan hanya secepat pemeriksaan itu, sehingga pada 4 November kami mengerjakan kecepatannya. Kami mengukur dulu. Pada eksekusi antrean penggabungan bersih selama 44 hingga 47 menit, pengujian mesin dan unit selesai 8 hingga 15 menit sebelum akhir, sehingga menambah lebih banyak secara paralel tidak akan menghasilkan apa-apa. Waktunya habis untuk membangun bundel riset satu per satu, dan pada shard ujung ke ujung yang paling lambat. Setelah semuanya lebih pendek, shard paling lambat itu lambat karena persiapan: pada satu eksekusi, ia memakai 7,2 dari 16 menitnya untuk pengujian dan enam setengah menit untuk mengunduh paket peramban dari mirror yang lambat."
    },
    {
      "k": "ul",
      "items": [
        "Bangun sekali, uji apa yang dibangun. Pengujian build produksi membuat lima build lagi sendiri, empat di antaranya dari pohon yang sama dengan yang baru dibangun CI; keempatnya kini membaca build itu (#1411). Setiap build membawa cap dari semua yang menjadi bahan pembuatannya, dan pengujian gagal, tidak pernah dilewati, bila cap tidak cocok dengan pohon tempatnya berjalan.",
        "Cache menurut masukan. Setiap bundel riset di-cache dengan kunci berupa masukannya sendiri, termasuk mesin yang ditautkan setiap bundel, sehingga perubahan pada satu makalah hanya membangun ulang makalah itu dan perubahan pada mesin membangun ulang semuanya. Pull request memakai ulang bundel yang sudah dibangun antrean penggabungan dari masukan yang sama, setelah memeriksa setiap berkas terhadap checksum-nya, dan dapat membaca cache itu tetapi tidak pernah menulisnya (#1395). Paket peramban juga berasal dari cache, bukan dari mirror (#1413).",
        "Jalankan hanya yang dapat dipengaruhi perubahan. Perubahan pada dokumentasi tidak membangun apa pun, dalam satu atau dua menit alih-alih satu eksekusi penuh. Perubahan pada situs saja melewati pekerjaan mesin tetapi mempertahankan setiap shard ujung ke ujung, karena 59 dari 281 spesifikasi membaca teks di layar (#1381). Dalam antrean, setiap entri dibatasi oleh diff-nya sendiri terhadap entri di depannya, yang sah karena sebuah entri digabungkan hanya bila setiap entri di depannya lolos; bila diff tidak ada atau tidak jelas, semuanya dijalankan (#1400).",
        "Seimbangkan jalur paling lambat. Pengujian ujung ke ujung berjalan pada 14 shard, bukan 10, diseimbangkan menurut waktu terukur (#1382). Tabel waktu lama memperkirakan 41,5 menit pengujian padahal satu eksekusi memakan 69,8."
      ]
    },
    {
      "k": "table",
      "caption": "Waktu dinding eksekusi CI sukses yang menjalankan setiap pekerjaan, dari pembuatan hingga pekerjaan terakhir, diukur dengan API GitHub Actions. Sebelum: 4 November, dari 08:00 UTC (pull request) atau 13:48 UTC (antrean penggabungan) hingga 21:10 UTC; sesudah: dari 21:15 UTC hingga 03:00 UTC pada 5 November.",
      "head": [
        "Eksekusi",
        "Jumlah",
        "Median",
        "Rentang"
      ],
      "rows": [
        [
          "Antrean penggabungan, sebelum",
          "20",
          "42 mnt",
          "25 sampai 56 mnt"
        ],
        [
          "Antrean penggabungan, sesudah",
          "10",
          "20 mnt",
          "15 sampai 26 mnt"
        ],
        [
          "Pull request (percobaan pertama), sebelum",
          "69",
          "59 mnt",
          "35 sampai 127 mnt"
        ],
        [
          "Pull request (percobaan pertama), sesudah",
          "19",
          "27 mnt",
          "16 sampai 45 mnt"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Pemeriksaan merah yang bukan salah perubahan"
    },
    {
      "k": "p",
      "t": "Kegagalan akibat jaringan atau mesin yang hilang hanyalah gangguan, tetapi itu juga pemeriksaan merah yang harus dilihat seseorang, dan kebiasaan menjalankan ulang pemeriksaan merah adalah cara kegagalan nyata lolos begitu saja. Karena itu, pekerjaan yang gagal pada pull request dijalankan ulang satu kali, secara otomatis, hanya bila setiap pekerjaan yang gagal membawa bukti positif kegagalan infrastruktur: batas waktu pada langkah unduh, mesin CI yang hilang di tengah pekerjaan, galat jaringan yang mengakhiri percobaan terakhir sebuah unduhan (#1380). Apa pun yang tampak seperti kegagalan pengujian di mana pun dalam log menghalangi eksekusi ulang, begitu pula apa pun yang tidak dikenali pengklasifikasi. Itu menjaganya tetap konservatif: ia menjalankan ulang paling banyak satu kali dan tidak pernah setelah langkah pengujian yang gagal. Itu bukan jaminan: kegagalan intermiten yang disalahbaca pengklasifikasi sebagai infrastruktur dapat lolos pada eksekusi ulang, itulah sebabnya apa pun yang tidak dikenalinya menghalangi eksekusi ulang."
    },
    {
      "k": "p",
      "t": "Dua perbaikan lagi menghapus alarm palsu. Eksekusi pull request yang dibatalkan karena eksekusi lebih baru pada commit yang sama menggantikannya dulu menampilkan pemeriksaan wajib berwarna merah; kini pemeriksaan itu dilewati, tetapi hanya setelah memastikan bahwa eksekusi yang lebih baru ada dan tidak gagal, karena pemeriksaan wajib yang dilewati dihitung lolos (#1397). Dan unduhan yang macet dapat membuat sebuah proses memegang kunci manajer paket, sehingga percobaan ulang gagal pada kunci, bukan pada unduhan; kini suatu percobaan dianggap macet hanya setelah beberapa menit tanpa keluaran, dihentikan bersama semua yang dimulainya, dan percobaan ulang menunggu kunci (#1408)."
    },
    {
      "k": "h",
      "t": "Langkah selanjutnya"
    },
    {
      "k": "p",
      "t": "Kami melengkapi perbandingan yang masih terbuka dan membuat situs serta solver lebih cepat. Berikutnya pada peta jalan adalah paket Python (pip install stabileo) dan manual verifikasi publik yang dibangkitkan dari acuan-acuan tersebut."
    }
  ]
};

export default body;
