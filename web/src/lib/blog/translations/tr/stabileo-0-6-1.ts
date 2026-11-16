import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.6.1: düzeltilmiş eleman kontrolleri ve kar yükleri",
  "excerpt": "Etkilenen beton ve çelik tasarım kontrollerini yeniden çalıştırın. Üretilmiş kar için önce yükleri yeniden üretin, ardından etkilenen yük durumlarını, birleşimleri, zarfları ve türetilmiş tasarım kontrollerini yeniden hesaplayın.",
  "blocks": [
    {
      "k": "p",
      "t": "Etkilenen beton ve çelik tasarım kontrollerini yeniden çalıştırın. Üretilmiş kar için önce yükleri yeniden üretin, ardından etkilenen yük durumlarını, birleşimleri, zarfları ve türetilmiş tasarım kontrollerini yeniden hesaplayın. Önceden kaydedilmiş yüklerle yeniden çözmek bu yükleri düzeltmez. Talepleri, kapasiteleri, donatıyı, kullanım oranlarını, belirleyici birleşimleri ve sertifikaları daha önce kullanılan sonuçlarla karşılaştırın. Teslim edilen hesapları ve bunlara dayanan boyutlandırmayı gözden geçirin. Ret, kullanılamayan bir büyüklük veya kontrol edilmemiş donatı, başarılı kontrol ya da sıfır talep anlamına gelmez."
    },
    {
      "k": "note",
      "t": "Aşağıdaki Yüksek önem dereceli beş duyurunun düzeltmeleri 0.6.1 içinde yer alır. Önceki sonuçlar başarılı veya sertifikalı olsa bile, etkilenen girdiler ve yapılacak işlemler için her duyuruyu izleyin."
    },
    {
      "k": "h",
      "t": "Güvenlik duyuruları"
    },
    {
      "k": "table",
      "caption": "Güvenlik duyuruları",
      "head": [
        "Duyuru",
        "Önem derecesi",
        "Değişiklik ve yapılacak işlem"
      ],
      "rows": [
        [
          "SA-2026-064",
          "Yüksek",
          "Çelik Cb katsayısı başka bir birleşimden veya yanal mesnet konumları bilinmeyen kısa bir aralıktan alınabiliyordu (#1316, #2088). CIRSOC 301 çelik kontrollerini yeniden çalıştırıp eğilme kapasitesini, etkileşim kullanım oranını ve belirleyici birleşimleri inceleyin."
        ],
        [
          "SA-2026-065",
          "Yüksek",
          "Eğimli alıcı çatıda kot farkındaki kar birikimi atlanabiliyordu (#2082). CIRSOC 104 kar yüklerini yeniden üretip etkilenen analizleri ve tasarım kontrollerini yeniden hesaplayın."
        ],
        [
          "SA-2026-066",
          "Yüksek",
          "Mesnetler arasında enine yük varken beton Cm katsayısına uç momentlerinden azaltma uygulanabiliyordu (#2089). Narin kolon ve perdeleri, büyütülmüş momentleri ve donatıyı yeniden kontrol edin."
        ],
        [
          "SA-2026-067",
          "Yüksek",
          "Plandaki dönme üretilen kar yüklerini değiştirebiliyordu (#2093). Gerçek çatı geometrisiyle yükleri yeniden üretip analizleri ve kontrolleri tekrarlayın; eski modeli geri döndürmek sonuçları düzeltmez."
        ],
        [
          "SA-2026-068",
          "Yüksek",
          "Burulma kontrolü yetersiz tasarlanmış etriyelerle başarılı olabiliyordu (#2141). Beton kontrollerini yeniden çalıştırıp gerçek enine kapasiteyi, etriye aralığını ve burulma başarısızlıklarını inceleyin. Kontrol edilmemiş boyuna donatı, başarılı bir donatı kafesi anlamına gelmez."
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Güvenlik duyuruları dizini",
      "t": "Güvenlik duyuruları:"
    },
    {
      "k": "h",
      "t": "v0.6.0 sonrasındaki tüm sonuç değişikliği bildirimleri"
    },
    {
      "k": "p",
      "t": "v0.6.0 kaydı sonuç sürümü 78 ile biter; bu sürüm 80 değerine ulaşır. Tablo 24 yeni bildirimin tamamını içerir. Birden fazla bildirim aynı sürümü paylaşabilir. Geçerli her kontrolü tekrarlayın; kar için çözmeden önce yükleri yeniden üretin."
    },
    {
      "k": "table",
      "caption": "v0.6.0 sonrasındaki tüm sonuç değişikliği bildirimleri",
      "head": [
        "Sonuç sürümü",
        "Değişen sonuç"
      ],
      "rows": [
        [
          "79",
          "Kar birikmesi sürekli çatı kenarlarını izliyor"
        ],
        [
          "79",
          "Kar yükleri dengesiz tarafları ve çatı uzunluklarını koruyor"
        ],
        [
          "79",
          "Düz çatının kar eksenleri bağlı eleman dizilerini izler"
        ],
        [
          "79",
          "Kar yükleri yerel konumları ve sınırları izliyor"
        ],
        [
          "79",
          "Kar yükü katsayıları her çatı yönünü izler"
        ],
        [
          "79",
          "Kar yükü durumları her mahya yönünü kapsıyor"
        ],
        [
          "79",
          "Kar yükleri sürekli çatıları ve seçilen geometriyi izliyor"
        ],
        [
          "79",
          "Kar yüklerinin büyüklüğü plandaki dönmeyle değişmiyor"
        ],
        [
          "79",
          "Çatı kot farkındaki kar birikimi alıcı çatı düzlemini kullanıyor"
        ],
        [
          "79",
          "Kar yükleri bağlı her çatı yüzeyini izler"
        ],
        [
          "79",
          "Kar yükü alanları çatının iç tarafını izliyor"
        ],
        [
          "80",
          "Eleman kontrolleri tüm etkin birleşimleri gerektirir"
        ],
        [
          "80",
          "Eleman kontrolleri eksiksiz istasyon verisi gerektirir"
        ],
        [
          "80",
          "Eşzamanlı kontroller belirleyici talepleri korur"
        ],
        [
          "80",
          "Tasarım seçilen donatıyı ve açıklık yüklerini kullanır"
        ],
        [
          "80",
          "Etkileşim kontrolleri eşzamanlı istasyon kuvvetlerini kullanır"
        ],
        [
          "80",
          "Beton kontrolleri ikincil narinliği korur"
        ],
        [
          "80",
          "Eşzamanlı yük durumları gerekli burulma donatısının tamamını korur"
        ],
        [
          "80",
          "Sabit donatı pratik üst sınır kontrolünü korur"
        ],
        [
          "80",
          "Tasarım talepleri davranış ve başlık açıklıklarını izler"
        ],
        [
          "80",
          "Burulma verilen tüm etriyeleri kontrol eder"
        ],
        [
          "80",
          "Ortak kirişler eksenlerini korur; burulma donatısı belirtilmelidir"
        ],
        [
          "80",
          "Çelik etkileşim Cb katsayısı kendi kombinasyon diyagramını kullanır"
        ],
        [
          "80",
          "Çelik istasyonları fiziksel uzunlukları ve kesme taleplerini korur"
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.6.1.tr.md",
      "label": "0.6.1 sürüm notlarının tamamı",
      "t": "v0.6.0 sonrasındaki tüm sonuç değişikliği bildirimleri:"
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic içinde, daha önce kaydedilmiş bir projeyi etkileyen değişiklikleri listeleyen sonuçları yeniden kontrol etme iletişim kutusu.",
      "caption": "Sonuçlarınız değişebilir: etkilenen projeleri yeniden hesaplayın"
    },
    {
      "k": "h",
      "t": "Diğer değişiklikler"
    },
    {
      "k": "p",
      "t": "Beton ve çelik kontrolleri aynı birleşim ve istasyondaki kuvvetleri korur. Eksik birleşim veya istasyon verileri artık uç sonuçlarla tamamlanmak yerine reddedilir. Gerekli ve sağlanan donatı durumları ayrı tutulur; boyuna burulma donatısının sağlanmadığı açıkça bildirilir."
    },
    {
      "k": "h",
      "t": "Bilinen sınırlamalar"
    },
    {
      "k": "ul",
      "items": [
        "Bilinen yanlış sonuçlar açık kalıyor: #2096, #2142, #2143 ve #2144. Bu sürüm bunları düzeltmez. Kapsamlarını inceleyin ve etkilenen sonuçları kullanmadan önce bağımsız olarak doğrulayın.",
        "SA-2026-056 hâlâ düzeltilmemiştir: yeniden numaralandırma, döndürme veya birim dönüşümü sonrası önemli ölçüde değişen, kısıtlı karma çerçeve-kabuk modellerinin dinamik taleplerini bağımsız olarak doğrulayın. Belirlenmiş güvenli tarafta bir düzeltme katsayısı yoktur.",
        "2B plastik göçme, SA-2026-044 kapsamında #758 çözülene kadar reddedilir. Sertifikalı 3B alt sınır, ham mafsal geçmişini sertifikalandırmaz.",
        "Zaman tanım alanı analizi toplam dinamik mesnet taleplerini sağlamaz. Atalet, sönüm ve mesnet yüklerini içeren bağımsız analiz kullanın. Desteklenmeyen kablo analizleri ve kablo/zaman tanım alanı iş akışlarında sıfır olmayan tanımlı mesnet hareketi açıkça reddedilir.",
        "Uzaysal yay uzunluğu ve yer değiştirme kontrolü çözücüleri eklenmemiştir. Mevcut uyarılar ve kısıtlamalar geçerliliğini korur."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/CHANGELOG.md",
      "label": "Değişiklik günlüğü",
      "t": "Değişiklik günlüğü:"
    }
  ]
};

export default body;
