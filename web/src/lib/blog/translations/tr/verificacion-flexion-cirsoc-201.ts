import type { PostBody } from '../../types';
import { minimumSteelExampleRows, flexureExampleRows, flexureExampleSteps } from '../../flexure-example';

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
      "rows": minimumSteelExampleRows("minimum", "dayanım", ",")
    },
    {
      "k": "p",
      "t": "Kesişim noktası Mu = 31,1 kN·m'dedir. Bu örnekte §9.6.1.2 uygulanır ve bu momentin altında minimum donatı 2,38 cm² olur. §9.6.1.3 istisnası geçerliyse her kesitte analizle gereken donatının en az 4/3’ü sağlanabilir. Bir kirişin donatısını tartışmadan önce kesişim noktasının hangi tarafında olduğunu bilmek gerekir."
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
      "t": "Aşağıda model yer alıyor: 5 m açıklıklı, basit mesnetli, 20×40, H-25 bir kiriş; 12 kN/m ölü yük ve 8 kN/m hareketli yükün yanında kendi öz ağırlığı da var. PRO'nun tasarım akışında, geçerli tasarım yönetmeliği CIRSOC 201 olarak açılır."
    },
    {
      "k": "img",
      "base": "blog/cirsoc-201-beam",
      "w": 1600,
      "h": 1000,
      "alt": "20×40 kiriş seçiliyken Stabileo PRO tasarım kontrolleri.",
      "caption": "Bu ekran görüntüsü mesnetler düzeltilmeden önce alınmıştır. Aşağıdaki etkileşimli örnek güncel sonucu gösterir."
    },
    {
      "k": "embed",
      "mode": "pro",
      "query": "example=rc-beam-flexure&proTab=design",
      "label": "Stabileo'daki kiriş, PRO'nun tasarım akışında. Tasarım kapalıysa bildirimdeki “Bu ziyaret için tasarımı aç” düğmesine basın. Bu sırayla üç düğme: “İstemleri hesapla”, “Gerekli donatıyı hesapla” ve “Boyutlandır…”. Çubukları yalnızca üçüncüsü seçer ve çubuk olmadan kontrol edilecek bir şey yoktur: tablo “donatısız” yazar. 5 m'lik açıklık iki eleman olarak modellenmiştir; ikisi de D/C = 0,91 ile doğrulanır. Açıklıkta pozitif eğilme (My+) belirleyicidir. Yükü değiştirip yeniden çalıştırın. PRO'daki yönetmeliğe göre tasarım hâlâ geliştirme aşamasındadır; betonarme modülü, uygulanmış ve test edilmiş olan kısımdır."
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
      "t": "Her seçilen çubuk çapı için faydalı yüksekliği yeniden hesaplayın. Kapasite tablosu güncel hesap çekirdeğiyle kontrol edilir; kapasite tek başına tam bir doğrulama değildir."
    }
  ]
};

export default body;
