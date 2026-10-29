/**
 * /<locale>/cirsoc: what Stabileo checks against the Argentine codes today, and how far each check
 * is verified. A standing page, not a post: it answers "what software checks CIRSOC?" and is kept
 * current rather than dated.
 *
 * Every claim has a source and must stay no stronger than it:
 *  - docs/verification/MATURITY.md (verification level of each checker, clause counts against
 *    published examples, open issues #366, #374, #389, #391, #393);
 *  - docs/verification/DESIGN_EXAMPLES.md (INTI-CIRSOC 201-2005 and 301-2018 worked examples);
 *  - docs/verification/LOADS.md (CIRSOC 101-2025, 102-2025, INPRES-CIRSOC 103-2018 Parte I,
 *    CIRSOC 104-2005; ice and extraordinary events not implemented);
 *  - web/src/lib/engine/design/adapters/cirsoc201-adapter.ts (CIRSOC 201: 2025 by default, 2005
 *    selectable);
 *  - web/src/lib/i18n/locales/steel/* (steel checks labelled experimental, issue #389);
 *  - landing.pricingFreeNowNote (design free for public universities and contributors).
 * The FAQ is rendered on the page and stated as FAQPage data with the same text.
 */
import type { Block, Localized } from '../types';

export type StandingPage = {
  /** The route without its language prefix. */
  path: string;
  /** ISO day of the last substantive edit (sitemap lastmod). */
  updated: string;
  view?: 'changelog';
  i18n: Localized<
    {
      title: string;
      /** The meta description, ≤ 160 characters. */
      description: string;
      eyebrow: string;
      lead: string;
      blocks: Block[];
      faqTitle: string;
      faq: { q: string; a: string }[];
    }
  >;
};

