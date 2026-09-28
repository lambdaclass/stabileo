/**
 * The first post: the determinism boundary.
 *
 * Adapted from "Desarrollo de un agente estructural de cálculo sobre un solver
 * verificado" (Chesta, Bertero, Carrone, Kingston — JAIE 2026). Every number
 * quoted here is a number from that paper, which in turn are outputs of the
 * Stabileo solver and its CIRSOC 201 module: the 6 m portal frame of §6.1 and
 * the four-span, three-storey building of §6.3. They are not illustrative
 * figures, so they are not to be rounded, re-derived or "improved" here — if a
 * value ever needs changing, it changes in the paper first.
 *
 * ── The §6.1 inversion, and why the obvious explanation of it is wrong ──
 *
 * The demand rising from 80.8 to 105.6 kN·m when the beam grows is the whole
 * argument of the post, and it used to be explained as "a stiffer section
 * attracts more moment". That heuristic is about parallel load paths and it
 * has the mechanism backwards here.
 *
 * Statics fixes the SUM: for a symmetric portal under a UDL, end moment plus
 * mid-span moment is qL²/8 = 135 kN·m at both sections. Stiffness only decides
 * the split. With a = EI_beam/L and c = EI_col/h, slope-deflection gives
 *
 *     M_end = 180·c / (a + 2c)      →  0 as a/c → ∞
 *
 * so a beam that stiffens RELATIVE TO ITS COLUMNS loses end restraint and
 * approaches the simply supported case, and the mid-span moment — the one the
 * table reports as Mu — grows towards 135. The columns attract LESS, not more.
 * Checked against the paper's own figures: 25×40 gives 54.3 / 80.7 and 30×55
 * gives 29.5 / 105.5, reproducing both quoted values to within 0.1 %.
 *
 * The prose deliberately states the mechanism without those intermediate
 * numbers, because they are not in the paper and everything numeric here is.
 */
import type { Post } from '../types';

