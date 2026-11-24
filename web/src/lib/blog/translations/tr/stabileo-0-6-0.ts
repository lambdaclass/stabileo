import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.6.0: etkilenen projeleri yeniden hesaplayın",
  "excerpt": "Etkilenen analizleri yeniden hesaplayıp daha önce kullanılan sonuçları inceleyin. SA-2026-048 ile SA-2026-063 neyin kontrol edileceğini açıklar; SA-2026-056 hâlâ düzeltilmemiştir.",
  "blocks": [
    {
      "k": "p",
      "t": "Etkilenen yük durumlarını, birleşimleri ve doğrusal olmayan ya da aşamalı analizlerin tüm geçmişini yeniden hesaplayın. Yer değiştirmeleri, çubuk kuvvetlerini, tepkileri ve tasarım taleplerini daha önce kullanılan sonuçlarla karşılaştırın. Teslim edilmiş hesapları ve bunlara dayanan boyutlandırmaları gözden geçirin. Etkilenen girdiler ve yapılacak işlem için her duyuruya bakın. Ret veya kullanılamayan bir büyüklük yerine geçecek yanıt sağlamaz: sıfır talep ya da başarılı kontrol anlamına gelmez."
    },
    {
      "k": "note",
      "t": "SA-2026-048 ile SA-2026-063 arasındaki duyurular v0.5.0 sonrasında eklendi. Aşağıdaki düzeltmeler 0.6.0 sürümüne dahildir; SA-2026-056 ise hâlâ düzeltilmemiştir. Önceki analiz yakınsamış veya yer değiştirmeleri makul görünmüş olsa bile belirtilen özellikleri yeniden kontrol edin."
    },
    {
      "k": "h",
      "t": "Güvenlik duyuruları"
    },
    {
      "k": "table",
      "caption": "SA-2026-048 ile SA-2026-063 güvenlik duyuruları",
      "head": [
        "Duyuru",
        "Önem derecesi",
        "Değişiklik ve yapılacak işlem"
      ],
      "rows": [
        [
          "SA-2026-048",
          "Yüksek",
          "CIRSOC 301, kısaltılmış yanal tutulmamış bölümü olan her kesitte uç momentlerini Mmax hesabından çıkarıyordu; çift eğrilikli U ve T kesitler ayrıca işaret değişimini kaçırabiliyordu. Tüm CIRSOC 301 elemanlarını, tanımlanan Lb eleman boyundan kısaysa, çelik kontrolleri ve optimizasyon önerileri dahil yeniden kontrol edin."
        ],
        [
          "SA-2026-049",
          "Yüksek",
          "Rijit kısıt ve yay birlikte 3B’de elastik mesnede dönüşebiliyordu. Amaçlanan sınır koşulunu açıkça seçip etkilenen analizleri yeniden hesaplayın."
        ],
        [
          "SA-2026-050",
          "Orta",
          "Başarısız narinlik hesabı sıfıra dönüşebiliyor, çoklu yük durumu sonuçları sonlu olmayan sayılar içerebiliyordu. Bu değerleri atın, girdileri kontrol edip yeniden hesaplayın."
        ],
        [
          "SA-2026-051",
          "Yüksek",
          "3B hareketli yükler iç tepe değerlerini ve dingil ağırlığının eksenel bileşenini atlıyordu. Zarfları yeniden hesaplayıp eleman boyutlarını ve tasarım taleplerini inceleyin."
        ],
        [
          "SA-2026-052",
          "Yüksek",
          "2B/3B hareketli yük eksenel zarfları yayılı yük sınırlarını atlıyordu. Yeniden hesaplayıp iç eksenel uç değerleri kontrol edin; yalnızca tren adımını azaltmak yeterli değildir."
        ],
        [
          "SA-2026-053",
          "Düşük",
          "Hareketli yük zarfları eleman ucu yüklerinde dış kuvvet sınırlarını içeriyordu. Eksenel/kesme zarflarını yeniden hesaplayıp boyutları inceleyin; denge kontrollerinde mesnet tepkilerini koruyun."
        ],
        [
          "SA-2026-054",
          "Yüksek",
          "Doğrusal çözümler çözümlenemeyen rijitlik yanıtları verebiliyor veya bir yük bileşenini kaçırabiliyordu. Statik durumları ve birleşimleri yeniden hesaplayın; düzeltilmiş çözücü reddederse talepleri bağımsız doğrulayın."
        ],
        [
          "SA-2026-055",
          "Yüksek",
          "P-Delta eleman boyunca eksenel yüklerde büyütmeyi düşük veriyordu. Etkilenen analizleri ve kontrolleri yeniden hesaplayın, ağ yakınsamasını doğrulayıp kararlılığı yeniden değerlendirin."
        ],
        [
          "SA-2026-056",
          "Yüksek",
          "Düzeltilmedi: kısıtlı karma çerçeve/kabuk dinamiği eşdeğer model tanımlarında değişiyor. Etkilenen talepleri kullanmadan önce bağımsız doğrulayın; güvenli tarafta bir düzeltme katsayısı belirlenmemiştir."
        ],
        [
          "SA-2026-057",
          "Orta",
          "Plastik sonuç ekranı aralık dışındaki katsayıyı içeride gösterebiliyordu. Sertifikaları yeniden hesaplayıp kesin uç noktaları karşılaştırın. Kaynak reddi mekanizma olmadığını kanıtlamaz."
        ],
        [
          "SA-2026-058",
          "Yüksek",
          "Büyük harmonik modeller atlanan modların hatalı yanıtlarını koruyordu. Taramaları yeniden çalıştırıp kesme uyarısının kapsamadığı frekanslar dahil genlik, faz ve tepe değerlerini inceleyin."
        ],
        [
          "SA-2026-059",
          "Yüksek",
          "Gelişmiş web analizleri kablolara basınç direnci veriyordu. Desteklenen özel kablo çözücüsünü veya bağımsız analizi kullanın; gelişmiş kablo iş akışları artık açıkça reddedilir."
        ],
        [
          "SA-2026-060",
          "Yüksek",
          "Aşamalı analizde yapay dönme rijitliği ötelemeleri ve eleman kuvvetlerini değiştiriyordu. Serbestlik veya mesnet yayı içeren tüm aşama geçmişini yeniden hesaplayıp türetilen tasarım taleplerini inceleyin."
        ],
        [
          "SA-2026-061",
          "Yüksek",
          "Yol analizinde tepkiler eksikti veya yanlış yükte geri kazanılıyordu; aşamalı ve dinamik kuvvetler eksik olabiliyordu. Yeniden hesaplayıp mesnet, birleşim ve temel taleplerini inceleyin. Kullanılamayan kuvvet sıfır değildir; toplam dinamik tepkiler hâlâ kullanılamaz."
        ],
        [
          "SA-2026-062",
          "Yüksek",
          "Başlangıç elastik reddi başarılı bir ham 3B plastik göçme katsayısı sıfıra dönüşebiliyordu. Etkilenen plastik analizleri yeniden hesaplayın; sayısal ret sıfır yükte göçme kanıtı değildir."
        ],
        [
          "SA-2026-063",
          "Yüksek",
          "Kısıtlar tutulu ana düğümün tanımlı hareketini kaybediyordu. Tüm geçmişi yeniden hesaplayıp yer değiştirmeleri, eleman kuvvetlerini ve tepkileri SA-2026-061 ile birlikte inceleyin. Desteklenmeyen kablo/zaman tanım alanı mesnet hareketi artık reddedilir."
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Güvenlik duyuruları dizini",
      "t": "Etkilenen girdiler ve yapılacak işlem için geçerli her duyuruyu okuyun:"
    },
    {
      "k": "h",
      "t": "Sonuçları etkileyen diğer değişiklikler"
    },
    {
      "k": "p",
      "t": "Sonuç kaydı 0.5.0 sürümünde 49 ile biter ve 0.6.0 sürümünde 78 düzeyine ulaşır. Tablo, yukarıdaki duyurularla birlikte incelenecek diğer değişikliklerden bir seçki sunar. Geçerli bir bildirimin kapsadığı her analizi yeniden hesaplayıp çıktılarını karşılaştırın. Değiştirilen ve geri çekilen kontroller dahil tam liste sürüm notlarındadır."
    },
    {
      "k": "table",
      "caption": "0.5.0 sonrasındaki sonuç değişikliği bildirimlerinden seçki",
      "head": [
        "Sonuç sürümü",
        "Değişen sonuç"
      ],
      "rows": [
        [
          "50",
          "2D: yalnızca bağlayıcıların tuttuğu ve serbest bıraktığı dönmeler reddediliyor"
        ],
        [
          "52",
          "3B: bir bağlayıcının bağladığı ama serbest bıraktığı düğüm dönmeleri reddediliyor"
        ],
        [
          "53",
          "Burkulma artık yalnızca yuvarlama olan eksenel kuvvetlerden geometrik rijitlik almıyor 2D ve 3D analizlerde, eksenel kuvvetleri yuvarlama hatasından ayırt edilemeyen elemanlar geometrik rijitliğe katkı yapmaz. Olası basınçları kritik katsayıyı %1’den fazla düşürebilecekse analiz reddedilir."
        ],
        [
          "54",
          "Şaşırtmalı bulonlu bir ucun net alanı en elverişsiz kırılma hattını alıyor ve tüm elemanları bulonlu bir uç gövdede bulon gerektiriyor"
        ],
        [
          "56",
          "Eğik 3D mesnetler kısıtları ortak koordinat sisteminde sayar"
        ],
        [
          "58",
          "Modal bazlar kütle Gram matrisinin her girdisinin yuvarlama ölçeğini kullanıyor"
        ],
        [
          "59",
          "Doğrulanan 3D plastik analiz sertifikalı alt sınırı döndürüyor"
        ],
        [
          "61",
          "Beton liflerinde yük kontrolü durma aralığını daraltır"
        ],
        [
          "63",
          "Doğrusal analiz bir mekanizmayı ya da çözümlenemeyen bir rijitliği uyarıyla çözmek yerine reddediyor"
        ],
        [
          "65",
          "Geçersiz sabitlenmiş temaslar ve kabloları çubuk sayan analizler reddediliyor"
        ],
        [
          "66",
          "Burkulma yuvarlama sınırları gerçek kısıt bağlaşmasını izliyor"
        ],
        [
          "67",
          "Burkulma katsayıları özgün rijitlik matrislerini kullanır"
        ],
        [
          "68",
          "Plastik denge çözülen modelin kimliklerini kullanır; sertifikalar gerçek adaylar için kaynak bütçesi uygular"
        ],
        [
          "69",
          "Doğrusal olmayan yakınsama fiziksel dengeyi izler"
        ],
        [
          "71",
          "Koşullu eleman dengesine kafes çubuklarının enine etkilerini dahil et"
        ],
        [
          "72",
          "Yay uzunluğu devamı referans yük hesabını yeniden grupluyor"
        ],
        [
          "73",
          "Modal analiz fiziksel kütle uzayını korur"
        ],
        [
          "75",
          "SSI elastik artık duraklamalarını düzeltir"
        ],
        [
          "76",
          "Kısıt indirgeme yönsel yuvarlama belirsizliğini korur"
        ],
        [
          "78",
          "Serbest bırakılan dönmelerde uyumlu yükler"
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.6.0.tr.md",
      "label": "0.6.0 sürüm notlarının tamamı",
      "t": "Kapsam ve kanıt bağlantılarıyla tüm sonuç değişikliği bildirimleri:"
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic içinde, daha önce kaydedilmiş bir projeyi etkileyen değişiklikleri listeleyen sonuçları yeniden kontrol etme iletişim kutusu.",
      "caption": "0.5.0 yazısında gösterilen sonuçları yeniden kontrol etme iletişim kutusu."
    },
    {
      "k": "h",
      "t": "İki bildirim zaten 0.5.0 içinde bulunan davranışları açıklar"
    },
    {
      "k": "p",
      "t": "Bu iki bildirim daha sonra kaydedildi. İlgili değişiklikler v0.5.0 içinde zaten vardı; bu nedenle bu sürümde yeni sayısal değişiklikler değildir. Yine de bir projenin yeniden hesaplama bildiriminde görünebilirler."
    },
    {
      "k": "table",
      "caption": "0.5.0 içinde zaten bulunan değişiklikler için sonraki bildirimler",
      "head": [
        "Sonuç sürümü",
        "Değişen sonuç"
      ],
      "rows": [
        [
          "72",
          "Herkese açık döşeme galerisi duvarlarda sert basit mesnetler kullanıyor"
        ],
        [
          "72",
          "SSI mesnet tepkilerini döndürüyor ve zemin yaylarını kısıt kuvvetlerine katıyor"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Bilinen sınırlamalar"
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-056 hâlâ düzeltilmemiştir: yeniden numaralandırma, döndürme veya birim dönüşümü sonrası önemli ölçüde değişen, kısıtlı karma çerçeve-kabuk modellerinin dinamik taleplerini bağımsız olarak doğrulayın. Belirlenmiş güvenli tarafta bir düzeltme katsayısı yoktur.",
        "2B plastik göçme, SA-2026-044 kapsamında #758 çözülene kadar reddedilir. Sertifikalı 3B alt sınır, ham mafsal geçmişini sertifikalandırmaz.",
        "Zaman tanım alanı analizi toplam dinamik mesnet taleplerini sağlamaz. Atalet, sönüm ve mesnet yüklerini içeren bağımsız analiz kullanın. Desteklenmeyen kablo analizleri ve kablo/zaman tanım alanı iş akışlarında sıfır olmayan tanımlı mesnet hareketi açıkça reddedilir.",
        "Uzaysal yay uzunluğu ve yer değiştirme kontrolü çözücüleri eklenmemiştir. Mevcut uyarılar ve kısıtlamalar geçerliliğini korur."
      ]
    },
    {
      "k": "h",
      "t": "Diğer değişiklikler"
    },
    {
      "k": "ul",
      "items": [
        "Üretilen düzlem yapılara açık kısıtlar eklenir; hangarlarda varsayılan olarak fiziksel çaprazlar kullanılır. Yeniden üretip mesnetleri ve çaprazları kontrol edin; kayıtlı modeller değişmez.",
        "Fehér, Sipos ve Várkonyi’nin eğilmiş şerit şekil kontrolü deneyi, İngilizce, İspanyolca ve Portekizce olarak etkileşimli çözücü, eyleyici yolları ve makaleyle karşılaştırma sunar. Kesilmiş şerit özeti de İspanyolca ve Portekizceye çevrilmiştir.",
        "0.5.0 sürümünün blog yazısı Almanca, Fransızca ve Türkçeye tamamen çevrilmiştir. Plastik sertifika uyarıları ve kaynak sınırı retleri sunulan tüm dillere çevrilmiştir."
      ]
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
