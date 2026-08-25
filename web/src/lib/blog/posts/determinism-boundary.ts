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
 */
import type { Post } from '../types';

export const determinismBoundary: Post = {
  slug: 'the-determinism-boundary',
  date: '2026-08-12',
  authors: ['Bautista Chesta', 'Raúl Bertero', 'Federico Carrone', 'Diego Kingston'],
  tagKeys: ['blog.tag.ai', 'blog.tag.solver', 'blog.tag.research'],
  i18n: {
    es: {
      title: 'La frontera de determinismo: por qué un agente de IA no debe calcular',
      excerpt:
        'Un modelo de lenguaje no puede garantizar un número; un solver verificado sí. La arquitectura que hace útil a la IA en cálculo estructural separa esas dos cosas.',
      blocks: [
        { k: 'p', t: 'Décadas de software comercial volvieron veloz la parte estrictamente numérica del análisis estructural. Ensamblar una matriz de rigidez y resolver un sistema lineal es un problema bien comprendido y computacionalmente barato. El tiempo del ingeniero se va en otra parte: construir el modelo, rehacerlo cada vez que cambia la arquitectura, definir cargas y combinaciones, verificar elemento por elemento contra la normativa y producir la memoria de cálculo y los planos.' },
        { k: 'p', t: 'El cálculo es la parte rápida. El cuello de botella es el andamiaje manual que lo rodea. Y es exactamente ahí, en el andamiaje, donde un agente de IA puede aportar algo — siempre que no toque el cálculo.' },

        { k: 'h', t: 'El límite preciso de un modelo de lenguaje' },
        { k: 'p', t: 'Un modelo de lenguaje genera texto probabilístico. Desconoce las leyes de la física y el comportamiento de los sistemas reales, y puede alucinar: devolver respuestas que suenan plausibles y son incoherentes. En análisis estructural el riesgo es concreto, porque el modelado exige razonamiento espacial y consistencia topológica, y el modelado multi-paso es propenso a la acumulación de errores.' },
        { k: 'p', t: 'La restricción, sin embargo, no nace de la ingeniería de software sino de cómo funciona la práctica profesional. Cada resultado estructural lleva una firma, con la autoría y la responsabilidad legal que eso implica. El número que dimensiona una columna no es un dato más: es un compromiso del ingeniero matriculado que lo suscribe. Un agente que entrega resultados no verificados no aporta valor de ingeniería; le traslada al profesional el riesgo de firmar un cálculo que nadie comprobó.' },
        { k: 'quote', t: 'La corrección del resultado tiene que ser una propiedad del solver, no del lenguaje.' },

        { k: 'h', t: 'La frontera de determinismo' },
        { k: 'p', t: 'En lugar de mejorar el modelo hasta que "calcule bien", se le quita el cálculo. El agente propone diseños y escenarios, pero para que un resultado sea válido tiene que pasar por un programa que el agente no puede modificar y que contiene la física del problema. El modelo decide qué herramienta determinística invocar y con qué parámetros, e integra lo que esa herramienta devuelve. Nunca origina un número ni inventa geometría.' },
        { k: 'p', t: 'La arquitectura separa tres responsabilidades. La capa de intención es el agente: interpreta lenguaje natural, formula preguntas de clarificación y emite acciones tipadas. La capa de cómputo determinístico reúne todo lo que produce datos de ingeniería — el solver que resuelve, los módulos CIRSOC que verifican, los generadores que expanden una tipología en un modelo completo. La capa de documentación produce memorias, planos y cómputos a partir de resultados ya calculados.' },
        { k: 'p', t: 'Esta separación no es un hallazgo propio. Es el patrón dominante en la literatura reciente de agentes de ingeniería, y en dominios vecinos: los agentes de programación funcionan porque un compilador y una batería de tests dicen si el código compila y pasa; AlphaProof demuestra teoremas porque un verificador formal no deja pasar un error. Lo que se hace acá es adoptarlo deliberadamente como principio de diseño.' },

        { k: 'h', t: 'Qué garantiza la frontera y qué no' },
        { k: 'p', t: 'Vale la pena ser preciso, porque una frontera que promete de más es peor que ninguna. La frontera de determinismo garantiza tres cosas:' },
        {
          k: 'ul',
          items: [
            'Toda afirmación numérica del agente es trazable a un resultado específico del solver: combinación, estación, elemento.',
            'Toda salida de la IA se valida contra el esquema del modelo antes de importarse, y se rechaza si viene malformada o con campos desconocidos.',
            'Si el servicio de IA no está disponible, el solver, el editor y las verificaciones siguen funcionando.',
          ],
        },
        { k: 'p', t: 'Y no garantiza que el modelo idealizado sea el correcto para el problema real, que es una decisión de ingeniería; ni que el diseño sea óptimo; ni que las cargas y los supuestos estén completos; ni que la interpretación normativa no requiera revisión.' },
        { k: 'note', t: 'La frontera protege la corrección del cálculo, no la corrección de la intención. El agente se comporta como un asistente de borrador: propone un cambio, el usuario ve un resumen de lo que se va a modificar y puede aplicar, reintentar o cancelar. Cada cambio aplicado es un único paso de deshacer.' },

        { k: 'h', t: 'Un caso donde el solver en el bucle no es opcional' },
        { k: 'p', t: 'El ingeniero describe un pórtico de hormigón armado de 6 m de luz y 4 m de altura, con bases empotradas y una carga distribuida sobre la viga. El agente pregunta lo que falta —¿acero u hormigón?, ¿bases empotradas o articuladas?, ¿hay carga lateral?— y emite la acción que crea el pórtico. El backend la expande de forma determinística en un modelo de 4 nodos, 3 elementos y 6 grados de libertad libres. Se adopta H-21, viga inicial de 25×40 cm, columnas de 30×30 cm y 30 kN/m sobre la viga.' },
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
        { k: 'p', t: 'Mirá la tercera columna de números. Al agrandar la viga de 25×40 a 30×55, la demanda no baja: sube de 80,8 a 105,6 kN·m. En un pórtico hiperestático una sección más rígida atrae mayor momento, de modo que la verificación correcta exige volver a resolver el modelo y no sólo recalcular la capacidad de la sección nueva.' },
        { k: 'quote', t: 'Un agente que estimara el efecto sin recalcular se equivocaría, y sonaría igual de convincente al hacerlo.' },
        { k: 'p', t: 'Ese es el argumento entero, en un número. No es que el solver sea más rápido: es que la intuición sobre "agrandar la sección mejora la verificación" es falsa en cuanto la estructura es hiperestática, y sólo el solver lo sabe.' },

        { k: 'h', t: 'Sacar una columna de un proyecto ya calculado' },
        { k: 'p', t: 'El segundo caso parte de un pórtico de cuatro vanos de 5 m y tres pisos de 3 m, con bases empotradas, vigas de 25×50 cm (4Φ16), columnas de 35×35 cm y 25 kN/m sobre todas las vigas: 20 nodos, 27 elementos, 45 grados de libertad libres. Resuelto y verificado, todas las vigas cumplen con holgura.' },
        { k: 'p', t: 'Por una decisión arquitectónica se elimina una columna interior de planta baja. La acción de edición la quita con validación de integridad estructural y el modelo se vuelve a resolver; el equilibrio global se mantiene antes y después (ΣRz = 1500 kN). Las vigas que apoyaban en esa columna pasan a salvar 10 m y, junto con las que quedan alineadas encima, redistribuyen el apoyo perdido. Seis vigas superan D/C = 1.' },
        {
          k: 'table',
          caption: 'La viga gobernante del edificio en los tres estados.',
          head: ['Estado', 'Sección', 'Mu [kN·m]', 'φMn [kN·m]', 'D/C', 'Verifica'],
          rows: [
            ['Intacto', '25×50 (4Φ16)', '54,2', '125,3', '0,43', 'Sí'],
            ['Sin la columna', '25×50 (4Φ16)', '203,9', '125,3', '1,63', 'No'],
            ['Re-dimensionado', '30×65 (5Φ20)', '189,8', '313,7', '0,61', 'Sí'],
          ],
        },
        { k: 'p', t: 'El momento de la viga gobernante casi se cuadruplica. Adoptando 30×65 cm con 5Φ20 en las vigas afectadas y volviendo a resolver, todas verifican. Lo relevante no es el redimensionado: es que un cambio que manualmente exige re-modelar, re-analizar, re-verificar y re-detallar muchos elementos se resuelve como una conversación corta, con cada número trazable al solver y sujeto a la aprobación del ingeniero.' },

        { k: 'h', t: 'Cuatro decisiones que sostienen la frontera' },
        {
          k: 'ol',
          items: [
            'Acciones tipadas en lugar de generación de código libre. Los precedentes hacen que el modelo escriba scripts de Python que después se ejecutan contra un solver externo. Acá la salida del agente está restringida a un conjunto cerrado de llamadas con contratos de entrada y salida explícitos, validadas contra un esquema antes de ejecutarse. Es una frontera más estrecha y más auditable que el código arbitrario.',
            'Un solver propio, no un envoltorio de terceros. El motor está escrito desde cero en Rust, sin dependencias externas de álgebra lineal, con su propia batería de verificación contra soluciones analíticas y benchmarks de referencia: del orden de 6.800 tests pasando, y resultados contrastados contra un programa comercial sobre los mismos modelos con diferencias por debajo del 0,1 %.',
            'Cumplimiento normativo nativo. La verificación según CIRSOC 201 y 301, que ningún software de código abierto implementa de forma nativa. El módulo de hormigón está implementado y testeado; el de acero vive todavía sólo en la capa de frontend y no tiene batería de tests dedicada, y se dice así para no atribuirle una madurez que no tiene.',
            'Ejecución en el navegador. El motor compila a WebAssembly y corre localmente en la máquina del usuario, sin servidor de cálculo y sin instalación.',
          ],
        },

        { k: 'h', t: 'De un solver testeado a un solver probado' },
        { k: 'p', t: 'La frontera garantiza que toda afirmación del agente es trazable a una salida del solver. Esa garantía tiene un límite preciso: el solver es confiable porque está extensivamente testeado, no porque esté probado. Una suite de tests, por exhaustiva que sea, cubre sólo los casos que sus autores imaginaron.' },
        { k: 'p', t: 'El punto pesa más en este contexto de uso. Un agente construye modelos, los modifica en varios pasos y consulta los resultados para proponer nuevas acciones; en ese ciclo el solver recibe entradas que ningún ingeniero revisó antes de que llegaran al motor. Si el motor se comporta mal en algún caso de borde —una matriz de rigidez casi singular, una geometría degenerada, una combinación extrema—, el agente puede citar ese resultado sin advertencia.' },
        { k: 'p', t: 'Hay dos herramientas para acortar esa brecha. El fuzzing basado en propiedades genera miles de modelos aleatorios válidos y afirma invariantes que tienen que cumplirse para cualquier entrada:' },
        {
          k: 'ul',
          items: [
            'Equilibrio global: ΣR = P, con independencia de la geometría, los materiales o los apoyos.',
            'Simetría de la matriz de rigidez: K = Kᵀ por construcción.',
            'Definitud positiva de K para cualquier estructura sin mecanismos.',
            'Invariancia ante transformaciones rígidas: desplazar o rotar un modelo no cambia los esfuerzos internos.',
          ],
        },
        { k: 'p', t: 'La verificación formal ataca la misma brecha por el otro lado: escribir una especificación matemática de esas propiedades y demostrar, con un asistente de pruebas como Lean 4, que la implementación la satisface. El testing puede encontrar errores; la verificación formal puede demostrar su ausencia dentro del dominio especificado. Las dos técnicas son complementarias: cuando el fuzzer halla una entrada que viola una propiedad, esa propiedad pasa a ser candidata para una prueba.' },
        { k: 'note', t: 'El horizonte es un solver cuyo núcleo numérico crítico esté formalmente verificado. En ese escenario la frontera de determinismo deja de ser una práctica de ingeniería para convertirse en una garantía matemática: cada número citado en la memoria de cálculo sería trazable a un cómputo cuya corrección está demostrada y no sólo testeada.' },

        { k: 'h', t: 'Dónde está esto hoy' },
        { k: 'p', t: 'Conviene cerrar con lo que está y lo que no. El solver, el editor, la verificación CIRSOC, el modo educativo y la generación de memorias y planos funcionan hoy en el navegador, en stabileo.com, sin instalar nada y sin cuenta. La capa de agentes está en desarrollo activo: sus rutas corren en desarrollo y prueba contra un backend propio, sobre el mismo solver y los mismos números que todo lo demás, pero ese backend todavía no forma parte del sitio público.' },
        { k: 'p', t: 'El bucle solver-en-el-bucle —el agente propone, resuelve, evalúa y modifica sin intervención humana— está en la hoja de ruta y no está implementado. La cobertura normativa nativa se limita a CIRSOC 201 y 301; el resto es trabajo futuro.' },
        { k: 'p', t: 'El CAD se llevó la parte mecánica del dibujo y la planilla de cálculo la de la aritmética repetitiva, sin llevarse el criterio. El agente es el eslabón siguiente: absorbe el andamiaje mecánico y deja el juicio del lado del ingeniero. Ninguna de estas medidas transfiere la responsabilidad. El número firmado sigue siendo del ingeniero.' },

        { k: 'note', t: 'Esta nota es una adaptación de «Desarrollo de un agente estructural de cálculo sobre un solver verificado» (Chesta, Bertero, Carrone y Kingston), presentado en las JAIE 2026. Los valores citados son salidas del solver de Stabileo y de su módulo CIRSOC 201, tomadas de ese trabajo.' }
      ],
    },

    en: {
      title: 'The determinism boundary: why an AI agent must not do the arithmetic',
      excerpt:
        'A language model cannot guarantee a number is right; a verified solver can. The architecture that makes AI useful in structural engineering keeps the two apart.',
      blocks: [
        { k: 'p', t: 'Decades of commercial software made the strictly numerical part of structural analysis fast. Assembling a stiffness matrix and solving a linear system is a well-understood, computationally cheap problem. The engineer’s time goes somewhere else: building the model, rebuilding it every time the architecture changes, defining loads and combinations, checking element by element against the code, and producing the calculation report and the drawings.' },
        { k: 'p', t: 'The arithmetic is the fast part. The bottleneck is the manual scaffolding around it. And that is exactly where an AI agent can help — as long as it never touches the arithmetic.' },

        { k: 'h', t: 'The precise limit of a language model' },
        { k: 'p', t: 'A language model generates probabilistic text. It does not know the laws of physics or how real systems behave, and it can hallucinate: return answers that sound plausible and are incoherent. In structural analysis the risk is concrete, because modelling demands spatial reasoning and topological consistency, and multi-step modelling is prone to accumulating errors.' },
        { k: 'p', t: 'The constraint, though, does not come from software engineering. It comes from how professional practice works. Every structural result carries a signature, with the authorship and legal responsibility that implies. The number that sizes a column is not one more datum: it is a commitment by the licensed engineer who signs it. An agent that hands over unverified results adds no engineering value; it transfers to the professional the risk of signing a calculation nobody checked.' },
        { k: 'quote', t: 'Correctness has to be a property of the solver, not of the language.' },

        { k: 'h', t: 'The determinism boundary' },
        { k: 'p', t: 'Rather than improving the model until it "computes well", the computing is taken away from it. The agent proposes designs and scenarios, but for a result to be valid it has to come from a program the agent cannot modify and which holds the physics of the problem. The model decides which deterministic tool to invoke and with what parameters, and integrates what that tool returns. It never originates a number and never invents geometry.' },
        { k: 'p', t: 'The architecture separates three responsibilities. The intent layer is the agent: it interprets natural language, asks clarifying questions and emits typed actions. The deterministic-computation layer holds everything that produces engineering data — the solver, the CIRSOC modules that verify, the generators that expand a typology into a complete model. The documentation layer produces reports, drawings and quantities from results that were already computed.' },
        { k: 'p', t: 'This separation is not our finding. It is the dominant pattern in the recent literature on engineering agents, and in neighbouring domains: coding agents work because a compiler and a test suite say whether the code builds and passes; AlphaProof proves theorems because a formal verifier does not let an error through. What we do is adopt it deliberately, as an established design principle.' },

        { k: 'h', t: 'What the boundary guarantees, and what it does not' },
        { k: 'p', t: 'It is worth being precise, because a boundary that overpromises is worse than none. The determinism boundary guarantees three things:' },
        {
          k: 'ul',
          items: [
            'Every numerical claim the agent makes is traceable to a specific solver result: combination, station, element.',
            'Every AI output is validated against the model schema before it is imported, and rejected if it arrives malformed or with unknown fields.',
            'If the AI service is unavailable, the solver, the editor and the code checks keep working.',
          ],
        },
        { k: 'p', t: 'And it does not guarantee that the idealised model is the right one for the real problem — that is an engineering decision — nor that the design is optimal, nor that loads and assumptions are complete, nor that the code interpretation needs no review.' },
        { k: 'note', t: 'The boundary protects the correctness of the calculation, not the correctness of the intent. The agent behaves as a drafting assistant: it proposes a change, the user sees a summary of what will be modified and can apply, retry or cancel. Each applied change is a single undo step.' },

        { k: 'h', t: 'A case where the solver in the loop is not optional' },
        { k: 'p', t: 'The engineer describes a reinforced-concrete portal frame, 6 m span and 4 m high, fixed bases, with a distributed load on the beam. The agent asks what is missing — steel or concrete? fixed or pinned bases? is there a lateral load? — and emits the action that creates the frame. The backend expands it deterministically into a model of 4 nodes, 3 elements and 6 free degrees of freedom. H-21 concrete, an initial 25×40 cm beam, 30×30 cm columns and 30 kN/m on the beam.' },
        { k: 'p', t: 'Once solved, the vertical reactions are 90 kN per column and global equilibrium holds exactly: ΣRz = 180 kN = q·L. The governing beam moment is Mu = 80.8 kN·m at midspan. The CIRSOC 201 flexural check of the 25×40 beam with 3Ø16 gives a capacity of φMn = 73.3 kN·m. The beam does not pass.' },
        {
          k: 'table',
          caption: 'Flexural check of the frame beam, before and after the correction.',
          head: ['State', 'Section', 'Reinforcement', 'Mu [kN·m]', 'φMn [kN·m]', 'D/C', 'Passes'],
          rows: [
            ['Initial', '25×40 cm', '3Ø16', '80.8', '73.3', '1.10', 'No'],
            ['Corrected', '30×55 cm', '3Ø16', '105.6', '108.6', '0.97', 'Yes'],
          ],
        },
        { k: 'p', t: 'Look at the third column of numbers. Enlarging the beam from 25×40 to 30×55 does not lower the demand: it raises it, from 80.8 to 105.6 kN·m. In a statically indeterminate frame a stiffer section attracts more moment, so a correct check requires solving the model again and not merely recomputing the capacity of the new section.' },
        { k: 'quote', t: 'An agent that estimated the effect without re-solving would get it wrong, and would sound just as convincing while doing so.' },
        { k: 'p', t: 'That is the whole argument, in one number. It is not that the solver is faster: it is that the intuition "a bigger section improves the check" is false as soon as the structure is indeterminate, and only the solver knows it.' },

        { k: 'h', t: 'Removing a column from a project already calculated' },
        { k: 'p', t: 'The second case starts from a frame of four 5 m spans and three 3 m storeys, fixed bases, 25×50 cm beams (4Φ16), 35×35 cm columns and 25 kN/m on every beam: 20 nodes, 27 elements, 45 free degrees of freedom. Solved and checked, every beam passes with room to spare.' },
        { k: 'p', t: 'An architectural decision removes an interior ground-floor column. The edit action removes it with structural-integrity validation and the model is solved again; global equilibrium holds before and after (ΣRz = 1500 kN). The beams that rested on that column now span 10 m and, together with those aligned above them, redistribute the lost support. Six beams go past D/C = 1.' },
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
        { k: 'p', t: 'The governing beam’s moment nearly quadruples. Adopting 30×65 cm with 5Φ20 in the affected beams and re-solving, all of them pass again. What matters is not the resizing: it is that a change which by hand demands re-modelling, re-analysing, re-checking and re-detailing many elements is resolved as a short conversation, with every number traceable to the solver and subject to the engineer’s approval.' },

        { k: 'h', t: 'Four decisions that hold the boundary up' },
        {
          k: 'ol',
          items: [
            'Typed actions instead of free code generation. Prior work has the model write Python scripts that are then executed against an external solver. Here the agent’s output is restricted to a closed set of calls with explicit input and output contracts, validated against a schema before they run. It is a narrower and more auditable boundary than arbitrary code.',
            'Our own solver, not a third-party wrapper. The engine is written from scratch in Rust, with no external linear-algebra dependencies, and with its own verification suite against analytical solutions and reference benchmarks: on the order of 6,800 tests passing, and results checked against a commercial program on the same models with differences below 0.1%.',
            'Native code compliance. Verification to CIRSOC 201 and 301, which no open-source software implements natively. The concrete module is implemented and tested; the steel one still lives only in the frontend layer and has no dedicated test suite, and we say so rather than claim a maturity it does not have.',
            'Execution in the browser. The engine compiles to WebAssembly and runs locally on the user’s machine, with no compute server and no installation.',
          ],
        },

        { k: 'h', t: 'From a tested solver to a proved one' },
        { k: 'p', t: 'The boundary guarantees that every claim the agent makes is traceable to a solver output. That guarantee has a precise limit: the solver is trustworthy because it is extensively tested, not because it is proved. A test suite, however exhaustive, covers only the cases its authors imagined.' },
        { k: 'p', t: 'The point weighs more in this context of use. An agent builds models, modifies them across several steps and reads results to propose new actions; in that cycle the solver receives inputs no engineer reviewed before they reached the engine. If the engine misbehaves on some edge case — a nearly singular stiffness matrix, a degenerate geometry, an extreme combination — the agent can quote that result without warning.' },
        { k: 'p', t: 'Two tools narrow that gap. Property-based fuzzing generates thousands of valid random models and asserts invariants that must hold for any input:' },
        {
          k: 'ul',
          items: [
            'Global equilibrium: ΣR = P, regardless of geometry, materials or supports.',
            'Stiffness-matrix symmetry: K = Kᵀ by construction.',
            'Positive definiteness of K for any structure without mechanisms.',
            'Invariance under rigid transforms: translating or rotating a model does not change internal forces.',
          ],
        },
        { k: 'p', t: 'Formal verification attacks the same gap from the other side: write a mathematical specification of those properties and prove, with a proof assistant such as Lean 4, that the implementation satisfies it. Testing can find errors; formal verification can demonstrate their absence within the specified domain. The two are complementary: when the fuzzer finds an input that violates a property, that property becomes a candidate for a proof.' },
        { k: 'note', t: 'The horizon is a solver whose critical numerical core is formally verified. In that scenario the determinism boundary stops being an engineering practice and becomes a mathematical guarantee: every number quoted in a calculation report would be traceable to a computation whose correctness is proved and not merely tested.' },

        { k: 'h', t: 'Where this stands today' },
        { k: 'p', t: 'It is worth closing with what exists and what does not. The solver, the editor, the CIRSOC checks, the education mode and the generation of reports and drawings work today in the browser, at stabileo.com, with no installation and no account. The agent layer is in active development: its routes run in development and test against our own backend, over the same solver and the same numbers as everything else, but that backend is not yet part of the public site.' },
        { k: 'p', t: 'The solver-in-the-loop cycle — the agent proposes, solves, evaluates and modifies without human intervention — is on the roadmap and is not implemented. Native code coverage is limited to CIRSOC 201 and 301; the rest is future work.' },
        { k: 'p', t: 'CAD took the mechanical part of drawing and the spreadsheet took the repetitive arithmetic, without taking the judgement. The agent is the next link: it absorbs the mechanical scaffolding and leaves the judgement on the engineer’s side. None of these measures transfers responsibility. The signed number is still the engineer’s.' },

        { k: 'note', t: 'This piece is an adaptation of «Desarrollo de un agente estructural de cálculo sobre un solver verificado» (Chesta, Bertero, Carrone and Kingston), presented at JAIE 2026. The figures quoted are outputs of the Stabileo solver and its CIRSOC 201 module, taken from that work.' }
      ],
    },

    pt: {
      title: 'A fronteira de determinismo: por que um agente de IA não deve calcular',
      excerpt:
        'Um modelo de linguagem não pode garantir um número; um solver verificado pode. A arquitetura que torna a IA útil no cálculo estrutural separa as duas coisas.',
      blocks: [
        { k: 'p', t: 'Décadas de software comercial tornaram rápida a parte estritamente numérica da análise estrutural. Montar uma matriz de rigidez e resolver um sistema linear é um problema bem compreendido e computacionalmente barato. O tempo do engenheiro vai para outro lugar: construir o modelo, refazê-lo cada vez que a arquitetura muda, definir cargas e combinações, verificar elemento por elemento contra a norma e produzir o memorial de cálculo e os desenhos.' },
        { k: 'p', t: 'O cálculo é a parte rápida. O gargalo é o andaime manual em volta dele. E é exatamente aí, no andaime, que um agente de IA pode contribuir — desde que não toque no cálculo.' },

        { k: 'h', t: 'O limite preciso de um modelo de linguagem' },
        { k: 'p', t: 'Um modelo de linguagem gera texto probabilístico. Ele desconhece as leis da física e o comportamento dos sistemas reais, e pode alucinar: devolver respostas que soam plausíveis e são incoerentes. Em análise estrutural o risco é concreto, porque a modelagem exige raciocínio espacial e consistência topológica, e a modelagem em vários passos é propensa ao acúmulo de erros.' },
        { k: 'p', t: 'A restrição, porém, não nasce da engenharia de software, e sim de como funciona a prática profissional. Todo resultado estrutural leva uma assinatura, com a autoria e a responsabilidade legal que isso implica. O número que dimensiona um pilar não é mais um dado: é um compromisso do engenheiro habilitado que o subscreve. Um agente que entrega resultados não verificados não agrega valor de engenharia; transfere ao profissional o risco de assinar um cálculo que ninguém conferiu.' },
        { k: 'quote', t: 'A correção do resultado tem que ser uma propriedade do solver, não da linguagem.' },

        { k: 'h', t: 'A fronteira de determinismo' },
        { k: 'p', t: 'Em vez de melhorar o modelo até que ele "calcule bem", tira-se dele o cálculo. O agente propõe projetos e cenários, mas para que um resultado seja válido ele precisa passar por um programa que o agente não pode modificar e que contém a física do problema. O modelo decide qual ferramenta determinística invocar e com quais parâmetros, e integra o que essa ferramenta devolve. Nunca origina um número nem inventa geometria.' },
        { k: 'p', t: 'A arquitetura separa três responsabilidades. A camada de intenção é o agente: interpreta linguagem natural, formula perguntas de esclarecimento e emite ações tipadas. A camada de cálculo determinístico reúne tudo o que produz dados de engenharia — o solver que resolve, os módulos CIRSOC que verificam, os geradores que expandem uma tipologia em um modelo completo. A camada de documentação produz memoriais, desenhos e quantitativos a partir de resultados já calculados.' },
        { k: 'p', t: 'Essa separação não é um achado nosso. É o padrão dominante na literatura recente de agentes de engenharia, e em domínios vizinhos: os agentes de programação funcionam porque um compilador e uma bateria de testes dizem se o código compila e passa; o AlphaProof demonstra teoremas porque um verificador formal não deixa um erro passar. O que fazemos é adotá-lo deliberadamente, como princípio de projeto estabelecido.' },

        { k: 'h', t: 'O que a fronteira garante e o que não garante' },
        { k: 'p', t: 'Vale ser preciso, porque uma fronteira que promete demais é pior do que nenhuma. A fronteira de determinismo garante três coisas:' },
        {
          k: 'ul',
          items: [
            'Toda afirmação numérica do agente é rastreável a um resultado específico do solver: combinação, estação, elemento.',
            'Toda saída da IA é validada contra o esquema do modelo antes de ser importada, e recusada se vier malformada ou com campos desconhecidos.',
            'Se o serviço de IA não estiver disponível, o solver, o editor e as verificações continuam funcionando.',
          ],
        },
        { k: 'p', t: 'E não garante que o modelo idealizado seja o correto para o problema real, o que é uma decisão de engenharia; nem que o projeto seja ótimo; nem que as cargas e as hipóteses estejam completas; nem que a interpretação normativa dispense revisão.' },
        { k: 'note', t: 'A fronteira protege a correção do cálculo, não a correção da intenção. O agente se comporta como um assistente de rascunho: propõe uma mudança, o usuário vê um resumo do que será modificado e pode aplicar, repetir ou cancelar. Cada mudança aplicada é um único passo de desfazer.' },

        { k: 'h', t: 'Um caso em que o solver no laço não é opcional' },
        { k: 'p', t: 'O engenheiro descreve um pórtico de concreto armado de 6 m de vão e 4 m de altura, com bases engastadas e uma carga distribuída sobre a viga. O agente pergunta o que falta — aço ou concreto? bases engastadas ou rotuladas? há carga lateral? — e emite a ação que cria o pórtico. O backend a expande de forma determinística em um modelo de 4 nós, 3 elementos e 6 graus de liberdade livres. Concreto H-21, viga inicial de 25×40 cm, pilares de 30×30 cm e 30 kN/m sobre a viga.' },
        { k: 'p', t: 'Resolvido o modelo, as reações verticais são de 90 kN por pilar e o equilíbrio global se cumpre de forma exata: ΣRz = 180 kN = q·L. O momento governante da viga é Mu = 80,8 kN·m no meio do vão. A verificação CIRSOC 201 à flexão da viga 25×40 armada com 3Ø16 dá uma capacidade φMn = 73,3 kN·m. A viga não verifica.' },
        {
          k: 'table',
          caption: 'Verificação à flexão da viga do pórtico, antes e depois da correção.',
          head: ['Estado', 'Seção', 'Armadura', 'Mu [kN·m]', 'φMn [kN·m]', 'D/C', 'Verifica'],
          rows: [
            ['Inicial', '25×40 cm', '3Ø16', '80,8', '73,3', '1,10', 'Não'],
            ['Corrigido', '30×55 cm', '3Ø16', '105,6', '108,6', '0,97', 'Sim'],
          ],
        },
        { k: 'p', t: 'Olhe a terceira coluna de números. Ao aumentar a viga de 25×40 para 30×55, a demanda não cai: sobe de 80,8 para 105,6 kN·m. Num pórtico hiperestático uma seção mais rígida atrai maior momento, de modo que a verificação correta exige resolver o modelo de novo e não apenas recalcular a capacidade da nova seção.' },
        { k: 'quote', t: 'Um agente que estimasse o efeito sem recalcular erraria, e soaria igualmente convincente ao fazê-lo.' },
        { k: 'p', t: 'Esse é o argumento inteiro, em um número. Não é que o solver seja mais rápido: é que a intuição de que "aumentar a seção melhora a verificação" é falsa assim que a estrutura é hiperestática, e só o solver sabe disso.' },

        { k: 'h', t: 'Tirar um pilar de um projeto já calculado' },
        { k: 'p', t: 'O segundo caso parte de um pórtico de quatro vãos de 5 m e três pavimentos de 3 m, com bases engastadas, vigas de 25×50 cm (4Φ16), pilares de 35×35 cm e 25 kN/m sobre todas as vigas: 20 nós, 27 elementos, 45 graus de liberdade livres. Resolvido e verificado, todas as vigas passam com folga.' },
        { k: 'p', t: 'Por uma decisão arquitetônica, retira-se um pilar interno do térreo. A ação de edição o remove com validação de integridade estrutural e o modelo é resolvido de novo; o equilíbrio global se mantém antes e depois (ΣRz = 1500 kN). As vigas que se apoiavam nesse pilar passam a vencer 10 m e, junto com as que ficam alinhadas acima, redistribuem o apoio perdido. Seis vigas ultrapassam D/C = 1.' },
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
        { k: 'p', t: 'O momento da viga governante quase quadruplica. Adotando 30×65 cm com 5Φ20 nas vigas afetadas e resolvendo de novo, todas voltam a verificar. O relevante não é o redimensionamento: é que uma mudança que manualmente exige remodelar, reanalisar, reverificar e redetalhar muitos elementos se resolve como uma conversa curta, com cada número rastreável ao solver e sujeito à aprovação do engenheiro.' },

        { k: 'h', t: 'Quatro decisões que sustentam a fronteira' },
        {
          k: 'ol',
          items: [
            'Ações tipadas em vez de geração de código livre. Os precedentes fazem o modelo escrever scripts em Python que depois são executados contra um solver externo. Aqui a saída do agente está restrita a um conjunto fechado de chamadas com contratos de entrada e saída explícitos, validadas contra um esquema antes de executar. É uma fronteira mais estreita e mais auditável do que código arbitrário.',
            'Um solver próprio, não um invólucro de terceiros. O motor é escrito do zero em Rust, sem dependências externas de álgebra linear, com sua própria bateria de verificação contra soluções analíticas e benchmarks de referência: da ordem de 6.800 testes passando, e resultados confrontados com um programa comercial sobre os mesmos modelos com diferenças abaixo de 0,1 %.',
            'Conformidade normativa nativa. A verificação segundo CIRSOC 201 e 301, que nenhum software de código aberto implementa de forma nativa. O módulo de concreto está implementado e testado; o de aço ainda vive apenas na camada de frontend e não tem bateria de testes dedicada, e dizemos isso para não lhe atribuir uma maturidade que ele não tem.',
            'Execução no navegador. O motor compila para WebAssembly e roda localmente na máquina do usuário, sem servidor de cálculo e sem instalação.',
          ],
        },

        { k: 'h', t: 'De um solver testado a um solver provado' },
        { k: 'p', t: 'A fronteira garante que toda afirmação do agente é rastreável a uma saída do solver. Essa garantia tem um limite preciso: o solver é confiável porque está extensivamente testado, não porque está provado. Uma suíte de testes, por mais exaustiva que seja, cobre apenas os casos que seus autores imaginaram.' },
        { k: 'p', t: 'O ponto pesa mais neste contexto de uso. Um agente constrói modelos, modifica-os em vários passos e lê os resultados para propor novas ações; nesse ciclo o solver recebe entradas que nenhum engenheiro revisou antes de chegarem ao motor. Se o motor se comportar mal em algum caso de borda — uma matriz de rigidez quase singular, uma geometria degenerada, uma combinação extrema —, o agente pode citar esse resultado sem aviso.' },
        { k: 'p', t: 'Há duas ferramentas para encurtar essa lacuna. O fuzzing baseado em propriedades gera milhares de modelos aleatórios válidos e afirma invariantes que precisam valer para qualquer entrada:' },
        {
          k: 'ul',
          items: [
            'Equilíbrio global: ΣR = P, independentemente da geometria, dos materiais ou dos apoios.',
            'Simetria da matriz de rigidez: K = Kᵀ por construção.',
            'Definição positiva de K para qualquer estrutura sem mecanismos.',
            'Invariância a transformações rígidas: transladar ou girar um modelo não muda os esforços internos.',
          ],
        },
        { k: 'p', t: 'A verificação formal ataca a mesma lacuna pelo outro lado: escrever uma especificação matemática dessas propriedades e demonstrar, com um assistente de provas como o Lean 4, que a implementação a satisfaz. O teste pode encontrar erros; a verificação formal pode demonstrar a ausência deles dentro do domínio especificado. As duas são complementares: quando o fuzzer encontra uma entrada que viola uma propriedade, essa propriedade vira candidata a uma prova.' },
        { k: 'note', t: 'O horizonte é um solver cujo núcleo numérico crítico esteja formalmente verificado. Nesse cenário a fronteira de determinismo deixa de ser uma prática de engenharia para se tornar uma garantia matemática: cada número citado no memorial de cálculo seria rastreável a um cálculo cuja correção está demonstrada e não apenas testada.' },

        { k: 'h', t: 'Onde isso está hoje' },
        { k: 'p', t: 'Vale fechar com o que existe e o que não existe. O solver, o editor, as verificações CIRSOC, o modo educativo e a geração de memoriais e desenhos funcionam hoje no navegador, em stabileo.com, sem instalar nada e sem conta. A camada de agentes está em desenvolvimento ativo: suas rotas rodam em desenvolvimento e teste contra um backend próprio, sobre o mesmo solver e os mesmos números que todo o resto, mas esse backend ainda não faz parte do site público.' },
        { k: 'p', t: 'O ciclo solver-no-laço — o agente propõe, resolve, avalia e modifica sem intervenção humana — está no roadmap e não está implementado. A cobertura normativa nativa se limita a CIRSOC 201 e 301; o resto é trabalho futuro.' },
        { k: 'p', t: 'O CAD levou a parte mecânica do desenho e a planilha levou a aritmética repetitiva, sem levar o critério. O agente é o elo seguinte: absorve o andaime mecânico e deixa o julgamento do lado do engenheiro. Nenhuma dessas medidas transfere a responsabilidade. O número assinado continua sendo do engenheiro.' },

        { k: 'note', t: 'Esta nota é uma adaptação de «Desarrollo de un agente estructural de cálculo sobre un solver verificado» (Chesta, Bertero, Carrone e Kingston), apresentado nas JAIE 2026. Os valores citados são saídas do solver do Stabileo e do seu módulo CIRSOC 201, tomados desse trabalho.' }
      ],
    },
  },
};
