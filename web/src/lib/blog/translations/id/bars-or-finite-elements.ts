import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Batang portal atau elemen hingga? Dua model, bukan dua metode",
  "excerpt": "Untuk batang prismatik, metode kekakuan adalah kasus khusus eksak dari metode elemen hingga. Yang berubah adalah modelnya, dan untuk balok tinggi model portal memberikan lendutan 19 sampai 34% terlalu kecil.",
  "blocks": [
    {
      "k": "p",
      "t": "\"Sebaiknya memakai metode kekakuan atau elemen hingga?\" muncul di setiap ruang kelas dan setiap kantor desain, dan itu pertanyaan yang keliru. Masalahnya, pertanyaan itu memperlakukan keduanya sebagai alternatif yang dapat dipertukarkan, padahal bukan."
    },
    {
      "k": "p",
      "t": "Metode kekakuan adalah metode elemen hingga yang diterapkan pada batang portal. Yang membedakan program \"portal\" dari program \"elemen hingga\" adalah modelnya. Elemen portal membawa teori satu dimensi tentang bagaimana batang berdeformasi; mesh cangkang adalah kontinum dua dimensi yang didiskretisasi. Memilih di antara keduanya adalah keputusan rekayasa, dan tulisan ini membahas kapan membuatnya dan apa harga kekeliruannya."
    },
    {
      "k": "h",
      "t": "Batang lurus tidak memerlukan mesh"
    },
    {
      "k": "p",
      "t": "Dalam elemen hingga, perpindahan di dalam setiap elemen didekati dengan fungsi bentuk. Untuk batang yang melentur, yang lazim dipakai adalah polinomial Hermite kubik. Dan solusi persamaan balok Euler-Bernoulli tanpa beban sepanjang bentang itu sendiri adalah polinomial kubik, sehingga pendekatannya berimpit dengan solusi eksak."
    },
    {
      "k": "p",
      "t": "Itulah sebabnya matriks kekakuan untuk batang prismatik, yang ada di buku teks analisis matriks mana pun, eksak, dan mengapa membagi batang menjadi lebih banyak elemen tidak memperbaiki apa pun. Dengan beban merata hal yang sama berlaku di titik simpul, selama beban titik simpul ekuivalennya dihitung secara konsisten."
    },
    {
      "k": "table",
      "caption": "Balok sederhana 6 m, penampang 20×60, 10 kN/m, E = 30.000 MPa. Lendutan tengah bentang dengan balok dibagi menjadi jumlah elemen portal yang berbeda.",
      "head": [
        "Elemen portal pada balok",
        "Lendutan tengah bentang [mm]"
      ],
      "rows": [
        [
          "2",
          "1.5625"
        ],
        [
          "4",
          "1.5625"
        ],
        [
          "10",
          "1.5625"
        ],
        [
          "50",
          "1.5625"
        ],
        [
          "Bentuk tertutup 5qL⁴/384EI",
          "1.5625"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Dua elemen atau lima puluh, mesin mengembalikan angka yang sama, dan cocok dengan bentuk tertutupnya."
    },
    {
      "k": "quote",
      "t": "Me-mesh batang lurus tidak membuatnya lebih akurat: ia membuatnya lebih lambat."
    },
    {
      "k": "note",
      "t": "Keeksakan itu berlaku dalam teori balok. Matriks menyelesaikan persamaan Euler-Bernoulli secara eksak, tetapi jika batang tidak berperilaku seperti balok Euler-Bernoulli, solusi eksak untuk persamaan itu tidak membantu. Sisa tulisan ini membahas kasus-kasus tersebut."
    },
    {
      "k": "h",
      "t": "Di mana keduanya berpisah"
    },
    {
      "k": "p",
      "t": "Teori Euler-Bernoulli mengasumsikan bahwa penampang datar tetap datar dan tegak lurus terhadap sumbu, yang berarti mengabaikan deformasi geser. Untuk balok langsing ini pendekatan yang sangat baik. Untuk balok tinggi tidak."
    },
    {
      "k": "p",
      "t": "Kami mengambil balok 6 m yang sama di bawah beban yang sama dan menambah tingginya langkah demi langkah. Setiap kasus diselesaikan dua kali: dengan elemen portal, seperti yang dilakukan mode Basic, dan sebagai cangkang MITC4 yang di-mesh pada bidang balok, yang dapat dilakukan mode PRO."
    },
    {
      "k": "table",
      "caption": "Balok sederhana 6 m, lebar 20 cm, 10 kN/m, E = 30.000 MPa, ν = 0,2. Lendutan tengah bentang, pada sumbu.",
      "head": [
        "L/h",
        "Tinggi h [m]",
        "Elemen portal [mm]",
        "Cangkang [mm]",
        "Model portal lebih rendah sebesar"
      ],
      "rows": [
        [
          "20",
          "0.30",
          "12.500",
          "12.567",
          "0.5 %"
        ],
        [
          "10",
          "0.60",
          "1.5625",
          "1.5961",
          "2.1 %"
        ],
        [
          "5",
          "1.20",
          "0.19531",
          "0.21206",
          "7.9 %"
        ],
        [
          "3",
          "2.00",
          "0.042188",
          "0.052145",
          "19.1 %"
        ],
        [
          "2",
          "3.00",
          "0.012500",
          "0.019017",
          "34.3 %"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Pada L/h = 10, balok biasa, selisihnya 2%. Pada L/h = 5 hampir 8%. Pada L/h = 3 model portal memberikan lendutan 19% lebih kecil, dan pada L/h = 2, sepertiga lebih kecil."
    },
    {
      "k": "quote",
      "t": "Model portal selalu membuat balok lebih kaku daripada yang sebenarnya."
    },
    {
      "k": "h",
      "t": "Memeriksanya dengan kalkulator"
    },
    {
      "k": "p",
      "t": "Anda tidak perlu percaya begitu saja pada cangkang. Teori balok Timoshenko menyertakan deformasi geser, dan untuk balok sederhana di bawah beban merata ia menambahkan satu suku pada lendutan: q·L² / (8·κ·G·A), dengan κ = 5/6 untuk penampang persegi panjang dan G = E / (2·(1+ν))."
    },
    {
      "k": "table",
      "caption": "Balok pada L/h = 3 (bentang 6 m, tinggi 2 m): empat jawaban untuk pertanyaan yang sama.",
      "head": [
        "Model",
        "Lendutan tengah bentang [mm]"
      ],
      "rows": [
        [
          "Elemen portal (Euler-Bernoulli)",
          "0.0422"
        ],
        [
          "Elemen portal ditambah suku geser, dengan tangan",
          "0.0530"
        ],
        [
          "Cangkang MITC4",
          "0.0521"
        ],
        [
          "Elastisitas bidang, bentuk tertutup",
          "0.0523"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Pada L/h = 3 suku itu bernilai 0,0108 mm; ditambahkan ke 0,0422 mm dari Euler-Bernoulli, hasilnya 0,0530 mm. Cangkang memberikan 0,0521 mm, dan solusi elastisitas bidang bentuk tertutup dari Timoshenko dan Goodier memberikan 0,0523 mm. Ketiga jawaban yang menyertakan geser sepakat dalam 2%. Yang mengabaikannya 19% terlalu rendah."
    },
    {
      "k": "note",
      "t": "Lendutan bukan keseluruhan ceritanya. Pada tinggi itu distribusi tegangan normal tidak lagi linear, sehingga rumus Navier pun tidak berlaku. Itulah sebabnya ACI 318, dasar CIRSOC 201, memperlakukan setiap batang dengan bentang bersih hingga empat kali tingginya sebagai balok tinggi, dan mensyaratkan desain yang memperhitungkan distribusi regangan nonlinear, misalnya dengan model strat-dan-pengikat."
    },
    {
      "k": "h",
      "t": "Apakah beberapa perseratus milimeter penting?"
    },
    {
      "k": "p",
      "t": "Pada balok itu sendiri, tidak banyak. Pada struktur statis tertentu, kesalahan kekakuan hanya memengaruhi lendutan, dan balok setinggi 2 m memang melendut sangat kecil. Kesalahan mulai penting ketika kekakuan menentukan bagaimana beban didistribusikan, yang terjadi pada setiap struktur statis tak tentu."
    },
    {
      "k": "p",
      "t": "Kasus khasnya adalah dinding geser. Dalam model portal, dinding adalah kolom yang sangat lebar: ia diberi momen inersia dinding dan terletak pada garis sumbu dinding. Untuk dinding pendek, panjang dibandingkan tingginya, elemen portal membuatnya jauh lebih kaku daripada yang sebenarnya."
    },
    {
      "k": "table",
      "caption": "Dinding tebal 20 cm, terjepit di dasar, dengan 100 kN bekerja horizontal di puncak. Perpindahan tepi atas.",
      "head": [
        "Dinding, panjang × tinggi [m]",
        "Tinggi / panjang",
        "Elemen portal [mm]",
        "Cangkang [mm]",
        "Elemen portal lebih kaku sebesar"
      ],
      "rows": [
        [
          "4 × 3",
          "0.75",
          "0.0281",
          "0.0627",
          "2,23 kali"
        ],
        [
          "3 × 3",
          "1.00",
          "0.0667",
          "0.1129",
          "1,69 kali"
        ],
        [
          "2 × 3",
          "1.50",
          "0.2250",
          "0.2943",
          "1,31 kali"
        ],
        [
          "3 × 6",
          "2.00",
          "0.533",
          "0.625",
          "1,17 kali"
        ],
        [
          "3 × 9",
          "3.00",
          "1.800",
          "1.937",
          "1,08 kali"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Dinding sepanjang 4 m dan setinggi 3 m, satu tingkat, menjadi 2,2 kali lebih kaku bila dimodelkan dengan elemen portal. Dinding sepanjang 3 m dan setinggi 9 m, tiga tingkat, hanya 8% lebih kaku. Selisihnya paling penting untuk dinding pendek."
    },
    {
      "k": "p",
      "t": "Dan itu mengubah cara geser dibagi. Ambil dua dinding pada garis yang sama, satu sepanjang 4 m dan satu sepanjang 2 m, keduanya setinggi 3 m dan diikat oleh pelat lantai. Dengan elemen portal, dinding pendek menerima 11,1% geser. Dengan cangkang ia menerima 17,6%, 58% lebih besar daripada yang diprediksi model portal. Beban tambahan yang diberikan model portal kepada dinding panjang diambil dari dinding pendek, yang akhirnya didesain untuk geser lebih kecil daripada yang sebenarnya akan dipikulnya."
    },
    {
      "k": "h",
      "t": "Pertanyaan yang tidak dapat dijawab model portal"
    },
    {
      "k": "p",
      "t": "Sejauh ini, itu adalah kasus ketika elemen portal memberikan angka yang salah. Pada kasus lain, mereka sama sekali tidak dapat memberikan angka, karena pertanyaannya tidak memiliki tempat dalam model."
    },
    {
      "k": "ul",
      "items": [
        "Pelat datar. Bagaimana momen terbagi antara lajur kolom dan lajur tengah, dan seberapa banyak terkonsentrasi di atas setiap kolom, adalah informasi dua dimensi. Grillage balok dapat mendekatinya, tetapi informasi itu tidak ada dalam model.",
        "Dinding dengan bukaan. Elemen portal hanya memiliki satu penampang pada setiap titik sepanjang sumbunya, sehingga jendela di tengah dinding tidak punya tempat.",
        "Pertemuan balok-kolom. Dalam model portal, pertemuan balok-kolom adalah sebuah titik, sehingga momen puncak muncul pada garis sumbu. Pada kenyataannya pertemuan itu sebesar kolom, dan penampang yang Anda desain adalah penampang pada muka kolom.",
        "Beban terpusat di dekat tumpuan. Penampang datar tidak tetap datar di daerah itu, dengan alasan yang sama seperti pada balok tinggi."
      ]
    },
    {
      "k": "h",
      "t": "Di mana keduanya harus sepakat"
    },
    {
      "k": "p",
      "t": "Separuh argumen lainnya sama pentingnya. Untuk balok langsing pada baris pertama, pada L/h = 20, elemen portal dan cangkang berbeda 0,5%. Itu bukan nol, karena geser selalu ada, tetapi dapat diabaikan. Dan memang seharusnya begitu: jika kedua model tidak sepakat pada batang langsing, periksa dulu model elemen hingganya, khususnya mesh-nya."
    },
    {
      "k": "note",
      "t": "Shear locking adalah contoh klasik elemen yang gagal. Segi empat pelat tebal yang dirumuskan secara naif menjadi jauh lebih kaku daripada seharusnya ketika pelatnya tipis, dan pelat lantai berperilaku seolah-olah lebih tebal. Elemen MITC4 di Stabileo ada untuk mencegah hal ini: ia menginterpolasi regangan geser secara berbeda, sehingga elemen tidak mengalami locking."
    },
    {
      "k": "link",
      "slug": "torsion-bredt-saint-venant",
      "t": "Memilih teori menurut ketebalan, dan harga pilihan yang salah, adalah pertanyaan yang sama dengan yang diangkat torsi:"
    },
    {
      "k": "h",
      "t": "Kedua model dalam satu program"
    },
    {
      "k": "p",
      "t": "Memiliki elemen portal dan cangkang dalam program yang sama bukan hal baru. SAP2000, ETABS, Robot, dan midas menggabungkan keduanya dalam satu model, dan itu adalah standar dasar perangkat lunak profesional. Tetapi mereka tidak dibuat untuk menjelaskan apa yang mereka hitung. Di ujung lain, alat pengajaran seperti Ftool dan MASTAN2 mengajarkan analisis portal dengan sangat baik tetapi berhenti sebelum elemen hingga."
    },
    {
      "k": "p",
      "t": "Stabileo memiliki kedua mode dalam satu program. Mode Basic menyelesaikan dengan elemen portal dan menelusuri metode kekakuan dalam sembilan langkah: penomoran derajat kebebasan, matriks lokal, transformasi, perakitan, vektor beban, kondisi batas, penyelesaian, reaksi tumpuan, dan gaya dalam. Mode PRO menyelesaikan dengan elemen hingga, menggunakan cangkang MITC4 dan pelat DKT berdampingan dengan elemen portal. Pada alat yang kami tinjau, kami tidak menemukan program lain yang memungkinkan Anda mempelajari cara kerja analisis lalu menerapkannya pada model yang lebih lengkap tanpa berpindah alat."
    },
    {
      "k": "img",
      "base": "blog/deep-beam-shell",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo PRO, ruang kerja Analisis, dengan balok 6 m kali tinggi 2 m yang dimodelkan sebagai dinding elemen cangkang dan telah diselesaikan. Panel hasil mencantumkan 225 perpindahan dan 192 tegangan cangkang; di bawah Pemeriksaan hasil, ia memperkirakan galat diskretisasi sekitar 11 % dalam norma energi dan meminta agar mesh diperhalus atau pemeriksaan konvergensi dijalankan sebelum hasil digunakan.",
      "caption": "Model cangkang di bawah, telah diselesaikan: aplikasi memperkirakan sendiri galat mesh-nya dan menyatakan ketika mesh terlalu kasar untuk diandalkan."
    },
    {
      "k": "embed",
      "query": "example=deep-beam-bar",
      "label": "Balok L/h = 3 dalam mode Basic: bentang 6 m, penampang 20×200 cm, dan 10 kN/m, dimodelkan sebagai dua elemen portal. Arahkan kursor ke tengah balok dan tertulis \"uz: -0.042 mm\", sesuai dengan rumus Euler-Bernoulli."
    },
    {
      "k": "embed",
      "query": "example=deep-beam-shell",
      "mode": "pro",
      "label": "Balok yang sama dalam mode PRO, dimodelkan sebagai cangkang dengan 192 elemen MITC4 berukuran 25 cm. Di bawah Analisis → Perpindahan, titik simpul 113 (tengah bentang, pada setengah tinggi) menunjukkan \"-5.19e-5\" m, yaitu 0,0519 mm. Tabel di atas memakai mesh yang lebih halus dan memberikan 0,0521 mm."
    },
    {
      "k": "link",
      "slug": "conceptual-side-advanced-tools",
      "t": "Apa yang dijelaskan dan tidak dijelaskan alat gratis, alat demi alat:"
    },
    {
      "k": "h",
      "t": "Singkatnya"
    },
    {
      "k": "ol",
      "items": [
        "Untuk batang prismatik, metode kekakuan adalah kasus khusus eksak dari elemen hingga. Yang Anda pilih adalah modelnya.",
        "Batang lurus tidak memerlukan mesh. Jika membaginya mengubah hasil, ada hal lain yang salah.",
        "Di bawah L/h ≈ 5 model portal meremehkan lendutan lebih dari 8%, dan di bawah 3 lebih dari 19%. Ia selalu membuat balok lebih kaku.",
        "Pada struktur statis tak tentu, kesalahan itu mengubah distribusi beban. Periksa dinding pendek sebelum balok.",
        "Pelat datar, dinding dengan bukaan, dan beban di dekat tumpuan memunculkan pertanyaan yang tidak dapat dijawab model portal.",
        "Pada batang yang langsing, kedua model harus sepakat. Jika tidak, periksa mesh-nya."
      ]
    },
    {
      "k": "note",
      "t": "Bagaimana angka-angka dihitung: semuanya berasal dari mesin Stabileo, yang sama dengan yang dipakai aplikasi. Elemen portal: Euler-Bernoulli, dengan tumpuan pada sumbu. Cangkang: MITC4 pada bidang balok, dengan 24 elemen sepanjang tinggi (16 mengubah digit keempat), beban pada tepi atas dan tumpuan tersebar di seluruh tinggi penampang ujung. Dinding: formulasi yang sama, dengan dasar terjepit sepanjang panjang penuhnya dan beban horizontal tersebar sepanjang puncak. Suku geser dan solusi elastisitas bidang adalah bentuk tertutup yang dapat Anda periksa dengan tangan."
    }
  ]
};

export default body;
