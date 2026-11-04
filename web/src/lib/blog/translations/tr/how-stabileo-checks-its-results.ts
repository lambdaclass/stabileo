import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo'nun sonuçlarını nasıl kontrol ediyoruz ve kontroller nerede bitiyor",
  "excerpt": "Çözücü, biçimsel doğrulama ve YZ: Stabileo'nun verdiği sayılardaki hataları nasıl aradığımızı, sertifikaların neyi kanıtladığını ve hiçbir doğrulamanın neyi garanti edemeyeceğini anlatıyoruz.",
  "blocks": [
    {
      "k": "p",
      "t": "Bir yapı analizi programı, görünür hiçbir belirti olmadan yanlış bir sayı verebilir. Son haftalarda Stabileo'nun her parçasını birbirinden bağımsız birkaç yolla test ettik, çoğu güvensiz tarafta kalan onlarca gerçek kusur bulduk ve büyük kısmını düzelttik. Her biri sınıflandırılıyor ve hâlihazırda kullanılan sonuçları etkilemiş olabilecekse, bu arada ne yapılması gerektiğiyle birlikte bir bildirim olarak yayımlanıyor; bazılarının sınıflandırılması sürüyor. Bu yazı bu kusurları nasıl aradığımızı, sonuçlarla birlikte gelen sertifikaların neyi kanıtladığını ve aynı açıklıkla, hangi konuların her türlü doğrulamanın dışında kaldığını anlatıyor."
    },
    {
      "k": "h",
      "t": "Tek bir hesap motoru"
    },
    {
      "k": "p",
      "t": "Çözücü Rust ile yazılmış ve WebAssembly'ye derlenmiştir: kurulum gerektirmeden ve modeli hiçbir sunucuya göndermeden kullanıcının kendi bilgisayarında çalışır. Sürekli entegrasyonda çalışan kodla aynıdır. Ekim 2026'da, hesap motoru kullanılamadığında onun yerine sessizce devreye giren paralel TypeScript hesaplarını kaldırdık: uygulama artık doğrulanmamış bir kopyayla hesap yapmak yerine bunu açıkça söylüyor."
    },
    {
      "k": "h",
      "t": "Hata aramanın beş yolu"
    },
    {
      "k": "p",
      "t": "Hiçbir test tek başına her hatayı bulamaz; bu yüzden farklı biçimlerde başarısız olan birkaç test kullanıyoruz:"
    },
    {
      "k": "ul",
      "items": [
        "Diğer programlarla karşılaştırma. Sabit modeller ve her gece üretilen rastgele modeller OpenSees, Code_Aster, Frame3DD, PyNite, MYSTRAN, Kratos ve CalculiX ile çözülür. Her fark, hatanın bizde mi olduğu yoksa iki programın durumu farklı mı modellediği anlaşılana kadar incelenir.",
        "Yayımlanmış referanslar. Sonuçları başka bir ticari program tarafından değil, yazarları tarafından yayımlanmış durumlardan oluşan bir kabul test takımı; toleranslar kaynakta basılı hassasiyete göre belirlenir. Tasarım kontrolleri yayımlanmış çözümlü örneklerle (INTI-CIRSOC, AISC ve diğerleri) karşılaştırılır.",
        "Fiziksel değişmezler. Bir modeli döndürmek, aynalamak, yeniden numaralandırmak veya birimlerini değiştirmek, cevabı tam olarak fiziğin öngördüğü gibi değiştirmelidir; süperpozisyon, karşıtlık ve enerji dengesi sağlanmalıdır. Bu testler hiçbir referans değere ihtiyaç duymaz.",
        "Türetmeler. Çerçeve elemanı matrisleri temel ilkelerden sembolik olarak türetilir ve koddakilerle terim terim karşılaştırılır; diğer elemanlar için başka bir mühendisin inceleyebileceği yazılı türetmeler vardır.",
        "Fuzzing ve mutasyon testi. Milyonlarca üretilmiş girdi, çökmeleri ve sonlu olmayan sonuçları arar; testlerin yakalayıp yakalamadığını kontrol etmek için koda bilerek hatalar yerleştirilir."
      ]
    },
    {
      "k": "table",
      "caption": "Depodaki belgelerden alınan, doğrulama çalışmasına ait bazı sayılar.",
      "head": [
        "Ne",
        "Sayı"
      ],
      "rows": [
        [
          "Karşılaştırmadaki bağımsız sonlu eleman programları",
          "7"
        ],
        [
          "Sonuçları yayımlanmış kabul durumları",
          "12"
        ],
        [
          "Bu durumlardaki yayımlanmış referans değerler",
          "105"
        ],
        [
          "Aksiyomları sürekli entegrasyonda kontrol edilen Lean teoremleri",
          "37"
        ]
      ]
    },
    {
      "k": "note",
      "t": "105 referans değerin çoğu bina çerçevelerinin frekanslarıdır (SAC, IASC-ASCE, Bathe ve Wilson). Çerçevelerin modal ve doğrusal analizini iyi kapsarlar; diğer analiz türleri için kanıt oluşturmazlar."
    },
    {
      "k": "h",
      "t": "Sertifikalar: hata sınırı olan bir sonuç"
    },
    {
      "k": "p",
      "t": "Buna uygun sonuçlar için Stabileo arka planda bir sertifika da dener: aralık aritmetiğiyle hesaplanan ve çözdüğü sistemin tam çözümünü içeren bir sınır. Bunu yapamadığında sonuç, gerekçesiyle birlikte sertifikasız olarak işaretlenir. Sınır sayısal hata içindir; ağın ya da zaman adımının ayrıklaştırma hatasını kapsamaz. Doğrusal analiz, kombinasyonlar, modal analiz ve plastik göçme için bu sınırın temel matematiği, bilgisayarın her adımı kontrol ettiği bir ispat asistanı olan Lean'de kanıtlanmıştır; bazı adımlar (bağlar, modal kontrolün bir koşulu) henüz biçimselleştirilmemiştir. P-Delta, spektral, harmonik ve zaman tanım alanında analizlerin de sertifikaları vardır, ancak matematikleri henüz Lean'de biçimselleştirilmemiştir. Sürekli entegrasyon her eksik ispatı veya eklenmiş aksiyomu reddeder ve bazı sertifika türlerinde çalışan denetleyici, ispatların konu aldığı Lean kodunun ta kendisidir."
    },
    {
      "k": "h",
      "t": "Sertifikaların söylemedikleri"
    },
    {
      "k": "ul",
      "items": [
        "Bir sertifika, sistemi kurulduğu haliyle çözmenin hatasını sınırlar. Sistemin modeli temsil ettiğini kanıtlamaz: rijitlik matrisinin ve yüklerin kurulumu yukarıdaki yollarla test edilir, ancak sertifikalandırılmaz. Burulmalı burkulma eksikken (SA-2026-007) sertifika yanlış problemi sertifikalandırdı. 0.3.0'dan bu yana uçtan uca sertifikalar, çerçeveler ve kafes kirişler için sistemi bağımsız olarak yeniden kurar ve sonucu doğrudan modele karşı kontrol eder; kabuklar, katı elemanlar ve bağlayıcılar henüz kapsanmıyor.",
        "Lean matematiği kanıtlar; Rust kodunun tam olarak bu algoritmayı uyguladığı ise, Lean kodu olan denetleyiciler dışında, kanıtlanmış değildir.",
        "Sertifikalı tasarım kontrolleri formüllerini aralık aritmetiğiyle değerlendirir, ancak formüllerin kendisi biçimselleştirilmemiştir: varsa yayımlanmış çözümlü örneklerle karşılaştırılırlar ve her yönetmeliğin kapsamı (hangi maddeler, hangi örnekler) olgunluk matrisinde yer alır. Yığma yapılar, birleşimler, temeller ve kullanılabilirlik sertifikalı değildir.",
        "Programın hiçbir doğrulaması modeli doğrulamaz. Yükler, mesnetler ve idealleştirme mühendisin kararlarıdır; model incelemesi yaygın hatalar konusunda uyarır, ancak mühendislik muhakemesinin yerini tutmaz.",
        "Henüz yetkili bir yapı mühendisi tarafından bağımsız bir inceleme yapılmadı. CIRSOC 301 sonuçları hâlâ deneysel olarak etiketleniyor."
      ]
    },
    {
      "k": "h",
      "t": "YZ taslak hazırlar ve inceler; hesap yapmaz"
    },
    {
      "k": "p",
      "t": "YZ asistanı bir tariften model taslakları hazırlar ve mevcut modelleri inceler, ancak sonuç hesaplamaz: sayılar çözücüden ve uygulamanın tasarım kontrolü modüllerinden gelir. Açıklamaları dil modeli metnidir ve yanlış olabilir; geçerli olan değerler sonuçlardaki değerlerdir. Bir değişiklik uygulanmadan önce neyi değiştireceğini gösterir ve değişiklik tek adımda geri alınabilir. YZ özellikleri tarifi ve modeli bir dil modeline sorgu gönderen bir sunucuya iletir; çözücü, sonuçlar ve kontroller buna ihtiyaç duymaz ve çevrimdışı çalışır."
    },
    {
      "k": "link",
      "slug": "the-determinism-boundary",
      "t": "Bir YZ ajanının neden hesap yapmaması gerektiği, çözümlü bir örnekle:"
    },
    {
      "k": "h",
      "t": "Bir şey ters gittiğinde"
    },
    {
      "k": "p",
      "t": "Hâlihazırda kullanılan sonuçları etkilemiş olabilecek kusurlar, etkilenen bir modelin nasıl tanınacağı ve bu arada ne yapılması gerektiğiyle birlikte güvenlik bildirimleri olarak yayımlanır; diğer güvenlik kusurlarının sınıflandırılması sürüyor ve gerektirdiklerinde bildirim olarak eklenirler. Açık bildirimler, düzeltme stabileo.com'da yayına girdiğinde kapatılır."
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Yayımlanan bildirimler ve durumları:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/TRUSTED_BASE.md",
      "label": "Sertifikaların güvenilen tabanı",
      "t": "Bileşen bileşen neyin kanıtlandığı, neyin test edildiği ve neye güvenildiği:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/MATURITY.md",
      "label": "Doğrulama olgunluk matrisi",
      "t": "Her analiz, eleman ve tasarım yönetmeliği için ulaşılan doğrulama düzeyi ve kanıtları:"
    }
  ]
};

export default body;
