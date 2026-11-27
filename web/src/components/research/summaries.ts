import { CATALOGUE_SUMMARIES } from './catalogue-summaries';

type Summary = { en: string; es: string; pt: string; hu: string; zh: string; de?: string; fr?: string; tr?: string };

/** `en` is the papers.yaml summary each translation was made from; a test fails when they differ. */
export const SUMMARIES: Record<string, Summary> = {
  ...CATALOGUE_SUMMARIES,
  'shauer-2025': {
    en: 'An educational single-file Python implementation of two-dimensional phase-field fracture with linear quadrilateral elements. It provides sparse and dense examples of a bar in tension and a single-edge notched plate, plus a sparse three-point bending example, with VTK output and stress or reaction-force plots for comparison.',
    es: 'Una implementación educativa en Python, en un solo archivo, de la fractura por campo de fase en dos dimensiones con elementos cuadriláteros lineales. Trae ejemplos dispersos y densos de una barra en tracción y de una placa con una entalla lateral, más un ejemplo disperso de flexión en tres puntos, con salida VTK y gráficos de tensión o de fuerza de reacción para comparar.',
    pt: 'Uma implementação educacional em Python, em um único arquivo, da fratura por campo de fase em duas dimensões com elementos quadriláteros lineares. Traz exemplos esparsos e densos de uma barra em tração e de uma placa com um entalhe lateral, além de um exemplo esparso de flexão em três pontos, com saída VTK e gráficos de tensão ou de força de reação para comparação.',
    hu: "Oktatási célú, egyetlen fájlból álló Python-implementáció a kétdimenziós fázismezős törésmechanikához, lineáris négyszögelemekkel. Ritka és sűrű mátrixos példát ad egy húzott rúdra és egy egyoldalt bemetszett lemezre, valamint ritka mátrixos hárompontos hajlítási példát, VTK-kimenettel és az összehasonlításhoz feszültség- vagy támaszerő-diagramokkal.",
    zh: "一份用于教学的单文件 Python 实现，采用线性四边形单元求解二维相场断裂问题。它提供受拉杆和单边切口板的稀疏与稠密算例，以及一个稀疏的三点弯曲算例，并输出 VTK 文件，附有应力或反力曲线图以供对比。",
  },
  'grossman-2026': {
    en: "Derives the elastic continuum of an arbitrary network of Hookean springs from its geometry and topology alone, with the nonaffine deformation of every triangle obtained from a linear system, and compares the resulting Poisson's ratios and Young's moduli with simulations of stretched strips of ordered triangular lattices, a honeycomb that turns re-entrant, and a foam-like disordered lattice that becomes auxetic.",
    es: 'Deduce el continuo elástico de una red arbitraria de resortes de Hooke solo a partir de su geometría y su topología, obteniendo la deformación no afín de cada triángulo de un sistema lineal, y compara los coeficientes de Poisson y los módulos de Young resultantes con simulaciones de franjas estiradas de redes triangulares ordenadas, de un panal de abeja que se vuelve reentrante y de una red desordenada tipo espuma que se vuelve auxética.',
    pt: 'Deduz o contínuo elástico de uma rede arbitrária de molas de Hooke apenas a partir de sua geometria e topologia, obtendo a deformação não afim de cada triângulo de um sistema linear, e compara os coeficientes de Poisson e os módulos de Young resultantes com simulações de faixas esticadas de redes triangulares ordenadas, de um favo de mel que se torna reentrante e de uma rede desordenada tipo espuma que se torna auxética.',
    hu: "Hooke-rugók tetszőleges hálózatának rugalmas kontinuumát kizárólag a geometriájából és topológiájából vezeti le, minden háromszög nem affin alakváltozását egy lineáris egyenletrendszerből kapja, és az így adódó Poisson-tényezőket és rugalmassági modulusokat összeveti rendezett háromszögrácsokból, egy visszahajló (re-entrant) alakúvá váló méhsejtrácsból és egy auxetikussá váló, habszerű rendezetlen rácsból kivágott, nyújtott sávok szimulációival.",
    zh: "仅根据几何和拓扑，推导出由任意胡克弹簧网络构成的弹性连续体，其中每个三角形的非仿射变形由一个线性方程组求得；并将所得的泊松比和杨氏模量，与规则三角形点阵、变为内凹形的蜂窝点阵以及变为拉胀的泡沫状无序点阵的拉伸窄条模拟结果进行比较。",
  },
  'andreassen-2011': {
    en: 'An educational successor to the 99-line topology optimization code adds density filtering and improves computational efficiency through preallocation and vectorization.',
    es: 'Un sucesor educativo del código de optimización topológica de 99 líneas que agrega el filtrado de densidades y mejora la eficiencia de cálculo con preasignación de memoria y vectorización.',
    pt: 'Um sucessor educacional do código de otimização topológica de 99 linhas que acrescenta a filtragem de densidades e melhora a eficiência computacional com pré-alocação de memória e vetorização.',
    hu: "A 99 soros topológiaoptimalizálási kód oktatási célú utódja, amely sűrűségszűréssel egészíti ki az eredetit, és előfoglalással és vektorizálással javítja a számítási hatékonyságot.",
    zh: "这份教学用代码是 99 行拓扑优化程序的后继版本，增加了密度过滤，并通过预分配内存和向量化提高了计算效率。",
  },
  'ferrari-2025': {
    en: "Uses Koiter's asymptotic post-buckling expansion in sizing and topology optimization of trusses and frames. Constraining the first two asymptotic coefficients (initial post-buckling slope and curvature) shapes the post-buckling response and lowers imperfection sensitivity, and the same expansion approximates the nonlinear response so that measures such as end-compliance can be optimized.",
    es: 'Usa la expansión asintótica de pospandeo de Koiter en la optimización de dimensiones y de topología de reticulados y pórticos. Restringir los dos primeros coeficientes asintóticos (pendiente y curvatura iniciales del pospandeo) da forma a la respuesta de pospandeo y reduce la sensibilidad a las imperfecciones, y la misma expansión aproxima la respuesta no lineal para poder optimizar medidas como la flexibilidad al final de la carga.',
    pt: 'Usa a expansão assintótica de pós-flambagem de Koiter na otimização de dimensões e de topologia de treliças e pórticos. Restringir os dois primeiros coeficientes assintóticos (inclinação e curvatura iniciais da pós-flambagem) molda a resposta de pós-flambagem e reduz a sensibilidade a imperfeições, e a mesma expansão aproxima a resposta não linear para que medidas como a flexibilidade ao final do carregamento possam ser otimizadas.',
    hu: "Koiter aszimptotikus posztkritikus sorfejtését alkalmazza rácsos tartók és keretek méret- és topológiaoptimalizálásában. Az első két aszimptotikus együttható (a posztkritikus ág kezdeti meredeksége és görbülete) korlátozása alakítja a posztkritikus viselkedést és csökkenti az imperfekcióérzékenységet, ugyanez a sorfejtés pedig közelíti a nemlineáris választ, így olyan mérőszámok is optimalizálhatók, mint a végső engedékenység.",
    zh: "将 Koiter 渐近后屈曲展开用于桁架和框架的尺寸与拓扑优化。约束前两个渐近系数（初始后屈曲斜率和曲率），可以塑造后屈曲响应并降低缺陷敏感性；同一展开还可近似非线性响应，从而对端部柔度等指标进行优化。",
  },
  'feher-sipos-varkonyi-2026': {
    en: 'Proposes quasi-static shape control of structures whose equilibrium sets have a complex topology, and applies it to a strip bent into two rotary clamps under a fixed load, choosing actuator paths that stay on stable equilibria, including a path between two stable shapes without snap-through.',
    es: 'Propone el control cuasiestático de la forma de estructuras cuyos conjuntos de equilibrio tienen una topología compleja, y lo aplica a una lámina curvada entre dos mordazas rotativas bajo una carga fija, eligiendo caminos de los actuadores que se mantienen sobre equilibrios estables, entre ellos un camino entre dos formas estables sin salto.',
    pt: 'Propõe o controle quase estático da forma de estruturas cujos conjuntos de equilíbrio têm topologia complexa, e o aplica a uma lâmina curvada entre duas garras rotativas sob uma carga fixa, escolhendo caminhos dos atuadores que permanecem em equilíbrios estáveis, entre eles um caminho entre duas formas estáveis sem salto.',
    hu: "Kvázistatikus alakszabályozást javasol olyan szerkezetekre, amelyek egyensúlyi halmazai összetett topológiájúak, és ezt egy két forgatható befogás közé hajlított, rögzített teherrel terhelt szalagra alkalmazza: olyan beavatkozói pályákat választ, amelyek stabil egyensúlyi helyzeteken maradnak, köztük egy két stabil alak közötti, átpattanás nélküli pályát.",
    zh: "针对平衡集具有复杂拓扑的结构，提出准静态形状控制方法，并将其应用于在固定荷载下弯成两个旋转夹具的板条，选取始终停留在稳定平衡状态上的作动器路径，其中包括一条在两种稳定形状之间不发生突跳屈曲的路径。",
  },
  'wang-2024': {
    de: 'Ein schräg eingespannter Stahlstreifen schlägt beim Auseinanderziehen durch. Versuche und Stabsimulationen zeigen, dass nur langsame Entlastung eine kleine Asymmetrie verstärkt. Im Zweimassenmodell durchläuft die langsame Bewegung einen Bereich mit negativer antisymmetrischer Steifigkeit.',
    fr: 'Une lame d’acier encastrée en biais se retourne quand ses extrémités s’écartent. Les essais et les simulations montrent que seule une libération lente amplifie une petite asymétrie. Dans le modèle à deux masses, les trajectoires rapides évitent la zone de raideur antisymétrique négative.',
    tr: 'Uçları açılı ankastre çelik şerit, uçlar birbirinden uzaklaştırıldığında sıçrar. Deneyler ve çubuk simülasyonları küçük bir asimetrinin yalnızca yavaş bırakmada büyüdüğünü gösterir. İki kütleli modelde hızlı yörüngeler antisimetrik rijitliğin negatif olduğu bölgeye girmez.',
    en: "A steel strip clamped at an angle at both ends has a natural and an inverted shape; when its ends are pulled apart the inverted shape disappears and the strip snaps. Linear stability predicts an asymmetric snap, but experiments and discrete-elastic-rod simulations show that only slow releases amplify a small asymmetry, while fast ones snap symmetrically. A two-mass von Mises truss explains this as a transient passage through a region of state space where the asymmetric stiffness is negative, which fast trajectories skip.",
    es: "Una lámina de acero empotrada en ángulo en ambos extremos tiene una forma natural y una invertida; al separar sus extremos la forma invertida desaparece y la lámina salta. La estabilidad lineal predice un salto asimétrico, pero los experimentos y las simulaciones con varillas elásticas discretas muestran que solo las liberaciones lentas amplifican una asimetría pequeña, mientras que las rápidas saltan simétricas. Una armadura de von Mises de dos masas lo explica como un paso transitorio por una región del espacio de estados donde la rigidez asimétrica es negativa, que las trayectorias rápidas saltean.",
    pt: "Uma lâmina de aço engastada em ângulo nas duas extremidades tem uma forma natural e uma invertida; ao separar as extremidades a forma invertida desaparece e a lâmina salta. A estabilidade linear prevê um salto assimétrico, mas experimentos e simulações com hastes elásticas discretas mostram que só as liberações lentas amplificam uma assimetria pequena, enquanto as rápidas saltam simétricas. Uma treliça de von Mises de duas massas explica isso como uma passagem transitória por uma região do espaço de estados onde a rigidez assimétrica é negativa, que as trajetórias rápidas pulam.",
    hu: "Egy mindkét végén ferdén befogott acélszalagnak van egy természetes és egy kifordított alakja; ha a végeit széthúzzuk, a kifordított alak megszűnik, és a szalag átpattan. A lineáris stabilitás aszimmetrikus átpattanást jósol, de a kísérletek és a diszkrét rugalmas rudas szimulációk szerint csak a lassú tehermentesítés erősít fel egy kis aszimmetriát, a gyors szimmetrikusan pattan át. Egy kéttömegű von Mises-rácsos modell ezt az állapottér egy olyan tartományán való átmeneti áthaladással magyarázza, ahol az aszimmetrikus merevség negatív, és amelyet a gyors pályák átugranak.",
    zh: "两端以一定角度固定的钢条有一个自然形状和一个倒置形状；把两端拉开时，倒置形状消失，钢条发生突跳。线性稳定性预测突跳是不对称的，但实验和离散弹性杆模拟表明，只有缓慢释放才会放大微小的不对称，快速释放时钢条对称地突跳。一个双质量 von Mises 桁架模型把这解释为在状态空间中短暂穿过一个不对称刚度为负的区域，而快速的轨迹会越过这个区域。",
  },
  'zmyslony-2026': {
    en: 'Elastica theory and photomechanical experiments on an arch whose preferred curvature varies along its length and in time. A shallow-arch theory projects the curvature pattern onto Euler buckling modes; overlap with the fundamental mode makes the arch snap, other patterns give a continuous switch to a higher mode. Patterns with the largest energy release and the lowest threshold are found, and the same control applies to passive pre-curved arches loaded at the boundaries.',
    es: 'Teoría de la elástica y experimentos fotomecánicos sobre un arco cuya curvatura preferida varía a lo largo de su longitud y en el tiempo. Una teoría de arco rebajado proyecta el patrón de curvatura sobre los modos de pandeo de Euler: la superposición con el modo fundamental hace que el arco salte, y otros patrones producen un cambio continuo a un modo superior. Se encuentran los patrones con la mayor liberación de energía y el menor umbral, y el mismo control se aplica a arcos pasivos precurvados cargados en los bordes.',
    pt: 'Teoria da elástica e experimentos fotomecânicos sobre um arco cuja curvatura preferida varia ao longo do comprimento e no tempo. Uma teoria de arco abatido projeta o padrão de curvatura sobre os modos de flambagem de Euler: a sobreposição com o modo fundamental faz o arco saltar, e outros padrões dão uma mudança contínua para um modo superior. São encontrados os padrões com a maior liberação de energia e o menor limiar, e o mesmo controle se aplica a arcos passivos pré-curvados carregados nas bordas.',
    hu: "Elasztikaelmélet és fotomechanikai kísérletek egy olyan ívre, amelynek előírt görbülete a hossza mentén és időben is változik. Egy lapos ívekre vonatkozó elmélet a görbületmintázatot az Euler-féle kihajlási alakokra vetíti; ha a mintázat átfed az alapalakkal, az ív átpattan, más mintázatok folytonos átmenetet adnak egy magasabb alakba. A szerzők megkeresik a legnagyobb energiafelszabadulást és a legalacsonyabb küszöböt adó mintázatokat, és ugyanez a szabályozás a peremeken terhelt, passzív, előre görbített ívekre is alkalmazható.",
    zh: "针对一种拱的弹性曲线（elastica）理论与光力学实验，该拱的预设曲率沿其长度方向和时间变化。浅拱理论将曲率分布投影到 Euler 屈曲模态上；与基本模态有重叠时拱会发生突跳，其他分布则连续切换到更高阶模态。文中找到了能量释放最大且阈值最低的分布，同样的控制方法也适用于边界受荷的被动预弯拱。",
  },
  'pastrana-2026': {
    en: 'The JAX FDM library computes equilibrium shapes of pin-jointed bar systems with the force density method and solves inverse design problems by tuning force densities, loads and support positions with gradient-based optimization against goals and constraints; written in JAX, so the simulation is differentiable and JIT-compiled.',
    es: 'La biblioteca JAX FDM calcula formas de equilibrio de sistemas de barras articuladas con el método de densidad de fuerzas y resuelve problemas de diseño inverso ajustando densidades de fuerza, cargas y posiciones de apoyos con optimización por gradiente frente a objetivos y restricciones; está escrita en JAX, por lo que la simulación es diferenciable y se compila JIT.',
    pt: 'A biblioteca JAX FDM calcula formas de equilíbrio de sistemas de barras articuladas com o método da densidade de forças e resolve problemas de projeto inverso ajustando densidades de força, cargas e posições de apoios com otimização por gradiente frente a objetivos e restrições; é escrita em JAX, de modo que a simulação é diferenciável e compilada JIT.',
    hu: "A JAX FDM könyvtár csuklós rúdrendszerek egyensúlyi alakját számítja az erősűrűség-módszerrel, és inverz tervezési feladatokat old meg: az erősűrűségeket, a terheket és a támaszok helyzetét gradiensalapú optimalizálással hangolja célokhoz és korlátokhoz. JAX-ban készült, így a szimuláció differenciálható és JIT-fordítású.",
    zh: "JAX FDM 库用力密度法计算铰接杆系的平衡形状，并通过调整力密度、荷载和支座位置，以梯度优化方法针对目标和约束求解逆向设计问题；该库用 JAX 编写，因此模拟可微分且经 JIT 编译。",
  },
  'fairclough-2026': {
    en: 'The paper incorporates design-dependent self-weight into gridshell topology and geometry optimization using equal-stress catenaries and conic constraints. The first reproduction covers only the five-node square in Table 1 at normalized unit weight 1.65.',
    es: 'El artículo incorpora el peso propio dependiente del diseño en la optimización de topología y geometría de cáscaras reticuladas mediante catenarias de igual tensión y restricciones cónicas. La primera reproducción cubre solo el cuadrado de cinco nodos de la Tabla 1 con peso unitario normalizado 1.65.',
    pt: 'O artigo incorpora o peso próprio dependente do projeto na otimização de topologia e geometria de cascas reticuladas usando catenárias de igual tensão e restrições cônicas. A primeira reprodução cobre apenas o quadrado de cinco nós da Tabela 1 com peso unitário normalizado 1.65.',
    hu: "A cikk a tervezéstől függő önsúlyt beépíti a rácshéjak topológia- és geometriaoptimalizálásába, egyenlő feszültségű láncgörbék és kúpos korlátok segítségével. Az első reprodukció csak az 1. táblázat ötcsomópontos négyzetét fedi le, 1,65 normalizált fajlagos súly mellett.",
    zh: "该论文利用等应力悬链线和圆锥约束，将与设计相关的自重纳入网壳的拓扑与几何优化。第一次复现仅涵盖表 1 中的五节点方形算例，归一化单位重量为 1.65。",
  },
  'macneal-harder-1985': {
    en: 'Proposes patch tests and beam, plate and shell problems for assessing finite element accuracy. Applications to quadrilateral plate and solid brick elements illustrate sensitivity to important accuracy parameters.',
    es: 'Propone ensayos de parcela y problemas de vigas, placas y cáscaras para evaluar la precisión de los elementos finitos. Las aplicaciones a elementos de placa cuadriláteros y a elementos sólidos hexaédricos ilustran la sensibilidad a parámetros importantes de precisión.',
    pt: 'Propõe testes de patch e problemas de vigas, placas e cascas para avaliar a precisão de elementos finitos. As aplicações a elementos de placa quadriláteros e a elementos sólidos hexaédricos ilustram a sensibilidade a parâmetros importantes de precisão.',
    hu: "Foltpróbákat (patch test), valamint gerenda-, lemez- és héjfeladatokat javasol a végeselemek pontosságának értékelésére. A négyszögletes lemezelemekre és téglatest alakú térbeli elemekre vonatkozó alkalmazások a fontos pontossági paraméterekre való érzékenységet szemléltetik.",
    zh: "提出用于评估有限元精度的分片试验以及梁、板和壳问题。对四边形板单元和实体砖单元的应用，说明了其对重要精度参数的敏感性。",
  },
  'cqc-1981': {
    en: 'Proposes complete quadratic combination to reduce modal-combination errors in response-spectrum analysis; the method approaches SRSS for well-separated natural frequencies.',
    es: 'Propone la combinación cuadrática completa para reducir los errores de combinación modal en el análisis por espectro de respuesta; el método se aproxima a SRSS cuando las frecuencias naturales están bien separadas.',
    pt: 'Propõe a combinação quadrática completa para reduzir os erros de combinação modal na análise por espectro de resposta; o método se aproxima da SRSS quando as frequências naturais estão bem separadas.',
    hu: "A teljes négyzetes kombinációt (CQC) javasolja a modális kombináció hibáinak csökkentésére a válaszspektrum-analízisben; jól elkülönülő sajátfrekvenciák esetén a módszer az SRSS-hez közelít.",
    zh: "提出完全二次组合（CQC），以减小反应谱分析中的模态组合误差；当自振频率相隔较远时，该方法趋近于 SRSS。",
  },

};

/** A catalogue summary in `locale`, or the papers.yaml text when it has no translation there. */
export function summaryIn(paper: { id: string; summary?: string | null }, locale: string): string {
  const own = SUMMARIES[paper.id];
  if (own && own.en === paper.summary && Object.hasOwn(own, locale)) return own[locale as keyof Summary] ?? paper.summary;
  return paper.summary ?? '';
}
