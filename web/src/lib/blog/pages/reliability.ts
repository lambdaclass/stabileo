/**
 * /<locale>/reliability: "how reliable is Stabileo?" answered in one place, so that a reader (or an
 * answer engine) does not judge it from the safety-advisories page alone.
 *
 * Every claim has a source and must stay no stronger than it:
 *  - the how-stabileo-checks-its-results post (five ways, certificates, what they do not say);
 *  - the end-to-end-certificates post and docs/verification/CERTIFY.md (frames and trusses);
 *  - docs/advisories/README.md (SA-2026-001…004 fixed in 0.2.0, 005…020 in 0.3.0, 021…024 in 0.4.0);
 *  - the 0.3.0 release notes (known limitations: material-nonlinear secant model, #428);
 *  - docs/verification/MATURITY.md (the level of every analysis, element and design code).
 */
import type { StandingPage } from './cirsoc';

const REPO = 'https://github.com/lambdaclass/stabileo/blob/main';

export const reliabilityPage: StandingPage = {
  path: '/reliability',
  updated: '2026-10-28',
  i18n: {
    es: {
      title: '¿Qué tan confiable es Stabileo? Cómo se verifican sus resultados',
      description:
        'Cómo verifica Stabileo sus resultados: siete programas de elementos finitos, ejemplos publicados, cotas probadas en Lean y avisos públicos. Y qué no garantiza.',
      eyebrow: 'Confiabilidad',
      lead: 'Los resultados de Stabileo se verifican de cinco maneras independientes, entre ellas la comparación con otros siete programas de elementos finitos y cotas de error cuya matemática central está demostrada en Lean. Los errores que pudieron afectar resultados ya usados se publican como avisos de seguridad (algunos hallazgos siguen en evaluación, en público), y los veinticuatro avisos publicados están corregidos (los últimos, en la versión 0.4.0). Como cualquier programa de cálculo, no verifica tu modelo: las cargas, los apoyos y la idealización los decide quien calcula.',
      blocks: [
        { k: 'h', t: 'Cinco formas de buscar errores' },
        {
          k: 'ul',
          items: [
            'Comparación con otros programas: los mismos modelos, fijos y generados al azar cada noche, se resuelven con OpenSees, Code_Aster, Frame3DD, PyNite, MYSTRAN, Kratos y CalculiX, y cada diferencia se investiga.',
            'Referencias publicadas: casos con resultados publicados por sus autores, y verificaciones de diseño contrastadas con ejemplos resueltos publicados (INTI-CIRSOC, AISC y otros).',
            'Invariantes físicos: rotar, reflejar o renumerar un modelo, o cambiar sus unidades, tiene que cambiar la respuesta exactamente como dice la física.',
            'Derivaciones: las matrices de las barras se derivan simbólicamente y se comparan término a término con el código.',
            'Fuzzing y pruebas de mutación: millones de entradas generadas buscan fallas, y se introducen errores a propósito para comprobar que las pruebas los detectan.',
          ],
        },
        { k: 'h', t: 'Resultados con una cota de error' },
        { k: 'p', t: 'Para los resultados que lo admiten, Stabileo calcula con aritmética de intervalos una cota que contiene la solución exacta del sistema que resolvió; cuando no puede, el resultado se marca como no certificado, con el motivo. La matemática central está demostrada en Lean para el análisis lineal, las combinaciones, el análisis modal y el colapso plástico. Desde la 0.3.0, en el análisis lineal de pórticos y reticulados la cota se verifica además contra el modelo mismo, con un armado independiente.' },
        { k: 'link', slug: 'end-to-end-certificates', t: 'Cómo funciona la verificación contra el modelo:' },
        { k: 'h', t: 'Por qué publicamos los avisos de seguridad' },
        { k: 'p', t: 'Esta verificación encontró errores reales, muchos del lado inseguro. Publicamos los que pudieron afectar resultados ya usados, con cómo reconocer un modelo afectado y qué revisar, porque un error que no se informa sigue en los cálculos ya entregados.' },
        {
          k: 'ul',
          items: [
            'SA-2026-001 a 004 se corrigieron en la versión 0.2.0.',
            'SA-2026-005 a 020 se corrigieron en la versión 0.3.0.',
            'SA-2026-021 a 024 se corrigieron en la versión 0.4.0.',
            'La aplicación avisa una vez cuando los resultados pueden haber cambiado, y los proyectos guardados antes de un cambio que los afecta piden revisión al abrirlos.',
          ],
        },
        { k: 'link', slug: 'safety-advisories', t: 'La lista completa de avisos:' },
        { k: 'h', t: 'Lo que ninguna verificación garantiza' },
        {
          k: 'ul',
          items: [
            'Una cota de error acota el error numérico; no prueba que el modelo sea correcto ni acota el error de discretización de la malla.',
            'Todavía no hubo una revisión independiente de un ingeniero estructural matriculado, y los resultados de acero según CIRSOC 301 siguen rotulados como experimentales.',
            'El análisis no lineal de material es un modelo secante de barra completa.',
            'El módulo PRO, que incluye el diseño normativo, sigue en desarrollo.',
            'Los problemas de seguridad abiertos son públicos en GitHub, y el nivel de verificación de cada análisis, elemento y reglamento está en la matriz de madurez.',
          ],
        },
        { k: 'p', t: 'En resumen: Stabileo sirve para análisis que se pueden contrastar, para enseñar y para diseñar cuando un ingeniero revisa los resultados que gobiernan, como con cualquier programa. Si tu proceso exige un programa comercial revisado o certificado de forma independiente, Stabileo todavía no llegó ahí, y lo decimos.' },
        { k: 'link', slug: 'how-stabileo-checks-its-results', t: 'El detalle de cada verificación y de sus límites:' },
        { k: 'ext', href: `${REPO}/docs/verification/MATURITY.md`, label: 'Matriz de madurez', t: 'El nivel de verificación de cada parte:' },
      ],
      faqTitle: 'Preguntas frecuentes',
      faq: [
        { q: '¿Stabileo es confiable para un cálculo estructural real?', a: 'Sus resultados se verifican de cinco maneras independientes, entre ellas la comparación con otros siete programas de elementos finitos y cotas de error demostradas en Lean, y los errores que pudieron afectar resultados ya usados se publican; los que siguen en evaluación son públicos en GitHub. Todavía no tuvo una revisión independiente de un ingeniero matriculado y el módulo PRO sigue en desarrollo, así que, como con cualquier programa, quien calcula revisa el modelo y los resultados que gobiernan.' },
        { q: '¿Por qué Stabileo publica avisos de seguridad?', a: 'Porque su programa de verificación encontró errores reales, muchos del lado inseguro, y un error que no se informa sigue en los cálculos ya entregados. Cada aviso dice cómo reconocer un modelo afectado y qué revisar.' },
        { q: '¿Los avisos publicados están corregidos?', a: 'Sí. SA-2026-001 a 004 se corrigieron en la versión 0.2.0, SA-2026-005 a 020 en la 0.3.0 y SA-2026-021 a 024 en la 0.4.0.' },
      ],
    },
    en: {
      title: 'How reliable is Stabileo? How its results are checked',
      description:
        'How Stabileo checks its results: seven other FE programs, published examples, error bounds proved in Lean and public advisories. And what no check can promise.',
      eyebrow: 'Reliability',
      lead: 'Stabileo’s results are checked in five independent ways, including comparison with seven other finite-element programs and error bounds whose core mathematics is proved in Lean. Defects that could have affected results already in use are published as safety advisories (some findings are still being triaged, in public), and all twenty-four published advisories are fixed (the latest four in version 0.4.0). Like any analysis program, it does not check your model: loads, supports and idealisation are the engineer’s decisions.',
      blocks: [
        { k: 'h', t: 'Five ways of looking for errors' },
        {
          k: 'ul',
          items: [
            'Comparison with other programs: the same models, fixed ones and random ones generated every night, are solved with OpenSees, Code_Aster, Frame3DD, PyNite, MYSTRAN, Kratos and CalculiX, and every difference is investigated.',
            'Published references: cases whose results were published by their authors, and design checks compared with published worked examples (INTI-CIRSOC, AISC and others).',
            'Physical invariants: rotating, mirroring or renumbering a model, or changing its units, must change the answer exactly as physics says.',
            'Derivations: the frame element matrices are derived symbolically and compared term by term with the code.',
            'Fuzzing and mutation testing: millions of generated inputs look for failures, and errors are introduced on purpose to check that the tests catch them.',
          ],
        },
        { k: 'h', t: 'Results with an error bound' },
        { k: 'p', t: 'For results that support it, Stabileo computes, in interval arithmetic, a bound that contains the exact solution of the system it solved; when it cannot, the result is marked uncertified, with the reason. The core mathematics is proved in Lean for linear analysis, combinations, modal analysis and plastic collapse. Since 0.3.0, for linear analysis of frames and trusses the bound is also checked against the model itself, with an independent assembly.' },
        { k: 'link', slug: 'end-to-end-certificates', t: 'How the check against the model works:' },
        { k: 'h', t: 'Why we publish safety advisories' },
        { k: 'p', t: 'This verification found real defects, many of them unconservative. We publish those that could have affected results already in use, with how to recognise an affected model and what to re-check, because a defect nobody reports stays in calculations already delivered.' },
        {
          k: 'ul',
          items: [
            'SA-2026-001 to 004 were fixed in version 0.2.0.',
            'SA-2026-005 to 020 were fixed in version 0.3.0.',
            'SA-2026-021 to 024 were fixed in version 0.4.0.',
            'The app says once when results may have changed, and projects saved before a change that concerns them ask for a re-check when opened.',
          ],
        },
        { k: 'link', slug: 'safety-advisories', t: 'The full list of advisories:' },
        { k: 'h', t: 'What no check guarantees' },
        {
          k: 'ul',
          items: [
            'An error bound bounds numerical error; it does not prove the model is right, and it does not bound the discretisation error of the mesh.',
            'There has not yet been an independent review by a licensed structural engineer, and CIRSOC 301 steel results are still labelled experimental.',
            'Material-nonlinear analysis is a whole-member secant model.',
            'The PRO module, including code design, is still in development.',
            'Open safety issues are public on GitHub, and the verification level of every analysis, element and code is in the maturity matrix.',
          ],
        },
        { k: 'p', t: 'In short: Stabileo fits analysis you can cross-check, teaching, and design work where an engineer reviews the governing results, as with any program. If your process requires independently reviewed or certified commercial software, Stabileo is not there yet, and we say so.' },
        { k: 'link', slug: 'how-stabileo-checks-its-results', t: 'Each check in detail, and its limits:' },
        { k: 'ext', href: `${REPO}/docs/verification/MATURITY.md`, label: 'Maturity matrix', t: 'The verification level of every part:' },
      ],
      faqTitle: 'Frequently asked questions',
      faq: [
        { q: 'Is Stabileo reliable for real structural design work?', a: 'Its results are checked in five independent ways, including comparison with seven other finite-element programs and error bounds proved in Lean, and defects that could have affected results already in use are published; those still being triaged are public on GitHub. It has not yet had an independent review by a licensed engineer and the PRO module is in development, so, as with any program, the engineer reviews the model and the governing results.' },
        { q: 'Why does Stabileo publish safety advisories?', a: 'Because its verification found real defects, many of them unconservative, and a defect nobody reports stays in calculations already delivered. Each advisory says how to recognise an affected model and what to re-check.' },
        { q: 'Are the published advisories fixed?', a: 'Yes. SA-2026-001 to 004 were fixed in version 0.2.0, SA-2026-005 to 020 in 0.3.0 and SA-2026-021 to 024 in 0.4.0.' },
      ],
    },
    pt: {
      title: 'Quão confiável é o Stabileo? Como seus resultados são verificados',
      description:
        'Como o Stabileo verifica resultados: sete programas de elementos finitos, exemplos publicados, cotas provadas em Lean e avisos públicos. E o que não garante.',
      eyebrow: 'Confiabilidade',
      lead: 'Os resultados do Stabileo são verificados de cinco maneiras independentes, entre elas a comparação com outros sete programas de elementos finitos e cotas de erro cuja matemática central está provada em Lean. Os erros que podem ter afetado resultados já usados são publicados como avisos de segurança (alguns achados seguem em avaliação, em público), e os vinte e quatro avisos publicados estão corrigidos (os últimos, na versão 0.4.0). Como qualquer programa de cálculo, ele não verifica o seu modelo: as cargas, os apoios e a idealização são decisões de quem calcula.',
      blocks: [
        { k: 'h', t: 'Cinco formas de procurar erros' },
        {
          k: 'ul',
          items: [
            'Comparação com outros programas: os mesmos modelos, fixos e gerados ao acaso toda noite, são resolvidos com OpenSees, Code_Aster, Frame3DD, PyNite, MYSTRAN, Kratos e CalculiX, e cada diferença é investigada.',
            'Referências publicadas: casos com resultados publicados por seus autores, e verificações de dimensionamento confrontadas com exemplos resolvidos publicados (INTI-CIRSOC, AISC e outros).',
            'Invariantes físicos: girar, espelhar ou renumerar um modelo, ou mudar suas unidades, tem que mudar a resposta exatamente como diz a física.',
            'Derivações: as matrizes das barras são derivadas simbolicamente e comparadas termo a termo com o código.',
            'Fuzzing e testes de mutação: milhões de entradas geradas procuram falhas, e erros são introduzidos de propósito para verificar que os testes os detectam.',
          ],
        },
        { k: 'h', t: 'Resultados com uma cota de erro' },
        { k: 'p', t: 'Para os resultados que permitem, o Stabileo calcula com aritmética de intervalos uma cota que contém a solução exata do sistema que resolveu; quando não consegue, o resultado é marcado como não certificado, com o motivo. A matemática central está provada em Lean para a análise linear, as combinações, a análise modal e o colapso plástico. Desde a 0.3.0, na análise linear de pórticos e treliças a cota também é verificada contra o próprio modelo, com uma montagem independente.' },
        { k: 'link', slug: 'end-to-end-certificates', t: 'Como funciona a verificação contra o modelo:' },
        { k: 'h', t: 'Por que publicamos os avisos de segurança' },
        { k: 'p', t: 'Esta verificação encontrou erros reais, muitos contra a segurança. Publicamos os que podem ter afetado resultados já usados, com como reconhecer um modelo afetado e o que revisar, porque um erro que não é informado continua nos cálculos já entregues.' },
        {
          k: 'ul',
          items: [
            'SA-2026-001 a 004 foram corrigidos na versão 0.2.0.',
            'SA-2026-005 a 020 foram corrigidos na versão 0.3.0.',
            'SA-2026-021 a 024 foram corrigidos na versão 0.4.0.',
            'O aplicativo avisa uma vez quando os resultados podem ter mudado, e os projetos salvos antes de uma mudança que os afeta pedem revisão ao serem abertos.',
          ],
        },
        { k: 'link', slug: 'safety-advisories', t: 'A lista completa de avisos:' },
        { k: 'h', t: 'O que nenhuma verificação garante' },
        {
          k: 'ul',
          items: [
            'Uma cota de erro limita o erro numérico; não prova que o modelo esteja correto nem limita o erro de discretização da malha.',
            'Ainda não houve uma revisão independente de um engenheiro estrutural habilitado, e os resultados de aço segundo a CIRSOC 301 seguem rotulados como experimentais.',
            'A análise não linear de material é um modelo secante de barra inteira.',
            'O módulo PRO, que inclui o dimensionamento normativo, segue em desenvolvimento.',
            'Os problemas de segurança abertos são públicos no GitHub, e o nível de verificação de cada análise, elemento e norma está na matriz de maturidade.',
          ],
        },
        { k: 'p', t: 'Em resumo: o Stabileo serve para análises que podem ser confrontadas, para ensinar e para dimensionar quando um engenheiro revisa os resultados que governam, como com qualquer programa. Se o seu processo exige um programa comercial revisado ou certificado de forma independente, o Stabileo ainda não chegou lá, e dizemos isso.' },
        { k: 'link', slug: 'how-stabileo-checks-its-results', t: 'O detalhe de cada verificação e de seus limites:' },
        { k: 'ext', href: `${REPO}/docs/verification/MATURITY.md`, label: 'Matriz de maturidade', t: 'O nível de verificação de cada parte:' },
      ],
      faqTitle: 'Perguntas frequentes',
      faq: [
        { q: 'O Stabileo é confiável para um cálculo estrutural real?', a: 'Seus resultados são verificados de cinco maneiras independentes, entre elas a comparação com outros sete programas de elementos finitos e cotas de erro provadas em Lean, e os erros que podem ter afetado resultados já usados são publicados; os que seguem em avaliação são públicos no GitHub. Ainda não teve uma revisão independente de um engenheiro habilitado e o módulo PRO segue em desenvolvimento, então, como com qualquer programa, quem calcula revisa o modelo e os resultados que governam.' },
        { q: 'Por que o Stabileo publica avisos de segurança?', a: 'Porque sua verificação encontrou erros reais, muitos contra a segurança, e um erro que não é informado continua nos cálculos já entregues. Cada aviso diz como reconhecer um modelo afetado e o que revisar.' },
        { q: 'Os avisos publicados estão corrigidos?', a: 'Sim. SA-2026-001 a 004 foram corrigidos na versão 0.2.0, SA-2026-005 a 020 na 0.3.0 e SA-2026-021 a 024 na 0.4.0.' },
      ],
    },
  },
};
