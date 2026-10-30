import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Uçtan uca sertifikalar: sonucu modele karşı kontrol etmek",
  "excerpt": "Yanlış kurulmuş bir sistemin doğru çözüldüğünü kanıtlayan bir sertifikanın pek değeri yoktur. Stabileo'nun her çerçeve modelini kendi başına nasıl yeniden kurduğunu ve sonucu modele karşı nasıl sertifikalandırdığını, bunun neler bulduğunu ve neleri dışarıda bıraktığını anlatıyoruz.",
  "blocks": [
    {
      "k": "p",
      "t": "Haftalardır Stabileo'daki her doğrusal statik analiz bir sertifikadan geçiyor; bu sertifika elde edildiğinde, K·u = f denklem sisteminin hangi hatayla çözüldüğüne dair makine tarafından kontrol edilmiş bir sınır verir. Ancak bu sistemi hesap motorunun kendisi kurar. Kurulumda bir hata olsaydı, örneğin bir dönüşümde yanlış bir işaret, eksik bir Timoshenko terimi ya da yanlış bir ankastrelik uç kuvveti, sertifika yanlış sistemin doğru çözüldüğünü tam bir titizlikle kanıtlamış olurdu."
    },
    {
      "k": "p",
      "t": "Uçtan uca sertifikalar, 2B ve 3B çerçeveler ile kafes kirişler için bu boşluğu kapatır: sonuç, hesap motorunun kurduğu matrislere karşı değil, yazıldığı haliyle modele karşı kontrol edilir."
    },
    {
      "k": "h",
      "t": "İkinci, bağımsız bir kurulum"
    },
    {
      "k": "p",
      "t": "Ayrı olarak yazılmış bir denetleyici, hesap motorunun eleman veya kurulum fonksiyonlarından hiçbirini çağırmadan, rijitliği ve yükleri model verilerinden yeniden kurar. Kendi formüllerini ve serbestlik derecelerinin kendi numaralandırmasını kullanır:"
    },
    {
      "k": "ul",
      "items": [
        "her çubuğun eğilmesi, konsol esnekliğinin tersi alınarak, diğer ucu ise denge ile elde edilir; Timoshenko kayma şekil değiştirmesi dahildir;",
        "mafsallar statik yoğunlaştırma ile, her seferinde serbest bırakılmış bir dönme olmak üzere ele alınır;",
        "çubuk yükleri, yüksüz çubuğun tam sehim şekilleri üzerindeki iş olarak, integraller kapalı biçimde hesaplanarak bulunur;",
        "yerel eksenler, eğik mesnetler, yaylar, rijit bağlantılar, diyaframlar ve çok noktalı bağlar modelin kurallarından türetilir."
      ]
    },
    {
      "k": "p",
      "t": "Sinüsler ve kosinüsler dahil her şey, kesin sınırlarla aralık aritmetiğinde hesaplanır: modelin her girdisi, yazıldığı ondalık sayı olarak bir aralığın içine alınarak girer. Bir karar, aralığın çözemediği bir eşik değerine bağlı olduğunda denetleyici tahmin yürütmek yerine reddeder."
    },
    {
      "k": "h",
      "t": "Sertifikanın söylediği"
    },
    {
      "k": "p",
      "t": "Bu kesin rijitlikle denetleyici, modelin tek bir çözümü olduğunu kanıtlar ve hesap motorunun döndürdüğü yer değiştirmeler ile bu çözüm arasındaki uzaklığı, modelin belirlediği her serbestlik derecesi üzerinde sınırlar. Hesap motorunun matrislerinin bu ifadede hiçbir rolü yoktur. Onlar ayrıca karşılaştırılır: yeniden kurulan matrislerle 10¹⁰'da bir hassasiyetle uyuşmaları, yer değiştirmelerin de modelin mesnet ve bağlarını 10⁹'da bir hassasiyetle sağlaması gerekir. Sağlamıyorlarsa sonuç, gerekçesiyle birlikte uçtan uca kontrol edilmemiş olarak bildirilir."
    },
    {
      "k": "p",
      "t": "Sınırın dayandığı teorem Lean'de kanıtlanmıştır. Uygulamada sonuçlar paneli, yer değiştirme hatasının sınırıyla birlikte “Uçtan uca kontrol edildi” satırını ya da kontrol edilememe gerekçesini gösterir."
    },
    {
      "k": "h",
      "t": "Neler buldu"
    },
    {
      "k": "table",
      "caption": "Sürekli entegrasyonda uçtan uca kontrol edilen modeller: hepsinde hesap motorunun kurulumu yeniden kurulanla uyuşuyor.",
      "head": [
        "Küme",
        "Modeller",
        "Sertifikalı"
      ],
      "rows": [
        [
          "2B test modelleri",
          "82",
          "82"
        ],
        [
          "3B test modelleri",
          "32",
          "32"
        ],
        [
          "Rastgele 2B çerçeveler",
          "200",
          "200"
        ],
        [
          "Rastgele 3B çerçeveler",
          "150",
          "150"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Tüm test modelleri ve rastgele üretilmiş yüzlerce çerçeve uyuşuyor ve sertifikalanıyor; hesap motoruna bilerek yerleştirilen kurulum hataları ise kontrolün başarısız olmasına yol açıyor. Kontrol gerçek sorunlar da buldu:"
    },
    {
      "k": "ul",
      "items": [
        "XZ düzlemindeki bir 3B diyafram, düğümleri yanlış işaretli dönmeyle bağlıyordu;",
        "2B'de, birleşen tüm çubukların mafsallı olduğu bir düğüme etkiyen moment yapay bir yay tarafından yutuluyordu ve modelin çözümü olmamasına rağmen kurulan sistemin sertifikası bunu geçiriyordu;",
        "böyle bir düğümden çıkan rijit bir bağlantı gerçek bir mekanizmayı gizliyordu."
      ]
    },
    {
      "k": "p",
      "t": "İlk ikisi düzeltildi: diyafram rijit cisim dönmesini izliyor ve bu moment çözümden önce reddediliyor. Ayrıca hesap motoru bir diyaframın anlamını, tüm döşeme tek bir cisim gibi dönecek şekilde değiştirdiğinde denetleyici yanlış hiçbir şeyi geçirmedi: kuralları güncellenene kadar, işe yaramayan sınırlar vererek dürüst kaldı. Bağımsız bir kontrol tam olarak bunun içindir."
    },
    {
      "k": "h",
      "t": "Dışarıda bıraktıkları"
    },
    {
      "k": "ul",
      "items": [
        "Kabuklar, katı elemanlar, bağlayıcılar, eğrisel kirişler ve çarpılmalı burulma henüz yeniden kurulmuyor: bunlar hiçbir zaman kontrol edilmiş olarak değil, kapsam dışı olarak bildirilir.",
        "Denetleyicinin formülleri modelin mekaniğini kodlar. Hesap motorundan ayrı yazılmışlardır ve onunla karşılaştırılırlar, ancak kanıtlanmış değildirler.",
        "Her sertifikada olduğu gibi, Rust uygulamasının Lean algoritmasına denk olduğu kanıtlanmış değildir.",
        "Bir sertifika sonucun modele ait olduğunu söyler. Modelin yapıyı iyi temsil ettiğini söylemez: bu, mühendisin işi olmaya devam eder."
      ]
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Hataları aramanın diğer yolları ve sınırları:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/CERTIFY.md",
      "label": "CERTIFY.md, “Uçtan uca sertifikalar”",
      "t": "Formüller ve testlerle birlikte teknik açıklamanın tamamı:"
    }
  ]
};

export default body;
