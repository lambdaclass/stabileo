import type { PostBody } from '../../types';
import { flexureExampleRows, flexureExampleSteps } from '../../flexure-example';

const body: PostBody = {
  "title": "CIRSOC 201'e göre eğilme kontrolü, adım adım",
  "excerpt": "Neredeyse herkes φMn ≥ Mu ifadesini hatırlar. Bu, kontrolün kendisi değil, son satırıdır. Sonuç daha önce belirlenir ve bu adımlardan biri φ'yi 0,9'un altına çekebilir.",
  "blocks": [
    {
      "k": "p",
      "t": "Çoğu kişi eğilme kontrolünü tek bir eşitsizlik olarak hatırlar: φMn ≥ Mu. Bu doğrudur ve son satırdır. Sonucu belirleyen şey ise daha önce, kırtasiyecilik gibi göründükleri için pek yakından incelenmeyen adımlarda olur."
    },
    {
      "k": "p",
      "t": "Stabileo'nun CIRSOC 201 modülü, H-25 betonlu, fy 420 çelikli, 25 mm pas paylı ve 8 mm etriyeli 20×40 cm bir kirişte 60 kN·m'lik bir moment altında şunu döndürür:"
    },
    {
      "k": "ol",
      "items": flexureExampleSteps("Çekme donatısı: 2 Ø20 (6,28 cm²)")
    },
    {
      "k": "p",
      "t": "On adım. Onuncusu herkesin hatırladığıdır. Sonucu belirleyenler ise üçüncü ve dokuzuncu adımlardır."
    },
    {
      "k": "h",
      "t": "3. adım: minimum, sanıldığından daha sık belirleyicidir"
    },
    {
      "k": "p",
      "t": "9.6.1.2 maddesi, 0.25·√f'c/fy·bw·d ve 1.4/fy·bw·d ifadelerinden büyük olanına eşit bir minimum eğilme donatısı ister. Bu genellikle neredeyse hiç ulaşılmayan bir alt sınır gibi görülür. Konut kirişlerinde ise sürekli ulaşılır."
    },
    {
      "k": "table",
      "caption": "Aynı 20×40 H-25 kiriş, artan momentler altında: donatıyı ne belirliyor.",
      "head": [
        "Mu [kN·m]",
        "Dayanım için As [cm²]",
        "As,min [cm²]",
        "Belirleyici"
      ],
      "rows": [
        [
          "15",
          "1,12",
          "2,39",
          "minimum"
        ],
        [
          "30",
          "2,28",
          "2,39",
          "minimum"
        ],
        [
          "60",
          "4,73",
          "2,39",
          "dayanım"
        ],
        [
          "90",
          "7,38",
          "2,39",
          "dayanım"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Kesişim noktası Mu = 31,5 kN·m'dedir. Bu momentin altında dayanıma göre boyutlandırma hiçbir şey kazandırmaz: kesit her durumda 2,39 cm² taşır. Bir kirişin donatısını tartışmadan önce kesişim noktasının hangi tarafında olduğunu bilmek gerekir."
    },
    {
      "k": "h",
      "t": "Üstelik minimum nadiren betona bağlıdır"
    },
    {
      "k": "p",
      "t": "Maddedeki iki ifadeden √f'c'li olanı, diğerini ancak oldukça yüksek dayanımlı betonlarda aşar."
    },
    {
      "k": "table",
      "caption": "fy 420 için minimuma ait iki ifade, binde olarak.",
      "head": [
        "Beton",
        "0.25·√f'c/fy",
        "1.4/fy",
        "Belirleyici"
      ],
      "rows": [
        [
          "H-20",
          "2,6620",
          "3,3333",
          "1.4/fy"
        ],
        [
          "H-25",
          "2,9762",
          "3,3333",
          "1.4/fy"
        ],
        [
          "H-30",
          "3,2603",
          "3,3333",
          "1.4/fy"
        ],
        [
          "H-35",
          "3,5215",
          "3,3333",
          "√f'c"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Kesişim noktası f'c = 31,36 MPa'dadır. Konut yapılarında kullanılan aralığın tamamında (H-20, H-25, H-30) minimum donatı betona bağlı değildir: yalnızca 1.4/fy'den gelir. H-20'den H-30'a geçmek minimumu tek bir santimetrekare bile düşürmez."
    },
    {
      "k": "h",
      "t": "9. adım: φ kendiliğinden 0,9 değildir"
    },
    {
      "k": "p",
      "t": "Dayanım azaltma katsayısı eğilme için 0,90 olarak öğretilir ve sonra sabit gibi ele alınır. Sabit değildir. Taşıma gücü durumunda çekme donatısındaki birim şekil değiştirmeden gelir ve modül bunu 9. adımda açıkça söyler: εt ≥ 5‰ → çekme kontrollü → φ = 0,90. Kesite daha fazla çelik koyarsanız εt düşer ve φ'yi de beraberinde düşürür."
    },
    {
      "k": "table",
      "caption": "Aynı kiriş, her seferinde daha fazla yüklenerek. εt ve φ, 8. ve 9. adımlardan gelir.",
      "head": [
        "Mu [kN·m]",
        "Donatı",
        "εt [‰]",
        "φ",
        "φMn [kN·m]",
        "Süneklik"
      ],
      "rows": flexureExampleRows("Uygun", "Uygun değil")
    },
    {
      "k": "p",
      "t": "2 Ø32 donatılı kesit uygun değildir: çekme birim şekil değiştirmesi gerekli alt sınırın altındadır. φ değerini azaltmak süneklik kontrolünü sağlamaz. Kesiti veya donatıyı yeniden boyutlandırın."
    },
    {
      "k": "quote",
      "t": "2 Ø32 donatılı kesit uygun değildir: çekme birim şekil değiştirmesi gerekli alt sınırın altındadır. φ değerini azaltmak süneklik kontrolünü sağlamaz. Kesiti veya donatıyı yeniden boyutlandırın."
    },
    {
      "k": "h",
      "t": "Basınç donatısı neden konur"
    },
    {
      "k": "p",
      "t": "Basınç donatısı süneklik sınırında gerekli olabilir. Çekme çeliğinin akmayı bırakmasını beklemeyin; yeniden boyutlandırılan kesiti gerçek çubuk derinlikleriyle kontrol edin."
    },
    {
      "k": "p",
      "t": "Yani basınç donatısı, kesite sünekliğini geri kazandırmak ve katsayıyı geri almak için oradadır. Kapasite bunun bir sonucu olarak gelir."
    },
    {
      "k": "note",
      "t": "Basınç donatısı süneklik sınırında gerekli olabilir. Çekme çeliğinin akmayı bırakmasını beklemeyin; yeniden boyutlandırılan kesiti gerçek çubuk derinlikleriyle kontrol edin."
    },
    {
      "k": "h",
      "t": "Gerçek bir kirişte deneyin"
    },
    {
      "k": "p",
      "t": "Aşağıda model yer alıyor: 5 m açıklıklı, basit mesnetli, 20×40, H-25 bir kiriş; 12 kN/m ölü yük ve 8 kN/m hareketli yükün yanında kendi öz ağırlığı da var. PRO'nun donatı tablolarında, yönetmelik olarak CIRSOC 201-2025 ile açılır."
    },
    {
      "k": "img",
      "base": "blog/cirsoc-201-sheets",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo PRO, CIRSOC 201-2025 ile donatı tabloları; çözüm ve boyutlandırmadan sonra V1 üzerinde açık kiriş tablosu. Satır altta boydan boya 2 Ø25, üstte boydan boya 2 Ø16 ve 18 cm aralıklı Ø8 etriye öneriyor; oran 0,80, durum Sağlıyor. Altında çubuk işaretleriyle görünüş ve kapasiteye karşı moment ve kesme zarfları.",
      "caption": "Aşağıdaki kiriş, “Donatıları boyutlandır” sonrasında kiriş tablosunda: Stabileo'nun önerdiği 2 Ø25 0,80 ile kapanıyor."
    },
    {
      "k": "embed",
      "mode": "pro",
      "query": "example=rc-beam-flexure&proTab=rcSheets",
      "label": "Stabileo'da kiriş, PRO'nun donatı tablolarında. Bu sırayla dört düğme: “Hesapla”, “Donatı tabloları” (Çıktı altında), “Donatıları boyutlandır” ve “Kirişler”. Birincisi modeli çözer ve sonuçları gösterir, ikincisi tablolara geri döner, üçüncüsü donatıyı boyutlandırır, dördüncüsü kiriş tablosunu açar: V1 satırı altta boydan boya 2 Ø25 ve üstte 2 Ø16 öneriyor, 0,80 oranıyla kapanıyor ve “Sağlıyor” yazıyor. Kapasiteye karşı moment zarfını ve her kontrolü görmek için satırı açın; bu oranı veren kontrol “Zarf tüm kiriş boyunca kenetlenmiş çubuklarla karşılanıyor”dur. Yükü değiştirip yeniden hesaplayın. Donatı tabloları hâlâ geliştirme aşamasında: sonuçları gözden geçirin."
    },
    {
      "k": "h",
      "t": "Özetle"
    },
    {
      "k": "ol",
      "items": [
        "Boyutlandırmadan önce momentin, minimumla kesişim noktasının üstünde mi altında mı olduğunu kontrol edin. Altındaysa donatı zaten belirlenmiştir.",
        "H-20'den H-30'a kadar minimum betona bağlı değildir. 1.4/fy'den gelir.",
        "φ, εt'ye bağlıdır: ikisini her zaman birlikte okuyun.",
        "Basınç donatısı ortaya çıkıyorsa bunun nedeni kesitin kapasitesinin yetmemesi değil, sünekliğini kaybetmesidir."
      ]
    },
    {
      "k": "note",
      "t": "Buradaki her sayı bir tablodan değil, adı geçen kesitler üzerinde çalıştırılan Stabileo CIRSOC 201 modülünden gelir. Aktarmaya değer bir uyarı var, çünkü bu yazının ilk taslağı bunu yanlış yapmıştı: elle yapılan hesap, uygulamanın ölü yük durumuna eklediği 2 kN/m'lik öz ağırlığı unuttuğu için D/C = 0,74 veriyordu. Öz ağırlıkla basit mesnetli kiriş 1,2·14 + 1,6·8 = 29,6 kN/m taşır, Mu = 29,6·5²/8 = 92,5 kN·m olur ve 2 Ø25 ile (φMn = 113,55 kN·m) D/C = 0,81 olur. Yukarıdaki tablo altta tam olarak 2 Ø25 öneriyor ve 0,80 ile kapanıyor. 0,81 yerine 0,80 çıkıyor, çünkü Tablo 20.5.1.3.1'deki beton örtüsünü (etriyeye kadar 30 mm, d = 34,95 cm) alıyor ve üstteki 2 Ø16'yı basınç donatısı olarak hesaba katıyor: φMn = 115,31 kN·m ve 92,5/115,31 = 0,80. Buradaki bir sayı bir gün düzenleyiciyle uyuşmazsa düzenleyiciye inanın."
    },
    {
      "k": "note",
      "t": "Her seçilen çubuk çapı için faydalı yüksekliği yeniden hesaplayın. Kapasite tablosu güncel hesap çekirdeğiyle kontrol edilir; kapasite tek başına tam bir doğrulama değildir."
    }
  ]
};

export default body;
