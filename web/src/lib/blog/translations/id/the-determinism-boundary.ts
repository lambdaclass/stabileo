import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Batas determinisme: mengapa agen AI tidak boleh melakukan aritmetika",
  "excerpt": "Model bahasa tidak dapat menjamin bahwa sebuah angka benar. Dalam arsitektur yang kami usulkan untuk rekayasa struktur, agen menafsirkan dan mengusulkan, sedangkan setiap angka berasal dari solver yang telah diverifikasi.",
  "blocks": [
    {
      "k": "p",
      "t": "Selama puluhan tahun, perangkat lunak komersial telah membuat bagian murni numerik dari analisis struktur menjadi cepat. Menyusun matriks kekakuan dan menyelesaikan sistem linear adalah masalah yang sudah dipahami dengan baik, dan murah untuk dihitung. Waktu insinyur habis di tempat lain: membangun model, membangunnya ulang setiap kali arsitekturnya berubah, mendefinisikan beban dan kombinasi, memeriksa setiap elemen terhadap peraturan desain, serta menyusun laporan perhitungan dan gambar."
    },
    {
      "k": "p",
      "t": "Hambatannya adalah pekerjaan manual di sekitar perhitungan itu. Membangun, mengubah, memeriksa, dan mendokumentasikan model adalah bagian yang dapat dibantu oleh agen AI, dengan satu syarat: agen tidak boleh menyentuh perhitungannya sendiri."
    },
    {
      "k": "h",
      "t": "Apa yang tidak dapat dijamin oleh model bahasa"
    },
    {
      "k": "p",
      "t": "Model bahasa menghasilkan teks secara probabilistik. Ia tidak memiliki pengetahuan tentang fisika atau tentang perilaku sistem nyata, dan ia dapat berhalusinasi: menghasilkan jawaban yang terdengar masuk akal padahal tidak masuk akal. Dalam analisis struktur, risikonya nyata. Pemodelan menuntut penalaran spasial dan konsistensi topologi, dan ketika model dibangun dalam beberapa langkah, kesalahan menumpuk."
    },
    {
      "k": "p",
      "t": "Namun kendala terkuat datang dari praktik profesional. Setiap hasil struktur ditandatangani, dengan kepengarangan dan tanggung jawab hukum yang menyertai sebuah tanda tangan. Angka yang menentukan ukuran sebuah kolom adalah komitmen insinyur berlisensi yang mengesahkannya. Agen yang menyerahkan hasil tanpa pemeriksaan membuat profesional menanggung risiko menandatangani perhitungan yang tidak diverifikasi siapa pun."
    },
    {
      "k": "quote",
      "t": "Kebenaran harus menjadi sifat solver, bukan sifat bahasa."
    },
    {
      "k": "h",
      "t": "Batas determinisme"
    },
    {
      "k": "p",
      "t": "Arsitektur ini memisahkan penalaran dalam bahasa alami dari komputasi numerik. Agen mengusulkan desain dan skenario, tetapi sebuah hasil baru dianggap sah setelah keluar dari program yang tidak dapat diubah oleh agen, yaitu program yang mengodekan fisika masalahnya. Model memilih alat deterministik mana yang dipanggil dan dengan parameter apa, lalu bekerja dengan apa pun yang dikembalikan alat itu. Model tidak pernah menghasilkan angka sendiri dan tidak pernah mengarang geometri."
    },
    {
      "k": "p",
      "t": "Dalam praktiknya ada tiga lapisan. Lapisan maksud adalah agen: ia menafsirkan bahasa alami, mengajukan pertanyaan klarifikasi, dan mengeluarkan aksi bertipe. Lapisan komputasi deterministik memuat semua yang menghasilkan data rekayasa: solver, modul CIRSOC yang menjalankan pemeriksaan peraturan desain, dan generator yang mengembangkan sebuah tipologi struktur menjadi model lengkap. Lapisan dokumentasi menghasilkan laporan, gambar, dan rincian volume dari hasil yang sudah dihitung."
    },
    {
      "k": "p",
      "t": "Ini bukan pola baru. Pola ini mendominasi literatur terbaru tentang agen rekayasa dan muncul di bidang-bidang sekitarnya: agen pemrograman bekerja karena kompilator dan rangkaian uji memberi tahu mereka apakah kode berhasil dibangun dan lulus, dan AlphaProof membuktikan teorema karena pemverifikasi formal tidak meloloskan satu kesalahan pun. Kami mengadopsinya dengan sengaja sebagai prinsip desain."
    },
    {
      "k": "h",
      "t": "Apa yang dijamin oleh batas ini, dan apa yang berada di luarnya"
    },
    {
      "k": "p",
      "t": "Perlu dijelaskan secara spesifik apa yang dijamin oleh batas ini dan apa yang tidak tercakup. Yang dijamin:"
    },
    {
      "k": "ul",
      "items": [
        "Setiap angka yang disebutkan agen dapat dilacak ke hasil solver tertentu: kombinasi, titik tinjau, elemen.",
        "Setiap keluaran AI divalidasi terhadap skema model sebelum diimpor, dan ditolak jika bentuknya salah atau memuat bidang yang tidak dikenal.",
        "Jika layanan AI mati, solver, editor, dan pemeriksaan peraturan desain tetap berfungsi."
      ]
    },
    {
      "k": "p",
      "t": "Yang tidak dijamin: bahwa model yang diidealisasi adalah model yang tepat untuk masalah nyata (itu keputusan rekayasa), bahwa desainnya optimal, bahwa beban dan asumsinya lengkap, atau bahwa pembacaan peraturan tidak perlu ditinjau."
    },
    {
      "k": "note",
      "t": "Batas ini memungkinkan Anda mengendalikan dari mana setiap hasil berasal; ia tidak menjamin bahwa model yang Anda susun mewakili masalah nyata dengan benar. Agen bekerja seperti asisten penggambaran: ia mengusulkan perubahan, pengguna melihat ringkasan apa yang akan diubah dan dapat menerapkan, mencoba lagi, atau membatalkannya. Setiap perubahan yang diterapkan menjadi satu langkah urungkan."
    },
    {
      "k": "h",
      "t": "Kasus ketika model harus diselesaikan ulang"
    },
    {
      "k": "p",
      "t": "Insinyur menggambarkan portal beton bertulang dengan bentang 6 m dan tinggi 4 m, tumpuan jepit di dasar, dan beban merata pada balok. Agen menanyakan apa yang belum ada: baja atau beton? Dasar jepit atau sendi? Ada beban lateral? Setelah itu ia mengeluarkan aksi yang membuat portal tersebut. Backend mengembangkannya secara deterministik menjadi model dengan 4 titik simpul, 3 elemen, dan 6 derajat kebebasan bebas. Desainnya memakai beton H-21, balok 25×40 cm sebagai awal, kolom 30×30 cm, dan 30 kN/m pada balok."
    },
    {
      "k": "p",
      "t": "Setelah model diselesaikan, setiap kolom menerima reaksi vertikal 90 kN dan keseimbangan global terpenuhi secara tepat: ΣRz = 180 kN = q·L. Momen balok yang menentukan adalah Mu = 80,8 kN·m di tengah bentang. Pemeriksaan lentur CIRSOC 201 untuk balok 25×40 dengan 3Ø16 memberikan kapasitas φMn = 73,3 kN·m, sehingga balok tidak memenuhi pemeriksaan."
    },
    {
      "k": "img",
      "base": "blog/determinism-portal",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic dengan portal beton selebar 6 m dan setinggi 4 m pada tumpuan jepit, diselesaikan di bawah 30 kN/m pada balok. Diagram momen lentur menunjukkan 80,8 kN·m di tengah bentang, −54,2 kN·m di ujung balok, dan 27,0 kN·m di dasar kolom.",
      "caption": "Portal dari bagian ini di Stabileo (H-21, kolom 30×30, balok 25×40): solver memberikan momen tengah bentang 80,8 kN·m seperti dikutip di atas."
    },
    {
      "k": "table",
      "caption": "Pemeriksaan lentur balok portal, sebelum dan sesudah koreksi.",
      "head": [
        "Kondisi",
        "Penampang",
        "Tulangan",
        "Mu [kN·m]",
        "φMn [kN·m]",
        "D/C",
        "Memenuhi"
      ],
      "rows": [
        [
          "Awal",
          "25×40 cm",
          "3Ø16",
          "80.8",
          "73.3",
          "1.10",
          "Tidak"
        ],
        [
          "Dikoreksi",
          "30×55 cm",
          "3Ø16",
          "105.6",
          "108.6",
          "0.97",
          "Ya"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Perhatikan kolom Mu. Memperbesar balok dari 25×40 menjadi 30×55 menaikkan gaya yang bekerja dari 80,8 menjadi 105,6 kN·m. Pada portal statis tak tentu, statika menetapkan jumlah momen ujung dan momen tengah bentang; kekakuan hanya mengubah cara jumlah itu dibagi. Balok yang lebih kaku relatif terhadap kolomnya mendapat kekangan ujung yang lebih kecil dari kolom dan berperilaku lebih mirip balok sederhana, sehingga momen tengah bentangnya, yang menentukan di sini, naik."
    },
    {
      "k": "quote",
      "t": "Agen yang memperkirakan efeknya tanpa menyelesaikan ulang akan keliru, dan terdengar sama meyakinkannya saat melakukannya."
    },
    {
      "k": "p",
      "t": "Contoh ini menunjukkan mengapa model harus diselesaikan ulang, selain menghitung ulang kapasitas penampang yang baru. Pada struktur statis tak tentu, memperbesar penampang mengubah distribusi gaya dalam, dan gaya yang bekerja dapat naik justru pada batang yang ingin Anda ringankan."
    },
    {
      "k": "h",
      "t": "Menghilangkan sebuah kolom dari gedung yang sudah didesain"
    },
    {
      "k": "p",
      "t": "Kasus kedua dimulai dari portal dengan empat bentang 5 m dan tiga tingkat setinggi 3 m, tumpuan jepit, balok 25×50 cm (4Φ16), kolom 35×35 cm, dan 25 kN/m pada setiap balok: 20 titik simpul, 27 elemen, dan 45 derajat kebebasan bebas. Setelah diselesaikan dan diperiksa, setiap balok memenuhi dengan nyaman."
    },
    {
      "k": "p",
      "t": "Perubahan arsitektur menghilangkan satu kolom interior di lantai dasar. Aksi sunting menghapusnya dengan validasi integritas struktur, dan model diselesaikan ulang; keseimbangan global terpenuhi sebelum dan sesudahnya (ΣRz = 1500 kN). Balok yang tadinya ditumpu kolom itu kini membentang 10 m dan, bersama balok yang sejajar di atasnya, memikul kehilangan tumpuan tersebut. Enam balok melampaui D/C = 1."
    },
    {
      "k": "table",
      "caption": "Balok yang menentukan pada gedung dalam tiga kondisinya.",
      "head": [
        "Kondisi",
        "Penampang",
        "Mu [kN·m]",
        "φMn [kN·m]",
        "D/C",
        "Memenuhi"
      ],
      "rows": [
        [
          "Utuh",
          "25×50 (4Φ16)",
          "54.2",
          "125.3",
          "0.43",
          "Ya"
        ],
        [
          "Kolom dihilangkan",
          "25×50 (4Φ16)",
          "203.9",
          "125.3",
          "1.63",
          "Tidak"
        ],
        [
          "Diubah ukurannya",
          "30×65 (5Φ20)",
          "189.8",
          "313.7",
          "0.61",
          "Ya"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Momen balok yang menentukan hampir menjadi empat kali lipat. Dengan 30×65 cm dan 5Φ20 pada balok yang terdampak, serta penyelesaian ulang, setiap balok memenuhi lagi. Kasus ini juga menunjukkan bahwa perubahan yang jika dikerjakan manual berarti memodelkan ulang, menganalisis ulang, memeriksa ulang, dan merinci ulang banyak batang dapat ditangani dalam percakapan singkat, dengan setiap angka dapat dilacak ke solver dan tunduk pada persetujuan insinyur."
    },
    {
      "k": "h",
      "t": "Empat keputusan desain di balik batas ini"
    },
    {
      "k": "ol",
      "items": [
        "Aksi bertipe, bukan pembuatan kode bebas. Pada beberapa sistem sebelumnya, model menulis skrip Python yang kemudian dijalankan terhadap solver eksternal. Di sini keluaran agen dibatasi pada sekumpulan panggilan tertutup dengan kontrak masukan dan keluaran yang eksplisit, masing-masing divalidasi terhadap skema sebelum dijalankan. Batas itu lebih sempit daripada kode sembarang dan lebih mudah diaudit.",
        "Solver kami sendiri, bukan lapisan di atas solver milik orang lain. Mesinnya ditulis dari nol dalam Rust, tanpa dependensi aljabar linear eksternal, dan memiliki rangkaian verifikasi sendiri terhadap solusi analitis dan tolok ukur acuan: sekitar 6.800 uji yang lulus, ditambah perbandingan dengan program komersial pada model yang sama, dengan selisih di bawah 0,1%.",
        "Kepatuhan peraturan desain secara native. Pemeriksaan menurut CIRSOC 201 dan 301, yang tidak kami temukan diimplementasikan secara native pada perangkat lunak sumber terbuka mana pun. Modul beton sudah diimplementasikan dan diuji; modul baja masih berada hanya di frontend dan belum memiliki rangkaian uji khusus. Kami menyampaikannya agar tidak melebih-lebihkan tingkat kematangannya.",
        "Berjalan di peramban. Mesin dikompilasi ke WebAssembly dan berjalan secara lokal di mesin pengguna, tanpa server komputasi dan tanpa apa pun untuk dipasang."
      ]
    },
    {
      "k": "note",
      "t": "Pembaruan, 20 Oktober 2026: sejak versi 0.2.0 mesin memeriksa ulang setiap pemeriksaan baja CIRSOC 301 (hasil yang tidak dikonfirmasinya ditampilkan sebagai gagal atau sebagai tidak terverifikasi), dan modul diuji terhadap contoh hitungan yang dipublikasikan; modul tetap diberi label eksperimental hingga ada tinjauan independen. Angka-angka dalam tulisan ini berasal dari makalah yang dipublikasikan, dihitung dengan versi Agustus 2026, sebelum perbaikan 0.2.0 pada pemeriksaan beton (pemberitahuan keselamatan SA-2026-002); angka-angka itu dikutip apa adanya seperti di makalah tersebut."
    },
    {
      "k": "h",
      "t": "Dari solver yang teruji menjadi solver yang terbukti"
    },
    {
      "k": "p",
      "t": "Batas ini menjamin bahwa setiap klaim agen dapat dilacak ke keluaran solver. Jaminan itu mewarisi satu keterbatasan: solver dapat dipercaya karena diuji secara ekstensif, tetapi kebenarannya belum dibuktikan secara formal. Rangkaian uji, seteliti apa pun, hanya mencakup kasus yang terpikirkan oleh penulisnya."
    },
    {
      "k": "p",
      "t": "Hal ini lebih penting lagi dalam konteks ini. Agen membangun model, memodifikasinya dalam beberapa langkah, dan membaca hasil untuk mengusulkan aksi baru; sepanjang jalan itu solver menerima masukan yang belum ditinjau insinyur mana pun sebelum sampai ke mesin. Jika mesin berperilaku salah pada kasus tepi (matriks kekakuan yang hampir singular, geometri yang merosot, kombinasi beban yang ekstrem), agen dapat mengutip hasil itu tanpa peringatan apa pun."
    },
    {
      "k": "p",
      "t": "Dua teknik dapat mempersempit kesenjangan itu. Fuzzing berbasis properti membangkitkan ribuan model acak yang valid dan memeriksa invarian yang harus berlaku untuk sembarang masukan:"
    },
    {
      "k": "ul",
      "items": [
        "Keseimbangan global: ΣR = P, apa pun geometri, material, atau tumpuannya.",
        "Simetri matriks kekakuan: K = Kᵀ secara konstruksi.",
        "Kepastian positif K untuk setiap struktur tanpa mekanisme.",
        "Invarian terhadap transformasi benda tegar: menggeser atau memutar model tidak mengubah gaya dalam."
      ]
    },
    {
      "k": "p",
      "t": "Verifikasi formal mendekati kesenjangan yang sama dari sisi lain: menulis spesifikasi matematis dari properti-properti itu dan membuktikan, dengan asisten pembuktian seperti Lean 4, bahwa implementasinya memenuhinya. Pengujian dapat menemukan kesalahan; verifikasi formal dapat menunjukkan bahwa kesalahan itu tidak ada dalam domain yang dispesifikasikan. Keduanya saling melengkapi: ketika fuzzer menemukan masukan yang melanggar sebuah properti, properti itu menjadi kandidat untuk dibuktikan."
    },
    {
      "k": "note",
      "t": "Tujuannya adalah solver yang inti numerik kritisnya diverifikasi secara formal. Pada titik itu batas determinisme akan menjadi jaminan matematis: setiap angka yang dikutip dalam laporan perhitungan dapat ditelusuri ke komputasi yang terbukti benar."
    },
    {
      "k": "h",
      "t": "Posisi saat ini"
    },
    {
      "k": "p",
      "t": "Sebagai penutup, apa yang tersedia dan apa yang belum. Solver, editor, pemeriksaan CIRSOC, mode edukasi, serta pembuatan laporan dan gambar berjalan hari ini di peramban pada stabileo.com, tanpa apa pun untuk dipasang dan tanpa perlu akun. Lapisan agen sedang dikembangkan secara aktif: rutenya berjalan dalam pengembangan dan pengujian terhadap backend kami sendiri, pada solver dan angka yang sama dengan yang lain, tetapi backend itu belum menjadi bagian dari situs publik."
    },
    {
      "k": "p",
      "t": "Siklus tertutup solver-dalam-lingkaran, ketika agen mengusulkan, menyelesaikan, mengevaluasi, dan memodifikasi tanpa campur tangan manusia, ada dalam peta jalan dan belum diimplementasikan. Cakupan peraturan desain native terbatas pada CIRSOC 201 dan 301; sisanya adalah pekerjaan ke depan."
    },
    {
      "k": "p",
      "t": "CAD mengambil alih bagian mekanis dari penggambaran dan lembar kerja mengambil alih aritmetika berulang, sementara pertimbangan rekayasa tetap berada pada insinyur. Agen adalah langkah berikutnya di sepanjang garis itu: ia mengambil alih pembangunan dan modifikasi model, pemasukan beban, penjalanan pemeriksaan, dan penyiapan dokumentasi. Semua ini tidak memindahkan tanggung jawab: angka yang ditandatangani tetap milik insinyur."
    },
    {
      "k": "note",
      "t": "Tulisan ini diadaptasi dari \"Desarrollo de un agente estructural de cálculo sobre un solver verificado\" (Chesta, Bertero, Carrone dan Kingston), yang dipresentasikan pada JAIE 2026. Angka-angka yang dikutip adalah keluaran solver Stabileo dan modul CIRSOC 201-nya, diambil dari makalah tersebut."
    }
  ]
};

export default body;
