import type { Post } from '../types';

export const release060: Post = {
  slug: 'stabileo-0-6-0',
  date: '2026-11-14',
  "order": 17,
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
      "title": "Stabileo 0.6.0: re-run affected projects",
      "excerpt": "Re-run affected analyses and review the results you already used. SA-2026-048 through SA-2026-063 explain what to check; SA-2026-056 remains unfixed.",
      "blocks": [
        {
          "k": "p",
          "t": "Re-run affected load cases, combinations and complete nonlinear or staged histories. Compare displacements, member forces, reactions and design demands with the results already used. Review delivered calculations and sizing based on them. Follow each advisory for its affected inputs and user action. A refusal or an unavailable quantity supplies no replacement answer: it is not zero demand or a passing check."
        },
        {
          "k": "note",
          "t": "Advisories SA-2026-048 through SA-2026-063 were added after v0.5.0. The fixes below are included in 0.6.0, except SA-2026-056, which remains unfixed. Re-check the features listed here even if the earlier analysis converged or its displacements looked plausible."
        },
        {
          "k": "h",
          "t": "Safety advisories"
        },
        {
          "k": "table",
          "caption": "Safety advisories SA-2026-048 through SA-2026-063",
          "head": [
            "Advisory",
            "Severity",
            "What changed and what to do"
          ],
          "rows": [
            [
              "SA-2026-048",
              "High",
              "CIRSOC 301 omitted end moments from Mmax for any section with a shortened unbraced segment; channels and tees in double curvature could also miss a sign change. Re-check all CIRSOC 301 members with a declared Lb shorter than the member, including steel checks and optimiser proposals."
            ],
            [
              "SA-2026-049",
              "High",
              "Rigid restraint plus spring could become an elastic support in 3D. Choose the intended boundary condition explicitly and re-run affected analyses."
            ],
            [
              "SA-2026-050",
              "Medium",
              "Failed slenderness could become zero, and multi-case results could contain non-finite numbers. Discard those values, review inputs and re-run."
            ],
            [
              "SA-2026-051",
              "High",
              "3D moving loads missed interior peaks and axial axle weight. Re-run envelopes and review member sizing and design demands."
            ],
            [
              "SA-2026-052",
              "High",
              "2D/3D moving-load axial envelopes missed distributed-load boundaries. Re-run and check interior axial extrema; reducing the train step alone is insufficient."
            ],
            [
              "SA-2026-053",
              "Low",
              "Moving-load envelopes included exterior force limits at member-end loads. Re-run axial/shear envelopes and review sizing, retaining support reactions in equilibrium checks."
            ],
            [
              "SA-2026-054",
              "High",
              "Linear solves could return unresolved stiffness responses or miss a load component. Re-run static cases and combinations; independently verify demands when the corrected solver refuses."
            ],
            [
              "SA-2026-055",
              "High",
              "P-Delta understated amplification under axial span loads. Re-run affected analyses and derived checks, verify mesh convergence and reassess stability."
            ],
            [
              "SA-2026-056",
              "High",
              "Unfixed: constrained mixed frame/shell dynamics change under equivalent model descriptions. Independently verify affected demands before using them; no conservative correction factor is established."
            ],
            [
              "SA-2026-057",
              "Medium",
              "Plastic displays could call an outside factor inside its interval. Re-run certificates and compare exact endpoints. A resource refusal does not prove that no mechanism exists."
            ],
            [
              "SA-2026-058",
              "High",
              "Large harmonic models retained inaccurate omitted-mode responses. Re-run sweeps and review amplitude, phase and peaks, including frequencies outside the truncation warning."
            ],
            [
              "SA-2026-059",
              "High",
              "Advanced web analyses gave cables compressive resistance. Use the supported dedicated cable solver or independent analysis; advanced cable workflows now refuse explicitly."
            ],
            [
              "SA-2026-060",
              "High",
              "Staged artificial rotational stiffness changed translations and member actions. Re-run full staged histories with releases or support springs and review derived design demands."
            ],
            [
              "SA-2026-061",
              "High",
              "Path reactions were omitted or recovered at the wrong load; staged and dynamic forces could be missing. Re-run and review support, connection and foundation demands. Unavailable forces are not zero; total dynamic reactions remain unavailable."
            ],
            [
              "SA-2026-062",
              "High",
              "An initial elastic refusal could become a successful zero raw 3D plastic collapse factor. Re-run affected plastic analyses; a numerical refusal is not evidence of collapse at zero load."
            ],
            [
              "SA-2026-063",
              "High",
              "Constraints dropped prescribed restrained-master motion. Re-run complete histories and review displacements, member forces and reactions together with SA-2026-061. Unsupported cable/time-history support motion now refuses."
            ]
          ]
        },
        {
          "k": "ext",
          "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
          "label": "Safety advisories index",
          "t": "Read each applicable advisory for its affected inputs and required action:"
        },
        {
          "k": "h",
          "t": "Other changes that affect answers"
        },
        {
          "k": "p",
          "t": "The results registry ends at version 49 in 0.5.0 and reaches 78 in 0.6.0. The table selects other changes to review alongside the advisories above. Re-run every analysis covered by an applicable notice and compare its outputs. The full list, including superseded and withdrawn checks, is in the release notes."
        },
        {
          "k": "table",
          "caption": "Selected results-change notices since 0.5.0",
          "head": [
            "Results version",
            "Result that changes"
          ],
          "rows": [
            [
              "50",
              "2D: rotations that only connectors hold, left free by them, are refused"
            ],
            [
              "52",
              "3D: node rotations a connector couples but leaves free are refused"
            ],
            [
              "53",
              "Buckling no longer takes geometric stiffness from round-off axial forces. In 2D and 3D, members whose axial forces cannot be distinguished from round-off contribute no geometric stiffness. The analysis is refused if their possible compression could lower the critical factor by more than 1 %."
            ],
            [
              "54",
              "The net area of a staggered bolted end takes its worst chain, and an all-elements bolted end needs bolts in the web"
            ],
            [
              "56",
              "3D inclined supports count restraints in a common frame"
            ],
            [
              "58",
              "Modal bases use the rounding scale of each mass Gram entry"
            ],
            [
              "59",
              "Checked 3D plastic analysis returns the certified lower bound"
            ],
            [
              "61",
              "Concrete fibre load control refines its stopping interval"
            ],
            [
              "63",
              "Linear analysis refuses a mechanism or an unresolvable stiffness instead of solving it with a warning"
            ],
            [
              "65",
              "Invalid frozen contacts and cable bar analyses are withheld"
            ],
            [
              "66",
              "Buckling round-off bounds follow actual constraint coupling"
            ],
            [
              "67",
              "Buckling factors use the original stiffness pencil"
            ],
            [
              "68",
              "Plastic balance uses solved model IDs and certificates budget actual candidates"
            ],
            [
              "69",
              "Nonlinear convergence follows physical equilibrium"
            ],
            [
              "71",
              "Include transverse truss actions in conditional member balance"
            ],
            [
              "72",
              "Arc-length continuation regroups reference-load arithmetic"
            ],
            [
              "73",
              "Modal analysis preserves the physical mass range"
            ],
            [
              "75",
              "SSI corrects elastic residual plateaus"
            ],
            [
              "76",
              "Constraint reduction retains directional rounding uncertainty"
            ],
            [
              "78",
              "Compatible loads on released rotations"
            ]
          ]
        },
        {
          "k": "ext",
          "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.6.0.md",
          "label": "Full 0.6.0 release notes",
          "t": "Every results-change notice, with links to its scope and evidence:"
        },
        {
          "k": "img",
          "base": "blog/results-recheck",
          "w": 1600,
          "h": 1000,
          "alt": "A results re-check dialog in Stabileo Basic, listing changes affecting an older saved project.",
          "caption": "The results re-check dialog illustrated in the 0.5.0 article."
        },
        {
          "k": "h",
          "t": "Two notices describe behavior already in 0.5.0"
        },
        {
          "k": "p",
          "t": "These two notices were registered later. Their underlying changes were already in v0.5.0, so they are not new numerical changes in this release. They can still appear in a project re-check notice."
        },
        {
          "k": "table",
          "caption": "Later notices for changes already shipped in 0.5.0",
          "head": [
            "Results version",
            "Result that changes"
          ],
          "rows": [
            [
              "72",
              "The public slab gallery uses hard simple supports on walls"
            ],
            [
              "72",
              "SSI returns support reactions and includes soil springs in constraint forces"
            ]
          ]
        },
        {
          "k": "h",
          "t": "Known limitations"
        },
        {
          "k": "ul",
          "items": [
            "SA-2026-056 remains unfixed: independently verify dynamic demands for constrained mixed frame-and-shell models that change materially after renumbering, rotation or unit conversion. No conservative correction factor is established.",
            "2D plastic collapse remains refused pending #758, as described in SA-2026-044. A certified 3D lower bound does not certify the raw hinge history.",
            "Time history does not provide total dynamic support demands. Use an independent analysis including inertia, damping and support loading. Unsupported cable analyses and nonzero prescribed support motion in cable/time-history workflows refuse explicitly.",
            "Spatial arc-length and displacement-control solvers are not added. Existing warnings and restrictions remain applicable."
          ]
        },
        {
          "k": "h",
          "t": "Other changes"
        },
        {
          "k": "ul",
          "items": [
            "Generated planar structures receive explicit restraints, and sheds default to physical bracing. Regenerate and review the supports and bracing; saved models are unchanged.",
            "The Fehér, Sipos and Várkonyi bent-strip shape-control experiment has an interactive solver, actuator paths and a paper comparison in English, Spanish and Portuguese. The cut-strip summary is also translated into Spanish and Portuguese.",
            "The 0.5.0 blog release article now has full German, French and Turkish translations. Plastic certificate warnings and resource refusals are translated into every offered language."
          ]
        },
        {
          "k": "ext",
          "href": "https://github.com/lambdaclass/stabileo/blob/main/CHANGELOG.md",
          "label": "Changelog",
          "t": "The full technical record:"
        }
      ]
    },
    "es": {
      "title": "Stabileo 0.6.0: volvé a calcular los proyectos afectados",
      "excerpt": "Volvé a calcular los análisis afectados y revisá los resultados que ya usaste. Los avisos SA-2026-048 a SA-2026-063 explican qué revisar; SA-2026-056 sigue sin corregirse.",
      "blocks": [
        {
          "k": "p",
          "t": "Volvé a calcular los casos, las combinaciones y las historias no lineales o por etapas completas que estén afectados. Compará desplazamientos, esfuerzos, reacciones y demandas de diseño con los resultados que ya usaste. Revisá los cálculos entregados y el dimensionamiento basado en ellos. Consultá cada aviso para conocer las entradas afectadas y qué hacer. Un rechazo o una cantidad no disponible no da una respuesta de reemplazo: no significa demanda nula ni verificación aprobada."
        },
        {
          "k": "note",
          "t": "Los avisos SA-2026-048 a SA-2026-063 se agregaron después de v0.5.0. Las correcciones siguientes están incluidas en 0.6.0, salvo SA-2026-056, que sigue sin corregirse. Revisá las funciones indicadas aunque el cálculo anterior haya convergido o sus desplazamientos parecieran razonables."
        },
        {
          "k": "h",
          "t": "Avisos de seguridad"
        },
        {
          "k": "table",
          "caption": "Avisos de seguridad SA-2026-048 a SA-2026-063",
          "head": [
            "Aviso",
            "Gravedad",
            "Qué cambió y qué hacer"
          ],
          "rows": [
            [
              "SA-2026-048",
              "Alta",
              "CIRSOC 301 omitía momentos de extremo en Mmax para cualquier sección con un tramo no arriostrado reducido; canales y tees en doble curvatura también podían perder un cambio de signo. Revisá todos los miembros CIRSOC 301 con Lb declarado menor que la longitud del miembro, incluidas las verificaciones de acero y las propuestas del optimizador."
            ],
            [
              "SA-2026-049",
              "Alta",
              "Una restricción rígida con resorte podía convertirse en apoyo elástico en 3D. Definí explícitamente la condición buscada y recalculá los análisis afectados."
            ],
            [
              "SA-2026-050",
              "Media",
              "Una esbeltez fallida podía volverse cero y el cálculo multicaso podía devolver números no finitos. Descartá esos valores, revisá las entradas y recalculá."
            ],
            [
              "SA-2026-051",
              "Alta",
              "Las cargas móviles 3D omitían picos interiores y la componente axial del peso de ejes. Recalculá envolventes y revisá dimensionamiento y demandas."
            ],
            [
              "SA-2026-052",
              "Alta",
              "Las envolventes axiales móviles 2D/3D omitían límites de cargas distribuidas. Recalculá y revisá extremos axiales interiores; reducir el paso del tren no basta."
            ],
            [
              "SA-2026-053",
              "Baja",
              "Las envolventes móviles incluían límites exteriores de esfuerzos ante cargas en extremos. Recalculá envolventes axiales y de corte y revisá el dimensionamiento, incluyendo las reacciones al verificar equilibrio."
            ],
            [
              "SA-2026-054",
              "Alta",
              "El cálculo lineal podía dar respuestas con rigidez no resuelta u omitir una componente de carga. Recalculá casos y combinaciones estáticas; verificá independientemente las demandas si el solver corregido rechaza."
            ],
            [
              "SA-2026-055",
              "Alta",
              "P-Delta subestimaba la amplificación con cargas axiales a lo largo de barras. Recalculá análisis y verificaciones derivados, comprobá convergencia de malla y reevaluá estabilidad."
            ],
            [
              "SA-2026-056",
              "Alta",
              "Sin corregir: la dinámica de modelos mixtos de pórticos y cáscaras con restricciones cambia entre descripciones equivalentes. Verificá independientemente las demandas antes de usarlas; no hay factor corrector conservador establecido."
            ],
            [
              "SA-2026-057",
              "Media",
              "La pantalla plástica podía considerar dentro un factor fuera de su intervalo. Recalculá certificados y compará extremos exactos. Un rechazo por recursos no prueba que no exista mecanismo."
            ],
            [
              "SA-2026-058",
              "Alta",
              "Modelos armónicos grandes conservaban respuestas inexactas de modos omitidos. Recalculá barridos y revisá amplitud, fase y picos, incluyendo frecuencias fuera de la advertencia de truncamiento."
            ],
            [
              "SA-2026-059",
              "Alta",
              "Análisis web avanzados daban resistencia a compresión a cables. Usá el solver específico admitido o un análisis independiente; los flujos avanzados con cables ahora rechazan explícitamente."
            ],
            [
              "SA-2026-060",
              "Alta",
              "La rigidez rotacional artificial por etapas cambiaba traslaciones y esfuerzos. Recalculá historias completas con liberaciones o resortes de apoyo y revisá las demandas de diseño derivadas."
            ],
            [
              "SA-2026-061",
              "Alta",
              "Faltaban reacciones de trayectoria o se recuperaban con la carga incorrecta; podían faltar esfuerzos por etapas y dinámicos. Recalculá y revisá demandas en apoyos, uniones y fundaciones. Un esfuerzo no disponible no es cero; las reacciones dinámicas totales siguen no disponibles."
            ],
            [
              "SA-2026-062",
              "Alta",
              "Un rechazo elástico inicial podía volverse un factor crudo de colapso plástico 3D igual a cero y exitoso. Recalculá los análisis afectados; un rechazo numérico no demuestra colapso a carga nula."
            ],
            [
              "SA-2026-063",
              "Alta",
              "Las restricciones perdían el movimiento prescrito del maestro restringido. Recalculá historias completas y revisá desplazamientos, esfuerzos y reacciones junto con SA-2026-061. El movimiento de apoyo no admitido en cables o historia temporal ahora se rechaza."
            ]
          ]
        },
        {
          "k": "ext",
          "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
          "label": "Índice de avisos de seguridad",
          "t": "Consultá cada aviso aplicable para conocer las entradas afectadas y qué hacer:"
        },
        {
          "k": "h",
          "t": "Otros cambios que afectan los resultados"
        },
        {
          "k": "p",
          "t": "El registro de resultados termina en la versión 49 en 0.5.0 y llega a 78 en 0.6.0. La tabla selecciona otros cambios para revisar junto con los avisos anteriores. Volvé a calcular cada análisis cubierto por un aviso aplicable y compará sus salidas. La lista completa, incluidas las verificaciones reemplazadas o retiradas, está en las notas de la versión."
        },
        {
          "k": "table",
          "caption": "Selección de avisos de cambios de resultados desde 0.5.0",
          "head": [
            "Versión de resultados",
            "Resultado que cambia"
          ],
          "rows": [
            [
              "50",
              "2D: se rechazan los giros que solo sostienen conectores y que estos dejan libres"
            ],
            [
              "52",
              "3D: se rechazan los giros de nudo que un conector acopla pero deja libres"
            ],
            [
              "53",
              "El pandeo ya no toma rigidez geométrica de esfuerzos axiales que son redondeo. En 2D y 3D, los miembros cuyos esfuerzos axiales no se distinguen del redondeo no aportan rigidez geométrica. El análisis se rechaza si su posible compresión puede reducir el factor crítico en más del 1 %."
            ],
            [
              "54",
              "El área neta de una unión abulonada al tresbolillo toma su peor cadena, y una unión abulonada de todos los elementos necesita bulones en el alma"
            ],
            [
              "56",
              "Los apoyos inclinados 3D cuentan las restricciones en un marco común"
            ],
            [
              "58",
              "Las bases modales usan la escala de redondeo de cada entrada de Gram de masa"
            ],
            [
              "59",
              "El análisis plástico 3D verificado devuelve la cota inferior certificada"
            ],
            [
              "61",
              "El control de carga de fibras de hormigón refina el intervalo de parada"
            ],
            [
              "63",
              "El análisis lineal rechaza un mecanismo o una rigidez irresoluble en lugar de resolverlo con una advertencia"
            ],
            [
              "65",
              "Se retienen contactos congelados inválidos y análisis de cables como barras"
            ],
            [
              "66",
              "Las cotas de redondeo del pandeo siguen el acoplamiento real de las restricciones"
            ],
            [
              "67",
              "Los factores de pandeo usan las matrices de rigidez originales"
            ],
            [
              "68",
              "El equilibrio plástico usa los identificadores del modelo resuelto y el certificado limita cada candidato"
            ],
            [
              "69",
              "La convergencia no lineal sigue el equilibrio físico"
            ],
            [
              "71",
              "Incluir las acciones transversales de barras articuladas en el equilibrio condicional"
            ],
            [
              "72",
              "La continuación por longitud de arco reagrupa la aritmética de la carga de referencia"
            ],
            [
              "73",
              "El análisis modal conserva el rango físico de la masa"
            ],
            [
              "75",
              "SSI corrige los residuos elásticos estancados"
            ],
            [
              "76",
              "La reducción de restricciones conserva la incertidumbre direccional"
            ],
            [
              "78",
              "Cargas compatibles en giros liberados"
            ]
          ]
        },
        {
          "k": "ext",
          "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.6.0.es.md",
          "label": "Notas completas de la versión 0.6.0",
          "t": "Todos los avisos de cambios de resultados, con enlaces a su alcance y evidencia:"
        },
        {
          "k": "img",
          "base": "blog/results-recheck",
          "w": 1600,
          "h": 1000,
          "alt": "Un diálogo de revisión de resultados en Stabileo Básico, con cambios que afectan a un proyecto guardado anteriormente.",
          "caption": "El diálogo de revisión de resultados ilustrado en el artículo de la versión 0.5.0."
        },
        {
          "k": "h",
          "t": "Dos avisos describen comportamientos ya incluidos en 0.5.0"
        },
        {
          "k": "p",
          "t": "Estos dos avisos se registraron después. Sus cambios ya estaban en v0.5.0, por lo que no son cambios numéricos nuevos de esta versión. Aun así pueden aparecer al pedir que se recalcule un proyecto."
        },
        {
          "k": "table",
          "caption": "Avisos posteriores sobre cambios ya incluidos en 0.5.0",
          "head": [
            "Versión de resultados",
            "Resultado que cambia"
          ],
          "rows": [
            [
              "72",
              "La galería pública de losas usa apoyos simples duros sobre muros"
            ],
            [
              "72",
              "SSI devuelve reacciones de apoyo e incluye el suelo en las fuerzas de restricción"
            ]
          ]
        },
        {
          "k": "h",
          "t": "Limitaciones conocidas"
        },
        {
          "k": "ul",
          "items": [
            "SA-2026-056 sigue sin corregirse: verificá de forma independiente las demandas dinámicas de modelos mixtos de pórticos y cáscaras con restricciones que cambien materialmente al renumerar, rotar o convertir unidades. No hay un factor corrector conservador establecido.",
            "El colapso plástico 2D sigue rechazado hasta resolver #758, como indica SA-2026-044. Una cota inferior certificada 3D no certifica la historia cruda de rótulas.",
            "La historia temporal no proporciona las demandas dinámicas totales en apoyos. Usá un análisis independiente que incluya inercia, amortiguamiento y cargas sobre apoyos. Los análisis de cables no admitidos y el movimiento de apoyo prescrito no nulo en cables o historia temporal se rechazan explícitamente.",
            "No se agregan solvers espaciales de longitud de arco ni control de desplazamiento. Siguen vigentes las advertencias y restricciones existentes."
          ]
        },
        {
          "k": "h",
          "t": "Otros cambios"
        },
        {
          "k": "ul",
          "items": [
            "Las estructuras planas generadas reciben restricciones explícitas y las naves usan arriostramiento físico por defecto. Regenerá y revisá apoyos y arriostramientos; los modelos guardados no cambian.",
            "El experimento de control de forma de una tira curvada de Fehér, Sipos y Várkonyi incluye un solver interactivo, trayectorias de actuadores y una comparación con el artículo en inglés, español y portugués. El resumen de la tira cortada también está traducido al español y portugués.",
            "El artículo del blog de la versión 0.5.0 tiene traducciones completas al alemán, francés y turco. Las advertencias de certificados plásticos y los rechazos por recursos están traducidos a todos los idiomas ofrecidos."
          ]
        },
        {
          "k": "ext",
          "href": "https://github.com/lambdaclass/stabileo/blob/main/CHANGELOG.md",
          "label": "Registro de cambios",
          "t": "El registro técnico completo:"
        }
      ]
    },
    "pt": {
      "title": "Stabileo 0.6.0: recalcule os projetos afetados",
      "excerpt": "Recalcule as análises afetadas e revise os resultados já usados. Os avisos SA-2026-048 a SA-2026-063 explicam o que verificar; SA-2026-056 continua sem correção.",
      "blocks": [
        {
          "k": "p",
          "t": "Recalcule os casos, combinações e históricos não lineares ou por etapas completos que forem afetados. Compare deslocamentos, esforços, reações e solicitações de projeto com os resultados já usados. Revise cálculos entregues e dimensionamentos baseados neles. Consulte cada aviso para saber quais entradas são afetadas e o que fazer. Uma recusa ou quantidade indisponível não fornece uma resposta substituta: não significa solicitação nula nem verificação aprovada."
        },
        {
          "k": "note",
          "t": "Os avisos SA-2026-048 a SA-2026-063 foram adicionados após v0.5.0. As correções abaixo estão incluídas em 0.6.0, exceto SA-2026-056, que continua sem correção. Revise os recursos indicados mesmo que a análise anterior tenha convergido ou seus deslocamentos parecessem plausíveis."
        },
        {
          "k": "h",
          "t": "Avisos de segurança"
        },
        {
          "k": "table",
          "caption": "Avisos de segurança SA-2026-048 a SA-2026-063",
          "head": [
            "Aviso",
            "Gravidade",
            "O que mudou e o que fazer"
          ],
          "rows": [
            [
              "SA-2026-048",
              "Alta",
              "O CIRSOC 301 omitia momentos de extremidade em Mmax para qualquer seção com um trecho destravado reduzido; perfis U e T em dupla curvatura também podiam perder uma mudança de sinal. Revise todos os membros CIRSOC 301 com Lb declarado menor que o comprimento do membro, incluindo verificações de aço e propostas do otimizador."
            ],
            [
              "SA-2026-049",
              "Alta",
              "Uma restrição rígida com mola podia virar apoio elástico em 3D. Defina explicitamente a condição pretendida e recalcule as análises afetadas."
            ],
            [
              "SA-2026-050",
              "Média",
              "Uma esbeltez não resolvida podia virar zero, e análises de vários casos podiam conter números não finitos. Descarte esses valores, revise as entradas e recalcule."
            ],
            [
              "SA-2026-051",
              "Alta",
              "Cargas móveis 3D omitiam picos internos e a componente axial do peso dos eixos. Recalcule envoltórias e revise dimensionamento e solicitações."
            ],
            [
              "SA-2026-052",
              "Alta",
              "Envoltórias axiais móveis 2D/3D omitiam limites de cargas distribuídas. Recalcule e confira extremos axiais internos; reduzir apenas o passo do trem não basta."
            ],
            [
              "SA-2026-053",
              "Baixa",
              "Envoltórias móveis incluíam limites externos de esforços para cargas nas extremidades. Recalcule envoltórias axiais e de cortante e revise o dimensionamento, incluindo as reações nas verificações de equilíbrio."
            ],
            [
              "SA-2026-054",
              "Alta",
              "O cálculo linear podia retornar respostas com rigidez não resolvida ou omitir uma componente de carga. Recalcule casos e combinações estáticas; verifique independentemente as solicitações se o solver corrigido recusar."
            ],
            [
              "SA-2026-055",
              "Alta",
              "P-Delta subestimava a amplificação sob cargas axiais ao longo das barras. Recalcule análises e verificações derivadas, confira a convergência da malha e reavalie a estabilidade."
            ],
            [
              "SA-2026-056",
              "Alta",
              "Sem correção: a dinâmica de modelos mistos de pórticos e cascas com restrições muda entre descrições equivalentes. Verifique independentemente as solicitações antes de usá-las; não há fator corretivo conservador estabelecido."
            ],
            [
              "SA-2026-057",
              "Média",
              "A exibição plástica podia considerar interno um fator fora do intervalo. Recalcule certificados e compare os extremos exatos. Uma recusa por recursos não prova ausência de mecanismo."
            ],
            [
              "SA-2026-058",
              "Alta",
              "Modelos harmônicos grandes mantinham respostas imprecisas de modos omitidos. Recalcule varreduras e revise amplitude, fase e picos, incluindo frequências fora do aviso de truncamento."
            ],
            [
              "SA-2026-059",
              "Alta",
              "Análises web avançadas davam resistência à compressão aos cabos. Use o solver específico suportado ou análise independente; fluxos avançados com cabos agora recusam explicitamente."
            ],
            [
              "SA-2026-060",
              "Alta",
              "A rigidez rotacional artificial por etapas alterava translações e esforços. Recalcule históricos completos com liberações ou molas de apoio e revise solicitações de projeto derivadas."
            ],
            [
              "SA-2026-061",
              "Alta",
              "Reações de trajetória faltavam ou eram recuperadas na carga errada; esforços por etapas e dinâmicos podiam faltar. Recalcule e revise solicitações de apoios, ligações e fundações. Esforço indisponível não é zero; reações dinâmicas totais continuam indisponíveis."
            ],
            [
              "SA-2026-062",
              "Alta",
              "Uma recusa elástica inicial podia virar fator bruto de colapso plástico 3D zero com sucesso. Recalcule as análises afetadas; recusa numérica não comprova colapso sob carga nula."
            ],
            [
              "SA-2026-063",
              "Alta",
              "As restrições perdiam o movimento prescrito do mestre restringido. Recalcule históricos completos e revise deslocamentos, esforços e reações junto com SA-2026-061. Movimento de apoio não suportado em cabos ou histórico no tempo agora é recusado."
            ]
          ]
        },
        {
          "k": "ext",
          "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
          "label": "Índice de avisos de segurança",
          "t": "Consulte cada aviso aplicável para saber quais entradas são afetadas e o que fazer:"
        },
        {
          "k": "h",
          "t": "Outras mudanças que afetam os resultados"
        },
        {
          "k": "p",
          "t": "O registro de resultados termina na versão 49 em 0.5.0 e chega a 78 em 0.6.0. A tabela seleciona outras mudanças para revisar junto com os avisos acima. Recalcule cada análise coberta por um aviso aplicável e compare suas saídas. A lista completa, incluindo verificações substituídas ou retiradas, está nas notas da versão."
        },
        {
          "k": "table",
          "caption": "Seleção de avisos de mudanças de resultados desde 0.5.0",
          "head": [
            "Versão de resultados",
            "Resultado que muda"
          ],
          "rows": [
            [
              "50",
              "2D: são recusados os giros que só conectores sustentam e que eles deixam livres"
            ],
            [
              "52",
              "3D: são recusados os giros de nó que um conector acopla mas deixa livres"
            ],
            [
              "53",
              "A flambagem não toma mais rigidez geométrica de forças axiais que são arredondamento. Em 2D e 3D, os membros cujas forças axiais não se distinguem do arredondamento não contribuem para a rigidez geométrica. A análise é recusada se sua possível compressão puder reduzir o fator crítico em mais de 1 %."
            ],
            [
              "54",
              "A área líquida de uma ligação parafusada em quincôncio toma a sua pior cadeia, e uma ligação parafusada de todos os elementos precisa de parafusos na alma"
            ],
            [
              "56",
              "Apoios inclinados 3D contam restrições no mesmo referencial"
            ],
            [
              "58",
              "As bases modais usam a escala de arredondamento de cada entrada de Gram de massa"
            ],
            [
              "59",
              "A análise plástica 3D verificada retorna o limite inferior certificado"
            ],
            [
              "61",
              "O controle de carga de fibras de concreto refina o intervalo de parada"
            ],
            [
              "63",
              "A análise linear recusa um mecanismo ou uma rigidez irresolúvel em vez de resolvê-lo com um aviso"
            ],
            [
              "65",
              "Contatos congelados inválidos e análises de cabos como barras são retidos"
            ],
            [
              "66",
              "Os limites de arredondamento da flambagem seguem o acoplamento real das restrições"
            ],
            [
              "67",
              "Os fatores de flambagem usam as matrizes de rigidez originais"
            ],
            [
              "68",
              "O equilíbrio plástico usa os IDs do modelo resolvido e o certificado limita cada candidato"
            ],
            [
              "69",
              "A convergência não linear segue o equilíbrio físico"
            ],
            [
              "71",
              "Incluir ações transversais das barras de treliça no equilíbrio condicional"
            ],
            [
              "72",
              "A continuação por comprimento de arco reagrupa a aritmética da carga de referência"
            ],
            [
              "73",
              "A análise modal preserva o espaço físico da massa"
            ],
            [
              "75",
              "SSI corrige resíduos elásticos estagnados"
            ],
            [
              "76",
              "A redução de restrições preserva a incerteza direcional"
            ],
            [
              "78",
              "Cargas compatíveis em rotações liberadas"
            ]
          ]
        },
        {
          "k": "ext",
          "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.6.0.pt.md",
          "label": "Notas completas da versão 0.6.0",
          "t": "Todos os avisos de mudanças de resultados, com links para seu alcance e evidências:"
        },
        {
          "k": "img",
          "base": "blog/results-recheck",
          "w": 1600,
          "h": 1000,
          "alt": "Um diálogo de revisão de resultados no Stabileo Básico, listando mudanças que afetam um projeto salvo anteriormente.",
          "caption": "O diálogo de revisão de resultados ilustrado no artigo da versão 0.5.0."
        },
        {
          "k": "h",
          "t": "Dois avisos descrevem comportamentos já presentes em 0.5.0"
        },
        {
          "k": "p",
          "t": "Estes dois avisos foram registrados depois. Suas alterações já estavam em v0.5.0, portanto não são alterações numéricas novas desta versão. Ainda podem aparecer no pedido de recálculo de um projeto."
        },
        {
          "k": "table",
          "caption": "Avisos posteriores sobre mudanças já incluídas em 0.5.0",
          "head": [
            "Versão de resultados",
            "Resultado que muda"
          ],
          "rows": [
            [
              "72",
              "A galeria pública de lajes usa apoios simples rígidos nas paredes"
            ],
            [
              "72",
              "SSI retorna reações de apoio e inclui o solo nas forças de restrição"
            ]
          ]
        },
        {
          "k": "h",
          "t": "Limitações conhecidas"
        },
        {
          "k": "ul",
          "items": [
            "SA-2026-056 continua sem correção: verifique independentemente as solicitações dinâmicas de modelos mistos de pórticos e cascas com restrições que mudem materialmente após renumeração, rotação ou conversão de unidades. Não há fator de correção conservador estabelecido.",
            "O colapso plástico 2D continua recusado até resolver #758, conforme SA-2026-044. Um limite inferior certificado 3D não certifica o histórico bruto de rótulas.",
            "O histórico no tempo não fornece solicitações dinâmicas totais nos apoios. Use análise independente incluindo inércia, amortecimento e cargas nos apoios. Análises de cabos não suportadas e movimento prescrito não nulo nos apoios em cabos ou histórico no tempo são recusados explicitamente.",
            "Não são adicionados solvers espaciais de comprimento de arco ou controle de deslocamento. Avisos e restrições existentes continuam aplicáveis."
          ]
        },
        {
          "k": "h",
          "t": "Outras alterações"
        },
        {
          "k": "ul",
          "items": [
            "Estruturas planas geradas recebem restrições explícitas, e galpões usam contraventamento físico por padrão. Gere novamente e revise apoios e contraventamento; os modelos salvos não mudam.",
            "O experimento de controle de forma de uma tira curvada de Fehér, Sipos e Várkonyi oferece solver interativo, trajetórias de atuadores e comparação com o artigo em inglês, espanhol e português. O resumo da tira cortada também foi traduzido para espanhol e português.",
            "O artigo do blog da versão 0.5.0 tem traduções completas para alemão, francês e turco. Avisos de certificados plásticos e recusas por recursos estão traduzidos para todos os idiomas oferecidos."
          ]
        },
        {
          "k": "ext",
          "href": "https://github.com/lambdaclass/stabileo/blob/main/CHANGELOG.md",
          "label": "Registro de mudanças",
          "t": "O registro técnico completo:"
        }
      ]
    }
  }
};
