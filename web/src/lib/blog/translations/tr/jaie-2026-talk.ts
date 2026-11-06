import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo’yu 29. Arjantin Yapı Mühendisliği Günleri’nde sunduk",
  "excerpt": "18 Eylül’de Córdoba’da 86N numaralı bildiriyi sunduk: değişiklik öneren ve bütün sayıları doğrulanmış bir çözücüye bırakan bir yapısal hesap ajanı. Ne gösterdiğimiz, ajanın hesaptan neden ayrı tutulması gerektiği ve Günler’den ne getirdiğimiz.",
  "blocks": [
    {
      "k": "p",
      "t": "29. Arjantin Yapı Mühendisliği Günleri (JAIE), Asociación de Ingenieros Estructurales’in düzenlemesiyle 16–18 Eylül tarihleri arasında Córdoba’da yapıldı. Son gün, Bautista Chesta, Raúl Bertero, Federico Carrone ve Diego Kingston’ın “Doğrulanmış bir çözücü üzerinde yapısal hesap ajanı geliştirilmesi” başlıklı 86N numaralı bildirisini, inşaat mühendisliğinde yapay zekâ oturumunda sunduk."
    },
    {
      "k": "photo",
      "src": "jaie-2026-talk",
      "w": 1600,
      "h": 1200,
      "alt": "Bautista Chesta dinleyicilere konuşuyor; perdede dört açıklıklı bir çerçeve, kırmızıyla işaretlenmiş bir kiriş ve “Yapı yeniden hesaplanıyor” başlığı.",
      "caption": "86N numaralı bildirinin sunumu. Perdede, bir kirişin kontrolü sağlamadığı ve bütün modelin yeniden çözüldüğü an."
    },
    {
      "k": "h",
      "t": "Ne gösterdik"
    },
    {
      "k": "p",
      "t": "Bildiri tek bir mimari kurala dayanıyor: yapay zekâ ajanı mühendisin istediğini yorumlar ve eylemler önerir, ama her sayı çözücüden ve ajanın değiştiremediği CIRSOC modüllerinden gelir. Buna determinizm sınırı diyoruz."
    },
    {
      "k": "p",
      "t": "Sunumda bunu kontrolü sağlamayan betonarme bir çerçeve üzerinde gösterdik. Ajan daha yüksek bir kiriş önerir, çözücü bütün modeli yeniden çözer ve CIRSOC 201 kontrolü yeni yapı üzerinde tekrarlanır: talep/kapasite oranı 1,10’dan 0,97’ye düşer. Bildiri bu kontrolü adım adım elle de yapar."
    },
    {
      "k": "p",
      "t": "İkinci örnek, dört açıklıklı ve üç katlı bir binadan bir kolonun kaldırılmasıydı. Bazı kirişler kontrolü sağlamaz hâle gelir, kesitleri yeniden boyutlandırılır ve bütün çubuklar yeniden kontrolü sağlar; çözücü her adımda modelin tamamını çözer."
    },
    {
      "k": "h",
      "t": "Sınır neden gerekli"
    },
    {
      "k": "p",
      "t": "Bunu göstermek için genel amaçlı yapay zekâ asistanlarına aynı ön boyutlandırma isteğini on beş kez verdik. Yedi farklı kesit döndürdüler. En çarpıcısı: on bir çalıştırma tasarım momentinde birleşti ama yine de altı farklı kesit önerdi."
    },
    {
      "k": "table",
      "caption": "Tekrarlanan aynı ön boyutlandırma isteği ve çözücüyle düzeltilen çerçeve.",
      "head": [
        "Ne",
        "Değer"
      ],
      "rows": [
        [
          "Aynı isteğin çalıştırma sayısı",
          "15"
        ],
        [
          "Döndürülen farklı kesit",
          "7"
        ],
        [
          "En büyük alanın en küçüğe oranı",
          "1,80"
        ],
        [
          "Mu = 207 kN·m’de birleşen çalıştırma",
          "11"
        ],
        [
          "Bu çalıştırmalar arasındaki farklı kesit",
          "6"
        ],
        [
          "Düzeltmeden önce çerçevenin talep/kapasite oranı",
          "1,10"
        ],
        [
          "Düzeltmeden sonra çerçevenin talep/kapasite oranı",
          "0,97"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Arkasında bir çözücü olduğunda aynı model her seferinde aynı sayıyı verir ve bu sayı kontrol edilebilir. Bir mühendisin gönül rahatlığıyla imzalayabilmesini istediğimiz şey bu."
    },
    {
      "k": "photo",
      "src": "jaie-2026-backdrop",
      "w": 1152,
      "h": 1320,
      "alt": "Yazar kartlarıyla Diego Kingston ve Bautista Chesta, Günler’in sponsor panosunun önünde.",
      "caption": "Bildirinin ortak yazarı Diego Kingston ile Günler’de."
    },
    {
      "k": "h",
      "t": "Ne getirdik"
    },
    {
      "k": "p",
      "t": "Ülkenin her yerinden yapı mühendisleriyle kurduğumuz bağlantılarla ve yapı mühendisleri ağına katılma davetiyle döndük. Ayrıca Córdoba’daki üniversitelerle Stabileo’yu derslerinde kullanmak üzerine konuştuk."
    },
    {
      "k": "p",
      "t": "Bildirinin tamamı stabileo.com/paper adresinde; Stabileo tarayıcıda çalışır, hiçbir şey kurmak gerekmez."
    },
    {
      "k": "link",
      "slug": "the-determinism-boundary",
      "t": "Bildirinin özeti, iki örnek ve sayılarıyla:"
    }
  ]
};

export default body;
