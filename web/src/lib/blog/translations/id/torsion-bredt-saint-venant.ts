import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Bredt atau Saint-Venant: teori torsi mana yang berlaku, dan berapa harga pilihan yang salah",
  "excerpt": "Tiga rumus, satu penampang, tiga angka berbeda. Mana yang berlaku bergantung pada dindingnya; bila dua berlaku sekaligus, Bredt menghasilkan nilai 2 sampai 15% terlalu rendah.",
  "blocks": [
    {
      "k": "p",
      "t": "Tiga rumus berbeda memberikan tegangan geser akibat torsi. Untuk penampang yang sama, hasilnya dapat berbeda hingga beberapa orde besaran, dan mana yang berlaku bergantung pada jenis dinding penampang."
    },
    {
      "k": "p",
      "t": "Sejauh itu ada di buku teks mana pun. Yang jarang dijelaskan adalah apa yang terjadi ketika dua dari ketiganya berlaku pada penampang yang sama: keduanya memberikan jawaban berbeda, dan selisihnya selalu mengarah ke arah yang sama."
    },
    {
      "k": "h",
      "t": "Ketiga rumus"
    },
    {
      "k": "ul",
      "items": [
        "Cauchy, τ = T·r / Iₚ. Hanya untuk penampang lingkaran, dan di situ eksak: itu satu-satunya kasus ketika penampang datar tetap datar. Tegangan bertambah linear terhadap jari-jari, dari minimum di sisi dalam hingga maksimum di sisi luar.",
        "Bredt, τ = T / (2·Aₘ·t). Untuk penampang berdinding tipis tertutup. Torsi dipikul oleh aliran geser yang bersirkulasi mengelilingi luas yang dilingkupi. Aₘ adalah luas yang dilingkupi garis tengah dinding, bukan oleh sisi luarnya; mencampuradukkan keduanya adalah kesalahan umum.",
        "Saint-Venant, τ = T·t / J dengan J = (1/3)·Σb·t³. Untuk penampang berdinding tipis terbuka. Tanpa lintasan tertutup, aliran harus berbalik arah melintasi tebal, itulah sebabnya tebal muncul berpangkat tiga."
      ]
    },
    {
      "k": "note",
      "t": "Saint-Venant sering disajikan sebagai \"teori penampang terbuka\", padahal ia adalah teori umum, dan dua lainnya adalah kasus khusus darinya dengan solusi bentuk tertutup. Pada penampang lingkaran, solusinya persis sama dengan Cauchy, karena simetri lingkaran berarti penampang tidak mengalami pilin. Pada dinding tipis tertutup, solusinya adalah solusi Bredt."
    },
    {
      "k": "h",
      "t": "Ketika dua berlaku, keduanya tidak sepakat"
    },
    {
      "k": "p",
      "t": "Ambil sebuah tabung lingkaran. Cauchy berlaku dan eksak. Bredt juga berlaku: dindingnya tertutup dan aliran geser mengelilinginya. Tetapi Bredt mengasumsikan tegangan konstan sepanjang tebal, sedangkan pada Cauchy tegangan bertambah terhadap jari-jari. Jadi Bredt memberikan rata-rata dan Cauchy memberikan maksimum."
    },
    {
      "k": "table",
      "caption": "Tabung lingkaran berongga: seberapa jauh Bredt berada di bawah nilai eksak, menurut tebal dinding relatif.",
      "head": [
        "t / rₘ",
        "Contoh (rₘ = 50 mm)",
        "τ Bredt / τ eksak",
        "Bredt lebih rendah sebesar"
      ],
      "rows": [
        [
          "0.05",
          "dinding 2,5 mm",
          "0.976",
          "2.4 %"
        ],
        [
          "0.10",
          "dinding 5,0 mm",
          "0.955",
          "4.5 %"
        ],
        [
          "0.20",
          "dinding 10,0 mm",
          "0.918",
          "8.2 %"
        ],
        [
          "0.50",
          "dinding 25,0 mm",
          "0.850",
          "15.0 %"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Bredt lebih rendah pada keempat kasus. Untuk tabung dengan dinding 5 mm dan jari-jari rata-rata 50 mm, yang menurut kaidah praktis umum masih dihitung berdinding tipis, tegangan sebenarnya 4,7% lebih tinggi daripada yang dihitung. Dengan dinding 10 mm, 8,9%."
    },
    {
      "k": "quote",
      "t": "Kesalahan selalu bertanda sama: Bredt menghasilkan nilai yang terlalu rendah."
    },
    {
      "k": "p",
      "t": "Selisih 4,5% tidak menonjol dalam pemeriksaan desain, sehingga batang yang gagal dapat tampak memenuhi."
    },
    {
      "k": "img",
      "base": "blog/torsion-tube",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic dengan kantilever CHS 105×5 di bawah torsi 1 kN·m. Panel penampang terbuka pada Torsi: T = 1,00 kN·m, τmax = 13,34 MPa, J = 393,7 cm⁴, berlabel “Lingkaran — eksak”, diikuti tiga teori dimulai dari Saint-Venant.",
      "caption": "Tabung dari tabel di Stabileo: 13,34 MPa, dengan setiap teori terdaftar di bawahnya beserta rumusnya."
    },
    {
      "k": "embed",
      "query": "example=torsion-tube&inspect=1&open=torsion",
      "label": "Tabung yang sama di Stabileo: kantilever CHS 105×5 di bawah torsi 1 kN·m. Panel terbuka pada Torsi dan menampilkan Cauchy 13,34 MPa dan Bredt 12,73 MPa, yaitu 95% dari tabel di atas. Geser titiknya atau ubah penampangnya dan ketiga nilai diperbarui."
    },
    {
      "k": "h",
      "t": "Membuka dinding mengubah orde besaran"
    },
    {
      "k": "p",
      "t": "Di antara teori yang tumpang tindih, selisihnya beberapa persen. Antara dinding tertutup dan terbuka, selisihnya beberapa orde besaran. Ambil tabung persegi 100×100 mm dengan dinding 5 mm lalu belah memanjang: luasnya, beratnya, dan hampir seluruh kekakuan lenturnya tetap."
    },
    {
      "k": "table",
      "caption": "Tabung persegi 100×100×5 yang sama, tertutup dan dengan belahan memanjang, di bawah torsi 1 kN·m.",
      "head": [
        "",
        "Tertutup",
        "Terbelah",
        "Faktor"
      ],
      "rows": [
        [
          "J [mm⁴]",
          "4,286,875",
          "15,833",
          "271"
        ],
        [
          "τ [MPa]",
          "11.08",
          "315.79",
          "29"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Kekakuan torsi turun dengan faktor 271 dan tegangan naik dengan faktor 29. Profil kanal C dan tabung persegi dengan berat yang sama berperilaku sangat berbeda dalam torsi."
    },
    {
      "k": "note",
      "t": "Ada istilah lain yang sering terlewat: pilin. Ketika penampang terbuka tidak dapat berpilin bebas, karena terjepit atau karena torsinya berubah sepanjang batang, torsi pilin muncul di atas torsi Saint-Venant. Mengabaikannya juga menghasilkan perkiraan yang terlalu rendah."
    },
    {
      "k": "h",
      "t": "Apa yang dilakukan Stabileo dengan ini"
    },
    {
      "k": "p",
      "t": "Stabileo menampilkan ketiganya, masing-masing dengan rumus, suku-sukunya, dan nilainya. Yang tidak berlaku juga ditampilkan, beserta alasannya. Dan ketika dua teori sah untuk penampang yang sama, ia menunjukkan selisih di antara keduanya alih-alih diam-diam memilih salah satu."
    },
    {
      "k": "p",
      "t": "Titik berat, pusat geser, dan inti pusat ditangani dengan cara yang sama: dihitung langkah demi langkah, terlihat penuh, pada poligon penampang yang sebenarnya, bukan dari rumus untuk setiap bentuk."
    },
    {
      "k": "note",
      "t": "Untuk melihatnya, buka editor, gambar atau pilih sebuah batang, lalu buka Lanjutan → Analisis penampang → Torsi. Untuk tabung lingkaran Anda akan melihat Cauchy dan Bredt berdampingan, dengan persentase selisih di antara keduanya. Untuk profil kanal C Anda akan melihat Bredt ditandai tidak berlaku, beserta alasannya."
    },
    {
      "k": "h",
      "t": "Singkatnya"
    },
    {
      "k": "ol",
      "items": [
        "Apakah dinding membentuk sirkuit tertutup? Bredt, dengan Aₘ diukur pada garis tengah.",
        "Apakah terbuka? Saint-Venant, dan tebal masuk berpangkat tiga: dinding yang paling tebal menentukan.",
        "Apakah lingkaran? Cauchy, dan ia eksak. Jika Anda juga memakai Bredt, harapkan hasilnya lebih rendah.",
        "Apakah pilin dikekang? Maka Saint-Venant saja tidak cukup."
      ]
    },
    {
      "k": "p",
      "t": "Bagaimanapun, catat teori mana yang Anda gunakan bersama nilainya."
    },
    {
      "k": "link",
      "slug": "bars-or-finite-elements",
      "t": "Pertanyaan yang sama (teori mana yang berlaku, dan berapa harga pilihan yang salah) muncul saat memilih antara batang portal dan elemen hingga:"
    },
    {
      "k": "note",
      "t": "Angka-angka dalam tulisan ini berasal dari solusi bentuk tertutup untuk penampang yang disebutkan: tabung lingkaran berongga dengan Aₘ pada garis tengah, dan tabung persegi 100×100×5 dengan J tertutup dari Bredt dan J terbuka dari Saint-Venant. Anda dapat mereproduksinya di Stabileo dengan penampang yang sama."
    }
  ]
};

export default body;
