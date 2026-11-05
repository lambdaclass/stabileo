import type { Post } from '../types';

export const stepByStepCourse: Post = {
  slug: 'learn-structural-analysis-step-by-step',
  date: '2026-11-05',
  order: 12,
  authors: ['Federico Carrone'],
  tagKeys: ['blog.tag.education', 'blog.tag.theory'],
  i18n: {
    es: {
      title: 'Aprender análisis estructural paso a paso en Stabileo Básico',
      excerpt:
        'Básico tiene ahora un curso adentro: elegís un método y la aplicación resuelve tu estructura, o un ejemplo preparado, paso a paso y como se hace en papel. Estática, método de las fuerzas y de los desplazamientos, líneas de influencia, segundo orden y pandeo, cálculo plástico y dinámica. Gratis, en el navegador.',
      blocks: [
        { k: 'p', t: 'Un programa de cálculo da los resultados de golpe. Para aprender hace falta lo contrario: ver de dónde sale cada número, en el orden en que se hace en el pizarrón. Eso es «Paso a paso explicado», el curso que ahora vive dentro de Stabileo Básico. Elegís un método, la aplicación lo aplica a tu estructura y lo desarrolla paso a paso, con las ecuaciones, las figuras y los números de ese modelo, y termina comparando el resultado con el método matricial.' },
        { k: 'p', t: 'El curso lo escribió Bautista Chesta, ingeniero civil (FIUBA), y llega en seis unidades: la base común, estática y métodos clásicos, líneas de influencia, segundo orden y pandeo, cálculo plástico y dinámica. Es gratis, como todo Básico: se abre en el navegador, sin instalar nada ni crear una cuenta, y los textos están en español, inglés, portugués, alemán, francés y turco.' },

        { k: 'h', t: 'Cómo se abre' },
        {
          k: 'ol',
          items: [
            'Entrá a stabileo.com/app/basic.',
            'Tocá Avanzado. En el teléfono está en la cinta de abajo.',
            'En «Explorar y aprender», tocá Paso a paso explicado. Se abre el catálogo de métodos, agrupados por tema.',
            'Cada método dice qué tiene que ser la estructura para probarlo y si tu modelo cumple; el ? explica qué hace. «Abrir un ejemplo» carga un modelo que cumple y abre el método; «Abrir» lo aplica al modelo que tenés en pantalla.',
            'Siguiente y Anterior recorren los pasos, y las pestañas numeradas saltan a uno. Métodos vuelve al catálogo.',
          ],
        },
        { k: 'img', base: 'blog/course-catalog', w: 1600, h: 1000, alt: 'Stabileo Básico con el catálogo «Paso a paso explicado» abierto en el panel lateral: los métodos bajo método de rigidez, método de flexibilidad y vigas continuas, cada uno con lo que debe cumplir la estructura y los botones Abrir y Abrir un ejemplo.', caption: 'El catálogo: cada método dice qué necesita el modelo y trae un ejemplo que lo cumple.' },
        { k: 'note', t: 'Los métodos explicados trabajan sobre modelos planos. En el espacio de trabajo 3D sólo se abren los dos asistentes, el de rigidez y el de flexibilidad; «Abrir un ejemplo» en cualquier otro método vuelve primero al plano.' },

        { k: 'h', t: 'Estática, método de las fuerzas y método de los desplazamientos' },
        { k: 'p', t: 'Es la unidad más grande: vigas continuas con la ecuación de los tres momentos y el método de Cross, pórticos con pendiente-deflexión, Cross con y sin desplazamientos y el método de las incógnitas cinemáticas, reticulados por nudos, por secciones (Ritter) y con la matriz de compatibilidad, y deformaciones por doble integración, área de momentos, trabajos virtuales y Castigliano. El grado de hiperestaticidad se cuenta igual en todas partes, GH = 3·m + r − 3·n − c, con las articulaciones internas escritas y separado en su parte externa e interna.' },
        { k: 'p', t: 'En el método de las fuerzas elegís vos la estructura fundamental: liberás apoyos o extremos de barra hasta tener tantas incógnitas como el grado, y si la elección deja un mecanismo, la aplicación lo explica en lugar de resolverla. Después recorre los nueve pasos, con la rigidez axial incluida o no y las barras y resortes escritos término por término. Trabajos virtuales calcula desplazamientos, giros y movimientos relativos, también con resortes, asentamientos y temperatura. Para probarlo: Ejemplos → Pórtico simple, Avanzado → Paso a paso explicado → Método de las fuerzas → Abrir.' },
        { k: 'img', base: 'blog/course-force-method', w: 1600, h: 1000, alt: 'El asistente del método de las fuerzas sobre el pórtico simple de los ejemplos, en el paso de la estructura fundamental: se liberaron las tres reacciones del apoyo derecho y la aplicación muestra las tres incógnitas hiperestáticas elegidas.', caption: 'Método de las fuerzas: la estructura fundamental la elegís vos, y la aplicación dice si la elección sirve.' },

        { k: 'h', t: 'Líneas de influencia' },
        { k: 'p', t: 'Ejemplos → Viga continua, después Avanzado → Línea de influencia, y tocá una sección de la viga. Hay líneas de reacciones, momento, corte, esfuerzo normal, desplazamientos y giros, en cualquier sección, incluidos los extremos de las barras, y la sección se puede mover después. El panel carga la línea con la permanente g, la sobrecarga q y una carga puntual P para obtener sus extremos, dibuja la envolvente a lo largo de la barra y abre la explicación paso a paso con las figuras de Müller-Breslau. «Estados de carga y envolventes» busca los efectos más grandes y más chicos. La línea de momento es positiva donde tracciona la fibra inferior, como el diagrama estático.' },
        { k: 'img', base: 'blog/course-influence', w: 1600, h: 1000, alt: 'La viga continua de los ejemplos con la envolvente de momentos obtenida cargando las líneas de influencia, en rojo el máximo y en azul el mínimo, y el panel que carga la línea del momento a 2 m del apoyo izquierdo con g = 10 y q = 5 kN/m: máximo 20,00 kN·m y mínimo 10,00 kN·m, cada uno confirmado con un cálculo directo.', caption: 'La línea de influencia de momento cargada para sus extremos, y la envolvente a lo largo de la viga.' },

        { k: 'h', t: 'Segundo orden y pandeo' },
        { k: 'p', t: 'Con un pórtico cargado, Avanzado → P-Δ (2.º orden) o Pcr (Euler). En «Cómo se calcula» elegís el método, con funciones de estabilidad φ, matriz geométrica o matriz de cuerda (P/L), y cuántos elementos tiene cada barra. P-Δ muestra sus iteraciones, y B₂ = 1/(1 − 1/λ₁) sale del pandeo del mismo modelo con la misma discretización, al lado de la mayor amplificación de desplazamientos. El pandeo usa cuatro elementos por barra por defecto, y si la discretización no puede representar el factor, lo rechaza en vez de informarlo. En el catálogo, el grupo «Segundo orden y pandeo» trae un pórtico preparado para los cuatro métodos.' },

        { k: 'h', t: 'Cálculo plástico' },
        { k: 'p', t: 'Ejemplos → Pórtico simple, después Avanzado → Colapso plástico. La aplicación muestra cada paso de carga, la curva λ–desplazamiento, los giros plásticos y el mecanismo dibujado sobre el modelo, verificado con trabajos virtuales. También podés elegir un mecanismo: tocás dónde van las articulaciones y la aplicación calcula su λ y dice si es admisible. Los métodos estático y cinemático están en el catálogo como documentos explicados. Si el análisis paso a paso no puede resolver el colapso, lo dice, en lugar de dar un factor.' },
        {
          k: 'table',
          caption: 'Pórtico simple de los ejemplos: el colapso que calcula la aplicación y un mecanismo de ladeo elegido a mano.',
          head: ['Mecanismo', 'λ'],
          rows: [
            ['El que encuentra el análisis paso a paso', '71,30'],
            ['Ladeo elegido a mano, con articulaciones arriba y abajo de las dos columnas', '168,75'],
          ],
        },
        { k: 'p', t: 'El ladeo elegido a mano da un factor más alto, y la aplicación explica por qué no es el colapso: con ese mecanismo el momento supera Mp en alguna sección, así que su λ es sólo una cota superior, y escalando los momentos da también una cota inferior. Es el teorema cinemático, en pantalla y con los números del modelo.' },
        { k: 'img', base: 'blog/course-plastic', w: 1600, h: 1000, alt: 'El pórtico simple de los ejemplos con el mecanismo de colapso dibujado, cuatro articulaciones con sus giros, y el panel de colapso plástico con la curva λ–desplazamiento y el trabajo virtual del mecanismo, que da λ = 71,296.', caption: 'Colapso plástico del pórtico simple: la curva λ–desplazamiento y el mecanismo.' },

        { k: 'h', t: 'Dinámica' },
        { k: 'p', t: 'Avanzado → Dinámico abre el panel de dinámica. Un sistema de un grado de libertad se toma del modelo, con su respuesta libre y forzada bajo una carga armónica; uno de varios grados se resuelve por superposición modal, incluido el pórtico de corte. Los modelos de masa, concentrada o consistente y con condensación, se comparan con las frecuencias del motor, y se pueden poner masas puntuales en los nudos, con su inercia rotacional, que también usa el análisis modal. En el grupo «Dinámica de estructuras» del catálogo, «Abrir un ejemplo» carga una columna con una masa en la punta o un pórtico de corte de dos pisos.' },
        { k: 'img', base: 'blog/course-dynamics', w: 1600, h: 1000, alt: 'Una columna en voladizo con una masa en la punta y el panel de dinámica abierto en el sistema de un grado de libertad tomado del modelo: k = 2250 kN/m, m = 5 t, ω = 21,21 rad/s, la vibración libre amortiguada y la respuesta a una fuerza armónica con su factor β.', caption: 'Un grado de libertad: la columna con masa en la punta bajo una fuerza armónica.' },

        { k: 'h', t: 'Todo lo que tiene el catálogo' },
        {
          k: 'table',
          caption: 'Los métodos de «Paso a paso explicado», por grupo, en el orden del catálogo.',
          head: ['Grupo', 'Métodos'],
          rows: [
            ['Método de rigidez', 'Matricial, como asistente'],
            ['Método de flexibilidad', 'Método de las fuerzas, como asistente'],
            ['Vigas continuas', 'Tres momentos (Clapeyron); Cross'],
            ['Pórticos', 'Incógnitas cinemáticas; Cross sin y con desplazamientos; pendiente-deflexión'],
            ['Reticulados', 'Nudos; secciones (Ritter); matriz de compatibilidad'],
            ['Deformaciones y energía', 'Doble integración; área de momentos; trabajos virtuales; Castigliano; esfuerzos por cortes'],
            ['Líneas de influencia', 'Línea de influencia'],
            ['Segundo orden y pandeo', 'Segundo orden con funciones φ y con matriz geométrica; pandeo por conteo de modos y por autovalores'],
            ['Cálculo plástico', 'Método cinemático; método estático'],
            ['Dinámica de estructuras', 'Un grado de libertad; varios grados por descomposición modal; masa distribuida'],
          ],
        },
        { k: 'p', t: 'Si das una materia de estructuras, se puede usar en clase tal como está: el modelo se comparte por link y cada alumno lo abre en su navegador, en su idioma. Si un paso no se entiende o un número no coincide con el que hacés a mano, escribinos: es justo lo que necesitamos saber.' },
        { k: 'link', slug: 'conceptual-side-advanced-tools', t: 'Otra herramienta pensada para el aula, el análisis cinemático que explica por qué una estructura es un mecanismo:' },
      ],
    },
    en: {
      title: 'Learn structural analysis step by step in Stabileo Basic',
      excerpt:
        'Basic now has a course inside it: pick a method and the app solves your structure, or a prepared example, step by step, the way it is done on paper. Statics, the force and displacement methods, influence lines, second order and buckling, plastic analysis and dynamics. Free, in the browser.',
      blocks: [
        { k: 'p', t: 'Analysis software gives you the results all at once. Learning needs the opposite: seeing where every number comes from, in the order it is done on the blackboard. That is “Explained step by step”, the course that now lives inside Stabileo Basic. You pick a method, the app applies it to your structure and works through it step by step, with the equations, the figures and the numbers of that model, and it ends by comparing the result with the matrix method.' },
        { k: 'p', t: 'The course was written by Bautista Chesta, civil engineer (FIUBA), and it arrives in six units: the shared base, statics and classical methods, influence lines, second order and buckling, plastic analysis and dynamics. It is free, like all of Basic: it opens in the browser, with nothing to install and no account, and the texts are in Spanish, English, Portuguese, German, French and Turkish.' },

        { k: 'h', t: 'How to open it' },
        {
          k: 'ol',
          items: [
            'Go to stabileo.com/app/basic.',
            'Press Advanced. On a phone it is in the bottom ribbon.',
            'Under “Explore and learn”, press Explained step by step. The catalog of methods opens, grouped by topic.',
            'Each method says what the structure must be to try it and whether your model qualifies; the ? explains what it does. “Open an example” loads a model that qualifies and opens the method; “Open” applies it to the model on screen.',
            'Next and Previous move through the steps, and the numbered tabs jump to one. Methods goes back to the catalog.',
          ],
        },
        { k: 'img', base: 'blog/course-catalog', w: 1600, h: 1000, alt: 'Stabileo Basic with the “Explained step by step” catalog open in the side panel: the methods under stiffness method, flexibility method and continuous beams, each with what the structure must be and the Open and Open an example buttons.', caption: 'The catalog: each method says what the model needs and comes with an example that meets it.' },
        { k: 'note', t: 'The explained methods work on plane models. In the 3D workspace only the two wizards open, stiffness and flexibility; “Open an example” on any other method switches back to the plane first.' },

        { k: 'h', t: 'Statics, the force method and the displacement method' },
        { k: 'p', t: 'This is the largest unit: continuous beams with the three-moment equation and moment distribution, frames with slope-deflection, moment distribution with and without sway and the displacement method, trusses by joints, by sections (Ritter) and with the compatibility matrix, and deflections by double integration, moment-area, virtual work and Castigliano. The degree of indeterminacy is counted the same way everywhere, GH = 3·m + r − 3·n − c, with the internal hinges written out and split into its external and internal parts.' },
        { k: 'p', t: 'In the force method you choose the primary structure: you release supports or member ends until there are as many redundants as the degree, and if your choice leaves a mechanism the app explains why instead of solving it. Then it goes through the nine steps, with axial stiffness on or off and members and springs written out term by term. Virtual work computes displacements, rotations and relative movements, with springs, settlements and temperature too. To try it: Examples → Portal Frame, Advanced → Explained step by step → Force method → Open.' },
        { k: 'img', base: 'blog/course-force-method', w: 1600, h: 1000, alt: 'The force-method wizard on the Portal Frame example, at the primary-structure step: the three reactions of the right support are released and the app lists the three redundants chosen.', caption: 'Force method: you choose the primary structure, and the app tells you whether the choice works.' },

        { k: 'h', t: 'Influence lines' },
        { k: 'p', t: 'Examples → Continuous Beam, then Advanced → Influence line, and tap a section of the beam. There are lines for reactions, moment, shear, axial force, displacements and rotations, at any section, member ends included, and the section can be moved afterwards. The panel loads the line with the permanent load g, the live load q and a point load P for its extremes, draws the envelope along the member and opens the step-by-step explanation with the Müller-Breslau figures. “Load cases and envelopes” finds the largest and smallest effects. The moment line is positive where it tensions the bottom fibre, like the static diagram.' },
        { k: 'img', base: 'blog/course-influence', w: 1600, h: 1000, alt: 'The Continuous Beam example with the moment envelope obtained by loading the influence lines, red for the maximum and blue for the minimum, and the panel loading the moment line 2 m from the left support with g = 10 and q = 5 kN/m: maximum 20.00 kN·m and minimum 10.00 kN·m, each confirmed by a direct solve.', caption: 'The moment influence line loaded for its extremes, and the envelope along the beam.' },

        { k: 'h', t: 'Second order and buckling' },
        { k: 'p', t: 'With a loaded frame, Advanced → P-Δ (2nd order) or Pcr (Euler). Under “How it is calculated” you pick the method, with stability functions φ, the geometric matrix or the chord matrix (P/L), and how many elements each member has. P-Δ shows its iterations, and B₂ = 1/(1 − 1/λ₁) comes from the buckling of the same model at the same discretization, next to the largest displacement amplification. Buckling uses four elements per member by default, and when the discretization cannot represent the factor it refuses it instead of reporting it. In the catalog, the “Second order and buckling” group comes with a frame prepared for all four methods.' },

        { k: 'h', t: 'Plastic analysis' },
        { k: 'p', t: 'Examples → Portal Frame, then Advanced → Plastic collapse. The app shows each load step, the λ–displacement curve, the plastic rotations and the mechanism drawn on the model, checked by virtual work. You can also choose a mechanism: tap where the hinges go and the app computes its λ and says whether it is admissible. The static and kinematic methods are in the catalog as explained documents. When the step-by-step analysis cannot resolve the collapse it says so, instead of giving a factor.' },
        {
          k: 'table',
          caption: 'The Portal Frame example: the collapse the app computes and a sway mechanism chosen by hand.',
          head: ['Mechanism', 'λ'],
          rows: [
            ['The one the step-by-step analysis finds', '71.30'],
            ['Sway chosen by hand, with hinges at the top and bottom of both columns', '168.75'],
          ],
        },
        { k: 'p', t: 'The sway chosen by hand gives a higher factor, and the app explains why it is not the collapse: with that mechanism the moment exceeds Mp at some section, so its λ is only an upper bound, and scaling the moments gives a lower bound as well. It is the kinematic theorem, on screen and with the model’s own numbers.' },
        { k: 'img', base: 'blog/course-plastic', w: 1600, h: 1000, alt: 'The Portal Frame example with the collapse mechanism drawn, four hinges with their rotations, and the plastic collapse panel with the λ–displacement curve and the mechanism’s virtual work, which gives λ = 71.296.', caption: 'Plastic collapse of the portal frame: the λ–displacement curve and the mechanism.' },

        { k: 'h', t: 'Dynamics' },
        { k: 'p', t: 'Advanced → Dynamic opens the dynamics panel. A single-degree-of-freedom system is taken from the model, with its free response and its forced response to a harmonic load; a multi-degree-of-freedom one is solved by modal superposition, the shear building included. Mass models, lumped or consistent and with condensation, are compared with the engine’s frequencies, and point masses can be placed at nodes, with their rotary inertia, which the modal analysis uses too. In the catalog’s “Structural dynamics” group, “Open an example” loads a column with a tip mass or a two-storey shear frame.' },
        { k: 'img', base: 'blog/course-dynamics', w: 1600, h: 1000, alt: 'A cantilever column with a tip mass and the dynamics panel open on the single-degree-of-freedom system taken from the model: k = 2250 kN/m, m = 5 t, ω = 21.21 rad/s, the damped free vibration and the response to a harmonic force with its factor β.', caption: 'One degree of freedom: the column with a tip mass under a harmonic force.' },

        { k: 'h', t: 'Everything in the catalog' },
        {
          k: 'table',
          caption: 'The methods in “Explained step by step”, by group, in catalog order.',
          head: ['Group', 'Methods'],
          rows: [
            ['Stiffness method', 'Matrix method, as a wizard'],
            ['Flexibility method', 'Force method, as a wizard'],
            ['Continuous beams', 'Three moments (Clapeyron); moment distribution (Hardy Cross)'],
            ['Frames', 'Kinematic unknowns; moment distribution without and with sway; slope-deflection'],
            ['Trusses', 'Joints; sections (Ritter); compatibility matrix'],
            ['Deformations and energy', 'Double integration; moment-area; virtual work; Castigliano; internal forces by cuts'],
            ['Influence lines', 'Influence line'],
            ['Second order and buckling', 'Second order with φ functions and with the geometric matrix; buckling by mode count and by eigenvalues'],
            ['Plastic analysis', 'Kinematic method; static method'],
            ['Structural dynamics', 'One degree of freedom; many degrees by modal decomposition; distributed mass'],
          ],
        },
        { k: 'p', t: 'If you teach structures, you can use it in class as it is: a model is shared by link and every student opens it in their own browser, in their own language. If a step is unclear or a number does not match the one you get by hand, write to us: that is exactly what we need to know.' },
        { k: 'link', slug: 'conceptual-side-advanced-tools', t: 'Another tool made for the classroom, the kinematic analysis that explains why a structure is a mechanism:' },
      ],
    },
    pt: {
      title: 'Aprender análise estrutural passo a passo no Stabileo Básico',
      excerpt:
        'O Básico agora tem um curso dentro: você escolhe um método e o aplicativo resolve sua estrutura, ou um exemplo preparado, passo a passo e como se faz no papel. Estática, método das forças e dos deslocamentos, linhas de influência, segunda ordem e flambagem, análise plástica e dinâmica. Grátis, no navegador.',
      blocks: [
        { k: 'p', t: 'Um programa de cálculo entrega os resultados de uma vez. Para aprender é preciso o contrário: ver de onde sai cada número, na ordem em que se faz no quadro. É isso o «Passo a passo explicado», o curso que agora vive dentro do Stabileo Básico. Você escolhe um método, o aplicativo o aplica à sua estrutura e o desenvolve passo a passo, com as equações, as figuras e os números daquele modelo, e termina comparando o resultado com o método matricial.' },
        { k: 'p', t: 'O curso foi escrito por Bautista Chesta, engenheiro civil (FIUBA), e chega em seis unidades: a base comum, estática e métodos clássicos, linhas de influência, segunda ordem e flambagem, análise plástica e dinâmica. É grátis, como todo o Básico: abre no navegador, sem instalar nada nem criar conta, e os textos estão em espanhol, inglês, português, alemão, francês e turco.' },

        { k: 'h', t: 'Como abrir' },
        {
          k: 'ol',
          items: [
            'Entre em stabileo.com/app/basic.',
            'Toque em Avançado. No celular ele fica na faixa de baixo.',
            'Em «Explorar e aprender», toque em Passo a passo explicado. Abre o catálogo de métodos, agrupados por tema.',
            'Cada método diz o que a estrutura precisa ser para testá-lo e se o seu modelo atende; o ? explica o que ele faz. «Abrir um exemplo» carrega um modelo que atende e abre o método; «Abrir» o aplica ao modelo que está na tela.',
            'Próximo e Anterior percorrem os passos, e as abas numeradas pulam para um deles. Métodos volta ao catálogo.',
          ],
        },
        { k: 'img', base: 'blog/course-catalog', w: 1600, h: 1000, alt: 'Stabileo Básico com o catálogo «Passo a passo explicado» aberto no painel lateral: os métodos em método da rigidez, método da flexibilidade e vigas contínuas, cada um com o que a estrutura precisa ser e os botões Abrir e Abrir um exemplo.', caption: 'O catálogo: cada método diz o que o modelo precisa e traz um exemplo que atende.' },
        { k: 'note', t: 'Os métodos explicados trabalham com modelos planos. No espaço de trabalho 3D só abrem os dois assistentes, o da rigidez e o da flexibilidade; «Abrir um exemplo» em qualquer outro método volta primeiro ao plano.' },

        { k: 'h', t: 'Estática, método das forças e método dos deslocamentos' },
        { k: 'p', t: 'É a unidade maior: vigas contínuas com a equação dos três momentos e o processo de Cross, pórticos com o método das rotações, Cross com e sem deslocamentos e o método dos deslocamentos, treliças pelos nós, pelas seções (Ritter) e com a matriz de compatibilidade, e deformações por integração dupla, área de momentos, trabalhos virtuais e Castigliano. O grau de hiperestaticidade é contado do mesmo jeito em todo lugar, GH = 3·m + r − 3·n − c, com as rótulas internas escritas e separado em parte externa e interna.' },
        { k: 'p', t: 'No método das forças é você quem escolhe a estrutura fundamental: libera apoios ou extremidades de barra até ter tantas incógnitas quanto o grau, e se a escolha deixa um mecanismo, o aplicativo explica por quê em vez de resolvê-la. Depois percorre os nove passos, com a rigidez axial incluída ou não e as barras e molas escritas termo a termo. Trabalhos virtuais calcula deslocamentos, rotações e movimentos relativos, também com molas, recalques e temperatura. Para testar: Exemplos → Pórtico Simples, Avançado → Passo a passo explicado → Método das forças → Abrir.' },
        { k: 'img', base: 'blog/course-force-method', w: 1600, h: 1000, alt: 'O assistente do método das forças no exemplo Pórtico Simples, no passo da estrutura fundamental: as três reações do apoio direito foram liberadas e o aplicativo mostra as três incógnitas hiperestáticas escolhidas.', caption: 'Método das forças: a estrutura fundamental é você quem escolhe, e o aplicativo diz se a escolha serve.' },

        { k: 'h', t: 'Linhas de influência' },
        { k: 'p', t: 'Exemplos → Viga Contínua, depois Avançado → Linha de influência, e toque numa seção da viga. Há linhas de reações, momento, cortante, esforço normal, deslocamentos e rotações, em qualquer seção, extremidades das barras incluídas, e a seção pode ser movida depois. O painel carrega a linha com a permanente g, a sobrecarga q e uma carga pontual P para obter seus extremos, desenha a envoltória ao longo da barra e abre a explicação passo a passo com as figuras de Müller-Breslau. «Casos de carga e envoltórias» encontra os maiores e menores efeitos. A linha de momento é positiva onde traciona a fibra inferior, como o diagrama estático.' },
        { k: 'img', base: 'blog/course-influence', w: 1600, h: 1000, alt: 'O exemplo Viga Contínua com a envoltória de momentos obtida carregando as linhas de influência, em vermelho o máximo e em azul o mínimo, e o painel que carrega a linha do momento a 2 m do apoio esquerdo com g = 10 e q = 5 kN/m: máximo 20,00 kN·m e mínimo 10,00 kN·m, cada um confirmado por um cálculo direto.', caption: 'A linha de influência de momento carregada para seus extremos, e a envoltória ao longo da viga.' },

        { k: 'h', t: 'Segunda ordem e flambagem' },
        { k: 'p', t: 'Com um pórtico carregado, Avançado → P-Δ (2ª ordem) ou Pcr (Euler). Em «Como é calculado» você escolhe o método, com funções de estabilidade φ, matriz geométrica ou matriz de corda (P/L), e quantos elementos tem cada barra. O P-Δ mostra suas iterações, e B₂ = 1/(1 − 1/λ₁) vem da flambagem do mesmo modelo com a mesma discretização, ao lado da maior amplificação de deslocamentos. A flambagem usa quatro elementos por barra por padrão e, quando a discretização não consegue representar o fator, o recusa em vez de informá-lo. No catálogo, o grupo «Segunda ordem e flambagem» traz um pórtico preparado para os quatro métodos.' },

        { k: 'h', t: 'Análise plástica' },
        { k: 'p', t: 'Exemplos → Pórtico Simples, depois Avançado → Colapso plástico. O aplicativo mostra cada passo de carga, a curva λ–deslocamento, as rotações plásticas e o mecanismo desenhado sobre o modelo, verificado por trabalhos virtuais. Você também pode escolher um mecanismo: toca onde ficam as rótulas e o aplicativo calcula seu λ e diz se é admissível. Os métodos estático e cinemático estão no catálogo como documentos explicados. Quando a análise passo a passo não consegue resolver o colapso, ela diz isso, em vez de dar um fator.' },
        {
          k: 'table',
          caption: 'O exemplo Pórtico Simples: o colapso que o aplicativo calcula e um mecanismo de deslocamento lateral escolhido à mão.',
          head: ['Mecanismo', 'λ'],
          rows: [
            ['O que a análise passo a passo encontra', '71,30'],
            ['Deslocamento lateral escolhido à mão, com rótulas no topo e na base das duas colunas', '168,75'],
          ],
        },
        { k: 'p', t: 'O mecanismo escolhido à mão dá um fator maior, e o aplicativo explica por que não é o colapso: com ele o momento passa de Mp em alguma seção, então seu λ é só um limite superior, e escalando os momentos dá também um limite inferior. É o teorema cinemático, na tela e com os números do modelo.' },
        { k: 'img', base: 'blog/course-plastic', w: 1600, h: 1000, alt: 'O exemplo Pórtico Simples com o mecanismo de colapso desenhado, quatro rótulas com suas rotações, e o painel de colapso plástico com a curva λ–deslocamento e o trabalho virtual do mecanismo, que dá λ = 71,296.', caption: 'Colapso plástico do pórtico simples: a curva λ–deslocamento e o mecanismo.' },

        { k: 'h', t: 'Dinâmica' },
        { k: 'p', t: 'Avançado → Dinâmica abre o painel de dinâmica. Um sistema de um grau de liberdade é tirado do modelo, com sua resposta livre e forçada sob uma carga harmônica; um de vários graus é resolvido por superposição modal, incluindo o pórtico de cisalhamento. Os modelos de massa, concentrada ou consistente e com condensação, são comparados com as frequências do motor, e é possível pôr massas pontuais nos nós, com sua inércia rotacional, que a análise modal também usa. No grupo «Dinâmica das estruturas» do catálogo, «Abrir um exemplo» carrega uma coluna com uma massa na ponta ou um pórtico de cisalhamento de dois andares.' },
        { k: 'img', base: 'blog/course-dynamics', w: 1600, h: 1000, alt: 'Uma coluna em balanço com uma massa na ponta e o painel de dinâmica aberto no sistema de um grau de liberdade tirado do modelo: k = 2250 kN/m, m = 5 t, ω = 21,21 rad/s, a vibração livre amortecida e a resposta a uma força harmônica com seu fator β.', caption: 'Um grau de liberdade: a coluna com massa na ponta sob uma força harmônica.' },

        { k: 'h', t: 'Tudo o que o catálogo tem' },
        {
          k: 'table',
          caption: 'Os métodos do «Passo a passo explicado», por grupo, na ordem do catálogo.',
          head: ['Grupo', 'Métodos'],
          rows: [
            ['Método da rigidez', 'Matricial, como assistente'],
            ['Método da flexibilidade', 'Método das forças, como assistente'],
            ['Vigas contínuas', 'Três momentos (Clapeyron); processo de Cross'],
            ['Pórticos', 'Método dos deslocamentos; Cross sem e com deslocamentos; método das rotações'],
            ['Treliças', 'Nós; seções (Ritter); matriz de compatibilidade'],
            ['Deformações e energia', 'Integração dupla; área de momentos; trabalhos virtuais; Castigliano; esforços por cortes'],
            ['Linhas de influência', 'Linha de influência'],
            ['Segunda ordem e flambagem', 'Segunda ordem com funções φ e com matriz geométrica; flambagem por contagem de modos e por autovalores'],
            ['Análise plástica', 'Método cinemático; método estático'],
            ['Dinâmica das estruturas', 'Um grau de liberdade; vários graus por decomposição modal; massa distribuída'],
          ],
        },
        { k: 'p', t: 'Se você dá aula de estruturas, pode usar em sala do jeito que está: o modelo é compartilhado por link e cada aluno o abre no próprio navegador, no próprio idioma. Se um passo não ficar claro ou um número não bater com o que você faz à mão, escreva para nós: é exatamente o que precisamos saber.' },
        { k: 'link', slug: 'conceptual-side-advanced-tools', t: 'Outra ferramenta pensada para a sala de aula, a análise cinemática que explica por que uma estrutura é um mecanismo:' },
      ],
    },
  },
};
