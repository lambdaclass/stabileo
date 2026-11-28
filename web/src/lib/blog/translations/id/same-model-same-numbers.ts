import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Model yang sama, angka yang sama: determinisme dan asal-usul",
  "excerpt": "Dua kali perhitungan model yang sama dalam satu sesi dapat berbeda pada digit terakhir. Mengapa hal itu terjadi, bagaimana kami memperbaikinya, dan bagaimana setiap laporan kini menyatakan versi dan data mana yang menghasilkannya, sehingga siapa pun dapat mereproduksinya.",
  "blocks": [
    {
      "k": "p",
      "t": "Laporan perhitungan yang ditandatangani harus dapat direproduksi. Jika seseorang membuka kembali proyek setahun kemudian, atau insinyur lain meninjaunya, model yang sama harus memberikan angka yang sama, dan harus jelas versi program mana yang menghasilkannya."
    },
    {
      "k": "p",
      "t": "Ketika kami mengukurnya, kami menemukan bahwa hal itu tidak selalu berlaku: dua kali perhitungan model yang sama dalam satu sesi dapat berbeda pada digit terakhir, dan sebagian hasil muncul dalam urutan yang berbeda. Perbedaannya sangat kecil, tetapi angka yang berubah padahal tidak ada yang berubah adalah angka yang tidak dapat diperiksa."
    },
    {
      "k": "h",
      "t": "Dari mana perbedaan itu berasal"
    },
    {
      "k": "p",
      "t": "Mesin menyimpan titik simpul, batang, tumpuan, dan beban dalam tabel hash, dan setiap tabel dibuat dengan seed acak: berkas yang sama dibaca dua kali ditelusuri dalam dua urutan berbeda. Menjumlahkan bilangan titik mengambang dalam urutan lain dapat mengubah bit terakhir, karena penjumlahan komputer tidak asosiatif. Perakit 3D sudah mengurutkan batang, tetapi perakit 2D, perulangan beban dan tumpuan, serta sebagian besar analisis lain belum."
    },
    {
      "k": "ul",
      "items": [
        "Setiap penelusuran atas tabel masukan kini berjalan dalam urutan tetap, yaitu urutan kuncinya: 587 tempat di seluruh mesin.",
        "Jumlah keseimbangan dan suku silang tumpuan miring juga ditelusuri dalam urutan tetap.",
        "Peringatan keluar terurut menurut nomor titik simpul atau batang, tidak lagi acak."
      ]
    },
    {
      "k": "table",
      "caption": "Apa yang berubah pada mesin, dan bagaimana hal itu diperiksa.",
      "head": [
        "Apa",
        "Jumlah"
      ],
      "rows": [
        [
          "Penelusuran atas tabel masukan yang dibuat berurutan tetap",
          "587"
        ],
        [
          "Pembacaan setiap model acak yang dibandingkan bit demi bit",
          "6"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Sebuah pengujian membaca setiap model acak enam kali, menghitungnya, dan membandingkan hasilnya sebagai teks, bit demi bit, pada analisis linear, modal, tekuk, dan P-Delta. Penelusuran tanpa urutan yang mengubah hasil akan muncul sebagai perbedaan antar-eksekusi."
    },
    {
      "k": "h",
      "t": "Setiap laporan menyatakan asalnya"
    },
    {
      "k": "p",
      "t": "Setiap laporan perhitungan, laporan PRO, buku kerja, dan CSV kini memuat blok asal-usul: versi dan commit aplikasi serta mesin, sidik jari SHA-256 modul WebAssembly yang melakukan perhitungan, sidik jari model yang persis sama, pengaturan, dan hasil yang ditampilkan, serta status sertifikat (selubung beban bergerak mencatat lebih sedikit: model dan pengaturannya). Jika proyek berubah saat ekspor sedang disiapkan, tidak ada yang diekspor: laporan tidak pernah membawa angka dari satu keadaan di bawah asal-usul keadaan lain."
    },
    {
      "k": "p",
      "t": "Dengan blok itu, aplikasi dapat mereproduksi laporan: ia menghitung proyek lagi dan membandingkan setiap sidik jari. Putusannya “direproduksi” hanya bila semuanya cocok (build WebAssembly yang berbeda dilaporkan di sampingnya, tidak dihitung sebagai perbedaan); bila ada yang tidak dapat dihitung ulang, putusannya “tidak lengkap”, tidak pernah “direproduksi”. Ada juga alat baris perintah yang menghitung masukan yang sama dua kali dan memeriksa sidik jarinya."
    },
    {
      "k": "img",
      "base": "blog/reproduce",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic dengan dialog “Reproduksi dari asal-usul”: kotak untuk menempelkan blok asal-usul laporan atau memuat laporan yang tersimpan, serta tombol “Unduh masukan solver” dan “Hitung lagi dan bandingkan”.",
      "caption": "“Periksa laporan yang diekspor”: proyek yang terbuka dihitung lagi dan setiap sidik jari dibandingkan dengan sidik jari laporan."
    },
    {
      "k": "h",
      "t": "Proyek lama memberi tahu"
    },
    {
      "k": "p",
      "t": "Setiap proyek yang disimpan mencatat versi hasil yang dipakai untuk menghitungnya. Ketika proyek yang dihitung sebelum perubahan yang berkaitan dengan fiturnya dibuka, aplikasi mencantumkan perubahan tersebut, dijelaskan dalam bahasa Anda, dan menandai hasil sebagai kedaluwarsa sampai dihitung ulang. Bila ragu, suatu perubahan dianggap berlaku: satu pemberitahuan berlebih hanya memakan semenit, satu yang kurang dapat menyembunyikan angka yang telah bergeser."
    },
    {
      "k": "h",
      "t": "Satu batasan"
    },
    {
      "k": "p",
      "t": "Aplikasi selalu membandingkan WebAssembly dengan WebAssembly. Alat native mereproduksi sidik jari peramban bit demi bit pada model uji, tetapi fungsi trigonometri berasal dari pustaka yang berbeda di setiap platform, sehingga model yang perakitannya memakainya dengan cara yang dibulatkan berbeda oleh keduanya dapat berbeda pada bit terakhir antara baris perintah dan peramban."
    },
    {
      "k": "link",
      "slug": "end-to-end-certificates",
      "t": "Separuh lain dari memercayai sebuah angka: memeriksanya terhadap model:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/PROVENANCE.md",
      "label": "PROVENANCE.md",
      "t": "Deskripsi teknis lengkap:"
    }
  ]
};

export default body;
