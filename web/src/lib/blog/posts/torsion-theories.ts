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
  date: '2026-08-21',
  authors: ['Bautista Chesta'],
  tagKeys: ['blog.tag.sections', 'blog.tag.theory'],
  i18n: {
    es: {
      title: 'Bredt o Saint-Venant: qué teoría de torsión aplica, y qué cuesta elegir mal',
      excerpt:
        'Tres fórmulas, una sección, tres números distintos. Cuál corresponde depende de cómo es la pared, no de su tamaño. Y cuando dos se aplican a la vez no coinciden: Bredt queda por debajo del valor exacto, entre 2 y 15 % según el espesor.',
      blocks: [
        { k: 'p', t: 'Tres fórmulas distintas dan la tensión de corte por torsión. Para una misma sección pueden diferir en órdenes de magnitud, y cuál corresponde no depende del tamaño ni del material: depende de cómo es la pared.' },
        { k: 'p', t: 'Hasta ahí, lo que dice cualquier libro. Lo que casi no se explica es qué pasa cuando dos de las tres se aplican a la misma sección, porque ahí no dan lo mismo, y la diferencia siempre va para el mismo lado.' },

        { k: 'h', t: 'Las tres fórmulas' },
        {
          k: 'ul',
          items: [
            'Cauchy, τ = T·r / Iₚ. Sólo para sección circular, y ahí es exacta: es el único caso en que las secciones planas siguen planas. La tensión crece linealmente con el radio, mínima adentro y máxima en la cara exterior.',
            'Bredt, τ = T / (2·Aₘ·t). Para pared delgada cerrada. El torsor lo toma un flujo de corte que circula alrededor del área encerrada. Aₘ es el área que encierra la línea media de la pared, no su cara exterior; confundirlas es un error frecuente.',
            'Saint-Venant, τ = T·t / J con J = (1/3)·Σb·t³. Para pared delgada abierta. Sin circuito cerrado, el flujo tiene que darse vuelta sobre sí mismo cruzando el espesor, y por eso el espesor entra al cubo.',
          ],
        },
        { k: 'note', t: 'Saint-Venant no es la teoría "de las secciones abiertas": es la teoría general, y las otras dos son sus casos particulares con solución cerrada. En una sección circular su solución coincide exactamente con Cauchy, porque por simetría circular la sección no alabea. En pared cerrada delgada, su solución ES la de Bredt.' },

        { k: 'h', t: 'Cuando dos se aplican, no coinciden' },
        { k: 'p', t: 'Tomá un tubo circular. Cauchy se aplica y es exacta. Bredt también se aplica: hay una pared cerrada y un flujo que circula. Pero Bredt supone que la tensión es constante en el espesor, y Cauchy sabe que crece con el radio. Así que Bredt reporta un promedio donde Cauchy reporta el máximo.' },
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
        { k: 'p', t: 'En los cuatro casos Bredt queda por debajo. Para un tubo de 5 mm de pared sobre 50 mm de radio medio, que por la regla habitual todavía es pared delgada, la tensión real resulta 4,5 % mayor que la calculada. Con 10 mm de pared, 8,2 %.' },
        { k: 'quote', t: 'El error de Bredt no reparte: va siempre hacia tensiones menores que las reales.' },
        { k: 'p', t: 'Un 4,5 % no llama la atención en una verificación. Pasa como que verifica.' },

        { k: 'embed', query: 'example=torsion-tube&inspect=1&open=torsion', label: 'El mismo tubo, en Stabileo: CHS 105×5 en voladizo con 1 kN·m de torsor. El panel abre en Torsión y muestra Cauchy 13,34 MPa y Bredt 12,73 MPa, el 95 % de la tabla de arriba. Movés el punto, cambiás la sección, y los tres valores se recalculan.' },

        { k: 'h', t: 'Abrir la pared cambia el orden de magnitud' },
        { k: 'p', t: 'Entre teorías que se solapan la diferencia es de unidades por ciento. Entre pared cerrada y abierta es de otro orden. Un tubo cuadrado de 100×100 mm con 5 mm de pared, cortado a lo largo, conserva el área, el peso y casi toda la inercia a flexión.' },
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
        { k: 'note', t: 'Falta un término que se omite más de lo que se debería: el alabeo. En una sección abierta que no puede alabear libremente —porque está empotrada, o porque el torsor varía a lo largo— aparece una torsión por alabeo que se suma a la de Saint-Venant. Omitirla también subestima.' },

        { k: 'h', t: 'Qué hace Stabileo con esto' },
        { k: 'p', t: 'Muestra las tres, cada una con su fórmula, sus términos y su valor. También las que no se aplican, con el motivo. Y cuando dos son válidas para la misma sección, muestra la diferencia entre ellas en lugar de elegir una en silencio.' },
        { k: 'p', t: 'El baricentro, el centro de corte y el núcleo central se tratan igual: se derivan paso a paso y a la vista, sobre el polígono real de la sección y no sobre una fórmula por forma.' },
        { k: 'note', t: 'Para verlo: abrí el editor, dibujá o elegí una barra, y entrá en Avanzado → Análisis de sección → Torsión. Con un tubo circular vas a ver a Cauchy y a Bredt convivir, y el porcentaje entre las dos. Con un perfil C vas a ver a Bredt marcada como no aplicable, y por qué.' },

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
        { k: 'p', t: 'Y en cualquier caso, conviene anotar qué teoría se usó junto con el valor.' },

        { k: 'note', t: 'Los valores de esta nota son fórmulas cerradas calculadas para las secciones que se indican, no estimaciones: tubo circular hueco con Aₘ sobre la línea media, y tubo cuadrado 100×100×5 con J cerrado por Bredt y J abierto por Saint-Venant. Podés reproducirlos en Stabileo con esas mismas secciones.' },
      ],
    },

    en: {
      title: 'Bredt or Saint-Venant: which torsion theory applies, and what picking wrong costs',
      excerpt:
        'Three formulas, one section, three different numbers. Which one applies depends on how the wall is built, not on its size. And where two apply at once they do not agree: Bredt lands below the exact value, by 2 to 15% depending on thickness.',
      blocks: [
        { k: 'p', t: 'Three different formulas give the shear stress from torsion. For one section they can differ by orders of magnitude, and which one applies depends on how the wall is built rather than on its size or its material.' },
        { k: 'p', t: 'So far, what any textbook says. What is rarely spelt out is what happens when two of the three apply to the same section, because there they do not agree, and the difference always goes the same way.' },

        { k: 'h', t: 'The three formulas' },
        {
          k: 'ul',
          items: [
            'Cauchy, τ = T·r / Iₚ. Circular sections only, and there it is exact: the one case where plane sections stay plane. Stress grows linearly with radius, least on the inside and greatest at the outer face.',
            'Bredt, τ = T / (2·Aₘ·t). For a closed thin wall. The torque is carried by a shear flow circulating around the enclosed area. Aₘ is the area enclosed by the wall’s mid-line, not by its outer face; confusing the two is a common error.',
            'Saint-Venant, τ = T·t / J with J = (1/3)·Σb·t³. For an open thin wall. With no closed circuit, the flow has to turn back on itself across the thickness, which is why thickness enters cubed.',
          ],
        },
        { k: 'note', t: 'Saint-Venant is not "the open-section theory": it is the general one, and the other two are its closed-form special cases. On a circular section its solution coincides exactly with Cauchy, because circular symmetry means the section does not warp. On a closed thin wall, its solution IS Bredt’s.' },

        { k: 'h', t: 'Where two apply, they disagree' },
        { k: 'p', t: 'Take a circular tube. Cauchy applies and is exact. Bredt applies too: there is a closed wall and a flow running round it. But Bredt assumes the stress is constant through the thickness, and Cauchy knows it grows with radius. So Bredt reports an average where Cauchy reports the maximum.' },
        {
          k: 'table',
          caption: 'Circular hollow tube: how far below the exact value Bredt lands, by relative wall thickness.',
          head: ['t / rₘ', 'Example (rₘ = 50 mm)', 'τ Bredt / τ exact', 'Bredt lands below by'],
          rows: [
            ['0.05', '2.5 mm wall', '0.976', '2.4 %'],
            ['0.10', '5.0 mm wall', '0.955', '4.5 %'],
            ['0.20', '10.0 mm wall', '0.918', '8.2 %'],
            ['0.50', '25.0 mm wall', '0.850', '15.0 %'],
          ],
        },
        { k: 'p', t: 'In all four cases Bredt lands below. For a tube with a 5 mm wall over a 50 mm mean radius, still thin-walled by the usual rule of thumb, the real stress comes out 4.5% higher than the computed one. With a 10 mm wall, 8.2%.' },
        { k: 'quote', t: 'Bredt’s error does not split either way: it always lands on stresses lower than the real ones.' },
        { k: 'p', t: 'A 4.5% gap does not stand out in a check. It reads as passing.' },

        { k: 'embed', query: 'example=torsion-tube&inspect=1&open=torsion', label: 'The same tube, in Stabileo: a CHS 105×5 cantilever under 1 kN·m. The panel opens on Torsion and reads Cauchy 13.34 MPa and Bredt 12.73 MPa, the 95% from the table above. Move the point, change the section, and all three recompute.' },

        { k: 'h', t: 'Opening the wall changes the order of magnitude' },
        { k: 'p', t: 'Between overlapping theories the difference is a few per cent. Between a closed and an open wall it is another order. A 100×100 mm square tube with a 5 mm wall, slit lengthwise, keeps its area, its weight and almost all of its bending inertia.' },
        {
          k: 'table',
          caption: 'The same 100×100×5 square tube, closed and slit lengthwise, under a 1 kN·m torque.',
          head: ['', 'Closed', 'Slit', 'Factor'],
          rows: [
            ['J [mm⁴]', '4,286,875', '15,833', '271'],
            ['τ [MPa]', '11.08', '315.79', '29'],
          ],
        },
        { k: 'p', t: 'Torsional stiffness falls by a factor of 271 and the stress multiplies by 29. A C-channel and a square tube of the same weight do not behave the same way in torsion.' },
        { k: 'note', t: 'One term gets left out more than it should: warping. In an open section that cannot warp freely — because it is fixed, or because the torque varies along the member — a warping torsion appears on top of the Saint-Venant one. Leaving it out also underestimates.' },

        { k: 'h', t: 'What Stabileo does with this' },
        { k: 'p', t: 'It shows all three, each with its formula, its terms and its value. The ones that do not apply are shown too, with the reason. And when two are valid for the same section, it shows the difference between them rather than choosing one silently.' },
        { k: 'p', t: 'The centroid, the shear centre and the core get the same treatment: derived step by step and in view, on the real polygon of the section rather than on a per-shape formula.' },
        { k: 'note', t: 'To see it: open the editor, draw or pick a member, and go to Advanced → Section analysis → Torsion. On a circular tube you will find Cauchy and Bredt side by side with the percentage between them. On a C-channel you will find Bredt marked as not applicable, and why.' },

        { k: 'h', t: 'In short' },
        {
          k: 'ol',
          items: [
            'Does the wall form a closed circuit? Bredt, with Aₘ measured on the mid-line.',
            'Is it open? Saint-Venant, and thickness enters cubed: the thickest wall governs.',
            'Is it circular? Cauchy, and it is exact. If you use Bredt as well, know that you will land low.',
            'Is warping restrained? Then Saint-Venant alone is not enough.',
          ],
        },
        { k: 'p', t: 'And in any case, it is worth recording which theory was used alongside the value.' },

        { k: 'note', t: 'The figures here are closed forms computed for the sections named, not estimates: a circular hollow tube with Aₘ on the mid-line, and a 100×100×5 square tube with J closed by Bredt and J open by Saint-Venant. You can reproduce them in Stabileo with those same sections.' },
      ],
    },

    pt: {
      title: 'Bredt ou Saint-Venant: qual teoria de torção se aplica, e o que custa escolher errado',
      excerpt:
        'Três fórmulas, uma seção, três números diferentes. Qual se aplica depende de como é a parede, não do seu tamanho. E quando duas valem ao mesmo tempo elas não coincidem: Bredt fica abaixo do valor exato, entre 2 e 15 % conforme a espessura.',
      blocks: [
        { k: 'p', t: 'Três fórmulas diferentes dão a tensão de cisalhamento por torção. Para uma mesma seção podem diferir em ordens de grandeza, e qual delas corresponde depende de como é a parede, não do seu tamanho nem do material.' },
        { k: 'p', t: 'Até aí, o que diz qualquer livro. O que quase não se explica é o que acontece quando duas das três se aplicam à mesma seção, porque aí elas não dão o mesmo, e a diferença vai sempre para o mesmo lado.' },

        { k: 'h', t: 'As três fórmulas' },
        {
          k: 'ul',
          items: [
            'Cauchy, τ = T·r / Iₚ. Apenas para seção circular, e aí é exata: é o único caso em que as seções planas permanecem planas. A tensão cresce linearmente com o raio, mínima por dentro e máxima na face externa.',
            'Bredt, τ = T / (2·Aₘ·t). Para parede fina fechada. O torque é absorvido por um fluxo de cisalhamento que circula ao redor da área fechada. Aₘ é a área delimitada pela linha média da parede, não pela face externa; confundir as duas é um erro frequente.',
            'Saint-Venant, τ = T·t / J com J = (1/3)·Σb·t³. Para parede fina aberta. Sem circuito fechado, o fluxo tem de se voltar sobre si mesmo atravessando a espessura, e por isso a espessura entra ao cubo.',
          ],
        },
        { k: 'note', t: 'Saint-Venant não é "a teoria das seções abertas": é a geral, e as outras duas são seus casos particulares com solução fechada. Numa seção circular sua solução coincide exatamente com Cauchy, porque por simetria circular a seção não empena. Em parede fechada fina, sua solução É a de Bredt.' },

        { k: 'h', t: 'Onde duas se aplicam, elas discordam' },
        { k: 'p', t: 'Pegue um tubo circular. Cauchy se aplica e é exata. Bredt também se aplica: há uma parede fechada e um fluxo circulando. Mas Bredt supõe que a tensão é constante na espessura, e Cauchy sabe que ela cresce com o raio. Então Bredt reporta uma média onde Cauchy reporta o máximo.' },
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
        { k: 'p', t: 'Nos quatro casos Bredt fica abaixo. Para um tubo de 5 mm de parede sobre 50 mm de raio médio, que pela regra prática ainda é parede fina, a tensão real resulta 4,5 % maior que a calculada. Com 10 mm de parede, 8,2 %.' },
        { k: 'quote', t: 'O erro de Bredt não se reparte: vai sempre para tensões menores que as reais.' },
        { k: 'p', t: 'Um 4,5 % não chama atenção numa verificação. Passa como aprovado.' },

        { k: 'embed', query: 'example=torsion-tube&inspect=1&open=torsion', label: 'O mesmo tubo, no Stabileo: um CHS 105×5 em balanço sob 1 kN·m. O painel abre em Torção e mostra Cauchy 13,34 MPa e Bredt 12,73 MPa, os 95 % da tabela acima. Mova o ponto, troque a seção, e os três se recalculam.' },

        { k: 'h', t: 'Abrir a parede muda a ordem de grandeza' },
        { k: 'p', t: 'Entre teorias que se sobrepõem a diferença é de alguns por cento. Entre parede fechada e aberta é de outra ordem. Um tubo quadrado de 100×100 mm com parede de 5 mm, cortado ao longo, mantém a área, o peso e quase toda a inércia à flexão.' },
        {
          k: 'table',
          caption: 'O mesmo tubo quadrado 100×100×5, fechado e com um corte longitudinal, sob um torque de 1 kN·m.',
          head: ['', 'Fechado', 'Cortado', 'Fator'],
          rows: [
            ['J [mm⁴]', '4.286.875', '15.833', '271'],
            ['τ [MPa]', '11,08', '315,79', '29'],
          ],
        },
        { k: 'p', t: 'A rigidez à torção cai 271 vezes e a tensão se multiplica por 29. Um perfil C e um tubo quadrado do mesmo peso não se comportam igual em torção.' },
        { k: 'note', t: 'Falta um termo que é omitido mais do que deveria: o empenamento. Numa seção aberta que não pode empenar livremente — porque está engastada, ou porque o torque varia ao longo da barra — surge uma torção por empenamento que se soma à de Saint-Venant. Omiti-la também subestima.' },

        { k: 'h', t: 'O que o Stabileo faz com isso' },
        { k: 'p', t: 'Mostra as três, cada uma com sua fórmula, seus termos e seu valor. As que não se aplicam também aparecem, com o motivo. E quando duas são válidas para a mesma seção, mostra a diferença entre elas em vez de escolher uma em silêncio.' },
        { k: 'p', t: 'O baricentro, o centro de cisalhamento e o núcleo central recebem o mesmo tratamento: derivados passo a passo e à vista, sobre o polígono real da seção e não sobre uma fórmula por forma.' },
        { k: 'note', t: 'Para ver: abra o editor, desenhe ou escolha uma barra, e vá em Avançado → Análise de seção → Torção. Num tubo circular você vai encontrar Cauchy e Bredt lado a lado, com a porcentagem entre as duas. Num perfil C vai encontrar Bredt marcada como não aplicável, e por quê.' },

        { k: 'h', t: 'Em resumo' },
        {
          k: 'ol',
          items: [
            'A parede forma um circuito fechado? Bredt, com Aₘ medida sobre a linha média.',
            'É aberta? Saint-Venant, e a espessura entra ao cubo: governa a parede mais grossa.',
            'É circular? Cauchy, e é exata. Se você também usar Bredt, saiba que vai ficar abaixo.',
            'O empenamento está impedido? Então Saint-Venant sozinha não basta.',
          ],
        },
        { k: 'p', t: 'E, em qualquer caso, vale registrar qual teoria foi usada junto com o valor.' },

        { k: 'note', t: 'Os valores desta nota são fórmulas fechadas calculadas para as seções indicadas, não estimativas: tubo circular vazado com Aₘ sobre a linha média, e tubo quadrado 100×100×5 com J fechado por Bredt e J aberto por Saint-Venant. Você pode reproduzi-los no Stabileo com essas mesmas seções.' },
      ],
    },
  },
};
