type Summary = { en: string; es: string; pt: string; hu: string; it: string; zh: string };

export const CATALOGUE_SUMMARIES: Record<string, Summary> = {
  'feher-2026': {
    en: 'Studies how symmetric cuts change the stability of an initially flat strip bent between vertical clamps and loaded at its midpoint, using a variable-stiffness elastica model.',
    es: 'Estudia cómo los cortes simétricos modifican la estabilidad de una lámina inicialmente plana, curvada entre mordazas verticales y cargada en su punto medio, mediante un modelo de elástica con rigidez a flexión variable.',
    pt: 'Estuda como os cortes simétricos alteram a estabilidade de uma lâmina inicialmente plana, curvada entre garras verticais e carregada em seu ponto médio, por meio de um modelo de elástica com rigidez à flexão variável.',
    hu: 'Azt vizsgálja, hogyan változtatják meg a szimmetrikus bevágások egy kezdetben sík, függőleges befogások között meghajlított és a közepén terhelt csík stabilitását, változó hajlítási merevségű elasztikamodell segítségével.',
    it: 'Studia come i tagli simmetrici cambiano la stabilità di una striscia inizialmente piatta, piegata tra morsetti verticali e caricata a metà, con un modello di elastica a rigidezza variabile.',
    zh: "研究对称切口如何改变一条初始为平直、在竖向夹具之间弯曲并在跨中受荷的窄板条的稳定性，采用变刚度弹性曲线（elastica）模型。",
  },
  'gilbert-2003': {
    en: 'Ground-structure layout optimization of trusses is limited by the number of potential members. The paper presents an iterative member-adding method, built on linear-programming column generation, that starts from a sparsely connected ground structure and adds members as needed until the provably optimal layout is reached, handling problems with very large numbers of potential members.',
    es: 'La optimización de la disposición de reticulados por estructura base está limitada por la cantidad de barras potenciales. El artículo presenta un método iterativo que agrega barras, basado en la generación de columnas de la programación lineal, que parte de una estructura base poco conectada y agrega barras según hace falta hasta alcanzar la disposición demostrablemente óptima, lo que permite resolver problemas con cantidades muy grandes de barras potenciales.',
    pt: 'A otimização do arranjo de treliças por estrutura base é limitada pelo número de barras potenciais. O artigo apresenta um método iterativo que acrescenta barras, baseado na geração de colunas da programação linear, que parte de uma estrutura base pouco conectada e acrescenta barras conforme necessário até alcançar o arranjo comprovadamente ótimo, tratando problemas com números muito grandes de barras potenciais.',
    hu: "A rácsos tartók alapszerkezetes (ground structure) elrendezés-optimalizálását a lehetséges rudak száma korlátozza. A cikk lineáris programozási oszlopgeneráláson alapuló iteratív, rudakat hozzáadó módszert mutat be, amely ritkán összekötött alapszerkezetből indul, és szükség szerint ad hozzá rudakat, amíg el nem éri a bizonyíthatóan optimális elrendezést; így igen sok lehetséges rudat tartalmazó feladatokat is kezel.",
    it: 'L’ottimizzazione del layout di strutture reticolari a partire da una ground structure è limitata dal numero di aste potenziali. L’articolo presenta un metodo iterativo di aggiunta di aste, basato sulla generazione di colonne della programmazione lineare, che parte da una ground structure poco connessa e aggiunge aste secondo necessità finché si raggiunge il layout ottimo dimostrabile, trattando problemi con numeri molto grandi di aste potenziali.',
    zh: "桁架的基结构（ground structure）布局优化受限于潜在杆件的数量。该论文提出一种基于线性规划列生成的迭代加杆方法：从稀疏连接的基结构出发，按需逐步加入杆件，直至得到可证明的最优布局，能够处理潜在杆件数量极大的问题。",
  },
  'zheng-2014': {
    en: 'Octet-truss microlattices made by projection microstereolithography from polymers, metals and ceramics. Because their struts carry load axially instead of bending, the materials are very stiff and strong for their low density.',
    es: 'Microrredes de reticulado octeto fabricadas por microestereolitografía de proyección en polímeros, metales y cerámicas. Como sus barras trabajan axialmente en lugar de a flexión, los materiales son muy rígidos y resistentes para su baja densidad.',
    pt: 'Microrredes de treliça octeto fabricadas por microestereolitografia de projeção em polímeros, metais e cerâmicas. Como suas barras trabalham axialmente em vez de à flexão, os materiais são muito rígidos e resistentes para sua baixa densidade.',
    hu: "Projekciós mikrosztereolitográfiával polimerekből, fémekből és kerámiákból készült oktett-rácsos mikrorácsok. Mivel rúdjaik hajlítás helyett normálerővel viselik a terhet, az anyagok kis sűrűségükhöz képest igen merevek és szilárdak.",
    it: 'Microreticoli a travatura ottaedrica realizzati con microstereolitografia a proiezione da polimeri, metalli e ceramiche. Poiché i loro puntoni portano il carico assialmente invece che a flessione, i materiali sono molto rigidi e resistenti rispetto alla loro bassa densità.',
    zh: "采用投影微立体光刻技术，以聚合物、金属和陶瓷制成的八面体桁架（octet-truss）微点阵。由于杆件以轴向受力而非受弯方式承载，这类材料在密度很低的情况下仍具有很高的刚度和强度。",
  },
  'hrennikoff-1941': {
    en: 'Approximates an elastic continuum by a patterned framework of bars with suitable elastic properties. The approach covers several stress and bending problems and is illustrated with examples.',
    es: 'Aproxima un continuo elástico con un entramado regular de barras de propiedades elásticas adecuadas. El enfoque abarca varios problemas de tensiones y de flexión y se ilustra con ejemplos.',
    pt: 'Aproxima um contínuo elástico por uma malha regular de barras com propriedades elásticas adequadas. A abordagem cobre vários problemas de tensões e de flexão e é ilustrada com exemplos.',
    hu: "A rugalmas kontinuumot megfelelő rugalmas tulajdonságú rudakból álló, szabályos mintázatú rácsszerkezettel közelíti. A módszer több feszültségi és hajlítási feladatot lefed, és példákkal szemlélteti.",
    it: 'Approssima un continuo elastico con un reticolo di barre con opportune proprietà elastiche. L’approccio copre diversi problemi di tensione e flessione ed è illustrato con esempi.',
    zh: "以具有合适弹性性质的杆件按规则图案组成的框架来近似弹性连续体。该方法可用于多类应力和弯曲问题，并通过算例加以说明。",
  },
  'wilson-1981': {
    en: 'Introduces complete quadratic combination for seismic modal maxima. In the examples studied it reduces modal-combination errors, and it approaches SRSS when natural frequencies are well separated.',
    es: 'Introduce la combinación cuadrática completa para los máximos modales sísmicos. En los ejemplos estudiados reduce los errores de combinación modal y se aproxima a SRSS cuando las frecuencias naturales están bien separadas.',
    pt: 'Introduz a combinação quadrática completa para os máximos modais sísmicos. Nos exemplos estudados reduz os erros de combinação modal e se aproxima da SRSS quando as frequências naturais estão bem separadas.',
    hu: "Bevezeti a teljes négyzetes kombinációt a földrengési modális maximumokra. A vizsgált példákban csökkenti a modális kombináció hibáit, és jól elkülönülő sajátfrekvenciák esetén az SRSS-hez közelít.",
    it: 'Introduce la combinazione quadratica completa per i massimi modali sismici. Negli esempi studiati riduce gli errori di combinazione modale e si avvicina a SRSS quando le frequenze proprie sono ben separate.',
    zh: "针对地震模态最大值提出完全二次组合（CQC）。在所研究的算例中，它减小了模态组合误差；当自振频率相隔较远时，它趋近于 SRSS。",
  },
  'bathe-dvorkin-1986': {
    en: 'Discusses practical requirements for general shell elements, explains a four-node mixed-interpolation formulation and introduces an eight-node element using the same approach.',
    es: 'Discute los requisitos prácticos de los elementos de cáscara generales, explica una formulación de interpolación mixta de cuatro nodos y presenta un elemento de ocho nodos con el mismo enfoque.',
    pt: 'Discute os requisitos práticos de elementos de casca gerais, explica uma formulação de interpolação mista de quatro nós e apresenta um elemento de oito nós com a mesma abordagem.',
    hu: "Tárgyalja az általános héjelemekkel szemben támasztott gyakorlati követelményeket, ismertet egy négycsomópontos, vegyes interpolációs formulációt, és ugyanezzel a megközelítéssel bevezet egy nyolccsomópontos elemet.",
    it: 'Discute i requisiti pratici per gli elementi di guscio generali, spiega una formulazione a quattro nodi con interpolazione mista e introduce un elemento a otto nodi che usa lo stesso approccio.',
    zh: "讨论一般壳单元的实用要求，阐述一种四节点混合插值格式，并采用同样的方法提出一种八节点单元。",
  },
  'zienkiewicz-zhu-1987': {
    en: 'Presents an inexpensive estimator of global energy-norm and local finite element errors. The estimates guide adaptive refinement or mesh redesign to reach a chosen accuracy.',
    es: 'Presenta un estimador económico del error global en norma de energía y de los errores locales de elementos finitos. Las estimaciones guían el refinamiento adaptativo o el rediseño de la malla para alcanzar una precisión elegida.',
    pt: 'Apresenta um estimador econômico do erro global em norma de energia e dos erros locais de elementos finitos. As estimativas orientam o refinamento adaptativo ou o redesenho da malha para alcançar uma precisão escolhida.',
    hu: "Olcsó becslőt mutat be a globális energianormabeli és a lokális végeselemes hibákra. A becslések az adaptív finomítást vagy a háló újratervezését irányítják a választott pontosság eléréséig.",
    it: 'Presenta uno stimatore poco costoso dell’errore globale in norma energetica e degli errori locali degli elementi finiti. Le stime guidano il raffinamento adattivo o la riprogettazione della mesh per raggiungere una precisione scelta.',
    zh: "提出一种低成本的估计方法，用于估计全局能量范数误差和局部有限元误差。这些估计可用于指导自适应加密或网格重新划分，以达到所选定的精度。",
  },
  'bathe-dvorkin-1985': {
    en: 'Derives a four-node linear elastic plate bending element as a special case of a general shell formulation and uses example solutions to assess its predictions.',
    es: 'Deduce un elemento de placa a flexión elástico lineal de cuatro nodos como caso particular de una formulación general de cáscaras y usa soluciones de ejemplo para evaluar sus predicciones.',
    pt: 'Deduz um elemento de placa à flexão elástico linear de quatro nós como caso particular de uma formulação geral de cascas e usa soluções de exemplo para avaliar suas previsões.',
    hu: "Négycsomópontos, lineárisan rugalmas lemezhajlítási elemet vezet le egy általános héjformuláció speciális eseteként, és mintapéldák megoldásaival értékeli az előrejelzéseit.",
    it: 'Ricava un elemento di piastra inflessa lineare elastico a quattro nodi come caso particolare di una formulazione generale di guscio e usa soluzioni di esempio per valutarne le previsioni.',
    zh: "将四节点线弹性板弯曲单元作为一般壳格式的特例推导出来，并通过算例解评估其预测结果。",
  },
  'batoz-1980': {
    en: 'Compares three-node triangular plate bending elements with nine displacement degrees of freedom. Theoretical and numerical assessments favour the discrete Kirchhoff and hybrid-stress formulations among the alternatives examined.',
    es: 'Compara elementos triangulares de placa a flexión de tres nodos con nueve grados de libertad de desplazamiento. Las evaluaciones teóricas y numéricas favorecen, entre las alternativas examinadas, las formulaciones de Kirchhoff discreto y de tensiones híbridas.',
    pt: 'Compara elementos triangulares de placa à flexão de três nós com nove graus de liberdade de deslocamento. As avaliações teóricas e numéricas favorecem, entre as alternativas examinadas, as formulações de Kirchhoff discreto e de tensões híbridas.',
    hu: "Kilenc elmozdulási szabadságfokú, háromcsomópontos háromszög lemezhajlítási elemeket hasonlít össze. Az elméleti és numerikus értékelések a vizsgált változatok közül a diszkrét Kirchhoff- és a hibrid feszültségi formulációt részesítik előnyben.",
    it: 'Confronta elementi triangolari a tre nodi per piastre inflesse con nove gradi di libertà in spostamento. Le valutazioni teoriche e numeriche favoriscono le formulazioni di Kirchhoff discreto e a tensioni ibride tra le alternative esaminate.',
    zh: "比较九位移自由度的三节点三角形板弯曲单元。理论与数值评估表明，在所考察的方案中，离散 Kirchhoff 格式和混合应力格式更优。",
  },
  'bucalem-1993': {
    en: 'Presents nine-node and sixteen-node MITC shell elements that tie interpolated covariant membrane and shear strains to the displacement field. Numerical tests assess their predictive performance.',
    es: 'Presenta elementos de cáscara MITC de nueve y dieciséis nodos que vinculan las deformaciones covariantes interpoladas de membrana y de corte con el campo de desplazamientos. Ensayos numéricos evalúan su capacidad predictiva.',
    pt: 'Apresenta elementos de casca MITC de nove e dezesseis nós que vinculam as deformações covariantes interpoladas de membrana e de cisalhamento ao campo de deslocamentos. Testes numéricos avaliam seu desempenho preditivo.',
    hu: "Kilenc- és tizenhat csomópontos MITC héjelemeket mutat be, amelyek az interpolált kovariáns membrán- és nyírási alakváltozásokat az elmozdulásmezőhöz kötik. Numerikus tesztek értékelik az előrejelző képességüket.",
    it: 'Presenta elementi di guscio MITC a nove e sedici nodi che legano le deformazioni covarianti di membrana e di taglio interpolate al campo di spostamento. Prove numeriche ne valutano le prestazioni predittive.',
    zh: "提出九节点和十六节点 MITC 壳单元，将插值的协变薄膜应变和剪切应变与位移场联系起来。数值试验评估了它们的预测性能。",
  },
  'chapelle-1998': {
    en: 'Explains how geometry and boundary conditions determine whether a thin shell is dominated by membrane action or bending. Proposes test cases for evaluating convergence and its dependence on shell thickness.',
    es: 'Explica cómo la geometría y las condiciones de borde determinan si en una cáscara delgada domina la acción de membrana o la flexión. Propone casos de prueba para evaluar la convergencia y su dependencia del espesor de la cáscara.',
    pt: 'Explica como a geometria e as condições de contorno determinam se em uma casca fina domina a ação de membrana ou a flexão. Propõe casos de teste para avaliar a convergência e sua dependência da espessura da casca.',
    hu: "Elmagyarázza, hogyan határozza meg a geometria és a peremfeltételek, hogy egy vékony héjban a membránhatás vagy a hajlítás dominál. Tesztfeladatokat javasol a konvergencia és annak héjvastagságtól való függésének értékelésére.",
    it: 'Spiega come geometria e condizioni al contorno determinino se un guscio sottile è dominato dall’azione membranale o dalla flessione. Propone casi di prova per valutare la convergenza e la sua dipendenza dallo spessore del guscio.',
    zh: "阐明几何和边界条件如何决定薄壳以薄膜作用还是以弯曲作用为主。提出用于评估收敛性及其对壳厚度依赖性的测试算例。",
  },
  'zupan-2004': {
    en: 'Compares three interpretations of an initially twisted beam with different twist distributions and cross-sections. The numerical results identify the MacNeal-Harder reference as a linearly twisted beam with curved edges.',
    es: 'Compara tres interpretaciones de una viga inicialmente torcida con distintas distribuciones de torsión y secciones transversales. Los resultados numéricos identifican la referencia de MacNeal-Harder como una viga con torsión lineal y bordes curvos.',
    pt: 'Compara três interpretações de uma viga inicialmente torcida com diferentes distribuições de torção e seções transversais. Os resultados numéricos identificam a referência de MacNeal-Harder como uma viga com torção linear e bordas curvas.',
    hu: "Egy kezdetben csavart gerenda három értelmezését hasonlítja össze különböző csavarodáseloszlásokkal és keresztmetszetekkel. A numerikus eredmények szerint a MacNeal–Harder-referencia görbült élű, lineárisan csavart gerenda.",
    it: 'Confronta tre interpretazioni di una trave inizialmente svergolata con diverse distribuzioni di torsione e sezioni. I risultati numerici identificano il riferimento MacNeal-Harder come una trave con svergolamento lineare e bordi curvi.',
    zh: "比较初始扭转梁的三种解释，涉及不同的扭转分布和截面。数值结果表明，MacNeal-Harder 基准算例是一根边缘弯曲的线性扭转梁。",
  },
  'bathe-2000': {
    en: 'Evaluates MITC shell elements on selected test problems using fundamental shell-analysis criteria. The reported results support their use for general engineering applications.',
    es: 'Evalúa elementos de cáscara MITC en problemas de prueba seleccionados con criterios fundamentales del análisis de cáscaras. Los resultados informados respaldan su uso en aplicaciones generales de ingeniería.',
    pt: 'Avalia elementos de casca MITC em problemas de teste selecionados com critérios fundamentais da análise de cascas. Os resultados relatados apoiam seu uso em aplicações gerais de engenharia.',
    hu: "MITC héjelemeket értékel kiválasztott tesztfeladatokon, a héjanalízis alapvető kritériumai szerint. A közölt eredmények alátámasztják általános mérnöki alkalmazásukat.",
    it: 'Valuta gli elementi di guscio MITC su problemi di prova selezionati secondo criteri fondamentali dell’analisi dei gusci. I risultati riportati ne sostengono l’uso per applicazioni ingegneristiche generali.',
    zh: "以壳分析的基本准则，在若干选定的测试问题上评估 MITC 壳单元。所报告的结果支持将其用于一般工程应用。",
  },
};

export function summaryIn(paper: { id: string; summary?: string | null }, locale: string): string {
  const own = CATALOGUE_SUMMARIES[paper.id];
  if (own && own.en === paper.summary && (locale === 'es' || locale === 'pt' || locale === 'hu' || locale === 'it' || locale === 'zh')) return own[locale];
  return paper.summary ?? '';
}
