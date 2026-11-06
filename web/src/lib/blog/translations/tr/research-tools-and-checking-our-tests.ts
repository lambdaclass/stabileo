import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Araştırma, araçlar ve testlerimizin denetlenmesi",
  "excerpt": "Son günlerde yayımladıklarımız: çalıştırılabilir araştırmalar, sekiz hesaplayıcı ve kıyaslama modellerinin kendisini denetleyen kontroller. Neler çalışıyor, neler yanlıştı ve neler hâlâ inceleme bekliyor.",
  "blocks": [
    {
      "k": "p",
      "t": "Son günlerde Stabileo Research ve Stabileo Tools’u ekledik, bunların arkasındaki kontrolleri güçlendirdik. Stabileo, Ergodic Group tarafından yayımlanan, yapay zekâ destekli, ücretsiz ve açık kaynaklı yapı mühendisliği yazılımıdır. LambdaClass grubun geliştirme koludur."
    },
    {
      "k": "h",
      "t": "Çalıştırabileceğiniz araştırmalar"
    },
    {
      "k": "p",
      "t": "Yayımlanmış yapı mühendisliği makalelerini ve klasik karşılaştırma problemlerini Stabileo’nun kendi görüntüleyicisiyle tarayıcıya taşıyoruz. Her sayfada neyi yeniden ürettiğimizi, nasıl kontrol ettiğimizi ve karşılaştırmanın sınırlarını belirtiyoruz. Karşılaştırmaları hâlâ açık olan sayfaları tamamlıyoruz."
    },
    {"k": "img", "base": "blog/research", "w": 1600, "h": 1000, "alt": "Stabileo Research sayfası, “Yapı mühendisliğinde araştırma”; bunun bir tasarım aracı değil araştırma olduğu notu ve yük yoluyla gösterilen ilk çalıştırılabilir girdi, Lee çerçevesi (1968).", "caption": "stabileo.com/research: her sayfa neyi yeniden ürettiğini ve nasıl kontrol edildiğini söylüyor."},
    {
      "k": "p",
      "t": "Yayımdaki makale sayfaları şunları kapsıyor: Shauer (2025) faz alanı kırılması; Grossman ve Boudaoud (2026) yay ağları; Andreassen ve diğerleri (2011) topoloji optimizasyonu; Ferrari ve Sigmund (2025) Roorda çerçevesinin kararlılığı; Pastrana ve diğerleri (2026) kablo ağı biçim bulma; Zmyślony, Khan ve Biggins (2026) sıçramalı kemerler; Fairclough ve diğerleri (2026) ızgara kabuklar."
    },
    {
      "k": "p",
      "t": "Motorun klasik problemleri MacNeal–Harder, kabuk test parkuru, Mattiasson elastikası, Riks/Crisfield, Newmark, CQC, plastik göçme, Navier plağı, Lee çerçevesi ve DaDeppo–Schmidt kemeridir. Sayfalar canlı hesaplama ile kayıtlı sonuçların gösterimini ayırır ve karşılaştırmanın sınırlarını belirtir. Ferrari’nin Koiter karşılaştırması tamamlanmadı; Fairclough beş düğümlü tek bir örneği kapsıyor; kemerin denge sıçraması zamana bağlı bir simülasyon değildir."
    },
    {
      "k": "p",
      "t": "Kapsamı ve kanıtları yayımlıyor, açık biçimde inceliyoruz. Araştırma sonuçları tasarım sonuçları değildir; bir karşılaştırma problemiyle uyum da sertifikasyon anlamına gelmez."
    },
    {
      "k": "table",
      "caption": "Bugün yayında:",
      "head": [
        "İçerik",
        "Sayı"
      ],
      "rows": [
        [
          "Çalıştırılabilir makale sayfaları",
          "7"
        ],
        [
          "Motor karşılaştırma sayfaları",
          "10"
        ],
        [
          "Hesaplayıcılar",
          "8"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Testlerin de denetlenmesi gerekiyor"
    },
    {
      "k": "p",
      "t": "Bazı sayfalar, test modellerimiz yanlış olduğu için yanlıştı. Her motor karşılaştırma sayfası ve motorun CI testi artık aynı vaka dosyasını okuyor; böylece model düzeltmesi ikisini de güncelliyor. Bazı geçici karşılaştırmalar CI’da açıkça devre dışı ve henüz birleştirmeleri engellemiyor; bu karşılaştırmaları tamamlıyoruz."
    },
    {
      "k": "p",
      "t": "Mattiasson referanslarını ve eksenel uzamanın ele alınışını (#845), rijit düğümlü bir çerçevenin yalnızca eksenel davranışı içeren bir kafes formülüyle karşılaştırılmasını (#846) ve yanlış kabuk mesnet ve yükleme modellerini (#810) düzelttik. Bu tür hataların bir daha gözden kaçmaması için karşılaştırma problemlerinin nasıl oluşturulduğunu değiştiriyoruz. İlk bölüm entegre edildi: her karşılaştırma problemi, birbiriyle uyuşması gereken iki bağımsız referansı ve yarım model ile tam model karşılaştırmaları dâhil uygulanan yük, tepki dengesi ve simetri için otomatik kontrolleri içeren bir şartnamedir. En az üç ağ üzerinde yakınsama kontrolü, her karşılaştırma probleminin başarısız olabildiğini kanıtlayan bir işaret hatası testi ve temel küme için mühendis onayı ekliyoruz."
    },
    {"k": "img", "base": "blog/research-mattiasson", "w": 1600, "h": 1000, "alt": "Mattiasson (1981) konsol elastika karşılaştırma sayfası, Sonuçlar sekmesi: Stabileo eğrileri ve analitik referanslar için dairelerle PL²/EI’ye karşı u/L ve v/L grafiği ve değerlerin bağıl hatalarıyla tablosu. Solda 5 kontrolden 5’inin geçtiği ve bunun bir tasarım aracı değil araştırma olduğu notu.", "caption": "Düzeltilmiş Mattiasson sayfası: motorun yanıtı iki bağımsız analitik referansa karşı."},
    {
      "k": "p",
      "t": "Birimleri de tip sistemine ekliyoruz (#864); böylece kN/N veya m/mm karışıklıkları derleme sırasında yakalanacak. 2B çerçevelerin malzeme ve kesit yolu için ilk bölüm 3 Kasım’da birleştirildi."
    },
    {
      "k": "h",
      "t": "İkinci tur: her sayfa yeniden incelendi"
    },
    {
      "k": "p",
      "t": "Ardından yayındaki her araştırma sayfası, sırayla üç yapay zekâ modelinin (önce Kimi, sonra Codex, sonra Claude) yaptığı ikinci bir incelemeden geçti ve doğrulayabildiğimiz her bulgu düzeltildi. On beş sayfa birlikte revize edilip 4 Kasım’da yayımlandı (#1068): altı makale (Shauer, Pastrana, Ferrari, Zmyślony, Grossman ve Fairclough) ve dokuz motor karşılaştırma problemi (Newmark, Riks/Crisfield, Navier, Lee, MacNeal–Harder, DaDeppo–Schmidt, Horne’a dayanan plastik göçme örneği, SRSS/CQC ve üçüncü bir turdan geçen Mattiasson). Hiçbir tolerans gevşetilmedi ve hiçbir test kaldırılmadı. Meslekte çalışan mühendislerin incelemesi ise hâlâ bekleniyor."
    },
    {
      "k": "ul",
      "items": [
        "MacNeal–Harder mutlak değerleri karşılaştırıyordu; bu yüzden işareti yanlış bir sonuç da geçerdi. Referanslar artık işaretlerini taşıyor ve bir test her vaka için ters çevrilmiş bir yanıtı reddediyor.",
        "Riks/Crisfield, yükte bir düşüş olmadan bir limit noktası bildirebiliyordu. Bir limit noktası artık yakınsamış adımlar arasında bir yük düşüşü gerektiriyor; sayfa “traces the snap-through” yerine çözümün üst limit noktasını geçtiğini söylüyor ve toleransları %5’ten 5e-3 ile 1e-5 arasındaki değerlere indi.",
        "Navier, MITC4 hatasını ölçmek yerine açıklıyordu. Artık bağımsız bir Reissner–Mindlin serisiyle karşılaştırılıyor ve sert basit mesnetli durumda MITC4 hatası 4×4’te −%1,951’den 32×32’de −%0,036’ya, ikinci mertebeden yakınsamayla düşüyor.",
        "Sayfalar neyle karşılaştırıldıklarını söylüyor. Newmark “the author’s code” ile değil, kesin kapalı form çözümlerle kontrol ediliyor; SRSS/CQC yöntemin bir gösterimi, makaledeki binanın yeniden üretimi değil; plastik göçme sınırları bir alıntı değil, elle yaptığımız kendi türetmelerimiz; Lee çerçevesinin 1,83 kN’luk referansı yayımlanmış bir şekilden okunmuş bir değer, bu yüzden yalnızca tam yüzde düzeyindeki farkları iddia ediyoruz."
      ]
    },
    {
      "k": "h",
      "t": "Telefonlarda ve tabletlerde"
    },
    {
      "k": "p",
      "t": "Canlı sitede yaptığımız ölçümlerde araştırma sayfaları telefonda taşmıyordu, ancak deney tüm makalenin altında kalıyordu, görüntüleyici sıkışıktı (kare bir plak için 356×189 px) ve her sayfada 32 px’ten küçük 25 ila 40 kontrol ile 12 px’ten küçük 14 ila 20 metin parçası vardı. Artık deney başlığın hemen ardından geliyor, görüntüleyici modele göre boyutlanıyor, kontroller en az 44 px, metin de en az 12 px (#831)."
    },
    {"k": "img", "base": "blog/research-phone", "w": 1600, "h": 1000, "alt": "Stabileo Research’in telefondaki iki ekran görüntüsü yan yana, 390 px genişliğinde. Solda Pastrana ve ark. (2026) kablo ağı sayfası, “Four cables, one equilibrium”, görüntüleyici başlığın hemen altında; sağda Navier plakası karşılaştırma testi, görüntüleyicisi ekranın tüm genişliğini kaplıyor ve plakanın aşağı yöndeki yer değiştirmesini gösteriyor.", "caption": "Telefonda araştırma: başlıktan sonra deney ve ekran genişliğinde bir görüntüleyici."},
    {
      "k": "p",
      "t": "Kalıcı bir kontrol, galeriyi ve çalıştırılabilir her sayfayı 360, 390, 844×390 ve 810 px’te İspanyolca, İngilizce ve Portekizce olarak işliyor; yatay taşma, küçük kontroller, küçük metin ya da eksik, fazla küçük veya fazla aşağıda kalan bir görüntüleyici olduğunda başarısız oluyor. İlk çalıştırmaları gerçek hatalar buldu ve kontrol değil, yerleşimler düzeltildi: Mattiasson görüntüleyicisi telefon yatay konumdayken 187 px yüksekliğindeydi, artık 280 px; bir yakınsama grafiği de etiketlerini 9 px ile yazıyordu. Bir yeniden akış testi, Shauer’in sekmelerinin Portekizce ve Türkçede 360 px’te taştığını buldu."
    },
    {
      "k": "h",
      "t": "Editöre açılan sekiz hesaplayıcı"
    },
    {
      "k": "p",
      "t": "Stabileo Tools artık basit mesnetli kirişler, konsollar, elastik kolon burkulması, sürekli kirişler, tek açıklıklı çerçeveler, düzlem kafesler, hareketli yük tesir çizgileri ve kiriş eğilme frekansları için ücretsiz hesaplayıcılar sunuyor. Üretim motorunu kullanıyor, bağımsız klasik karşılaştırmalar gösteriyor ve varsayımlarını belirtiyorlar. Her biri modelini tam editörde açıyor. Bunlar analiz araçlarıdır, eksiksiz yönetmelik tasarım kontrolleri değildir."
    },
    {"k": "img", "base": "blog/tools", "w": 1600, "h": 1000, "alt": "Stabileo Tools sayfası, “Ücretsiz mühendislik hesaplayıcıları”; basit mesnetli kiriş hesaplayıcısıyla başlıyor: yayılı yük altında bir kiriş, sehim eğrisi ve açma düğmesi.", "caption": "stabileo.com/tools: üretim motoru üzerinde sekiz hesaplayıcı."},
    {
      "k": "h",
      "t": "Yanlış sonuçları sınırlamak"
    },
    {
      "k": "p",
      "t": "Bilinen tüm yanlış sonuç sorunlarını sınırlamak için çalışıyoruz: motordaki retler veya uyarılar, kontrol edilmemiş bir sayı döndürmek yerine bilinen sorunun kimliğini taşıyor (#807, 5 Kasım’da birleştirildi). Çubuk veya kabuk eksantrisitesi içeren ve desteklenmeyen dinamik modeller dâhil her ret test ediliyor."
    },
    {
      "k": "p",
      "t": "Metamorfik testler değişmezlik hatalarını ortaya çıkardı: Eşdeğer modeller döndürme, aynalama veya birim ölçeklendirmesinden sonra reddedilebiliyordu. Bu gerilemeleri yakalamak için artık metamorfik test kümesini her değişiklikte çalıştırıyoruz. Bulguları kök nedene göre gruplayan ve her kök neden için tek bir sorun kaydı açan, rastgele modellerin her gece çalıştırıldığı bir süreç ekliyoruz."
    },
    {
      "k": "h",
      "t": "O günden bu yana: 1–3 Kasım"
    },
    {
      "k": "ul",
      "items": [
        "PRO’nun analiz modu tamamlandı. Uyarı vermeden yanlış çıkan sonuçlar düzeltildi: yük üreteci artık bir hangarın saçak bölgesini kat döşemesi gibi yüklemiyor ve her katın deprem ağırlığı, daha önce dışarıda kalan, kabuk olarak çizilmiş döşeme ve duvarları da içeriyor (#1076).",
        "Dışa aktarımlar gerçek binalarda çalışıyor. Büyük Excel sayfaları satır satır yazılıyor ve altı katlı bir binanın raporu dört dakika yerine yaklaşık on saniye sürüyor. “Dışa aktarılmış raporu doğrula” artık yalnızca parmak izlerini değil, basılan sayıları da karşılaştırıyor (#1076).",
        "PRO’ya kapatılabilen satır içi yardım, başlıkta kayıt durumu, analizden sonra rapor, plak sonuçları ve paylaşılan modeller için “Çoğalt ve düzenle” seçeneği olan salt okunur bir görüntüleyici eklendi (#1077, #1078).",
        "Bağımsız olarak sertifikalanmış üst sınırının üzerindeki bir burkulma katsayısı artık 2B ve 3B’de reddediliyor (#817, sonuç sürümü 6). Önceki bir burkulma sertifikasına güvenmeden önce sertifikalamayı yeniden çalıştırın.",
        "Sonlu olmayan sayılar içeren ya da eksik bir şeye işaret eden çubuk, mesnet veya yük barındıran paylaşım bağlantıları açılmak yerine reddediliyor (#1058).",
        "Değişmezlik paketi artık altı öncelikli analizi döndürme, yansıtma ve süperpozisyon altında, bunlardan dördünü de rijitliğin düzgün ölçeklenmesi altında kontrol ediyor (#1060)."
      ]
    },
    {
      "k": "h",
      "t": "Yirmi dakikada yanıt veren kontroller"
    },
    {
      "k": "p",
      "t": "Stabileo’daki her değişiklik main’e ulaşmadan önce etkileyebileceği kontrollerden geçer, motordaki bir değişiklik ise hepsinden: motor testleri, web birim testleri, üretim derlemeleri, tarayıcıda uçtan uca testler, sonuç anlık görüntüleri ve belirlenimcilik kontrolü. Hatalı bir sonucun düzeltilmesi ancak bu kontroller kadar hızlı olabilir; bu yüzden 4 Kasım’da bu kontrollerin hızı üzerinde çalıştık. Önce ölçtük. 44 ila 47 dakika süren temiz bir birleştirme kuyruğu çalıştırmasında motor ve birim testleri bitişten 8 ila 15 dakika önce tamamlanıyordu; bu yüzden onlardan daha fazlasını paralel çalıştırmak hiçbir şey kazandırmazdı. Süre, araştırma paketlerinin birbiri ardına derlenmesine ve en yavaş uçtan uca parçaya gidiyordu. Bunlar kısaldıktan sonra en yavaş parça hazırlık yüzünden yavaştı: bir çalıştırmada 16 dakikasının 7,2’sini testlere, altı buçuğunu da yavaş bir yansı sunucudan tarayıcı paketleri indirmeye harcadı."
    },
    {
      "k": "ul",
      "items": [
        "Bir kez derle, derleneni test et. Üretim derlemesi testleri kendi başlarına beş derleme daha yapıyordu ve bunların dördü CI’ın az önce derlediği ağacın aynısıydı; bu dördü artık o derlemeyi okuyor (#1411). Her derleme, neyden derlendiyse hepsinin bir damgasını taşıyor ve damga üzerinde çalıştığı ağaçla eşleşmezse test başarısız olur, asla atlanmaz.",
        "Girdiye göre önbellek. Her araştırma paketi, her paketin bağladığı motor dâhil kendi girdilerinden oluşan bir anahtarla önbelleğe alınıyor; böylece bir makaledeki değişiklik yalnızca o makaleyi, motordaki bir değişiklik ise hepsini yeniden derliyor. Bir pull request, birleştirme kuyruğunun aynı girdilerden zaten derlediği paketleri her dosyayı sağlama toplamına karşı kontrol ettikten sonra yeniden kullanıyor; bu önbelleği okuyabiliyor ama asla yazamıyor (#1395). Tarayıcı paketleri de yansı sunucu yerine bir önbellekten geliyor (#1413).",
        "Yalnızca bir değişikliğin etkileyebileceğini çalıştır. Belgelerdeki bir değişiklik hiçbir şey derlemiyor ve tam bir çalıştırma yerine bir iki dakikada bitiyor. Yalnızca siteyi etkileyen bir değişiklik motor işlerini atlıyor ama tüm uçtan uca parçaları koruyor, çünkü 281 spesifikasyonun 59’u ekrandaki metni okuyor (#1381). Kuyrukta her öğenin kapsamı, önündeki öğeye karşı kendi diff’iyle belirleniyor; bu sağlam bir yöntem, çünkü bir öğe ancak önündeki tüm öğeler geçtiyse birleştiriliyor. Diff eksik ya da belirsiz olduğunda her şey çalışıyor (#1400).",
        "En yavaş yolu dengele. Uçtan uca testler 10 yerine 14 parçada, ölçülen sürelere göre dengelenerek çalışıyor (#1382). Eski süre tablosu, bir çalıştırmanın 69,8 dakika sürdüğü yerde 41,5 dakikalık test öngörüyordu."
      ]
    },
    {
      "k": "table",
      "caption": "Tüm işleri çalıştıran başarılı CI çalıştırmalarının oluşturulmalarından son işe kadar geçen gerçek süresi, GitHub Actions API’siyle ölçüldü. Önce: 4 Kasım, 08:00 UTC’den (pull request’ler) veya 13:48 UTC’den (birleştirme kuyruğu) 21:10 UTC’ye kadar; sonra: 21:15 UTC’den 5 Kasım 03:00 UTC’ye kadar.",
      "head": [
        "Çalıştırmalar",
        "Sayı",
        "Medyan",
        "Aralık"
      ],
      "rows": [
        [
          "Birleştirme kuyruğu, önce",
          "20",
          "42 dk",
          "25 ila 56 dk"
        ],
        [
          "Birleştirme kuyruğu, sonra",
          "10",
          "20 dk",
          "15 ila 26 dk"
        ],
        [
          "Pull request’ler (ilk deneme), önce",
          "69",
          "59 dk",
          "35 ila 127 dk"
        ],
        [
          "Pull request’ler (ilk deneme), sonra",
          "19",
          "27 dk",
          "16 ila 45 dk"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Değişikliğin suçu olmayan kırmızı bir kontrol"
    },
    {
      "k": "p",
      "t": "Ağdan ya da kaybedilen bir makineden kaynaklanan bir hata gürültüdür, ama aynı zamanda birinin bakması gereken kırmızı bir kontroldür; kırmızı kontrolleri yeniden çalıştırma alışkanlığı da gerçek bir hatanın üzerinde durulmadan geçirilmesinin yoludur. Bu yüzden bir pull request’in başarısız işleri, yalnızca başarısız işlerin her biri bir altyapı arızasına dair olumlu kanıt taşıdığında, otomatik olarak bir kez yeniden çalıştırılıyor: bir indirme adımında zaman aşımı, iş ortasında kaybedilen bir CI makinesi, bir indirmenin son denemesini sonlandıran bir ağ hatası (#1380). Günlüğün herhangi bir yerinde test hatasına benzeyen herhangi bir şey yeniden çalıştırmayı engelliyor; sınıflandırıcının tanımadığı her şey de öyle. Bu onu temkinli tutuyor: en fazla bir kez ve hiçbir zaman başarısız bir test adımından sonra yeniden çalıştırmıyor. Bu bir garanti değil: sınıflandırıcının yanlışlıkla altyapı hatası olarak okuduğu aralıklı bir hata yeniden çalıştırmada geçebilir; bu yüzden tanımadığı her şey yeniden çalıştırmayı engelliyor."
    },
    {
      "k": "p",
      "t": "İki düzeltme daha yanlış alarmları ortadan kaldırdı. Aynı commit üzerindeki daha yeni bir çalıştırma yerini aldığı için iptal edilen bir pull request çalıştırması eskiden kırmızı bir zorunlu kontrol gösteriyordu; artık bu kontrolü atlıyor, ama yalnızca daha yeni çalıştırmanın var olduğunu ve başarısız olmadığını doğruladıktan sonra, çünkü atlanan zorunlu bir kontrol geçmiş sayılır (#1397). Ayrıca takılan bir indirme, paket yöneticisinin kilidini tutan bir süreç bırakabiliyordu ve yeniden deneme indirme yerine kilit yüzünden başarısız oluyordu; artık bir deneme ancak dakikalarca çıktı vermediğinde takılmış sayılıyor, başlattığı her şeyle birlikte durduruluyor ve yeniden deneme kilidi bekliyor (#1408)."
    },
    {
      "k": "h",
      "t": "Sırada ne var"
    },
    {
      "k": "p",
      "t": "Açık karşılaştırmaları tamamlıyor, siteyi ve çözücüyü hızlandırıyoruz. Yol haritasında sırada bir Python paketi (pip install stabileo) ve karşılaştırma problemlerinden üretilen, herkese açık bir doğrulama kılavuzu var."
    }
  ]
};

export default body;