export const determinismBoundary: Post = {
  slug: 'the-determinism-boundary',
  date: '2026-08-12',
  order: 1,
  authors: ['Bautista Chesta', 'Raúl Bertero', 'Federico Carrone', 'Diego Kingston'],
  tagKeys: ['blog.tag.ai', 'blog.tag.solver', 'blog.tag.research'],
  i18n: {
    es: {
      title: 'La frontera de determinismo: por qué un agente de IA no debe calcular',
      excerpt:
        'Un modelo de lenguaje no puede garantizar que un número sea correcto. En la arquitectura que proponemos para cálculo estructural, el agente interpreta y propone, y todos los números salen de un solver verificado.',
      blocks: [
        { k: 'p', t: 'Décadas de software comercial volvieron rápida la parte estrictamente numérica del análisis estructural. Ensamblar una matriz de rigidez y resolver un sistema lineal es un problema bien conocido y barato de computar. El tiempo del ingeniero se va en otra parte: construir el modelo, rehacerlo cada vez que cambia la arquitectura, definir cargas y combinaciones, verificar elemento por elemento contra la normativa y producir la memoria de cálculo y los planos.' },
        { k: 'p', t: 'El cuello de botella está en ese trabajo manual alrededor del cálculo. Ahí, en construir, modificar, verificar y documentar el modelo, es donde un agente de IA puede aportar algo, con una condición: que no toque el cálculo.' },

        { k: 'h', t: 'Lo que un modelo de lenguaje no puede garantizar' },
        { k: 'p', t: 'Un modelo de lenguaje genera texto de manera probabilística. No conoce las leyes de la física ni el comportamiento de los sistemas reales, y puede alucinar: devolver respuestas que suenan plausibles y son incoherentes. En análisis estructural el riesgo es concreto, porque modelar exige razonamiento espacial y consistencia topológica, y cuando el modelo se arma en varios pasos los errores se acumulan.' },
        { k: 'p', t: 'La restricción más fuerte, igual, viene de la práctica profesional. Cada resultado estructural lleva una firma, con la autoría y la responsabilidad legal que eso implica. El número que dimensiona una columna es un compromiso del ingeniero matriculado que lo firma. Un agente que entrega resultados sin verificar le traslada al profesional el riesgo de firmar un cálculo que nadie comprobó.' },
        { k: 'quote', t: 'La corrección del resultado tiene que ser una propiedad del solver, no del lenguaje.' },

        { k: 'h', t: 'La frontera de determinismo' },
        { k: 'p', t: 'La arquitectura separa el razonamiento en lenguaje natural del cálculo numérico. El agente propone diseños y escenarios, pero un resultado sólo es válido si salió de un programa que el agente no puede modificar y que contiene la física del problema. El modelo decide qué herramienta determinística invocar y con qué parámetros, e integra lo que esa herramienta devuelve. Nunca origina un número ni inventa geometría.' },
        { k: 'p', t: 'En la práctica, eso se organiza en tres capas. La capa de intención es el agente: interpreta lenguaje natural, hace preguntas de clarificación y emite acciones tipadas. La capa de cómputo determinístico reúne todo lo que produce datos de ingeniería: el solver que resuelve, los módulos CIRSOC que verifican y los generadores que expanden una tipología en un modelo completo. La capa de documentación produce memorias, planos y cómputos a partir de resultados ya calculados.' },
        { k: 'p', t: 'El patrón no es nuevo. Domina la literatura reciente sobre agentes de ingeniería y aparece en dominios vecinos: los agentes de programación funcionan porque un compilador y una batería de tests dicen si el código compila y pasa, y AlphaProof demuestra teoremas porque un verificador formal no deja pasar un error. Nosotros lo adoptamos a propósito como principio de diseño.' },

        { k: 'h', t: 'Qué garantiza la frontera y qué queda afuera' },
        { k: 'p', t: 'Conviene precisar qué garantiza esta frontera y qué queda fuera de ella. Lo que garantiza:' },
        {
          k: 'ul',
          items: [
            'Toda afirmación numérica del agente es trazable a un resultado específico del solver: combinación, estación, elemento.',
            'Toda salida de la IA se valida contra el esquema del modelo antes de importarse, y se rechaza si viene malformada o con campos desconocidos.',
            'Si el servicio de IA no está disponible, el solver, el editor y las verificaciones siguen funcionando.',
          ],
        },
        { k: 'p', t: 'Lo que no garantiza: que el modelo idealizado sea el adecuado para el problema real (eso es una decisión de ingeniería), que el diseño sea óptimo, que las cargas y los supuestos estén completos ni que la interpretación normativa esté exenta de revisión.' },
        { k: 'note', t: 'La frontera permite controlar de dónde sale cada resultado; no garantiza que el modelo planteado represente correctamente el problema real. El agente se comporta como un asistente de borrador: propone un cambio, el usuario ve un resumen de lo que se va a modificar y puede aplicarlo, reintentar o cancelar. Cada cambio aplicado es un único paso de deshacer.' },

        { k: 'h', t: 'Un caso que obliga a volver a resolver' },
        { k: 'p', t: 'El ingeniero describe un pórtico de hormigón armado de 6 m de luz y 4 m de altura, con bases empotradas y una carga distribuida sobre la viga. El agente pregunta lo que falta: ¿acero u hormigón?, ¿bases empotradas o articuladas?, ¿hay carga lateral? Después emite la acción que crea el pórtico. El backend la expande de forma determinística en un modelo de 4 nodos, 3 elementos y 6 grados de libertad libres. Se adopta H-21, viga inicial de 25×40 cm, columnas de 30×30 cm y 30 kN/m sobre la viga.' },
        { k: 'p', t: 'Resuelto el modelo, las reacciones verticales son de 90 kN por columna y el equilibrio global se cumple de forma exacta: ΣRz = 180 kN = q·L. El momento gobernante de la viga es Mu = 80,8 kN·m en el centro de la luz. La verificación CIRSOC 201 a flexión de la viga 25×40 armada con 3Ø16 da una capacidad φMn = 73,3 kN·m. La viga no verifica.' },
        {
          k: 'table',
          caption: 'Verificación a flexión de la viga del pórtico, antes y después de la corrección.',
          head: ['Estado', 'Sección', 'Armadura', 'Mu [kN·m]', 'φMn [kN·m]', 'D/C', 'Verifica'],
          rows: [
            ['Inicial', '25×40 cm', '3Ø16', '80,8', '73,3', '1,10', 'No'],
            ['Corregido', '30×55 cm', '3Ø16', '105,6', '108,6', '0,97', 'Sí'],
          ],
        },
        { k: 'p', t: 'Mirá la columna de Mu. Al agrandar la viga de 25×40 a 30×55, la demanda sube de 80,8 a 105,6 kN·m. En un pórtico hiperestático la suma del momento de extremo y el del centro del vano está fijada por la estática; lo que cambia con la rigidez es el reparto. Una viga más rígida en relación con sus columnas recibe menos empotramiento de ellas y se acerca al caso biapoyado, así que su momento de centro, que es el que gobierna acá, crece.' },
        { k: 'quote', t: 'Un agente que estimara el efecto sin recalcular se equivocaría, y sonaría igual de convincente al hacerlo.' },
        { k: 'p', t: 'El ejemplo muestra por qué hay que volver a resolver el modelo, además de recalcular la capacidad de la sección nueva. En una estructura hiperestática, agrandar una sección modifica la distribución de esfuerzos, y la demanda puede subir justo en el elemento que se quería aliviar.' },

        { k: 'h', t: 'Sacar una columna de un proyecto ya calculado' },
        { k: 'p', t: 'El segundo caso parte de un pórtico de cuatro vanos de 5 m y tres pisos de 3 m, con bases empotradas, vigas de 25×50 cm (4Φ16), columnas de 35×35 cm y 25 kN/m sobre todas las vigas: 20 nodos, 27 elementos, 45 grados de libertad libres. Resuelto y verificado, todas las vigas cumplen con holgura.' },
        { k: 'p', t: 'Por una decisión de arquitectura se elimina una columna interior de planta baja. La acción de edición la quita con validación de integridad estructural y el modelo se vuelve a resolver; el equilibrio global se mantiene antes y después (ΣRz = 1500 kN). Las vigas que apoyaban en esa columna pasan a salvar 10 m y, junto con las que quedan alineadas encima, redistribuyen el apoyo perdido. Seis vigas superan D/C = 1.' },
        {
          k: 'table',
          caption: 'La viga gobernante del edificio en los tres estados.',
          head: ['Estado', 'Sección', 'Mu [kN·m]', 'φMn [kN·m]', 'D/C', 'Verifica'],
          rows: [
            ['Intacto', '25×50 (4Φ16)', '54,2', '125,3', '0,43', 'Sí'],
            ['Sin la columna', '25×50 (4Φ16)', '203,9', '125,3', '1,63', 'No'],
            ['Redimensionado', '30×65 (5Φ20)', '189,8', '313,7', '0,61', 'Sí'],
          ],
        },
        { k: 'p', t: 'El momento de la viga gobernante casi se cuadruplica. Con 30×65 cm y 5Φ20 en las vigas afectadas, y después de volver a resolver, todas verifican. Este caso muestra además que un cambio que a mano exige volver a modelar, analizar, verificar y detallar muchos elementos se resuelve en una conversación corta, con cada número trazable al solver y sujeto a la aprobación del ingeniero.' },

        { k: 'h', t: 'Decisiones de arquitectura' },
        {
          k: 'ol',
          items: [
            'Acciones tipadas en lugar de generación libre de código. En varios trabajos previos, el modelo escribe scripts de Python que después se ejecutan contra un solver externo. Acá la salida del agente está restringida a un conjunto cerrado de llamadas con contratos de entrada y salida explícitos, que se validan contra un esquema antes de ejecutarse. Es una frontera más estrecha y más fácil de auditar que el código arbitrario.',
            'Un solver propio, en lugar de una capa sobre un solver de terceros. El motor está escrito desde cero en Rust, sin dependencias externas de álgebra lineal, y tiene su propia batería de verificación contra soluciones analíticas y benchmarks de referencia: alrededor de 6.800 tests en verde, y resultados contrastados con un programa comercial sobre los mismos modelos, con diferencias por debajo del 0,1 %.',
            'Cumplimiento normativo nativo. La verificación según CIRSOC 201 y 301, que no encontramos implementada de forma nativa en ningún software de código abierto. El módulo de hormigón está implementado y testeado; el de acero vive todavía sólo en la capa de frontend y no tiene batería de tests dedicada. Lo decimos así para no atribuirle una madurez que no tiene.',
            'Ejecución en el navegador. El motor compila a WebAssembly y corre localmente en la máquina del usuario, sin servidor de cálculo y sin instalación.',
          ],
        },

        { k: 'h', t: 'De un solver testeado a un solver probado' },
        { k: 'p', t: 'La frontera garantiza que toda afirmación del agente es trazable a una salida del solver. Esa garantía hereda un límite: el solver es confiable porque está extensamente testeado, pero no tiene una demostración formal de corrección. Una suite de tests, por exhaustiva que sea, cubre sólo los casos que imaginaron sus autores.' },
        { k: 'p', t: 'Esto es todavía más importante en este contexto. Un agente construye modelos, los modifica en varios pasos y consulta los resultados para proponer nuevas acciones; en ese ciclo el solver recibe entradas que ningún ingeniero revisó antes de que llegaran al motor. Si el motor se comporta mal en algún caso de borde (una matriz de rigidez casi singular, una geometría degenerada, una combinación extrema), el agente puede citar ese resultado sin advertencia.' },
        { k: 'p', t: 'Hay dos herramientas para achicar esa brecha. El fuzzing basado en propiedades genera miles de modelos aleatorios válidos y comprueba invariantes que se tienen que cumplir para cualquier entrada:' },
        {
          k: 'ul',
          items: [
            'Equilibrio global: ΣR = P, con independencia de la geometría, los materiales o los apoyos.',
            'Simetría de la matriz de rigidez: K = Kᵀ por construcción.',
            'Definitud positiva de K para cualquier estructura sin mecanismos.',
            'Invariancia ante transformaciones rígidas: desplazar o rotar un modelo no cambia los esfuerzos internos.',
          ],
        },
        { k: 'p', t: 'La verificación formal ataca la misma brecha por el otro lado: escribir una especificación matemática de esas propiedades y demostrar, con un asistente de pruebas como Lean 4, que la implementación la satisface. El testing puede encontrar errores; la verificación formal puede demostrar su ausencia dentro del dominio especificado. Las dos técnicas se complementan: cuando el fuzzer encuentra una entrada que viola una propiedad, esa propiedad pasa a ser candidata para una prueba.' },
        { k: 'note', t: 'La meta es llegar a un solver cuyo núcleo numérico crítico esté formalmente verificado. Con eso, la frontera de determinismo pasaría a ser una garantía matemática: cada número citado en la memoria de cálculo sería trazable a un cómputo con corrección demostrada.' },

        { k: 'h', t: 'Dónde está esto hoy' },
        { k: 'p', t: 'Para cerrar, qué está disponible y qué no. El solver, el editor, la verificación CIRSOC, el modo educativo y la generación de memorias y planos funcionan hoy en el navegador, en stabileo.com, sin instalar nada y sin cuenta. La capa de agentes está en desarrollo activo: sus rutas corren en desarrollo y prueba contra un backend propio, sobre el mismo solver y los mismos números que todo lo demás, pero ese backend todavía no forma parte del sitio público.' },
        { k: 'p', t: 'El ciclo cerrado con el solver, en el que el agente propone, resuelve, evalúa y modifica sin intervención humana, está en la hoja de ruta y no está implementado. La cobertura normativa nativa se limita a CIRSOC 201 y 301; el resto es trabajo futuro.' },
        { k: 'p', t: 'El CAD se hizo cargo de la parte mecánica del dibujo y la planilla de cálculo de la aritmética repetitiva, y el criterio quedó en manos del ingeniero. El agente es el paso siguiente en esa línea: se ocupa de armar y modificar el modelo, cargar las acciones, correr las verificaciones y preparar la documentación. Nada de esto transfiere la responsabilidad: el número firmado sigue siendo del ingeniero.' },

        { k: 'note', t: 'Esta nota es una adaptación de "Desarrollo de un agente estructural de cálculo sobre un solver verificado" (Chesta, Bertero, Carrone y Kingston), presentado en las JAIE 2026. Los valores citados son salidas del solver de Stabileo y de su módulo CIRSOC 201, tomadas de ese trabajo.' }
      ],
    },

    en: {
      title: 'The determinism boundary: why an AI agent must not do the arithmetic',
      excerpt:
        'A language model cannot guarantee that a number is right. In the architecture we propose for structural engineering, the agent interprets and proposes, and every number comes from a verified solver.',
      blocks: [
        { k: 'p', t: 'Decades of commercial software have made the purely numerical part of structural analysis fast. Assembling a stiffness matrix and solving a linear system is a well-understood problem, and a cheap one to compute. The engineer’s time goes elsewhere: building the model, rebuilding it every time the architecture changes, defining loads and combinations, checking each element against the design code, and producing the calculation report and the drawings.' },
        { k: 'p', t: 'The bottleneck is that manual work around the calculation. Building, changing, checking and documenting the model is where an AI agent can help, on one condition: it must never touch the calculation itself.' },

        { k: 'h', t: 'What a language model cannot guarantee' },
        { k: 'p', t: 'A language model generates text probabilistically. It has no knowledge of physics or of how real systems behave, and it can hallucinate: produce answers that sound plausible and make no sense. In structural analysis the risk is concrete. Modelling requires spatial reasoning and topological consistency, and when a model is built over several steps, errors compound.' },
        { k: 'p', t: 'The strongest constraint, though, comes from professional practice. Every structural result is signed, with the authorship and legal liability that come with a signature. The number that sizes a column is a commitment by the licensed engineer who signs off on it. An agent that hands over unchecked results leaves the professional carrying the risk of signing a calculation nobody verified.' },
        { k: 'quote', t: 'Correctness has to be a property of the solver, not of the language.' },

        { k: 'h', t: 'The determinism boundary' },
        { k: 'p', t: 'The architecture separates reasoning in natural language from numerical computation. The agent proposes designs and scenarios, but a result only counts once it has come out of a program the agent cannot modify, one that encodes the physics of the problem. The model chooses which deterministic tool to call and with which parameters, and works with whatever the tool returns. It never produces a number of its own and never makes up geometry.' },
        { k: 'p', t: 'In practice this takes three layers. The intent layer is the agent: it interprets natural language, asks clarifying questions and emits typed actions. The deterministic computation layer holds everything that produces engineering data: the solver, the CIRSOC modules that run the design-code checks, and the generators that expand a structural typology into a complete model. The documentation layer produces reports, drawings and quantity take-offs from results that have already been computed.' },
        { k: 'p', t: 'This is not a new pattern. It dominates the recent literature on engineering agents and shows up in neighbouring fields: coding agents work because a compiler and a test suite tell them whether the code builds and passes, and AlphaProof proves theorems because a formal verifier lets no error through. We adopt it deliberately as a design principle.' },

        { k: 'h', t: 'What the boundary guarantees, and what falls outside it' },
        { k: 'p', t: 'It helps to be specific about what this boundary guarantees and what it leaves out. What it guarantees:' },
        {
          k: 'ul',
          items: [
            'Every number the agent states can be traced to a specific solver result: combination, station, element.',
            'Every AI output is validated against the model schema before it is imported, and rejected if it is malformed or contains unknown fields.',
            'If the AI service is down, the solver, the editor and the design-code checks keep working.',
          ],
        },
        { k: 'p', t: 'What it does not guarantee: that the idealised model is the right one for the real problem (that is an engineering decision), that the design is optimal, that the loads and assumptions are complete, or that the reading of the code needs no review.' },
        { k: 'note', t: 'The boundary lets you control where every result comes from; it does not guarantee that the model you set up represents the real problem correctly. The agent works like a drafting assistant: it proposes a change, the user sees a summary of what will be modified and can apply it, retry or cancel. Each applied change is a single undo step.' },

        { k: 'h', t: 'A case where the model has to be solved again' },
        { k: 'p', t: 'The engineer describes a reinforced concrete portal frame with a 6 m span and a height of 4 m, fixed bases and a distributed load on the beam. The agent asks for what is missing: steel or concrete? Fixed or pinned bases? Any lateral load? It then emits the action that creates the frame. The backend expands it deterministically into a model with 4 nodes, 3 elements and 6 free degrees of freedom. The design uses H-21 concrete, a 25×40 cm beam to start with, 30×30 cm columns and 30 kN/m on the beam.' },
        { k: 'p', t: 'Once the model is solved, each column carries a vertical reaction of 90 kN and global equilibrium holds exactly: ΣRz = 180 kN = q·L. The governing beam moment is Mu = 80.8 kN·m at midspan. The CIRSOC 201 flexural check of the 25×40 beam with 3Ø16 gives a capacity of φMn = 73.3 kN·m, so the beam fails the check.' },
        {
          k: 'table',
          caption: 'Flexural check of the frame beam, before and after the correction.',
          head: ['State', 'Section', 'Reinforcement', 'Mu [kN·m]', 'φMn [kN·m]', 'D/C', 'Passes'],
          rows: [
            ['Initial', '25×40 cm', '3Ø16', '80.8', '73.3', '1.10', 'No'],
            ['Corrected', '30×55 cm', '3Ø16', '105.6', '108.6', '0.97', 'Yes'],
          ],
        },
        { k: 'p', t: 'Look at the Mu column. Enlarging the beam from 25×40 to 30×55 raises the demand from 80.8 to 105.6 kN·m. In a statically indeterminate frame, statics fixes the sum of the end moment and the midspan moment; stiffness only changes how that sum is split. A beam that is stiffer relative to its columns gets less end restraint from them and behaves more like a simply supported beam, so its midspan moment, which governs here, goes up.' },
        { k: 'quote', t: 'An agent that estimated the effect without re-solving would get it wrong, and would sound just as convincing while doing so.' },
        { k: 'p', t: 'The example shows why the model has to be solved again, on top of recomputing the capacity of the new section. In an indeterminate structure, enlarging a section changes how internal forces are distributed, and the demand can rise in exactly the member you meant to relieve.' },

        { k: 'h', t: 'Removing a column from a building that has already been designed' },
        { k: 'p', t: 'The second case starts from a frame with four 5 m bays and three 3 m storeys, fixed bases, 25×50 cm beams (4Φ16), 35×35 cm columns and 25 kN/m on every beam: 20 nodes, 27 elements and 45 free degrees of freedom. Once solved and checked, every beam passes comfortably.' },
        { k: 'p', t: 'An architectural change removes an interior ground-floor column. The edit action deletes it with a structural-integrity validation, and the model is solved again; global equilibrium holds before and after (ΣRz = 1500 kN). The beams that were supported by that column now span 10 m and, together with the beams aligned above them, pick up the lost support. Six beams exceed D/C = 1.' },
        {
          k: 'table',
          caption: 'The governing beam of the building in its three states.',
          head: ['State', 'Section', 'Mu [kN·m]', 'φMn [kN·m]', 'D/C', 'Passes'],
          rows: [
            ['Intact', '25×50 (4Φ16)', '54.2', '125.3', '0.43', 'Yes'],
            ['Column removed', '25×50 (4Φ16)', '203.9', '125.3', '1.63', 'No'],
            ['Resized', '30×65 (5Φ20)', '189.8', '313.7', '0.61', 'Yes'],
          ],
        },
        { k: 'p', t: 'The governing beam’s moment nearly quadruples. With 30×65 cm and 5Φ20 in the affected beams and a new solve, every beam passes again. The case also shows that a change which, by hand, means re-modelling, re-analysing, re-checking and re-detailing many members can be handled in a short conversation, with every number traceable to the solver and subject to the engineer’s approval.' },

        { k: 'h', t: 'Four design decisions behind the boundary' },
        {
          k: 'ol',
          items: [
            'Typed actions instead of free-form code generation. In several earlier systems, the model writes Python scripts that are then run against an external solver. Here the agent’s output is limited to a closed set of calls with explicit input and output contracts, each validated against a schema before it runs. That boundary is narrower than arbitrary code and easier to audit.',
            'Our own solver, rather than a layer on top of someone else’s. The engine is written from scratch in Rust, with no external linear-algebra dependencies, and has its own verification suite against analytical solutions and reference benchmarks: around 6,800 passing tests, plus comparisons with a commercial program on the same models, with differences below 0.1%.',
            'Native design-code compliance. Checks to CIRSOC 201 and 301, which we have not found implemented natively in any open-source software. The concrete module is implemented and tested; the steel module still lives only in the frontend and has no dedicated test suite. We say so to avoid overstating how mature it is.',
            'Runs in the browser. The engine compiles to WebAssembly and runs locally on the user’s machine, with no compute server and nothing to install.',
          ],
        },

        { k: 'h', t: 'From a tested solver to a proven one' },
        { k: 'p', t: 'The boundary guarantees that every claim the agent makes can be traced to a solver output. That guarantee inherits a limit: the solver is trustworthy because it is extensively tested, but its correctness has not been formally proven. A test suite, however thorough, only covers the cases its authors thought of.' },
        { k: 'p', t: 'This matters even more in this context. An agent builds models, modifies them over several steps and reads the results to propose new actions; along the way the solver receives inputs that no engineer reviewed before they reached the engine. If the engine misbehaves on an edge case (a nearly singular stiffness matrix, degenerate geometry, an extreme load combination), the agent may quote that result without any warning.' },
        { k: 'p', t: 'Two techniques can narrow that gap. Property-based fuzzing generates thousands of valid random models and checks invariants that must hold for any input:' },
        {
          k: 'ul',
          items: [
            'Global equilibrium: ΣR = P, regardless of geometry, materials or supports.',
            'Stiffness-matrix symmetry: K = Kᵀ by construction.',
            'Positive definiteness of K for any structure without mechanisms.',
            'Invariance under rigid-body transformations: translating or rotating a model does not change the internal forces.',
          ],
        },
        { k: 'p', t: 'Formal verification approaches the same gap from the other side: write a mathematical specification of those properties and prove, with a proof assistant such as Lean 4, that the implementation satisfies it. Testing can find errors; formal verification can show they are absent within the specified domain. The two complement each other: when the fuzzer finds an input that breaks a property, that property becomes a candidate for a proof.' },
        { k: 'note', t: 'The goal is a solver whose critical numerical core is formally verified. At that point the determinism boundary would become a mathematical guarantee: every number quoted in a calculation report would trace back to a computation proven correct.' },

        { k: 'h', t: 'Where this stands today' },
        { k: 'p', t: 'To close, what is available and what is not. The solver, the editor, the CIRSOC checks, the education mode and report and drawing generation run today in the browser at stabileo.com, with nothing to install and no account needed. The agent layer is under active development: its routes run in development and testing against our own backend, on the same solver and the same numbers as everything else, but that backend is not yet part of the public site.' },
        { k: 'p', t: 'The closed solver-in-the-loop cycle, in which the agent proposes, solves, evaluates and modifies without human intervention, is on the roadmap and has not been implemented. Native design-code coverage is limited to CIRSOC 201 and 301; the rest is future work.' },
        { k: 'p', t: 'CAD took over the mechanical part of drafting and the spreadsheet took over repetitive arithmetic, while engineering judgement stayed with the engineer. The agent is the next step along that line: it takes on building and modifying the model, entering loads, running the checks and preparing the documentation. None of this transfers responsibility: the signed number is still the engineer’s.' },

        { k: 'note', t: 'This piece is adapted from "Desarrollo de un agente estructural de cálculo sobre un solver verificado" (Chesta, Bertero, Carrone and Kingston), presented at JAIE 2026. The figures quoted are outputs of the Stabileo solver and its CIRSOC 201 module, taken from that paper.' }
      ],
    },

    pt: {
      title: 'A fronteira de determinismo: por que um agente de IA não deve calcular',
      excerpt:
        'Um modelo de linguagem não consegue garantir que um número esteja certo. Na arquitetura que propomos para o cálculo estrutural, o agente interpreta e propõe, e todos os números saem de um solver verificado.',
      blocks: [
        { k: 'p', t: 'Décadas de software comercial tornaram rápida a parte estritamente numérica da análise estrutural. Montar uma matriz de rigidez e resolver um sistema linear é um problema bem conhecido e barato do ponto de vista computacional. O tempo do engenheiro vai para outras tarefas: montar o modelo, refazê-lo a cada mudança no projeto de arquitetura, definir carregamentos e combinações, verificar cada elemento segundo a norma e produzir o memorial de cálculo e os desenhos.' },
        { k: 'p', t: 'O gargalo está nesse trabalho manual em torno do cálculo. É aí, ao montar, alterar, verificar e documentar o modelo, que um agente de IA pode ajudar, com uma condição: não tocar no cálculo.' },

        { k: 'h', t: 'O que um modelo de linguagem não consegue garantir' },
        { k: 'p', t: 'Um modelo de linguagem gera texto de forma probabilística. Ele não conhece as leis da física nem o comportamento dos sistemas reais, e pode alucinar: dar respostas que parecem plausíveis e não fazem sentido. Na análise estrutural o risco é concreto, porque modelar exige raciocínio espacial e consistência topológica, e quando o modelo é construído em várias etapas os erros se acumulam.' },
        { k: 'p', t: 'A restrição mais forte, porém, vem da prática profissional. Todo resultado estrutural leva uma assinatura, com a autoria e a responsabilidade legal que isso implica. O número que dimensiona um pilar é um compromisso do engenheiro habilitado que o assina. Um agente que entrega resultados sem verificação transfere ao profissional o risco de assinar um cálculo que ninguém conferiu.' },
        { k: 'quote', t: 'A correção do resultado tem que ser uma propriedade do solver, não da linguagem.' },

        { k: 'h', t: 'A fronteira de determinismo' },
        { k: 'p', t: 'A arquitetura separa o raciocínio em linguagem natural do cálculo numérico. O agente propõe soluções e cenários, mas um resultado só vale se tiver saído de um programa que o agente não pode modificar e que contém a física do problema. O modelo decide qual ferramenta determinística chamar e com quais parâmetros, e trabalha com o que essa ferramenta devolve. Nunca gera um número por conta própria nem inventa geometria.' },
        { k: 'p', t: 'Na prática, isso se organiza em três camadas. A camada de intenção é o agente: interpreta linguagem natural, faz perguntas de esclarecimento e emite ações tipadas. A camada de cálculo determinístico reúne tudo o que produz dados de engenharia: o solver, os módulos CIRSOC que fazem as verificações e os geradores que expandem uma tipologia em um modelo completo. A camada de documentação produz memoriais, desenhos e quantitativos a partir de resultados já calculados.' },
        { k: 'p', t: 'O padrão não é novo. Ele predomina na literatura recente sobre agentes de engenharia e aparece em áreas vizinhas: agentes de programação funcionam porque um compilador e uma bateria de testes dizem se o código compila e passa, e o AlphaProof demonstra teoremas porque um verificador formal não deixa passar nenhum erro. Nós o adotamos de forma deliberada como princípio de projeto.' },

        { k: 'h', t: 'O que a fronteira garante e o que fica de fora' },
        { k: 'p', t: 'Convém deixar claro o que essa fronteira garante e o que fica fora dela. O que ela garante:' },
        {
          k: 'ul',
          items: [
            'Toda afirmação numérica do agente pode ser rastreada até um resultado específico do solver: combinação, estação, elemento.',
            'Toda saída da IA é validada contra o esquema do modelo antes de ser importada, e é recusada se vier malformada ou com campos desconhecidos.',
            'Se o serviço de IA estiver fora do ar, o solver, o editor e as verificações continuam funcionando.',
          ],
        },
        { k: 'p', t: 'O que ela não garante: que o modelo idealizado seja o adequado para o problema real (isso é uma decisão de engenharia), que o projeto seja ótimo, que os carregamentos e as hipóteses estejam completos ou que a interpretação da norma dispense revisão.' },
        { k: 'note', t: 'A fronteira permite controlar de onde sai cada resultado; ela não garante que o modelo proposto represente corretamente o problema real. O agente funciona como um assistente de rascunho: propõe uma alteração, o usuário vê um resumo do que vai mudar e pode aplicar, tentar de novo ou cancelar. Cada alteração aplicada corresponde a um único passo de desfazer.' },

        { k: 'h', t: 'Um caso que obriga a resolver o modelo de novo' },
        { k: 'p', t: 'O engenheiro descreve um pórtico de concreto armado com 6 m de vão e 4 m de altura, bases engastadas e uma carga distribuída sobre a viga. O agente pergunta o que falta: aço ou concreto? Bases engastadas ou rotuladas? Há carga lateral? Depois emite a ação que cria o pórtico. O backend a expande de forma determinística em um modelo com 4 nós, 3 elementos e 6 graus de liberdade livres. Adotam-se concreto H-21, viga inicial de 25×40 cm, pilares de 30×30 cm e 30 kN/m sobre a viga.' },
        { k: 'p', t: 'Com o modelo resolvido, as reações verticais são de 90 kN por pilar e o equilíbrio global é atendido de forma exata: ΣRz = 180 kN = q·L. O momento que governa a viga é Mu = 80,8 kN·m no meio do vão. A verificação à flexão da viga 25×40 com 3Ø16 segundo o CIRSOC 201 dá uma capacidade φMn = 73,3 kN·m. A viga não passa.' },
        {
          k: 'table',
          caption: 'Verificação à flexão da viga do pórtico, antes e depois da correção.',
          head: ['Estado', 'Seção', 'Armadura', 'Mu [kN·m]', 'φMn [kN·m]', 'D/C', 'Verifica'],
          rows: [
            ['Inicial', '25×40 cm', '3Ø16', '80,8', '73,3', '1,10', 'Não'],
            ['Corrigido', '30×55 cm', '3Ø16', '105,6', '108,6', '0,97', 'Sim'],
          ],
        },
        { k: 'p', t: 'Olhe a coluna de Mu. Ao aumentar a viga de 25×40 para 30×55, a demanda sobe de 80,8 para 105,6 kN·m. Num pórtico hiperestático, a estática fixa a soma do momento na extremidade com o momento no meio do vão; a rigidez só muda a forma como essa soma se divide. Uma viga mais rígida em relação aos pilares recebe menos engastamento deles e se aproxima do caso biapoiado, e assim o momento no meio do vão, que é o que governa aqui, aumenta.' },
        { k: 'quote', t: 'Um agente que estimasse o efeito sem recalcular erraria, e soaria igualmente convincente ao fazê-lo.' },
        { k: 'p', t: 'O exemplo mostra por que é preciso resolver o modelo de novo, além de recalcular a capacidade da nova seção. Numa estrutura hiperestática, aumentar uma seção altera a distribuição dos esforços, e a demanda pode subir justamente no elemento que se queria aliviar.' },

        { k: 'h', t: 'Tirar um pilar de um projeto já calculado' },
        { k: 'p', t: 'O segundo caso parte de um pórtico com quatro vãos de 5 m e três pavimentos de 3 m, bases engastadas, vigas de 25×50 cm (4Φ16), pilares de 35×35 cm e 25 kN/m sobre todas as vigas: 20 nós, 27 elementos e 45 graus de liberdade livres. Depois de resolvido e verificado, todas as vigas passam com folga.' },
        { k: 'p', t: 'Por uma decisão de arquitetura, retira-se um pilar interno do térreo. A ação de edição o remove com validação de integridade estrutural, e o modelo é resolvido de novo; o equilíbrio global se mantém antes e depois (ΣRz = 1500 kN). As vigas que se apoiavam nesse pilar passam a vencer 10 m e, junto com as que estão alinhadas acima delas, redistribuem o apoio perdido. Seis vigas ultrapassam D/C = 1.' },
        {
          k: 'table',
          caption: 'A viga governante do edifício nos três estados.',
          head: ['Estado', 'Seção', 'Mu [kN·m]', 'φMn [kN·m]', 'D/C', 'Verifica'],
          rows: [
            ['Intacto', '25×50 (4Φ16)', '54,2', '125,3', '0,43', 'Sim'],
            ['Sem o pilar', '25×50 (4Φ16)', '203,9', '125,3', '1,63', 'Não'],
            ['Redimensionado', '30×65 (5Φ20)', '189,8', '313,7', '0,61', 'Sim'],
          ],
        },
        { k: 'p', t: 'O momento da viga governante quase quadruplica. Com 30×65 cm e 5Φ20 nas vigas afetadas e uma nova resolução, todas voltam a passar. O caso mostra também que uma alteração que, feita à mão, exige remodelar, reanalisar, reverificar e redetalhar muitos elementos pode ser resolvida numa conversa curta, com cada número rastreável até o solver e sujeito à aprovação do engenheiro.' },

        { k: 'h', t: 'Decisões de arquitetura' },
        {
          k: 'ol',
          items: [
            'Ações tipadas em vez de geração livre de código. Em vários trabalhos anteriores, o modelo escreve scripts em Python que depois são executados contra um solver externo. Aqui, a saída do agente se restringe a um conjunto fechado de chamadas com contratos de entrada e saída explícitos, validadas contra um esquema antes da execução. É uma fronteira mais estreita e mais fácil de auditar do que código arbitrário.',
            'Um solver próprio, em vez de uma camada sobre um solver de terceiros. O motor foi escrito do zero em Rust, sem dependências externas de álgebra linear, e tem sua própria bateria de verificação contra soluções analíticas e benchmarks de referência: cerca de 6.800 testes passando, além de resultados comparados com um programa comercial nos mesmos modelos, com diferenças abaixo de 0,1 %.',
            'Conformidade normativa nativa. A verificação segundo o CIRSOC 201 e o 301, que não encontramos implementada de forma nativa em nenhum software de código aberto. O módulo de concreto está implementado e testado; o de aço ainda existe apenas na camada de frontend e não tem uma bateria de testes própria. Dizemos isso para não lhe atribuir uma maturidade que ele não tem.',
            'Execução no navegador. O motor é compilado para WebAssembly e roda localmente na máquina do usuário, sem servidor de cálculo e sem instalação.',
          ],
        },

        { k: 'h', t: 'De um solver testado a um solver provado' },
        { k: 'p', t: 'A fronteira garante que toda afirmação do agente pode ser rastreada até uma saída do solver. Essa garantia herda um limite: o solver é confiável porque está amplamente testado, mas não tem uma prova formal de correção. Uma suíte de testes, por mais completa que seja, só cobre os casos que seus autores imaginaram.' },
        { k: 'p', t: 'Isso é ainda mais importante neste contexto. Um agente monta modelos, altera-os em várias etapas e lê os resultados para propor novas ações; nesse ciclo, o solver recebe entradas que nenhum engenheiro revisou antes de chegarem ao motor. Se o motor se comportar mal em algum caso-limite (uma matriz de rigidez quase singular, uma geometria degenerada, uma combinação extrema), o agente pode citar esse resultado sem nenhum aviso.' },
        { k: 'p', t: 'Há duas técnicas para reduzir essa lacuna. O fuzzing baseado em propriedades gera milhares de modelos aleatórios válidos e verifica invariantes que precisam valer para qualquer entrada:' },
        {
          k: 'ul',
          items: [
            'Equilíbrio global: ΣR = P, independentemente da geometria, dos materiais ou dos apoios.',
            'Simetria da matriz de rigidez: K = Kᵀ por construção.',
            'K positiva definida para qualquer estrutura sem mecanismos.',
            'Invariância a transformações de corpo rígido: transladar ou girar um modelo não muda os esforços internos.',
          ],
        },
        { k: 'p', t: 'A verificação formal ataca a mesma lacuna pelo outro lado: escrever uma especificação matemática dessas propriedades e demonstrar, com um assistente de provas como o Lean 4, que a implementação a satisfaz. Os testes podem encontrar erros; a verificação formal pode demonstrar que eles não existem dentro do domínio especificado. As duas técnicas se complementam: quando o fuzzer encontra uma entrada que viola uma propriedade, essa propriedade passa a ser candidata a uma prova.' },
        { k: 'note', t: 'A meta é chegar a um solver cujo núcleo numérico crítico esteja formalmente verificado. Aí a fronteira de determinismo passaria a ser uma garantia matemática: cada número citado no memorial de cálculo poderia ser rastreado até um cálculo com correção demonstrada.' },

        { k: 'h', t: 'Em que pé isso está hoje' },
        { k: 'p', t: 'Para fechar, o que já está disponível e o que ainda não está. O solver, o editor, as verificações CIRSOC, o modo educativo e a geração de memoriais e desenhos funcionam hoje no navegador, em stabileo.com, sem instalar nada e sem criar conta. A camada de agentes está em desenvolvimento ativo: suas rotas rodam em ambiente de desenvolvimento e de testes contra um backend próprio, sobre o mesmo solver e os mesmos números que todo o resto, mas esse backend ainda não faz parte do site público.' },
        { k: 'p', t: 'O ciclo fechado com o solver, em que o agente propõe, resolve, avalia e modifica sem intervenção humana, está no roadmap e não foi implementado. A cobertura normativa nativa se limita ao CIRSOC 201 e 301; o resto é trabalho futuro.' },
        { k: 'p', t: 'O CAD assumiu a parte mecânica do desenho e a planilha eletrônica, a aritmética repetitiva, e o critério continuou com o engenheiro. O agente é o passo seguinte nessa linha: cuida de montar e alterar o modelo, lançar os carregamentos, rodar as verificações e preparar a documentação. Nada disso transfere a responsabilidade: o número assinado continua sendo do engenheiro.' },

        { k: 'note', t: 'Esta nota é uma adaptação de "Desarrollo de un agente estructural de cálculo sobre un solver verificado" (Chesta, Bertero, Carrone e Kingston), apresentado nas JAIE 2026. Os valores citados são saídas do solver do Stabileo e do seu módulo CIRSOC 201, extraídos desse trabalho.' }
      ],
    },
  },
};
