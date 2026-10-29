import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Ücretsiz yazılımın hesapladıkları ve açıklamadıkları",
  "excerpt": "Ücretsiz yapı yazılımları var ve iyiler: modelliyor, çözüyor, sonuçları gösteriyorlar. Bulamadığımız şey, ileri araçlara kavramsal taraftan yaklaşan bir yazılım.",
  "blocks": [
    {
      "k": "p",
      "t": "Var olanla başlamakta fayda var: çok sayıda ve iyi. Bugün yapı dersi veren herkesin elinde birinci sınıf ücretsiz araçlar var ve bunların birçoğu kendi işini bizim kendi işimizi yaptığımızdan daha iyi yapıyor."
    },
    {
      "k": "h",
      "t": "Ücretsiz araçların gerçekte kapsadığı"
    },
    {
      "k": "table",
      "caption": "Ücretsiz yapı analizi araçları ve sonucun ötesinde gösterdikleri.",
      "head": [
        "Araç",
        "Ücretsiz",
        "Çok iyi yaptığı",
        "Kavramsal taraf"
      ],
      "rows": [
        [
          "Ftool",
          "Evet",
          "Düzlem çerçeveleri modellemek ve diyagramları ve tesir çizgilerini okumak; az programın erişebildiği bir akıcılıkla",
          "Davranışı gösterir, arkasındaki akıl yürütmeyi değil"
        ],
        [
          "MASTAN2",
          "Evet (MATLAB veya çalışma zamanı ortamı üzerinde)",
          "McGuire, Gallagher ve Ziemian'ın kitabına bağlı doğrusal ve doğrusal olmayan matris analizi",
          "Teori kitapta; program analizi yapar"
        ],
        [
          "SkyCiv",
          "Ücretsiz sürüm",
          "Adım adım el hesapları: serbest cisimler, değerler yerine konmadan önce denge denklemleri, hiperstatik kirişler için moment dağıtma",
          "Temel statik için formüllere yerleştirilmiş sayılar"
        ],
        [
          "sectionproperties",
          "Evet, açık kaynak",
          "Sonlu elemanlarla çarpılma, kayma merkezi ve Saint-Venant sabiti",
          "Bir Python kütüphanesi: arayüz ve açıklama olmadan sayı döndürür"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Bu listede genellikle “işlemi göstermek” dediğimiz şeye en çok SkyCiv yaklaşıyor ve bunu açıkça söylemek gerekir: el hesapları iyidir. Serbest cismi çizer, herhangi bir sayı girmeden önce ΣM = 0 yazar ve kiriş hiperstatikse moment dağıtma yöntemiyle çözer. Hiçbir ücretsiz programın adımlarını göstermediğini iddia eden birinin yanıldığı, SkyCiv ile yaklaşık bir dakikada kanıtlanabilir."
    },
    {
      "k": "h",
      "t": "Program formülün ne zaman geçerliliğini yitirdiğini söylemiyorsa adımları göstermek yetmez"
    },
    {
      "k": "p",
      "t": "Doğru bir formüle sayıları yerleştirmek ile o formülün neden doğru formül olduğunu açıklamak farklı şeylerdir. Birincisi sizi aritmetikten kurtarır. İkincisi ise aritmetiğin yakalayamayacağı hatadan korur, çünkü o hata aritmetiğin bir katman üstündedir."
    },
    {
      "k": "p",
      "t": "İnternette bulunan burulma hesaplayıcıları bu noktayı tersinden gösteriyor: kesit tipini (dolu, kapalı tüp, dikdörtgen) seçersiniz ve program buna karşılık gelen formülü uygular. Gördüklerimizin hiçbiri yanlış seçtiğinizi, diğer teorinin ne vereceğini veya hatanın hangi tarafında olduğunuzu söylemiyor."
    },
    {
      "k": "quote",
      "t": "Yalnızca hesap yapan bir program, yanlış şeyi hesapladığınız konusunda sizi asla uyarmaz."
    },
    {
      "k": "h",
      "t": "Bir benzerini bulamadığımız üç özellik"
    },
    {
      "k": "ul",
      "items": [
        "Açıklamalı kinematik analiz. Aradık ve bunu yapan ücretsiz bir araç bulamadık: karşımıza çıkan PDF ders notları. Bulduğumuz “kinematik analiz için eğitim yazılımı” ise makine mekanizmaları (bağlantı çubukları ve krankları) içindir, yapıları sınıflandırmak için değil.",
        "Donatı detaylandırma. Bulduğumuz tek ücretsiz seçenek AutoRebar ve bu bir AutoCAD eklentisi; yani ücretsiz kısmını kullanmak pahalı bir lisans gerektiriyor. Ayrıca sizin çiziminizden çalışır: çubukları siz yerleştirirsiniz, o listeyi oluşturur. Geri kalan her şey yedi günlük deneme sürümü veya ticari yazılım. Açık kaynak bir seçenek bulamadık.",
        "Adım adım kesit analizi. Burada ciddi bir ücretsiz seçenek var: sectionproperties; sonlu elemanlarla çarpılma konusunda muhtemelen bizden iyi. Ancak arayüzü olmayan bir kütüphane: size kayma merkezini verir ama neden orada olduğunu açıklamaz."
      ]
    },
    {
      "k": "p",
      "t": "İncelediğimiz araçların hiçbiri bu üçünden ikisini kapsamıyor ve bunlardan birine bile kavramsal taraftan yaklaşan bir araç bulamadık. Gördüğümüz boşluk bu ve “öğreten tek biz varız” iddiasından daha dar ve daha kesin."
    },
    {
      "k": "h",
      "t": "Bütün farkın görüldüğü tek bir ekran"
    },
    {
      "k": "p",
      "t": "Aşağıda üç mesnet üzerinde iki açıklıklı bir kiriş var. Üç mesnet de yalnızca düşey hareketi tutuyor. Ders kitabı örneğidir ve aynı zamanda bir sınavda doğru kabul edildiğini en sık gördüğüm örnektir."
    },
    {
      "k": "p",
      "t": "Hiperstatiklik derecesi formülü g = 3·m + r − 3·n = 3×2 + 3 − 3×3 = 0 verir. Sıfır izostatik demektir ve formülde duran her program tam olarak bunu bildirir. Ancak kirişi yatay olarak tutan hiçbir şey yok: bir mekanizmadır ve çözülemez."
    },
    {
      "k": "table",
      "caption": "Kinematik analizin bu kiriş için adım adım verdiği sonuçlar.",
      "head": [
        "Adım",
        "Neye bakıyor",
        "Sonuç"
      ],
      "rows": [
        [
          "2 · Hiperstatiklik derecesi",
          "g = 3·m + r − 3·n",
          "0"
        ],
        [
          "3 · Rijitlik matrisi",
          "Tespit edilen mekanizma modları",
          "1"
        ],
        [
          "3 · Rijitlik matrisi",
          "Tutulmamış serbestlik dereceleri",
          "1"
        ],
        [
          "4 · Öneriler",
          "Ekrandaki sonuç",
          "Çözülemez"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Uygulama sıfırı bildirip işin içinden sıyrılmıyor. Sıfırı ürettiği aynı 2. adımda onunla çelişiyor: “Formül g = 0 veriyor (izostatik yapı için gerekli koşul), ancak bu koşul yeterli DEĞİLDİR”. 3. adım global rijitlik matrisini, burada 6×6, kurar ve “g = 0 ≥ 0 olmasına rağmen 1 mekanizma modu tespit edildi” uyarısını verir. 3 numaralı düğümü ve yatay yer değiştirmesini belirtir, 2. adımdaki denklemin bağları nerede olduklarını kontrol etmeden saydığına dikkat çeker ve “✗ Mekanizma — çözülemez” ile kapanır."
    },
    {
      "k": "embed",
      "query": "example=hidden-mechanism&kin=1",
      "label": "Üç düşey mesnet üzerindeki kiriş, kinematik analiz paneli açık. Dört adımı izleyin: ikincisi g = 0 verir, üçüncüsü bu sıfırın gizlediği mekanizmayı bulur. Mesnetlerden birini sabit mafsallı mesnetle değiştirip yeniden çalıştırmayı deneyin: derece 1 olur ve mekanizma ortadan kalkar."
    },
    {
      "k": "h",
      "t": "Bir bölüm bununla neden ilgilenebilir"
    },
    {
      "k": "p",
      "t": "Derece formülünü öğrenen ve yeterli koşulun sağlanmadığı bir durumu hiç görmeyen bir öğrenci, eksik bir kuralla ayrılır ve bunun farkında olmaz. Bunu tahtada göstermek zordur, çünkü kuralı bozan örnek bir yazım hatası gibi görünür. Burada sayı ve çelişki yan yana, tek bir ekranda."
    },
    {
      "k": "p",
      "t": "Hiçbir şeyin kurulması veya lisanslanması gerekmiyor ve bölümün bir şey satın alması gerekmiyor. Tarayıcıda açılır ve model bir bağlantı olarak paylaşılır."
    },
    {
      "k": "note",
      "t": "Açık olmak gerekirse: bunların hiçbiri bizim daha iyi olduğumuz anlamına gelmiyor. Ftool bizden daha hızlı ve daha az zahmetle modelliyor. MASTAN2'nin arkasında bizim yazmadığımız bir ders kitabı var. SkyCiv'in el hesapları, panellerimizin birçoğundan daha iyi sunuluyor. sectionproperties ise bizim yaklaşık hesapladığımız yerde çarpılmayı sonlu elemanlarla çözüyor. İddiamız daha dar ve oldukça belirli: incelediğimiz ücretsiz araçların hiçbiri ileri araçlara kavramsal taraftan yaklaşmıyor. Kinematik analizi açıklayan, donatı açılım listesi üreten veya kesit analizini adım adım yapan ücretsiz bir araç biliyorsanız bize yazın; bu yazıyı düzeltelim."
    }
  ]
};

export default body;