export const cirsocPage: StandingPage = {
  path: '/cirsoc',
  updated: '2026-10-22',
  i18n: {
    es: {
      title: 'Verificación CIRSOC gratis en el navegador: qué está listo y qué falta',
      description:
        'Stabileo verifica hormigón (CIRSOC 201) y acero (CIRSOC 301, experimental) y genera cargas CIRSOC 101–104, gratis y en el navegador. Qué está listo y qué no.',
      eyebrow: 'CIRSOC',
      lead: 'Stabileo es un programa de cálculo estructural de código abierto que verifica elementos de hormigón armado según CIRSOC 201 (edición 2025) y de acero según CIRSOC 301-2018, y genera cargas y combinaciones según CIRSOC 101-2025, 102-2025, INPRES-CIRSOC 103-2018 (Parte I) y CIRSOC 104-2005. Usa el mismo modelo y el mismo solver con que calculás la estructura, corre en el navegador y no necesita instalación ni licencia. El diseño normativo está en el módulo PRO, que sigue en desarrollo y es gratis mientras dure.',
      blocks: [
        { k: 'h', t: 'Qué está disponible y cuánto está verificado' },
        { k: 'p', t: 'Certificado quiere decir que cada resultado trae una cota del error numérico calculada con aritmética de intervalos; no quiere decir que el modelo sea correcto ni que lo haya revisado un ingeniero. Los ejemplos publicados son los ejemplos de aplicación de INTI-CIRSOC.' },
        {
          k: 'table',
          caption: 'Qué verifica Stabileo según CIRSOC hoy, con el nivel de verificación de cada parte.',
          head: ['Reglamento', 'Qué hace', 'Estado'],
          rows: [
            ['CIRSOC 201 — hormigón armado', 'Vigas y columnas: flexión, flexocompresión, corte y armadura mínima; secciones, diagramas de interacción y losas desde el motor', 'Disponible en PRO. Flexión y corte de vigas certificados; flexocompresión y losas probados, sin certificar. 3 de 5 cláusulas contrastadas con ejemplos INTI-CIRSOC 201-2005'],
            ['CIRSOC 201-2025 — detallado', 'Anclajes, fisuración, separaciones y disposición de barras', 'Disponible en PRO. Probado con tests'],
            ['CIRSOC 301-2018 — acero', 'Tracción, compresión (pandeo flexional y flexotorsional), flexión y corte', 'Disponible, rotulado experimental hasta una revisión independiente. Certificado; 10 de 14 cláusulas contrastadas con ejemplos INTI-CIRSOC 301-2018'],
            ['CIRSOC 301-2018 J — uniones', 'Soldaduras de filete y uniones abulonadas', 'En desarrollo; 2 de 4 cláusulas contrastadas con ejemplos publicados'],
            ['CIRSOC 201 — bases aisladas', 'Presión en el suelo, corte, punzonado y flexión', 'En desarrollo; comparado con una segunda implementación'],
            ['CIRSOC 101-2025 — cargas y combinaciones', 'Las siete combinaciones de §2.3.2, cargas permanentes y sobrecargas', 'Lo implementado, verificado cláusula por cláusula contra el texto oficial; hielo, eventos extraordinarios y algunas disposiciones no cubiertos'],
            ['CIRSOC 102-2025 — viento', 'Presiones y combinaciones de servicio', 'Lo implementado, verificado contra el texto oficial; algunos casos sin cubrir'],
            ['INPRES-CIRSOC 103-2018 Parte I — sismo', 'Espectro, método según zona, peso sísmico y combinación sísmica', 'Lo implementado, verificado; algunas disposiciones sin cubrir'],
            ['CIRSOC 104-2005 — nieve', 'Cargas de nieve por localidad', 'Verificado contra las tablas'],
          ],
        },
        { k: 'h', t: 'Cómo funciona' },
        {
          k: 'ul',
          items: [
            'Un solo modelo: dibujás o importás la estructura (DXF, IFC o una plantilla de Excel) y la verificación usa los mismos esfuerzos que el análisis, sin pasarlos a mano a otra planilla.',
            'Las cargas y combinaciones de CIRSOC 101, 102, 103 y 104 se generan a partir de los datos del proyecto.',
            'Cada elemento termina con su relación demanda/capacidad y la cláusula que gobierna, y cada paso se puede ver.',
            'El solver corre en tu computadora: el modelo no se envía a ningún servidor para calcularse. El código es abierto (AGPL-3.0).',
            'El mismo modelo da siempre los mismos números, y cada memoria registra la versión y los datos con que se obtuvo.',
          ],
        },
        { k: 'link', slug: 'verificacion-flexion-cirsoc-201', t: 'Un ejemplo resuelto paso a paso, con el modelo para abrir en el editor:' },
        { k: 'h', t: 'Cómo lo validamos, y dónde terminan las validaciones' },
        {
          k: 'ul',
          items: [
            'Los chequeos de diseño se contrastan cláusula por cláusula con los ejemplos de aplicación INTI-CIRSOC, y las cargas con los textos oficiales; cada diferencia queda documentada con su causa.',
            'El análisis se compara con otros siete programas de elementos finitos.',
            'Todavía no hubo una revisión independiente de un ingeniero estructural matriculado, y el acero sigue rotulado como experimental.',
            'Ningún programa verifica el modelo: las cargas, los apoyos y la idealización los decide quien calcula.',
          ],
        },
        { k: 'link', slug: 'safety-advisories', t: 'Cuando encontramos un error que pudo afectar resultados ya usados, lo publicamos con qué revisar:' },
      ],
      faqTitle: 'Preguntas frecuentes',
      faq: [
        { q: '¿Qué software verifica el diseño estructural según los reglamentos CIRSOC?', a: 'Stabileo verifica hormigón armado según CIRSOC 201 y acero según CIRSOC 301-2018 (rotulado experimental), y genera cargas y combinaciones según CIRSOC 101-2025, 102-2025, INPRES-CIRSOC 103-2018 y CIRSOC 104-2005. Es de código abierto, corre en el navegador y es gratis mientras el módulo de diseño esté en desarrollo.' },
        { q: '¿Stabileo es gratis para verificar según CIRSOC?', a: 'Sí, hoy sí. El análisis (Básico) es gratis. El módulo de diseño normativo está en desarrollo y es gratis mientras dure; después va a seguir siendo gratis para las universidades públicas y para quienes participen del desarrollo.' },
        { q: '¿Puedo usar Stabileo para un cálculo que voy a firmar?', a: 'La responsabilidad del proyecto es de quien lo firma, con cualquier programa. Stabileo publica qué está verificado y con qué nivel; todavía no tuvo una revisión independiente de un ingeniero matriculado y el acero está rotulado como experimental, así que conviene controlar a mano los elementos que gobiernan.' },
        { q: '¿Qué edición de CIRSOC 201 usa?', a: 'La 2025. La 2005 se puede elegir en los reglamentos del proyecto para proyectos anteriores, pero el diseño de vigas y columnas con esa edición todavía no está disponible. Los chequeos del motor se contrastan con los ejemplos de aplicación INTI-CIRSOC 201-2005.' },
      ],
    },
    en: {
      title: 'CIRSOC design checks, free in your browser: what ships and what does not',
      description:
        'Stabileo checks concrete (CIRSOC 201) and steel (CIRSOC 301, experimental) and generates CIRSOC 101–104 loads, free in your browser. What ships and what not.',
      eyebrow: 'CIRSOC',
      lead: 'Stabileo is open-source structural analysis software that checks reinforced-concrete members against CIRSOC 201 (the 2025 edition) and steel members against CIRSOC 301-2018, and generates loads and combinations to CIRSOC 101-2025, 102-2025, INPRES-CIRSOC 103-2018 (Part I) and CIRSOC 104-2005, Argentina’s structural codes. It uses the same model and solver you analyse with, runs in the browser and needs no install or licence. Code design lives in the PRO module, which is still in development and free while it is.',
      blocks: [
        { k: 'h', t: 'What is available, and how far it is verified' },
        { k: 'p', t: 'Certified means every result carries a bound on its numerical error computed in interval arithmetic; it does not mean the model is right or that an engineer has reviewed it. The published examples are the INTI-CIRSOC worked examples.' },
        {
          k: 'table',
          caption: 'What Stabileo checks against CIRSOC today, with the verification level of each part.',
          head: ['Code', 'What it does', 'Status'],
          rows: [
            ['CIRSOC 201 — reinforced concrete', 'Beams and columns: flexure, combined axial and bending, shear and minimum steel; sections, interaction diagrams and slabs from the engine', 'Available in PRO. Beam flexure and shear certified; combined axial and bending and slabs tested, not certified. 3 of 5 clauses checked against INTI-CIRSOC 201-2005 examples'],
            ['CIRSOC 201-2025 — detailing', 'Anchorage, crack control, spacing and bar layout', 'Available in PRO. Tested'],
            ['CIRSOC 301-2018 — steel', 'Tension, compression (flexural and flexural-torsional buckling), flexure and shear', 'Available, labelled experimental until an independent review. Certified; 10 of 14 clauses checked against INTI-CIRSOC 301-2018 examples'],
            ['CIRSOC 301-2018 J — connections', 'Fillet welds and bolted connections', 'In development; 2 of 4 clauses checked against published examples'],
            ['CIRSOC 201 — spread footings', 'Soil pressure, shear, punching and flexure', 'In development; compared with a second implementation'],
            ['CIRSOC 101-2025 — loads and combinations', 'The seven combinations of §2.3.2, dead and live loads', 'What is implemented is verified clause by clause against the official text; ice, extraordinary events and some provisions not covered'],
            ['CIRSOC 102-2025 — wind', 'Pressures and service combinations', 'What is implemented is verified against the official text; some cases not covered'],
            ['INPRES-CIRSOC 103-2018 Part I — seismic', 'Spectrum, method by zone, seismic weight and seismic combination', 'What is implemented is verified; some provisions not covered'],
            ['CIRSOC 104-2005 — snow', 'Snow loads by locality', 'Verified against the tables'],
          ],
        },
        { k: 'h', t: 'How it works' },
        {
          k: 'ul',
          items: [
            'One model: you draw or import the structure (DXF, IFC or an Excel template) and the checks use the same forces as the analysis, with nothing copied by hand into another spreadsheet.',
            'Loads and combinations to CIRSOC 101, 102, 103 and 104 are generated from the project data.',
            'Each member ends with its demand/capacity ratio and the governing clause, and every step can be inspected.',
            'The solver runs on your computer: the model is not sent to any server to be solved. The code is open (AGPL-3.0).',
            'The same model always gives the same numbers, and every report records the version and the data that produced it.',
          ],
        },
        { k: 'link', slug: 'verificacion-flexion-cirsoc-201', t: 'A worked example step by step, with the model to open in the editor:' },
        { k: 'h', t: 'How we validate it, and where validation stops' },
        {
          k: 'ul',
          items: [
            'The design checks are compared clause by clause with the INTI-CIRSOC worked examples, and the loads with the official texts; every difference is documented with its cause.',
            'The analysis is compared with seven other finite-element programs.',
            'There has been no independent review by a licensed structural engineer yet, and steel is still labelled experimental.',
            'No program checks the model: the loads, supports and idealisation are the engineer’s decisions.',
          ],
        },
        { k: 'link', slug: 'safety-advisories', t: 'When we find a defect that could have affected results already used, we publish it with what to re-check:' },
      ],
      faqTitle: 'Frequently asked questions',
      faq: [
        { q: 'What software checks structural design against the CIRSOC codes?', a: 'Stabileo checks reinforced concrete against CIRSOC 201 and steel against CIRSOC 301-2018 (labelled experimental), and generates loads and combinations to CIRSOC 101-2025, 102-2025, INPRES-CIRSOC 103-2018 and CIRSOC 104-2005. It is open source, runs in the browser and is free while the design module is in development.' },
        { q: 'Is Stabileo free for CIRSOC checks?', a: 'Yes, today it is. Analysis (Basic) is free. The code design module is in development and free while it is; after that it stays free for public universities and for those who take part in its development.' },
        { q: 'Can I use Stabileo for a calculation I will sign?', a: 'The responsibility for a design is the signing engineer’s, with any program. Stabileo publishes what is verified and to what level; it has not yet had an independent review by a licensed engineer and steel is labelled experimental, so check the governing members by hand.' },
        { q: 'Which edition of CIRSOC 201 does it use?', a: 'The 2025 edition. 2005 can be selected in the project’s codes for earlier projects, but beam and column design with that edition is not available yet. The engine checks are compared with the INTI-CIRSOC 201-2005 worked examples.' },
      ],
    },
    pt: {
      title: 'Verificação CIRSOC grátis no navegador: o que está pronto e o que falta',
      description:
        'O Stabileo verifica concreto (CIRSOC 201) e aço (CIRSOC 301, experimental) e gera cargas CIRSOC 101–104, grátis no navegador. O que está pronto e o que não.',
      eyebrow: 'CIRSOC',
      lead: 'O Stabileo é um software de cálculo estrutural de código aberto que verifica elementos de concreto armado segundo a CIRSOC 201 (edição 2025) e de aço segundo a CIRSOC 301-2018, e gera cargas e combinações segundo as CIRSOC 101-2025, 102-2025, INPRES-CIRSOC 103-2018 (Parte I) e CIRSOC 104-2005, as normas estruturais argentinas. Usa o mesmo modelo e o mesmo solver com que você calcula a estrutura, roda no navegador e não precisa de instalação nem de licença. O dimensionamento normativo está no módulo PRO, que segue em desenvolvimento e é grátis enquanto durar.',
      blocks: [
        { k: 'h', t: 'O que está disponível e quanto está verificado' },
        { k: 'p', t: 'Certificado quer dizer que cada resultado traz uma cota do erro numérico calculada com aritmética de intervalos; não quer dizer que o modelo esteja correto nem que um engenheiro o tenha revisado. Os exemplos publicados são os exemplos de aplicação INTI-CIRSOC.' },
        {
          k: 'table',
          caption: 'O que o Stabileo verifica segundo a CIRSOC hoje, com o nível de verificação de cada parte.',
          head: ['Norma', 'O que faz', 'Situação'],
          rows: [
            ['CIRSOC 201 — concreto armado', 'Vigas e pilares: flexão, flexocompressão, cisalhamento e armadura mínima; seções, diagramas de interação e lajes a partir do motor', 'Disponível no PRO. Flexão e cisalhamento de vigas certificados; flexocompressão e lajes testados, sem certificar. 3 de 5 cláusulas confrontadas com exemplos INTI-CIRSOC 201-2005'],
            ['CIRSOC 201-2025 — detalhamento', 'Ancoragens, fissuração, espaçamentos e disposição das barras', 'Disponível no PRO. Testado'],
            ['CIRSOC 301-2018 — aço', 'Tração, compressão (flambagem por flexão e flexo-torção), flexão e cisalhamento', 'Disponível, rotulado experimental até uma revisão independente. Certificado; 10 de 14 cláusulas confrontadas com exemplos INTI-CIRSOC 301-2018'],
            ['CIRSOC 301-2018 J — ligações', 'Soldas de filete e ligações parafusadas', 'Em desenvolvimento; 2 de 4 cláusulas confrontadas com exemplos publicados'],
            ['CIRSOC 201 — sapatas isoladas', 'Pressão no solo, cisalhamento, punção e flexão', 'Em desenvolvimento; comparado com uma segunda implementação'],
            ['CIRSOC 101-2025 — cargas e combinações', 'As sete combinações do §2.3.2, cargas permanentes e sobrecargas', 'O implementado, verificado cláusula por cláusula contra o texto oficial; gelo, eventos extraordinários e algumas disposições sem cobertura'],
            ['CIRSOC 102-2025 — vento', 'Pressões e combinações de serviço', 'O implementado, verificado contra o texto oficial; alguns casos sem cobertura'],
            ['INPRES-CIRSOC 103-2018 Parte I — sismo', 'Espectro, método segundo a zona, peso sísmico e combinação sísmica', 'O implementado, verificado; algumas disposições sem cobertura'],
            ['CIRSOC 104-2005 — neve', 'Cargas de neve por localidade', 'Verificado contra as tabelas'],
          ],
        },
        { k: 'h', t: 'Como funciona' },
        {
          k: 'ul',
          items: [
            'Um só modelo: você desenha ou importa a estrutura (DXF, IFC ou uma planilha de Excel) e a verificação usa os mesmos esforços da análise, sem copiá-los à mão para outra planilha.',
            'As cargas e combinações das CIRSOC 101, 102, 103 e 104 são geradas a partir dos dados do projeto.',
            'Cada elemento termina com sua relação demanda/capacidade e a cláusula que governa, e cada passo pode ser visto.',
            'O solver roda no seu computador: o modelo não é enviado a nenhum servidor para ser calculado. O código é aberto (AGPL-3.0).',
            'O mesmo modelo sempre dá os mesmos números, e cada memória registra a versão e os dados com que foi obtida.',
          ],
        },
        { k: 'link', slug: 'verificacion-flexion-cirsoc-201', t: 'Um exemplo resolvido passo a passo, com o modelo para abrir no editor:' },
        { k: 'h', t: 'Como validamos, e onde terminam as validações' },
        {
          k: 'ul',
          items: [
            'As verificações de dimensionamento são confrontadas cláusula por cláusula com os exemplos de aplicação INTI-CIRSOC, e as cargas com os textos oficiais; cada diferença fica documentada com sua causa.',
            'A análise é comparada com outros sete programas de elementos finitos.',
            'Ainda não houve uma revisão independente de um engenheiro estrutural habilitado, e o aço segue rotulado como experimental.',
            'Nenhum programa verifica o modelo: as cargas, os apoios e a idealização são decisões de quem calcula.',
          ],
        },
        { k: 'link', slug: 'safety-advisories', t: 'Quando encontramos um erro que pode ter afetado resultados já usados, o publicamos com o que revisar:' },
      ],
      faqTitle: 'Perguntas frequentes',
      faq: [
        { q: 'Que software verifica o dimensionamento estrutural segundo as normas CIRSOC?', a: 'O Stabileo verifica concreto armado segundo a CIRSOC 201 e aço segundo a CIRSOC 301-2018 (rotulado experimental), e gera cargas e combinações segundo as CIRSOC 101-2025, 102-2025, INPRES-CIRSOC 103-2018 e CIRSOC 104-2005. É de código aberto, roda no navegador e é grátis enquanto o módulo de dimensionamento estiver em desenvolvimento.' },
        { q: 'O Stabileo é grátis para verificar segundo a CIRSOC?', a: 'Sim, hoje sim. A análise (Básico) é grátis. O módulo de dimensionamento normativo está em desenvolvimento e é grátis enquanto durar; depois continuará grátis para as universidades públicas e para quem participar do desenvolvimento.' },
        { q: 'Posso usar o Stabileo num cálculo que vou assinar?', a: 'A responsabilidade do projeto é de quem o assina, com qualquer programa. O Stabileo publica o que está verificado e com que nível; ainda não teve uma revisão independente de um engenheiro habilitado e o aço está rotulado como experimental, então convém conferir à mão os elementos que governam.' },
        { q: 'Que edição da CIRSOC 201 ele usa?', a: 'A 2025. A 2005 pode ser escolhida nas normas do projeto para projetos anteriores, mas o dimensionamento de vigas e pilares com essa edição ainda não está disponível. As verificações do motor são confrontadas com os exemplos de aplicação INTI-CIRSOC 201-2005.' },
      ],
    },
  },
};
