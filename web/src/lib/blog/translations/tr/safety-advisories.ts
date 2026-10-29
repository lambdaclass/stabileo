import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Güvenlik uyarıları: hangi sonuçlar değişti ve ne yapılmalı",
  "excerpt": "Yanlış veya güvensiz tarafta sonuç verebilecek Stabileo kusurları: kimi etkiledikleri, bir modelin etkilenip etkilenmediğinin nasıl anlaşılacağı, bu arada ne yapılması gerektiği ve ne zaman düzeltildikleri.",
  "blocks": [
    {
      "k": "p",
      "t": "Stabileo'nun sonuçları gerçek yapıların tasarımında kullanılıyor. Yanlış, özellikle de güvensiz tarafta bir sonuç üretmiş olabilecek bir kusur bulduğumuzda bunu bir güvenlik uyarısı olarak yayımlıyoruz: neyin yanlış olduğu, hangi modelleri etkilediği, bunların nasıl tanınacağı, düzeltme yayına girene kadar ne yapılacağı ve hâlihazırda kullanılmış sonuçlarda neyin yeniden kontrol edileceği."
    },
    {
      "k": "p",
      "t": "Bu kusurların neredeyse tamamını kendi doğrulama programımız buldu: diğer yedi sonlu eleman programıyla karşılaştırma, yayımlanmış çözümlü örnekler, fiziksel değişmez testleri ve her elemanın türetilişinin incelenmesi. Bunları yayımlamak bu çalışmanın bir parçasıdır: bildirilmeyen bir kusur, daha önce teslim edilmiş hesaplarda kalmaya devam eder."
    },
    {
      "k": "note",
      "t": "28 Ekim 2026 itibarıyla durum: SA-2026-001 ile 020 arası 0.3.0 sürümünde, SA-2026-021 ile 024 arası 0.4.0 sürümünde düzeltildi (stabileo.com'da yayında; SA-2026-021 ve 022 22 Ekim'den, SA-2026-023 ve 024 ise 25 ve 26 Ekim'den beri). Bunları yayımlamak, sonuçları nasıl doğruladığımızın bir parçasıdır; hâlâ açık oldukları anlamına gelmez. Bir uyarı, değişikliğin var olmasıyla değil, düzeltme stabileo.com'da yayına girdiğinde düzeltilmiş sayılır. Bir uyarı açık olduğu sürece önerilen geçici çözümü uygulayın ve imzalamadan önce etkilenen sonucu elle kontrol edin."
    },
    {
      "k": "h",
      "t": "Özet"
    },
    {
      "k": "table",
      "caption": "Yayımlanan uyarılar. Önem derecesi: kapasite veya istem, görünür hiçbir belirti olmadan güvensiz tarafta büyük ölçüde sapabiliyorsa kritik.",
      "head": [
        "Uyarı",
        "Konu",
        "Önem derecesi",
        "Durum"
      ],
      "rows": [
        [
          "SA-2026-021",
          "Serbest çatılar: mahya doğrultusunda rüzgar yoktu, mahyaya dik doğrultuda ise kuvvet §2.1.5 minimumunun altındaydı (20 m/s'de minimumun %17'si)",
          "Yüksek",
          "0.4.0'da düzeltildi"
        ],
        [
          "SA-2026-022",
          "Toprak basıncı H varken ölü yükün ona karşı koyduğu kombinasyon eksikti (bir örnekte %27 ile %45 arası düşük)",
          "Yüksek",
          "0.4.0'da düzeltildi"
        ],
        [
          "SA-2026-023",
          "BA kolonlar: kontrol momentin tek bir işaretini okuyordu; simetrik olmayan donatı düzenleri (6, 10, 14…) güçlü taraftan kontrolü sağlıyordu",
          "Kritik",
          "0.4.0'da düzeltildi"
        ],
        [
          "SA-2026-024",
          "Kombinasyonlar tanımlı olup çözülmemişken temeller, birleşim bölgeleri, döşemeler, perdeler ve çelik optimizasyonu katsayısız yüklere göre tasarlanıyordu (canlı hesaplama, başarısız bir kombinasyon çözümü veya boş bir etkin liste)",
          "Yüksek",
          "0.4.0'da düzeltildi"
        ],
        [
          "SA-2026-013",
          "Eğri kabuklar: eğilme momentleri sıfır olarak raporlanıyordu; gerilmeler serbest ısıl şekil değiştirmeyi içinde tutuyordu",
          "Yüksek",
          "0.3.0'da düzeltildi"
        ],
        [
          "SA-2026-014",
          "3B plastik göçme: çarpan eleman numaralandırmasına bağlıydı (göçme yükünün 2,4 katına kadar)",
          "Yüksek",
          "0.3.0'da düzeltildi"
        ],
        [
          "SA-2026-015",
          "Öz ağırlıklı kablolar hiperstatik yapılarda olması gerekenden az çekme kuvveti alıyordu",
          "Yüksek",
          "0.3.0'da düzeltildi"
        ],
        [
          "SA-2026-011",
          "Yaydan ankastre veya sabit mafsallıya çevrilen 3B mesnet yay olarak çözülüyordu",
          "Yüksek",
          "2026-10-20'de düzeltildi"
        ],
        [
          "SA-2026-017",
          "Zemin-yapı etkileşimi: p-y, t-z ve q-z eğrileri kaynaklarından sapıyordu",
          "Yüksek",
          "0.3.0'da düzeltildi"
        ],
        [
          "SA-2026-008",
          "Tepki spektrumu: CQC seçiliyken taban kesme kuvveti SRSS ile birleştiriliyordu; katılımda mesnetlere bağlı kütle yoktu",
          "Yüksek",
          "2026-10-21'de düzeltildi"
        ],
        [
          "SA-2026-007",
          "Burulmalı veya eğilmeli-burulmalı modlar olmadan 3B burkulma",
          "Yüksek",
          "2026-10-21'de düzeltildi"
        ],
        [
          "SA-2026-006",
          "3B olarak çözülen düzlem model: düğüm momentleri ve zorlanmış dönmeler ters yöndeydi",
          "Yüksek",
          "2026-10-21'de düzeltildi"
        ],
        [
          "SA-2026-005",
          "2B eğik çubuklar: eksenel kuvvette çubuk doğrultusundaki yük bileşeni yoktu",
          "Yüksek",
          "2026-10-21'de düzeltildi"
        ],
        [
          "SA-2026-019",
          "Çubuk sıcaklık yükleri (hesap motoru ve WASM; uygulama 2026-10-07'den beri telafi ediyordu): çeliğin α'sı ve dolu dikdörtgen kesitin yüksekliği",
          "Orta",
          "0.3.0'da düzeltildi"
        ],
        [
          "SA-2026-012",
          "Malzeme bakımından doğrusal olmayan analiz (yalnızca hesap motoru ve WASM): akmadan sonra elastik çubuk kuvvetleri",
          "Orta",
          "0.3.0'da düzeltildi"
        ],
        [
          "SA-2026-016",
          "Eğri çubuklar (hesap motorunun eğri kirişleri, uygulamanın yay aracı): neredeyse düşey parçalarda Iy ile Iz yer değiştirmişti",
          "Orta",
          "0.3.0'da düzeltildi"
        ],
        [
          "SA-2026-018",
          "Eğri geometride MITC9 kabuklar (yalnızca hesap motoru ve WASM) rijit cisim hareketiyle şekil değiştiriyordu",
          "Orta",
          "0.3.0'da düzeltildi"
        ],
        [
          "SA-2026-020",
          "3B malzeme bakımından doğrusal olmayan analiz (yalnızca hesap motoru ve WASM): akma yüzeyi 2B'dekinden daha az güvenliydi",
          "Orta",
          "0.3.0'da düzeltildi"
        ],
        [
          "SA-2026-010",
          "Spektral sertifika sonlu olmayan sonuçları geçiriyordu",
          "Orta",
          "2026-10-19'da düzeltildi"
        ],
        [
          "SA-2026-009",
          "SHB8 katı kabuk, ince plak eğilmesinde %22 fazla rijitti (sehimler %18 düşük)",
          "Orta (hiperstatik yapılarda daha yüksek)",
          "2026-10-19'da düzeltildi"
        ],
        [
          "SA-2026-004",
          "Modelin bir kısmını yok sayan analizler (dinamik, burkulma, plastik göçme)",
          "Kritik",
          "0.2.0'da düzeltildi"
        ],
        [
          "SA-2026-003",
          "Çelik, soğuk şekillendirilmiş ve birleşim kontrolleri kapasiteyi olduğundan yüksek gösteriyordu",
          "Kritik",
          "0.2.0'da düzeltildi"
        ],
        [
          "SA-2026-002",
          "Beton kontrolleri (CIRSOC 201, ACI 318) kapasiteyi olduğundan yüksek gösteriyordu",
          "Kritik",
          "0.2.0'da düzeltildi"
        ],
        [
          "SA-2026-001",
          "Üretilen kombinasyonlar ve yükler (CIRSOC 101, 102, 103) güvensiz taraftaydı",
          "Yüksek",
          "0.2.0'da düzeltildi"
        ]
      ]
    },
    {
      "k": "table",
      "caption": "Her uyarıda belgelenen örnekler: doğru değer ve Stabileo'nun raporladığı değer.",
      "head": [
        "Uyarı",
        "Örnek",
        "Doğru",
        "Raporlanan",
        "Birim"
      ],
      "rows": [
        [
          "SA-2026-024",
          "6 × 4 m portal çerçeve, kirişte 20 kN/m ölü yük, 15 kN rüzgar, 1.2D + 1.6W, canlı hesaplama açıkken yapılan bir düzenlemeden sonra: rüzgar alan taraftaki temelin düşey tepkisi",
          "65,61",
          "56,01",
          "kN"
        ],
        [
          "SA-2026-023",
          "30×30 cm kolon, 6 Ø20 (üçü alt yüzde), Nu = 100 kN: üç çubuklu yüz basınçtayken φMn",
          "78,57",
          "101,57",
          "kN·m"
        ],
        [
          "SA-2026-013",
          "Dört eğri kabuktan oluşan konsol, 4 × 1 × 0,2 m, uçta 10 kN: ankastre uçtaki elemanda mx",
          "35,0",
          "0",
          "kN·m/m"
        ],
        [
          "SA-2026-014",
          "10 çubuklu uzay çerçeve (frame3d-2), yeniden numaralandırılmış: plastik göçme çarpanı",
          "176,47",
          "424,3",
          "—"
        ],
        [
          "SA-2026-015",
          "20 m gergili direk, 1 cm² çelik gergi halatı, tepede 5 kN: gergi halatındaki çekme kuvveti",
          "5,18",
          "4,34",
          "kN"
        ],
        [
          "SA-2026-011",
          "0, 4 ve 8 m'de mesnetli kiriş, 8 m'deki mesnet ankastre olarak çizilmiş: o mesnetteki sehim",
          "0",
          "-14,4",
          "mm"
        ],
        [
          "SA-2026-017",
          "Yumuşak kil c = 20 kPa, D = 1 m, z = 4 m: nihai zemin direnci p_u",
          "124",
          "84",
          "kN/m"
        ],
        [
          "SA-2026-008",
          "ω ve 1.1ω frekanslı iki mod: CQC değerine göre taban kesme kuvveti",
          "1,00",
          "0,81",
          "—"
        ],
        [
          "SA-2026-007",
          "200×10 mm haç kesitli kolon, 1,5 m: kritik yük",
          "2993",
          "5860",
          "kN"
        ],
        [
          "SA-2026-006",
          "Düğüm momentleri ve kuvvetleri olan portal çerçeve: yanal ötelenme",
          "0,92",
          "2,52",
          "mm"
        ],
        [
          "SA-2026-005",
          "Beşik çatı merteği: tabandaki eksenel kuvvet",
          "-56,67",
          "-41,67",
          "kN"
        ],
        [
          "SA-2026-019",
          "İki ucu ankastre IPE 300, 20 °C sıcaklık farkı: uç momenti",
          "14,04",
          "9,76",
          "kN·m"
        ],
        [
          "SA-2026-012",
          "Akmış 4 m'lik konsol, uç yükü 1.2·Mp/L: ankastre uçtaki moment",
          "1012,5",
          "101250",
          "kN·m"
        ],
        [
          "SA-2026-016",
          "Y–Z düzleminde 5 m'lik yarım daire kemer, 40 parça: tepe noktasındaki sehim",
          "-7,29",
          "-6,18",
          "mm"
        ],
        [
          "SA-2026-018",
          "MITC9 silindirik yama, 2×2 m, ok yüksekliği 0,2 m, çelik, 50 mm, 1 mrad rijit dönme: düğümlerdeki en büyük von Mises gerilmesi",
          "0",
          "101",
          "MPa"
        ],
        [
          "SA-2026-020",
          "3B konsol, 4 m, N = 0.5·Np, uç yükü: ilk akmadaki yük",
          "158,2",
          "182,7",
          "kN"
        ],
        [
          "SA-2026-009",
          "Eğilme etkisindeki ince plak, ν = 0,3: doğru değere göre rijitlik",
          "1,000",
          "1,225",
          "—"
        ]
      ]
    },
    {
      "k": "h",
      "t": "SA-2026-021: serbest çatılarda minimum rüzgar"
    },
    {
      "k": "p",
      "t": "Serbest bir çatı (açık bir sundurma, bir otopark örtüsü, bir saçak) yalnızca Şekil 2.4-4 ile 2.4-7 arasındaki, çatıya dik net basınçları alıyordu. CIRSOC 102-2025 §2.1.5, açık bir binadaki rüzgar kuvvetinin ayrıca, kendi başına yatay bir yük durumu olarak en az 0,75 kN/m² × Af olmasını ister. Bu minimum olmadan, rüzgar mahya doğrultusunda estiğinde yatay kuvvet sıfırdı, mahyaya dik estiğinde ise kuvvet düşük ve orta hızlarda minimumun altında kalıyordu. Artık her doğrultu için bu yük durumu var."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-021-free-roof-wind-minimum.md",
      "label": "SA-2026-021 tam metni",
      "t": "Ölçümlerle birlikte uyarı:"
    },
    {
      "k": "h",
      "t": "SA-2026-022: ölü yükün karşı koyduğu toprak basıncı"
    },
    {
      "k": "p",
      "t": "H yükleri olduğunda CIRSOC 101-2025, etkimeyen yüklerin etkilerinin de incelenmesini ister. 0.9 D + 1.6 H ve 1.2 D + 1.6 H kombinasyonları hiç üretilmiyordu; bu yüzden ölü yükün toprak basıncına karşı koyduğu durumlarda (bir duvarın devrilmesi veya kayması) etki düşük çıkıyordu. Artık modelde rüzgar veya deprem olsun ya da olmasın bu kombinasyonlar üretiliyor."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-022-earth-pressure-dead-load-resisting.md",
      "label": "SA-2026-022 tam metni",
      "t": "Örnekle birlikte uyarı:"
    },
    {
      "k": "h",
      "t": "SA-2026-023: simetrik olmayan donatı düzenli BA kolonlar"
    },
    {
      "k": "p",
      "t": "İstasyon momentleri kolon kontrolüne mutlak değer olarak ulaşıyordu, ancak eksenel kuvvet ve tek eksenli eğilme altındaki kapasite yalnızca bir işaret için, üst yüz basınçtayken hesaplanıyordu. 6, 10, 14, 18 veya 22 çubukta boyutlandırıcı fazla çubukları alt ve sağ yüzlere koyar; dolayısıyla bu güçlü işarettir: moment ters döndüğünde kapasite daha düşüktür ve bu hiç kontrol edilmiyordu. 100 kN basınç altındaki, 6 Ø20 donatılı 30×30 cm bir kolon bir yönde 101,57 kN·m, diğer yönde 78,57 taşır ve Mu = 100 kN·m için kontrolü sağlıyordu. Bu, tek eksenli eğilme altındaki CIRSOC 201 kolon kontrolünü etkiler (çubuğun mevcut donatısıyla yapılan kontrol, boyutlandırıcı ve hesap motorunun yeniden kontrolü); iki eksenli kontrol zaten en elverişsiz çeyreği alıyordu."
    },
    {
      "k": "ul",
      "items": [
        "Sizi etkileyip etkilemediğini nasıl anlarsınız: modelde, donatısı eğilme eksenine göre simetrik olmayan ve CIRSOC 201 ile kontrol edilen betonarme kolonlar vardır: boyutlandırıcının verdiği 6, 10, 14, 18 veya 22 çubuk ya da karşılıklı yüzlerde farklı sayıda çubukla elle girilmiş yüzler.",
        "Ne yapmalı: düzeltmeden önceki bir sürümde simetrik düzenler kullanın (4, 8, 12, 16, 20 veya 24 çubuk ya da eşit karşılıklı yüzler) veya kolonu çubukların ayna görüntüsüyle de kontrol edin: iki kapasiteden küçük olanı belirleyicidir.",
        "Durum: 0.4.0'da düzeltildi, 25 Ekim 2026'dan beri stabileo.com'da yayında. Hesap motoru her iki işareti de hesaplar ve zayıf olanı alır; simetrik düzenler tam olarak önceki sonuçları verir."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-023-column-moment-sign.md",
      "label": "SA-2026-023 tam metni",
      "t": "Test örneğiyle birlikte uyarı:"
    },
    {
      "k": "h",
      "t": "SA-2026-024: katsayısız yüklere göre tasarlanan temeller, birleşim bölgeleri, döşemeler ve perdeler"
    },
    {
      "k": "p",
      "t": "Kombinasyonlar tanımlıyken ve hiçbiri çözülmemişken temeller ve birleşim bölgeleri ekrandaki sonucu okuyordu; bu sonuç da tüm yüklerin 1 katsayısıyla alındığı durumdur: katsayılı kombinasyonlar yerine servis yüklerine göre tasarlanıyorlardı. Bu, canlı hesaplama açıkken (bir düzenlemeden sonra, tekli görünüm ekrandayken yalnızca “Tüm yükler” yeniden çözülür) ya da kombinasyon çözümü başarısız olup yerine tekli çözüm geçtiğinde oluyordu. 1.2D + 1.6W altındaki bir portal çerçevede bir temelin tepkisi %15 düşük çıktı; ölü ve hareketli yükle %29 ile %38 arası. Aynısı döşemelerde ve perdelerde, çelik optimizasyonunda ve etkin kombinasyon listesi boş olduğunda da oluyordu. Artık her tasarım, kombinasyonlar çözülene kadar nedenini belirterek reddediliyor."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-024-design-on-unfactored-results.md",
      "label": "SA-2026-024 tam metni",
      "t": "Örnekle birlikte uyarı:"
    },
    {
      "k": "h",
      "t": "SA-2026-014: 3B plastik göçme numaralandırmaya bağlıydı"
    },
    {
      "k": "p",
      "t": "İki eksenli eğilmede, geriye dönen bir mafsalı kapatan ve akma yüzeyinin dışına itilen kapalı bir mafsalı yeniden açan kontroller döngüye girebiliyordu. Çözücü, eleman sırası onu hangi durumda bıraktıysa oradan devam ediyor ve kapalı bir kesiti akma yüzeyinin ötesine itiyordu: aynı yapı, yeniden numaralandırıldığında, sertifikalı 176,47 değerine karşılık 75,9 ile 424,3 arasında göçme çarpanları raporluyordu. Analiz artık son tutarlı durumda duruyor ve bu çarpanı, her numaralandırma için aynı olacak şekilde, bir uyarıyla birlikte alt sınır olarak raporluyor. Pro sekmesindeki 3B itme analizini etkiler."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-014-plastic-3d-element-order.md",
      "label": "SA-2026-014 tam metni",
      "t": "Test modeli ve sertifikalı değerle birlikte uyarı:"
    },
    {
      "k": "h",
      "t": "SA-2026-011: yaydan ankastreye çevrilen 3B mesnet"
    },
    {
      "k": "p",
      "t": "Yayları olan bir mesnetin tipini değiştirmek yay sabitlerini koruyordu. 3B modda bu sabitler tutulu serbestlikle birlikte çözücüye gönderiliyor ve çözücü o serbestlik derecesini elastik kabul ediyordu: ankastre çizilen mesnet yay olarak çözülüyordu. 3B modda çözülen modelleri, 3B olarak çözülen düzlem modeller dahil, etkiler; 2B mod etkilenmez."
    },
    {
      "k": "ul",
      "items": [
        "Etkilenip etkilenmediğinizi nasıl anlarsınız: bir mesnet önce yaydı (veya yay sabitleri vardı), sonra ankastre, sabit mafsallı veya kayıcı mesnede çevrildi ya da bir serbestlik derecesi tutulu olarak işaretlendi. Sonuçlarda bu mesnet sıfırdan farklı bir yer değiştirme veya dönme gösterir.",
        "Ne yapmalı: mesnetleri yaydan rijide çevrilmiş 3B modelleri stabileo.com'da yeniden çözün ve bu mesnetlerin yakınındaki sonuçları daha önce kullandıklarınızla karşılaştırın.",
        "Durum: 20 Ekim 2026'da stabileo.com'da düzeltildi. Daha önce kaydedilmiş projeler dahil, tutulu her serbestlik derecesi tutulu olarak çözülür."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-011-springs-on-fixed-supports.md",
      "label": "SA-2026-011 tam metni",
      "t": "Yeniden üretme adımları ve test modeliyle birlikte uyarı:"
    },
    {
      "k": "h",
      "t": "SA-2026-013: eğri kabuk momentleri ve ısıl gerilmeler"
    },
    {
      "k": "p",
      "t": "Eğri kabuklar (eğri olarak işaretlenmiş dörtgenler) eğilme ne olursa olsun mx = my = mxy = 0 raporluyordu; sıcaklık yükü altında ise gerilmeleri serbest ısıl şekil değiştirmeyi içinde tutuyordu: serbestçe genleşebilen bir kabuk E·α·ΔT/(1−ν) raporluyor, tutulu bir kabuk ise hiçbir şey raporlamıyordu. Uygulama ayrıca eğri bir dörtgenin sıcaklığını düz bir dörtgeninki gibi gönderiyor, hesap motoru da bunu atıyordu: kabuk ısıtılmamış olarak analiz ediliyordu. Bu sonuçları kabuk kontur çizimleri (dışa aktarılan şekiller dahil), Pro sonuç tablosu ve PDF raporu ile bir panel eğri dörtgen olduğunda döşeme tasarımı okuyordu; sonuç çalışma kitabı ve CSV bu momentleri zaten boş bırakıyordu."
    },
    {
      "k": "ul",
      "items": [
        "Sizi etkileyip etkilemediğini nasıl anlarsınız: modelde eğri dörtgenler vardır ve bunların momentlerini kullandınız (konturlar, Pro tablosu veya raporu, döşeme tasarımı) ya da eğri bir dörtgende sıcaklık yükü vardır.",
        "Ne yapmalı: bu modelleri yeniden çalıştırın ve bunların momentlerini veya sıcaklık altındaki gerilmelerini okuyan her tasarımı ya da kontrolü tekrarlayın. O zamana kadar yüzeyi düz dörtgenlerle (MITC4) modelleyin.",
        "Durum: 0.3.0'da düzeltildi, 21 Ekim 2026'dan beri stabileo.com'da yayında."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-013-curved-shell-moments-and-thermal.md",
      "label": "SA-2026-013 tam metni",
      "t": "Test konsolu ve sıcaklık örnekleriyle birlikte uyarı:"
    },
    {
      "k": "h",
      "t": "SA-2026-017: zemin-yapı etkileşiminde zemin eğrileri"
    },
    {
      "k": "p",
      "t": "Zemin eğrileri, atıfta bulundukları kaynaklara uymuyordu. Yumuşak kilde Matlock'un J terimi atlanıyordu (yüzeye yakın kısımda nihai direnç üçte bir ile yarı arasında düşük); kumda her zaman tekrarlı yükleme katsayısı A = 0,9 ve basamaklı bir k tablosu kullanılıyordu; katı kilde direnç y50'de yarıdan tama sıçrıyor, ötesinde %70'e düşüyordu. t-z ve q-z eğrilerinde (yalnızca hesap motoru ve WASM) kazık gövdesinin çevresi ve uç alanı eksikti. PRO → Gelişmiş → Zemin-yapı etkileşimi bölümünü ilgilendirir. Panel artık J'yi ve kumdaki yükleme tipini soruyor; hesap motoru da girdisi eksik bir eğriyi varsaymak yerine reddediyor. Ne yapmalı: bu modelleri yeniden çalıştırın ve kazık yer değiştirmelerini ve momentlerini yeniden kontrol edin."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-017-soil-curves.md",
      "label": "SA-2026-017 tam metni",
      "t": "Her eğri için önceki ve sonraki değerlerle birlikte uyarı:"
    },
    {
      "k": "h",
      "t": "SA-2026-019: çubuklarda sıcaklık yükleri"
    },
    {
      "k": "p",
      "t": "Hesap motoru her çubuğun sıcaklık yükünü α = 12·10⁻⁶ /°C (çeliğinki) ile ve eşdeğer dolu dikdörtgen kesitin yüksekliğiyle, √(12·I/A), hesaplıyordu. Bir IPE'de sıcaklık farkı momenti %30 düşük, alüminyumda ise sıcaklıktan kaynaklanan eksenel kuvvet neredeyse yarı yarıya düşük çıkıyordu. Uygulama 7 Ekim 2026'dan beri her ikisini de telafi ediyordu; dolayısıyla bu kusur hesap motorunun veya WASM API'sinin doğrudan kullanımını ve uygulamada bu tarihten önce çözülmüş sıcaklık yüklü modelleri etkiler."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-019-frame-thermal-alpha-depth.md",
      "label": "SA-2026-019 tam metni",
      "t": "Test örnekleriyle birlikte uyarı:"
    },
    {
      "k": "h",
      "t": "SA-2026-012: malzeme bakımından doğrusal olmayan analizde çubuk kuvvetleri"
    },
    {
      "k": "p",
      "t": "Bir çubuk aktıktan sonra çözücü yükleri azaltılmış rijitlikle dengeliyor, ancak elastik rijitlikle hesaplanmış kuvvetleri raporluyordu. Yer değiştirmeler ve mesnet tepkileri doğruydu; çubuk kuvvetleri ve kullanım oranı ise değildi: bir konsolda raporlanan moment gerçeğinin 100 katıydı. Bu çözücüye yalnızca hesap motorundan veya WASM API'sinden erişilebilir: uygulamadaki hiçbir ekran onu çağırmaz, dolayısıyla stabileo.com'da elde edilen sonuçlar etkilenmez."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-012-material-nonlinear-member-forces.md",
      "label": "SA-2026-012 tam metni",
      "t": "Test konsoluyla birlikte uyarı:"
    },
    {
      "k": "h",
      "t": "SA-2026-016: bir kemerin neredeyse düşey parçalarında kesit eksenleri"
    },
    {
      "k": "p",
      "t": "Bir yayın doğru parçaları, düz bir çubuğun varsayılan yerel eksenlerini alıyordu; bu eksenler düşeyle arasında 2,56°'den az açı bulunan bir çubukta referans olarak global X'i kullanır. X–Z düzleminin dışındaki bir kemerde bu, üzengi noktalarındaki neredeyse düşey parçaların kesitini 90° döndürüyordu: orada Iy ile Iz yer değiştirmişti. Y–Z düzlemindeki 40 parçalı bir yarım dairede tepe noktasındaki sehim %15 düşük çıkıyordu. Bir parça neredeyse düşey olduğunda hesap motorunun eğri kirişlerini ve Çubuklar sekmesindeki (PRO) yay aracıyla çizilen yayları etkiler; planda eğri olanlar etkilenmez. Daha önce kaydedilmiş yaylar, proje açıldığında düzeltilmiş eksenleri alır."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-016-curved-member-axes.md",
      "label": "SA-2026-016 tam metni",
      "t": "Test kemeriyle birlikte uyarı:"
    },
    {
      "k": "h",
      "t": "SA-2026-015: öz ağırlıklı kablolarda çekme kuvveti"
    },
    {
      "k": "p",
      "t": "Kablo analizi, kendi ağırlığı altında sarkan bir kablonun kord bağıntısının teğeti olan Ernst modülünü, düz korddan ölçülen bir sekantmış gibi kullanıyordu. Sarkma kord boyunu tüketir; bu yüzden bir kablo belirli bir uzama için EA·ε'dan daha az değil, daha fazla çekme kuvvetine ihtiyaç duyar. Kablo kuvvetinin yalnızca dengeyle belirlendiği durumlarda çekme kuvveti doğruydu; kablonun yükü başka çubuklarla paylaştığı durumlarda (gergili bir direk, bir çerçeveyi çaprazlayan bir kablo) kablo olması gerekenden az, yanındaki çubuklar ise fazla kuvvet alıyordu: test direğinde 5,18 kN yerine 4,34 kN; daha küçük yüklerde ise iterasyon yakınsamıyordu. Uygulamada, davranışı “kablo” olan ve malzemesinin yoğunluğu tanımlı çubuklara sahip 3B modelleri etkiler."
    },
    {
      "k": "ul",
      "items": [
        "Nasıl anlarsınız: modelde “kablo” davranışlı çubuklar vardır, bunların malzemesinin yoğunluğu tanımlıdır ve kablo tek yük aktarım yolu değildir.",
        "Ne yapmalı: belirleyici kablo ve ankraj kuvvetlerini elle kontrol edin ya da kablo malzemesinde yoğunluk olmadan çözün (ağırlık olmadan bağıntı doğruydu); düzeltme yayımlandıktan sonra yeniden çalıştırın.",
        "Durum: 0.3.0'da düzeltildi. Kablo analizi artık kord bağıntısının kendisini Newton iterasyonuyla çözüyor."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-015-cable-tension-chord-law.md",
      "label": "SA-2026-015 tam metni",
      "t": "Test direği ve kapalı çözümüyle birlikte uyarı:"
    },
    {
      "k": "h",
      "t": "SA-2026-018: eğri geometride MITC9 kabuklar"
    },
    {
      "k": "p",
      "t": "MITC9 elemanı düzdür: dokuz düğümünü tek bir düzleme izdüşürür. Kenar ortası veya merkez düğümleri bu düzlemin dışında kaldığında (eğri her MITC9 ağında) izdüşümde MITC4'teki rijit bağlantı düzeltmesi yoktu; bu yüzden rijit bir dönme elemanda şekil değiştirme oluşturuyordu: eğri bir ağ, elemanlarının dönmelerine direnç gösteriyor ve bunlar için gerilmeler raporluyordu (1 mrad döndürülmüş bir test yamasında 101 MPa). Bu eleman yalnızca hesap motorundan veya WASM API'sinden kullanılır: uygulama dokuz düğümlü eleman oluşturmaz, dolayısıyla stabileo.com'da elde edilen sonuçlar etkilenmez."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-018-mitc9-curved-rigid-motion.md",
      "label": "SA-2026-018 tam metni",
      "t": "Test yaması ve yarım küreyle birlikte uyarı:"
    },
    {
      "k": "h",
      "t": "SA-2026-020: 3B malzeme bakımından doğrusal olmayan analizde akma yüzeyi"
    },
    {
      "k": "p",
      "t": "2B'de bir çubuk, (N/Np)² + |M|/Mp 1'i aştığında akar. 3B'de çözücü, moment oranlarının karesini alan (N/Np)² + (My/Mpy)² + (Mz/Mpz)² ifadesini kullanıyordu; bu yüzden eksenel kuvvet veya iki eksenli eğilme varken 3B bir çubuk, aynı çubuğun 2B'deki haline göre daha geç akıyor ve raporlanan kullanım oranı düşük çıkıyordu: N = 0,5·Np için ilk akmadaki yük %15 yüksek çıkıyordu. 3B artık (N/Np)² + |My|/Mpy + |Mz|/Mpz ifadesini kullanıyor; bu ifade tek eksenli eğilmede 2B yüzeyine eşittir. Bu çözücüye yalnızca hesap motorundan veya WASM API'sinden erişilebilir: uygulamanın hiçbir ekranı onu çağırmaz, dolayısıyla stabileo.com'da elde edilen sonuçlar etkilenmez."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-020-material-nonlinear-3d-yield-surface.md",
      "label": "SA-2026-020 tam metni",
      "t": "Test örnekleriyle birlikte uyarı:"
    },
    {
      "k": "h",
      "t": "SA-2026-008: spektral analizde taban kesme kuvveti ve modal katılım"
    },
    {
      "k": "p",
      "t": "CQC kuralı seçiliyken raporlanan taban kesme kuvveti hâlâ SRSS ile birleştiriliyordu. Bir doğrultudaki modal taban kesme kuvvetleri aynı işareti taşır; bu yüzden CQC, SRSS'ten daha büyük değer verir: birbirine yakın iki modda raporlanan değer %19 düşüktü. Katılım çarpanlarında ayrıca tutarlı kütle matrisinin mesnetlere bağladığı kütle atlanıyordu; bu da kolon başına az eleman bulunan modellerde tepkiyi olduğundan düşük tahmin ediyordu."
    },
    {
      "k": "ul",
      "items": [
        "Etkilenip etkilenmediğinizi nasıl anlarsınız: CQC ile spektral analiz yaptınız ve raporlanan taban kesme kuvvetini kullandınız (örneğin onu eşdeğer statik taban kesme kuvvetine ölçeklemek için) ya da kolonları bir veya iki elemandan oluşan modellerde tutarlı kütle kullandınız.",
        "Ne yapmalı: etkilenen modelleri stabileo.com'da yeniden çözün ve daha önce kullandığınız sonuçlarla karşılaştırın. Bu uyarının düzeltmeden önce önerdiği geçici çözüm artık geçerli değildir.",
        "Durum: 21 Ekim 2026'da stabileo.com'da düzeltildi."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-008-spectral-combination.md",
      "label": "SA-2026-008 tam metni",
      "t": "İki kusuru ayrı ayrı ele alan uyarı:"
    },
    {
      "k": "h",
      "t": "SA-2026-007: 3B'de burulmalı ve eğilmeli-burulmalı burkulma"
    },
    {
      "k": "p",
      "t": "3B çubukların geometrik rijitliğinde yalnızca eğilme terimleri vardı: Wagner terimi ve kayma merkezi etkileşimi yoktu. Burulmalı ve eğilmeli-burulmalı burkulma hiç ortaya çıkmıyor, bunun yerine Euler yükü raporlanıyordu. Haç kesitli bir kolonda raporlanan yük, belirleyici yükün %96 üzerindeydi."
    },
    {
      "k": "ul",
      "items": [
        "Etkilenip etkilenmediğinizi nasıl anlarsınız: burulma rijitliği düşük açık ince cidarlı kesitlere sahip yapılar için 3B burkulma çarpanını veya 3B P-Delta'yı kullandınız: haç kesitler, tek veya çift korniyerler, T kesitler, U profiller. Eğilmeli burkulmanın belirleyici olduğu çift simetrik I kesitler etkilenmez. Burulmalı burkulmayı kendisi hesaplayan tasarım kontrolleri de (0.2.0'dan beri CIRSOC 301 E.4) etkilenmez.",
        "Ne yapmalı: etkilenen modelleri stabileo.com'da yeniden çözün ve daha önce kullandığınız sonuçlarla karşılaştırın. Bu uyarının düzeltmeden önce önerdiği geçici çözüm artık geçerli değildir.",
        "Durum: 21 Ekim 2026'da stabileo.com'da düzeltildi."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-007-torsional-buckling.md",
      "label": "SA-2026-007 tam metni",
      "t": "Haç kesitli kolonun çözümüyle birlikte uyarı:"
    },
    {
      "k": "h",
      "t": "SA-2026-006: düğüm momentleri olan ve 3B olarak çözülen düzlem model"
    },
    {
      "k": "p",
      "t": "3B çözücüyle çözülen bir düzlem model X–Z düzleminde yer alır; burada düzlemdeki dönme −Y ekseni etrafında bir dönmedir. Düğüm momentlerinin ve zorlanmış dönmelerin işaret değiştirmesi gerekiyordu ama değiştirmiyordu; bu yüzden ayna görüntüleri gibi etkiyorlardı. Kuvvetlerle birleştiğinde birbirini sönümlemek yerine toplanabilirler."
    },
    {
      "k": "ul",
      "items": [
        "Etkilenip etkilenmediğinizi nasıl anlarsınız: model düzlemseldir (tüm düğümler tek bir düzlemde), 3B modda çözülmüştür ve düğüm momentleri veya zorlanmış mesnet dönmeleri içerir. Dönme yayları etkilenmez.",
        "Ne yapmalı: etkilenen modelleri stabileo.com'da yeniden çözün ve daha önce kullandığınız sonuçlarla karşılaştırın. Bu uyarının düzeltmeden önce önerdiği geçici çözüm artık geçerli değildir.",
        "Durum: 21 Ekim 2026'da stabileo.com'da düzeltildi."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-006-mirrored-moments-2d-in-3d.md",
      "label": "SA-2026-006 tam metni",
      "t": "Üç test örneğiyle birlikte uyarı:"
    },
    {
      "k": "h",
      "t": "SA-2026-005: 2B eğik çubuklarda eksenel kuvvet"
    },
    {
      "k": "p",
      "t": "2B yük oluşturucu, eğik bir çubuktaki yükün çubuk doğrultusundaki bileşenini çubuğun uç düğümlerine taşıyordu. Mesnet tepkileri ve yer değiştirmeler doğruydu, ancak çubuk bu yükü açıklığı boyunca görmüyordu; bu yüzden eksenel kuvveti, gerçek uç değerlerinin ortalamasında sabit kalıyordu: bir merteğin tabanında %26 düşük. Diyagram, inceleyici, rapor, Excel dışa aktarımı ve tasarım bu değeri kullanıyordu. Düzlem bir model 3B olarak çözüldüğünde bir çubuğa uygulanan kuvvet çifti de atılıyordu."
    },
    {
      "k": "ul",
      "items": [
        "Etkilenip etkilenmediğinizi nasıl anlarsınız: 25/09/2026'dan bu yana çözülmüş, çubuk doğrultusunda bileşeni olan yayılı, tekil veya öz ağırlık yükleri taşıyan eğik çubuklara (mertekler, merdivenler, çaprazlar, parçalar halinde çizilmiş kemerler) sahip bir 2B model; ya da bir çubukta kuvvet çifti bulunan ve 3B olarak çözülmüş bir düzlem model. Basınca göre tasarlanmış çubuklar en çok etkilenebilecek olanlardır.",
        "Ne yapmalı: etkilenen modelleri stabileo.com'da yeniden çözün ve daha önce kullandığınız sonuçlarla karşılaştırın. Bu uyarının düzeltmeden önce önerdiği geçici çözüm artık geçerli değildir.",
        "Durum: 21 Ekim 2026'da stabileo.com'da düzeltildi."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-005-inclined-member-loads.md",
      "label": "SA-2026-005 tam metni",
      "t": "Mertek ve 3-4-5 çubuğuyla birlikte uyarı:"
    },
    {
      "k": "h",
      "t": "19 Ekim 2026'da düzeltilenler"
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-009: SHB8 katı kabuk elemanı ince plak eğilmesinde %22 fazla rijitti (Poisson kalınlık kilitlenmesi); bu yüzden sehimleri yaklaşık %18 düşük tahmin ediyordu. Bu tarihten önce çözülmüş, katı kabuk plaklı modellerde sehim ve titreşim sonuçlarını yeniden kontrol edin; MITC4, MITC9, DKT ve eğri kabuk etkilenmemiştir.",
        "SA-2026-010: spektral analiz sertifikası sonlu olmayan sonuçları (NaN) geçirebiliyordu. Sayılar görünür biçimde geçersizdi; yanlış olan, doğrulama iddiasıydı. Teslim edilmiş bir sonuç sonlu olmayan değerler göstermediyse hiçbir şeyin yeniden kontrol edilmesi gerekmez."
      ]
    },
    {
      "k": "h",
      "t": "0.2.0 sürümünde düzeltilenler"
    },
    {
      "k": "p",
      "t": "18 Ekim 2026 tarihli 0.2.0 sürümü, geriye dönük dört uyarıyı düzeltti. Hepsi 17 Ekim 2026'dan önce çözülmüş projeleri etkiler ve her biri için öneri aynıdır: yükleri ve kombinasyonları yeniden üretin, çözün ve tasarım kontrollerini gözden geçirin; daha önceki bir sürümle hazırlanmış her teslim belgesini yeniden kontrol edin."
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-001: üretilen CIRSOC 101, 102 ve 103 kombinasyonları ve yükleri güvensiz taraftaydı (bir örnekte bir kolonun eksenel kuvveti %29 düşüktü).",
        "SA-2026-002: CIRSOC 201 ve ACI 318 beton kontrolleri kapasiteyi olduğundan yüksek gösteriyordu (φMn %18'e kadar yüksek).",
        "SA-2026-003: çelik, soğuk şekillendirilmiş ve birleşim kontrolleri kapasiteyi olduğundan yüksek gösteriyordu (gövde kesme dayanımı %60'a kadar yüksek).",
        "SA-2026-004: modelin bir kısmını yok sayan analizler (yer hareketiyle zaman tanım alanında analiz deprem yükünün yarısına kadarını kaybediyordu; 3B plastik göçme 2,3 kata kadar güvensizdi)."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Tüm uyarılar",
      "t": "Her uyarı, düzeltmesi ve önem derecesiyle birlikte tam liste:"
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Bu kusurları nasıl bulduğumuz ve hiçbir doğrulamanın neyi garanti edemeyeceği:"
    }
  ]
};

export default body;
