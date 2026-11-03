/** Dated the day of the talk. The 15 runs are the measurement shown in it; the D/C pair is the paper's §6.1 frame. */
import type { Post } from '../types';

export const jaie2026Talk: Post = {
  slug: 'jaie-2026-talk',
  date: '2026-09-18',
  order: 5,
  authors: ['Bautista Chesta'],
  tagKeys: ['blog.tag.events', 'blog.tag.research', 'blog.tag.ai'],
  i18n: {
    es: {
      title: 'Presentamos Stabileo en las 29.ª Jornadas Argentinas de Ingeniería Estructural',
      excerpt:
        'El 18 de septiembre expusimos en Córdoba el trabajo 86N, sobre un agente de cálculo estructural que propone cambios y deja todos los números a un solver verificado. Qué mostramos, por qué hace falta separar al agente del cálculo y lo que nos llevamos de las Jornadas.',
      blocks: [
        { k: 'p', t: 'Las 29.ª Jornadas Argentinas de Ingeniería Estructural se hicieron en Córdoba del 16 al 18 de septiembre, organizadas por la Asociación de Ingenieros Estructurales. El último día presentamos el trabajo 86N, "Desarrollo de un agente estructural de cálculo sobre un solver verificado", de Bautista Chesta, Raúl Bertero, Federico Carrone y Diego Kingston, en el área de inteligencia artificial aplicada a la ingeniería civil.' },
        { k: 'photo', src: 'jaie-2026-talk', w: 1600, h: 1200, alt: 'Bautista Chesta habla frente al público; en la pantalla, un pórtico de cuatro vanos con una viga marcada en rojo y el título "Se recalcula la estructura".', caption: 'La exposición del trabajo 86N. En pantalla, el momento en que una viga deja de verificar y el modelo completo se vuelve a resolver.' },

        { k: 'h', t: 'Qué mostramos' },
        { k: 'p', t: 'La idea central del trabajo es una regla de arquitectura: el agente de IA interpreta lo que pide el ingeniero y propone acciones, pero cada número sale del solver y de los módulos CIRSOC, que el agente no puede modificar. Lo llamamos la frontera de determinismo.' },
        { k: 'p', t: 'En la charla lo mostramos sobre un pórtico de hormigón armado que no verifica. El agente propone agrandar la viga, el solver resuelve el modelo completo de nuevo y la verificación CIRSOC 201 se recalcula sobre la estructura nueva: la relación demanda/capacidad baja de 1,10 a 0,97. La verificación está reproducida a mano en el trabajo, paso por paso.' },
        { k: 'p', t: 'El segundo caso fue un edificio de cuatro vanos y tres niveles al que se le quita una columna. Algunas vigas dejan de verificar, se redimensionan sus secciones y todas las barras vuelven a verificar, con el solver resolviendo el modelo entero en cada paso.' },

        { k: 'h', t: 'Por qué hace falta la frontera' },
        { k: 'p', t: 'Para mostrarlo, le hicimos el mismo pedido de predimensionado a asistentes de IA de uso general, quince veces. Devolvieron siete secciones distintas. Lo más llamativo fue que once corridas coincidieron en el momento de diseño y aun así propusieron seis secciones diferentes.' },
        {
          k: 'table',
          caption: 'El mismo pedido de predimensionado, repetido, y el pórtico corregido con el solver.',
          head: ['Qué', 'Valor'],
          rows: [
            ['Corridas del mismo pedido', '15'],
            ['Secciones distintas que devolvieron', '7'],
            ['Cociente entre el área mayor y la menor', '1,80'],
            ['Corridas que coincidieron en Mu = 207 kN·m', '11'],
            ['Secciones distintas entre esas corridas', '6'],
            ['D/C del pórtico antes de corregir', '1,10'],
            ['D/C del pórtico después de corregir', '0,97'],
          ],
        },
        { k: 'p', t: 'Con un solver detrás, el mismo modelo da el mismo número cada vez, y ese número se puede revisar. Esa diferencia es la que buscamos que el ingeniero pueda firmar con tranquilidad.' },

        { k: 'photo', src: 'jaie-2026-backdrop', w: 1152, h: 1320, alt: 'Diego Kingston y Bautista Chesta, con las credenciales de autores, frente al panel de patrocinadores de las Jornadas.', caption: 'Con Diego Kingston, coautor del trabajo, en las Jornadas.' },

        { k: 'h', t: 'Lo que nos llevamos' },
        { k: 'p', t: 'Nos llevamos contactos con ingenieros estructurales de todo el país y la propuesta de sumarnos a la red de ingenieros estructurales. También conversamos con universidades de Córdoba sobre usarlo en sus cursos.' },
        { k: 'p', t: 'El trabajo completo se puede leer en stabileo.com/paper, y Stabileo se usa desde el navegador, sin instalar nada.' },

        { k: 'link', slug: 'the-determinism-boundary', t: 'El resumen del trabajo, con los dos casos y sus números:' },
      ],
    },
    en: {
      title: 'Presenting Stabileo at the 29th Argentine Structural Engineering Conference',
      excerpt:
        'On 18 September we presented paper 86N in Córdoba: a structural calculation agent that proposes changes and leaves every number to a verified solver. What we showed, why the agent has to be kept apart from the calculation, and what we brought back.',
      blocks: [
        { k: 'p', t: 'The 29th Argentine Structural Engineering Conference (JAIE) ran in Córdoba from 16 to 18 September, organised by the Asociación de Ingenieros Estructurales. On the last day we presented paper 86N, "Development of a structural calculation agent on a verified solver", by Bautista Chesta, Raúl Bertero, Federico Carrone and Diego Kingston, in the track on artificial intelligence applied to civil engineering.' },
        { k: 'photo', src: 'jaie-2026-talk', w: 1600, h: 1200, alt: 'Bautista Chesta speaking to the audience; on the screen, a four-bay frame with one beam circled in red and the title "The structure is recomputed".', caption: 'Presenting paper 86N. On the screen, the moment a beam stops passing its check and the whole model is solved again.' },

        { k: 'h', t: 'What we showed' },
        { k: 'p', t: 'The paper rests on one architectural rule: the AI agent interprets what the engineer asks for and proposes actions, but every number comes from the solver and the CIRSOC modules, which the agent cannot change. We call it the determinism boundary.' },
        { k: 'p', t: 'In the talk we showed it on a reinforced concrete portal frame that fails its check. The agent proposes a deeper beam, the solver solves the whole model again, and the CIRSOC 201 check is recomputed on the new structure: the demand/capacity ratio drops from 1.10 to 0.97. The paper reproduces that check by hand, step by step.' },
        { k: 'p', t: 'The second case was a four-bay, three-storey building with one column removed. Some beams stop passing, their sections are resized and every member passes again, with the solver solving the entire model at each step.' },

        { k: 'h', t: 'Why the boundary is needed' },
        { k: 'p', t: 'To show it, we gave general-purpose AI assistants the same preliminary sizing request fifteen times. They returned seven different sections. The most telling part: eleven runs agreed on the design moment and still proposed six different sections.' },
        {
          k: 'table',
          caption: 'The same preliminary sizing request, repeated, and the portal frame corrected with the solver.',
          head: ['What', 'Value'],
          rows: [
            ['Runs of the same request', '15'],
            ['Different sections returned', '7'],
            ['Ratio of the largest to the smallest area', '1.80'],
            ['Runs that agreed on Mu = 207 kN·m', '11'],
            ['Different sections among those runs', '6'],
            ['Portal frame D/C before the correction', '1.10'],
            ['Portal frame D/C after the correction', '0.97'],
          ],
        },
        { k: 'p', t: 'With a solver behind it, the same model gives the same number every time, and that number can be checked. That is what we want an engineer to be able to sign with confidence.' },

        { k: 'photo', src: 'jaie-2026-backdrop', w: 1152, h: 1320, alt: 'Diego Kingston and Bautista Chesta, wearing author badges, in front of the conference sponsor wall.', caption: 'With Diego Kingston, co-author of the paper, at the conference.' },

        { k: 'h', t: 'What we brought back' },
        { k: 'p', t: 'We came back with contacts among structural engineers from across the country and an invitation to join the structural engineers\' network. We also talked with universities in Córdoba about using it in their courses.' },
        { k: 'p', t: 'The full paper is at stabileo.com/paper, and Stabileo runs in the browser with nothing to install.' },

        { k: 'link', slug: 'the-determinism-boundary', t: 'A summary of the paper, with both cases and their numbers:' },
      ],
    },
    pt: {
      title: 'Apresentamos o Stabileo nas 29.ª Jornadas Argentinas de Engenharia Estrutural',
      excerpt:
        'Em 18 de setembro apresentamos em Córdoba o trabalho 86N, sobre um agente de cálculo estrutural que propõe mudanças e deixa todos os números para um solver verificado. O que mostramos, por que é preciso separar o agente do cálculo e o que trouxemos das Jornadas.',
      blocks: [
        { k: 'p', t: 'As 29.ª Jornadas Argentinas de Engenharia Estrutural aconteceram em Córdoba de 16 a 18 de setembro, organizadas pela Asociación de Ingenieros Estructurales. No último dia apresentamos o trabalho 86N, "Desenvolvimento de um agente estrutural de cálculo sobre um solver verificado", de Bautista Chesta, Raúl Bertero, Federico Carrone e Diego Kingston, na área de inteligência artificial aplicada à engenharia civil.' },
        { k: 'photo', src: 'jaie-2026-talk', w: 1600, h: 1200, alt: 'Bautista Chesta fala para o público; na tela, um pórtico de quatro vãos com uma viga marcada em vermelho e o título "A estrutura é recalculada".', caption: 'A apresentação do trabalho 86N. Na tela, o momento em que uma viga deixa de passar na verificação e o modelo inteiro é resolvido de novo.' },

        { k: 'h', t: 'O que mostramos' },
        { k: 'p', t: 'A ideia central do trabalho é uma regra de arquitetura: o agente de IA interpreta o pedido do engenheiro e propõe ações, mas todo número sai do solver e dos módulos CIRSOC, que o agente não pode modificar. Chamamos isso de fronteira de determinismo.' },
        { k: 'p', t: 'Na palestra mostramos isso em um pórtico de concreto armado que não passa na verificação. O agente propõe aumentar a viga, o solver resolve o modelo inteiro de novo e a verificação CIRSOC 201 é recalculada sobre a estrutura nova: a relação demanda/capacidade cai de 1,10 para 0,97. O trabalho reproduz essa verificação à mão, passo a passo.' },
        { k: 'p', t: 'O segundo caso foi um edifício de quatro vãos e três pavimentos do qual se retira um pilar. Algumas vigas deixam de passar, suas seções são redimensionadas e todas as barras voltam a passar, com o solver resolvendo o modelo inteiro a cada passo.' },

        { k: 'h', t: 'Por que a fronteira é necessária' },
        { k: 'p', t: 'Para mostrar isso, fizemos o mesmo pedido de pré-dimensionamento a assistentes de IA de uso geral, quinze vezes. Eles devolveram sete seções diferentes. O mais revelador: onze execuções concordaram no momento de cálculo e mesmo assim propuseram seis seções diferentes.' },
        {
          k: 'table',
          caption: 'O mesmo pedido de pré-dimensionamento, repetido, e o pórtico corrigido com o solver.',
          head: ['O quê', 'Valor'],
          rows: [
            ['Execuções do mesmo pedido', '15'],
            ['Seções diferentes devolvidas', '7'],
            ['Razão entre a maior e a menor área', '1,80'],
            ['Execuções que concordaram em Mu = 207 kN·m', '11'],
            ['Seções diferentes entre essas execuções', '6'],
            ['D/C do pórtico antes da correção', '1,10'],
            ['D/C do pórtico depois da correção', '0,97'],
          ],
        },
        { k: 'p', t: 'Com um solver por trás, o mesmo modelo dá o mesmo número toda vez, e esse número pode ser conferido. É isso que queremos que o engenheiro possa assinar com tranquilidade.' },

        { k: 'photo', src: 'jaie-2026-backdrop', w: 1152, h: 1320, alt: 'Diego Kingston e Bautista Chesta, com os crachás de autores, diante do painel de patrocinadores das Jornadas.', caption: 'Com Diego Kingston, coautor do trabalho, nas Jornadas.' },

        { k: 'h', t: 'O que trouxemos' },
        { k: 'p', t: 'Trouxemos contatos com engenheiros estruturais de todo o país e o convite para integrar a rede de engenheiros estruturais. Também conversamos com universidades de Córdoba sobre usá-lo em seus cursos.' },
        { k: 'p', t: 'O trabalho completo está em stabileo.com/paper, e o Stabileo roda no navegador, sem instalar nada.' },

        { k: 'link', slug: 'the-determinism-boundary', t: 'Um resumo do trabalho, com os dois casos e seus números:' },
      ],
    },
  },
};
