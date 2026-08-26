/**
 * The second post: the advanced tools, taken from the conceptual side.
 *
 * ── The claim, and how far it was checked ──
 *
 * The post argues that free structural software is good at modelling and
 * solving and does not attempt the advanced tools conceptually. That is a
 * comparative claim about other people's products, so it was researched
 * before it was written, and it is narrower than the one first drafted:
 *
 *   · "The only free software that shows its steps" is FALSE. SkyCiv shows
 *     step-by-step hand calculations for trusses and beams — free bodies,
 *     equilibrium equations before substitution, moment distribution for
 *     indeterminate beams. The post says so, by name.
 *   · Ftool is free, excellent and taught across Latin America. It shows
 *     behaviour — diagrams, influence lines — not the development behind it.
 *   · MASTAN2 is free and matrix-based, tied to McGuire, Gallagher & Ziemian.
 *     The theory lives in the textbook; the program runs the analysis.
 *   · `sectionproperties` is open source and does warping, shear centre and
 *     the Saint-Venant constant by finite elements — very likely better than
 *     we do. It is a Python library: it returns numbers and explains nothing,
 *     and the caller has to already know which theory applies.
 *
 * What none of them do is the conjunction: explain kinematic analysis,
 * produce a bar schedule, and develop section analysis. None does two. None
 * approaches any of the three conceptually. That is the claim, and naming
 * what each one is good at is what makes it survive a hostile reader.
 *
 * ── The numbers ──
 *
 * From `generateKinematicReport` on the `hidden-mechanism` fixture, run
 * before any of this was written:
 *
 *   formula        g = 3·m + r − 3·n
 *   substitution   g = 3×2 + 3 − 3×3 = 0
 *   classification HYPOSTATIC — not what the formula's zero implies
 *   mechanism      1 mode, node 3, dof ux
 *   isSolvable     false
 *
 * The point of the embed is that a reader watches the formula be overruled.
 * Do not "fix" the fixture so it solves: it is meant not to.
 */
import type { Post } from '../types';

