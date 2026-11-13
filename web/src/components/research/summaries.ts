import { CATALOGUE_SUMMARIES } from './catalogue-summaries';

type Summary = { en: string; es: string; pt: string; hu: string };

/** `en` is the papers.yaml summary each translation was made from; a test fails when they differ. */
export const SUMMARIES: Record<string, Summary> = {
  ...CATALOGUE_SUMMARIES,
  'shauer-2025': {
    en: 'An educational single-file Python implementation of two-dimensional phase-field fracture with linear quadrilateral elements. It provides sparse and dense examples of a bar in tension and a single-edge notched plate, plus a sparse three-point bending example, with VTK output and stress or reaction-force plots for comparison.',
    es: 'Una implementación educativa en Python, en un solo archivo, de la fractura por campo de fase en dos dimensiones con elementos cuadriláteros lineales. Trae ejemplos dispersos y densos de una barra en tracción y de una placa con una entalla lateral, más un ejemplo disperso de flexión en tres puntos, con salida VTK y gráficos de tensión o de fuerza de reacción para comparar.',
    pt: 'Uma implementação educacional em Python, em um único arquivo, da fratura por campo de fase em duas dimensões com elementos quadriláteros lineares. Traz exemplos esparsos e densos de uma barra em tração e de uma placa com um entalhe lateral, além de um exemplo esparso de flexão em três pontos, com saída VTK e gráficos de tensão ou de força de reação para comparação.',
    hu: "Oktatási célú, egyetlen fájlból álló Python-implementáció a kétdimenziós fázismezős törésmechanikához, lineáris négyszögelemekkel. Ritka és sűrű mátrixos példát ad egy húzott rúdra és egy egyoldalt bemetszett lemezre, valamint ritka mátrixos hárompontos hajlítási példát, VTK-kimenettel és az összehasonlításhoz feszültség- vagy támaszerő-diagramokkal.",
  },
  'grossman-2026': {
    en: "Derives the elastic continuum of an arbitrary network of Hookean springs from its geometry and topology alone, with the nonaffine deformation of every triangle obtained from a linear system, and compares the resulting Poisson's ratios and Young's moduli with simulations of stretched strips of ordered triangular lattices, a honeycomb that turns re-entrant, and a foam-like disordered lattice that becomes auxetic.",
    es: 'Deduce el continuo elástico de una red arbitraria de resortes de Hooke solo a partir de su geometría y su topología, obteniendo la deformación no afín de cada triángulo de un sistema lineal, y compara los coeficientes de Poisson y los módulos de Young resultantes con simulaciones de franjas estiradas de redes triangulares ordenadas, de un panal de abeja que se vuelve reentrante y de una red desordenada tipo espuma que se vuelve auxética.',
    pt: 'Deduz o contínuo elástico de uma rede arbitrária de molas de Hooke apenas a partir de sua geometria e topologia, obtendo a deformação não afim de cada triângulo de um sistema linear, e compara os coeficientes de Poisson e os módulos de Young resultantes com simulações de faixas esticadas de redes triangulares ordenadas, de um favo de mel que se torna reentrante e de uma rede desordenada tipo espuma que se torna auxética.',
    hu: "Hooke-rugók tetszőleges hálózatának rugalmas kontinuumát kizárólag a geometriájából és topológiájából vezeti le, minden háromszög nem affin alakváltozását egy lineáris egyenletrendszerből kapja, és az így adódó Poisson-tényezőket és rugalmassági modulusokat összeveti rendezett háromszögrácsokból, egy visszahajló (re-entrant) alakúvá váló méhsejtrácsból és egy auxetikussá váló, habszerű rendezetlen rácsból kivágott, nyújtott sávok szimulációival.",
  },
  'andreassen-2011': {
    en: 'An educational successor to the 99-line topology optimization code adds density filtering and improves computational efficiency through preallocation and vectorization.',
    es: 'Un sucesor educativo del código de optimización topológica de 99 líneas que agrega el filtrado de densidades y mejora la eficiencia de cálculo con preasignación de memoria y vectorización.',
    pt: 'Um sucessor educacional do código de otimização topológica de 99 linhas que acrescenta a filtragem de densidades e melhora a eficiência computacional com pré-alocação de memória e vetorização.',
    hu: "A 99 soros topológiaoptimalizálási kód oktatási célú utódja, amely sűrűségszűréssel egészíti ki az eredetit, és előfoglalással és vektorizálással javítja a számítási hatékonyságot.",
  },
  'ferrari-2025': {
    en: "Uses Koiter's asymptotic post-buckling expansion in sizing and topology optimization of trusses and frames. Constraining the first two asymptotic coefficients (initial post-buckling slope and curvature) shapes the post-buckling response and lowers imperfection sensitivity, and the same expansion approximates the nonlinear response so that measures such as end-compliance can be optimized.",
    es: 'Usa la expansión asintótica de pospandeo de Koiter en la optimización de dimensiones y de topología de reticulados y pórticos. Restringir los dos primeros coeficientes asintóticos (pendiente y curvatura iniciales del pospandeo) da forma a la respuesta de pospandeo y reduce la sensibilidad a las imperfecciones, y la misma expansión aproxima la respuesta no lineal para poder optimizar medidas como la flexibilidad al final de la carga.',
    pt: 'Usa a expansão assintótica de pós-flambagem de Koiter na otimização de dimensões e de topologia de treliças e pórticos. Restringir os dois primeiros coeficientes assintóticos (inclinação e curvatura iniciais da pós-flambagem) molda a resposta de pós-flambagem e reduz a sensibilidade a imperfeições, e a mesma expansão aproxima a resposta não linear para que medidas como a flexibilidade ao final do carregamento possam ser otimizadas.',
    hu: "Koiter aszimptotikus posztkritikus sorfejtését alkalmazza rácsos tartók és keretek méret- és topológiaoptimalizálásában. Az első két aszimptotikus együttható (a posztkritikus ág kezdeti meredeksége és görbülete) korlátozása alakítja a posztkritikus viselkedést és csökkenti az imperfekcióérzékenységet, ugyanez a sorfejtés pedig közelíti a nemlineáris választ, így olyan mérőszámok is optimalizálhatók, mint a végső engedékenység.",
  },
  'feher-sipos-varkonyi-2026': {
    en: 'Proposes quasi-static shape control of structures whose equilibrium sets have a complex topology, and applies it to a strip bent into two rotary clamps under a fixed load, choosing actuator paths that stay on stable equilibria, including a path between two stable shapes without snap-through.',
    es: 'Propone el control cuasiestático de la forma de estructuras cuyos conjuntos de equilibrio tienen una topología compleja, y lo aplica a una lámina curvada entre dos mordazas rotativas bajo una carga fija, eligiendo caminos de los actuadores que se mantienen sobre equilibrios estables, entre ellos un camino entre dos formas estables sin salto.',
    pt: 'Propõe o controle quase estático da forma de estruturas cujos conjuntos de equilíbrio têm topologia complexa, e o aplica a uma lâmina curvada entre duas garras rotativas sob uma carga fixa, escolhendo caminhos dos atuadores que permanecem em equilíbrios estáveis, entre eles um caminho entre duas formas estáveis sem salto.',
    hu: "Kvázistatikus alakszabályozást javasol olyan szerkezetekre, amelyek egyensúlyi halmazai összetett topológiájúak, és ezt egy két forgatható befogás közé hajlított, rögzített teherrel terhelt szalagra alkalmazza: olyan beavatkozói pályákat választ, amelyek stabil egyensúlyi helyzeteken maradnak, köztük egy két stabil alak közötti, átpattanás nélküli pályát.",
  },
  'zmyslony-2026': {
    en: 'Elastica theory and photomechanical experiments on an arch whose preferred curvature varies along its length and in time. A shallow-arch theory projects the curvature pattern onto Euler buckling modes; overlap with the fundamental mode makes the arch snap, other patterns give a continuous switch to a higher mode. Patterns with the largest energy release and the lowest threshold are found, and the same control applies to passive pre-curved arches loaded at the boundaries.',
    es: 'Teoría de la elástica y experimentos fotomecánicos sobre un arco cuya curvatura preferida varía a lo largo de su longitud y en el tiempo. Una teoría de arco rebajado proyecta el patrón de curvatura sobre los modos de pandeo de Euler: la superposición con el modo fundamental hace que el arco salte, y otros patrones producen un cambio continuo a un modo superior. Se encuentran los patrones con la mayor liberación de energía y el menor umbral, y el mismo control se aplica a arcos pasivos precurvados cargados en los bordes.',
    pt: 'Teoria da elástica e experimentos fotomecânicos sobre um arco cuja curvatura preferida varia ao longo do comprimento e no tempo. Uma teoria de arco abatido projeta o padrão de curvatura sobre os modos de flambagem de Euler: a sobreposição com o modo fundamental faz o arco saltar, e outros padrões dão uma mudança contínua para um modo superior. São encontrados os padrões com a maior liberação de energia e o menor limiar, e o mesmo controle se aplica a arcos passivos pré-curvados carregados nas bordas.',
    hu: "Elasztikaelmélet és fotomechanikai kísérletek egy olyan ívre, amelynek előírt görbülete a hossza mentén és időben is változik. Egy lapos ívekre vonatkozó elmélet a görbületmintázatot az Euler-féle kihajlási alakokra vetíti; ha a mintázat átfed az alapalakkal, az ív átpattan, más mintázatok folytonos átmenetet adnak egy magasabb alakba. A szerzők megkeresik a legnagyobb energiafelszabadulást és a legalacsonyabb küszöböt adó mintázatokat, és ugyanez a szabályozás a peremeken terhelt, passzív, előre görbített ívekre is alkalmazható.",
  },
  'pastrana-2026': {
    en: 'The JAX FDM library computes equilibrium shapes of pin-jointed bar systems with the force density method and solves inverse design problems by tuning force densities, loads and support positions with gradient-based optimization against goals and constraints; written in JAX, so the simulation is differentiable and JIT-compiled.',
    es: 'La biblioteca JAX FDM calcula formas de equilibrio de sistemas de barras articuladas con el método de densidad de fuerzas y resuelve problemas de diseño inverso ajustando densidades de fuerza, cargas y posiciones de apoyos con optimización por gradiente frente a objetivos y restricciones; está escrita en JAX, por lo que la simulación es diferenciable y se compila JIT.',
    pt: 'A biblioteca JAX FDM calcula formas de equilíbrio de sistemas de barras articuladas com o método da densidade de forças e resolve problemas de projeto inverso ajustando densidades de força, cargas e posições de apoios com otimização por gradiente frente a objetivos e restrições; é escrita em JAX, de modo que a simulação é diferenciável e compilada JIT.',
    hu: "A JAX FDM könyvtár csuklós rúdrendszerek egyensúlyi alakját számítja az erősűrűség-módszerrel, és inverz tervezési feladatokat old meg: az erősűrűségeket, a terheket és a támaszok helyzetét gradiensalapú optimalizálással hangolja célokhoz és korlátokhoz. JAX-ban készült, így a szimuláció differenciálható és JIT-fordítású.",
  },
  'fairclough-2026': {
    en: 'The paper incorporates design-dependent self-weight into gridshell topology and geometry optimization using equal-stress catenaries and conic constraints. The first reproduction covers only the five-node square in Table 1 at normalized unit weight 1.65.',
    es: 'El artículo incorpora el peso propio dependiente del diseño en la optimización de topología y geometría de cáscaras reticuladas mediante catenarias de igual tensión y restricciones cónicas. La primera reproducción cubre solo el cuadrado de cinco nodos de la Tabla 1 con peso unitario normalizado 1.65.',
    pt: 'O artigo incorpora o peso próprio dependente do projeto na otimização de topologia e geometria de cascas reticuladas usando catenárias de igual tensão e restrições cônicas. A primeira reprodução cobre apenas o quadrado de cinco nós da Tabela 1 com peso unitário normalizado 1.65.',
    hu: "A cikk a tervezéstől függő önsúlyt beépíti a rácshéjak topológia- és geometriaoptimalizálásába, egyenlő feszültségű láncgörbék és kúpos korlátok segítségével. Az első reprodukció csak az 1. táblázat ötcsomópontos négyzetét fedi le, 1,65 normalizált fajlagos súly mellett.",
  },
  'macneal-harder-1985': {
    en: 'Proposes patch tests and beam, plate and shell problems for assessing finite element accuracy. Applications to quadrilateral plate and solid brick elements illustrate sensitivity to important accuracy parameters.',
    es: 'Propone ensayos de parcela y problemas de vigas, placas y cáscaras para evaluar la precisión de los elementos finitos. Las aplicaciones a elementos de placa cuadriláteros y a elementos sólidos hexaédricos ilustran la sensibilidad a parámetros importantes de precisión.',
    pt: 'Propõe testes de patch e problemas de vigas, placas e cascas para avaliar a precisão de elementos finitos. As aplicações a elementos de placa quadriláteros e a elementos sólidos hexaédricos ilustram a sensibilidade a parâmetros importantes de precisão.',
    hu: "Foltpróbákat (patch test), valamint gerenda-, lemez- és héjfeladatokat javasol a végeselemek pontosságának értékelésére. A négyszögletes lemezelemekre és téglatest alakú térbeli elemekre vonatkozó alkalmazások a fontos pontossági paraméterekre való érzékenységet szemléltetik.",
  },
  'cqc-1981': {
    en: 'Proposes complete quadratic combination to reduce modal-combination errors in response-spectrum analysis; the method approaches SRSS for well-separated natural frequencies.',
    es: 'Propone la combinación cuadrática completa para reducir los errores de combinación modal en el análisis por espectro de respuesta; el método se aproxima a SRSS cuando las frecuencias naturales están bien separadas.',
    pt: 'Propõe a combinação quadrática completa para reduzir os erros de combinação modal na análise por espectro de resposta; o método se aproxima da SRSS quando as frequências naturais estão bem separadas.',
    hu: "A teljes négyzetes kombinációt (CQC) javasolja a modális kombináció hibáinak csökkentésére a válaszspektrum-analízisben; jól elkülönülő sajátfrekvenciák esetén a módszer az SRSS-hez közelít.",
  },

};

/** A catalogue summary in `locale`, or the papers.yaml text when it has no translation there. */
export function summaryIn(paper: { id: string; summary?: string | null }, locale: string): string {
  const own = SUMMARIES[paper.id];
  if (own && own.en === paper.summary && (locale === 'es' || locale === 'pt' || locale === 'hu')) return own[locale];
  return paper.summary ?? '';
}
