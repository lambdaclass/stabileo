import type { PublicLocale } from '../i18n/store.svelte';

export type ChangelogArea = 'basic' | 'pro' | 'edu' | 'app' | 'engine' | 'site';

export const CHANGELOG_AREAS: readonly ChangelogArea[] = ['basic', 'pro', 'edu', 'app', 'engine', 'site'];

export type ChangelogShot = {
  /** A stem under /screenshots, served by Shot.svelte at 800 and 1600 px. */
  base: string;
  w: number;
  h: number;
  alt: Record<PublicLocale, string>;
};

export type ChangelogEntry = {
  /** The Friday of the weekly report, or the first day of the month for a monthly entry. */
  date: string;
  /** Before the weekly reports started in June 2026, the history is told a month at a time. */
  period?: 'month';
  /** Areas of the items, in order: `items` in every language follows it. */
  areas: ChangelogArea[];
  shot?: ChangelogShot;
  i18n: Record<PublicLocale, { title: string; items: string[] }>;
};

/**
 * What reached stabileo.com, newest first. From June 2026 one entry per weekly report, dated with
 * the report's Friday and listing only what was merged to main that week; before that, one entry
 * per month, from the first commit on 10 February 2026.
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-11-06',
    areas: ['engine', 'engine', 'engine', 'engine', 'engine', 'engine', 'pro', 'pro', 'pro', 'pro', 'pro', 'pro', 'pro', 'pro', 'pro', 'pro', 'pro', 'basic', 'app', 'site', 'site', 'basic', 'app', 'engine', 'pro', 'site', 'site', 'pro', 'engine', 'engine', 'engine', 'app', 'site', 'site'],
    i18n: {
      es: {
        title: 'Resultados incorrectos corregidos en diseño, el solver y dinámica, cargas generadas corregidas, el modo de análisis del PRO completo y el curso del Básico de vuelta',
        items: [
          'Resultado incorrecto corregido: la certificación de pandeo podía certificar un factor por encima de su propia cota superior, calculada de forma independiente; ahora ese factor se rechaza, en 2D y en 3D. El factor calculado no cambia. Los proyectos con análisis de pandeo guardados antes muestran un aviso para volver a ejecutar la certificación antes de confiar en un certificado anterior.',
          'Resultados incorrectos corregidos en dinámica: el análisis en el tiempo dejaba afuera una carga aplicada en 0 s sobre un nudo sin masa, así que arrancaba fuera de equilibrio (SA-2026-031); el análisis modal salteaba el modo nulo de un mecanismo y devolvía los demás modos como si estuvieran completos (SA-2026-032), y ahora lo rechaza y lo nombra, también en los análisis espectral y sísmico; los autovalores repetidos de estructuras simétricas conservan toda su multiplicidad; y un análisis en el tiempo que da números no finitos se rechaza en lugar de mostrarse. Conviene volver a calcular los análisis en el tiempo con fuerzas en 0 s sobre nudos sin masa y los análisis modales, espectrales y sísmicos; la app avisa en los proyectos afectados.',
          'Resultado incorrecto corregido, solo en la API del motor y WASM (la app siempre envía el área): el corte AISC 360 pasaba con relación 0 cuando faltaba el área del alma (SA-2026-025), y el de EC3 tomaba Av = 0,5·A, un 57% más que el área de corte de un HEB 300 (SA-2026-026). Ahora el área sale de la sección o el chequeo queda sin evaluar.',
          'Los análisis estáticos y modales verifican el equilibrio y la ortogonalidad de los modos antes de devolver resultados: un chequeo que falla avisa, y uno no finito o muy fallido se rechaza. La combinación que gobierna una barra ahora cuenta los esfuerzos dentro de ella y no solo en sus extremos.',
          'Las pruebas del motor: los chequeos de invariancia cubren los seis análisis prioritarios y el escalado uniforme de la rigidez, y se corrigieron 48 referencias o modelos equivocados en las pruebas de benchmarks, sin cambiar el motor. Esa revisión encontró además un problema real del motor, todavía sin advertencia: las cáscaras MITC4 y MITC9 salen demasiado flexibles en geometría alabeada (torcida), con desplazamientos un 30% altos en MITC4 y hasta 2,4 veces en MITC9 con 90° de torsión. El error crece con la torsión y no aparece en elementos planos. Hay una advertencia en revisión (issue #1057, PR #807).',
          'Detrás de escena, sin cambios en los resultados: las verificaciones nocturnas abren un hallazgo por causa raíz, y cada mutante de Rust se prueba al menos cada 16 días.',
          'Resultado incorrecto corregido, columnas CIRSOC 201: el chequeo tomaba Mz como el momento de la columna y lo verificaba sobre la altura h, aunque Mz flexiona la sección sobre su ancho b, así que una columna rectangular flexionada sobre todo por Mz podía quedar con un 36% menos de armadura de la necesaria en un ejemplo (SA-2026-029). Ahora toma el mayor de My y Mz sobre su propia altura y verifica también el otro corte. Hay que volver a diseñar esas columnas.',
          'Resultados incorrectos corregidos en chequeos de diseño: la flexión EN 1992-1-1 suponía que el acero traccionado fluye, así que MRd podía salir hasta un 22% alto en vigas sobrearmadas o con armadura superior y una viga que falla podía pasar (SA-2026-028); la compresión CIRSOC 301 daba a un cajón o tubo cuya área cargada a mano es menor que la de sus chapas una resistencia mayor que la carga de aplastamiento y lo aprobaba, y ahora lo rechaza (SA-2026-030); y los tubos redondos apenas pasado el límite de esbeltez recibían hasta un 1,2% de resistencia de más. Hay que volver a correr estos chequeos.',
          'Resultado incorrecto corregido, envolvente de cáscaras: placas y cuadriláteros guardaban todo el resultado de la combinación con mayor Von Mises, así que las demás componentes podían quedar más bajas de lo que son, mx un 14% bajo en el ejemplo de la platea (SA-2026-027). Cada componente ahora tiene sus propios extremos. El diseño de losas y muros no cambia.',
          'Resultado incorrecto corregido en las cargas generadas: el generador de cargas según reglamento ya no carga como piso el paño que cierran los cordones inferiores y las vigas de alero de un galpón (recibía la sobrecarga de uso y las terminaciones del piso), una cubierta inclinada de 5° o más, sin losa, en un modelo sin pisos ya no toma la carga permanente de los pisos (el plan se detiene y pide la de la cubierta; una cubierta plana la sigue tomando), y el peso sísmico incluye las losas, los muros y los techos dibujados como cáscaras; antes, el corte basal de un edificio de hormigón daba alrededor de la mitad. Las cargas guardadas no cambian: hay que volver a generarlas y revisar los galpones, las naves y los casos sísmicos de edificios con losas o muros de cáscaras.',
          'Corregido después de estos cambios: el generador ya no quita toda la carga de superficie de un piso cuando un elemento a menos de 2,2 m por encima cubre solo una parte (un alero, el borde de un entrepiso, una viga baja de cubierta), y una losa girada 45° conserva su carga de piso (SA-2026-033, versión de resultados 20); el chequeo de equilibrio ya no dice que un caso cierra cuando dejó afuera cargas que no pudo sumar, y las nombra (SA-2026-034). Conviene generar de nuevo las cargas de los modelos cuyas cargas vinieron del generador.',
          'El diseño del PRO ya no cuenta como acero a todas las barras cuando un material de hormigón no tiene f′c: nombra el material, y el H-30 del ejemplo del edificio 3D ahora tiene f′c = 30 MPa, así que se diseñan sus 105 barras.',
          'La memoria de cálculo imprime el conjunto de resultados elegido, por defecto la envolvente de las combinaciones; antes imprimía lo que había en pantalla, que después de calcular es la suma de todos los casos con factor 1, y esa suma ahora se nombra como tal, con una nota de que no es un estado de carga del reglamento. Verificar una memoria exportada compara cada valor impreso y no solo huellas, y vuelve a imprimir las tablas para el resultado que registra su huella, así que una memoria con el caso y los números cambiados ya no pasa. Una memoria a la que se le quitaron secciones enteras tampoco pasa, y una memoria exportada antes del 5 de noviembre queda como incompleta: conviene exportarla de nuevo. La verificación confirma que una memoria coincide con su propio registro; no prueba quién la hizo, así que una memoria reescrita por completo con un registro nuevo todavía pasa.',
          'Exportaciones que escalan: la memoria del edificio de seis pisos de prueba tarda unos 10 segundos en lugar de unos cuatro minutos y su plano PNG unos 15 segundos en lugar de dos minutos, la planilla de resultados de un modelo grande sale como un zip de CSV escrito fila por fila (el diálogo avisa el tamaño antes) en lugar de agotar la memoria de la pestaña, y la memoria dibuja una figura de cargas por caso, hasta doce, con todos los casos en la tabla.',
          'Nuevo en el modo de análisis del PRO: ayudas bajo cada opción que se pueden apagar, el estado de guardado en el encabezado, categorías de vista (barras, nudos, losas y muros, apoyos, cargas, etiquetas, dibujos de fondo y modelos vinculados) visibles, en medio tono u ocultas y guardadas en las vistas con nombre, un IFC vinculado como referencia 3D, búsqueda de comandos con un botón, / o Ctrl/⌘K, una vista dividida en 3D y planta, pisos maestros y similares cuyas ediciones se aplican a todos en un paso, casos de carga por defecto en el idioma de la interfaz, y un informe posterior al análisis en Diagnóstico con los hallazgos del modelo, del cálculo y del diseño, exportable en CSV, PDF o Word.',
          'Resultados de placas: esfuerzos de membrana Nx, Ny y Nxy por unidad de ancho, cortes transversales Vx, Vy y Vmax, momentos principales Mmax y Mmin con sus direcciones, tensiones en la superficie media o en la cara superior o inferior, y promedios en los nudos sobre todo el modelo, por placa o por grupo.',
          'Un enlace de solo lectura de un modelo del PRO (Copiar enlace de solo lectura, en Proyecto) lo abre en un visor, en 3D, en planta o ambos, donde no se edita nada y no se guarda nada hasta que Duplicar y editar lo convierte en una copia propia. La pestaña Proyecto tiene un lugar para los videos del PRO, que figuran como próximamente hasta que se publiquen.',
          'Etiqueta incorrecta corregida: el ejemplo de la nave industrial en 3D mostraba una combinación llamada 1.2D + L + E cuyos números eran los de 1,2 D + 1,0 Lr, porque la nave no tiene caso sísmico; nunca dio la mayor magnitud de ningún esfuerzo, reacción o desplazamiento. Ahora abre con las combinaciones CIRSOC 101-2025 de sus propios casos de carga permanente, sobrecarga de cubierta y viento, igual que la cubierta del estadio, y se rechaza un ejemplo o una planilla con una carga en un caso que no tiene. Los proyectos guardados con las combinaciones viejas se calculan igual que antes; para las nuevas, hay que abrir el ejemplo otra vez.',
          'Se rechazan los enlaces compartidos con números no finitos, coordenadas no numéricas o barras, apoyos o cargas que apuntan a nudos o elementos que no existen, en lugar de abrir un modelo roto, y abrir un enlace incrustado o de solo lectura ya no pisa el proyecto guardado automáticamente.',
          'Resultado incorrecto corregido en las Herramientas: la línea de influencia daba un corte un 200% errado justo después de un apoyo; conviene volver a verificar todo corte de línea de influencia leído en una Herramienta antes del 1 de noviembre de 2026. Las Herramientas además avisan cuando el desplazamiento supera luz/50, cuando el motor y la fórmula clásica difieren en más del 1% o cuando una barra es demasiado robusta para la frecuencia de flexión, y rechazan una rigidez casi nula.',
          'Las páginas de Stabileo Research dicen con qué se comparan (por ejemplo, el top88.m original en GNU Octave) en lugar de dejar la comparación pendiente, los buscadores describen mejor a Stabileo, sus calculadoras y su artículo, y el título de la portada en alemán ya no ensancha la página en el celular.',
          'Básico: las unidades 1 a 7 de un curso de análisis estructural (el método de las fuerzas, el método de los desplazamientos de clase, líneas de influencia, P-Δ y pandeo, análisis plástico paso a paso y dinámica) llegaron a la app el 4 de noviembre antes de su revisión y se retiraron ese mismo día (versiones de resultados 14 y 15). Volvieron el 5 de noviembre con las correcciones de la revisión, y con ellas tres cambios de resultados: las líneas de influencia de momento toman positivo el que tracciona la fibra inferior (versión de resultados 27), P-Δ y la carga crítica dividen cada barra en 4 elementos por defecto (28), y el colapso plástico cierra las rótulas que se descargan y sigue hasta el colapso real, 71,30 en lugar de 64,06 en el ejemplo del pórtico (29). Conviene volver a calcular esos análisis en modelos planos; la app los señala.',
          'Los ejemplos incluidos, tal como los guardaron v0.2.0, v0.3.0 y v0.4.0, se abren, migran y calculan en cada cambio, y deben dar los resultados que mostraban esas versiones salvo que corresponda un cambio de resultados registrado. Un archivo guardado por un Stabileo más nuevo se rechaza con un mensaje que lo dice, en lugar de "formato no válido", y un archivo de sesión más nuevo ya no abre sus pestañas de todos modos.',
          'Las combinaciones de carga suman sus casos en el mismo orden en cada cálculo, así que un esfuerzo combinado ya no cambia en su último dígito de una compilación a otra, y el análisis modal avisa cuando devuelve menos modos de los pedidos. Ningún resultado del corpus de referencia cambia y la app no muestra aviso para volver a calcular, pero una barra justo en un límite de detallado puede quedar del otro lado: conviene revisar el detallado que pasó o falló por muy poco.',
          'El PRO se presenta como disponible, ya no como en desarrollo ni en beta. Lo que sigue en desarrollo es el diseño según reglamento dentro del PRO (armaduras, detallado y uniones), que está apagado por defecto, y Stabileo AI.',
          'La portada carga unos 724 KB menos y el editor unos 215 KB menos, porque el blog se carga solo cuando se muestra. En esta página, cada filtro por área ahora cuenta los cambios de su área, así que los filtros suman el total.',
          'Las correcciones llegan antes al sitio: las verificaciones completas de un cambio ahora tardan unos 22 minutos, en lugar de seis a ocho horas a principios de la semana, y fallan menos por motivos ajenos al cambio.',
          'Resultados incorrectos corregidos en verificaciones de diseño (versiones de resultados 16 a 19): el aluminio según EN 1999 ahora verifica el corte en el eje débil, que no tenía ninguna verificación; los nudos de acero (chapa de corte, chapa de extremo, empalme, cartela, placa base) ya no ignoran un momento en el eje débil y quedan sin resolver con el motivo; las barras de hormigón se marcan como torsión no verificada en lugar de pasar cuando su torsión supera el umbral de ACI 318 por debajo del cual puede despreciarse o, según EN 1992, siempre que tengan alguna torsión, porque Stabileo no diseña a torsión (SA-2026-040); y las columnas según CIRSOC 201 también se verifican con su menor compresión, donde una columna es más débil, lo que subió una utilización de 0,727 a 0,832 (SA-2026-041). Conviene volver a diseñar.',
          'Resultados incorrectos corregidos en el solver (versiones de resultados 22 a 25 y 30): el pandeo 2D usaba el esfuerzo axial medio de cada barra, así que una carga a lo largo de una barra podía sobrestimar el factor entre 43 y 68% sin aviso, y ahora integra el esfuerzo a lo largo de ella (SA-2026-042); el análisis corrotacional 3D compone las grandes rotaciones alrededor de varios ejes en lugar de restarlas (SA-2026-037); un mecanismo 2D oculto detrás de un vínculo rígido, un diafragma o un conector se rechaza en lugar de calcularse y certificarse; y un modelo 3D cortado a 2D en un plano Y–Z o X–Y conserva el eje en que flexa cada barra y el sentido de sus restricciones (SA-2026-035, SA-2026-036), o se rechaza cuando el 2D no puede representarlo. Conviene volver a calcular estos análisis y volver a cortar esos modelos 2D.',
          'El valor determinante de una barra y la envolvente 2D toman el pico real del diagrama y no la más cercana de 21 estaciones, así que su magnitud solo puede crecer, 1,05% con una carga parcial corta en un ejemplo (versión de resultados 26); las envolventes rechazan un resultado que desborda en lugar de devolver valores infinitos o NaN; y las figuras de láminas exportadas pintan el mismo campo y la misma escala que la pantalla (versión de resultados 21).',
          'Solo en la API del motor, que la app todavía no usa: el análisis no lineal de fibras se detiene en su último paso de carga convergido y devuelve sus reacciones y un chequeo de equilibrio, en lugar de la última iteración sin converger. Las verificaciones nocturnas reportan menos resultados incorrectos falsos, con tolerancias que escalan con el modelo.',
          'El aviso de volver a verificar explica cada cambio de resultados también en alemán, francés y turco, en lugar de en inglés.',
          'Stabileo Research: se publicó la segunda ronda de revisión de los papers con sus correcciones, cada paper se indexa en los idiomas en que está escrito, con sus datos académicos, y las páginas funcionan en celulares y tablets, con el experimento justo después del título y controles de al menos 44 px; cada página de research se verifica en tamaños de celular y tablet en cada cambio.',
          'El sitio responde un 404 real para una dirección que no es una página, muestra todas las secciones de la landing sin JavaScript ni scroll, genera las mismas páginas byte a byte a partir del mismo build, y se mide con Lighthouse contra producción todos los días.',
        ],
      },
      en: {
        title: 'Wrong results fixed in design checks, the solver and dynamics, corrected generated loads, PRO\'s analysis mode completed, and the Basic course back',
        items: [
          'Wrong result fixed: buckling certification could certify a factor above its own, independently computed upper bound; such a factor is now refused, in 2D and 3D. The computed factor itself is unchanged. Projects with a buckling analysis saved before show a notice to re-run the certification before relying on an earlier certificate.',
          'Wrong results fixed in dynamics: time history left out a load applied at 0 s on a node without mass, so the run started out of equilibrium (SA-2026-031); modal analysis skipped the zero mode of a mechanism and returned the other modes as if complete (SA-2026-032), and now refuses and names it, also in spectral and seismic analyses; repeated eigenvalues of symmetric structures keep their full multiplicity; and a time history that comes out non-finite is refused instead of shown. Re-run time histories with forces at 0 s on nodes without mass, and modal, spectral and seismic analyses; the app flags the projects affected.',
          'Wrong result fixed, engine and WASM API only (the app always sends the area): AISC 360 shear passed at a ratio of 0 when the web area was missing (SA-2026-025), and EC3 took Av = 0.5·A, 57% above the shear area of an HEB 300 (SA-2026-026). The area now comes from the section, or the check is not evaluated.',
          'Static and modal analyses check equilibrium and the orthogonality of the modes before returning results: a failed check warns, and a non-finite or badly failed one is refused. The combination named as governing a member now counts the forces inside it, not only at its ends.',
          'Engine tests: the invariance checks now cover the six priority analyses and uniform stiffness scaling, and 48 wrong references or models in the benchmark tests were corrected, with no change to the engine. That work also found a real engine problem, with no warning yet: MITC4 and MITC9 shells come out too flexible on warped (twisted) geometry, with displacements about 30% high for MITC4 and up to 2.4 times for MITC9 at 90° of twist. The error grows with the twist and is not there on flat elements. A warning is in review (issue #1057, PR #807).',
          'Behind the scenes, with no change to results: the nightly checks file one finding per root cause, and every Rust mutant is tested at least every 16 days.',
          'Wrong result fixed, CIRSOC 201 columns: the check took Mz as the column\'s moment and checked it over the depth h, though Mz bends the section over its width b, so a rectangular column bent mainly by Mz could get 36% less steel than it needs in an example (SA-2026-029). It now takes the larger of My and Mz over its own depth and also checks the other shear. Re-run the design of such columns.',
          'Wrong results fixed in design checks: EN 1992-1-1 flexure assumed the tension steel yields, so MRd could come out up to 22% high on over-reinforced beams or beams with top bars, and a failing beam could pass (SA-2026-028); CIRSOC 301 compression gave a box or tube whose hand-typed area is smaller than its plates a capacity above the squash load and passed it, and now refuses it (SA-2026-030); and round tubes just past the slenderness limit got up to 1.2% too much capacity. Re-run these checks.',
          'Wrong result fixed, shell envelope: plates and quads kept each element\'s whole result from the combination with the largest Von Mises, so the other components could be lower than they are, mx 14% low on the mat foundation example (SA-2026-027). Each component now has its own extremes. Slab and wall design are unchanged.',
          'Wrong result fixed in generated loads: the code load generator no longer loads the panel closed by a shed\'s bottom chords and eave beams as a floor (it got the occupancy live load and the floor finishes), a pitched roof of 5° or more with no slab, in a model with no floors, no longer takes the floors\' dead load (the plan stops and asks for the roof\'s own; a flat roof still takes it), and the seismic weight now includes slabs, walls and roof decks drawn as shells; before, a concrete building\'s base shear came out at about half. Saved loads do not change: generate them again and re-check sheds, halls and the seismic cases of buildings with shell slabs or walls.',
          'Fixed after these changes landed: the generator no longer drops a floor\'s whole area load when a member less than 2.2 m above covers only part of it (a canopy, a mezzanine edge, a low roof beam), and a deck turned 45° keeps its floor load (SA-2026-033, results version 20); the equilibrium check no longer says a case balances when it left out loads it could not sum, and names them (SA-2026-034). Generate the loads again for models whose loads came from the generator.',
          'PRO design no longer counts every member as steel when a concrete material has no f′c: it names the material, and the 3D building example\'s H-30 now has f′c = 30 MPa, so all 105 of its members are designed.',
          'The calculation report prints the result set you choose, by default the envelope of the combinations; before, it printed what was on screen, which after a solve is every load case added at factor 1, and that sum is now named as such, with a note that it is not a code load state. Checking an exported report compares every printed value, not only fingerprints, and prints the tables again for the result its fingerprint records, so a report whose case and numbers were both swapped no longer passes. A report with whole sections removed no longer passes either, and a report exported before November 5 checks as incomplete: export it again. The check confirms that a report agrees with its own record; it does not prove who made it, so a report rewritten in full with a new record still passes.',
          'Exports that scale: the six-storey test building\'s report now takes about 10 seconds instead of about four minutes and its PNG drawing about 15 seconds instead of two minutes, a large model\'s results workbook comes as a zip of CSV files written row by row (the dialog states the size first) instead of running the tab out of memory, and the report draws one load figure per case, up to twelve, with every case in the table.',
          'New in PRO\'s analysis mode: help lines under each option that you can turn off, the save status in the header, view categories (members, nodes, slabs and walls, supports, loads, labels, background drawings and linked models) shown, in halftone or hidden and kept in named views, a linked IFC as a 3D reference, command search from a button, / or Ctrl/⌘K, a split view of 3D and plan, master and similar storeys whose edits apply to all of them in one step, default load cases in the interface\'s language, and a report after the analysis in Diagnostics listing the model\'s, the solver\'s and the design\'s findings, exportable as CSV, PDF or Word.',
          'Plate results: membrane forces Nx, Ny and Nxy per unit width, transverse shears Vx, Vy and Vmax, principal moments Mmax and Mmin with their directions, stresses on the mid-surface or the top or bottom face, and nodal averages over the whole model, per plate or per group.',
          'A read-only link to a PRO model (Copy read-only link, in Project) opens it in a viewer, in 3D, in plan or both, where nothing can be edited and nothing is saved until Duplicate and edit makes it your own copy. The Project tab has a place for PRO\'s videos, listed as coming soon until they are published.',
          'Wrong label fixed: the 3D industrial shed example showed a combination named 1.2D + L + E whose numbers were those of 1.2 D + 1.0 Lr, because the shed has no earthquake case; it never gave the largest magnitude of any force, reaction or displacement. It now opens with the CIRSOC 101-2025 combinations of its own dead, roof live and wind cases, as does the stadium canopy, and an example or workbook with a load in a case it does not have is refused. Projects saved with the old combinations solve as before; open the example again for the new ones.',
          'Share links with non-finite numbers, non-numeric coordinates, or members, supports or loads that point at missing nodes or elements are now refused instead of opening a broken model, and opening an embedded or read-only link no longer overwrites your own autosaved project.',
          'Wrong result fixed in the Tools: the influence line gave a shear 200% off just past a support; re-check any influence-line shear read from a tool before November 1, 2026. The Tools also warn when the displacement exceeds span/50, when the engine and the classical formula differ by more than 1%, or when a member is too stocky for its bending frequency, and refuse a near-zero stiffness.',
          'Stabileo Research pages say what they are compared with (for example, the original top88.m in GNU Octave) instead of leaving the comparison pending, search results describe Stabileo, its calculators and its paper more accurately, and the German landing headline no longer makes the page wider than a phone screen.',
          'Basic: units 1 to 7 of a structural analysis course (the force method, the classroom displacement method, influence lines, P-Δ and buckling, plastic analysis step by step, and dynamics) reached the app on November 4 before their review and were withdrawn the same day (results versions 14 and 15). They came back on November 5 with the review fixes, and with them three result changes: moment influence lines take sagging as positive (results version 27), P-Δ and critical load split each member into 4 elements by default (28), and plastic collapse closes unloading hinges and goes on to the true collapse, 71.30 instead of 64.06 on the portal example (29). Re-run those analyses on plane models; the app flags them.',
          'The bundled examples as v0.2.0, v0.3.0 and v0.4.0 saved them are opened, migrated and solved on every change, and must give the results those releases showed unless a registered result change applies. A file saved by a newer Stabileo is refused with a message that says so instead of "invalid format", and a newer session file no longer opens its tabs anyway.',
          'Load combinations add their cases in the same order on every solve, so a combined force no longer moves in its last digit from one build to another, and modal analysis says so when it returns fewer modes than you asked for. No result in the reference corpus changes and the app shows no re-check notice, but a member right at a detailing limit can come out on the other side of it: re-check detailing that passed or failed by a hair.',
          'PRO is presented as available, no longer as in development or in beta. What stays in development is code design inside PRO (reinforcement, detailing and connections), which is off by default, and Stabileo AI.',
          'The landing loads about 724 KB less and the editor about 215 KB less, because the blog loads only when it is shown. On this page, each area filter now counts the changes in its area, so the filters add up to the total.',
          'Fixes reach the site sooner: a change\'s full checks now take about 22 minutes, instead of six to eight hours at the start of the week, and fail less often for reasons unrelated to the change.',
          'Wrong results fixed in design checks (results versions 16 to 19): EN 1999 aluminium now checks shear along the weak axis, which had no check at all; steel joints (shear tab, end plate, splice, gusset, base plate) no longer drop a weak-axis moment and are left unresolved with the reason; concrete members are marked torsion not checked instead of passing when their torsion is above the ACI 318 threshold below which it may be neglected, or, under EN 1992, whenever they carry any torsion, because Stabileo does not design for torsion (SA-2026-040); and CIRSOC 201 columns are also checked under their least compression, where a column is weaker, which raised one utilization from 0.727 to 0.832 (SA-2026-041). Re-run these designs.',
          'Wrong results fixed in the solver (results versions 22 to 25 and 30): 2D buckling used each member\'s mean axial force, so a load along a member could overstate the factor by 43 to 68% with no warning, and now integrates the force along it (SA-2026-042); 3D co-rotational analysis composes large rotations about several axes instead of subtracting them (SA-2026-037); a 2D mechanism hidden behind a rigid link, a diaphragm or a connector is refused instead of solved and certified; and a 3D model cut to 2D on a Y–Z or X–Y plane keeps the axis each member bends about and the meaning of its constraints (SA-2026-035, SA-2026-036), or is refused when 2D cannot represent it. Re-run these analyses and re-cut such 2D models.',
          'A member\'s governing value and the 2D envelope read the true peak of the diagram, not the nearest of 21 stations, so their magnitudes can only grow, by 1.05% under a short partial load in one example (results version 26); envelopes refuse a result that overflows instead of returning infinite or NaN values; and exported shell figures paint the same field and scale as the screen (results version 21).',
          'Engine API only, not used by the app yet: fiber nonlinear analysis stops at its last converged load step and returns its reactions and an equilibrium check, instead of the last unconverged iterate. The nightly checks report fewer false wrong results, with tolerances that scale with the model.',
          'The re-check notice explains each result change in German, French and Turkish too, instead of in English.',
          'Stabileo Research: the papers\' second review round is published with its fixes, each paper is indexed in the languages it is written in, with its scholarly data, and the pages work on phones and tablets, with the experiment right after the title and controls at least 44 px; every research page is checked at phone and tablet sizes on each change.',
          'The site answers a real 404 for an address that is not a page, shows every landing section without JavaScript or scrolling, builds the same pages byte for byte from the same build, and is measured with Lighthouse against production every day.',
        ],
      },
      pt: {
        title: 'Resultados errados corrigidos em dimensionamento, no solver e em dinâmica, cargas geradas corrigidas, o modo de análise do PRO completo e o curso do Básico de volta',
        items: [
          'Resultado errado corrigido: a certificação de flambagem podia certificar um fator acima do seu próprio limite superior, calculado de forma independente; agora esse fator é recusado, em 2D e em 3D. O fator calculado não muda. Os projetos com análise de flambagem salvos antes mostram um aviso para executar de novo a certificação antes de confiar num certificado anterior.',
          'Resultados errados corrigidos em dinâmica: a análise no tempo deixava de fora uma carga aplicada em 0 s num nó sem massa, então começava fora de equilíbrio (SA-2026-031); a análise modal pulava o modo nulo de um mecanismo e devolvia os demais modos como se estivessem completos (SA-2026-032), e agora o recusa e o nomeia, também nas análises espectral e sísmica; os autovalores repetidos de estruturas simétricas mantêm toda a sua multiplicidade; e uma análise no tempo que dá números não finitos é recusada em vez de mostrada. Vale calcular de novo as análises no tempo com forças em 0 s em nós sem massa e as análises modais, espectrais e sísmicas; o app avisa nos projetos afetados.',
          'Resultado errado corrigido, só na API do motor e WASM (o app sempre envia a área): o cortante AISC 360 passava com razão 0 quando faltava a área da alma (SA-2026-025), e o do EC3 tomava Av = 0,5·A, 57% acima da área de cortante de um HEB 300 (SA-2026-026). Agora a área vem da seção, ou a verificação fica sem avaliar.',
          'As análises estáticas e modais verificam o equilíbrio e a ortogonalidade dos modos antes de devolver resultados: uma verificação que falha avisa, e uma não finita ou muito falha é recusada. A combinação que governa uma barra agora conta os esforços dentro dela, e não só nas extremidades.',
          'Os testes do motor: as verificações de invariância cobrem as seis análises prioritárias e o escalonamento uniforme da rigidez, e foram corrigidos 48 referências ou modelos errados nos testes de benchmarks, sem mudar o motor. Esse trabalho também encontrou um problema real do motor, ainda sem aviso: as cascas MITC4 e MITC9 saem flexíveis demais em geometria empenada (torcida), com deslocamentos cerca de 30% altos no MITC4 e até 2,4 vezes no MITC9 com 90° de torção. O erro cresce com a torção e não aparece em elementos planos. Há um aviso em revisão (issue #1057, PR #807).',
          'Nos bastidores, sem mudança nos resultados: as verificações noturnas abrem um achado por causa raiz, e cada mutante de Rust é testado pelo menos a cada 16 dias.',
          'Resultado errado corrigido, pilares CIRSOC 201: a verificação tomava Mz como o momento do pilar e o verificava sobre a altura h, embora Mz flexione a seção sobre a largura b, então um pilar retangular fletido sobretudo por Mz podia ficar com 36% menos armadura do que precisa num exemplo (SA-2026-029). Agora toma o maior entre My e Mz sobre a própria altura e verifica também o outro cortante. Refaça o dimensionamento desses pilares.',
          'Resultados errados corrigidos em verificações de dimensionamento: a flexão EN 1992-1-1 supunha que o aço tracionado escoa, então MRd podia sair até 22% alto em vigas superarmadas ou com armadura superior, e uma viga que falha podia passar (SA-2026-028); a compressão CIRSOC 301 dava a um caixão ou tubo cuja área digitada à mão é menor que a das suas chapas uma resistência acima da carga de esmagamento e o aprovava, e agora o recusa (SA-2026-030); e tubos circulares logo após o limite de esbeltez recebiam até 1,2% de resistência a mais. Execute essas verificações de novo.',
          'Resultado errado corrigido, envoltória de cascas: placas e quadriláteros guardavam todo o resultado da combinação com maior Von Mises, então as demais componentes podiam ficar mais baixas do que são, mx 14% baixo no exemplo do radier (SA-2026-027). Cada componente agora tem seus próprios extremos. O dimensionamento de lajes e paredes não muda.',
          'Resultado errado corrigido nas cargas geradas: o gerador de cargas por norma não carrega mais como piso o painel fechado pelos banzos inferiores e pelas vigas de beiral de um galpão (recebia a sobrecarga de uso e os acabamentos do piso), uma cobertura inclinada de 5° ou mais, sem laje, num modelo sem pisos não toma mais a carga permanente dos pisos (o plano para e pede a da cobertura; uma cobertura plana continua a tomá-la), e o peso sísmico inclui as lajes, paredes e coberturas desenhadas como cascas; antes, o cortante basal de um edifício de concreto saía com cerca da metade. As cargas salvas não mudam: é preciso gerá-las de novo e verificar galpões, naves e os casos sísmicos de edifícios com lajes ou paredes de cascas.',
          'Corrigido depois dessas mudanças: o gerador não tira mais toda a carga de superfície de um piso quando um elemento a menos de 2,2 m acima cobre só uma parte (um beiral, a borda de um mezanino, uma viga baixa de cobertura), e uma laje girada 45° mantém sua carga de piso (SA-2026-033, versão de resultados 20); a verificação de equilíbrio não diz mais que um caso fecha quando deixou de fora cargas que não conseguiu somar, e as nomeia (SA-2026-034). Gere de novo as cargas dos modelos cujas cargas vieram do gerador.',
          'O dimensionamento do PRO não conta mais todas as barras como aço quando um material de concreto não tem f′c: nomeia o material, e o H-30 do exemplo do edifício 3D agora tem f′c = 30 MPa, então suas 105 barras são dimensionadas.',
          'O memorial de cálculo imprime o conjunto de resultados escolhido, por padrão a envoltória das combinações; antes imprimia o que estava na tela, que depois de calcular é a soma de todos os casos com fator 1, e essa soma agora é nomeada como tal, com uma nota de que não é um estado de carga da norma. Verificar um memorial exportado compara cada valor impresso, não só impressões digitais, e imprime de novo as tabelas para o resultado que sua impressão digital registra, então um memorial com o caso e os números trocados não passa mais. Um memorial do qual foram removidas seções inteiras também não passa, e um memorial exportado antes de 5 de novembro fica como incompleto: exporte-o de novo. A verificação confirma que um memorial coincide com seu próprio registro; não prova quem o fez, então um memorial reescrito por completo com um registro novo ainda passa.',
          'Exportações que escalam: o relatório do edifício de seis andares de teste leva cerca de 10 segundos em vez de uns quatro minutos e seu desenho PNG cerca de 15 segundos em vez de dois minutos, a planilha de resultados de um modelo grande sai como um zip de CSV escrito linha a linha (o diálogo informa o tamanho antes) em vez de esgotar a memória da aba, e o relatório desenha uma figura de cargas por caso, até doze, com todos os casos na tabela.',
          'Novo no modo de análise do PRO: ajudas sob cada opção que podem ser desligadas, o estado de salvamento no cabeçalho, categorias de vista (barras, nós, lajes e paredes, apoios, cargas, rótulos, desenhos de fundo e modelos vinculados) visíveis, em meio-tom ou ocultas e guardadas nas vistas com nome, um IFC vinculado como referência 3D, busca de comandos por um botão, / ou Ctrl/⌘K, uma vista dividida em 3D e planta, pavimentos mestres e semelhantes cujas edições se aplicam a todos de uma vez, casos de carga padrão no idioma da interface, e um relatório pós-análise em Diagnóstico com os achados do modelo, do cálculo e do dimensionamento, exportável em CSV, PDF ou Word.',
          'Resultados de placas: esforços de membrana Nx, Ny e Nxy por unidade de largura, cortantes transversais Vx, Vy e Vmax, momentos principais Mmax e Mmin com suas direções, tensões na superfície média ou na face superior ou inferior, e médias nos nós sobre todo o modelo, por placa ou por grupo.',
          'Um link somente leitura de um modelo do PRO (Copiar link somente leitura, em Projeto) o abre num visualizador, em 3D, em planta ou ambos, onde nada é editado e nada é salvo até que Duplicar e editar o transforme numa cópia sua. A aba Projeto tem um lugar para os vídeos do PRO, listados como em breve até serem publicados.',
          'Rótulo errado corrigido: o exemplo do galpão industrial em 3D mostrava uma combinação chamada 1.2D + L + E cujos números eram os de 1,2 D + 1,0 Lr, porque o galpão não tem caso sísmico; ela nunca deu a maior magnitude de nenhum esforço, reação ou deslocamento. Agora abre com as combinações CIRSOC 101-2025 dos seus próprios casos de carga permanente, sobrecarga de cobertura e vento, assim como a cobertura do estádio, e um exemplo ou planilha com uma carga num caso que não existe é recusado. Os projetos salvos com as combinações antigas calculam como antes; para as novas, abra o exemplo outra vez.',
          'Links compartilhados com números não finitos, coordenadas não numéricas ou barras, apoios ou cargas que apontam para nós ou elementos inexistentes agora são recusados em vez de abrir um modelo quebrado, e abrir um link incorporado ou somente leitura não sobrescreve mais o seu projeto salvo automaticamente.',
          'Resultado errado corrigido nas Ferramentas: a linha de influência dava um cortante 200% errado logo após um apoio; vale verificar de novo todo cortante de linha de influência lido numa Ferramenta antes de 1º de novembro de 2026. As Ferramentas também avisam quando o deslocamento passa de vão/50, quando o motor e a fórmula clássica diferem em mais de 1% ou quando uma barra é robusta demais para a frequência de flexão, e recusam uma rigidez quase nula.',
          'As páginas do Stabileo Research dizem com o que são comparadas (por exemplo, o top88.m original no GNU Octave) em vez de deixar a comparação pendente, os buscadores descrevem melhor o Stabileo, suas calculadoras e seu artigo, e o título da página inicial em alemão não alarga mais a página no celular.',
          'Básico: as unidades 1 a 7 de um curso de análise estrutural (o método das forças, o método dos deslocamentos de aula, linhas de influência, P-Δ e flambagem, análise plástica passo a passo e dinâmica) chegaram ao app em 4 de novembro antes da revisão e foram retiradas no mesmo dia (versões de resultados 14 e 15). Voltaram em 5 de novembro com as correções da revisão, e com elas três mudanças de resultados: as linhas de influência de momento tomam como positivo o que traciona a fibra inferior (versão de resultados 27), o P-Δ e a carga crítica dividem cada barra em 4 elementos por padrão (28), e o colapso plástico fecha as rótulas que descarregam e segue até o colapso real, 71,30 em vez de 64,06 no exemplo do pórtico (29). Recalcule essas análises em modelos planos; o app as sinaliza.',
          'Os exemplos incluídos, como as versões v0.2.0, v0.3.0 e v0.4.0 os salvaram, são abertos, migrados e calculados a cada mudança, e devem dar os resultados que essas versões mostravam, salvo quando se aplica uma mudança de resultados registrada. Um arquivo salvo por um Stabileo mais novo é recusado com uma mensagem que diz isso, em vez de "formato inválido", e um arquivo de sessão mais novo não abre mais suas abas mesmo assim.',
          'As combinações de carga somam seus casos na mesma ordem a cada cálculo, então um esforço combinado não muda mais no último dígito de uma compilação para outra, e a análise modal avisa quando devolve menos modos do que os pedidos. Nenhum resultado do corpus de referência muda e o app não mostra aviso para recalcular, mas uma barra bem no limite de detalhamento pode ficar do outro lado: revise o detalhamento que passou ou falhou por muito pouco.',
          'O PRO é apresentado como disponível, não mais como em desenvolvimento nem em beta. O que continua em desenvolvimento é o dimensionamento por norma dentro do PRO (armaduras, detalhamento e ligações), desligado por padrão, e o Stabileo AI.',
          'A página inicial carrega uns 724 KB a menos e o editor uns 215 KB a menos, porque o blog só carrega quando é mostrado. Nesta página, cada filtro por área agora conta as mudanças da sua área, então os filtros somam o total.',
          'As correções chegam antes ao site: as verificações completas de uma mudança agora levam cerca de 22 minutos, em vez de seis a oito horas no começo da semana, e falham menos por motivos alheios à mudança.',
          'Resultados errados corrigidos em verificações de dimensionamento (versões de resultados 16 a 19): o alumínio pela EN 1999 agora verifica o cisalhamento no eixo fraco, que não tinha nenhuma verificação; as ligações de aço (chapa de cisalhamento, chapa de topo, emenda, gusset, placa de base) não ignoram mais um momento no eixo fraco e ficam sem resolver com o motivo; as barras de concreto são marcadas como torção não verificada em vez de passar quando sua torção supera o limite da ACI 318 abaixo do qual pode ser desprezada ou, pela EN 1992, sempre que tenham alguma torção, porque o Stabileo não dimensiona à torção (SA-2026-040); e os pilares pela CIRSOC 201 também são verificados com sua menor compressão, onde um pilar é mais fraco, o que elevou uma utilização de 0,727 para 0,832 (SA-2026-041). Refaça esses dimensionamentos.',
          'Resultados errados corrigidos no solver (versões de resultados 22 a 25 e 30): a flambagem 2D usava o esforço axial médio de cada barra, então uma carga ao longo de uma barra podia superestimar o fator entre 43 e 68% sem aviso, e agora integra o esforço ao longo dela (SA-2026-042); a análise corrotacional 3D compõe as grandes rotações em torno de vários eixos em vez de subtraí-las (SA-2026-037); um mecanismo 2D escondido atrás de um vínculo rígido, de um diafragma ou de um conector é recusado em vez de calculado e certificado; e um modelo 3D cortado para 2D num plano Y–Z ou X–Y mantém o eixo em que cada barra flete e o sentido de suas restrições (SA-2026-035, SA-2026-036), ou é recusado quando o 2D não consegue representá-lo. Recalcule essas análises e corte de novo esses modelos 2D.',
          'O valor determinante de uma barra e a envoltória 2D tomam o pico real do diagrama, e não a mais próxima de 21 estações, então sua magnitude só pode crescer, 1,05% com uma carga parcial curta num exemplo (versão de resultados 26); as envoltórias recusam um resultado que transborda em vez de devolver valores infinitos ou NaN; e as figuras de cascas exportadas pintam o mesmo campo e a mesma escala da tela (versão de resultados 21).',
          'Só na API do motor, que o app ainda não usa: a análise não linear de fibras para no último passo de carga convergido e devolve suas reações e uma verificação de equilíbrio, em vez da última iteração sem convergir. As verificações noturnas relatam menos resultados errados falsos, com tolerâncias que escalam com o modelo.',
          'O aviso de verificar de novo explica cada mudança de resultados também em alemão, francês e turco, em vez de em inglês.',
          'Stabileo Research: a segunda rodada de revisão dos papers foi publicada com suas correções, cada paper é indexado nos idiomas em que está escrito, com seus dados acadêmicos, e as páginas funcionam em celulares e tablets, com o experimento logo após o título e controles de pelo menos 44 px; cada página de research é verificada em tamanhos de celular e tablet a cada mudança.',
          'O site responde um 404 real para um endereço que não é uma página, mostra todas as seções da landing sem JavaScript nem rolagem, gera as mesmas páginas byte a byte a partir do mesmo build, e é medido com o Lighthouse contra a produção todos os dias.',
        ],
      },
      de: {
        title: 'Falsche Ergebnisse in Bemessung, Solver und Dynamik behoben, korrigierte generierte Lasten, der Berechnungsmodus von PRO vollständig und der Basis-Kurs zurück',
        items: [
          'Falsches Ergebnis behoben: Die Knickzertifizierung konnte einen Faktor oberhalb seiner eigenen, unabhängig berechneten oberen Schranke zertifizieren; ein solcher Faktor wird jetzt abgelehnt, in 2D und 3D. Der berechnete Faktor selbst bleibt unverändert. Vorher gespeicherte Projekte mit Knickberechnung zeigen einen Hinweis, die Zertifizierung erneut auszuführen, bevor man sich auf ein früheres Zertifikat verlässt.',
          'Falsche Ergebnisse in der Dynamik behoben: Die Zeitverlaufsberechnung ließ eine bei 0 s auf einen masselosen Knoten aufgebrachte Last weg und begann daher nicht im Gleichgewicht (SA-2026-031); die Modalanalyse übersprang die Nullform eines Mechanismus und gab die übrigen Eigenformen als vollständig aus (SA-2026-032) und lehnt ihn jetzt mit Namen ab, auch in Antwortspektren- und Erdbebenberechnungen; mehrfache Eigenwerte symmetrischer Tragwerke behalten ihre volle Vielfachheit; und ein Zeitverlauf mit nicht endlichen Zahlen wird abgelehnt statt angezeigt. Zeitverläufe mit Kräften bei 0 s auf masselosen Knoten sowie Modal-, Antwortspektren- und Erdbebenberechnungen neu rechnen; die App markiert die betroffenen Projekte.',
          'Falsches Ergebnis behoben, nur in der API von Rechenkern und WASM (die App sendet die Fläche immer): Der Querkraftnachweis nach AISC 360 bestand mit dem Verhältnis 0, wenn die Stegfläche fehlte (SA-2026-025), und EC3 nahm Av = 0,5·A, 57% über der Schubfläche eines HEB 300 (SA-2026-026). Die Fläche kommt jetzt aus dem Querschnitt, oder der Nachweis bleibt unbewertet.',
          'Statische und modale Berechnungen prüfen vor der Ausgabe das Gleichgewicht und die Orthogonalität der Eigenformen: Eine fehlgeschlagene Prüfung warnt, eine nicht endliche oder stark fehlgeschlagene wird abgelehnt. Die maßgebende Kombination eines Stabs berücksichtigt jetzt die Schnittgrößen in seinem Inneren und nicht nur an den Enden.',
          'Tests des Rechenkerns: Die Invarianzprüfungen decken jetzt die sechs vorrangigen Berechnungen und die gleichmäßige Skalierung der Steifigkeit ab, und 48 falsche Referenzen oder Modelle in den Benchmark-Tests wurden korrigiert, ohne den Rechenkern zu ändern. Dabei wurde auch ein echtes Problem des Rechenkerns gefunden, noch ohne Warnung: MITC4- und MITC9-Schalen sind auf verwundener (verdrillter) Geometrie zu weich, mit etwa 30% zu großen Verschiebungen bei MITC4 und bis zum 2,4-Fachen bei MITC9 bei 90° Verdrillung. Der Fehler wächst mit der Verdrillung und tritt bei ebenen Elementen nicht auf. Eine Warnung ist in Prüfung (Issue #1057, PR #807).',
          'Hinter den Kulissen, ohne Änderung der Ergebnisse: Die nächtlichen Prüfungen melden einen Befund pro Ursache, und jeder Rust-Mutant wird mindestens alle 16 Tage getestet.',
          'Falsches Ergebnis behoben, Stützen nach CIRSOC 201: Der Nachweis nahm Mz als Moment der Stütze und prüfte es über die Höhe h, obwohl Mz den Querschnitt über seine Breite b biegt; eine überwiegend durch Mz gebogene Rechteckstütze konnte in einem Beispiel 36% zu wenig Bewehrung erhalten (SA-2026-029). Jetzt wird der größere Wert von My und Mz über die jeweils eigene Höhe genommen und auch die andere Querkraft nachgewiesen. Solche Stützen neu bemessen.',
          'Falsche Ergebnisse in Bemessungsnachweisen behoben: Die Biegung nach EN 1992-1-1 nahm an, dass der Zugstahl fließt, sodass MRd bei überbewehrten Balken oder Balken mit oberer Bewehrung bis zu 22% zu hoch ausfallen und ein versagender Balken bestehen konnte (SA-2026-028); der Drucknachweis nach CIRSOC 301 gab einem Kasten- oder Rohrprofil, dessen von Hand eingegebene Fläche kleiner als die seiner Bleche ist, eine Tragfähigkeit über der Quetschlast und ließ es bestehen, und lehnt es jetzt ab (SA-2026-030); und Rundrohre knapp über der Schlankheitsgrenze erhielten bis zu 1,2% zu viel Tragfähigkeit. Diese Nachweise erneut ausführen.',
          'Falsches Ergebnis behoben, Umhüllende der Schalen: Platten und Vierecke behielten das ganze Ergebnis der Kombination mit der größten Von-Mises-Spannung, sodass die übrigen Komponenten niedriger sein konnten als in Wirklichkeit, mx 14% zu niedrig im Beispiel der Fundamentplatte (SA-2026-027). Jede Komponente hat jetzt ihre eigenen Extremwerte. Die Bemessung von Decken und Wänden ändert sich nicht.',
          'Falsches Ergebnis bei generierten Lasten behoben: Der Lastgenerator nach Norm belastet das von den Untergurten und Traufträgern einer Halle geschlossene Feld nicht mehr als Geschossdecke (es bekam die Nutzlast und den Fußbodenaufbau), ein geneigtes Dach ab 5° ohne Decke in einem Modell ohne Geschosse übernimmt nicht mehr die ständige Last der Geschosse (der Plan hält an und fragt nach der des Dachs; ein Flachdach übernimmt sie weiterhin), und das seismische Gewicht enthält jetzt als Schalen gezeichnete Decken, Wände und Dachscheiben; vorher ergab sich für ein Stahlbetongebäude etwa die Hälfte der Gesamterdbebenkraft. Gespeicherte Lasten ändern sich nicht: Lasten neu generieren und Hallen sowie die Erdbebenlastfälle von Gebäuden mit Decken oder Wänden aus Schalen erneut prüfen.',
          'Nach dem Einbau dieser Änderungen behoben: Der Generator nimmt einer Geschossdecke nicht mehr die ganze Flächenlast, wenn ein Bauteil weniger als 2,2 m darüber nur einen Teil davon überdeckt (ein Vordach, der Rand einer Zwischendecke, ein niedriger Dachträger), und eine um 45° gedrehte Decke behält ihre Geschosslast (SA-2026-033, Ergebnisversion 20); die Gleichgewichtsprüfung meldet einen Lastfall nicht mehr als ausgeglichen, wenn sie Lasten ausgelassen hat, die sie nicht summieren konnte, und nennt diese (SA-2026-034). Die Lasten von Modellen, deren Lasten vom Generator stammen, bitte neu erzeugen.',
          'Die Bemessung in PRO zählt nicht mehr alle Stäbe als Stahl, wenn ein Betonwerkstoff kein f′c hat: Sie nennt den Werkstoff, und der H-30 des 3D-Gebäudebeispiels hat jetzt f′c = 30 MPa, sodass alle 105 Stäbe bemessen werden.',
          'Die statische Berechnung druckt den gewählten Ergebnissatz, standardmäßig die Umhüllende der Kombinationen; vorher druckte sie, was auf dem Bildschirm war, nach dem Rechnen also die Summe aller Lastfälle mit Faktor 1, und diese Summe heißt jetzt so, mit dem Hinweis, dass sie kein Lastzustand der Norm ist. Die Prüfung eines exportierten Berichts vergleicht jeden gedruckten Wert und nicht nur Fingerabdrücke und druckt die Tabellen für das Ergebnis neu, das sein Fingerabdruck festhält; ein Bericht, in dem Lastfall und Zahlen vertauscht wurden, besteht nicht mehr. Ein Bericht, aus dem ganze Abschnitte entfernt wurden, besteht ebenfalls nicht mehr, und ein vor dem 5. November exportierter Bericht gilt als unvollständig: bitte neu exportieren. Die Prüfung bestätigt, dass ein Bericht mit seinem eigenen Datensatz übereinstimmt; sie beweist nicht, wer ihn erstellt hat, daher besteht ein vollständig neu geschriebener Bericht mit neuem Datensatz weiterhin.',
          'Exporte, die mitwachsen: Der Bericht des sechsgeschossigen Testgebäudes dauert jetzt etwa 10 Sekunden statt etwa vier Minuten und seine PNG-Zeichnung etwa 15 Sekunden statt zwei Minuten, die Ergebnistabelle eines großen Modells kommt als ZIP mit CSV-Dateien, Zeile für Zeile geschrieben (der Dialog nennt die Größe vorher), statt den Speicher des Tabs zu erschöpfen, und der Bericht zeichnet eine Lastabbildung pro Lastfall, höchstens zwölf, mit allen Lastfällen in der Tabelle.',
          'Neu im Berechnungsmodus von PRO: abschaltbare Hilfezeilen unter jeder Option, der Speicherstatus in der Kopfzeile, Ansichtskategorien (Stäbe, Knoten, Decken und Wände, Auflager, Lasten, Beschriftungen, Hintergrundzeichnungen und verknüpfte Modelle) sichtbar, halbtransparent oder ausgeblendet und in benannten Ansichten gespeichert, eine verknüpfte IFC-Datei als 3D-Referenz, die Befehlssuche über eine Schaltfläche, / oder Strg/⌘K, eine geteilte Ansicht aus 3D und Grundriss, Master- und ähnliche Geschosse, deren Änderungen in einem Schritt für alle gelten, Standardlastfälle in der Sprache der Oberfläche und ein Bericht nach der Berechnung unter Diagnose mit den Befunden zu Modell, Berechnung und Bemessung, exportierbar als CSV, PDF oder Word.',
          'Plattenergebnisse: Membrankräfte Nx, Ny und Nxy pro Breiteneinheit, Querkräfte Vx, Vy und Vmax, Hauptmomente Mmax und Mmin mit ihren Richtungen, Spannungen in der Mittelfläche oder an der Ober- oder Unterseite und Knotenmittelwerte über das ganze Modell, je Platte oder je Gruppe.',
          'Ein schreibgeschützter Link zu einem PRO-Modell (Schreibgeschützten Link kopieren, unter Projekt) öffnet es in einer Ansicht, in 3D, im Grundriss oder beidem, in der nichts bearbeitet und nichts gespeichert wird, bis Duplizieren und bearbeiten daraus eine eigene Kopie macht. Der Tab Projekt hat einen Platz für die Videos zu PRO, als demnächst verfügbar aufgeführt, bis sie veröffentlicht sind.',
          'Falsche Bezeichnung behoben: Das Beispiel der Industriehalle in 3D zeigte eine Kombination namens 1.2D + L + E, deren Zahlen die von 1,2 D + 1,0 Lr waren, weil die Halle keinen Erdbebenlastfall hat; sie ergab nie den betragsmäßig größten Wert einer Schnittgröße, Auflagerkraft oder Verschiebung. Sie öffnet jetzt mit den Kombinationen nach CIRSOC 101-2025 ihrer eigenen Lastfälle ständige Last, Dachnutzlast und Wind, ebenso wie die Stadionüberdachung, und ein Beispiel oder eine Tabelle mit einer Last in einem Lastfall, den es nicht gibt, wird abgelehnt. Mit den alten Kombinationen gespeicherte Projekte rechnen wie bisher; für die neuen das Beispiel erneut öffnen.',
          'Geteilte Links mit nicht endlichen Zahlen, nicht numerischen Koordinaten oder Stäben, Auflagern oder Lasten, die auf fehlende Knoten oder Elemente verweisen, werden jetzt abgelehnt, statt ein defektes Modell zu öffnen, und das Öffnen eines eingebetteten oder schreibgeschützten Links überschreibt nicht mehr das eigene automatisch gespeicherte Projekt.',
          'Falsches Ergebnis in den Werkzeugen behoben: Die Einflusslinie lieferte direkt hinter einem Auflager eine um 200% falsche Querkraft; Querkräfte aus der Einflusslinie, die vor dem 1. November 2026 in einem Werkzeug abgelesen wurden, sollten erneut geprüft werden. Die Werkzeuge warnen außerdem, wenn die Verschiebung Spannweite/50 übersteigt, wenn Rechenkern und klassische Formel um mehr als 1% abweichen oder wenn ein Stab für seine Biegeeigenfrequenz zu gedrungen ist, und lehnen eine nahezu verschwindende Steifigkeit ab.',
          'Die Seiten von Stabileo Research nennen, womit sie verglichen werden (zum Beispiel das unveränderte top88.m in GNU Octave), statt den Vergleich offen zu lassen, Suchergebnisse beschreiben Stabileo, seine Rechner und seinen Artikel genauer, und die deutsche Überschrift der Startseite macht die Seite auf dem Handy nicht mehr breiter als den Bildschirm.',
          'Basis: Die Einheiten 1 bis 7 eines Kurses in Baustatik (Kraftgrößenverfahren, Weggrößenverfahren wie im Unterricht, Einflusslinien, P-Δ und Knicken, plastische Berechnung Schritt für Schritt sowie Dynamik) kamen am 4. November vor ihrer Prüfung in die App und wurden noch am selben Tag zurückgezogen (Ergebnisversionen 14 und 15). Am 5. November kamen sie mit den Korrekturen der Prüfung zurück und mit ihnen drei Ergebnisänderungen: Momenten-Einflusslinien nehmen die Zugseite unten als positiv (Ergebnisversion 27), P-Δ und kritische Last teilen jeden Stab standardmäßig in 4 Elemente (28), und der plastische Kollaps schließt entlastete Gelenke und läuft bis zum tatsächlichen Kollaps weiter, 71,30 statt 64,06 im Rahmenbeispiel (29). Diese Berechnungen an ebenen Modellen bitte wiederholen; die App markiert sie.',
          'Die mitgelieferten Beispiele, wie v0.2.0, v0.3.0 und v0.4.0 sie gespeichert haben, werden bei jeder Änderung geöffnet, migriert und berechnet und müssen die Ergebnisse liefern, die diese Versionen zeigten, sofern keine registrierte Ergebnisänderung greift. Eine von einem neueren Stabileo gespeicherte Datei wird mit einer Meldung abgelehnt, die das sagt, statt mit "ungültiges Format", und eine neuere Sitzungsdatei öffnet ihre Tabs nicht mehr trotzdem.',
          'Lastkombinationen summieren ihre Lastfälle bei jeder Berechnung in derselben Reihenfolge, sodass sich eine kombinierte Schnittgröße nicht mehr von einem Build zum nächsten in der letzten Stelle ändert, und die Modalanalyse meldet, wenn sie weniger Eigenformen liefert als angefordert. Kein Ergebnis des Referenzkorpus ändert sich und die App zeigt keinen Hinweis zum Neuberechnen, aber ein Stab genau an einer Grenze der Detaillierung kann auf der anderen Seite landen: Detaillierungen, die knapp bestanden oder knapp nicht bestanden haben, bitte prüfen.',
          'PRO wird als verfügbar vorgestellt, nicht mehr als in Entwicklung oder Beta. In Entwicklung bleiben die normgerechte Bemessung in PRO (Bewehrung, Detaillierung und Anschlüsse), standardmäßig ausgeschaltet, und Stabileo AI.',
          'Die Startseite lädt etwa 724 KB weniger und der Editor etwa 215 KB weniger, weil der Blog erst geladen wird, wenn er angezeigt wird. Auf dieser Seite zählt jeder Bereichsfilter jetzt die Änderungen seines Bereichs, sodass die Filter zusammen die Gesamtzahl ergeben.',
          'Korrekturen erreichen die Website schneller: Die vollständigen Prüfungen einer Änderung dauern jetzt etwa 22 Minuten statt sechs bis acht Stunden zu Wochenbeginn und scheitern seltener aus Gründen, die nichts mit der Änderung zu tun haben.',
          'Falsche Ergebnisse in Bemessungsnachweisen behoben (Ergebnisversionen 16 bis 19): Aluminium nach EN 1999 weist jetzt die Querkraft um die schwache Achse nach, die gar keinen Nachweis hatte; Stahlanschlüsse (Fahnenblech, Stirnplatte, Stoß, Knotenblech, Fußplatte) lassen ein Moment um die schwache Achse nicht mehr fallen und bleiben mit Begründung ungelöst; Betonbauteile werden als Torsion nicht nachgewiesen markiert, statt zu bestehen, wenn ihre Torsion über der Schwelle von ACI 318 liegt, unter der sie vernachlässigt werden darf, oder nach EN 1992, sobald sie überhaupt Torsion tragen, weil Stabileo nicht auf Torsion bemisst (SA-2026-040); und Stützen nach CIRSOC 201 werden auch unter ihrer kleinsten Druckkraft nachgewiesen, wo eine Stütze schwächer ist, was eine Ausnutzung von 0,727 auf 0,832 erhöhte (SA-2026-041). Diese Bemessungen bitte wiederholen.',
          'Falsche Ergebnisse im Solver behoben (Ergebnisversionen 22 bis 25 und 30): Das 2D-Knicken verwendete die mittlere Normalkraft jedes Stabs, sodass eine Last entlang eines Stabs den Faktor ohne Warnung um 43 bis 68 % überschätzen konnte; jetzt wird die Kraft entlang des Stabs integriert (SA-2026-042); die 3D-korotationale Berechnung setzt große Drehungen um mehrere Achsen zusammen, statt sie zu subtrahieren (SA-2026-037); ein 2D-Mechanismus hinter einer starren Kopplung, einer Scheibe oder einem Verbinder wird abgelehnt, statt berechnet und zertifiziert zu werden; und ein 3D-Modell, das in einer Y–Z- oder X–Y-Ebene auf 2D geschnitten wird, behält die Biegeachse jedes Stabs und die Bedeutung seiner Zwangsbedingungen (SA-2026-035, SA-2026-036) oder wird abgelehnt, wenn 2D es nicht darstellen kann. Diese Berechnungen wiederholen und solche 2D-Modelle neu schneiden.',
          'Der maßgebende Wert eines Stabs und die 2D-Umhüllende lesen den tatsächlichen Höchstwert des Verlaufs statt der nächsten von 21 Stellen; ihr Betrag kann nur wachsen, in einem Beispiel unter einer kurzen Teillast um 1,05 % (Ergebnisversion 26); Umhüllenden lehnen ein überlaufendes Ergebnis ab, statt unendliche oder NaN-Werte zurückzugeben; und exportierte Schalenbilder zeigen dasselbe Feld und dieselbe Skala wie der Bildschirm (Ergebnisversion 21).',
          'Nur in der Engine-API, die App nutzt sie noch nicht: Die nichtlineare Faserberechnung hält beim letzten konvergierten Lastschritt an und liefert dessen Auflagerkräfte und eine Gleichgewichtsprüfung statt der letzten nicht konvergierten Iteration. Die nächtlichen Prüfungen melden weniger falsche Fehlergebnisse, mit Toleranzen, die mit dem Modell skalieren.',
          'Der Hinweis zur erneuten Prüfung erklärt jede Ergebnisänderung jetzt auch auf Deutsch, Französisch und Türkisch statt auf Englisch.',
          'Stabileo Research: Die zweite Prüfrunde der Papers ist mit ihren Korrekturen veröffentlicht, jedes Paper wird in den Sprachen indexiert, in denen es geschrieben ist, mit seinen wissenschaftlichen Metadaten, und die Seiten funktionieren auf Handys und Tablets, mit dem Experiment direkt nach dem Titel und Bedienelementen von mindestens 44 px; jede Research-Seite wird bei jeder Änderung in Handy- und Tablet-Größe geprüft.',
          'Die Website antwortet mit einem echten 404 auf eine Adresse, die keine Seite ist, zeigt jeden Abschnitt der Startseite ohne JavaScript und ohne Scrollen, erzeugt aus demselben Build byteweise dieselben Seiten und wird täglich mit Lighthouse gegen die Produktion gemessen.',
        ],
      },
      fr: {
        title: 'Résultats faux corrigés en dimensionnement, dans le solveur et en dynamique, charges générées corrigées, le mode d\'analyse de PRO complet et le cours de Basique de retour',
        items: [
          'Résultat faux corrigé : la certification du flambement pouvait certifier un facteur supérieur à sa propre borne supérieure, calculée indépendamment ; un tel facteur est désormais refusé, en 2D et en 3D. Le facteur calculé lui-même ne change pas. Les projets avec une analyse de flambement enregistrés auparavant affichent un avis invitant à relancer la certification avant de se fier à un certificat antérieur.',
          'Résultats faux corrigés en dynamique : l\'analyse temporelle omettait une charge appliquée à 0 s sur un nœud sans masse et démarrait donc hors équilibre (SA-2026-031) ; l\'analyse modale sautait le mode nul d\'un mécanisme et rendait les autres modes comme s\'ils étaient complets (SA-2026-032), et désormais le refuse en le nommant, aussi dans les analyses spectrales et sismiques ; les valeurs propres multiples des structures symétriques gardent toute leur multiplicité ; et une analyse temporelle qui donne des nombres non finis est refusée au lieu d\'être affichée. Relancez les analyses temporelles avec des forces à 0 s sur des nœuds sans masse, ainsi que les analyses modales, spectrales et sismiques ; l\'application signale les projets concernés.',
          'Résultat faux corrigé, uniquement dans l\'API du moteur et WASM (l\'application envoie toujours l\'aire) : le cisaillement AISC 360 était validé avec un ratio de 0 quand l\'aire de l\'âme manquait (SA-2026-025), et l\'EC3 prenait Av = 0,5·A, 57 % au-dessus de l\'aire de cisaillement d\'un HEB 300 (SA-2026-026). L\'aire vient désormais de la section, sinon la vérification n\'est pas évaluée.',
          'Les analyses statiques et modales vérifient l\'équilibre et l\'orthogonalité des modes avant de rendre des résultats : une vérification en échec avertit, et une vérification non finie ou en net échec est refusée. La combinaison désignée comme déterminante pour une barre compte désormais les efforts à l\'intérieur de la barre, pas seulement à ses extrémités.',
          'Tests du moteur : les contrôles d\'invariance couvrent désormais les six analyses prioritaires et la mise à l\'échelle uniforme de la rigidité, et 48 références ou modèles faux des tests de benchmarks ont été corrigés, sans modifier le moteur. Ce travail a aussi trouvé un vrai problème du moteur, encore sans avertissement : les coques MITC4 et MITC9 sont trop souples sur une géométrie gauche (vrillée), avec des déplacements environ 30 % trop grands en MITC4 et jusqu\'à 2,4 fois en MITC9 pour une torsion de 90°. L\'erreur croît avec la torsion et n\'apparaît pas sur des éléments plans. Un avertissement est en revue (issue #1057, PR #807).',
          'En coulisses, sans changement des résultats : les vérifications nocturnes ouvrent un constat par cause racine, et chaque mutant Rust est testé au moins tous les 16 jours.',
          'Résultat faux corrigé, poteaux CIRSOC 201 : la vérification prenait Mz comme moment du poteau et le vérifiait sur la hauteur h, alors que Mz fléchit la section selon sa largeur b ; un poteau rectangulaire fléchi surtout par Mz pouvait recevoir 36 % d\'armatures de moins que nécessaire dans un exemple (SA-2026-029). Elle prend maintenant le plus grand de My et Mz sur sa propre hauteur et vérifie aussi l\'autre effort tranchant. Redimensionnez ces poteaux.',
          'Résultats faux corrigés dans les vérifications de dimensionnement : la flexion EN 1992-1-1 supposait que l\'acier tendu plastifie, si bien que MRd pouvait sortir jusqu\'à 22 % trop haut sur des poutres sur-armées ou avec des aciers supérieurs, et qu\'une poutre défaillante pouvait passer (SA-2026-028) ; la compression CIRSOC 301 donnait à un caisson ou un tube dont l\'aire saisie à la main est inférieure à celle de ses plaques une résistance supérieure à la charge d\'écrasement et le validait, et le refuse désormais (SA-2026-030) ; et les tubes ronds juste au-delà de la limite d\'élancement recevaient jusqu\'à 1,2 % de résistance en trop. Relancez ces vérifications.',
          'Résultat faux corrigé, enveloppe des coques : plaques et quadrangles gardaient tout le résultat de la combinaison au plus grand Von Mises, si bien que les autres composantes pouvaient être plus basses qu\'en réalité, mx 14 % trop bas dans l\'exemple du radier (SA-2026-027). Chaque composante a désormais ses propres extrêmes. Le dimensionnement des dalles et des voiles ne change pas.',
          'Résultat faux corrigé dans les charges générées : le générateur de charges selon le règlement ne charge plus comme un plancher le panneau fermé par les membrures inférieures et les poutres de rive d\'un hangar (il recevait la charge d\'exploitation et les finitions du plancher), une toiture inclinée de 5° ou plus, sans dalle, dans un modèle sans planchers ne prend plus la charge permanente des planchers (le plan s\'arrête et demande celle de la toiture ; une toiture plate la prend toujours), et le poids sismique inclut les dalles, voiles et toitures dessinés comme coques ; auparavant, l\'effort tranchant à la base d\'un bâtiment en béton sortait à environ la moitié. Les charges enregistrées ne changent pas : les générer à nouveau et revérifier hangars, halls et cas sismiques des bâtiments avec dalles ou voiles en coques.',
          'Corrigé après l\'arrivée de ces changements : le générateur ne retire plus toute la charge surfacique d\'un plancher quand un élément à moins de 2,2 m au-dessus n\'en couvre qu\'une partie (un auvent, le bord d\'une mezzanine, une poutre de toiture basse), et un plancher tourné de 45° garde sa charge de plancher (SA-2026-033, version de résultats 20) ; le contrôle d\'équilibre ne déclare plus un cas équilibré quand il a laissé de côté des charges qu\'il ne savait pas sommer, et les nomme (SA-2026-034). Générez à nouveau les charges des modèles dont les charges viennent du générateur.',
          'Le dimensionnement de PRO ne compte plus toutes les barres comme de l\'acier quand un matériau béton n\'a pas de f′c : il nomme le matériau, et le H-30 de l\'exemple du bâtiment 3D a désormais f′c = 30 MPa, si bien que ses 105 barres sont dimensionnées.',
          'La note de calcul imprime le jeu de résultats choisi, par défaut l\'enveloppe des combinaisons ; auparavant elle imprimait ce qui était à l\'écran, c\'est-à-dire après un calcul la somme de tous les cas avec un facteur 1, et cette somme est désormais nommée comme telle, avec une note indiquant qu\'elle n\'est pas un état de charge réglementaire. Vérifier une note exportée compare chaque valeur imprimée et pas seulement des empreintes, et réimprime les tableaux pour le résultat que son empreinte enregistre : une note dont le cas et les chiffres ont été échangés ne passe plus. Une note dont des sections entières ont été retirées ne passe plus non plus, et une note exportée avant le 5 novembre est jugée incomplète : exportez-la à nouveau. La vérification confirme qu\'une note concorde avec son propre enregistrement ; elle ne prouve pas qui l\'a produite, donc une note entièrement réécrite avec un nouvel enregistrement passe encore.',
          'Des exports qui tiennent la charge : la note du bâtiment de test de six étages prend environ 10 secondes au lieu d\'environ quatre minutes et son dessin PNG environ 15 secondes au lieu de deux minutes, le classeur de résultats d\'un grand modèle sort en zip de fichiers CSV écrits ligne par ligne (la boîte de dialogue en annonce la taille avant) au lieu d\'épuiser la mémoire de l\'onglet, et la note dessine une figure de charges par cas, douze au plus, avec tous les cas dans le tableau.',
          'Nouveau dans le mode d\'analyse de PRO : des lignes d\'aide sous chaque option que l\'on peut désactiver, l\'état d\'enregistrement dans l\'en-tête, des catégories de vue (barres, nœuds, dalles et voiles, appuis, charges, étiquettes, dessins de fond et modèles liés) visibles, en demi-teinte ou masquées et gardées dans les vues nommées, un IFC lié comme référence 3D, la recherche de commandes par un bouton, / ou Ctrl/⌘K, une vue partagée en 3D et en plan, des étages maîtres et semblables dont les modifications s\'appliquent à tous en une étape, les cas de charge par défaut dans la langue de l\'interface, et un rapport après l\'analyse dans Diagnostic listant les constats du modèle, du calcul et du dimensionnement, exportable en CSV, PDF ou Word.',
          'Résultats des plaques : efforts de membrane Nx, Ny et Nxy par unité de largeur, efforts tranchants transversaux Vx, Vy et Vmax, moments principaux Mmax et Mmin avec leurs directions, contraintes sur le feuillet moyen ou sur la face supérieure ou inférieure, et moyennes aux nœuds sur tout le modèle, par plaque ou par groupe.',
          'Un lien en lecture seule vers un modèle PRO (Copier le lien en lecture seule, dans Projet) l\'ouvre dans une visionneuse, en 3D, en plan ou les deux, où rien ne se modifie et rien n\'est enregistré tant que Dupliquer et modifier n\'en fait pas votre propre copie. L\'onglet Projet a une place pour les vidéos de PRO, indiquées comme à venir jusqu\'à leur publication.',
          'Libellé faux corrigé : l\'exemple du hangar industriel en 3D affichait une combinaison nommée 1.2D + L + E dont les nombres étaient ceux de 1,2 D + 1,0 Lr, car le hangar n\'a pas de cas sismique ; elle n\'a jamais donné la plus grande valeur absolue d\'un effort, d\'une réaction ou d\'un déplacement. Il s\'ouvre désormais avec les combinaisons CIRSOC 101-2025 de ses propres cas de charge permanente, d\'exploitation de toiture et de vent, comme la couverture du stade, et un exemple ou un classeur avec une charge dans un cas qu\'il n\'a pas est refusé. Les projets enregistrés avec les anciennes combinaisons se calculent comme avant ; rouvrez l\'exemple pour les nouvelles.',
          'Les liens partagés contenant des nombres non finis, des coordonnées non numériques, ou des barres, appuis ou charges qui renvoient à des nœuds ou éléments absents sont désormais refusés au lieu d\'ouvrir un modèle cassé, et ouvrir un lien intégré ou en lecture seule n\'écrase plus votre propre projet enregistré automatiquement.',
          'Résultat faux corrigé dans les Outils : la ligne d\'influence donnait un effort tranchant faux de 200 % juste après un appui ; revérifiez tout effort tranchant de ligne d\'influence lu dans un Outil avant le 1er novembre 2026. Les Outils avertissent aussi quand le déplacement dépasse portée/50, quand le moteur et la formule classique diffèrent de plus de 1 % ou quand une barre est trop trapue pour sa fréquence de flexion, et refusent une rigidité quasi nulle.',
          'Les pages de Stabileo Research indiquent à quoi elles sont comparées (par exemple le top88.m original dans GNU Octave) au lieu de laisser la comparaison en attente, les résultats de recherche décrivent plus justement Stabileo, ses calculateurs et son article, et le titre de la page d\'accueil en allemand n\'élargit plus la page sur téléphone.',
          'Basique : les unités 1 à 7 d\'un cours d\'analyse des structures (la méthode des forces, la méthode des déplacements telle qu\'en cours, les lignes d\'influence, P-Δ et flambement, l\'analyse plastique pas à pas et la dynamique) sont arrivées dans l\'app le 4 novembre avant leur revue et ont été retirées le jour même (versions de résultats 14 et 15). Elles sont revenues le 5 novembre avec les corrections de la revue, et avec elles trois changements de résultats : les lignes d\'influence du moment prennent positif le moment qui tend la fibre inférieure (version de résultats 27), P-Δ et la charge critique divisent chaque barre en 4 éléments par défaut (28), et l\'effondrement plastique referme les rotules qui se déchargent et va jusqu\'à l\'effondrement réel, 71,30 au lieu de 64,06 sur l\'exemple du portique (29). Relancez ces analyses sur les modèles plans ; l\'app les signale.',
          'Les exemples fournis, tels que v0.2.0, v0.3.0 et v0.4.0 les ont enregistrés, sont ouverts, migrés et calculés à chaque changement, et doivent donner les résultats que ces versions affichaient, sauf si un changement de résultats enregistré s\'applique. Un fichier enregistré par un Stabileo plus récent est refusé avec un message qui le dit, au lieu de "format non valide", et un fichier de session plus récent n\'ouvre plus ses onglets malgré tout.',
          'Les combinaisons de charges additionnent leurs cas dans le même ordre à chaque calcul, si bien qu\'un effort combiné ne change plus à son dernier chiffre d\'une compilation à l\'autre, et l\'analyse modale le signale quand elle renvoie moins de modes que demandé. Aucun résultat du corpus de référence ne change et l\'app n\'affiche aucun avis de recalcul, mais une barre juste à une limite de ferraillage peut passer de l\'autre côté : revérifiez les détails qui ont passé ou échoué de justesse.',
          'PRO est présenté comme disponible, et non plus comme en développement ou en bêta. Ce qui reste en développement, c\'est le dimensionnement réglementaire dans PRO (armatures, détails et assemblages), désactivé par défaut, et Stabileo AI.',
          'La page d\'accueil charge environ 724 Ko de moins et l\'éditeur environ 215 Ko de moins, car le blog ne se charge que lorsqu\'il est affiché. Sur cette page, chaque filtre par domaine compte désormais les changements de son domaine, si bien que les filtres s\'additionnent au total.',
          'Les corrections arrivent plus vite sur le site : les vérifications complètes d\'un changement prennent désormais environ 22 minutes, au lieu de six à huit heures en début de semaine, et échouent moins souvent pour des raisons étrangères au changement.',
          'Résultats faux corrigés dans les vérifications de dimensionnement (versions de résultats 16 à 19) : l\'aluminium selon l\'EN 1999 vérifie désormais l\'effort tranchant selon l\'axe faible, qui n\'avait aucune vérification ; les assemblages acier (platine de cisaillement, platine d\'about, éclissage, gousset, platine de pied) n\'ignorent plus un moment selon l\'axe faible et restent non résolus avec le motif ; les barres en béton sont marquées torsion non vérifiée au lieu de passer quand leur torsion dépasse le seuil de l\'ACI 318 sous lequel elle peut être négligée, ou, selon l\'EN 1992, dès qu\'elles portent la moindre torsion, car Stabileo ne dimensionne pas à la torsion (SA-2026-040) ; et les poteaux selon le CIRSOC 201 sont aussi vérifiés sous leur plus faible compression, là où un poteau est plus faible, ce qui a fait passer un taux de 0,727 à 0,832 (SA-2026-041). Relancez ces dimensionnements.',
          'Résultats faux corrigés dans le solveur (versions de résultats 22 à 25 et 30) : le flambement 2D utilisait l\'effort normal moyen de chaque barre, si bien qu\'une charge le long d\'une barre pouvait surestimer le facteur de 43 à 68 % sans avertissement ; il intègre désormais l\'effort le long de la barre (SA-2026-042) ; l\'analyse corotationnelle 3D compose les grandes rotations autour de plusieurs axes au lieu de les soustraire (SA-2026-037) ; un mécanisme 2D caché derrière une liaison rigide, un diaphragme ou un connecteur est refusé au lieu d\'être calculé et certifié ; et un modèle 3D coupé en 2D dans un plan Y–Z ou X–Y garde l\'axe de flexion de chaque barre et le sens de ses liaisons (SA-2026-035, SA-2026-036), ou est refusé quand le 2D ne peut pas le représenter. Relancez ces analyses et recoupez ces modèles 2D.',
          'La valeur déterminante d\'une barre et l\'enveloppe 2D lisent le vrai pic du diagramme et non la plus proche de 21 stations ; leur valeur absolue ne peut que croître, de 1,05 % sous une charge partielle courte dans un exemple (version de résultats 26) ; les enveloppes refusent un résultat qui déborde au lieu de renvoyer des valeurs infinies ou NaN ; et les figures de coques exportées peignent le même champ et la même échelle que l\'écran (version de résultats 21).',
          'Dans l\'API du moteur uniquement, que l\'app n\'utilise pas encore : l\'analyse non linéaire à fibres s\'arrête au dernier pas de charge convergé et renvoie ses réactions et un contrôle d\'équilibre, au lieu de la dernière itération non convergée. Les vérifications nocturnes signalent moins de faux résultats erronés, avec des tolérances qui suivent l\'échelle du modèle.',
          'L\'avis de revérification explique chaque changement de résultats aussi en allemand, en français et en turc, au lieu de l\'anglais.',
          'Stabileo Research : la deuxième ronde de revue des articles est publiée avec ses corrections, chaque article est indexé dans les langues dans lesquelles il est écrit, avec ses données savantes, et les pages fonctionnent sur téléphone et tablette, avec l\'expérience juste après le titre et des commandes d\'au moins 44 px ; chaque page de recherche est vérifiée aux tailles téléphone et tablette à chaque changement.',
          'Le site répond un vrai 404 pour une adresse qui n\'est pas une page, affiche chaque section de l\'accueil sans JavaScript ni défilement, produit les mêmes pages octet pour octet à partir du même build, et est mesuré chaque jour avec Lighthouse sur la production.',
        ],
      },
      tr: {
        title: 'Tasarım kontrollerinde, çözücüde ve dinamikte hatalı sonuçlar düzeltildi, üretilen yükler düzeltildi, PRO analiz modu tamamlandı ve Temel dersi geri döndü',
        items: [
          'Hatalı sonuç düzeltildi: burkulma sertifikasyonu, bağımsız olarak hesaplanan kendi üst sınırının üzerindeki bir katsayıyı sertifikalandırabiliyordu; böyle bir katsayı artık 2B ve 3B\'de reddediliyor. Hesaplanan katsayının kendisi değişmiyor. Daha önce kaydedilmiş, burkulma analizi içeren projeler, önceki bir sertifikaya güvenmeden önce sertifikasyonun yeniden çalıştırılması için bir uyarı gösteriyor.',
          'Dinamikte hatalı sonuçlar düzeltildi: zaman tanım alanında analiz, kütlesiz bir düğüme 0 s\'de uygulanan yükü dışarıda bırakıyordu, bu yüzden denge dışında başlıyordu (SA-2026-031); modal analiz bir mekanizmanın sıfır modunu atlayıp diğer modları tamammış gibi döndürüyordu (SA-2026-032), artık spektral ve deprem analizlerinde de onu adıyla reddediyor; simetrik yapıların tekrarlanan özdeğerleri tam katlılıklarını koruyor; sonlu olmayan sayılar veren bir zaman tanım alanında analiz gösterilmek yerine reddediliyor. Kütlesiz düğümlerde 0 s\'de kuvvet bulunan zaman tanım alanında analizleri ve modal, spektral ve deprem analizlerini yeniden çalıştırın; uygulama etkilenen projeleri işaretliyor.',
          'Hatalı sonuç düzeltildi, yalnızca motor ve WASM API\'sinde (uygulama alanı her zaman gönderiyor): AISC 360 kesme kontrolü gövde alanı eksik olduğunda 0 oranıyla geçiyordu (SA-2026-025), EC3 ise Av = 0,5·A alıyordu; bu, bir HEB 300\'ün kesme alanından %57 fazla (SA-2026-026). Alan artık kesitten geliyor, yoksa kontrol değerlendirilmiyor.',
          'Statik ve modal analizler sonuç döndürmeden önce dengeyi ve modların ortogonalliğini kontrol ediyor: başarısız bir kontrol uyarıyor, sonlu olmayan veya ağır başarısız bir kontrol reddediliyor. Bir çubuğu belirleyen kombinasyon artık yalnızca uçlarındaki değil, içindeki kuvvetleri de sayıyor.',
          'Motor testleri: değişmezlik kontrolleri artık altı öncelikli analizi ve rijitliğin düzgün ölçeklenmesini kapsıyor; karşılaştırma testlerindeki 48 hatalı referans veya model, motor değiştirilmeden düzeltildi. Bu çalışma, henüz uyarısı olmayan gerçek bir motor sorunu da buldu: MITC4 ve MITC9 kabukları çarpılmış (burulmuş) geometride fazla esnek çıkıyor; 90° burulmada yer değiştirmeler MITC4\'te yaklaşık %30, MITC9\'da 2,4 katına kadar fazla. Hata burulmayla büyüyor ve düz elemanlarda görülmüyor. Bir uyarı incelemede (issue #1057, PR #807).',
          'Perde arkasında, sonuçlarda değişiklik olmadan: gece kontrolleri her kök neden için bir bulgu açıyor ve her Rust mutantı en az 16 günde bir test ediliyor.',
          'Hatalı sonuç düzeltildi, CIRSOC 201 kolonları: kontrol, Mz kesiti b genişliği doğrultusunda eğdiği hâlde Mz\'yi kolonun momenti olarak alıp h yüksekliği üzerinden kontrol ediyordu; bu yüzden ağırlıkla Mz ile eğilen dikdörtgen bir kolon bir örnekte gerekenden %36 az donatı alabiliyordu (SA-2026-029). Artık My ve Mz\'den büyük olanı kendi yüksekliği üzerinden alıyor ve diğer kesme kuvvetini de kontrol ediyor. Bu kolonların tasarımını yeniden yapın.',
          'Tasarım kontrollerinde hatalı sonuçlar düzeltildi: EN 1992-1-1 eğilmesi çekme donatısının aktığını varsayıyordu, bu yüzden aşırı donatılı veya üst donatılı kirişlerde MRd %22\'ye kadar yüksek çıkabiliyor ve göçen bir kiriş geçebiliyordu (SA-2026-028); CIRSOC 301 basınç kontrolü, elle girilen alanı levhalarınınkinden küçük olan bir kutu veya boru kesite ezilme yükünden büyük bir dayanım verip onu geçiriyordu, artık reddediyor (SA-2026-030); narinlik sınırının hemen üzerindeki dairesel borular da %1,2\'ye kadar fazla dayanım alıyordu. Bu kontrolleri yeniden çalıştırın.',
          'Hatalı sonuç düzeltildi, kabuk zarfı: plak ve dörtgen elemanlar, en büyük Von Mises veren kombinasyonun tüm sonucunu tutuyordu; bu yüzden diğer bileşenler gerçekte olduğundan düşük kalabiliyordu, radye örneğinde mx %14 düşük (SA-2026-027). Artık her bileşenin kendi uç değerleri var. Döşeme ve perde tasarımı değişmiyor.',
          'Üretilen yüklerde hatalı sonuç düzeltildi: yönetmeliğe göre yük üreteci, bir hangarın alt başlıkları ve saçak kirişleriyle kapanan paneli artık döşeme olarak yüklemiyor (kullanım hareketli yükünü ve döşeme kaplamalarını alıyordu), katı olmayan bir modelde döşemesiz, 5° veya daha eğimli bir çatı artık katların sabit yükünü almıyor (plan durup çatının kendi yükünü soruyor; düz çatı onu almaya devam ediyor) ve deprem ağırlığı artık kabuk olarak çizilen döşemeleri, duvarları ve çatı plaklarını içeriyor; önceden betonarme bir binanın taban kesme kuvveti yaklaşık yarısı çıkıyordu. Kaydedilmiş yükler değişmiyor: yükleri yeniden üretip hangarları, salonları ve kabuk döşeme veya duvarlı binaların deprem durumlarını yeniden kontrol edin.',
          'Bu değişiklikler geldikten sonra düzeltildi: üreteç, 2,2 m\'den daha az yukarıdaki bir eleman bir döşemenin yalnızca bir kısmını örttüğünde (bir saçak, bir asma katın kenarı, alçak bir çatı kirişi) artık o döşemenin tüm alan yükünü düşürmüyor ve 45° döndürülmüş bir döşeme kat yükünü koruyor (SA-2026-033, sonuç sürümü 20); denge kontrolü de toplayamadığı yükleri dışarıda bıraktığında artık bir durumun dengede olduğunu söylemiyor ve o yükleri adlandırıyor (SA-2026-034). Yükleri üreteçten gelen modellerde yükleri yeniden üretin.',
          'PRO tasarımı, bir beton malzemesinin f′c değeri olmadığında artık tüm çubukları çelik saymıyor: malzemeyi adıyla belirtiyor; 3B bina örneğindeki H-30 artık f′c = 30 MPa\'ya sahip, böylece 105 çubuğunun hepsi tasarlanıyor.',
          'Hesap raporu seçilen sonuç kümesini yazdırıyor, varsayılan olarak kombinasyonların zarfını; önceden ekrandakini yazdırıyordu, bu da çözümden sonra tüm yük durumlarının katsayı 1 ile toplamıdır; bu toplam artık bu adla anılıyor ve bir yönetmelik yük durumu olmadığına dair bir not taşıyor. Dışa aktarılmış bir raporu kontrol etmek yalnızca parmak izlerini değil yazdırılan her değeri karşılaştırıyor ve tabloları parmak izinin kaydettiği sonuç için yeniden yazdırıyor; durumu ve sayıları birlikte değiştirilmiş bir rapor artık geçmiyor. Bölümleri tamamen çıkarılmış bir rapor da artık geçmiyor; 5 Kasım\'dan önce dışa aktarılmış bir rapor eksik sayılıyor, yeniden dışa aktarın. Kontrol, bir raporun kendi kaydıyla uyuştuğunu doğruluyor; raporu kimin hazırladığını kanıtlamıyor, bu yüzden yeni bir kayıtla baştan yazılmış bir rapor hâlâ geçiyor.',
          'Ölçeklenen dışa aktarmalar: altı katlı test binasının raporu yaklaşık dört dakika yerine yaklaşık 10 saniye, PNG çizimi iki dakika yerine yaklaşık 15 saniye sürüyor; büyük bir modelin sonuç çalışma kitabı sekmenin belleğini tüketmek yerine satır satır yazılan CSV dosyalarından oluşan bir zip olarak geliyor (iletişim kutusu boyutu önceden söylüyor) ve rapor her yük durumu için en fazla on iki olmak üzere bir yük şekli çiziyor; tablo tüm durumları listeliyor.',
          'PRO analiz modunda yeni: her seçeneğin altında kapatılabilen yardım satırları, başlıkta kaydetme durumu, görünür, yarı saydam veya gizli olabilen ve adlandırılmış görünümlerde saklanan görünüm kategorileri (çubuklar, düğümler, döşemeler ve duvarlar, mesnetler, yükler, etiketler, arka plan çizimleri ve bağlı modeller), 3B referans olarak bağlı bir IFC, bir düğmeyle, / veya Ctrl/⌘K ile komut arama, 3B ve plandan oluşan bölünmüş görünüm, düzenlemeleri tek adımda hepsine uygulanan ana ve benzer katlar, arayüz dilinde varsayılan yük durumları ve Tanılama\'da modelin, çözümün ve tasarımın bulgularını listeleyen, CSV, PDF veya Word olarak dışa aktarılabilen bir analiz sonrası rapor.',
          'Plak sonuçları: birim genişlik başına Nx, Ny ve Nxy membran kuvvetleri, Vx, Vy ve Vmax enine kesme kuvvetleri, doğrultularıyla birlikte Mmax ve Mmin asal momentleri, orta yüzeyde ya da üst veya alt yüzde gerilmeler ve düğümlerde tüm model, plak veya grup bazında ortalamalar.',
          'Bir PRO modelinin salt okunur bağlantısı (Proje\'de Salt okunur bağlantıyı kopyala) onu bir görüntüleyicide 3B, plan veya ikisi birlikte açıyor; burada hiçbir şey düzenlenmiyor ve Çoğalt ve düzenle onu size ait bir kopyaya dönüştürene kadar hiçbir şey kaydedilmiyor. Proje sekmesinde PRO videoları için bir yer var; yayımlanana kadar yakında olarak listeleniyorlar.',
          'Hatalı etiket düzeltildi: 3B endüstriyel hangar örneği, hangarın deprem durumu olmadığı için sayıları 1,2 D + 1,0 Lr olan, 1.2D + L + E adlı bir kombinasyon gösteriyordu; bu kombinasyon hiçbir kuvvet, mesnet tepkisi veya yer değiştirmede mutlak değerce en büyük değeri vermedi. Örnek artık kendi sabit yük, çatı hareketli yükü ve rüzgâr durumlarının CIRSOC 101-2025 kombinasyonlarıyla açılıyor, stadyum örtüsü de öyle; olmayan bir yük durumunda yükü bulunan bir örnek veya çalışma kitabı reddediliyor. Eski kombinasyonlarla kaydedilmiş projeler önceki gibi çözülüyor; yenileri için örneği yeniden açın.',
          'Sonlu olmayan sayılar, sayısal olmayan koordinatlar veya var olmayan düğüm ya da elemanlara işaret eden çubuklar, mesnetler veya yükler içeren paylaşım bağlantıları artık bozuk bir model açmak yerine reddediliyor; gömülü veya salt okunur bir bağlantıyı açmak artık kendi otomatik kaydedilmiş projenizin üzerine yazmıyor.',
          'Araçlarda hatalı sonuç düzeltildi: tesir çizgisi bir mesnedin hemen ardında %200 hatalı kesme kuvveti veriyordu; 1 Kasım 2026\'dan önce bir Araçtan okunan tesir çizgisi kesme kuvvetlerini yeniden kontrol edin. Araçlar ayrıca yer değiştirme açıklık/50 değerini aştığında, motor ile klasik formül %1\'den fazla farklı olduğunda veya bir çubuk eğilme frekansı için fazla kısa ve kalın olduğunda uyarıyor ve sıfıra yakın rijitliği reddediyor.',
          'Stabileo Research sayfaları karşılaştırmayı beklemede bırakmak yerine neyle karşılaştırıldıklarını söylüyor (örneğin GNU Octave\'daki özgün top88.m), arama sonuçları Stabileo\'yu, hesaplayıcılarını ve makalesini daha doğru tanımlıyor ve Almanca ana sayfa başlığı artık sayfayı telefon ekranından geniş yapmıyor.',
          'Temel: Bir yapı statiği dersinin 1-7. üniteleri (kuvvet yöntemi, derste anlatıldığı haliyle yer değiştirme yöntemi, tesir çizgileri, P-Δ ve burkulma, adım adım plastik analiz ve dinamik) 4 Kasım\'da incelemeden önce uygulamaya geldi ve aynı gün geri çekildi (sonuç sürümleri 14 ve 15). 5 Kasım\'da inceleme düzeltmeleriyle geri döndüler ve onlarla birlikte üç sonuç değişikliği geldi: moment tesir çizgileri alt lifi çeken momenti pozitif alıyor (sonuç sürümü 27), P-Δ ve kritik yük her çubuğu varsayılan olarak 4 elemana bölüyor (28) ve plastik göçme yükü boşalan mafsalları kapatıp gerçek göçmeye kadar devam ediyor, çerçeve örneğinde 64,06 yerine 71,30 (29). Bu analizleri düzlem modellerde yeniden çalıştırın; uygulama onları işaretliyor.',
          'Hazır örnekler, v0.2.0, v0.3.0 ve v0.4.0\'ın kaydettiği haliyle, her değişiklikte açılıyor, taşınıyor ve çözülüyor ve kayıtlı bir sonuç değişikliği geçerli değilse bu sürümlerin gösterdiği sonuçları vermek zorunda. Daha yeni bir Stabileo\'nun kaydettiği bir dosya "geçersiz biçim" yerine bunu söyleyen bir mesajla reddediliyor ve daha yeni bir oturum dosyası artık sekmelerini yine de açmıyor.',
          'Yük kombinasyonları durumlarını her çözümde aynı sırayla topluyor; böylece birleşik bir kesit tesiri bir derlemeden diğerine son basamağında artık değişmiyor ve modal analiz istenenden az mod döndürdüğünde bunu bildiriyor. Referans derlemindeki hiçbir sonuç değişmiyor ve uygulama yeniden kontrol uyarısı göstermiyor, ancak bir detaylandırma sınırının tam üzerindeki bir çubuk sınırın öbür tarafına düşebilir: kıl payı geçen ya da kalan detaylandırmayı yeniden kontrol edin.',
          'PRO artık geliştirme aşamasında ya da beta olarak değil, kullanılabilir olarak sunuluyor. Geliştirme aşamasında kalanlar, PRO içindeki yönetmeliğe göre tasarım (donatı, detaylandırma ve birleşimler), varsayılan olarak kapalı, ve Stabileo AI.',
          'Blog yalnızca gösterildiğinde yüklendiği için ana sayfa yaklaşık 724 KB, düzenleyici yaklaşık 215 KB daha az yüklüyor. Bu sayfada her alan filtresi artık kendi alanındaki değişiklikleri sayıyor, bu yüzden filtrelerin toplamı genel toplamı veriyor.',
          'Düzeltmeler siteye daha çabuk ulaşıyor: bir değişikliğin tüm kontrolleri artık hafta başındaki altı ila sekiz saat yerine yaklaşık 22 dakika sürüyor ve değişiklikle ilgisi olmayan nedenlerle daha seyrek başarısız oluyor.',
          'Tasarım kontrollerinde hatalı sonuçlar düzeltildi (sonuç sürümleri 16-19): EN 1999 alüminyum artık hiç kontrolü olmayan zayıf eksen kesmesini kontrol ediyor; çelik birleşimler (kesme levhası, alın levhası, ek, bayrak levhası, taban plakası) zayıf eksen momentini artık düşürmüyor ve gerekçesiyle çözümsüz bırakılıyor; betonarme elemanlar, burulmaları ACI 318\'in ihmal edilebilir saydığı eşiğin üzerindeyse ya da EN 1992\'ye göre herhangi bir burulma taşıdıkları her durumda, çünkü Stabileo burulma tasarımı yapmıyor, geçmek yerine burulma kontrol edilmedi olarak işaretleniyor (SA-2026-040); CIRSOC 201 kolonları da bir kolonun daha zayıf olduğu en küçük basınç altında kontrol ediliyor, bu da bir kullanım oranını 0,727\'den 0,832\'ye çıkardı (SA-2026-041). Bu tasarımları yeniden çalıştırın.',
          'Çözücüde hatalı sonuçlar düzeltildi (sonuç sürümleri 22-25 ve 30): 2B burkulma her çubuğun ortalama eksenel kuvvetini kullanıyordu, bu yüzden çubuk boyunca bir yük katsayıyı uyarısız olarak %43 ila %68 fazla verebiliyordu; artık kuvveti çubuk boyunca integre ediyor (SA-2026-042); 3B eş dönel analiz birkaç eksen etrafındaki büyük dönmeleri çıkarmak yerine birleştiriyor (SA-2026-037); rijit bağ, diyafram ya da bağlayıcı arkasına gizlenmiş bir 2B mekanizma çözülüp sertifikalanmak yerine reddediliyor; Y–Z veya X–Y düzleminde 2B\'ye kesilen bir 3B model her çubuğun eğildiği ekseni ve kısıtlarının anlamını koruyor (SA-2026-035, SA-2026-036) ya da 2B onu temsil edemiyorsa reddediliyor. Bu analizleri yeniden çalıştırın ve bu tür 2B modelleri yeniden kesin.',
          'Bir çubuğun belirleyici değeri ve 2B zarf, 21 noktanın en yakınını değil diyagramın gerçek tepe değerini okuyor; mutlak değerleri yalnızca büyüyebilir, bir örnekte kısa bir kısmi yük altında %1,05 (sonuç sürümü 26); zarflar taşan bir sonucu sonsuz ya da NaN değer döndürmek yerine reddediyor; dışa aktarılan kabuk şekilleri ekrandaki alanı ve ölçeği çiziyor (sonuç sürümü 21).',
          'Yalnızca motor API\'sinde, uygulama henüz kullanmıyor: lifli doğrusal olmayan analiz son yakınsayan yük adımında duruyor ve son yakınsamamış iterasyon yerine o adımın mesnet tepkilerini ve bir denge kontrolünü döndürüyor. Gece kontrolleri, modelle ölçeklenen toleranslarla daha az yanlış hatalı sonuç bildiriyor.',
          'Yeniden kontrol bildirimi her sonuç değişikliğini artık İngilizce yerine Almanca, Fransızca ve Türkçe olarak da açıklıyor.',
          'Stabileo Research: makalelerin ikinci inceleme turu düzeltmeleriyle yayımlandı, her makale yazıldığı dillerde akademik verileriyle dizinleniyor ve sayfalar telefon ve tablette çalışıyor; deney başlığın hemen ardından geliyor ve kontroller en az 44 px; her research sayfası her değişiklikte telefon ve tablet boyutlarında kontrol ediliyor.',
          'Site, sayfa olmayan bir adrese gerçek bir 404 ile yanıt veriyor, açılış sayfasının her bölümünü JavaScript ve kaydırma olmadan gösteriyor, aynı derlemeden bayt bayt aynı sayfaları üretiyor ve her gün üretim ortamına karşı Lighthouse ile ölçülüyor.',
        ],
      },
    },
  },
  {
    date: '2026-10-30',
    areas: ['engine', 'engine', 'pro', 'pro', 'basic', 'app', 'site', 'site', 'site'],
    i18n: {
      es: {
        title: 'Stabileo Research, Herramientas y la app en alemán, francés y turco',
        items: [
          'Las tensiones de las cáscaras sólidas fuera del plano X–Y ahora son correctas; la app avisa para volver a calcular los proyectos afectados.',
          'El motor se prueba con chequeos de invariancia en cada cambio y con modelos aleatorios cada noche; tres supuestos errores del motor resultaron ser modelos de prueba mal armados, y cada benchmark ahora necesita dos referencias independientes, chequeos del modelo y un estudio de convergencia.',
          'Placas como objetos físicos que se mallan al calcular, barras curvas como una sola pieza, plantillas DXF en varios niveles y zonas de uso por piso con sus sobrecargas.',
          'Las exportaciones se eligen por lo que sale (resultados, informe de cálculo, planos e IFC), y el informe de cálculo también en Word, con sus figuras.',
          'Copiar y pegar en el Básico como en el PRO, con una vista previa de dónde queda; Ctrl+S ya no desplaza la vista 3D, deshacer ya no acuesta un modelo 2D en 3D y los desplazamientos en la deformada se muestran a pedido.',
          'La app y el sitio, ahora también en alemán, francés y turco.',
          'Stabileo Research: 17 artículos publicados y benchmarks clásicos de mecánica computacional que corren en el navegador con el motor de Stabileo, cada uno con lo que se compara y cómo se verifica.',
          'Herramientas: ocho calculadoras gratuitas (vigas, voladizos, columnas de Euler y más) que resuelven con el motor real, muestran la fórmula clásica al lado y abren el modelo en Stabileo.',
          'El artículo de JAIE 2026 completo en /paper, y esta página de historial de cambios.',
        ],
      },
      en: {
        title: 'Stabileo Research, Tools, and the app in German, French and Turkish',
        items: [
          'Solid-shell stresses of shells outside the X–Y plane are now correct; the app asks you to re-run the projects affected.',
          'The engine is tested with invariance checks on every change and with random models every night; three suspected engine errors turned out to be wrong test models, and every benchmark now needs two independent references, model checks and a convergence study.',
          'Plates as physical objects meshed when you solve, curved members as single pieces, DXF templates over several levels, and use zones per floor with their live loads.',
          'Exports chosen by what comes out (results, calculation report, drawings and IFC), and the calculation report also in Word, with its figures.',
          'Copy and paste in Basic as in PRO, with a preview of where it lands; Ctrl+S no longer moves the 3D view, undo no longer lays a 2D model flat in 3D, and displacements on the deformed shape show on request.',
          'The app and the site are now also in German, French and Turkish.',
          'Stabileo Research: 17 published papers and classic computational-mechanics benchmarks that run in the browser on Stabileo\'s engine, each stating what it is compared with and how it is checked.',
          'Tools: eight free calculators (beams, cantilevers, Euler columns and more) that solve on the real engine, show the classical formula beside the result, and open the model in Stabileo.',
          'The JAIE 2026 paper in full at /paper, and this changelog.',
        ],
      },
      pt: {
        title: 'Stabileo Research, Ferramentas e o app em alemão, francês e turco',
        items: [
          'As tensões das cascas sólidas fora do plano X–Y agora estão corretas; o app avisa para recalcular os projetos afetados.',
          'O motor é testado com verificações de invariância a cada mudança e com modelos aleatórios toda noite; três supostos erros do motor eram modelos de teste errados, e cada benchmark agora precisa de duas referências independentes, verificações do modelo e um estudo de convergência.',
          'Placas como objetos físicos que recebem malha ao calcular, barras curvas como uma só peça, modelos DXF em vários níveis e zonas de uso por andar com suas sobrecargas.',
          'As exportações são escolhidas pelo que sai (resultados, relatório de cálculo, desenhos e IFC), e o relatório de cálculo também em Word, com suas figuras.',
          'Copiar e colar no Básico como no PRO, com uma prévia de onde fica; Ctrl+S não desloca mais a vista 3D, desfazer não deita mais um modelo 2D no 3D e os deslocamentos na deformada aparecem sob demanda.',
          'O app e o site agora também em alemão, francês e turco.',
          'Stabileo Research: 17 artigos publicados e benchmarks clássicos de mecânica computacional que rodam no navegador com o motor do Stabileo, cada um dizendo com o que é comparado e como é verificado.',
          'Ferramentas: oito calculadoras gratuitas (vigas, balanços, pilares de Euler e mais) que resolvem com o motor real, mostram a fórmula clássica ao lado e abrem o modelo no Stabileo.',
          'O artigo da JAIE 2026 completo em /paper, e este histórico de mudanças.',
        ],
      },
      de: {
        title: 'Stabileo Research, Werkzeuge und die App auf Deutsch, Französisch und Türkisch',
        items: [
          'Die Spannungen von Volumenschalen außerhalb der X–Y-Ebene sind jetzt korrekt; die App weist darauf hin, die betroffenen Projekte neu zu berechnen.',
          'Der Rechenkern wird bei jeder Änderung mit Invarianzprüfungen und jede Nacht mit Zufallsmodellen getestet; drei vermutete Fehler des Rechenkerns waren falsche Testmodelle, und jeder Benchmark braucht jetzt zwei unabhängige Referenzen, Modellprüfungen und eine Konvergenzstudie.',
          'Platten als physische Objekte, die beim Rechnen vernetzt werden, gekrümmte Stäbe als ein Stück, DXF-Vorlagen über mehrere Ebenen und Nutzungszonen je Geschoss mit ihren Nutzlasten.',
          'Exporte werden danach gewählt, was herauskommt (Ergebnisse, statische Berechnung, Pläne und IFC), und die statische Berechnung gibt es auch in Word, mit ihren Abbildungen.',
          'Kopieren und Einfügen in Basis wie in PRO, mit einer Vorschau, wo das Eingefügte landet; Strg+S verschiebt die 3D-Ansicht nicht mehr, Rückgängig legt ein 2D-Modell in 3D nicht mehr flach, und die Verschiebungen an der Verformungsfigur erscheinen auf Wunsch.',
          'App und Website gibt es jetzt auch auf Deutsch, Französisch und Türkisch.',
          'Stabileo Research: 17 veröffentlichte Arbeiten und klassische Benchmarks der numerischen Mechanik, die im Browser mit dem Rechenkern von Stabileo laufen, jeweils mit der Angabe, womit sie verglichen und wie sie geprüft werden.',
          'Werkzeuge: acht kostenlose Rechner (Balken, Kragarme, Euler-Stützen und mehr), die mit dem echten Rechenkern rechnen, die klassische Formel daneben zeigen und das Modell in Stabileo öffnen.',
          'Der JAIE-2026-Artikel vollständig unter /paper, und dieser Änderungsverlauf.',
        ],
      },
      fr: {
        title: 'Stabileo Research, les Outils, et l\'application en allemand, français et turc',
        items: [
          'Les contraintes des coques volumiques hors du plan X–Y sont désormais correctes ; l\'application invite à recalculer les projets concernés.',
          'Le moteur est testé par des contrôles d\'invariance à chaque modification et par des modèles aléatoires chaque nuit ; trois erreurs supposées du moteur étaient des modèles de test erronés, et chaque benchmark exige désormais deux références indépendantes, des contrôles du modèle et une étude de convergence.',
          'Les plaques comme objets physiques maillés au calcul, les barres courbes d\'une seule pièce, des gabarits DXF sur plusieurs niveaux et des zones d\'usage par étage avec leurs charges d\'exploitation.',
          'Les exports se choisissent selon ce qui en sort (résultats, note de calcul, plans et IFC), et la note de calcul existe aussi en Word, avec ses figures.',
          'Copier-coller dans Basique comme dans PRO, avec un aperçu de l\'endroit où l\'élément arrive ; Ctrl+S ne déplace plus la vue 3D, annuler ne couche plus un modèle 2D à plat en 3D, et les déplacements sur la déformée s\'affichent à la demande.',
          'L\'application et le site existent désormais aussi en allemand, en français et en turc.',
          'Stabileo Research : 17 articles publiés et benchmarks classiques de mécanique numérique qui tournent dans le navigateur sur le moteur de Stabileo, chacun indiquant à quoi il est comparé et comment il est vérifié.',
          'Outils : huit calculateurs gratuits (poutres, consoles, poteaux d\'Euler et plus) qui calculent avec le vrai moteur, affichent la formule classique à côté du résultat et ouvrent le modèle dans Stabileo.',
          'L\'article JAIE 2026 en entier sur /paper, et cet historique des modifications.',
        ],
      },
      tr: {
        title: 'Stabileo Research, Araçlar ve Almanca, Fransızca ve Türkçe uygulama',
        items: [
          'X–Y düzlemi dışındaki kabukların katı kabuk (solid-shell) gerilmeleri artık doğru; uygulama etkilenen projelerin yeniden hesaplanması için uyarıyor.',
          'Motor her değişiklikte değişmezlik kontrolleriyle ve her gece rastgele modellerle test ediliyor; motor hatası sanılan üç durum hatalı test modelleriydi ve her karşılaştırma testi artık iki bağımsız referans, model kontrolleri ve bir yakınsama çalışması gerektiriyor.',
          'Hesap sırasında ağ örülen fiziksel nesneler olarak plaklar, tek parça eğri çubuklar, birden çok kat üzerinde DXF şablonları ve hareketli yükleriyle birlikte kat başına kullanım bölgeleri.',
          'Dışa aktarmalar çıkan şeye göre seçiliyor (sonuçlar, hesap raporu, çizimler ve IFC); hesap raporu şekilleriyle birlikte Word olarak da alınabiliyor.',
          'Temel\'de PRO\'daki gibi kopyalayıp yapıştırma, nereye yerleşeceğini gösteren bir önizlemeyle; Ctrl+S artık 3B görünümü kaydırmıyor, geri alma 2B modeli 3B\'de yere yatırmıyor ve şekil değiştirmiş durumdaki yer değiştirmeler istendiğinde gösteriliyor.',
          'Uygulama ve site artık Almanca, Fransızca ve Türkçe olarak da kullanılabiliyor.',
          'Stabileo Research: tarayıcıda Stabileo\'nun motoruyla çalışan 17 yayımlanmış makale ve klasik hesaplamalı mekanik karşılaştırma testi; her biri neyle karşılaştırıldığını ve nasıl doğrulandığını belirtiyor.',
          'Araçlar: gerçek motorla çözen, klasik formülü sonucun yanında gösteren ve modeli Stabileo\'da açan sekiz ücretsiz hesaplayıcı (kirişler, konsollar, Euler kolonları ve daha fazlası).',
          'JAIE 2026 makalesinin tamamı /paper adresinde, ve bu değişiklik geçmişi.',
        ],
      },
    },
  },
  {
    date: '2026-10-23',
    areas: ['engine', 'engine', 'app', 'site', 'site'],
    i18n: {
      es: {
        title: 'Verificaciones en el motor y versiones 0.2.0 y 0.3.0',
        items: [
          'Las verificaciones de hormigón armado (CIRSOC 201) y de acero (CIRSOC 301) pasaron a calcularse dentro del motor, con baterías de validación contra modelos de referencia publicados.',
          'Para los resultados que lo admiten, el motor calcula una cota de error con aritmética de intervalos.',
          'Se publicaron las versiones 0.2.0 y 0.3.0, con notas en español, inglés y portugués. Cuando un cambio afecta resultados, la app avisa para volver a calcular los proyectos guardados.',
          'La landing suma una sección sobre verificación y ahora carga 152 KB en lugar de 6,4 MB.',
          'Dos notas nuevas en el blog, un índice rediseñado y una página que detalla qué verifica Stabileo de cada reglamento CIRSOC.',
        ],
      },
      en: {
        title: 'Design checks in the engine, and versions 0.2.0 and 0.3.0',
        items: [
          'Reinforced concrete (CIRSOC 201) and steel (CIRSOC 301) design-code checks now run inside the engine, with validation suites against published reference models.',
          'For the results that allow it, the engine computes an error bound with interval arithmetic.',
          'Versions 0.2.0 and 0.3.0 were released, with notes in Spanish, English and Portuguese. When a change affects results, the app asks you to re-run your saved projects.',
          'The landing page adds a section on verification and now loads 152 KB instead of 6.4 MB.',
          'Two new blog posts, a redesigned index, and a page listing what Stabileo checks from each CIRSOC code.',
        ],
      },
      pt: {
        title: 'Verificações no motor e versões 0.2.0 e 0.3.0',
        items: [
          'As verificações de concreto armado (CIRSOC 201) e de aço (CIRSOC 301) passaram a ser calculadas dentro do motor, com baterias de validação contra modelos de referência publicados.',
          'Para os resultados que permitem, o motor calcula um limite de erro com aritmética de intervalos.',
          'Foram publicadas as versões 0.2.0 e 0.3.0, com notas em espanhol, inglês e português. Quando uma mudança afeta resultados, o app avisa para recalcular os projetos salvos.',
          'A landing ganhou uma seção sobre verificação e agora carrega 152 KB em vez de 6,4 MB.',
          'Dois artigos novos no blog, um índice redesenhado e uma página que detalha o que o Stabileo verifica de cada norma CIRSOC.',
        ],
      },
      de: {
        title: 'Nachweise im Rechenkern und die Versionen 0.2.0 und 0.3.0',
        items: [
          'Die Nachweise für Stahlbeton (CIRSOC 201) und Stahl (CIRSOC 301) laufen jetzt im Rechenkern, mit Validierungsreihen an veröffentlichten Referenzmodellen.',
          'Für die Ergebnisse, die es zulassen, berechnet der Rechenkern mit Intervallarithmetik eine Fehlerschranke.',
          'Die Versionen 0.2.0 und 0.3.0 sind erschienen, mit Versionshinweisen auf Spanisch, Englisch und Portugiesisch. Betrifft eine Änderung Ergebnisse, weist die App darauf hin, gespeicherte Projekte neu zu berechnen.',
          'Die Startseite erhält einen Abschnitt zur Verifikation und lädt jetzt 152 KB statt 6,4 MB.',
          'Zwei neue Blogbeiträge, ein überarbeitetes Verzeichnis und eine Seite, die zeigt, was Stabileo aus jeder CIRSOC-Norm nachweist.',
        ],
      },
      fr: {
        title: 'Les vérifications dans le moteur, et les versions 0.2.0 et 0.3.0',
        items: [
          'Les vérifications du béton armé (CIRSOC 201) et de l\'acier (CIRSOC 301) sont désormais calculées dans le moteur, avec des séries de validation sur des modèles de référence publiés.',
          'Pour les résultats qui s\'y prêtent, le moteur calcule une borne d\'erreur par arithmétique d\'intervalles.',
          'Les versions 0.2.0 et 0.3.0 sont sorties, avec des notes en espagnol, en anglais et en portugais. Quand une modification touche les résultats, l\'application invite à recalculer les projets enregistrés.',
          'La page d\'accueil gagne une section sur la vérification et ne charge plus que 152 Ko au lieu de 6,4 Mo.',
          'Deux nouveaux articles de blog, un sommaire repensé et une page qui détaille ce que Stabileo vérifie de chaque règlement CIRSOC.',
        ],
      },
      tr: {
        title: 'Motorda kontroller ve 0.2.0 ile 0.3.0 sürümleri',
        items: [
          'Betonarme (CIRSOC 201) ve çelik (CIRSOC 301) kontrolleri artık motorun içinde hesaplanıyor; yayımlanmış referans modellere karşı doğrulama setleri de var.',
          'İzin veren sonuçlar için motor, aralık aritmetiğiyle bir hata sınırı hesaplıyor.',
          '0.2.0 ve 0.3.0 sürümleri İspanyolca, İngilizce ve Portekizce notlarla yayımlandı. Bir değişiklik sonuçları etkilediğinde uygulama, kayıtlı projelerin yeniden hesaplanması için uyarıyor.',
          'Açılış sayfasına doğrulama üzerine bir bölüm eklendi ve sayfa artık 6,4 MB yerine 152 KB yükleniyor.',
          'Blogda iki yeni yazı, yeniden tasarlanmış bir dizin ve Stabileo\'nun her CIRSOC yönetmeliğinden neyi kontrol ettiğini ayrıntılı anlatan bir sayfa.',
        ],
      },
    },
  },
  {
    date: '2026-10-16',
    areas: ['basic', 'basic', 'basic', 'pro', 'pro', 'pro'],
    shot: {
      base: 'changelog-basic-report',
      w: 1600,
      h: 1000,
      alt: {
        es: 'El diálogo del informe de cálculo del modo Básico, con la lista de contenidos para elegir qué incluir',
        en: 'The Basic mode calculation report dialog, with the list of contents to choose what to include',
        pt: 'O diálogo do relatório de cálculo do modo Básico, com a lista de conteúdos para escolher o que incluir',
        de: 'Der Dialog der statischen Berechnung im Basis-Modus, mit der Inhaltsliste, in der man auswählt, was aufgenommen wird',
        fr: 'La boîte de dialogue de la note de calcul du mode Basique, avec la liste des contenus où l\'on choisit ce qu\'elle inclut',
        tr: 'Temel modundaki hesap raporu iletişim kutusu; neyin dahil edileceğini seçmek için içerik listesiyle',
      },
    },
    i18n: {
      es: {
        title: 'Informe a medida en el Básico y cargas dinámicas en el PRO',
        items: [
          'Zoom de kilómetros a milímetros, selección de barras superpuestas, ocultar partes del modelo y etiquetas más legibles.',
          'El informe de cálculo en PDF se arma eligiendo qué incluir, entre otras cosas el análisis cinemático y el despiece equilibrado, y las figuras se exportan listas para imprimir.',
          'Un video que muestra la estructura construyéndose piso por piso.',
          'Casos de carga compuestos y de referencia, cargas nocionales y combinaciones por SRSS y ABS.',
          'Cargas dinámicas y móviles: espectros de respuesta propios del proyecto y vehículos de catálogo.',
          'Unidades en todo el PRO y exportaciones a Excel, CSV, informe PDF, DXF e imágenes, cada una con un diálogo que muestra qué sale.',
        ],
      },
      en: {
        title: 'A report you put together in Basic, and dynamic loads in PRO',
        items: [
          'Zoom from kilometers down to millimeters, picking members that overlap, hiding parts of the model, and easier-to-read labels.',
          'You build the PDF calculation report by choosing what goes in, including the kinematic analysis and the balanced free-body diagrams, and figures export ready to print.',
          'A video of the structure going up floor by floor.',
          'Composite and reference load cases, notional loads, and SRSS and ABS combinations.',
          'Dynamic and moving loads: project-specific response spectra and catalog vehicles.',
          'Units across PRO, and exports to Excel, CSV, PDF report, DXF and images, each with a dialog that shows what comes out.',
        ],
      },
      pt: {
        title: 'Relatório sob medida no Básico e cargas dinâmicas no PRO',
        items: [
          'Zoom de quilômetros a milímetros, seleção de barras sobrepostas, ocultar partes do modelo e rótulos mais legíveis.',
          'O relatório de cálculo em PDF é montado escolhendo o que incluir, entre outras coisas a análise cinemática e os diagramas de corpo livre em equilíbrio, e as figuras saem prontas para imprimir.',
          'Um vídeo que mostra a estrutura sendo construída andar por andar.',
          'Casos de carga compostos e de referência, cargas nocionais e combinações por SRSS e ABS.',
          'Cargas dinâmicas e móveis: espectros de resposta próprios do projeto e veículos de catálogo.',
          'Unidades em todo o PRO e exportações para Excel, CSV, relatório PDF, DXF e imagens, cada uma com um diálogo que mostra o que sai.',
        ],
      },
      de: {
        title: 'Eine statische Berechnung nach Maß in Basis und dynamische Lasten in PRO',
        items: [
          'Zoom von Kilometern bis zu Millimetern, Auswahl überlappender Stäbe, Ausblenden von Modellteilen und besser lesbare Beschriftungen.',
          'Die statische Berechnung als PDF wird zusammengestellt, indem man auswählt, was hineinkommt, unter anderem die kinematische Analyse und die Freikörperbilder im Gleichgewicht, und die Abbildungen werden druckfertig exportiert.',
          'Ein Video, das zeigt, wie das Tragwerk Geschoss für Geschoss entsteht.',
          'Zusammengesetzte Lastfälle und Referenzlastfälle, Ersatzlasten und Kombinationen nach SRSS und ABS.',
          'Dynamische und bewegliche Lasten: projekteigene Antwortspektren und Fahrzeuge aus dem Katalog.',
          'Einheiten im gesamten PRO und Exporte nach Excel, CSV, PDF-Bericht, DXF und als Bilder, jeweils mit einem Dialog, der zeigt, was ausgegeben wird.',
        ],
      },
      fr: {
        title: 'Une note de calcul sur mesure dans Basique, et des charges dynamiques dans PRO',
        items: [
          'Zoom du kilomètre au millimètre, sélection de barres superposées, masquage de parties du modèle et étiquettes plus lisibles.',
          'La note de calcul en PDF se compose en choisissant ce qu\'elle contient, entre autres l\'analyse cinématique et les corps libres en équilibre, et les figures s\'exportent prêtes à imprimer.',
          'Une vidéo qui montre la structure s\'élever étage par étage.',
          'Cas de charge composés et de référence, charges notionnelles et combinaisons SRSS et ABS.',
          'Charges dynamiques et mobiles : spectres de réponse propres au projet et véhicules de catalogue.',
          'Unités dans tout PRO et exports vers Excel, CSV, note de calcul PDF, DXF et images, chacun avec une boîte de dialogue qui montre ce qui sera produit.',
        ],
      },
      tr: {
        title: 'Temel\'de isteğe göre hazırlanan rapor ve PRO\'da dinamik yükler',
        items: [
          'Kilometreden milimetreye yakınlaştırma, üst üste binen çubukların seçimi, modelin bölümlerini gizleme ve daha okunaklı etiketler.',
          'PDF hesap raporu, içine ne gireceği seçilerek hazırlanıyor; bunlar arasında kinematik analiz ve dengedeki serbest cisim diyagramları da var. Şekiller yazdırmaya hazır olarak dışa aktarılıyor.',
          'Yapının kat kat yükselişini gösteren bir video.',
          'Bileşik ve referans yük durumları, fiktif yükler ve SRSS ile ABS kombinasyonları.',
          'Dinamik ve hareketli yükler: projeye özgü tepki spektrumları ve katalogdan araçlar.',
          'PRO\'nun tamamında birimler ve Excel, CSV, PDF rapor, DXF ve görüntü olarak dışa aktarma; her biri neyin çıkacağını gösteren bir iletişim kutusuyla.',
        ],
      },
    },
  },
  {
    date: '2026-10-09',
    areas: ['pro', 'pro', 'pro', 'pro'],
    i18n: {
      es: {
        title: 'Cargas según reglamento en el PRO',
        items: [
          'El generador de cargas según reglamento cubre techos, acumulación de nieve y cargas alternadas, y calcula el factor de ráfaga del viento según el CIRSOC 102.',
          'Las cargas sobre barras, nodos y placas se escriben a mano con su dirección, su variación y la zona que cubren.',
          'Unidades de visualización, barras de sección variable y mejoras al editor de secciones.',
          'El diseño de hormigón armado de un edificio entero tarda menos de la mitad que antes.',
        ],
      },
      en: {
        title: 'Code-based loads in PRO',
        items: [
          'The code load generator covers roofs, snow drifts and pattern loading, and computes the wind gust factor per CIRSOC 102.',
          'Loads on members, nodes and plates can be typed in with their direction, their variation and the area they cover.',
          'Display units, tapered members and improvements to the section editor.',
          'Reinforced concrete design of a whole building takes less than half the time it used to.',
        ],
      },
      pt: {
        title: 'Cargas conforme a norma no PRO',
        items: [
          'O gerador de cargas conforme a norma cobre telhados, acúmulo de neve e cargas alternadas, e calcula o fator de rajada do vento segundo a CIRSOC 102.',
          'As cargas em barras, nós e placas podem ser digitadas com sua direção, sua variação e a região que cobrem.',
          'Unidades de visualização, barras de seção variável e melhorias no editor de seções.',
          'O dimensionamento de concreto armado de um edifício inteiro leva menos da metade do tempo de antes.',
        ],
      },
      de: {
        title: 'Lasten nach Norm in PRO',
        items: [
          'Der Lastgenerator nach Norm deckt Dächer, Schneeverwehungen und feldweise Lastanordnung ab und berechnet den Böenfaktor des Winds nach CIRSOC 102.',
          'Lasten auf Stäben, Knoten und Platten lassen sich mit Richtung, Verlauf und belasteter Fläche von Hand eingeben.',
          'Anzeigeeinheiten, gevoutete Stäbe und Verbesserungen am Querschnittseditor.',
          'Die Stahlbetonbemessung eines ganzen Gebäudes dauert weniger als halb so lange wie zuvor.',
        ],
      },
      fr: {
        title: 'Charges réglementaires dans PRO',
        items: [
          'Le générateur de charges réglementaires couvre les toitures, les accumulations de neige et les charges en damier, et calcule le facteur de rafale du vent selon le CIRSOC 102.',
          'Les charges sur les barres, les nœuds et les plaques se saisissent à la main avec leur direction, leur variation et la zone qu\'elles couvrent.',
          'Unités d\'affichage, barres à inertie variable et améliorations de l\'éditeur de sections.',
          'Le dimensionnement en béton armé d\'un bâtiment entier prend moins de la moitié du temps qu\'auparavant.',
        ],
      },
      tr: {
        title: 'PRO\'da yönetmeliğe göre yükler',
        items: [
          'Yönetmeliğe göre yük oluşturucu çatıları, kar birikmesini ve dama tahtası yüklemesini kapsıyor ve rüzgârın hamle faktörünü CIRSOC 102\'ye göre hesaplıyor.',
          'Çubuklara, düğümlere ve plaklara gelen yükler doğrultuları, değişimleri ve kapladıkları alanla elle girilebiliyor.',
          'Görüntüleme birimleri, değişken kesitli çubuklar ve kesit düzenleyicide iyileştirmeler.',
          'Bütün bir binanın betonarme boyutlandırması eskisinin yarısından daha kısa sürüyor.',
        ],
      },
    },
  },
  {
    date: '2026-10-02',
    areas: ['basic', 'basic', 'basic', 'pro', 'pro', 'pro', 'pro', 'pro', 'engine'],
    shot: {
      base: 'pro-building-model',
      w: 1600,
      h: 1192,
      alt: {
        es: 'Un edificio de varios pisos modelado en el modo PRO, con grillas y niveles',
        en: 'A multi-story building modeled in PRO mode, with grids and levels',
        pt: 'Um edifício de vários andares modelado no modo PRO, com eixos e níveis',
        de: 'Ein mehrgeschossiges Gebäude, im PRO-Modus mit Raster und Geschossen modelliert',
        fr: 'Un bâtiment de plusieurs étages modélisé dans le mode PRO, avec grilles et niveaux',
        tr: 'PRO modunda aks ızgaraları ve katlarla modellenmiş çok katlı bir bina',
      },
    },
    i18n: {
      es: {
        title: 'Del ejercicio al proyecto real en el PRO',
        items: [
          'Las barras se dibujan punto a punto, con referencias a nodos, puntos medios y cruces, y la app pregunta si conectar lo que se cruza.',
          'Un paso a paso explicado que cubre quince métodos de cálculo.',
          'El análisis dinámico dibuja los modos de vibración.',
          'Grillas y niveles, generadores de estructuras que se insertan en el modelo, y copiar y pegar.',
          'Cargas de piso por área tributaria, mallado de placas, apoyos elásticos y fundaciones.',
          'Tablas de resultados, límites de flecha, contornos en placas, un libro Excel del proyecto e informe.',
          'Un editor para dibujar secciones compuestas y la búsqueda del perfil más liviano que verifica.',
          'Siete estructuras de referencia publicadas, modeladas para contrastar los resultados, y una galería de 24 ejemplos.',
          'Un resolvedor que acelera mucho los modelos grandes y una corrección de los elementos de placa.',
        ],
      },
      en: {
        title: 'From exercises to real projects in PRO',
        items: [
          'Members are drawn point to point, snapping to nodes, midpoints and crossings, and the app asks whether to connect what crosses.',
          'Explained step-by-step solutions covering fifteen analysis methods.',
          'Dynamic analysis draws the mode shapes.',
          'Grids and levels, structure generators that insert into the model, and copy and paste.',
          'Floor loads by tributary area, plate meshing, elastic supports and foundations.',
          'Result tables, deflection limits, plate contours, a project Excel workbook and a report.',
          'An editor to draw built-up sections, and a search for the lightest section that passes.',
          'Seven published reference structures, modeled to check the results against, and a gallery of 24 examples.',
          'A solver that makes large models much faster, and a fix to the plate elements.',
        ],
      },
      pt: {
        title: 'Do exercício ao projeto real no PRO',
        items: [
          'As barras são desenhadas ponto a ponto, com referências a nós, pontos médios e cruzamentos, e o app pergunta se deve conectar o que se cruza.',
          'Um passo a passo explicado que cobre quinze métodos de cálculo.',
          'A análise dinâmica desenha os modos de vibração.',
          'Eixos e níveis, geradores de estruturas que se inserem no modelo, e copiar e colar.',
          'Cargas de piso por área de influência, malha de placas, apoios elásticos e fundações.',
          'Tabelas de resultados, limites de flecha, contornos em placas, uma pasta Excel do projeto e relatório.',
          'Um editor para desenhar seções compostas e a busca do perfil mais leve que verifica.',
          'Sete estruturas de referência publicadas, modeladas para comparar os resultados, e uma galeria de 24 exemplos.',
          'Um solucionador que acelera muito os modelos grandes e uma correção dos elementos de placa.',
        ],
      },
      de: {
        title: 'Von der Übung zum echten Projekt in PRO',
        items: [
          'Stäbe werden von Punkt zu Punkt gezeichnet, mit Fang an Knoten, Mittelpunkten und Schnittpunkten, und die App fragt, ob sich Kreuzendes verbinden soll.',
          'Erklärte Schritt-für-Schritt-Lösungen für fünfzehn Berechnungsverfahren.',
          'Die dynamische Analyse zeichnet die Eigenformen.',
          'Raster und Geschosse, Tragwerksgeneratoren, die in das Modell einfügen, sowie Kopieren und Einfügen.',
          'Deckenlasten über Einzugsflächen, Vernetzung von Platten, elastische Auflager und Gründungen.',
          'Ergebnistabellen, Durchbiegungsgrenzen, Isoliniendarstellungen auf Platten, eine Excel-Arbeitsmappe des Projekts und ein Bericht.',
          'Ein Editor zum Zeichnen zusammengesetzter Querschnitte und die Suche nach dem leichtesten Profil, das den Nachweis erfüllt.',
          'Sieben veröffentlichte Referenztragwerke, modelliert, um die Ergebnisse daran zu prüfen, und eine Galerie mit 24 Beispielen.',
          'Ein Gleichungslöser, der große Modelle deutlich beschleunigt, und eine Korrektur der Plattenelemente.',
        ],
      },
      fr: {
        title: 'De l\'exercice au vrai projet dans PRO',
        items: [
          'Les barres se dessinent de point à point, avec accrochage aux nœuds, aux milieux et aux intersections, et l\'application demande s\'il faut relier ce qui se croise.',
          'Des solutions pas à pas commentées couvrant quinze méthodes de calcul.',
          'L\'analyse dynamique dessine les modes propres.',
          'Grilles et niveaux, générateurs de structures qui s\'insèrent dans le modèle, et copier-coller.',
          'Charges de plancher par aire d\'influence, maillage des plaques, appuis élastiques et fondations.',
          'Tableaux de résultats, limites de flèche, isovaleurs sur les plaques, un classeur Excel du projet et une note de calcul.',
          'Un éditeur pour dessiner des sections composées, et la recherche du profilé le plus léger qui est conforme.',
          'Sept structures de référence publiées, modélisées pour confronter les résultats, et une galerie de 24 exemples.',
          'Un solveur qui accélère nettement les grands modèles, et une correction des éléments de plaque.',
        ],
      },
      tr: {
        title: 'PRO\'da alıştırmadan gerçek projeye',
        items: [
          'Çubuklar noktadan noktaya çiziliyor; düğümlere, orta noktalara ve kesişimlere yakalama var ve uygulama kesişen elemanların birleştirilip birleştirilmeyeceğini soruyor.',
          'On beş hesap yöntemini kapsayan açıklamalı adım adım çözümler.',
          'Dinamik analiz mod şekillerini çiziyor.',
          'Aks ızgaraları ve katlar, modele eklenen yapı oluşturucular ve kopyala yapıştır.',
          'Etki alanına göre döşeme yükleri, plaklarda ağ oluşturma, elastik mesnetler ve temeller.',
          'Sonuç tabloları, sehim sınırları, plaklarda kontur çizimleri, projenin Excel çalışma kitabı ve bir rapor.',
          'Yapma kesitleri çizmek için bir düzenleyici ve kontrolleri sağlayan en hafif profilin aranması.',
          'Sonuçları karşılaştırmak için modellenmiş, yayımlanmış yedi referans yapı ve 24 örneklik bir galeri.',
          'Büyük modelleri belirgin biçimde hızlandıran bir çözücü ve plak elemanlarında bir düzeltme.',
        ],
      },
    },
  },
  {
    date: '2026-09-25',
    areas: ['site', 'site', 'basic', 'basic', 'basic', 'edu', 'pro', 'pro', 'engine'],
    shot: {
      base: 'pro-rebar-3d',
      w: 1600,
      h: 834,
      alt: {
        es: 'Las armaduras diseñadas de una estructura de hormigón armado, vistas en 3D en el modo PRO',
        en: 'The designed reinforcement of a reinforced concrete structure, shown in 3D in PRO mode',
        pt: 'As armaduras dimensionadas de uma estrutura de concreto armado, vistas em 3D no modo PRO',
        de: 'Die bemessene Bewehrung eines Stahlbetontragwerks, im PRO-Modus in 3D dargestellt',
        fr: 'Les armatures dimensionnées d\'une structure en béton armé, vues en 3D dans le mode PRO',
        tr: 'Betonarme bir yapının boyutlandırılmış donatıları, PRO modunda 3B olarak',
      },
    },
    i18n: {
      es: {
        title: 'Diseño de hormigón armado en el PRO',
        items: [
          'Una landing más corta, con la propuesta de precios y un panel de contacto que también aparece dentro de la app.',
          'Una nota nueva en el blog sobre cuándo modelar con barras y cuándo con elementos finitos, y una guía de usuario.',
          'La calculadora de hormigón armado según el CIRSOC Flex ahora propone las barras, y quedó contrastada con la planilla original.',
          'Paso a paso por los métodos de rigidez y de flexibilidades, en 2D y 3D.',
          'Cargas de temperatura en todos los análisis.',
          'El modo Educativo pasó a ser un panel dentro del Básico.',
          'Diseño de hormigón armado y una interfaz del PRO reorganizada.',
          'Control de equilibrio del modelo y análisis dinámicos: modal, espectral e historia en el tiempo.',
          'Un modelo mal armado se rechaza con un mensaje en lugar de devolver ceros.',
        ],
      },
      en: {
        title: 'Reinforced concrete design in PRO',
        items: [
          'A shorter landing page, with the pricing proposal and a contact panel that also shows inside the app.',
          'A new blog post on when to model with members and when with finite elements, and a user guide.',
          'The CIRSOC Flex reinforced concrete calculator now proposes the bars, and was checked against the original spreadsheet.',
          'Step-by-step solutions by the stiffness and flexibility methods, in 2D and 3D.',
          'Temperature loads in every analysis.',
          'Education mode became a panel inside Basic.',
          'Reinforced concrete design, and a reorganized PRO interface.',
          'A model equilibrium check, and dynamic analyses: modal, response spectrum and time history.',
          'A badly built model is now rejected with a message instead of returning zeros.',
        ],
      },
      pt: {
        title: 'Dimensionamento de concreto armado no PRO',
        items: [
          'Uma landing mais curta, com a proposta de preços e um painel de contato que também aparece dentro do app.',
          'Um artigo novo no blog sobre quando modelar com barras e quando com elementos finitos, e um guia do usuário.',
          'A calculadora de concreto armado segundo o CIRSOC Flex agora propõe as barras e foi comparada com a planilha original.',
          'Passo a passo pelos métodos da rigidez e das flexibilidades, em 2D e 3D.',
          'Cargas de temperatura em todas as análises.',
          'O modo Educativo virou um painel dentro do Básico.',
          'Dimensionamento de concreto armado e uma interface do PRO reorganizada.',
          'Verificação de equilíbrio do modelo e análises dinâmicas: modal, espectral e histórico no tempo.',
          'Um modelo mal montado agora é rejeitado com uma mensagem em vez de devolver zeros.',
        ],
      },
      de: {
        title: 'Stahlbetonbemessung in PRO',
        items: [
          'Eine kürzere Startseite mit dem Preisvorschlag und einem Kontaktbereich, der auch in der App erscheint.',
          'Ein neuer Blogbeitrag dazu, wann man mit Stäben und wann mit finiten Elementen modelliert, und ein Benutzerhandbuch.',
          'Der Stahlbetonrechner nach CIRSOC Flex schlägt jetzt die Bewehrungsstäbe vor und wurde mit der ursprünglichen Tabellenkalkulation abgeglichen.',
          'Schritt-für-Schritt-Lösungen nach dem Weggrößen- und dem Kraftgrößenverfahren, in 2D und 3D.',
          'Temperaturlasten in allen Berechnungen.',
          'Der Lehrmodus wurde zu einem Bereich innerhalb von Basis.',
          'Stahlbetonbemessung und eine neu geordnete PRO-Oberfläche.',
          'Eine Gleichgewichtskontrolle des Modells und dynamische Analysen: modal, mit Antwortspektrum und im Zeitverlauf.',
          'Ein fehlerhaft aufgebautes Modell wird jetzt mit einer Meldung abgewiesen, statt Nullen zu liefern.',
        ],
      },
      fr: {
        title: 'Le dimensionnement du béton armé dans PRO',
        items: [
          'Une page d\'accueil plus courte, avec la proposition tarifaire et un panneau de contact qui apparaît aussi dans l\'application.',
          'Un nouvel article de blog sur le moment de modéliser avec des barres ou avec des éléments finis, et un guide d\'utilisation.',
          'La calculatrice de béton armé selon CIRSOC Flex propose désormais les barres, et a été confrontée au tableur d\'origine.',
          'Des solutions pas à pas par la méthode des déplacements et par la méthode des forces, en 2D et en 3D.',
          'Charges thermiques dans tous les calculs.',
          'Le mode Enseignement est devenu un panneau à l\'intérieur de Basique.',
          'Le dimensionnement du béton armé et une interface PRO réorganisée.',
          'Un contrôle de l\'équilibre du modèle et des analyses dynamiques : modale, spectrale et temporelle.',
          'Un modèle mal construit est désormais refusé avec un message au lieu de renvoyer des zéros.',
        ],
      },
      tr: {
        title: 'PRO\'da betonarme boyutlandırma',
        items: [
          'Fiyat önerisini ve uygulamanın içinde de görünen bir iletişim panelini içeren daha kısa bir açılış sayfası.',
          'Blogda ne zaman çubuklarla, ne zaman sonlu elemanlarla modellemek gerektiğine dair yeni bir yazı ve bir kullanım kılavuzu.',
          'CIRSOC Flex\'e göre betonarme hesap aracı artık donatı çubuklarını öneriyor ve özgün hesap tablosuyla karşılaştırıldı.',
          'Rijitlik ve esneklik yöntemleriyle adım adım çözümler, 2B ve 3B\'de.',
          'Tüm analizlerde sıcaklık yükleri.',
          'Eğitim modu, Temel\'in içinde bir panel oldu.',
          'Betonarme boyutlandırma ve yeniden düzenlenmiş bir PRO arayüzü.',
          'Model denge kontrolü ve dinamik analizler: modal, tepki spektrumu ve zaman tanım alanında.',
          'Hatalı kurulmuş bir model artık sıfır döndürmek yerine bir iletiyle reddediliyor.',
        ],
      },
    },
  },
  {
    date: '2026-09-11',
    areas: ['app', 'basic', 'basic', 'pro'],
    shot: {
      base: 'changelog-mobile',
      w: 1600,
      h: 3464,
      alt: {
        es: 'El modo Básico en un celular, con el diagrama de momentos de un pórtico',
        en: 'Basic mode on a phone, with the bending moment diagram of a frame',
        pt: 'O modo Básico em um celular, com o diagrama de momentos de um pórtico',
        de: 'Der Basis-Modus auf einem Smartphone, mit der Momentenlinie eines Rahmens',
        fr: 'Le mode Basique sur un téléphone, avec le diagramme des moments d\'un portique',
        tr: 'Telefonda Temel modu; bir çerçevenin eğilme momenti diyagramıyla',
      },
    },
    i18n: {
      es: {
        title: 'Stabileo en el celular',
        items: [
          'Una interfaz para el celular, con el mismo marco para el Básico y el PRO.',
          'Importación de modelos desde Excel, y los links compartidos vuelven a abrir el modelo completo.',
          'Dimensionado de armaduras de secciones según el CIRSOC Flex, la planilla que usan casi todos los ingenieros civiles.',
          'Estructuras metálicas: selectores de secciones y materiales, generadores, el flujo de trabajo en acero y el diseño de uniones.',
        ],
      },
      en: {
        title: 'Stabileo on your phone',
        items: [
          'A phone interface, with the same layout for Basic and PRO.',
          'Model import from Excel, and shared links open the full model again.',
          'Reinforcement design of sections per CIRSOC Flex, the spreadsheet most civil engineers in Argentina use.',
          'Steel structures: section and material pickers, generators, the steel workflow and connection design.',
        ],
      },
      pt: {
        title: 'Stabileo no celular',
        items: [
          'Uma interface para celular, com a mesma estrutura para o Básico e o PRO.',
          'Importação de modelos a partir do Excel, e os links compartilhados voltam a abrir o modelo completo.',
          'Dimensionamento de armaduras de seções segundo o CIRSOC Flex, a planilha que quase todos os engenheiros civis argentinos usam.',
          'Estruturas metálicas: seletores de seções e materiais, geradores, o fluxo de trabalho em aço e o dimensionamento de ligações.',
        ],
      },
      de: {
        title: 'Stabileo auf dem Smartphone',
        items: [
          'Eine Oberfläche für das Smartphone, mit demselben Aufbau für Basis und PRO.',
          'Import von Modellen aus Excel, und geteilte Links öffnen wieder das vollständige Modell.',
          'Bewehrungsbemessung von Querschnitten nach CIRSOC Flex, der Tabellenkalkulation, die die meisten Bauingenieure in Argentinien verwenden.',
          'Stahltragwerke: Auswahl von Querschnitten und Werkstoffen, Generatoren, der Arbeitsablauf im Stahlbau und die Bemessung von Anschlüssen.',
        ],
      },
      fr: {
        title: 'Stabileo sur votre téléphone',
        items: [
          'Une interface pour téléphone, avec la même disposition pour Basique et PRO.',
          'Import de modèles depuis Excel, et les liens partagés rouvrent le modèle complet.',
          'Dimensionnement des armatures de sections selon CIRSOC Flex, le tableur qu\'utilisent la plupart des ingénieurs civils en Argentine.',
          'Structures métalliques : sélection des sections et des matériaux, générateurs, le flux de travail acier et le dimensionnement des assemblages.',
        ],
      },
      tr: {
        title: 'Stabileo telefonunuzda',
        items: [
          'Temel ve PRO için aynı düzene sahip bir telefon arayüzü.',
          'Excel\'den model içe aktarma; paylaşılan bağlantılar da yeniden tam modeli açıyor.',
          'Arjantin\'deki inşaat mühendislerinin çoğunun kullandığı hesap tablosu CIRSOC Flex\'e göre kesitlerin donatı boyutlandırması.',
          'Çelik yapılar: kesit ve malzeme seçicileri, oluşturucular, çelik iş akışı ve birleşim boyutlandırması.',
        ],
      },
    },
  },
  {
    date: '2026-08-28',
    areas: ['pro', 'site', 'basic', 'engine'],
    shot: {
      base: '3d-industrial',
      w: 1600,
      h: 876,
      alt: {
        es: 'Una nave industrial metálica generada con parámetros editables',
        en: 'A steel industrial shed built from editable parameters',
        pt: 'Um galpão industrial metálico gerado com parâmetros editáveis',
        de: 'Eine Industriehalle aus Stahl, aus bearbeitbaren Parametern erzeugt',
        fr: 'Une halle industrielle métallique générée à partir de paramètres modifiables',
        tr: 'Düzenlenebilir parametrelerle oluşturulmuş çelik bir endüstriyel yapı',
      },
    },
    i18n: {
      es: {
        title: 'Estructuras metálicas y sitio en tres idiomas',
        items: [
          'Generadores de cabriadas, columnas reticuladas y naves industriales a partir de parámetros editables, con un selector de perfiles con catálogo y filtros.',
          'La landing y el blog en español, inglés y portugués. El sitio pasó a ser indexable por los buscadores, con dieciocho páginas y cuatro notas.',
          'Siete tutoriales cortos, que reemplazan al recorrido guiado.',
          'Tres errores de cálculo corregidos: el corte de un tubo circular, el corte pico y un análisis por etapas que descartaba losas y tabiques.',
        ],
      },
      en: {
        title: 'Steel structures, and the site in three languages',
        items: [
          'Generators for trusses, lattice columns and industrial sheds from editable parameters, with a section picker that has a catalog and filters.',
          'The landing page and the blog in Spanish, English and Portuguese. The site became indexable by search engines, with eighteen pages and four posts.',
          'Seven short tutorials, replacing the guided tour.',
          'Three calculation errors fixed: the shear of a circular tube, peak shear, and a staged analysis that dropped slabs and walls.',
        ],
      },
      pt: {
        title: 'Estruturas metálicas e site em três idiomas',
        items: [
          'Geradores de treliças de cobertura, pilares treliçados e galpões industriais a partir de parâmetros editáveis, com um seletor de perfis com catálogo e filtros.',
          'A landing e o blog em espanhol, inglês e português. O site passou a ser indexável pelos buscadores, com dezoito páginas e quatro artigos.',
          'Sete tutoriais curtos, que substituem o tour guiado.',
          'Três erros de cálculo corrigidos: o cortante de um tubo circular, o cortante de pico e uma análise por etapas que descartava lajes e paredes.',
        ],
      },
      de: {
        title: 'Stahltragwerke und die Website in drei Sprachen',
        items: [
          'Generatoren für Fachwerke, Gitterstützen und Industriehallen aus bearbeitbaren Parametern, mit einer Profilauswahl samt Katalog und Filtern.',
          'Die Startseite und der Blog auf Spanisch, Englisch und Portugiesisch. Die Website wurde für Suchmaschinen indexierbar, mit achtzehn Seiten und vier Beiträgen.',
          'Sieben kurze Anleitungen, die die geführte Tour ersetzen.',
          'Drei Rechenfehler behoben: die Querkraft eines Kreisrohrs, die Spitzenquerkraft und eine Berechnung in Bauphasen, die Decken und Wände wegließ.',
        ],
      },
      fr: {
        title: 'Les structures métalliques, et le site en trois langues',
        items: [
          'Générateurs de fermes, de poteaux en treillis et de halles industrielles à partir de paramètres modifiables, avec un sélecteur de profilés doté d\'un catalogue et de filtres.',
          'La page d\'accueil et le blog en espagnol, en anglais et en portugais. Le site est devenu indexable par les moteurs de recherche, avec dix-huit pages et quatre articles.',
          'Sept tutoriels courts, qui remplacent la visite guidée.',
          'Trois erreurs de calcul corrigées : l\'effort tranchant d\'un tube circulaire, l\'effort tranchant de pointe et une analyse par phases qui omettait des dalles et des voiles.',
        ],
      },
      tr: {
        title: 'Çelik yapılar ve üç dilde site',
        items: [
          'Düzenlenebilir parametrelerden kafes kirişler, kafes kolonlar ve endüstriyel yapılar için oluşturucular; katalog ve filtreler içeren bir profil seçiciyle.',
          'Açılış sayfası ve blog İspanyolca, İngilizce ve Portekizce. Site, on sekiz sayfa ve dört yazıyla arama motorlarında dizine eklenebilir hâle geldi.',
          'Rehberli turun yerini alan yedi kısa öğretici.',
          'Üç hesap hatası düzeltildi: dairesel bir borunun kesme kuvveti, tepe kesme kuvveti ve döşemeleri ve perde duvarları atlayan aşamalı bir analiz.',
        ],
      },
    },
  },
  {
    date: '2026-08-21',
    areas: ['basic', 'basic', 'basic', 'pro'],
    shot: {
      base: '2d-section-analysis',
      w: 1600,
      h: 997,
      alt: {
        es: 'El análisis de sección del modo Básico, con el estado tensional sobre el contorno real del perfil',
        en: 'Basic mode section analysis, with the stress state over the real outline of the section',
        pt: 'A análise de seção do modo Básico, com o estado de tensões sobre o contorno real do perfil',
        de: 'Die Querschnittsanalyse im Basis-Modus, mit dem Spannungszustand über dem tatsächlichen Umriss des Profils',
        fr: 'L\'analyse de section du mode Basique, avec l\'état de contrainte sur le contour réel du profilé',
        tr: 'Temel modunda kesit analizi; profilin gerçek konturu üzerindeki gerilme durumuyla',
      },
    },
    i18n: {
      es: {
        title: 'Análisis de sección y nueva interfaz del PRO',
        items: [
          'Haciendo clic en cualquier punto de la estructura se obtiene el estado tensional sobre la sección real, con tensiones principales, círculo de Mohr, núcleo central y un punto de carga que se arrastra para ver el efecto de la excentricidad.',
          'Una base de materiales y perfiles de Argentina, Europa, Estados Unidos y Brasil, con más de 700 perfiles revisados contra sus normas.',
          'Herramientas de selección y movimiento más cómodas, y mapas de tensiones con escala de colores.',
          'El PRO se rediseñó con la misma identidad visual que el Básico.',
        ],
      },
      en: {
        title: 'Section analysis, and a new PRO interface',
        items: [
          'Clicking any point of the structure gives the stress state over the actual section, with principal stresses, Mohr\'s circle, the section kern, and a load point you drag to see the effect of eccentricity.',
          'A materials and sections database for Argentina, Europe, the United States and Brazil, with more than 700 sections checked against their standards.',
          'Easier selection and move tools, and stress maps with a color scale.',
          'PRO was redesigned with the same visual identity as Basic.',
        ],
      },
      pt: {
        title: 'Análise de seção e nova interface do PRO',
        items: [
          'Clicando em qualquer ponto da estrutura se obtém o estado de tensões sobre a seção real, com tensões principais, círculo de Mohr, núcleo central e um ponto de carga que se arrasta para ver o efeito da excentricidade.',
          'Uma base de materiais e perfis da Argentina, Europa, Estados Unidos e Brasil, com mais de 700 perfis conferidos com suas normas.',
          'Ferramentas de seleção e movimento mais práticas, e mapas de tensões com escala de cores.',
          'O PRO foi redesenhado com a mesma identidade visual do Básico.',
        ],
      },
      de: {
        title: 'Querschnittsanalyse und eine neue PRO-Oberfläche',
        items: [
          'Ein Klick auf einen beliebigen Punkt des Tragwerks liefert den Spannungszustand über dem tatsächlichen Querschnitt, mit Hauptspannungen, Mohr-Spannungskreis, Querschnittskern und einem Lastpunkt, den man verschiebt, um die Wirkung der Exzentrizität zu sehen.',
          'Eine Werkstoff- und Profildatenbank für Argentinien, Europa, die Vereinigten Staaten und Brasilien, mit mehr als 700 anhand ihrer Normen geprüften Profilen.',
          'Komfortablere Werkzeuge zum Auswählen und Verschieben und Spannungsbilder mit Farbskala.',
          'PRO wurde mit derselben visuellen Identität wie Basis neu gestaltet.',
        ],
      },
      fr: {
        title: 'L\'analyse de section, et une nouvelle interface PRO',
        items: [
          'Un clic sur n\'importe quel point de la structure donne l\'état de contrainte sur la section réelle, avec les contraintes principales, le cercle de Mohr, le noyau central et un point de charge que l\'on fait glisser pour voir l\'effet de l\'excentricité.',
          'Une base de matériaux et de profilés pour l\'Argentine, l\'Europe, les États-Unis et le Brésil, avec plus de 700 profilés vérifiés par rapport à leurs normes.',
          'Des outils de sélection et de déplacement plus pratiques, et des cartes de contraintes avec une échelle de couleurs.',
          'PRO a été redessiné avec la même identité visuelle que Basique.',
        ],
      },
      tr: {
        title: 'Kesit analizi ve yeni PRO arayüzü',
        items: [
          'Yapının herhangi bir noktasına tıklamak gerçek kesit üzerindeki gerilme durumunu veriyor: asal gerilmeler, Mohr dairesi, kesit çekirdeği ve dışmerkezliğin etkisini görmek için sürüklenen bir yük noktası.',
          'Arjantin, Avrupa, ABD ve Brezilya için bir malzeme ve profil veritabanı; standartlarına göre kontrol edilmiş 700\'den fazla profille.',
          'Daha rahat seçme ve taşıma araçları ve renk ölçekli gerilme haritaları.',
          'PRO, Temel ile aynı görsel kimlikle yeniden tasarlandı.',
        ],
      },
    },
  },
  {
    date: '2026-08-14',
    areas: ['basic', 'basic', 'edu', 'pro', 'engine'],
    shot: {
      base: 'edu-exercise',
      w: 1600,
      h: 769,
      alt: {
        es: 'Un ejercicio del modo Educativo, con los diagramas que traza el alumno corregidos contra el cálculo',
        en: 'An Education mode exercise, with the diagrams the student draws graded against the analysis',
        pt: 'Um exercício do modo Educativo, com os diagramas traçados pelo aluno corrigidos contra o cálculo',
        de: 'Eine Übung im Lehrmodus, bei der die von den Studierenden gezeichneten Verläufe mit der Berechnung abgeglichen und bewertet werden',
        fr: 'Un exercice du mode Enseignement, avec les diagrammes tracés par l\'étudiant corrigés par rapport au calcul',
        tr: 'Eğitim modunda bir alıştırma; öğrencinin çizdiği diyagramlar hesaba göre değerlendiriliyor',
      },
    },
    i18n: {
      es: {
        title: 'Identidad visual nueva y modo Educativo',
        items: [
          'Toda la interfaz del Básico con la identidad visual de la landing nueva.',
          'Cada perfil se resuelve a su contorno exacto. Si no lo tiene, la app no calcula tensiones en lugar de inventar los espesores que faltan.',
          'El docente arma el ejercicio dentro de la app y el alumno lo resuelve; los diagramas que traza se corrigen contra el cálculo.',
          'Fundaciones de hormigón armado: del diseño de la armadura a un archivo de CAD, con el despiece en 3D.',
          'Correcciones en las verificaciones de diseño: valores por defecto del lado inseguro, estados límite que faltaban y datos que se ignoraban.',
        ],
      },
      en: {
        title: 'A new visual identity, and Education mode',
        items: [
          'The whole Basic interface with the visual identity of the new landing page.',
          'Every section resolves to its exact outline. When it has none, the app declines to compute stresses instead of inventing the missing thicknesses.',
          'The teacher builds the exercise inside the app and the student solves it; the diagrams the student draws are graded against the analysis.',
          'Reinforced concrete footings: from reinforcement design to a CAD file, with the bar schedule in 3D.',
          'Fixes to the design checks: unconservative defaults, missing limit states and inputs that were being ignored.',
        ],
      },
      pt: {
        title: 'Identidade visual nova e modo Educativo',
        items: [
          'Toda a interface do Básico com a identidade visual da nova landing.',
          'Cada perfil é resolvido no seu contorno exato. Se não tiver um, o app não calcula tensões em vez de inventar as espessuras que faltam.',
          'O professor monta o exercício dentro do app e o aluno o resolve; os diagramas que ele traça são corrigidos contra o cálculo.',
          'Fundações de concreto armado: do dimensionamento da armadura a um arquivo de CAD, com o detalhamento em 3D.',
          'Correções nas verificações de dimensionamento: valores padrão contra a segurança, estados limites que faltavam e dados que eram ignorados.',
        ],
      },
      de: {
        title: 'Eine neue visuelle Identität und der Lehrmodus',
        items: [
          'Die gesamte Oberfläche von Basis in der visuellen Identität der neuen Startseite.',
          'Jedes Profil wird auf seinen genauen Umriss zurückgeführt. Fehlt dieser, berechnet die App keine Spannungen, statt die fehlenden Dicken zu erfinden.',
          'Die Lehrkraft erstellt die Übung in der App und die Studierenden lösen sie; die von ihnen gezeichneten Verläufe werden mit der Berechnung abgeglichen und bewertet.',
          'Stahlbetonfundamente: von der Bewehrungsbemessung bis zu einer CAD-Datei, mit der Biegeliste in 3D.',
          'Korrekturen an den Nachweisen: Standardwerte auf der unsicheren Seite, fehlende Grenzzustände und Eingaben, die ignoriert wurden.',
        ],
      },
      fr: {
        title: 'Une nouvelle identité visuelle, et le mode Enseignement',
        items: [
          'Toute l\'interface de Basique avec l\'identité visuelle de la nouvelle page d\'accueil.',
          'Chaque profilé est ramené à son contour exact. S\'il n\'en a pas, l\'application ne calcule pas de contraintes plutôt que d\'inventer les épaisseurs manquantes.',
          'L\'enseignant construit l\'exercice dans l\'application et l\'étudiant le résout ; les diagrammes qu\'il trace sont corrigés par rapport au calcul.',
          'Semelles en béton armé : du dimensionnement des armatures jusqu\'à un fichier CAO, avec la nomenclature des armatures en 3D.',
          'Corrections des vérifications : valeurs par défaut du côté de l\'insécurité, états limites manquants et données qui étaient ignorées.',
        ],
      },
      tr: {
        title: 'Yeni bir görsel kimlik ve Eğitim modu',
        items: [
          'Temel\'in tüm arayüzü yeni açılış sayfasının görsel kimliğiyle.',
          'Her profil tam konturuna çözümleniyor. Konturu yoksa uygulama, eksik kalınlıkları uydurmak yerine gerilme hesaplamıyor.',
          'Öğretmen alıştırmayı uygulamanın içinde hazırlıyor, öğrenci çözüyor; öğrencinin çizdiği diyagramlar hesaba göre değerlendiriliyor.',
          'Betonarme temeller: donatı boyutlandırmasından bir CAD dosyasına, donatı açılımı 3B olarak.',
          'Kontrollerde düzeltmeler: güvensiz taraftaki varsayılan değerler, eksik sınır durumları ve göz ardı edilen girdiler.',
        ],
      },
    },
  },
  {
    date: '2026-08-07',
    areas: ['site', 'pro', 'engine'],
    i18n: {
      es: {
        title: 'Landing nueva y reglamentos CIRSOC 2025',
        items: [
          'La landing se rehízo: explica qué es Stabileo, qué funciona hoy y qué está en desarrollo, con secciones para el Básico, el Educativo y el PRO.',
          'Cargas y verificaciones según los reglamentos CIRSOC 2025, con la edición de cada reglamento registrada en el proyecto.',
          'Posproceso y visor 3D más rápidos en modelos grandes.',
        ],
      },
      en: {
        title: 'A new landing page, and the 2025 CIRSOC codes',
        items: [
          'The landing page was rebuilt: it explains what Stabileo is, what works today and what is in development, with sections for Basic, Education and PRO.',
          'Loads and design checks per the 2025 CIRSOC codes, with the edition of each code recorded in the project.',
          'Faster post-processing and 3D viewer on large models.',
        ],
      },
      pt: {
        title: 'Landing nova e normas CIRSOC 2025',
        items: [
          'A landing foi refeita: explica o que é o Stabileo, o que funciona hoje e o que está em desenvolvimento, com seções para o Básico, o Educativo e o PRO.',
          'Cargas e verificações segundo as normas CIRSOC 2025, com a edição de cada norma registrada no projeto.',
          'Pós-processamento e visualizador 3D mais rápidos em modelos grandes.',
        ],
      },
      de: {
        title: 'Eine neue Startseite und die CIRSOC-Normen 2025',
        items: [
          'Die Startseite wurde neu aufgebaut: Sie erklärt, was Stabileo ist, was heute funktioniert und was in Entwicklung ist, mit Abschnitten zu Basis, Lehre und PRO.',
          'Lasten und Nachweise nach den CIRSOC-Normen 2025, wobei die Ausgabe jeder Norm im Projekt festgehalten wird.',
          'Schnellere Nachbearbeitung und eine schnellere 3D-Ansicht bei großen Modellen.',
        ],
      },
      fr: {
        title: 'Une nouvelle page d\'accueil, et les règlements CIRSOC 2025',
        items: [
          'La page d\'accueil a été refaite : elle explique ce qu\'est Stabileo, ce qui fonctionne aujourd\'hui et ce qui est en développement, avec des sections pour Basique, Enseignement et PRO.',
          'Charges et vérifications selon les règlements CIRSOC 2025, avec l\'édition de chaque règlement enregistrée dans le projet.',
          'Post-traitement et vue 3D plus rapides sur les grands modèles.',
        ],
      },
      tr: {
        title: 'Yeni açılış sayfası ve CIRSOC 2025 yönetmelikleri',
        items: [
          'Açılış sayfası yeniden yapıldı: Stabileo\'nun ne olduğunu, bugün neyin çalıştığını ve neyin geliştirilmekte olduğunu Temel, Eğitim ve PRO bölümleriyle anlatıyor.',
          'CIRSOC 2025 yönetmeliklerine göre yükler ve kontroller; her yönetmeliğin baskısı projeye kaydediliyor.',
          'Büyük modellerde daha hızlı son işlem ve 3B görüntüleyici.',
        ],
      },
    },
  },
  {
    date: '2026-07-31',
    areas: ['app', 'engine', 'engine'],
    i18n: {
      es: {
        title: 'Resultados que siempre corresponden al modelo',
        items: [
          'Al editar el modelo se invalidan los resultados y las verificaciones que quedaron desactualizados, para no mostrar resultados que ya no corresponden.',
          'Cálculos más rápidos: los casos de carga reusan la factorización, las combinaciones se resuelven en lote y el cálculo corre en segundo plano.',
          'Correcciones en restricciones y apoyos inclinados.',
        ],
      },
      en: {
        title: 'Results that always match the model',
        items: [
          'Editing the model invalidates the results and design checks it made stale, so results that no longer apply are never shown.',
          'Faster analysis: load cases reuse the factorization, combinations are solved in batches and the analysis runs in the background.',
          'Fixes to constraints and inclined supports.',
        ],
      },
      pt: {
        title: 'Resultados que sempre correspondem ao modelo',
        items: [
          'Ao editar o modelo, os resultados e as verificações desatualizados são invalidados, para não mostrar resultados que já não correspondem.',
          'Cálculos mais rápidos: os casos de carga reutilizam a fatoração, as combinações são resolvidas em lote e o cálculo roda em segundo plano.',
          'Correções em vínculos e apoios inclinados.',
        ],
      },
      de: {
        title: 'Ergebnisse, die immer zum Modell passen',
        items: [
          'Wird das Modell bearbeitet, werden die dadurch veralteten Ergebnisse und Nachweise ungültig, sodass nie Ergebnisse angezeigt werden, die nicht mehr gelten.',
          'Schnellere Berechnung: Lastfälle verwenden die Faktorisierung wieder, Kombinationen werden gebündelt gelöst und die Berechnung läuft im Hintergrund.',
          'Korrekturen an Kopplungen und geneigten Auflagern.',
        ],
      },
      fr: {
        title: 'Des résultats qui correspondent toujours au modèle',
        items: [
          'Modifier le modèle invalide les résultats et les vérifications devenus obsolètes, si bien que des résultats qui ne s\'appliquent plus ne sont jamais affichés.',
          'Calcul plus rapide : les cas de charge réutilisent la factorisation, les combinaisons sont résolues par lots et le calcul s\'exécute en arrière-plan.',
          'Corrections des liaisons et des appuis inclinés.',
        ],
      },
      tr: {
        title: 'Her zaman modele karşılık gelen sonuçlar',
        items: [
          'Model düzenlendiğinde güncelliğini yitiren sonuçlar ve kontroller geçersiz sayılıyor; böylece artık geçerli olmayan sonuçlar hiçbir zaman gösterilmiyor.',
          'Daha hızlı analiz: yük durumları ayrıştırmayı yeniden kullanıyor, kombinasyonlar toplu çözülüyor ve analiz arka planda çalışıyor.',
          'Kısıtlarda ve eğik mesnetlerde düzeltmeler.',
        ],
      },
    },
  },
  {
    date: '2026-07-24',
    areas: ['pro'],
    i18n: {
      es: {
        title: 'Importador de planos DXF',
        items: [
          'El importador de planos DXF suma vista previa y diagnósticos, control de unidades, varias plantas e interpretación de vigas, con un asistente más claro.',
        ],
      },
      en: {
        title: 'DXF drawing importer',
        items: [
          'The DXF drawing importer adds a preview and diagnostics, unit control, multiple floors and beam interpretation, with a clearer wizard.',
        ],
      },
      pt: {
        title: 'Importador de plantas DXF',
        items: [
          'O importador de plantas DXF ganhou pré-visualização e diagnósticos, controle de unidades, vários pavimentos e interpretação de vigas, com um assistente mais claro.',
        ],
      },
      de: {
        title: 'Import von DXF-Plänen',
        items: [
          'Der Import von DXF-Plänen erhält eine Vorschau und Diagnosen, eine Einheitenkontrolle, mehrere Geschosse und die Erkennung von Balken, mit einem übersichtlicheren Assistenten.',
        ],
      },
      fr: {
        title: 'Import de plans DXF',
        items: [
          'L\'import de plans DXF gagne un aperçu et des diagnostics, le contrôle des unités, plusieurs niveaux et l\'interprétation des poutres, avec un assistant plus clair.',
        ],
      },
      tr: {
        title: 'DXF plan içe aktarıcı',
        items: [
          'DXF plan içe aktarıcıya önizleme ve tanılama, birim kontrolü, birden çok kat ve kiriş yorumlama eklendi; sihirbaz da daha anlaşılır.',
        ],
      },
    },
  },
  {
    date: '2026-06-26',
    areas: ['basic'],
    i18n: {
      es: {
        title: 'Despiece de barras en el Básico',
        items: [
          'Despiece (cuerpo libre) de barras en 2D y 3D, con articulaciones deslizantes en 2D y de seis grados de libertad en 3D, e inspección de los vectores en cada extremo.',
        ],
      },
      en: {
        title: 'Member free-body diagrams in Basic',
        items: [
          'Free-body diagrams of members in 2D and 3D, with sliding hinges in 2D and six-degree-of-freedom releases in 3D, and the force vectors at each end.',
        ],
      },
      pt: {
        title: 'Diagramas de corpo livre no Básico',
        items: [
          'Diagramas de corpo livre de barras em 2D e 3D, com articulações deslizantes em 2D e de seis graus de liberdade em 3D, e os vetores em cada extremidade.',
        ],
      },
      de: {
        title: 'Freikörperbilder der Stäbe in Basis',
        items: [
          'Freikörperbilder von Stäben in 2D und 3D, mit Schiebegelenken in 2D und Freigaben in allen sechs Freiheitsgraden in 3D sowie den Kraftvektoren an jedem Ende.',
        ],
      },
      fr: {
        title: 'Les corps libres des barres dans Basique',
        items: [
          'Corps libres des barres en 2D et en 3D, avec des rotules glissantes en 2D et des libérations sur les six degrés de liberté en 3D, et les vecteurs d\'effort à chaque extrémité.',
        ],
      },
      tr: {
        title: 'Temel\'de çubukların serbest cisim diyagramları',
        items: [
          'Çubukların 2B ve 3B serbest cisim diyagramları; 2B\'de kayan mafsallar, 3B\'de altı serbestlik derecesinde serbestlikler ve her uçtaki kuvvet vektörleri.',
        ],
      },
    },
  },
  {
    date: '2026-06-19',
    areas: ['pro', 'pro', 'basic'],
    i18n: {
      es: {
        title: 'Del plano de CAD al modelo de hormigón',
        items: [
          'De un plano DXF a un borrador estructural de hormigón armado: asistente con clasificación de capas, plantilla descargable y ejemplos.',
          'Convención de ejes locales en 3D corregida en la interfaz y en el motor, con migración de los modelos existentes.',
          'Ejes y secciones unificados en el Básico 2D y 3D.',
        ],
      },
      en: {
        title: 'From a CAD drawing to a concrete model',
        items: [
          'From a DXF drawing to a reinforced concrete structural draft: a wizard that classifies layers, a downloadable template and examples.',
          'The 3D local-axis convention fixed in the interface and in the engine, with existing models migrated.',
          'Axes and sections unified across Basic 2D and 3D.',
        ],
      },
      pt: {
        title: 'Da planta de CAD ao modelo de concreto',
        items: [
          'De uma planta DXF a um rascunho estrutural de concreto armado: assistente com classificação de camadas, modelo para baixar e exemplos.',
          'Convenção de eixos locais em 3D corrigida na interface e no motor, com migração dos modelos existentes.',
          'Eixos e seções unificados no Básico 2D e 3D.',
        ],
      },
      de: {
        title: 'Vom CAD-Plan zum Stahlbetonmodell',
        items: [
          'Von einem DXF-Plan zu einem Tragwerksentwurf in Stahlbeton: ein Assistent, der Layer klassifiziert, eine herunterladbare Vorlage und Beispiele.',
          'Die Konvention der lokalen Achsen in 3D wurde in der Oberfläche und im Rechenkern korrigiert, und bestehende Modelle wurden migriert.',
          'Achsen und Querschnitte in Basis 2D und 3D vereinheitlicht.',
        ],
      },
      fr: {
        title: 'Du plan CAO au modèle en béton armé',
        items: [
          'D\'un plan DXF à une ébauche de structure en béton armé : un assistant qui classe les calques, un gabarit téléchargeable et des exemples.',
          'La convention des axes locaux en 3D corrigée dans l\'interface et dans le moteur, avec migration des modèles existants.',
          'Axes et sections unifiés dans Basique 2D et 3D.',
        ],
      },
      tr: {
        title: 'CAD planından betonarme modele',
        items: [
          'Bir DXF planından betonarme bir yapı taslağına: katmanları sınıflandıran bir sihirbaz, indirilebilir bir şablon ve örnekler.',
          '3B yerel eksen kuralı arayüzde ve motorda düzeltildi; mevcut modeller de taşındı.',
          'Temel 2B ve 3B\'de eksenler ve kesitler birleştirildi.',
        ],
      },
    },
  },
  {
    date: '2026-06-12',
    areas: ['pro', 'pro', 'pro', 'pro', 'basic'],
    shot: {
      base: 'pro-building-axial',
      w: 1600,
      h: 1192,
      alt: {
        es: 'Los esfuerzos normales de un edificio en el modo PRO, con perfiles reales en el visor 3D',
        en: 'Axial forces in a building in PRO mode, with real section shapes in the 3D viewer',
        pt: 'Os esforços normais de um edifício no modo PRO, com perfis reais no visualizador 3D',
        de: 'Die Normalkräfte eines Gebäudes im PRO-Modus, mit realen Querschnittsformen in der 3D-Ansicht',
        fr: 'Les efforts normaux d\'un bâtiment dans le mode PRO, avec les formes réelles des sections dans la vue 3D',
        tr: 'PRO modunda bir binanın normal kuvvetleri; 3B görüntüleyicide gerçek kesit şekilleriyle',
      },
    },
    i18n: {
      es: {
        title: 'Un flujo profesional en el PRO',
        items: [
          'Diseño, cargas e informe de cálculo integrados en el PRO, con las verificaciones de diseño unificadas.',
          'Consulta de resultados por caso, combinación y envolvente.',
          'Visor 3D con perfiles reales y ejes locales, y excentricidades de barras para modelar vigas en la cara de la columna.',
          'Losas y muros con visualización, ejes, tensiones principales e informe.',
          'El modo Básico se reescribió, con límites más claros frente al PRO.',
        ],
      },
      en: {
        title: 'A professional workflow in PRO',
        items: [
          'Design, loads and the calculation report working together in PRO, with unified design checks.',
          'Results by load case, combination and envelope.',
          'A 3D viewer with real section shapes and local axes, and member offsets to model beams framing into the column face.',
          'Slabs and walls with display, axes, principal stresses and report.',
          'Basic mode was rewritten, with a clearer line between it and PRO.',
        ],
      },
      pt: {
        title: 'Um fluxo profissional no PRO',
        items: [
          'Dimensionamento, cargas e relatório de cálculo integrados no PRO, com as verificações de dimensionamento unificadas.',
          'Consulta de resultados por caso, combinação e envoltória.',
          'Visualizador 3D com perfis reais e eixos locais, e excentricidades de barras para modelar vigas na face do pilar.',
          'Lajes e paredes com visualização, eixos, tensões principais e relatório.',
          'O modo Básico foi reescrito, com limites mais claros em relação ao PRO.',
        ],
      },
      de: {
        title: 'Ein professioneller Arbeitsablauf in PRO',
        items: [
          'Bemessung, Lasten und statische Berechnung greifen in PRO ineinander, mit vereinheitlichten Nachweisen.',
          'Ergebnisse nach Lastfall, Kombination und Einhüllender.',
          'Eine 3D-Ansicht mit realen Querschnittsformen und lokalen Achsen sowie Stabversätze, um Balken an der Stützenseite anzuschließen.',
          'Decken und Wände mit Darstellung, Achsen, Hauptspannungen und Bericht.',
          'Der Basis-Modus wurde neu geschrieben, mit einer klareren Abgrenzung zu PRO.',
        ],
      },
      fr: {
        title: 'Un flux de travail professionnel dans PRO',
        items: [
          'Dimensionnement, charges et note de calcul fonctionnent ensemble dans PRO, avec des vérifications unifiées.',
          'Résultats par cas de charge, par combinaison et par enveloppe.',
          'Une vue 3D avec les formes réelles des sections et les axes locaux, et des excentrements de barres pour modéliser les poutres au nu du poteau.',
          'Dalles et voiles avec affichage, axes, contraintes principales et note de calcul.',
          'Le mode Basique a été réécrit, avec une séparation plus nette par rapport à PRO.',
        ],
      },
      tr: {
        title: 'PRO\'da profesyonel bir iş akışı',
        items: [
          'PRO\'da boyutlandırma, yükler ve hesap raporu birlikte çalışıyor; kontroller de birleştirildi.',
          'Yük durumu, kombinasyon ve zarfa göre sonuçlar.',
          'Gerçek kesit şekilleri ve yerel eksenlerle bir 3B görüntüleyici; kirişleri kolon yüzünde modellemek için çubuk kaçıklıkları.',
          'Görüntüleme, eksenler, asal gerilmeler ve raporla döşemeler ve perde duvarlar.',
          'Temel modu yeniden yazıldı; PRO ile arasındaki sınır daha net.',
        ],
      },
    },
  },
  {
    date: '2026-04-01',
    period: 'month',
    areas: ['site', 'engine', 'engine', 'app', 'app', 'app'],
    i18n: {
      es: {
        title: 'Un visor 3D más fluido y un motor más robusto',
        items: [
          'Una landing rediseñada.',
          'Cerca de mil tests nuevos de robustez, con correcciones de exactitud en el motor, los elementos y las restricciones, y avisos de inestabilidad antes de calcular.',
          'Articulaciones en 3D liberadas eje por eje en cada extremo de barra.',
          'El visor 3D se mueve con fluidez en modelos de más de mil nodos: los nodos se dibujan de una vez y la selección de barras es más rápida.',
          'Los ejes quedaron unificados con Z hacia arriba en toda la app, y se corrigieron los momentos My y Mz en tensiones y verificaciones.',
          'Correcciones en el guardado, los links compartidos y las exportaciones.',
        ],
      },
      en: {
        title: 'A smoother 3D viewer and a sturdier engine',
        items: [
          'A redesigned landing page.',
          'Close to a thousand new robustness tests, with accuracy fixes in the engine, the elements and the constraints, and instability warnings before the analysis runs.',
          'Hinges in 3D released axis by axis at each member end.',
          'The 3D viewer moves smoothly on models with over a thousand nodes: nodes are drawn in one pass and picking members is faster.',
          'Axes were unified with Z up across the app, and the My and Mz moments were fixed in stresses and design checks.',
          'Fixes to saving, shared links and exports.',
        ],
      },
      pt: {
        title: 'Um visualizador 3D mais fluido e um motor mais robusto',
        items: [
          'Uma landing redesenhada.',
          'Perto de mil testes novos de robustez, com correções de exatidão no motor, nos elementos e nas restrições, e avisos de instabilidade antes de calcular.',
          'Articulações em 3D liberadas eixo por eixo em cada extremidade da barra.',
          'O visualizador 3D se move com fluidez em modelos com mais de mil nós: os nós são desenhados de uma vez e a seleção de barras ficou mais rápida.',
          'Os eixos foram unificados com Z para cima em todo o app, e os momentos My e Mz foram corrigidos nas tensões e verificações.',
          'Correções no salvamento, nos links compartilhados e nas exportações.',
        ],
      },
      de: {
        title: 'Eine flüssigere 3D-Ansicht und ein robusterer Rechenkern',
        items: [
          'Eine neu gestaltete Startseite.',
          'Fast tausend neue Robustheitstests, mit Genauigkeitskorrekturen im Rechenkern, in den Elementen und den Kopplungen, sowie Warnungen vor Instabilität, bevor die Berechnung läuft.',
          'Gelenke in 3D, an jedem Stabende Achse für Achse freigegeben.',
          'Die 3D-Ansicht bewegt sich bei Modellen mit über tausend Knoten flüssig: Die Knoten werden in einem Durchgang gezeichnet, und die Auswahl von Stäben ist schneller.',
          'Die Achsen wurden in der ganzen App mit Z nach oben vereinheitlicht, und die Momente My und Mz wurden in Spannungen und Nachweisen korrigiert.',
          'Korrekturen beim Speichern, bei geteilten Links und bei Exporten.',
        ],
      },
      fr: {
        title: 'Une vue 3D plus fluide et un moteur plus robuste',
        items: [
          'Une page d\'accueil repensée.',
          'Près de mille nouveaux tests de robustesse, avec des corrections de précision dans le moteur, les éléments et les liaisons, et des avertissements d\'instabilité avant le calcul.',
          'Rotules en 3D libérées axe par axe à chaque extrémité de barre.',
          'La vue 3D reste fluide sur des modèles de plus de mille nœuds : les nœuds sont dessinés en une seule passe et la sélection des barres est plus rapide.',
          'Les axes ont été unifiés avec Z vers le haut dans toute l\'application, et les moments My et Mz ont été corrigés dans les contraintes et les vérifications.',
          'Corrections de l\'enregistrement, des liens partagés et des exports.',
        ],
      },
      tr: {
        title: 'Daha akıcı bir 3B görüntüleyici ve daha sağlam bir motor',
        items: [
          'Yeniden tasarlanmış bir açılış sayfası.',
          'Bine yakın yeni sağlamlık testi; motorda, elemanlarda ve kısıtlarda doğruluk düzeltmeleri ve analiz çalışmadan önce kararsızlık uyarıları.',
          '3B\'de her çubuk ucunda eksen eksen serbest bırakılan mafsallar.',
          '3B görüntüleyici bini aşkın düğümlü modellerde akıcı hareket ediyor: düğümler tek geçişte çiziliyor ve çubuk seçimi daha hızlı.',
          'Eksenler uygulamanın tamamında Z yukarı olacak biçimde birleştirildi; gerilmelerde ve kontrollerde My ve Mz momentleri düzeltildi.',
          'Kaydetmede, paylaşılan bağlantılarda ve dışa aktarmalarda düzeltmeler.',
        ],
      },
    },
  },
  {
    date: '2026-03-01',
    period: 'month',
    areas: ['engine', 'engine', 'engine', 'engine', 'site', 'pro', 'pro', 'edu', 'basic', 'app'],
    shot: {
      base: '3d-frame',
      w: 1600,
      h: 876,
      alt: {
        es: 'Un pórtico espacial con su diagrama de momentos en 3D',
        en: 'A space frame with its bending moment diagram in 3D',
        pt: 'Um pórtico espacial com seu diagrama de momentos em 3D',
        de: 'Ein räumlicher Rahmen mit seiner Momentenlinie in 3D',
        fr: 'Un portique spatial avec son diagramme des moments en 3D',
        tr: '3B eğilme momenti diyagramıyla bir uzay çerçeve',
      },
    },
    i18n: {
      es: {
        title: 'El motor en Rust, el modo PRO y el nombre Stabileo',
        items: [
          'El motor de cálculo se reescribió en Rust y corre en el navegador con WebAssembly. Antes de reemplazar al anterior, se comparó con él en 90 modelos.',
          'Más de dos mil tests de validación contra soluciones de libros de texto y casos de referencia publicados.',
          'Análisis no lineal geométrico y de material, dinámica modal, espectral y en el tiempo, placas y cáscaras, cables, construcción por etapas y fundaciones sobre resortes.',
          'Un solver para matrices dispersas que acelera los modelos grandes: el análisis modal en 3D pasó a ser 11,8 veces más rápido.',
          'El proyecto pasó a llamarse Stabileo, con dominio propio, landing y la interfaz en 14 idiomas.',
          'El modo PRO, con verificación de hormigón armado según CIRSOC 201, cargas automáticas, diagnósticos e informe de cálculo.',
          'Un flujo de hormigón armado con la combinación que gobierna cada barra, verificación automática, armado y nudos, y ejemplos grandes como un estadio de 1005 nodos.',
          'El modo Educativo, con ejercicios guiados que se corrigen paso a paso.',
          'El modo Básico suma la vista 3D y el pase de modelos de 3D a 2D.',
          'Un asistente con IA que arma y edita modelos a partir de una conversación.',
        ],
      },
      en: {
        title: 'The engine in Rust, PRO mode and the Stabileo name',
        items: [
          'The analysis engine was rewritten in Rust and runs in the browser through WebAssembly. Before it replaced the old one, the two were compared on 90 models.',
          'Over two thousand validation tests against textbook solutions and published reference cases.',
          'Geometric and material nonlinear analysis, modal, spectral and time-history dynamics, plates and shells, cables, staged construction and foundations on springs.',
          'A sparse matrix solver that speeds up large models: 3D modal analysis became 11.8 times faster.',
          'The project was renamed Stabileo, with its own domain, a landing page and the interface in 14 languages.',
          'PRO mode, with reinforced concrete checks to CIRSOC 201, automatic loads, diagnostics and a calculation report.',
          'A reinforced concrete workflow with the governing combination for each member, automatic checks, detailing and joints, and large examples such as a 1005-node stadium.',
          'Education mode, with guided exercises checked step by step.',
          'Basic mode adds the 3D view and turning 3D models into 2D ones.',
          'An AI assistant that builds and edits models from a conversation.',
        ],
      },
      pt: {
        title: 'O motor em Rust, o modo PRO e o nome Stabileo',
        items: [
          'O motor de cálculo foi reescrito em Rust e roda no navegador com WebAssembly. Antes de substituir o anterior, os dois foram comparados em 90 modelos.',
          'Mais de dois mil testes de validação contra soluções de livros-texto e casos de referência publicados.',
          'Análise não linear geométrica e de material, dinâmica modal, espectral e no tempo, placas e cascas, cabos, construção em etapas e fundações sobre molas.',
          'Um solver para matrizes esparsas que acelera os modelos grandes: a análise modal em 3D ficou 11,8 vezes mais rápida.',
          'O projeto passou a se chamar Stabileo, com domínio próprio, landing e a interface em 14 idiomas.',
          'O modo PRO, com verificação de concreto armado segundo a CIRSOC 201, cargas automáticas, diagnósticos e relatório de cálculo.',
          'Um fluxo de concreto armado com a combinação que governa cada barra, verificação automática, armação e nós, e exemplos grandes como um estádio de 1005 nós.',
          'O modo Educativo, com exercícios guiados corrigidos passo a passo.',
          'O modo Básico ganha a vista 3D e a passagem de modelos de 3D para 2D.',
          'Um assistente com IA que monta e edita modelos a partir de uma conversa.',
        ],
      },
      de: {
        title: 'Der Rechenkern in Rust, der PRO-Modus und der Name Stabileo',
        items: [
          'Der Rechenkern wurde in Rust neu geschrieben und läuft über WebAssembly im Browser. Bevor er den alten ersetzte, wurden beide an 90 Modellen verglichen.',
          'Über zweitausend Validierungstests gegen Lehrbuchlösungen und veröffentlichte Referenzfälle.',
          'Geometrisch und materiell nichtlineare Berechnung, Dynamik modal, mit Antwortspektrum und im Zeitverlauf, Platten und Schalen, Seile, Berechnung in Bauphasen und federnd gelagerte Gründungen.',
          'Ein Löser für dünnbesetzte Matrizen, der große Modelle beschleunigt: Die Modalanalyse in 3D wurde 11,8-mal schneller.',
          'Das Projekt wurde in Stabileo umbenannt, mit eigener Domain, einer Startseite und der Oberfläche in 14 Sprachen.',
          'Der PRO-Modus, mit Stahlbetonnachweisen nach CIRSOC 201, automatischen Lasten, Diagnosen und statischer Berechnung.',
          'Ein Arbeitsablauf für Stahlbeton mit der maßgebenden Kombination für jeden Stab, automatischen Nachweisen, Bewehrungsführung und Knoten, sowie großen Beispielen wie einem Stadion mit 1005 Knoten.',
          'Der Lehrmodus, mit geführten Übungen, die Schritt für Schritt bewertet werden.',
          'Der Basis-Modus erhält die 3D-Ansicht und die Umwandlung von 3D-Modellen in 2D-Modelle.',
          'Ein KI-Assistent, der Modelle aus einem Gespräch heraus erstellt und bearbeitet.',
        ],
      },
      fr: {
        title: 'Le moteur en Rust, le mode PRO et le nom Stabileo',
        items: [
          'Le moteur de calcul a été réécrit en Rust et s\'exécute dans le navigateur grâce à WebAssembly. Avant qu\'il remplace l\'ancien, les deux ont été comparés sur 90 modèles.',
          'Plus de deux mille tests de validation par rapport à des solutions de manuels et à des cas de référence publiés.',
          'Analyse non linéaire géométrique et matérielle, dynamique modale, spectrale et temporelle, plaques et coques, câbles, construction par phases et fondations sur ressorts.',
          'Un solveur pour matrices creuses qui accélère les grands modèles : l\'analyse modale en 3D est devenue 11,8 fois plus rapide.',
          'Le projet a été renommé Stabileo, avec son propre domaine, une page d\'accueil et l\'interface en 14 langues.',
          'Le mode PRO, avec la vérification du béton armé selon le CIRSOC 201, des charges automatiques, des diagnostics et une note de calcul.',
          'Un flux de travail pour le béton armé avec la combinaison déterminante pour chaque barre, la vérification automatique, le ferraillage et les nœuds, et de grands exemples comme un stade de 1005 nœuds.',
          'Le mode Enseignement, avec des exercices guidés corrigés pas à pas.',
          'Le mode Basique ajoute la vue 3D et le passage de modèles 3D en modèles 2D.',
          'Un assistant d\'IA qui construit et modifie des modèles à partir d\'une conversation.',
        ],
      },
      tr: {
        title: 'Rust ile yazılan motor, PRO modu ve Stabileo adı',
        items: [
          'Hesap motoru Rust ile yeniden yazıldı ve tarayıcıda WebAssembly ile çalışıyor. Eskisinin yerini almadan önce ikisi 90 model üzerinde karşılaştırıldı.',
          'Ders kitabı çözümlerine ve yayımlanmış referans durumlara karşı iki binden fazla doğrulama testi.',
          'Geometrik ve malzeme bakımından doğrusal olmayan analiz; modal, spektral ve zaman tanım alanında dinamik; plaklar ve kabuklar, kablolar, aşamalı yapım ve yaylar üzerinde temeller.',
          'Büyük modelleri hızlandıran bir seyrek matris çözücüsü: 3B modal analiz 11,8 kat hızlandı.',
          'Projenin adı Stabileo oldu; kendi alan adı, bir açılış sayfası ve 14 dilde arayüzle.',
          'CIRSOC 201\'e göre betonarme kontrolleri, otomatik yükler, tanılamalar ve hesap raporuyla PRO modu.',
          'Her çubuk için belirleyici kombinasyonu, otomatik kontrolleri, donatı detaylandırmayı ve düğümleri içeren bir betonarme iş akışı ve 1005 düğümlü bir stadyum gibi büyük örnekler.',
          'Adım adım değerlendirilen rehberli alıştırmalarla Eğitim modu.',
          'Temel moduna 3B görünüm ve 3B modellerin 2B\'ye dönüştürülmesi eklendi.',
          'Bir konuşmadan modeller oluşturan ve düzenleyen bir yapay zekâ asistanı.',
        ],
      },
    },
  },
  {
    date: '2026-02-01',
    period: 'month',
    areas: ['basic', 'basic', 'basic', 'basic', 'engine', 'edu', 'app'],
    shot: {
      base: '2d-moments',
      w: 1600,
      h: 997,
      alt: {
        es: 'Un pórtico plano con su diagrama de momentos flectores en el modo Básico',
        en: 'A plane frame with its bending moment diagram in Basic mode',
        pt: 'Um pórtico plano com seu diagrama de momentos fletores no modo Básico',
        de: 'Ein ebener Rahmen mit seiner Momentenlinie im Basis-Modus',
        fr: 'Un portique plan avec son diagramme des moments fléchissants dans le mode Basique',
        tr: 'Temel modunda eğilme momenti diyagramıyla bir düzlem çerçeve',
      },
    },
    i18n: {
      es: {
        title: 'El comienzo: un editor de estructuras en el navegador',
        items: [
          'La primera versión, el 10 de febrero: barras, apoyos y cargas en 2D, con reacciones, diagramas y deformada, sin instalar nada.',
          'Cargas puntuales, distribuidas parciales y móviles, casos de carga, combinaciones y envolventes con sus dos curvas.',
          'Secciones de acero y de hormigón con un constructor de perfiles, y tensiones en la sección por Navier, Jourawski y Von Mises.',
          'Apoyos inclinados, resortes y asentamientos, y peso propio de las barras.',
          'Un motor 3D con seis grados de libertad por nodo y su visor, además de P-Delta, pandeo y líneas de influencia en 2D.',
          'Análisis cinemático didáctico, que explica barra por barra por qué una estructura es o no un mecanismo.',
          'Interfaz para celulares, links compartidos que llevan el modelo, un recorrido guiado y atajos de teclado.',
        ],
      },
      en: {
        title: 'The beginning: a structural editor in the browser',
        items: [
          'The first version, on 10 February: members, supports and loads in 2D, with reactions, diagrams and the deflected shape, with nothing to install.',
          'Point, partial distributed and moving loads, load cases, combinations and envelopes with both curves.',
          'Steel and concrete sections with a section builder, and stresses in the section by Navier, Jourawski and Von Mises.',
          'Inclined supports, springs and settlements, and member self-weight.',
          'A 3D engine with six degrees of freedom per node and its viewer, plus P-Delta, buckling and influence lines in 2D.',
          'A teaching kinematic analysis that explains, member by member, why a structure is or is not a mechanism.',
          'A mobile interface, shared links that carry the model, a guided tour and keyboard shortcuts.',
        ],
      },
      pt: {
        title: 'O começo: um editor de estruturas no navegador',
        items: [
          'A primeira versão, em 10 de fevereiro: barras, apoios e cargas em 2D, com reações, diagramas e deformada, sem instalar nada.',
          'Cargas pontuais, distribuídas parciais e móveis, casos de carga, combinações e envoltórias com suas duas curvas.',
          'Seções de aço e de concreto com um construtor de perfis, e tensões na seção por Navier, Jourawski e Von Mises.',
          'Apoios inclinados, molas e recalques, e peso próprio das barras.',
          'Um motor 3D com seis graus de liberdade por nó e seu visualizador, além de P-Delta, flambagem e linhas de influência em 2D.',
          'Análise cinemática didática, que explica barra por barra por que uma estrutura é ou não um mecanismo.',
          'Interface para celulares, links compartilhados que levam o modelo, um tour guiado e atalhos de teclado.',
        ],
      },
      de: {
        title: 'Der Anfang: ein Tragwerkseditor im Browser',
        items: [
          'Die erste Version, am 10. Februar: Stäbe, Auflager und Lasten in 2D, mit Auflagerreaktionen, Schnittgrößenverläufen und Verformungsfigur, ohne etwas zu installieren.',
          'Einzellasten, abschnittsweise Streckenlasten und Wanderlasten, Lastfälle, Kombinationen und Einhüllende mit ihren beiden Kurven.',
          'Stahl- und Betonquerschnitte mit einem Profileditor sowie Spannungen im Querschnitt nach Navier, Jourawski und von Mises.',
          'Geneigte Auflager, Federn und Setzungen sowie das Eigengewicht der Stäbe.',
          'Ein 3D-Rechenkern mit sechs Freiheitsgraden je Knoten und seine Ansicht, dazu P-Delta, Knicken und Einflusslinien in 2D.',
          'Eine kinematische Analyse für die Lehre, die Stab für Stab erklärt, warum ein Tragwerk ein Mechanismus ist oder nicht.',
          'Eine Oberfläche für Mobilgeräte, geteilte Links, die das Modell mitnehmen, eine geführte Tour und Tastenkürzel.',
        ],
      },
      fr: {
        title: 'Les débuts : un éditeur de structures dans le navigateur',
        items: [
          'La première version, le 10 février : barres, appuis et charges en 2D, avec réactions, diagrammes et déformée, sans rien installer.',
          'Charges ponctuelles, réparties partielles et mobiles, cas de charge, combinaisons et enveloppes avec leurs deux courbes.',
          'Sections en acier et en béton avec un constructeur de profilés, et contraintes dans la section selon Navier, Jourawski et von Mises.',
          'Appuis inclinés, ressorts et tassements, et poids propre des barres.',
          'Un moteur 3D à six degrés de liberté par nœud et sa vue, ainsi que P-Delta, flambement et lignes d\'influence en 2D.',
          'Une analyse cinématique pédagogique, qui explique barre par barre pourquoi une structure est ou n\'est pas un mécanisme.',
          'Une interface pour mobile, des liens partagés qui transportent le modèle, une visite guidée et des raccourcis clavier.',
        ],
      },
      tr: {
        title: 'Başlangıç: tarayıcıda bir yapı düzenleyici',
        items: [
          'İlk sürüm, 10 Şubat\'ta: 2B\'de çubuklar, mesnetler ve yükler; tepkiler, diyagramlar ve şekil değiştirmiş durumla, hiçbir şey kurmadan.',
          'Tekil, kısmi yayılı ve hareketli yükler, yük durumları, kombinasyonlar ve iki eğrisiyle zarflar.',
          'Profil oluşturucuyla çelik ve beton kesitler; Navier, Jourawski ve von Mises\'e göre kesit gerilmeleri.',
          'Eğik mesnetler, yaylar ve oturmalar ile çubukların öz ağırlığı.',
          'Düğüm başına altı serbestlik dereceli bir 3B motor ve görüntüleyicisi; ayrıca 2B\'de P-Delta, burkulma ve tesir çizgileri.',
          'Bir yapının neden mekanizma olduğunu ya da olmadığını çubuk çubuk açıklayan öğretici bir kinematik analiz.',
          'Mobil arayüz, modeli taşıyan paylaşılan bağlantılar, rehberli tur ve klavye kısayolları.',
        ],
      },
    },
  },
];

export const AREA_LABELS: Record<PublicLocale, Record<ChangelogArea, string>> = {
  es: { basic: 'Básico', pro: 'PRO', edu: 'Educativo', app: 'App', engine: 'Motor', site: 'Sitio' },
  en: { basic: 'Basic', pro: 'PRO', edu: 'Education', app: 'App', engine: 'Engine', site: 'Website' },
  pt: { basic: 'Básico', pro: 'PRO', edu: 'Educativo', app: 'App', engine: 'Motor', site: 'Site' },
  de: { basic: 'Basis', pro: 'PRO', edu: 'Lehre', app: 'App', engine: 'Rechenkern', site: 'Website' },
  fr: { basic: 'Basique', pro: 'PRO', edu: 'Enseignement', app: 'Application', engine: 'Moteur', site: 'Site' },
  tr: { basic: 'Temel', pro: 'PRO', edu: 'Eğitim', app: 'Uygulama', engine: 'Motor', site: 'Site' },
};

/** Parsed by parts, so no time zone moves the day back. */
function localDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatChangeDate(iso: string, locale: string): string {
  return localDay(iso).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
}

