import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "SAP2000'e ücretsiz ve açık kaynaklı bir alternatif, tarayıcınızda",
  "description": "Stabileo: tarayıcıda ücretsiz, açık kaynaklı yapı analizi. 2B/3B çerçeve, kabuk, P-Delta, modal ve spektral analiz; AISC, ACI, Eurocode ve CIRSOC kontrolleri.",
  "eyebrow": "SAP2000 alternatifi",
  "lead": "Stabileo, tarayıcınızda kurulum, lisans anahtarı veya hesap gerektirmeden çalışan, ücretsiz ve açık kaynaklı (AGPL-3.0) bir yapı analizi yazılımıdır. Çözücü Rust ile yazılmış ve WebAssembly'ye derlenmiştir; böylece model sizin bilgisayarınızda çözülür. Temel modda 2B ve 3B çerçeveler ile kafes kirişler modellenir, yüklenir, çözülür ve sonuçları okunur; geliştirme aşamasında olan ve herkese açık PRO modu ise döşemeler ve perde duvarlar, DXF ve IFC içe aktarma, yönetmelik yükleri ve çubuk kontrolleri ekler.",
  "blocks": [
    {
      "k": "h",
      "t": "Ne zaman iyi bir alternatif olur"
    },
    {
      "k": "ul",
      "items": [
        "Çerçeveleri, kafes kirişleri ve binaları lisans ücreti ödemeden ve hiçbir şey kurmadan, modern bir tarayıcısı olan her işletim sisteminde analiz etmek.",
        "Başka bir programın sonuçlarını kontrol etmek: Stabileo diğer yedi sonlu eleman programıyla karşılaştırılır ve kodunun her satırı okunabilir.",
        "Öğretmek ve öğrenmek: rijitlik yöntemini adım adım gösterir.",
        "Çelik ve betonarme çubukları PRO modunda AISC 360, EN 1993-1-1, AISI S100, ACI 318, EN 1992-1-1 ve Arjantin'in CIRSOC yönetmeliklerine göre kontrol etmek."
      ]
    },
    {
      "k": "h",
      "t": "Ne zaman henüz olmaz"
    },
    {
      "k": "ul",
      "items": [
        "Köklü bir ticari programın sunduğu tasarım yönetmeliği yelpazesine ve onlarca yıllık geçmişine ihtiyacınız varsa: PRO modu hâlâ geliştirme aşamasında.",
        "Firmanız yetkili bir mühendis tarafından bağımsız olarak incelenmiş bir yazılım gerektiriyorsa: bu inceleme henüz yapılmadı."
      ]
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Sonuçları nasıl kontrol ediyoruz ve kontroller nerede bitiyor:"
    }
  ],
  "faqTitle": "Sıkça sorulan sorular",
  "faq": [
    {
      "q": "SAP2000'e en iyi ücretsiz alternatif hangisi?",
      "a": "SAP2000'i ne için kullandığınıza bağlı. Hiçbir şey kurmadan tarayıcıda 2B ve 3B çerçeve, kafes kiriş ve kabuk analizi için Stabileo ücretsiz ve açık kaynaklıdır. Betikle yürütülen doğrusal olmayan araştırma analizleri için uzun süredir kullanılan açık kaynaklı seçenek OpenSees'tir."
    },
    {
      "q": "SAP2000 veya ETABS lisansı için ödeme yapmak yerine Stabileo'yu kullanabilir miyim?",
      "a": "Çerçevelerin, kafes kirişlerin ve birçok binanın analizi ile AISC 360, ACI 318, Eurocode'lar ve CIRSOC'a göre çubuk kontrolleri için evet, ücretsiz olarak. Tasarım yönetmeliklerinin tam yelpazesi ve uzun bir kullanım geçmişi için ticari programlar hâlâ daha fazlasını sunuyor; Stabileo'nun PRO modu geliştirme aşamasında."
    },
    {
      "q": "Stabileo gerçekten ücretsiz mi?",
      "a": "Analiz (Temel ve PRO) herkes için ücretsizdir. Yönetmeliğe göre tasarım geliştirme aşamasında olduğu sürece ücretsizdir; sonrasında da devlet üniversiteleri ve geliştirilmesine katkıda bulunanlar için ücretsiz kalır. YZ asistanı ücretli olacak. Kod AGPL-3.0 lisanslıdır."
    },
    {
      "q": "Mac veya Linux'ta çalışır mı?",
      "a": "Evet. Her işletim sisteminde, modern herhangi bir tarayıcıda çalışır."
    }
  ]
};

export default body;
