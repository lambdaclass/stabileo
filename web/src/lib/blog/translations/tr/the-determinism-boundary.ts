import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Determinizm sınırı: bir YZ ajanı neden hesabı kendisi yapmamalı",
  "excerpt": "Bir dil modeli bir sayının doğru olduğunu garanti edemez. Yapı mühendisliği için önerdiğimiz mimaride ajan yorumlar ve önerir; her sayı ise doğrulanmış bir çözücüden gelir.",
  "blocks": [
    {
      "k": "p",
      "t": "Onlarca yıllık ticari yazılım, yapı analizinin salt sayısal kısmını hızlı hale getirdi. Bir rijitlik matrisini kurmak ve doğrusal bir sistemi çözmek iyi anlaşılmış ve hesaplaması ucuz bir problemdir. Mühendisin zamanı başka yerlere gider: modeli kurmaya, mimari her değiştiğinde yeniden kurmaya, yükleri ve kombinasyonları tanımlamaya, her elemanı yönetmeliğe göre kontrol etmeye, hesap raporunu ve çizimleri hazırlamaya."
    },
    {
      "k": "p",
      "t": "Darboğaz, hesabın etrafındaki bu el emeğidir. Modeli kurmak, değiştirmek, kontrol etmek ve belgelemek, bir YZ ajanının yardımcı olabileceği yerdir; tek bir koşulla: hesabın kendisine asla dokunmamalıdır."
    },
    {
      "k": "h",
      "t": "Bir dil modelinin garanti edemediği şey"
    },
    {
      "k": "p",
      "t": "Bir dil modeli metni olasılıksal olarak üretir. Fizik ya da gerçek sistemlerin nasıl davrandığı hakkında bilgisi yoktur ve halüsinasyon görebilir: makul görünen ama hiçbir anlamı olmayan cevaplar üretebilir. Yapı analizinde bu risk somuttur. Modelleme uzamsal akıl yürütme ve topolojik tutarlılık gerektirir; bir model birkaç adımda kurulduğunda hatalar birikir."
    },
    {
      "k": "p",
      "t": "Yine de en güçlü kısıt meslek pratiğinden gelir. Her yapısal sonuç imzalanır ve imzayla birlikte müellifliği ve hukuki sorumluluğu taşır. Bir kolonu boyutlandıran sayı, onu onaylayan yetkili mühendisin verdiği bir taahhüttür. Kontrol edilmemiş sonuçlar teslim eden bir ajan, kimsenin doğrulamadığı bir hesabı imzalama riskini meslek insanının üzerine bırakır."
    },
    {
      "k": "quote",
      "t": "Doğruluk dilin değil, çözücünün bir özelliği olmalıdır."
    },
    {
      "k": "h",
      "t": "Determinizm sınırı"
    },
    {
      "k": "p",
      "t": "Mimari, doğal dilde akıl yürütmeyi sayısal hesaptan ayırır. Ajan tasarımlar ve senaryolar önerir, ancak bir sonuç ancak ajanın değiştiremediği ve problemin fiziğini kodlayan bir programdan çıktığında geçerli sayılır. Model hangi deterministik aracı hangi parametrelerle çağıracağını seçer ve aracın döndürdüğü sonuçla çalışır. Asla kendi başına bir sayı üretmez ve asla geometri uydurmaz."
    },
    {
      "k": "p",
      "t": "Uygulamada bu üç katman gerektirir. Niyet katmanı ajandır: doğal dili yorumlar, netleştirici sorular sorar ve tipli eylemler üretir. Deterministik hesap katmanı mühendislik verisi üreten her şeyi barındırır: çözücüyü, yönetmelik kontrollerini yapan CIRSOC modüllerini ve bir yapı tipolojisini eksiksiz bir modele açan üreteçleri. Belgeleme katmanı ise önceden hesaplanmış sonuçlardan raporları, çizimleri ve metrajları üretir."
    },
    {
      "k": "p",
      "t": "Bu yeni bir örüntü değildir. Mühendislik ajanları üzerine son dönem literatüre hâkimdir ve komşu alanlarda da görülür: kodlama ajanları, bir derleyici ve bir test takımı onlara kodun derlenip derlenmediğini ve testleri geçip geçmediğini söylediği için işe yarar; AlphaProof ise biçimsel bir doğrulayıcı hiçbir hatanın geçmesine izin vermediği için teorem ispatlar. Biz bunu bilinçli olarak bir tasarım ilkesi olarak benimsiyoruz."
    },
    {
      "k": "h",
      "t": "Sınırın garanti ettikleri ve dışında kalanlar"
    },
    {
      "k": "p",
      "t": "Bu sınırın neyi garanti ettiği ve neyi dışarıda bıraktığı konusunda net olmak işe yarar. Garanti ettikleri:"
    },
    {
      "k": "ul",
      "items": [
        "Ajanın belirttiği her sayı, belirli bir çözücü sonucuna kadar izlenebilir: kombinasyon, istasyon, eleman.",
        "Her YZ çıktısı içe aktarılmadan önce model şemasına göre doğrulanır; hatalı biçimliyse veya bilinmeyen alanlar içeriyorsa reddedilir.",
        "YZ hizmeti çalışmıyorsa çözücü, düzenleyici ve yönetmelik kontrolleri çalışmaya devam eder."
      ]
    },
    {
      "k": "p",
      "t": "Garanti etmedikleri: idealleştirilmiş modelin gerçek problem için doğru model olduğu (bu bir mühendislik kararıdır), tasarımın optimum olduğu, yüklerin ve kabullerin eksiksiz olduğu veya yönetmeliğin yorumunun gözden geçirilmeye ihtiyaç duymadığı."
    },
    {
      "k": "note",
      "t": "Sınır, her sonucun nereden geldiğini kontrol etmenizi sağlar; kurduğunuz modelin gerçek problemi doğru temsil ettiğini garanti etmez. Ajan bir çizim asistanı gibi çalışır: bir değişiklik önerir, kullanıcı neyin değiştirileceğinin özetini görür ve değişikliği uygulayabilir, yeniden deneyebilir veya iptal edebilir. Uygulanan her değişiklik tek bir geri alma adımıdır."
    },
    {
      "k": "h",
      "t": "Modelin yeniden çözülmesi gereken bir durum"
    },
    {
      "k": "p",
      "t": "Mühendis 6 m açıklıklı, 4 m yüksekliğinde, ankastre ayaklı ve kirişte yayılı yük bulunan betonarme bir portal çerçeve tarif eder. Ajan eksik olanları sorar: çelik mi beton mu? Ayaklar ankastre mi mafsallı mı? Yatay yük var mı? Ardından çerçeveyi oluşturan eylemi üretir. Arka uç bunu deterministik olarak 4 düğüm, 3 eleman ve 6 serbest serbestlik derecesine sahip bir modele açar. Tasarımda H-21 beton, başlangıç için 25×40 cm kiriş, 30×30 cm kolonlar ve kirişte 30 kN/m kullanılır."
    },
    {
      "k": "p",
      "t": "Model çözüldüğünde her kolon 90 kN düşey tepki taşır ve global denge tam olarak sağlanır: ΣRz = 180 kN = q·L. Belirleyici kiriş momenti açıklık ortasında Mu = 80,8 kN·m'dir. 3Ø16 donatılı 25×40 kirişin CIRSOC 201 eğilme kontrolü φMn = 73,3 kN·m kapasite verir; dolayısıyla kiriş kontrolü sağlamaz."
    },
    {
      "k": "table",
      "caption": "Çerçeve kirişinin düzeltme öncesi ve sonrası eğilme kontrolü.",
      "head": [
        "Durum",
        "Kesit",
        "Donatı",
        "Mu [kN·m]",
        "φMn [kN·m]",
        "D/C",
        "Sağlıyor"
      ],
      "rows": [
        [
          "Başlangıç",
          "25×40 cm",
          "3Ø16",
          "80,8",
          "73,3",
          "1,10",
          "Hayır"
        ],
        [
          "Düzeltilmiş",
          "30×55 cm",
          "3Ø16",
          "105,6",
          "108,6",
          "0,97",
          "Evet"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Mu sütununa bakın. Kirişi 25×40'tan 30×55'e büyütmek talebi 80,8'den 105,6 kN·m'ye çıkarır. Hiperstatik bir çerçevede statik, uç momenti ile açıklık momentinin toplamını belirler; rijitlik yalnızca bu toplamın nasıl paylaşıldığını değiştirir. Kolonlarına göre daha rijit olan bir kiriş, kolonlardan daha az uç tutulması alır ve basit mesnetli bir kirişe daha çok benzer davranır; bu nedenle burada belirleyici olan açıklık momenti artar."
    },
    {
      "k": "quote",
      "t": "Etkiyi yeniden çözmeden tahmin eden bir ajan yanılırdı ve yanılırken de aynı derecede ikna edici görünürdü."
    },
    {
      "k": "p",
      "t": "Örnek, yeni kesitin kapasitesini yeniden hesaplamanın yanında modelin neden yeniden çözülmesi gerektiğini gösteriyor. Hiperstatik bir yapıda bir kesiti büyütmek iç kuvvetlerin dağılımını değiştirir ve talep, tam da rahatlatmak istediğiniz çubukta artabilir."
    },
    {
      "k": "h",
      "t": "Tasarımı tamamlanmış bir binadan kolon kaldırmak"
    },
    {
      "k": "p",
      "t": "İkinci durum dört adet 5 m açıklıklı ve üç adet 3 m katlı, ankastre ayaklı, 25×50 cm kirişli (4Φ16), 35×35 cm kolonlu ve her kirişte 25 kN/m yük bulunan bir çerçeveden başlar: 20 düğüm, 27 eleman ve 45 serbest serbestlik derecesi. Çözülüp kontrol edildiğinde tüm kirişler rahatlıkla sağlar."
    },
    {
      "k": "p",
      "t": "Mimari bir değişiklik zemin kattaki bir iç kolonu kaldırır. Düzenleme eylemi kolonu yapısal bütünlük doğrulamasıyla siler ve model yeniden çözülür; global denge öncesinde ve sonrasında sağlanır (ΣRz = 1500 kN). O kolonun taşıdığı kirişler artık 10 m açıklık geçer ve üstlerinde aynı aksta bulunan kirişlerle birlikte kaybedilen mesnedi üstlenir. Altı kiriş D/C = 1 değerini aşar."
    },
    {
      "k": "table",
      "caption": "Binanın belirleyici kirişi, üç durumda.",
      "head": [
        "Durum",
        "Kesit",
        "Mu [kN·m]",
        "φMn [kN·m]",
        "D/C",
        "Sağlıyor"
      ],
      "rows": [
        [
          "Hasarsız",
          "25×50 (4Φ16)",
          "54,2",
          "125,3",
          "0,43",
          "Evet"
        ],
        [
          "Kolon kaldırılmış",
          "25×50 (4Φ16)",
          "203,9",
          "125,3",
          "1,63",
          "Hayır"
        ],
        [
          "Yeniden boyutlandırılmış",
          "30×65 (5Φ20)",
          "189,8",
          "313,7",
          "0,61",
          "Evet"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Belirleyici kirişin momenti neredeyse dört katına çıkar. Etkilenen kirişlerde 30×65 cm ve 5Φ20 ile yeni bir çözümden sonra tüm kirişler yeniden sağlar. Bu durum, elle yapıldığında birçok çubuğun yeniden modellenmesini, yeniden analiz edilmesini, yeniden kontrol edilmesini ve yeniden detaylandırılmasını gerektiren bir değişikliğin, her sayı çözücüye kadar izlenebilir ve mühendisin onayına tabi olarak kısa bir konuşmayla halledilebileceğini de gösteriyor."
    },
    {
      "k": "h",
      "t": "Sınırın arkasındaki dört tasarım kararı"
    },
    {
      "k": "ol",
      "items": [
        "Serbest biçimli kod üretimi yerine tipli eylemler. Daha önceki birkaç sistemde model, daha sonra harici bir çözücüye karşı çalıştırılan Python betikleri yazar. Burada ajanın çıktısı, açık girdi ve çıktı sözleşmelerine sahip kapalı bir çağrı kümesiyle sınırlıdır; her çağrı çalışmadan önce bir şemaya göre doğrulanır. Bu sınır, rastgele koddan daha dardır ve denetlenmesi daha kolaydır.",
        "Başkasınınkinin üzerine kurulmuş bir katman yerine kendi çözücümüz. Motor, harici doğrusal cebir bağımlılıkları olmadan Rust ile sıfırdan yazılmıştır ve analitik çözümlere ve referans karşılaştırma problemlerine karşı kendi doğrulama takımına sahiptir: geçen yaklaşık 6.800 test, ayrıca aynı modeller üzerinde ticari bir programla %0,1'in altında farklarla karşılaştırmalar.",
        "Yerleşik yönetmelik uyumu. CIRSOC 201 ve 301'e göre kontroller; bunları hiçbir açık kaynak yazılımda yerleşik olarak uygulanmış bulamadık. Beton modülü uygulanmış ve test edilmiştir; çelik modülü ise hâlâ yalnızca ön uçta yer alır ve özel bir test takımı yoktur. Olgunluğunu abartmamak için bunu açıkça söylüyoruz.",
        "Tarayıcıda çalışır. Motor WebAssembly'ye derlenir ve kullanıcının bilgisayarında yerel olarak çalışır; hesap sunucusu yoktur ve kurulacak bir şey yoktur."
      ]
    },
    {
      "k": "note",
      "t": "Güncelleme, 20 Ekim 2026: 0.2.0 sürümünden bu yana motor her CIRSOC 301 çelik kontrolünü yeniden yapar (doğrulamadığı bir sonuç sağlamıyor veya doğrulanmamış olarak gösterilir) ve modül yayımlanmış çözümlü örneklere karşı test edilir; bağımsız bir incelemeye kadar deneysel olarak etiketli kalırlar. Bu yazıdaki değerler, yayımlanmış makalenin değerleridir; Ağustos 2026 sürümüyle, beton kontrollerindeki 0.2.0 düzeltmelerinden (SA-2026-002 bildirimi) önce hesaplanmıştır ve orada göründükleri gibi aktarılmıştır."
    },
    {
      "k": "h",
      "t": "Test edilmiş bir çözücüden ispatlanmış bir çözücüye"
    },
    {
      "k": "p",
      "t": "Sınır, ajanın yaptığı her iddianın bir çözücü çıktısına kadar izlenebileceğini garanti eder. Bu garanti bir sınırı da devralır: çözücü kapsamlı biçimde test edildiği için güvenilirdir, ancak doğruluğu biçimsel olarak ispatlanmamıştır. Bir test takımı, ne kadar kapsamlı olursa olsun, yalnızca yazarlarının aklına gelen durumları kapsar."
    },
    {
      "k": "p",
      "t": "Bu bağlamda bu durum daha da önemlidir. Bir ajan modeller kurar, onları birkaç adımda değiştirir ve yeni eylemler önermek için sonuçları okur; bu süreçte çözücü, motora ulaşmadan önce hiçbir mühendisin gözden geçirmediği girdiler alır. Motor bir sınır durumda hatalı davranırsa (neredeyse tekil bir rijitlik matrisi, dejenere bir geometri, aşırı bir yük kombinasyonu), ajan bu sonucu hiçbir uyarı olmadan aktarabilir."
    },
    {
      "k": "p",
      "t": "İki teknik bu açığı daraltabilir. Özellik tabanlı fuzzing, binlerce geçerli rastgele model üretir ve her girdi için sağlanması gereken değişmezleri kontrol eder:"
    },
    {
      "k": "ul",
      "items": [
        "Global denge: geometri, malzeme veya mesnetlerden bağımsız olarak ΣR = P.",
        "Rijitlik matrisinin simetrisi: yapısı gereği K = Kᵀ.",
        "Mekanizması olmayan her yapı için K'nın pozitif tanımlılığı.",
        "Rijit cisim dönüşümleri altında değişmezlik: bir modeli ötelemek veya döndürmek iç kuvvetleri değiştirmez."
      ]
    },
    {
      "k": "p",
      "t": "Biçimsel doğrulama aynı açığa diğer taraftan yaklaşır: bu özelliklerin matematiksel bir tanımını yazmak ve Lean 4 gibi bir ispat asistanıyla uygulamanın bu tanımı sağladığını ispatlamak. Test hataları bulabilir; biçimsel doğrulama ise tanımlanan alan içinde hata bulunmadığını gösterebilir. İkisi birbirini tamamlar: fuzzer bir özelliği bozan bir girdi bulduğunda, o özellik bir ispat için aday haline gelir."
    },
    {
      "k": "note",
      "t": "Hedef, kritik sayısal çekirdeği biçimsel olarak doğrulanmış bir çözücüdür. O noktada determinizm sınırı matematiksel bir garantiye dönüşür: bir hesap raporunda aktarılan her sayı, doğruluğu ispatlanmış bir hesaba kadar izlenebilir."
    },
    {
      "k": "h",
      "t": "Bugün durum ne"
    },
    {
      "k": "p",
      "t": "Son olarak, neyin kullanılabildiği ve neyin kullanılamadığı. Çözücü, düzenleyici, CIRSOC kontrolleri, eğitim modu ve rapor ve çizim üretimi bugün stabileo.com'da tarayıcıda, hiçbir kurulum ve hesap gerektirmeden çalışıyor. Ajan katmanı aktif olarak geliştiriliyor: rotaları geliştirme ve test ortamında kendi arka ucumuza karşı, diğer her şeyle aynı çözücü ve aynı sayılarla çalışıyor, ancak bu arka uç henüz herkese açık sitenin parçası değil."
    },
    {
      "k": "p",
      "t": "Ajanın insan müdahalesi olmadan önerdiği, çözdüğü, değerlendirdiği ve değiştirdiği kapalı, çözücünün döngü içinde olduğu çevrim yol haritasında yer alıyor ve henüz uygulanmadı. Yerleşik yönetmelik kapsamı CIRSOC 201 ve 301 ile sınırlı; geri kalanı gelecekteki çalışmalardır."
    },
    {
      "k": "p",
      "t": "CAD çizimin mekanik kısmını, hesap tablosu da tekrarlayan aritmetiği üstlendi; mühendislik muhakemesi ise mühendiste kaldı. Ajan bu çizgideki bir sonraki adımdır: modeli kurmayı ve değiştirmeyi, yükleri girmeyi, kontrolleri çalıştırmayı ve belgeleri hazırlamayı üstlenir. Bunların hiçbiri sorumluluğu devretmez: imzalanan sayı hâlâ mühendisindir."
    },
    {
      "k": "note",
      "t": "Bu yazı, JAIE 2026'da sunulan “Desarrollo de un agente estructural de cálculo sobre un solver verificado” (Chesta, Bertero, Carrone ve Kingston) bildirisinden uyarlanmıştır. Aktarılan değerler, o bildiriden alınmış Stabileo çözücüsünün ve CIRSOC 201 modülünün çıktılarıdır."
    }
  ]
};

export default body;
