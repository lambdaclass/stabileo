/**
 * The second post: which torsion theory applies, and what picking wrong costs.
 *
 * Every figure here was computed before it was written, not remembered:
 *
 *   · The Bredt-vs-exact table is the closed forms for a circular hollow tube,
 *     τ_exact = T·r_o/J with J = π(r_o⁴−r_i⁴)/2 against τ_Bredt = T/(2·A_m·t)
 *     with A_m = π·r_m². At t/r_m = 0.10 Bredt lands 4.5% low; at 0.50, 15%.
 *   · The slit-tube collapse is a 100×100×5 square tube: J goes from
 *     4,286,875 mm⁴ closed to 15,833 mm⁴ open, a factor of 271, and under
 *     1 kN·m the stress goes from 11.08 to 315.79 MPa, a factor of 29.
 *
 * They are quoted to the precision they were computed at and no further. If
 * one ever needs changing, recompute it — do not adjust it to read better.
 *
 * The lesson the post is built around is one the application already teaches
 * in `stress.tt.bredtCircular`: Bredt sits BELOW Cauchy on a circular tube,
 * which makes it approximate in the unsafe direction. The post exists to put
 * a number on "below".
 */
import type { Post } from '../types';

export const torsionTheories: Post = {
  slug: 'torsion-bredt-saint-venant',
  date: '2026-08-29',
  order: 4,
  authors: ['Bautista Chesta'],
  tagKeys: ['blog.tag.sections', 'blog.tag.theory'],
  i18n: {
    es: {
      title: 'Bredt o Saint-Venant: qué teoría de torsión aplica, y qué cuesta elegir mal',
      excerpt:
        'Tres fórmulas, una sección, tres números distintos. Cuál corresponde depende de cómo es la pared; y donde dos valen a la vez, Bredt queda 2 a 15 % por debajo.',
      blocks: [
        { k: 'p', t: 'Tres fórmulas distintas dan la tensión de corte por torsión. Para una misma sección pueden diferir en órdenes de magnitud, y cuál corresponde depende de cómo es la pared de la sección.' },
        { k: 'p', t: 'Hasta ahí, lo que dice cualquier libro. Lo que casi no se explica es qué pasa cuando dos de las tres se aplican a la misma sección: ahí no dan lo mismo, y la diferencia siempre va para el mismo lado.' },

        { k: 'h', t: 'Las tres fórmulas' },
        {
          k: 'ul',
          items: [
            'Cauchy, τ = T·r / Iₚ. Sólo para sección circular, y ahí es exacta: es el único caso en que las secciones planas siguen planas. La tensión crece linealmente con el radio, mínima adentro y máxima en la cara exterior.',
            'Bredt, τ = T / (2·Aₘ·t). Para pared delgada cerrada. El torsor lo toma un flujo de corte que circula alrededor del área encerrada. Aₘ es el área que encierra la línea media de la pared, no su cara exterior; confundirlas es un error frecuente.',
            'Saint-Venant, τ = T·t / J con J = (1/3)·Σb·t³. Para pared delgada abierta. Sin circuito cerrado, el flujo tiene que darse vuelta sobre sí mismo cruzando el espesor, y por eso el espesor entra al cubo.',
          ],
        },
        { k: 'note', t: 'Saint-Venant suele presentarse como la teoría "de las secciones abiertas", pero es la teoría general, y las otras dos son casos particulares suyos con solución cerrada. En una sección circular su solución coincide exactamente con Cauchy, porque por simetría circular la sección no alabea. En pared delgada cerrada, su solución es la de Bredt.' },

        { k: 'h', t: 'Cuando se aplican dos, no coinciden' },
        { k: 'p', t: 'Tomá un tubo circular. Cauchy se aplica y es exacta. Bredt también se aplica: hay una pared cerrada y un flujo que circula. Pero Bredt supone que la tensión es constante en el espesor, y Cauchy sabe que crece con el radio. Así que Bredt da el promedio y Cauchy, el máximo.' },
        {
          k: 'table',
          caption: 'Tubo circular hueco: cuánto queda Bredt por debajo del valor exacto, según el espesor relativo de la pared.',
          head: ['t / rₘ', 'Ejemplo (rₘ = 50 mm)', 'τ Bredt / τ exacta', 'Bredt queda por debajo'],
          rows: [
            ['0,05', 'pared 2,5 mm', '0,976', '2,4 %'],
            ['0,10', 'pared 5,0 mm', '0,955', '4,5 %'],
            ['0,20', 'pared 10,0 mm', '0,918', '8,2 %'],
            ['0,50', 'pared 25,0 mm', '0,850', '15,0 %'],
          ],
        },
        { k: 'p', t: 'En los cuatro casos Bredt queda por debajo. Para un tubo de 5 mm de pared sobre 50 mm de radio medio, que por la regla habitual todavía es pared delgada, la tensión real es 4,5 % mayor que la calculada. Con 10 mm de pared, 8,2 %.' },
        { k: 'quote', t: 'El error mantiene siempre el mismo signo: Bredt queda por debajo.' },
        { k: 'p', t: 'Una diferencia de 4,5 % no llama la atención en una verificación, y una pieza que no verifica puede pasar como que sí.' },

        { k: 'embed', query: 'example=torsion-tube&inspect=1&open=torsion', label: 'El mismo tubo, en Stabileo: CHS 105×5 en voladizo con 1 kN·m de torsor. El panel abre en Torsión y muestra Cauchy 13,34 MPa y Bredt 12,73 MPa, el 95 % de la tabla de arriba. Si movés el punto o cambiás la sección, los tres valores se recalculan.' },

        { k: 'h', t: 'Abrir la pared cambia el orden de magnitud' },
        { k: 'p', t: 'Entre dos teorías que se solapan, la diferencia es de pocos puntos porcentuales. Entre una pared cerrada y una abierta, es de órdenes de magnitud. Un tubo cuadrado de 100×100 mm con 5 mm de pared, cortado a lo largo, conserva el área, el peso y casi toda la inercia a flexión.' },
        {
          k: 'table',
          caption: 'El mismo tubo cuadrado 100×100×5, cerrado y con una ranura longitudinal, bajo un torsor de 1 kN·m.',
          head: ['', 'Cerrado', 'Con ranura', 'Factor'],
          rows: [
            ['J [mm⁴]', '4.286.875', '15.833', '271'],
            ['τ [MPa]', '11,08', '315,79', '29'],
          ],
        },
        { k: 'p', t: 'La rigidez a torsión cae 271 veces y la tensión se multiplica por 29. Un perfil C y un tubo cuadrado del mismo peso no se comportan igual en torsión.' },
        { k: 'note', t: 'Hay otro término que suele omitirse: el alabeo. Si una sección abierta no puede alabear libremente, porque está empotrada o porque el torsor varía a lo largo de la barra, aparece una torsión por alabeo que se suma a la de Saint-Venant. Omitirla también subestima.' },

        { k: 'h', t: 'Qué hace Stabileo con esto' },
        { k: 'p', t: 'Stabileo muestra las tres, cada una con su fórmula, sus términos y su valor. También las que no se aplican, con el motivo. Y cuando dos son válidas para la misma sección, muestra la diferencia entre ellas en lugar de elegir una en silencio.' },
        { k: 'p', t: 'El baricentro, el centro de corte y el núcleo central se calculan de la misma manera: paso a paso y a la vista, sobre el polígono real de la sección, sin fórmulas por tipo de perfil.' },
        { k: 'note', t: 'Para verlo: abrí el editor, dibujá o elegí una barra, y entrá en Avanzado → Análisis de sección → Torsión. Con un tubo circular vas a ver Cauchy y Bredt juntas, con la diferencia porcentual entre las dos. Con un perfil C vas a ver Bredt marcada como no aplicable, con el motivo.' },

        { k: 'h', t: 'En resumen' },
        {
          k: 'ol',
          items: [
            '¿La pared forma un circuito cerrado? Bredt, con Aₘ medida sobre la línea media.',
            '¿Es abierta? Saint-Venant, y el espesor entra al cubo: gobierna la pared más gruesa.',
            '¿Es circular? Cauchy, y es exacta. Si además usás Bredt, sabé que vas a quedar por debajo.',
            '¿Está impedido el alabeo? Entonces Saint-Venant sola no alcanza.',
          ],
        },
        { k: 'p', t: 'En todos los casos, conviene anotar junto al valor qué teoría se usó.' },
        { k: 'link', slug: 'bars-or-finite-elements', t: 'La misma pregunta (qué teoría aplica y qué cuesta elegir mal) aparece al decidir entre modelar con barras o con elementos finitos:' },

        { k: 'note', t: 'Los valores de esta nota salen de fórmulas cerradas aplicadas a las secciones indicadas: tubo circular hueco con Aₘ sobre la línea media, y tubo cuadrado 100×100×5 con J cerrado por Bredt y J abierto por Saint-Venant. Podés reproducirlos en Stabileo con esas mismas secciones.' },
      ],
    },

    en: {
      title: 'Bredt or Saint-Venant: which torsion theory applies, and what the wrong choice costs',
      excerpt:
        'Three formulas, one section, three different numbers. Which one applies depends on the wall; where two apply at once, Bredt comes out 2 to 15% low.',
      blocks: [
        { k: 'p', t: 'Three different formulas give the shear stress due to torsion. For the same section they can differ by orders of magnitude, and which one applies depends on the kind of wall the section has.' },
        { k: 'p', t: 'That much is in any textbook. What is rarely explained is what happens when two of the three apply to the same section: they give different answers, and the difference always goes the same way.' },

        { k: 'h', t: 'The three formulas' },
        {
          k: 'ul',
          items: [
            'Cauchy, τ = T·r / Iₚ. Circular sections only, and there it is exact: it is the only case in which plane sections remain plane. Stress grows linearly with radius, from a minimum at the inner face to a maximum at the outer face.',
            'Bredt, τ = T / (2·Aₘ·t). For closed thin-walled sections. The torque is carried by a shear flow that circulates around the enclosed area. Aₘ is the area enclosed by the mid-line of the wall, not by its outer face; mixing the two up is a common mistake.',
            'Saint-Venant, τ = T·t / J with J = (1/3)·Σb·t³. For open thin-walled sections. With no closed path, the flow has to turn back on itself across the thickness, which is why thickness appears cubed.',
          ],
        },
        { k: 'note', t: 'Saint-Venant is often presented as "the open-section theory", but it is the general theory, and the other two are special cases of it with closed-form solutions. On a circular section its solution matches Cauchy exactly, because circular symmetry means the section does not warp. On a thin closed wall, its solution is Bredt’s.' },

        { k: 'h', t: 'When two apply, they disagree' },
        { k: 'p', t: 'Take a circular tube. Cauchy applies and is exact. Bredt applies too: the wall is closed and a shear flow runs around it. But Bredt assumes the stress is constant through the thickness, while in Cauchy it grows with radius. So Bredt gives the average and Cauchy gives the maximum.' },
        {
          k: 'table',
          caption: 'Circular hollow tube: how far Bredt falls below the exact value, by relative wall thickness.',
          head: ['t / rₘ', 'Example (rₘ = 50 mm)', 'τ Bredt / τ exact', 'Bredt low by'],
          rows: [
            ['0.05', '2.5 mm wall', '0.976', '2.4 %'],
            ['0.10', '5.0 mm wall', '0.955', '4.5 %'],
            ['0.20', '10.0 mm wall', '0.918', '8.2 %'],
            ['0.50', '25.0 mm wall', '0.850', '15.0 %'],
          ],
        },
        { k: 'p', t: 'Bredt is low in all four cases. For a tube with a 5 mm wall and a 50 mm mean radius, which the usual rule of thumb still counts as thin-walled, the actual stress is 4.5% higher than the calculated one. With a 10 mm wall, 8.2%.' },
        { k: 'quote', t: 'The error always has the same sign: Bredt comes out low.' },
        { k: 'p', t: 'A 4.5% difference does not stand out in a design check, so a member that fails can look as if it passes.' },

        { k: 'embed', query: 'example=torsion-tube&inspect=1&open=torsion', label: 'The same tube in Stabileo: a CHS 105×5 cantilever under a 1 kN·m torque. The panel opens on Torsion and shows Cauchy 13.34 MPa and Bredt 12.73 MPa, the 95% from the table above. Move the point or change the section and all three values update.' },

        { k: 'h', t: 'Opening the wall changes the order of magnitude' },
        { k: 'p', t: 'Between overlapping theories the difference is a few per cent. Between a closed and an open wall it is orders of magnitude. Take a 100×100 mm square tube with a 5 mm wall and slit it lengthwise: it keeps its area, its weight and nearly all of its bending stiffness.' },
        {
          k: 'table',
          caption: 'The same 100×100×5 square tube, closed and with a longitudinal slit, under a 1 kN·m torque.',
          head: ['', 'Closed', 'Slit', 'Factor'],
          rows: [
            ['J [mm⁴]', '4,286,875', '15,833', '271'],
            ['τ [MPa]', '11.08', '315.79', '29'],
          ],
        },
        { k: 'p', t: 'Torsional stiffness drops by a factor of 271 and the stress goes up by a factor of 29. A C-channel and a square tube of the same weight behave very differently in torsion.' },
        { k: 'note', t: 'There is another term that often gets left out: warping. When an open section cannot warp freely, because it is fixed or because the torque varies along the member, warping torsion appears on top of Saint-Venant torsion. Ignoring it also leads to an underestimate.' },

        { k: 'h', t: 'What Stabileo does with this' },
        { k: 'p', t: 'Stabileo shows all three, each with its formula, its terms and its value. The ones that do not apply are shown too, with the reason. And when two are valid for the same section, it shows the difference between them instead of quietly picking one.' },
        { k: 'p', t: 'The centroid, the shear centre and the kern are handled the same way: computed step by step, in full view, on the actual polygon of the section rather than from a formula for each shape.' },
        { k: 'note', t: 'To see it, open the editor, draw or pick a member, and go to Advanced → Section analysis → Torsion. For a circular tube you will see Cauchy and Bredt side by side, with the percentage difference between them. For a C-channel you will see Bredt marked as not applicable, and the reason.' },

        { k: 'h', t: 'In short' },
        {
          k: 'ol',
          items: [
            'Does the wall form a closed circuit? Bredt, with Aₘ measured on the mid-line.',
            'Is it open? Saint-Venant, and thickness enters cubed: the thickest wall governs.',
            'Is it circular? Cauchy, and it is exact. If you also use Bredt, expect it to come out low.',
            'Is warping restrained? Then Saint-Venant alone is not enough.',
          ],
        },
        { k: 'p', t: 'Either way, record which theory you used alongside the value.' },
        { k: 'link', slug: 'bars-or-finite-elements', t: 'The same question (which theory applies, and what the wrong choice costs) comes up when choosing between frame members and finite elements:' },

        { k: 'note', t: 'The figures in this post come from closed-form solutions for the sections stated: a circular hollow tube with Aₘ on the mid-line, and a 100×100×5 square tube with the closed J from Bredt and the open J from Saint-Venant. You can reproduce them in Stabileo with the same sections.' },
      ],
    },

    pt: {
      title: 'Bredt ou Saint-Venant: qual teoria de torção se aplica, e o que custa escolher errado',
      excerpt:
        'Três fórmulas, uma seção, três números diferentes. Qual se aplica depende de como é a parede; e, onde duas valem ao mesmo tempo, Bredt fica de 2 a 15 % abaixo do exato.',
      blocks: [
        { k: 'p', t: 'Três fórmulas diferentes dão a tensão de cisalhamento por torção. Para uma mesma seção, elas podem diferir em ordens de grandeza, e qual delas se aplica depende de como é a parede da seção.' },
        { k: 'p', t: 'Até aí, nada que não esteja em qualquer livro. O que quase não se explica é o que acontece quando duas das três se aplicam à mesma seção: os resultados não batem, e a diferença vai sempre para o mesmo lado.' },

        { k: 'h', t: 'As três fórmulas' },
        {
          k: 'ul',
          items: [
            'Cauchy, τ = T·r / Iₚ. Só vale para seção circular, e aí é exata: é o único caso em que as seções planas permanecem planas. A tensão cresce linearmente com o raio, mínima na face interna e máxima na externa.',
            'Bredt, τ = T / (2·Aₘ·t). Para seções fechadas de parede fina. O torque é resistido por um fluxo de cisalhamento que circula em torno da área fechada. Aₘ é a área delimitada pela linha média da parede, não pela face externa; confundir as duas é um erro comum.',
            'Saint-Venant, τ = T·t / J com J = (1/3)·Σb·t³. Para seções abertas de parede fina. Sem um circuito fechado, o fluxo precisa voltar sobre si mesmo ao longo da espessura, e por isso a espessura aparece elevada ao cubo.',
          ],
        },
        { k: 'note', t: 'Saint-Venant costuma ser apresentada como "a teoria das seções abertas", mas é a teoria geral, e as outras duas são casos particulares dela com solução fechada. Numa seção circular, a solução coincide exatamente com a de Cauchy, porque, por simetria circular, a seção não empena. Em seção fechada de parede fina, a solução é a de Bredt.' },

        { k: 'h', t: 'Onde duas se aplicam, elas discordam' },
        { k: 'p', t: 'Pegue um tubo circular. Cauchy se aplica e é exata. Bredt também se aplica: a parede é fechada e há um fluxo circulando. Mas Bredt supõe tensão constante ao longo da espessura, enquanto em Cauchy ela cresce com o raio. Então Bredt dá a média, e Cauchy, o máximo.' },
        {
          k: 'table',
          caption: 'Tubo circular vazado: quanto Bredt fica abaixo do valor exato, conforme a espessura relativa da parede.',
          head: ['t / rₘ', 'Exemplo (rₘ = 50 mm)', 'τ Bredt / τ exata', 'Bredt fica abaixo em'],
          rows: [
            ['0,05', 'parede 2,5 mm', '0,976', '2,4 %'],
            ['0,10', 'parede 5,0 mm', '0,955', '4,5 %'],
            ['0,20', 'parede 10,0 mm', '0,918', '8,2 %'],
            ['0,50', 'parede 25,0 mm', '0,850', '15,0 %'],
          ],
        },
        { k: 'p', t: 'Nos quatro casos, Bredt fica abaixo. Para um tubo com parede de 5 mm e raio médio de 50 mm, que pela regra prática ainda conta como parede fina, a tensão real é 4,5 % maior que a calculada. Com parede de 10 mm, 8,2 %.' },
        { k: 'quote', t: 'O erro tem sempre o mesmo sinal: Bredt fica abaixo.' },
        { k: 'p', t: 'Uma diferença de 4,5 % não chama atenção numa verificação, e uma peça que não passa pode parecer aprovada.' },

        { k: 'embed', query: 'example=torsion-tube&inspect=1&open=torsion', label: 'O mesmo tubo no Stabileo: um CHS 105×5 em balanço sob um torque de 1 kN·m. O painel abre em Torção e mostra Cauchy 13,34 MPa e Bredt 12,73 MPa, os 95 % da tabela acima. Mova o ponto ou troque a seção, e os três valores são recalculados.' },

        { k: 'h', t: 'Abrir a parede muda a ordem de grandeza' },
        { k: 'p', t: 'Entre teorias que se sobrepõem, a diferença é de alguns pontos percentuais. Entre parede fechada e aberta, é de ordens de grandeza. Um tubo quadrado de 100×100 mm com parede de 5 mm, cortado no sentido longitudinal, mantém a área, o peso e quase toda a inércia à flexão.' },
        {
          k: 'table',
          caption: 'O mesmo tubo quadrado 100×100×5, fechado e com um corte longitudinal, sob um torque de 1 kN·m.',
          head: ['', 'Fechado', 'Cortado', 'Fator'],
          rows: [
            ['J [mm⁴]', '4.286.875', '15.833', '271'],
            ['τ [MPa]', '11,08', '315,79', '29'],
          ],
        },
        { k: 'p', t: 'A rigidez à torção cai 271 vezes e a tensão é multiplicada por 29. Um perfil C e um tubo quadrado do mesmo peso se comportam de forma muito diferente na torção.' },
        { k: 'note', t: 'Há outro termo que costuma ser omitido: o empenamento. Quando uma seção aberta não pode empenar livremente, porque está engastada ou porque o torque varia ao longo da barra, surge uma torção de empenamento que se soma à de Saint-Venant. Omiti-la também leva a subestimar.' },

        { k: 'h', t: 'O que o Stabileo faz com isso' },
        { k: 'p', t: 'O Stabileo mostra as três, cada uma com sua fórmula, seus termos e seu valor. As que não se aplicam também aparecem, com o motivo. E, quando duas são válidas para a mesma seção, mostra a diferença entre elas em vez de escolher uma sem avisar.' },
        { k: 'p', t: 'O centroide, o centro de cisalhamento e o núcleo central recebem o mesmo tratamento: são calculados passo a passo, à vista, sobre o polígono real da seção, sem fórmulas prontas para cada formato.' },
        { k: 'note', t: 'Para ver isso: abra o editor, desenhe ou escolha uma barra e vá em Avançado → Análise de seção → Torção. Num tubo circular, você vai ver Cauchy e Bredt lado a lado, com a diferença percentual entre elas. Num perfil C, vai ver Bredt marcada como não aplicável, e o motivo.' },

        { k: 'h', t: 'Em resumo' },
        {
          k: 'ol',
          items: [
            'A parede forma um circuito fechado? Bredt, com Aₘ medida sobre a linha média.',
            'É aberta? Saint-Venant, e a espessura aparece elevada ao cubo: governa a parede mais grossa.',
            'É circular? Cauchy, e é exata. Se você também usar Bredt, saiba que o resultado vai ficar abaixo.',
            'O empenamento está impedido? Então Saint-Venant sozinha não basta.',
          ],
        },
        { k: 'p', t: 'Em qualquer caso, vale registrar, junto com o valor, qual teoria foi usada.' },
        { k: 'link', slug: 'bars-or-finite-elements', t: 'A mesma pergunta (qual teoria se aplica e o que custa escolher errado) aparece na escolha entre modelar com barras ou com elementos finitos:' },

        { k: 'note', t: 'Os valores deste artigo saem de fórmulas fechadas aplicadas às seções indicadas: tubo circular vazado com Aₘ sobre a linha média, e tubo quadrado 100×100×5 com J fechado por Bredt e J aberto por Saint-Venant. Você pode reproduzi-los no Stabileo com essas mesmas seções.' },
      ],
    },
  },
};
