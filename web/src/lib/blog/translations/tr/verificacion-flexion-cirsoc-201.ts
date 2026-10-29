import type { PostBody } from '../../types';

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
      "items": [
        "d = 35,9 cm, d' = 4,1 cm",
        "Mu = 60,00 kN·m",
        "As,min = 2,39 cm²",
        "As,max (tek donatılı) = 11,58 cm²",
        "As,req (çekme) = 4,73 cm²",
        "Çekme donatısı: 2 Ø20 (6,28 cm²)",
        "a = 6,21 cm, c = 7,31 cm",
        "εt = 11,74‰",
        "εt ≥ 5‰ → çekme kontrollü → φ = 0,90",
        "φMn = 77,90 kN·m"
      ]
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
        "φMn [kN·m]"
      ],
      "rows": [
        [
          "30",
          "2 Ø16",
          "20,03",
          "0,90",
          "51,6"
        ],
        [
          "60",
          "2 Ø20",
          "11,74",
          "0,90",
          "77,9"
        ],
        [
          "90",
          "2 Ø25",
          "6,44",
          "0,90",
          "115,2"
        ],
        [
          "120",
          "2 Ø32",
          "2,76",
          "0,707",
          "133,5"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Son satırda kesit geçiş bölgesine girdi ve φ 0,707'ye düştü. Kapasite, çelikle aynı oranda artmadı: son iki satır arasında donatı alanı nominal olarak 9,82'den 16,08 cm²'ye çıkarken φMn yalnızca 115,2'den 133,5 kN·m'ye yükseliyor. Eklenenin önemli bir kısmı katsayıda kayboluyor."
    },
    {
      "k": "quote",
      "t": "Aşırı donatılı bir kesit kontrolden kalmaz. φ'de kaybeder ve sonuç yine de kontrolü sağladığını söyler."
    },
    {
      "k": "h",
      "t": "Basınç donatısı neden konur"
    },
    {
      "k": "p",
      "t": "Alışılmış cevap “çubuklar sığsın diye”dir. Bu nedeni değil, sonucudur. Aynı kirişte Mu = 200 kN·m için modül εt = 1,51‰ bulur, yani sınırın altında, ve basınç donatısı ekler. Bununla tarafsız eksen yukarı çıkar, εt 7,46‰'e döner ve φ yeniden 0,90 olur."
    },
    {
      "k": "p",
      "t": "Yani basınç donatısı, kesite sünekliğini geri kazandırmak ve katsayıyı geri almak için oradadır. Kapasite bunun bir sonucu olarak gelir."
    },
    {
      "k": "note",
      "t": "Modülün bu durum için ürettiği adımlar bunu tam bu sırayla söyler: önce “εt = 1,51‰ < 2,1‰ → A's gerekli”, sonra “ΔM = 144,50 kN·m, A's,req = 11,40 cm²” ve ancak en sonda “εt = 7,46‰ → çekme kontrollü → φ = 0,90”."
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
      "k": "embed",
      "mode": "pro",
      "query": "example=rc-beam-flexure&proTab=design",
      "label": "Stabileo'daki kiriş, PRO'nun tasarım akışında. Tasarım kapalıysa bildirimdeki “Bu ziyaret için tasarımı aç” düğmesine basın. Bu sırayla üç düğme: “İstemleri hesapla”, “Gerekli donatıyı hesapla” ve “Boyutlandır…”. Çubukları yalnızca üçüncüsü seçer ve çubuk olmadan kontrol edilecek bir şey yoktur: tablo “donatısız” yazar. 5 m'lik açıklık iki eleman olarak modellenmiştir; ikisi de açıklıktaki kesme kuvvetinin belirleyici olduğu D/C = 0,90 ile kapanır: eğilme ve donatı ankrajı bunun altında kalır. Yükü değiştirip yeniden çalıştırın. PRO geliştirme aşamasındadır; betonarme modülü, uygulanmış ve test edilmiş olan kısımdır."
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
      "t": "Buradaki her sayı bir tablodan değil, adı geçen kesitler üzerinde çalıştırılan Stabileo CIRSOC 201 modülünden gelir. Aktarmaya değer bir uyarı var, çünkü bu yazının ilk taslağı bunu yanlış yapmıştı: elle yapılan hesap D/C = 0,74, uygulama ise 0,81 verdi. Fark, uygulamanın ölü yük durumuna eklediği 2 kN/m'lik öz ağırlıktı. Uygulama haklıydı. Yukarıdaki düzenleyiciyle ilgili de bir not, iki sayı birbirine karışmasın diye: o 0,81, bu yazının üzerinde çalıştığı donatı olan 2 Ø25'i varsayar; düzenleyicinin gösterdiği 0,90 ise boyutlandırma yaparken kendi seçtiği çubuklarla elde edilir. Aynı kiriş, iki farklı donatı. Buradaki bir sayı bir gün düzenleyiciyle uyuşmazsa düzenleyiciye inanın."
    }
  ]
};

export default body;
