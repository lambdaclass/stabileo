import type { PostBody } from '../../types';
import { nextReleaseAdvisoryBlocks } from '../../next-release-advisories';

const body: PostBody = {
  "title": "Pemberitahuan keselamatan: hasil mana yang berubah dan apa yang harus dilakukan",
  "excerpt": "Cacat Stabileo yang dapat memberikan hasil salah atau tidak konservatif: siapa yang terdampak, cara mengetahui apakah suatu model terdampak, apa yang dilakukan sementara itu, dan kapan cacat tersebut diperbaiki.",
  "blocks": [
    {
      "k": "p",
      "t": "Hasil Stabileo digunakan untuk mendesain struktur nyata. Ketika kami menemukan cacat yang dapat menghasilkan hasil yang salah, terutama yang tidak konservatif, kami menerbitkannya sebagai pemberitahuan keselamatan: apa yang salah, model mana yang terdampak, cara mengenalinya, apa yang dilakukan sampai perbaikan tersedia, dan apa yang perlu diperiksa ulang pada hasil yang sudah digunakan."
    },
    {
      "k": "p",
      "t": "Hampir semua cacat ini ditemukan oleh program verifikasi kami sendiri: perbandingan dengan tujuh program elemen hingga lain, contoh hitungan yang telah dipublikasikan, uji invarian fisik, dan tinjauan atas penurunan rumus setiap elemen. Menerbitkannya adalah bagian dari pekerjaan itu: cacat yang tidak dilaporkan akan tetap berada dalam perhitungan yang sudah diserahkan."
    },
    {
      "k": "note",
      "t": "Status per 12 November 2026: SA-2026-001 sampai 020 diperbaiki di versi 0.3.0, SA-2026-021 sampai 024 di versi 0.4.0, dan SA-2026-025 sampai 047 di versi 0.5.0 (SA-2026-040 dibatasi: pemeriksaan ditandai belum lengkap), kecuali SA-2026-044: keruntuhan plastis 2D tetap ditolak sampai #758 ditutup. SA-2026-048 diperbaiki setelah versi 0.5.0 dan sudah ada di stabileo.com sejak 8 November 2026. SA-2026-049, SA-2026-050, SA-2026-051, SA-2026-052, dan SA-2026-053 diperbaiki setelah versi 0.5.0 dan sudah ada di stabileo.com sejak 9 November 2026. Menerbitkannya adalah bagian dari cara kami memverifikasi hasil, bukan tanda bahwa cacat itu masih terbuka. Sebuah pemberitahuan dianggap selesai diperbaiki ketika perbaikannya sudah aktif di stabileo.com, bukan ketika perubahannya baru ada. Selama pemberitahuan masih terbuka, gunakan solusi sementaranya dan periksa hasil yang terdampak secara manual sebelum menandatangani. SA-2026-054 — Draf: perbaikan belum digabungkan atau dirilis. SA-2026-055 — Draf: perbaikan belum digabungkan atau dirilis. SA-2026-056 — Draf: belum terselesaikan; belum ada perbaikan yang digabungkan atau dirilis. SA-2026-057 — Draf: perbaikan belum digabungkan atau dirilis. SA-2026-059 — Diperbaiki di PR #1921, menunggu rilis. SA-2026-060 — Draf: perbaikan lokal menunggu tinjauan dan rilis. SA-2026-062 — Draf: perbaikan lokal menunggu tinjauan dan rilis."
    },
    {
      "k": "note",
      "t": "SA-2026-058 — Diperbaiki di PR #1922, menunggu rilis."
    },
    {
      "k": "note",
      "t": "SA-2026-061 — Diperbaiki di PR #1952, menunggu rilis."
    },
    {
      "k": "note",
      "t": "SA-2026-063 — Diperbaiki di PR #2009, menunggu rilis."
    },
    {
      "k": "note",
      "t": "SA-2026-064 — Diperbaiki di 0.6.1."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-064-steel-cb-combination.md",
      "label": "SA-2026-064",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-065 — Diperbaiki di 0.6.1."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-065-snow-roof-step.md",
      "label": "SA-2026-065",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-066 — Diperbaiki di 0.6.1."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-066-cirsoc201-transverse-cm.md",
      "label": "SA-2026-066",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-067 — Diperbaiki di 0.6.1."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-067-snow-roof-rotation.md",
      "label": "SA-2026-067",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-068 — Diperbaiki di 0.6.1."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-068-provided-torsion-stirrups.md",
      "label": "SA-2026-068",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-069 — Diperbaiki di 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-069-torsion-secondary-shear.md",
      "label": "SA-2026-069",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-070 — Diperbaiki di 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-070-interior-member-couples.md",
      "label": "SA-2026-070",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-071 — Diperbaiki di 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-071-incomplete-concurrent-demands.md",
      "label": "SA-2026-071",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-072 — Diperbaiki di 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-072-snow-ridge-subdivision.md",
      "label": "SA-2026-072",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-073 — Diperbaiki di 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-073-snow-crossing-moment.md",
      "label": "SA-2026-073",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-074 — Diperbaiki di 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-074-snow-panel-subdivision.md",
      "label": "SA-2026-074",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-075 — Diperbaiki di 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-075-cirsoc201-secondary-stirrup-legs.md",
      "label": "SA-2026-075",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-076 — Diperbaiki di 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-076-wind-enclosure.md",
      "label": "SA-2026-076",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-077 — Diperbaiki di 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-077-wind-wall-height-transfer.md",
      "label": "SA-2026-077",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-078 — Diperbaiki di 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-078-wind-roof-pressure-zones.md",
      "label": "SA-2026-078",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-079 — Diperbaiki di 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-079-gravity-shell-coverage.md",
      "label": "SA-2026-079",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-080 — Diperbaiki di 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-080-floor-zone-eccentricity.md",
      "label": "SA-2026-080",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-082 — Diperbaiki di 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-082-snow-companion-basis.md",
      "label": "SA-2026-082",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-083 — Diperbaiki di 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-083-concentrated-live-actions.md",
      "label": "SA-2026-083",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-084 — Diperbaiki di 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/results-changes/2026-11-fillet-weld-physical-runs.md",
      "label": "SA-2026-084",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-085 — Diperbaiki di 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/results-changes/2026-11-fillet-weld-physical-runs.md",
      "label": "SA-2026-085",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-086 — Diperbaiki di #2316, menunggu rilis."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-086-seismic-static-story-forces.md",
      "label": "SA-2026-086",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-087 — Pembuatan ditolak di #2316, menunggu rilis."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-087-seismic-modal-load-generation.md",
      "label": "SA-2026-087",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-088 — Diperbaiki di 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/results-changes/2026-11-gravity-core.md#combined-member-diagram-extrema",
      "label": "SA-2026-088",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-089 — Diperbaiki di 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-089-roller-z-fixed.md",
      "label": "SA-2026-089",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-090 — Diperbaiki di 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/results-changes/2026-11-gravity-core.md#width-mode-level-mass-follows-loaded-carriers",
      "label": "SA-2026-090",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-091 — Dibatasi di #2338, menunggu rilis."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-091-rc-torsion-shear-verification.md",
      "label": "SA-2026-091",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-092 — Kasus gabungan ditolak di #2372 dan potongan dikoreksi di #2382, menunggu rilis."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-092-section-stress-shear.md",
      "label": "SA-2026-092",
      "t": "Contoh tabung tipis menempatkan serat pada sumbu lokal batang (y = 0,0995 m, z = 0). Perhitungan lama menghasilkan geser total 4,5697 MPa dan von Mises 7,9149 MPa, dan pemeriksaan memenuhi untuk kedua tanda torsi. Ketika kontribusi geser saling memperkuat, jumlah geser bertanda adalah 6,4625 MPa. Tegangan von Mises yang bersesuaian adalah 11,1934 MPa, yang melebihi kuat leleh 9 MPa. Ketika kontribusi saling meniadakan, tegangan von Mises mendekati nol dan pemeriksaan memenuhi."
    },
    {
      "k": "note",
      "t": "SA-2026-093 — Diperbaiki di #2381, menunggu rilis."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-093-plane-moving-load-axial-force.md",
      "label": "SA-2026-093",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-094 — Diperbaiki di #2364, menunggu rilis."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-094-plane-free-body-end-moments.md",
      "label": "SA-2026-094",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-095 — Diperbaiki di #2364, menunggu rilis."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-095-plane-signed-scoped-self-weight.md",
      "label": "SA-2026-095",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-096 — Diperbaiki di 0.6.3."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-096-static-seismic-stories-and-rafters.md",
      "label": "SA-2026-096",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-097 — Diperbaiki di 0.6.3."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-097-workbook-inputs-and-plane-springs.md",
      "label": "SA-2026-097",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-098 — Diperbaiki di 0.6.3."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-098-rc-drawn-reinforcement-verification.md",
      "label": "SA-2026-098",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-099 — Dibatasi di 0.6.3."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-099-gravity-and-roof-step-loads.md",
      "label": "SA-2026-099",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-100 — Rilis berikutnya (0.6.4)."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-100-result-display-signs.md",
      "label": "SA-2026-100",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-101 — Rilis berikutnya (0.6.4)."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-101-plate-analysis-conformity.md",
      "label": "SA-2026-101",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-102 — Rilis berikutnya (0.6.4)."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-102-diagram-extrema-and-span-demands.md",
      "label": "SA-2026-102",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-103 — Rilis berikutnya (0.6.4)."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-103-rc-torsion-evidence.md",
      "label": "SA-2026-103",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-104 — Rilis berikutnya (0.6.4)."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-104-member-load-reversal-and-planar-couples.md",
      "label": "SA-2026-104",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-105 — Rilis berikutnya setelah 0.6.3."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-105-restored-planar-moment-edits.md",
      "label": "SA-2026-105",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-106 — Rilis berikutnya setelah 0.6.3 (pembatasan)."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-106-complementary-plate-remesh-arc.md",
      "label": "SA-2026-106",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    {
      "k": "note",
      "t": "SA-2026-107 — Rilis berikutnya setelah 0.6.3 (pembatasan)."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-107-plate-remesh-shell-edits.md",
      "label": "SA-2026-107",
      "t": "Masukan yang terdampak dan tindakan pengguna."
    },
    ...nextReleaseAdvisoryBlocks("Rilis berikutnya setelah 0.6.4.", "Masukan yang terdampak dan tindakan pengguna."),
    {
      "k": "img",
      "base": "blog/recheck-stale",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo PRO dengan portal beton yang disimpan sebelum hasil diberi versi. Spanduk di bagian bawah berbunyi “Hasil kedaluwarsa: proyek ini terakhir dihitung dengan versi lama, dan 19 perubahan terdaftar menyangkutnya”, dengan tombol “Apa yang berubah” dan “Jalankan ulang”.",
      "caption": "Bagaimana perbaikan sampai ke proyek yang tersimpan: sampai dihitung ulang, hasilnya tetap ditandai kedaluwarsa, dengan perubahan yang menyangkutnya hanya satu klik jauhnya."
    },
    {
      "k": "h",
      "t": "Ringkasan"
    },
    {
      "k": "table",
      "caption": "Pemberitahuan yang diterbitkan. Tingkat keparahan: kritis ketika kapasitas atau gaya yang bekerja dapat jauh di sisi tidak aman tanpa tanda yang terlihat.",
      "head": [
        "Pemberitahuan",
        "Apa",
        "Tingkat keparahan",
        "Status"
      ],
      "rows": [
        [
          "SA-2026-001",
          "Kombinasi dan beban yang dihasilkan (CIRSOC 101, 102, 103) tidak konservatif",
          "Tinggi",
          "Diperbaiki di 0.2.0"
        ],
        [
          "SA-2026-002",
          "Pemeriksaan beton (CIRSOC 201, ACI 318) melebihkan kapasitas",
          "Kritis",
          "Diperbaiki di 0.2.0"
        ],
        [
          "SA-2026-003",
          "Pemeriksaan baja, baja canai dingin, dan sambungan melebihkan kapasitas",
          "Kritis",
          "Diperbaiki di 0.2.0"
        ],
        [
          "SA-2026-004",
          "Analisis yang mengabaikan sebagian model (dinamika, tekuk, keruntuhan plastis)",
          "Kritis",
          "Diperbaiki di 0.2.0"
        ],
        [
          "SA-2026-005",
          "Batang miring 2D: gaya aksial tanpa komponen beban sepanjang batang",
          "Tinggi",
          "Diperbaiki 2026-10-21"
        ],
        [
          "SA-2026-006",
          "Model bidang dihitung dalam 3D: momen nodal dan rotasi paksa terbalik",
          "Tinggi",
          "Diperbaiki 2026-10-21"
        ],
        [
          "SA-2026-007",
          "Tekuk 3D tanpa ragam torsi atau lentur-torsi",
          "Tinggi",
          "Diperbaiki 2026-10-21"
        ],
        [
          "SA-2026-008",
          "Spektrum respons: geser dasar SRSS pada CQC; partisipasi tanpa massa yang terkait tumpuan",
          "Tinggi",
          "Diperbaiki 2026-10-21"
        ],
        [
          "SA-2026-009",
          "Cangkang solid SHB8 terlalu kaku 22 % pada lentur pelat tipis (lendutan 18 % terlalu rendah)",
          "Sedang (lebih tinggi pada struktur statis tak tentu)",
          "Diperbaiki 2026-10-19"
        ],
        [
          "SA-2026-010",
          "Sertifikat spektral meloloskan hasil yang tidak hingga",
          "Sedang",
          "Diperbaiki 2026-10-19"
        ],
        [
          "SA-2026-011",
          "Tumpuan 3D diubah dari pegas menjadi jepit atau sendi, tetapi dihitung sebagai pegas",
          "Tinggi",
          "Diperbaiki 2026-10-20"
        ],
        [
          "SA-2026-012",
          "Analisis nonlinier material (hanya mesin dan WASM): gaya batang tetap elastis setelah leleh",
          "Sedang",
          "Diperbaiki di 0.3.0"
        ],
        [
          "SA-2026-013",
          "Cangkang melengkung: momen lentur dilaporkan nol; tegangan mempertahankan regangan termal bebas",
          "Tinggi",
          "Diperbaiki di 0.3.0"
        ],
        [
          "SA-2026-014",
          "Keruntuhan plastis 3D: faktornya bergantung pada penomoran elemen (hingga 2,4 kali beban keruntuhan)",
          "Tinggi",
          "Diperbaiki di 0.3.0"
        ],
        [
          "SA-2026-015",
          "Kabel dengan berat sendiri mendapat tarik terlalu kecil pada struktur statis tak tentu",
          "Tinggi",
          "Diperbaiki di 0.3.0"
        ],
        [
          "SA-2026-016",
          "Busur (balok lengkung mesin, alat busur aplikasi): Iy dan Iz tertukar pada segmen yang hampir vertikal",
          "Sedang",
          "Diperbaiki di 0.3.0"
        ],
        [
          "SA-2026-017",
          "Interaksi tanah-struktur: kurva p-y, t-z, dan q-z menyimpang dari acuannya",
          "Tinggi",
          "Diperbaiki di 0.3.0"
        ],
        [
          "SA-2026-018",
          "Cangkang MITC9 (hanya mesin dan WASM) pada geometri melengkung mengalami regangan akibat gerak benda tegar",
          "Sedang",
          "Diperbaiki di 0.3.0"
        ],
        [
          "SA-2026-019",
          "Beban suhu batang (mesin dan WASM; aplikasi mengompensasi sejak 2026-10-07): α baja dan tinggi penampang persegi padat",
          "Sedang",
          "Diperbaiki di 0.3.0"
        ],
        [
          "SA-2026-020",
          "Analisis nonlinier material 3D (hanya mesin dan WASM): permukaan leleh kurang konservatif dibanding 2D",
          "Sedang",
          "Diperbaiki di 0.3.0"
        ],
        [
          "SA-2026-021",
          "Atap bebas: tidak ada angin sepanjang bubungan dan, melintangnya, kurang dari minimum §2.1.5 (17 % darinya pada 20 m/s)",
          "Tinggi",
          "Diperbaiki di 0.4.0"
        ],
        [
          "SA-2026-022",
          "Dengan tekanan tanah H, kombinasi saat beban mati melawannya tidak ada (27 sampai 45 % terlalu rendah pada satu contoh)",
          "Tinggi",
          "Diperbaiki di 0.4.0"
        ],
        [
          "SA-2026-023",
          "Kolom beton bertulang: pemeriksaan hanya membaca satu tanda momen; susunan batang tulangan tak merata (6, 10, 14…) memenuhi pada sisi yang lebih kuat",
          "Kritis",
          "Diperbaiki di 0.4.0"
        ],
        [
          "SA-2026-024",
          "Pondasi telapak, sambungan, pelat lantai, dinding, dan pengoptimal baja didesain untuk beban tanpa faktor ketika kombinasi didefinisikan tetapi tidak dihitung (perhitungan langsung, penghitungan kombinasi yang gagal, atau daftar aktif kosong)",
          "Tinggi",
          "Diperbaiki di 0.4.0"
        ],
        [
          "SA-2026-025",
          "Geser AISC 360 G2 (hanya mesin dan WASM): tanpa luas badan, memenuhi pada rasio 0, dan disertifikasi",
          "Sedang",
          "Diperbaiki di 0.5.0"
        ],
        [
          "SA-2026-026",
          "Geser EC3 6.2.6 (hanya mesin dan WASM): tanpa luas geser, mengambil Av = 0.5·A, Vpl,Rd 57 % terlalu tinggi pada HEB 300, dan disertifikasi",
          "Sedang",
          "Diperbaiki di 0.5.0"
        ],
        [
          "SA-2026-027",
          "Selubung cangkang: mempertahankan kombinasi dengan Von Mises terbesar, bukan nilai ekstrem tiap komponen (mx 14 % terlalu rendah pada satu contoh)",
          "Tinggi",
          "Diperbaiki di 0.5.0"
        ],
        [
          "SA-2026-028",
          "Lentur EN 1992-1-1 (PRO norma lain, tersertifikasi): mengasumsikan baja tarik leleh dan tidak mengiterasi batang tulangan atas; MRd hingga 22 % terlalu tinggi",
          "Tinggi",
          "Diperbaiki di 0.5.0"
        ],
        [
          "SA-2026-029",
          "3D: kolom CIRSOC 201 di aplikasi didesain dengan Mz terhadap tinggi penampang (baja 36 % terlalu sedikit pada satu contoh); pemeriksaan 3D tersertifikasi pada mesin membaca geser lateral Vy sebagai geser badan",
          "Kritis",
          "Diperbaiki di 0.5.0"
        ],
        [
          "SA-2026-030",
          "Tekan CIRSOC 301: penampang dengan luas lebih kecil dari pelat-pelatnya mendapat Qa negatif dan kapasitas di atas beban leleh penuh, dan memenuhi",
          "Tinggi",
          "Diperbaiki di 0.5.0"
        ],
        [
          "SA-2026-031",
          "Riwayat waktu: beban yang bekerja pada t = 0 di DOF tanpa massa hilang pada langkah pertama (resiprositas meleset hingga 33 kali, rantai dua DOF meleset 24 % dari bentuk tertutupnya)",
          "Sedang",
          "Diperbaiki di 0.5.0"
        ],
        [
          "SA-2026-032",
          "Analisis modal: ragam berfrekuensi nol dari sebuah mekanisme dibuang dan ragam lainnya dikembalikan seolah lengkap",
          "Sedang",
          "Diperbaiki di 0.5.0"
        ],
        [
          "SA-2026-033",
          "Pembangkit beban: lantai dengan satu batang rendah pada sebagian luasnya kehilangan seluruh beban area (36 m² dari lantai 6 × 6 m pada satu contoh); rangka batang tidak dihitung sebagai struktur atap",
          "Tinggi",
          "Diperbaiki di 0.5.0"
        ],
        [
          "SA-2026-034",
          "Pemeriksaan keseimbangan melaporkan beban dan reaksi sesuai untuk kasus yang pemeriksaannya mengabaikan beban; pengeditan lantai tipikal mengenai batang jenis lain dan salinan kehilangan sendinya",
          "Sedang",
          "Diperbaiki di 0.5.0"
        ],
        [
          "SA-2026-035",
          "Peralihan 3D ke 2D: potongan membengkokkan batang terhadap sumbu penampang yang salah (portal pada bidang Y–Z 13,5 kali terlalu kaku)",
          "Tinggi",
          "Diperbaiki di 0.5.0"
        ],
        [
          "SA-2026-036",
          "Peralihan 3D ke 2D pada Y–Z atau X–Y: kekangan dibaca seolah portal berdiri di X–Z (pengikat goyangan terbuang atau bekerja di luar bidang)",
          "Tinggi",
          "Diperbaiki di 0.5.0"
        ],
        [
          "SA-2026-037",
          "Analisis korotasional 3D: vektor rotasi dikurangkan (lengkung Bathe–Bolourchi meleset 1,3 %, tidak mengecil dengan perhalusan)",
          "Sedang",
          "Diperbaiki di 0.5.0"
        ],
        [
          "SA-2026-038",
          "Tekuk 3D: faktor batang yang tekannya membesar sepanjang batang di bawah beban searah sumbunya keluar terlalu tinggi (+43 % untuk satu batang), dan batang yang tertekan hanya di antara ujung-ujungnya ditolak",
          "Tinggi",
          "Diperbaiki di 0.5.0"
        ],
        [
          "SA-2026-039",
          "Impor Excel dan IFC: Iy dan Iz persegi panjang dan tabung tertukar (kantilever 20 × 40 menjadi 4 kali terlalu lentur, yang 40 × 20 menjadi 4 kali terlalu kaku)",
          "Tinggi",
          "Diperbaiki di 0.5.0"
        ],
        [
          "SA-2026-040",
          "Pemeriksaan ACI 318 dan EN 1992: batang beton bertulang memenuhi tanpa pemeriksaan torsinya",
          "Tinggi",
          "Dibatasi di 0.5.0"
        ],
        [
          "SA-2026-041",
          "Kolom beton bertulang: momen terbesar hanya diperiksa pada tekan terbesar",
          "Tinggi",
          "Diperbaiki di 0.5.0"
        ],
        [
          "SA-2026-042",
          "Tekuk 2D: faktor batang yang tekannya membesar sepanjang batang di bawah beban searah sumbunya keluar terlalu tinggi (+43 % sampai +68 % untuk satu batang)",
          "Tinggi",
          "Diperbaiki di 0.5.0"
        ],
        [
          "SA-2026-043",
          "Analisis harmonik: koreksi ragam yang diabaikan kehilangan digitnya ketika satu ragam jauh lebih lunak daripada yang lain (79 kali pada 2,3 Hz pada satu contoh)",
          "Tinggi",
          "Diperbaiki di 0.5.0"
        ],
        [
          "SA-2026-044",
          "Keruntuhan plastis 2D: faktor keruntuhan berubah menurut penomoran titik simpul, arah batang, dan satuan (hingga 4,6 kali pada struktur yang sama)",
          "Tinggi",
          "Belum diperbaiki di 0.5.0: keruntuhan plastis 2D ditahan sampai #758 ditutup; analisis batas ada di 0.5.0"
        ],
        [
          "SA-2026-045",
          "Keruntuhan plastis 3D: batang tanpa momen plastis yang dapat dipakai diperlakukan sebagai batang yang tidak pernah leleh (6 kali terlalu tinggi pada satu contoh, dan disertifikasi)",
          "Tinggi",
          "Diperbaiki di 0.5.0"
        ],
        [
          "SA-2026-046",
          "Analisis harmonik: memilih antara superposisi modal dan penyelesaian langsung per beban, sehingga superposisi dan resiprositas rusak (107 % pada satu titik simpul dalam contoh); stabileo.com dan build mesin/WASM dari main, sejak 5 November 2026 sampai perbaikan",
          "Tinggi",
          "Diperbaiki di 0.5.0"
        ],
        [
          "SA-2026-047",
          "Cangkang: kasus beban yang memberi perpindahan tumpuan kehilangan tegangan cangkangnya, dan kombinasi serta selubung hanya menjumlahkan tegangan cangkang dari kasus lain (dapat tidak konservatif, tanpa peringatan); 0.2.0 sampai 0.4.0",
          "Tinggi",
          "Diperbaiki di 0.5.0"
        ],
        [
          "SA-2026-048",
          "Baja CIRSOC 301: Cb melewatkan perubahan tanda di ujung panjang tak terkekang yang dinyatakan lebih pendek dari batang (kanal dengan kelengkungan ganda mendapat Cb = 2,55, bukan 1, sehingga melebihkan kapasitas tekuk torsi lateral); 0.2.0 sampai 0.5.0, alfa desktop dan stabileo.com sampai 8 November 2026",
          "Tinggi",
          "Diperbaiki setelah 0.5.0; di stabileo.com sejak 8 November 2026"
        ],
        [
          "SA-2026-049",
          "Tumpuan dengan pegas positif dan kekangan kaku pada DOF yang sama: pada 3D pegas membebaskan kekangan dan mengubah kondisi batas; kode mesin di 0.2.0 sampai 0.5.0",
          "Tinggi",
          "Diperbaiki setelah 0.5.0; di stabileo.com sejak 9 November 2026"
        ],
        [
          "SA-2026-050",
          "Tekuk dapat mengubah perhitungan kelangsingan yang gagal menjadi nol, dan analisis multikasus dapat mengembalikan nilai tak hingga di dalam hasil yang berhasil",
          "Sedang",
          "Diperbaiki setelah 0.5.0; di stabileo.com sejak 9 November 2026"
        ],
        [
          "SA-2026-051",
          "Beban bergerak 3D: selubung melewatkan puncak gaya interior dan kehilangan komponen aksial berat gandar pada batang miring, berpotensi meremehkan gaya yang bekerja tanpa peringatan; 0.2.0 sampai 0.5.0 dan desktop-v0.1.0-alpha.1 sampai alpha.3",
          "Tinggi",
          "Diperbaiki setelah 0.5.0; di stabileo.com sejak 9 November 2026"
        ],
        [
          "SA-2026-052",
          "Beban bergerak mesin 2D dan 3D: selubung aksial dengan beban merata aksial parsial permanen melewatkan nilai ekstrem pada batas bidang beban di antara titik tinjau, berpotensi meremehkan gaya yang bekerja tanpa peringatan; tidak ada batas versi rilis yang diklaim",
          "Tinggi",
          "Diperbaiki setelah 0.5.0; di stabileo.com sejak 9 November 2026"
        ],
        [
          "SA-2026-053",
          "Beban bergerak 2D dan 3D: beban terpusat di ujung menyertakan gaya di luar batang dalam selubung, menambah nilai ekstrem aksial dan geser palsu dan melebihkan gaya yang bekerja; tidak ada batas versi rilis yang diklaim",
          "Rendah",
          "Diperbaiki setelah 0.5.0; di stabileo.com sejak 9 November 2026"
        ],
        [
          "SA-2026-054",
          "Analisis linier dapat diam-diam mengembalikan hasil yang tidak akurat akibat kekakuan yang tidak terselesaikan atau komponen beban PCG yang terlewat",
          "Tinggi",
          "Draf: perbaikan belum digabungkan atau dirilis"
        ],
        [
          "SA-2026-055",
          "P-Delta 2D dan 3D dapat meremehkan amplifikasi dan melaporkan kestabilan ketika gaya aksial bervariasi di bawah beban merata atau terpusat sepanjang batang portal",
          "Tinggi",
          "Draf: perbaikan belum digabungkan atau dirilis"
        ],
        [
          "SA-2026-056",
          "Model portal dan cangkang 3D berkekangan: hasil harmonik dan riwayat waktu paksa berubah pada deskripsi yang setara; cakupan di luar model yang dipertahankan belum dipastikan",
          "Tinggi",
          "Draf: belum terselesaikan; belum ada perbaikan yang digabungkan atau dirilis"
        ],
        [
          "SA-2026-057",
          "Tampilan sertifikat plastis dapat melabeli faktor di luar interval tersertifikasinya sebagai di dalam; ekstraksi mekanisme eksak membuang penolakan sumber daya pada build PR #1888 sebelum perbaikan",
          "Sedang",
          "Draf: perbaikan belum digabungkan atau dirilis"
        ],
        [
          "SA-2026-058",
          "Model harmonik 2D/3D besar di atas 3000 DOF bebas independen dapat mempertahankan respons ragam yang diabaikan secara tidak akurat di luar q ≤ 1/16 pada frekuensi di luar cakupan peringatan pemotongan (galat target kompleks 8,079% terukur)",
          "Tinggi",
          "Diperbaiki di PR #1922, menunggu rilis"
        ],
        [
          "SA-2026-059",
          "Analisis lanjutan web dapat memberi kabel tahanan tekan tanpa peringatan (pemutaran ulang P-Delta: −4,599884347090908 kN); tinjau gaya yang bekerja pada model kabel dari analisis lanjutan, analisis langsung, dan wizard pengajaran",
          "Tinggi",
          "Diperbaiki di PR #1921, menunggu rilis"
        ],
        [
          "SA-2026-060",
          "Analisis bertahap dapat diam-diam memperkaku rotasi nyata setelah pergantian satuan atau pada ujung terlepas dengan pegas tumpuan; periksa ulang model bertahap dengan sendi batang",
          "Tinggi",
          "Draf: perbaikan lokal menunggu tinjauan dan rilis"
        ],
        [
          "SA-2026-061",
          "Kendali panjang busur dan perpindahan mengabaikan reaksi dan memakai beban batang tanpa skala; pengabaian hasil kekangan 2D/3D, Guyan, bertahap, dan riwayat waktu juga perlu ditinjau. Jalankan ulang hasil yang terdampak atau verifikasi secara independen; 0.2.0–0.5.0 dan build main terdampak berikutnya.",
          "Tinggi",
          "Diperbaiki di PR #1952, menunggu rilis"
        ],
        [
          "SA-2026-062",
          "Analisis plastis 3D mentah dapat diam-diam melaporkan nol ketika keadaan elastis awal gagal; build tersertifikasi lama mempertahankan faktor itu. Main sudah mengembalikan batas tersertifikasi positif dengan peringatan; PR #1943 meneruskan penolakan awal",
          "Tinggi",
          "Draf: perbaikan lokal menunggu tinjauan dan rilis"
        ],
        [
          "SA-2026-063",
          "Analisis bertahap dan nonlinier berkekangan membuang gerak master yang ditetapkan; kabel dan riwayat waktu kini menolak gerak tumpuan yang tidak didukung. Peringatan dinamika umum yang sudah ada tetap terpisah dari pengabaian ini",
          "Tinggi",
          "Diperbaiki di PR #2009, menunggu rilis"
        ],
        [
          "SA-2026-064",
          "Cb baja dapat berasal dari kombinasi lain atau dari bentang pendek tak terkekang yang tidak ditentukan lokasinya (#1316, #2088). Jalankan ulang pemeriksaan baja CIRSOC 301 dan tinjau kapasitas lentur, pemanfaatan interaksi, dan kombinasi yang menentukan.",
          "Tinggi",
          "Diperbaiki di 0.6.1"
        ],
        [
          "SA-2026-065",
          "Timbunan salju pada undakan atap dapat terabaikan pada atap miring penerima (#2082). Bangkitkan ulang beban salju CIRSOC 104 dan jalankan ulang analisis serta pemeriksaan desain yang terdampak.",
          "Tinggi",
          "Diperbaiki di 0.6.1"
        ],
        [
          "SA-2026-066",
          "Cm beton dapat menerima kredit momen ujung padahal ada beban transversal di antara tumpuan (#2089). Periksa ulang kolom dan dinding beton langsing, momen yang diperbesar, dan tulangan.",
          "Tinggi",
          "Diperbaiki di 0.6.1"
        ],
        [
          "SA-2026-067",
          "Rotasi denah dapat mengubah beban salju yang dihasilkan (#2093). Bangkitkan ulang beban dengan geometri atap yang sebenarnya, lalu jalankan ulang analisis dan pemeriksaan; memutar model lama kembali bukan perbaikan.",
          "Tinggi",
          "Diperbaiki di 0.6.1"
        ],
        [
          "SA-2026-068",
          "Torsi dapat memenuhi dengan sengkang desain yang tidak memadai (#2141). Jalankan ulang pemeriksaan desain beton dan tinjau kapasitas transversal sebenarnya, jarak sengkang, dan kegagalan torsi. Penyediaan tulangan longitudinal yang tidak diperiksa bukan sangkar yang memenuhi.",
          "Tinggi",
          "Diperbaiki di 0.6.1"
        ],
        [
          "SA-2026-069",
          "Batas penampang torsi mengabaikan geser sekunder yang bersamaan (#2142). Jalankan ulang desain beton dan tinjau kegagalan penampang serta sengkang yang hilang; menambah sengkang tidak dapat memperbaiki batas penampang yang terlampaui.",
          "Tinggi",
          "Diperbaiki di 0.6.2"
        ],
        [
          "SA-2026-070",
          "Lendutan dan rotasi batang interior mengabaikan beban bentang (#2143). Tinjau bentuk terdeformasi, tampilan edukasi, dan pemeriksaan kemampuan layan baja/beton, termasuk trapesium penuh dan parsial. Pemulihan berbeban tanpa EI yang cukup kini menolak secara eksplisit.",
          "Tinggi",
          "Diperbaiki di 0.6.2"
        ],
        [
          "SA-2026-071",
          "Verifikasi batang dapat memenuhi dengan gaya bersamaan yang tidak lengkap (#2096). Jalankan ulang desain beton dan baja serta tinjau kombinasi, batang, titik tinjau, dan sertifikat.",
          "Tinggi",
          "Diperbaiki di 0.6.2"
        ],
        [
          "SA-2026-072",
          "Pembagian tepi atap yang tidak sama dapat menggeser bubungan salju dan mengubah beban yang dihasilkan (#2144). Bangkitkan ulang beban salju, lalu jalankan ulang analisis, kombinasi, dan pemeriksaan desain. Menghitung ulang beban tersimpan saja tidak mengoreksinya.",
          "Tinggi",
          "Diperbaiki di 0.6.2"
        ],
        [
          "SA-2026-073",
          "Batang yang melintasi bubungan salju menerima satu tekanan seragam dan kehilangan momen beban fisik. Beban kini dipecah pada bubungan fisik. Buat ulang semua beban luasan hasil pembuatan yang terpengaruh, lalu jalankan ulang analisis, kombinasi, dan pemeriksaan desain. Menghitung ulang beban hasil pembuatan yang tersimpan saja tidak memperbaikinya. (#2176).",
          "Tinggi",
          "Diperbaiki di 0.6.2"
        ],
        [
          "SA-2026-074",
          "Membagi balok atap miring dapat mengklasifikasikan panel atap eksplisit sebagai lantai dan secara diam-diam menghilangkan salju tepi atapnya. Klasifikasi atap panel kini menggunakan jejak panel fisik. Buat ulang semua beban luasan hasil pembuatan yang terpengaruh, lalu jalankan ulang analisis, kombinasi, dan pemeriksaan desain. Menghitung ulang beban tersimpan saja tidak memperbaikinya. (#2172). Balok atap miring yang tidak dipecah di atas panel bawah terpisah juga dapat salah mengklasifikasikan panel itu sebagai atap, mengubah beban luasan atap/lantai dan secara diam-diam menambahkan salju pada mode lebar.",
          "Tinggi",
          "Diperbaiki di 0.6.2"
        ],
        [
          "SA-2026-075",
          "Pemeriksaan geser dan torsi sekunder CIRSOC 201-2005 dan 2025 dapat mengakui kaki sengkang dan lebar arah utama. Balok dan kolom dapat memenuhi tanpa peringatan dengan tulangan sekunder yang terlalu sedikit (#2171). Setelah memperbarui, jalankan ulang desain beton bertulang dan tinjau pemberitahuan pemeriksaan ulang proyek tersimpan.",
          "Tinggi",
          "Diperbaiki di 0.6.2"
        ],
        [
          "SA-2026-076",
          "Satu dinding terbuka dapat mengklasifikasikan bangunan sebagai terbuka dan menghilangkan tekanan internal (#2203). Tinjau setiap catatan bukaan dinding dan atap, klasifikasikan ulang selubung bangunan, bangkitkan ulang W dan Wa, lalu jalankan ulang analisis, kombinasi, dan pemeriksaan desain. Menghitung ulang beban tersimpan saja tidak mengoreksinya.",
          "Tinggi",
          "Diperbaiki di 0.6.2"
        ],
        [
          "SA-2026-077",
          "Angin pada dinding mengabaikan gaya pondasi dan berubah akibat pembagian (#2204). Tinjau setiap catatan bukaan dinding dan atap, klasifikasikan ulang selubung bangunan, bangkitkan ulang W dan Wa, lalu jalankan ulang analisis, kombinasi, dan pemeriksaan desain. Menghitung ulang beban tersimpan saja tidak mengoreksinya.",
          "Tinggi",
          "Diperbaiki di 0.6.2"
        ],
        [
          "SA-2026-078",
          "Zona tekanan atap dan momen pertamanya bergantung pada pembagian (#2205). Tinjau setiap catatan bukaan dinding dan atap, klasifikasikan ulang selubung bangunan, bangkitkan ulang W dan Wa, lalu jalankan ulang analisis, kombinasi, dan pemeriksaan desain. Menghitung ulang beban tersimpan saja tidak mengoreksinya.",
          "Tinggi",
          "Diperbaiki di 0.6.2"
        ],
        [
          "SA-2026-079",
          "Cakupan cangkang parsial dapat menghilangkan beban gravitasi atau menempatkannya pada titik tinjau yang salah. Bangkitkan ulang beban gravitasi mode panel dengan cangkang, lalu jalankan ulang analisis dan desain. (#2199, #2200)",
          "Tinggi",
          "Diperbaiki di 0.6.2"
        ],
        [
          "SA-2026-080",
          "Zona lantai yang memerlukan beban batang eksentris ditolak. Tinjau definisi beban lantai sebelum menghitung. Zona yang mencakup satu panel utuh menerapkan reaksi panel biasa. (#2201)",
          "Tinggi",
          "Diperbaiki di 0.6.2"
        ],
        [
          "SA-2026-082",
          "Kombinasi pendamping secara diam-diam menggunakan salju tereduksi kemiringan alih-alih pembebanan batang atap datar. Spesifikasi seismik lama juga dapat mencampuradukkan salju fisik dan salju atap datar. Buat ulang beban dan kombinasi salju, lalu jalankan ulang analisis dan pemeriksaan desain. (#2211).",
          "Tinggi",
          "Diperbaiki di 0.6.2"
        ],
        [
          "SA-2026-083",
          "SA-2026-083: Pembuatan beban otomatis CIRSOC 101 memblokir aksi terpusat menurut penggunaan dan aksi atap yang posisi paling merugikannya tidak dievaluasi (§4.4). Beban merata yang dibuat sebelumnya mungkin mengabaikan aksi penentu. Tinjau model yang terdampak dan periksa aksi terpusat secara manual sebelum mengulang analisis dan desain. (#2207).",
          "Tinggi",
          "Diperbaiki di 0.6.2"
        ],
        [
          "SA-2026-084",
          "Membagi las sudut yang dibebani di ujung dapat menghilangkan reduksi panjang efektifnya (#2243). Jalankan ulang pemeriksaan kelompok las yang terdampak.",
          "—",
          "Diperbaiki di 0.6.2"
        ],
        [
          "SA-2026-085",
          "Las sudut pendek dapat diberi kaki efektif yang berlebihan (#2244). Jalankan ulang pemeriksaan kelompok las yang terdampak.",
          "—",
          "Diperbaiki di 0.6.2"
        ],
        [
          "SA-2026-086",
          "Beban gempa statik yang dibangkitkan dapat memberikan gaya tingkat dan aksi batang yang salah. Bangkitkan ulang beban yang terdampak dan jalankan ulang analisis serta desain.",
          "Tinggi",
          "Diperbaiki di #2316, menunggu rilis"
        ],
        [
          "SA-2026-087",
          "Pembangkitan beban gempa modal dapat memberikan gaya batang yang salah. Bangkitkan ulang beban yang terdampak dengan metode statik jika berlaku, atau tunggu #2319.",
          "Tinggi",
          "Pembuatan ditolak di #2316, menunggu rilis"
        ],
        [
          "SA-2026-088",
          "Diagram batang ABS dan SRSS menyertakan nilai ekstrem fungsi gabungan di antara batas-batas beban. Jalankan ulang kombinasi, diagram, dan pemeriksaan yang bergantung (#2273).",
          "—",
          "Diperbaiki di 0.6.2"
        ],
        [
          "SA-2026-089",
          "Tumpuan 3D rollerZ atau custom3d tanpa kekangan eksplisit, atau jenis tumpuan yang tidak dikenal, dianalisis sebagai jepit penuh tanpa peringatan. Tinjau kekangan tumpuan yang dimaksud, lalu jalankan ulang analisis, kombinasi, dan desain. (#2276).",
          "Tinggi",
          "Diperbaiki di 0.6.2"
        ],
        [
          "SA-2026-090",
          "Luas lantai dan berat gempa pada mode lebar dapat tidak sesuai dengan beban batang yang dibangkitkan karena memakai bentang titik simpul atau mensyaratkan daerah tertutup. Kini keduanya memakai luas tributari dari penumpu yang dibebani. Bangkitkan ulang denah gravitasi, berat gempa, dan beban gempa, lalu jalankan ulang analisis, kombinasi, dan pemeriksaan desain yang bergantung. Menghitung ulang beban tersimpan saja tidak mengoreksi aksi gempa (#2269). (#2210)",
          "—",
          "Diperbaiki di 0.6.2"
        ],
        [
          "SA-2026-091",
          "Pemeriksaan geser, torsi, dan sengkang pengekang gempa pada beton dapat memenuhi tanpa bukti tulangan. Jalankan ulang desain tersertifikasi dan tinjau potongan penentu, gambar tulangan, dan laporan.",
          "Tinggi",
          "Dibatasi di #2338, menunggu rilis"
        ],
        [
          "SA-2026-092",
          "Tegangan penampang terperinci dapat meremehkan geser total dan von Mises serta mengembalikan hasil memenuhi. Hitung ulang tegangan yang terdampak dan tinjau diagram, pemeriksaan, dan laporan.",
          "Tinggi",
          "Kasus gabungan ditolak di #2372 dan potongan dikoreksi di #2382, menunggu rilis"
        ],
        [
          "SA-2026-093",
          "Beban bergerak bidang dapat mengaburkan lompatan gaya aksial pada gandar terpusat. Jalankan ulang selubung dan garis pengaruh aksial yang terdampak, dan tinjau laporan yang mengandalkannya.",
          "Tinggi",
          "Diperbaiki di #2381, menunggu rilis"
        ],
        [
          "SA-2026-094",
          "Inspektur benda bebas 2D dapat menampilkan momen ujung batang global dengan tanda yang salah. Hasil analisis tidak terpengaruh. Periksa kembali batang-batangnya, dan bangkitkan ulang serta tinjau laporan yang terdampak.",
          "Sedang",
          "Diperbaiki di #2364, menunggu rilis"
        ],
        [
          "SA-2026-095",
          "Proyek 2D tersimpan dengan aturan berat sendiri bertanda atau berlingkup dapat memberikan reaksi yang salah tanpa peringatan. Pemberitahuan pemeriksaan ulang muncul saat proyek yang terdampak dibuka. Hitung ulang hasilnya, lalu bangkitkan ulang dan tinjau laporan yang terdampak.",
          "Tinggi",
          "Diperbaiki di #2364, menunggu rilis"
        ],
        [
          "SA-2026-096",
          "Pembangkitan gempa statik dapat menghitung titik simpul bresing atau mesh sebagai tingkat dan menempatkan inersia balok atap pada titik simpul ujung. Periksa elevasi lantai dan pembebanan balok atap. Bangkitkan ulang kasusnya sebelum menjalankan ulang analisis dan pemeriksaan desain.",
          "Tinggi",
          "Diperbaiki di 0.6.3"
        ],
        [
          "SA-2026-097",
          "Impor buku kerja dapat menghilangkan data model dan ekspor 2D dapat melabeli pegas rotasi sebagai translasi. Bandingkan model yang diimpor dengan buku kerja aslinya. Koreksi dan impor ulang, verifikasi tumpuan dan beban, lalu jalankan ulang analisis yang terdampak dan bangkitkan ulang ekspor.",
          "Tinggi",
          "Diperbaiki di 0.6.3"
        ],
        [
          "SA-2026-098",
          "Pemeriksaan beton dapat menerima jarak sengkang yang berlebihan atau mengakui tulangan yang tidak ada pada penampang. Gambar kolom dapat menampilkan diameter batang tulangan yang salah. Periksa ulang terhadap tulangan yang disediakan dan gaya yang bekerja secara bersamaan, lalu tinjau gambar, tabel, dan laporan yang terdampak.",
          "Tinggi",
          "Diperbaiki di 0.6.3"
        ],
        [
          "SA-2026-099",
          "Pembangkitan gravitasi dapat membebani area cangkang dan balok dua kali atau mengubah penetapan penumpu setelah rotasi atau pembagian. Transfer salju pada undakan atap dapat kehilangan gaya dan momen. Bangkitkan ulang beban dan gunakan kasus yang diverifikasi secara independen di mana pun pembangkitan menolak.",
          "Tinggi",
          "Dibatasi di 0.6.3"
        ],
        [
          "SA-2026-100",
          "Momen reaksi, tampilan benda bebas, dan daftar beban terpusat dapat menampilkan tanda atau sumbu yang salah. Verifikasi nilai yang ditampilkan terhadap keseimbangan dan arah beban yang dimaksud. Periksa kembali hasil yang terdampak dan bangkitkan ulang laporan.",
          "Sedang",
          "Rilis berikutnya (0.6.4)"
        ],
        [
          "SA-2026-101",
          "PRO dapat menghitung dengan pelat yang terabaikan, mesh yang didasarkan pada masukan tidak lengkap, atau sambungan dinding–pelat lantai yang terputus. Bandingkan mesh dengan geometri yang dimaksud, perbaiki pelat dan pertemuan yang terdampak, lalu jalankan ulang analisis dan pemeriksaan desain.",
          "Tinggi",
          "Rilis berikutnya (0.6.4)"
        ],
        [
          "SA-2026-102",
          "Diagram dapat memberikan puncak atau gaya penampang yang salah di dekat aksi terpusat, dan potongan bentang terbalik dapat menukar sisi desain beton. Periksa gaya penentu, sisi tulangan, dan masukan gradien momen baja. Jalankan ulang analisis dan pemeriksaan yang terdampak.",
          "Tinggi",
          "Rilis berikutnya (0.6.4)"
        ],
        [
          "SA-2026-103",
          "Pemeriksaan torsi dan geser beton dapat menerima baja transversal yang tidak memadai atau mengakui batang tulangan keliling atau tarik yang tidak terverifikasi. Ulangi verifikasi dengan tulangan sebenarnya dan gaya yang bekerja secara bersamaan, dan tinjau laporan yang terdampak.",
          "Tinggi",
          "Rilis berikutnya (0.6.4)"
        ],
        [
          "SA-2026-104",
          "Membalik batang dapat mengarahkan ulang beban merata, dan analisis dapat mengabaikan kopel terpusat bidang lama. Periksa arah beban tersimpan, ordinat ujung, dan kolom kopel. Perbaiki bebannya dan jalankan ulang analisis serta pemeriksaan desain yang terdampak.",
          "Tinggi",
          "Rilis berikutnya (0.6.4)"
        ],
        [
          "SA-2026-105",
          "Mengedit kopel terpusat bidang yang dipulihkan menjadi nol dapat membuat momen lama tetap aktif. Verifikasi dan masukkan ulang momen yang dimaksud, lalu jalankan ulang analisis dan pemeriksaan desain yang terdampak.",
          "Tinggi",
          "Rilis berikutnya setelah 0.6.3"
        ],
        [
          "SA-2026-106",
          "Pembuatan mesh ulang dapat memakai busur pelengkap dari batas pelat melengkung. Verifikasi mesh terhadap sapuan yang ditentukan, bangun ulang mesh yang terdampak, dan jalankan ulang analisis serta pemeriksaan desain.",
          "Tinggi",
          "Rilis berikutnya setelah 0.6.3 (pembatasan)"
        ],
        [
          "SA-2026-107",
          "Pembuatan mesh ulang dapat membuang offset cangkang dan perubahan kelengkungan. Verifikasi dan pulihkan properti cangkang yang dimaksud sebelum menjalankan ulang analisis dan pemeriksaan desain.",
          "Tinggi",
          "Rilis berikutnya setelah 0.6.3 (pembatasan)"
        ],
        [
          "SA-2026-108",
          "Proyeksi XZ atau YZ dapat diam-diam membuang komponen gaya nodal yang tegak lurus bidang analisis. Periksa gaya nodal pada setiap kasus beban dan jalankan ulang analisis serta pemeriksaan desain yang terdampak dengan model spasial.",
          "Tinggi",
          "Rilis berikutnya setelah 0.6.4"
        ],
        [
          "SA-2026-109",
          "Label tumpuan DXF bidang yang tidak dikenal dapat diam-diam diimpor sebagai tumpuan sendi. Bandingkan tumpuan yang diimpor dengan gambar aslinya, koreksi ketidaksesuaian, dan jalankan ulang analisis yang terdampak.",
          "Tinggi",
          "Rilis berikutnya setelah 0.6.4"
        ],
        [
          "SA-2026-110",
          "Analisis web dapat diam-diam mengabaikan pegas dengan kekakuan tak hingga atau kasus beban dalam sebuah kombinasi. Periksa kekakuan pegas, nama kasus, dan faktor netto, lalu jalankan ulang analisis dan kombinasi yang terdampak.",
          "Tinggi",
          "Rilis berikutnya setelah 0.6.4"
        ],
        [
          "SA-2026-111",
          "Pembangkitan gravitasi panel otomatis dapat menghitung beban lantai yang sama dua kali. Periksa cangkang yang tumpang tindih dan bentang balok yang terhubung, bangkitkan ulang denah beban gravitasi tersimpan yang terdampak, dan jalankan ulang analisis yang terdampak.",
          "Tinggi",
          "Rilis berikutnya setelah 0.6.4"
        ],
        [
          "SA-2026-112",
          "Basic 3D dapat diam-diam mengabaikan semua elemen cangkang. Jalankan ulang kasus beban dan kombinasi yang terdampak di PRO 3D dengan mesh cangkang lengkap, lalu ulangi pemeriksaan desain yang bergantung.",
          "Tinggi",
          "Rilis berikutnya setelah 0.6.4"
        ],
        [
          "SA-2026-113",
          "API Rust native dapat mensertifikasi hasil linier yang diberikan untuk kasus beban yang ditolak solver. Jalankan ulang analisis dan sertifikasi yang terdampak, termasuk kombinasi dan selubung yang bergantung.",
          "Sedang",
          "Rilis berikutnya setelah 0.6.4"
        ],
        [
          "SA-2026-114",
          "Aturan kombinasi tersimpan dapat menerapkan faktor pada kelompok beban yang salah tanpa peringatan. Pulihkan kelompok yang dimaksud, bangkitkan ulang kombinasi dan kasus komposit yang terdampak, dan jalankan ulang analisis serta selubungnya.",
          "Tinggi",
          "Rilis berikutnya setelah 0.6.4"
        ],
        [
          "SA-2026-115",
          "Pembangkitan gravitasi panel dapat membebani daerah lantai yang sama melalui beberapa penumpu. Bangkitkan ulang denah gravitasi yang terdampak, selesaikan beban atau geometri yang bertentangan, dan jalankan ulang analisis yang terdampak.",
          "Tinggi",
          "Rilis berikutnya setelah 0.6.4"
        ],
        [
          "SA-2026-116",
          "Solver nonlinier dapat menerima lintasan panjang busur yang salah atau mengabaikan gaya tangensial pada rol miring. Jalankan ulang analisis nonlinier bidang dan korotasional spasial yang terdampak, termasuk portal melengkung dengan offset pusat geser.",
          "Tinggi",
          "Rilis berikutnya setelah 0.6.4"
        ],
        [
          "SA-2026-117",
          "Densitas cangkang negatif atau nol dapat membalik atau menghilangkan berat sendiri. Pulihkan densitas yang dimaksud, jalankan ulang kasus statik dan kombinasi yang terdampak, dan ulangi pemeriksaan yang bergantung.",
          "Tinggi",
          "Rilis berikutnya setelah 0.6.4"
        ],
        [
          "SA-2026-118",
          "Target kelompok berat sendiri yang tidak valid dapat menghilangkan berat kelompok. Perbaiki targetnya, jalankan ulang kasus dan kombinasi yang terdampak, dan bangun ulang selubungnya.",
          "Tinggi",
          "Rilis berikutnya setelah 0.6.4"
        ],
        [
          "SA-2026-119",
          "Densitas material yang hilang dapat memberikan frekuensi modal yang salah. Pulihkan densitasnya, bangun ulang sumber massa, dan jalankan ulang analisis dinamik yang terdampak.",
          "Tinggi",
          "Rilis berikutnya setelah 0.6.4"
        ],
        [
          "SA-2026-120",
          "Gravitasi otomatis dapat menggandakan beban dek, memindahkan beban ke bentang di luar batas bentang otomatis, atau salah mengklasifikasikan keterpaparan atap dan lantai. Bangkitkan ulang denah gravitasi, salju, dan angin yang terdampak, verifikasi bebannya, dan jalankan ulang analisis yang bergantung.",
          "Tinggi",
          "Rilis berikutnya setelah 0.6.4"
        ],
        [
          "SA-2026-121",
          "Analisis nonlinier bidang dapat mengembalikan hasil yang salah untuk beban batang. Jalankan ulang analisis yang terdampak, termasuk yang dipakai untuk memulai kelanjutan, dan tinjau perpindahan, reaksi tumpuan, dan gaya ujung batang.",
          "Sedang",
          "Rilis berikutnya setelah 0.6.4"
        ],
        [
          "SA-2026-122",
          "Kombinasi yang dibangkitkan dapat menghilangkan alternatif yang diperlukan atau beban hidup atap manual, memakai dasar salju yang salah, atau menyertakan kasus angin yang usang. Tinjau bebannya, faktor aturan, dan keanggotaan selubung. Hapus dari model kasus beban kosong usang yang telah dikonfirmasi, termasuk kasus yang sudah kosong di 0.6.4. Bangkitkan ulang kombinasi dan verifikasi bahwa kombinasi itu tidak memuat ID kasus tersebut sebelum menjalankan ulang analisis yang terdampak.",
          "Tinggi",
          "Rilis berikutnya setelah 0.6.4"
        ],
        [
          "SA-2026-123",
          "Gravitasi otomatis dapat mempertahankan beban di bawah dek dengan kelonggaran rendah atau menetapkan beban di tempat penutupnya tidak dapat ditentukan. Bangkitkan ulang beban gravitasi, angin atap, dan salju yang terdampak, verifikasi penetapannya, dan jalankan ulang analisis yang bergantung.",
          "Tinggi",
          "Rilis berikutnya setelah 0.6.4"
        ],
        [
          "SA-2026-124",
          "Berat sendiri berlingkup dapat mengabaikan target yang hilang atau memberikan berat batang terpilih hanya pada satu segmen. Perbaiki lingkupnya, verifikasi berat yang diterapkan, dan jalankan ulang analisis yang terdampak serta respons dinamika bidang kursus yang dibagi.",
          "Tinggi",
          "Rilis berikutnya setelah 0.6.4"
        ],
        [
          "SA-2026-125",
          "Laporan kinematik native dan WASM dapat menghitung kekangan kaku bersama dua kali. Periksa ulang derajat ketidaktentuan statis, klasifikasi, dan diagnosis, dan perbarui laporan yang terdampak.",
          "Sedang",
          "Rilis berikutnya setelah 0.6.4"
        ],
        [
          "SA-2026-126",
          "Suku berulang dapat menghilangkan pola beban penentu atau menghasilkan alternatif tanpa salju. Tinjau aturannya, bangkitkan ulang kombinasi dan kasus komposit yang terdampak, dan jalankan ulang analisis, selubung, dan pemeriksaan desain.",
          "Tinggi",
          "Rilis berikutnya setelah 0.6.4"
        ],
        [
          "SA-2026-127",
          "Pelat lantai dapat tidak meneruskan beban ke dinding ketika konektivitas mesh tidak lengkap. Buat mesh ulang kedua permukaan dengan sisi mesh bersama sepanjang seluruh pertemuan yang dimaksud, verifikasi jalur beban, dan jalankan ulang analisis spasial, selubung, dan pemeriksaan desain yang terdampak.",
          "Tinggi",
          "Rilis berikutnya setelah 0.6.4"
        ],
        [
          "SA-2026-128",
          "Konversi dapat mengabaikan beban aksial yang berbalik tanda pada batang bidang atau rangka batang spasial. Verifikasi beban merata dan gaya ujung ekuivalennya, lalu jalankan ulang analisis, selubung, dan pemeriksaan desain yang terdampak.",
          "Sedang",
          "Rilis berikutnya setelah 0.6.4"
        ],
        [
          "SA-2026-129",
          "Sapuan beban bergerak dapat salah menyatakan gaya geser atau aksial, dan posisi kendaraan tersimpan dapat mengabaikan lompatan gaya aksial pada rangka batang spasial. Pada saat bertepatan tepat, gandar dan beban terpusat permanen menghasilkan satu lompatan geser gabungan. Gaya geser di antara keduanya memiliki limit satu sisi ketika gandar mendekati atau melewati beban itu. Periksa kedua limit dengan gandar tepat sebelum dan tepat sesudah beban. Jalankan ulang sapuan yang terdampak, bangkitkan ulang kasus tersimpan, dan ulangi analisis serta pemeriksaan desain yang bergantung.",
          "Tinggi",
          "Rilis berikutnya setelah 0.6.4"
        ],
        [
          "SA-2026-130",
          "Analisis elastis bidang dapat mengembalikan perpindahan nol semua untuk sebuah mekanisme tanpa peringatan. Periksa sendi lentur dan kekangan, selesaikan mekanisme yang tidak disengaja, dan jalankan ulang analisis serta pemeriksaan desain yang terdampak.",
          "Tinggi",
          "Rilis berikutnya setelah 0.6.4"
        ],
        [
          "SA-2026-131",
          "Analisis dapat diam-diam mengabaikan atau salah membaca medan struktural, kekangan, metode kombinasi, gerakan tanah, atau beban tahap. Koreksi masukannya dan jalankan ulang analisis, kombinasi, dan pemeriksaan desain yang terdampak.",
          "Tinggi",
          "Rilis berikutnya setelah 0.6.4"
        ],
        [
          "SA-2026-132",
          "Proyek Basic yang dibuka kembali tanpa bidang gambar tersimpan dapat dihitung pada bidang yang salah. Pastikan bidang, arah beban, dan kekangan yang dimaksud, lalu jalankan ulang analisis, kombinasi, dan pemeriksaan desain yang terdampak.",
          "Tinggi",
          "Rilis berikutnya setelah 0.6.4"
        ]
      ]
    },
    {
      "k": "table",
      "caption": "Kasus yang didokumentasikan pada setiap pemberitahuan: nilai yang benar dan nilai yang dilaporkan Stabileo.",
      "head": [
        "Pemberitahuan",
        "Kasus",
        "Benar",
        "Dilaporkan",
        "Satuan"
      ],
      "rows": [
        [
          "SA-2026-024",
          "Portal 6 × 4 m, beban mati 20 kN/m pada balok, angin 15 kN, 1.2D + 1.6W, setelah pengeditan dengan perhitungan langsung aktif: reaksi vertikal pondasi telapak di sisi datang angin",
          "65.61",
          "56.01",
          "kN"
        ],
        [
          "SA-2026-023",
          "Kolom 30×30 cm, 6 Ø20 (tiga pada sisi bawah), Nu = 100 kN: φMn dengan sisi tiga batang tertekan",
          "78.57",
          "101.57",
          "kN·m"
        ],
        [
          "SA-2026-013",
          "Kantilever empat cangkang melengkung, 4 × 1 × 0,2 m, 10 kN di ujung: mx pada elemen pangkal",
          "35.0",
          "0",
          "kN·m/m"
        ],
        [
          "SA-2026-014",
          "Portal ruang 10 batang (frame3d-2), dinomori ulang: faktor keruntuhan plastis",
          "176.47",
          "424.3",
          "—"
        ],
        [
          "SA-2026-015",
          "Tiang antena 20 m berkabel pengikat, kabel pengikat baja 1 cm², 5 kN di puncak: tarik kabel pengikat",
          "5.18",
          "4.34",
          "kN"
        ],
        [
          "SA-2026-011",
          "Balok pada 0, 4, dan 8 m, tumpuan digambar sebagai jepit di 8 m: lendutan pada tumpuan itu",
          "0",
          "-14.4",
          "mm"
        ],
        [
          "SA-2026-017",
          "Lempung lunak c = 20 kPa, D = 1 m, z = 4 m: tahanan tanah batas p_u",
          "124",
          "84",
          "kN/m"
        ],
        [
          "SA-2026-008",
          "Dua ragam pada ω dan 1.1ω: geser dasar relatif terhadap nilai CQC",
          "1.00",
          "0.81",
          "—"
        ],
        [
          "SA-2026-007",
          "Kolom silang 200×10 mm, 1,5 m: beban kritis",
          "2993",
          "5860",
          "kN"
        ],
        [
          "SA-2026-006",
          "Portal dengan momen dan gaya nodal: goyangan",
          "0.92",
          "2.52",
          "mm"
        ],
        [
          "SA-2026-005",
          "Balok atap pelana: gaya aksial di pangkal",
          "-56.67",
          "-41.67",
          "kN"
        ],
        [
          "SA-2026-019",
          "IPE 300 dijepit di kedua ujung, gradien 20 °C: momen ujung",
          "14.04",
          "9.76",
          "kN·m"
        ],
        [
          "SA-2026-012",
          "Kantilever 4 m yang sudah leleh, beban ujung 1.2·Mp/L: momen di ujung jepit",
          "1012.5",
          "101250",
          "kN·m"
        ],
        [
          "SA-2026-016",
          "Busur setengah lingkaran 5 m pada bidang Y–Z, 40 segmen: lendutan di puncak",
          "-7.29",
          "-6.18",
          "mm"
        ],
        [
          "SA-2026-018",
          "Patch silinder MITC9 2×2 m, busur 0,2 m, baja, 50 mm, rotasi benda tegar 1 mrad: tegangan von Mises nodal terbesar",
          "0",
          "101",
          "MPa"
        ],
        [
          "SA-2026-020",
          "Kantilever 3D 4 m, N = 0.5·Np, beban ujung: beban pada leleh pertama",
          "158.2",
          "182.7",
          "kN"
        ],
        [
          "SA-2026-009",
          "Pelat tipis dalam lentur, ν = 0.3: kekakuan relatif terhadap nilai yang benar",
          "1.000",
          "1.225",
          "—"
        ]
      ]
    },
    {
      "k": "h",
      "t": "SA-2026-021: angin minimum pada atap bebas"
    },
    {
      "k": "p",
      "t": "Atap bebas (gudang terbuka, garasi mobil terbuka, kanopi) hanya mendapat tekanan netto pada Gambar 2.4-4 sampai 2.4-7, tegak lurus atap. CIRSOC 102-2025 §2.1.5 juga mensyaratkan gaya angin pada bangunan terbuka sekurang-kurangnya 0,75 kN/m² × Af, sebagai kasus beban horizontal tersendiri. Tanpa minimum itu, dengan angin sepanjang bubungan gaya horizontalnya nol, dan melintangnya gaya jatuh di bawah minimum pada kecepatan rendah dan sedang. Kini setiap arah memiliki kasus beban tersebut."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-021-free-roof-wind-minimum.md",
      "label": "SA-2026-021 selengkapnya",
      "t": "Pemberitahuan, beserta pengukurannya:"
    },
    {
      "k": "h",
      "t": "SA-2026-022: tekanan tanah yang dilawan oleh beban mati"
    },
    {
      "k": "p",
      "t": "Dengan beban H, CIRSOC 101-2025 meminta efek dari beban yang tidak bekerja. Kombinasi 0.9 D + 1.6 H dan 1.2 D + 1.6 H tidak pernah dibangkitkan, sehingga ketika beban mati melawan tekanan tanah (guling atau geser dinding) efeknya keluar terlalu rendah. Kini keduanya dibangkitkan, dengan atau tanpa angin atau gempa dalam model."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-022-earth-pressure-dead-load-resisting.md",
      "label": "SA-2026-022 selengkapnya",
      "t": "Pemberitahuan, beserta contohnya:"
    },
    {
      "k": "h",
      "t": "SA-2026-023: kolom beton bertulang dengan susunan batang tulangan tak merata"
    },
    {
      "k": "p",
      "t": "Momen pada titik tinjau sampai ke pemeriksaan kolom sebagai besaran mutlak, tetapi kapasitas di bawah gaya aksial dan lentur terhadap satu sumbu hanya dihitung untuk satu tanda, dengan sisi atas tertekan. Dengan 6, 10, 14, 18, atau 22 batang tulangan, perancang menaruh batang tambahan pada sisi bawah dan kanan, sehingga itulah tanda yang kuat: dengan momen terbalik kapasitasnya lebih rendah, dan itu tidak pernah diperiksa. Kolom 30×30 cm dengan 6 Ø20 di bawah tekan 100 kN memikul 101,57 kN·m ke satu arah dan 78,57 ke arah lainnya, dan memenuhi Mu = 100 kN·m. Ini memengaruhi pemeriksaan kolom CIRSOC 201 di bawah lentur terhadap satu sumbu (untuk tulangan yang dimiliki batang, dari perancang, dan dari pemeriksaan ulang mesin); pemeriksaan biaksial sudah mengambil kuadran terburuk."
    },
    {
      "k": "ul",
      "items": [
        "Cara mengetahui apakah ini memengaruhi Anda: model memiliki kolom beton yang diperiksa dengan CIRSOC 201 dan batang tulangannya tidak simetris terhadap sumbu lentur: 6, 10, 14, 18, atau 22 batang dari perancang, atau sisi yang dimasukkan manual dengan jumlah batang berbeda pada sisi yang berhadapan.",
        "Yang harus dilakukan: pada versi sebelum perbaikan, gunakan susunan simetris (4, 8, 12, 16, 20, atau 24 batang, atau sisi berhadapan yang sama), atau periksa kolom juga dengan batang tulangan dicerminkan: kapasitas yang lebih kecil dari keduanya yang menentukan.",
        "Status: diperbaiki di 0.4.0, aktif di stabileo.com sejak 25 Oktober 2026. Mesin menghitung kedua tanda dan mengambil yang lebih lemah; susunan simetris memberikan persis seperti sebelumnya."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-023-column-moment-sign.md",
      "label": "SA-2026-023 selengkapnya",
      "t": "Pemberitahuan, beserta kasus ujinya:"
    },
    {
      "k": "h",
      "t": "SA-2026-024: pondasi telapak, sambungan, pelat lantai, dan dinding didesain untuk beban tanpa faktor"
    },
    {
      "k": "p",
      "t": "Dengan kombinasi yang didefinisikan tetapi tidak ada satu pun yang dihitung, pondasi telapak dan sambungan membaca hasil di layar, yang kemudian berupa semua beban dengan faktor 1: keduanya didesain untuk beban layan, bukan kombinasi berfaktor. Hal ini terjadi dengan perhitungan langsung aktif (setelah pengeditan, ia hanya menghitung ulang “Semua beban” selama tampilan tunggal berada di layar) atau ketika penghitungan kombinasi gagal dan penghitungan tunggal menggantikannya. Pada portal di bawah 1.2D + 1.6W, reaksi pondasi telapak keluar 15 % terlalu rendah; dengan beban mati dan hidup, 29 sampai 38 %. Hal yang sama terjadi pada pelat lantai dan dinding, pada pengoptimal baja, dan dengan daftar kombinasi aktif yang kosong. Kini setiap desain menolak, dan menyebutkan alasannya, sampai kombinasi dihitung."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-024-design-on-unfactored-results.md",
      "label": "SA-2026-024 selengkapnya",
      "t": "Pemberitahuan, beserta contohnya:"
    },
    {
      "k": "h",
      "t": "SA-2026-014: keruntuhan plastis 3D bergantung pada penomoran"
    },
    {
      "k": "p",
      "t": "Di bawah lentur biaksial, pemeriksaan yang menutup sendi yang berputar mundur dan membuka kembali sendi tertutup yang terdorong keluar dari permukaan leleh dapat berputar siklik. Solver melanjutkan dari keadaan apa pun yang ditinggalkan oleh urutan elemen dan mendorong penampang tertutup menembus permukaan leleh: struktur yang sama, setelah dinomori ulang, melaporkan faktor keruntuhan dari 75,9 sampai 424,3, dibandingkan 176,47 yang tersertifikasi. Kini analisis berhenti pada keadaan konsisten terakhir dan melaporkan faktor itu sebagai batas bawah, dengan peringatan, sama untuk penomoran apa pun. Ini memengaruhi pushover 3D pada tab Pro."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-014-plastic-3d-element-order.md",
      "label": "SA-2026-014 selengkapnya",
      "t": "Pemberitahuan, beserta model uji dan nilai tersertifikasi:"
    },
    {
      "k": "h",
      "t": "SA-2026-011: tumpuan 3D diubah dari pegas menjadi jepit"
    },
    {
      "k": "p",
      "t": "Mengubah jenis tumpuan yang memiliki pegas mempertahankan konstanta pegasnya. Pada mode 3D, konstanta itu dikirim ke solver bersama kekangan, dan solver memperlakukan derajat kebebasan tersebut sebagai elastis: tumpuan yang digambar sebagai jepit dihitung sebagai pegas. Ini memengaruhi model yang dihitung pada mode 3D, termasuk model bidang yang dihitung dalam 3D; mode 2D tidak terpengaruh."
    },
    {
      "k": "ul",
      "items": [
        "Cara mengetahui apakah Anda terdampak: tumpuan semula berupa pegas (atau memiliki konstanta pegas) lalu diubah menjadi jepit, sendi, atau rol, atau sebuah derajat kebebasan dicentang sebagai terkekang. Pada hasil, tumpuan itu menunjukkan perpindahan atau rotasi tidak nol.",
        "Yang harus dilakukan: hitung ulang di stabileo.com model 3D yang tumpuannya diedit dari pegas menjadi kaku, dan bandingkan hasil di dekat tumpuan itu dengan hasil yang sudah Anda gunakan.",
        "Status: diperbaiki di stabileo.com pada 20 Oktober 2026. Setiap derajat kebebasan yang terkekang dihitung sebagai terkekang, termasuk pada proyek yang disimpan sebelumnya."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-011-springs-on-fixed-supports.md",
      "label": "SA-2026-011 selengkapnya",
      "t": "Pemberitahuan beserta reproduksi dan model ujinya:"
    },
    {
      "k": "h",
      "t": "SA-2026-013: momen cangkang melengkung dan tegangan termal"
    },
    {
      "k": "p",
      "t": "Cangkang melengkung (segi empat yang ditandai melengkung) melaporkan mx = my = mxy = 0 berapa pun lenturannya, dan di bawah beban suhu tegangannya mempertahankan regangan termal bebas: cangkang yang bebas memuai melaporkan E·α·ΔT/(1−ν), dan yang terkekang tidak melaporkan apa pun. Aplikasi juga mengirim suhu segi empat melengkung sebagai suhu segi empat datar, yang dibuang oleh mesin: cangkang dianalisis tanpa pemanasan. Hasil ini dibaca oleh plot kontur cangkang (juga pada gambar yang diekspor), tabel hasil Pro dan laporan PDF, serta desain pelat lantai ketika sebuah panel berupa segi empat melengkung; buku kerja hasil dan CSV sudah mengosongkan momen tersebut."
    },
    {
      "k": "ul",
      "items": [
        "Cara mengetahui apakah ini memengaruhi Anda: model memiliki segi empat melengkung dan Anda menggunakan momennya (kontur, tabel atau laporan Pro, desain pelat lantai), atau memiliki beban suhu pada segi empat melengkung.",
        "Yang harus dilakukan: jalankan ulang model tersebut dan ulangi setiap desain atau pemeriksaan yang membaca momen atau tegangannya di bawah suhu. Sampai saat itu, modelkan permukaan dengan segi empat datar (MITC4).",
        "Status: diperbaiki di 0.3.0, aktif di stabileo.com sejak 21 Oktober 2026."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-013-curved-shell-moments-and-thermal.md",
      "label": "SA-2026-013 selengkapnya",
      "t": "Pemberitahuan, beserta kantilever uji dan kasus termalnya:"
    },
    {
      "k": "h",
      "t": "SA-2026-017: kurva tanah pada interaksi tanah-struktur"
    },
    {
      "k": "p",
      "t": "Kurva tanah tidak mengikuti acuan yang dikutipnya. Lempung lunak mengabaikan suku J Matlock (tahanan batas sepertiga sampai setengah terlalu rendah di dekat permukaan); pasir selalu memakai faktor siklik A = 0.9 dan tabel k bertahap; lempung kaku melompat dari setengah ke tahanan penuh pada y50 dan turun menjadi 70 % sesudahnya. Kurva t-z dan q-z (hanya mesin dan WASM) melewatkan keliling fuste dan luas ujung. Ini menyangkut PRO → Lanjutan → Interaksi tanah-struktur. Panel kini menanyakan J dan pembebanan pasir, dan mesin menolak kurva yang kekurangan masukan, bukan mengasumsikannya. Yang harus dilakukan: jalankan ulang model tersebut dan periksa ulang lendutan dan momen tiang."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-017-soil-curves.md",
      "label": "SA-2026-017 selengkapnya",
      "t": "Pemberitahuan, beserta nilai sebelum dan sesudah untuk setiap kurva:"
    },
    {
      "k": "h",
      "t": "SA-2026-019: beban suhu pada batang"
    },
    {
      "k": "p",
      "t": "Mesin menghitung beban termal setiap batang dengan α = 12·10⁻⁶ /°C (milik baja) dan dengan tinggi persegi panjang padat ekuivalen, √(12·I/A). Pada IPE, momen gradien keluar 30 % terlalu rendah, dan pada aluminium gaya aksial akibat suhu hampir setengahnya. Aplikasi mengompensasi keduanya sejak 7 Oktober 2026, sehingga ini memengaruhi penggunaan langsung mesin atau API WASM-nya, dan model termal yang dihitung di aplikasi sebelum tanggal itu."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-019-frame-thermal-alpha-depth.md",
      "label": "SA-2026-019 selengkapnya",
      "t": "Pemberitahuan, beserta kasus ujinya:"
    },
    {
      "k": "h",
      "t": "SA-2026-012: gaya batang pada analisis nonlinier material"
    },
    {
      "k": "p",
      "t": "Setelah sebuah batang leleh, solver menyeimbangkan beban dengan kekakuan tereduksi tetapi melaporkan gaya yang dihitung dengan kekakuan elastis. Perpindahan dan reaksi tumpuan benar; gaya batang dan pemanfaatan tidak: pada sebuah kantilever, momen yang dilaporkan 100 kali momen sebenarnya. Solver ini hanya dapat dijangkau dari mesin atau API WASM-nya: tidak ada layar di aplikasi yang memanggilnya, sehingga hasil yang diperoleh di stabileo.com tidak terpengaruh."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-012-material-nonlinear-member-forces.md",
      "label": "SA-2026-012 selengkapnya",
      "t": "Pemberitahuan, beserta kantilever ujinya:"
    },
    {
      "k": "h",
      "t": "SA-2026-016: sumbu penampang pada segmen busur yang hampir vertikal"
    },
    {
      "k": "p",
      "t": "Segmen lurus sebuah busur memakai sumbu lokal bawaan batang lurus, yang untuk batang dengan kemiringan dalam 2,56° dari vertikal mengambil X global sebagai acuannya. Pada busur di luar bidang X–Z, hal itu memutar penampang segmen yang hampir vertikal di tumpuan busur sebesar 90°: Iy dan Iz tertukar di sana. Pada setengah lingkaran 40 segmen pada bidang Y–Z, lendutan di puncak keluar 15 % terlalu rendah. Ini memengaruhi balok lengkung mesin dan busur yang digambar dengan alat busur pada tab Batang (PRO) ketika sebuah segmen hampir vertikal; kurva pada denah tidak terpengaruh. Busur yang disimpan sebelumnya mendapat sumbu yang sudah dikoreksi saat proyek dibuka."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-016-curved-member-axes.md",
      "label": "SA-2026-016 selengkapnya",
      "t": "Pemberitahuan, beserta busur ujinya:"
    },
    {
      "k": "h",
      "t": "SA-2026-015: tarik kabel dengan berat sendiri"
    },
    {
      "k": "p",
      "t": "Analisis kabel memakai modulus Ernst, yaitu tangen dari hukum tali busur kabel yang menggantung di bawah beratnya sendiri, seolah-olah itu sekan dari tali busur lurus. Lendutan busur menyerap panjang tali busur, sehingga kabel membutuhkan tarik lebih besar daripada EA·ε untuk perpanjangan tertentu, bukan lebih kecil. Di tempat keseimbangan saja menentukan gaya kabel, tariknya benar; di tempat kabel berbagi beban dengan batang lain (tiang antena berkabel pengikat, kabel yang membresing portal) kabel mendapat tarik terlalu kecil dan batang di sebelahnya terlalu besar: pada tiang uji, 4,34 kN bukan 5,18 kN, dan dengan beban lebih kecil iterasi tidak konvergen. Pada aplikasi, ini memengaruhi model 3D dengan batang berperilaku “kabel” yang materialnya memiliki densitas."
    },
    {
      "k": "ul",
      "items": [
        "Cara mengetahui: model memiliki batang berperilaku “kabel”, materialnya memiliki densitas, dan kabel bukan satu-satunya jalur beban.",
        "Yang harus dilakukan: verifikasi secara independen gaya kabel dan angkur yang menentukan dengan berat sendiri kabel disertakan. Jalankan ulang analisis pada versi yang sudah diperbaiki.",
        "Status: diperbaiki di 0.3.0. Analisis kabel kini menyelesaikan hukum tali busur itu sendiri dengan iterasi Newton."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-015-cable-tension-chord-law.md",
      "label": "SA-2026-015 selengkapnya",
      "t": "Pemberitahuan, beserta tiang uji dan bentuk tertutupnya:"
    },
    {
      "k": "h",
      "t": "SA-2026-018: cangkang MITC9 pada geometri melengkung"
    },
    {
      "k": "p",
      "t": "Elemen MITC9 itu datar: ia memproyeksikan sembilan titik simpulnya ke satu bidang. Ketika titik simpul sisi tengah atau pusat berada di luar bidang itu (mesh MITC9 melengkung apa pun), proyeksinya tidak memiliki koreksi hubungan kaku seperti MITC4, sehingga rotasi benda tegar meregangkan elemen: mesh melengkung menahan rotasi elemen-elemennya dan melaporkan tegangan untuknya (101 MPa pada patch uji yang diputar 1 mrad). Elemen ini hanya digunakan dari mesin atau API WASM-nya: aplikasi tidak membuat elemen sembilan titik simpul, sehingga hasil yang diperoleh di stabileo.com tidak terpengaruh."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-018-mitc9-curved-rigid-motion.md",
      "label": "SA-2026-018 selengkapnya",
      "t": "Pemberitahuan, beserta patch uji dan belahan bola:"
    },
    {
      "k": "h",
      "t": "SA-2026-020: permukaan leleh analisis nonlinier material 3D"
    },
    {
      "k": "p",
      "t": "Pada 2D sebuah batang leleh ketika (N/Np)² + |M|/Mp melebihi 1. Pada 3D solver memakai (N/Np)² + (My/Mpy)² + (Mz/Mpz)², dengan rasio momen dikuadratkan, sehingga dengan gaya aksial atau lentur terhadap kedua sumbu, batang 3D leleh lebih lambat daripada batang yang sama pada 2D dan pemanfaatan yang dilaporkan rendah: dengan N = 0.5·Np beban pada leleh pertama keluar 15 % terlalu tinggi. Kini 3D memakai (N/Np)² + |My|/Mpy + |Mz|/Mpz, yang untuk lentur terhadap satu sumbu adalah permukaan 2D. Solver ini hanya dapat dijangkau dari mesin atau API WASM-nya: tidak ada layar aplikasi yang memanggilnya, sehingga hasil yang diperoleh di stabileo.com tidak terpengaruh."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-020-material-nonlinear-3d-yield-surface.md",
      "label": "SA-2026-020 selengkapnya",
      "t": "Pemberitahuan, beserta kasus ujinya:"
    },
    {
      "k": "h",
      "t": "SA-2026-008: geser dasar dan partisipasi modal pada analisis spektral"
    },
    {
      "k": "p",
      "t": "Dengan aturan CQC, geser dasar yang dilaporkan masih digabungkan dengan SRSS. Geser dasar modal pada satu arah memiliki tanda yang sama, sehingga CQC memberikan lebih besar daripada SRSS: dengan dua ragam berdekatan nilai yang dilaporkan 19 % terlalu rendah. Faktor partisipasi juga mengabaikan massa yang digandengkan matriks massa konsisten ke tumpuan, yang meremehkan respons pada model dengan sedikit elemen per kolom."
    },
    {
      "k": "ul",
      "items": [
        "Cara mengetahui apakah Anda terdampak: Anda menjalankan analisis spektral dengan CQC dan memakai geser dasar yang dilaporkan (misalnya, untuk menskalakannya ke geser dasar statik), atau Anda memakai massa konsisten dengan kolom satu atau dua elemen.",
        "Yang harus dilakukan: hitung ulang model yang terdampak di stabileo.com dan bandingkan dengan hasil yang sudah Anda gunakan. Solusi sementara yang diberikan pemberitahuan ini sebelum perbaikan tidak lagi berlaku.",
        "Status: diperbaiki di stabileo.com pada 21 Oktober 2026."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-008-spectral-combination.md",
      "label": "SA-2026-008 selengkapnya",
      "t": "Pemberitahuan, dengan kedua cacat secara terpisah:"
    },
    {
      "k": "h",
      "t": "SA-2026-007: tekuk torsi dan lentur-torsi pada 3D"
    },
    {
      "k": "p",
      "t": "Kekakuan geometrik batang 3D hanya memiliki suku lentur: tanpa suku Wagner dan tanpa kopling pusat geser. Tekuk torsi dan lentur-torsi tidak pernah muncul, dan beban Euler yang dilaporkan. Untuk kolom silang, beban yang dilaporkan 96 % di atas beban yang menentukan."
    },
    {
      "k": "ul",
      "items": [
        "Cara mengetahui apakah Anda terdampak: Anda memakai faktor tekuk 3D atau P-Delta 3D untuk struktur dengan penampang berdinding tipis terbuka berkekakuan torsi rendah: penampang silang, siku tunggal atau ganda, tee, kanal. Profil I simetris ganda, yang ditentukan oleh tekuk lentur, tidak terpengaruh. Pemeriksaan desain yang menghitung tekuk torsi sendiri (CIRSOC 301 E.4, sejak 0.2.0) juga tidak terpengaruh.",
        "Yang harus dilakukan: hitung ulang model yang terdampak di stabileo.com dan bandingkan dengan hasil yang sudah Anda gunakan. Solusi sementara yang diberikan pemberitahuan ini sebelum perbaikan tidak lagi berlaku.",
        "Status: diperbaiki di stabileo.com pada 21 Oktober 2026."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-007-torsional-buckling.md",
      "label": "SA-2026-007 selengkapnya",
      "t": "Pemberitahuan, dengan kolom silang yang dihitung lengkap:"
    },
    {
      "k": "h",
      "t": "SA-2026-006: model bidang dihitung dalam 3D dengan momen nodal"
    },
    {
      "k": "p",
      "t": "Model bidang yang dihitung oleh solver 3D berdiri pada bidang X–Z, tempat rotasi bidang adalah rotasi terhadap −Y. Momen nodal dan rotasi paksa seharusnya berganti tanda tetapi tidak, sehingga bekerja sebagai bayangan cerminnya. Dikombinasikan dengan gaya, keduanya dapat saling menambah, bukan meniadakan."
    },
    {
      "k": "ul",
      "items": [
        "Cara mengetahui apakah Anda terdampak: model datar (semua titik simpul pada satu bidang), dihitung pada mode 3D dan memiliki momen nodal atau rotasi tumpuan paksa. Pegas rotasi tidak terpengaruh.",
        "Yang harus dilakukan: hitung ulang model yang terdampak di stabileo.com dan bandingkan dengan hasil yang sudah Anda gunakan. Solusi sementara yang diberikan pemberitahuan ini sebelum perbaikan tidak lagi berlaku.",
        "Status: diperbaiki di stabileo.com pada 21 Oktober 2026."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-006-mirrored-moments-2d-in-3d.md",
      "label": "SA-2026-006 selengkapnya",
      "t": "Pemberitahuan, dengan ketiga kasus ujinya:"
    },
    {
      "k": "h",
      "t": "SA-2026-005: gaya aksial pada batang miring 2D"
    },
    {
      "k": "p",
      "t": "Pembangun beban 2D memindahkan komponen beban searah batang pada batang miring ke titik simpul ujungnya. Reaksi tumpuan dan perpindahan benar, tetapi batang tidak melihat beban itu pada bentangnya, sehingga gaya aksialnya tetap konstan pada rata-rata nilai ujungnya yang sebenarnya: 26 % terlalu rendah di pangkal balok atap. Diagram, inspektur, laporan, ekspor Excel, dan desain semuanya memakai nilai itu. Kopel yang bekerja pada batang juga dibuang ketika model bidang dihitung dalam 3D."
    },
    {
      "k": "ul",
      "items": [
        "Cara mengetahui apakah Anda terdampak: model 2D yang dihitung sejak 25/09/2026 dengan batang miring (balok atap, tangga, bresing, busur yang digambar sebagai segmen) yang memikul beban merata, terpusat, atau berat sendiri dengan komponen searah batang; atau model bidang dengan kopel pada batang yang dihitung dalam 3D. Batang yang didesain untuk tekan paling terpapar.",
        "Yang harus dilakukan: hitung ulang model yang terdampak di stabileo.com dan bandingkan dengan hasil yang sudah Anda gunakan. Solusi sementara yang diberikan pemberitahuan ini sebelum perbaikan tidak lagi berlaku.",
        "Status: diperbaiki di stabileo.com pada 21 Oktober 2026."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-005-inclined-member-loads.md",
      "label": "SA-2026-005 selengkapnya",
      "t": "Pemberitahuan, dengan balok atap dan batang 3-4-5:"
    },
    {
      "k": "h",
      "t": "Diperbaiki pada 19 Oktober 2026"
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-009: elemen cangkang solid SHB8 22 % terlalu kaku pada lentur pelat tipis (penguncian ketebalan Poisson), sehingga meremehkan lendutan sekitar 18 %. Periksa ulang kesimpulan lendutan dan getaran untuk model dengan pelat cangkang solid yang dihitung sebelum tanggal itu; MITC4, MITC9, DKT, dan cangkang melengkung tidak terpengaruh.",
        "SA-2026-010: sertifikat analisis spektral dapat meloloskan hasil yang tidak hingga (NaN). Angkanya jelas tidak valid; yang salah adalah klaim verifikasinya. Tidak ada yang perlu diperiksa ulang kecuali hasil yang sudah diserahkan menunjukkan nilai tak hingga."
      ]
    },
    {
      "k": "h",
      "t": "Diperbaiki di versi 0.2.0"
    },
    {
      "k": "p",
      "t": "Versi 0.2.0, tertanggal 18 Oktober 2026, memperbaiki empat pemberitahuan retroaktif. Semuanya memengaruhi proyek yang dihitung sebelum 17 Oktober 2026, dan sarannya sama untuk masing-masing: bangkitkan ulang beban dan kombinasi, hitung dan tinjau pemeriksaan desain, dan periksa ulang setiap hasil yang diserahkan dengan versi sebelumnya."
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-001: kombinasi dan beban CIRSOC 101, 102, dan 103 yang dibangkitkan berada di sisi tidak aman (pada satu contoh gaya aksial kolom 29 % terlalu rendah).",
        "SA-2026-002: pemeriksaan beton CIRSOC 201 dan ACI 318 melebihkan kapasitas (φMn hingga 18 % terlalu tinggi).",
        "SA-2026-003: pemeriksaan baja, baja canai dingin, dan sambungan melebihkan kapasitas (geser badan hingga 60 % terlalu tinggi).",
        "SA-2026-004: analisis yang mengabaikan sebagian model (riwayat waktu gerakan tanah kehilangan hingga setengah beban gempa; keruntuhan plastis 3D hingga 2,3 kali tidak aman)."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Semua pemberitahuan",
      "t": "Daftar lengkap, dengan setiap pemberitahuan, perbaikannya, dan tingkat keparahannya:"
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Bagaimana kami menemukan cacat ini, dan apa yang tidak dapat dijamin oleh verifikasi apa pun:"
    }
  ]
};

export default body;
