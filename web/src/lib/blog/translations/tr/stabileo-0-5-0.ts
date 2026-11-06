import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.5.0: yirmi güvenlik bildirimi daha ve açık her hata için uyarı ya da ret",
  "excerpt": "0.4.0’dan bu yana neler değişti: yanlış ya da güvensiz tarafta sonuç verebilecek yirmi kusur düzeltildi ve güvenlik bildirimi olarak belgelendi; hâlâ açık olan her kusur için bir uyarı ya da ret geldi; Basic’te adım adım ders eklendi; uygulama artık altı dilde.",
  "blocks": [
    {
      "k": "p",
      "t": "0.4.0’dan bu yana Stabileo’yu aynı anda birkaç yönden kontrol etmeye devam ettik: çözücüyü yayımlanmış çözümlere ve başka programlara karşı, tasarım kontrollerini çözümlü örneklere karşı, aynı yapıyı yeniden numaralandırılmış, ölçeklenmiş ve taşınmış hâlleriyle ve önceki sürümlerin kaydettiği dosyaları. Bu çalışma, yanlış ya da güvensiz tarafta sonuç verebilecek yirmi kusur daha ortaya çıkardı. Hepsi düzeltildi ve her biri için neyin yanlış olduğunu, kimi etkilediğini ve neyin yeniden kontrol edilmesi gerektiğini anlatan bir bildirim var."
    },
    {
      "k": "note",
      "t": "stabileo.com her değişikliği birleştirildiği anda yayına alır; bu yüzden bu düzeltmelerin çoğu zaten canlıdır, her biri birleştirildiği günden beri. Kendilerini ilgilendiren bir değişiklikten önce kaydedilmiş projeler, açıldıklarında okuyucunun dilinde yeniden kontrol edilmeyi ister. Bir düzeltme bunu yapamaz: #1295’ten önce 3B’den kesilmiş bir 2B model uyarısız açılır, çünkü yanlış olan modelin kendisiydi (SA-2026-035). Modeli 3B’den yeniden kesin ya da 3B’de çözün."
    },
    {
      "k": "h",
      "t": "Projelerinizi yeniden çözün"
    },
    {
      "k": "p",
      "t": "Bir tasarım sonucunu en çok değiştiren durumlar bunlardır. Her bildirimde çözümlü örnek ve daha önce teslim ettiğiniz sonuçlarla ilgili ne yapılması gerektiği yer alır."
    },
    {"k": "img", "base": "blog/release-050-recheck-de", "w": 1600, "h": 1000, "alt": "Almanca Stabileo Basic, örneklerden en son 15 numaralı sonuç sürümüyle çözülmüş bir düzlem çerçeveyi açarken. Yeniden kontrol uyarısı, çerçeveyi ilgilendiren değişiklikleri her birinin Almanca başlığı ve açıklamasıyla listeliyor ve devam etmeden ya da analizi yeniden çalıştırmadan önce okunduklarının işaretlenmesini istiyor.", "caption": "Yeniden kontrol uyarısı artık her değişikliği altı dilin hepsinde açıklıyor: burada Almanca."},
    {
      "k": "table",
      "caption": "0.5.0 düzeltmelerinden bazıları, her bildirimin belgelediği şekliyle ve her birini getiren sonuç sürümüyle; SA-2026-035’in sürümü yok, bu yüzden tek duyurusu bildirimidir.",
      "head": [
        "Bildirim",
        "Sonuç sürümü",
        "Yanlış olan neydi",
        "Önem derecesi"
      ],
      "rows": [
        [
          "SA-2026-029",
          "7",
          "3B tasarım kontrolleri yanal momenti veya yanal kesme kuvvetini okuyordu: Mz etrafında eğilen bir CIRSOC 201 kolonu yüksekliği boyunca kontrol ediliyordu; bir örnekte gerekenden %36 az donatı",
          "Kritik"
        ],
        [
          "SA-2026-028",
          "8",
          "EN 1992-1-1 eğilme hesabı çekme donatısının aktığını varsayıyordu: MRd %22’ye kadar yüksek",
          "Yüksek"
        ],
        [
          "SA-2026-030",
          "12",
          "CIRSOC 301 basınç: Qa ≤ 0 olan bir kesite ezilme yükünün üzerinde bir kapasite veriliyordu ve kesit kontrolden geçiyordu",
          "Yüksek"
        ],
        [
          "SA-2026-041",
          "19",
          "Betonarme kolon kontrolü en büyük momenti yalnızca en büyük basınçla eşleştiriyordu: bir örnekte %15’e kadar güvensiz tarafta",
          "Yüksek"
        ],
        [
          "SA-2026-042",
          "23",
          "2B burkulma, basınç kuvveti boyları boyunca artan çubukların çarpanını olduğundan büyük hesaplıyordu: bir çubuk için +%43 ile +%68 arası",
          "Yüksek"
        ],
        [
          "SA-2026-038",
          "35",
          "3B burkulma her çubuğun ortalama eksenel kuvvetini kullanıyordu: ekseni boyunca yük taşıyan bir çubuğun katsayısında +%43",
          "Yüksek"
        ],
        [
          "SA-2026-043",
          "32",
          "Bir mod diğerlerinden çok daha yumuşak olduğunda harmonik analiz, dahil edilmeyen modların düzeltmesini kaybediyordu: bir örnekte 2,3 Hz’de 79 kat",
          "Yüksek"
        ],
        [
          "SA-2026-035",
          "—",
          "3B’den 2B’ye bir kesim, çubukları yanlış kesit ekseni etrafında eğiyordu: bir Y–Z portal çerçeve 13,5 kat fazla rijit",
          "Yüksek"
        ],
        [
          "SA-2026-033",
          "20",
          "Yük üreteci, alçak bir çubuk bir katın bir kısmının üzerinde durduğunda o katın alan yükünün tamamını dışarıda bırakıyordu",
          "Yüksek"
        ],
        [
          "SA-2026-027",
          "11",
          "Kabuk zarfı her bileşenin uç değerini değil, en büyük Von Mises değerine sahip kombinasyonu tutuyordu: bir örnekte mx %14 düşük",
          "Yüksek"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Diğer bildirimler şunları kapsar: ACI 318 ve EN 1992’ye göre burulmalı betonarme çubuklar (SA-2026-040), Y–Z veya X–Y düzleminden 2B’ye kesilen bir modelin kısıtları (SA-2026-036), büyük dönmelerle 3B eş dönen (co-rotational) analiz (SA-2026-037), zaman tanım alanında analizde kütlesiz bir düğüme t = 0 anında etkiyen yük (SA-2026-031), modal analizde bir mekanizmanın sıfır modu (SA-2026-032), analizden sonraki raporun denge kontrolü (SA-2026-034), #758 düzeltilene kadar reddedilmeye devam eden 2B plastik göçme analizi (SA-2026-044), kullanılabilir plastik momenti olmayan bir çubuk içeren ve artık reddedilen 3B plastik göçme analizi (SA-2026-045) ve hesap motorunu doğrudan çağıranlar için AISC 360 ve EN 1993’e göre kesme alanı verilmemiş çelikte kesme (SA-2026-025 ve 026)."
    },
    {
      "k": "h",
      "t": "Sonuçları değiştiren diğer değişiklikler"
    },
    {
      "k": "p",
      "t": "Bunlar bildirimi olan kusurlar değildir, ama sayıları değiştirirler; bu yüzden her biri yeniden kontrol uyarısında yer alır:"
    },
    {
      "k": "ul",
      "items": [
        "Bir çubuğun belirleyici değeri ve 2B zarf, 21 hesap noktasının en yakınını değil, diyagramın gerçek tepe değerini okur: belgelenen durumlarda üçgen yük altında %0,23, kısa bir kısmi yük altında %1,05 artabilirler ve hiçbir zaman azalmazlar.",
        "Mekanizmalar çözülmek yerine reddedilir: 2B’de rijit bir bağlantının veya bir diyaframın arkasında, 2B’de bir bağlayıcının arkasında (#1415) ve önceden sıfır modu atıp diğer modları eksiksizmiş gibi döndüren modal analizde.",
        "Tekrarlanan özdeğerler katlılıklarını korur; statik ve modal sonuçlar gösterilmeden önce kendi dengelerini ve ortogonalliklerini kontrol eder.",
        "Basic’te P-Δ ve kritik yük her çubuğu elemanlara böler, plastik göçme analizi yükü boşalan mafsalları kapatır ve eğilme momentinin tesir çizgisi, Basic’teki diğer her moment gibi, alt lifi çeken momenti pozitif alır.",
        "Değerlendirilemeyen bir tasarım kontrolü geçmek yerine reddedilir; model çok daha rijit bir kısım içerdiğinde yumuşak ama gerçek bir düğüm dönmesi artık kilitlenmez.",
        "Doğrusal analiz, bir dönme 0,1 rad’ı geçtiğinde ve basınç momentlerini %10’dan fazla büyütebildiğinde uyarır; bu ikinci uyarı gösterildiği sürece CIRSOC 301 kontrolleri bekletilir. Uyardığı yerde doğrusal olmayan ya da P-Δ analizi çalıştırın."
      ]
    },
    {
      "k": "h",
      "t": "Her düzeltme gelene kadar uyarı veya ret"
    },
    {
      "k": "p",
      "t": "Yanlış sonuç verebilecek her açık kusur artık mühendise ulaşabileceği her noktada bir uyarı veya ret taşıyor (#807). Uyarı sonucu korur ve kusuru sonucun yanında adıyla anar; ret sonucu alıkoyar ve nedenini söyler. Depodaki bir kayıt, açık her güvenlik kusurunu uyarısı veya reddi, onu tetikleyen koşul ve tetiklendiğini kanıtlayan testle birlikte listeler; bir test de bu kaydı hesap motoruyla uyumlu tutar."
    },
    {
      "k": "ul",
      "items": [
        "Reddedilenler: numaralandırmaya, çubukların yönüne ve birimlere göre 4,6 kata kadar değişebilen 2B plastik göçme çarpanı (#758); kendi sertifikasının sınırları dışındaki bir burkulma çarpanı (#741); düzlem içinde belirgin eğilme altındaki çarpık ağlarda MITC4 kabuklar (#798); ve burulmuş geometride MITC4 ve MITC9 kabuklar (#1057).",
        "Uyarılanlar: diğerlerinin yanı sıra zaman tanım alanında analiz, 3B modal süperpozisyon, neredeyse tekil modeller, temas, malzeme bakımından doğrusal olmayan analiz ve eşit olmayan rijitliklere sahip bağlayıcılar.",
        "Reddettikleri dışında, açık kusurlara karşı bu koruma tek bir sayıyı değiştirir: mesnet çökmesi verilmiş ve çökme doğrultusunda ayrıca bir yay taşıyan bir mesnedin 2B tepkisi artık o yayın kuvvetini de içerir. Sonuç derlemindeki 145.515 değerin geri kalan hepsi aynıdır."
      ]
    },
    {
      "k": "note",
      "t": "İki ret, bazı okuyucuların kullandığı sonuçları ortadan kaldırıyor. Düzlem çerçevelerin plastik göçme çarpanları #758 düzeltilene kadar alıkonuyor. Sonuçları referanslarının %2’si içinde kalan bazı çarpık kabuk ağları da alıkonuyor: uyarısız gösterilen yanlış bir rijitlik yerine fazladan bir reddi seçtik; bu reddin kapsamını daraltmak yol haritasında."
    },
    {
      "k": "h",
      "t": "0.5.0’da ayrıca"
    },
    {
      "k": "ul",
      "items": [
        "Basic yapı analizini adım adım öğretiyor: statik, kuvvet ve yer değiştirme yöntemleri, tesir çizgileri, ikinci mertebe ve burkulma, plastik analiz ve dinamik; her biri uygulamada adım adım açıklanıyor. Plastik göçme ünitesi, #758 düzeltilene kadar 2B plastik göçme analizinin geri kalanıyla birlikte geri tutuluyor.",
        "Uygulama ve herkese açık site İspanyolca, İngilizce ve Portekizcenin yanında Almanca, Fransızca ve Türkçe. Yeniden kontrol uyarısı her değişikliği altı dilin hepsinde açıklıyor.",
        "PRO: ana katlar ve benzer katlar, asal momentler ve asal doğrultularla birim genişlik başına plak sonuçları, analizden sonra rapor, “Çoğalt ve düzenle” seçeneği olan salt okunur bir görüntüleyici ve 3B referans olarak çizilen bağlantılı bir IFC.",
        "0.2.0, 0.3.0 ve 0.4.0 ile kaydedilmiş dosyalar her değişiklikte açılır, yeni biçime taşınır ve kayıtlı bir sonuç değişikliğinin geçerli olduğu durumlar dışında aynı sonuçları verir; daha yeni bir sürümle kaydedilmiş bir dosya, bunu belirten bir mesajla reddedilir.",
        "Ölçeklenen, yeniden numaralandırılan, ters çevrilen veya taşınan aynı yapı aynı cevabı vermelidir; bu, her değişiklikte 17 analiz türünde ve her gece üretilen 8.192 modelde kontrol edilir.",
        "Stabileo Research ve Stabileo Tools: yayımlanmış makalelerin ve kıyaslama problemlerinin çalıştırılabilir yeniden üretimleri, üç hakemli bir incelemeden sonra gözden geçirildi; aynı hesap motorunda çalışan ücretsiz hesaplayıcılar da var."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Bildirimler nasıl işler ve ilk yirmi dördü:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Güvenlik bildirimleri dizini",
      "t": "Önem derecesi, ilgili issue kaydı ve düzeltmesiyle her bildirim:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/CHANGELOG.md",
      "label": "Değişiklik günlüğü",
      "t": "Teknik kaydın tamamı:"
    }
  ]
};

export default body;
