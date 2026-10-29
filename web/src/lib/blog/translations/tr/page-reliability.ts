import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Stabileo ne kadar güvenilir? Sonuçları nasıl kontrol ediliyor",
  "description": "Stabileo'nun sonuç kontrolleri: diğer yedi sonlu eleman programı, yayımlanmış örnekler, Lean'de kanıtlanmış hata sınırları, açık uyarılar ve bunların sınırları.",
  "eyebrow": "Güvenilirlik",
  "lead": "Stabileo'nun sonuçları, diğer yedi sonlu eleman programıyla karşılaştırma ve temel matematiği Lean'de kanıtlanmış hata sınırları dahil, birbirinden bağımsız beş yolla kontrol edilir. Hâlihazırda kullanılan sonuçları etkilemiş olabilecek kusurlar güvenlik uyarısı olarak yayımlanır (bazı bulguların sınıflandırılması herkesin gözü önünde sürüyor) ve yayımlanan yirmi dört uyarının tamamı düzeltildi (son dördü 0.4.0 sürümünde). Her analiz programı gibi modelinizi kontrol etmez: yükler, mesnetler ve idealleştirme mühendisin kararlarıdır.",
  "blocks": [
    {
      "k": "h",
      "t": "Hata aramanın beş yolu"
    },
    {
      "k": "ul",
      "items": [
        "Diğer programlarla karşılaştırma: aynı modeller, yani sabit modeller ve her gece üretilen rastgele modeller, OpenSees, Code_Aster, Frame3DD, PyNite, MYSTRAN, Kratos ve CalculiX ile çözülür ve her fark incelenir.",
        "Yayımlanmış referanslar: sonuçları yazarları tarafından yayımlanmış durumlar ve yayımlanmış çözümlü örneklerle (INTI-CIRSOC, AISC ve diğerleri) karşılaştırılan tasarım kontrolleri.",
        "Fiziksel değişmezler: bir modeli döndürmek, aynalamak, yeniden numaralandırmak ya da birimlerini değiştirmek, cevabı tam olarak fiziğin öngördüğü gibi değiştirmelidir.",
        "Türetmeler: çerçeve elemanı matrisleri sembolik olarak türetilir ve kodla terim terim karşılaştırılır.",
        "Fuzzing ve mutasyon testi: milyonlarca üretilmiş girdi hata arar; testlerin hataları yakalayıp yakalamadığını kontrol etmek için de koda bilerek hatalar yerleştirilir."
      ]
    },
    {
      "k": "h",
      "t": "Hata sınırı olan sonuçlar"
    },
    {
      "k": "p",
      "t": "Buna uygun sonuçlar için Stabileo, çözdüğü sistemin tam çözümünü içeren bir sınırı aralık aritmetiğiyle hesaplar; bunu yapamadığında sonuç, gerekçesiyle birlikte sertifikasız olarak işaretlenir. Temel matematik; doğrusal analiz, kombinasyonlar, modal analiz ve plastik göçme için Lean'de kanıtlanmıştır. 0.3.0'dan bu yana, çerçeve ve kafes kirişlerin doğrusal analizinde sınır, bağımsız bir kurulumla modelin kendisine karşı da kontrol edilir."
    },
    {
      "k": "link",
      "slug": "end-to-end-certificates",
      "t": "Modele karşı kontrolün nasıl çalıştığı:"
    },
    {
      "k": "h",
      "t": "Neden güvenlik uyarıları yayımlıyoruz"
    },
    {
      "k": "p",
      "t": "Bu doğrulama, çoğu güvensiz tarafta kalan gerçek kusurlar buldu. Hâlihazırda kullanılan sonuçları etkilemiş olabilecekleri, etkilenen bir modelin nasıl tanınacağı ve neyin yeniden kontrol edilmesi gerektiğiyle birlikte yayımlıyoruz; çünkü kimsenin bildirmediği bir kusur, daha önce teslim edilmiş hesaplarda kalır."
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-001 ile 004 arası 0.2.0 sürümünde düzeltildi.",
        "SA-2026-005 ile 020 arası 0.3.0 sürümünde düzeltildi.",
        "SA-2026-021 ile 024 arası 0.4.0 sürümünde düzeltildi.",
        "Sonuçlar değişmiş olabileceğinde uygulama bunu bir kez bildirir; kendilerini ilgilendiren bir değişiklikten önce kaydedilmiş projeler açıldığında yeniden kontrol ister."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Uyarıların tam listesi:"
    },
    {
      "k": "h",
      "t": "Hiçbir kontrolün garanti etmedikleri"
    },
    {
      "k": "ul",
      "items": [
        "Bir hata sınırı sayısal hatayı sınırlar; modelin doğru olduğunu kanıtlamaz ve ağın ayrıklaştırma hatasını sınırlamaz.",
        "Henüz yetkili bir yapı mühendisi tarafından bağımsız bir inceleme yapılmadı ve CIRSOC 301 çelik sonuçları hâlâ deneysel olarak işaretli.",
        "Malzeme bakımından doğrusal olmayan analiz, çubuğun tamamı için sekant bir modeldir.",
        "Yönetmeliğe göre tasarım dahil PRO modülü hâlâ geliştirme aşamasındadır.",
        "Açık güvenlik sorunları GitHub'da herkese açıktır; her analizin, elemanın ve yönetmeliğin doğrulama düzeyi olgunluk matrisinde yer alır."
      ]
    },
    {
      "k": "p",
      "t": "Kısacası: Stabileo, çapraz kontrol edebileceğiniz analizlere, öğretime ve her programda olduğu gibi belirleyici sonuçları bir mühendisin incelediği tasarım çalışmalarına uygundur. Süreciniz bağımsız olarak incelenmiş veya sertifikalı ticari bir yazılım gerektiriyorsa Stabileo henüz o noktada değil ve bunu açıkça söylüyoruz."
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Her kontrol ayrıntısıyla ve sınırlarıyla:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/MATURITY.md",
      "label": "Olgunluk matrisi",
      "t": "Her parçanın doğrulama düzeyi:"
    }
  ],
  "faqTitle": "Sıkça sorulan sorular",
  "faq": [
    {
      "q": "Stabileo gerçek yapı tasarımı çalışmaları için güvenilir mi?",
      "a": "Sonuçları, diğer yedi sonlu eleman programıyla karşılaştırma ve Lean'de kanıtlanmış hata sınırları dahil, birbirinden bağımsız beş yolla kontrol edilir; hâlihazırda kullanılan sonuçları etkilemiş olabilecek kusurlar yayımlanır, sınıflandırılması sürenler de GitHub'da herkese açıktır. Henüz yetkili bir mühendis tarafından bağımsız olarak incelenmedi ve PRO modülü geliştirme aşamasında; bu nedenle her programda olduğu gibi modeli ve belirleyici sonuçları mühendis inceler."
    },
    {
      "q": "Stabileo neden güvenlik uyarıları yayımlıyor?",
      "a": "Çünkü doğrulaması, çoğu güvensiz tarafta kalan gerçek kusurlar buldu ve kimsenin bildirmediği bir kusur, daha önce teslim edilmiş hesaplarda kalır. Her uyarı, etkilenen bir modelin nasıl tanınacağını ve neyin yeniden kontrol edilmesi gerektiğini söyler."
    },
    {
      "q": "Yayımlanan uyarılar düzeltildi mi?",
      "a": "Evet. SA-2026-001 ile 004 arası 0.2.0 sürümünde, SA-2026-005 ile 020 arası 0.3.0'da ve SA-2026-021 ile 024 arası 0.4.0'da düzeltildi."
    }
  ]
};

export default body;
