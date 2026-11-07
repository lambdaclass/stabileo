import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "ETABS için ücretsiz, açık kaynaklı bir alternatif",
  "description": "Stabileo ile ETABS iş akışınızı karşılaştırın: ücretsiz tarayıcı analizi, açık kaynak, doğrulama kanıtları, mevcut sınırlar ve planlanan içe aktarma.",
  "eyebrow": "ETABS için ücretsiz, açık kaynaklı bir alternatif",
  "lead": "Stabileo tarayıcıda ücretsiz, açık kaynaklı yapı analizi sunar. ETABS iş akışınıza uygunluğu gereken analiz ve kontrollere bağlıdır; özellik eşdeğerliği iddia edilmez.",
  "blocks": [
    {
      "k": "h",
      "t": "Stabileo bugün neleri kapsıyor?"
    },
    {
      "k": "p",
      "t": "Yetenek matrisi 2B ve 3B doğrusal statik analizi, çerçeve ve kafesleri, yük birleşimlerini ve zarflarını, P-Delta, burkulma ve modal analizi belgeler. Plak ve kabuk ailelerini de içerir. Temel ve PRO modlarında analiz kullanılabilir; yönetmeliğe göre tasarım ve yapay zekâ asistanı geliştirilmektedir."
    },
    {
      "k": "p",
      "t": "Bina iş akışlarında çözücünün plak ve kabuk yeteneklerini; döşeme, perde ve karmaşık modeller için PRO arayüzünden ayırın. PRO'da yönetmeliğe göre tasarım hâlâ geliştirilmektedir; bir çözücü özelliğinin varlığı, tüm bina tasarım iş akışının hazır olduğu anlamına gelmez."
    },
    {
      "k": "h",
      "t": "Mevcut sınırlar"
    },
    {
      "k": "p",
      "t": "SAP2000/ETABS model aktarımı planlanmaktadır, kullanıma hazır değildir. .s2k veya .e2k dosyaları açılamaz. Matris, doğrusal olmayan çözüm sağlamlığı, karma çerçeve/kabuk durumları ve büyük model doğrulamasındaki eksikleri belirtir. Yapay zekâ asistanı geliştirilmekte olup ileride sunulacaktır."
    },
    {
      "k": "h",
      "t": "Sonuçlar nasıl doğrulanıyor?"
    },
    {
      "k": "p",
      "t": "Yayımlanmış karşılaştırma örnekleri, bağımsız uygulamalarla karşılaştırmalar ve testler farklı kanıt düzeyleri sağlar. Desteklenen analiz ve tasarım kontrolleri makineyle doğrulanmış sınırlar taşıyabilir; bu, her sonucu veya mühendislik modelini sertifikalandırmaz. Olgunluk matrisi her ailenin kanıtlarını ve açık sorunlarını listeler."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/BENCHMARKS.md#solver-capability-matrix",
      "label": "Çözücü yetenekleri",
      "t": ""
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/MATURITY.md",
      "label": "Doğrulama olgunluğu",
      "t": ""
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/roadmap/PRODUCT_ROADMAP.md",
      "label": "Ürün yol haritası",
      "t": ""
    }
  ],
  "faqTitle": "Kaynaklar ve kapsam",
  "faq": [
    {
      "q": "ETABS için tam bir ikame mi?",
      "a": "Özellik eşdeğerliği iddia edilmez. Projeniz için belgelenmiş yetenek ve sınırları inceleyin. ETABS adı yalnızca karşılaştırılan iş akışını belirtir; bağlantı veya onay anlamına gelmez."
    }
  ]
};

export default body;
