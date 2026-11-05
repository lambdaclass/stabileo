import type { Post } from '../types';

export const researchToolsAndCheckingOurTests: Post = {
  slug: 'research-tools-and-checking-our-tests',
  date: '2026-11-03',
  "order": 11,
  "authors": [
    "Federico Carrone"
  ],
  "tagKeys": [
    "blog.tag.research",
    "blog.tag.verification"
  ],
  "i18n": {
    "en": {
      "title": "Research, tools, and checking our tests",
      "excerpt": "What we shipped in the last few days: runnable research, eight calculators, and checks on the benchmark models themselves. What is working, what was wrong, and what still needs review.",
      "blocks": [
        {
          "k": "p",
          "t": "Over the last few days we added Stabileo Research and Stabileo Tools, and tightened the checks behind them. Stabileo is free, open-source structural engineering software with AI, published by Ergodic Group. LambdaClass is its development arm."
        },
        {
          "k": "h",
          "t": "Research you can run"
        },
        {
          "k": "p",
          "t": "We are putting published structural-engineering papers and classic benchmarks in the browser, with Stabileo’s own viewer. Every page states what it reproduces, how it was checked and the limits of the comparison. We are completing pages that still show open comparisons."
        },
        {"k": "img", "base": "blog/research", "w": 1600, "h": 1000, "alt": "The Stabileo Research page, “Research in structural engineering”, with the note “Research, not a design tool” and the first runnable entry, the Lee frame (1968), shown with its traced load path.", "caption": "stabileo.com/research: each page states what it reproduces and how it was checked."},
        {
          "k": "p",
          "t": "The live paper pages cover Shauer (2025) phase-field fracture; Grossman and Boudaoud (2026) spring networks; Andreassen et al. (2011) topology optimization; Ferrari and Sigmund (2025) Roorda-frame stability; Pastrana et al. (2026) cable-net form finding; Zmyślony, Khan and Biggins (2026) snapping arches; and Fairclough et al. (2026) gridshells."
        },
        {
          "k": "p",
          "t": "The engine classics are MacNeal–Harder, the shell obstacle course, Mattiasson elastica, Riks/Crisfield, Newmark, CQC, plastic collapse, the Navier plate, the Lee frame and the DaDeppo–Schmidt arch. Pages distinguish live computation from recorded replay and show their comparison limits. Ferrari’s Koiter comparison is unfinished; Fairclough covers one five-node example; the snapping-arch equilibrium jump is not a transient simulation."
        },
        {
          "k": "p",
          "t": "We publish the scope and evidence and review them in the open. Research results are not design results, and benchmark agreement is not certification."
        },
        {
          "k": "table",
          "caption": "Live today:",
          "head": [
            "Offering",
            "Count"
          ],
          "rows": [
            [
              "Runnable paper pages",
              "7"
            ],
            [
              "Engine benchmark pages",
              "10"
            ],
            [
              "Calculators",
              "8"
            ]
          ]
        },
        {
          "k": "h",
          "t": "The tests need checking too"
        },
        {
          "k": "p",
          "t": "Some pages were wrong because our test models were wrong. Each engine benchmark page and its engine CI test now read the same case file, so a model fix updates both. Some provisional comparisons remain explicitly ignored in CI and do not yet block merges; we are completing those comparisons."
        },
        {
          "k": "p",
          "t": "We corrected the Mattiasson references and treatment of axial extension (#845), a rigid-jointed frame compared against an axial-only truss formula (#846), and incorrect shell support and loading models (#810). We are changing how benchmarks are built so this class of mistake can't pass again. The first part is in: each benchmark is a specification with two independent references that must agree, and automatic checks of applied load, reaction balance and symmetry, including half-model against full-model. We are adding convergence over three or more meshes, a sign-error test that proves each benchmark can fail, and engineer sign-off on the core set."
        },
        {"k": "img", "base": "blog/research-mattiasson", "w": 1600, "h": 1000, "alt": "The Mattiasson (1981) cantilever elastica benchmark page, Results tab: a plot of u/L and v/L against PL²/EI with Stabileo’s curves and circles for the analytical references, and a table of the values with their relative errors. On the left, “5 of 5 checks pass” and “Research, not a design tool”.", "caption": "The corrected Mattiasson page: the engine’s response against two independent analytical references."},
        {
          "k": "p",
          "t": "We are also building units into the type system (#864), so kN/N or m/mm mix-ups are caught at compile time. The first slice, for the material and section path of 2D frames, landed on 3 November."
        },
        {
          "k": "h",
          "t": "Eight calculators, with a way into the editor"
        },
        {
          "k": "p",
          "t": "Stabileo Tools now has free calculators for simply supported beams, cantilevers, elastic column buckling, continuous beams, single-bay portals, planar trusses, moving-load influence lines and beam bending frequencies. They use the production engine, show independent classical comparisons and state their assumptions. Each opens its model in the full editor. These are analysis tools, not complete code design checks."
        },
        {"k": "img", "base": "blog/tools", "w": 1600, "h": 1000, "alt": "The Stabileo Tools page, “Free engineering calculators”, opening with the simply supported beam calculator: a beam under a distributed load with its deflected shape and an Open button.", "caption": "stabileo.com/tools: eight calculators on the production engine."},
        {
          "k": "h",
          "t": "Containing wrong results"
        },
        {
          "k": "p",
          "t": "We are containing every known wrong-result issue: refusals or warnings in the engine carry the known-issue ID, instead of returning an unchecked number (#807, in review). Every refusal is tested, including unsupported dynamic models with member or shell offsets."
        },
        {
          "k": "p",
          "t": "Metamorphic tests exposed invariance bugs: equivalent models could be refused after rotation, mirroring or unit scaling. We now run the metamorphic suite on every change to catch these regressions. We are adding a nightly run of random models that groups findings by root cause and files one issue per root cause."
        },
        {
          "k": "h",
          "t": "Since then: 1 to 3 November"
        },
        {
          "k": "ul",
          "items": [
            "PRO’s analysis mode is finished. Results that were wrong without a warning are fixed: the load generator no longer loads a shed’s eaves as a floor, and a level’s seismic weight now includes the slabs and walls drawn as shells, which it had left out (#1076).",
            "Exports work on real buildings. Large Excel sheets are written row by row, and the report of a six-storey building takes about ten seconds instead of four minutes. “Check an exported report” now compares the printed numbers, not only the fingerprints (#1076).",
            "PRO gained inline help that can be turned off, a save status in the header, a report after the analysis, plate results, and a read-only viewer for shared models with “Duplicate and edit” (#1077, #1078).",
            "A buckling factor above its independently certified upper bound is now refused, in 2D and 3D (#817, results version 6). Re-run the certification before relying on an earlier buckling certificate.",
            "Share links with non-finite numbers, or with members, supports or loads that point to something missing, are refused instead of opened (#1058).",
            "The invariance suite now checks six priority analyses under rotation, mirroring and superposition, and four of them under uniform stiffness scaling (#1060)."
          ]
        },
        {
          "k": "h",
          "t": "Checks that answer in twenty minutes"
        },
        {
          "k": "p",
          "t": "Every change to Stabileo passes the same checks before it reaches main: engine tests, web unit tests, production builds, end-to-end tests in a browser, the results snapshots and the determinism check. A safety fix is only as fast as those checks, so on 4 November we worked on their speed. We measured first. In a clean merge-queue run of 44 to 47 minutes, the engine and unit tests finished 8 to 15 minutes before the end, so adding more of them in parallel would have gained nothing. The time went to building the research bundles one after another, and to the slowest end-to-end shard. Once those were shorter, the slowest shard was slow because of setup: in one run it spent 7.2 of its 16 minutes on tests and six and a half downloading browser packages from a slow mirror."
        },
        {
          "k": "ul",
          "items": [
            "Build once, test what was built. The production-build tests made five more builds of their own, four of them of the same tree CI had just built; those four now read that build (#1411). Each build carries a stamp of everything it was built from, and a test fails, never skips, if the stamp does not match the tree it runs on.",
            "Cache by input. Each research bundle is cached under a key of its own inputs, including the engine every bundle links, so a change to one paper rebuilds only that paper and a change to the engine rebuilds all of them. A pull request reuses bundles the merge queue already built from the same inputs, after checking every file against its checksum, and it can read that cache but never write it (#1395). Browser packages come from a cache too, instead of the mirror (#1413).",
            "Run only what a change can affect. A change to documentation builds nothing, in one or two minutes instead of a whole run. A change to the site alone skips the engine jobs but keeps every end-to-end shard, because 59 of the 281 specs read text on screen (#1381). In the queue, each entry is scoped by its own diff against the entry ahead of it, which is sound because an entry merges only if every entry ahead of it passed; when the diff is missing or unclear, it runs everything (#1400).",
            "Balance the slowest path. End-to-end tests run in 14 shards instead of 10, balanced on measured timings (#1382). The old timing table predicted 41.5 minutes of tests where a run took 69.8."
          ]
        },
        {
          "k": "table",
          "caption": "Wall time of successful CI runs that ran every job, from creation to the last job, measured with the GitHub Actions API. Before: 4 November, from 08:00 UTC (pull requests) or 13:48 UTC (merge queue) to 21:10 UTC; after: from 21:15 UTC to 03:00 UTC on 5 November.",
          "head": [
            "Runs",
            "Count",
            "Median",
            "Range"
          ],
          "rows": [
            [
              "Merge queue, before",
              "20",
              "42 min",
              "25 to 56 min"
            ],
            [
              "Merge queue, after",
              "10",
              "20 min",
              "15 to 26 min"
            ],
            [
              "Pull requests (first attempt), before",
              "69",
              "59 min",
              "35 to 127 min"
            ],
            [
              "Pull requests (first attempt), after",
              "19",
              "27 min",
              "16 to 45 min"
            ]
          ]
        },
        {
          "k": "h",
          "t": "A red check that is not the change’s fault"
        },
        {
          "k": "p",
          "t": "A failure caused by the network or a lost machine is noise, but it is also a red check that someone must look at, and a habit of rerunning red checks is how a real failure gets waved through. So a pull request’s failed jobs are rerun once, automatically, only when every failed job carries positive evidence of an infrastructure failure: a timeout in a download step, a lost runner, a network error that ends the last attempt of a download (#1380). Anything that looks like a test failure anywhere in the log blocks the rerun, and so does anything the classifier does not recognise. That makes it safe: it never reruns a test step, a real failure fails again on the rerun, and the worst a misread log can cause is one extra run of the same jobs."
        },
        {
          "k": "p",
          "t": "Two more fixes removed false alarms. A pull-request run cancelled because a newer run on the same commit replaced it used to show a red required check; it now skips that check, but only after confirming that the newer run exists and has not failed, because a skipped required check counts as passed (#1397). And a stalled download could leave a process holding the package manager’s lock, so the retry failed on the lock rather than the download; an attempt now counts as stalled only after minutes without output, is stopped together with everything it started, and the retry waits for the lock (#1408)."
        },
        {
          "k": "h",
          "t": "What comes next"
        },
        {
          "k": "p",
          "t": "We are completing the open comparisons and making the site and solver faster. Next on the roadmap are a Python package (pip install stabileo) and a public verification manual generated from the benchmarks."
        }
      ]
    },
    "es": {
      "title": "Investigación, herramientas y pruebas de nuestras pruebas",
      "excerpt": "Lo que publicamos en los últimos días: investigación ejecutable, ocho calculadoras y controles sobre los propios modelos de referencia. Qué funciona, qué estaba mal y qué falta revisar.",
      "blocks": [
        {
          "k": "p",
          "t": "En los últimos días agregamos Stabileo Research y Stabileo Tools, y reforzamos sus controles. Stabileo es software gratuito y de código abierto para ingeniería estructural con IA, publicado por Ergodic Group. LambdaClass es su brazo de desarrollo."
        },
        {
          "k": "h",
          "t": "Investigación que se puede ejecutar"
        },
        {
          "k": "p",
          "t": "Estamos llevando artículos publicados de ingeniería estructural y benchmarks clásicos al navegador, con el visor de Stabileo. Cada página indica qué reproduce, cómo lo verificamos y los límites de la comparación. Estamos completando las páginas que todavía muestran comparaciones pendientes."
        },
        {"k": "img", "base": "blog/research", "w": 1600, "h": 1000, "alt": "La página de Stabileo Research, «Investigación en ingeniería estructural», con la nota de que es investigación y no una herramienta de diseño, y la primera entrada ejecutable, el pórtico de Lee (1968), con su trayectoria de carga.", "caption": "stabileo.com/research: cada página dice qué reproduce y cómo se verificó."},
        {
          "k": "p",
          "t": "Las páginas de artículos disponibles cubren fractura de campo de fase de Shauer (2025); redes de resortes de Grossman y Boudaoud (2026); optimización topológica de Andreassen et al. (2011); estabilidad del pórtico de Roorda de Ferrari y Sigmund (2025); búsqueda de forma de redes de cables de Pastrana et al. (2026); arcos con salto de Zmyślony, Khan y Biggins (2026); y estructuras reticuladas de Fairclough et al. (2026)."
        },
        {
          "k": "p",
          "t": "Los clásicos del motor son MacNeal–Harder, el circuito de pruebas de láminas, la elástica de Mattiasson, Riks/Crisfield, Newmark, CQC, colapso plástico, la placa de Navier, el pórtico de Lee y el arco de DaDeppo–Schmidt. Las páginas distinguen cálculo en vivo de reproducción de resultados guardados y muestran los límites de la comparación. Falta la comparación de Koiter de Ferrari; Fairclough cubre un ejemplo de cinco nodos; el salto de equilibrio del arco no es una simulación transitoria."
        },
        {
          "k": "p",
          "t": "Publicamos el alcance y la evidencia y los revisamos abiertamente. Los resultados de investigación no son resultados de diseño, y coincidir con un benchmark no es una certificación."
        },
        {
          "k": "table",
          "caption": "Disponible hoy:",
          "head": [
            "Oferta",
            "Cantidad"
          ],
          "rows": [
            [
              "Páginas de artículos ejecutables",
              "7"
            ],
            [
              "Páginas de benchmarks del motor",
              "10"
            ],
            [
              "Calculadoras",
              "8"
            ]
          ]
        },
        {
          "k": "h",
          "t": "También hay que comprobar las pruebas"
        },
        {
          "k": "p",
          "t": "Algunas páginas eran incorrectas porque nuestros modelos de prueba estaban mal. Cada página de benchmark del motor y su prueba de CI ahora leen el mismo archivo de caso, de modo que corregir el modelo actualiza ambas. Algunas comparaciones provisionales siguen explícitamente excluidas de CI y todavía no bloquean integraciones; estamos completándolas."
        },
        {
          "k": "p",
          "t": "Corregimos las referencias de Mattiasson y el tratamiento del alargamiento axial (#845), un pórtico de nudos rígidos comparado con una fórmula de reticulado puramente axial (#846) y modelos incorrectos de apoyos y cargas en láminas (#810). Estamos cambiando cómo se construyen los benchmarks para que esta clase de error no vuelva a pasar. La primera parte ya está incorporada: cada benchmark es una especificación con dos referencias independientes que deben coincidir y controles automáticos de carga aplicada, equilibrio de reacciones y simetría, incluidas comparaciones entre medio modelo y modelo completo. Estamos agregando convergencia en tres o más mallas, una prueba con error de signo que demuestra que cada benchmark puede fallar y la aprobación de un ingeniero para el conjunto principal."
        },
        {"k": "img", "base": "blog/research-mattiasson", "w": 1600, "h": 1000, "alt": "La página del benchmark de la elástica de Mattiasson (1981), pestaña Resultados: un gráfico de u/L y v/L en función de PL²/EI con las curvas de Stabileo y círculos para las referencias analíticas, y una tabla de valores con sus errores relativos. A la izquierda, 5 de 5 verificaciones aprobadas y la nota de que es investigación, no una herramienta de diseño.", "caption": "La página de Mattiasson corregida: la respuesta del motor contra dos referencias analíticas independientes."},
        {
          "k": "p",
          "t": "También estamos incorporando unidades al sistema de tipos (#864), para detectar confusiones entre kN/N o m/mm al compilar. La primera parte, para el camino de materiales y secciones de los pórticos 2D, se integró el 3 de noviembre."
        },
        {
          "k": "h",
          "t": "Ocho calculadoras, con acceso al editor"
        },
        {
          "k": "p",
          "t": "Stabileo Tools tiene calculadoras gratuitas de vigas simplemente apoyadas, ménsulas, pandeo elástico de columnas, vigas continuas, pórticos de un vano, reticulados planos, líneas de influencia de cargas móviles y frecuencias de flexión de vigas. Usan el motor de producción, muestran comparaciones clásicas independientes y explicitan sus hipótesis. Cada una abre su modelo en el editor completo. Son herramientas de análisis, no verificaciones normativas completas."
        },
        {"k": "img", "base": "blog/tools", "w": 1600, "h": 1000, "alt": "La página de Stabileo Tools, «Calculadoras de ingeniería gratuitas», que empieza con la calculadora de viga simplemente apoyada: una viga bajo carga distribuida con su deformada y un botón para abrirla.", "caption": "stabileo.com/tools: ocho calculadoras sobre el motor de producción."},
        {
          "k": "h",
          "t": "Contener los resultados incorrectos"
        },
        {
          "k": "p",
          "t": "Estamos conteniendo todos los problemas conocidos de resultados incorrectos: los rechazos o advertencias del motor incluyen el identificador del problema, en lugar de devolver un número sin verificar (#807, en revisión). Se prueba cada rechazo, incluidos los modelos dinámicos no admitidos con excentricidades de barras o láminas."
        },
        {
          "k": "p",
          "t": "Las pruebas metamórficas revelaron errores de invariancia: modelos equivalentes podían rechazarse después de rotarlos, reflejarlos o cambiar la escala de sus unidades. Ahora ejecutamos la batería metamórfica con cada cambio para detectar estas regresiones. Estamos agregando una ejecución nocturna de modelos aleatorios que agrupa los hallazgos por causa raíz y abre una incidencia por cada causa raíz."
        },
        {
          "k": "h",
          "t": "Desde entonces: del 1 al 3 de noviembre"
        },
        {
          "k": "ul",
          "items": [
            "El modo de análisis de PRO está terminado. Corregimos resultados que estaban mal sin ningún aviso: el generador de cargas ya no carga los aleros de una nave como si fueran un piso, y el peso sísmico de cada nivel ahora incluye las losas y los muros dibujados como cáscaras, que dejaba afuera (#1076).",
            "Las exportaciones funcionan en edificios reales. Las hojas grandes de Excel se escriben fila por fila, y la memoria de un edificio de seis pisos tarda unos diez segundos en lugar de cuatro minutos. “Verificar un reporte exportado” ahora compara los números impresos, no solo las huellas (#1076).",
            "PRO sumó ayuda en línea que se puede apagar, un estado de guardado en el encabezado, una memoria después del análisis, resultados de placas y un visor de solo lectura para modelos compartidos con “Duplicar y editar” (#1077, #1078).",
            "Un factor de pandeo por encima de su cota superior certificada de forma independiente ahora se rechaza, en 2D y en 3D (#817, versión de resultados 6). Volvé a certificar antes de confiar en un certificado de pandeo anterior.",
            "Los enlaces compartidos con números no finitos, o con barras, apoyos o cargas que apuntan a algo que no existe, se rechazan en lugar de abrirse (#1058).",
            "La suite de invariancia ahora verifica seis análisis prioritarios ante rotación, simetría y superposición, y cuatro de ellos ante un escalado uniforme de la rigidez (#1060)."
          ]
        },
        {
          "k": "h",
          "t": "Controles que responden en veinte minutos"
        },
        {
          "k": "p",
          "t": "Cada cambio en Stabileo pasa por los mismos controles antes de llegar a main: pruebas del motor, pruebas unitarias de la web, builds de producción, pruebas de extremo a extremo en un navegador, las instantáneas de resultados y el control de determinismo. Una corrección que afecta la seguridad estructural no llega más rápido que esos controles, así que el 4 de noviembre trabajamos en su velocidad. Primero medimos. En una ejecución limpia de la cola de merge de 44 a 47 minutos, las pruebas del motor y las unitarias terminaban entre 8 y 15 minutos antes del final, así que sumar más en paralelo no habría servido de nada. El tiempo se iba en compilar los paquetes de investigación uno detrás de otro y en el fragmento de extremo a extremo más lento. Una vez acortados esos dos, el fragmento más lento era lento por la preparación: en una ejecución dedicó 7,2 de sus 16 minutos a las pruebas y seis y medio a descargar paquetes de navegadores desde un mirror lento."
        },
        {
          "k": "ul",
          "items": [
            "Compilar una vez y probar lo compilado. Las pruebas de los builds de producción hacían cinco builds propios más, cuatro de ellos del mismo árbol que CI acababa de compilar; esos cuatro ahora leen ese build (#1411). Cada build lleva un sello de todo aquello a partir de lo que se compiló, y una prueba falla, nunca se omite, si el sello no coincide con el árbol sobre el que corre.",
            "Caché por entradas. Cada paquete de investigación se guarda en caché bajo una clave de sus propias entradas, incluido el motor que enlaza cada paquete, de modo que un cambio en un artículo recompila solo ese artículo y un cambio en el motor los recompila todos. Un pull request reutiliza los paquetes que la cola de merge ya compiló a partir de las mismas entradas, después de verificar cada archivo contra su checksum, y puede leer esa caché pero nunca escribir en ella (#1395). Los paquetes de navegadores también salen de una caché, en lugar del mirror (#1413).",
            "Ejecutar solo lo que un cambio puede afectar. Un cambio en la documentación no compila nada y termina en uno o dos minutos, en lugar de una ejecución completa. Un cambio solo en el sitio omite los trabajos del motor pero mantiene todos los fragmentos de extremo a extremo, porque 59 de las 281 especificaciones leen texto en pantalla (#1381). En la cola, el alcance de cada entrada se define por su propio diff contra la entrada que tiene delante, lo cual es válido porque una entrada se integra solo si pasaron todas las entradas que tiene delante; cuando el diff falta o no es claro, se ejecuta todo (#1400).",
            "Equilibrar el camino más lento. Las pruebas de extremo a extremo corren en 14 fragmentos en lugar de 10, equilibrados según tiempos medidos (#1382). La tabla de tiempos anterior predecía 41,5 minutos de pruebas donde una ejecución tardó 69,8."
          ]
        },
        {
          "k": "table",
          "caption": "Duración real de las ejecuciones exitosas de CI que corrieron todos los trabajos, desde su creación hasta el último trabajo, medida con la API de GitHub Actions. Antes: 4 de noviembre, desde las 08:00 UTC (pull requests) o las 13:48 UTC (cola de merge) hasta las 21:10 UTC; después: desde las 21:15 UTC hasta las 03:00 UTC del 5 de noviembre.",
          "head": [
            "Ejecuciones",
            "Cantidad",
            "Mediana",
            "Rango"
          ],
          "rows": [
            [
              "Cola de merge, antes",
              "20",
              "42 min",
              "de 25 a 56 min"
            ],
            [
              "Cola de merge, después",
              "10",
              "20 min",
              "de 15 a 26 min"
            ],
            [
              "Pull requests (primer intento), antes",
              "69",
              "59 min",
              "de 35 a 127 min"
            ],
            [
              "Pull requests (primer intento), después",
              "19",
              "27 min",
              "de 16 a 45 min"
            ]
          ]
        },
        {
          "k": "h",
          "t": "Un control en rojo que no es culpa del cambio"
        },
        {
          "k": "p",
          "t": "Una falla causada por la red o por una máquina perdida es ruido, pero también es un control en rojo que alguien tiene que mirar, y la costumbre de volver a ejecutar los controles en rojo es la forma en que una falla real termina dejándose pasar. Por eso los trabajos fallidos de un pull request se vuelven a ejecutar una vez, automáticamente, solo cuando cada trabajo fallido trae evidencia positiva de una falla de infraestructura: un timeout en un paso de descarga, un runner perdido, un error de red que termina el último intento de una descarga (#1380). Cualquier cosa que parezca una falla de prueba en cualquier parte del log bloquea la reejecución, y lo mismo pasa con cualquier cosa que el clasificador no reconozca. Eso la hace segura: nunca vuelve a ejecutar un paso de pruebas, una falla real vuelve a fallar en la reejecución, y lo peor que puede causar un log mal leído es una ejecución extra de los mismos trabajos."
        },
        {
          "k": "p",
          "t": "Otras dos correcciones eliminaron falsas alarmas. Una ejecución de pull request cancelada porque otra más nueva sobre el mismo commit la reemplazó mostraba un control obligatorio en rojo; ahora omite ese control, pero solo después de confirmar que la ejecución más nueva existe y no falló, porque un control obligatorio omitido cuenta como aprobado (#1397). Y una descarga trabada podía dejar un proceso con el lock del gestor de paquetes, así que el reintento fallaba por el lock y no por la descarga; ahora un intento cuenta como trabado solo después de varios minutos sin salida, se detiene junto con todo lo que inició, y el reintento espera el lock (#1408)."
        },
        {
          "k": "h",
          "t": "Qué sigue"
        },
        {
          "k": "p",
          "t": "Estamos completando las comparaciones pendientes y acelerando el sitio y el solver. Lo próximo en la hoja de ruta es un paquete de Python (pip install stabileo) y un manual público de verificación generado a partir de los benchmarks."
        }
      ]
    },
    "pt": {
      "title": "Pesquisa, ferramentas e a verificação dos nossos testes",
      "excerpt": "O que publicamos nos últimos dias: pesquisa executável, oito calculadoras e verificações dos próprios modelos de referência. O que funciona, o que estava errado e o que falta revisar.",
      "blocks": [
        {
          "k": "p",
          "t": "Nos últimos dias adicionamos Stabileo Research e Stabileo Tools e reforçamos suas verificações. Stabileo é software gratuito e de código aberto para engenharia estrutural com IA, publicado pelo Ergodic Group. LambdaClass é seu braço de desenvolvimento."
        },
        {
          "k": "h",
          "t": "Pesquisa que você pode executar"
        },
        {
          "k": "p",
          "t": "Estamos trazendo artigos publicados de engenharia estrutural e benchmarks clássicos ao navegador, com o visualizador do Stabileo. Cada página informa o que reproduz, como verificamos os resultados e os limites da comparação. Estamos concluindo as páginas que ainda mostram comparações pendentes."
        },
        {"k": "img", "base": "blog/research", "w": 1600, "h": 1000, "alt": "A página do Stabileo Research, «Pesquisa em engenharia estrutural», com a nota de que é pesquisa e não uma ferramenta de projeto, e a primeira entrada executável, o pórtico de Lee (1968), com sua trajetória de carga.", "caption": "stabileo.com/research: cada página diz o que reproduz e como foi verificada."},
        {
          "k": "p",
          "t": "As páginas de artigos disponíveis cobrem fratura por campo de fase de Shauer (2025); redes de molas de Grossman e Boudaoud (2026); otimização topológica de Andreassen et al. (2011); estabilidade do pórtico de Roorda de Ferrari e Sigmund (2025); busca de forma de redes de cabos de Pastrana et al. (2026); arcos com salto de Zmyślony, Khan e Biggins (2026); e cascas reticuladas de Fairclough et al. (2026)."
        },
        {
          "k": "p",
          "t": "Os clássicos do motor são MacNeal–Harder, o circuito de testes de cascas, a elástica de Mattiasson, Riks/Crisfield, Newmark, CQC, colapso plástico, a placa de Navier, o pórtico de Lee e o arco de DaDeppo–Schmidt. As páginas distinguem cálculo ao vivo de reprodução de resultados gravados e mostram os limites da comparação. A comparação de Koiter de Ferrari está incompleta; Fairclough cobre um exemplo de cinco nós; o salto de equilíbrio do arco não é uma simulação transiente."
        },
        {
          "k": "p",
          "t": "Publicamos o escopo e as evidências e os revisamos abertamente. Resultados de pesquisa não são resultados de projeto, e concordância com um benchmark não é certificação."
        },
        {
          "k": "table",
          "caption": "Disponível hoje:",
          "head": [
            "Oferta",
            "Quantidade"
          ],
          "rows": [
            [
              "Páginas de artigos executáveis",
              "7"
            ],
            [
              "Páginas de benchmarks do motor",
              "10"
            ],
            [
              "Calculadoras",
              "8"
            ]
          ]
        },
        {
          "k": "h",
          "t": "Os testes também precisam ser verificados"
        },
        {
          "k": "p",
          "t": "Algumas páginas estavam erradas porque nossos modelos de teste estavam errados. Cada página de benchmark do motor e seu teste de CI agora leem o mesmo arquivo de caso, de modo que corrigir o modelo atualiza ambos. Algumas comparações provisórias continuam explicitamente ignoradas na CI e ainda não bloqueiam integrações; estamos concluindo essas comparações."
        },
        {
          "k": "p",
          "t": "Corrigimos as referências de Mattiasson e o tratamento do alongamento axial (#845), um pórtico de nós rígidos comparado com uma fórmula de treliça puramente axial (#846) e modelos incorretos de apoios e cargas em cascas (#810). Estamos mudando como os benchmarks são construídos para que essa classe de erro não volte a passar. A primeira parte já está incorporada: cada benchmark é uma especificação com duas referências independentes que devem concordar e verificações automáticas de carga aplicada, equilíbrio das reações e simetria, incluindo comparações entre meio modelo e modelo completo. Estamos adicionando convergência em três ou mais malhas, um teste com erro de sinal que comprova que cada benchmark pode falhar e a aprovação de um engenheiro para o conjunto principal."
        },
        {"k": "img", "base": "blog/research-mattiasson", "w": 1600, "h": 1000, "alt": "A página do benchmark da elástica de Mattiasson (1981), aba Resultados: um gráfico de u/L e v/L em função de PL²/EI com as curvas do Stabileo e círculos para as referências analíticas, e uma tabela de valores com seus erros relativos. À esquerda, 5 de 5 verificações aprovadas e a nota de que é pesquisa, não uma ferramenta de projeto.", "caption": "A página de Mattiasson corrigida: a resposta do motor contra duas referências analíticas independentes."},
        {
          "k": "p",
          "t": "Também estamos incorporando unidades ao sistema de tipos (#864), para detectar confusões entre kN/N ou m/mm na compilação. A primeira parte, para o caminho de materiais e seções dos pórticos 2D, foi integrada em 3 de novembro."
        },
        {
          "k": "h",
          "t": "Oito calculadoras, com acesso ao editor"
        },
        {
          "k": "p",
          "t": "Stabileo Tools tem calculadoras gratuitas para vigas biapoiadas, balanços, flambagem elástica de pilares, vigas contínuas, pórticos de um vão, treliças planas, linhas de influência de cargas móveis e frequências de flexão de vigas. Usam o motor de produção, mostram comparações clássicas independentes e declaram suas hipóteses. Cada uma abre seu modelo no editor completo. São ferramentas de análise, não verificações normativas completas."
        },
        {"k": "img", "base": "blog/tools", "w": 1600, "h": 1000, "alt": "A página do Stabileo Tools, «Calculadoras de engenharia gratuitas», que começa com a calculadora de viga simplesmente apoiada: uma viga sob carga distribuída com sua deformada e um botão para abri-la.", "caption": "stabileo.com/tools: oito calculadoras sobre o motor de produção."},
        {
          "k": "h",
          "t": "Conter resultados errados"
        },
        {
          "k": "p",
          "t": "Estamos contendo todos os problemas conhecidos de resultados incorretos: as recusas ou os avisos do motor incluem o identificador do problema, em vez de retornar um número sem verificação (#807, em revisão). Cada recusa é testada, incluindo modelos dinâmicos não suportados com excentricidades de barras ou cascas."
        },
        {
          "k": "p",
          "t": "Os testes metamórficos revelaram erros de invariância: modelos equivalentes podiam ser recusados após rotação, espelhamento ou mudança de escala das unidades. Agora executamos a suíte metamórfica a cada alteração para detectar essas regressões. Estamos adicionando uma execução noturna de modelos aleatórios que agrupa os achados por causa raiz e abre uma issue por causa raiz."
        },
        {
          "k": "h",
          "t": "Desde então: de 1 a 3 de novembro"
        },
        {
          "k": "ul",
          "items": [
            "O modo de análise do PRO está concluído. Corrigimos resultados que estavam errados sem nenhum aviso: o gerador de cargas não carrega mais os beirais de um galpão como se fossem um piso, e o peso sísmico de cada nível agora inclui as lajes e paredes desenhadas como cascas, que ficavam de fora (#1076).",
            "As exportações funcionam em edifícios reais. As planilhas grandes do Excel são escritas linha por linha, e o memorial de um edifício de seis andares leva cerca de dez segundos em vez de quatro minutos. “Verificar um relatório exportado” agora compara os números impressos, não só as impressões digitais (#1076).",
            "O PRO ganhou ajuda em linha que pode ser desligada, um estado de salvamento no cabeçalho, um memorial depois da análise, resultados de placas e um visualizador somente leitura para modelos compartilhados com “Duplicar e editar” (#1077, #1078).",
            "Um fator de flambagem acima do seu limite superior certificado de forma independente agora é recusado, em 2D e em 3D (#817, versão de resultados 6). Refaça a certificação antes de confiar num certificado de flambagem anterior.",
            "Links compartilhados com números não finitos, ou com barras, apoios ou cargas que apontam para algo inexistente, são recusados em vez de abertos (#1058).",
            "A suíte de invariância agora verifica seis análises prioritárias sob rotação, espelhamento e superposição, e quatro delas sob escala uniforme da rigidez (#1060)."
          ]
        },
        {
          "k": "h",
          "t": "Verificações que respondem em vinte minutos"
        },
        {
          "k": "p",
          "t": "Toda alteração no Stabileo passa pelas mesmas verificações antes de chegar à main: testes do motor, testes unitários da web, builds de produção, testes de ponta a ponta num navegador, os snapshots de resultados e a verificação de determinismo. Uma correção de um resultado errado não chega mais rápido do que essas verificações, por isso em 4 de novembro trabalhamos na velocidade delas. Primeiro medimos. Numa execução limpa da fila de merge de 44 a 47 minutos, os testes do motor e os unitários terminavam de 8 a 15 minutos antes do fim, então adicionar mais deles em paralelo não teria ganhado nada. O tempo ia para compilar os pacotes de pesquisa um depois do outro e para o fragmento de ponta a ponta mais lento. Depois que esses ficaram mais curtos, o fragmento mais lento era lento por causa da preparação: numa execução, gastou 7,2 dos seus 16 minutos em testes e seis e meio baixando pacotes de navegadores de um espelho lento."
        },
        {
          "k": "ul",
          "items": [
            "Compilar uma vez, testar o que foi compilado. Os testes dos builds de produção faziam mais cinco builds próprios, quatro deles da mesma árvore que a CI tinha acabado de compilar; esses quatro agora leem aquele build (#1411). Cada build leva um selo de tudo a partir do que foi compilado, e um teste falha, nunca é pulado, se o selo não corresponder à árvore em que roda.",
            "Cache por entradas. Cada pacote de pesquisa é guardado em cache sob uma chave das suas próprias entradas, incluindo o motor que todo pacote vincula, de modo que uma alteração num artigo recompila só esse artigo e uma alteração no motor recompila todos. Um pull request reutiliza os pacotes que a fila de merge já compilou a partir das mesmas entradas, depois de verificar cada arquivo contra seu checksum, e pode ler esse cache, mas nunca escrever nele (#1395). Os pacotes de navegadores também vêm de um cache, em vez do espelho (#1413).",
            "Executar só o que uma alteração pode afetar. Uma alteração na documentação não compila nada e termina em um ou dois minutos, em vez de uma execução completa. Uma alteração só no site pula os jobs do motor, mas mantém todos os fragmentos de ponta a ponta, porque 59 das 281 specs leem texto na tela (#1381). Na fila, o escopo de cada entrada é definido pelo seu próprio diff em relação à entrada à frente dela, o que é válido porque uma entrada só é integrada se todas as entradas à frente dela passaram; quando o diff está ausente ou não está claro, tudo é executado (#1400).",
            "Equilibrar o caminho mais lento. Os testes de ponta a ponta rodam em 14 fragmentos em vez de 10, equilibrados por tempos medidos (#1382). A tabela de tempos antiga previa 41,5 minutos de testes onde uma execução levou 69,8."
          ]
        },
        {
          "k": "table",
          "caption": "Tempo real das execuções bem-sucedidas de CI que rodaram todos os jobs, da criação até o último job, medido pela API do GitHub Actions. Antes: 4 de novembro, das 08:00 UTC (pull requests) ou 13:48 UTC (fila de merge) até as 21:10 UTC; depois: das 21:15 UTC até as 03:00 UTC de 5 de novembro.",
          "head": [
            "Execuções",
            "Quantidade",
            "Mediana",
            "Intervalo"
          ],
          "rows": [
            [
              "Fila de merge, antes",
              "20",
              "42 min",
              "de 25 a 56 min"
            ],
            [
              "Fila de merge, depois",
              "10",
              "20 min",
              "de 15 a 26 min"
            ],
            [
              "Pull requests (primeira tentativa), antes",
              "69",
              "59 min",
              "de 35 a 127 min"
            ],
            [
              "Pull requests (primeira tentativa), depois",
              "19",
              "27 min",
              "de 16 a 45 min"
            ]
          ]
        },
        {
          "k": "h",
          "t": "Uma verificação vermelha que não é culpa da alteração"
        },
        {
          "k": "p",
          "t": "Uma falha causada pela rede ou por uma máquina perdida é ruído, mas também é uma verificação vermelha que alguém precisa olhar, e o hábito de reexecutar verificações vermelhas é como uma falha real acaba sendo deixada passar. Por isso os jobs que falharam num pull request são reexecutados uma vez, automaticamente, só quando cada job que falhou traz evidência positiva de uma falha de infraestrutura: um timeout numa etapa de download, um runner perdido, um erro de rede que encerra a última tentativa de um download (#1380). Qualquer coisa que pareça uma falha de teste em qualquer parte do log bloqueia a reexecução, assim como qualquer coisa que o classificador não reconheça. Isso a torna segura: ela nunca reexecuta uma etapa de testes, uma falha real falha de novo na reexecução, e o pior que um log mal interpretado pode causar é uma execução extra dos mesmos jobs."
        },
        {
          "k": "p",
          "t": "Duas outras correções eliminaram alarmes falsos. Uma execução de pull request cancelada porque uma execução mais nova no mesmo commit a substituiu mostrava uma verificação obrigatória vermelha; agora ela pula essa verificação, mas só depois de confirmar que a execução mais nova existe e não falhou, porque uma verificação obrigatória pulada conta como aprovada (#1397). E um download travado podia deixar um processo segurando o lock do gerenciador de pacotes, então a nova tentativa falhava no lock e não no download; agora uma tentativa só conta como travada depois de minutos sem saída, é interrompida junto com tudo o que iniciou, e a nova tentativa espera pelo lock (#1408)."
        },
        {
          "k": "h",
          "t": "O que vem a seguir"
        },
        {
          "k": "p",
          "t": "Estamos concluindo as comparações pendentes e acelerando o site e o solver. Os próximos itens do roteiro são um pacote Python (pip install stabileo) e um manual público de verificação gerado a partir dos benchmarks."
        }
      ]
    }
  }
};
