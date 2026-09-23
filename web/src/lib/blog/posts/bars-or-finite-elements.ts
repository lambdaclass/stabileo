/**
 * The fifth post: bars or finite elements — not two methods, two models.
 *
 * It is the pillar of a series. Its job is to set the frame the later posts
 * hang from (deep beams, walls, flat slabs, the joint, shear locking), so it
 * links out to its neighbours instead of repeating them.
 *
 * ── The thesis, and why it is phrased this way ──
 *
 * "Stiffness method versus finite elements" is the question as people ask it,
 * and it is a false opposition: for a prismatic Euler-Bernoulli member the
 * textbook stiffness matrix IS the finite-element matrix built on cubic
 * Hermite shape functions, and it is exact. What differs between the two modes
 * is the model — a 1D beam theory against a discretised 2D continuum — so the
 * post argues that, and a reader who knows the subject nods instead of
 * closing the tab.
 *
 * ── The numbers ──
 *
 * Every figure was computed with this repository's engine (`solve_2d` for
 * bars, `solve_3d` with MITC4+EAS quads for shells) before a word was written.
 *
 *   · Hermite exactness: a 6 m simply supported 20×60 beam, 10 kN/m,
 *     E = 30 000 MPa, split into 2, 4, 10 and 50 frame elements. Midspan
 *     deflection 1.562500 mm every time, which is 5qL⁴/384EI.
 *   · The slenderness table: the same span and load, b = 0.20 m, ν = 0.2,
 *     h from 0.30 to 3.00 m. The shell is meshed in the beam's plane with 24
 *     elements through the depth (16 changes the fourth digit), the load on the
 *     top edge, and both end sections restrained vertically over their full
 *     depth — the beam-theory support, without a point-support singularity.
 *     Deflection is read on the axis at midspan. Bars land 0.5 / 2.1 / 7.9 /
 *     19.1 / 34.3 % low.
 *   · The hand check at L/h = 3: Timoshenko's shear term qL²/(8κGA) with
 *     κ = 5/6 is 0.0108 mm, giving 0.0530 mm; the Timoshenko-Goodier
 *     plane-stress closed form gives 0.0523 mm; the shell 0.0521 mm.
 *   · The walls: t = 0.20 m, base fixed along its length, 100 kN spread along
 *     the top edge, shell meshes up to 48 elements along the length. Bar
 *     stiffness overstated by 2.23 / 1.69 / 1.31 / 1.17 / 1.08.
 *   · The two-wall share (4 m and 2 m long, both 3 m tall, tied at the top) is
 *     parallel springs on those displacements: the short wall takes 11.1 % of
 *     the shear with bars and 17.6 % with shells.
 *
 * They are quoted to the precision they were computed at. If one ever needs
 * changing, recompute it — do not adjust it to read better.
 *
 * ── The claim about other software ──
 *
 * Deliberately narrow, and consistent with the conceptual-tools post: bars and
 * shells in one model is industry standard (SAP2000, ETABS, Robot, midas) and
 * the post says so; those programs do not explain what they compute, and the
 * teaching tools (Ftool, MASTAN2) stop at bars. The claim is the conjunction —
 * learning the method and using a fuller model in the same program — and it is
 * worded as "we know of no other", not as a superlative.
 */
import type { Post } from '../types';

