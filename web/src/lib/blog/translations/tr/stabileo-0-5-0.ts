import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.5.0: 23 güvenlik bildirimi daha; açık her yanlış sonuç hatası için uyarı veya ret",
  "excerpt": "0.4.0’dan bu yana neler değişti: yanlış ya da güvensiz tarafta kalan sonuçlar verebilen yirmi üç kusur güvenlik bildirimi olarak belgelendi ve biri dışında hepsi düzeltildi; açık kalan her kusur için uyarı veya ret eklendi; Basic’e adım adım eğitim kursu geldi.",
  "blocks": [
    {
      "k": "p",
      "t": "0.4.0’dan bu yana Stabileo’yu aynı anda birkaç yönden kontrol etmeyi sürdürdük: çözücüyü yayımlanmış çözümler ve diğer programlarla, tasarım kontrollerini çözümlü örneklerle, aynı yapıyı yeniden numaralandırarak, ölçekleyerek ve taşıyarak, ayrıca önceki sürümlerin kaydettiği dosyalarla sınadık. Bu çalışmalar, yanlış ya da güvensiz tarafta kalan sonuçlar verebilen yirmi üç kusur daha ortaya çıkardı. Her biri için neyin yanlış olduğunu, kimlerin etkilendiğini ve nelerin yeniden kontrol edilmesi gerektiğini açıklayan bir güvenlik bildirimi var. Yirmi ikisi düzeltildi; 2D plastik göçme hesabı (SA-2026-044), #758 düzeltilene kadar reddedilmeye devam ediyor."
    },
    {
      "k": "note",
      "t": "stabileo.com her değişikliği birleştirildiği anda yayımlar; bu düzeltmelerin çoğu da birleştirildikleri günden beri yayındadır. Kendilerini ilgilendiren bir değişiklikten önce kaydedilen projeler, açıldıklarında okuyucunun dilinde yeniden kontrol ister. İki düzeltme bunu yapamaz: #1295 öncesinde 3D modelden kesilerek oluşturulan bir 2D model, yanlış olan modelin kendisi olduğu için bildirim göstermeden açılır (SA-2026-035). Kesiti 3D modelden yeniden oluşturun veya modeli 3D olarak çözün. Aynısı #1310 öncesinde Excel ya da IFC’den içe aktarılan dikdörtgen veya boru kesitler için de geçerlidir (SA-2026-039): yeniden içe aktarın."
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic, örneklerdeki bir düzlem çerçeveyi açıyor; proje, sonuç sürümü 15 ile çözülmüş olarak kaydedilmiş. «Bu proje son çözüldüğünden bu yana sonuçlar değişti» başlıklı iletişim kutusu, normal kuvveti değişen çubuklar için 2D burkulma düzeltmesini ve gerçek tepe noktasından okunan belirleyici değeri de içeren ilgili değişiklikleri açıklamalarıyla birlikte listeliyor. Devam etmeden veya analizi yeniden çalıştırmadan önce «Bu değişiklikleri okudum» kutusunun işaretlenmesini istiyor.",
      "caption": "Kendisini ilgilendiren bir değişiklikten önce kaydedilmiş proje, açıldığında yeniden kontrol ister ve her değişikliği listeler."
    },
    {
      "k": "h",
      "t": "Projelerinizi yeniden çözün"
    },
    {
      "k": "p",
      "t": "Bir tasarım sonucunu en çok değiştiren durumlar bunlardır. Her güvenlik bildiriminde çözümlü örnek ve daha önce teslim ettiğiniz sonuçlar için ne yapmanız gerektiği yer alır."
    },
    {
      "k": "table",
      "caption": "İlgili güvenlik bildirimlerinde belgelendiği biçimiyle bazı 0.5.0 düzeltmeleri ve her birini getiren sonuç sürümü; SA-2026-035 için sonuç sürümü yoktur, dolayısıyla tek bildirim güvenlik bildiriminin kendisidir.",
      "head": [
        "Güvenlik bildirimi",
        "Sonuç sürümü",
        "Neyin yanlış olduğu",
        "Önem derecesi"
      ],
      "rows": [
        [
          "SA-2026-029",
          "7",
          "3D tasarım kontrolleri yanal momenti veya kesme kuvvetini okuyordu: Mz etrafında eğilen bir CIRSOC 201 kolonu kesit yüksekliği üzerinden kontrol ediliyor, bir örnekte gerekenden 36 % daha az donatı hesaplanıyordu",
          "Kritik"
        ],
        [
          "SA-2026-028",
          "8",
          "EN 1992-1-1 eğilme hesabı, çekme donatısının aktığını varsayıyordu: MRd, 22 %’ye kadar yüksek çıkıyordu",
          "Yüksek"
        ],
        [
          "SA-2026-030",
          "12",
          "CIRSOC 301 basınç hesabı: Qa ≤ 0 olan bir kesite ezilme yükünün üzerinde dayanım atanıyor ve kesit kontrolü sağlıyordu",
          "Yüksek"
        ],
        [
          "SA-2026-041",
          "19",
          "Betonarme kolon kontrolü, en büyük momenti yalnızca en büyük basınç kuvvetiyle eşleştiriyordu: bir örnekte 15 %’e kadar güvensiz tarafta kalan sonuç",
          "Yüksek"
        ],
        [
          "SA-2026-042",
          "23",
          "2D burkulma hesabı, basınç kuvveti çubuk boyunca artan çubukların katsayısını fazla hesaplıyordu: tek bir çubuk için +43 % ile +68 % arasında",
          "Yüksek"
        ],
        [
          "SA-2026-038",
          "35",
          "3D burkulma hesabı her çubuğun ortalama normal kuvvetini kullanıyordu: boyunca yük bulunan bir çubuğun katsayısında +43 %",
          "Yüksek"
        ],
        [
          "SA-2026-043",
          "32",
          "Harmonik analizde bir mod diğerlerinden çok daha esnek olduğunda hesaba katılmayan modların düzeltmesi kayboluyordu: bir örnekte 2.3 Hz’de 79 kat hatalı sonuç",
          "Yüksek"
        ],
        [
          "SA-2026-035",
          "—",
          "3D’den 2D’ye kesit alma işlemi çubukları yanlış kesit ekseni etrafında eğiyordu: bir Y–Z çerçevesi 13.5 kat fazla rijit çıkıyordu",
          "Yüksek"
        ],
        [
          "SA-2026-033",
          "20",
          "Yük üreteci, alçakta bulunan bir çubuk katın bir bölümünün üzerinde olduğunda o katın yüzey yükünün tamamını dışarıda bırakıyordu",
          "Yüksek"
        ],
        [
          "SA-2026-027",
          "11",
          "Kabuk zarfı, her bileşenin uç değeri yerine en büyük Von Mises değerini veren birleşimi tutuyordu: bir örnekte mx, 14 % düşük çıkıyordu",
          "Yüksek"
        ],
        [
          "SA-2026-047",
          "49",
          "Kabuk içeren bir modelde mesnet deplasmanı uygulayan bir yük durumu, tüm kabuk gerilmelerini kaybediyordu; bu nedenle birleşimler ve zarflar yalnızca diğer yük durumlarının kabuk gerilmelerini topluyordu: birleşik kabuk gerilmeleri uyarı verilmeden güvensiz tarafta kalabiliyordu. 0.2.0, 0.3.0 ve 0.4.0 sürümlerinde (#1676)",
          "Yüksek"
        ]
      ]
    },
    {
      "k": "p",
      "t": "#1676 öncesinde çözülmüş, kabuk içeren her proje açıldığında SA-2026-047’yi belirtir (#1691): modelde mesnet deplasmanı uygulayan bir yük durumu ve yük birleşimleri varsa etkilenmiş olarak, yoksa olası etkilenmiş olarak gösterilir; çünkü kaydedilmiş bir proje geçmişte hiç böyle bir yük durumu içermediğini kanıtlayamaz. Yeniden çözmek bildirimi kaldırır; ardından bu yük durumunu içeren birleşimlerin kabuk gerilmelerini karşılaştırın."
    },
    {
      "k": "p",
      "t": "Diğer güvenlik bildirimleri; ACI 318 ve EN 1992 kapsamında burulmaya maruz beton çubukları (SA-2026-040), Y–Z veya X–Y düzleminden 2D’ye kesilerek oluşturulan modelin kısıtlarını (SA-2026-036), büyük dönmeler içeren 3D eş dönel analizi (SA-2026-037), zaman tanım alanı analizinde kütlesiz bir düğüme t = 0 anında uygulanan yükü (SA-2026-031), modal analizde bir mekanizmanın sıfır modunu (SA-2026-032), analizden sonra raporun denge kontrolünü (SA-2026-034), #758 düzeltilene kadar reddedilmeye devam eden 2D plastik göçme hesabını (SA-2026-044), kullanılabilir plastik momenti olmayan bir çubuk içeren ve artık reddedilen 3D plastik göçme hesabını (SA-2026-045), her yük için modal süperpozisyon ile doğrudan çözüm arasında seçim yaparak süperpozisyonu bozan harmonik analizi (SA-2026-046), Excel veya IFC’den Iy ve Iz yer değiştirmiş olarak içe aktarılan dikdörtgen ve boru kesitleri (SA-2026-039) ve motoru doğrudan çağıranlar için AISC 360 ve EN 1993 kapsamında kesme alanı olmadan yapılan çelik kesme hesabını (SA-2026-025 ve 026) kapsar."
    },
    {
      "k": "h",
      "t": "Sonuçları değiştiren diğer değişiklikler"
    },
    {
      "k": "p",
      "t": "Diğer değişiklikler de sayısal değerleri değiştirir; bu yüzden her biri yeniden kontrol bildiriminde yer alır. Çoğunun kendine ait güvenlik bildirimi yoktur; modal sıfır modu ise yukarıdaki SA-2026-032’dir:"
    },
    {
      "k": "ul",
      "items": [
        "Bir çubuğun belirleyici değeri ve 2D zarf, 21 hesap noktasından en yakınını değil iç kuvvetler diyagramının gerçek tepe noktasını okur: belgelenmiş örneklerde üçgen yük altında 0.23 %, kısa bir kısmi yayılı yük altında 1.05 % artabilir ve hiçbir zaman azalmaz.",
        "Mekanizmalar çözülmek yerine reddedilir: 2D’de rijit bağlantı veya diyafram arkasında, 2D’de bağlayıcı arkasında (#1415) ve daha önce sıfır modu atıp diğer modları tam bir küme olarak döndüren modal analizde; buna eğik mesnetler boyunca kayan bir mekanizma da dahildir.",
        "3D malzeme bakımından doğrusal olmayan analiz, çarpılma sabiti olan ve olmayan çubukları birlikte içeren çerçeveleri ve yalnızca kafes çubuklarının bağlandığı düğümleri, çökmek veya reddetmek yerine çözer; daha önce çözülebilen modeller aynı sayısal değerleri verir.",
        "Tekrarlı özdeğerler katlılıklarını korur; statik ve modal sonuçlar gösterilmeden önce kendi dengelerini ve ortogonalliklerini kontrol eder.",
        "Basic’te P-Δ ve kritik yük hesabı her çubuğu elemanlara böler, plastik göçme hesabı boşalan mafsalları kapatır ve eğilme momenti tesir çizgisi, Basic’teki diğer tüm momentler gibi alt lifte çekme oluşturan momenti pozitif alır.",
        "Değerlendirilemeyen bir tasarım kontrolü sağlanmış sayılmak yerine reddedilir; modelde çok daha rijit bir bölüm olduğunda esnek ama gerçek bir düğüm dönmesi artık kilitlenmez.",
        "Doğrusal analiz, bir dönme 0.1 rad’ı aştığında uyarı verir; bu kontrol çubuk açıklığı içinde de yapılır (kayma deformasyonunun çubuk eksenine eklediği eğim ve serbest bırakılmış bir uçta sıcaklık gradyanının oluşturduğu eğrilik dahil, #1569) ve birleşimin kendi deplasmanlarına da uygulanır. Basınç kuvveti momentleri 10 %’dan fazla büyütebilecekse de uyarı verir; bu ikinci uyarı gösterilirken CIRSOC 301 kontrolleri bekletilir. Dönme uyarısında geometrik olarak doğrusal olmayan, büyük dönmeli bir analiz; büyütme uyarısında ise P-Δ veya başka bir ikinci mertebe analizi çalıştırın."
      ]
    },
    {
      "k": "h",
      "t": "Her düzeltme hazır olana kadar uyarı veya ret"
    },
    {
      "k": "p",
      "t": "Yanlış sonuç verebilen açık her hata için artık mühendise ulaşabileceği her noktada bir uyarı veya ret bulunuyor (#807). Uyarı sonucu korur ve yanına hatanın adını yazar; ret ise sonucu göstermez ve nedenini açıklar. Depodaki bir kayıt çizelgesi, açık her güvenlik hatasını uyarısı veya reddi, bunu tetikleyen koşul ve tetiklendiğini kanıtlayan testle birlikte listeler; bir test de bu çizelgeyi motorla uyumlu tutar."
    },
    {
      "k": "ul",
      "items": [
        "Reddedilenler: numaralandırmaya, çubuk yönlerine ve birimlere göre 4.6 kata kadar değişebilen 2D plastik göçme katsayısı (#758); kendi sertifikasının sınırları dışında kalan burkulma katsayısı (#741); düzlem içi eğilmenin önemli olduğu çarpık ağlardaki MITC4 kabuklar (#798); ve burulmuş geometri üzerindeki MITC4 ve MITC9 kabuklar (#1057).",
        "Uyarı verilenler: diğerlerinin yanı sıra zaman tanım alanı analizi, 3D modal süperpozisyon, tekilliğe yakın modeller, temas, malzeme bakımından doğrusal olmayan analiz ve rijitlikleri farklı bağlayıcılar.",
        "Reddedilen sonuçlar dışında, açık hataları sınırlayan bu önlemler yalnızca bir sayısal değeri değiştirir: oturma uygulanmış ve oturma doğrultusunda yayı da bulunan bir mesnedin 2D tepkisi artık bu yayın kuvvetini içerir. Sonuç derlemindeki 145.515 değerin diğerlerinin tamamı aynıdır."
      ]
    },
    {
      "k": "note",
      "t": "İki ret, bazı okuyucuların kullandığı sonuçları kaldırır. Düzlem çerçevelerin plastik göçme katsayıları #758 düzeltilene kadar gösterilmez. Sonuçları referans değerlerinin 2 % yakınında olan bazı çarpık kabuk ağlarının sonuçları da gösterilmez: uyarısız biçimde yanlış rijitlik göstermek yerine fazladan ret vermeyi seçtik; bu reddin kapsamını daraltmak yol haritasında yer alıyor."
    },
    {
      "k": "h",
      "t": "0.5.0’daki diğer yenilikler"
    },
    {
      "k": "ul",
      "items": [
        "Basic, yapı analizini adım adım öğretir: statik, kuvvet ve deplasman yöntemleri, tesir çizgileri, ikinci mertebe ve burkulma, plastik analiz ve dinamik; her biri uygulama içinde adım adım açıklanır. Plastik göçme eğitim birimi de diğer 2D plastik göçme hesaplarıyla birlikte #758 düzeltilene kadar gösterilmez.",
        "Almanca, Fransızca ve Türkçe 0.5.0’da sunulmuyor: bu dilleri ana dili olarak konuşan biri kontrol ettikten sonra geri gelecekler; o zamana kadar sayfaları İngilizce açılır.",
        "Yapay zekâ asistanı, yalnızca tarayıcınızda tutulan kendi Anthropic veya OpenAI anahtarınızla çalışır; /examples sayfasında ise bir kaydırıcı hareket ettiğinde motorun yeniden çözdüğü etkileşimli modeller bulunur.",
        "PRO: ana ve benzer katlar, asal momentler ve doğrultularla birim genişlik başına plak sonuçları, analiz sonrası rapor, «Çoğalt ve düzenle» seçeneği olan salt okunur görüntüleyici ve 3D referans olarak çizilen bağlantılı bir IFC.",
        "0.2.0, 0.3.0 ve 0.4.0 tarafından kaydedilen dosyalar her değişiklikte açılır, yeni biçime dönüştürülür ve kayıtlı bir sonuç değişikliği uygulanmadıkça aynı sonuçları verir; daha yeni bir sürümle kaydedilmiş dosya, bunu belirten bir mesajla reddedilir.",
        "Yeniden ölçeklenen, numaralandırılan, yönü ters çevrilen veya taşınan aynı yapı aynı cevabı vermelidir; bu, her değişiklikte 17 analiz türünde ve her gece üretilen 8.192 model üzerinde kontrol edilir.",
        "Diğer düzeltmeler: zemin-yapı etkileşimi artık önceden boş döndürdüğü mesnet tepkilerini raporlar (#1675); aynı numaralandırmaya sahip iki aileye ait kabuklar, biri diğerinin yerine birleştirilmek yerine birleşimlerde ve zarflarda reddedilir (#1669); kabuk von Mises ve asal gerilmeleri artık aşırı büyüklüklerde taşma veya alt taşma yapmaz, normal aralıktaki sonuçlar ise bit düzeyinde aynı kalır (#1688).",
        "Kullandığı bir özellikte bilinen yanlış sonuç hatası bulunan bir sürümle çözülmüş proje, yeniden çözülene kadar güvenlik bildirimini belirtir (#1657). Projeler çalıştırdıkları her analizi kaydeder; böylece bir analize ilişkin bildirim, o analiz yeniden çalıştırılana kadar kalır (#1663).",
        "Daha hızlı: 30 s aralıklı otomatik kayıt, değişmemiş projeyi atlar (#1664); büyük bir 3D çalışma alanı daha az çöp toplama ihtiyacıyla yeniden açılır (#1668); yayımlanan 3D sonuçlar da dondurulur, böylece bilinen hatalara ilişkin ret kontrolü her sonuç için bir kez çalışır (#1689).",
        "Daha fazla motor kontrolü: momentlerle karşılıklılık, katsayılı birleşimler ve her kabuk gerilme bileşeninin süperpozisyonu (#1665); her analiz için düğüm, mesnet, eleman ve kabuk başına bir sonuç kaydı (#1674). Bu kontroller yukarıdaki zemin-yapı etkileşimi ve kabuk birleşimi kusurlarını ortaya çıkardı.",
        "Stabileo Research ve Stabileo Tools: yayımlanmış makale ve karşılaştırma örneklerinin çalıştırılabilir yeniden üretimleri, üç incelemecinin gözden geçirmesinden sonra düzeltilmiş içerik ve aynı motor üzerinde çalışan ücretsiz hesaplayıcılar."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Güvenlik bildirimleri nasıl çalışır ve ilk yirmi dört bildirim:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Güvenlik bildirimleri dizini",
      "t": "Önem derecesi, issue’su ve düzeltmesiyle her güvenlik bildirimi:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/CHANGELOG.md",
      "label": "Değişiklik günlüğü",
      "t": "Teknik kayıtların tamamı:"
    }
  ]
};

export default body;
