import type { Post } from '../types';

export const release061: Post = {
  slug: 'stabileo-0-6-1',
  date: '2026-11-15',
  "order": 18,
  "authors": [
    "Federico Carrone"
  ],
  "tagKeys": [
    "blog.tag.safety",
    "blog.tag.verification",
    "blog.tag.solver"
  ],
  "i18n": {
    "en": {
      "title": "Stabileo 0.6.1: corrected member checks and snow loads",
      "excerpt": "Re-run affected concrete and steel design checks. For generated snow, regenerate the loads first, then re-run affected load cases, combinations, envelopes and derived design checks.",
      "blocks": [
        {
          "k": "p",
          "t": "Re-run affected concrete and steel design checks. For generated snow, regenerate the loads first, then re-run affected load cases, combinations, envelopes and derived design checks. Re-solving previously saved loads alone does not repair them. Compare demands, capacities, reinforcement, utilization, governing combinations and certificates with results already used. Review delivered calculations and sizing based on them. A refusal, an unavailable quantity or unchecked reinforcement supplies no passing answer and is not zero demand."
        },
        {
          "k": "note",
          "t": "The following five High-severity advisories are fixed in 0.6.1. Follow each advisory for its affected inputs and user action, even if earlier results passed or were certified."
        },
        {
          "k": "h",
          "t": "Safety advisories"
        },
        {
          "k": "table",
          "caption": "Safety advisories",
          "head": [
            "Advisory",
            "Severity",
            "What changed and what to do"
          ],
          "rows": [
            [
              "SA-2026-064",
              "High",
              "Steel Cb could come from another combination or an unlocated short unbraced span (#1316, #2088). Re-run CIRSOC 301 steel checks and review flexural capacity, interaction utilization and governing combinations."
            ],
            [
              "SA-2026-065",
              "High",
              "Roof-step drift could be omitted on a pitched receiving roof (#2082). Regenerate CIRSOC 104 snow loads and re-run affected analyses and design checks."
            ],
            [
              "SA-2026-066",
              "High",
              "Concrete Cm could receive end-moment credit with transverse load between supports (#2089). Re-check slender concrete columns and walls, magnified moments and reinforcement."
            ],
            [
              "SA-2026-067",
              "High",
              "Plan rotation could change generated snow loads (#2093). Regenerate loads using the actual roof geometry, then re-run analyses and checks; rotating an old model back is not a repair."
            ],
            [
              "SA-2026-068",
              "High",
              "Torsion could pass with inadequate designed stirrups (#2141). Re-run concrete design checks and review actual transverse capacity, stirrup spacing and torsion failures. Unchecked longitudinal provision is not a passing cage."
            ]
          ]
        },
        {
          "k": "ext",
          "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
          "label": "Safety advisories index",
          "t": "Safety advisories:"
        },
        {
          "k": "h",
          "t": "Every results-change notice since v0.6.0"
        },
        {
          "k": "p",
          "t": "The registry at v0.6.0 ends at results version 78; this release reaches 80. The table lists all 24 new notices. Several notices share a version. Re-run every applicable check; for snow notices, regenerate loads before re-solving."
        },
        {
          "k": "table",
          "caption": "Every results-change notice since v0.6.0",
          "head": [
            "Results version",
            "Result that changes"
          ],
          "rows": [
            [
              "79",
              "Snow drift coverage follows continuous roof edges"
            ],
            [
              "79",
              "Snow overrides preserve unbalanced sides and section runs"
            ],
            [
              "79",
              "Flat snow frames follow connected roof runs"
            ],
            [
              "79",
              "Snow loads respect local positions and drift boundaries"
            ],
            [
              "79",
              "Snow factors follow each roof orientation"
            ],
            [
              "79",
              "Snow cases cover every ridge orientation"
            ],
            [
              "79",
              "Snow fetch follows continuous roofs and selected geometry"
            ],
            [
              "79",
              "Snow loads retain their magnitude under plan rotation"
            ],
            [
              "79",
              "Roof-step drift uses the receiving roof plane"
            ],
            [
              "79",
              "Snow loads follow each connected roof surface"
            ],
            [
              "79",
              "Snow tributaries use interior roof surfaces"
            ],
            [
              "80",
              "Member checks require every active combination"
            ],
            [
              "80",
              "Complete station data is required for member checks"
            ],
            [
              "80",
              "Concurrent checks retain governing demands"
            ],
            [
              "80",
              "Design uses selected bars and known span loading"
            ],
            [
              "80",
              "Interaction checks use concurrent station forces"
            ],
            [
              "80",
              "Concrete checks retain secondary slenderness"
            ],
            [
              "80",
              "Concurrent cases retain all required torsion reinforcement"
            ],
            [
              "80",
              "Fixed reinforcement retains the practical maximum check"
            ],
            [
              "80",
              "Design demands respect behaviour and flange spans"
            ],
            [
              "80",
              "Torsion checks every returned stirrup cage"
            ],
            [
              "80",
              "Shared beams retain their axes; torsion provision must be stated"
            ],
            [
              "80",
              "Steel interaction Cb uses its own combination diagram"
            ],
            [
              "80",
              "Steel stations use physical lengths and retain shear demands"
            ]
          ]
        },
        {
          "k": "ext",
          "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.6.1.md",
          "label": "Full 0.6.1 release notes",
          "t": "Every results-change notice since v0.6.0:"
        },
        {
          "k": "img",
          "base": "blog/results-recheck",
          "w": 1600,
          "h": 1000,
          "alt": "A results re-check dialog in Stabileo Basic, listing changes affecting an older saved project.",
          "caption": "Your results may change: re-run affected projects"
        },
        {
          "k": "h",
          "t": "Other changes"
        },
        {
          "k": "p",
          "t": "Concrete and steel checks retain forces from the same combination and station. Incomplete combination or station data now refuses instead of borrowing an endpoint result. Required and provided reinforcement states remain separate, and missing longitudinal torsion provision is reported explicitly."
        },
        {
          "k": "h",
          "t": "Known limitations"
        },
        {
          "k": "ul",
          "items": [
            "Known wrong results remain open: #2096, #2142, #2143 and #2144. This release does not fix them. Consult their affected scope and independently verify affected results before use.",
            "SA-2026-056 remains unfixed: independently verify dynamic demands for constrained mixed frame-and-shell models that change materially after renumbering, rotation or unit conversion. No conservative correction factor is established.",
            "2D plastic collapse remains refused pending #758, as described in SA-2026-044. A certified 3D lower bound does not certify the raw hinge history.",
            "Time history does not provide total dynamic support demands. Use an independent analysis including inertia, damping and support loading. Unsupported cable analyses and nonzero prescribed support motion in cable/time-history workflows refuse explicitly.",
            "Spatial arc-length and displacement-control solvers are not added. Existing warnings and restrictions remain applicable."
          ]
        },
        {
          "k": "ext",
          "href": "https://github.com/lambdaclass/stabileo/blob/main/CHANGELOG.md",
          "label": "Changelog",
          "t": "Changelog:"
        }
      ]
    },
    "es": {
      "title": "Stabileo 0.6.1: verificaciones de miembros y cargas de nieve corregidas",
      "excerpt": "Repetí las verificaciones de hormigón y acero afectadas. Para nieve generada, regenerá primero las cargas y después recalculá los casos, combinaciones, envolventes y verificaciones de diseño afectados.",
      "blocks": [
        {
          "k": "p",
          "t": "Repetí las verificaciones de hormigón y acero afectadas. Para nieve generada, regenerá primero las cargas y después recalculá los casos, combinaciones, envolventes y verificaciones de diseño afectados. Resolver de nuevo con las cargas guardadas no las corrige. Compará demandas, capacidades, armaduras, utilización, combinaciones determinantes y certificados con los resultados ya utilizados. Revisá los cálculos entregados y el dimensionamiento basado en ellos. Un rechazo, una cantidad no disponible o una armadura sin verificar no equivalen a una aprobación ni a demanda nula."
        },
        {
          "k": "note",
          "t": "Los siguientes cinco avisos de severidad Alta se corrigen en 0.6.1. Seguí cada aviso para conocer los datos afectados y las acciones necesarias, aunque los resultados anteriores hayan aprobado o recibido un certificado."
        },
        {
          "k": "h",
          "t": "Avisos de seguridad"
        },
        {
          "k": "table",
          "caption": "Avisos de seguridad",
          "head": [
            "Aviso",
            "Severidad",
            "Qué cambió y qué hacer"
          ],
          "rows": [
            [
              "SA-2026-064",
              "Alta",
              "El Cb del acero podía proceder de otra combinación o de un tramo corto sin posiciones de arriostramiento conocidas (#1316, #2088). Repetí las verificaciones CIRSOC 301 y revisá capacidad a flexión, utilización de la interacción y combinaciones determinantes."
            ],
            [
              "SA-2026-065",
              "Alta",
              "Podía omitirse la acumulación en un desnivel sobre una cubierta receptora inclinada (#2082). Regenerá las cargas de nieve CIRSOC 104 y recalculá los análisis y verificaciones afectados."
            ],
            [
              "SA-2026-066",
              "Alta",
              "El Cm del hormigón podía reducirse por los momentos extremos aun con carga transversal entre apoyos (#2089). Revisá columnas y tabiques esbeltos, momentos amplificados y armaduras."
            ],
            [
              "SA-2026-067",
              "Alta",
              "Un giro en planta podía cambiar las cargas de nieve generadas (#2093). Regenerá las cargas con la geometría real y repetí los análisis y verificaciones; girar el modelo de vuelta no lo corrige."
            ],
            [
              "SA-2026-068",
              "Alta",
              "La torsión podía aprobar con estribos diseñados insuficientes (#2141). Repetí las verificaciones de hormigón y revisá capacidad transversal real, separación de estribos y fallas por torsión. La armadura longitudinal sin verificar no constituye una jaula aprobada."
            ]
          ]
        },
        {
          "k": "ext",
          "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
          "label": "Índice de avisos de seguridad",
          "t": "Avisos de seguridad:"
        },
        {
          "k": "h",
          "t": "Todos los avisos de cambio de resultados desde v0.6.0"
        },
        {
          "k": "p",
          "t": "El registro de v0.6.0 termina en la versión de resultados 78; esta versión llega a 80. La tabla enumera los 24 avisos nuevos. Varios comparten versión. Repetí cada verificación aplicable; para nieve, regenerá las cargas antes de resolver."
        },
        {
          "k": "table",
          "caption": "Todos los avisos de cambio de resultados desde v0.6.0",
          "head": [
            "Versión de resultados",
            "Resultado que cambia"
          ],
          "rows": [
            [
              "79",
              "La acumulación de nieve sigue los bordes continuos"
            ],
            [
              "79",
              "La nieve conserva los lados desequilibrados y los tramos de cubierta"
            ],
            [
              "79",
              "El marco de nieve sigue los tramos conectados de cubiertas planas"
            ],
            [
              "79",
              "Las cargas de nieve respetan las posiciones y límites locales"
            ],
            [
              "79",
              "Los factores de nieve siguen la orientación de cada cubierta"
            ],
            [
              "79",
              "Los casos de nieve cubren cada orientación de cumbrera"
            ],
            [
              "79",
              "La nieve usa cubiertas continuas y la geometría seleccionada"
            ],
            [
              "79",
              "Las cargas de nieve conservan su magnitud al girar en planta"
            ],
            [
              "79",
              "La acumulación en desniveles usa el plano receptor"
            ],
            [
              "79",
              "Las cargas de nieve siguen cada superficie de cubierta conectada"
            ],
            [
              "79",
              "Las áreas tributarias de nieve usan el interior de la cubierta"
            ],
            [
              "80",
              "Las verificaciones requieren todas las combinaciones activas"
            ],
            [
              "80",
              "Las verificaciones requieren datos completos por estación"
            ],
            [
              "80",
              "Las verificaciones simultáneas conservan las demandas determinantes"
            ],
            [
              "80",
              "El diseño usa las barras elegidas y las cargas del tramo"
            ],
            [
              "80",
              "Las interacciones usan esfuerzos simultáneos por estación"
            ],
            [
              "80",
              "El hormigón conserva la esbeltez secundaria"
            ],
            [
              "80",
              "Los casos concurrentes conservan toda la armadura de torsión requerida"
            ],
            [
              "80",
              "La armadura fija conserva la verificación del máximo práctico"
            ],
            [
              "80",
              "Las demandas de diseño respetan el comportamiento y los tramos de las alas"
            ],
            [
              "80",
              "La torsión verifica todos los estribos provistos"
            ],
            [
              "80",
              "Las vigas conservan su eje; la provisión por torsión debe declararse"
            ],
            [
              "80",
              "El Cb de la interacción del acero usa el diagrama de su propia combinación"
            ],
            [
              "80",
              "Las estaciones de acero usan longitudes físicas y conservan el corte"
            ]
          ]
        },
        {
          "k": "ext",
          "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.6.1.es.md",
          "label": "Notas completas de la versión 0.6.1",
          "t": "Todos los avisos de cambio de resultados desde v0.6.0:"
        },
        {
          "k": "img",
          "base": "blog/results-recheck",
          "w": 1600,
          "h": 1000,
          "alt": "Un diálogo de revisión de resultados en Stabileo Básico, con cambios que afectan a un proyecto guardado anteriormente.",
          "caption": "Tus resultados pueden cambiar: volvé a calcular los proyectos afectados"
        },
        {
          "k": "h",
          "t": "Otros cambios"
        },
        {
          "k": "p",
          "t": "Las verificaciones de hormigón y acero conservan fuerzas de la misma combinación y estación. Ahora se rechazan datos incompletos de combinaciones o estaciones en lugar de sustituirlos por resultados de extremos. Los estados de armadura requerida y provista quedan separados, y la falta de provisión longitudinal para torsión se informa explícitamente."
        },
        {
          "k": "h",
          "t": "Limitaciones conocidas"
        },
        {
          "k": "ul",
          "items": [
            "Siguen abiertos resultados incorrectos conocidos: #2096, #2142, #2143 y #2144. Esta versión no los corrige. Consultá su alcance y verificá independientemente los resultados afectados antes de usarlos.",
            "SA-2026-056 sigue sin corregirse: verificá independientemente las demandas dinámicas de modelos mixtos de barras y cáscaras con restricciones que cambien materialmente al renumerar, girar o convertir unidades. No hay un factor de corrección conservador establecido.",
            "El colapso plástico 2D sigue rechazándose hasta resolver #758, según SA-2026-044. Una cota inferior 3D certificada no certifica la historia de rótulas sin certificar.",
            "La historia temporal no proporciona demandas dinámicas totales en apoyos. Usá un análisis independiente que incluya inercia, amortiguamiento y cargas en apoyos. Los análisis de cables no admitidos y el movimiento impuesto no nulo en cables o historia temporal se rechazan explícitamente.",
            "No se agregan solvers espaciales de longitud de arco ni control de desplazamiento. Siguen vigentes las advertencias y restricciones existentes."
          ]
        },
        {
          "k": "ext",
          "href": "https://github.com/lambdaclass/stabileo/blob/main/CHANGELOG.md",
          "label": "Registro de cambios",
          "t": "Registro de cambios:"
        }
      ]
    },
    "pt": {
      "title": "Stabileo 0.6.1: verificações de membros e cargas de neve corrigidas",
      "excerpt": "Refaça as verificações de concreto e aço afetadas. Para neve gerada, gere novamente as cargas primeiro e depois recalcule os casos, combinações, envoltórias e verificações de projeto afetados.",
      "blocks": [
        {
          "k": "p",
          "t": "Refaça as verificações de concreto e aço afetadas. Para neve gerada, gere novamente as cargas primeiro e depois recalcule os casos, combinações, envoltórias e verificações de projeto afetados. Resolver novamente com cargas salvas não as corrige. Compare demandas, capacidades, armaduras, utilização, combinações determinantes e certificados com os resultados já utilizados. Revise os cálculos entregues e o dimensionamento baseado neles. Uma recusa, uma grandeza indisponível ou uma armadura não verificada não representa aprovação nem demanda nula."
        },
        {
          "k": "note",
          "t": "Os cinco avisos de severidade Alta abaixo são corrigidos em 0.6.1. Siga cada aviso para identificar entradas afetadas e ações necessárias, mesmo que os resultados anteriores tenham sido aprovados ou certificados."
        },
        {
          "k": "h",
          "t": "Avisos de segurança"
        },
        {
          "k": "table",
          "caption": "Avisos de segurança",
          "head": [
            "Aviso",
            "Severidade",
            "O que mudou e o que fazer"
          ],
          "rows": [
            [
              "SA-2026-064",
              "Alta",
              "O Cb do aço podia vir de outra combinação ou de um trecho curto sem posições conhecidas dos travamentos (#1316, #2088). Refaça as verificações CIRSOC 301 e revise capacidade à flexão, utilização da interação e combinações determinantes."
            ],
            [
              "SA-2026-065",
              "Alta",
              "A acumulação no desnível podia ser omitida em uma cobertura receptora inclinada (#2082). Gere novamente as cargas de neve CIRSOC 104 e recalcule análises e verificações afetadas."
            ],
            [
              "SA-2026-066",
              "Alta",
              "O Cm do concreto podia receber redução pelos momentos de extremidade com carga transversal entre apoios (#2089). Verifique pilares e paredes esbeltos, momentos amplificados e armaduras."
            ],
            [
              "SA-2026-067",
              "Alta",
              "A rotação em planta podia mudar as cargas de neve geradas (#2093). Gere novamente as cargas com a geometria real e refaça análises e verificações; girar o modelo de volta não o corrige."
            ],
            [
              "SA-2026-068",
              "Alta",
              "A torção podia passar com estribos dimensionados insuficientes (#2141). Refaça as verificações de concreto e revise capacidade transversal real, espaçamento dos estribos e falhas por torção. Armadura longitudinal não verificada não constitui uma gaiola aprovada."
            ]
          ]
        },
        {
          "k": "ext",
          "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
          "label": "Índice de avisos de segurança",
          "t": "Avisos de segurança:"
        },
        {
          "k": "h",
          "t": "Todos os avisos de mudança de resultados desde v0.6.0"
        },
        {
          "k": "p",
          "t": "O registro de v0.6.0 termina na versão de resultados 78; esta versão chega a 80. A tabela lista os 24 novos avisos. Vários compartilham uma versão. Refaça cada verificação aplicável; para neve, gere novamente as cargas antes de resolver."
        },
        {
          "k": "table",
          "caption": "Todos os avisos de mudança de resultados desde v0.6.0",
          "head": [
            "Versão de resultados",
            "Resultado que muda"
          ],
          "rows": [
            [
              "79",
              "A acumulação de neve segue bordas contínuas"
            ],
            [
              "79",
              "A neve preserva lados desequilibrados e trechos da cobertura"
            ],
            [
              "79",
              "O referencial de neve segue os trechos conectados da cobertura plana"
            ],
            [
              "79",
              "As cargas de neve respeitam posições e limites locais"
            ],
            [
              "79",
              "Os fatores de neve seguem a orientação de cada cobertura"
            ],
            [
              "79",
              "Os casos de neve cobrem cada orientação de cumeeira"
            ],
            [
              "79",
              "A neve usa coberturas contínuas e a geometria selecionada"
            ],
            [
              "79",
              "As cargas de neve mantêm sua magnitude ao girar em planta"
            ],
            [
              "79",
              "A acumulação em desníveis usa o plano receptor"
            ],
            [
              "79",
              "As cargas de neve seguem cada superfície conectada da cobertura"
            ],
            [
              "79",
              "As áreas tributárias de neve usam o interior da cobertura"
            ],
            [
              "80",
              "As verificações exigem todas as combinações ativas"
            ],
            [
              "80",
              "As verificações exigem dados completos por estação"
            ],
            [
              "80",
              "As verificações simultâneas preservam os esforços determinantes"
            ],
            [
              "80",
              "O projeto usa as barras escolhidas e as cargas do trecho"
            ],
            [
              "80",
              "Interações usam esforços simultâneos por estação"
            ],
            [
              "80",
              "O concreto preserva a esbeltez secundária"
            ],
            [
              "80",
              "Os casos concorrentes mantêm toda a armadura de torção necessária"
            ],
            [
              "80",
              "A armadura fixa mantém a verificação do máximo prático"
            ],
            [
              "80",
              "Os esforços de projeto respeitam o comportamento e os trechos das mesas"
            ],
            [
              "80",
              "A torção verifica todos os estribos fornecidos"
            ],
            [
              "80",
              "Vigas mantêm seus eixos; a armadura de torção deve ser declarada"
            ],
            [
              "80",
              "O Cb da interação do aço usa o diagrama da própria combinação"
            ],
            [
              "80",
              "As estações de aço usam comprimentos físicos e preservam o corte"
            ]
          ]
        },
        {
          "k": "ext",
          "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.6.1.pt.md",
          "label": "Notas completas da versão 0.6.1",
          "t": "Todos os avisos de mudança de resultados desde v0.6.0:"
        },
        {
          "k": "img",
          "base": "blog/results-recheck",
          "w": 1600,
          "h": 1000,
          "alt": "Um diálogo de revisão de resultados no Stabileo Básico, listando mudanças que afetam um projeto salvo anteriormente.",
          "caption": "Seus resultados podem mudar: recalcule os projetos afetados"
        },
        {
          "k": "h",
          "t": "Outras mudanças"
        },
        {
          "k": "p",
          "t": "As verificações de concreto e aço preservam forças da mesma combinação e estação. Dados incompletos de combinações ou estações são recusados em vez de substituídos por resultados de extremidade. Os estados de armadura necessária e fornecida ficam separados, e a falta de armadura longitudinal fornecida para torção é indicada explicitamente."
        },
        {
          "k": "h",
          "t": "Limitações conhecidas"
        },
        {
          "k": "ul",
          "items": [
            "Resultados incorretos conhecidos continuam em aberto: #2096, #2142, #2143 e #2144. Esta versão não os corrige. Consulte seu escopo e verifique os resultados afetados de forma independente antes de utilizá-los.",
            "SA-2026-056 continua sem correção: verifique independentemente as demandas dinâmicas de modelos mistos de barras e cascas com restrições que mudem materialmente após renumeração, rotação ou conversão de unidades. Não há fator de correção conservador estabelecido.",
            "O colapso plástico 2D continua recusado até a resolução de #758, conforme SA-2026-044. Um limite inferior 3D certificado não certifica o histórico bruto de rótulas.",
            "O histórico temporal não fornece demandas dinâmicas totais nos apoios. Use análise independente incluindo inércia, amortecimento e cargas nos apoios. Análises de cabos não suportadas e movimento imposto não nulo em cabos ou histórico temporal são recusados explicitamente.",
            "Não são adicionados solvers espaciais de comprimento de arco ou controle de deslocamento. As advertências e restrições existentes permanecem aplicáveis."
          ]
        },
        {
          "k": "ext",
          "href": "https://github.com/lambdaclass/stabileo/blob/main/CHANGELOG.md",
          "label": "Registro de mudanças",
          "t": "Registro de mudanças:"
        }
      ]
    }
  }
};
