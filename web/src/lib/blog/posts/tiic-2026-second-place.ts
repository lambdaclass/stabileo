import type { Post } from '../types';

export const tiic2026SecondPlace: Post = {
  slug: 'tiic-2026-second-place',
  date: '2026-10-20',
  order: 9,
  authors: ['Bautista Chesta'],
  tagKeys: ['blog.tag.events', 'blog.tag.ai'],
  i18n: {
    es: {
      title: 'Experiencia TIIC 2026: el segundo puesto y una charla sobre algoritmos en la obra',
      excerpt:
        'El 20 de octubre recibimos el certificado del segundo puesto del programa TIIC de la Cámara Argentina de la Construcción, mostramos Stabileo en un stand y participamos de la charla "Tu próximo compañero de obra podría ser un algoritmo".',
      blocks: [
        { k: 'p', t: 'TIIC (Transformar e Innovar la Industria de la Construcción) es el programa de la Cámara Argentina de la Construcción para proyectos que buscan cambiar cómo se diseña y se construye. Este año se presentaron cerca de setenta proyectos, se seleccionaron diez y Stabileo quedó en el segundo puesto, con lo que entró a la cohorte 2026.' },
        { k: 'p', t: 'El 20 de octubre fue la Experiencia TIIC, en el Parque de Innovación de Buenos Aires: una jornada con los proyectos de la cohorte y gente de toda la industria de la construcción. Tuvimos un stand con Stabileo funcionando en vivo, recibimos el certificado y participamos de una de las charlas.' },
        { k: 'photo', src: 'tiic-2026-certificate', w: 1200, h: 1200, alt: 'Bautista Chesta en el escenario de la Experiencia TIIC 2026, con el certificado del segundo puesto en las manos, junto a dos personas de la organización.', caption: 'La entrega del certificado del segundo puesto del programa TIIC.' },

        { k: 'h', t: 'La charla' },
        { k: 'p', t: 'La charla se llamó "Tu próximo compañero de obra podría ser un algoritmo". La compartimos con Iván Gauna, cofundador y CEO de ETHIX, y la moderó Camila Velasco.' },
        { k: 'p', t: 'Desde Stabileo contamos cómo pensamos la IA en el cálculo estructural: el agente ayuda a armar, modificar y documentar el modelo, y los números los produce un solver verificado que el agente no puede tocar. El ingeniero que firma tiene que poder revisar de dónde sale cada resultado, y eso se puede garantizar cuando el cálculo queda fuera del modelo de lenguaje.' },
        { k: 'photo', src: 'tiic-2026-panel', w: 1200, h: 1260, alt: 'Camila Velasco, Bautista Chesta e Iván Gauna sentados en el escenario; detrás, la pantalla con el título de la charla.', caption: 'Con Iván Gauna (ETHIX) y Camila Velasco en la charla "Tu próximo compañero de obra podría ser un algoritmo".' },

        { k: 'h', t: 'Lo que dijo el jurado' },
        { k: 'p', t: 'El jurado del programa nos hizo una sola observación: para uso profesional, convendría que el agente de IA estuviera validado por un organismo normativo como el CIRSOC. La compartimos y la tomamos como una línea de trabajo. Mientras tanto, las verificaciones de Stabileo se contrastan con ejemplos resueltos publicados y con el cálculo a mano.' },
        {
          k: 'table',
          caption: 'El programa TIIC 2026 en números.',
          head: ['Qué', 'Cantidad'],
          rows: [
            ['Proyectos presentados, aproximadamente', '70'],
            ['Proyectos seleccionados', '10'],
            ['Puesto de Stabileo', '2'],
          ],
        },

        { k: 'h', t: 'Lo que sigue' },
        { k: 'p', t: 'La cohorte nos pone en contacto con constructoras y estudios que pueden probar Stabileo en proyectos reales. Si trabajás en uno y querés probarlo, Stabileo se usa desde el navegador y el cálculo es gratis.' },

        { k: 'link', slug: 'jaie-2026-talk', t: 'Un mes antes, la misma idea presentada en las Jornadas Argentinas de Ingeniería Estructural:' },
        { k: 'link', slug: 'how-stabileo-checks-its-results', t: 'Cómo contrastamos los resultados del solver:' },
      ],
    },
    en: {
      title: 'Experiencia TIIC 2026: second place and a talk about algorithms on site',
      excerpt:
        'On 20 October we received the second-place certificate of TIIC, the Argentine Chamber of Construction\'s innovation programme, showed Stabileo at a stand and took part in the talk "Your next site colleague could be an algorithm".',
      blocks: [
        { k: 'p', t: 'TIIC (Transforming and Innovating the Construction Industry) is the Argentine Chamber of Construction\'s programme for projects that aim to change how buildings are designed and built. This year about seventy projects applied, ten were selected, and Stabileo came second, which brought it into the 2026 cohort.' },
        { k: 'p', t: 'On 20 October the Experiencia TIIC took place at the Parque de Innovación in Buenos Aires: a day with the cohort\'s projects and people from across the construction industry. We had a stand with Stabileo running live, received the certificate and took part in one of the talks.' },
        { k: 'photo', src: 'tiic-2026-certificate', w: 1200, h: 1200, alt: 'Bautista Chesta on the Experiencia TIIC 2026 stage holding the second-place certificate, next to two members of the organisation.', caption: 'Receiving the second-place certificate of the TIIC programme.' },

        { k: 'h', t: 'The talk' },
        { k: 'p', t: 'The talk was called "Your next site colleague could be an algorithm". We shared it with Iván Gauna, co-founder and CEO of ETHIX, and it was moderated by Camila Velasco.' },
        { k: 'p', t: 'For Stabileo, we explained how we approach AI in structural calculation: the agent helps build, change and document the model, and the numbers come from a verified solver the agent cannot touch. The engineer who signs has to be able to check where every result comes from, and that can be guaranteed when the calculation stays outside the language model.' },
        { k: 'photo', src: 'tiic-2026-panel', w: 1200, h: 1260, alt: 'Camila Velasco, Bautista Chesta and Iván Gauna seated on stage, with the screen showing the title of the talk behind them.', caption: 'With Iván Gauna (ETHIX) and Camila Velasco at the talk "Your next site colleague could be an algorithm".' },

        { k: 'h', t: 'What the jury said' },
        { k: 'p', t: 'The programme\'s jury made a single remark: for professional use, the AI agent should ideally be validated by a standards body such as CIRSOC. We agree, and we have taken it on as a line of work. In the meantime, Stabileo\'s design-code checks are compared with published worked examples and with hand calculations.' },
        {
          k: 'table',
          caption: 'The TIIC 2026 programme in numbers.',
          head: ['What', 'Count'],
          rows: [
            ['Projects that applied, approximately', '70'],
            ['Projects selected', '10'],
            ['Stabileo\'s place', '2'],
          ],
        },

        { k: 'h', t: 'What comes next' },
        { k: 'p', t: 'The cohort puts us in touch with construction companies and engineering firms that can try Stabileo on real projects. If you work at one and want to try it, Stabileo runs in the browser and the analysis is free.' },

        { k: 'link', slug: 'jaie-2026-talk', t: 'A month earlier, the same idea presented at the Argentine Structural Engineering Conference:' },
        { k: 'link', slug: 'how-stabileo-checks-its-results', t: 'How we check the solver\'s results:' },
      ],
    },
    pt: {
      title: 'Experiencia TIIC 2026: o segundo lugar e uma conversa sobre algoritmos na obra',
      excerpt:
        'Em 20 de outubro recebemos o certificado de segundo lugar do programa TIIC da Câmara Argentina da Construção, mostramos o Stabileo em um estande e participamos da conversa "Seu próximo colega de obra pode ser um algoritmo".',
      blocks: [
        { k: 'p', t: 'O TIIC (Transformar e Inovar a Indústria da Construção) é o programa da Câmara Argentina da Construção para projetos que buscam mudar a forma de projetar e construir. Neste ano se inscreveram cerca de setenta projetos, dez foram selecionados e o Stabileo ficou em segundo lugar, entrando assim na coorte 2026.' },
        { k: 'p', t: 'Em 20 de outubro aconteceu a Experiencia TIIC, no Parque de Innovación de Buenos Aires: um dia com os projetos da coorte e gente de toda a indústria da construção. Tivemos um estande com o Stabileo funcionando ao vivo, recebemos o certificado e participamos de uma das conversas.' },
        { k: 'photo', src: 'tiic-2026-certificate', w: 1200, h: 1200, alt: 'Bautista Chesta no palco da Experiencia TIIC 2026, com o certificado de segundo lugar nas mãos, ao lado de duas pessoas da organização.', caption: 'A entrega do certificado de segundo lugar do programa TIIC.' },

        { k: 'h', t: 'A conversa' },
        { k: 'p', t: 'A conversa se chamou "Seu próximo colega de obra pode ser um algoritmo". Dividimos o palco com Iván Gauna, cofundador e CEO da ETHIX, com moderação de Camila Velasco.' },
        { k: 'p', t: 'Pelo Stabileo, contamos como pensamos a IA no cálculo estrutural: o agente ajuda a montar, modificar e documentar o modelo, e os números são produzidos por um solver verificado que o agente não pode alterar. O engenheiro que assina precisa poder conferir de onde vem cada resultado, e isso pode ser garantido quando o cálculo fica fora do modelo de linguagem.' },
        { k: 'photo', src: 'tiic-2026-panel', w: 1200, h: 1260, alt: 'Camila Velasco, Bautista Chesta e Iván Gauna sentados no palco; atrás, a tela com o título da conversa.', caption: 'Com Iván Gauna (ETHIX) e Camila Velasco na conversa "Seu próximo colega de obra pode ser um algoritmo".' },

        { k: 'h', t: 'O que disse o júri' },
        { k: 'p', t: 'O júri do programa fez uma única observação: para uso profissional, seria conveniente que o agente de IA fosse validado por um órgão normativo como o CIRSOC. Concordamos e a adotamos como linha de trabalho. Enquanto isso, as verificações do Stabileo são comparadas com exemplos resolvidos publicados e com o cálculo à mão.' },
        {
          k: 'table',
          caption: 'O programa TIIC 2026 em números.',
          head: ['O quê', 'Quantidade'],
          rows: [
            ['Projetos inscritos, aproximadamente', '70'],
            ['Projetos selecionados', '10'],
            ['Colocação do Stabileo', '2'],
          ],
        },

        { k: 'h', t: 'O que vem agora' },
        { k: 'p', t: 'A coorte nos coloca em contato com construtoras e escritórios que podem testar o Stabileo em projetos reais. Se você trabalha em um deles e quer testar, o Stabileo roda no navegador e o cálculo é gratuito.' },

        { k: 'link', slug: 'jaie-2026-talk', t: 'Um mês antes, a mesma ideia apresentada nas Jornadas Argentinas de Engenharia Estrutural:' },
        { k: 'link', slug: 'how-stabileo-checks-its-results', t: 'Como conferimos os resultados do solver:' },
      ],
    },
  },
};
