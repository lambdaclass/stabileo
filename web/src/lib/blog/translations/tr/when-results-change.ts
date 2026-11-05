import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Bir sonuç değiştiğinde: sonuç sürümleri, yeniden kontroller ve güvenlik uyarıları",
  "excerpt": "Bir düzeltme, mühendislerin daha önce kullanmış olabileceği sayıları değiştirir. Stabileo’nun bir düzeltmenin projelerinizden hangilerini ilgilendirdiğini size nasıl söylediği, yanlış olabileceğini bildiği bir sonucu düzeltme ortaya çıkana kadar nasıl geri tuttuğu ve düzeltmenin nasıl yayımlandığı; 4 ve 5 Kasım’da birleştirilen on dört sonuç sürümüyle.",
  "blocks": [
    {
      "k": "p",
      "t": "Bir yapısal çözücüde yapılan her düzeltme, birinin daha önce kullanmış olabileceği bir sayıyı değiştirir. Çok yüksek çıkan bir burkulma katsayısı artık daha düşüktür; eskiden çözülen bir model artık reddedilir. Uygulamaya sessizce ulaşan bir düzeltme, eski sayıyı daha önce teslim edilmiş hesaplarda bırakır ve onları hazırlayan mühendisin yeniden bakması için hiçbir nedeni yoktur."
    },
    {
      "k": "p",
      "t": "Bu yazı, bir kusurun bulunduğu andan düzeltmesinin yayımlandığı ana kadar Stabileo’nun bu konuda ne yaptığını anlatıyor. Örnekler gerçektir: 4 ve 5 Kasım 2026’da, 16’dan 29’a kadar on dört sonuç sürümü stabileo.com’a ulaştı."
    },
    {
      "k": "h",
      "t": "Sonuç sürümü nedir"
    },
    {
      "k": "p",
      "t": "Sonuç sürümü, uygulama sürümünden ayrı bir tam sayıdır. Aynı kayıtlı modelin farklı sayılar vermesine yol açan ya da eskiden çözülen bir modeli reddeden bir değişiklik siteye her ulaştığında bir artar. Bu türden her değişiklik şunlarla kaydedilir:"
    },
    {
      "k": "ul",
      "items": [
        "girdiği sürüm, tarihi ve pull request’leri;",
        "hangi modelleri ilgilendirdiği, model özellikleri olarak yazılmış hâlde: kısıtları olan bir düzlem model, çubuklar boyunca yükler içeren bir 2B burkulma analizi, CIRSOC 201’e göre kontrol edilen bir beton çubuk;",
        "mühendis için uygulamanın altı dilinin her birinde bir başlık ve bir açıklama, neyin yeniden kontrol edileceğiyle birlikte;",
        "tam açıklamaya bir bağlantı: bir güvenlik uyarısı, bir sonuç değişikliği notu ya da değişiklik günlüğü."
      ]
    },
    {
      "k": "p",
      "t": "Her çözüm, projeye onu üreten sonuç sürümünü bir damga olarak işler; yanında uygulama sürümü, commit, motor sürümü, motor ikili dosyasının bir hash’i ve çalıştırılan analizler de bulunur. Damga projeyle birlikte taşınır: kayıtlı bir dosya, otomatik bir kayıt, açık bir sekme ya da paylaşılan bir bağlantı, hepsi onu taşır."
    },
    {
      "k": "note",
      "t": "Bir sonuç sürümü asla yeniden kullanılmaz. Ana dala yapılan her birleştirme yayına alınır ve çözdüğü şeyi güncel sürümle damgalar; bu yüzden sitede zaten bulunan bir sürüme eklenen bir kayıt, o sürümün damgaladığı projelere asla ulaşmaz. Böyle bir eklemede bir test başarısız olur."
    },
    {
      "k": "h",
      "t": "Bir sürüm neden değişir"
    },
    {
      "k": "p",
      "t": "Değişikliklerin çoğu düzeltmedir: bir sonuç yanlıştı ve şimdi doğru. Bazıları reddetmedir: eskiden bir sayı veren bir model artık onun yerine açık bir mesaj verir, çünkü o sayı hiçbir şey ifade etmiyordu. Bir sürüm geri alma da yapabilir: 15. sürüm, inceleme düzeltmeleri kendileriyle birlikte siteye ulaşmamış olan 14. sürümün üç değişikliğini geri çekti; 27 ile 29 arasındaki sürümler de bunları incelenmiş olarak geri getirdi. 14. sürümle çözülmüş bir projeye her ikisi de bildirilir."
    },
    {
      "k": "table",
      "caption": "4 ve 5 Kasım 2026’da birleştirilen 16 ile 29 arası sonuç sürümleri.",
      "head": [
        "Sürüm",
        "Değişiklik",
        "Tür"
      ],
      "rows": [
        [
          "16",
          "Alüminyum: zayıf eksen kesme kuvveti kontrol ediliyor",
          "Düzeltme"
        ],
        [
          "17",
          "Çelik birleşimler: zayıf eksen momentleri artık göz ardı edilmiyor",
          "Reddetme"
        ],
        [
          "18",
          "ACI 318 ve EN 1992: burulma etkisindeki beton çubuklar kontrol edilmedi olarak işaretleniyor",
          "Reddetme"
        ],
        [
          "19",
          "Betonarme kolonlar en küçük basınçları altında da kontrol ediliyor (SA-2026-041)",
          "Düzeltme"
        ],
        [
          "20",
          "Yük üreteci: kısmen alçak çatı taşıyıcı sisteminin altında kalan bir döşeme alan yüklerini koruyor (SA-2026-033)",
          "Düzeltme"
        ],
        [
          "21",
          "Dışa aktarılan kabuk şekilleri ekrandaki büyüklüğü ve ölçeği gösteriyor",
          "Düzeltme"
        ],
        [
          "22",
          "2B: rijit bir bağın ya da bir diyaframın arkasındaki mekanizma reddediliyor",
          "Reddetme"
        ],
        [
          "23",
          "Eksenel kuvveti boyunca değişen çubukların 2B burkulması (SA-2026-042)",
          "Düzeltme"
        ],
        [
          "24",
          "Birkaç eksen etrafında büyük dönmeli 3B eşdönel analiz (SA-2026-037)",
          "Düzeltme"
        ],
        [
          "25",
          "Y–Z veya X–Y düzleminden alınan bir 2B modelin kısıtları (SA-2026-036)",
          "Düzeltme"
        ],
        [
          "26",
          "Bir çubuğun belirleyici değeri ve 2B zarf gerçek tepe değerini okuyor",
          "Düzeltme"
        ],
        [
          "27–29",
          "15. sürümün geri çektiği üç Basic değişikliği incelenmiş olarak geri dönüyor: plastik göçme, P-Δ ve moment etki çizgilerinin işareti",
          "Düzeltme"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Yeniden kontrol bildirimi"
    },
    {
      "k": "p",
      "t": "Bir proje açıldığında uygulama, projenin damgasını kayıt defteriyle karşılaştırır ve o zamandan beri yapılmış, o modeli ilgilendiren değişiklikleri listeler. Burkulma analizi olan düzlem bir çerçeveye 2B burkulma düzeltmesi bildirilir; betonu olmayan bir çelik çerçeveye betonarme kolon kontrolü bildirilmez. Liste, kaybolup giden bir bildirim balonu değildir: bildirimin kapatma düğmesi yoktur, Escape tuşunu ve dışına yapılan tıklamaları yok sayar; yalnızca “Bu değişiklikleri okudum” işaretlenip devam etmek ya da yeniden çalıştırmak seçilerek kapatılır."
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic, örneklerden bir düzlem çerçeveyi açıyor; çerçeve 15. sonuç sürümüyle çözülmüş olarak kaydedilmiş. “Bu proje son çözüldüğünden beri sonuçlar değişti” başlıklı bir iletişim kutusu onu ilgilendiren değişiklikleri listeliyor; aralarında eksenel kuvveti değişen çubuklar için 2B burkulma düzeltmesi ve gerçek tepede okunan belirleyici değer var, her biri açıklamasıyla birlikte. Devam etmeden ya da analizi yeniden çalıştırmadan önce “Bu değişiklikleri okudum” kutusunun işaretlenmesini istiyor.",
      "caption": "15. sürümle çözülmüş, bugün açılan düzlem bir çerçeve: yalnızca bu modeli ilgilendiren değişiklikler, her biri neyin yeniden kontrol edileceğiyle birlikte listeleniyor."
    },
    {
      "k": "p",
      "t": "Model yeniden çözülene kadar sonuçları güncel değil olarak işaretlenir: bir şerit bunu belirtir ve bu arada dışa aktarılan her rapor, çalışma kitabı ve CSV, köken bilgisinde bir GÜNCEL DEĞİL uyarısı basar. “Analizi ve tasarımı yeniden çalıştır” yeniden çözer ve PRO’da beton çubukları zaten seçilmiş donatıyla yeniden kontrol eder; onları yeniden tasarlamaz, çünkü bu, mühendisin donatı çubuklarının üzerine yazar."
    },
    {
      "k": "p",
      "t": "4 Kasım’dan beri (#1406) bildirim, uygulamanın altı dilinin hepsinde her değişikliği okuyucunun dilinde açıklıyor. Bundan önce Almanca, Fransızca ve Türkçe okuyucular başlığı ve açıklamayı İngilizce alıyordu: kayıtlı 72 değişikliğin 66’sının bu dillerde metni yoktu. Her çeviri, orijinali görmeden İngilizceye geri çevrilerek ve anlam karşılaştırılarak kontrol edildi: sayılar, işaretler, hangi yük, hangi kontrol, güvenli ya da güvensiz taraf. Bu kontrol üç dilin hepsinde cümleleri düzeltti ve dört İngilizce açıklamanın kaynakta belirsiz olduğunu gösterdi; bunlar altı dilin hepsinde düzeltildi."
    },
    {
      "k": "h",
      "t": "Düzeltmeden önce: uyar ya da reddet"
    },
    {
      "k": "p",
      "t": "Bir kusur genellikle düzeltilmeden önce, bazen günler önce bulunur. Bu sürede etkilediği sonuç hâlâ ekrandadır. İzlediğimiz kural önce sınırlandırmak, sonra düzeltmektir (issue #447): yanlış sonuç verebilecek her açık kusur, etkilediği her giriş noktasında ya bir uyarı ya da bir reddetme alır."
    },
    {
      "k": "ul",
      "items": [
        "Uyarı sonucu korur ve yanında, onu hangi bilinen sorunun etkileyebileceğini ve elle neyin kontrol edileceğini gösterir.",
        "Reddetme, sayı büyük bir katsayıyla yanlış olabildiğinde ve bunu çıktıdan fark etmenin hiçbir yolu olmadığında sonucu vermez ve nedenini söyler; örneğin çubukların numaralandırılmasına göre birkaç kat büyüyen ya da küçülen bir katsayı."
      ]
    },
    {
      "k": "img",
      "base": "blog/results-refusal",
      "w": 1600,
      "h": 1000,
      "alt": "Gizli mekanizma örneğiyle Stabileo Basic: hepsi yatay olarak kayabilen üç mesnet üzerinde, 10 kN/m düzgün yayılı yük taşıyan iki açıklıklı bir kiriş. Çözdükten sonra hiçbir diyagram çizilmiyor; köşedeki kırmızı bir mesaj, hiçbir mesnet yatay hareketi tutmadığı için yapının kararsız, yani bir mekanizma olduğunu söylüyor ve kinematik analizi gösteren bir düğme sunuyor.",
      "caption": "Aynı kural defterin dışında da geçerli: mekanizma olan bir model, nedenini söyleyen bir mesaj alır ve hiçbir sayı almaz."
    },
    {
      "k": "p",
      "t": "Sınırlandırma bir defterde tutulur; defter her açık güvenlik sorununu, onun uyarısını ya da reddetmesini, onu tetikleyen koşulu ve tetiklendiğini gösteren testi ya da sınırlandırmaya gerek olmadığının kanıtını listeler. Bir test bu defterle motorun bilinen sorunlar listesini uyumlu tutar, zamanlanmış bir iş de defteri GitHub’da açık olan issue’larla karşılaştırır. Koşullar bilerek dar tutulmuştur: sonuç derlemindeki 39 modelde her uyarı en fazla ikisinde tetiklenir. Bu defteri her açık issue için tamamlayan pull request (#807) bu yazı yazılırken son incelemesindedir; 0.5.0 sürümünden önce birleştirilecek."
    },
    {
      "k": "p",
      "t": "Bir sınırlandırma, düzeltmesi birleştirildiğinde sona erer ve aynı pull request içinde sona erer. Bu hafta #1295, çubukları yanlış eksen etrafında eğen 3B’den 2B’ye geçişlerin reddedilmesini kaldırdı, çünkü geçiş artık doğru; #1301 ise her 3B eşdönel çözümdeki uyarıyı, yalnızca bir çubuk ucu çubuğun uçlarını birleştiren doğruya göre 0,02 rad’dan fazla döndüğünde tetiklenen bir uyarıyla değiştirdi; kalan yaklaşıklığın önemli olabileceği yer burasıdır."
    },
    {
      "k": "h",
      "t": "Bu haftanın düzeltmeleri"
    },
    {
      "k": "p",
      "t": "Çubuklar boyunca eksenel yüklerle 2B burkulma (#1324, 23. sürüm). Her çubuğun geometrik rijitliği ortalama eksenel kuvvetini kullanıyordu. Basıncın en çok dönen uca doğru arttığı yerlerde, örneğin bir mertekte yerçekimi altında ya da açıklık içinde eksenel bir tekil yük olduğunda, burkulma katsayısı çok yüksek çıkıyordu ve hiçbir şey bu konuda uyarmıyordu. Artık her çubuk değişken eksenel kuvvetini integre ediyor."
    },
    {
      "k": "table",
      "caption": "Tek çubuk, λP·L²/EI. Kaynak: SA-2026-042.",
      "head": [
        "Durum",
        "Kesin",
        "Önce",
        "Şimdi"
      ],
      "rows": [
        [
          "Konsol, basınç 0’dan uçta P’ye artıyor",
          "3,477",
          "4,972 (+%43)",
          "3,542 (+%1,9)"
        ],
        [
          "Konsol, açıklık ortasında eksenel tekil yük",
          "2,961",
          "4,972 (+%68)",
          "3,056 (+%3,2)"
        ],
        [
          "Euler’in ağır kolonu, basınç mesnette en büyük",
          "7,837",
          "4,972 (−%37)",
          "7,889 (+%0,7)"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Kalan birkaç yüzde, çubuk başına bir elemanın olağan ayrıklaştırma hatasıdır ve çubuk bölündükçe azalır. P-Delta hâlâ ortalama eksenel kuvveti kullanıyor ve çubuklar boyunca yükler içeren 3B burkulma, kendi düzeltmesi gelene kadar uyarısını koruyor."
    },
    {
      "k": "p",
      "t": "3B eşdönel analiz (#1301, 24. sürüm). Çubuk uç dönmeleri dönme vektörleri olarak çıkarılıyordu; bu yalnızca tüm dönmeler tek bir ekseni paylaştığında kesindir. Bathe–Bolourchi 45° eğrisi yayımlanmış çözümünden %1,3 sapıyordu ve ağı sıklaştırmak onu referanslara yaklaştırmak yerine onlardan uzaklaştırıyordu. Dönmeler artık dönme matrisleri olarak birleştiriliyor: aynı eğri iki bağımsız yayımlanmış çözüme %0,4’ten daha yakın kalıyor ve ikisinin arasında yakınsıyor. Uçları birbirine göre 0,9π’den fazla dönen bir çubuk reddediliyor, çünkü sonuç hangi tam turun kastedildiğini söyleyemez."
    },
    {
      "k": "p",
      "t": "2B’de gizli bir mekanizma (#1298, 22. sürüm). Tüm çubukları mafsallı bir düğümden bir kafes çubuğunun ucuna giden rijit bir bağ ya da diyafram bir mekanizmadır, ancak çözücü onu çok küçük yapay bir yayla tutuyor ve yüzlerce kilometrelik yer değiştirmeler döndürüyordu; sertifika da bunları sertifikalıyordu. Böyle bir model artık reddediliyor. Bunun için bir güvenlik uyarısı yok: kimse bu sayıları fark etmeden kullanamazdı ve uygulama zaten olası bir mekanizma konusunda uyarıyordu. Yanlış olan sertifikanın iddiasıydı ve sürüm kaydı bunu ilgilendirdiği projelere bildiriyor. Rijit bağ yerine bir bağlayıcı üzerinden oluşan benzer bir durum daha sonra bulundu (#1414); düzeltmesi (#1415) incelemede ve 0.5.0 ile birleştirilecek."
    },
    {
      "k": "p",
      "t": "Bir 3B modelden 2B’ye geçiş (#1295). Geçiş her çubuk için kesitinin güçlü eksen ataletini kullanıyordu; bu yüzden Y–Z geçişindeki kolonlar, X–Y geçişindeki kirişler ve 90° döndürülmüş çubuklar yanlış eksen etrafında eğiliyordu: Y–Z’de duran IPN 300’lük bir portal çerçeve 3B’deki 13,0 mm’ye karşı 2B’de 0,96 mm yanal ötelendi. Artık her çubuk 2B’de, 3B’de eğildiği eksen etrafında eğiliyor ve düzlem bir modelin temsil edemediği geçişler reddediliyor. Bu düzeltmenin sonuç sürümü yok ve bu bilinçli: kayıtlı bir 2B model tam olarak eskisi gibi çözülür, çünkü yanlış olan geçişin ürettiği modeldi. Yeniden kontrol bildirimi bu dosyalara ulaşamaz, bu yüzden kanal güvenlik uyarısıdır (SA-2026-035): modeli 3B’den yeniden 2B’ye geçirin ya da 3B’de çözün."
    },
    {
      "k": "h",
      "t": "Düzeltmeden sonra: güvenlik uyarıları"
    },
    {
      "k": "p",
      "t": "Yayımlanmış bir sürümde yanlış ya da güvensiz tarafta bir sonuç üretmiş olabilecek bir kusur bir güvenlik uyarısı alır: neyin yanlış olduğu, hangi modelleri etkilediği, bunların nasıl tanınacağı, daha önce teslim edilmiş sonuçlarda neyin yeniden kontrol edileceği ve kusuru yeniden üreten durum. Bu haftanın düzeltmeleri için güvenlik uyarıları şu anda depoda taslak olarak hazır ve SA-2026-001 ile 024’ün 0.3.0 ve 0.4.0 ile yayımlandığı gibi 0.5.0 sürümüyle yayımlanacak."
    },
    {
      "k": "table",
      "caption": "4 ve 5 Kasım 2026’da birleştirilen düzeltmeler için taslağı hazırlanan güvenlik uyarıları.",
      "head": [
        "Uyarı",
        "Neyin yanlış olduğu",
        "Önem derecesi"
      ],
      "rows": [
        [
          "SA-2026-033",
          "Yük üreteci, bir kısmının üstünde alçak bir çubuk bulunan bir döşemenin alan yüklerini dışarıda bırakıyordu",
          "Yüksek"
        ],
        [
          "SA-2026-034",
          "Denge kontrolü, kontrolünün yükleri dışarıda bıraktığı durumlarda uyuşma bildiriyordu",
          "Orta"
        ],
        [
          "SA-2026-035",
          "3B’den 2B’ye geçiş çubukları yanlış kesit ekseni etrafında eğiyordu",
          "Yüksek"
        ],
        [
          "SA-2026-036",
          "Y–Z veya X–Y üzerinde 3B’den 2B’ye geçiş, kısıtları çerçeve X–Z’de duruyormuş gibi okuyordu",
          "Yüksek"
        ],
        [
          "SA-2026-037",
          "3B eşdönel analiz dönme vektörlerini çıkarıyordu",
          "Orta"
        ],
        [
          "SA-2026-040",
          "ACI 318 ve EN 1992 kontrolleri beton çubukları burulmalarını kontrol etmeden geçiriyordu",
          "Yüksek"
        ],
        [
          "SA-2026-041",
          "Betonarme kolon kontrolü en büyük momenti yalnızca en büyük basınçla eşleştiriyordu",
          "Yüksek"
        ],
        [
          "SA-2026-042",
          "2B burkulma, basıncı boyunca artan çubukların katsayısını olduğundan büyük gösteriyordu",
          "Yüksek"
        ]
      ]
    },
    {
      "k": "img",
      "base": "blog/results-changelog",
      "w": 1600,
      "h": 1000,
      "alt": "Web sitesindeki Stabileo değişiklik günlüğü sayfası: en üstte 6 Kasım tarihli en yeni kayıt, tasarım kontrollerinde ve dinamikte düzeltilen yanlış sonuçlar hakkında, motor değişiklikleriyle başlıyor; solda alana göre filtreler.",
      "caption": "Değişiklik günlüğü sayfası, en yenisi önce; bu haftanın sonuçları değiştiren düzeltmeleriyle açılıyor."
    },
    {
      "k": "h",
      "t": "Bunun yapmadıkları"
    },
    {
      "k": "ul",
      "items": [
        "Bildirim yalnızca kayıtlı değişiklikleri bilir. Henüz bulunmamış bir kusur hiçbir kayıtta yoktur; bunun için çözücünün arkasındaki doğrulama vardır ve bir şey bulunduğunda sınırlandırmanın kapsadığı da budur.",
        "Modelin özelliklerini kayıtlı dosyadan okur ve belirleyemediğinde özelliği var sayar: fazladan bir bildirim, bir değişikliğin ilgilendirdiği modelden gizlenmesinden iyidir.",
        "Bir sayı uygulamadan çıktıktan sonra, bir çizimde, bir hesap tablosunda ya da daha önce teslim edilmiş bir raporda onu izleyemez. Güvenlik uyarısı bunun içindir.",
        "Sınırlandırılmış, reddedilmiş ya da düzeltilmiş olsun, sonucu imzalamadan önce kontrol etmek yine mühendisin işidir."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Yayımlanan her güvenlik uyarısı, her biri için neyin yeniden kontrol edileceğiyle:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/PROVENANCE.md",
      "label": "Yeniden kontrol bildirimi, köken bilgisi ve yeniden üretilebilirlik",
      "t": "Sonuç sürümlerinin, damgaların ve bildirimin ayrıntılı olarak nasıl çalıştığı:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Güvenlik uyarıları dizini",
      "t": "0.5.0 taslakları dahil güvenlik uyarıları:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/issues/447",
      "label": "Issue #447: önce sınırlandır, sonra düzelt",
      "t": "Sınırlandırma politikası ve ilerlemesi:"
    }
  ]
};

export default body;
