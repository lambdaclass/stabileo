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
    {
      "k": "p",
      "t": "Birimleri de tip sistemine ekliyoruz (#864); böylece kN/N veya m/mm karışıklıkları derleme sırasında yakalanacak. 2B çerçeveler için ilk bölüm incelemede."
    },
    {
      "k": "h",
      "t": "Editöre açılan sekiz hesaplayıcı"
    },
    {
      "k": "p",
      "t": "Stabileo Tools artık basit mesnetli kirişler, konsollar, elastik kolon burkulması, sürekli kirişler, tek açıklıklı çerçeveler, düzlem kafesler, hareketli yük tesir çizgileri ve kiriş eğilme frekansları için ücretsiz hesaplayıcılar sunuyor. Üretim motorunu kullanıyor, bağımsız klasik karşılaştırmalar gösteriyor ve varsayımlarını belirtiyorlar. Her biri modelini tam editörde açıyor. Bunlar analiz araçlarıdır, eksiksiz yönetmelik tasarım kontrolleri değildir."
    },
    {
      "k": "h",
      "t": "Yanlış sonuçları sınırlamak"
    },
    {
      "k": "p",
      "t": "Bilinen tüm yanlış sonuç sorunlarını sınırlamak için çalışıyoruz: motordaki retler veya uyarılar, kontrol edilmemiş bir sayı döndürmek yerine bilinen sorunun kimliğini taşıyor (#807, incelemede). Çubuk veya kabuk eksantrisitesi içeren ve desteklenmeyen dinamik modeller dâhil her ret test ediliyor."
    },
    {
      "k": "p",
      "t": "Metamorfik testler değişmezlik hatalarını ortaya çıkardı: Eşdeğer modeller döndürme, aynalama veya birim ölçeklendirmesinden sonra reddedilebiliyordu. Bu gerilemeleri yakalamak için artık metamorfik test kümesini her değişiklikte çalıştırıyoruz. Bulguları kök nedene göre gruplayan ve her kök neden için tek bir sorun kaydı açan, rastgele modellerin her gece çalıştırıldığı bir süreç ekliyoruz."
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
