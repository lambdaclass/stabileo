import type { Post } from '../types';

export const researchToolsAndCheckingOurTests: Post = {
  "slug": "research-tools-and-checking-our-tests",
  "date": "2026-10-30",
  "order": 11,
  "authors": [
    "Federico Carrone"
  ],
  "tagKeys": [
    "blog.tag.research",
    "blog.tag.verification"
  ],
  "i18n": {
    "en": {
      "title": "Research, tools, and checking our tests",
      "excerpt": "What we shipped in the last few days: runnable research, eight calculators, and checks on the benchmark models themselves. What is working, what was wrong, and what still needs review.",
      "blocks": [
        {
          "k": "p",
          "t": "Over the last few days we added Stabileo Research and Stabileo Tools, and tightened the checks behind them. Stabileo is free, open-source structural engineering software with AI, published by Ergodic Group. LambdaClass is its development arm."
        },
        {
          "k": "h",
          "t": "Research you can run"
        },
        {
          "k": "p",
          "t": "We are putting published structural-engineering papers and classic benchmarks in the browser, with Stabileo’s own viewer. Every page states what it reproduces, how it was checked and the limits of the comparison. We are completing pages that still show open comparisons."
        },
        {
          "k": "p",
          "t": "The live paper pages cover Shauer (2025) phase-field fracture; Grossman and Boudaoud (2026) spring networks; Andreassen et al. (2011) topology optimization; Ferrari and Sigmund (2025) Roorda-frame stability; Pastrana et al. (2026) cable-net form finding; Zmyślony, Khan and Biggins (2026) snapping arches; and Fairclough et al. (2026) gridshells."
        },
        {
          "k": "p",
          "t": "The engine classics are MacNeal–Harder, the shell obstacle course, Mattiasson elastica, Riks/Crisfield, Newmark, CQC, plastic collapse, the Navier plate, the Lee frame and the DaDeppo–Schmidt arch. Pages distinguish live computation from recorded replay and show their comparison limits. Ferrari’s Koiter comparison is unfinished; Fairclough covers one five-node example; the snapping-arch equilibrium jump is not a transient simulation."
        },
        {
          "k": "p",
          "t": "We publish the scope and evidence and review them in the open. Research results are not design results, and benchmark agreement is not certification."
        },
        {
          "k": "table",
          "caption": "Live today:",
          "head": [
            "Offering",
            "Count"
          ],
          "rows": [
            [
              "Runnable paper pages",
              "7"
            ],
            [
              "Engine benchmark pages",
              "10"
            ],
            [
              "Calculators",
              "8"
            ]
          ]
        },
        {
          "k": "h",
          "t": "The tests need checking too"
        },
        {
          "k": "p",
          "t": "Some pages were wrong because our test models were wrong. Each engine benchmark page and its engine CI test now read the same case file, so a model fix updates both. Some provisional comparisons remain explicitly ignored in CI and do not yet block merges; we are completing those comparisons."
        },
        {
          "k": "p",
          "t": "We corrected the Mattiasson references and treatment of axial extension (#845), a rigid-jointed frame compared against an axial-only truss formula (#846), and incorrect shell support and loading models (#810). We are changing how benchmarks are built so this class of mistake can't pass again. The first part is in: each benchmark is a specification with two independent references that must agree, and automatic checks of applied load, reaction balance and symmetry, including half-model against full-model. We are adding convergence over three or more meshes, a sign-error test that proves each benchmark can fail, and engineer sign-off on the core set."
        },
        {
          "k": "p",
          "t": "We are also building units into the type system (#864), so kN/N or m/mm mix-ups are caught at compile time. The first slice, for 2D frames, is in review."
        },
        {
          "k": "h",
          "t": "Eight calculators, with a way into the editor"
        },
        {
          "k": "p",
          "t": "Stabileo Tools now has free calculators for simply supported beams, cantilevers, elastic column buckling, continuous beams, single-bay portals, planar trusses, moving-load influence lines and beam bending frequencies. They use the production engine, show independent classical comparisons and state their assumptions. Each opens its model in the full editor. These are analysis tools, not complete code design checks."
        },
        {
          "k": "h",
          "t": "Containing wrong results"
        },
        {
          "k": "p",
          "t": "We are containing every known wrong-result issue: refusals or warnings in the engine carry the known-issue ID, instead of returning an unchecked number (#807, in review). Every refusal is tested, including unsupported dynamic models with member or shell offsets."
        },
        {
          "k": "p",
          "t": "Metamorphic tests exposed invariance bugs: equivalent models could be refused after rotation, mirroring or unit scaling. We now run the metamorphic suite on every change to catch these regressions. We are adding a nightly run of random models that groups findings by root cause and files one issue per root cause."
        },
        {
          "k": "h",
          "t": "What comes next"
        },
        {
          "k": "p",
          "t": "We are completing the open comparisons and making the site and solver faster. Next on the roadmap are a Python package (pip install stabileo) and a public verification manual generated from the benchmarks."
        }
      ]
    },
    "es": {
      "title": "Investigación, herramientas y pruebas de nuestras pruebas",
      "excerpt": "Lo que publicamos en los últimos días: investigación ejecutable, ocho calculadoras y controles sobre los propios modelos de referencia. Qué funciona, qué estaba mal y qué falta revisar.",
      "blocks": [
        {
          "k": "p",
          "t": "En los últimos días agregamos Stabileo Research y Stabileo Tools, y reforzamos sus controles. Stabileo es software gratuito y de código abierto para ingeniería estructural con IA, publicado por Ergodic Group. LambdaClass es su brazo de desarrollo."
        },
        {
          "k": "h",
          "t": "Investigación que se puede ejecutar"
        },
        {
          "k": "p",
          "t": "Estamos llevando artículos publicados de ingeniería estructural y benchmarks clásicos al navegador, con el visor de Stabileo. Cada página indica qué reproduce, cómo lo verificamos y los límites de la comparación. Estamos completando las páginas que todavía muestran comparaciones pendientes."
        },
        {
          "k": "p",
          "t": "Las páginas de artículos disponibles cubren fractura de campo de fase de Shauer (2025); redes de resortes de Grossman y Boudaoud (2026); optimización topológica de Andreassen et al. (2011); estabilidad del pórtico de Roorda de Ferrari y Sigmund (2025); búsqueda de forma de redes de cables de Pastrana et al. (2026); arcos con salto de Zmyślony, Khan y Biggins (2026); y estructuras reticuladas de Fairclough et al. (2026)."
        },
        {
          "k": "p",
          "t": "Los clásicos del motor son MacNeal–Harder, el circuito de pruebas de láminas, la elástica de Mattiasson, Riks/Crisfield, Newmark, CQC, colapso plástico, la placa de Navier, el pórtico de Lee y el arco de DaDeppo–Schmidt. Las páginas distinguen cálculo en vivo de reproducción de resultados guardados y muestran los límites de la comparación. Falta la comparación de Koiter de Ferrari; Fairclough cubre un ejemplo de cinco nodos; el salto de equilibrio del arco no es una simulación transitoria."
        },
        {
          "k": "p",
          "t": "Publicamos el alcance y la evidencia y los revisamos abiertamente. Los resultados de investigación no son resultados de diseño, y coincidir con un benchmark no es una certificación."
        },
        {
          "k": "table",
          "caption": "Disponible hoy:",
          "head": [
            "Oferta",
            "Cantidad"
          ],
          "rows": [
            [
              "Páginas de artículos ejecutables",
              "7"
            ],
            [
              "Páginas de benchmarks del motor",
              "10"
            ],
            [
              "Calculadoras",
              "8"
            ]
          ]
        },
        {
          "k": "h",
          "t": "También hay que comprobar las pruebas"
        },
        {
          "k": "p",
          "t": "Algunas páginas eran incorrectas porque nuestros modelos de prueba estaban mal. Cada página de benchmark del motor y su prueba de CI ahora leen el mismo archivo de caso, de modo que corregir el modelo actualiza ambas. Algunas comparaciones provisionales siguen explícitamente excluidas de CI y todavía no bloquean integraciones; estamos completándolas."
        },
        {
          "k": "p",
          "t": "Corregimos las referencias de Mattiasson y el tratamiento del alargamiento axial (#845), un pórtico de nudos rígidos comparado con una fórmula de reticulado puramente axial (#846) y modelos incorrectos de apoyos y cargas en láminas (#810). Estamos cambiando cómo se construyen los benchmarks para que esta clase de error no vuelva a pasar. La primera parte ya está incorporada: cada benchmark es una especificación con dos referencias independientes que deben coincidir y controles automáticos de carga aplicada, equilibrio de reacciones y simetría, incluidas comparaciones entre medio modelo y modelo completo. Estamos agregando convergencia en tres o más mallas, una prueba con error de signo que demuestra que cada benchmark puede fallar y la aprobación de un ingeniero para el conjunto principal."
        },
        {
          "k": "p",
          "t": "También estamos incorporando unidades al sistema de tipos (#864), para detectar confusiones entre kN/N o m/mm al compilar. La primera parte, para pórticos 2D, está en revisión."
        },
        {
          "k": "h",
          "t": "Ocho calculadoras, con acceso al editor"
        },
        {
          "k": "p",
          "t": "Stabileo Tools tiene calculadoras gratuitas de vigas simplemente apoyadas, ménsulas, pandeo elástico de columnas, vigas continuas, pórticos de un vano, reticulados planos, líneas de influencia de cargas móviles y frecuencias de flexión de vigas. Usan el motor de producción, muestran comparaciones clásicas independientes y explicitan sus hipótesis. Cada una abre su modelo en el editor completo. Son herramientas de análisis, no verificaciones normativas completas."
        },
        {
          "k": "h",
          "t": "Contener los resultados incorrectos"
        },
        {
          "k": "p",
          "t": "Estamos conteniendo todos los problemas conocidos de resultados incorrectos: los rechazos o advertencias del motor incluyen el identificador del problema, en lugar de devolver un número sin verificar (#807, en revisión). Se prueba cada rechazo, incluidos los modelos dinámicos no admitidos con excentricidades de barras o láminas."
        },
        {
          "k": "p",
          "t": "Las pruebas metamórficas revelaron errores de invariancia: modelos equivalentes podían rechazarse después de rotarlos, reflejarlos o cambiar la escala de sus unidades. Ahora ejecutamos la batería metamórfica con cada cambio para detectar estas regresiones. Estamos agregando una ejecución nocturna de modelos aleatorios que agrupa los hallazgos por causa raíz y abre una incidencia por cada causa raíz."
        },
        {
          "k": "h",
          "t": "Qué sigue"
        },
        {
          "k": "p",
          "t": "Estamos completando las comparaciones pendientes y acelerando el sitio y el solver. Lo próximo en la hoja de ruta es un paquete de Python (pip install stabileo) y un manual público de verificación generado a partir de los benchmarks."
        }
      ]
    },
    "pt": {
      "title": "Pesquisa, ferramentas e a verificação dos nossos testes",
      "excerpt": "O que publicamos nos últimos dias: pesquisa executável, oito calculadoras e verificações dos próprios modelos de referência. O que funciona, o que estava errado e o que falta revisar.",
      "blocks": [
        {
          "k": "p",
          "t": "Nos últimos dias adicionamos Stabileo Research e Stabileo Tools e reforçamos suas verificações. Stabileo é software gratuito e de código aberto para engenharia estrutural com IA, publicado pelo Ergodic Group. LambdaClass é seu braço de desenvolvimento."
        },
        {
          "k": "h",
          "t": "Pesquisa que você pode executar"
        },
        {
          "k": "p",
          "t": "Estamos trazendo artigos publicados de engenharia estrutural e benchmarks clássicos ao navegador, com o visualizador do Stabileo. Cada página informa o que reproduz, como verificamos os resultados e os limites da comparação. Estamos concluindo as páginas que ainda mostram comparações pendentes."
        },
        {
          "k": "p",
          "t": "As páginas de artigos disponíveis cobrem fratura por campo de fase de Shauer (2025); redes de molas de Grossman e Boudaoud (2026); otimização topológica de Andreassen et al. (2011); estabilidade do pórtico de Roorda de Ferrari e Sigmund (2025); busca de forma de redes de cabos de Pastrana et al. (2026); arcos com salto de Zmyślony, Khan e Biggins (2026); e cascas reticuladas de Fairclough et al. (2026)."
        },
        {
          "k": "p",
          "t": "Os clássicos do motor são MacNeal–Harder, o circuito de testes de cascas, a elástica de Mattiasson, Riks/Crisfield, Newmark, CQC, colapso plástico, a placa de Navier, o pórtico de Lee e o arco de DaDeppo–Schmidt. As páginas distinguem cálculo ao vivo de reprodução de resultados gravados e mostram os limites da comparação. A comparação de Koiter de Ferrari está incompleta; Fairclough cobre um exemplo de cinco nós; o salto de equilíbrio do arco não é uma simulação transiente."
        },
        {
          "k": "p",
          "t": "Publicamos o escopo e as evidências e os revisamos abertamente. Resultados de pesquisa não são resultados de projeto, e concordância com um benchmark não é certificação."
        },
        {
          "k": "table",
          "caption": "Disponível hoje:",
          "head": [
            "Oferta",
            "Quantidade"
          ],
          "rows": [
            [
              "Páginas de artigos executáveis",
              "7"
            ],
            [
              "Páginas de benchmarks do motor",
              "10"
            ],
            [
              "Calculadoras",
              "8"
            ]
          ]
        },
        {
          "k": "h",
          "t": "Os testes também precisam ser verificados"
        },
        {
          "k": "p",
          "t": "Algumas páginas estavam erradas porque nossos modelos de teste estavam errados. Cada página de benchmark do motor e seu teste de CI agora leem o mesmo arquivo de caso, de modo que corrigir o modelo atualiza ambos. Algumas comparações provisórias continuam explicitamente ignoradas na CI e ainda não bloqueiam integrações; estamos concluindo essas comparações."
        },
        {
          "k": "p",
          "t": "Corrigimos as referências de Mattiasson e o tratamento do alongamento axial (#845), um pórtico de nós rígidos comparado com uma fórmula de treliça puramente axial (#846) e modelos incorretos de apoios e cargas em cascas (#810). Estamos mudando como os benchmarks são construídos para que essa classe de erro não volte a passar. A primeira parte já está incorporada: cada benchmark é uma especificação com duas referências independentes que devem concordar e verificações automáticas de carga aplicada, equilíbrio das reações e simetria, incluindo comparações entre meio modelo e modelo completo. Estamos adicionando convergência em três ou mais malhas, um teste com erro de sinal que comprova que cada benchmark pode falhar e a aprovação de um engenheiro para o conjunto principal."
        },
        {
          "k": "p",
          "t": "Também estamos incorporando unidades ao sistema de tipos (#864), para detectar confusões entre kN/N ou m/mm na compilação. A primeira parte, para pórticos 2D, está em revisão."
        },
        {
          "k": "h",
          "t": "Oito calculadoras, com acesso ao editor"
        },
        {
          "k": "p",
          "t": "Stabileo Tools tem calculadoras gratuitas para vigas biapoiadas, balanços, flambagem elástica de pilares, vigas contínuas, pórticos de um vão, treliças planas, linhas de influência de cargas móveis e frequências de flexão de vigas. Usam o motor de produção, mostram comparações clássicas independentes e declaram suas hipóteses. Cada uma abre seu modelo no editor completo. São ferramentas de análise, não verificações normativas completas."
        },
        {
          "k": "h",
          "t": "Conter resultados errados"
        },
        {
          "k": "p",
          "t": "Estamos contendo todos os problemas conhecidos de resultados incorretos: as recusas ou os avisos do motor incluem o identificador do problema, em vez de retornar um número sem verificação (#807, em revisão). Cada recusa é testada, incluindo modelos dinâmicos não suportados com excentricidades de barras ou cascas."
        },
        {
          "k": "p",
          "t": "Os testes metamórficos revelaram erros de invariância: modelos equivalentes podiam ser recusados após rotação, espelhamento ou mudança de escala das unidades. Agora executamos a suíte metamórfica a cada alteração para detectar essas regressões. Estamos adicionando uma execução noturna de modelos aleatórios que agrupa os achados por causa raiz e abre uma issue por causa raiz."
        },
        {
          "k": "h",
          "t": "O que vem a seguir"
        },
        {
          "k": "p",
          "t": "Estamos concluindo as comparações pendentes e acelerando o site e o solver. Os próximos itens do roteiro são um pacote Python (pip install stabileo) e um manual público de verificação gerado a partir dos benchmarks."
        }
      ]
    }
  }
};
