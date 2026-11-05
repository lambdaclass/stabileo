/** Numbers are quoted from changelog.d/, docs/advisories/SA-2026-025…042 and PRs #807 and #1415; re-sync with docs/releases/v0.5.0.md once it exists. */
import type { Post } from '../types';

const REPO = 'https://github.com/lambdaclass/stabileo/blob/main';

export const release050: Post = {
  slug: 'stabileo-0-5-0',
  date: '2026-11-05',
  order: 14,
  authors: ['Federico Carrone'],
  tagKeys: ['blog.tag.safety', 'blog.tag.verification', 'blog.tag.solver'],
  i18n: {
    en: {
      title: 'Stabileo 0.5.0: sixteen more advisories, and every open wrong-result issue warned or refused',
      excerpt:
        'What changed since 0.4.0: sixteen defects that could give a wrong or unconservative result, fixed and written up as advisories; a warning or a refusal for every defect still open; the step-by-step course in Basic; and the app in six languages.',
      blocks: [
        { k: 'p', t: 'Since 0.4.0 we kept checking Stabileo from several sides at once: the solver against published solutions and other programs, the design checks against worked examples, the same structure renumbered, rescaled and moved, and the files that earlier releases saved. That found sixteen more defects that could give a wrong or unconservative result. They are fixed, and each one has an advisory saying what was wrong, who is affected and what to re-check.' },
        { k: 'note', t: 'stabileo.com publishes every change as soon as it is merged, so most of these fixes are already live, each from the day it was merged. Projects saved before a change that concerns them ask for a re-check when they are opened, in the reader’s language.' },

        { k: 'h', t: 'Re-run your projects' },
        { k: 'p', t: 'These are the cases that move a design result the most. Each advisory has the worked case and what to do with results you already delivered.' },
        { k: 'img', base: 'blog/release-050-recheck-de', w: 1600, h: 1000, alt: 'Stabileo Basic in German, opening a plane frame from the examples that was last solved with results version 15. The re-check notice lists the changes that concern it, each with its title and explanation in German, and asks the reader to tick that they have read them before continuing or re-running the analysis.', caption: 'The re-check notice now explains each change in all six languages: here, in German.' },
        {
          k: 'table',
          caption: 'Some of the 0.5.0 fixes, as each advisory documents them.',
          head: ['Advisory', 'What was wrong', 'Severity'],
          rows: [
            ['SA-2026-029', '3D design checks read the lateral moment or shear: a CIRSOC 201 column bent about Mz was checked over its depth, 36 % too little steel in an example', 'Critical'],
            ['SA-2026-028', 'EN 1992-1-1 flexure assumed the tension steel yields: MRd up to 22 % high', 'High'],
            ['SA-2026-030', 'CIRSOC 301 compression: a section with Qa ≤ 0 got a capacity above its squash load, and passed', 'High'],
            ['SA-2026-041', 'The RC column check paired the largest moment with the largest compression only: up to 15 % unconservative in an example', 'High'],
            ['SA-2026-042', '2D buckling overstated the factor of members whose compression grows along them: +43 % to +68 % for one member', 'High'],
            ['SA-2026-035', 'A 3D-to-2D cut bent members about the wrong section axis: a Y–Z portal 13.5 times too stiff', 'High'],
            ['SA-2026-033', 'The load generator left out a floor’s whole area load when one low member stood over part of it', 'High'],
            ['SA-2026-027', 'The shell envelope kept the combination with the largest Von Mises, not each component’s extreme: mx 14 % low in an example', 'High'],
          ],
        },
        { k: 'p', t: 'The other advisories cover concrete members with torsion under ACI 318 and EN 1992 (SA-2026-040), constraints of a model cut to 2D from a Y–Z or X–Y plane (SA-2026-036), 3D co-rotational analysis with large rotations (SA-2026-037), a load at t = 0 on a node without mass in time history (SA-2026-031), the zero mode of a mechanism in modal analysis (SA-2026-032), the equilibrium check of the report after the analysis (SA-2026-034) and, for those who call the engine directly, steel shear without a shear area under AISC 360 and EN 1993 (SA-2026-025 and 026).' },

        { k: 'h', t: 'Other changes that move results' },
        { k: 'p', t: 'These are not defects with an advisory, but they change numbers, so each one is in the re-check notice:' },
        {
          k: 'ul',
          items: [
            'A member’s governing value and the 2D envelope read the true peak of the diagram, not the nearest of 21 stations: they can rise, by 0.23 % under a triangular load and 1.05 % under a short partial load in the documented cases, and never fall.',
            'Mechanisms are refused instead of solved: behind a rigid link or a diaphragm in 2D, behind a connector in 2D (#1415), and in modal analysis, which used to drop the zero mode and return the others as complete.',
            'Repeated eigenvalues keep their multiplicity, and static and modal results check their own equilibrium and orthogonality before they are shown.',
            'In Basic, P-Δ and the critical load split each member into elements, plastic collapse closes hinges that unload, and the influence line of the bending moment takes sagging as positive, as every other moment in Basic.',
          ],
        },

        { k: 'h', t: 'Warned or refused, until each fix exists' },
        { k: 'p', t: 'Every open issue that can give a wrong result now has a warning or a refusal at each place it can reach the engineer (#807). A warning keeps the result and names the issue next to it; a refusal withholds the result and says why. A ledger in the repository lists every open safety issue with its warning or refusal, the condition that triggers it and the test that proves it fires, and a test keeps it in agreement with the engine.' },
        {
          k: 'ul',
          items: [
            'Refused: the 2D plastic collapse factor, which can change by up to 4.6 times with the numbering, the direction of members and the units (#758); a buckling factor outside the bounds of its own certificate (#741); MITC4 shells on distorted meshes under significant in-plane bending (#798); and MITC4 and MITC9 shells on twisted geometry (#1057).',
            'Warned: among others, time history, 3D modal superposition, near-singular models, 3D buckling with loads along members, contact, material nonlinear analysis and connectors with unequal stiffnesses.',
            'Apart from what it refuses, containment changes one number: the 2D reaction of a settled support that also carries a spring in the settled direction now includes that spring’s force. Every other value of the 145,515 in the results corpus is identical.',
          ],
        },
        { k: 'note', t: 'Two refusals take away results that some readers use. Plastic collapse factors of plane frames are withheld until #758 is fixed. Some distorted shell meshes whose results were within 2 % of their references are withheld too: we chose a refusal too many over a wrong stiffness shown without warning, and narrowing it is on the roadmap.' },

        { k: 'h', t: 'Also in 0.5.0' },
        {
          k: 'ul',
          items: [
            'Basic teaches structural analysis step by step: statics, the force and displacement methods, influence lines, second order and buckling, plastic analysis and dynamics, each explained step by step in the app.',
            'The app and the public site in German, French and Turkish, alongside Spanish, English and Portuguese. The re-check notice explains each change in all six.',
            'PRO: master and similar storeys, plate results per unit width with principal moments and directions, the report after the analysis, a read-only viewer with “Duplicate and edit”, and a linked IFC drawn as a 3D reference.',
            'Files saved by 0.2.0, 0.3.0 and 0.4.0 open, migrate and give the same results on every change, except where a registered result change applies; a file saved by a newer version is refused with a message that says so.',
            'The same structure rescaled, renumbered, reversed or moved must give the same answer, checked across 17 analysis types on every change and on 8,192 generated models every night.',
            'Stabileo Research and Stabileo Tools: runnable reproductions of published papers and benchmarks, revised after a three-reviewer pass, and free calculators that run on the same engine.',
          ],
        },

        { k: 'link', slug: 'safety-advisories', t: 'The full list of advisories, with what to re-check for each:' },
        { k: 'ext', href: `${REPO}/docs/advisories/README.md`, label: 'Safety advisories index', t: 'Every advisory, with its severity, issue and fix:' },
        { k: 'ext', href: `${REPO}/CHANGELOG.md`, label: 'Changelog', t: 'The full technical record:' },
      ],
    },
    es: {
      title: 'Stabileo 0.5.0: dieciséis avisos más, y una advertencia o un rechazo para cada error abierto que puede dar un resultado equivocado',
      excerpt:
        'Qué cambió desde la 0.4.0: dieciséis errores que podían dar un resultado equivocado o del lado inseguro, corregidos y documentados como avisos; una advertencia o un rechazo para cada error todavía abierto; el curso paso a paso en Básico; y la aplicación en seis idiomas.',
      blocks: [
        { k: 'p', t: 'Desde la 0.4.0 seguimos verificando Stabileo desde varios lados a la vez: el solver contra soluciones publicadas y otros programas, las verificaciones de dimensionado contra ejemplos resueltos, la misma estructura renumerada, reescalada y desplazada, y los archivos que guardaron las versiones anteriores. Así encontramos dieciséis errores más que podían dar un resultado equivocado o del lado inseguro. Están corregidos, y cada uno tiene un aviso que dice qué estaba mal, a quién afecta y qué revisar.' },
        { k: 'note', t: 'stabileo.com publica cada cambio en cuanto se integra, así que la mayoría de estas correcciones ya están en línea, cada una desde el día en que se integró. Los proyectos guardados antes de un cambio que los afecta piden revisión al abrirlos, en el idioma de quien los abre.' },

        { k: 'h', t: 'Volvé a resolver tus proyectos' },
        { k: 'p', t: 'Estos son los casos que más mueven un resultado de diseño. Cada aviso tiene el caso resuelto y qué hacer con los resultados que ya entregaste.' },
        { k: 'img', base: 'blog/release-050-recheck-de', w: 1600, h: 1000, alt: 'Stabileo Básico en alemán, al abrir un pórtico plano de los ejemplos que se resolvió por última vez con la versión de resultados 15. El diálogo de revisión lista los cambios que lo afectan, cada uno con su título y su explicación en alemán, y pide marcar que se leyeron antes de continuar o de volver a correr el análisis.', caption: 'El diálogo de revisión ahora explica cada cambio en los seis idiomas: acá, en alemán.' },
        {
          k: 'table',
          caption: 'Algunas correcciones de la 0.5.0, tal como las documenta cada aviso.',
          head: ['Aviso', 'Qué estaba mal', 'Severidad'],
          rows: [
            ['SA-2026-029', 'Las verificaciones de dimensionado 3D leían el momento o el corte laterales: una columna CIRSOC 201 flexionada alrededor de Mz se verificaba sobre su altura, con 36 % menos acero del necesario en un ejemplo', 'Crítica'],
            ['SA-2026-028', 'La flexión según EN 1992-1-1 suponía que la armadura traccionada fluye: MRd hasta 22 % alto', 'Alta'],
            ['SA-2026-030', 'Compresión CIRSOC 301: una sección con Qa ≤ 0 obtenía una resistencia mayor que su carga de aplastamiento, y aprobaba', 'Alta'],
            ['SA-2026-041', 'La verificación de columnas de hormigón armado combinaba el momento máximo sólo con la compresión máxima: hasta 15 % del lado inseguro en un ejemplo', 'Alta'],
            ['SA-2026-042', 'El pandeo 2D sobreestimaba el factor de las barras cuya compresión crece a lo largo de ellas: entre +43 % y +68 % para una barra', 'Alta'],
            ['SA-2026-035', 'Un corte de 3D a 2D flexionaba las barras alrededor del eje equivocado de la sección: un pórtico Y–Z 13,5 veces demasiado rígido', 'Alta'],
            ['SA-2026-033', 'El generador de cargas omitía toda la carga superficial de un piso cuando una barra baja quedaba sobre una parte de él', 'Alta'],
            ['SA-2026-027', 'La envolvente de láminas guardaba la combinación con el mayor Von Mises, no el extremo de cada componente: mx 14 % bajo en un ejemplo', 'Alta'],
          ],
        },
        { k: 'p', t: 'Los demás avisos cubren las barras de hormigón con torsión según ACI 318 y EN 1992 (SA-2026-040), las restricciones de un modelo cortado a 2D desde un plano Y–Z o X–Y (SA-2026-036), el análisis corrotacional 3D con grandes rotaciones (SA-2026-037), una carga en t = 0 sobre un nudo sin masa en historia en el tiempo (SA-2026-031), el modo nulo de un mecanismo en el análisis modal (SA-2026-032), la verificación de equilibrio de la memoria después del análisis (SA-2026-034) y, para quienes llaman al motor directamente, el corte en acero sin área de corte según AISC 360 y EN 1993 (SA-2026-025 y 026).' },

        { k: 'h', t: 'Otros cambios que mueven resultados' },
        { k: 'p', t: 'No son errores con aviso, pero cambian números, así que cada uno está en el diálogo de revisión:' },
        {
          k: 'ul',
          items: [
            'El valor determinante de una barra y la envolvente 2D leen el pico real del diagrama, no la más cercana de 21 estaciones: pueden subir, 0,23 % con una carga triangular y 1,05 % con una carga parcial corta en los casos documentados, y nunca bajan.',
            'Los mecanismos se rechazan en lugar de resolverse: detrás de un vínculo rígido o un diafragma en 2D, detrás de un conector en 2D (#1415), y en el análisis modal, que antes descartaba el modo nulo y devolvía los demás como completos.',
            'Los autovalores repetidos conservan su multiplicidad, y los resultados estáticos y modales verifican su propio equilibrio y su ortogonalidad antes de mostrarse.',
            'En Básico, P-Δ y la carga crítica dividen cada barra en elementos, el colapso plástico cierra las rótulas que se descargan, y la línea de influencia del momento flector toma como positivo el momento que tracciona la fibra inferior, como todo otro momento en Básico.',
          ],
        },

        { k: 'h', t: 'Advertido o rechazado, hasta que exista cada corrección' },
        { k: 'p', t: 'Cada error abierto que puede dar un resultado equivocado tiene ahora una advertencia o un rechazo en cada lugar por el que puede llegar al ingeniero (#807). Una advertencia conserva el resultado y nombra el error a su lado; un rechazo retiene el resultado y dice por qué. Un registro en el repositorio lista cada error de seguridad abierto con su advertencia o su rechazo, la condición que lo dispara y el test que prueba que se activa, y un test lo mantiene de acuerdo con el motor.' },
        {
          k: 'ul',
          items: [
            'Rechazados: el factor de colapso plástico 2D, que puede cambiar hasta 4,6 veces con la numeración, la dirección de las barras y las unidades (#758); un factor de pandeo fuera de los límites de su propio certificado (#741); las láminas MITC4 en mallas distorsionadas con flexión significativa en su plano (#798); y las láminas MITC4 y MITC9 en geometría alabeada (#1057).',
            'Advertidos: entre otros, la historia en el tiempo, la superposición modal 3D, los modelos casi singulares, el pandeo 3D con cargas a lo largo de las barras, el contacto, el análisis no lineal de material y los conectores con rigideces distintas.',
            'Fuera de lo que rechaza, esta contención de errores abiertos cambia un solo número: la reacción 2D de un apoyo con asentamiento impuesto que además tiene un resorte en la dirección del asentamiento ahora incluye la fuerza de ese resorte. Todos los demás valores de los 145.515 del corpus de resultados son idénticos.',
          ],
        },
        { k: 'note', t: 'Dos rechazos quitan resultados que algunos lectores usan. Los factores de colapso plástico de pórticos planos quedan retenidos hasta que se corrija #758. También quedan retenidas algunas mallas de láminas distorsionadas cuyos resultados estaban dentro del 2 % de sus referencias: elegimos un rechazo de más antes que una rigidez equivocada mostrada sin advertencia, y acotarlo está en la hoja de ruta.' },

        { k: 'h', t: 'También en la 0.5.0' },
        {
          k: 'ul',
          items: [
            'Básico enseña análisis estructural paso a paso: estática, los métodos de las fuerzas y de los desplazamientos, líneas de influencia, segundo orden y pandeo, análisis plástico y dinámica, cada uno explicado paso a paso en la aplicación.',
            'La aplicación y el sitio público en alemán, francés y turco, junto al español, el inglés y el portugués. El diálogo de revisión explica cada cambio en los seis.',
            'PRO: plantas madre y plantas similares, resultados de placas por unidad de ancho con momentos y direcciones principales, la memoria después del análisis, un visor de solo lectura con “Duplicar y editar”, y un IFC vinculado dibujado como referencia 3D.',
            'Los archivos guardados por la 0.2.0, la 0.3.0 y la 0.4.0 se abren, se migran y dan los mismos resultados en cada cambio, salvo donde se aplica un cambio de resultados registrado; un archivo guardado por una versión más nueva se rechaza con un mensaje que lo dice.',
            'La misma estructura reescalada, renumerada, invertida o desplazada tiene que dar la misma respuesta, y eso se verifica en 17 tipos de análisis en cada cambio y sobre 8.192 modelos generados cada noche.',
            'Stabileo Research y Stabileo Tools: reproducciones ejecutables de artículos y benchmarks publicados, revisadas después de una pasada de tres revisores, y calculadoras gratuitas que corren sobre el mismo motor.',
          ],
        },

        { k: 'link', slug: 'safety-advisories', t: 'La lista completa de avisos, con qué revisar en cada caso:' },
        { k: 'ext', href: `${REPO}/docs/advisories/README.md`, label: 'Índice de avisos de seguridad', t: 'Cada aviso, con su severidad, su issue y su corrección:' },
        { k: 'ext', href: `${REPO}/CHANGELOG.md`, label: 'Registro de cambios', t: 'El registro técnico completo:' },
      ],
    },
    pt: {
      title: 'Stabileo 0.5.0: mais dezesseis avisos, e uma advertência ou uma recusa para cada erro aberto que pode dar um resultado errado',
      excerpt:
        'O que mudou desde a 0.4.0: dezesseis erros que podiam dar um resultado errado ou contra a segurança, corrigidos e documentados como avisos; uma advertência ou uma recusa para cada erro ainda aberto; o curso passo a passo no Básico; e o aplicativo em seis idiomas.',
      blocks: [
        { k: 'p', t: 'Desde a 0.4.0 continuamos verificando o Stabileo por vários lados ao mesmo tempo: o solver contra soluções publicadas e outros programas, as verificações de dimensionamento contra exemplos resolvidos, a mesma estrutura renumerada, reescalada e deslocada, e os arquivos que as versões anteriores salvaram. Assim encontramos mais dezesseis erros que podiam dar um resultado errado ou contra a segurança. Estão corrigidos, e cada um tem um aviso que diz o que estava errado, a quem afeta e o que revisar.' },
        { k: 'note', t: 'stabileo.com publica cada mudança assim que é integrada, então a maioria destas correções já está no ar, cada uma desde o dia em que foi integrada. Os projetos salvos antes de uma mudança que os afeta pedem revisão ao serem abertos, no idioma de quem os abre.' },

        { k: 'h', t: 'Resolva seus projetos de novo' },
        { k: 'p', t: 'Estes são os casos que mais movem um resultado de projeto. Cada aviso tem o caso resolvido e o que fazer com os resultados que você já entregou.' },
        { k: 'img', base: 'blog/release-050-recheck-de', w: 1600, h: 1000, alt: 'Stabileo Básico em alemão, ao abrir um pórtico plano dos exemplos que foi resolvido pela última vez com a versão de resultados 15. O diálogo de revisão lista as mudanças que o afetam, cada uma com seu título e sua explicação em alemão, e pede para marcar que foram lidas antes de continuar ou de executar a análise novamente.', caption: 'O diálogo de revisão agora explica cada mudança nos seis idiomas: aqui, em alemão.' },
        {
          k: 'table',
          caption: 'Algumas correções da 0.5.0, tal como cada aviso as documenta.',
          head: ['Aviso', 'O que estava errado', 'Severidade'],
          rows: [
            ['SA-2026-029', 'As verificações de dimensionamento 3D liam o momento ou o cisalhamento laterais: um pilar CIRSOC 201 fletido em torno de Mz era verificado pela sua altura, com 36 % menos aço do que o necessário num exemplo', 'Crítica'],
            ['SA-2026-028', 'A flexão pela EN 1992-1-1 supunha que a armadura tracionada escoa: MRd até 22 % acima', 'Alta'],
            ['SA-2026-030', 'Compressão CIRSOC 301: uma seção com Qa ≤ 0 recebia uma resistência acima da sua carga de esmagamento, e aprovava', 'Alta'],
            ['SA-2026-041', 'A verificação de pilares de concreto armado combinava o maior momento apenas com a maior compressão: até 15 % contra a segurança num exemplo', 'Alta'],
            ['SA-2026-042', 'A flambagem 2D superestimava o fator das barras cuja compressão cresce ao longo delas: de +43 % a +68 % para uma barra', 'Alta'],
            ['SA-2026-035', 'Um corte de 3D para 2D fletia as barras em torno do eixo errado da seção: um pórtico Y–Z 13,5 vezes rígido demais', 'Alta'],
            ['SA-2026-033', 'O gerador de cargas deixava de fora toda a carga de superfície de um pavimento quando uma barra baixa ficava sobre parte dele', 'Alta'],
            ['SA-2026-027', 'A envoltória de cascas guardava a combinação com o maior Von Mises, não o extremo de cada componente: mx 14 % abaixo num exemplo', 'Alta'],
          ],
        },
        { k: 'p', t: 'Os demais avisos cobrem barras de concreto com torção pela ACI 318 e pela EN 1992 (SA-2026-040), as restrições de um modelo cortado para 2D a partir de um plano Y–Z ou X–Y (SA-2026-036), a análise corrotacional 3D com grandes rotações (SA-2026-037), uma carga em t = 0 sobre um nó sem massa no histórico no tempo (SA-2026-031), o modo nulo de um mecanismo na análise modal (SA-2026-032), a verificação de equilíbrio do memorial depois da análise (SA-2026-034) e, para quem chama o motor diretamente, o cisalhamento em aço sem área de cisalhamento pela AISC 360 e pela EN 1993 (SA-2026-025 e 026).' },

        { k: 'h', t: 'Outras mudanças que alteram resultados' },
        { k: 'p', t: 'Não são erros com aviso, mas mudam números, então cada uma está no diálogo de revisão:' },
        {
          k: 'ul',
          items: [
            'O valor determinante de uma barra e a envoltória 2D leem o pico real do diagrama, não a mais próxima de 21 estações: podem subir, 0,23 % sob uma carga triangular e 1,05 % sob uma carga parcial curta nos casos documentados, e nunca descem.',
            'Os mecanismos são recusados em vez de resolvidos: atrás de um vínculo rígido ou de um diafragma em 2D, atrás de um conector em 2D (#1415), e na análise modal, que antes descartava o modo nulo e devolvia os demais como completos.',
            'Autovalores repetidos mantêm sua multiplicidade, e os resultados estáticos e modais verificam seu próprio equilíbrio e sua ortogonalidade antes de serem mostrados.',
            'No Básico, o P-Δ e a carga crítica dividem cada barra em elementos, o colapso plástico fecha as rótulas que descarregam, e a linha de influência do momento fletor toma como positivo o momento que traciona a fibra inferior, como todo outro momento no Básico.',
          ],
        },

        { k: 'h', t: 'Advertido ou recusado, até que exista cada correção' },
        { k: 'p', t: 'Cada erro aberto que pode dar um resultado errado agora tem uma advertência ou uma recusa em cada lugar por onde pode chegar ao engenheiro (#807). Uma advertência mantém o resultado e nomeia o erro ao lado dele; uma recusa retém o resultado e diz por quê. Um registro no repositório lista cada erro de segurança aberto com sua advertência ou sua recusa, a condição que a dispara e o teste que prova que ela é acionada, e um teste o mantém de acordo com o motor.' },
        {
          k: 'ul',
          items: [
            'Recusados: o fator de colapso plástico 2D, que pode mudar até 4,6 vezes com a numeração, a direção das barras e as unidades (#758); um fator de flambagem fora dos limites do seu próprio certificado (#741); cascas MITC4 em malhas distorcidas sob flexão significativa no plano (#798); e cascas MITC4 e MITC9 em geometria torcida (#1057).',
            'Advertidos: entre outros, o histórico no tempo, a superposição modal 3D, modelos quase singulares, a flambagem 3D com cargas ao longo das barras, o contato, a análise não linear de material e conectores com rigidezes diferentes.',
            'Fora o que recusa, esta contenção dos erros abertos muda um único número: a reação 2D de um apoio com recalque imposto que também tem uma mola na direção do recalque agora inclui a força dessa mola. Todos os demais valores dos 145.515 do corpus de resultados são idênticos.',
          ],
        },
        { k: 'note', t: 'Duas recusas tiram resultados que alguns leitores usam. Os fatores de colapso plástico de pórticos planos ficam retidos até que #758 seja corrigido. Algumas malhas de cascas distorcidas cujos resultados ficavam dentro de 2 % das suas referências também ficam retidas: preferimos uma recusa a mais a uma rigidez errada mostrada sem advertência, e estreitá-la está no roteiro.' },

        { k: 'h', t: 'Também na 0.5.0' },
        {
          k: 'ul',
          items: [
            'O Básico ensina análise estrutural passo a passo: estática, os métodos das forças e dos deslocamentos, linhas de influência, segunda ordem e flambagem, análise plástica e dinâmica, cada um explicado passo a passo no aplicativo.',
            'O aplicativo e o site público em alemão, francês e turco, junto com espanhol, inglês e português. O diálogo de revisão explica cada mudança nos seis.',
            'PRO: pavimentos mestre e pavimentos semelhantes, resultados de placas por unidade de largura com momentos e direções principais, o memorial depois da análise, um visualizador somente leitura com “Duplicar e editar”, e um IFC vinculado desenhado como referência 3D.',
            'Os arquivos salvos pela 0.2.0, pela 0.3.0 e pela 0.4.0 abrem, migram e dão os mesmos resultados em cada mudança, exceto onde se aplica uma mudança de resultados registrada; um arquivo salvo por uma versão mais nova é recusado com uma mensagem que diz isso.',
            'A mesma estrutura reescalada, renumerada, invertida ou deslocada deve dar a mesma resposta, o que é verificado em 17 tipos de análise em cada mudança e em 8.192 modelos gerados todas as noites.',
            'Stabileo Research e Stabileo Tools: reproduções executáveis de artigos e benchmarks publicados, revisadas após uma rodada de três revisores, e calculadoras gratuitas que rodam sobre o mesmo motor.',
          ],
        },

        { k: 'link', slug: 'safety-advisories', t: 'A lista completa de avisos, com o que revisar em cada caso:' },
        { k: 'ext', href: `${REPO}/docs/advisories/README.md`, label: 'Índice de avisos de segurança', t: 'Cada aviso, com sua severidade, sua issue e sua correção:' },
        { k: 'ext', href: `${REPO}/CHANGELOG.md`, label: 'Registro de mudanças', t: 'O registro técnico completo:' },
      ],
    },
  },
};