export const conceptualAdvanced: Post = {
  slug: 'conceptual-side-advanced-tools',
  date: '2026-08-21',
  order: 2,
  authors: ['Bautista Chesta'],
  tagKeys: ['blog.tag.education', 'blog.tag.tools'],
  i18n: {
    es: {
      title: 'Lo que el software gratuito calcula, y lo que no te explica',
      excerpt:
        'Hay software estructural gratuito y muy bueno: modela, resuelve y muestra resultados. Lo que no hay es uno que encare las funciones avanzadas del lado conceptual.',
      blocks: [
        { k: 'p', t: 'Conviene empezar por lo que sí existe, porque es bastante y es bueno. Quien enseña estructuras hoy tiene herramientas gratuitas de primer nivel, y varias de ellas hacen su trabajo mejor de lo que lo hacemos nosotros.' },

        { k: 'h', t: 'El panorama gratuito, con nombre y apellido' },
        {
          k: 'table',
          caption: 'Herramientas gratuitas de análisis estructural, y qué muestran además del resultado.',
          head: ['Herramienta', 'Gratuita', 'Lo que hace muy bien', 'Desarrollo conceptual'],
          rows: [
            ['Ftool', 'Sí', 'Modelar pórticos planos y leer diagramas y líneas de influencia con una fluidez que pocos igualan', 'Muestra el comportamiento, no el desarrollo que lo produce'],
            ['MASTAN2', 'Sí (sobre MATLAB o su runtime)', 'Análisis matricial lineal y no lineal, ligado al libro de McGuire, Gallagher y Ziemian', 'La teoría está en el libro; el programa corre el análisis'],
            ['SkyCiv', 'Franja gratuita', 'Cálculos a mano paso a paso: cuerpos libres, ecuaciones de equilibrio antes de sustituir, Cross para hiperestáticas', 'Aritmética sustituida, y sobre estática básica'],
            ['sectionproperties', 'Sí, open source', 'Alabeo, centro de corte y constante de Saint-Venant por elementos finitos', 'Es una librería de Python: devuelve números, sin interfaz ni explicación'],
          ],
        },
        { k: 'p', t: 'De esa lista, SkyCiv es el que más se acerca a lo que solemos llamar «mostrar el desarrollo», y hay que decirlo con todas las letras: sus cálculos a mano son buenos. Te arma el diagrama de cuerpo libre, escribe ΣM = 0 antes de meter números y resuelve por Cross cuando la viga es hiperestática. Si alguien afirma que ningún programa gratuito muestra los pasos, SkyCiv lo desmiente en un minuto.' },

        { k: 'h', t: 'La diferencia no es mostrar pasos. Es decir cuándo la fórmula no aplica' },
        { k: 'p', t: 'Sustituir números en una fórmula correcta y explicar por qué esa fórmula es la que corresponde son dos cosas distintas. La primera te ahorra la cuenta. La segunda te evita el error que la cuenta no puede detectar, porque el error está una capa más arriba.' },
        { k: 'p', t: 'Los calculadores de torsión que se encuentran dando vueltas ilustran el punto al revés: vos elegís el tipo de sección —maciza, tubo cerrado, rectángulo— y el programa aplica la fórmula asociada. Nunca te dice que elegiste mal, ni qué habría dado la otra teoría, ni de qué lado del error quedás.' },
        { k: 'quote', t: 'Un programa que sólo calcula nunca te va a avisar de que estás calculando lo que no es.' },

        { k: 'h', t: 'Tres funciones donde no encontramos equivalente' },
        {
          k: 'ul',
          items: [
            'Análisis cinemático explicado. Buscamos software y no hay: lo que aparece es material de cátedra en PDF. El «educational software for kinematic analysis» que existe es para mecanismos de máquinas, bielas y manivelas, no para clasificar estructuras.',
            'Despiece. Lo único gratuito que encontramos es AutoRebar, y es un complemento de AutoCAD, así que para usar lo gratis hace falta una licencia cara. Además dibuja: vos ponés las barras, él arma la planilla. El resto son pruebas de siete días o software comercial. Open source, nada.',
            'Análisis de sección desarrollado. Acá sí hay un gratuito serio, sectionproperties, y en elementos finitos de alabeo probablemente nos gane. Pero es una librería sin interfaz: te devuelve el centro de corte, no te explica por qué está donde está.',
          ],
        },
        { k: 'p', t: 'Ninguna herramienta gratuita hace dos de las tres. Ninguna encara ninguna de las tres desde lo conceptual. Ese es el hueco, y es más chico y más preciso que «somos los únicos que enseñamos».' },

        { k: 'h', t: 'Una pantalla donde la diferencia se ve entera' },
        { k: 'p', t: 'Abajo hay una viga de dos tramos sobre tres apoyos. Los tres restringen solamente el movimiento vertical. Es el caso de manual, y a la vez el que más veces vi dar por bueno en un parcial.' },
        { k: 'p', t: 'La fórmula del grado de hiperestaticidad da g = 3·m + r − 3·n = 3×2 + 3 − 3×3 = 0. Cero significa isostática, y cualquier programa que se quede en la fórmula lo va a informar así. Pero nada sujeta la viga horizontalmente: es un mecanismo, y no se puede resolver.' },
        {
          k: 'table',
          caption: 'Lo que devuelve el análisis cinemático sobre esa viga, paso por paso.',
          head: ['Paso', 'Qué mira', 'Resultado'],
          rows: [
            ['2 · Grado de hiperestaticidad', 'g = 3·m + r − 3·n', '0'],
            ['3 · Matriz de rigidez', 'Modos de mecanismo detectados', '1'],
            ['3 · Matriz de rigidez', 'Grados de libertad sin restringir', '1'],
            ['4 · Sugerencias', 'Veredicto en pantalla', 'No se puede resolver'],
          ],
        },
        { k: 'p', t: 'La app no informa el cero y se lava las manos: lo contradice, y en el mismo paso 2 donde lo calculó: «La fórmula da g = 0 (condición necesaria para isostática), pero NO suficiente». El paso 3 arma la matriz de rigidez global —6×6 acá— y marca «Se detectaron 1 modo de mecanismo a pesar de que g = 0 ≥ 0». Nombra el nodo 3 y su desplazamiento horizontal, aclara que la ecuación del paso 2 cuenta restricciones pero no mira dónde están, y cierra con «✗ Mecanismo — no se puede resolver».' },
        {
          k: 'embed',
          query: 'example=hidden-mechanism&kin=1',
          label: 'La viga de tres apoyos verticales, con el panel de análisis cinemático abierto. Recorré los cuatro pasos: el segundo da g = 0 y el tercero encuentra el mecanismo que ese cero esconde. Probá cambiar un apoyo por uno fijo y volvé a correrlo — el grado pasa a 1 y el mecanismo desaparece.',
        },

        { k: 'h', t: 'Por qué esto le puede servir a una cátedra' },
        { k: 'p', t: 'Un alumno que aprende la fórmula del grado y nunca ve fallar la condición suficiente se lleva una regla incompleta y no lo sabe. Es difícil de mostrar en el pizarrón, porque el ejemplo que la rompe parece un error de tipeo. Acá se ve en una pantalla, con el número y la contradicción al lado.' },
        { k: 'p', t: 'Y no hace falta instalar nada, ni tener licencia, ni pedirle a la facultad que compre nada. Abre en el navegador, en español, y el modelo se comparte por link.' },

        { k: 'note', t: 'Una aclaración que corresponde: nada de esto dice que seamos mejores. Ftool modela más rápido y con menos fricción que nosotros. MASTAN2 tiene detrás un libro que nosotros no escribimos. Los cálculos a mano de SkyCiv están mejor presentados que varios de nuestros paneles. Y sectionproperties resuelve alabeo por elementos finitos, que nosotros aproximamos. Lo que sostenemos es una cosa sola y bastante específica: nadie encara las funciones avanzadas del lado conceptual. Si conocés una herramienta gratuita que explique el análisis cinemático, arme un despiece o desarrolle el análisis de sección, escribinos y corregimos esta nota.' },
      ],
    },
    en: {
      title: 'What free software computes, and what it never explains',
      excerpt:
        'There is free structural software, and it is good: it models, it solves, it shows results. What there is not is one that approaches the advanced tools conceptually.',
      blocks: [
        { k: 'p', t: 'Worth starting with what does exist, because there is plenty of it and it is good. Anyone teaching structures today has first-rate free tools available, and several of them do their job better than we do ours.' },

        { k: 'h', t: 'The free landscape, by name' },
        {
          k: 'table',
          caption: 'Free structural analysis tools, and what they show beyond the result.',
          head: ['Tool', 'Free', 'What it does very well', 'Conceptual development'],
          rows: [
            ['Ftool', 'Yes', 'Modelling plane frames and reading diagrams and influence lines, with a fluency few match', 'Shows the behaviour, not the development behind it'],
            ['MASTAN2', 'Yes (on MATLAB or its runtime)', 'Linear and non-linear matrix analysis, tied to McGuire, Gallagher and Ziemian', 'The theory is in the book; the program runs the analysis'],
            ['SkyCiv', 'Free tier', 'Step-by-step hand calculations: free bodies, equilibrium equations before substitution, moment distribution for indeterminate beams', 'Substituted arithmetic, and over basic statics'],
            ['sectionproperties', 'Yes, open source', 'Warping, shear centre and the Saint-Venant constant by finite elements', 'A Python library: it returns numbers, with no interface and no explanation'],
          ],
        },
        { k: 'p', t: 'Of that list SkyCiv comes closest to what we usually call "showing the working", and it deserves saying plainly: its hand calculations are good. It draws the free body, writes ΣM = 0 before any number goes in, and solves by moment distribution when the beam is indeterminate. Anyone claiming no free program shows its steps is refuted in about a minute.' },

        { k: 'h', t: 'The difference is not showing steps. It is saying when the formula does not apply' },
        { k: 'p', t: 'Substituting numbers into a correct formula and explaining why that formula is the right one are different things. The first saves you the arithmetic. The second saves you from the error the arithmetic cannot catch, because the error sits one layer above it.' },
        { k: 'p', t: 'The torsion calculators floating around illustrate the point in reverse: you pick the section type — solid, closed tube, rectangle — and the program applies the matching formula. It never tells you that you picked wrong, or what the other theory would have given, or which side of the error you are on.' },
        { k: 'quote', t: 'A program that only computes will never warn you that you are computing the wrong thing.' },

        { k: 'h', t: 'Three tools with no equivalent we could find' },
        {
          k: 'ul',
          items: [
            'Kinematic analysis, explained. We looked for software and there is none: what turns up is lecture material in PDF. The "educational software for kinematic analysis" that does exist is for machine mechanisms — linkages and cranks — not for classifying structures.',
            'Rebar detailing. The only free thing we found is AutoRebar, and it is an AutoCAD add-on, so using the free part requires an expensive licence. It also draws: you place the bars, it builds the schedule. The rest are seven-day trials or commercial software. Open source, nothing.',
            'Section analysis, developed. Here there is a serious free option, sectionproperties, and on warping finite elements it probably beats us. But it is a library with no interface: it hands you the shear centre, it does not explain why it is where it is.',
          ],
        },
        { k: 'p', t: 'No free tool does two of the three. None approaches any of the three conceptually. That is the gap, and it is smaller and more precise than "we are the only ones who teach".' },

        { k: 'h', t: 'One screen where the whole difference shows' },
        { k: 'p', t: 'Below is a two-span beam on three supports. All three restrain vertical movement only. It is the textbook case, and also the one I have seen marked correct more often than any other.' },
        { k: 'p', t: 'The degree formula gives g = 3·m + r − 3·n = 3×2 + 3 − 3×3 = 0. Zero means isostatic, and any program that stops at the formula will report exactly that. But nothing holds the beam horizontally: it is a mechanism, and it cannot be solved.' },
        {
          k: 'table',
          caption: 'What kinematic analysis returns on that beam, step by step.',
          head: ['Step', 'What it looks at', 'Result'],
          rows: [
            ['2 · Static indeterminacy', 'g = 3·m + r − 3·n', '0'],
            ['3 · Stiffness matrix', 'Mechanism modes detected', '1'],
            ['3 · Stiffness matrix', 'Unconstrained degrees of freedom', '1'],
            ['4 · Suggestions', 'Verdict on screen', 'Cannot be solved'],
          ],
        },
        { k: 'p', t: 'The app does not report the zero and wash its hands: it contradicts it, in the same step 2 that produced it — "The formula gives g = 0 (necessary condition for isostatic), but NOT sufficient". Step 3 assembles the global stiffness matrix, 6×6 here, and flags "Detected 1 mechanism mode" in spite of g = 0 ≥ 0. It names node 3 and its horizontal displacement, points out that the step 2 equation counts constraints without checking where they sit, and closes with "✗ Mechanism — cannot be solved".' },
        {
          k: 'embed',
          query: 'example=hidden-mechanism&kin=1',
          label: 'The beam on three vertical supports, with the kinematic analysis panel open. Walk the four steps: the second gives g = 0 and the third finds the mechanism that zero is hiding. Try swapping one support for a pinned one and run it again — the degree becomes 1 and the mechanism disappears.',
        },

        { k: 'h', t: 'Why a department might care' },
        { k: 'p', t: 'A student who learns the degree formula and never watches the sufficient condition fail walks away with an incomplete rule and does not know it. It is hard to show on a blackboard, because the example that breaks it looks like a typo. Here it is on one screen, with the number and the contradiction side by side.' },
        { k: 'p', t: 'And nothing has to be installed, licensed, or bought by the faculty. It opens in a browser and the model travels as a link.' },

        { k: 'note', t: 'One thing worth stating: none of this says we are better. Ftool models faster and with less friction than we do. MASTAN2 has a textbook behind it that we did not write. SkyCiv\'s hand calculations are better presented than several of our panels. And sectionproperties solves warping by finite elements where we approximate. The claim is one specific thing: nobody approaches the advanced tools conceptually. If you know a free tool that explains kinematic analysis, produces a bar schedule, or develops section analysis, write to us and we will correct this post.' },
      ],
    },
    pt: {
      title: 'O que o software gratuito calcula, e o que não te explica',
      excerpt:
        'Existe software estrutural gratuito e muito bom: modela, resolve e mostra resultados. O que não existe é um que encare as funções avançadas pelo lado conceitual.',
      blocks: [
        { k: 'p', t: 'Vale começar pelo que existe, porque é bastante coisa e é bom. Quem ensina estruturas hoje tem ferramentas gratuitas de primeira linha, e várias delas fazem o trabalho delas melhor do que nós fazemos o nosso.' },

        { k: 'h', t: 'O panorama gratuito, com nome e sobrenome' },
        {
          k: 'table',
          caption: 'Ferramentas gratuitas de análise estrutural, e o que mostram além do resultado.',
          head: ['Ferramenta', 'Gratuita', 'O que faz muito bem', 'Desenvolvimento conceitual'],
          rows: [
            ['Ftool', 'Sim', 'Modelar pórticos planos e ler diagramas e linhas de influência com uma fluidez que poucos alcançam', 'Mostra o comportamento, não o desenvolvimento que o produz'],
            ['MASTAN2', 'Sim (sobre MATLAB ou seu runtime)', 'Análise matricial linear e não linear, ligada ao livro de McGuire, Gallagher e Ziemian', 'A teoria está no livro; o programa roda a análise'],
            ['SkyCiv', 'Faixa gratuita', 'Cálculos à mão passo a passo: corpos livres, equações de equilíbrio antes de substituir, Cross para hiperestáticas', 'Aritmética substituída, e sobre estática básica'],
            ['sectionproperties', 'Sim, open source', 'Empenamento, centro de cisalhamento e constante de Saint-Venant por elementos finitos', 'É uma biblioteca Python: devolve números, sem interface e sem explicação'],
          ],
        },
        { k: 'p', t: 'Dessa lista o SkyCiv é o que mais se aproxima do que costumamos chamar de «mostrar o desenvolvimento», e é preciso dizer com todas as letras: os cálculos à mão dele são bons. Monta o diagrama de corpo livre, escreve ΣM = 0 antes de entrar com números e resolve por Cross quando a viga é hiperestática. Quem afirmar que nenhum programa gratuito mostra os passos é desmentido em um minuto.' },

        { k: 'h', t: 'A diferença não é mostrar passos. É dizer quando a fórmula não se aplica' },
        { k: 'p', t: 'Substituir números numa fórmula correta e explicar por que aquela fórmula é a que corresponde são coisas diferentes. A primeira poupa a conta. A segunda evita o erro que a conta não consegue detectar, porque o erro está uma camada acima.' },
        { k: 'p', t: 'Os calculadores de torção que circulam por aí ilustram o ponto ao contrário: você escolhe o tipo de seção — maciça, tubo fechado, retângulo — e o programa aplica a fórmula correspondente. Nunca diz que você escolheu errado, nem o que a outra teoria teria dado, nem de que lado do erro você ficou.' },
        { k: 'quote', t: 'Um programa que só calcula nunca vai te avisar de que você está calculando o que não é.' },

        { k: 'h', t: 'Três funções para as quais não achamos equivalente' },
        {
          k: 'ul',
          items: [
            'Análise cinemática explicada. Procuramos software e não há: o que aparece é material de aula em PDF. O «educational software for kinematic analysis» que existe é para mecanismos de máquinas, bielas e manivelas, não para classificar estruturas.',
            'Detalhamento de armaduras. A única coisa gratuita que achamos é o AutoRebar, e é um complemento do AutoCAD, então para usar o que é grátis é preciso uma licença cara. Além disso ele desenha: você coloca as barras, ele monta a planilha. O resto são testes de sete dias ou software comercial. Open source, nada.',
            'Análise de seção desenvolvida. Aqui existe um gratuito sério, o sectionproperties, e em elementos finitos de empenamento provavelmente nos supera. Mas é uma biblioteca sem interface: devolve o centro de cisalhamento, não explica por que ele está onde está.',
          ],
        },
        { k: 'p', t: 'Nenhuma ferramenta gratuita faz duas das três. Nenhuma encara nenhuma das três pelo lado conceitual. Essa é a lacuna, e é menor e mais precisa que «somos os únicos que ensinam».' },

        { k: 'h', t: 'Uma tela onde a diferença aparece inteira' },
        { k: 'p', t: 'Abaixo há uma viga de dois vãos sobre três apoios. Os três restringem apenas o movimento vertical. É o caso de manual, e ao mesmo tempo o que mais vezes vi ser dado como certo numa prova.' },
        { k: 'p', t: 'A fórmula do grau de hiperestaticidade dá g = 3·m + r − 3·n = 3×2 + 3 − 3×3 = 0. Zero significa isostática, e qualquer programa que pare na fórmula vai informar exatamente isso. Mas nada segura a viga horizontalmente: é um mecanismo, e não tem solução.' },
        {
          k: 'table',
          caption: 'O que a análise cinemática devolve sobre essa viga, passo a passo.',
          head: ['Passo', 'O que olha', 'Resultado'],
          rows: [
            ['2 · Grau de indeterminação', 'g = 3·m + r − 3·n', '0'],
            ['3 · Matriz de rigidez', 'Modos de mecanismo detectados', '1'],
            ['3 · Matriz de rigidez', 'Graus de liberdade sem restrição', '1'],
            ['4 · Sugestões', 'Veredito na tela', 'Não pode ser resolvida'],
          ],
        },
        { k: 'p', t: 'O app não informa o zero e lava as mãos: ele o contradiz, no mesmo passo 2 em que o calculou — «A fórmula dá g = 0 (condição necessária para isostática), mas NÃO suficiente». O passo 3 monta a matriz de rigidez global, 6×6 aqui, e marca «Detectado 1 modo de mecanismo» apesar de g = 0 ≥ 0. Nomeia o nó 3 e seu deslocamento horizontal, esclarece que a equação do passo 2 conta restrições sem olhar onde estão, e fecha com «✗ Mecanismo — não pode ser resolvida».' },
        {
          k: 'embed',
          query: 'example=hidden-mechanism&kin=1',
          label: 'A viga sobre três apoios verticais, com o painel de análise cinemática aberto. Percorra os quatro passos: o segundo dá g = 0 e o terceiro encontra o mecanismo que esse zero esconde. Troque um apoio por um fixo e rode de novo — o grau vira 1 e o mecanismo desaparece.',
        },

        { k: 'h', t: 'Por que isso pode servir a um departamento' },
        { k: 'p', t: 'Um aluno que aprende a fórmula do grau e nunca vê a condição suficiente falhar sai com uma regra incompleta e não sabe disso. É difícil mostrar no quadro, porque o exemplo que a quebra parece um erro de digitação. Aqui aparece numa tela, com o número e a contradição lado a lado.' },
        { k: 'p', t: 'E não é preciso instalar nada, nem ter licença, nem pedir que a faculdade compre nada. Abre no navegador e o modelo viaja como link.' },

        { k: 'note', t: 'Um esclarecimento que cabe: nada disso diz que somos melhores. O Ftool modela mais rápido e com menos atrito que nós. O MASTAN2 tem um livro atrás que nós não escrevemos. Os cálculos à mão do SkyCiv estão mais bem apresentados que vários dos nossos painéis. E o sectionproperties resolve empenamento por elementos finitos, onde nós aproximamos. O que sustentamos é uma coisa só e bem específica: ninguém encara as funções avançadas pelo lado conceitual. Se você conhece uma ferramenta gratuita que explique análise cinemática, monte um detalhamento ou desenvolva análise de seção, escreva para nós e corrigimos esta nota.' },
      ],
    },
  },
};
