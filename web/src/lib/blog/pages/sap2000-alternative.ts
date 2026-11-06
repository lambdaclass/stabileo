/**
 * /<locale>/sap2000-alternative: for someone looking for a free alternative to a commercial
 * analysis licence. It says what Stabileo does and does not do; it makes no claim about other
 * programs beyond being commercial, so nothing on it goes stale with a vendor's price list.
 *
 * Every claim has a source and must stay no stronger than it:
 *  - landing copy (landing.basicP, landing.proCalcP, landing.proCalcShots) and the pricing table
 *    (LandingPricing.svelte: Basic and PRO analysis free; code design free while in development,
 *    then for public universities and contributors);
 *  - docs/guide/en/05-pro.md, "Other codes" (AISC 360, EN 1993-1-1, AISI S100, ACI 318,
 *    EN 1992-1-1) and the CIRSOC page;
 *  - the how-stabileo-checks-its-results post (seven other FE programs).
 */
import type { StandingPage } from './cirsoc';

export const sap2000AlternativePage: StandingPage = {
  path: '/sap2000-alternative',
  updated: '2026-10-22',
  i18n: {
    es: {
      title: 'Una alternativa gratis y de código abierto a SAP2000, en el navegador',
      description:
        'Stabileo: cálculo estructural gratis y abierto en el navegador. Pórticos 2D y 3D, láminas, P-Delta, modal y espectro, con verificación CIRSOC, ACI y AISC.',
      eyebrow: 'Alternativa a SAP2000',
      lead: 'Stabileo es un programa de cálculo estructural gratis y de código abierto (AGPL-3.0) que corre en el navegador, sin instalación, licencia ni cuenta. El solver está escrito en Rust y compilado a WebAssembly, así que el modelo se resuelve en tu computadora. El modo Básico modela, carga, resuelve y muestra resultados de pórticos y reticulados en 2D y 3D; el modo PRO, de acceso libre, suma losas y tabiques, importación de DXF e IFC, cargas según reglamento y verificación de elementos.',
      blocks: [
        { k: 'h', t: 'Cuándo es una buena alternativa' },
        {
          k: 'ul',
          items: [
            'Para calcular pórticos, reticulados y edificios sin pagar una licencia ni instalar nada, en cualquier sistema operativo con un navegador moderno.',
            'Para contrastar resultados de otro programa: Stabileo se compara con otros siete programas de elementos finitos y su código se puede leer completo.',
            'Para enseñar y aprender: muestra el método de rigidez paso a paso.',
            'Para verificar elementos de acero y hormigón según AISC 360, EN 1993-1-1, AISI S100, ACI 318, EN 1992-1-1 y los reglamentos argentinos CIRSOC, en el modo PRO.',
          ],
        },
        { k: 'h', t: 'Cuándo todavía no' },
        {
          k: 'ul',
          items: [
            'Si necesitás la cantidad de reglamentos y la trayectoria de décadas de un programa comercial establecido: el diseño normativo de Stabileo sigue en desarrollo.',
            'Si tu empresa exige un programa revisado de forma independiente por un ingeniero matriculado: esa revisión todavía no se hizo.',
          ],
        },
        { k: 'link', slug: 'how-stabileo-checks-its-results', t: 'Cómo verificamos los resultados, y dónde terminan las verificaciones:' },
      ],
      faqTitle: 'Preguntas frecuentes',
      faq: [
        { q: '¿Cuál es la mejor alternativa gratis a SAP2000?', a: 'Depende de para qué uses SAP2000. Para análisis de pórticos, reticulados y láminas en 2D y 3D en el navegador, sin instalar nada, Stabileo es gratis y de código abierto. Para análisis no lineal de investigación por scripts, OpenSees es la opción abierta de larga trayectoria.' },
        { q: '¿Puedo usar Stabileo en lugar de pagar una licencia de SAP2000 o ETABS?', a: 'Para el análisis de pórticos, reticulados y muchos edificios, y para verificar elementos según AISC 360, ACI 318, Eurocódigos y CIRSOC, sí, gratis. Para la variedad completa de reglamentos y una larga trayectoria en producción, los programas comerciales todavía ofrecen más; el diseño normativo de Stabileo sigue en desarrollo.' },
        { q: '¿Stabileo es realmente gratis?', a: 'El análisis (Básico y PRO) es gratis para todos. El diseño normativo es gratis mientras esté en desarrollo y después va a seguir siendo gratis para las universidades públicas y para quienes participen del desarrollo. El asistente de IA va a ser pago. El código es AGPL-3.0.' },
        { q: '¿Funciona en Mac o Linux?', a: 'Sí. Corre en cualquier navegador moderno, en cualquier sistema operativo.' },
      ],
    },
    en: {
      title: 'A free, open-source alternative to SAP2000, in your browser',
      description:
        'Stabileo: free, open-source structural analysis in your browser. 2D/3D frames, shells, P-Delta, modal and spectrum, with AISC, ACI, Eurocode and CIRSOC checks.',
      eyebrow: 'SAP2000 alternative',
      lead: 'Stabileo is free, open-source (AGPL-3.0) structural analysis software that runs in your browser, with no install, licence key or account. The solver is written in Rust and compiled to WebAssembly, so the model is solved on your own computer. Basic mode models, loads, solves and reads results for 2D and 3D frames and trusses; PRO mode, open to everyone, adds slabs and walls, DXF and IFC import, code loads and member checks.',
      blocks: [
        { k: 'h', t: 'When it is a good alternative' },
        {
          k: 'ul',
          items: [
            'Analysing frames, trusses and buildings without paying for a licence or installing anything, on any operating system with a modern browser.',
            'Checking results from another program: Stabileo is compared with seven other finite-element programs, and every line of its code can be read.',
            'Teaching and learning: it shows the stiffness method step by step.',
            'Checking steel and concrete members to AISC 360, EN 1993-1-1, AISI S100, ACI 318, EN 1992-1-1 and Argentina’s CIRSOC codes, in PRO mode.',
          ],
        },
        { k: 'h', t: 'When it is not yet' },
        {
          k: 'ul',
          items: [
            'If you need the range of design codes and the decades of track record of an established commercial program: code design in Stabileo is still in development.',
            'If your firm requires software independently reviewed by a licensed engineer: that review has not happened yet.',
          ],
        },
        { k: 'link', slug: 'how-stabileo-checks-its-results', t: 'How we check the results, and where the checks stop:' },
      ],
      faqTitle: 'Frequently asked questions',
      faq: [
        { q: 'What is the best free alternative to SAP2000?', a: 'It depends on what you use SAP2000 for. For browser-based 2D and 3D frame, truss and shell analysis with nothing to install, Stabileo is free and open source. For scripted nonlinear research analysis, OpenSees is the long-standing open-source option.' },
        { q: 'Can I use Stabileo instead of paying for a SAP2000 or ETABS licence?', a: 'For analysis of frames, trusses and many buildings, and for member checks to AISC 360, ACI 318, the Eurocodes and CIRSOC, yes, for free. For the full range of design codes and a long production track record, commercial programs still offer more; code design in Stabileo is still in development.' },
        { q: 'Is Stabileo really free?', a: 'Analysis (Basic and PRO) is free for everyone. Code design is free while it is in development, and after that stays free for public universities and for those who take part in its development. The AI assistant will be paid. The code is AGPL-3.0.' },
        { q: 'Does it run on Mac or Linux?', a: 'Yes. It runs in any modern browser, on any operating system.' },
      ],
    },
    pt: {
      title: 'Uma alternativa grátis e de código aberto ao SAP2000, no navegador',
      description:
        'Stabileo: cálculo estrutural grátis e aberto no navegador. Pórticos 2D e 3D, cascas, P-Delta, modal e espectro, com verificação CIRSOC, ACI, AISC e Eurocódigo.',
      eyebrow: 'Alternativa ao SAP2000',
      lead: 'O Stabileo é um software de cálculo estrutural grátis e de código aberto (AGPL-3.0) que roda no navegador, sem instalação, licença nem conta. O solver é escrito em Rust e compilado para WebAssembly, então o modelo é resolvido no seu computador. O modo Básico modela, carrega, resolve e mostra resultados de pórticos e treliças em 2D e 3D; o modo PRO, de acesso livre, acrescenta lajes e paredes, importação de DXF e IFC, cargas segundo a norma e verificação de elementos.',
      blocks: [
        { k: 'h', t: 'Quando é uma boa alternativa' },
        {
          k: 'ul',
          items: [
            'Para calcular pórticos, treliças e edifícios sem pagar uma licença nem instalar nada, em qualquer sistema operacional com um navegador moderno.',
            'Para confrontar resultados de outro programa: o Stabileo é comparado com outros sete programas de elementos finitos e seu código pode ser lido por inteiro.',
            'Para ensinar e aprender: mostra o método da rigidez passo a passo.',
            'Para verificar elementos de aço e concreto segundo AISC 360, EN 1993-1-1, AISI S100, ACI 318, EN 1992-1-1 e as normas argentinas CIRSOC, no modo PRO.',
          ],
        },
        { k: 'h', t: 'Quando ainda não' },
        {
          k: 'ul',
          items: [
            'Se você precisa da quantidade de normas e da trajetória de décadas de um programa comercial estabelecido: o dimensionamento normativo do Stabileo segue em desenvolvimento.',
            'Se a sua empresa exige um programa revisado de forma independente por um engenheiro habilitado: essa revisão ainda não foi feita.',
          ],
        },
        { k: 'link', slug: 'how-stabileo-checks-its-results', t: 'Como verificamos os resultados, e onde terminam as verificações:' },
      ],
      faqTitle: 'Perguntas frequentes',
      faq: [
        { q: 'Qual é a melhor alternativa grátis ao SAP2000?', a: 'Depende do uso que você faz do SAP2000. Para análise de pórticos, treliças e cascas em 2D e 3D no navegador, sem instalar nada, o Stabileo é grátis e de código aberto. Para análise não linear de pesquisa por scripts, o OpenSees é a opção aberta de longa trajetória.' },
        { q: 'Posso usar o Stabileo em vez de pagar uma licença do SAP2000 ou do ETABS?', a: 'Para a análise de pórticos, treliças e muitos edifícios, e para verificar elementos segundo AISC 360, ACI 318, Eurocódigos e CIRSOC, sim, de graça. Para a variedade completa de normas e uma longa trajetória em produção, os programas comerciais ainda oferecem mais; o dimensionamento normativo do Stabileo segue em desenvolvimento.' },
        { q: 'O Stabileo é mesmo grátis?', a: 'A análise (Básico e PRO) é grátis para todos. O dimensionamento normativo é grátis enquanto estiver em desenvolvimento e depois continuará grátis para as universidades públicas e para quem participar do desenvolvimento. O assistente de IA será pago. O código é AGPL-3.0.' },
        { q: 'Funciona no Mac ou no Linux?', a: 'Sim. Roda em qualquer navegador moderno, em qualquer sistema operacional.' },
      ],
    },
  },
};
