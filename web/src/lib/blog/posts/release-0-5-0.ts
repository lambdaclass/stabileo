/** Numbers are quoted from docs/releases/v0.5.0.md (#1422) and docs/advisories/SA-2026-025…047; re-sync both when the notes change. */
import type { Post } from '../types';

const REPO = 'https://github.com/lambdaclass/stabileo/blob/main';

export const release050: Post = {
  slug: 'stabileo-0-5-0',
  date: '2026-11-06',
  order: 16,
  authors: ['Federico Carrone'],
  tagKeys: ['blog.tag.safety', 'blog.tag.verification', 'blog.tag.solver'],
  i18n: {
    en: {
      title: 'Stabileo 0.5.0: twenty-three more advisories, and every open wrong-result issue warned or refused',
      excerpt:
        'What changed since 0.4.0: twenty-three defects that could give a wrong or unconservative result, written up as advisories and all but one fixed; a warning or a refusal for every defect still open; and the step-by-step course in Basic.',
      blocks: [
        { k: 'p', t: 'Since 0.4.0 we kept checking Stabileo from several sides at once: the solver against published solutions and other programs, the design checks against worked examples, the same structure renumbered, rescaled and moved, and the files that earlier releases saved. That found twenty-three more defects that could give a wrong or unconservative result. Each one has an advisory saying what was wrong, who is affected and what to re-check. Twenty-two are fixed; 2D plastic collapse (SA-2026-044) stays refused until #758 is fixed.' },
        { k: 'note', t: 'stabileo.com publishes every change as soon as it is merged, so most of these fixes are already live, each from the day it was merged. Projects saved before a change that concerns them ask for a re-check when they are opened, in the reader’s language. Two fixes cannot do that: a 2D model cut from 3D before #1295 opens without a notice, because the model is what was wrong (SA-2026-035). Re-cut it from 3D, or solve it in 3D. The same holds for a rectangle or tube imported from Excel or IFC before #1310 (SA-2026-039): import it again.' },
        { k: 'img', base: 'blog/results-recheck', w: 1600, h: 1000, alt: 'Stabileo Basic opening a plane frame from the examples, saved as solved with results version 15. A dialog titled “Results have changed since this project was last solved” lists the changes that concern it, among them the 2D buckling fix for members whose axial force varies and the governing value read at the true peak, each with its explanation, and asks to tick “I have read these changes” before continuing or re-running the analysis.', caption: 'A project saved before a change that concerns it asks for a re-check when it is opened, and lists each change.' },

        { k: 'h', t: 'Re-run your projects' },
        { k: 'p', t: 'These are the cases that move a design result the most. Each advisory has the worked case and what to do with results you already delivered.' },
        {
          k: 'table',
          caption: 'Some of the 0.5.0 fixes, as each advisory documents them, with the results version that brought each one in; SA-2026-035 has none, so its advisory is the only notice.',
          head: ['Advisory', 'Results version', 'What was wrong', 'Severity'],
          rows: [
            ['SA-2026-029', '7', '3D design checks read the lateral moment or shear: a CIRSOC 201 column bent about Mz was checked over its depth, 36 % too little steel in an example', 'Critical'],
            ['SA-2026-028', '8', 'EN 1992-1-1 flexure assumed the tension steel yields: MRd up to 22 % high', 'High'],
            ['SA-2026-030', '12', 'CIRSOC 301 compression: a section with Qa ≤ 0 got a capacity above its squash load, and passed', 'High'],
            ['SA-2026-041', '19', 'The RC column check paired the largest moment with the largest compression only: up to 15 % unconservative in an example', 'High'],
            ['SA-2026-042', '23', '2D buckling overstated the factor of members whose compression grows along them: +43 % to +68 % for one member', 'High'],
            ['SA-2026-038', '35', '3D buckling used each member’s mean axial force: +43 % on the factor of one member with a load along it', 'High'],
            ['SA-2026-043', '32', 'Harmonic analysis lost the omitted modes’ correction when one mode was much softer than the rest: 79 times off at 2.3 Hz in an example', 'High'],
            ['SA-2026-035', '—', 'A 3D-to-2D cut bent members about the wrong section axis: a Y–Z portal 13.5 times too stiff', 'High'],
            ['SA-2026-033', '20', 'The load generator left out a floor’s whole area load when one low member stood over part of it', 'High'],
            ['SA-2026-027', '11', 'The shell envelope kept the combination with the largest Von Mises, not each component’s extreme: mx 14 % low in an example', 'High'],
            ['SA-2026-047', '49', 'In a model with shells, a load case that imposed a support displacement lost all of its shell stresses, so combinations and envelopes summed only the other cases’ shell stresses: the combined shell stresses could be unconservative, without a warning. In 0.2.0, 0.3.0 and 0.4.0 (#1676)', 'High'],
          ],
        },
        { k: 'p', t: 'Every project with shells solved before #1676 names SA-2026-047 when it opens (#1691): as affected when the model has a load case that imposes a support displacement and load combinations, and otherwise as possibly affected, because a saved project cannot show that it never had such a load case. Solving it again clears the notice; then compare the shell stresses of the combinations that include that case.' },
        { k: 'p', t: 'The other advisories cover concrete members with torsion under ACI 318 and EN 1992 (SA-2026-040), constraints of a model cut to 2D from a Y–Z or X–Y plane (SA-2026-036), 3D co-rotational analysis with large rotations (SA-2026-037), a load at t = 0 on a node without mass in time history (SA-2026-031), the zero mode of a mechanism in modal analysis (SA-2026-032), the equilibrium check of the report after the analysis (SA-2026-034), 2D plastic collapse, which stays refused until #758 is fixed (SA-2026-044), 3D plastic collapse with a member that has no usable plastic moment, now refused (SA-2026-045), harmonic analysis that chose between modal superposition and the direct solve per load, so superposition broke (SA-2026-046), rectangles and tubes imported from Excel or IFC with Iy and Iz swapped (SA-2026-039) and, for those who call the engine directly, steel shear without a shear area under AISC 360 and EN 1993 (SA-2026-025 and 026).' },

        { k: 'h', t: 'Other changes that move results' },
        { k: 'p', t: 'Other changes move numbers too, so each one is in the re-check notice; most have no advisory of their own, and the modal zero mode is SA-2026-032 above:' },
        {
          k: 'ul',
          items: [
            'A member’s governing value and the 2D envelope read the true peak of the diagram, not the nearest of 21 stations: they can rise, by 0.23 % under a triangular load and 1.05 % under a short partial load in the documented cases, and never fall.',
            'Mechanisms are refused instead of solved: behind a rigid link or a diaphragm in 2D, behind a connector in 2D (#1415), and in modal analysis, which used to drop the zero mode and return the others as complete, including a mechanism that slides along inclined supports.',
            '3D material-nonlinear analysis solves frames with and without a warping constant side by side, and nodes reached only by trusses, instead of crashing or refusing them; models that solved before give the same numbers.',
            'Repeated eigenvalues keep their multiplicity, and static and modal results check their own equilibrium and orthogonality before they are shown.',
            'In Basic, P-Δ and the critical load split each member into elements, plastic collapse closes hinges that unload, and the influence line of the bending moment takes sagging as positive, as every other moment in Basic.',
            'A design check that cannot be evaluated is refused instead of passing, and a soft but real node rotation is no longer locked when the model has a much stiffer part.',
            'Linear analysis warns when a rotation passes 0.1 rad, also inside a member’s span (including the slope shear deformation adds to its axis and a thermal gradient’s curvature at a released end, #1569) and on a combination’s own displacements, and when compression may amplify its moments past 10 %; while that second warning is shown, the CIRSOC 301 checks are held. Where a rotation is warned, run a geometrically nonlinear (large-rotation) analysis; where the amplification is warned, a P-Δ or other second-order analysis.',
          ],
        },

        { k: 'h', t: 'Warned or refused, until each fix exists' },
        { k: 'p', t: 'Every open issue that can give a wrong result now has a warning or a refusal at each place it can reach the engineer (#807). A warning keeps the result and names the issue next to it; a refusal withholds the result and says why. A ledger in the repository lists every open safety issue with its warning or refusal, the condition that triggers it and the test that proves it fires, and a test keeps it in agreement with the engine.' },
        {
          k: 'ul',
          items: [
            'Refused: the 2D plastic collapse factor, which can change by up to 4.6 times with the numbering, the direction of members and the units (#758); a buckling factor outside the bounds of its own certificate (#741); MITC4 shells on distorted meshes under significant in-plane bending (#798); and MITC4 and MITC9 shells on twisted geometry (#1057).',
            'Warned: among others, time history, 3D modal superposition, near-singular models, contact, material nonlinear analysis and connectors with unequal stiffnesses.',
            'Apart from what it refuses, containment changes one number: the 2D reaction of a settled support that also carries a spring in the settled direction now includes that spring’s force. Every other value of the 145,515 in the results corpus is identical.',
          ],
        },
        { k: 'note', t: 'Two refusals take away results that some readers use. Plastic collapse factors of plane frames are withheld until #758 is fixed. Some distorted shell meshes whose results were within 2 % of their references are withheld too: we chose a refusal too many over a wrong stiffness shown without warning, and narrowing it is on the roadmap.' },

        { k: 'h', t: 'Also in 0.5.0' },
        {
          k: 'ul',
          items: [
            'Basic teaches structural analysis step by step: statics, the force and displacement methods, influence lines, second order and buckling, plastic analysis and dynamics, each explained step by step in the app. Its plastic collapse unit is withheld with the rest of 2D plastic collapse until #758 is fixed.',
            'German, French and Turkish are offered again.',
            'The AI assistant works with your own Anthropic or OpenAI key, kept only in your browser, and /tools has live models the engine solves again as a slider moves.',
            'PRO: master and similar storeys, plate results per unit width with principal moments and directions, the report after the analysis, a read-only viewer with “Duplicate and edit”, and a linked IFC drawn as a 3D reference.',
            'Files saved by 0.2.0, 0.3.0 and 0.4.0 open, migrate and give the same results on every change, except where a registered result change applies; a file saved by a newer version is refused with a message that says so.',
            'The same structure rescaled, renumbered, reversed or moved must give the same answer, checked across 17 analysis types on every change and on 8,192 generated models every night.',
            'Also fixed: soil-structure interaction reports its support reactions, which it used to return empty (#1675); shells of two families numbered alike are refused by the combinations and envelopes instead of one being combined in place of the other (#1669); and shell von Mises and principal stresses no longer overflow or underflow at extreme magnitudes, with results in the normal range bit-identical (#1688).',
            'A project solved with a version that had a known wrong-result bug in a feature it uses names the advisory until it is solved again (#1657), and projects record every analysis they ran, so an advisory about one analysis stays until that analysis runs again (#1663).',
            'Faster: the 30 s autosave skips an unchanged project (#1664), a large 3D workspace reopens with less garbage to collect (#1668), and published 3D results are frozen so the known-issue refusal check runs once per result (#1689).',
            'More engine checks: reciprocity with moments, factored combinations and superposition of every shell stress component (#1665), and one result record per node, support, element and shell for every analysis (#1674), which found the SSI and shell combination defects above.',
            'Stabileo Research and Stabileo Tools: runnable reproductions of published papers and benchmarks, revised after a three-reviewer pass, and free calculators that run on the same engine.',
          ],
        },

        { k: 'link', slug: 'safety-advisories', t: 'How advisories work, and the first twenty-four:' },
        { k: 'ext', href: `${REPO}/docs/advisories/README.md`, label: 'Safety advisories index', t: 'Every advisory, with its severity, issue and fix:' },
        { k: 'ext', href: `${REPO}/CHANGELOG.md`, label: 'Changelog', t: 'The full technical record:' },
      ],
    },
    es: {
      title: 'Stabileo 0.5.0: veintitrés avisos más, y advertencia o rechazo para cada error abierto',
      excerpt:
        'Qué cambió desde la 0.4.0: veintitrés errores que podían dar un resultado equivocado o del lado inseguro, documentados como avisos y corregidos todos menos uno; una advertencia o un rechazo para cada error todavía abierto; y el curso paso a paso en Básico.',
      blocks: [
        { k: 'p', t: 'Desde la 0.4.0 seguimos verificando Stabileo desde varios lados a la vez: el solver contra soluciones publicadas y otros programas, las verificaciones de dimensionado contra ejemplos resueltos, la misma estructura renumerada, reescalada y desplazada, y los archivos que guardaron las versiones anteriores. Así encontramos veintitrés errores más que podían dar un resultado equivocado o del lado inseguro. Cada uno tiene un aviso que dice qué estaba mal, a quién afecta y qué revisar. Veintidós están corregidos; el colapso plástico 2D (SA-2026-044) sigue rechazado hasta que se corrija #758.' },
        { k: 'note', t: 'stabileo.com publica cada cambio en cuanto se integra, así que la mayoría de estas correcciones ya están en línea, cada una desde el día en que se integró. Los proyectos guardados antes de un cambio que los afecta piden revisión al abrirlos, en el idioma de quien los abre. Dos correcciones no pueden hacerlo: un modelo 2D cortado de uno 3D antes de #1295 se abre sin aviso, porque lo que estaba mal es el modelo (SA-2026-035). Volvé a cortarlo desde el 3D, o resolvelo en 3D. Lo mismo vale para un rectángulo o un tubo importado de Excel o IFC antes de #1310 (SA-2026-039): volvé a importarlo.' },
        { k: 'img', base: 'blog/results-recheck', w: 1600, h: 1000, alt: 'Stabileo Básico abriendo un pórtico plano de los ejemplos, guardado como resuelto con la versión de resultados 15. Un diálogo titulado “Los resultados cambiaron desde que se resolvió este proyecto” lista los cambios que lo afectan, entre ellos la corrección de pandeo 2D para barras cuyo esfuerzo axil varía y el valor determinante leído en el pico real, cada uno con su explicación, y pide marcar “Leí estos cambios” antes de continuar o volver a correr el análisis.', caption: 'Un proyecto guardado antes de un cambio que lo afecta pide una revisión al abrirse, y lista cada cambio.' },

        { k: 'h', t: 'Volvé a resolver tus proyectos' },
        { k: 'p', t: 'Estos son los casos que más mueven un resultado de diseño. Cada aviso tiene el caso resuelto y qué hacer con los resultados que ya entregaste.' },
        {
          k: 'table',
          caption: 'Algunas correcciones de la 0.5.0, tal como las documenta cada aviso, con la versión de resultados que trajo cada una; SA-2026-035 no tiene, así que su aviso es la única notificación.',
          head: ['Aviso', 'Versión de resultados', 'Qué estaba mal', 'Severidad'],
          rows: [
            ['SA-2026-029', '7', 'Las verificaciones de dimensionado 3D leían el momento o el corte laterales: una columna CIRSOC 201 flexionada alrededor de Mz se verificaba sobre su altura, con 36 % menos acero del necesario en un ejemplo', 'Crítica'],
            ['SA-2026-028', '8', 'La flexión según EN 1992-1-1 suponía que la armadura traccionada fluye: MRd hasta 22 % alto', 'Alta'],
            ['SA-2026-030', '12', 'Compresión CIRSOC 301: una sección con Qa ≤ 0 obtenía una resistencia mayor que su carga de aplastamiento, y aprobaba', 'Alta'],
            ['SA-2026-041', '19', 'La verificación de columnas de hormigón armado combinaba el momento máximo sólo con la compresión máxima: hasta 15 % del lado inseguro en un ejemplo', 'Alta'],
            ['SA-2026-042', '23', 'El pandeo 2D sobreestimaba el factor de las barras cuya compresión crece a lo largo de ellas: entre +43 % y +68 % para una barra', 'Alta'],
            ['SA-2026-038', '35', 'El pandeo 3D usaba el esfuerzo axil medio de cada barra: +43 % en el factor de una barra con una carga a lo largo de ella', 'Alta'],
            ['SA-2026-043', '32', 'El análisis armónico perdía la corrección de los modos omitidos cuando un modo era mucho más flexible que el resto: 79 veces a 2,3 Hz en un ejemplo', 'Alta'],
            ['SA-2026-035', '—', 'Un corte de 3D a 2D flexionaba las barras alrededor del eje equivocado de la sección: un pórtico Y–Z 13,5 veces demasiado rígido', 'Alta'],
            ['SA-2026-033', '20', 'El generador de cargas omitía toda la carga superficial de un piso cuando una barra baja quedaba sobre una parte de él', 'Alta'],
            ['SA-2026-027', '11', 'La envolvente de láminas guardaba la combinación con el mayor Von Mises, no el extremo de cada componente: mx 14 % bajo en un ejemplo', 'Alta'],
            ['SA-2026-047', '49', 'En un modelo con láminas, un caso de carga que imponía un desplazamiento de apoyo perdía todas sus tensiones de lámina, así que las combinaciones y envolventes sumaban solo las tensiones de lámina de los demás casos: las tensiones de lámina combinadas podían quedar del lado inseguro, sin aviso. En la 0.2.0, la 0.3.0 y la 0.4.0 (#1676)', 'Alta'],
          ],
        },
        { k: 'p', t: 'Todo proyecto con láminas calculado antes de #1676 nombra SA-2026-047 al abrirse (#1691): como afectado cuando el modelo tiene un caso de carga que impone un desplazamiento de apoyo y combinaciones de carga, y si no como posiblemente afectado, porque un proyecto guardado no puede mostrar que nunca tuvo un caso de carga así. Volver a calcularlo quita el aviso; después compará las tensiones de lámina de las combinaciones que incluyen ese caso.' },
        { k: 'p', t: 'Los demás avisos cubren las barras de hormigón con torsión según ACI 318 y EN 1992 (SA-2026-040), las restricciones de un modelo cortado a 2D desde un plano Y–Z o X–Y (SA-2026-036), el análisis corrotacional 3D con grandes rotaciones (SA-2026-037), una carga en t = 0 sobre un nudo sin masa en historia en el tiempo (SA-2026-031), el modo nulo de un mecanismo en el análisis modal (SA-2026-032), la verificación de equilibrio de la memoria después del análisis (SA-2026-034), el colapso plástico 2D, que sigue rechazado hasta que se corrija #758 (SA-2026-044), el colapso plástico 3D con una barra sin momento plástico utilizable, ahora rechazado (SA-2026-045), el análisis armónico que elegía entre superposición modal y solución directa por carga, así que la superposición fallaba (SA-2026-046), los rectángulos y tubos importados de Excel o IFC con Iy e Iz intercambiados (SA-2026-039) y, para quienes llaman al motor directamente, el corte en acero sin área de corte según AISC 360 y EN 1993 (SA-2026-025 y 026).' },

        { k: 'h', t: 'Otros cambios que mueven resultados' },
        { k: 'p', t: 'Otros cambios también mueven números, así que cada uno está en el diálogo de revisión; la mayoría no tiene aviso propio, y el modo nulo modal es el SA-2026-032 de arriba:' },
        {
          k: 'ul',
          items: [
            'El valor determinante de una barra y la envolvente 2D leen el pico real del diagrama, no la más cercana de 21 estaciones: pueden subir, 0,23 % con una carga triangular y 1,05 % con una carga parcial corta en los casos documentados, y nunca bajan.',
            'Los mecanismos se rechazan en lugar de resolverse: detrás de un vínculo rígido o un diafragma en 2D, detrás de un conector en 2D (#1415), y en el análisis modal, que antes descartaba el modo nulo y devolvía los demás como completos, también un mecanismo que se desliza sobre apoyos inclinados.',
            'El análisis no lineal de material 3D resuelve barras con y sin constante de alabeo juntas, y nudos a los que solo llegan bielas, en lugar de fallar o rechazarlos; los modelos que ya se resolvían dan los mismos números.',
            'Los autovalores repetidos conservan su multiplicidad, y los resultados estáticos y modales verifican su propio equilibrio y su ortogonalidad antes de mostrarse.',
            'En Básico, P-Δ y la carga crítica dividen cada barra en elementos, el colapso plástico cierra las rótulas que se descargan, y la línea de influencia del momento flector toma como positivo el momento que tracciona la fibra inferior, como todo otro momento en Básico.',
            'Una verificación de dimensionado que no se puede evaluar se rechaza en lugar de aprobar, y una rotación de nudo flexible pero real ya no se bloquea cuando el modelo tiene una parte mucho más rígida.',
            'El análisis lineal advierte cuando una rotación pasa de 0,1 rad, también dentro del tramo de una barra (incluida la pendiente que la deformación por corte agrega a su eje y la curvatura de un gradiente térmico en un extremo liberado, #1569) y con los propios desplazamientos de una combinación, y cuando la compresión puede amplificar sus momentos más de un 10 %; mientras se muestra esa segunda advertencia, las verificaciones CIRSOC 301 quedan retenidas. Donde advierte una rotación, corré un análisis geométricamente no lineal (de grandes giros); donde advierte la amplificación, un análisis P-Δ u otro de segundo orden.',
          ],
        },

        { k: 'h', t: 'Advertido o rechazado, hasta que exista cada corrección' },
        { k: 'p', t: 'Cada error abierto que puede dar un resultado equivocado tiene ahora una advertencia o un rechazo en cada lugar por el que puede llegar al ingeniero (#807). Una advertencia conserva el resultado y nombra el error a su lado; un rechazo retiene el resultado y dice por qué. Un registro en el repositorio lista cada error de seguridad abierto con su advertencia o su rechazo, la condición que lo dispara y el test que prueba que se activa, y un test lo mantiene de acuerdo con el motor.' },
        {
          k: 'ul',
          items: [
            'Rechazados: el factor de colapso plástico 2D, que puede cambiar hasta 4,6 veces con la numeración, la dirección de las barras y las unidades (#758); un factor de pandeo fuera de los límites de su propio certificado (#741); las láminas MITC4 en mallas distorsionadas con flexión significativa en su plano (#798); y las láminas MITC4 y MITC9 en geometría alabeada (#1057).',
            'Advertidos: entre otros, la historia en el tiempo, la superposición modal 3D, los modelos casi singulares, el contacto, el análisis no lineal de material y los conectores con rigideces distintas.',
            'Fuera de lo que rechaza, esta contención de errores abiertos cambia un solo número: la reacción 2D de un apoyo con asentamiento impuesto que además tiene un resorte en la dirección del asentamiento ahora incluye la fuerza de ese resorte. Todos los demás valores de los 145.515 del corpus de resultados son idénticos.',
          ],
        },
        { k: 'note', t: 'Dos rechazos quitan resultados que algunos lectores usan. Los factores de colapso plástico de pórticos planos quedan retenidos hasta que se corrija #758. También quedan retenidas algunas mallas de láminas distorsionadas cuyos resultados estaban dentro del 2 % de sus referencias: elegimos un rechazo de más antes que una rigidez equivocada mostrada sin advertencia, y acotarlo está en la hoja de ruta.' },

        { k: 'h', t: 'También en la 0.5.0' },
        {
          k: 'ul',
          items: [
            'Básico enseña análisis estructural paso a paso: estática, los métodos de las fuerzas y de los desplazamientos, líneas de influencia, segundo orden y pandeo, análisis plástico y dinámica, cada uno explicado paso a paso en la aplicación. Su unidad de colapso plástico queda retenida con el resto del colapso plástico 2D hasta que se corrija #758.',
            'El alemán, el francés y el turco vuelven a estar disponibles.',
            'El asistente de IA funciona con tu propia clave de Anthropic u OpenAI, guardada solo en tu navegador, y /tools tiene modelos en vivo que el motor vuelve a resolver al mover un control.',
            'PRO: plantas madre y plantas similares, resultados de placas por unidad de ancho con momentos y direcciones principales, la memoria después del análisis, un visor de solo lectura con “Duplicar y editar”, y un IFC vinculado dibujado como referencia 3D.',
            'Los archivos guardados por la 0.2.0, la 0.3.0 y la 0.4.0 se abren, se migran y dan los mismos resultados en cada cambio, salvo donde se aplica un cambio de resultados registrado; un archivo guardado por una versión más nueva se rechaza con un mensaje que lo dice.',
            'La misma estructura reescalada, renumerada, invertida o desplazada tiene que dar la misma respuesta, y eso se verifica en 17 tipos de análisis en cada cambio y sobre 8.192 modelos generados cada noche.',
            'Otras correcciones: la interacción suelo-estructura informa sus reacciones de apoyo, que antes devolvía vacías (#1675); las láminas de dos familias numeradas igual se rechazan en las combinaciones y envolventes en lugar de combinar una en lugar de la otra (#1669); y las tensiones de von Mises y principales de láminas ya no desbordan ni se anulan en magnitudes extremas, con los resultados del rango normal idénticos bit a bit (#1688).',
            'Un proyecto calculado con una versión que tenía un error de resultado conocido en una función que usa nombra el aviso hasta que se vuelve a calcular (#1657), y los proyectos registran cada análisis que corrieron, así que un aviso sobre un análisis queda hasta que ese análisis se vuelve a correr (#1663).',
            'Más rápido: el autoguardado cada 30 s saltea un proyecto sin cambios (#1664), un espacio de trabajo 3D grande se reabre con menos basura para recolectar (#1668), y los resultados 3D publicados se congelan, así que el chequeo de rechazo por errores conocidos corre una vez por resultado (#1689).',
            'Más verificaciones del motor: la reciprocidad con momentos, las combinaciones factorizadas y la superposición de cada componente de tensión de lámina (#1665), y un registro de resultado por nudo, apoyo, elemento y lámina en cada análisis (#1674), que encontró los errores del SSI y de las combinaciones de láminas de arriba.',
            'Stabileo Research y Stabileo Tools: reproducciones ejecutables de artículos y benchmarks publicados, revisadas después de una pasada de tres revisores, y calculadoras gratuitas que corren sobre el mismo motor.',
          ],
        },

        { k: 'link', slug: 'safety-advisories', t: 'Cómo funcionan los avisos, y los primeros veinticuatro:' },
        { k: 'ext', href: `${REPO}/docs/advisories/README.md`, label: 'Índice de avisos de seguridad', t: 'Cada aviso, con su severidad, su issue y su corrección:' },
        { k: 'ext', href: `${REPO}/CHANGELOG.md`, label: 'Registro de cambios', t: 'El registro técnico completo:' },
      ],
    },
    pt: {
      title: 'Stabileo 0.5.0: mais vinte e três avisos, e advertência ou recusa para cada erro aberto',
      excerpt:
        'O que mudou desde a 0.4.0: vinte e três erros que podiam dar um resultado errado ou contra a segurança, documentados como avisos e todos corrigidos menos um; uma advertência ou uma recusa para cada erro ainda aberto; e o curso passo a passo no Básico.',
      blocks: [
        { k: 'p', t: 'Desde a 0.4.0 continuamos verificando o Stabileo por vários lados ao mesmo tempo: o solver contra soluções publicadas e outros programas, as verificações de dimensionamento contra exemplos resolvidos, a mesma estrutura renumerada, reescalada e deslocada, e os arquivos que as versões anteriores salvaram. Assim encontramos mais vinte e três erros que podiam dar um resultado errado ou contra a segurança. Cada um tem um aviso que diz o que estava errado, a quem afeta e o que revisar. Vinte e dois estão corrigidos; o colapso plástico 2D (SA-2026-044) continua recusado até que se corrija #758.' },
        { k: 'note', t: 'stabileo.com publica cada mudança assim que é integrada, então a maioria destas correções já está no ar, cada uma desde o dia em que foi integrada. Os projetos salvos antes de uma mudança que os afeta pedem revisão ao serem abertos, no idioma de quem os abre. Duas correções não conseguem fazer isso: um modelo 2D cortado de um 3D antes de #1295 abre sem aviso, porque o que estava errado é o modelo (SA-2026-035). Corte-o de novo a partir do 3D, ou resolva-o em 3D. O mesmo vale para um retângulo ou tubo importado do Excel ou IFC antes de #1310 (SA-2026-039): importe-o de novo.' },
        { k: 'img', base: 'blog/results-recheck', w: 1600, h: 1000, alt: 'Stabileo Básico abrindo um pórtico plano dos exemplos, salvo como resolvido com a versão de resultados 15. Uma caixa de diálogo intitulada “Os resultados mudaram desde a última vez que este projeto foi resolvido” lista as mudanças que o afetam, entre elas a correção de flambagem 2D para barras cujo esforço normal varia e o valor determinante lido no pico real, cada uma com sua explicação, e pede para marcar “Li estas mudanças” antes de continuar ou executar novamente a análise.', caption: 'Um projeto salvo antes de uma mudança que o afeta pede uma revisão ao ser aberto, e lista cada mudança.' },

        { k: 'h', t: 'Resolva seus projetos de novo' },
        { k: 'p', t: 'Estes são os casos que mais movem um resultado de projeto. Cada aviso tem o caso resolvido e o que fazer com os resultados que você já entregou.' },
        {
          k: 'table',
          caption: 'Algumas correções da 0.5.0, tal como cada aviso as documenta, com a versão de resultados que trouxe cada uma; SA-2026-035 não tem, então seu aviso é a única notificação.',
          head: ['Aviso', 'Versão de resultados', 'O que estava errado', 'Severidade'],
          rows: [
            ['SA-2026-029', '7', 'As verificações de dimensionamento 3D liam o momento ou o cisalhamento laterais: um pilar CIRSOC 201 fletido em torno de Mz era verificado pela sua altura, com 36 % menos aço do que o necessário num exemplo', 'Crítica'],
            ['SA-2026-028', '8', 'A flexão pela EN 1992-1-1 supunha que a armadura tracionada escoa: MRd até 22 % acima', 'Alta'],
            ['SA-2026-030', '12', 'Compressão CIRSOC 301: uma seção com Qa ≤ 0 recebia uma resistência acima da sua carga de esmagamento, e aprovava', 'Alta'],
            ['SA-2026-041', '19', 'A verificação de pilares de concreto armado combinava o maior momento apenas com a maior compressão: até 15 % contra a segurança num exemplo', 'Alta'],
            ['SA-2026-042', '23', 'A flambagem 2D superestimava o fator das barras cuja compressão cresce ao longo delas: de +43 % a +68 % para uma barra', 'Alta'],
            ['SA-2026-038', '35', 'A flambagem 3D usava o esforço normal médio de cada barra: +43 % no fator de uma barra com uma carga ao longo dela', 'Alta'],
            ['SA-2026-043', '32', 'A análise harmônica perdia a correção dos modos omitidos quando um modo era muito mais flexível que os demais: 79 vezes a 2,3 Hz em um exemplo', 'Alta'],
            ['SA-2026-035', '—', 'Um corte de 3D para 2D fletia as barras em torno do eixo errado da seção: um pórtico Y–Z 13,5 vezes rígido demais', 'Alta'],
            ['SA-2026-033', '20', 'O gerador de cargas deixava de fora toda a carga de superfície de um pavimento quando uma barra baixa ficava sobre parte dele', 'Alta'],
            ['SA-2026-027', '11', 'A envoltória de cascas guardava a combinação com o maior Von Mises, não o extremo de cada componente: mx 14 % abaixo num exemplo', 'Alta'],
            ['SA-2026-047', '49', 'Em um modelo com cascas, um caso de carga que impunha um deslocamento de apoio perdia todas as suas tensões de casca, então as combinações e envoltórias somavam apenas as tensões de casca dos demais casos: as tensões de casca combinadas podiam ficar contra a segurança, sem aviso. Na 0.2.0, na 0.3.0 e na 0.4.0 (#1676)', 'Alta'],
          ],
        },
        { k: 'p', t: 'Todo projeto com cascas calculado antes de #1676 nomeia SA-2026-047 ao ser aberto (#1691): como afetado quando o modelo tem um caso de carga que impõe um deslocamento de apoio e combinações de carga, e senão como possivelmente afetado, porque um projeto salvo não consegue mostrar que nunca teve um caso de carga assim. Calculá-lo de novo remove o aviso; depois compare as tensões de casca das combinações que incluem esse caso.' },
        { k: 'p', t: 'Os demais avisos cobrem barras de concreto com torção pela ACI 318 e pela EN 1992 (SA-2026-040), as restrições de um modelo cortado para 2D a partir de um plano Y–Z ou X–Y (SA-2026-036), a análise corrotacional 3D com grandes rotações (SA-2026-037), uma carga em t = 0 sobre um nó sem massa no histórico no tempo (SA-2026-031), o modo nulo de um mecanismo na análise modal (SA-2026-032), a verificação de equilíbrio do memorial depois da análise (SA-2026-034), o colapso plástico 2D, que continua recusado até que #758 seja corrigido (SA-2026-044), o colapso plástico 3D com uma barra sem momento plástico utilizável, agora recusado (SA-2026-045), a análise harmônica que escolhia entre superposição modal e solução direta por carga, de modo que a superposição falhava (SA-2026-046), retângulos e tubos importados do Excel ou IFC com Iy e Iz trocados (SA-2026-039) e, para quem chama o motor diretamente, o cisalhamento em aço sem área de cisalhamento pela AISC 360 e pela EN 1993 (SA-2026-025 e 026).' },

        { k: 'h', t: 'Outras mudanças que alteram resultados' },
        { k: 'p', t: 'Outras mudanças também mexem nos números, então cada uma está no diálogo de revisão; a maioria não tem aviso próprio, e o modo nulo modal é o SA-2026-032 acima:' },
        {
          k: 'ul',
          items: [
            'O valor determinante de uma barra e a envoltória 2D leem o pico real do diagrama, não a mais próxima de 21 estações: podem subir, 0,23 % sob uma carga triangular e 1,05 % sob uma carga parcial curta nos casos documentados, e nunca descem.',
            'Os mecanismos são recusados em vez de resolvidos: atrás de um vínculo rígido ou de um diafragma em 2D, atrás de um conector em 2D (#1415), e na análise modal, que antes descartava o modo nulo e devolvia os demais como completos, inclusive um mecanismo que desliza sobre apoios inclinados.',
            'A análise não linear de material 3D resolve barras com e sem constante de empenamento lado a lado, e nós aos quais só chegam treliças, em vez de falhar ou recusá-los; os modelos que já eram resolvidos dão os mesmos números.',
            'Autovalores repetidos mantêm sua multiplicidade, e os resultados estáticos e modais verificam seu próprio equilíbrio e sua ortogonalidade antes de serem mostrados.',
            'No Básico, o P-Δ e a carga crítica dividem cada barra em elementos, o colapso plástico fecha as rótulas que descarregam, e a linha de influência do momento fletor toma como positivo o momento que traciona a fibra inferior, como todo outro momento no Básico.',
            'Uma verificação de dimensionamento que não pode ser avaliada é recusada em vez de aprovada, e uma rotação de nó flexível mas real não é mais travada quando o modelo tem uma parte muito mais rígida.',
            'A análise linear avisa quando uma rotação passa de 0,1 rad, também dentro do vão de uma barra (incluindo a inclinação que a deformação por cisalhamento acrescenta ao seu eixo e a curvatura de um gradiente térmico numa extremidade liberada, #1569) e com os próprios deslocamentos de uma combinação, e quando a compressão pode amplificar seus momentos em mais de 10 %; enquanto esse segundo aviso aparece, as verificações CIRSOC 301 ficam retidas. Onde avisa uma rotação, rode uma análise geometricamente não linear (de grandes rotações); onde avisa a amplificação, uma análise P-Δ ou outra de segunda ordem.',
          ],
        },

        { k: 'h', t: 'Advertido ou recusado, até que exista cada correção' },
        { k: 'p', t: 'Cada erro aberto que pode dar um resultado errado agora tem uma advertência ou uma recusa em cada lugar por onde pode chegar ao engenheiro (#807). Uma advertência mantém o resultado e nomeia o erro ao lado dele; uma recusa retém o resultado e diz por quê. Um registro no repositório lista cada erro de segurança aberto com sua advertência ou sua recusa, a condição que a dispara e o teste que prova que ela é acionada, e um teste o mantém de acordo com o motor.' },
        {
          k: 'ul',
          items: [
            'Recusados: o fator de colapso plástico 2D, que pode mudar até 4,6 vezes com a numeração, a direção das barras e as unidades (#758); um fator de flambagem fora dos limites do seu próprio certificado (#741); cascas MITC4 em malhas distorcidas sob flexão significativa no plano (#798); e cascas MITC4 e MITC9 em geometria torcida (#1057).',
            'Advertidos: entre outros, o histórico no tempo, a superposição modal 3D, modelos quase singulares, o contato, a análise não linear de material e conectores com rigidezes diferentes.',
            'Fora o que recusa, esta contenção dos erros abertos muda um único número: a reação 2D de um apoio com recalque imposto que também tem uma mola na direção do recalque agora inclui a força dessa mola. Todos os demais valores dos 145.515 do corpus de resultados são idênticos.',
          ],
        },
        { k: 'note', t: 'Duas recusas tiram resultados que alguns leitores usam. Os fatores de colapso plástico de pórticos planos ficam retidos até que #758 seja corrigido. Algumas malhas de cascas distorcidas cujos resultados ficavam dentro de 2 % das suas referências também ficam retidas: preferimos uma recusa a mais a uma rigidez errada mostrada sem advertência, e estreitá-la está no roteiro.' },

        { k: 'h', t: 'Também na 0.5.0' },
        {
          k: 'ul',
          items: [
            'O Básico ensina análise estrutural passo a passo: estática, os métodos das forças e dos deslocamentos, linhas de influência, segunda ordem e flambagem, análise plástica e dinâmica, cada um explicado passo a passo no aplicativo. Sua unidade de colapso plástico fica retida com o resto do colapso plástico 2D até que #758 seja corrigido.',
            'Alemão, francês e turco voltam a ser oferecidos.',
            'O assistente de IA funciona com a sua própria chave da Anthropic ou da OpenAI, guardada só no seu navegador, e /tools tem modelos ao vivo que o motor resolve de novo ao mover um controle.',
            'PRO: pavimentos mestre e pavimentos semelhantes, resultados de placas por unidade de largura com momentos e direções principais, o memorial depois da análise, um visualizador somente leitura com “Duplicar e editar”, e um IFC vinculado desenhado como referência 3D.',
            'Os arquivos salvos pela 0.2.0, pela 0.3.0 e pela 0.4.0 abrem, migram e dão os mesmos resultados em cada mudança, exceto onde se aplica uma mudança de resultados registrada; um arquivo salvo por uma versão mais nova é recusado com uma mensagem que diz isso.',
            'A mesma estrutura reescalada, renumerada, invertida ou deslocada deve dar a mesma resposta, o que é verificado em 17 tipos de análise em cada mudança e em 8.192 modelos gerados todas as noites.',
            'Outras correções: a interação solo-estrutura informa suas reações de apoio, que antes devolvia vazias (#1675); cascas de duas famílias numeradas igual são recusadas nas combinações e envoltórias em vez de uma ser combinada no lugar da outra (#1669); e as tensões de von Mises e principais de cascas não estouram nem se anulam mais em magnitudes extremas, com os resultados da faixa normal idênticos bit a bit (#1688).',
            'Um projeto calculado com uma versão que tinha um erro de resultado conhecido numa função que ele usa nomeia o aviso até ser calculado de novo (#1657), e os projetos registram cada análise que rodaram, então um aviso sobre uma análise fica até essa análise rodar de novo (#1663).',
            'Mais rápido: o salvamento automático a cada 30 s pula um projeto sem mudanças (#1664), um espaço de trabalho 3D grande reabre com menos lixo para coletar (#1668), e os resultados 3D publicados são congelados, então a verificação de recusa por erros conhecidos roda uma vez por resultado (#1689).',
            'Mais verificações do motor: a reciprocidade com momentos, as combinações fatoradas e a superposição de cada componente de tensão de casca (#1665), e um registro de resultado por nó, apoio, elemento e casca em cada análise (#1674), que encontrou os erros da SSI e das combinações de cascas acima.',
            'Stabileo Research e Stabileo Tools: reproduções executáveis de artigos e benchmarks publicados, revisadas após uma rodada de três revisores, e calculadoras gratuitas que rodam sobre o mesmo motor.',
          ],
        },

        { k: 'link', slug: 'safety-advisories', t: 'Como funcionam os avisos, e os primeiros vinte e quatro:' },
        { k: 'ext', href: `${REPO}/docs/advisories/README.md`, label: 'Índice de avisos de segurança', t: 'Cada aviso, com sua severidade, sua issue e sua correção:' },
        { k: 'ext', href: `${REPO}/CHANGELOG.md`, label: 'Registro de mudanças', t: 'O registro técnico completo:' },
      ],
    },
  },
};
