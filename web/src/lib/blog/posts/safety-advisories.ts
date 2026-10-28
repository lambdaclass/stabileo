/**
 * The safety advisories, for the people whose results they change.
 *
 * Source of truth: docs/advisories/ (one file per advisory, with the full
 * reproduction). This post is the reader's summary of those files and links
 * to each one; it says nothing they do not. Every number in the "documented
 * cases" table is quoted from the advisory named in its row, and the content
 * test pins them, so a figure cannot drift here without the advisory changing
 * first.
 *
 * Status is as of the post's date. An advisory's status changes when its fix
 * is DEPLOYED to stabileo.com (main auto-deploys), not when its pull request
 * is opened; update the row and the "Estado" item together when one lands.
 */
import type { Post } from '../types';

const REPO = 'https://github.com/lambdaclass/stabileo/blob/main/docs/advisories';

export const safetyAdvisories: Post = {
  slug: 'safety-advisories',
  date: '2026-10-20',
  updated: '2026-10-28',
  order: 6,
  authors: ['Federico Carrone'],
  tagKeys: ['blog.tag.safety', 'blog.tag.verification'],
  i18n: {
    es: {
      title: 'Avisos de seguridad: qué resultados cambiaron y qué hacer',
      excerpt:
        'Los errores de Stabileo que pudieron dar resultados equivocados o del lado inseguro: a quién afectan, cómo saber si un modelo está afectado, qué hacer mientras tanto y cuándo quedaron corregidos.',
      blocks: [
        { k: 'p', t: 'Los resultados de Stabileo se usan para dimensionar estructuras reales. Cuando encontramos un error que pudo dar un resultado equivocado, y en particular uno del lado inseguro, lo publicamos como aviso de seguridad: qué estaba mal, qué modelos afecta, cómo reconocerlos, qué hacer hasta que la corrección esté publicada y qué revisar en los resultados que ya se usaron.' },
        { k: 'p', t: 'Casi todos estos errores los encontró nuestro propio programa de verificación: comparación contra otros siete programas de elementos finitos, ejemplos resueltos publicados, pruebas de invariantes físicos y revisión de las derivaciones de cada elemento. Publicarlos es parte de ese trabajo: un error que no se informa sigue en los cálculos que ya se entregaron.' },
        { k: 'note', t: 'Estado al 28 de octubre de 2026: los avisos SA-2026-001 a 020 están corregidos en la versión 0.3.0 y SA-2026-021 a 024 en la versión 0.4.0 (en stabileo.com, SA-2026-021 y 022 desde el 22 de octubre y SA-2026-023 y 024 desde el 25 y el 26). Publicarlos es parte de cómo verificamos los resultados, no una señal de que sigan abiertos. Un aviso cuenta como corregido cuando la corrección está publicada en stabileo.com, no cuando existe el cambio. Mientras un aviso esté abierto, usá la alternativa que indica y revisá a mano el resultado afectado antes de firmar.' },

        { k: 'h', t: 'Resumen' },
        {
          k: 'table',
          caption: 'Avisos publicados. Severidad: crítica cuando la capacidad o la demanda podían quedar muy del lado inseguro sin señal visible.',
          head: ['Aviso', 'Qué', 'Severidad', 'Estado'],
          rows: [
            ['SA-2026-021', 'Cubiertas aisladas: sin viento en la dirección de la cumbrera y, en la otra, menos que el mínimo del §2.1.5 (el 17 % a 20 m/s)', 'Alta', 'Corregido en 0.4.0'],
            ['SA-2026-022', 'Con empuje de suelo H faltaba la combinación en que el peso propio lo resiste (27 a 45 % bajo en un ejemplo)', 'Alta', 'Corregido en 0.4.0'],
            ['SA-2026-023', 'Columnas de hormigón armado: la verificación leía un solo signo del momento; con barras desparejas (6, 10, 14…) aprobaba con el lado más fuerte', 'Crítica', 'Corregido en 0.4.0'],
            ['SA-2026-024', 'Bases, nudos, losas, tabiques y el optimizador de acero diseñados con las cargas sin mayorar cuando las combinaciones estaban definidas y sin resolver (cálculo en vivo, un cálculo de combinaciones fallido o una lista activa vacía)', 'Alta', 'Corregido en 0.4.0'],
            ['SA-2026-013', 'Láminas curvas: momentos flectores informados como cero; tensiones con la deformación térmica libre', 'Alta', 'Corregido en 0.3.0'],
            ['SA-2026-014', 'Colapso plástico 3D: el factor dependía de la numeración de las barras (hasta 2,4 veces la carga de colapso)', 'Alta', 'Corregido en 0.3.0'],
            ['SA-2026-015', 'Cables con peso propio con tracción baja en estructuras hiperestáticas', 'Alta', 'Corregido en 0.3.0'],
            ['SA-2026-011', 'Apoyo 3D cambiado de resorte a empotrado o articulado, calculado como resorte', 'Alta', 'Corregido el 20/10/2026'],
            ['SA-2026-017', 'Interacción suelo-estructura: curvas p-y, t-z y q-z apartadas de sus referencias', 'Alta', 'Corregido en 0.3.0'],
            ['SA-2026-008', 'Espectro de respuesta: corte basal SRSS con CQC; participación sin la masa acoplada a los apoyos', 'Alta', 'Corregido el 21/10/2026'],
            ['SA-2026-007', 'Pandeo 3D sin modos torsionales ni flexotorsionales', 'Alta', 'Corregido el 21/10/2026'],
            ['SA-2026-006', 'Modelo plano resuelto en 3D: momentos nodales y giros impuestos invertidos', 'Alta', 'Corregido el 21/10/2026'],
            ['SA-2026-005', 'Barras inclinadas 2D: esfuerzo axil sin la componente de la carga a lo largo de la barra', 'Alta', 'Corregido el 21/10/2026'],
            ['SA-2026-019', 'Cargas de temperatura en barras (motor y WASM; la aplicación compensaba desde el 07/10/2026): α del acero y altura de rectángulo macizo', 'Media', 'Corregido en 0.3.0'],
            ['SA-2026-012', 'Análisis no lineal de material (sólo motor y WASM): esfuerzos de barra elásticos tras la fluencia', 'Media', 'Corregido en 0.3.0'],
            ['SA-2026-016', 'Arcos (vigas curvas del motor, herramienta de arco de la aplicación): Iy e Iz intercambiados en los tramos casi verticales', 'Media', 'Corregido en 0.3.0'],
            ['SA-2026-018', 'Láminas MITC9 (sólo motor y WASM) sobre geometría curva deformadas por un movimiento de cuerpo rígido', 'Media', 'Corregido en 0.3.0'],
            ['SA-2026-020', 'Análisis no lineal de material 3D (sólo motor y WASM): superficie de fluencia menos conservadora que en 2D', 'Media', 'Corregido en 0.3.0'],
            ['SA-2026-010', 'Certificado espectral aprobado con resultados no finitos', 'Media', 'Corregido el 19/10/2026'],
            ['SA-2026-009', 'Sólido-lámina SHB8 un 22 % demasiado rígido en flexión de placas delgadas (flechas un 18 % bajas)', 'Media (mayor en estructuras hiperestáticas)', 'Corregido el 19/10/2026'],
            ['SA-2026-004', 'Análisis que ignoraban parte del modelo (dinámica, pandeo, colapso plástico)', 'Crítica', 'Corregido en 0.2.0'],
            ['SA-2026-003', 'Verificaciones de acero, perfiles conformados y uniones con capacidad sobrestimada', 'Crítica', 'Corregido en 0.2.0'],
            ['SA-2026-002', 'Verificaciones de hormigón (CIRSOC 201, ACI 318) con capacidad sobrestimada', 'Crítica', 'Corregido en 0.2.0'],
            ['SA-2026-001', 'Combinaciones y cargas generadas (CIRSOC 101, 102, 103) del lado inseguro', 'Alta', 'Corregido en 0.2.0'],
          ],
        },
        {
          k: 'table',
          caption: 'Casos documentados en cada aviso: el valor correcto y el que informaba Stabileo.',
          head: ['Aviso', 'Caso', 'Correcto', 'Informado', 'Unidad'],
          rows: [
            ['SA-2026-024', 'Pórtico de 6 × 4 m, 20 kN/m de permanente en la viga, 15 kN de viento, 1,2D + 1,6W, después de una edición con el cálculo en vivo: reacción vertical de la base de barlovento', '65.61', '56.01', 'kN'],
            ['SA-2026-023', 'Columna de 30×30 cm, 6 Ø20 (tres en la cara inferior), Nu = 100 kN: φMn con la cara de tres barras comprimida', '78,57', '101,57', 'kN·m'],
            ['SA-2026-013', 'Ménsula de cuatro láminas curvas de 4 × 1 × 0,2 m, 10 kN en la punta: mx en el elemento del empotramiento', '35,0', '0', 'kN·m/m'],
            ['SA-2026-014', 'Pórtico espacial de 10 barras (frame3d-2) renumerado: factor de colapso plástico', '176,47', '424,3', '—'],
            ['SA-2026-015', 'Mástil de 20 m arriostrado con un cable de acero de 1 cm², 5 kN en el tope: tracción del cable', '5,18', '4,34', 'kN'],
            ['SA-2026-011', 'Viga de 0, 4 y 8 m, apoyo dibujado como empotrado en 8 m: descenso en ese apoyo', '0', '-14,4', 'mm'],
            ['SA-2026-017', 'Arcilla blanda c = 20 kPa, D = 1 m, z = 4 m: resistencia última del suelo p_u', '124', '84', 'kN/m'],
            ['SA-2026-008', 'Dos modos a ω y 1,1ω: corte basal relativo al valor CQC', '1,00', '0,81', '—'],
            ['SA-2026-007', 'Columna cruciforme de 200×10 mm y 1,5 m: carga crítica', '2993', '5860', 'kN'],
            ['SA-2026-006', 'Pórtico con momentos y fuerzas nodales: desplazamiento lateral', '0,92', '2,52', 'mm'],
            ['SA-2026-005', 'Cabio de techo a dos aguas: esfuerzo axil en la base', '-56,67', '-41,67', 'kN'],
            ['SA-2026-019', 'IPE 300 empotrado en ambos extremos, gradiente de 20 °C: momento en el extremo', '14,04', '9,76', 'kN·m'],
            ['SA-2026-012', 'Ménsula de 4 m fluida, carga en la punta 1,2·Mp/L: momento en el empotramiento', '1012,5', '101250', 'kN·m'],
            ['SA-2026-016', 'Arco semicircular de 5 m en el plano Y–Z, 40 tramos: descenso de la clave', '-7,29', '-6,18', 'mm'],
            ['SA-2026-018', 'Parche cilíndrico MITC9 de 2×2 m, flecha 0,2 m, acero, 50 mm, giro rígido de 1 mrad: tensión de von Mises nodal máxima', '0', '101', 'MPa'],
            ['SA-2026-020', 'Ménsula 3D de 4 m con N = 0,5·Np, carga en la punta: carga de primera fluencia', '158,2', '182,7', 'kN'],
            ['SA-2026-009', 'Placa delgada en flexión, ν = 0,3: rigidez relativa a la correcta', '1,000', '1,225', '—'],
          ],
        },

        { k: 'h', t: 'SA-2026-021: viento mínimo sobre cubiertas aisladas' },
        { k: 'p', t: 'Una cubierta aislada (galpón abierto, cochera, tinglado) recibía sólo las presiones netas de las Figuras 2.4-4 a 2.4-7, normales a la cubierta. El §2.1.5 del CIRSOC 102-2025 pide además que la fuerza de viento sobre un edificio abierto no sea menor que 0,75 kN/m² × Af, como estado de carga horizontal propio. Sin ese mínimo, con el viento en la dirección de la cumbrera la fuerza horizontal era cero, y en la otra dirección quedaba por debajo a velocidades bajas y medias. Ahora cada dirección tiene ese estado de carga.' },
        { k: 'ext', href: `${REPO}/SA-2026-021-free-roof-wind-minimum.md`, label: 'SA-2026-021 completo', t: 'El aviso, con las mediciones:' },
        { k: 'h', t: 'SA-2026-022: empuje de suelo resistido por el peso propio' },
        { k: 'p', t: 'Con cargas H, el CIRSOC 101-2025 pide investigar las cargas que no actúan. Las combinaciones 0,9 D + 1,6 H y 1,2 D + 1,6 H nunca se generaban, así que donde el peso propio resiste el empuje (vuelco o deslizamiento de un muro) el efecto quedaba bajo. Ahora se generan, haya o no viento o sismo en el modelo.' },
        { k: 'ext', href: `${REPO}/SA-2026-022-earth-pressure-dead-load-resisting.md`, label: 'SA-2026-022 completo', t: 'El aviso, con el ejemplo:' },
        { k: 'h', t: 'SA-2026-023: columnas de hormigón armado con barras desparejas' },
        { k: 'p', t: 'Los momentos de cada estación llegan a la verificación de columnas como valores absolutos, pero la capacidad a flexión compuesta en un eje se calculaba con un solo signo, con la cara superior comprimida. Con 6, 10, 14, 18 o 22 barras el diseñador pone las barras de más en la cara inferior y en la derecha, así que ese es el signo fuerte: con el momento al revés la capacidad es menor y nunca se verificaba. Una columna de 30×30 cm con 6 Ø20 y 100 kN de compresión resiste 101,57 kN·m en un sentido y 78,57 en el otro, y aprobaba Mu = 100 kN·m. Afecta la verificación de columnas CIRSOC 201 en flexión en un eje (la de las barras que tiene la barra, la del diseñador y la del control del motor); la verificación biaxial ya tomaba el peor cuadrante.' },
        {
          k: 'ul',
          items: [
            'Cómo saber si te afecta: el modelo tiene columnas de hormigón verificadas con CIRSOC 201 cuyas barras no son simétricas respecto del eje de flexión: 6, 10, 14, 18 o 22 barras del diseñador, o caras cargadas a mano con distinta cantidad de barras en caras opuestas.',
            'Qué hacer: en una versión anterior a la corrección, usá disposiciones simétricas (4, 8, 12, 16, 20 o 24 barras, o caras opuestas iguales), o verificá la columna también con las barras espejadas: manda la menor de las dos capacidades.',
            'Estado: corregido en la versión 0.4.0, en stabileo.com desde el 25 de octubre de 2026. El motor calcula los dos signos y toma el más débil; las disposiciones simétricas dan exactamente lo mismo que antes.',
          ],
        },
        { k: 'ext', href: `${REPO}/SA-2026-023-column-moment-sign.md`, label: 'SA-2026-023 completo', t: 'El aviso, con el caso de prueba:' },
        { k: 'h', t: 'SA-2026-024: bases, nudos, losas y tabiques diseñados con las cargas sin mayorar' },
        { k: 'p', t: 'Con combinaciones definidas y ninguna resuelta, las bases y los nudos tomaban el resultado en pantalla, que entonces es todas las cargas a factor 1: se diseñaban con las cargas de servicio en lugar de las combinaciones mayoradas. Pasaba con el cálculo en vivo activado (después de una edición recalcula sólo «Todas las cargas» mientras se ve la vista simple) o cuando falló el cálculo de combinaciones y quedó el cálculo simple. En un pórtico con 1,2D + 1,6W la reacción de una base salía un 15 % baja; con permanente y sobrecarga, entre 29 y 38 %. Lo mismo pasaba con las losas y los tabiques, con el optimizador de acero y con una lista de combinaciones activas vacía. Ahora todo diseño se niega y dice por qué hasta que las combinaciones estén resueltas.' },
        { k: 'ext', href: `${REPO}/SA-2026-024-design-on-unfactored-results.md`, label: 'SA-2026-024 completo', t: 'El aviso, con el ejemplo:' },

        { k: 'h', t: 'SA-2026-014: colapso plástico 3D dependiente de la numeración' },
        { k: 'p', t: 'Con flexión biaxial, los controles que cierran una rótula que gira hacia atrás y reabren una cerrada que sale de la superficie de fluencia podían entrar en ciclo. El solver seguía desde el estado en que el orden de las barras lo dejaba y llevaba una sección cerrada fuera de la superficie de fluencia: la misma estructura, renumerada, informaba factores de colapso entre 75,9 y 424,3, con un valor certificado de 176,47. Ahora el análisis se detiene en el último estado consistente e informa ese factor como cota inferior, con un aviso, el mismo con cualquier numeración. Afecta el pushover de la pestaña Pro en 3D.' },
        { k: 'ext', href: `${REPO}/SA-2026-014-plastic-3d-element-order.md`, label: 'SA-2026-014 completo', t: 'El aviso, con el modelo de prueba y el valor certificado:' },

        { k: 'h', t: 'SA-2026-011: apoyo 3D cambiado de resorte a empotrado' },
        { k: 'p', t: 'Al cambiar el tipo de un apoyo que tenía resortes, el apoyo conservaba las constantes de resorte. En modo 3D se enviaban al solver junto con la restricción, y el solver resolvía ese grado de libertad como elástico: el apoyo dibujado como empotrado se calculaba como un resorte. Afecta los modelos resueltos en modo 3D, incluidos los planos resueltos en 3D; el modo 2D no está afectado.' },
        {
          k: 'ul',
          items: [
            'Cómo saber si te afecta: algún apoyo fue primero un resorte (o tuvo constantes de resorte) y después se cambió a empotrado, articulado o rodillo, o se le tildó un grado de libertad como restringido. En los resultados, ese apoyo muestra un desplazamiento o un giro distinto de cero.',
            'Qué hacer: volvé a resolver en stabileo.com los modelos 3D con apoyos editados de resorte a rígido y compará los resultados cerca de esos apoyos con los que ya usaste.',
            'Estado: corregido en stabileo.com el 20 de octubre de 2026. Todo grado de libertad restringido se resuelve como restringido, también en los proyectos guardados antes.',
          ],
        },
        { k: 'ext', href: `${REPO}/SA-2026-011-springs-on-fixed-supports.md`, label: 'SA-2026-011 completo', t: 'El aviso con la reproducción y el modelo de prueba:' },

        { k: 'h', t: 'SA-2026-013: momentos y tensiones térmicas de las láminas curvas' },
        { k: 'p', t: 'Las láminas curvas (los cuadriláteros marcados como curvos) informaban mx = my = mxy = 0 cualquiera fuera la flexión, y bajo una carga de temperatura sus tensiones conservaban la deformación térmica libre: una lámina libre de dilatarse informaba E·α·ΔT/(1−ν) y una restringida, nada. Además, la aplicación enviaba la temperatura de un cuadrilátero curvo como la de uno plano, y el motor la descartaba: la lámina se calculaba sin calentar. Lo leían las curvas de nivel de láminas (también en las figuras exportadas), la tabla de resultados y el informe PDF de Pro, y el diseño de losas si un paño era un cuadrilátero curvo; las tablas del libro de resultados y el CSV ya dejaban esos momentos en blanco.' },
        {
          k: 'ul',
          items: [
            'Cómo saber si te afecta: el modelo tiene cuadriláteros curvos y usaste sus momentos (curvas de nivel, tabla o informe de Pro, diseño de losas), o tiene una carga de temperatura sobre un cuadrilátero curvo.',
            'Qué hacer: volvé a resolver esos modelos y repetí el diseño o la verificación que leyó sus momentos o sus tensiones bajo temperatura. Mientras tanto, modelá la superficie con cuadriláteros planos (MITC4).',
            'Estado: corregido en la versión 0.3.0, en stabileo.com desde el 21 de octubre de 2026.',
          ],
        },
        { k: 'ext', href: `${REPO}/SA-2026-013-curved-shell-moments-and-thermal.md`, label: 'SA-2026-013 completo', t: 'El aviso, con la ménsula de prueba y los casos térmicos:' },
        { k: 'h', t: 'SA-2026-017: curvas de suelo en la interacción suelo-estructura' },
        { k: 'p', t: 'Las curvas de suelo no seguían las referencias que citaban. La arcilla blanda omitía el término J de Matlock (resistencia última entre un tercio y la mitad baja cerca de la superficie); la arena usaba siempre el factor cíclico A = 0,9 y una tabla de k escalonada; la arcilla rígida saltaba de la mitad a la resistencia total en y50 y caía al 70 % después. Las curvas t-z y q-z (sólo motor y WASM) omitían el perímetro del fuste y el área de la punta. Afecta a PRO → Avanzado → Interacción suelo-estructura. Ahora el panel pide J y el tipo de carga de la arena, y el motor rechaza una curva a la que le falta un dato en lugar de suponerlo. Qué hacer: volvé a resolver esos modelos y revisá desplazamientos y momentos de los pilotes.' },
        { k: 'ext', href: `${REPO}/SA-2026-017-soil-curves.md`, label: 'SA-2026-017 completo', t: 'El aviso, con los valores antes y después de cada curva:' },

        { k: 'h', t: 'SA-2026-019: cargas de temperatura en barras' },
        { k: 'p', t: 'El motor calculaba la carga térmica de toda barra con α = 12·10⁻⁶ /°C (el del acero) y con la altura del rectángulo macizo equivalente, √(12·I/A). En un IPE el momento de un gradiente quedaba un 30 % bajo, y en aluminio la fuerza axil por temperatura casi a la mitad. La aplicación compensaba ambas cosas desde el 7 de octubre de 2026, así que afecta a quien usa el motor o su API WASM directamente, y a los modelos térmicos resueltos en la aplicación antes de esa fecha.' },
        { k: 'ext', href: `${REPO}/SA-2026-019-frame-thermal-alpha-depth.md`, label: 'SA-2026-019 completo', t: 'El aviso, con los casos de prueba:' },
        { k: 'h', t: 'SA-2026-012: esfuerzos de barra en el análisis no lineal de material' },
        { k: 'p', t: 'Después de que una barra fluía, el solver equilibraba las cargas con la rigidez reducida pero informaba los esfuerzos calculados con la rigidez elástica. Desplazamientos y reacciones eran correctos; los esfuerzos de barra y la utilización no: en una ménsula, el momento informado era 100 veces el real. Este solver sólo se usa desde el motor o su API WASM: ninguna pantalla de la aplicación lo llama, así que los resultados obtenidos en stabileo.com no están afectados.' },
        { k: 'ext', href: `${REPO}/SA-2026-012-material-nonlinear-member-forces.md`, label: 'SA-2026-012 completo', t: 'El aviso, con la ménsula de prueba:' },

        { k: 'h', t: 'SA-2026-016: ejes de la sección en los tramos casi verticales de un arco' },
        { k: 'p', t: 'Los tramos rectos de un arco tomaban los ejes locales por defecto de una barra recta, que para una barra a menos de 2,56° de la vertical toman el eje X global como referencia. En un arco fuera del plano X–Z eso giraba 90° la sección de los tramos casi verticales de los arranques: Iy e Iz quedaban intercambiados ahí. En un semicírculo de 40 tramos en el plano Y–Z el descenso de la clave salía un 15 % bajo. Afecta las vigas curvas del motor y los arcos dibujados con la herramienta de arco de la pestaña Barras (PRO) cuando algún tramo queda casi vertical; los arcos en planta no están afectados. Los arcos guardados antes toman los ejes corregidos al abrir el proyecto.' },
        { k: 'ext', href: `${REPO}/SA-2026-016-curved-member-axes.md`, label: 'SA-2026-016 completo', t: 'El aviso, con el arco de prueba:' },
        { k: 'h', t: 'SA-2026-015: tracción de cables con peso propio' },
        { k: 'p', t: 'El análisis de cables usaba el módulo de Ernst, que es la tangente de la ley de la cuerda de un cable que cuelga con su peso, como si fuera una secante desde la cuerda recta. La flecha absorbe longitud de cuerda, así que un cable necesita más tracción que EA·ε para un alargamiento dado, no menos. Donde el equilibrio solo fija la fuerza del cable, la tracción era correcta; donde el cable comparte la carga con otras barras (un mástil arriostrado, un cable que rigidiza un pórtico), el cable quedaba con tracción baja y las barras vecinas con más esfuerzo: en el mástil de prueba, 4,34 kN en lugar de 5,18 kN, y con cargas menores la iteración no convergía. Afecta en la aplicación a los modelos 3D con barras de comportamiento «cable» cuyo material tiene densidad.' },
        {
          k: 'ul',
          items: [
            'Cómo saber si te afecta: el modelo tiene barras con comportamiento «cable», su material tiene densidad y el cable no es el único camino de la carga.',
            'Qué hacer: verificá a mano las tracciones de cables y anclajes que gobiernan, o resolvé sin densidad en el material del cable (sin peso la ley era correcta); con la corrección publicada, volvé a resolver.',
            'Estado: corregido en la versión 0.3.0. El cálculo de cables ahora resuelve por Newton la ley de la cuerda misma.',
          ],
        },
        { k: 'ext', href: `${REPO}/SA-2026-015-cable-tension-chord-law.md`, label: 'SA-2026-015 completo', t: 'El aviso, con el mástil de prueba y la solución cerrada:' },
        { k: 'h', t: 'SA-2026-018: láminas MITC9 sobre geometría curva' },
        { k: 'p', t: 'El elemento MITC9 es plano: proyecta sus nueve nodos sobre un plano. Cuando los nodos intermedios o el central quedaban fuera de ese plano (cualquier malla curva de MITC9) la proyección no tenía la corrección de brazos rígidos del MITC4, así que un giro rígido deformaba el elemento: una malla curva resistía los giros de sus elementos e informaba tensiones por ellos (101 MPa en un parche de prueba girado 1 mrad). Este elemento sólo se usa desde el motor o su API WASM: la aplicación no crea elementos de nueve nodos, así que los resultados obtenidos en stabileo.com no están afectados.' },
        { k: 'ext', href: `${REPO}/SA-2026-018-mitc9-curved-rigid-motion.md`, label: 'SA-2026-018 completo', t: 'El aviso, con el parche de prueba y la semiesfera:' },
        { k: 'h', t: 'SA-2026-020: superficie de fluencia del análisis no lineal de material en 3D' },
        { k: 'p', t: 'En 2D una barra fluye cuando (N/Np)² + |M|/Mp supera 1. En 3D se usaba (N/Np)² + (My/Mpy)² + (Mz/Mpz)², con los cocientes de momento al cuadrado, así que con esfuerzo axil o flexión en los dos ejes la barra 3D fluía más tarde que la misma barra en 2D y la utilización informada quedaba baja: con N = 0,5·Np la carga de primera fluencia salía un 15 % alta. Ahora 3D usa (N/Np)² + |My|/Mpy + |Mz|/Mpz, que en flexión sobre un eje es la de 2D. Este solver sólo se usa desde el motor o su API WASM: ninguna pantalla de la aplicación lo llama, así que los resultados obtenidos en stabileo.com no están afectados.' },
        { k: 'ext', href: `${REPO}/SA-2026-020-material-nonlinear-3d-yield-surface.md`, label: 'SA-2026-020 completo', t: 'El aviso, con los casos de prueba:' },

        { k: 'h', t: 'SA-2026-008: corte basal y participación modal en el análisis espectral' },
        { k: 'p', t: 'Con la regla CQC, el corte basal informado se combinaba igual con SRSS. Los cortes basales de los modos en una dirección tienen el mismo signo, así que CQC da más que SRSS: con dos modos cercanos el valor informado quedaba un 19 % bajo. Además, los factores de participación omitían la masa que la matriz de masa consistente acopla a los apoyos, lo que subestimaba la respuesta en modelos con pocas barras por columna.' },
        {
          k: 'ul',
          items: [
            'Cómo saber si te afecta: hiciste un análisis espectral con CQC y usaste el corte basal informado (por ejemplo, para escalarlo al corte estático), o usaste masa consistente con columnas de uno o dos elementos.',
            'Qué hacer: volvé a resolver en stabileo.com los modelos afectados y compará con los resultados que ya usaste. La alternativa que este aviso daba antes de la corrección ya no corresponde.',
            'Estado: corregido en stabileo.com el 21 de octubre de 2026.',
          ],
        },
        { k: 'ext', href: `${REPO}/SA-2026-008-spectral-combination.md`, label: 'SA-2026-008 completo', t: 'El aviso, con los dos defectos por separado:' },

        { k: 'h', t: 'SA-2026-007: pandeo torsional y flexotorsional en 3D' },
        { k: 'p', t: 'La rigidez geométrica de las barras 3D tenía sólo los términos de flexión: no incluía el término de Wagner ni el acoplamiento con el centro de corte. El pandeo torsional y el flexotorsional nunca aparecían, y se informaba la carga de Euler. En una columna cruciforme la carga informada era un 96 % mayor que la que gobierna.' },
        {
          k: 'ul',
          items: [
            'Cómo saber si te afecta: usaste el factor de pandeo 3D o el análisis P-Delta 3D en estructuras con secciones abiertas de pared delgada y poca rigidez torsional: cruciformes, ángulos simples o dobles, tes, canales. Las secciones doble te con simetría doble, en las que gobierna la flexión, no están afectadas. Las verificaciones de diseño que calculan el pandeo torsional por su cuenta (CIRSOC 301 E.4, desde 0.2.0) tampoco.',
            'Qué hacer: volvé a resolver en stabileo.com los modelos afectados y compará con los resultados que ya usaste. La alternativa que este aviso daba antes de la corrección ya no corresponde.',
            'Estado: corregido en stabileo.com el 21 de octubre de 2026.',
          ],
        },
        { k: 'ext', href: `${REPO}/SA-2026-007-torsional-buckling.md`, label: 'SA-2026-007 completo', t: 'El aviso, con el cálculo de la columna cruciforme:' },

        { k: 'h', t: 'SA-2026-006: modelo plano resuelto en 3D con momentos nodales' },
        { k: 'p', t: 'Un modelo plano resuelto con el solver 3D se ubica en el plano X–Z, donde el giro del plano es un giro alrededor de −Y. Los momentos nodales y los giros impuestos debían cambiar de signo y no lo hacían, así que actuaban como su imagen especular. Combinados con fuerzas, pueden sumarse en lugar de restarse.' },
        {
          k: 'ul',
          items: [
            'Cómo saber si te afecta: el modelo es plano (todos los nodos en un plano), se resolvió en modo 3D y tiene momentos nodales o giros impuestos en apoyos. Los resortes rotacionales no están afectados.',
            'Qué hacer: volvé a resolver en stabileo.com los modelos afectados y compará con los resultados que ya usaste. La alternativa que este aviso daba antes de la corrección ya no corresponde.',
            'Estado: corregido en stabileo.com el 21 de octubre de 2026.',
          ],
        },
        { k: 'ext', href: `${REPO}/SA-2026-006-mirrored-moments-2d-in-3d.md`, label: 'SA-2026-006 completo', t: 'El aviso, con los tres casos de prueba:' },

        { k: 'h', t: 'SA-2026-005: esfuerzo axil en barras inclinadas 2D' },
        { k: 'p', t: 'El armado de cargas 2D pasaba a los nodos extremos la componente de la carga a lo largo de una barra inclinada. Reacciones y desplazamientos eran correctos, pero la barra no veía esa carga en el tramo, así que su esfuerzo axil quedaba constante, igual al promedio de los valores reales en sus extremos: en la base de un cabio, un 26 % bajo. El diagrama, el inspector, la memoria, la exportación a Excel y el dimensionado usaban ese valor. Además, un par aplicado sobre una barra se perdía cuando un modelo plano se resolvía en 3D.' },
        {
          k: 'ul',
          items: [
            'Cómo saber si te afecta: un modelo 2D resuelto desde el 25/09/2026 con barras inclinadas (cabios, escaleras, diagonales, arcos por segmentos) que llevan cargas distribuidas, puntuales o peso propio con componente a lo largo de la barra; o un modelo plano con un par sobre una barra resuelto en 3D. Las barras dimensionadas a compresión son las más expuestas.',
            'Qué hacer: volvé a resolver en stabileo.com los modelos afectados y compará con los resultados que ya usaste. La alternativa que este aviso daba antes de la corrección ya no corresponde.',
            'Estado: corregido en stabileo.com el 21 de octubre de 2026.',
          ],
        },
        { k: 'ext', href: `${REPO}/SA-2026-005-inclined-member-loads.md`, label: 'SA-2026-005 completo', t: 'El aviso, con el cabio y la barra 3-4-5:' },

        { k: 'h', t: 'Corregidos el 19 de octubre de 2026' },
        {
          k: 'ul',
          items: [
            'SA-2026-009: el elemento sólido-lámina SHB8 era un 22 % demasiado rígido en flexión de placas delgadas (bloqueo de Poisson en el espesor), así que subestimaba las flechas en alrededor de un 18 %. Revisá las conclusiones de flecha y vibración de modelos con placas de sólido-lámina resueltos antes de esa fecha; MITC4, MITC9, DKT y la lámina curva no estaban afectados.',
            'SA-2026-010: el certificado del análisis espectral podía aprobar resultados no finitos (NaN). Los números eran visiblemente inválidos; lo equivocado era la afirmación de verificación. No hace falta revisar nada salvo un resultado entregado que mostrara valores no finitos.',
          ],
        },

        { k: 'h', t: 'Corregidos en la versión 0.2.0' },
        { k: 'p', t: 'La versión 0.2.0, del 18 de octubre de 2026, corrigió los cuatro avisos retroactivos. Todos afectan proyectos resueltos antes del 17 de octubre de 2026 y su recomendación es la misma: volver a generar cargas y combinaciones, resolver y revisar las verificaciones, y revisar cualquier entregable emitido con una versión anterior.' },
        {
          k: 'ul',
          items: [
            'SA-2026-001: combinaciones y cargas generadas CIRSOC 101, 102 y 103 del lado inseguro (en un ejemplo, el axil de una columna era un 29 % bajo).',
            'SA-2026-002: verificaciones de hormigón CIRSOC 201 y ACI 318 con capacidad sobrestimada (φMn hasta un 18 % alto).',
            'SA-2026-003: verificaciones de acero, perfiles conformados y uniones con capacidad sobrestimada (corte del alma hasta un 60 % alto).',
            'SA-2026-004: análisis que ignoraban parte del modelo (el sismo con registro de aceleraciones perdía hasta la mitad de la carga; el colapso plástico 3D, hasta 2,3 veces del lado inseguro).',
          ],
        },
        { k: 'ext', href: `${REPO}/README.md`, label: 'Todos los avisos', t: 'La lista completa, con cada aviso, su corrección y su severidad:' },
        { k: 'link', slug: 'how-stabileo-checks-its-results', t: 'Cómo encontramos estos errores, y qué no puede garantizar ninguna verificación:' },
      ],
    },
    en: {
      title: 'Safety advisories: which results changed and what to do',
      excerpt:
        'The Stabileo defects that could give wrong or unconservative results: who they affect, how to tell whether a model is affected, what to do in the meantime and when they were fixed.',
      blocks: [
        { k: 'p', t: 'Stabileo’s results are used to design real structures. When we find a defect that could have produced a wrong result, and especially an unconservative one, we publish it as a safety advisory: what was wrong, which models it affects, how to recognise them, what to do until the fix is live, and what to re-check in results that were already used.' },
        { k: 'p', t: 'Almost all of these defects were found by our own verification programme: comparison against seven other finite-element programs, published worked examples, physical-invariant tests and a review of every element’s derivation. Publishing them is part of that work: a defect that is not reported stays in the calculations that were already delivered.' },
        { k: 'note', t: 'Status as of 28 October 2026: SA-2026-001 to 020 are fixed in version 0.3.0 and SA-2026-021 to 024 in version 0.4.0 (live on stabileo.com, SA-2026-021 and 022 since 22 October and SA-2026-023 and 024 since 25 and 26 October). Publishing them is part of how we verify the results, not a sign that they are still open. An advisory counts as fixed when the fix is live on stabileo.com, not when the change exists. While an advisory is open, use its workaround and check the affected result by hand before signing.' },

        { k: 'h', t: 'Summary' },
        {
          k: 'table',
          caption: 'Published advisories. Severity: critical when capacity or demand could be far on the unsafe side with no visible sign.',
          head: ['Advisory', 'What', 'Severity', 'Status'],
          rows: [
            ['SA-2026-021', 'Free roofs: no wind along the ridge and, across it, less than the §2.1.5 minimum (17 % of it at 20 m/s)', 'High', 'Fixed in 0.4.0'],
            ['SA-2026-022', 'With earth pressure H, the combination where the dead load resists it was missing (27 to 45 % low in an example)', 'High', 'Fixed in 0.4.0'],
            ['SA-2026-023', 'RC columns: the check read one sign of the moment; uneven bar layouts (6, 10, 14…) passed on the stronger side', 'Critical', 'Fixed in 0.4.0'],
            ['SA-2026-024', 'Footings, joints, slabs, walls and the steel optimiser designed for the unfactored loads when combinations were defined and not solved (live calc, a failed combination solve, or an empty active list)', 'High', 'Fixed in 0.4.0'],
            ['SA-2026-013', 'Curved shells: bending moments reported as zero; stresses kept the free thermal strain', 'High', 'Fixed in 0.3.0'],
            ['SA-2026-014', '3D plastic collapse: the factor depended on the element numbering (up to 2.4 times the collapse load)', 'High', 'Fixed in 0.3.0'],
            ['SA-2026-015', 'Cables with self-weight got too little tension in indeterminate structures', 'High', 'Fixed in 0.3.0'],
            ['SA-2026-011', '3D support switched from spring to fixed or pinned, solved as a spring', 'High', 'Fixed 2026-10-20'],
            ['SA-2026-017', 'Soil-structure interaction: p-y, t-z and q-z curves departed from their references', 'High', 'Fixed in 0.3.0'],
            ['SA-2026-008', 'Response spectrum: base shear SRSS under CQC; participation without support-coupled mass', 'High', 'Fixed 2026-10-21'],
            ['SA-2026-007', '3D buckling without torsional or flexural-torsional modes', 'High', 'Fixed 2026-10-21'],
            ['SA-2026-006', 'Plane model solved in 3D: nodal moments and imposed rotations reversed', 'High', 'Fixed 2026-10-21'],
            ['SA-2026-005', '2D inclined members: axial force without the along-member load component', 'High', 'Fixed 2026-10-21'],
            ['SA-2026-019', 'Member temperature loads (engine and WASM; the app compensated since 2026-10-07): steel’s α and a solid rectangle’s depth', 'Medium', 'Fixed in 0.3.0'],
            ['SA-2026-012', 'Material-nonlinear analysis (engine and WASM only): elastic member forces after yield', 'Medium', 'Fixed in 0.3.0'],
            ['SA-2026-016', 'Arcs (engine curved beams, app arc tool): Iy and Iz swapped on near-vertical segments', 'Medium', 'Fixed in 0.3.0'],
            ['SA-2026-018', 'MITC9 shells (engine and WASM only) on curved geometry strained by rigid-body motion', 'Medium', 'Fixed in 0.3.0'],
            ['SA-2026-020', '3D material-nonlinear analysis (engine and WASM only): yield surface less conservative than 2D', 'Medium', 'Fixed in 0.3.0'],
            ['SA-2026-010', 'Spectral certificate passed non-finite results', 'Medium', 'Fixed 2026-10-19'],
            ['SA-2026-009', 'SHB8 solid shell 22 % too stiff in thin-plate bending (deflections 18 % low)', 'Medium (higher in indeterminate structures)', 'Fixed 2026-10-19'],
            ['SA-2026-004', 'Analyses that ignored part of the model (dynamics, buckling, plastic collapse)', 'Critical', 'Fixed in 0.2.0'],
            ['SA-2026-003', 'Steel, cold-formed and connection checks overstated capacity', 'Critical', 'Fixed in 0.2.0'],
            ['SA-2026-002', 'Concrete checks (CIRSOC 201, ACI 318) overstated capacity', 'Critical', 'Fixed in 0.2.0'],
            ['SA-2026-001', 'Generated combinations and loads (CIRSOC 101, 102, 103) unconservative', 'High', 'Fixed in 0.2.0'],
          ],
        },
        {
          k: 'table',
          caption: 'Cases documented in each advisory: the correct value and the one Stabileo reported.',
          head: ['Advisory', 'Case', 'Correct', 'Reported', 'Unit'],
          rows: [
            ['SA-2026-024', 'Portal 6 × 4 m, 20 kN/m dead load on the beam, 15 kN of wind, 1.2D + 1.6W, after an edit with live calc on: vertical reaction of the windward footing', '65.61', '56.01', 'kN'],
            ['SA-2026-023', 'Column 30×30 cm, 6 Ø20 (three on the bottom face), Nu = 100 kN: φMn with the three-bar face compressed', '78.57', '101.57', 'kN·m'],
            ['SA-2026-013', 'Cantilever of four curved shells, 4 × 1 × 0.2 m, 10 kN at the tip: mx at the root element', '35.0', '0', 'kN·m/m'],
            ['SA-2026-014', '10-member space frame (frame3d-2), renumbered: plastic collapse factor', '176.47', '424.3', '—'],
            ['SA-2026-015', '20 m guyed mast, 1 cm² steel guy, 5 kN at the top: guy tension', '5.18', '4.34', 'kN'],
            ['SA-2026-011', 'Beam at 0, 4 and 8 m, support drawn as fixed at 8 m: deflection at that support', '0', '-14.4', 'mm'],
            ['SA-2026-017', 'Soft clay c = 20 kPa, D = 1 m, z = 4 m: ultimate soil resistance p_u', '124', '84', 'kN/m'],
            ['SA-2026-008', 'Two modes at ω and 1.1ω: base shear relative to the CQC value', '1.00', '0.81', '—'],
            ['SA-2026-007', '200×10 mm cruciform column, 1.5 m: critical load', '2993', '5860', 'kN'],
            ['SA-2026-006', 'Portal with nodal moments and forces: sway', '0.92', '2.52', 'mm'],
            ['SA-2026-005', 'Gable rafter: axial force at the base', '-56.67', '-41.67', 'kN'],
            ['SA-2026-019', 'IPE 300 fixed at both ends, 20 °C gradient: end moment', '14.04', '9.76', 'kN·m'],
            ['SA-2026-012', 'Yielded 4 m cantilever, tip load 1.2·Mp/L: moment at the fixed end', '1012.5', '101250', 'kN·m'],
            ['SA-2026-016', 'Semicircular 5 m arch in the Y–Z plane, 40 segments: crown deflection', '-7.29', '-6.18', 'mm'],
            ['SA-2026-018', 'MITC9 cylindrical patch 2×2 m, sag 0.2 m, steel, 50 mm, rigid rotation of 1 mrad: largest nodal von Mises stress', '0', '101', 'MPa'],
            ['SA-2026-020', '3D cantilever 4 m, N = 0.5·Np, tip load: load at first yield', '158.2', '182.7', 'kN'],
            ['SA-2026-009', 'Thin plate in bending, ν = 0.3: stiffness relative to the correct value', '1.000', '1.225', '—'],
          ],
        },

        { k: 'h', t: 'SA-2026-021: minimum wind on free roofs' },
        { k: 'p', t: 'A free roof (an open shed, a carport, a canopy) got only the net pressures of Figures 2.4-4 to 2.4-7, normal to the roof. CIRSOC 102-2025 §2.1.5 also requires the wind force on an open building to be at least 0.75 kN/m² × Af, as a horizontal load case of its own. Without that minimum, with the wind along the ridge the horizontal force was zero, and across it the force fell below the minimum at low and moderate speeds. Each direction now has that load case.' },
        { k: 'ext', href: `${REPO}/SA-2026-021-free-roof-wind-minimum.md`, label: 'SA-2026-021 in full', t: 'The advisory, with the measurements:' },
        { k: 'h', t: 'SA-2026-022: earth pressure resisted by the dead load' },
        { k: 'p', t: 'With H loads, CIRSOC 101-2025 asks for the effects of loads not acting. The combinations 0.9 D + 1.6 H and 1.2 D + 1.6 H were never generated, so where the dead load resists the earth pressure (a wall’s overturning or sliding) the effect came out low. They are generated now, with or without wind or earthquake in the model.' },
        { k: 'ext', href: `${REPO}/SA-2026-022-earth-pressure-dead-load-resisting.md`, label: 'SA-2026-022 in full', t: 'The advisory, with the example:' },
        { k: 'h', t: 'SA-2026-023: RC columns with uneven bar layouts' },
        { k: 'p', t: 'The station moments reach the column check as magnitudes, but the capacity under axial force and bending about one axis was computed for one sign only, with the top face compressed. With 6, 10, 14, 18 or 22 bars the designer puts the extra bars on the bottom and right faces, so that is the strong sign: with the moment reversed the capacity is lower, and it was never checked. A 30×30 cm column with 6 Ø20 under 100 kN of compression carries 101.57 kN·m one way and 78.57 the other, and passed Mu = 100 kN·m. It affects the CIRSOC 201 column check under bending about one axis (of the bars a member has, of the designer, and of the engine’s re-check); the biaxial check already took the worst quadrant.' },
        {
          k: 'ul',
          items: [
            'How to tell if it affects you: the model has concrete columns checked by CIRSOC 201 whose bars are not symmetric about the bending axis: 6, 10, 14, 18 or 22 bars from the designer, or faces entered by hand with a different number of bars on opposite faces.',
            'What to do: on a version before the fix, use symmetric layouts (4, 8, 12, 16, 20 or 24 bars, or equal opposite faces), or check the column also with the bars mirrored: the smaller of the two capacities governs.',
            'Status: fixed in 0.4.0, live on stabileo.com since 25 October 2026. The engine computes both signs and takes the weaker; symmetric layouts give exactly what they gave before.',
          ],
        },
        { k: 'ext', href: `${REPO}/SA-2026-023-column-moment-sign.md`, label: 'Full SA-2026-023', t: 'The advisory, with the test case:' },
        { k: 'h', t: 'SA-2026-024: footings, joints, slabs and walls designed for the unfactored loads' },
        { k: 'p', t: 'With combinations defined and none of them solved, footings and joints read the result on screen, which is then every load at factor 1: they were designed for the service loads instead of the factored combinations. It happened with live calc on (after an edit it re-solves only “All loads” while the single view is on screen) or when the combination solve failed and the single solve stood in. In a portal under 1.2D + 1.6W a footing’s reaction came out 15 % low; with dead and live load, 29 to 38 %. The same happened to slabs and walls, to the steel optimiser and with an empty list of active combinations. Every design now refuses, and says why, until the combinations are solved.' },
        { k: 'ext', href: `${REPO}/SA-2026-024-design-on-unfactored-results.md`, label: 'Full SA-2026-024', t: 'The advisory, with the example:' },

        { k: 'h', t: 'SA-2026-014: 3D plastic collapse depended on the numbering' },
        { k: 'p', t: 'Under biaxial bending, the checks that close a hinge turning backwards and reopen a closed one pushed out of the yield surface could cycle. The solver went on from whichever state the element order left it in and pushed a closed section through the yield surface: the same structure, renumbered, reported collapse factors from 75.9 to 424.3, against a certified 176.47. The analysis now stops at the last consistent state and reports that factor as a lower bound, with a warning, the same for any numbering. It affects the 3D pushover of the Pro tab.' },
        { k: 'ext', href: `${REPO}/SA-2026-014-plastic-3d-element-order.md`, label: 'Full SA-2026-014', t: 'The advisory, with the test model and the certified value:' },

        { k: 'h', t: 'SA-2026-011: 3D support switched from spring to fixed' },
        { k: 'p', t: 'Changing the type of a support that had springs kept its spring constants. In 3D mode they were sent to the solver along with the restraint, and the solver treated that degree of freedom as elastic: the support drawn as fixed was solved as a spring. It affects models solved in 3D mode, including plane models solved in 3D; 2D mode is not affected.' },
        {
          k: 'ul',
          items: [
            'How to tell if you are affected: a support was first a spring (or had spring constants) and was then changed to fixed, pinned or a roller, or had a degree of freedom ticked as restrained. In the results, that support shows a non-zero displacement or rotation.',
            'What to do: re-solve on stabileo.com the 3D models whose supports were edited from springs to rigid, and compare the results near those supports with the ones you already used.',
            'Status: fixed on stabileo.com on 20 October 2026. Every restrained degree of freedom is solved as restrained, including in projects saved before.',
          ],
        },
        { k: 'ext', href: `${REPO}/SA-2026-011-springs-on-fixed-supports.md`, label: 'Full SA-2026-011', t: 'The advisory with the reproduction and the test model:' },

        { k: 'h', t: 'SA-2026-013: curved-shell moments and thermal stresses' },
        { k: 'p', t: 'Curved shells (quads marked as curved) reported mx = my = mxy = 0 whatever the bending, and under a temperature load their stresses kept the free thermal strain: a shell free to expand reported E·α·ΔT/(1−ν), and a restrained one nothing. The app also sent a curved quad’s temperature as a flat quad’s, which the engine dropped: the shell was analysed unheated. These results were read by the shell contour plots (also in exported figures), the Pro results table and PDF report, and the slab design when a panel was a curved quad; the results workbook and CSV already left those moments blank.' },
        {
          k: 'ul',
          items: [
            'How to tell if it affects you: the model has curved quads and you used their moments (contours, the Pro table or report, slab design), or it has a temperature load on a curved quad.',
            'What to do: re-run those models and repeat any design or check that read their moments or their stresses under temperature. Until then, model the surface with flat quads (MITC4).',
            'Status: fixed in 0.3.0, live on stabileo.com since 21 October 2026.',
          ],
        },
        { k: 'ext', href: `${REPO}/SA-2026-013-curved-shell-moments-and-thermal.md`, label: 'Full SA-2026-013', t: 'The advisory, with the test cantilever and the thermal cases:' },
        { k: 'h', t: 'SA-2026-017: soil curves in soil-structure interaction' },
        { k: 'p', t: "The soil curves did not follow the references they cited. Soft clay omitted Matlock's J term (ultimate resistance a third to a half low near the surface); sand always used the cyclic factor A = 0.9 and a stepped k table; stiff clay jumped from half to full resistance at y50 and fell to 70 % beyond. The t-z and q-z curves (engine and WASM only) missed the shaft perimeter and the tip area. It concerns PRO → Advanced → Soil-structure interaction. The panel now asks for J and the sand loading, and the engine refuses a curve missing an input instead of assuming it. What to do: re-run those models and re-check pile deflections and moments." },
        { k: 'ext', href: `${REPO}/SA-2026-017-soil-curves.md`, label: 'Full SA-2026-017', t: 'The advisory, with before and after values for each curve:' },

        { k: 'h', t: 'SA-2026-019: temperature loads on members' },
        { k: 'p', t: 'The engine computed every member’s thermal load with α = 12·10⁻⁶ /°C (steel’s) and with the depth of the equivalent solid rectangle, √(12·I/A). On an IPE a gradient moment came out 30 % low, and on aluminium the axial force from temperature almost half. The app compensated for both since 7 October 2026, so this affects direct use of the engine or its WASM API, and thermal models solved in the app before that date.' },
        { k: 'ext', href: `${REPO}/SA-2026-019-frame-thermal-alpha-depth.md`, label: 'Full SA-2026-019', t: 'The advisory, with the test cases:' },
        { k: 'h', t: 'SA-2026-012: member forces in material-nonlinear analysis' },
        { k: 'p', t: 'After a member yielded, the solver balanced the loads with the reduced stiffness but reported forces computed with the elastic stiffness. Displacements and reactions were right; member forces and utilization were not: in a cantilever the reported moment was 100 times the real one. This solver is only reachable from the engine or its WASM API: no screen in the app calls it, so results obtained on stabileo.com are not affected.' },
        { k: 'ext', href: `${REPO}/SA-2026-012-material-nonlinear-member-forces.md`, label: 'Full SA-2026-012', t: 'The advisory, with the test cantilever:' },

        { k: 'h', t: 'SA-2026-016: section axes on the near-vertical segments of an arch' },
        { k: 'p', t: 'The straight segments of an arc took the default local axes of a straight member, which for a member within 2.56° of vertical take global X as their reference. In an arch outside the X–Z plane that turned the section of the near-vertical segments at the springings by 90°: Iy and Iz were swapped there. In a 40-segment semicircle in the Y–Z plane the crown deflection came out 15 % low. It affects engine curved beams and arcs drawn with the arc tool of the Members tab (PRO) when a segment is nearly vertical; plan curves are not affected. Arcs saved before take the corrected axes when the project is opened.' },
        { k: 'ext', href: `${REPO}/SA-2026-016-curved-member-axes.md`, label: 'Full SA-2026-016', t: 'The advisory, with the test arch:' },
        { k: 'h', t: 'SA-2026-015: tension of cables with self-weight' },
        { k: 'p', t: 'The cable analysis used Ernst\'s modulus, the tangent of the chord law of a cable hanging under its own weight, as if it were a secant from the straight chord. Sag takes up chord length, so a cable needs more tension than EA·ε for a given stretch, not less. Where equilibrium alone fixes the cable force the tension was right; where the cable shares the load with other members (a guyed mast, a cable bracing a frame) the cable got too little tension and the members next to it too much: in the test mast, 4.34 kN instead of 5.18 kN, and with smaller loads the iteration did not converge. In the app it affects 3D models with members whose behaviour is "cable" and whose material has a density.' },
        {
          k: 'ul',
          items: [
            'How to tell: the model has members with the "cable" behaviour, their material has a density, and the cable is not the only load path.',
            'What to do: check the governing cable and anchorage forces by hand, or solve without density on the cable material (without weight the law was right); once the fix is published, re-run.',
            'Status: fixed in 0.3.0. The cable analysis now solves the chord law itself by Newton iteration.',
          ],
        },
        { k: 'ext', href: `${REPO}/SA-2026-015-cable-tension-chord-law.md`, label: 'Full SA-2026-015', t: 'The advisory, with the test mast and its closed form:' },
        { k: 'h', t: 'SA-2026-018: MITC9 shells on curved geometry' },
        { k: 'p', t: 'The MITC9 element is flat: it projects its nine nodes onto one plane. When the midside or centre nodes lay off that plane (any curved MITC9 mesh) the projection lacked the rigid-link correction of the MITC4, so a rigid rotation strained the element: a curved mesh resisted the rotations of its elements and reported stresses for them (101 MPa on a test patch rotated by 1 mrad). This element is used only from the engine or its WASM API: the app creates no nine-node elements, so results obtained on stabileo.com are not affected.' },
        { k: 'ext', href: `${REPO}/SA-2026-018-mitc9-curved-rigid-motion.md`, label: 'Full SA-2026-018', t: 'The advisory, with the test patch and the hemisphere:' },
        { k: 'h', t: 'SA-2026-020: yield surface of 3D material-nonlinear analysis' },
        { k: 'p', t: 'In 2D a member yields when (N/Np)² + |M|/Mp exceeds 1. In 3D the solver used (N/Np)² + (My/Mpy)² + (Mz/Mpz)², with the moment ratios squared, so with axial force or bending about both axes a 3D member yielded later than the same member in 2D and the reported utilization was low: with N = 0.5·Np the load at first yield came out 15 % high. 3D now uses (N/Np)² + |My|/Mpy + |Mz|/Mpz, which for bending about one axis is the 2D surface. This solver is only reachable from the engine or its WASM API: no screen of the app calls it, so results obtained on stabileo.com are not affected.' },
        { k: 'ext', href: `${REPO}/SA-2026-020-material-nonlinear-3d-yield-surface.md`, label: 'Full SA-2026-020', t: 'The advisory, with the test cases:' },

        { k: 'h', t: 'SA-2026-008: base shear and modal participation in spectral analysis' },
        { k: 'p', t: 'With the CQC rule, the reported base shear was still combined with SRSS. The modal base shears in one direction share a sign, so CQC gives more than SRSS: with two close modes the reported value was 19 % low. The participation factors also omitted the mass that the consistent mass matrix couples to the supports, which underestimated the response in models with few elements per column.' },
        {
          k: 'ul',
          items: [
            'How to tell if you are affected: you ran a spectral analysis with CQC and used the reported base shear (for example, to scale it to the static base shear), or you used consistent mass with columns of one or two elements.',
            'What to do: re-solve the affected models on stabileo.com and compare with the results you already used. The workaround this advisory gave before the fix no longer applies.',
            'Status: fixed on stabileo.com on 21 October 2026.',
          ],
        },
        { k: 'ext', href: `${REPO}/SA-2026-008-spectral-combination.md`, label: 'Full SA-2026-008', t: 'The advisory, with the two defects separately:' },

        { k: 'h', t: 'SA-2026-007: torsional and flexural-torsional buckling in 3D' },
        { k: 'p', t: 'The geometric stiffness of 3D members had only the bending terms: no Wagner term and no shear-centre coupling. Torsional and flexural-torsional buckling never appeared, and the Euler load was reported instead. For a cruciform column the reported load was 96 % above the governing one.' },
        {
          k: 'ul',
          items: [
            'How to tell if you are affected: you used the 3D buckling factor or 3D P-Delta for structures with open thin-walled sections of low torsional stiffness: cruciforms, single or double angles, tees, channels. Doubly symmetric I-sections, where flexural buckling governs, are not affected. Design checks that compute torsional buckling themselves (CIRSOC 301 E.4, since 0.2.0) are not affected either.',
            'What to do: re-solve the affected models on stabileo.com and compare with the results you already used. The workaround this advisory gave before the fix no longer applies.',
            'Status: fixed on stabileo.com on 21 October 2026.',
          ],
        },
        { k: 'ext', href: `${REPO}/SA-2026-007-torsional-buckling.md`, label: 'Full SA-2026-007', t: 'The advisory, with the cruciform column worked out:' },

        { k: 'h', t: 'SA-2026-006: plane model solved in 3D with nodal moments' },
        { k: 'p', t: 'A plane model solved by the 3D solver stands in the X–Z plane, where the plane rotation is a rotation about −Y. Nodal moments and imposed rotations had to change sign and did not, so they acted as their mirror image. Combined with forces, they can add instead of cancel.' },
        {
          k: 'ul',
          items: [
            'How to tell if you are affected: the model is flat (all nodes in one plane), was solved in 3D mode and has nodal moments or imposed support rotations. Rotational springs are not affected.',
            'What to do: re-solve the affected models on stabileo.com and compare with the results you already used. The workaround this advisory gave before the fix no longer applies.',
            'Status: fixed on stabileo.com on 21 October 2026.',
          ],
        },
        { k: 'ext', href: `${REPO}/SA-2026-006-mirrored-moments-2d-in-3d.md`, label: 'Full SA-2026-006', t: 'The advisory, with the three test cases:' },

        { k: 'h', t: 'SA-2026-005: axial force in 2D inclined members' },
        { k: 'p', t: 'The 2D load builder moved the along-member component of a load on an inclined member to its end nodes. Reactions and displacements were right, but the member did not see that load in its span, so its axial force stayed constant at the mean of its true end values: 26 % low at the base of a rafter. The diagram, the inspector, the report, the Excel export and the design all used that value. A couple applied on a member was also dropped when a plane model was solved in 3D.' },
        {
          k: 'ul',
          items: [
            'How to tell if you are affected: a 2D model solved since 25/09/2026 with inclined members (rafters, stairs, braces, arches drawn as segments) carrying distributed, point or self-weight loads with a component along the member; or a plane model with a couple on a member solved in 3D. Members designed for compression are the most exposed.',
            'What to do: re-solve the affected models on stabileo.com and compare with the results you already used. The workaround this advisory gave before the fix no longer applies.',
            'Status: fixed on stabileo.com on 21 October 2026.',
          ],
        },
        { k: 'ext', href: `${REPO}/SA-2026-005-inclined-member-loads.md`, label: 'Full SA-2026-005', t: 'The advisory, with the rafter and the 3-4-5 member:' },

        { k: 'h', t: 'Fixed on 19 October 2026' },
        {
          k: 'ul',
          items: [
            'SA-2026-009: the SHB8 solid-shell element was 22 % too stiff in thin-plate bending (Poisson thickness locking), so it underestimated deflections by about 18 %. Re-check deflection and vibration conclusions for models with solid-shell plates solved before that date; MITC4, MITC9, DKT and the curved shell were not affected.',
            'SA-2026-010: the spectral analysis certificate could pass non-finite results (NaN). The numbers were visibly invalid; what was wrong was the verification claim. Nothing needs re-checking unless a delivered result showed non-finite values.',
          ],
        },

        { k: 'h', t: 'Fixed in version 0.2.0' },
        { k: 'p', t: 'Version 0.2.0, of 18 October 2026, fixed the four retroactive advisories. They all affect projects solved before 17 October 2026, and the advice is the same for each: regenerate loads and combinations, solve and review the design checks, and re-check any deliverable issued with an earlier version.' },
        {
          k: 'ul',
          items: [
            'SA-2026-001: generated CIRSOC 101, 102 and 103 combinations and loads on the unsafe side (in one example a column’s axial force was 29 % low).',
            'SA-2026-002: CIRSOC 201 and ACI 318 concrete checks overstated capacity (φMn up to 18 % high).',
            'SA-2026-003: steel, cold-formed and connection checks overstated capacity (web shear up to 60 % high).',
            'SA-2026-004: analyses that ignored part of the model (ground-motion time history lost up to half the earthquake load; 3D plastic collapse up to 2.3 times unsafe).',
          ],
        },
        { k: 'ext', href: `${REPO}/README.md`, label: 'All advisories', t: 'The full list, with each advisory, its fix and its severity:' },
        { k: 'link', slug: 'how-stabileo-checks-its-results', t: 'How we found these defects, and what no verification can guarantee:' },
      ],
    },
    pt: {
      title: 'Avisos de segurança: quais resultados mudaram e o que fazer',
      excerpt:
        'Os defeitos do Stabileo que podiam dar resultados errados ou contra a segurança: a quem afetam, como saber se um modelo foi afetado, o que fazer enquanto isso e quando foram corrigidos.',
      blocks: [
        { k: 'p', t: 'Os resultados do Stabileo são usados para dimensionar estruturas reais. Quando encontramos um defeito que pode ter produzido um resultado errado, e em especial um contra a segurança, publicamos um aviso de segurança: o que estava errado, quais modelos afeta, como reconhecê-los, o que fazer até a correção estar publicada e o que revisar nos resultados que já foram usados.' },
        { k: 'p', t: 'Quase todos esses defeitos foram encontrados pelo nosso próprio programa de verificação: comparação com outros sete programas de elementos finitos, exemplos resolvidos publicados, testes de invariantes físicos e revisão da derivação de cada elemento. Publicá-los faz parte desse trabalho: um defeito que não é informado continua nos cálculos já entregues.' },
        { k: 'note', t: 'Situação em 28 de outubro de 2026: os avisos SA-2026-001 a 020 estão corrigidos na versão 0.3.0 e SA-2026-021 a 024 na versão 0.4.0 (em stabileo.com, SA-2026-021 e 022 desde 22 de outubro e SA-2026-023 e 024 desde 25 e 26). Publicá-los faz parte de como verificamos os resultados, não um sinal de que continuam abertos. Um aviso conta como corrigido quando a correção está publicada em stabileo.com, não quando a mudança existe. Enquanto um aviso estiver aberto, use a alternativa indicada e confira à mão o resultado afetado antes de assinar.' },

        { k: 'h', t: 'Resumo' },
        {
          k: 'table',
          caption: 'Avisos publicados. Severidade: crítica quando a capacidade ou a solicitação podiam ficar muito contra a segurança sem sinal visível.',
          head: ['Aviso', 'O quê', 'Severidade', 'Situação'],
          rows: [
            ['SA-2026-021', 'Coberturas isoladas: sem vento na direção da cumeeira e, na outra, menos que o mínimo do §2.1.5 (17 % dele a 20 m/s)', 'Alta', 'Corrigido em 0.4.0'],
            ['SA-2026-022', 'Com empuxo de solo H faltava a combinação em que o peso próprio o resiste (27 a 45 % baixo num exemplo)', 'Alta', 'Corrigido em 0.4.0'],
            ['SA-2026-023', 'Pilares de concreto armado: a verificação lia um só sinal do momento; com barras desiguais (6, 10, 14…) aprovava com o lado mais forte', 'Crítica', 'Corrigido em 0.4.0'],
            ['SA-2026-024', 'Sapatas, nós, lajes, paredes e o otimizador de aço dimensionados com as cargas sem majorar quando as combinações estavam definidas e não resolvidas (cálculo ao vivo, um cálculo de combinações que falhou ou uma lista ativa vazia)', 'Alta', 'Corrigido em 0.4.0'],
            ['SA-2026-013', 'Cascas curvas: momentos fletores informados como zero; tensões com a deformação térmica livre', 'Alta', 'Corrigido na 0.3.0'],
            ['SA-2026-014', 'Colapso plástico 3D: o fator dependia da numeração das barras (até 2,4 vezes a carga de colapso)', 'Alta', 'Corrigido na 0.3.0'],
            ['SA-2026-015', 'Cabos com peso próprio com tração baixa em estruturas hiperestáticas', 'Alta', 'Corrigido na 0.3.0'],
            ['SA-2026-011', 'Apoio 3D trocado de mola para engaste ou rótula, calculado como mola', 'Alta', 'Corrigido em 20/10/2026'],
            ['SA-2026-017', 'Interação solo-estrutura: curvas p-y, t-z e q-z afastadas de suas referências', 'Alta', 'Corrigido na 0.3.0'],
            ['SA-2026-008', 'Espectro de resposta: cortante basal SRSS com CQC; participação sem a massa acoplada aos apoios', 'Alta', 'Corrigido em 21/10/2026'],
            ['SA-2026-007', 'Flambagem 3D sem modos torcionais nem flexo-torcionais', 'Alta', 'Corrigido em 21/10/2026'],
            ['SA-2026-006', 'Modelo plano resolvido em 3D: momentos nodais e rotações impostas invertidos', 'Alta', 'Corrigido em 21/10/2026'],
            ['SA-2026-005', 'Barras inclinadas 2D: esforço normal sem a componente da carga ao longo da barra', 'Alta', 'Corrigido em 21/10/2026'],
            ['SA-2026-019', 'Cargas de temperatura em barras (motor e WASM; o aplicativo compensava desde 07/10/2026): α do aço e altura de retângulo maciço', 'Média', 'Corrigido na 0.3.0'],
            ['SA-2026-012', 'Análise não linear de material (só motor e WASM): esforços de barra elásticos após o escoamento', 'Média', 'Corrigido na 0.3.0'],
            ['SA-2026-016', 'Arcos (vigas curvas do motor, ferramenta de arco do aplicativo): Iy e Iz trocados nos trechos quase verticais', 'Média', 'Corrigido na 0.3.0'],
            ['SA-2026-018', 'Cascas MITC9 (só motor e WASM) em geometria curva deformadas por um movimento de corpo rígido', 'Média', 'Corrigido na 0.3.0'],
            ['SA-2026-020', 'Análise não linear de material 3D (só motor e WASM): superfície de escoamento menos conservadora que em 2D', 'Média', 'Corrigido na 0.3.0'],
            ['SA-2026-010', 'Certificado espectral aprovado com resultados não finitos', 'Média', 'Corrigido em 19/10/2026'],
            ['SA-2026-009', 'Sólido-casca SHB8 22 % rígido demais na flexão de placas finas (flechas 18 % baixas)', 'Média (maior em estruturas hiperestáticas)', 'Corrigido em 19/10/2026'],
            ['SA-2026-004', 'Análises que ignoravam parte do modelo (dinâmica, flambagem, colapso plástico)', 'Crítica', 'Corrigido na 0.2.0'],
            ['SA-2026-003', 'Verificações de aço, perfis formados a frio e ligações com capacidade superestimada', 'Crítica', 'Corrigido na 0.2.0'],
            ['SA-2026-002', 'Verificações de concreto (CIRSOC 201, ACI 318) com capacidade superestimada', 'Crítica', 'Corrigido na 0.2.0'],
            ['SA-2026-001', 'Combinações e cargas geradas (CIRSOC 101, 102, 103) contra a segurança', 'Alta', 'Corrigido na 0.2.0'],
          ],
        },
        {
          k: 'table',
          caption: 'Casos documentados em cada aviso: o valor correto e o que o Stabileo informava.',
          head: ['Aviso', 'Caso', 'Correto', 'Informado', 'Unidade'],
          rows: [
            ['SA-2026-024', 'Pórtico de 6 × 4 m, 20 kN/m de permanente na viga, 15 kN de vento, 1,2D + 1,6W, depois de uma edição com o cálculo ao vivo: reação vertical da sapata a barlavento', '65.61', '56.01', 'kN'],
            ['SA-2026-023', 'Pilar de 30×30 cm, 6 Ø20 (três na face inferior), Nu = 100 kN: φMn com a face de três barras comprimida', '78,57', '101,57', 'kN·m'],
            ['SA-2026-013', 'Balanço de quatro cascas curvas de 4 × 1 × 0,2 m, 10 kN na ponta: mx no elemento do engaste', '35,0', '0', 'kN·m/m'],
            ['SA-2026-014', 'Pórtico espacial de 10 barras (frame3d-2) renumerado: fator de colapso plástico', '176,47', '424,3', '—'],
            ['SA-2026-015', 'Mastro de 20 m estaiado com cabo de aço de 1 cm², 5 kN no topo: tração do cabo', '5,18', '4,34', 'kN'],
            ['SA-2026-011', 'Viga em 0, 4 e 8 m, apoio desenhado como engaste em 8 m: deslocamento nesse apoio', '0', '-14,4', 'mm'],
            ['SA-2026-017', 'Argila mole c = 20 kPa, D = 1 m, z = 4 m: resistência última do solo p_u', '124', '84', 'kN/m'],
            ['SA-2026-008', 'Dois modos em ω e 1,1ω: cortante basal relativo ao valor CQC', '1,00', '0,81', '—'],
            ['SA-2026-007', 'Pilar cruciforme de 200×10 mm e 1,5 m: carga crítica', '2993', '5860', 'kN'],
            ['SA-2026-006', 'Pórtico com momentos e forças nodais: deslocamento lateral', '0,92', '2,52', 'mm'],
            ['SA-2026-005', 'Caibro de telhado de duas águas: esforço normal na base', '-56,67', '-41,67', 'kN'],
            ['SA-2026-019', 'IPE 300 engastado nas duas extremidades, gradiente de 20 °C: momento na extremidade', '14,04', '9,76', 'kN·m'],
            ['SA-2026-012', 'Balanço de 4 m escoado, carga na ponta 1,2·Mp/L: momento no engaste', '1012,5', '101250', 'kN·m'],
            ['SA-2026-016', 'Arco semicircular de 5 m no plano Y–Z, 40 trechos: deslocamento vertical do fecho', '-7,29', '-6,18', 'mm'],
            ['SA-2026-018', 'Retalho cilíndrico MITC9 de 2×2 m, flecha 0,2 m, aço, 50 mm, giro rígido de 1 mrad: maior tensão de von Mises nodal', '0', '101', 'MPa'],
            ['SA-2026-020', 'Balanço 3D de 4 m com N = 0,5·Np, carga na ponta: carga de primeiro escoamento', '158,2', '182,7', 'kN'],
            ['SA-2026-009', 'Placa fina em flexão, ν = 0,3: rigidez relativa à correta', '1,000', '1,225', '—'],
          ],
        },

        { k: 'h', t: 'SA-2026-021: vento mínimo sobre coberturas isoladas' },
        { k: 'p', t: 'Uma cobertura isolada (galpão aberto, garagem, telheiro) recebia só as pressões líquidas das Figuras 2.4-4 a 2.4-7, normais à cobertura. O §2.1.5 do CIRSOC 102-2025 pede também que a força de vento sobre um edifício aberto não seja menor que 0,75 kN/m² × Af, como caso de carga horizontal próprio. Sem esse mínimo, com o vento na direção da cumeeira a força horizontal era zero, e na outra direção ficava abaixo dele a velocidades baixas e médias. Agora cada direção tem esse caso de carga.' },
        { k: 'ext', href: `${REPO}/SA-2026-021-free-roof-wind-minimum.md`, label: 'SA-2026-021 completo', t: 'O aviso, com as medições:' },
        { k: 'h', t: 'SA-2026-022: empuxo de solo resistido pelo peso próprio' },
        { k: 'p', t: 'Com cargas H, o CIRSOC 101-2025 pede investigar as cargas que não atuam. As combinações 0,9 D + 1,6 H e 1,2 D + 1,6 H nunca eram geradas, então onde o peso próprio resiste ao empuxo (tombamento ou deslizamento de um muro) o efeito ficava baixo. Agora são geradas, haja ou não vento ou sismo no modelo.' },
        { k: 'ext', href: `${REPO}/SA-2026-022-earth-pressure-dead-load-resisting.md`, label: 'SA-2026-022 completo', t: 'O aviso, com o exemplo:' },
        { k: 'h', t: 'SA-2026-023: pilares de concreto armado com barras desiguais' },
        { k: 'p', t: 'Os momentos de cada estação chegam à verificação de pilares como valores absolutos, mas a capacidade à flexão composta em um eixo era calculada com um só sinal, com a face superior comprimida. Com 6, 10, 14, 18 ou 22 barras o dimensionador põe as barras a mais na face inferior e na direita, então esse é o sinal forte: com o momento invertido a capacidade é menor e nunca era verificada. Um pilar de 30×30 cm com 6 Ø20 e 100 kN de compressão resiste 101,57 kN·m em um sentido e 78,57 no outro, e aprovava Mu = 100 kN·m. Afeta a verificação de pilares CIRSOC 201 em flexão em um eixo (a das barras que a barra tem, a do dimensionador e a do controle do motor); a verificação biaxial já tomava o pior quadrante.' },
        {
          k: 'ul',
          items: [
            'Como saber se afeta você: o modelo tem pilares de concreto verificados com CIRSOC 201 cujas barras não são simétricas em relação ao eixo de flexão: 6, 10, 14, 18 ou 22 barras do dimensionador, ou faces preenchidas à mão com quantidades diferentes de barras em faces opostas.',
            'O que fazer: numa versão anterior à correção, use disposições simétricas (4, 8, 12, 16, 20 ou 24 barras, ou faces opostas iguais), ou verifique o pilar também com as barras espelhadas: vale a menor das duas capacidades.',
            'Situação: corrigido na versão 0.4.0, em stabileo.com desde 25 de outubro de 2026. O motor calcula os dois sinais e toma o mais fraco; as disposições simétricas dão exatamente o mesmo que antes.',
          ],
        },
        { k: 'ext', href: `${REPO}/SA-2026-023-column-moment-sign.md`, label: 'SA-2026-023 completo', t: 'O aviso, com o caso de teste:' },
        { k: 'h', t: 'SA-2026-024: sapatas, nós, lajes e paredes dimensionados com as cargas sem majorar' },
        { k: 'p', t: 'Com combinações definidas e nenhuma resolvida, as sapatas e os nós liam o resultado na tela, que então é todas as cargas a fator 1: eram dimensionados com as cargas de serviço em vez das combinações majoradas. Acontecia com o cálculo ao vivo ligado (depois de uma edição recalcula só «Todas as cargas» enquanto se vê a vista simples) ou quando o cálculo das combinações falhou e ficou o cálculo simples. Num pórtico com 1,2D + 1,6W a reação de uma sapata saía 15 % baixa; com permanente e sobrecarga, entre 29 e 38 %. O mesmo acontecia com as lajes e as paredes, com o otimizador de aço e com uma lista de combinações ativas vazia. Agora todo dimensionamento se recusa, e diz por quê, até as combinações estarem resolvidas.' },
        { k: 'ext', href: `${REPO}/SA-2026-024-design-on-unfactored-results.md`, label: 'SA-2026-024 completo', t: 'O aviso, com o exemplo:' },

        { k: 'h', t: 'SA-2026-014: colapso plástico 3D dependente da numeração' },
        { k: 'p', t: 'Com flexão biaxial, as verificações que fecham uma rótula que gira para trás e reabrem uma fechada que sai da superfície de escoamento podiam entrar em ciclo. O solver seguia a partir do estado em que a ordem das barras o deixava e levava uma seção fechada para fora da superfície de escoamento: a mesma estrutura, renumerada, informava fatores de colapso entre 75,9 e 424,3, com um valor certificado de 176,47. Agora a análise para no último estado consistente e informa esse fator como limite inferior, com um aviso, o mesmo com qualquer numeração. Afeta o pushover da aba Pro em 3D.' },
        { k: 'ext', href: `${REPO}/SA-2026-014-plastic-3d-element-order.md`, label: 'SA-2026-014 completo', t: 'O aviso, com o modelo de teste e o valor certificado:' },

        { k: 'h', t: 'SA-2026-011: apoio 3D trocado de mola para engaste' },
        { k: 'p', t: 'Ao trocar o tipo de um apoio que tinha molas, o apoio mantinha as constantes de mola. No modo 3D elas iam para o solver junto com a restrição, e o solver tratava esse grau de liberdade como elástico: o apoio desenhado como engaste era calculado como mola. Afeta modelos resolvidos no modo 3D, inclusive modelos planos resolvidos em 3D; o modo 2D não é afetado.' },
        {
          k: 'ul',
          items: [
            'Como saber se você foi afetado: algum apoio foi primeiro uma mola (ou teve constantes de mola) e depois foi trocado para engaste, rótula ou rolete, ou teve um grau de liberdade marcado como restringido. Nos resultados, esse apoio mostra deslocamento ou rotação diferente de zero.',
            'O que fazer: resolva de novo em stabileo.com os modelos 3D com apoios editados de mola para rígido e compare os resultados perto desses apoios com os que você já usou.',
            'Situação: corrigido em stabileo.com em 20 de outubro de 2026. Todo grau de liberdade restringido é resolvido como restringido, inclusive em projetos salvos antes.',
          ],
        },
        { k: 'ext', href: `${REPO}/SA-2026-011-springs-on-fixed-supports.md`, label: 'SA-2026-011 completo', t: 'O aviso com a reprodução e o modelo de teste:' },

        { k: 'h', t: 'SA-2026-013: momentos e tensões térmicas das cascas curvas' },
        { k: 'p', t: 'As cascas curvas (os quadriláteros marcados como curvos) informavam mx = my = mxy = 0 qualquer que fosse a flexão, e sob uma carga de temperatura suas tensões mantinham a deformação térmica livre: uma casca livre para dilatar informava E·α·ΔT/(1−ν), e uma restringida, nada. Além disso, o aplicativo enviava a temperatura de um quadrilátero curvo como a de um plano, e o motor a descartava: a casca era calculada sem aquecimento. Esses resultados eram lidos pelas curvas de nível de cascas (também nas figuras exportadas), pela tabela de resultados e pelo relatório PDF do Pro, e pelo dimensionamento de lajes quando um painel era um quadrilátero curvo; as tabelas da pasta de resultados e o CSV já deixavam esses momentos em branco.' },
        {
          k: 'ul',
          items: [
            'Como saber se afeta você: o modelo tem quadriláteros curvos e você usou seus momentos (curvas de nível, tabela ou relatório do Pro, dimensionamento de lajes), ou tem uma carga de temperatura num quadrilátero curvo.',
            'O que fazer: resolva de novo esses modelos e repita o dimensionamento ou a verificação que leu seus momentos ou suas tensões sob temperatura. Enquanto isso, modele a superfície com quadriláteros planos (MITC4).',
            'Situação: corrigido na versão 0.3.0, no ar em stabileo.com desde 21 de outubro de 2026.',
          ],
        },
        { k: 'ext', href: `${REPO}/SA-2026-013-curved-shell-moments-and-thermal.md`, label: 'SA-2026-013 completo', t: 'O aviso, com o balanço de teste e os casos térmicos:' },
        { k: 'h', t: 'SA-2026-017: curvas de solo na interação solo-estrutura' },
        { k: 'p', t: 'As curvas de solo não seguiam as referências que citavam. A argila mole omitia o termo J de Matlock (resistência última entre um terço e a metade baixa perto da superfície); a areia usava sempre o fator cíclico A = 0,9 e uma tabela de k em degraus; a argila rígida saltava da metade para a resistência total em y50 e caía a 70 % depois. As curvas t-z e q-z (só motor e WASM) omitiam o perímetro do fuste e a área da ponta. Afeta PRO → Avançado → Interação solo-estrutura. Agora o painel pede J e o tipo de carregamento da areia, e o motor recusa uma curva sem um dado em vez de supô-lo. O que fazer: resolva esses modelos novamente e revise deslocamentos e momentos das estacas.' },
        { k: 'ext', href: `${REPO}/SA-2026-017-soil-curves.md`, label: 'SA-2026-017 completo', t: 'O aviso, com os valores antes e depois de cada curva:' },

        { k: 'h', t: 'SA-2026-019: cargas de temperatura em barras' },
        { k: 'p', t: 'O motor calculava a carga térmica de toda barra com α = 12·10⁻⁶ /°C (o do aço) e com a altura do retângulo maciço equivalente, √(12·I/A). Num IPE o momento de um gradiente ficava 30 % baixo, e em alumínio a força normal por temperatura quase a metade. O aplicativo compensava as duas coisas desde 7 de outubro de 2026, então afeta quem usa o motor ou sua API WASM diretamente, e os modelos térmicos resolvidos no aplicativo antes dessa data.' },
        { k: 'ext', href: `${REPO}/SA-2026-019-frame-thermal-alpha-depth.md`, label: 'SA-2026-019 completo', t: 'O aviso, com os casos de teste:' },
        { k: 'h', t: 'SA-2026-012: esforços de barra na análise não linear de material' },
        { k: 'p', t: 'Depois que uma barra escoava, o solver equilibrava as cargas com a rigidez reduzida, mas informava os esforços calculados com a rigidez elástica. Deslocamentos e reações estavam corretos; esforços de barra e utilização não: num balanço, o momento informado era 100 vezes o real. Este solver só é usado a partir do motor ou da sua API WASM: nenhuma tela do aplicativo o chama, então os resultados obtidos em stabileo.com não são afetados.' },
        { k: 'ext', href: `${REPO}/SA-2026-012-material-nonlinear-member-forces.md`, label: 'SA-2026-012 completo', t: 'O aviso, com o balanço de teste:' },

        { k: 'h', t: 'SA-2026-016: eixos da seção nos trechos quase verticais de um arco' },
        { k: 'p', t: 'Os trechos retos de um arco tomavam os eixos locais padrão de uma barra reta, que para uma barra a menos de 2,56° da vertical tomam o eixo X global como referência. Num arco fora do plano X–Z isso girava em 90° a seção dos trechos quase verticais dos arranques: Iy e Iz ficavam trocados ali. Num semicírculo de 40 trechos no plano Y–Z o deslocamento do fecho saía 15 % baixo. Afeta as vigas curvas do motor e os arcos desenhados com a ferramenta de arco da aba Barras (PRO) quando algum trecho fica quase vertical; os arcos em planta não são afetados. Os arcos salvos antes recebem os eixos corrigidos ao abrir o projeto.' },
        { k: 'ext', href: `${REPO}/SA-2026-016-curved-member-axes.md`, label: 'SA-2026-016 completo', t: 'O aviso, com o arco de teste:' },
        { k: 'h', t: 'SA-2026-015: tração de cabos com peso próprio' },
        { k: 'p', t: 'A análise de cabos usava o módulo de Ernst, que é a tangente da lei da corda de um cabo pendurado sob o próprio peso, como se fosse uma secante a partir da corda reta. A flecha consome comprimento de corda, então um cabo precisa de mais tração que EA·ε para um dado alongamento, não menos. Onde o equilíbrio sozinho fixa a força do cabo, a tração estava certa; onde o cabo divide a carga com outras barras (um mastro estaiado, um cabo que contraventa um pórtico), o cabo ficava com tração baixa e as barras vizinhas com esforço a mais: no mastro de teste, 4,34 kN em vez de 5,18 kN, e com cargas menores a iteração não convergia. No aplicativo afeta modelos 3D com barras de comportamento «cabo» cujo material tem densidade.' },
        {
          k: 'ul',
          items: [
            'Como saber se afeta você: o modelo tem barras com comportamento «cabo», o material delas tem densidade e o cabo não é o único caminho da carga.',
            'O que fazer: confira à mão as trações de cabos e ancoragens que governam, ou resolva sem densidade no material do cabo (sem peso a lei estava certa); com a correção publicada, resolva de novo.',
            'Estado: corrigido na versão 0.3.0. A análise de cabos agora resolve a própria lei da corda por Newton.',
          ],
        },
        { k: 'ext', href: `${REPO}/SA-2026-015-cable-tension-chord-law.md`, label: 'SA-2026-015 completo', t: 'O aviso, com o mastro de teste e a solução fechada:' },
        { k: 'h', t: 'SA-2026-018: cascas MITC9 em geometria curva' },
        { k: 'p', t: 'O elemento MITC9 é plano: projeta seus nove nós sobre um plano. Quando os nós intermediários ou o central ficavam fora desse plano (qualquer malha curva de MITC9) a projeção não tinha a correção de braços rígidos do MITC4, então um giro rígido deformava o elemento: uma malha curva resistia aos giros de seus elementos e informava tensões por eles (101 MPa em um retalho de teste girado 1 mrad). Este elemento só é usado pelo motor ou sua API WASM: o aplicativo não cria elementos de nove nós, então os resultados obtidos em stabileo.com não são afetados.' },
        { k: 'ext', href: `${REPO}/SA-2026-018-mitc9-curved-rigid-motion.md`, label: 'SA-2026-018 completo', t: 'O aviso, com o retalho de teste e a semiesfera:' },
        { k: 'h', t: 'SA-2026-020: superfície de escoamento da análise não linear de material em 3D' },
        { k: 'p', t: 'Em 2D uma barra escoa quando (N/Np)² + |M|/Mp passa de 1. Em 3D usava-se (N/Np)² + (My/Mpy)² + (Mz/Mpz)², com as razões de momento ao quadrado, então com esforço axial ou flexão nos dois eixos a barra 3D escoava mais tarde que a mesma barra em 2D e a utilização informada ficava baixa: com N = 0,5·Np a carga de primeiro escoamento saía 15 % alta. Agora 3D usa (N/Np)² + |My|/Mpy + |Mz|/Mpz, que em flexão sobre um eixo é a de 2D. Este solver só é usado a partir do motor ou da sua API WASM: nenhuma tela do aplicativo o chama, então os resultados obtidos em stabileo.com não são afetados.' },
        { k: 'ext', href: `${REPO}/SA-2026-020-material-nonlinear-3d-yield-surface.md`, label: 'SA-2026-020 completo', t: 'O aviso, com os casos de teste:' },

        { k: 'h', t: 'SA-2026-008: cortante basal e participação modal na análise espectral' },
        { k: 'p', t: 'Com a regra CQC, o cortante basal informado continuava combinado com SRSS. Os cortantes basais modais numa direção têm o mesmo sinal, então CQC dá mais que SRSS: com dois modos próximos o valor informado ficava 19 % baixo. Além disso, os fatores de participação omitiam a massa que a matriz de massa consistente acopla aos apoios, o que subestimava a resposta em modelos com poucos elementos por pilar.' },
        {
          k: 'ul',
          items: [
            'Como saber se você foi afetado: fez uma análise espectral com CQC e usou o cortante basal informado (por exemplo, para escalá-lo ao cortante estático), ou usou massa consistente com pilares de um ou dois elementos.',
            'O que fazer: resolva de novo em stabileo.com os modelos afetados e compare com os resultados que você já usou. A alternativa que este aviso dava antes da correção não se aplica mais.',
            'Situação: corrigido em stabileo.com em 21 de outubro de 2026.',
          ],
        },
        { k: 'ext', href: `${REPO}/SA-2026-008-spectral-combination.md`, label: 'SA-2026-008 completo', t: 'O aviso, com os dois defeitos separados:' },

        { k: 'h', t: 'SA-2026-007: flambagem torcional e flexo-torcional em 3D' },
        { k: 'p', t: 'A rigidez geométrica das barras 3D tinha só os termos de flexão: sem o termo de Wagner e sem o acoplamento com o centro de cisalhamento. A flambagem torcional e a flexo-torcional nunca apareciam, e era informada a carga de Euler. Num pilar cruciforme, a carga informada era 96 % maior que a que governa.' },
        {
          k: 'ul',
          items: [
            'Como saber se você foi afetado: usou o fator de flambagem 3D ou o P-Delta 3D em estruturas com seções abertas de parede fina e pouca rigidez à torção: cruciformes, cantoneiras simples ou duplas, tês, perfis U. Perfis I com dupla simetria, em que governa a flexão, não são afetados. As verificações de projeto que calculam a flambagem torcional por conta própria (CIRSOC 301 E.4, desde a 0.2.0) também não.',
            'O que fazer: resolva de novo em stabileo.com os modelos afetados e compare com os resultados que você já usou. A alternativa que este aviso dava antes da correção não se aplica mais.',
            'Situação: corrigido em stabileo.com em 21 de outubro de 2026.',
          ],
        },
        { k: 'ext', href: `${REPO}/SA-2026-007-torsional-buckling.md`, label: 'SA-2026-007 completo', t: 'O aviso, com o cálculo do pilar cruciforme:' },

        { k: 'h', t: 'SA-2026-006: modelo plano resolvido em 3D com momentos nodais' },
        { k: 'p', t: 'Um modelo plano resolvido pelo solver 3D fica no plano X–Z, onde a rotação do plano é uma rotação em torno de −Y. Os momentos nodais e as rotações impostas deviam trocar de sinal e não trocavam, então agiam como sua imagem espelhada. Combinados com forças, podem somar em vez de subtrair.' },
        {
          k: 'ul',
          items: [
            'Como saber se você foi afetado: o modelo é plano (todos os nós num plano), foi resolvido no modo 3D e tem momentos nodais ou rotações impostas nos apoios. As molas rotacionais não são afetadas.',
            'O que fazer: resolva de novo em stabileo.com os modelos afetados e compare com os resultados que você já usou. A alternativa que este aviso dava antes da correção não se aplica mais.',
            'Situação: corrigido em stabileo.com em 21 de outubro de 2026.',
          ],
        },
        { k: 'ext', href: `${REPO}/SA-2026-006-mirrored-moments-2d-in-3d.md`, label: 'SA-2026-006 completo', t: 'O aviso, com os três casos de teste:' },

        { k: 'h', t: 'SA-2026-005: esforço normal em barras inclinadas 2D' },
        { k: 'p', t: 'A montagem de cargas 2D passava aos nós extremos a componente da carga ao longo de uma barra inclinada. Reações e deslocamentos estavam certos, mas a barra não via essa carga no vão, então seu esforço normal ficava constante, igual à média dos valores reais nas extremidades: na base de um caibro, 26 % baixo. O diagrama, o inspetor, o memorial, a exportação para Excel e o dimensionamento usavam esse valor. Além disso, um binário aplicado numa barra se perdia quando um modelo plano era resolvido em 3D.' },
        {
          k: 'ul',
          items: [
            'Como saber se você foi afetado: um modelo 2D resolvido desde 25/09/2026 com barras inclinadas (caibros, escadas, diagonais, arcos por segmentos) com cargas distribuídas, concentradas ou peso próprio com componente ao longo da barra; ou um modelo plano com um binário numa barra resolvido em 3D. As barras dimensionadas à compressão são as mais expostas.',
            'O que fazer: resolva de novo em stabileo.com os modelos afetados e compare com os resultados que você já usou. A alternativa que este aviso dava antes da correção não se aplica mais.',
            'Situação: corrigido em stabileo.com em 21 de outubro de 2026.',
          ],
        },
        { k: 'ext', href: `${REPO}/SA-2026-005-inclined-member-loads.md`, label: 'SA-2026-005 completo', t: 'O aviso, com o caibro e a barra 3-4-5:' },

        { k: 'h', t: 'Corrigidos em 19 de outubro de 2026' },
        {
          k: 'ul',
          items: [
            'SA-2026-009: o elemento sólido-casca SHB8 era 22 % rígido demais na flexão de placas finas (travamento de Poisson na espessura), então subestimava as flechas em cerca de 18 %. Revise as conclusões de flecha e vibração de modelos com placas de sólido-casca resolvidos antes dessa data; MITC4, MITC9, DKT e a casca curva não eram afetados.',
            'SA-2026-010: o certificado da análise espectral podia aprovar resultados não finitos (NaN). Os números eram visivelmente inválidos; o errado era a afirmação de verificação. Não é preciso revisar nada, a menos que um resultado entregue mostrasse valores não finitos.',
          ],
        },

        { k: 'h', t: 'Corrigidos na versão 0.2.0' },
        { k: 'p', t: 'A versão 0.2.0, de 18 de outubro de 2026, corrigiu os quatro avisos retroativos. Todos afetam projetos resolvidos antes de 17 de outubro de 2026, e a recomendação é a mesma: gerar de novo cargas e combinações, resolver e revisar as verificações, e revisar qualquer entrega emitida com uma versão anterior.' },
        {
          k: 'ul',
          items: [
            'SA-2026-001: combinações e cargas geradas CIRSOC 101, 102 e 103 contra a segurança (num exemplo, o esforço normal de um pilar ficava 29 % baixo).',
            'SA-2026-002: verificações de concreto CIRSOC 201 e ACI 318 com capacidade superestimada (φMn até 18 % alto).',
            'SA-2026-003: verificações de aço, perfis formados a frio e ligações com capacidade superestimada (cisalhamento da alma até 60 % alto).',
            'SA-2026-004: análises que ignoravam parte do modelo (o sismo por acelerograma perdia até metade da carga; o colapso plástico 3D, até 2,3 vezes contra a segurança).',
          ],
        },
        { k: 'ext', href: `${REPO}/README.md`, label: 'Todos os avisos', t: 'A lista completa, com cada aviso, sua correção e sua severidade:' },
        { k: 'link', slug: 'how-stabileo-checks-its-results', t: 'Como encontramos esses defeitos, e o que nenhuma verificação pode garantir:' },
      ],
    },
  },
};
