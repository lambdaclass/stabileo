type Summary = { en: string; es: string; pt: string };

/** `en` is the papers.yaml summary each translation was made from; a test fails when they differ. */
export const SUMMARIES: Record<string, Summary> = {
  'shauer-2025': {
    en: 'An educational single-file Python implementation of two-dimensional phase-field fracture with linear quadrilateral elements. It provides sparse and dense examples of a bar in tension and a single-edge notched plate, plus a sparse three-point bending example, with VTK output and stress or reaction-force plots for comparison.',
    es: 'Una implementación educativa en Python, en un solo archivo, de la fractura por campo de fase en dos dimensiones con elementos cuadriláteros lineales. Trae ejemplos dispersos y densos de una barra en tracción y de una placa con una entalla lateral, más un ejemplo disperso de flexión en tres puntos, con salida VTK y gráficos de tensión o de fuerza de reacción para comparar.',
    pt: 'Uma implementação educacional em Python, em um único arquivo, da fratura por campo de fase em duas dimensões com elementos quadriláteros lineares. Traz exemplos esparsos e densos de uma barra em tração e de uma placa com um entalhe lateral, além de um exemplo esparso de flexão em três pontos, com saída VTK e gráficos de tensão ou de força de reação para comparação.',
  },
  'grossman-2026': {
    en: "Derives the elastic continuum of an arbitrary network of Hookean springs from its geometry and topology alone, with the nonaffine deformation of every triangle obtained from a linear system, and compares the resulting Poisson's ratios and Young's moduli with simulations of stretched strips of ordered triangular lattices, a honeycomb that turns re-entrant, and a foam-like disordered lattice that becomes auxetic.",
    es: 'Deduce el continuo elástico de una red arbitraria de resortes de Hooke solo a partir de su geometría y su topología, obteniendo la deformación no afín de cada triángulo de un sistema lineal, y compara los coeficientes de Poisson y los módulos de Young resultantes con simulaciones de franjas estiradas de redes triangulares ordenadas, de un panal de abeja que se vuelve reentrante y de una red desordenada tipo espuma que se vuelve auxética.',
    pt: 'Deduz o contínuo elástico de uma rede arbitrária de molas de Hooke apenas a partir de sua geometria e topologia, obtendo a deformação não afim de cada triângulo de um sistema linear, e compara os coeficientes de Poisson e os módulos de Young resultantes com simulações de faixas esticadas de redes triangulares ordenadas, de um favo de mel que se torna reentrante e de uma rede desordenada tipo espuma que se torna auxética.',
  },
  'andreassen-2011': {
    en: 'An educational successor to the 99-line topology optimization code adds density filtering and improves computational efficiency through preallocation and vectorization.',
    es: 'Un sucesor educativo del código de optimización topológica de 99 líneas que agrega el filtrado de densidades y mejora la eficiencia de cálculo con preasignación de memoria y vectorización.',
    pt: 'Um sucessor educacional do código de otimização topológica de 99 linhas que acrescenta a filtragem de densidades e melhora a eficiência computacional com pré-alocação de memória e vetorização.',
  },
  'ferrari-2025': {
    en: "Uses Koiter's asymptotic post-buckling expansion in sizing and topology optimization of trusses and frames. Constraining the first two asymptotic coefficients (initial post-buckling slope and curvature) shapes the post-buckling response and lowers imperfection sensitivity, and the same expansion approximates the nonlinear response so that measures such as end-compliance can be optimized.",
    es: 'Usa la expansión asintótica de pospandeo de Koiter en la optimización de dimensiones y de topología de reticulados y pórticos. Restringir los dos primeros coeficientes asintóticos (pendiente y curvatura iniciales del pospandeo) da forma a la respuesta de pospandeo y reduce la sensibilidad a las imperfecciones, y la misma expansión aproxima la respuesta no lineal para poder optimizar medidas como la flexibilidad al final de la carga.',
    pt: 'Usa a expansão assintótica de pós-flambagem de Koiter na otimização de dimensões e de topologia de treliças e pórticos. Restringir os dois primeiros coeficientes assintóticos (inclinação e curvatura iniciais da pós-flambagem) molda a resposta de pós-flambagem e reduz a sensibilidade a imperfeições, e a mesma expansão aproxima a resposta não linear para que medidas como a flexibilidade ao final do carregamento possam ser otimizadas.',
  },
  'zmyslony-2026': {
    en: 'Elastica theory and photomechanical experiments on an arch whose preferred curvature varies along its length and in time. A shallow-arch theory projects the curvature pattern onto Euler buckling modes; overlap with the fundamental mode makes the arch snap, other patterns give a continuous switch to a higher mode. Patterns with the largest energy release and the lowest threshold are found, and the same control applies to passive pre-curved arches loaded at the boundaries.',
    es: 'Teoría de la elástica y experimentos fotomecánicos sobre un arco cuya curvatura preferida varía a lo largo de su longitud y en el tiempo. Una teoría de arco rebajado proyecta el patrón de curvatura sobre los modos de pandeo de Euler: la superposición con el modo fundamental hace que el arco salte, y otros patrones producen un cambio continuo a un modo superior. Se encuentran los patrones con la mayor liberación de energía y el menor umbral, y el mismo control se aplica a arcos pasivos precurvados cargados en los bordes.',
    pt: 'Teoria da elástica e experimentos fotomecânicos sobre um arco cuja curvatura preferida varia ao longo do comprimento e no tempo. Uma teoria de arco abatido projeta o padrão de curvatura sobre os modos de flambagem de Euler: a sobreposição com o modo fundamental faz o arco saltar, e outros padrões dão uma mudança contínua para um modo superior. São encontrados os padrões com a maior liberação de energia e o menor limiar, e o mesmo controle se aplica a arcos passivos pré-curvados carregados nas bordas.',
  },
  'pastrana-2026': {
    en: 'The JAX FDM library computes equilibrium shapes of pin-jointed bar systems with the force density method and solves inverse design problems by tuning force densities, loads and support positions with gradient-based optimization against goals and constraints; written in JAX, so the simulation is differentiable and JIT-compiled.',
    es: 'La biblioteca JAX FDM calcula formas de equilibrio de sistemas de barras articuladas con el método de densidad de fuerzas y resuelve problemas de diseño inverso ajustando densidades de fuerza, cargas y posiciones de apoyos con optimización por gradiente frente a objetivos y restricciones; está escrita en JAX, por lo que la simulación es diferenciable y se compila JIT.',
    pt: 'A biblioteca JAX FDM calcula formas de equilíbrio de sistemas de barras articuladas com o método da densidade de forças e resolve problemas de projeto inverso ajustando densidades de força, cargas e posições de apoios com otimização por gradiente frente a objetivos e restrições; é escrita em JAX, de modo que a simulação é diferenciável e compilada JIT.',
  },
  'fairclough-2026': {
    en: 'The paper incorporates design-dependent self-weight into gridshell topology and geometry optimization using equal-stress catenaries and conic constraints. The first reproduction covers only the five-node square in Table 1 at normalized unit weight 1.65.',
    es: 'El artículo incorpora el peso propio dependiente del diseño en la optimización de topología y geometría de cáscaras reticuladas mediante catenarias de igual tensión y restricciones cónicas. La primera reproducción cubre solo el cuadrado de cinco nodos de la Tabla 1 con peso unitario normalizado 1.65.',
    pt: 'O artigo incorpora o peso próprio dependente do projeto na otimização de topologia e geometria de cascas reticuladas usando catenárias de igual tensão e restrições cônicas. A primeira reprodução cobre apenas o quadrado de cinco nós da Tabela 1 com peso unitário normalizado 1.65.',
  },
  'gilbert-2003': {
    en: 'Ground-structure layout optimization of trusses is limited by the number of potential members. The paper presents an iterative member-adding method, built on linear-programming column generation, that starts from a sparsely connected ground structure and adds members as needed until the provably optimal layout is reached, handling problems with very large numbers of potential members.',
    es: 'La optimización de la disposición de reticulados por estructura base está limitada por la cantidad de barras potenciales. El artículo presenta un método iterativo que agrega barras, basado en la generación de columnas de la programación lineal, que parte de una estructura base poco conectada y agrega barras según hace falta hasta alcanzar la disposición demostrablemente óptima, lo que permite resolver problemas con cantidades muy grandes de barras potenciales.',
    pt: 'A otimização do arranjo de treliças por estrutura base é limitada pelo número de barras potenciais. O artigo apresenta um método iterativo que acrescenta barras, baseado na geração de colunas da programação linear, que parte de uma estrutura base pouco conectada e acrescenta barras conforme necessário até alcançar o arranjo comprovadamente ótimo, tratando problemas com números muito grandes de barras potenciais.',
  },
  'zheng-2014': {
    en: 'Octet-truss microlattices made by projection microstereolithography from polymers, metals and ceramics. Because their struts carry load axially instead of bending, the materials are very stiff and strong for their low density.',
    es: 'Microrredes de reticulado octeto fabricadas por microestereolitografía de proyección en polímeros, metales y cerámicas. Como sus barras trabajan axialmente en lugar de a flexión, los materiales son muy rígidos y resistentes para su baja densidad.',
    pt: 'Microrredes de treliça octeto fabricadas por microestereolitografia de projeção em polímeros, metais e cerâmicas. Como suas barras trabalham axialmente em vez de à flexão, os materiais são muito rígidos e resistentes para sua baixa densidade.',
  },
  'macneal-harder-1985': {
    en: 'Proposes patch tests and beam, plate and shell problems for assessing finite element accuracy. Applications to quadrilateral plate and solid brick elements illustrate sensitivity to important accuracy parameters.',
    es: 'Propone ensayos de parcela y problemas de vigas, placas y cáscaras para evaluar la precisión de los elementos finitos. Las aplicaciones a elementos de placa cuadriláteros y a elementos sólidos hexaédricos ilustran la sensibilidad a parámetros importantes de precisión.',
    pt: 'Propõe testes de patch e problemas de vigas, placas e cascas para avaliar a precisão de elementos finitos. As aplicações a elementos de placa quadriláteros e a elementos sólidos hexaédricos ilustram a sensibilidade a parâmetros importantes de precisão.',
  },
  'cqc-1981': {
    en: 'Proposes complete quadratic combination to reduce modal-combination errors in response-spectrum analysis; the method approaches SRSS for well-separated natural frequencies.',
    es: 'Propone la combinación cuadrática completa para reducir los errores de combinación modal en el análisis por espectro de respuesta; el método se aproxima a SRSS cuando las frecuencias naturales están bien separadas.',
    pt: 'Propõe a combinação quadrática completa para reduzir os erros de combinação modal na análise por espectro de resposta; o método se aproxima da SRSS quando as frequências naturais estão bem separadas.',
  },
  'hrennikoff-1941': {
    en: 'Approximates an elastic continuum by a patterned framework of bars with suitable elastic properties. The approach covers several stress and bending problems and is illustrated with examples.',
    es: 'Aproxima un continuo elástico con un entramado regular de barras de propiedades elásticas adecuadas. El enfoque abarca varios problemas de tensiones y de flexión y se ilustra con ejemplos.',
    pt: 'Aproxima um contínuo elástico por uma malha regular de barras com propriedades elásticas adequadas. A abordagem cobre vários problemas de tensões e de flexão e é ilustrada com exemplos.',
  },
  'wilson-1981': {
    en: 'Introduces complete quadratic combination for seismic modal maxima. In the examples studied it reduces modal-combination errors, and it approaches SRSS when natural frequencies are well separated.',
    es: 'Introduce la combinación cuadrática completa para los máximos modales sísmicos. En los ejemplos estudiados reduce los errores de combinación modal y se aproxima a SRSS cuando las frecuencias naturales están bien separadas.',
    pt: 'Introduz a combinação quadrática completa para os máximos modais sísmicos. Nos exemplos estudados reduz os erros de combinação modal e se aproxima da SRSS quando as frequências naturais estão bem separadas.',
  },
  'bathe-dvorkin-1986': {
    en: 'Discusses practical requirements for general shell elements, explains a four-node mixed-interpolation formulation and introduces an eight-node element using the same approach.',
    es: 'Discute los requisitos prácticos de los elementos de cáscara generales, explica una formulación de interpolación mixta de cuatro nodos y presenta un elemento de ocho nodos con el mismo enfoque.',
    pt: 'Discute os requisitos práticos de elementos de casca gerais, explica uma formulação de interpolação mista de quatro nós e apresenta um elemento de oito nós com a mesma abordagem.',
  },
  'zienkiewicz-zhu-1987': {
    en: 'Presents an inexpensive estimator of global energy-norm and local finite element errors. The estimates guide adaptive refinement or mesh redesign to reach a chosen accuracy.',
    es: 'Presenta un estimador económico del error global en norma de energía y de los errores locales de elementos finitos. Las estimaciones guían el refinamiento adaptativo o el rediseño de la malla para alcanzar una precisión elegida.',
    pt: 'Apresenta um estimador econômico do erro global em norma de energia e dos erros locais de elementos finitos. As estimativas orientam o refinamento adaptativo ou o redesenho da malha para alcançar uma precisão escolhida.',
  },
  'bathe-dvorkin-1985': {
    en: 'Derives a four-node linear elastic plate bending element as a special case of a general shell formulation and uses example solutions to assess its predictions.',
    es: 'Deduce un elemento de placa a flexión elástico lineal de cuatro nodos como caso particular de una formulación general de cáscaras y usa soluciones de ejemplo para evaluar sus predicciones.',
    pt: 'Deduz um elemento de placa à flexão elástico linear de quatro nós como caso particular de uma formulação geral de cascas e usa soluções de exemplo para avaliar suas previsões.',
  },
  'batoz-1980': {
    en: 'Compares three-node triangular plate bending elements with nine displacement degrees of freedom. Theoretical and numerical assessments favour the discrete Kirchhoff and hybrid-stress formulations among the alternatives examined.',
    es: 'Compara elementos triangulares de placa a flexión de tres nodos con nueve grados de libertad de desplazamiento. Las evaluaciones teóricas y numéricas favorecen, entre las alternativas examinadas, las formulaciones de Kirchhoff discreto y de tensiones híbridas.',
    pt: 'Compara elementos triangulares de placa à flexão de três nós com nove graus de liberdade de deslocamento. As avaliações teóricas e numéricas favorecem, entre as alternativas examinadas, as formulações de Kirchhoff discreto e de tensões híbridas.',
  },
  'bucalem-1993': {
    en: 'Presents nine-node and sixteen-node MITC shell elements that tie interpolated covariant membrane and shear strains to the displacement field. Numerical tests assess their predictive performance.',
    es: 'Presenta elementos de cáscara MITC de nueve y dieciséis nodos que vinculan las deformaciones covariantes interpoladas de membrana y de corte con el campo de desplazamientos. Ensayos numéricos evalúan su capacidad predictiva.',
    pt: 'Apresenta elementos de casca MITC de nove e dezesseis nós que vinculam as deformações covariantes interpoladas de membrana e de cisalhamento ao campo de deslocamentos. Testes numéricos avaliam seu desempenho preditivo.',
  },
  'chapelle-1998': {
    en: 'Explains how geometry and boundary conditions determine whether a thin shell is dominated by membrane action or bending. Proposes test cases for evaluating convergence and its dependence on shell thickness.',
    es: 'Explica cómo la geometría y las condiciones de borde determinan si en una cáscara delgada domina la acción de membrana o la flexión. Propone casos de prueba para evaluar la convergencia y su dependencia del espesor de la cáscara.',
    pt: 'Explica como a geometria e as condições de contorno determinam se em uma casca fina domina a ação de membrana ou a flexão. Propõe casos de teste para avaliar a convergência e sua dependência da espessura da casca.',
  },
  'zupan-2004': {
    en: 'Compares three interpretations of an initially twisted beam with different twist distributions and cross-sections. The numerical results identify the MacNeal-Harder reference as a linearly twisted beam with curved edges.',
    es: 'Compara tres interpretaciones de una viga inicialmente torcida con distintas distribuciones de torsión y secciones transversales. Los resultados numéricos identifican la referencia de MacNeal-Harder como una viga con torsión lineal y bordes curvos.',
    pt: 'Compara três interpretações de uma viga inicialmente torcida com diferentes distribuições de torção e seções transversais. Os resultados numéricos identificam a referência de MacNeal-Harder como uma viga com torção linear e bordas curvas.',
  },
  'bathe-2000': {
    en: 'Evaluates MITC shell elements on selected test problems using fundamental shell-analysis criteria. The reported results support their use for general engineering applications.',
    es: 'Evalúa elementos de cáscara MITC en problemas de prueba seleccionados con criterios fundamentales del análisis de cáscaras. Los resultados informados respaldan su uso en aplicaciones generales de ingeniería.',
    pt: 'Avalia elementos de casca MITC em problemas de teste selecionados com critérios fundamentais da análise de cascas. Os resultados relatados apoiam seu uso em aplicações gerais de engenharia.',
  },
};

/** A catalogue summary in `locale`, or the papers.yaml text when it has no translation there. */
export function summaryIn(paper: { id: string; summary?: string | null }, locale: string): string {
  const own = SUMMARIES[paper.id];
  if (own && own.en === paper.summary && (locale === 'es' || locale === 'pt')) return own[locale];
  return paper.summary ?? '';
}
