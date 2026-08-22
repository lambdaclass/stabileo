/**
 * The third post: what the ten steps of a CIRSOC 201 flexural check decide.
 *
 * Every number was produced by `checkFlexure` in
 * src/lib/engine/codes/argentina/cirsoc201.ts before any sentence was written,
 * on a 20×40 cm beam of H-25 with fy 420, 25 mm cover and 8 mm stirrups:
 *
 *   · As,min stops governing at Mu = 31.5 kN·m. Below that the reinforcement
 *     is decided by §9.6.1.2 and not by the moment.
 *   · The `0,25·√f'c/fy` branch only overtakes `1,4/fy` above f'c = 31.36 MPa,
 *     so from H-20 to H-31 the minimum does not depend on the concrete.
 *   · At Mu = 120 the section lands in the transition zone: εt = 2.76‰ and
 *     φ = 0.707, not 0.90.
 *   · At Mu = 200 the module adds compression steel because εt = 1.51‰, and
 *     with it εt returns to 7.46‰ and φ to 0.90.
 *   · The embedded beam: 5 m span, D = 12 kN/m plus 2 kN/m of self-weight,
 *     L = 8 kN/m, governing 1.2D+1.6L → Mu = 92.5 kN·m, 2 Ø25, φMn = 115.2,
 *     D/C = 0.80. The application reports 0.81 through its own pipeline.
 *
 * The embed's caption names the two buttons the reader has to press, and it
 * names them PER LANGUAGE. The editor inside the frame runs in the reader's
 * locale, so an English caption on a Spanish page sends someone looking for
 * "Compute demands" at a button that says "Calcular solicitaciones".
 *
 * That last pair is why the closing note exists. A first pass computed 0.74 by
 * hand because it forgot the self-weight the application includes. The
 * application was right. Recompute rather than adjust, and if a figure here
 * ever stops matching the embed, the embed is the one to believe.
 */
import type { Post } from '../types';

