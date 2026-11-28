import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Mempresentasikan Stabileo pada Konferensi Rekayasa Struktur Argentina ke-29",
  "excerpt": "Pada 18 September kami mempresentasikan makalah 86N di Córdoba: agen perhitungan struktur yang mengusulkan perubahan dan menyerahkan setiap angka kepada solver yang telah diverifikasi. Apa yang kami tunjukkan, mengapa agen harus dipisahkan dari perhitungan, dan apa yang kami bawa pulang.",
  "blocks": [
    {
      "k": "p",
      "t": "Konferensi Rekayasa Struktur Argentina ke-29 (JAIE) berlangsung di Córdoba pada 16 sampai 18 September, diselenggarakan oleh Asociación de Ingenieros Estructurales. Pada hari terakhir kami mempresentasikan makalah 86N, \"Pengembangan agen perhitungan struktur di atas solver yang terverifikasi\", oleh Bautista Chesta, Raúl Bertero, Federico Carrone, dan Diego Kingston, pada jalur kecerdasan buatan yang diterapkan pada teknik sipil."
    },
    {
      "k": "photo",
      "src": "jaie-2026-talk",
      "w": 1600,
      "h": 1200,
      "alt": "Bautista Chesta berbicara kepada hadirin; di layar, portal empat bentang dengan satu balok dilingkari merah dan judul \"Struktur dihitung ulang\".",
      "caption": "Mempresentasikan makalah 86N. Di layar, saat sebuah balok tidak lagi memenuhi pemeriksaannya dan seluruh model diselesaikan ulang."
    },
    {
      "k": "h",
      "t": "Apa yang kami tunjukkan"
    },
    {
      "k": "p",
      "t": "Makalah ini bertumpu pada satu aturan arsitektur: agen AI menafsirkan apa yang diminta insinyur dan mengusulkan aksi, tetapi setiap angka berasal dari solver dan modul CIRSOC, yang tidak dapat diubah oleh agen. Kami menyebutnya batas determinisme."
    },
    {
      "k": "p",
      "t": "Dalam presentasi, kami menunjukkannya pada portal beton bertulang yang gagal dalam pemeriksaannya. Agen mengusulkan balok yang lebih tinggi, solver menyelesaikan seluruh model lagi, dan pemeriksaan CIRSOC 201 dihitung ulang pada struktur baru: rasio kebutuhan/kapasitas turun dari 1,10 menjadi 0,97. Makalah ini mereproduksi pemeriksaan itu dengan tangan, langkah demi langkah."
    },
    {
      "k": "p",
      "t": "Kasus kedua adalah gedung empat bentang dan tiga tingkat dengan satu kolom dihilangkan. Beberapa balok tidak lagi memenuhi, penampangnya diubah ukurannya, dan setiap batang memenuhi lagi, dengan solver menyelesaikan seluruh model pada setiap langkah."
    },
    {
      "k": "h",
      "t": "Mengapa batas itu diperlukan"
    },
    {
      "k": "p",
      "t": "Untuk menunjukkannya, kami memberikan permintaan penentuan ukuran awal yang sama kepada asisten AI serbaguna sebanyak lima belas kali. Mereka mengembalikan tujuh penampang berbeda. Bagian yang paling mengungkapkan: sebelas kali pengulangan sepakat pada momen desain dan tetap mengusulkan enam penampang berbeda."
    },
    {
      "k": "table",
      "caption": "Permintaan penentuan ukuran awal yang sama, diulang, dan portal yang dikoreksi dengan solver.",
      "head": [
        "Apa",
        "Nilai"
      ],
      "rows": [
        [
          "Jumlah pengulangan permintaan yang sama",
          "15"
        ],
        [
          "Penampang berbeda yang dikembalikan",
          "7"
        ],
        [
          "Rasio luas terbesar terhadap terkecil",
          "1.80"
        ],
        [
          "Pengulangan yang sepakat pada Mu = 207 kN·m",
          "11"
        ],
        [
          "Penampang berbeda di antara pengulangan itu",
          "6"
        ],
        [
          "D/C portal sebelum koreksi",
          "1.10"
        ],
        [
          "D/C portal sesudah koreksi",
          "0.97"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Dengan solver di belakangnya, model yang sama memberikan angka yang sama setiap kali, dan angka itu dapat diperiksa. Itulah yang kami ingin insinyur dapat tanda tangani dengan percaya diri."
    },
    {
      "k": "photo",
      "src": "jaie-2026-backdrop",
      "w": 1152,
      "h": 1320,
      "alt": "Diego Kingston dan Bautista Chesta, mengenakan tanda pengenal penulis, di depan dinding sponsor konferensi.",
      "caption": "Bersama Diego Kingston, rekan penulis makalah, di konferensi."
    },
    {
      "k": "h",
      "t": "Apa yang kami bawa pulang"
    },
    {
      "k": "p",
      "t": "Kami pulang dengan kontak di antara insinyur struktur dari seluruh negeri dan undangan untuk bergabung dengan jaringan insinyur struktur. Kami juga berbicara dengan universitas-universitas di Córdoba tentang penggunaannya dalam kuliah mereka."
    },
    {
      "k": "p",
      "t": "Makalah lengkapnya ada di stabileo.com/paper, dan Stabileo berjalan di peramban tanpa apa pun untuk dipasang."
    },
    {
      "k": "link",
      "slug": "the-determinism-boundary",
      "t": "Ringkasan makalah, dengan kedua kasus dan angkanya:"
    }
  ]
};

export default body;
