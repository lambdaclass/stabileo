/**
 * Release 0.3.0, for readers: what changed since 0.2.0 and what to re-check.
 *
 * Every claim has a source and must stay no stronger than it:
 *  - docs/releases/v0.3.0.md (fact-checked against the advisories);
 *  - docs/advisories/SA-2026-005…020 (severity, who is affected, numbers);
 *  - CHANGELOG.md, 0.3.0.
 * If an advisory changes, this post changes with it.
 */
import type { Post } from '../types';

const REPO = 'https://github.com/lambdaclass/stabileo/blob/main';

export const release030: Post = {
  slug: 'stabileo-0-3-0',
  date: '2026-10-21',
  order: 8,
  authors: ['Federico Carrone'],
  tagKeys: ['blog.tag.safety', 'blog.tag.verification', 'blog.tag.solver'],
  i18n: {
    es: {
      title: 'Stabileo 0.3.0: dieciséis correcciones más y todos los avisos publicados',
      excerpt:
        'Qué cambió desde la 0.2.0: dieciséis errores que podían dar un resultado equivocado, corregidos y publicados como avisos; certificados que verifican el resultado contra el modelo; y los mismos números en cada cálculo.',
      blocks: [
        { k: 'p', t: 'La versión 0.3.0 salió el 21 de octubre de 2026. Desde la 0.2.0 seguimos verificando el solver de varias maneras independientes y encontramos dieciséis errores más que podían dar un resultado equivocado. Están corregidos, y cada uno tiene un aviso de seguridad publicado que dice qué estaba mal, a quién afecta y qué revisar.' },
        { k: 'note', t: 'stabileo.com publica cada cambio en cuanto se integra, así que estas correcciones están en línea desde el 19, 20 o 21 de octubre. La aplicación avisa una vez que los resultados pueden haber cambiado, y los proyectos guardados antes de un cambio que los afecta piden revisión al abrirlos.' },

        { k: 'h', t: 'Volvé a resolver tus proyectos' },
        { k: 'p', t: 'Estos son los casos que más pueden mover un resultado de diseño. Cada aviso tiene el caso resuelto completo y qué hacer con resultados ya entregados.' },
        {
          k: 'table',
          caption: 'Algunas correcciones de la 0.3.0: el valor correcto y el que daba la versión anterior.',
          head: ['Aviso', 'Caso', 'Correcto', 'Antes'],
          rows: [
            ['SA-2026-005', 'Cabio de techo a dos aguas: axil en la base (kN)', '-56,67', '-41,67'],
            ['SA-2026-007', 'Columna cruciforme de 1,5 m: carga crítica (kN)', '2993', '5860'],
            ['SA-2026-014', 'Pórtico espacial renumerado: factor de colapso plástico', '176,47', '424,3'],
            ['SA-2026-015', 'Mástil arriostrado: tracción en el tensor (kN)', '5,18', '4,34'],
            ['SA-2026-013', 'Ménsula de láminas curvas: momento en el empotramiento (kN·m/m)', '35,0', '0'],
          ],
        },
        { k: 'p', t: 'Los demás avisos cubren el espectro de respuesta con CQC, los modelos planos resueltos en 3D con momentos nodales, los apoyos cambiados de resorte a rígido, los arcos fuera del plano X–Z, las curvas de suelo p-y, t-z y q-z, el sólido-lámina en placas delgadas y, para quienes usan el motor o su API directamente, el análisis no lineal de material, los elementos MITC9 curvos y las cargas de temperatura en barras.' },

        { k: 'h', t: 'Avisa en lugar de equivocarse en silencio' },
        {
          k: 'ul',
          items: [
            'Un resultado que un error todavía abierto podría afectar lleva un aviso que lo nombra, en tu idioma. Queda uno: el análisis no lineal de material es un modelo secante de barra completa.',
            'Cuando una carga de temperatura no indica el coeficiente de dilatación o la altura de la sección, el resultado dice qué valor se supuso.',
            'Lo que no tiene solución se rechaza: un momento en un nudo que nada puede girar, una carga de lámina sobre un elemento de otro tipo, una curva de suelo sin los datos que exige su referencia.',
          ],
        },

        { k: 'h', t: 'Verificado más a fondo' },
        {
          k: 'ul',
          items: [
            'Certificados de extremo a extremo para pórticos y reticulados: un verificador independiente reconstruye la rigidez y las cargas a partir del modelo y certifica los desplazamientos contra el modelo, no sólo contra las matrices que armó el motor. Ya encontró tres casos en que motor y modelo no coincidían.',
            'El mismo modelo da siempre los mismos números, bit a bit, y cada memoria, planilla y CSV registra con qué versión y qué datos se obtuvo.',
            'El dimensionado de hormigón CIRSOC 201 sale de una sola implementación en el motor.',
            'Estimaciones del error de malla para placas y láminas, presentadas como estimaciones, nunca como certificadas.',
          ],
        },

        { k: 'link', slug: 'safety-advisories', t: 'La lista completa de avisos, con qué revisar en cada caso:' },
        { k: 'ext', href: `${REPO}/docs/releases/v0.3.0.md`, label: 'Notas de la versión 0.3.0', t: 'Las notas completas, con las limitaciones conocidas:' },
      ],
    },
    en: {
      title: 'Stabileo 0.3.0: sixteen more fixes and every advisory published',
      excerpt:
        'What changed since 0.2.0: sixteen defects that could give a wrong result, fixed and published as advisories; certificates that check the result against the model; and the same numbers on every solve.',
      blocks: [
        { k: 'p', t: 'Version 0.3.0 came out on 21 October 2026. Since 0.2.0 we kept checking the solver in several independent ways and found sixteen more defects that could give a wrong result. They are fixed, and each one has a published safety advisory saying what was wrong, who is affected and what to re-check.' },
        { k: 'note', t: 'stabileo.com publishes every change as soon as it is merged, so these fixes have been live since 19, 20 or 21 October. The app says once that results may have changed, and projects saved before a change that concerns them ask for a re-check when opened.' },

        { k: 'h', t: 'Re-run your projects' },
        { k: 'p', t: 'These are the cases that can move a design result the most. Each advisory has the full worked case and what to do with results you already delivered.' },
        {
          k: 'table',
          caption: 'Some of the 0.3.0 fixes: the correct value and the one the previous version gave.',
          head: ['Advisory', 'Case', 'Correct', 'Before'],
          rows: [
            ['SA-2026-005', 'Gable roof rafter: axial force at the base (kN)', '-56.67', '-41.67'],
            ['SA-2026-007', '1.5 m cruciform column: critical load (kN)', '2993', '5860'],
            ['SA-2026-014', 'Renumbered space frame: plastic collapse factor', '176.47', '424.3'],
            ['SA-2026-015', 'Guyed mast: tension in the guy (kN)', '5.18', '4.34'],
            ['SA-2026-013', 'Cantilever of curved shells: moment at the root (kN·m/m)', '35.0', '0'],
          ],
        },
        { k: 'p', t: 'The other advisories cover the response spectrum with CQC, plane models solved in 3D with nodal moments, supports changed from spring to rigid, arches outside the X–Z plane, the p-y, t-z and q-z soil curves, the solid shell in thin plates and, for those who use the engine or its API directly, material-nonlinear analysis, curved MITC9 elements and temperature loads on members.' },

        { k: 'h', t: 'Warned instead of silently wrong' },
        {
          k: 'ul',
          items: [
            'A result that a still-open defect could affect carries a warning naming it, in your language. One remains: material-nonlinear analysis is a whole-member secant model.',
            'When a temperature load does not state the expansion coefficient or the section depth, the result says which value was assumed.',
            'What has no solution is refused: a moment on a joint nothing can turn, a shell load on an element of another type, a soil curve without the inputs its reference needs.',
          ],
        },

        { k: 'h', t: 'Checked more deeply' },
        {
          k: 'ul',
          items: [
            'End-to-end certificates for frames and trusses: an independent checker rebuilds the stiffness and the loads from the model and certifies the displacements against the model, not only against the matrices the engine assembled. It already found three cases where engine and model disagreed.',
            'The same model always gives the same numbers, bit for bit, and every report, workbook and CSV records which version and which data produced it.',
            'CIRSOC 201 concrete design comes from one implementation in the engine.',
            'Mesh error estimates for plates and shells, shown as estimates, never as certified.',
          ],
        },

        { k: 'link', slug: 'safety-advisories', t: 'The full list of advisories, with what to re-check for each:' },
        { k: 'ext', href: `${REPO}/docs/releases/v0.3.0.md`, label: 'Release notes 0.3.0', t: 'The full notes, with the known limitations:' },
      ],
    },
    pt: {
      title: 'Stabileo 0.3.0: mais dezesseis correções e todos os avisos publicados',
      excerpt:
        'O que mudou desde a 0.2.0: dezesseis erros que podiam dar um resultado errado, corrigidos e publicados como avisos; certificados que verificam o resultado contra o modelo; e os mesmos números em cada cálculo.',
      blocks: [
        { k: 'p', t: 'A versão 0.3.0 saiu em 21 de outubro de 2026. Desde a 0.2.0 continuamos verificando o solver de várias maneiras independentes e encontramos mais dezesseis erros que podiam dar um resultado errado. Estão corrigidos, e cada um tem um aviso de segurança publicado que diz o que estava errado, a quem afeta e o que revisar.' },
        { k: 'note', t: 'stabileo.com publica cada mudança assim que é integrada, então estas correções estão no ar desde 19, 20 ou 21 de outubro. O aplicativo avisa uma vez que os resultados podem ter mudado, e os projetos salvos antes de uma mudança que os afeta pedem revisão ao serem abertos.' },

        { k: 'h', t: 'Resolva seus projetos de novo' },
        { k: 'p', t: 'Estes são os casos que mais podem mover um resultado de projeto. Cada aviso tem o caso resolvido completo e o que fazer com resultados já entregues.' },
        {
          k: 'table',
          caption: 'Algumas correções da 0.3.0: o valor correto e o que a versão anterior dava.',
          head: ['Aviso', 'Caso', 'Correto', 'Antes'],
          rows: [
            ['SA-2026-005', 'Caibro de telhado de duas águas: esforço normal na base (kN)', '-56,67', '-41,67'],
            ['SA-2026-007', 'Pilar cruciforme de 1,5 m: carga crítica (kN)', '2993', '5860'],
            ['SA-2026-014', 'Pórtico espacial renumerado: fator de colapso plástico', '176,47', '424,3'],
            ['SA-2026-015', 'Mastro estaiado: tração no estai (kN)', '5,18', '4,34'],
            ['SA-2026-013', 'Balanço de cascas curvas: momento no engaste (kN·m/m)', '35,0', '0'],
          ],
        },
        { k: 'p', t: 'Os demais avisos cobrem o espectro de resposta com CQC, modelos planos resolvidos em 3D com momentos nodais, apoios trocados de mola para rígido, arcos fora do plano X–Z, as curvas de solo p-y, t-z e q-z, o sólido-casca em placas finas e, para quem usa o motor ou sua API diretamente, a análise não linear de material, os elementos MITC9 curvos e as cargas de temperatura em barras.' },

        { k: 'h', t: 'Avisa em vez de errar em silêncio' },
        {
          k: 'ul',
          items: [
            'Um resultado que um erro ainda aberto poderia afetar leva um aviso que o nomeia, no seu idioma. Resta um: a análise não linear de material é um modelo secante de barra inteira.',
            'Quando uma carga de temperatura não indica o coeficiente de dilatação ou a altura da seção, o resultado diz qual valor foi suposto.',
            'O que não tem solução é recusado: um momento num nó que nada pode girar, uma carga de casca sobre um elemento de outro tipo, uma curva de solo sem os dados que sua referência exige.',
          ],
        },

        { k: 'h', t: 'Verificado mais a fundo' },
        {
          k: 'ul',
          items: [
            'Certificados de ponta a ponta para pórticos e treliças: um verificador independente reconstrói a rigidez e as cargas a partir do modelo e certifica os deslocamentos contra o modelo, não só contra as matrizes que o motor montou. Já encontrou três casos em que motor e modelo não coincidiam.',
            'O mesmo modelo dá sempre os mesmos números, bit a bit, e cada memória, planilha e CSV registra com que versão e quais dados foi obtido.',
            'O dimensionamento de concreto CIRSOC 201 sai de uma só implementação no motor.',
            'Estimativas do erro de malha para placas e cascas, apresentadas como estimativas, nunca como certificadas.',
          ],
        },

        { k: 'link', slug: 'safety-advisories', t: 'A lista completa de avisos, com o que revisar em cada caso:' },
        { k: 'ext', href: `${REPO}/docs/releases/v0.3.0.md`, label: 'Notas da versão 0.3.0', t: 'As notas completas, com as limitações conhecidas:' },
      ],
    },
  },
};
