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
      "t": "12 Kasım 2026 itibarıyla durum: SA-2026-001 ile 020 arası 0.3.0 sürümünde, SA-2026-021 ile 024 arası 0.4.0 sürümünde ve SA-2026-025 ile 047 arası 0.5.0 sürümünde düzeltildi (SA-2026-040 için önlem alındı: kontrol eksik olarak işaretlenir); SA-2026-044 hariç: #758 kapanana kadar 2D plastik göçme hesabı reddedilmeye devam eder. SA-2026-048, 0.5.0 sürümünden sonra düzeltildi ve 8 Kasım 2026 tarihinden beri stabileo.com üzerinde yayında. SA-2026-049, SA-2026-050, SA-2026-051, SA-2026-052 ve SA-2026-053, 0.5.0 sürümünden sonra düzeltildi ve 9 Kasım 2026 tarihinden beri stabileo.com üzerinde yayında. Bunları yayımlamak, sonuçları nasıl doğruladığımızın bir parçasıdır; hâlâ açık oldukları anlamına gelmez. Bir uyarı, değişikliğin var olmasıyla değil, düzeltme stabileo.com'da yayına girdiğinde düzeltilmiş sayılır. Bir uyarı açık olduğu sürece önerilen geçici çözümü uygulayın ve imzalamadan önce etkilenen sonucu elle kontrol edin. SA-2026-054 — Taslak: düzeltme henüz birleştirilmedi veya yayınlanmadı. SA-2026-055 — Taslak: düzeltme henüz birleştirilmedi veya yayınlanmadı. SA-2026-056 — Taslak: çözülmedi; hiçbir düzeltme birleştirilmedi veya yayımlanmadı. SA-2026-057 — Taslak: düzeltme henüz birleştirilmedi veya yayınlanmadı. SA-2026-059 — PR #1921 ile düzeltildi, sürüm yayını bekleniyor. SA-2026-060 — Taslak: yerel düzeltme inceleme ve yayın bekliyor. SA-2026-062 — Taslak: yerel düzeltme inceleme ve yayın bekliyor."
    },
    {
      "k": "note",
      "t": "SA-2026-058 — PR #1922 ile düzeltildi, sürüm yayını bekleniyor."
    },
    {
      "k": "note",
      "t": "SA-2026-061 — PR #1952 içinde düzeltildi, yayın bekleniyor."
    },
    {
      "k": "note",
      "t": "SA-2026-063 — PR #2009 ile düzeltildi, sürüm yayını bekleniyor."
    },
    {"k": "note", "t": "SA-2026-064 — 0.6.1 sürümünde düzeltildi."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-064-steel-cb-combination.md", "label": "SA-2026-064", "t": "Etkilenen girdiler ve yapılacak işlemler."},
    {"k": "note", "t": "SA-2026-065 — 0.6.1 sürümünde düzeltildi."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-065-snow-roof-step.md", "label": "SA-2026-065", "t": "Etkilenen girdiler ve yapılacak işlemler."},
    {"k": "note", "t": "SA-2026-066 — 0.6.1 sürümünde düzeltildi."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-066-cirsoc201-transverse-cm.md", "label": "SA-2026-066", "t": "Etkilenen girdiler ve yapılacak işlemler."},
    {"k": "note", "t": "SA-2026-067 — 0.6.1 sürümünde düzeltildi."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-067-snow-roof-rotation.md", "label": "SA-2026-067", "t": "Etkilenen girdiler ve yapılacak işlemler."},
    {"k": "note", "t": "SA-2026-068 — 0.6.1 sürümünde düzeltildi."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-068-provided-torsion-stirrups.md", "label": "SA-2026-068", "t": "Etkilenen girdiler ve yapılacak işlemler."},
    {"k": "note", "t": "SA-2026-069 — Taslak 2026-11-15; PR #2169 ile düzeltildi, birleştirme ve yayın bekleniyor."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-069-torsion-secondary-shear.md", "label": "SA-2026-069", "t": "Etkilenen girdiler ve yapılacak işlemler."},
    {"k": "note", "t": "SA-2026-070 — PR #2170 içinde düzeltildi, yayın bekleniyor."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-070-interior-member-couples.md", "label": "SA-2026-070", "t": "Etkilenen girdiler ve yapılacak işlemler."},
    {"k": "note", "t": "SA-2026-072 — PR #2175 ile düzeltildi, yayın bekleniyor."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-072-snow-ridge-subdivision.md", "label": "SA-2026-072", "t": "Etkilenen girdiler ve yapılacak işlemler."},
    {"k": "note", "t": "SA-2026-076 — PR #2220 ile düzeltildi, birleştirme ve yayın bekleniyor."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-076-wind-enclosure.md", "label": "SA-2026-076", "t": "Etkilenen girdiler ve yapılacak işlemler."},
    {"k": "note", "t": "SA-2026-077 — PR #2220 ile düzeltildi, birleştirme ve yayın bekleniyor."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-077-wind-wall-height-transfer.md", "label": "SA-2026-077", "t": "Etkilenen girdiler ve yapılacak işlemler."},
    {"k": "note", "t": "SA-2026-078 — PR #2220 ile düzeltildi, birleştirme ve yayın bekleniyor."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-078-wind-roof-pressure-zones.md", "label": "SA-2026-078", "t": "Etkilenen girdiler ve yapılacak işlemler."},
    {"k": "img", "base": "blog/recheck-stale", "w": 1600, "h": 1000, "alt": "Sonuçlar sürümlenmeden önce kaydedilmiş bir betonarme çerçeve ile Stabileo PRO. Alttaki bir şerit, projenin eski bir sürümle çözüldüğünü ve kayıtlı 19 değişikliğin onu ilgilendirdiğini, yani sonuçların eskidiğini söylüyor; yanında neyin değiştiğini görme ve yeniden çözme düğmeleri var.", "caption": "Bir düzeltme kayıtlı bir projeye böyle ulaşır: yeniden çözülene kadar sonuçları eskimiş olarak işaretli kalır ve onu ilgilendiren değişiklikler bir tık uzaktadır."},
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
          "SA-2026-001",
          "Üretilen kombinasyonlar ve yükler (CIRSOC 101, 102, 103) güvensiz taraftaydı",
          "Yüksek",
          "0.2.0'da düzeltildi"
        ],
        [
          "SA-2026-002",
          "Beton kontrolleri (CIRSOC 201, ACI 318) kapasiteyi olduğundan yüksek gösteriyordu",
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
          "SA-2026-004",
          "Modelin bir kısmını yok sayan analizler (dinamik, burkulma, plastik göçme)",
          "Kritik",
          "0.2.0'da düzeltildi"
        ],
        [
          "SA-2026-005",
          "2B eğik çubuklar: eksenel kuvvette çubuk doğrultusundaki yük bileşeni yoktu",
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
          "SA-2026-007",
          "Burulmalı veya eğilmeli-burulmalı modlar olmadan 3B burkulma",
          "Yüksek",
          "2026-10-21'de düzeltildi"
        ],
        [
          "SA-2026-008",
          "Tepki spektrumu: CQC seçiliyken taban kesme kuvveti SRSS ile birleştiriliyordu; katılımda mesnetlere bağlı kütle yoktu",
          "Yüksek",
          "2026-10-21'de düzeltildi"
        ],
        [
          "SA-2026-009",
          "SHB8 katı kabuk, ince plak eğilmesinde %22 fazla rijitti (sehimler %18 düşük)",
          "Orta (hiperstatik yapılarda daha yüksek)",
          "2026-10-19'da düzeltildi"
        ],
        [
          "SA-2026-010",
          "Spektral sertifika sonlu olmayan sonuçları geçiriyordu",
          "Orta",
          "2026-10-19'da düzeltildi"
        ],
        [
          "SA-2026-011",
          "Yaydan ankastre veya sabit mafsallıya çevrilen 3B mesnet yay olarak çözülüyordu",
          "Yüksek",
          "2026-10-20'de düzeltildi"
        ],
        [
          "SA-2026-012",
          "Malzeme bakımından doğrusal olmayan analiz (yalnızca hesap motoru ve WASM): akmadan sonra elastik çubuk kuvvetleri",
          "Orta",
          "0.3.0'da düzeltildi"
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
          "SA-2026-016",
          "Eğri çubuklar (hesap motorunun eğri kirişleri, uygulamanın yay aracı): neredeyse düşey parçalarda Iy ile Iz yer değiştirmişti",
          "Orta",
          "0.3.0'da düzeltildi"
        ],
        [
          "SA-2026-017",
          "Zemin-yapı etkileşimi: p-y, t-z ve q-z eğrileri kaynaklarından sapıyordu",
          "Yüksek",
          "0.3.0'da düzeltildi"
        ],
        [
          "SA-2026-018",
          "Eğri geometride MITC9 kabuklar (yalnızca hesap motoru ve WASM) rijit cisim hareketiyle şekil değiştiriyordu",
          "Orta",
          "0.3.0'da düzeltildi"
        ],
        [
          "SA-2026-019",
          "Çubuk sıcaklık yükleri (hesap motoru ve WASM; uygulama 2026-10-07'den beri telafi ediyordu): çeliğin α'sı ve dolu dikdörtgen kesitin yüksekliği",
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
          "SA-2026-025",
          "AISC 360 G2 kesme (yalnızca hesap motoru ve WASM): gövde alanı olmadan oran 0 ile geçiyordu ve sertifikalanıyordu",
          "Orta",
          "stabileo.com'da düzeltildi (#1234)"
        ],
        [
          "SA-2026-026",
          "EC3 6.2.6 kesme (yalnızca hesap motoru ve WASM): kesme alanı olmadan Av = 0,5·A alınıyordu, HEB 300'de Vpl,Rd %57 yüksek, ve sertifikalanıyordu",
          "Orta",
          "stabileo.com'da düzeltildi (#1234)"
        ],
        [
          "SA-2026-027",
          "Kabuk zarfı: her bileşenin uç değeri yerine en büyük Von Mises gerilmesine sahip kombinasyonu alıyordu (bir örnekte mx %14 düşük)",
          "Yüksek",
          "Düzeltme incelemede"
        ],
        [
          "SA-2026-028",
          "EN 1992-1-1 eğilme (PRO diğer yönetmelikler, sertifikalı): çekme donatısının aktığını varsayıyor ve üst donatıyı yinelemiyordu; MRd %22’ye kadar yüksek",
          "Yüksek",
          "0.4.0 sonrasında düzeltildi"
        ],
        [
          "SA-2026-029",
          "3B: uygulamadaki CIRSOC 201 kolonları Mz kesit yüksekliği üzerinden tasarlanıyordu (bir örnekte %36 eksik donatı); motorun sertifikalı 3B kontrolleri yanal kesme Vy'yi gövde kesmesi olarak okuyordu",
          "Kritik",
          "Bir sonraki sürümde düzeltildi"
        ],
        [
          "SA-2026-030",
          "CIRSOC 301 basınç: alanı levhalarından küçük olan bir kesit negatif bir Qa ve tam plastik eksenel yükün üzerinde bir dayanım veriyor ve geçiyordu",
          "Yüksek",
          "Bir sonraki sürümde düzeltildi"
        ],
        [
          "SA-2026-031",
          "Zaman tanım alanında analiz: kütlesiz bir serbestlik derecesine t = 0'da uygulanan yük ilk adımda kayboluyordu (karşıtlık 33 katına kadar bozuk, iki serbestlik dereceli bir zincir kapalı çözümünden %24 farklı)",
          "Orta",
          "Bir sonraki sürümde düzeltildi"
        ],
        [
          "SA-2026-032",
          "Modal analiz: bir mekanizmanın sıfır frekanslı modu atılıyor ve diğer modlar eksiksizmiş gibi döndürülüyordu",
          "Orta",
          "Bir sonraki sürümde düzeltildi"
        ],
        [
          "SA-2026-033",
          "Yük üreteci: bir kısmının üstünde tek bir alçak eleman olan bir döşeme bütün alan yükünü kaybediyordu (bir örnekte 6 × 6 m'lik bir döşemenin 36 m²'si); kafes kirişler çatı taşıyıcı sistemi sayılmıyordu",
          "Yüksek",
          "Bir sonraki sürümde düzeltildi"
        ],
        [
          "SA-2026-034",
          "Denge kontrolü, kontrolünün yükleri dışarıda bıraktığı durumlarda yükleri ve tepkileri uyuşuyor olarak bildiriyordu; benzer katlardaki düzenlemeler diğer türdeki çubuklara ulaşıyor ve kopyalar mafsallarını kaybediyordu",
          "Orta",
          "Bir sonraki sürümde düzeltildi"
        ],
        [
          "SA-2026-035",
          "3D'den 2D'ye geçiş: kesit, elemanları yanlış kesit ekseni etrafında eğiyordu (Y–Z düzlemindeki bir çerçeve 13,5 kat fazla rijit)",
          "Yüksek",
          "Bir sonraki sürümde düzeltildi"
        ],
        [
          "SA-2026-036",
          "Y–Z veya X–Y üzerinde 3D'den 2D'ye geçiş: kısıtlar çerçeve X–Z'deymiş gibi okunuyordu (yer değiştirme bağları kayboluyor ya da düzlem dışına uygulanıyordu)",
          "Yüksek",
          "Bir sonraki sürümde düzeltildi"
        ],
        [
          "SA-2026-037",
          "3B eşdönel analiz: dönme vektörleri çıkarılıyordu (Bathe–Bolourchi eğrisi %1,3 sapmalı, ağ sıklaştırmayla düzelmiyordu)",
          "Orta",
          "Bir sonraki sürümde düzeltildi"
        ],
        [
          "SA-2026-038",
          "3B burkulma: ekseni boyunca yük altında basıncı boyunca artan çubukların katsayısı yüksek çıkıyordu (tek çubukta +%43) ve yalnızca uçları arasında basınç altındaki bir çubuk reddediliyordu",
          "Yüksek",
          "Bir sonraki sürümde düzeltildi"
        ],
        [
          "SA-2026-039",
          "Excel ve IFC içe aktarma: dikdörtgen ve boru kesitlerde Iy ile Iz yer değiştirmişti (20 × 40 bir konsol 4 kat fazla esnek, 40 × 20 bir konsol 4 kat fazla rijit)",
          "Yüksek",
          "Bir sonraki sürümde düzeltildi"
        ],
        [
          "SA-2026-040",
          "ACI 318 ve EN 1992 kontrolleri: betonarme çubuklar burulmaları kontrol edilmeden geçiyordu",
          "Yüksek",
          "Bir sonraki sürümde sınırlandırıldı"
        ],
        [
          "SA-2026-041",
          "Betonarme kolonlar: en büyük moment yalnızca en büyük basınçla kontrol ediliyordu",
          "Yüksek",
          "Bir sonraki sürümde düzeltildi"
        ],
        [
          "SA-2026-042",
          "2B burkulma: ekseni boyunca yük altında basıncı boyunca artan çubukların katsayısı yüksek çıkıyordu (tek çubukta +%43 ile +%68)",
          "Yüksek",
          "Bir sonraki sürümde düzeltildi"
        ],
        [
          "SA-2026-043",
          "Harmonik analiz: bir mod diğerlerinden çok daha yumuşak olduğunda atlanan modların düzeltmesi basamaklarını kaybediyordu (bir örnekte 2,3 Hz'de 79 kat)",
          "Yüksek",
          "Bir sonraki sürümde düzeltildi"
        ],
        [
          "SA-2026-044",
          "2B plastik göçme: göçme katsayısı düğüm numaralandırması, çubuk yönü ve birimlerle değişiyordu (aynı yapıda 4,6 kata kadar)",
          "Yüksek",
          "Limit analizi bir sonraki sürümde düzeltildi; 2B plastik göçme #758 kapanana kadar geri tutuluyor"
        ],
        [
          "SA-2026-045",
          "3B plastik göçme: kullanılabilir plastik momenti olmayan bir çubuk hiç akmayan bir çubuk gibi ele alınıyordu (bir örnekte 6 kat yüksek ve sertifikalı)",
          "Yüksek",
          "Bir sonraki sürümde düzeltildi"
        ],
        [
          "SA-2026-046",
          "Harmonik analiz: modal süperpozisyon ile doğrudan çözüm arasında yüke göre seçim yapıyordu; süperpozisyon ve karşılıklılık bozuluyordu (bir örnekte bir düğümde %107); 5 Kasım 2026'dan düzeltmeye kadar stabileo.com ve main dalının motor/WASM derlemeleri",
          "Yüksek",
          "Bir sonraki sürümde düzeltildi"
        ],
        [
          "SA-2026-047",
          "Kabuklar: mesnet yer değiştirmesi zorlayan bir yük durumu kabuk gerilmelerini kaybediyor, kombinasyonlar ve zarflar yalnızca diğer durumlarınkini topluyordu (güvensiz tarafta kalabiliyordu, uyarısız); 0.2.0 ile 0.4.0 arası",
          "Yüksek",
          "Bir sonraki sürümde düzeltildi"
        ],
        [
          "SA-2026-048",
          "CIRSOC 301 çelik: Cb, çubuktan kısa beyan edilen desteksiz boyun uçlarındaki işaret değişimini görmüyordu (çift eğrilikteki bir U profil 1 yerine Cb = 2,55 aldı, yanal burulmalı burkulma kapasitesi olduğundan yüksek çıktı); 0.2.0 ile 0.5.0 arası, masaüstü alfa sürümleri ve 8 Kasım 2026'ya kadar stabileo.com",
          "Yüksek",
          "0.5.0'dan sonra düzeltildi; 8 Kasım 2026'dan beri stabileo.com'da"
        ],
        [
          "SA-2026-049",
          "Aynı serbestlik derecesinde pozitif yay ve rijit kısıt bulunan mesnetler: 3D’de yay kısıtı kaldırıyor ve sınır koşulunu değiştiriyordu; 0.2.0 ile 0.5.0 arasındaki motor kodu",
          "Yüksek",
          "0.5.0'dan sonra düzeltildi; 9 Kasım 2026'dan beri stabileo.com'da"
        ],
        [
          "SA-2026-050",
          "Burkulma başarısız narinlik hesabını sıfıra dönüştürebiliyor ve yük durumu analizleri başarılı sonuç içinde sonlu olmayan değerler döndürebiliyordu",
          "Orta",
          "0.5.0'dan sonra düzeltildi; 9 Kasım 2026'dan beri stabileo.com'da"
        ],
        [
          "SA-2026-051",
          "3D hareketli yükler: zarflar, çubuk içindeki kesit tesiri tepe değerlerini atlıyor ve eğimli çubuklarda dingil ağırlığının eksenel bileşenini kaybediyordu; talep uyarı verilmeden düşük hesaplanabiliyordu; 0.2.0 ile 0.5.0 arası ve desktop-v0.1.0-alpha.1 ile alpha.3 arası",
          "Yüksek",
          "0.5.0'dan sonra düzeltildi; 9 Kasım 2026'dan beri stabileo.com'da"
        ],
        [
          "SA-2026-052",
          "Motorun 2D ve 3D hareketli yükleri: kalıcı kısmi eksenel yayılı yükler içeren eksenel kuvvet zarfları, örnekleme noktaları arasındaki yük bölgesi sınırlarında uç değerleri atlayabiliyordu; talep uyarı verilmeden düşük hesaplanabiliyordu; yayımlanmış sürümler için bir sınır ileri sürülmüyor",
          "Yüksek",
          "0.5.0'dan sonra düzeltildi; 9 Kasım 2026'dan beri stabileo.com'da"
        ],
        [
          "SA-2026-053",
          "2D ve 3D hareketli yükler: çubuk uçlarındaki tekil yükler, çubuk dışındaki kuvvetleri zarflara dahil ederek yapay eksenel kuvvet ve kesme kuvveti uç değerleri ekliyor ve talebi yüksek hesaplıyordu; yayımlanmış sürümler için bir sınır ileri sürülmüyor",
          "Düşük",
          "0.5.0'dan sonra düzeltildi; 9 Kasım 2026'dan beri stabileo.com'da"
        ],
        [
          "SA-2026-054",
          "Doğrusal analiz, çözümlenemeyen rijitlik veya PCG tarafından atlanan yük bileşenleri nedeniyle uyarı vermeden hatalı sonuçlar döndürebiliyordu",
          "Yüksek",
          "Taslak: düzeltme henüz birleştirilmedi veya yayınlanmadı"
        ],
        ["SA-2026-055", "2B ve 3B P-Delta, çerçeve çubuğu boyunca yayılı veya tekil yükler altında eksenel kuvvet değiştiğinde büyütmeyi düşük gösterebilir ve kararlı sonuç bildirebilirdi", "Yüksek", "Taslak: düzeltme henüz birleştirilmedi veya yayınlanmadı"],
        [
          "SA-2026-056",
          "Çerçeve, kabuk ve kısıt içeren 3B modeller: harmonik ve zorlanmış zaman geçmişi sonuçları eşdeğer tanımlamalarda değişiyor; saklanan modelin ötesindeki kapsam belirlenmedi",
          "Yüksek",
          "Taslak: çözülmedi; hiçbir düzeltme birleştirilmedi veya yayımlanmadı"
        ],
        [
          "SA-2026-057",
          "Plastik sertifika gösterimi sertifikalı aralığın dışındaki katsayıları içeride olarak gösterebiliyordu; kesin mekanizma çıkarımı PR #1888’in düzeltme öncesi derlemelerinde kaynak sınırı retlerini kaybediyordu",
          "Orta",
          "Taslak: düzeltme henüz birleştirilmedi veya yayınlanmadı"
        ],
        [
          "SA-2026-058",
          "3000’den fazla bağımsız serbestlik derecesine sahip büyük 2D/3D harmonik modeller, q ≤ 1/16 aralığı dışında atlanan modların hatalı yanıtlarını kesme uyarısının kapsamadığı frekanslarda koruyabiliyordu (hedef yanıtında ölçülen karmaşık bağıl hata: %8,079)",
          "Yüksek",
          "PR #1922 ile düzeltildi, sürüm yayını bekleniyor"
        ],
        [
          "SA-2026-059",
          "Gelişmiş web analizleri kablolara uyarı vermeden basınç direnci atayabiliyordu (P-Delta yeniden üretimi: −4,599884347090908 kN); kablolu modellerin gelişmiş analiz, doğrudan analiz ve öğretici sihirbaz sonuçlarını yeniden kontrol edin",
          "Yüksek",
          "PR #1921 ile düzeltildi, sürüm yayını bekleniyor"
        ],
        [
          "SA-2026-061",
          "Yay uzunluğu ve yer değiştirme kontrolü tepkileri atlıyor ve ölçeklenmemiş eleman yüklerini kullanıyordu; 2D/3D kısıt, Guyan, aşamalı ve zaman tanım alanı sonuçlarındaki eksiklikler de incelenmelidir. Etkilenen sonuçları yeniden hesaplayın veya bağımsız doğrulayın; 0.2.0–0.5.0 ve etkilenen sonraki main derlemeleri.",
          "Yüksek",
          "PR #1952 içinde düzeltildi, yayın bekleniyor"
        ],
        ["SA-2026-060", "Aşamalı analiz, birim değişiminden sonra veya mesnet yaylı mafsallı uçlarda gerçek dönmeleri uyarı vermeden sertleştirebiliyordu; serbestlik içeren aşamalı modelleri yeniden kontrol edin", "Yüksek", "Taslak: yerel düzeltme inceleme ve yayın bekliyor"],
        ["SA-2026-062", "Ham 3D plastik analiz, başlangıç elastik durumu çözülemediğinde uyarısız sıfır bildirebiliyordu; eski sertifikalı sürümler bu katsayıyı koruyordu. Main artık uyarıyla pozitif sertifikalı sınır döndürüyor; PR #1943 başlangıç reddini iletiyor", "Yüksek", "Taslak: yerel düzeltme inceleme ve yayın bekliyor"],
        ["SA-2026-063", "Kısıtlı aşamalı ve doğrusal olmayan analizler tanımlı ana düğüm hareketini kaybediyordu; kablo ve zaman tanım alanı analizleri artık desteklenmeyen mesnet hareketlerini reddediyor. Mevcut genel dinamik uyarıları bu eksikliği belirtmiyordu", "Yüksek", "PR #2009 ile düzeltildi, sürüm yayını bekleniyor"],
        ["SA-2026-064", "Çelik Cb katsayısı başka bir birleşimden veya yanal mesnet konumları bilinmeyen kısa bir aralıktan alınabiliyordu (#1316, #2088). CIRSOC 301 çelik kontrollerini yeniden çalıştırıp eğilme kapasitesini, etkileşim kullanım oranını ve belirleyici birleşimleri inceleyin.", "Yüksek", "0.6.1 sürümünde düzeltildi"],
        ["SA-2026-065", "Eğimli alıcı çatıda kot farkındaki kar birikimi atlanabiliyordu (#2082). CIRSOC 104 kar yüklerini yeniden üretip etkilenen analizleri ve tasarım kontrollerini yeniden hesaplayın.", "Yüksek", "0.6.1 sürümünde düzeltildi"],
        ["SA-2026-066", "Mesnetler arasında enine yük varken beton Cm katsayısına uç momentlerinden azaltma uygulanabiliyordu (#2089). Narin kolon ve perdeleri, büyütülmüş momentleri ve donatıyı yeniden kontrol edin.", "Yüksek", "0.6.1 sürümünde düzeltildi"],
        ["SA-2026-067", "Plandaki dönme üretilen kar yüklerini değiştirebiliyordu (#2093). Gerçek çatı geometrisiyle yükleri yeniden üretip analizleri ve kontrolleri tekrarlayın; eski modeli geri döndürmek sonuçları düzeltmez.", "Yüksek", "0.6.1 sürümünde düzeltildi"],
        ["SA-2026-068", "Burulma kontrolü yetersiz tasarlanmış etriyelerle başarılı olabiliyordu (#2141). Beton kontrollerini yeniden çalıştırıp gerçek enine kapasiteyi, etriye aralığını ve burulma başarısızlıklarını inceleyin. Kontrol edilmemiş boyuna donatı, başarılı bir donatı kafesi anlamına gelmez.", "Yüksek", "0.6.1 sürümünde düzeltildi"],
        ["SA-2026-069", "Burulma kesit sınırı eşzamanlı ikincil kesmeyi atlıyordu (#2142). Betonarme tasarımlarını yeniden çalıştırın, kesit hatalarını ve eksik etriyeleri inceleyin; etriye eklemek aşılmış kesit sınırını gidermez.", "Yüksek", "Taslak 2026-11-15; PR #2169 ile düzeltildi, birleştirme ve yayın bekleniyor"],
        ["SA-2026-070", "Eleman içi sehim ve dönme, eleman yüklerini atlıyordu (#2143). Tam ve kısmi trapez yükler dahil deforme şekilleri, eğitim okumalarını ve çelik/beton kullanılabilirlik kontrollerini inceleyin. Yeterli EI olmadan yüklü elemanın hesabı artık açıkça reddedilir.", "Yüksek", "PR #2170 içinde düzeltildi, yayın bekleniyor"],
        ["SA-2026-072", "Çatı kenarlarının eşit olmayan bölünmesi mahyayı kaydırıp üretilen kar yüklerini değiştirebiliyordu (#2144). Kar yüklerini yeniden üretip analizleri, birleşimleri ve kontrolleri tekrarlayın. Kayıtlı yükleri yalnızca yeniden çözmek yükleri düzeltmez.", "Yüksek", "PR #2175 ile düzeltildi, yayın bekleniyor"],
