import type { StandingPage } from './cirsoc';

export const etabsAlternativePage: StandingPage = {
  path: '/etabs-alternative',
  updated: '2026-11-06',
  i18n: {
    es: {
      "title": "Una alternativa gratis y de código abierto a ETABS",
      "description": "Compará Stabileo con tu flujo de ETABS: análisis gratis en el navegador, código abierto, evidencia de verificación, límites e importación prevista.",
      "eyebrow": "Una alternativa gratis y de código abierto a ETABS",
      "lead": "Stabileo ofrece análisis estructural gratis y de código abierto en tu navegador. Su utilidad para tu flujo de ETABS depende de los análisis y verificaciones que necesites; no implica equivalencia de funciones.",
      "blocks": [
        {
          "k": "h",
          "t": "Qué cubre Stabileo hoy"
        },
        {
          "k": "p",
          "t": "La matriz de capacidades documenta análisis estático lineal 2D y 3D, pórticos y reticulados, combinaciones y envolventes, P-Delta, pandeo y análisis modal. También documenta familias de placas y láminas. El análisis en Básico y en PRO está disponible; el diseño normativo y el asistente de IA siguen en desarrollo."
        },
        {
          "k": "p",
          "t": "Para flujos de edificios, distinguí las capacidades de placas y láminas del solver de la interfaz PRO para losas, tabiques y modelos complejos. El diseño normativo en PRO sigue en desarrollo; que exista una función del solver no significa que esté listo el flujo completo de diseño de edificios."
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
          "q": "¿Reemplaza completamente a ETABS?",
          "a": "No se afirma equivalencia de funciones. Revisá las capacidades y límites documentados para tu proyecto. El nombre ETABS solo identifica el flujo comparado; no implica afiliación ni respaldo."
        }
      ]
    },
    en: {
      "title": "A free, open-source alternative to ETABS",
      "description": "Compare Stabileo with your ETABS workflow: free browser analysis, open source, verification evidence, current limits and planned import.",
      "eyebrow": "A free, open-source alternative to ETABS",
      "lead": "Stabileo offers free, open-source structural analysis in your browser. Whether it fits your ETABS workflow depends on the analysis and checks you need; this is not a claim of feature parity.",
      "blocks": [
        {
          "k": "h",
          "t": "What Stabileo covers today"
        },
        {
          "k": "p",
          "t": "The solver capability matrix records 2D and 3D linear static analysis, frames and trusses, load combinations and envelopes, P-Delta, buckling and modal analysis. It also documents plate and shell families. Basic and PRO analysis are available; code design and the AI assistant are in development."
        },
        {
          "k": "p",
          "t": "For building workflows, distinguish the solver’s plate and shell capabilities from the PRO interface for slabs, walls and complex models. Code design in PRO is still in development; the existence of a solver feature does not mean a complete building-design workflow is ready."
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
          "q": "Is this a complete replacement for ETABS?",
          "a": "No feature-for-feature equivalence is claimed. Review the documented capabilities and limits for your project. ETABS is named only to identify the workflow being compared; no affiliation or endorsement is implied."
        }
      ]
    },
    pt: {
      "title": "Uma alternativa gratuita e de código aberto ao ETABS",
      "description": "Compare Stabileo com seu fluxo no ETABS: análise gratuita no navegador, código aberto, evidências de verificação, limites e importação planejada.",
      "eyebrow": "Uma alternativa gratuita e de código aberto ao ETABS",
      "lead": "Stabileo oferece análise estrutural gratuita e de código aberto no navegador. A adequação ao seu fluxo no ETABS depende das análises e verificações necessárias; não implica equivalência de recursos.",
      "blocks": [
        {
          "k": "h",
          "t": "O que Stabileo cobre hoje"
        },
        {
          "k": "p",
          "t": "A matriz de capacidades documenta análise estática linear 2D e 3D, pórticos e treliças, combinações e envoltórias, P-Delta, flambagem e análise modal. Também documenta famílias de placas e cascas. A análise no Básico e no PRO está disponível; o dimensionamento normativo e o assistente de IA continuam em desenvolvimento."
        },
        {
          "k": "p",
          "t": "Para fluxos de edifícios, diferencie as capacidades de placas e cascas do solver da interface PRO para lajes, paredes e modelos complexos. O dimensionamento normativo no PRO continua em desenvolvimento; uma função do solver não significa que o fluxo completo de projeto de edifícios esteja pronto."
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
          "q": "É uma substituição completa do ETABS?",
          "a": "Não se afirma equivalência de recursos. Consulte as capacidades e limitações documentadas para seu projeto. O nome ETABS apenas identifica o fluxo comparado; não implica afiliação nem endosso."
        }
      ]
    },
  },
};