export const cirsoc201Flexure: Post = {
  slug: 'verificacion-flexion-cirsoc-201',
  date: '2026-08-22',
  authors: ['Bautista Chesta'],
  tagKeys: ['blog.tag.cirsoc', 'blog.tag.concrete'],
  i18n: {
    es: {
      title: 'Verificación a flexión según CIRSOC 201, paso a paso',
      excerpt:
        'Todos recuerdan φMn ≥ Mu. Esa es la última línea de la verificación, no la verificación. Los tres pasos que deciden el resultado son otros, y uno de ellos hace que φ no valga 0,9.',
      blocks: [
        { k: 'p', t: 'Verificar una viga a flexión se resume, en la memoria de casi todos, en una desigualdad: φMn ≥ Mu. Es cierto, y es la última línea. Lo que decide el resultado pasa antes, en pasos que rara vez se miran con atención porque parecen trámite.' },
        { k: 'p', t: 'Esto es lo que devuelve el módulo CIRSOC 201 de Stabileo para una viga de 20×40 cm, H-25, con acero fy 420, 25 mm de recubrimiento y estribos de 8, bajo un momento de 60 kN·m:' },
        {
          k: 'ol',
          items: [
            'd = 35,9 cm, d\' = 4,1 cm',
            'Mu = 60,00 kN·m',
            'As,mín = 2,39 cm²',
            'As,máx (simple) = 11,58 cm²',
            'As,req (tracción) = 4,73 cm²',
            'Armadura tracción: 2 Ø20 (6,28 cm²)',
            'a = 6,21 cm, c = 7,31 cm',
            'εt = 11,74‰',
            'εt ≥ 5‰ → F.C.T. → φ = 0,90',
            'φMn = 77,90 kN·m',
          ],
        },
        { k: 'p', t: 'Diez pasos. El décimo es el que todos recuerdan. Los que deciden son el tercero y el noveno.' },

        { k: 'h', t: 'Paso 3: el mínimo gobierna más seguido de lo que parece' },
        { k: 'p', t: 'El artículo 9.6.1.2 pide una armadura mínima de flexión igual al mayor entre 0,25·√f\'c/fy·bw·d y 1,4/fy·bw·d. Se suele leer como un piso que casi nunca se toca. En vigas de vivienda se toca todo el tiempo.' },
        {
          k: 'table',
          caption: 'La misma viga 20×40 de H-25, con momentos crecientes: quién decide la armadura.',
          head: ['Mu [kN·m]', 'As por resistencia [cm²]', 'As,mín [cm²]', 'Gobierna'],
          rows: [
            ['15', '1.12', '2.39', 'el mínimo'],
            ['30', '2.28', '2.39', 'el mínimo'],
            ['60', '4.73', '2.39', 'la resistencia'],
            ['90', '7.38', '2.39', 'la resistencia'],
          ],
        },
        { k: 'p', t: 'El cruce está en Mu = 31,5 kN·m. Por debajo de ese momento, dimensionar por resistencia no sirve de nada: la sección va a llevar 2,39 cm² igual. Vale la pena saber de qué lado del cruce está una viga antes de discutir su armadura.' },

        { k: 'h', t: 'Y el mínimo casi nunca depende del hormigón' },
        { k: 'p', t: 'De las dos ramas del artículo, la de √f\'c sólo supera a la otra cuando el hormigón es bastante bueno.' },
        {
          k: 'table',
          caption: 'Las dos ramas del mínimo, para fy 420, en por mil.',
          head: ['Hormigón', '0,25·√f\'c/fy', '1,4/fy', 'Gobierna'],
          rows: [
            ['H-20', '2.6620', '3.3333', '1,4/fy'],
            ['H-25', '2.9762', '3.3333', '1,4/fy'],
            ['H-30', '3.2603', '3.3333', '1,4/fy'],
            ['H-35', '3.5215', '3.3333', '√f\'c'],
          ],
        },
        { k: 'p', t: 'El cruce está en f\'c = 31,36 MPa. Para todo el rango que se usa en vivienda —H-20, H-25, H-30— la armadura mínima no depende del hormigón: sale de 1,4/fy y nada más. Subir de H-20 a H-30 no baja el mínimo ni un centímetro cuadrado.' },

        { k: 'h', t: 'Paso 9: φ no vale 0,9 porque sí' },
        { k: 'p', t: 'El coeficiente de reducción se aprende como 0,90 para flexión y se usa como constante. No lo es. Sale de la deformación de la armadura traccionada en el estado último, y el módulo lo dice en el paso 9: εt ≥ 5‰ → sección controlada por tracción → φ = 0,90. Si la sección lleva más armadura, εt baja y φ con ella.' },
        {
          k: 'table',
          caption: 'La misma viga, cargada cada vez más. εt y φ salen de los pasos 8 y 9.',
          head: ['Mu [kN·m]', 'Armadura', 'εt [‰]', 'φ', 'φMn [kN·m]'],
          rows: [
            ['30', '2 Ø16', '20.03', '0.90', '51.6'],
            ['60', '2 Ø20', '11.74', '0.90', '77.9'],
            ['90', '2 Ø25', '6.44', '0.90', '115.2'],
            ['120', '2 Ø32', '2.76', '0.707', '133.5'],
          ],
        },
        { k: 'p', t: 'En la última fila la sección entró en zona de transición y φ cayó a 0,707. La capacidad no creció como la armadura: entre las dos últimas filas el acero sube de 6,44 a 8,04 cm² de área nominal y φMn sólo pasa de 115,2 a 133,5 kN·m. Buena parte de lo que se agrega se pierde en el coeficiente.' },
        { k: 'quote', t: 'Una sección sobrearmada no falla en la verificación. Falla en el φ, y el resultado sigue diciendo que verifica.' },

        { k: 'h', t: 'Por qué se pone armadura de compresión' },
        { k: 'p', t: 'La respuesta que se suele dar es "para que entre". Es la consecuencia, no el motivo. Con Mu = 200 kN·m en esta misma viga, el módulo detecta εt = 1,51‰, por debajo del límite, y agrega armadura de compresión. Con ella el eje neutro sube, εt vuelve a 7,46‰ y φ vuelve a 0,90.' },
        { k: 'p', t: 'O sea que la armadura de compresión no está ahí para aportar capacidad, sino para devolverle ductilidad a la sección y recuperar el coeficiente. La capacidad viene después, como resultado.' },
        { k: 'note', t: 'Los pasos que el módulo emite para ese caso lo dicen en ese orden: "εt = 1,51‰ < 2,1‰ → se necesita A\'s", después "ΔM = 144,50 kN·m, A\'s,req = 11,40 cm²", y recién al final "εt = 7,46‰ → F.C.T. → φ = 0,90".' },

        { k: 'h', t: 'Probalo sobre una viga de verdad' },
        { k: 'p', t: 'Acá abajo está el modelo: una viga simplemente apoyada de 5 m, 20×40, H-25, con 12 kN/m de carga permanente y 8 kN/m de sobrecarga, más su peso propio. Abre en el flujo de diseño de PRO, con CIRSOC 201 como reglamento en vigencia.' },
        {
          k: 'embed',
          mode: 'pro',
          query: 'example=rc-beam-flexure&proTab=design',
          label: 'La viga en Stabileo, en el flujo de diseño de PRO. Apretá «Calcular solicitaciones» y después «Verificar según norma»: la combinación 1,2D+1,6L gobierna con Mu = 92,5 kN·m y la viga verifica con D/C = 0,81. Cambiá la carga y mirá de qué lado del cruce queda el mínimo. PRO está en desarrollo; el módulo de hormigón es la parte implementada y testeada.',
        },

        { k: 'h', t: 'En resumen' },
        {
          k: 'ol',
          items: [
            'Antes de dimensionar, mirá si el momento está por encima o por debajo del cruce con el mínimo. Debajo, la armadura ya está decidida.',
            'Para H-20 a H-30, el mínimo no depende del hormigón. Sale de 1,4/fy.',
            'φ es un resultado, no un dato. Miralo junto con εt.',
            'Si aparece armadura de compresión, es porque la sección perdió ductilidad, no porque falte capacidad.',
          ],
        },

        { k: 'note', t: 'Todas las cifras salen del módulo CIRSOC 201 de Stabileo, corrido sobre las secciones que se indican, y no de una tabla. Una advertencia que vale la pena, porque la primera versión de esta nota se equivocó ahí: el cálculo a mano daba D/C = 0,74 y la aplicación 0,81. La diferencia era el peso propio, 2 kN/m que la aplicación suma a la carga permanente. Tenía razón la aplicación. Si alguna vez un número de acá no coincide con lo que muestra el editor de arriba, creele al editor.' },
      ],
    },

    en: {
      title: 'Flexural verification to CIRSOC 201, step by step',
      excerpt:
        'Everyone remembers φMn ≥ Mu. That is the last line of the check, not the check. The three steps that decide the outcome are others, and one of them is why φ is not 0.9.',
      blocks: [
        { k: 'p', t: 'Checking a beam in bending reduces, in most people\'s memory, to one inequality: φMn ≥ Mu. It is true, and it is the last line. What decides the outcome happens earlier, in steps that are rarely read closely because they look like paperwork.' },
        { k: 'p', t: 'This is what Stabileo\'s CIRSOC 201 module returns for a 20×40 cm beam of H-25 concrete, fy 420 steel, 25 mm cover and 8 mm stirrups, under a moment of 60 kN·m:' },
        {
          k: 'ol',
          items: [
            'd = 35.9 cm, d\' = 4.1 cm',
            'Mu = 60.00 kN·m',
            'As,min = 2.39 cm²',
            'As,max (singly reinforced) = 11.58 cm²',
            'As,req (tension) = 4.73 cm²',
            'Tension reinforcement: 2 Ø20 (6.28 cm²)',
            'a = 6.21 cm, c = 7.31 cm',
            'εt = 11.74‰',
            'εt ≥ 5‰ → tension-controlled → φ = 0.90',
            'φMn = 77.90 kN·m',
          ],
        },
        { k: 'p', t: 'Ten steps. The tenth is the one everyone remembers. The ones that decide are the third and the ninth.' },

        { k: 'h', t: 'Step 3: the minimum governs more often than it seems' },
        { k: 'p', t: 'Article 9.6.1.2 asks for a minimum flexural reinforcement equal to the greater of 0.25·√f\'c/fy·bw·d and 1.4/fy·bw·d. It tends to be read as a floor that is almost never reached. In housing beams it is reached constantly.' },
        {
          k: 'table',
          caption: 'The same 20×40 H-25 beam under increasing moments: what decides the reinforcement.',
          head: ['Mu [kN·m]', 'As by strength [cm²]', 'As,min [cm²]', 'Governs'],
          rows: [
            ['15', '1.12', '2.39', 'the minimum'],
            ['30', '2.28', '2.39', 'the minimum'],
            ['60', '4.73', '2.39', 'strength'],
            ['90', '7.38', '2.39', 'strength'],
          ],
        },
        { k: 'p', t: 'The crossover is at Mu = 31.5 kN·m. Below that moment, sizing for strength achieves nothing: the section carries 2.39 cm² either way. It is worth knowing which side of the crossover a beam is on before arguing about its bars.' },

        { k: 'h', t: 'And the minimum rarely depends on the concrete' },
        { k: 'p', t: 'Of the article\'s two branches, the √f\'c one only overtakes the other once the concrete is quite good.' },
        {
          k: 'table',
          caption: 'The two branches of the minimum, for fy 420, per mille.',
          head: ['Concrete', '0.25·√f\'c/fy', '1.4/fy', 'Governs'],
          rows: [
            ['H-20', '2.6620', '3.3333', '1.4/fy'],
            ['H-25', '2.9762', '3.3333', '1.4/fy'],
            ['H-30', '3.2603', '3.3333', '1.4/fy'],
            ['H-35', '3.5215', '3.3333', '√f\'c'],
          ],
        },
        { k: 'p', t: 'The crossover is at f\'c = 31.36 MPa. Across the whole range used in housing — H-20, H-25, H-30 — the minimum reinforcement does not depend on the concrete: it comes from 1.4/fy and nothing else. Going from H-20 to H-30 does not lower the minimum by a single square centimetre.' },

        { k: 'h', t: 'Step 9: φ is not 0.9 by decree' },
        { k: 'p', t: 'The strength reduction factor is learnt as 0.90 for bending and used as a constant. It is not one. It comes from the strain in the tension steel at the ultimate state, and the module says so in step 9: εt ≥ 5‰ → tension-controlled → φ = 0.90. Put more steel in the section and εt falls, taking φ with it.' },
        {
          k: 'table',
          caption: 'The same beam, loaded further each time. εt and φ come from steps 8 and 9.',
          head: ['Mu [kN·m]', 'Reinforcement', 'εt [‰]', 'φ', 'φMn [kN·m]'],
          rows: [
            ['30', '2 Ø16', '20.03', '0.90', '51.6'],
            ['60', '2 Ø20', '11.74', '0.90', '77.9'],
            ['90', '2 Ø25', '6.44', '0.90', '115.2'],
            ['120', '2 Ø32', '2.76', '0.707', '133.5'],
          ],
        },
        { k: 'p', t: 'In the last row the section entered the transition zone and φ dropped to 0.707. Capacity did not grow the way the steel did: between the last two rows the bar area goes from 6.44 to 8.04 cm² nominal and φMn only moves from 115.2 to 133.5 kN·m. A good part of what is added is lost in the factor.' },
        { k: 'quote', t: 'An over-reinforced section does not fail the check. It fails in φ, and the result still says it passes.' },

        { k: 'h', t: 'Why compression steel goes in' },
        { k: 'p', t: 'The usual answer is "so the bars fit". That is the consequence, not the reason. At Mu = 200 kN·m on this same beam, the module finds εt = 1.51‰, below the limit, and adds compression reinforcement. With it the neutral axis rises, εt returns to 7.46‰ and φ returns to 0.90.' },
        { k: 'p', t: 'So compression steel is not there to contribute capacity. It is there to give the section its ductility back and recover the factor. The capacity follows, as a result.' },
        { k: 'note', t: 'The steps the module emits for that case say it in that order: "εt = 1.51‰ < 2.1‰ → A\'s required", then "ΔM = 144.50 kN·m, A\'s,req = 11.40 cm²", and only at the end "εt = 7.46‰ → tension-controlled → φ = 0.90".' },

        { k: 'h', t: 'Try it on a real beam' },
        { k: 'p', t: 'Below is the model: a simply supported 5 m beam, 20×40, H-25, with 12 kN/m of dead load and 8 kN/m of live load, plus its own weight. It opens in PRO\'s design workflow, with CIRSOC 201 as the code in force.' },
        {
          k: 'embed',
          mode: 'pro',
          query: 'example=rc-beam-flexure&proTab=design',
          label: 'The beam in Stabileo, in PRO\'s design workflow. Press "Compute demands" and then "Run code check": the 1.2D+1.6L combination governs with Mu = 92.5 kN·m and the beam passes at D/C = 0.81. Change the load and watch which side of the crossover the minimum lands on. PRO is in development; the concrete module is the part that is implemented and tested.',
        },

        { k: 'h', t: 'In short' },
        {
          k: 'ol',
          items: [
            'Before sizing, check whether the moment is above or below the crossover with the minimum. Below it, the reinforcement is already decided.',
            'From H-20 to H-30, the minimum does not depend on the concrete. It comes from 1.4/fy.',
            'φ is a result, not an input. Read it together with εt.',
            'If compression steel appears, it is because the section lost ductility, not because it lacks capacity.',
          ],
        },

        { k: 'note', t: 'Every figure here comes from Stabileo\'s CIRSOC 201 module, run on the sections named, and not from a table. One warning worth passing on, because the first draft of this post got it wrong: the hand calculation gave D/C = 0.74 and the application 0.81. The difference was self-weight, 2 kN/m that the application adds to the dead case. The application was right. If a number here ever stops matching the editor above, believe the editor.' },
      ],
    },

    pt: {
      title: 'Verificação à flexão segundo a CIRSOC 201, passo a passo',
      excerpt:
        'Todo mundo lembra de φMn ≥ Mu. Essa é a última linha da verificação, não a verificação. Os três passos que decidem o resultado são outros, e um deles é o motivo de φ não valer 0,9.',
      blocks: [
        { k: 'p', t: 'Verificar uma viga à flexão se resume, na memória de quase todos, a uma desigualdade: φMn ≥ Mu. É verdade, e é a última linha. O que decide o resultado acontece antes, em passos que raramente são lidos com atenção porque parecem burocracia.' },
        { k: 'p', t: 'Isto é o que o módulo CIRSOC 201 do Stabileo devolve para uma viga de 20×40 cm, concreto H-25, aço fy 420, 25 mm de cobrimento e estribos de 8, sob um momento de 60 kN·m:' },
        {
          k: 'ol',
          items: [
            'd = 35,9 cm, d\' = 4,1 cm',
            'Mu = 60,00 kN·m',
            'As,mín = 2,39 cm²',
            'As,máx (armadura simples) = 11,58 cm²',
            'As,req (tração) = 4,73 cm²',
            'Armadura de tração: 2 Ø20 (6,28 cm²)',
            'a = 6,21 cm, c = 7,31 cm',
            'εt = 11,74‰',
            'εt ≥ 5‰ → controlada por tração → φ = 0,90',
            'φMn = 77,90 kN·m',
          ],
        },
        { k: 'p', t: 'Dez passos. O décimo é o que todos lembram. Os que decidem são o terceiro e o nono.' },

        { k: 'h', t: 'Passo 3: o mínimo governa mais vezes do que parece' },
        { k: 'p', t: 'O artigo 9.6.1.2 exige uma armadura mínima de flexão igual ao maior entre 0,25·√f\'c/fy·bw·d e 1,4/fy·bw·d. Costuma ser lido como um piso que quase nunca se alcança. Em vigas de habitação, alcança-se o tempo todo.' },
        {
          k: 'table',
          caption: 'A mesma viga 20×40 de H-25, com momentos crescentes: quem decide a armadura.',
          head: ['Mu [kN·m]', 'As por resistência [cm²]', 'As,mín [cm²]', 'Governa'],
          rows: [
            ['15', '1.12', '2.39', 'o mínimo'],
            ['30', '2.28', '2.39', 'o mínimo'],
            ['60', '4.73', '2.39', 'a resistência'],
            ['90', '7.38', '2.39', 'a resistência'],
          ],
        },
        { k: 'p', t: 'O cruzamento está em Mu = 31,5 kN·m. Abaixo desse momento, dimensionar pela resistência não adianta: a seção vai levar 2,39 cm² de qualquer forma. Vale saber de que lado do cruzamento uma viga está antes de discutir a sua armadura.' },

        { k: 'h', t: 'E o mínimo quase nunca depende do concreto' },
        { k: 'p', t: 'Dos dois ramos do artigo, o de √f\'c só supera o outro quando o concreto é bastante bom.' },
        {
          k: 'table',
          caption: 'Os dois ramos do mínimo, para fy 420, em por mil.',
          head: ['Concreto', '0,25·√f\'c/fy', '1,4/fy', 'Governa'],
          rows: [
            ['H-20', '2.6620', '3.3333', '1,4/fy'],
            ['H-25', '2.9762', '3.3333', '1,4/fy'],
            ['H-30', '3.2603', '3.3333', '1,4/fy'],
            ['H-35', '3.5215', '3.3333', '√f\'c'],
          ],
        },
        { k: 'p', t: 'O cruzamento está em f\'c = 31,36 MPa. Em toda a faixa usada em habitação — H-20, H-25, H-30 — a armadura mínima não depende do concreto: sai de 1,4/fy e nada mais. Passar de H-20 para H-30 não reduz o mínimo em um único centímetro quadrado.' },

        { k: 'h', t: 'Passo 9: φ não vale 0,9 por decreto' },
        { k: 'p', t: 'O coeficiente de redução é aprendido como 0,90 para flexão e usado como constante. Não é. Ele vem da deformação da armadura tracionada no estado último, e o módulo diz isso no passo 9: εt ≥ 5‰ → seção controlada por tração → φ = 0,90. Coloque mais aço na seção e εt cai, levando φ junto.' },
        {
          k: 'table',
          caption: 'A mesma viga, carregada cada vez mais. εt e φ vêm dos passos 8 e 9.',
          head: ['Mu [kN·m]', 'Armadura', 'εt [‰]', 'φ', 'φMn [kN·m]'],
          rows: [
            ['30', '2 Ø16', '20.03', '0.90', '51.6'],
            ['60', '2 Ø20', '11.74', '0.90', '77.9'],
            ['90', '2 Ø25', '6.44', '0.90', '115.2'],
            ['120', '2 Ø32', '2.76', '0.707', '133.5'],
          ],
        },
        { k: 'p', t: 'Na última linha a seção entrou na zona de transição e φ caiu para 0,707. A capacidade não cresceu como o aço: entre as duas últimas linhas a área das barras vai de 6,44 para 8,04 cm² nominais e φMn só passa de 115,2 para 133,5 kN·m. Boa parte do que se acrescenta se perde no coeficiente.' },
        { k: 'quote', t: 'Uma seção superarmada não reprova na verificação. Ela reprova no φ, e o resultado continua dizendo que passa.' },

        { k: 'h', t: 'Por que entra armadura de compressão' },
        { k: 'p', t: 'A resposta habitual é "para as barras caberem". Essa é a consequência, não o motivo. Com Mu = 200 kN·m nesta mesma viga, o módulo detecta εt = 1,51‰, abaixo do limite, e acrescenta armadura de compressão. Com ela a linha neutra sobe, εt volta a 7,46‰ e φ volta a 0,90.' },
        { k: 'p', t: 'Ou seja, a armadura de compressão não está ali para dar capacidade. Está para devolver ductilidade à seção e recuperar o coeficiente. A capacidade vem depois, como resultado.' },
        { k: 'note', t: 'Os passos que o módulo emite para esse caso dizem isso nessa ordem: "εt = 1,51‰ < 2,1‰ → é necessário A\'s", depois "ΔM = 144,50 kN·m, A\'s,req = 11,40 cm²", e só no final "εt = 7,46‰ → controlada por tração → φ = 0,90".' },

        { k: 'h', t: 'Experimente numa viga de verdade' },
        { k: 'p', t: 'Abaixo está o modelo: uma viga simplesmente apoiada de 5 m, 20×40, H-25, com 12 kN/m de carga permanente e 8 kN/m de sobrecarga, mais o peso próprio. Abre no fluxo de projeto do PRO, com a CIRSOC 201 como norma em vigor.' },
        {
          k: 'embed',
          mode: 'pro',
          query: 'example=rc-beam-flexure&proTab=design',
          label: 'A viga no Stabileo, no fluxo de projeto do PRO. Aperte «Calcular solicitações» e depois «Executar verificação normativa»: a combinação 1,2D+1,6L governa com Mu = 92,5 kN·m e a viga passa com D/C = 0,81. Mude a carga e veja de que lado do cruzamento o mínimo cai. O PRO está em desenvolvimento; o módulo de concreto é a parte implementada e testada.',
        },

        { k: 'h', t: 'Em resumo' },
        {
          k: 'ol',
          items: [
            'Antes de dimensionar, veja se o momento está acima ou abaixo do cruzamento com o mínimo. Abaixo dele, a armadura já está decidida.',
            'De H-20 a H-30, o mínimo não depende do concreto. Sai de 1,4/fy.',
            'φ é um resultado, não um dado. Leia-o junto com εt.',
            'Se aparece armadura de compressão, é porque a seção perdeu ductilidade, não porque falta capacidade.',
          ],
        },

        { k: 'note', t: 'Todos os valores vêm do módulo CIRSOC 201 do Stabileo, rodado sobre as seções indicadas, e não de uma tabela. Um aviso que vale a pena, porque a primeira versão desta nota errou nisso: o cálculo à mão dava D/C = 0,74 e a aplicação 0,81. A diferença era o peso próprio, 2 kN/m que a aplicação soma à carga permanente. A aplicação estava certa. Se algum número daqui deixar de coincidir com o editor acima, acredite no editor.' },
      ],
    },
  },
};
