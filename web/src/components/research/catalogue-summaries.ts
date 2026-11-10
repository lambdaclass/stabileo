type Summary = { en: string; es: string; pt: string; hu: string };

export const CATALOGUE_SUMMARIES: Record<string, Summary> = {
  'feher-2026': {
    en: 'Studies how symmetric cuts change the stability of an initially flat strip bent between vertical clamps and loaded at its midpoint, using a variable-stiffness elastica model.',
    es: 'Estudia cómo los cortes simétricos modifican la estabilidad de una lámina inicialmente plana, curvada entre mordazas verticales y cargada en su punto medio, mediante un modelo de elástica con rigidez a flexión variable.',
    pt: 'Estuda como os cortes simétricos alteram a estabilidade de uma lâmina inicialmente plana, curvada entre garras verticais e carregada em seu ponto médio, por meio de um modelo de elástica com rigidez à flexão variável.',
  },
  'gilbert-2003': {
    en: 'Ground-structure layout optimization of trusses is limited by the number of potential members. The paper presents an iterative member-adding method, built on linear-programming column generation, that starts from a sparsely connected ground structure and adds members as needed until the provably optimal layout is reached, handling problems with very large numbers of potential members.',
    es: 'La optimización de la disposición de reticulados por estructura base está limitada por la cantidad de barras potenciales. El artículo presenta un método iterativo que agrega barras, basado en la generación de columnas de la programación lineal, que parte de una estructura base poco conectada y agrega barras según hace falta hasta alcanzar la disposición demostrablemente óptima, lo que permite resolver problemas con cantidades muy grandes de barras potenciales.',
    pt: 'A otimização do arranjo de treliças por estrutura base é limitada pelo número de barras potenciais. O artigo apresenta um método iterativo que acrescenta barras, baseado na geração de colunas da programação linear, que parte de uma estrutura base pouco conectada e acrescenta barras conforme necessário até alcançar o arranjo comprovadamente ótimo, tratando problemas com números muito grandes de barras potenciais.',
    hu: "A rácsos tartók alapszerkezetes (ground structure) elrendezés-optimalizálását a lehetséges rudak száma korlátozza. A cikk lineáris programozási oszlopgeneráláson alapuló iteratív, rudakat hozzáadó módszert mutat be, amely ritkán összekötött alapszerkezetből indul, és szükség szerint ad hozzá rudakat, amíg el nem éri a bizonyíthatóan optimális elrendezést; így igen sok lehetséges rudat tartalmazó feladatokat is kezel.",
  },
  'zheng-2014': {
    en: 'Octet-truss microlattices made by projection microstereolithography from polymers, metals and ceramics. Because their struts carry load axially instead of bending, the materials are very stiff and strong for their low density.',
    es: 'Microrredes de reticulado octeto fabricadas por microestereolitografía de proyección en polímeros, metales y cerámicas. Como sus barras trabajan axialmente en lugar de a flexión, los materiales son muy rígidos y resistentes para su baja densidad.',
    pt: 'Microrredes de treliça octeto fabricadas por microestereolitografia de projeção em polímeros, metais e cerâmicas. Como suas barras trabalham axialmente em vez de à flexão, os materiais são muito rígidos e resistentes para sua baixa densidade.',
    hu: "Projekciós mikrosztereolitográfiával polimerekből, fémekből és kerámiákból készült oktett-rácsos mikrorácsok. Mivel rúdjaik hajlítás helyett normálerővel viselik a terhet, az anyagok kis sűrűségükhöz képest igen merevek és szilárdak.",
  },
  'hrennikoff-1941': {
    en: 'Approximates an elastic continuum by a patterned framework of bars with suitable elastic properties. The approach covers several stress and bending problems and is illustrated with examples.',
    es: 'Aproxima un continuo elástico con un entramado regular de barras de propiedades elásticas adecuadas. El enfoque abarca varios problemas de tensiones y de flexión y se ilustra con ejemplos.',
    pt: 'Aproxima um contínuo elástico por uma malha regular de barras com propriedades elásticas adequadas. A abordagem cobre vários problemas de tensões e de flexão e é ilustrada com exemplos.',
    hu: "A rugalmas kontinuumot megfelelő rugalmas tulajdonságú rudakból álló, szabályos mintázatú rácsszerkezettel közelíti. A módszer több feszültségi és hajlítási feladatot lefed, és példákkal szemlélteti.",
  },
  'wilson-1981': {
    en: 'Introduces complete quadratic combination for seismic modal maxima. In the examples studied it reduces modal-combination errors, and it approaches SRSS when natural frequencies are well separated.',
    es: 'Introduce la combinación cuadrática completa para los máximos modales sísmicos. En los ejemplos estudiados reduce los errores de combinación modal y se aproxima a SRSS cuando las frecuencias naturales están bien separadas.',
    pt: 'Introduz a combinação quadrática completa para os máximos modais sísmicos. Nos exemplos estudados reduz os erros de combinação modal e se aproxima da SRSS quando as frequências naturais estão bem separadas.',
    hu: "Bevezeti a teljes négyzetes kombinációt a földrengési modális maximumokra. A vizsgált példákban csökkenti a modális kombináció hibáit, és jól elkülönülő sajátfrekvenciák esetén az SRSS-hez közelít.",
  },
  'bathe-dvorkin-1986': {
    en: 'Discusses practical requirements for general shell elements, explains a four-node mixed-interpolation formulation and introduces an eight-node element using the same approach.',
    es: 'Discute los requisitos prácticos de los elementos de cáscara generales, explica una formulación de interpolación mixta de cuatro nodos y presenta un elemento de ocho nodos con el mismo enfoque.',
    pt: 'Discute os requisitos práticos de elementos de casca gerais, explica uma formulação de interpolação mista de quatro nós e apresenta um elemento de oito nós com a mesma abordagem.',
    hu: "Tárgyalja az általános héjelemekkel szemben támasztott gyakorlati követelményeket, ismertet egy négycsomópontos, vegyes interpolációs formulációt, és ugyanezzel a megközelítéssel bevezet egy nyolccsomópontos elemet.",
  },
  'zienkiewicz-zhu-1987': {
    en: 'Presents an inexpensive estimator of global energy-norm and local finite element errors. The estimates guide adaptive refinement or mesh redesign to reach a chosen accuracy.',
    es: 'Presenta un estimador económico del error global en norma de energía y de los errores locales de elementos finitos. Las estimaciones guían el refinamiento adaptativo o el rediseño de la malla para alcanzar una precisión elegida.',
    pt: 'Apresenta um estimador econômico do erro global em norma de energia e dos erros locais de elementos finitos. As estimativas orientam o refinamento adaptativo ou o redesenho da malha para alcançar uma precisão escolhida.',
    hu: "Olcsó becslőt mutat be a globális energianormabeli és a lokális végeselemes hibákra. A becslések az adaptív finomítást vagy a háló újratervezését irányítják a választott pontosság eléréséig.",
  },
  'bathe-dvorkin-1985': {
    en: 'Derives a four-node linear elastic plate bending element as a special case of a general shell formulation and uses example solutions to assess its predictions.',
    es: 'Deduce un elemento de placa a flexión elástico lineal de cuatro nodos como caso particular de una formulación general de cáscaras y usa soluciones de ejemplo para evaluar sus predicciones.',
    pt: 'Deduz um elemento de placa à flexão elástico linear de quatro nós como caso particular de uma formulação geral de cascas e usa soluções de exemplo para avaliar suas previsões.',
    hu: "Négycsomópontos, lineárisan rugalmas lemezhajlítási elemet vezet le egy általános héjformuláció speciális eseteként, és mintapéldák megoldásaival értékeli az előrejelzéseit.",
  },
  'batoz-1980': {
    en: 'Compares three-node triangular plate bending elements with nine displacement degrees of freedom. Theoretical and numerical assessments favour the discrete Kirchhoff and hybrid-stress formulations among the alternatives examined.',
    es: 'Compara elementos triangulares de placa a flexión de tres nodos con nueve grados de libertad de desplazamiento. Las evaluaciones teóricas y numéricas favorecen, entre las alternativas examinadas, las formulaciones de Kirchhoff discreto y de tensiones híbridas.',
    pt: 'Compara elementos triangulares de placa à flexão de três nós com nove graus de liberdade de deslocamento. As avaliações teóricas e numéricas favorecem, entre as alternativas examinadas, as formulações de Kirchhoff discreto e de tensões híbridas.',
    hu: "Kilenc elmozdulási szabadságfokú, háromcsomópontos háromszög lemezhajlítási elemeket hasonlít össze. Az elméleti és numerikus értékelések a vizsgált változatok közül a diszkrét Kirchhoff- és a hibrid feszültségi formulációt részesítik előnyben.",
  },
  'bucalem-1993': {
    en: 'Presents nine-node and sixteen-node MITC shell elements that tie interpolated covariant membrane and shear strains to the displacement field. Numerical tests assess their predictive performance.',
    es: 'Presenta elementos de cáscara MITC de nueve y dieciséis nodos que vinculan las deformaciones covariantes interpoladas de membrana y de corte con el campo de desplazamientos. Ensayos numéricos evalúan su capacidad predictiva.',
    pt: 'Apresenta elementos de casca MITC de nove e dezesseis nós que vinculam as deformações covariantes interpoladas de membrana e de cisalhamento ao campo de deslocamentos. Testes numéricos avaliam seu desempenho preditivo.',
    hu: "Kilenc- és tizenhat csomópontos MITC héjelemeket mutat be, amelyek az interpolált kovariáns membrán- és nyírási alakváltozásokat az elmozdulásmezőhöz kötik. Numerikus tesztek értékelik az előrejelző képességüket.",
  },
  'chapelle-1998': {
    en: 'Explains how geometry and boundary conditions determine whether a thin shell is dominated by membrane action or bending. Proposes test cases for evaluating convergence and its dependence on shell thickness.',
    es: 'Explica cómo la geometría y las condiciones de borde determinan si en una cáscara delgada domina la acción de membrana o la flexión. Propone casos de prueba para evaluar la convergencia y su dependencia del espesor de la cáscara.',
    pt: 'Explica como a geometria e as condições de contorno determinam se em uma casca fina domina a ação de membrana ou a flexão. Propõe casos de teste para avaliar a convergência e sua dependência da espessura da casca.',
    hu: "Elmagyarázza, hogyan határozza meg a geometria és a peremfeltételek, hogy egy vékony héjban a membránhatás vagy a hajlítás dominál. Tesztfeladatokat javasol a konvergencia és annak héjvastagságtól való függésének értékelésére.",
  },
  'zupan-2004': {
    en: 'Compares three interpretations of an initially twisted beam with different twist distributions and cross-sections. The numerical results identify the MacNeal-Harder reference as a linearly twisted beam with curved edges.',
    es: 'Compara tres interpretaciones de una viga inicialmente torcida con distintas distribuciones de torsión y secciones transversales. Los resultados numéricos identifican la referencia de MacNeal-Harder como una viga con torsión lineal y bordes curvos.',
    pt: 'Compara três interpretações de uma viga inicialmente torcida com diferentes distribuições de torção e seções transversais. Os resultados numéricos identificam a referência de MacNeal-Harder como uma viga com torção linear e bordas curvas.',
    hu: "Egy kezdetben csavart gerenda három értelmezését hasonlítja össze különböző csavarodáseloszlásokkal és keresztmetszetekkel. A numerikus eredmények szerint a MacNeal–Harder-referencia görbült élű, lineárisan csavart gerenda.",
  },
  'bathe-2000': {
    en: 'Evaluates MITC shell elements on selected test problems using fundamental shell-analysis criteria. The reported results support their use for general engineering applications.',
    es: 'Evalúa elementos de cáscara MITC en problemas de prueba seleccionados con criterios fundamentales del análisis de cáscaras. Los resultados informados respaldan su uso en aplicaciones generales de ingeniería.',
    pt: 'Avalia elementos de casca MITC em problemas de teste selecionados com critérios fundamentais da análise de cascas. Os resultados relatados apoiam seu uso em aplicações gerais de engenharia.',
    hu: "MITC héjelemeket értékel kiválasztott tesztfeladatokon, a héjanalízis alapvető kritériumai szerint. A közölt eredmények alátámasztják általános mérnöki alkalmazásukat.",
  },
};

export function summaryIn(paper: { id: string; summary?: string | null }, locale: string): string {
  const own = CATALOGUE_SUMMARIES[paper.id];
  if (own && own.en === paper.summary && (locale === 'es' || locale === 'pt' || locale === 'hu')) return own[locale];
  return paper.summary ?? '';
}