export const barsOrFiniteElements: Post = {
  slug: 'bars-or-finite-elements',
  date: '2026-09-23',
  order: 5,
  authors: ['Bautista Chesta'],
  tagKeys: ['blog.tag.theory', 'blog.tag.education'],
  i18n: {
    es: {
      title: '¿Barras o elementos finitos? No son dos métodos, son dos modelos',
      excerpt:
        'El método de las rigideces no compite con los elementos finitos: para una barra es su caso exacto. Lo que cambia es el modelo, y en una viga de canto grande el de barras da una flecha entre 19 y 34 % menor.',
      blocks: [
        { k: 'p', t: '«¿Lo calculo con el método de las rigideces o con elementos finitos?» es una pregunta que se escucha en cualquier cátedra y en cualquier oficina de cálculo, y está mal planteada. No porque la respuesta sea difícil, sino porque las dos opciones no compiten entre sí.' },
        { k: 'p', t: 'El método de las rigideces es el método de los elementos finitos aplicado a barras. Entre un programa «de barras» y uno «de elementos finitos» no cambia el método: cambia el modelo. Una barra es una teoría unidimensional de cómo se deforma una pieza; una cáscara es un continuo bidimensional discretizado. Elegir entre los dos es una decisión de ingeniería, y esta nota es sobre cuándo tomarla y qué cuesta equivocarse.' },

        { k: 'h', t: 'Una barra recta no necesita malla' },
        { k: 'p', t: 'En elementos finitos, el desplazamiento dentro de cada elemento se aproxima con funciones de forma. Para una barra que flexiona, las habituales son los polinomios cúbicos de Hermite. Y la ecuación de la viga de Euler-Bernoulli sin carga en el tramo tiene como solución, justamente, un polinomio cúbico: la aproximación coincide con la solución exacta.' },
        { k: 'p', t: 'Por eso la matriz de rigidez de una barra prismática que figura en cualquier libro de análisis matricial es exacta, y por eso dividir una barra en más pedazos no mejora nada. Con carga repartida pasa lo mismo en los nudos, siempre que las cargas nodales equivalentes se calculen de forma consistente.' },
        {
          k: 'table',
          caption: 'Viga simplemente apoyada de 6 m, sección 20×60, 10 kN/m, E = 30 000 MPa. Flecha en el centro, con la viga dividida en distinta cantidad de barras.',
          head: ['Barras en que se divide la viga', 'Flecha en el centro [mm]'],
          rows: [
            ['2', '1,5625'],
            ['4', '1,5625'],
            ['10', '1,5625'],
            ['50', '1,5625'],
            ['Fórmula cerrada 5qL⁴/384EI', '1,5625'],
          ],
        },
        { k: 'p', t: 'Con dos barras o con cincuenta, el motor da el mismo número, y es el de la fórmula cerrada.' },
        { k: 'quote', t: 'Mallar una barra recta no la hace más precisa: la hace más lenta.' },
        { k: 'note', t: 'Esa exactitud vale dentro de la teoría de vigas. La matriz resuelve exactamente la ecuación de Euler-Bernoulli; si la pieza no se comporta como una viga de Euler-Bernoulli, que la ecuación esté bien resuelta no sirve de nada. De eso trata el resto de la nota.' },

        { k: 'h', t: 'Dónde se separan' },
        { k: 'p', t: 'La teoría de Euler-Bernoulli supone que las secciones planas siguen planas y perpendiculares al eje, lo que equivale a decir que la pieza no se deforma por corte. En una viga esbelta es una muy buena aproximación. En una de canto grande deja de serlo.' },
        { k: 'p', t: 'Tomamos la misma viga de 6 m con la misma carga y le fuimos aumentando el canto. Cada caso se resolvió dos veces: con barras, como lo hace el modo Básico, y como una cáscara MITC4 en su plano, como lo puede hacer el modo PRO.' },
        {
          k: 'table',
          caption: 'Viga simplemente apoyada de 6 m, 20 cm de ancho, 10 kN/m, E = 30 000 MPa, ν = 0,2. Flecha en el centro, sobre el eje.',
          head: ['L/h', 'Canto h [m]', 'Barras [mm]', 'Cáscaras [mm]', 'Las barras quedan por debajo'],
          rows: [
            ['20', '0,30', '12,50', '12,57', '0,5 %'],
            ['10', '0,60', '1,563', '1,596', '2,1 %'],
            ['5', '1,20', '0,195', '0,212', '7,9 %'],
            ['3', '2,00', '0,0422', '0,0521', '19,1 %'],
            ['2', '3,00', '0,0125', '0,0190', '34,3 %'],
          ],
        },
        { k: 'p', t: 'Con L/h = 10, que es una viga común, la diferencia es del 2 %. Con L/h = 5, casi del 8 %. Con L/h = 3 el modelo de barras da una flecha 19 % menor, y con L/h = 2, un tercio menor.' },
        { k: 'quote', t: 'El modelo de barras no se equivoca al azar: siempre da una viga más rígida de lo que es.' },

        { k: 'h', t: 'Cómo verificarlo con una calculadora' },
        { k: 'p', t: 'No hace falta creerle a la cáscara. La teoría de vigas de Timoshenko incorpora la deformación por corte, y para una viga simplemente apoyada con carga uniforme ese aporte es un término que se suma: q·L² / (8·κ·G·A), con κ = 5/6 para una sección rectangular y G = E / (2·(1+ν)).' },
        {
          k: 'table',
          caption: 'Viga con L/h = 3 (6 m de luz, 2 m de canto): cuatro respuestas a la misma pregunta.',
          head: ['Modelo', 'Flecha en el centro [mm]'],
          rows: [
            ['Barras (Euler-Bernoulli)', '0,0422'],
            ['Barras más el término de corte, a mano', '0,0530'],
            ['Cáscaras MITC4', '0,0521'],
            ['Elasticidad plana, solución cerrada', '0,0523'],
          ],
        },
        { k: 'p', t: 'Para L/h = 3 ese término vale 0,0108 mm, y sumado a los 0,0422 mm de Euler-Bernoulli da 0,0530 mm. La cáscara da 0,0521 mm, y la solución cerrada de elasticidad plana de Timoshenko y Goodier, 0,0523 mm. Las tres respuestas que consideran el corte coinciden dentro del 2 %. La que no lo considera queda 19 % abajo.' },
        { k: 'note', t: 'Hay más que la flecha. Con ese canto la distribución de tensiones normales deja de ser lineal, y Navier tampoco vale. Por eso ACI 318, la base del CIRSOC 201, trata como viga de gran altura a la que tiene una luz libre de hasta cuatro veces su altura, y pide diseñarla considerando que las deformaciones no son lineales, por ejemplo con bielas y tirantes.' },

        { k: 'h', t: '¿Importan unas centésimas de milímetro?' },
        { k: 'p', t: 'En esa viga aislada, no mucho. En una estructura isostática, un error de rigidez se queda en la flecha, y la flecha de una viga de 2 m de canto es chica de todos modos. El error empieza a importar cuando la rigidez decide cómo se reparten las cargas, que es lo que pasa en cualquier estructura hiperestática.' },
        { k: 'p', t: 'El caso típico es el tabique. En un modelo de barras, un tabique es una columna muy ancha: se le asigna la inercia del muro y se lo ubica sobre su eje. Si el tabique es bajo y largo, la barra lo hace bastante más rígido de lo que es.' },
        {
          k: 'table',
          caption: 'Tabique de 20 cm de espesor, empotrado en la base, con 100 kN horizontales en la coronación. Desplazamiento del borde superior.',
          head: ['Tabique, largo × alto [m]', 'Alto / largo', 'Barra [mm]', 'Cáscara [mm]', 'La barra lo hace más rígido'],
          rows: [
            ['4 × 3', '0,75', '0,0281', '0,0627', '2,23 veces'],
            ['3 × 3', '1,00', '0,0667', '0,1129', '1,69 veces'],
            ['2 × 3', '1,50', '0,2250', '0,2943', '1,31 veces'],
            ['3 × 6', '2,00', '0,533', '0,625', '1,17 veces'],
            ['3 × 9', '3,00', '1,800', '1,937', '1,08 veces'],
          ],
        },
        { k: 'p', t: 'Un tabique de 4 m de largo y 3 m de alto, de una sola planta, resulta 2,2 veces más rígido modelado como barra. Uno de 3 m de largo y 9 m de alto, de tres plantas, sólo un 8 % más. El problema no son los tabiques en general: son los tabiques bajos.' },
        { k: 'p', t: 'Y eso cambia el reparto. Supongamos dos tabiques en la misma línea, uno de 4 m y otro de 2 m de largo, los dos de 3 m de alto y unidos por la losa. Con barras, el tabique corto toma el 11,1 % del corte. Con cáscaras toma el 17,6 %, un 58 % más de lo que dice el modelo de barras. Lo que la barra le carga de más al tabique largo se lo saca al corto, que queda diseñado para menos corte del que va a recibir.' },

        { k: 'h', t: 'Las preguntas que una barra no puede contestar' },
        { k: 'p', t: 'Hasta acá, casos en los que las barras dan un número equivocado. Hay otros en los que directamente no pueden dar un número, porque la pregunta no existe en su modelo.' },
        {
          k: 'ul',
          items: [
            'Una losa sin vigas. Cómo se reparte el momento entre la franja de columna y la central, y cuánto se concentra sobre cada columna, es información bidimensional. Una grilla de barras la aproxima, pero no la contiene.',
            'Un muro con aberturas. La barra tiene una sola sección en cada punto de su eje, y una ventana en el medio del muro no tiene lugar en ese modelo.',
            'El nudo. Para el modelo de barras, el encuentro entre viga y columna es un punto, así que el momento máximo aparece en el eje. En la realidad el nudo tiene el tamaño de la columna, y la sección que se diseña es la de la cara.',
            'Una carga concentrada cerca de un apoyo. En esa zona la hipótesis de secciones planas no vale, por la misma razón que en la viga de gran canto.',
          ],
        },

        { k: 'h', t: 'Dónde tienen que coincidir' },
        { k: 'p', t: 'La otra mitad del razonamiento es igual de importante. En la viga esbelta de la primera fila, con L/h = 20, barras y cáscaras difieren un 0,5 %. No es cero, porque el corte existe siempre, pero es despreciable. Y así tiene que ser: si en una pieza esbelta los dos modelos no coinciden, el que está mal es el de elementos finitos, y casi siempre por la malla.' },
        { k: 'note', t: 'Un ejemplo clásico de elemento que falla es el bloqueo por corte (shear locking). Un cuadrilátero de placa gruesa formulado de manera ingenua se vuelve mucho más rígido de lo que corresponde cuando el espesor es chico, y la losa responde como si fuera más gruesa. El elemento MITC4 que usa Stabileo existe para evitarlo: interpola las deformaciones por corte de otra manera, de modo que el elemento no se trabe.' },
        { k: 'link', slug: 'torsion-bredt-saint-venant', t: 'Qué teoría corresponde según el espesor, y qué cuesta elegir mal, es la misma pregunta que en torsión:' },

        { k: 'h', t: 'Los dos modelos, en un mismo programa' },
        { k: 'p', t: 'Que un programa tenga barras y cáscaras no es ninguna novedad. SAP2000, ETABS, Robot y midas combinan las dos cosas en el mismo modelo, y es lo mínimo que se le pide a un programa profesional. Lo que esos programas no hacen es explicar lo que calculan. Del otro lado, herramientas educativas como Ftool o MASTAN2 enseñan muy bien el análisis de barras, pero no llegan a los elementos finitos.' },
        { k: 'p', t: 'Stabileo tiene los dos modos en el mismo programa. El modo Básico resuelve con barras y muestra el método de las rigideces en nueve pasos: numeración de grados de libertad, matrices locales, transformación, ensamblaje, vector de cargas, condiciones de borde, solución, reacciones y fuerzas internas. El modo PRO resuelve por elementos finitos, con cáscaras MITC4 y placas DKT además de barras. No conocemos otro programa en el que se pueda aprender cómo funciona el cálculo y después aplicarlo a un modelo más completo sin cambiar de herramienta.' },
        { k: 'embed', query: 'example=deep-beam-bar', label: 'La viga con L/h = 3 en el modo Básico: 6 m de luz, sección de 20×200 cm y 10 kN/m, modelada como dos barras. Pasá el cursor por el centro de la barra y vas a leer «uz: -0.042 mm», lo mismo que da la fórmula de Euler-Bernoulli.' },
        { k: 'embed', query: 'example=deep-beam-shell', mode: 'pro', label: 'La misma viga en el modo PRO, modelada como cáscara con 192 elementos MITC4 de 25 cm. En Análisis → Desplazamientos, el nudo 113 (el centro, a media altura) marca «-5.19e-5» m: 0,0519 mm. La tabla de arriba usa una malla más fina y da 0,0521 mm. PRO está en beta.' },
        { k: 'link', slug: 'conceptual-side-advanced-tools', t: 'Qué explican y qué no las herramientas gratuitas, con nombre y apellido:' },

        { k: 'h', t: 'En resumen' },
        {
          k: 'ol',
          items: [
            'El método de las rigideces y los elementos finitos no compiten: para una barra prismática, el primero es el caso exacto del segundo. Lo que se elige es el modelo.',
            'Una barra recta no necesita malla. Si dividirla cambia el resultado, el problema es otro.',
            'Por debajo de L/h ≈ 5, el modelo de barras subestima la flecha en más de un 8 %, y por debajo de 3, en más de un 19 %. Siempre da una viga más rígida.',
            'En una estructura hiperestática ese error cambia el reparto de las cargas. Conviene revisar los tabiques bajos y largos antes que las vigas.',
            'Losas sin vigas, muros con aberturas y cargas cerca de los apoyos son preguntas que un modelo de barras no puede contestar.',
            'Donde la pieza es esbelta, los dos modelos tienen que coincidir. Si no coinciden, hay que revisar la malla.',
          ],
        },

        { k: 'note', t: 'Cómo se calcularon los números: todos salen del motor de Stabileo, el mismo que usa la aplicación. Barras: elementos de Euler-Bernoulli con apoyos en el eje. Cáscaras: MITC4 en el plano de la viga, con 24 elementos en el canto (con 16 cambia el cuarto dígito), la carga en el borde superior y los apoyos repartidos en toda la altura de las secciones extremas. Tabiques: la misma formulación, con la base empotrada en todo su largo y la carga horizontal repartida en la coronación. El término de corte y la solución de elasticidad plana son fórmulas cerradas que se pueden verificar a mano.' },
      ],
    },

    en: {
      title: 'Bars or finite elements? Not two methods, but two models',
      excerpt:
        'The stiffness method does not compete with finite elements: for a bar it is their exact case. What changes is the model, and in a deep beam the bar model gives a deflection 19 to 34% too small.',
      blocks: [
        { k: 'p', t: '"Should I use the stiffness method or finite elements?" is a question heard in every classroom and every design office, and it is the wrong question. Not because the answer is hard, but because the two options do not compete.' },
        { k: 'p', t: 'The stiffness method is the finite element method applied to bars. Between a "bar" program and a "finite element" program the method does not change: the model does. A bar is a one-dimensional theory of how a member deforms; a shell is a discretised two-dimensional continuum. Choosing between them is an engineering decision, and this post is about when to make it and what getting it wrong costs.' },

        { k: 'h', t: 'A straight bar does not need a mesh' },
        { k: 'p', t: 'In finite elements, the displacement inside each element is approximated with shape functions. For a bar in bending the usual ones are the cubic Hermite polynomials. And the Euler-Bernoulli beam equation with no load along the span has, precisely, a cubic polynomial as its solution: the approximation coincides with the exact solution.' },
        { k: 'p', t: 'That is why the stiffness matrix of a prismatic bar found in any matrix analysis textbook is exact, and why splitting a bar into more pieces improves nothing. With a distributed load the same holds at the nodes, as long as the equivalent nodal loads are computed consistently.' },
        {
          k: 'table',
          caption: 'Simply supported 6 m beam, 20×60 section, 10 kN/m, E = 30,000 MPa. Midspan deflection, with the beam split into different numbers of bars.',
          head: ['Bars the beam is split into', 'Midspan deflection [mm]'],
          rows: [
            ['2', '1.5625'],
            ['4', '1.5625'],
            ['10', '1.5625'],
            ['50', '1.5625'],
            ['Closed form 5qL⁴/384EI', '1.5625'],
          ],
        },
        { k: 'p', t: 'With two bars or with fifty, the engine gives the same number, and it is the closed-form one.' },
        { k: 'quote', t: 'Meshing a straight bar does not make it more accurate: it makes it slower.' },
        { k: 'note', t: 'That exactness holds within beam theory. The matrix solves the Euler-Bernoulli equation exactly; if the member does not behave like an Euler-Bernoulli beam, solving the equation well is of no use. That is what the rest of this post is about.' },

        { k: 'h', t: 'Where they part ways' },
        { k: 'p', t: 'Euler-Bernoulli theory assumes that plane sections stay plane and perpendicular to the axis, which amounts to saying the member does not deform in shear. In a slender beam it is a very good approximation. In a deep one it stops being so.' },
        { k: 'p', t: 'We took the same 6 m beam under the same load and kept increasing its depth. Each case was solved twice: with bars, as Basic mode does, and as an MITC4 shell in its own plane, as PRO mode can.' },
        {
          k: 'table',
          caption: 'Simply supported 6 m beam, 20 cm wide, 10 kN/m, E = 30,000 MPa, ν = 0.2. Midspan deflection, on the axis.',
          head: ['L/h', 'Depth h [m]', 'Bars [mm]', 'Shells [mm]', 'Bars land below by'],
          rows: [
            ['20', '0.30', '12.50', '12.57', '0.5 %'],
            ['10', '0.60', '1.563', '1.596', '2.1 %'],
            ['5', '1.20', '0.195', '0.212', '7.9 %'],
            ['3', '2.00', '0.0422', '0.0521', '19.1 %'],
            ['2', '3.00', '0.0125', '0.0190', '34.3 %'],
          ],
        },
        { k: 'p', t: 'At L/h = 10, an ordinary beam, the difference is 2%. At L/h = 5, almost 8%. At L/h = 3 the bar model gives a deflection 19% smaller, and at L/h = 2, a third smaller.' },
        { k: 'quote', t: 'The bar model does not err at random: it always makes the beam stiffer than it is.' },

        { k: 'h', t: 'How to check it with a calculator' },
        { k: 'p', t: 'There is no need to take the shell’s word for it. Timoshenko beam theory adds shear deformation, and for a simply supported beam under uniform load that contribution is one extra term: q·L² / (8·κ·G·A), with κ = 5/6 for a rectangular section and G = E / (2·(1+ν)).' },
        {
          k: 'table',
          caption: 'Beam at L/h = 3 (6 m span, 2 m depth): four answers to the same question.',
          head: ['Model', 'Midspan deflection [mm]'],
          rows: [
            ['Bars (Euler-Bernoulli)', '0.0422'],
            ['Bars plus the shear term, by hand', '0.0530'],
            ['MITC4 shells', '0.0521'],
            ['Plane elasticity, closed form', '0.0523'],
          ],
        },
        { k: 'p', t: 'At L/h = 3 that term is 0.0108 mm, and added to the 0.0422 mm from Euler-Bernoulli it gives 0.0530 mm. The shell gives 0.0521 mm, and Timoshenko and Goodier’s closed-form plane-elasticity solution, 0.0523 mm. The three answers that account for shear agree within 2%. The one that does not lands 19% low.' },
        { k: 'note', t: 'There is more to it than deflection. At that depth the distribution of normal stress stops being linear, and Navier no longer holds either. That is why ACI 318, on which CIRSOC 201 is based, treats as a deep beam any member whose clear span is up to four times its depth, and requires it to be designed accounting for nonlinear strain, for instance with strut-and-tie models.' },

        { k: 'h', t: 'Do a few hundredths of a millimetre matter?' },
        { k: 'p', t: 'In that isolated beam, not much. In a statically determinate structure a stiffness error stays in the deflection, and the deflection of a 2 m deep beam is small anyway. The error starts to matter when stiffness decides how loads are shared, which is what happens in any indeterminate structure.' },
        { k: 'p', t: 'The typical case is the shear wall. In a bar model a wall is a very wide column: it gets the wall’s inertia and is placed on its axis. If the wall is short and long, the bar makes it considerably stiffer than it is.' },
        {
          k: 'table',
          caption: 'Wall 20 cm thick, fixed at the base, with 100 kN applied horizontally at the top. Displacement of the top edge.',
          head: ['Wall, length × height [m]', 'Height / length', 'Bar [mm]', 'Shell [mm]', 'The bar makes it stiffer by'],
          rows: [
            ['4 × 3', '0.75', '0.0281', '0.0627', '2.23 times'],
            ['3 × 3', '1.00', '0.0667', '0.1129', '1.69 times'],
            ['2 × 3', '1.50', '0.2250', '0.2943', '1.31 times'],
            ['3 × 6', '2.00', '0.533', '0.625', '1.17 times'],
            ['3 × 9', '3.00', '1.800', '1.937', '1.08 times'],
          ],
        },
        { k: 'p', t: 'A wall 4 m long and 3 m tall, a single storey, comes out 2.2 times stiffer when modelled as a bar. One 3 m long and 9 m tall, three storeys, only 8% stiffer. The problem is not walls in general: it is squat walls.' },
        { k: 'p', t: 'And that changes how the load is shared. Take two walls on the same line, one 4 m and one 2 m long, both 3 m tall and tied together by the slab. With bars, the short wall takes 11.1% of the shear. With shells it takes 17.6%, 58% more than the bar model says. What the bar puts on the long wall in excess it takes away from the short one, which ends up designed for less shear than it will receive.' },

        { k: 'h', t: 'Questions a bar cannot answer' },
        { k: 'p', t: 'So far, cases where bars give a wrong number. There are others where they cannot give a number at all, because the question does not exist in their model.' },
        {
          k: 'ul',
          items: [
            'A flat slab. How the moment is shared between the column strip and the middle strip, and how much concentrates over each column, is two-dimensional information. A grid of bars approximates it but does not contain it.',
            'A wall with openings. A bar has a single section at each point of its axis, and a window in the middle of the wall has no place in that model.',
            'The joint. To the bar model, the meeting of beam and column is a point, so the peak moment appears at the axis. In reality the joint is as large as the column, and the section that gets designed is the one at the face.',
            'A concentrated load near a support. In that region the plane-sections assumption does not hold, for the same reason as in the deep beam.',
          ],
        },

        { k: 'h', t: 'Where they must agree' },
        { k: 'p', t: 'The other half of the argument matters just as much. In the slender beam of the first row, at L/h = 20, bars and shells differ by 0.5%. It is not zero, because shear always exists, but it is negligible. And that is how it should be: if the two models disagree on a slender member, the one that is wrong is the finite element model, and almost always because of the mesh.' },
        { k: 'note', t: 'A classic example of an element that fails is shear locking. A thick-plate quadrilateral formulated naively becomes far stiffer than it should when the thickness is small, and the slab responds as if it were thicker. The MITC4 element Stabileo uses exists to prevent that: it interpolates the shear strains differently, so the element does not lock.' },
        { k: 'link', slug: 'torsion-bredt-saint-venant', t: 'Which theory applies depending on thickness, and what picking wrong costs, is the same question as in torsion:' },

        { k: 'h', t: 'Both models, in one program' },
        { k: 'p', t: 'A program having bars and shells is nothing new. SAP2000, ETABS, Robot and midas combine both in the same model, and it is the least one expects of professional software. What those programs do not do is explain what they compute. On the other side, teaching tools such as Ftool or MASTAN2 teach bar analysis very well, but do not reach finite elements.' },
        { k: 'p', t: 'Stabileo has both modes in the same program. Basic mode solves with bars and shows the stiffness method in nine steps: degree-of-freedom numbering, local matrices, transformation, assembly, load vector, boundary conditions, solution, reactions and internal forces. PRO mode solves by finite elements, with MITC4 shells and DKT plates as well as bars. We know of no other program where you can learn how the analysis works and then apply it to a fuller model without changing tools.' },
        { k: 'embed', query: 'example=deep-beam-bar', label: 'The L/h = 3 beam in Basic mode: 6 m span, 20×200 cm section and 10 kN/m, modelled as two bars. Hover over the middle of the bar and it reads "uz: -0.042 mm", the same as the Euler-Bernoulli formula gives.' },
        { k: 'embed', query: 'example=deep-beam-shell', mode: 'pro', label: 'The same beam in PRO mode, modelled as a shell with 192 MITC4 elements of 25 cm. Under Analyse → Displacements, node 113 (midspan, at mid-depth) reads "-5.19e-5" m: 0.0519 mm. The table above uses a finer mesh and gives 0.0521 mm. PRO is in beta.' },
        { k: 'link', slug: 'conceptual-side-advanced-tools', t: 'What the free tools explain and what they do not, by name:' },

        { k: 'h', t: 'In short' },
        {
          k: 'ol',
          items: [
            'The stiffness method and finite elements do not compete: for a prismatic bar, the first is the exact case of the second. What you choose is the model.',
            'A straight bar does not need a mesh. If splitting it changes the result, the problem lies elsewhere.',
            'Below L/h ≈ 5 the bar model underestimates deflection by more than 8%, and below 3 by more than 19%. It always makes the beam stiffer.',
            'In an indeterminate structure that error changes how loads are shared. Check squat walls before beams.',
            'Flat slabs, walls with openings and loads near supports are questions a bar model cannot answer.',
            'Where the member is slender, the two models must agree. If they do not, check the mesh.',
          ],
        },

        { k: 'note', t: 'How the numbers were computed: all of them come from Stabileo’s engine, the same one the application uses. Bars: Euler-Bernoulli elements with supports on the axis. Shells: MITC4 in the plane of the beam, with 24 elements through the depth (16 changes the fourth digit), the load on the top edge and the supports spread over the full depth of the end sections. Walls: the same formulation, with the base fixed along its whole length and the horizontal load spread along the top. The shear term and the plane-elasticity solution are closed forms you can check by hand.' },
      ],
    },

    pt: {
      title: 'Barras ou elementos finitos? Não são dois métodos, são dois modelos',
      excerpt:
        'O método da rigidez não compete com os elementos finitos: para uma barra, é o caso exato deles. O que muda é o modelo, e numa viga alta o de barras dá uma flecha entre 19 e 34 % menor.',
      blocks: [
        { k: 'p', t: '«Calculo pelo método da rigidez ou por elementos finitos?» é uma pergunta que se ouve em qualquer sala de aula e em qualquer escritório de cálculo, e está mal colocada. Não porque a resposta seja difícil, mas porque as duas opções não competem entre si.' },
        { k: 'p', t: 'O método da rigidez é o método dos elementos finitos aplicado a barras. Entre um programa «de barras» e um «de elementos finitos» não muda o método: muda o modelo. Uma barra é uma teoria unidimensional de como uma peça se deforma; uma casca é um contínuo bidimensional discretizado. Escolher entre os dois é uma decisão de engenharia, e esta nota trata de quando tomá-la e do que custa errar.' },

        { k: 'h', t: 'Uma barra reta não precisa de malha' },
        { k: 'p', t: 'Em elementos finitos, o deslocamento dentro de cada elemento é aproximado por funções de forma. Para uma barra em flexão, as usuais são os polinômios cúbicos de Hermite. E a equação da viga de Euler-Bernoulli sem carga no vão tem como solução, justamente, um polinômio cúbico: a aproximação coincide com a solução exata.' },
        { k: 'p', t: 'Por isso a matriz de rigidez de uma barra prismática que aparece em qualquer livro de análise matricial é exata, e por isso dividir uma barra em mais pedaços não melhora nada. Com carga distribuída acontece o mesmo nos nós, desde que as cargas nodais equivalentes sejam calculadas de forma consistente.' },
        {
          k: 'table',
          caption: 'Viga simplesmente apoiada de 6 m, seção 20×60, 10 kN/m, E = 30 000 MPa. Flecha no meio do vão, com a viga dividida em diferentes quantidades de barras.',
          head: ['Barras em que a viga é dividida', 'Flecha no meio do vão [mm]'],
          rows: [
            ['2', '1,5625'],
            ['4', '1,5625'],
            ['10', '1,5625'],
            ['50', '1,5625'],
            ['Fórmula fechada 5qL⁴/384EI', '1,5625'],
          ],
        },
        { k: 'p', t: 'Com duas barras ou com cinquenta, o motor dá o mesmo número, e é o da fórmula fechada.' },
        { k: 'quote', t: 'Criar malha numa barra reta não a deixa mais precisa: deixa mais lenta.' },
        { k: 'note', t: 'Essa exatidão vale dentro da teoria de vigas. A matriz resolve exatamente a equação de Euler-Bernoulli; se a peça não se comporta como uma viga de Euler-Bernoulli, resolver bem a equação não serve de nada. É disso que trata o resto da nota.' },

        { k: 'h', t: 'Onde eles se separam' },
        { k: 'p', t: 'A teoria de Euler-Bernoulli supõe que as seções planas permanecem planas e perpendiculares ao eixo, o que equivale a dizer que a peça não se deforma por cisalhamento. Numa viga esbelta é uma ótima aproximação. Numa viga alta deixa de ser.' },
        { k: 'p', t: 'Pegamos a mesma viga de 6 m com a mesma carga e fomos aumentando a altura. Cada caso foi resolvido duas vezes: com barras, como faz o modo Básico, e como uma casca MITC4 no seu plano, como o modo PRO pode fazer.' },
        {
          k: 'table',
          caption: 'Viga simplesmente apoiada de 6 m, 20 cm de largura, 10 kN/m, E = 30 000 MPa, ν = 0,2. Flecha no meio do vão, sobre o eixo.',
          head: ['L/h', 'Altura h [m]', 'Barras [mm]', 'Cascas [mm]', 'As barras ficam abaixo em'],
          rows: [
            ['20', '0,30', '12,50', '12,57', '0,5 %'],
            ['10', '0,60', '1,563', '1,596', '2,1 %'],
            ['5', '1,20', '0,195', '0,212', '7,9 %'],
            ['3', '2,00', '0,0422', '0,0521', '19,1 %'],
            ['2', '3,00', '0,0125', '0,0190', '34,3 %'],
          ],
        },
        { k: 'p', t: 'Com L/h = 10, uma viga comum, a diferença é de 2 %. Com L/h = 5, quase 8 %. Com L/h = 3 o modelo de barras dá uma flecha 19 % menor, e com L/h = 2, um terço menor.' },
        { k: 'quote', t: 'O modelo de barras não erra ao acaso: sempre dá uma viga mais rígida do que ela é.' },

        { k: 'h', t: 'Como conferir com uma calculadora' },
        { k: 'p', t: 'Não é preciso acreditar na casca. A teoria de vigas de Timoshenko incorpora a deformação por cisalhamento, e para uma viga simplesmente apoiada com carga uniforme essa contribuição é um termo que se soma: q·L² / (8·κ·G·A), com κ = 5/6 para uma seção retangular e G = E / (2·(1+ν)).' },
        {
          k: 'table',
          caption: 'Viga com L/h = 3 (6 m de vão, 2 m de altura): quatro respostas para a mesma pergunta.',
          head: ['Modelo', 'Flecha no meio do vão [mm]'],
          rows: [
            ['Barras (Euler-Bernoulli)', '0,0422'],
            ['Barras mais o termo de cisalhamento, à mão', '0,0530'],
            ['Cascas MITC4', '0,0521'],
            ['Elasticidade plana, solução fechada', '0,0523'],
          ],
        },
        { k: 'p', t: 'Para L/h = 3 esse termo vale 0,0108 mm, e somado aos 0,0422 mm de Euler-Bernoulli dá 0,0530 mm. A casca dá 0,0521 mm, e a solução fechada de elasticidade plana de Timoshenko e Goodier, 0,0523 mm. As três respostas que consideram o cisalhamento concordam dentro de 2 %. A que não o considera fica 19 % abaixo.' },
        { k: 'note', t: 'Há mais do que a flecha. Com essa altura a distribuição das tensões normais deixa de ser linear, e Navier também não vale. Por isso a ACI 318, base do CIRSOC 201, trata como viga-parede a peça cujo vão livre é de até quatro vezes a sua altura, e exige dimensioná-la considerando que as deformações não são lineares, por exemplo com bielas e tirantes.' },

        { k: 'h', t: 'Alguns centésimos de milímetro importam?' },
        { k: 'p', t: 'Nessa viga isolada, pouco. Numa estrutura isostática, um erro de rigidez fica na flecha, e a flecha de uma viga de 2 m de altura é pequena de qualquer jeito. O erro começa a importar quando a rigidez decide como as cargas se distribuem, que é o que acontece em qualquer estrutura hiperestática.' },
        { k: 'p', t: 'O caso típico é o pilar-parede. Num modelo de barras, uma parede é um pilar muito largo: recebe a inércia da parede e fica sobre o seu eixo. Se a parede é baixa e comprida, a barra a deixa bem mais rígida do que ela é.' },
        {
          k: 'table',
          caption: 'Parede de 20 cm de espessura, engastada na base, com 100 kN horizontais no topo. Deslocamento da borda superior.',
          head: ['Parede, comprimento × altura [m]', 'Altura / comprimento', 'Barra [mm]', 'Casca [mm]', 'A barra a deixa mais rígida'],
          rows: [
            ['4 × 3', '0,75', '0,0281', '0,0627', '2,23 vezes'],
            ['3 × 3', '1,00', '0,0667', '0,1129', '1,69 vezes'],
            ['2 × 3', '1,50', '0,2250', '0,2943', '1,31 vezes'],
            ['3 × 6', '2,00', '0,533', '0,625', '1,17 vezes'],
            ['3 × 9', '3,00', '1,800', '1,937', '1,08 vezes'],
          ],
        },
        { k: 'p', t: 'Uma parede de 4 m de comprimento e 3 m de altura, de um só pavimento, fica 2,2 vezes mais rígida modelada como barra. Uma de 3 m de comprimento e 9 m de altura, de três pavimentos, só 8 % mais. O problema não são as paredes em geral: são as paredes baixas.' },
        { k: 'p', t: 'E isso muda a distribuição. Suponha duas paredes na mesma linha, uma de 4 m e outra de 2 m de comprimento, ambas com 3 m de altura e ligadas pela laje. Com barras, a parede curta recebe 11,1 % do cortante. Com cascas recebe 17,6 %, 58 % a mais do que diz o modelo de barras. O que a barra coloca a mais na parede comprida ela tira da curta, que acaba dimensionada para menos cortante do que vai receber.' },

        { k: 'h', t: 'As perguntas que uma barra não consegue responder' },
        { k: 'p', t: 'Até aqui, casos em que as barras dão um número errado. Há outros em que simplesmente não conseguem dar um número, porque a pergunta não existe no modelo delas.' },
        {
          k: 'ul',
          items: [
            'Uma laje lisa, sem vigas. Como o momento se divide entre a faixa dos pilares e a faixa central, e quanto se concentra sobre cada pilar, é informação bidimensional. Uma grelha de barras a aproxima, mas não a contém.',
            'Uma parede com aberturas. A barra tem uma única seção em cada ponto do seu eixo, e uma janela no meio da parede não tem lugar nesse modelo.',
            'O nó. Para o modelo de barras, o encontro entre viga e pilar é um ponto, então o momento máximo aparece no eixo. Na realidade o nó tem o tamanho do pilar, e a seção que se dimensiona é a da face.',
            'Uma carga concentrada perto de um apoio. Nessa região a hipótese das seções planas não vale, pelo mesmo motivo que na viga alta.',
          ],
        },

        { k: 'h', t: 'Onde eles têm de coincidir' },
        { k: 'p', t: 'A outra metade do raciocínio é igualmente importante. Na viga esbelta da primeira linha, com L/h = 20, barras e cascas diferem 0,5 %. Não é zero, porque o cisalhamento sempre existe, mas é desprezível. E assim deve ser: se numa peça esbelta os dois modelos não coincidem, o errado é o de elementos finitos, e quase sempre por causa da malha.' },
        { k: 'note', t: 'Um exemplo clássico de elemento que falha é o travamento por cisalhamento (shear locking). Um quadrilátero de placa espessa formulado de maneira ingênua fica muito mais rígido do que deveria quando a espessura é pequena, e a laje responde como se fosse mais grossa. O elemento MITC4 usado pelo Stabileo existe para evitar isso: interpola as deformações por cisalhamento de outra maneira, para que o elemento não trave.' },
        { k: 'link', slug: 'torsion-bredt-saint-venant', t: 'Qual teoria se aplica conforme a espessura, e o que custa escolher errado, é a mesma pergunta da torção:' },

        { k: 'h', t: 'Os dois modelos, no mesmo programa' },
        { k: 'p', t: 'Um programa ter barras e cascas não é nenhuma novidade. SAP2000, ETABS, Robot e midas combinam as duas coisas no mesmo modelo, e é o mínimo que se espera de um programa profissional. O que esses programas não fazem é explicar o que calculam. Do outro lado, ferramentas de ensino como Ftool ou MASTAN2 ensinam muito bem a análise de barras, mas não chegam aos elementos finitos.' },
        { k: 'p', t: 'O Stabileo tem os dois modos no mesmo programa. O modo Básico resolve com barras e mostra o método da rigidez em nove passos: numeração dos graus de liberdade, matrizes locais, transformação, montagem, vetor de cargas, condições de contorno, solução, reações e esforços internos. O modo PRO resolve por elementos finitos, com cascas MITC4 e placas DKT além de barras. Não conhecemos outro programa em que se possa aprender como o cálculo funciona e depois aplicá-lo a um modelo mais completo sem trocar de ferramenta.' },
        { k: 'embed', query: 'example=deep-beam-bar', label: 'A viga com L/h = 3 no modo Básico: 6 m de vão, seção de 20×200 cm e 10 kN/m, modelada como duas barras. Passe o cursor pelo meio da barra e você vai ler «uz: -0.042 mm», o mesmo que dá a fórmula de Euler-Bernoulli.' },
        { k: 'embed', query: 'example=deep-beam-shell', mode: 'pro', label: 'A mesma viga no modo PRO, modelada como casca com 192 elementos MITC4 de 25 cm. Em Analisar → Deslocamentos, o nó 113 (meio do vão, a meia altura) marca «-5.19e-5» m: 0,0519 mm. A tabela acima usa uma malha mais fina e dá 0,0521 mm. O PRO está em beta.' },
        { k: 'link', slug: 'conceptual-side-advanced-tools', t: 'O que as ferramentas gratuitas explicam e o que não explicam, com nome e sobrenome:' },

        { k: 'h', t: 'Em resumo' },
        {
          k: 'ol',
          items: [
            'O método da rigidez e os elementos finitos não competem: para uma barra prismática, o primeiro é o caso exato do segundo. O que se escolhe é o modelo.',
            'Uma barra reta não precisa de malha. Se dividi-la muda o resultado, o problema é outro.',
            'Abaixo de L/h ≈ 5, o modelo de barras subestima a flecha em mais de 8 %, e abaixo de 3, em mais de 19 %. Sempre dá uma viga mais rígida.',
            'Numa estrutura hiperestática esse erro muda a distribuição das cargas. Vale revisar as paredes baixas e compridas antes das vigas.',
            'Lajes sem vigas, paredes com aberturas e cargas perto dos apoios são perguntas que um modelo de barras não consegue responder.',
            'Onde a peça é esbelta, os dois modelos têm de coincidir. Se não coincidem, é preciso revisar a malha.',
          ],
        },

        { k: 'note', t: 'Como os números foram calculados: todos saem do motor do Stabileo, o mesmo que a aplicação usa. Barras: elementos de Euler-Bernoulli com apoios no eixo. Cascas: MITC4 no plano da viga, com 24 elementos na altura (com 16 muda o quarto dígito), a carga na borda superior e os apoios distribuídos em toda a altura das seções extremas. Paredes: a mesma formulação, com a base engastada em todo o comprimento e a carga horizontal distribuída no topo. O termo de cisalhamento e a solução de elasticidade plana são fórmulas fechadas que podem ser conferidas à mão.' },
      ],
    },
  },
};
