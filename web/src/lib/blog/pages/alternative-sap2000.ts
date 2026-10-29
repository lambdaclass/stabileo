import type { StandingPage } from './cirsoc';

export const sap2000Page: StandingPage = {
  path: '/alternatives/sap2000',
  updated: '2026-10-29',
  i18n: {
  "en": {
    "title": "A free, open-source alternative to SAP2000",
    "description": "Compare Stabileo with your SAP2000 workflow: free browser analysis, open source, verification evidence, current limits and planned import.",
    "eyebrow": "A free, open-source alternative to SAP2000",
    "lead": "Stabileo offers free, open-source structural analysis in your browser. Whether it fits your SAP2000 workflow depends on the analysis and checks you need; this is not a claim of feature parity.",
    "blocks": [
      {
        "k": "h",
        "t": "What Stabileo covers today"
      },
      {
        "k": "p",
        "t": "The solver capability matrix records 2D and 3D linear static analysis, frames and trusses, load combinations and envelopes, P-Delta, buckling and modal analysis. It also documents plate and shell families. Basic is available; PRO workflows remain in development."
      },
      {
        "k": "p",
        "t": "For frame and truss workflows, Basic provides 2D and 3D modeling, loads, analysis, force diagrams and deformed shapes. Start with a documented benchmark and check that the analysis path matches your project."
      },
      {
        "k": "h",
        "t": "Current limits"
      },
      {
        "k": "p",
        "t": "SAP2000/ETABS model import is planned, not available. Do not expect to open .s2k or .e2k files. The capability matrix records remaining gaps in nonlinear robustness, mixed frame/shell cases and larger-model validation. The AI assistant is in development, coming later."
      },
      {
        "k": "h",
        "t": "How results are verified"
      },
      {
        "k": "p",
        "t": "Published benchmarks, comparisons with independent implementations, and tests provide different levels of evidence. Supported analyses and design checks can carry machine-checked bounds; this does not certify every result or the engineering model. The maturity matrix lists each family’s evidence and open issues."
      },
      {
        "k": "ext",
        "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/BENCHMARKS.md#solver-capability-matrix",
        "label": "Solver capabilities",
        "t": ""
      },
      {
        "k": "ext",
        "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/MATURITY.md",
        "label": "Verification maturity",
        "t": ""
      },
      {
        "k": "ext",
        "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/roadmap/PRODUCT_ROADMAP.md",
        "label": "Product roadmap",
        "t": ""
      }
    ],
    "faqTitle": "Sources and scope",
    "faq": [
      {
        "q": "Is this a complete replacement for SAP2000?",
        "a": "No feature-for-feature equivalence is claimed. Review the documented capabilities and limits for your project. SAP2000 is named only to identify the workflow being compared; no affiliation or endorsement is implied."
      }
    ]
  },
  "es": {
    "title": "Una alternativa gratis y de código abierto a SAP2000",
    "description": "Compará Stabileo con tu flujo de SAP2000: análisis gratis en el navegador, código abierto, evidencia de verificación, límites e importación prevista.",
    "eyebrow": "Una alternativa gratis y de código abierto a SAP2000",
    "lead": "Stabileo ofrece análisis estructural gratis y de código abierto en tu navegador. Su utilidad para tu flujo de SAP2000 depende de los análisis y verificaciones que necesites; no implica equivalencia de funciones.",
    "blocks": [
      {
        "k": "h",
        "t": "Qué cubre Stabileo hoy"
      },
      {
        "k": "p",
        "t": "La matriz de capacidades documenta análisis estático lineal 2D y 3D, pórticos y reticulados, combinaciones y envolventes, P-Delta, pandeo y análisis modal. También documenta familias de placas y láminas. Básico está disponible; los flujos PRO siguen en desarrollo."
      },
      {
        "k": "p",
        "t": "Para flujos de pórticos y reticulados, Básico ofrece modelado 2D y 3D, cargas, análisis, diagramas de esfuerzos y deformadas. Empezá con un benchmark documentado y comprobá que el tipo de análisis corresponda a tu proyecto."
      },
      {
        "k": "h",
        "t": "Límites actuales"
      },
      {
        "k": "p",
        "t": "La importación de modelos SAP2000/ETABS está prevista, no disponible. No se pueden abrir archivos .s2k ni .e2k. La matriz registra brechas en robustez no lineal, casos mixtos de pórticos y láminas y validación de modelos grandes. El asistente de IA está en desarrollo y llegará más adelante."
      },
      {
        "k": "h",
        "t": "Cómo se verifican los resultados"
      },
      {
        "k": "p",
        "t": "Los benchmarks publicados, las comparaciones con implementaciones independientes y los tests aportan distintos niveles de evidencia. Los análisis y verificaciones compatibles pueden incluir cotas verificadas por máquina; eso no certifica cada resultado ni el modelo de ingeniería. La matriz de madurez enumera evidencias y problemas abiertos por familia."
      },
      {
        "k": "ext",
        "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/BENCHMARKS.md#solver-capability-matrix",
        "label": "Capacidades del solver",
        "t": ""
      },
      {
        "k": "ext",
        "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/MATURITY.md",
        "label": "Madurez de verificación",
        "t": ""
      },
      {
        "k": "ext",
        "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/roadmap/PRODUCT_ROADMAP.md",
        "label": "Hoja de ruta del producto",
        "t": ""
      }
    ],
    "faqTitle": "Fuentes y alcance",
    "faq": [
      {
        "q": "¿Reemplaza completamente a SAP2000?",
        "a": "No se afirma equivalencia de funciones. Revisá las capacidades y límites documentados para tu proyecto. El nombre SAP2000 solo identifica el flujo comparado; no implica afiliación ni respaldo."
      }
    ]
  },
  "pt": {
    "title": "Uma alternativa gratuita e de código aberto ao SAP2000",
    "description": "Compare Stabileo com seu fluxo no SAP2000: análise gratuita no navegador, código aberto, evidências de verificação, limites e importação planejada.",
    "eyebrow": "Uma alternativa gratuita e de código aberto ao SAP2000",
    "lead": "Stabileo oferece análise estrutural gratuita e de código aberto no navegador. A adequação ao seu fluxo no SAP2000 depende das análises e verificações necessárias; não implica equivalência de recursos.",
    "blocks": [
      {
        "k": "h",
        "t": "O que Stabileo cobre hoje"
      },
      {
        "k": "p",
        "t": "A matriz de capacidades documenta análise estática linear 2D e 3D, pórticos e treliças, combinações e envoltórias, P-Delta, flambagem e análise modal. Também documenta famílias de placas e cascas. O modo Básico está disponível; os fluxos PRO continuam em desenvolvimento."
      },
      {
        "k": "p",
        "t": "Para fluxos de pórticos e treliças, o modo Básico oferece modelagem 2D e 3D, cargas, análise, diagramas de esforços e deformadas. Comece com um benchmark documentado e confira se o tipo de análise corresponde ao seu projeto."
      },
      {
        "k": "h",
        "t": "Limites atuais"
      },
      {
        "k": "p",
        "t": "A importação de modelos SAP2000/ETABS está planejada, não disponível. Não é possível abrir arquivos .s2k ou .e2k. A matriz registra lacunas de robustez não linear, casos mistos de pórticos e cascas e validação de modelos maiores. O assistente de IA está em desenvolvimento e virá depois."
      },
      {
        "k": "h",
        "t": "Como os resultados são verificados"
      },
      {
        "k": "p",
        "t": "Benchmarks publicados, comparações com implementações independentes e testes fornecem diferentes níveis de evidência. Análises e verificações compatíveis podem incluir limites verificados por máquina; isso não certifica cada resultado nem o modelo de engenharia. A matriz de maturidade lista evidências e questões abertas por família."
      },
      {
        "k": "ext",
        "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/BENCHMARKS.md#solver-capability-matrix",
        "label": "Capacidades do solver",
        "t": ""
      },
      {
        "k": "ext",
        "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/MATURITY.md",
        "label": "Maturidade da verificação",
        "t": ""
      },
      {
        "k": "ext",
        "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/roadmap/PRODUCT_ROADMAP.md",
        "label": "Roteiro do produto",
        "t": ""
      }
    ],
    "faqTitle": "Fontes e escopo",
    "faq": [
      {
        "q": "É uma substituição completa do SAP2000?",
        "a": "Não se afirma equivalência de recursos. Consulte as capacidades e limitações documentadas para seu projeto. O nome SAP2000 apenas identifica o fluxo comparado; não implica afiliação nem endosso."
      }
    ]
  },
  "de": {
    "title": "Eine kostenlose Open-Source-Alternative zu SAP2000",
    "description": "Vergleichen Sie Stabileo mit Ihrem SAP2000-Workflow: kostenlose Browseranalyse, offener Quellcode, Verifikationsnachweise, Grenzen und geplanter Import.",
    "eyebrow": "Eine kostenlose Open-Source-Alternative zu SAP2000",
    "lead": "Stabileo bietet kostenlose Open-Source-Tragwerksanalyse im Browser. Ob es zu Ihrem SAP2000-Workflow passt, hängt von den benötigten Analysen und Nachweisen ab; Funktionsgleichheit wird nicht behauptet.",
    "blocks": [
      {
        "k": "h",
        "t": "Was Stabileo heute abdeckt"
      },
      {
        "k": "p",
        "t": "Die Funktionsmatrix dokumentiert lineare Statik in 2D und 3D, Rahmen und Fachwerke, Lastkombinationen und Einhüllende, P-Delta, Knicken und Modalanalyse sowie Platten- und Schalenfamilien. Basic ist verfügbar; PRO-Workflows sind weiterhin in Entwicklung."
      },
      {
        "k": "p",
        "t": "Für Rahmen und Fachwerke bietet Basic 2D- und 3D-Modellierung, Lasten, Analyse, Schnittgrößendiagramme und Verformungsbilder. Beginnen Sie mit einem dokumentierten Benchmark und prüfen Sie, ob der Analysepfad zu Ihrem Projekt passt."
      },
      {
        "k": "h",
        "t": "Aktuelle Grenzen"
      },
      {
        "k": "p",
        "t": "Der Import von SAP2000/ETABS-Modellen ist geplant und nicht verfügbar. Dateien im Format .s2k oder .e2k können nicht geöffnet werden. Die Matrix nennt Lücken bei nichtlinearer Robustheit, gemischten Rahmen-Schalen-Modellen und der Validierung größerer Modelle. Der KI-Assistent ist in Entwicklung und kommt später."
      },
      {
        "k": "h",
        "t": "Wie Ergebnisse geprüft werden"
      },
      {
        "k": "p",
        "t": "Veröffentlichte Benchmarks, Vergleiche mit unabhängigen Implementierungen und Tests liefern unterschiedliche Nachweise. Unterstützte Analysen und Bemessungsprüfungen können maschinell geprüfte Schranken enthalten; dies zertifiziert nicht jedes Ergebnis oder das Ingenieurmodell. Die Reifematrix nennt Nachweise und offene Probleme je Familie."
      },
      {
        "k": "ext",
        "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/BENCHMARKS.md#solver-capability-matrix",
        "label": "Solver-Funktionen",
        "t": ""
      },
      {
        "k": "ext",
        "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/MATURITY.md",
        "label": "Verifikationsreife",
        "t": ""
      },
      {
        "k": "ext",
        "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/roadmap/PRODUCT_ROADMAP.md",
        "label": "Produkt-Roadmap",
        "t": ""
      }
    ],
    "faqTitle": "Quellen und Geltungsbereich",
    "faq": [
      {
        "q": "Ist dies ein vollständiger Ersatz für SAP2000?",
        "a": "Funktionsgleichheit wird nicht behauptet. Prüfen Sie die dokumentierten Funktionen und Grenzen für Ihr Projekt. SAP2000 bezeichnet nur den verglichenen Workflow; eine Verbindung oder Empfehlung wird nicht behauptet."
      }
    ]
  },
  "fr": {
    "title": "Une alternative gratuite et open source à SAP2000",
    "description": "Comparez Stabileo à votre usage de SAP2000 : analyse gratuite dans le navigateur, code ouvert, preuves de vérification, limites et import prévu.",
    "eyebrow": "Une alternative gratuite et open source à SAP2000",
    "lead": "Stabileo propose une analyse de structures gratuite et open source dans le navigateur. Son adéquation à votre usage de SAP2000 dépend des analyses et vérifications requises ; aucune équivalence fonctionnelle n’est affirmée.",
    "blocks": [
      {
        "k": "h",
        "t": "Ce que Stabileo couvre aujourd’hui"
      },
      {
        "k": "p",
        "t": "La matrice des capacités documente la statique linéaire 2D et 3D, les portiques et treillis, les combinaisons et enveloppes, P-Delta, le flambement et l’analyse modale, ainsi que des familles de plaques et coques. Le mode Basique est disponible ; les parcours PRO restent en développement."
      },
      {
        "k": "p",
        "t": "Pour les portiques et treillis, le mode Basique propose la modélisation 2D et 3D, les charges, l’analyse, les diagrammes d’efforts et les déformées. Commencez par un benchmark documenté et vérifiez que le type d’analyse correspond à votre projet."
      },
      {
        "k": "h",
        "t": "Limites actuelles"
      },
      {
        "k": "p",
        "t": "L’import de modèles SAP2000/ETABS est prévu, mais indisponible. Les fichiers .s2k et .e2k ne peuvent pas être ouverts. La matrice indique des lacunes de robustesse non linéaire, de couplage portiques/coques et de validation des grands modèles. L’assistant IA est en développement, à venir."
      },
      {
        "k": "h",
        "t": "Comment les résultats sont vérifiés"
      },
      {
        "k": "p",
        "t": "Les benchmarks publiés, les comparaisons avec des implémentations indépendantes et les tests apportent différents niveaux de preuve. Les analyses et vérifications prises en charge peuvent inclure des bornes vérifiées par machine ; cela ne certifie pas chaque résultat ni le modèle d’ingénierie. La matrice de maturité recense les preuves et problèmes ouverts par famille."
      },
      {
        "k": "ext",
        "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/BENCHMARKS.md#solver-capability-matrix",
        "label": "Capacités du solveur",
        "t": ""
      },
      {
        "k": "ext",
        "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/MATURITY.md",
        "label": "Maturité de la vérification",
        "t": ""
      },
      {
        "k": "ext",
        "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/roadmap/PRODUCT_ROADMAP.md",
        "label": "Feuille de route du produit",
        "t": ""
      }
    ],
    "faqTitle": "Sources et portée",
    "faq": [
      {
        "q": "Est-ce un remplacement complet de SAP2000 ?",
        "a": "Aucune équivalence fonctionnelle n’est affirmée. Consultez les capacités et limites documentées pour votre projet. Le nom SAP2000 identifie uniquement l’usage comparé ; aucune affiliation ni approbation n’est suggérée."
      }
    ]
  },
  "tr": {
    "title": "SAP2000 için ücretsiz, açık kaynaklı bir alternatif",
    "description": "Stabileo ile SAP2000 iş akışınızı karşılaştırın: ücretsiz tarayıcı analizi, açık kaynak, doğrulama kanıtları, mevcut sınırlar ve planlanan içe aktarma.",
    "eyebrow": "SAP2000 için ücretsiz, açık kaynaklı bir alternatif",
    "lead": "Stabileo tarayıcıda ücretsiz, açık kaynaklı yapı analizi sunar. SAP2000 iş akışınıza uygunluğu gereken analiz ve kontrollere bağlıdır; özellik eşdeğerliği iddia edilmez.",
    "blocks": [
      {
        "k": "h",
        "t": "Stabileo bugün neleri kapsıyor?"
      },
      {
        "k": "p",
        "t": "Yetenek matrisi 2B ve 3B doğrusal statik analizi, çerçeve ve kafesleri, yük birleşimlerini ve zarflarını, P-Delta, burkulma ve modal analizi belgeler. Plak ve kabuk ailelerini de içerir. Temel mod kullanılabilir; PRO iş akışları geliştirilmektedir."
      },
      {
        "k": "p",
        "t": "Çerçeve ve kafes iş akışlarında Temel mod; 2B ve 3B modelleme, yükler, analiz, iç kuvvet diyagramları ve şekil değiştirmiş görünümler sunar. Belgelenmiş bir örnekle başlayın ve analiz yolunun projenize uygunluğunu kontrol edin."
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
        "q": "SAP2000 için tam bir ikame mi?",
        "a": "Özellik eşdeğerliği iddia edilmez. Projeniz için belgelenmiş yetenek ve sınırları inceleyin. SAP2000 adı yalnızca karşılaştırılan iş akışını belirtir; bağlantı veya onay anlamına gelmez."
      }
    ]
  }
}
};
