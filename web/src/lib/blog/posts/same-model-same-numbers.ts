/**
 * Determinism and provenance: the same model gives the same numbers, and every report says how it
 * was produced.
 *
 * Every claim has a source and must stay no stronger than it:
 *  - docs/verification/PROVENANCE.md ("Determinism", "Provenance of results and reports",
 *    "Reproducing a report", "Solve stamps and the re-check prompt", "Registry");
 *  - engine/src/ordered.rs, engine/tests/determinism.rs;
 *  - CHANGELOG.md, 0.3.0.
 * The native-vs-browser caveat (transcendental functions) is stated as PROVENANCE.md states it.
 */
import type { Post } from '../types';

const REPO = 'https://github.com/lambdaclass/stabileo/blob/main';

export const sameModelSameNumbers: Post = {
  slug: 'same-model-same-numbers',
  date: '2026-10-22',
  order: 10,
  authors: ['Federico Carrone'],
  tagKeys: ['blog.tag.verification', 'blog.tag.solver'],
  i18n: {
    es: {
      title: 'El mismo modelo, los mismos números: determinismo y trazabilidad',
      excerpt:
        'Dos cálculos del mismo modelo en la misma sesión podían diferir en los últimos dígitos. Por qué pasaba, cómo lo corregimos y cómo cada memoria de cálculo dice ahora con qué versión y qué datos se obtuvo, para que cualquiera pueda reproducirla.',
      blocks: [
        { k: 'p', t: 'Una memoria de cálculo firmada tiene que poder reproducirse. Si alguien vuelve a abrir el proyecto dentro de un año, o lo revisa otro ingeniero, el mismo modelo tiene que dar los mismos números, y tiene que quedar claro con qué versión del programa se obtuvieron.' },
        { k: 'p', t: 'Al medirlo encontramos que no siempre pasaba: dos cálculos del mismo modelo en la misma sesión podían diferir en los últimos dígitos, y algunos resultados salían en otro orden. Las diferencias eran pequeñísimas, pero un número que cambia sin que cambie nada es un número que no se puede verificar.' },

        { k: 'h', t: 'De dónde venía la diferencia' },
        { k: 'p', t: 'El motor guarda los nudos, las barras, los apoyos y las cargas en tablas hash, y cada tabla se crea con una semilla aleatoria: el mismo archivo leído dos veces se recorre en dos órdenes distintos. Sumar números de punto flotante en otro orden puede cambiar el último bit, porque la suma de computadora no es asociativa. Los ensambladores 3D ya ordenaban las barras, pero los 2D, los bucles de cargas y apoyos y la mayoría de los otros análisis no.' },
        {
          k: 'ul',
          items: [
            'Cada recorrido de una tabla de entrada pasa ahora por un orden fijo, el de sus claves: 587 lugares en todo el motor.',
            'Las sumas de equilibrio y los términos cruzados de los apoyos inclinados también se recorren en orden fijo.',
            'Las advertencias salen ordenadas por número de nudo o barra, no al azar.',
          ],
        },
        {
          k: 'table',
          caption: 'Lo que cambió en el motor y cómo se controla.',
          head: ['Qué', 'Cantidad'],
          rows: [
            ['Recorridos de tablas de entrada puestos en orden fijo', '587'],
            ['Lecturas de cada modelo aleatorio comparadas bit a bit', '6'],
          ],
        },
        { k: 'p', t: 'Una prueba lee cada modelo aleatorio seis veces, lo resuelve y compara los resultados como texto, bit a bit, en análisis lineales, modales, de pandeo y P-Delta. Un recorrido sin orden que cambie un resultado aparece como una diferencia entre las lecturas.' },

        { k: 'h', t: 'Cada memoria dice de dónde salió' },
        { k: 'p', t: 'Cada memoria de cálculo, memoria PRO, planilla y CSV lleva ahora un bloque de trazabilidad: versión y commit de la aplicación y del motor, la huella SHA-256 del módulo WebAssembly que hizo el cálculo, una huella del modelo exacto, de la configuración y de los resultados mostrados, y el estado de los certificados (la envolvente de cargas móviles registra menos: su modelo y su configuración). Si el proyecto cambió mientras se preparaba la exportación, no se exporta: una memoria nunca lleva los números de un estado con la trazabilidad de otro.' },
        { k: 'p', t: 'Con ese bloque, la aplicación puede reproducir una memoria: vuelve a resolver el proyecto y compara cada huella. El resultado es «reproducido» sólo si todas coinciden (una versión distinta del módulo WebAssembly se informa al lado, no cuenta como diferencia); si una no se pudo recalcular, dice «incompleto», nunca «reproducido». También hay una herramienta de línea de comandos que resuelve dos veces la misma entrada y verifica las huellas.' },

        { k: 'h', t: 'Los proyectos viejos avisan' },
        { k: 'p', t: 'Cada proyecto guardado lleva la versión de resultados con que se calculó. Cuando se abre un proyecto calculado antes de un cambio que afecta a sus características, la aplicación lista esos cambios, explicados en tu idioma, y marca los resultados como desactualizados hasta volver a calcular. Ante la duda, un cambio se considera aplicable: un aviso de más cuesta un minuto, uno de menos puede esconder un número que cambió.' },

        { k: 'h', t: 'Un límite' },
        { k: 'p', t: 'La aplicación siempre compara WebAssembly contra WebAssembly. La herramienta nativa reprodujo bit a bit las huellas del navegador en el modelo de prueba, pero las funciones trigonométricas vienen de bibliotecas distintas en cada plataforma, así que un modelo cuyo ensamblado las use de una forma que las dos redondeen distinto podría diferir en el último bit entre la línea de comandos y el navegador.' },

        { k: 'link', slug: 'end-to-end-certificates', t: 'La otra mitad de confiar en un número: verificarlo contra el modelo:' },
        { k: 'ext', href: `${REPO}/docs/verification/PROVENANCE.md`, label: 'PROVENANCE.md', t: 'La descripción técnica completa:' },
      ],
    },
    en: {
      title: 'Same model, same numbers: determinism and provenance',
      excerpt:
        'Two solves of the same model in one session could differ in the last digits. Why that happened, how we fixed it, and how every report now says which version and which data produced it, so anyone can reproduce it.',
      blocks: [
        { k: 'p', t: 'A signed calculation report has to be reproducible. If someone reopens the project a year from now, or another engineer reviews it, the same model has to give the same numbers, and it has to be clear which version of the program produced them.' },
        { k: 'p', t: 'When we measured it we found it did not always hold: two solves of the same model in one session could differ in the last digits, and some results came out in a different order. The differences were tiny, but a number that changes while nothing changed is a number that cannot be checked.' },

        { k: 'h', t: 'Where the difference came from' },
        { k: 'p', t: 'The engine keeps nodes, members, supports and loads in hash tables, and every table is created with a random seed: the same file read twice is walked in two different orders. Adding floating-point numbers in another order can change the last bit, because computer addition is not associative. The 3D assemblers already sorted members, but the 2D ones, the load and support loops and most other analyses did not.' },
        {
          k: 'ul',
          items: [
            'Every walk over an input table now goes in a fixed order, the order of its keys: 587 places across the engine.',
            'The equilibrium sums and the cross terms of inclined supports are walked in a fixed order too.',
            'Warnings come out sorted by node or member number, not at random.',
          ],
        },
        {
          k: 'table',
          caption: 'What changed in the engine, and how it is checked.',
          head: ['What', 'Count'],
          rows: [
            ['Walks over input tables put in a fixed order', '587'],
            ['Readings of each random model compared bit for bit', '6'],
          ],
        },
        { k: 'p', t: 'A test reads each random model six times, solves it and compares the results as text, bit for bit, in linear, modal, buckling and P-Delta analyses. An unordered walk that changes a result shows up as a difference between the runs.' },

        { k: 'h', t: 'Every report says where it came from' },
        { k: 'p', t: 'Every calculation report, PRO report, workbook and CSV now carries a provenance block: version and commit of the app and of the engine, the SHA-256 fingerprint of the WebAssembly module that did the solve, a fingerprint of the exact model, of the settings and of the results shown, and the status of the certificates (a moving-load envelope records less: its model and settings). If the project changed while the export was being prepared, nothing is exported: a report never carries one state’s numbers under another state’s provenance.' },
        { k: 'p', t: 'With that block the app can reproduce a report: it solves the project again and compares every fingerprint. The verdict is “reproduced” only when all of them match (a different WebAssembly build is reported beside it, not counted as a difference); when one could not be recomputed it says “incomplete”, never “reproduced”. There is also a command-line tool that solves the same input twice and checks the fingerprints.' },

        { k: 'h', t: 'Old projects say so' },
        { k: 'p', t: 'Every saved project records the results version it was solved with. When a project solved before a change that concerns its features is opened, the app lists those changes, explained in your language, and marks the results as stale until it is solved again. When in doubt a change counts as applicable: one notice too many costs a minute, one too few can hide a number that moved.' },

        { k: 'h', t: 'One limit' },
        { k: 'p', t: 'The app always compares WebAssembly with WebAssembly. The native tool reproduced the browser’s fingerprints bit for bit on the test model, but trigonometric functions come from different libraries on each platform, so a model whose assembly uses them in a way the two round differently could differ in the last bit between the command line and the browser.' },

        { k: 'link', slug: 'end-to-end-certificates', t: 'The other half of trusting a number: checking it against the model:' },
        { k: 'ext', href: `${REPO}/docs/verification/PROVENANCE.md`, label: 'PROVENANCE.md', t: 'The full technical description:' },
      ],
    },
    pt: {
      title: 'O mesmo modelo, os mesmos números: determinismo e rastreabilidade',
      excerpt:
        'Dois cálculos do mesmo modelo na mesma sessão podiam diferir nos últimos dígitos. Por que isso acontecia, como corrigimos e como cada memória de cálculo diz agora com que versão e quais dados foi obtida, para que qualquer pessoa possa reproduzi-la.',
      blocks: [
        { k: 'p', t: 'Uma memória de cálculo assinada tem que poder ser reproduzida. Se alguém reabrir o projeto daqui a um ano, ou se outro engenheiro o revisar, o mesmo modelo tem que dar os mesmos números, e tem que ficar claro com que versão do programa eles foram obtidos.' },
        { k: 'p', t: 'Ao medir isso descobrimos que nem sempre acontecia: dois cálculos do mesmo modelo na mesma sessão podiam diferir nos últimos dígitos, e alguns resultados saíam em outra ordem. As diferenças eram minúsculas, mas um número que muda sem que nada tenha mudado é um número que não pode ser verificado.' },

        { k: 'h', t: 'De onde vinha a diferença' },
        { k: 'p', t: 'O motor guarda os nós, as barras, os apoios e as cargas em tabelas hash, e cada tabela é criada com uma semente aleatória: o mesmo arquivo lido duas vezes é percorrido em duas ordens diferentes. Somar números de ponto flutuante em outra ordem pode mudar o último bit, porque a soma do computador não é associativa. Os montadores 3D já ordenavam as barras, mas os 2D, os laços de cargas e apoios e a maioria das outras análises não.' },
        {
          k: 'ul',
          items: [
            'Cada percurso de uma tabela de entrada passa agora por uma ordem fixa, a de suas chaves: 587 lugares em todo o motor.',
            'As somas de equilíbrio e os termos cruzados dos apoios inclinados também são percorridos em ordem fixa.',
            'Os avisos saem ordenados por número de nó ou barra, não ao acaso.',
          ],
        },
        {
          k: 'table',
          caption: 'O que mudou no motor e como é controlado.',
          head: ['O quê', 'Quantidade'],
          rows: [
            ['Percursos de tabelas de entrada postos em ordem fixa', '587'],
            ['Leituras de cada modelo aleatório comparadas bit a bit', '6'],
          ],
        },
        { k: 'p', t: 'Um teste lê cada modelo aleatório seis vezes, o resolve e compara os resultados como texto, bit a bit, em análises lineares, modais, de flambagem e P-Delta. Um percurso sem ordem que mude um resultado aparece como uma diferença entre as leituras.' },

        { k: 'h', t: 'Cada memória diz de onde saiu' },
        { k: 'p', t: 'Cada memória de cálculo, memória PRO, planilha e CSV leva agora um bloco de rastreabilidade: versão e commit do aplicativo e do motor, a impressão digital SHA-256 do módulo WebAssembly que fez o cálculo, uma impressão do modelo exato, da configuração e dos resultados mostrados, e o estado dos certificados (a envoltória de cargas móveis registra menos: seu modelo e sua configuração). Se o projeto mudou enquanto a exportação era preparada, nada é exportado: uma memória nunca leva os números de um estado com a rastreabilidade de outro.' },
        { k: 'p', t: 'Com esse bloco, o aplicativo pode reproduzir uma memória: resolve o projeto de novo e compara cada impressão. O resultado é «reproduzido» só quando todas coincidem (uma versão diferente do módulo WebAssembly é informada ao lado, não conta como diferença); quando uma não pôde ser recalculada, diz «incompleto», nunca «reproduzido». Também há uma ferramenta de linha de comando que resolve duas vezes a mesma entrada e verifica as impressões.' },

        { k: 'h', t: 'Os projetos antigos avisam' },
        { k: 'p', t: 'Cada projeto salvo registra a versão de resultados com que foi calculado. Quando se abre um projeto calculado antes de uma mudança que afeta suas características, o aplicativo lista essas mudanças, explicadas no seu idioma, e marca os resultados como desatualizados até calcular de novo. Na dúvida, uma mudança conta como aplicável: um aviso a mais custa um minuto, um a menos pode esconder um número que mudou.' },

        { k: 'h', t: 'Um limite' },
        { k: 'p', t: 'O aplicativo sempre compara WebAssembly com WebAssembly. A ferramenta nativa reproduziu bit a bit as impressões do navegador no modelo de teste, mas as funções trigonométricas vêm de bibliotecas diferentes em cada plataforma, então um modelo cuja montagem as use de um jeito que as duas arredondem diferente poderia diferir no último bit entre a linha de comando e o navegador.' },

        { k: 'link', slug: 'end-to-end-certificates', t: 'A outra metade de confiar num número: verificá-lo contra o modelo:' },
        { k: 'ext', href: `${REPO}/docs/verification/PROVENANCE.md`, label: 'PROVENANCE.md', t: 'A descrição técnica completa:' },
      ],
    },
  },
};
