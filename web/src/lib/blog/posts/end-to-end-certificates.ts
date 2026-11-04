/**
 * End-to-end certificates: checking the result against the model, not against the matrices.
 *
 * Every claim has a source and must stay no stronger than it:
 *  - docs/verification/CERTIFY.md, "End-to-end certificates" (what it states, the independent
 *    re-assembly, the bound, the findings, the tests, what remains trusted);
 *  - CHANGELOG.md, 0.3.0, "End-to-end certificates for frames and trusses";
 *  - verify/Certify/EndToEnd.lean (Certify.end_to_end_bound).
 * Scope: frames and trusses in 2D and 3D; shells, connectors, curved beams and warping torsion are
 * reported out of scope. If any of that changes, this post changes with it.
 */
import type { Post } from '../types';

const REPO = 'https://github.com/lambdaclass/stabileo/blob/main';

export const endToEndCertificates: Post = {
  slug: 'end-to-end-certificates',
  date: '2026-10-22',
  order: 9,
  authors: ['Federico Carrone'],
  tagKeys: ['blog.tag.verification', 'blog.tag.solver', 'blog.tag.safety'],
  i18n: {
    es: {
      title: 'Certificados de punta a punta: verificar el resultado contra el modelo',
      excerpt:
        'Un certificado que prueba que se resolvió bien un sistema mal armado no sirve de mucho. Cómo Stabileo reconstruye cada modelo de barras por su cuenta y certifica el resultado contra el modelo, qué encontró y qué queda fuera.',
      blocks: [
        { k: 'p', t: 'Desde hace semanas, cada análisis estático lineal de Stabileo pasa por un certificado que, cuando se obtiene, da una cota verificada por la máquina del error con que se resolvió el sistema de ecuaciones K·u = f. Pero ese sistema lo arma el propio motor. Si el armado tuviera un error, un signo equivocado en una transformación, un término de Timoshenko que falta, una fuerza de empotramiento mal calculada, el certificado probaría con todo rigor que se resolvió bien el sistema equivocado.' },
        { k: 'p', t: 'Los certificados de punta a punta cierran ese hueco para pórticos y reticulados, en 2D y en 3D: el resultado se verifica contra el modelo tal como fue escrito, no contra las matrices que armó el motor.' },

        { k: 'h', t: 'Un segundo armado, independiente' },
        { k: 'p', t: 'Un verificador escrito aparte reconstruye la rigidez y las cargas a partir de los datos del modelo, sin llamar a ninguna función de elementos ni de ensamblado del motor. Usa sus propias fórmulas y su propia numeración de grados de libertad:' },
        {
          k: 'ul',
          items: [
            'la flexión de cada barra desde la flexibilidad de la ménsula, invertida, y el otro extremo por equilibrio, con la deformación por corte de Timoshenko;',
            'las articulaciones por condensación estática, una rotación liberada por vez;',
            'las cargas sobre barras como el trabajo sobre las deformadas exactas de la barra descargada, con las integrales resueltas en forma cerrada;',
            'los ejes locales, los apoyos inclinados, los resortes, los vínculos rígidos, los diafragmas y las restricciones multipunto, derivados de las convenciones del modelo.',
          ],
        },
        { k: 'p', t: 'Todo se calcula en aritmética de intervalos, incluidos senos y cosenos con cotas rigurosas: cada dato del modelo entra como el decimal que se escribió, encerrado en un intervalo. Si una decisión depende de un umbral que el intervalo no permite resolver, el verificador se niega en lugar de adivinar.' },

        { k: 'h', t: 'Qué afirma el certificado' },
        { k: 'p', t: 'Con esa rigidez exacta, el verificador demuestra que el modelo tiene una única solución y acota la distancia entre los desplazamientos que dio el motor y esa solución, en todos los grados de libertad que el modelo determina. Las matrices del motor no participan de esa afirmación. Se comparan aparte: deben coincidir con las reconstruidas hasta una parte en 10¹⁰, y los desplazamientos deben cumplir las condiciones de apoyo y de vínculo del modelo hasta una parte en 10⁹. Si no, el resultado se informa como no verificado de punta a punta, con el motivo.' },
        { k: 'p', t: 'El teorema que sostiene la cota está demostrado en Lean. En la aplicación, el panel de resultados muestra la línea «Verificado de punta a punta» con la cota del error de desplazamientos, o el motivo por el que no se pudo verificar.' },

        { k: 'h', t: 'Qué encontró' },
        {
          k: 'table',
          caption: 'Modelos verificados de punta a punta en la integración continua: en todos, el armado del motor coincide con el reconstruido.',
          head: ['Conjunto', 'Modelos', 'Certificados'],
          rows: [
            ['Modelos de prueba 2D', '82', '82'],
            ['Modelos de prueba 3D', '32', '32'],
            ['Pórticos 2D generados al azar', '200', '200'],
            ['Pórticos 3D generados al azar', '150', '150'],
          ],
        },
        { k: 'p', t: 'Todos los modelos de prueba y cientos de pórticos generados al azar coinciden y quedan certificados, y los errores de armado plantados a propósito en el motor hacen fallar el control. Además encontró problemas reales:' },
        {
          k: 'ul',
          items: [
            'un diafragma 3D en el plano XZ vinculaba los nudos con el giro de signo invertido;',
            'en 2D, un momento aplicado en un nudo donde todas las barras están articuladas lo absorbía un resorte artificial, y el certificado del sistema armado lo aprobaba aunque el modelo no tiene solución;',
            'un vínculo rígido desde un nudo así escondía un mecanismo real.',
          ],
        },
        { k: 'p', t: 'Los dos primeros están corregidos: el diafragma sigue el giro de cuerpo rígido, y ese momento se rechaza antes de resolver. Y cuando el motor cambió el significado de un diafragma para que todo el piso gire como un cuerpo, el verificador no aprobó nada falso: siguió siendo honesto, pero con cotas inútiles, hasta que se actualizaron sus convenciones. Es exactamente lo que se espera de un control independiente.' },

        { k: 'h', t: 'Qué queda fuera' },
        {
          k: 'ul',
          items: [
            'Láminas, sólidos, conectores, vigas curvas y torsión con alabeo todavía no se reconstruyen: se informan fuera de alcance, nunca como verificados.',
            'Las fórmulas del verificador codifican la mecánica del modelo. Están escritas aparte del motor y se contrastan con él, pero no están demostradas.',
            'La implementación en Rust no está demostrada equivalente al algoritmo de Lean, como ocurre con todos los certificados.',
            'Un certificado dice que el resultado corresponde al modelo. No dice que el modelo represente bien la estructura: eso sigue siendo trabajo del ingeniero.',
          ],
        },

        { k: 'link', slug: 'how-stabileo-checks-its-results', t: 'Las otras formas en que buscamos errores, y sus límites:' },
        { k: 'ext', href: `${REPO}/docs/verification/CERTIFY.md`, label: 'CERTIFY.md, «End-to-end certificates»', t: 'La descripción técnica completa, con las fórmulas y las pruebas:' },
      ],
    },
    en: {
      title: 'End-to-end certificates: checking the result against the model',
      excerpt:
        'A certificate that proves a wrongly assembled system was solved correctly is not worth much. How Stabileo rebuilds every frame model on its own and certifies the result against the model, what that found, and what it leaves out.',
      blocks: [
        { k: 'p', t: 'For weeks now every linear static analysis in Stabileo has gone through a certificate that, when it is obtained, gives a machine-checked bound on the error with which the system of equations K·u = f was solved. But the engine assembles that system itself. If the assembly had a mistake, a wrong sign in a transformation, a missing Timoshenko term, a wrong fixed-end force, the certificate would prove with full rigour that the wrong system was solved correctly.' },
        { k: 'p', t: 'End-to-end certificates close that gap for frames and trusses, in 2D and 3D: the result is checked against the model as written, not against the matrices the engine assembled.' },

        { k: 'h', t: 'A second, independent assembly' },
        { k: 'p', t: 'A separately written checker rebuilds the stiffness and the loads from the model data, without calling any of the engine’s element or assembly functions. It uses its own formulas and its own numbering of the degrees of freedom:' },
        {
          k: 'ul',
          items: [
            'each member’s bending from the cantilever flexibility, inverted, and the other end by equilibrium, with Timoshenko shear deformation;',
            'hinges by static condensation, one released rotation at a time;',
            'member loads as the work on the exact deflected shapes of the unloaded member, with the integrals in closed form;',
            'local axes, inclined supports, springs, rigid links, diaphragms and multipoint constraints, derived from the model’s conventions.',
          ],
        },
        { k: 'p', t: 'Everything is computed in interval arithmetic, sines and cosines included, with rigorous bounds: every model input enters as the decimal it was typed as, enclosed in an interval. When a decision depends on a threshold the interval cannot settle, the checker refuses instead of guessing.' },

        { k: 'h', t: 'What the certificate states' },
        { k: 'p', t: 'With that exact stiffness, the checker proves that the model has a unique solution and bounds the distance between the displacements the engine returned and that solution, over every degree of freedom the model determines. The engine’s matrices play no part in that statement. They are compared separately: they must agree with the rebuilt ones to one part in 10¹⁰, and the displacements must satisfy the model’s supports and constraints to one part in 10⁹. If they do not, the result is reported as not checked end to end, with the reason.' },
        { k: 'p', t: 'The theorem behind the bound is proved in Lean. In the app, the results panel shows the line “Checked end to end” with the bound on the displacement error, or the reason it could not be checked.' },

        { k: 'h', t: 'What it found' },
        {
          k: 'table',
          caption: 'Models checked end to end in continuous integration: in all of them the engine’s assembly agrees with the rebuilt one.',
          head: ['Set', 'Models', 'Certified'],
          rows: [
            ['2D test models', '82', '82'],
            ['3D test models', '32', '32'],
            ['Random 2D frames', '200', '200'],
            ['Random 3D frames', '150', '150'],
          ],
        },
        { k: 'p', t: 'Every test model and hundreds of randomly generated frames agree and are certified, and assembly bugs planted on purpose in the engine make the check fail. It also found real problems:' },
        {
          k: 'ul',
          items: [
            'a 3D diaphragm in the XZ plane tied the nodes with the rotation of the wrong sign;',
            'in 2D, a moment on a node where every member is hinged was absorbed by an artificial spring, and the certificate of the assembled system passed it although the model has no solution;',
            'a rigid link from such a node hid a real mechanism.',
          ],
        },
        { k: 'p', t: 'The first two are fixed: the diaphragm follows rigid-body rotation, and that moment is refused before the solve. And when the engine changed what a diaphragm means, so that the whole floor rotates as one body, the checker passed nothing false: it stayed honest, with useless bounds, until its conventions were updated. That is exactly what an independent check is for.' },

        { k: 'h', t: 'What it leaves out' },
        {
          k: 'ul',
          items: [
            'Shells, solids, connectors, curved beams and warping torsion are not rebuilt yet: they are reported out of scope, never as checked.',
            'The checker’s formulas encode the model’s mechanics. They are written separately from the engine and compared with it, but they are not proved.',
            'The Rust implementation is not proved equivalent to the Lean algorithm, as for every certificate.',
            'A certificate says the result belongs to the model. It does not say the model represents the structure well: that remains the engineer’s work.',
          ],
        },

        { k: 'link', slug: 'how-stabileo-checks-its-results', t: 'The other ways we look for errors, and their limits:' },
        { k: 'ext', href: `${REPO}/docs/verification/CERTIFY.md`, label: 'CERTIFY.md, “End-to-end certificates”', t: 'The full technical description, with the formulas and the tests:' },
      ],
    },
    pt: {
      title: 'Certificados de ponta a ponta: verificar o resultado contra o modelo',
      excerpt:
        'Um certificado que prova que um sistema mal montado foi bem resolvido não vale muito. Como o Stabileo reconstrói cada modelo de barras por conta própria e certifica o resultado contra o modelo, o que isso encontrou e o que fica de fora.',
      blocks: [
        { k: 'p', t: 'Há semanas cada análise estática linear do Stabileo passa por um certificado que, quando é obtido, dá uma cota verificada pela máquina do erro com que o sistema de equações K·u = f foi resolvido. Mas quem monta esse sistema é o próprio motor. Se a montagem tivesse um erro, um sinal errado numa transformação, um termo de Timoshenko faltando, uma força de engastamento mal calculada, o certificado provaria com todo o rigor que o sistema errado foi bem resolvido.' },
        { k: 'p', t: 'Os certificados de ponta a ponta fecham essa lacuna para pórticos e treliças, em 2D e em 3D: o resultado é verificado contra o modelo como foi escrito, não contra as matrizes que o motor montou.' },

        { k: 'h', t: 'Uma segunda montagem, independente' },
        { k: 'p', t: 'Um verificador escrito à parte reconstrói a rigidez e as cargas a partir dos dados do modelo, sem chamar nenhuma função de elementos nem de montagem do motor. Usa suas próprias fórmulas e sua própria numeração dos graus de liberdade:' },
        {
          k: 'ul',
          items: [
            'a flexão de cada barra a partir da flexibilidade do balanço, invertida, e a outra extremidade por equilíbrio, com a deformação por cisalhamento de Timoshenko;',
            'as rótulas por condensação estática, uma rotação liberada por vez;',
            'as cargas sobre barras como o trabalho sobre as deformadas exatas da barra descarregada, com as integrais resolvidas em forma fechada;',
            'os eixos locais, os apoios inclinados, as molas, os vínculos rígidos, os diafragmas e as restrições multiponto, derivados das convenções do modelo.',
          ],
        },
        { k: 'p', t: 'Tudo é calculado em aritmética de intervalos, inclusive senos e cossenos com cotas rigorosas: cada dado do modelo entra como o decimal que foi escrito, envolto num intervalo. Quando uma decisão depende de um limiar que o intervalo não permite resolver, o verificador recusa em vez de adivinhar.' },

        { k: 'h', t: 'O que o certificado afirma' },
        { k: 'p', t: 'Com essa rigidez exata, o verificador prova que o modelo tem uma única solução e limita a distância entre os deslocamentos que o motor deu e essa solução, em todos os graus de liberdade que o modelo determina. As matrizes do motor não participam dessa afirmação. São comparadas à parte: devem coincidir com as reconstruídas até uma parte em 10¹⁰, e os deslocamentos devem cumprir as condições de apoio e de vínculo do modelo até uma parte em 10⁹. Se não, o resultado é informado como não verificado de ponta a ponta, com o motivo.' },
        { k: 'p', t: 'O teorema que sustenta a cota está provado em Lean. No aplicativo, o painel de resultados mostra a linha «Verificado de ponta a ponta» com a cota do erro de deslocamentos, ou o motivo pelo qual não foi possível verificar.' },

        { k: 'h', t: 'O que encontrou' },
        {
          k: 'table',
          caption: 'Modelos verificados de ponta a ponta na integração contínua: em todos, a montagem do motor coincide com a reconstruída.',
          head: ['Conjunto', 'Modelos', 'Certificados'],
          rows: [
            ['Modelos de teste 2D', '82', '82'],
            ['Modelos de teste 3D', '32', '32'],
            ['Pórticos 2D gerados ao acaso', '200', '200'],
            ['Pórticos 3D gerados ao acaso', '150', '150'],
          ],
        },
        { k: 'p', t: 'Todos os modelos de teste e centenas de pórticos gerados ao acaso coincidem e ficam certificados, e os erros de montagem plantados de propósito no motor fazem o controle falhar. Além disso, encontrou problemas reais:' },
        {
          k: 'ul',
          items: [
            'um diafragma 3D no plano XZ vinculava os nós com a rotação de sinal invertido;',
            'em 2D, um momento aplicado num nó onde todas as barras são rotuladas era absorvido por uma mola artificial, e o certificado do sistema montado o aprovava embora o modelo não tenha solução;',
            'um vínculo rígido a partir de um nó assim escondia um mecanismo real.',
          ],
        },
        { k: 'p', t: 'Os dois primeiros estão corrigidos: o diafragma segue a rotação de corpo rígido, e esse momento é recusado antes de resolver. E quando o motor mudou o significado de um diafragma para que todo o pavimento gire como um corpo, o verificador não aprovou nada falso: continuou honesto, com cotas inúteis, até que suas convenções foram atualizadas. É exatamente o que se espera de um controle independente.' },

        { k: 'h', t: 'O que fica de fora' },
        {
          k: 'ul',
          items: [
            'Cascas, sólidos, conectores, vigas curvas e torção com empenamento ainda não são reconstruídos: são informados fora de escopo, nunca como verificados.',
            'As fórmulas do verificador codificam a mecânica do modelo. Estão escritas à parte do motor e são confrontadas com ele, mas não estão provadas.',
            'A implementação em Rust não está provada equivalente ao algoritmo de Lean, como em todos os certificados.',
            'Um certificado diz que o resultado corresponde ao modelo. Não diz que o modelo representa bem a estrutura: isso continua sendo trabalho do engenheiro.',
          ],
        },

        { k: 'link', slug: 'how-stabileo-checks-its-results', t: 'As outras formas em que procuramos erros, e seus limites:' },
        { k: 'ext', href: `${REPO}/docs/verification/CERTIFY.md`, label: 'CERTIFY.md, «End-to-end certificates»', t: 'A descrição técnica completa, com as fórmulas e os testes:' },
      ],
    },
  },
};
