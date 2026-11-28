import type { PostBody } from '../../types';
import { flexureExampleRows, flexureExampleSteps } from '../../flexure-example';

const body: PostBody = {
  "title": "Verifikasi lentur menurut CIRSOC 201, langkah demi langkah",
  "excerpt": "Hampir semua orang mengingat φMn ≥ Mu. Itu baris terakhir pemeriksaan, bukan pemeriksaannya. Hasilnya ditentukan lebih awal, dan salah satu langkah itu dapat menarik φ di bawah 0,9.",
  "blocks": [
    {
      "k": "p",
      "t": "Kebanyakan orang mengingat pemeriksaan lentur sebagai satu pertidaksamaan: φMn ≥ Mu. Itu benar, dan itu baris terakhirnya. Yang menentukan hasil terjadi lebih awal, dalam langkah-langkah yang jarang diperhatikan karena tampak seperti urusan administrasi."
    },
    {
      "k": "p",
      "t": "Inilah yang dikembalikan modul CIRSOC 201 Stabileo untuk balok 20×40 cm dari beton H-25, baja fy 420, selimut beton 25 mm, dan sengkang 8 mm, di bawah momen 60 kN·m:"
    },
    {
      "k": "ol",
      "items": flexureExampleSteps("Tulangan tarik: 2 Ø20 (6,28 cm²)")
    },
    {
      "k": "p",
      "t": "Sepuluh langkah. Yang kesepuluh adalah yang diingat semua orang. Yang menentukan hasil adalah langkah ketiga dan kesembilan."
    },
    {
      "k": "h",
      "t": "Langkah 3: nilai minimum menentukan lebih sering daripada yang tampak"
    },
    {
      "k": "p",
      "t": "Pasal 9.6.1.2 mensyaratkan tulangan lentur minimum sebesar nilai yang lebih besar antara 0.25·√f'c/fy·bw·d dan 1.4/fy·bw·d. Biasanya ini diperlakukan sebagai batas bawah yang nyaris tidak pernah tercapai. Pada balok hunian, ia tercapai sepanjang waktu."
    },
    {
      "k": "table",
      "caption": "Balok 20×40 H-25 yang sama di bawah momen yang makin besar: apa yang menentukan tulangan.",
      "head": [
        "Mu [kN·m]",
        "As menurut kekuatan [cm²]",
        "As,min [cm²]",
        "Yang menentukan"
      ],
      "rows": [
        [
          "15",
          "1.12",
          "2.39",
          "nilai minimum"
        ],
        [
          "30",
          "2.28",
          "2.39",
          "nilai minimum"
        ],
        [
          "60",
          "4.73",
          "2.39",
          "kekuatan"
        ],
        [
          "90",
          "7.38",
          "2.39",
          "kekuatan"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Titik silangnya ada pada Mu = 31,5 kN·m. Di bawah momen itu, merancang menurut kekuatan tidak menghasilkan apa-apa: penampang memikul 2,39 cm² dengan cara apa pun. Ada baiknya mengetahui di sisi mana dari titik silang itu sebuah balok berada sebelum membahas tulangannya."
    },
    {
      "k": "h",
      "t": "Dan nilai minimum jarang bergantung pada beton"
    },
    {
      "k": "p",
      "t": "Dari dua ekspresi dalam pasal itu, ekspresi √f'c hanya melebihi yang lain untuk beton yang cukup kuat."
    },
    {
      "k": "table",
      "caption": "Dua ekspresi untuk nilai minimum, untuk fy 420, dalam permil.",
      "head": [
        "Beton",
        "0.25·√f'c/fy",
        "1.4/fy",
        "Yang menentukan"
      ],
      "rows": [
        [
          "H-20",
          "2.6620",
          "3.3333",
          "1.4/fy"
        ],
        [
          "H-25",
          "2.9762",
          "3.3333",
          "1.4/fy"
        ],
        [
          "H-30",
          "3.2603",
          "3.3333",
          "1.4/fy"
        ],
        [
          "H-35",
          "3.5215",
          "3.3333",
          "√f'c"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Titik silangnya ada pada f'c = 31,36 MPa. Di seluruh rentang yang dipakai pada pekerjaan hunian (H-20, H-25, H-30), tulangan minimum tidak bergantung pada beton: ia berasal dari 1.4/fy dan tidak ada yang lain. Beralih dari H-20 ke H-30 tidak menurunkan nilai minimum satu sentimeter persegi pun."
    },
    {
      "k": "h",
      "t": "Langkah 9: φ tidak otomatis 0,9"
    },
    {
      "k": "p",
      "t": "Faktor reduksi kekuatan diajarkan sebagai 0,90 untuk lentur lalu diperlakukan sebagai konstanta. Padahal bukan. Ia berasal dari regangan baja tarik pada keadaan batas, dan modul menyatakannya pada langkah 9: εt ≥ 5‰ → terkendali tarik → φ = 0,90. Tambahkan lebih banyak baja pada penampang dan εt turun, membawa φ ikut turun."
    },
    {
      "k": "table",
      "caption": "Balok yang sama, dibebani lebih besar setiap kali. εt dan φ berasal dari langkah 8 dan 9.",
      "head": [
        "Mu [kN·m]",
        "Tulangan",
        "εt [‰]",
        "φ",
        "φMn [kN·m]",
        "Daktilitas"
      ],
      "rows": flexureExampleRows("Memenuhi", "Tidak memenuhi")
    },
    {
      "k": "p",
      "t": "Penampang 2 Ø32 tidak memenuhi: regangan tariknya di bawah minimum yang disyaratkan. φ yang direduksi tidak memenuhi pemeriksaan daktilitas. Desain ulang penampang atau tulangannya."
    },
    {
      "k": "quote",
      "t": "Penampang 2 Ø32 tidak memenuhi: regangan tariknya di bawah minimum yang disyaratkan. φ yang direduksi tidak memenuhi pemeriksaan daktilitas. Desain ulang penampang atau tulangannya."
    },
    {
      "k": "h",
      "t": "Mengapa tulangan tekan dipasang"
    },
    {
      "k": "p",
      "t": "Tulangan tekan mungkin diperlukan pada batas daktilitas. Jangan menunggu sampai baja tarik berada di bawah regangan lelehnya; verifikasi penampang hasil desain ulang pada kedalaman batang yang sebenarnya."
    },
    {
      "k": "p",
      "t": "Jadi tulangan tekan ada untuk mengembalikan daktilitas penampang dan memulihkan faktornya. Kapasitas mengikuti sebagai hasilnya."
    },
    {
      "k": "note",
      "t": "Tulangan tekan mungkin diperlukan pada batas daktilitas. Jangan menunggu sampai baja tarik berada di bawah regangan lelehnya; verifikasi penampang hasil desain ulang pada kedalaman batang yang sebenarnya."
    },
    {
      "k": "h",
      "t": "Cobalah pada balok nyata"
    },
    {
      "k": "p",
      "t": "Di bawah ini adalah modelnya: balok sederhana 5 m, 20×40, H-25, dengan beban mati 12 kN/m dan beban hidup 8 kN/m, ditambah berat sendirinya. Model dibuka dalam alur kerja desain PRO, dengan CIRSOC 201 sebagai peraturan desain yang berlaku."
    },
    {
      "k": "img",
      "base": "blog/cirsoc-201-beam",
      "w": 1600,
      "h": 1000,
      "alt": "Kontrol desain Stabileo PRO dengan balok 20×40 terpilih.",
      "caption": "Tangkapan layar ini dibuat sebelum koreksi tumpuan. Contoh langsung di bawah menunjukkan hasil terkini."
    },
    {
      "k": "embed",
      "mode": "pro",
      "query": "example=rc-beam-flexure&proTab=design",
      "label": "Balok di Stabileo, dalam alur kerja desain PRO. Jika desain nonaktif, tekan \"Aktifkan desain untuk kunjungan ini\" pada pemberitahuan. Tiga tombol, dalam urutan ini: \"Hitung kebutuhan\", \"Hitung baja yang diperlukan\" dan \"Tentukan ukuran…\". Hanya yang ketiga yang memilih batang tulangan, dan selama belum ada batang tulangan tidak ada yang dapat diverifikasi: tabel menyatakan \"tanpa tulangan\". Bentang 5 m dimodelkan sebagai dua elemen; keduanya terverifikasi pada D/C = 0,91. Lentur positif di bentang (My+) menentukan. Ubah bebannya dan jalankan lagi. Desain peraturan di PRO masih dalam pengembangan; modul beton adalah bagian yang sudah diimplementasikan dan diuji."
    },
    {
      "k": "h",
      "t": "Singkatnya"
    },
    {
      "k": "ol",
      "items": [
        "Sebelum menentukan ukuran, periksa apakah momen berada di atas atau di bawah titik silang dengan nilai minimum. Di bawahnya, tulangan sudah ditentukan.",
        "Dari H-20 ke H-30, nilai minimum tidak bergantung pada beton. Ia berasal dari 1.4/fy.",
        "φ bergantung pada εt: selalu baca keduanya bersama-sama.",
        "Jika tulangan tekan muncul, itu karena penampang kehilangan daktilitas, bukan karena kapasitasnya kurang."
      ]
    },
    {
      "k": "note",
      "t": "Hitung ulang tinggi efektif untuk setiap diameter batang yang dipilih. Tabel kapasitas diperiksa terhadap mesin saat ini; kapasitas saja bukan verifikasi yang lengkap."
    }
  ]
};

export default body;
