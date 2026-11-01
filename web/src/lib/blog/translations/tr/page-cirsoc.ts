import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Tarayıcınızda ücretsiz CIRSOC tasarım kontrolleri: neler var, neler yok",
  "description": "Stabileo betonarmeyi (CIRSOC 201) ve çeliği (CIRSOC 301, deneysel) kontrol eder, CIRSOC 101–104 yüklerini üretir; tarayıcıda, ücretsiz. Neler var, neler yok.",
  "eyebrow": "CIRSOC",
  "lead": "Stabileo, betonarme elemanları CIRSOC 201'e (2025 baskısı), çelik elemanları CIRSOC 301-2018'e göre kontrol eden ve Arjantin'in yapı yönetmelikleri olan CIRSOC 101-2025, 102-2025, INPRES-CIRSOC 103-2018 (Kısım I) ve CIRSOC 104-2005'e göre yükleri ve kombinasyonları üreten açık kaynaklı bir yapı analizi yazılımıdır. Analiz yaparken kullandığınız modeli ve çözücüyü kullanır, tarayıcıda çalışır, kurulum veya lisans gerektirmez. Yönetmeliğe göre tasarım PRO modülündedir; bu modül hâlâ geliştirme aşamasındadır ve bu süre boyunca ücretsizdir.",
  "blocks": [
    {
      "k": "h",
      "t": "Neler mevcut ve ne ölçüde doğrulandı"
    },
    {
      "k": "p",
      "t": "Sertifikalı, her sonucun aralık aritmetiğiyle hesaplanmış bir sayısal hata sınırı taşıdığı anlamına gelir; modelin doğru olduğu ya da bir mühendisin onu incelediği anlamına gelmez. Yayımlanan örnekler INTI-CIRSOC çözümlü örnekleridir."
    },
    {
      "k": "table",
      "caption": "Stabileo'nun bugün CIRSOC'a göre kontrol ettikleri ve her kısmın doğrulama düzeyi.",
      "head": [
        "Yönetmelik",
        "Ne yapar",
        "Durum"
      ],
      "rows": [
        [
          "CIRSOC 201 — betonarme",
          "Kirişler ve kolonlar: eğilme, bileşik eğilme, kesme ve minimum donatı; hesap motorundan kesitler, etkileşim diyagramları ve döşemeler",
          "PRO'da mevcut. Kiriş eğilmesi ve kesmesi sertifikalı; bileşik eğilme ve döşemeler test edildi, sertifikalı değil. 5 maddeden 3'ü INTI-CIRSOC 201-2005 örnekleriyle karşılaştırıldı"
        ],
        [
          "CIRSOC 201-2025 — donatı detaylandırma",
          "Ankraj, çatlak kontrolü, aralıklar ve donatı yerleşimi",
          "PRO'da mevcut. Test edildi"
        ],
        [
          "CIRSOC 301-2018 — çelik",
          "Çekme, basınç (eğilmeli ve eğilmeli-burulmalı burkulma), eğilme ve kesme",
          "Mevcut; bağımsız bir incelemeye kadar deneysel olarak işaretli. Sertifikalı; 14 maddeden 10'u INTI-CIRSOC 301-2018 örnekleriyle karşılaştırıldı"
        ],
        [
          "CIRSOC 301-2018 J — birleşimler",
          "Köşe kaynakları ve bulonlu birleşimler",
          "Geliştirme aşamasında; 4 maddeden 2'si yayımlanmış örneklerle karşılaştırıldı"
        ],
        [
          "CIRSOC 201 — tekil temeller",
          "Zemin gerilmesi, kesme, zımbalama ve eğilme",
          "Geliştirme aşamasında; ikinci bir uygulamayla karşılaştırıldı"
        ],
        [
          "CIRSOC 101-2025 — yükler ve kombinasyonlar",
          "§2.3.2'nin yedi kombinasyonu, ölü ve hareketli yükler",
          "Uygulanan kısım resmî metne karşı madde madde doğrulandı; buz, olağanüstü olaylar ve bazı hükümler kapsanmıyor"
        ],
        [
          "CIRSOC 102-2025 — rüzgar",
          "Basınçlar ve kullanılabilirlik kombinasyonları",
          "Uygulanan kısım resmî metne karşı doğrulandı; bazı durumlar kapsanmıyor"
        ],
        [
          "INPRES-CIRSOC 103-2018 Kısım I — deprem",
          "Spektrum, bölgeye göre yöntem, deprem ağırlığı ve deprem kombinasyonu",
          "Uygulanan kısım doğrulandı; bazı hükümler kapsanmıyor"
        ],
        [
          "CIRSOC 104-2005 — kar",
          "Yerleşim yerine göre kar yükleri",
          "Tablolara karşı doğrulandı"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Nasıl çalışır"
    },
    {
      "k": "ul",
      "items": [
        "Tek model: yapıyı çizer ya da içe aktarırsınız (DXF, IFC veya bir Excel şablonu) ve kontroller analizle aynı iç kuvvetleri kullanır; başka bir elektronik tabloya elle hiçbir şey kopyalanmaz.",
        "CIRSOC 101, 102, 103 ve 104'e göre yükler ve kombinasyonlar proje verilerinden üretilir.",
        "Her çubuk için sonuçta istem/kapasite oranı ve belirleyici madde verilir; her adım incelenebilir.",
        "Çözücü sizin bilgisayarınızda çalışır: model çözülmek üzere hiçbir sunucuya gönderilmez. Kod açıktır (AGPL-3.0).",
        "Aynı model her zaman aynı sayıları verir ve her rapor, onu üreten sürümü ve verileri kaydeder."
      ]
    },
    {
      "k": "link",
      "slug": "verificacion-flexion-cirsoc-201",
      "t": "Düzenleyicide açılabilecek modeliyle birlikte, adım adım çözülmüş bir örnek:"
    },
    {
      "k": "h",
      "t": "Nasıl doğruluyoruz ve doğrulama nerede bitiyor"
    },
    {
      "k": "ul",
      "items": [
        "Tasarım kontrolleri INTI-CIRSOC çözümlü örnekleriyle, yükler ise resmî metinlerle madde madde karşılaştırılır; her fark nedeniyle birlikte belgelenir.",
        "Analiz, diğer yedi sonlu eleman programıyla karşılaştırılır.",
        "Henüz yetkili bir yapı mühendisi tarafından bağımsız bir inceleme yapılmadı ve çelik hâlâ deneysel olarak işaretli.",
        "Hiçbir program modeli kontrol etmez: yükler, mesnetler ve idealleştirme mühendisin kararlarıdır."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Hâlihazırda kullanılmış sonuçları etkilemiş olabilecek bir kusur bulduğumuzda, neyin yeniden kontrol edilmesi gerektiğiyle birlikte yayımlıyoruz:"
    }
  ],
  "faqTitle": "Sıkça sorulan sorular",
  "faq": [
    {
      "q": "Hangi yazılım yapı tasarımını CIRSOC yönetmeliklerine göre kontrol eder?",
      "a": "Stabileo betonarmeyi CIRSOC 201'e, çeliği CIRSOC 301-2018'e (deneysel olarak işaretli) göre kontrol eder ve CIRSOC 101-2025, 102-2025, INPRES-CIRSOC 103-2018 ve CIRSOC 104-2005'e göre yükleri ve kombinasyonları üretir. Açık kaynaklıdır, tarayıcıda çalışır ve tasarım modülü geliştirme aşamasında olduğu sürece ücretsizdir."
    },
    {
      "q": "Stabileo CIRSOC kontrolleri için ücretsiz mi?",
      "a": "Evet, bugün ücretsiz. Analiz (Temel) ücretsizdir. Yönetmeliğe göre tasarım modülü geliştirme aşamasındadır ve bu süre boyunca ücretsizdir; sonrasında da devlet üniversiteleri ve geliştirilmesine katkıda bulunanlar için ücretsiz kalır."
    },
    {
      "q": "Stabileo'yu imzalayacağım bir hesap için kullanabilir miyim?",
      "a": "Hangi program kullanılırsa kullanılsın, bir tasarımın sorumluluğu onu imzalayan mühendise aittir. Stabileo neyin hangi düzeyde doğrulandığını yayımlar; henüz yetkili bir mühendis tarafından bağımsız olarak incelenmedi ve çelik deneysel olarak işaretli, bu nedenle belirleyici çubukları elle kontrol edin."
    },
    {
      "q": "CIRSOC 201'in hangi baskısını kullanıyor?",
      "a": "2025 baskısını. Daha eski projeler için projenin yönetmelik ayarlarında 2005 seçilebilir, ancak bu baskıyla kiriş ve kolon tasarımı henüz mevcut değil. Hesap motorunun kontrolleri INTI-CIRSOC 201-2005 çözümlü örnekleriyle karşılaştırılır."
    }
  ]
};

export default body;
