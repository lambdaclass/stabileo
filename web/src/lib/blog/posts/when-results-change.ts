/** Numbers are quoted from result-changes.json, docs/advisories/SA-2026-033…042 and PRs #1295, #1298, #1301, #1324, #1406, #1415 and #807; change one only when its source changes. */
import type { Post } from '../types';

const REPO = 'https://github.com/lambdaclass/stabileo/blob/main';
const ISSUES = 'https://github.com/lambdaclass/stabileo/issues';

export const whenResultsChange: Post = {
  slug: 'when-results-change',
  date: '2026-11-05',
  order: 13,
  authors: ['Federico Carrone'],
  tagKeys: ['blog.tag.safety', 'blog.tag.verification', 'blog.tag.solver'],
  i18n: {
    en: {
      title: 'When a result changes: results versions, re-checks and advisories',
      excerpt:
        'How Stabileo tells you which of your projects a fix concerns, how it holds back a result it knows can be wrong until the fix exists, and how the fix is published, with the fourteen results versions merged on 4 and 5 November.',
      blocks: [
        { k: 'p', t: 'Every fix to a structural solver changes a number that somebody may already have used. A buckling factor that was too high is now lower; a model that used to solve is now refused. A fix that reaches the app quietly leaves the old number in calculations already handed in, and the engineer who produced them has no reason to look again.' },
        { k: 'p', t: 'This post describes what Stabileo does about that, from the moment a defect is found to the moment its fix is published. The examples are real: on 4 and 5 November 2026, fourteen results versions, 16 to 29, reached stabileo.com.' },

        { k: 'h', t: 'What a results version is' },
        { k: 'p', t: 'A results version is a whole number, separate from the app version. It goes up by one each time a change reaches the site that makes the same saved model give different numbers, or refuses a model that used to solve. Every change of that kind is registered with:' },
        {
          k: 'ul',
          items: [
            'the version it entered with, its date and its pull requests;',
            'which models it concerns, written as model features: a plane model with constraints, a 2D buckling analysis with loads along members, a concrete member checked to CIRSOC 201;',
            'a title and an explanation for the engineer in each of the app’s six languages, with what to re-check;',
            'a link to the full write-up: an advisory, a results-change note or the changelog.',
          ],
        },
        { k: 'p', t: 'Every solve stamps the project with the results version that produced it, together with the app version, the commit, the engine version, a hash of the engine binary and the analyses that ran. The stamp travels with the project: a saved file, an autosave, an open tab or a shared link all carry it.' },
        { k: 'note', t: 'A results version is never reused. Every merge to the main branch is deployed and stamps what it solves with the current version, so an entry added to a version already on the site would never reach the projects that version stamped. A test fails on such an addition.' },

        { k: 'h', t: 'Why a version changes' },
        { k: 'p', t: 'Most changes are fixes: a result was wrong and is now right. Some are refusals: a model that used to give a number now gives a clear message instead, because the number meant nothing. And a version can also undo: version 15 withdrew three changes of version 14 whose review fixes had not reached the site with them, and versions 27 to 29 brought them back, reviewed. A project solved with version 14 is told about both.' },
        {
          k: 'table',
          caption: 'Results versions 16 to 29, merged on 4 and 5 November 2026.',
          head: ['Version', 'Change', 'Kind'],
          rows: [
            ['16', 'Aluminium: weak-axis shear is checked', 'Fix'],
            ['17', 'Steel joints: weak-axis moments are no longer ignored', 'Refusal'],
            ['18', 'ACI 318 and EN 1992: concrete members with torsion are marked not checked', 'Refusal'],
            ['19', 'RC columns are also checked under their least compression (SA-2026-041)', 'Fix'],
            ['20', 'Load generator: a floor partly under low roof structure keeps its area loads (SA-2026-033)', 'Fix'],
            ['21', 'Exported shell figures show the field and scale of the screen', 'Fix'],
            ['22', '2D: a mechanism behind a rigid link or diaphragm is refused', 'Refusal'],
            ['23', '2D buckling of members whose axial force varies along them (SA-2026-042)', 'Fix'],
            ['24', '3D co-rotational analysis with large rotations about several axes (SA-2026-037)', 'Fix'],
            ['25', 'Constraints of a 2D model cut from a Y–Z or X–Y plane (SA-2026-036)', 'Fix'],
            ['26', 'A member’s governing value and the 2D envelope read the true peak', 'Fix'],
            ['27–29', 'Three Basic changes withdrawn by version 15 return, reviewed: plastic collapse, P-Δ and the sign of moment influence lines', 'Fix'],
          ],
        },

        { k: 'h', t: 'The re-check notice' },
        { k: 'p', t: 'When a project is opened, the app compares its stamp with the registry and lists the changes made since then that concern that model. A plane frame with a buckling analysis is told about the 2D buckling fix; a steel frame without concrete is not told about the RC column check. The list is not a toast that disappears: the notice has no close button, ignores Escape and clicks outside it, and is dismissed only by ticking “I have read these changes” and choosing to continue or to re-run.' },
        { k: 'img', base: 'blog/results-recheck', w: 1600, h: 1000, alt: 'Stabileo Basic opening a plane frame from the examples, saved as solved with results version 15. A dialog titled “Results have changed since this project was last solved” lists the changes that concern it, among them the 2D buckling fix for members whose axial force varies and the governing value read at the true peak, each with its explanation, and asks to tick “I have read these changes” before continuing or re-running the analysis.', caption: 'A plane frame solved with version 15, opened today: only the changes that concern this model are listed, each with what to re-check.' },
        { k: 'p', t: 'Until the model is solved again, its results are marked stale: a banner says so, and every report, workbook and CSV exported in the meantime prints a STALE warning in its provenance. “Re-run analysis and design” solves again and, in PRO, re-checks the concrete members with the reinforcement already chosen; it does not re-design them, because that would overwrite the engineer’s bars.' },
        { k: 'p', t: 'Since 4 November (#1406) the notice explains each change in the reader’s language in all six of the app’s languages. Before that, German, French and Turkish readers got the title and explanation in English: 66 of the 72 registered changes had no text in those languages. Each translation was checked by translating it back to English without the original and comparing the meaning: numbers, signs, which load, which check, safe or unsafe side. That check corrected sentences in all three languages, and it showed that four English explanations were ambiguous at the source; those were fixed in all six languages.' },

        { k: 'h', t: 'Before the fix: warn or refuse' },
        { k: 'p', t: 'A defect is usually found before it is fixed, sometimes days before. In that time the result it affects is still on screen. The rule we follow is to contain it first and fix it second (issue #447): every open defect that can give a wrong result gets, at each entry point it affects, either a warning or a refusal.' },
        {
          k: 'ul',
          items: [
            'A warning keeps the result and shows, next to it, which known issue may affect it and what to check by hand.',
            'A refusal withholds the result and says why, when the number can be wrong by a large factor with no way to notice from the output, such as a factor that changes several times over with the numbering of the members.',
          ],
        },
        { k: 'img', base: 'blog/results-refusal', w: 1600, h: 1000, alt: 'Stabileo Basic with the hidden-mechanism example: a two-span beam on three supports that all roll horizontally, under a uniform load of 10 kN/m. After Solve, no diagram is drawn; a red message in the corner says “Unstable structure (mechanism): no horizontal restraint at any support.” with a button to view the kinematic analysis.', caption: 'The same rule outside the ledger: a model that is a mechanism gets a message that says why, and no numbers.' },
        { k: 'p', t: 'Containment is kept in a ledger that lists every open safety issue, its warning or refusal, the condition that triggers it and the test that shows it fires, or the evidence that no containment is needed. A test keeps the ledger and the engine’s list of known issues in agreement, and a scheduled job compares the ledger with the issues open on GitHub. The conditions are narrow on purpose: across the 39 models of the results corpus, each warning fires on at most two. The pull request that completes this ledger for every open issue (#807) landed on 5 November, before release 0.5.0.' },
        { k: 'p', t: 'A containment ends when its fix lands, and it ends in the same pull request. This week #1295 removed the refusal of 3D-to-2D cuts that bent members about the wrong axis, because the cut is now right; #1301 replaced a warning on every 3D co-rotational solve with one that fires only when a member end turns more than 0.02 rad against its chord, where the remaining approximation can matter.' },

        { k: 'h', t: 'This week’s fixes' },
        { k: 'p', t: '2D buckling with axial loads along members (#1324, version 23). Each member’s geometric stiffness used its mean axial force. Where compression grows toward the end that rotates most, as under gravity on a rafter or an axial point load inside the span, the buckling factor came out too high and nothing warned about it. Each member now integrates its varying axial force.' },
        {
          k: 'table',
          caption: 'One member, λP·L²/EI. Source: SA-2026-042.',
          head: ['Case', 'Exact', 'Before', 'Now'],
          rows: [
            ['Cantilever, compression rising from 0 at the support to P at the tip', '3.477', '4.972 (+43 %)', '3.542 (+1.9 %)'],
            ['Cantilever, thrust P at the tip and an opposing axial load P at mid-span: compression P only from mid-span to the tip', '2.961', '4.972 (+68 %)', '3.056 (+3.2 %)'],
            ['Euler’s heavy column, compression largest at the support', '7.837', '4.972 (−37 %)', '7.889 (+0.7 %)'],
          ],
        },
        { k: 'p', t: 'The remaining few per cent is the ordinary discretisation error of one element per member, and it falls as the member is split. P-Delta still uses the mean axial force, and 3D buckling with loads along members keeps its warning until its own fix.' },
        { k: 'p', t: '3D co-rotational analysis (#1301, version 24). Member end rotations were subtracted as rotation vectors, which is exact only when all rotations share one axis. The Bathe–Bolourchi 45° bend came out 1.3 % off its published solution, and refining the mesh moved it away from the references, not toward them. Rotations are now composed as rotation matrices: the same bend is within 0.4 % of two independent published solutions and converges between them. A member whose ends turn more than 0.9π relative to each other is refused, because the result cannot say which whole turn is meant.' },
        { k: 'p', t: 'A hidden mechanism in 2D (#1298, version 22). A rigid link or a diaphragm from a node whose members are all hinged to the end of a truss member is a mechanism, but the solver held it with a tiny artificial spring and returned displacements of hundreds of kilometres, which the certificate then certified. Such a model is now refused. The fix proposed no advisory for this one: in the cases found the displacements were absurd, around 10⁵ m, and came with the app’s warning of a likely mechanism. That is a judgement about those cases, not a proof that no affected result looked plausible. What was wrong was the certificate’s claim, and the version entry tells the projects it concerns. A similar case through a connector instead of a rigid link was found afterwards (#1414); its fix (#1415) landed on 5 November.' },
        { k: 'p', t: 'Cutting a 3D model to 2D (#1295). The cut used each section’s strong-axis inertia for every member, so columns in a Y–Z cut, beams in an X–Y cut and members rolled 90° bent about the wrong axis: an IPN 300 portal standing in Y–Z swayed 0.96 mm in 2D against 13.0 mm in 3D. Each member now bends in 2D about the axis it bends about in 3D, and cuts a plane model cannot represent are refused. This fix has no results version, and that is deliberate: a saved 2D model solves exactly as before, because what was wrong was the model the cut produced. The re-check notice cannot reach those files, so the advisory (SA-2026-035) is the channel: re-cut the model from 3D, or solve it in 3D.' },

        { k: 'h', t: 'After the fix: advisories' },
        { k: 'p', t: 'A defect that could have produced a wrong or unconservative result in a released version gets a safety advisory: what was wrong, which models it affects, how to recognise them, what to re-check in results already delivered, and the case that reproduces it. The advisories for this week’s fixes are drafted in the repository now and are published with release 0.5.0, as SA-2026-001 to 024 were with 0.3.0 and 0.4.0.' },
        {
          k: 'table',
          caption: 'Advisories drafted for the fixes merged on 4 and 5 November 2026.',
          head: ['Advisory', 'What was wrong', 'Severity'],
          rows: [
            ['SA-2026-033', 'The load generator left out a floor’s area loads when one low member stood over part of it', 'High'],
            ['SA-2026-034', 'The equilibrium check agreed for cases whose check left loads out', 'Medium'],
            ['SA-2026-035', '3D-to-2D cut bent members about the wrong section axis', 'High'],
            ['SA-2026-036', '3D-to-2D cut on Y–Z or X–Y read the constraints as if the frame stood in X–Z', 'High'],
            ['SA-2026-037', '3D co-rotational analysis subtracted rotation vectors', 'Medium'],
            ['SA-2026-040', 'ACI 318 and EN 1992 checks passed concrete members without checking their torsion', 'High'],
            ['SA-2026-041', 'The RC column check paired the largest moment with the largest compression only', 'High'],
            ['SA-2026-042', '2D buckling overstated the factor of members whose compression grows along them', 'High'],
          ],
        },
        { k: 'img', base: 'blog/results-changelog', w: 1600, h: 1000, alt: 'The Stabileo changelog page on the website: the newest entry first, for 6 November, titled “Wrong results fixed in design checks and dynamics, corrected generated loads, and PRO’s analysis mode completed”, opening with its engine changes, and filters by area on the left.', caption: 'The changelog page, newest first, opening with this week’s fixes that change results.' },

        { k: 'h', t: 'What this does not do' },
        {
          k: 'ul',
          items: [
            'The notice knows only about registered changes. A defect not yet found is in no registry; that is what the verification behind the solver is for, and what containment covers once something is found.',
            'It reads the model’s features from the saved file, and when it cannot tell, it counts the feature as present: one notice too many is better than a change hidden from the model it concerns.',
            'It cannot follow a number once it leaves the app, in a drawing, a spreadsheet or a report already delivered. That is what the advisory is for.',
            'Contained, refused or fixed, the result is still the engineer’s to check before it is signed.',
          ],
        },
        { k: 'link', slug: 'safety-advisories', t: 'Every published advisory, with what to re-check for each:' },
        { k: 'ext', href: `${REPO}/docs/verification/PROVENANCE.md`, label: 'Re-check prompt, provenance and reproducibility', t: 'How results versions, stamps and the notice work, in detail:' },
        { k: 'ext', href: `${REPO}/docs/advisories/README.md`, label: 'Safety advisories index', t: 'The advisories, including the drafts for 0.5.0:' },
        { k: 'ext', href: `${ISSUES}/447`, label: 'Issue #447: contain first, fix second', t: 'The containment policy and its progress:' },
      ],
    },
    es: {
      title: 'Cuando un resultado cambia: versiones de resultados, nuevas verificaciones y avisos de seguridad',
      excerpt:
        'Cómo Stabileo te dice a cuáles de tus proyectos afecta una corrección, cómo retiene un resultado que sabe que puede estar mal hasta que la corrección exista y cómo se publica la corrección, con las catorce versiones de resultados que se integraron el 4 y el 5 de noviembre.',
      blocks: [
        { k: 'p', t: 'Cada corrección de un solver estructural cambia un número que alguien quizás ya usó. Un factor de pandeo que salía demasiado alto ahora es menor; un modelo que antes se resolvía ahora se rechaza. Una corrección que llega a la aplicación en silencio deja el número viejo en cálculos ya entregados, y el ingeniero que los hizo no tiene motivo para volver a mirarlos.' },
        { k: 'p', t: 'Este artículo describe qué hace Stabileo al respecto, desde el momento en que se encuentra un defecto hasta el momento en que se publica su corrección. Los ejemplos son reales: el 4 y el 5 de noviembre de 2026 llegaron a stabileo.com catorce versiones de resultados, de la 16 a la 29.' },

        { k: 'h', t: 'Qué es una versión de resultados' },
        { k: 'p', t: 'Una versión de resultados es un número entero, independiente de la versión de la aplicación. Aumenta en uno cada vez que llega al sitio un cambio que hace que el mismo modelo guardado dé números distintos, o que rechaza un modelo que antes se resolvía. Cada cambio de ese tipo se registra con:' },
        {
          k: 'ul',
          items: [
            'la versión con la que entró, su fecha y sus pull requests;',
            'a qué modelos afecta, escrito como características del modelo: un modelo plano con restricciones, un análisis de pandeo 2D con cargas a lo largo de las barras, una barra de hormigón verificada según CIRSOC 201;',
            'un título y una explicación para el ingeniero en cada uno de los seis idiomas de la aplicación, con qué volver a verificar;',
            'un enlace a la descripción completa: un aviso de seguridad, una nota de cambio de resultados o el registro de cambios.',
          ],
        },
        { k: 'p', t: 'Cada cálculo sella el proyecto con la versión de resultados que lo produjo, junto con la versión de la aplicación, el commit, la versión del motor, un hash del binario del motor y los análisis que se ejecutaron. El sello viaja con el proyecto: un archivo guardado, un guardado automático, una pestaña abierta o un enlace compartido lo llevan.' },
        { k: 'note', t: 'Una versión de resultados nunca se reutiliza. Cada merge a la rama principal se despliega y sella lo que resuelve con la versión actual, así que una entrada agregada a una versión que ya está en el sitio nunca llegaría a los proyectos que esa versión selló. Un test falla ante un agregado así.' },

        { k: 'h', t: 'Por qué cambia una versión' },
        { k: 'p', t: 'La mayoría de los cambios son correcciones: un resultado estaba mal y ahora está bien. Algunos son rechazos: un modelo que antes daba un número ahora da en su lugar un mensaje claro, porque el número no significaba nada. Y una versión también puede deshacer: la versión 15 retiró tres cambios de la versión 14 cuyas correcciones de revisión no habían llegado al sitio con ellos, y las versiones 27 a 29 los trajeron de vuelta, revisados. A un proyecto resuelto con la versión 14 se le informan ambas cosas.' },
        {
          k: 'table',
          caption: 'Versiones de resultados 16 a 29, integradas el 4 y el 5 de noviembre de 2026.',
          head: ['Versión', 'Cambio', 'Tipo'],
          rows: [
            ['16', 'Aluminio: se verifica el corte en el eje débil', 'Corrección'],
            ['17', 'Uniones de acero: los momentos en el eje débil ya no se ignoran', 'Rechazo'],
            ['18', 'ACI 318 y EN 1992: las barras de hormigón con torsión se marcan como no verificadas', 'Rechazo'],
            ['19', 'Las columnas de hormigón armado también se verifican con su compresión mínima (SA-2026-041)', 'Corrección'],
            ['20', 'Generador de cargas: un piso que queda en parte bajo estructura de techo baja conserva sus cargas de área (SA-2026-033)', 'Corrección'],
            ['21', 'Las figuras de láminas exportadas muestran el campo y la escala de la pantalla', 'Corrección'],
            ['22', '2D: se rechaza un mecanismo detrás de un vínculo rígido o un diafragma', 'Rechazo'],
            ['23', 'Pandeo 2D de barras cuyo esfuerzo axil varía a lo largo de ellas (SA-2026-042)', 'Corrección'],
            ['24', 'Análisis corrotacional 3D con grandes rotaciones alrededor de varios ejes (SA-2026-037)', 'Corrección'],
            ['25', 'Restricciones de un modelo 2D cortado de un plano Y–Z o X–Y (SA-2026-036)', 'Corrección'],
            ['26', 'El valor determinante de una barra y la envolvente 2D leen el pico real', 'Corrección'],
            ['27–29', 'Vuelven, revisados, tres cambios de Básico retirados por la versión 15: colapso plástico, P-Δ y el signo de las líneas de influencia de momento', 'Corrección'],
          ],
        },

        { k: 'h', t: 'El aviso de nueva verificación' },
        { k: 'p', t: 'Cuando se abre un proyecto, la aplicación compara su sello con el registro y lista los cambios hechos desde entonces que afectan a ese modelo. A un pórtico plano con un análisis de pandeo se le informa la corrección de pandeo 2D; a un pórtico de acero sin hormigón no se le informa la verificación de columnas de hormigón armado. La lista no es una notificación que desaparece: el aviso no tiene botón de cerrar, ignora Escape y los clics fuera de él, y sólo se descarta marcando “Leí estos cambios” y eligiendo continuar o volver a correr.' },
        { k: 'img', base: 'blog/results-recheck', w: 1600, h: 1000, alt: 'Stabileo Básico abriendo un pórtico plano de los ejemplos, guardado como resuelto con la versión de resultados 15. Un diálogo titulado “Los resultados cambiaron desde que se resolvió este proyecto” lista los cambios que lo afectan, entre ellos la corrección de pandeo 2D para barras cuyo esfuerzo axil varía y el valor determinante leído en el pico real, cada uno con su explicación, y pide marcar “Leí estos cambios” antes de continuar o volver a correr el análisis.', caption: 'Un pórtico plano resuelto con la versión 15, abierto hoy: sólo se listan los cambios que afectan a este modelo, cada uno con qué volver a verificar.' },
        { k: 'p', t: 'Hasta que el modelo se vuelve a resolver, sus resultados quedan marcados como desactualizados: un cartel lo indica, y cada informe, planilla y CSV exportado mientras tanto imprime una advertencia DESACTUALIZADO en su procedencia. “Volver a correr análisis y diseño” vuelve a resolver y, en PRO, vuelve a verificar las barras de hormigón con la armadura ya elegida; no las vuelve a diseñar, porque eso sobrescribiría las barras del ingeniero.' },
        { k: 'p', t: 'Desde el 4 de noviembre (#1406) el aviso explica cada cambio en el idioma del lector en los seis idiomas de la aplicación. Antes, los lectores en alemán, francés y turco recibían el título y la explicación en inglés: 66 de los 72 cambios registrados no tenían texto en esos idiomas. Cada traducción se verificó traduciéndola de vuelta al inglés sin el original y comparando el significado: números, signos, qué carga, qué verificación, lado seguro o inseguro. Esa verificación corrigió frases en los tres idiomas y mostró que cuatro explicaciones en inglés eran ambiguas en el origen; esas se corrigieron en los seis idiomas.' },

        { k: 'h', t: 'Antes de la corrección: advertir o rechazar' },
        { k: 'p', t: 'Un defecto suele encontrarse antes de corregirse, a veces días antes. Durante ese tiempo el resultado que afecta sigue en pantalla. La regla que seguimos es contenerlo primero y corregirlo después (issue #447): cada defecto abierto que puede dar un resultado equivocado recibe, en cada punto de entrada que afecta, una advertencia o un rechazo.' },
        {
          k: 'ul',
          items: [
            'Una advertencia conserva el resultado y muestra, junto a él, qué problema conocido puede afectarlo y qué verificar a mano.',
            'Un rechazo retiene el resultado y dice por qué, cuando el número puede estar equivocado por un factor grande sin forma de notarlo en la salida, como un factor que pasa a ser varias veces mayor o menor según la numeración de las barras.',
          ],
        },
        { k: 'img', base: 'blog/results-refusal', w: 1600, h: 1000, alt: 'Stabileo Básico con el ejemplo del mecanismo oculto: una viga de dos tramos sobre tres apoyos que se deslizan todos en horizontal, con una carga uniforme de 10 kN/m. Después de calcular no se dibuja ningún diagrama; un mensaje rojo en la esquina dice que la estructura es inestable, un mecanismo, porque ningún apoyo restringe el movimiento horizontal, con un botón para ver el análisis cinemático.', caption: 'La misma regla fuera del inventario: un modelo que es un mecanismo recibe un mensaje que dice por qué, y ningún número.' },
        { k: 'p', t: 'La contención se lleva en un inventario que lista cada problema de seguridad abierto, su advertencia o rechazo, la condición que lo dispara y el test que muestra que se dispara, o la evidencia de que no hace falta contención. Un test mantiene de acuerdo el inventario y la lista de problemas conocidos del motor, y un trabajo programado compara el inventario con los issues abiertos en GitHub. Las condiciones son estrechas a propósito: en los 39 modelos del corpus de resultados, cada advertencia se dispara como mucho en dos. El pull request que completa este inventario para cada issue abierto (#807) se integró el 5 de noviembre, antes de la versión 0.5.0.' },
        { k: 'p', t: 'Una contención termina cuando entra su corrección, y termina en el mismo pull request. Esta semana #1295 quitó el rechazo de los cortes de 3D a 2D que flexionaban barras alrededor del eje equivocado, porque el corte ahora está bien; #1301 reemplazó una advertencia en cada cálculo corrotacional 3D por una que se dispara sólo cuando el extremo de una barra gira más de 0,02 rad respecto de su cuerda, donde la aproximación que queda puede importar.' },

        { k: 'h', t: 'Las correcciones de esta semana' },
        { k: 'p', t: 'Pandeo 2D con cargas axiales a lo largo de las barras (#1324, versión 23). La rigidez geométrica de cada barra usaba su esfuerzo axil medio. Donde la compresión crece hacia el extremo que más gira, como bajo gravedad en un cabio o con una carga axial puntual dentro del tramo, el factor de pandeo salía demasiado alto y nada advertía sobre eso. Ahora cada barra integra su esfuerzo axil variable.' },
        {
          k: 'table',
          caption: 'Una barra, λP·L²/EI. Fuente: SA-2026-042.',
          head: ['Caso', 'Exacto', 'Antes', 'Ahora'],
          rows: [
            ['Ménsula, compresión que crece de 0 en el apoyo hasta P en la punta', '3,477', '4,972 (+43 %)', '3,542 (+1,9 %)'],
            ['Ménsula, empuje P en la punta y una carga axial opuesta P a mitad de la luz: compresión P sólo desde la mitad hasta la punta', '2,961', '4,972 (+68 %)', '3,056 (+3,2 %)'],
            ['Columna pesada de Euler, compresión mayor en el apoyo', '7,837', '4,972 (−37 %)', '7,889 (+0,7 %)'],
          ],
        },
        { k: 'p', t: 'Los pocos puntos porcentuales que quedan son el error de discretización habitual de un elemento por barra, y bajan al dividir la barra. P-Delta sigue usando el esfuerzo axil medio, y el pandeo 3D con cargas a lo largo de las barras conserva su advertencia hasta su propia corrección.' },
        { k: 'p', t: 'Análisis corrotacional 3D (#1301, versión 24). Las rotaciones de los extremos de las barras se restaban como vectores de rotación, lo que es exacto sólo cuando todas las rotaciones comparten un eje. La curva a 45° de Bathe–Bolourchi daba un 1,3 % fuera de su solución publicada, y refinar la malla la alejaba de las referencias, en lugar de acercarla. Ahora las rotaciones se componen como matrices de rotación: la misma curva queda a menos de 0,4 % de dos soluciones publicadas independientes y converge entre ellas. Se rechaza una barra cuyos extremos giran más de 0,9π uno respecto del otro, porque el resultado no puede decir de qué vuelta completa se trata.' },
        { k: 'p', t: 'Un mecanismo oculto en 2D (#1298, versión 22). Un vínculo rígido o un diafragma desde un nudo cuyas barras están todas articuladas hasta el extremo de una barra de reticulado es un mecanismo, pero el solver lo sostenía con un resorte artificial minúsculo y devolvía desplazamientos de cientos de kilómetros, que el certificado luego certificaba. Ahora un modelo así se rechaza. La corrección no propuso aviso de seguridad para este: en los casos encontrados los desplazamientos eran absurdos, del orden de 10⁵ m, y venían con la advertencia de la aplicación de un probable mecanismo. Es un juicio sobre esos casos, no una prueba de que ningún resultado afectado pareciera razonable. Lo que estaba mal era la afirmación del certificado, y la entrada de la versión se lo informa a los proyectos que afecta. Después se encontró un caso similar a través de un conector en lugar de un vínculo rígido (#1414); su corrección (#1415) se integró el 5 de noviembre.' },
        { k: 'p', t: 'Corte de un modelo 3D a 2D (#1295). El corte usaba la inercia del eje fuerte de cada sección para todas las barras, así que las columnas en un corte Y–Z, las vigas en un corte X–Y y las barras giradas 90° flexionaban alrededor del eje equivocado: un pórtico de IPN 300 en el plano Y–Z se desplazaba lateralmente 0,96 mm en 2D contra 13,0 mm en 3D. Ahora cada barra flexiona en 2D alrededor del eje en que flexiona en 3D, y se rechazan los cortes que un modelo plano no puede representar. Esta corrección no tiene versión de resultados, y es deliberado: un modelo 2D guardado se resuelve exactamente igual que antes, porque lo que estaba mal era el modelo que producía el corte. El aviso de nueva verificación no puede llegar a esos archivos, así que el aviso de seguridad (SA-2026-035) es el canal: volvé a cortar el modelo desde 3D, o resolvelo en 3D.' },

        { k: 'h', t: 'Después de la corrección: avisos de seguridad' },
        { k: 'p', t: 'Un defecto que pudo producir un resultado equivocado o del lado inseguro en una versión publicada recibe un aviso de seguridad: qué estaba mal, qué modelos afecta, cómo reconocerlos, qué volver a verificar en los resultados ya entregados y el caso que lo reproduce. Los avisos de las correcciones de esta semana ya están redactados como borradores en el repositorio y se publican con la versión 0.5.0, como SA-2026-001 a 024 lo fueron con 0.3.0 y 0.4.0.' },
        {
          k: 'table',
          caption: 'Avisos redactados para las correcciones integradas el 4 y el 5 de noviembre de 2026.',
          head: ['Aviso', 'Qué estaba mal', 'Severidad'],
          rows: [
            ['SA-2026-033', 'El generador de cargas omitía las cargas de área de un piso cuando una barra baja quedaba sobre parte de él', 'Alta'],
            ['SA-2026-034', 'La verificación de equilibrio daba coincidencia en casos cuya verificación dejaba cargas afuera', 'Media'],
            ['SA-2026-035', 'El corte de 3D a 2D flexionaba barras alrededor del eje equivocado de la sección', 'Alta'],
            ['SA-2026-036', 'El corte de 3D a 2D en Y–Z o X–Y leía las restricciones como si el pórtico estuviera en X–Z', 'Alta'],
            ['SA-2026-037', 'El análisis corrotacional 3D restaba vectores de rotación', 'Media'],
            ['SA-2026-040', 'Las verificaciones ACI 318 y EN 1992 aprobaban barras de hormigón sin verificar su torsión', 'Alta'],
            ['SA-2026-041', 'La verificación de columnas de hormigón armado combinaba el momento máximo sólo con la compresión máxima', 'Alta'],
            ['SA-2026-042', 'El pandeo 2D sobrestimaba el factor de las barras cuya compresión crece a lo largo de ellas', 'Alta'],
          ],
        },
        { k: 'img', base: 'blog/results-changelog', w: 1600, h: 1000, alt: 'La página del registro de cambios de Stabileo en el sitio web: primero la entrada más nueva, del 6 de noviembre, sobre resultados equivocados corregidos en verificaciones de diseño y dinámica, que empieza por sus cambios en el motor, y a la izquierda los filtros por área.', caption: 'La página del registro de cambios, lo más nuevo primero, que abre con las correcciones de esta semana que cambian resultados.' },

        { k: 'h', t: 'Lo que esto no hace' },
        {
          k: 'ul',
          items: [
            'El aviso sólo conoce los cambios registrados. Un defecto que todavía no se encontró no está en ningún registro; para eso está la verificación detrás del solver, y eso es lo que cubre la contención una vez que se encuentra algo.',
            'Lee las características del modelo desde el archivo guardado, y cuando no puede determinarlas, cuenta la característica como presente: un aviso de más es mejor que un cambio oculto al modelo que afecta.',
            'No puede seguir un número una vez que sale de la aplicación, en un plano, una planilla o un informe ya entregado. Para eso está el aviso de seguridad.',
            'Contenido, rechazado o corregido, verificar el resultado antes de firmarlo sigue siendo responsabilidad del ingeniero.',
          ],
        },
        { k: 'link', slug: 'safety-advisories', t: 'Cada aviso de seguridad publicado, con qué volver a verificar en cada uno:' },
        { k: 'ext', href: `${REPO}/docs/verification/PROVENANCE.md`, label: 'Aviso de nueva verificación, procedencia y reproducibilidad', t: 'Cómo funcionan en detalle las versiones de resultados, los sellos y el aviso:' },
        { k: 'ext', href: `${REPO}/docs/advisories/README.md`, label: 'Índice de avisos de seguridad', t: 'Los avisos de seguridad, incluidos los borradores para 0.5.0:' },
        { k: 'ext', href: `${ISSUES}/447`, label: 'Issue #447: contener primero, corregir después', t: 'La política de contención y su avance:' },
      ],
    },
    pt: {
      title: 'Quando um resultado muda: versões de resultados, novas verificações e avisos de segurança',
      excerpt:
        'Como o Stabileo diz a quais dos seus projetos uma correção se refere, como segura um resultado que sabe que pode estar errado até a correção existir e como a correção é publicada, com as catorze versões de resultados incorporadas em 4 e 5 de novembro.',
      blocks: [
        { k: 'p', t: 'Toda correção em um solver estrutural muda um número que alguém talvez já tenha usado. Um fator de flambagem que saía alto demais agora é menor; um modelo que antes era resolvido agora é recusado. Uma correção que chega ao aplicativo em silêncio deixa o número antigo em cálculos já entregues, e o engenheiro que os produziu não tem motivo para olhar de novo.' },
        { k: 'p', t: 'Este artigo descreve o que o Stabileo faz a respeito, desde o momento em que um defeito é encontrado até o momento em que sua correção é publicada. Os exemplos são reais: em 4 e 5 de novembro de 2026, catorze versões de resultados, da 16 à 29, chegaram a stabileo.com.' },

        { k: 'h', t: 'O que é uma versão de resultados' },
        { k: 'p', t: 'Uma versão de resultados é um número inteiro, separado da versão do aplicativo. Ela sobe uma unidade cada vez que chega ao site uma mudança que faz o mesmo modelo salvo dar números diferentes, ou que recusa um modelo que antes era resolvido. Toda mudança desse tipo é registrada com:' },
        {
          k: 'ul',
          items: [
            'a versão com que entrou, sua data e seus pull requests;',
            'quais modelos ela afeta, escritos como características do modelo: um modelo plano com restrições, uma análise de flambagem 2D com cargas ao longo das barras, uma barra de concreto verificada pela CIRSOC 201;',
            'um título e uma explicação para o engenheiro em cada um dos seis idiomas do aplicativo, com o que verificar de novo;',
            'um link para a descrição completa: um aviso de segurança, uma nota de mudança de resultados ou o registro de mudanças.',
          ],
        },
        { k: 'p', t: 'Cada cálculo carimba o projeto com a versão de resultados que o produziu, junto com a versão do aplicativo, o commit, a versão do motor, um hash do binário do motor e as análises que foram executadas. O carimbo viaja com o projeto: um arquivo salvo, um salvamento automático, uma aba aberta ou um link compartilhado, todos o levam.' },
        { k: 'note', t: 'Uma versão de resultados nunca é reutilizada. Todo merge no branch principal é implantado e carimba o que resolve com a versão atual, então uma entrada acrescentada a uma versão que já está no site nunca chegaria aos projetos que essa versão carimbou. Um teste falha diante de um acréscimo assim.' },

        { k: 'h', t: 'Por que uma versão muda' },
        { k: 'p', t: 'A maioria das mudanças são correções: um resultado estava errado e agora está certo. Algumas são recusas: um modelo que antes dava um número agora dá, em vez disso, uma mensagem clara, porque o número não significava nada. E uma versão também pode desfazer: a versão 15 retirou três mudanças da versão 14 cujas correções de revisão não tinham chegado ao site junto com elas, e as versões 27 a 29 as trouxeram de volta, revisadas. Um projeto resolvido com a versão 14 é informado das duas coisas.' },
        {
          k: 'table',
          caption: 'Versões de resultados 16 a 29, incorporadas em 4 e 5 de novembro de 2026.',
          head: ['Versão', 'Mudança', 'Tipo'],
          rows: [
            ['16', 'Alumínio: o cisalhamento no eixo fraco é verificado', 'Correção'],
            ['17', 'Ligações de aço: os momentos no eixo fraco não são mais ignorados', 'Recusa'],
            ['18', 'ACI 318 e EN 1992: barras de concreto com torção são marcadas como não verificadas', 'Recusa'],
            ['19', 'Pilares de concreto armado também são verificados com sua menor compressão (SA-2026-041)', 'Correção'],
            ['20', 'Gerador de cargas: um piso parcialmente sob estrutura de cobertura baixa mantém suas cargas de área (SA-2026-033)', 'Correção'],
            ['21', 'As figuras de cascas exportadas mostram o campo e a escala da tela', 'Correção'],
            ['22', '2D: um mecanismo atrás de um vínculo rígido ou de um diafragma é recusado', 'Recusa'],
            ['23', 'Flambagem 2D de barras cujo esforço normal varia ao longo delas (SA-2026-042)', 'Correção'],
            ['24', 'Análise corrotacional 3D com grandes rotações em torno de vários eixos (SA-2026-037)', 'Correção'],
            ['25', 'Restrições de um modelo 2D cortado de um plano Y–Z ou X–Y (SA-2026-036)', 'Correção'],
            ['26', 'O valor determinante de uma barra e a envoltória 2D leem o pico real', 'Correção'],
            ['27–29', 'Voltam, revisadas, três mudanças do Básico retiradas pela versão 15: colapso plástico, P-Δ e o sinal das linhas de influência de momento', 'Correção'],
          ],
        },

        { k: 'h', t: 'O aviso de nova verificação' },
        { k: 'p', t: 'Quando um projeto é aberto, o aplicativo compara seu carimbo com o registro e lista as mudanças feitas desde então que afetam esse modelo. Um pórtico plano com uma análise de flambagem é informado da correção de flambagem 2D; um pórtico de aço sem concreto não é informado da verificação de pilares de concreto armado. A lista não é uma notificação que desaparece: o aviso não tem botão de fechar, ignora Escape e cliques fora dele, e só é dispensado marcando “Li estas mudanças” e escolhendo continuar ou executar novamente.' },
        { k: 'img', base: 'blog/results-recheck', w: 1600, h: 1000, alt: 'Stabileo Básico abrindo um pórtico plano dos exemplos, salvo como resolvido com a versão de resultados 15. Uma caixa de diálogo intitulada “Os resultados mudaram desde a última vez que este projeto foi resolvido” lista as mudanças que o afetam, entre elas a correção de flambagem 2D para barras cujo esforço normal varia e o valor determinante lido no pico real, cada uma com sua explicação, e pede para marcar “Li estas mudanças” antes de continuar ou executar novamente a análise.', caption: 'Um pórtico plano resolvido com a versão 15, aberto hoje: só são listadas as mudanças que afetam este modelo, cada uma com o que verificar de novo.' },
        { k: 'p', t: 'Até o modelo ser resolvido de novo, seus resultados ficam marcados como desatualizados: uma faixa avisa, e cada relatório, planilha e CSV exportado nesse meio-tempo imprime uma advertência DESATUALIZADO na sua procedência. “Executar novamente análise e dimensionamento” resolve de novo e, no PRO, verifica de novo as barras de concreto com a armadura já escolhida; não as redimensiona, porque isso sobrescreveria as barras do engenheiro.' },
        { k: 'p', t: 'Desde 4 de novembro (#1406) o aviso explica cada mudança no idioma do leitor nos seis idiomas do aplicativo. Antes disso, leitores em alemão, francês e turco recebiam o título e a explicação em inglês: 66 das 72 mudanças registradas não tinham texto nesses idiomas. Cada tradução foi conferida traduzindo-a de volta para o inglês sem o original e comparando o significado: números, sinais, qual carga, qual verificação, lado seguro ou inseguro. Essa conferência corrigiu frases nos três idiomas e mostrou que quatro explicações em inglês eram ambíguas na origem; elas foram corrigidas nos seis idiomas.' },

        { k: 'h', t: 'Antes da correção: advertir ou recusar' },
        { k: 'p', t: 'Um defeito costuma ser encontrado antes de ser corrigido, às vezes dias antes. Nesse tempo, o resultado que ele afeta continua na tela. A regra que seguimos é contê-lo primeiro e corrigi-lo depois (issue #447): todo defeito aberto que pode dar um resultado errado recebe, em cada ponto de entrada que afeta, uma advertência ou uma recusa.' },
        {
          k: 'ul',
          items: [
            'Uma advertência mantém o resultado e mostra, ao lado dele, qual problema conhecido pode afetá-lo e o que verificar à mão.',
            'Uma recusa retém o resultado e diz por quê, quando o número pode estar errado por um fator grande sem como perceber pela saída, como um fator que fica várias vezes maior ou menor conforme a numeração das barras.',
          ],
        },
        { k: 'img', base: 'blog/results-refusal', w: 1600, h: 1000, alt: 'Stabileo Básico com o exemplo do mecanismo oculto: uma viga de dois vãos sobre três apoios que deslizam todos na horizontal, com uma carga uniforme de 10 kN/m. Depois de calcular, nenhum diagrama é desenhado; uma mensagem vermelha no canto diz que a estrutura é instável, um mecanismo, porque nenhum apoio restringe o movimento horizontal, com um botão para ver a análise cinemática.', caption: 'A mesma regra fora do inventário: um modelo que é um mecanismo recebe uma mensagem que diz por quê, e nenhum número.' },
        { k: 'p', t: 'A contenção é mantida em um inventário que lista cada problema de segurança aberto, sua advertência ou recusa, a condição que a dispara e o teste que mostra que ela dispara, ou a evidência de que nenhuma contenção é necessária. Um teste mantém de acordo o inventário e a lista de problemas conhecidos do motor, e uma tarefa agendada compara o inventário com as issues abertas no GitHub. As condições são estreitas de propósito: nos 39 modelos do corpus de resultados, cada advertência dispara em no máximo dois. O pull request que completa este inventário para cada issue aberta (#807) foi integrado em 5 de novembro, antes da versão 0.5.0.' },
        { k: 'p', t: 'Uma contenção termina quando sua correção entra, e termina no mesmo pull request. Esta semana, o #1295 removeu a recusa dos cortes de 3D para 2D que fletiam barras em torno do eixo errado, porque o corte agora está certo; o #1301 substituiu uma advertência em todo cálculo corrotacional 3D por uma que dispara só quando a extremidade de uma barra gira mais de 0,02 rad em relação à sua corda, onde a aproximação que resta pode importar.' },

        { k: 'h', t: 'As correções desta semana' },
        { k: 'p', t: 'Flambagem 2D com cargas axiais ao longo das barras (#1324, versão 23). A rigidez geométrica de cada barra usava seu esforço normal médio. Onde a compressão cresce em direção à extremidade que mais gira, como sob gravidade em um caibro ou com uma carga axial pontual dentro do vão, o fator de flambagem saía alto demais e nada avisava disso. Agora cada barra integra seu esforço normal variável.' },
        {
          k: 'table',
          caption: 'Uma barra, λP·L²/EI. Fonte: SA-2026-042.',
          head: ['Caso', 'Exato', 'Antes', 'Agora'],
          rows: [
            ['Balanço, compressão crescendo de 0 no apoio até P na ponta', '3,477', '4,972 (+43 %)', '3,542 (+1,9 %)'],
            ['Balanço, empuxo P na ponta e uma carga axial oposta P no meio do vão: compressão P só do meio até a ponta', '2,961', '4,972 (+68 %)', '3,056 (+3,2 %)'],
            ['Coluna pesada de Euler, compressão maior no apoio', '7,837', '4,972 (−37 %)', '7,889 (+0,7 %)'],
          ],
        },
        { k: 'p', t: 'Os poucos por cento restantes são o erro de discretização comum de um elemento por barra, e diminuem quando a barra é dividida. O P-Delta continua usando o esforço normal médio, e a flambagem 3D com cargas ao longo das barras mantém sua advertência até sua própria correção.' },
        { k: 'p', t: 'Análise corrotacional 3D (#1301, versão 24). As rotações das extremidades das barras eram subtraídas como vetores de rotação, o que só é exato quando todas as rotações compartilham um eixo. A curva de 45° de Bathe–Bolourchi saía 1,3 % fora de sua solução publicada, e refinar a malha a afastava das referências, em vez de aproximá-la. Agora as rotações são compostas como matrizes de rotação: a mesma curva fica a menos de 0,4 % de duas soluções publicadas independentes e converge entre elas. Uma barra cujas extremidades giram mais de 0,9π uma em relação à outra é recusada, porque o resultado não consegue dizer de qual volta completa se trata.' },
        { k: 'p', t: 'Um mecanismo oculto em 2D (#1298, versão 22). Um vínculo rígido ou um diafragma a partir de um nó cujas barras são todas articuladas até a extremidade de uma barra de treliça é um mecanismo, mas o solver o segurava com uma mola artificial minúscula e devolvia deslocamentos de centenas de quilômetros, que o certificado depois certificava. Agora um modelo assim é recusado. A correção não propôs aviso de segurança para este: nos casos encontrados os deslocamentos eram absurdos, da ordem de 10⁵ m, e vinham com a advertência do aplicativo de um provável mecanismo. É um julgamento sobre esses casos, não uma prova de que nenhum resultado afetado parecesse razoável. O que estava errado era a afirmação do certificado, e a entrada da versão informa os projetos que ela afeta. Um caso semelhante, por meio de um conector em vez de um vínculo rígido, foi encontrado depois (#1414); sua correção (#1415) foi integrada em 5 de novembro.' },
        { k: 'p', t: 'Cortar um modelo 3D para 2D (#1295). O corte usava a inércia do eixo forte de cada seção para todas as barras, então os pilares em um corte Y–Z, as vigas em um corte X–Y e as barras giradas 90° fletiam em torno do eixo errado: um pórtico de IPN 300 no plano Y–Z se deslocava lateralmente 0,96 mm em 2D contra 13,0 mm em 3D. Agora cada barra flete em 2D em torno do eixo em que flete em 3D, e cortes que um modelo plano não consegue representar são recusados. Esta correção não tem versão de resultados, e isso é deliberado: um modelo 2D salvo resolve exatamente como antes, porque o que estava errado era o modelo que o corte produzia. O aviso de nova verificação não consegue chegar a esses arquivos, então o aviso de segurança (SA-2026-035) é o canal: corte o modelo de novo a partir do 3D, ou resolva-o em 3D.' },

        { k: 'h', t: 'Depois da correção: avisos de segurança' },
        { k: 'p', t: 'Um defeito que pode ter produzido um resultado errado ou contra a segurança em uma versão publicada recebe um aviso de segurança: o que estava errado, quais modelos afeta, como reconhecê-los, o que verificar de novo nos resultados já entregues e o caso que o reproduz. Os avisos das correções desta semana já estão redigidos como rascunho no repositório e são publicados com a versão 0.5.0, como SA-2026-001 a 024 foram com 0.3.0 e 0.4.0.' },
        {
          k: 'table',
          caption: 'Avisos redigidos para as correções incorporadas em 4 e 5 de novembro de 2026.',
          head: ['Aviso', 'O que estava errado', 'Severidade'],
          rows: [
            ['SA-2026-033', 'O gerador de cargas deixava de fora as cargas de área de um piso quando uma barra baixa ficava sobre parte dele', 'Alta'],
            ['SA-2026-034', 'A verificação de equilíbrio dava coincidência em casos cuja verificação deixava cargas de fora', 'Média'],
            ['SA-2026-035', 'O corte de 3D para 2D fletia barras em torno do eixo errado da seção', 'Alta'],
            ['SA-2026-036', 'O corte de 3D para 2D em Y–Z ou X–Y lia as restrições como se o pórtico estivesse em X–Z', 'Alta'],
            ['SA-2026-037', 'A análise corrotacional 3D subtraía vetores de rotação', 'Média'],
            ['SA-2026-040', 'As verificações ACI 318 e EN 1992 aprovavam barras de concreto sem verificar sua torção', 'Alta'],
            ['SA-2026-041', 'A verificação de pilares de concreto armado combinava o momento máximo só com a compressão máxima', 'Alta'],
            ['SA-2026-042', 'A flambagem 2D superestimava o fator das barras cuja compressão cresce ao longo delas', 'Alta'],
          ],
        },
        { k: 'img', base: 'blog/results-changelog', w: 1600, h: 1000, alt: 'A página do registro de mudanças do Stabileo no site: primeiro a entrada mais nova, de 6 de novembro, sobre resultados errados corrigidos em verificações de dimensionamento e dinâmica, que começa pelas mudanças no motor, e à esquerda os filtros por área.', caption: 'A página do registro de mudanças, o mais novo primeiro, que abre com as correções desta semana que mudam resultados.' },

        { k: 'h', t: 'O que isto não faz' },
        {
          k: 'ul',
          items: [
            'O aviso só conhece as mudanças registradas. Um defeito ainda não encontrado não está em nenhum registro; para isso existe a verificação por trás do solver, e é isso que a contenção cobre quando algo é encontrado.',
            'Ele lê as características do modelo a partir do arquivo salvo e, quando não consegue determiná-las, conta a característica como presente: um aviso a mais é melhor que uma mudança escondida do modelo que ela afeta.',
            'Ele não consegue seguir um número depois que sai do aplicativo, em um desenho, uma planilha ou um relatório já entregue. Para isso existe o aviso de segurança.',
            'Contido, recusado ou corrigido, verificar o resultado antes de assiná-lo continua sendo responsabilidade do engenheiro.',
          ],
        },
        { k: 'link', slug: 'safety-advisories', t: 'Cada aviso de segurança publicado, com o que verificar de novo em cada um:' },
        { k: 'ext', href: `${REPO}/docs/verification/PROVENANCE.md`, label: 'Aviso de nova verificação, procedência e reprodutibilidade', t: 'Como funcionam em detalhe as versões de resultados, os carimbos e o aviso:' },
        { k: 'ext', href: `${REPO}/docs/advisories/README.md`, label: 'Índice de avisos de segurança', t: 'Os avisos de segurança, incluindo os rascunhos para a 0.5.0:' },
        { k: 'ext', href: `${ISSUES}/447`, label: 'Issue #447: conter primeiro, corrigir depois', t: 'A política de contenção e seu andamento:' },
      ],
    },
  },
};