export function changeStamp(entry: ChangelogEntry, locale: string): { big: string; small: string | null } {
  const date = localDay(entry.date);
  const month = date.toLocaleDateString(locale, { month: 'short' }).replace(/\.$/, '');
  return entry.period === 'month' ? { big: month, small: null } : { big: String(date.getDate()), small: month };
}

export function formatChangeWhen(entry: ChangelogEntry, locale: string): string {
  return entry.period === 'month' ? formatChangeMonth(entry.date, locale) : formatChangeDate(entry.date, locale);
}

export function formatChangeMonth(iso: string, locale: string, { capitalize = true } = {}): string {
  const text = localDay(iso).toLocaleDateString(locale, { year: 'numeric', month: 'long' });
  return capitalize ? text.charAt(0).toLocaleUpperCase(locale) + text.slice(1) : text;
}

export function changeCount(entries: readonly ChangelogEntry[], area: ChangelogArea | null = null): number {
  return entries.reduce((n, e) => n + (area ? e.areas.filter((a) => a === area).length : e.areas.length), 0);
}

export function changesPerArea(entries: readonly ChangelogEntry[]): Record<ChangelogArea, number> {
  return Object.fromEntries(CHANGELOG_AREAS.map((a) => [a, changeCount(entries, a)])) as Record<ChangelogArea, number>;
}

export function entryAreas(entry: ChangelogEntry): ChangelogArea[] {
  return [...new Set(entry.areas)];
}

export function itemsByArea(entry: ChangelogEntry, locale: PublicLocale): { area: ChangelogArea; items: string[] }[] {
  const items = entry.i18n[locale].items;
  return entryAreas(entry).map((area) => ({ area, items: items.filter((_, i) => entry.areas[i] === area) }));
}

/** Expects entries newest first, as CHANGELOG is. */
export function changelogByMonth(entries: ChangelogEntry[]): { key: string; entries: ChangelogEntry[] }[] {
  const months: { key: string; entries: ChangelogEntry[] }[] = [];
  for (const entry of entries) {
    const key = entry.date.slice(0, 7);
    const last = months.at(-1);
    if (last?.key === key) last.entries.push(entry);
    else months.push({ key, entries: [entry] });
  }
  return months;
}
