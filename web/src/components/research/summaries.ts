import { CATALOGUE_SUMMARIES } from './catalogue-summaries';

type Summary = { en: string; es: string; pt: string; hu: string; zh: string; ko: string };

/** `en` is the papers.yaml summary each translation was made from; a test fails when they differ. */
export const SUMMARIES: Record<string, Summary> = {
  ...CATALOGUE_SUMMARIES,
  'shauer-2025': {
    en: 'An educational single-file Python implementation of two-dimensional phase-field fracture with linear quadrilateral elements. It provides sparse and dense examples of a bar in tension and a single-edge notched plate, plus a sparse three-point bending example, with VTK output and stress or reaction-force plots for comparison.',
    es: 'Una implementación educativa en Python, en un solo archivo, de la fractura por campo de fase en dos dimensiones con elementos cuadriláteros lineales. Trae ejemplos dispersos y densos de una barra en tracción y de una placa con una entalla lateral, más un ejemplo disperso de flexión en tres puntos, con salida VTK y gráficos de tensión o de fuerza de reacción para comparar.',
    pt: 'Uma implementação educacional em Python, em um único arquivo, da fratura por campo de fase em duas dimensões com elementos quadriláteros lineares. Traz exemplos esparsos e densos de uma barra em tração e de uma placa com um entalhe lateral, além de um exemplo esparso de flexão em três pontos, com saída VTK e gráficos de tensão ou de força de reação para comparação.',
    hu: "Oktatási célú, egyetlen fájlból álló Python-implementáció a kétdimenziós fázismezős törésmechanikához, lineáris négyszögelemekkel. Ritka és sűrű mátrixos példát ad egy húzott rúdra és egy egyoldalt bemetszett lemezre, valamint ritka mátrixos hárompontos hajlítási példát, VTK-kimenettel és az összehasonlításhoz feszültség- vagy támaszerő-diagramokkal.",
    ko: '선형 사각형 요소를 사용한 2차원 위상장(phase-field) 파괴의 교육용 단일 파일 Python 구현입니다. 인장을 받는 봉과 단일 가장자리 노치 판의 희소 및 밀집 예제, 그리고 희소 3점 휨 예제를 제공하며, 비교를 위한 VTK 출력과 응력 또는 반력 그래프를 포함합니다.',
    zh: "一份用于教学的单文件 Python 实现，采用线性四边形单元求解二维相场断裂问题。它提供受拉杆和单边切口板的稀疏与稠密算例，以及一个稀疏的三点弯曲算例，并输出 VTK 文件，附有应力或反力曲线图以供对比。",
  },
  'grossman-2026': {
    en: "Derives the elastic continuum of an arbitrary network of Hookean springs from its geometry and topology alone, with the nonaffine deformation of every triangle obtained from a linear system, and compares the resulting Poisson's ratios and Young's moduli with simulations of stretched strips of ordered triangular lattices, a honeycomb that turns re-entrant, and a foam-like disordered lattice that becomes auxetic.",
    es: 'Deduce el continuo elástico de una red arbitraria de resortes de Hooke solo a partir de su geometría y su topología, obteniendo la deformación no afín de cada triángulo de un sistema lineal, y compara los coeficientes de Poisson y los módulos de Young resultantes con simulaciones de franjas estiradas de redes triangulares ordenadas, de un panal de abeja que se vuelve reentrante y de una red desordenada tipo espuma que se vuelve auxética.',
    pt: 'Deduz o contínuo elástico de uma rede arbitrária de molas de Hooke apenas a partir de sua geometria e topologia, obtendo a deformação não afim de cada triângulo de um sistema linear, e compara os coeficientes de Poisson e os módulos de Young resultantes com simulações de faixas esticadas de redes triangulares ordenadas, de um favo de mel que se torna reentrante e de uma rede desordenada tipo espuma que se torna auxética.',
    hu: "Hooke-rugók tetszőleges hálózatának rugalmas kontinuumát kizárólag a geometriájából és topológiájából vezeti le, minden háromszög nem affin alakváltozását egy lineáris egyenletrendszerből kapja, és az így adódó Poisson-tényezőket és rugalmassági modulusokat összeveti rendezett háromszögrácsokból, egy visszahajló (re-entrant) alakúvá váló méhsejtrácsból és egy auxetikussá váló, habszerű rendezetlen rácsból kivágott, nyújtott sávok szimulációival.",
    ko: "임의의 Hooke 스프링 네트워크의 탄성 연속체를 기하와 위상만으로 유도하며, 모든 삼각형의 비아핀 변형을 선형 방정식계로 구하고, 그 결과로 얻은 푸아송비와 영 계수를 규칙적인 삼각 격자, 재진입형으로 변하는 벌집 구조, 오제틱 거동을 보이는 발포체 같은 무질서 격자의 인장 스트립 시뮬레이션과 비교합니다.",
    zh: "仅根据几何和拓扑，推导出由任意胡克弹簧网络构成的弹性连续体，其中每个三角形的非仿射变形由一个线性方程组求得；并将所得的泊松比和杨氏模量，与规则三角形点阵、变为内凹形的蜂窝点阵以及变为拉胀的泡沫状无序点阵的拉伸窄条模拟结果进行比较。",
  },
  'andreassen-2011': {
    en: 'An educational successor to the 99-line topology optimization code adds density filtering and improves computational efficiency through preallocation and vectorization.',
    es: 'Un sucesor educativo del código de optimización topológica de 99 líneas que agrega el filtrado de densidades y mejora la eficiencia de cálculo con preasignación de memoria y vectorización.',
    pt: 'Um sucessor educacional do código de otimização topológica de 99 linhas que acrescenta a filtragem de densidades e melhora a eficiência computacional com pré-alocação de memória e vetorização.',
    hu: "A 99 soros topológiaoptimalizálási kód oktatási célú utódja, amely sűrűségszűréssel egészíti ki az eredetit, és előfoglalással és vektorizálással javítja a számítási hatékonyságot.",
    ko: '99줄 위상 최적화 코드의 교육용 후속 코드로, 밀도 필터링을 추가하고 사전 할당과 벡터화로 계산 효율을 높였습니다.',
    zh: "这份教学用代码是 99 行拓扑优化程序的后继版本，增加了密度过滤，并通过预分配内存和向量化提高了计算效率。",
  },
  'ferrari-2025': {
    en: "Uses Koiter's asymptotic post-buckling expansion in sizing and topology optimization of trusses and frames. Constraining the first two asymptotic coefficients (initial post-buckling slope and curvature) shapes the post-buckling response and lowers imperfection sensitivity, and the same expansion approximates the nonlinear response so that measures such as end-compliance can be optimized.",
    es: 'Usa la expansión asintótica de pospandeo de Koiter en la optimización de dimensiones y de topología de reticulados y pórticos. Restringir los dos primeros coeficientes asintóticos (pendiente y curvatura iniciales del pospandeo) da forma a la respuesta de pospandeo y reduce la sensibilidad a las imperfecciones, y la misma expansión aproxima la respuesta no lineal para poder optimizar medidas como la flexibilidad al final de la carga.',
    pt: 'Usa a expansão assintótica de pós-flambagem de Koiter na otimização de dimensões e de topologia de treliças e pórticos. Restringir os dois primeiros coeficientes assintóticos (inclinação e curvatura iniciais da pós-flambagem) molda a resposta de pós-flambagem e reduz a sensibilidade a imperfeições, e a mesma expansão aproxima a resposta não linear para que medidas como a flexibilidade ao final do carregamento possam ser otimizadas.',
    hu: "Koiter aszimptotikus posztkritikus sorfejtését alkalmazza rácsos tartók és keretek méret- és topológiaoptimalizálásában. Az első két aszimptotikus együttható (a posztkritikus ág kezdeti meredeksége és görbülete) korlátozása alakítja a posztkritikus viselkedést és csökkenti az imperfekcióérzékenységet, ugyanez a sorfejtés pedig közelíti a nemlineáris választ, így olyan mérőszámok is optimalizálhatók, mint a végső engedékenység.",
    ko: "트러스와 골조의 치수 및 위상 최적화에 Koiter의 점근적 후좌굴 전개를 사용합니다. 처음 두 점근 계수(초기 후좌굴 기울기와 곡률)를 제약하면 후좌굴 응답이 정해지고 초기 결함 민감도가 낮아지며, 같은 전개로 비선형 응답을 근사하여 끝단 컴플라이언스 같은 지표를 최적화할 수 있습니다.",
    zh: "将 Koiter 渐近后屈曲展开用于桁架和框架的尺寸与拓扑优化。约束前两个渐近系数（初始后屈曲斜率和曲率），可以塑造后屈曲响应并降低缺陷敏感性；同一展开还可近似非线性响应，从而对端部柔度等指标进行优化。",
  },
  'feher-sipos-varkonyi-2026': {
    en: 'Proposes quasi-static shape control of structures whose equilibrium sets have a complex topology, and applies it to a strip bent into two rotary clamps under a fixed load, choosing actuator paths that stay on stable equilibria, including a path between two stable shapes without snap-through.',
    es: 'Propone el control cuasiestático de la forma de estructuras cuyos conjuntos de equilibrio tienen una topología compleja, y lo aplica a una lámina curvada entre dos mordazas rotativas bajo una carga fija, eligiendo caminos de los actuadores que se mantienen sobre equilibrios estables, entre ellos un camino entre dos formas estables sin salto.',
    pt: 'Propõe o controle quase estático da forma de estruturas cujos conjuntos de equilíbrio têm topologia complexa, e o aplica a uma lâmina curvada entre duas garras rotativas sob uma carga fixa, escolhendo caminhos dos atuadores que permanecem em equilíbrios estáveis, entre eles um caminho entre duas formas estáveis sem salto.',
    hu: "Kvázistatikus alakszabályozást javasol olyan szerkezetekre, amelyek egyensúlyi halmazai összetett topológiájúak, és ezt egy két forgatható befogás közé hajlított, rögzített teherrel terhelt szalagra alkalmazza: olyan beavatkozói pályákat választ, amelyek stabil egyensúlyi helyzeteken maradnak, köztük egy két stabil alak közötti, átpattanás nélküli pályát.",
    ko: '평형 집합의 위상이 복잡한 구조물의 준정적 형상 제어를 제안하며, 고정 하중 아래 두 개의 회전 클램프로 구부러진 스트립에 적용합니다. 안정한 평형 상태에 머무르는 액추에이터 경로를 선택하며, 스냅스루 없이 두 안정 형상 사이를 오가는 경로도 포함합니다.',
    zh: "针对平衡集具有复杂拓扑的结构，提出准静态形状控制方法，并将其应用于在固定荷载下弯成两个旋转夹具的板条，选取始终停留在稳定平衡状态上的作动器路径，其中包括一条在两种稳定形状之间不发生突跳屈曲的路径。",
  },
  'zmyslony-2026': {
    en: 'Elastica theory and photomechanical experiments on an arch whose preferred curvature varies along its length and in time. A shallow-arch theory projects the curvature pattern onto Euler buckling modes; overlap with the fundamental mode makes the arch snap, other patterns give a continuous switch to a higher mode. Patterns with the largest energy release and the lowest threshold are found, and the same control applies to passive pre-curved arches loaded at the boundaries.',
    es: 'Teoría de la elástica y experimentos fotomecánicos sobre un arco cuya curvatura preferida varía a lo largo de su longitud y en el tiempo. Una teoría de arco rebajado proyecta el patrón de curvatura sobre los modos de pandeo de Euler: la superposición con el modo fundamental hace que el arco salte, y otros patrones producen un cambio continuo a un modo superior. Se encuentran los patrones con la mayor liberación de energía y el menor umbral, y el mismo control se aplica a arcos pasivos precurvados cargados en los bordes.',
    pt: 'Teoria da elástica e experimentos fotomecânicos sobre um arco cuja curvatura preferida varia ao longo do comprimento e no tempo. Uma teoria de arco abatido projeta o padrão de curvatura sobre os modos de flambagem de Euler: a sobreposição com o modo fundamental faz o arco saltar, e outros padrões dão uma mudança contínua para um modo superior. São encontrados os padrões com a maior liberação de energia e o menor limiar, e o mesmo controle se aplica a arcos passivos pré-curvados carregados nas bordas.',
    hu: "Elasztikaelmélet és fotomechanikai kísérletek egy olyan ívre, amelynek előírt görbülete a hossza mentén és időben is változik. Egy lapos ívekre vonatkozó elmélet a görbületmintázatot az Euler-féle kihajlási alakokra vetíti; ha a mintázat átfed az alapalakkal, az ív átpattan, más mintázatok folytonos átmenetet adnak egy magasabb alakba. A szerzők megkeresik a legnagyobb energiafelszabadulást és a legalacsonyabb küszöböt adó mintázatokat, és ugyanez a szabályozás a peremeken terhelt, passzív, előre görbített ívekre is alkalmazható.",
    ko: '선호 곡률이 길이 방향과 시간에 따라 변하는 아치에 대한 엘라스티카 이론과 광기계 실험입니다. 얕은 아치 이론은 곡률 패턴을 Euler 좌굴 모드에 투영하며, 기본 모드와 겹치면 아치가 스냅하고 다른 패턴은 더 높은 모드로 연속적으로 전환됩니다. 에너지 방출이 가장 크고 임계값이 가장 낮은 패턴을 찾으며, 경계에서 하중을 받는 수동 사전 곡률 아치에도 같은 제어가 적용됩니다.',
    zh: "针对一种拱的弹性曲线（elastica）理论与光力学实验，该拱的预设曲率沿其长度方向和时间变化。浅拱理论将曲率分布投影到 Euler 屈曲模态上；与基本模态有重叠时拱会发生突跳，其他分布则连续切换到更高阶模态。文中找到了能量释放最大且阈值最低的分布，同样的控制方法也适用于边界受荷的被动预弯拱。",
  },
  'pastrana-2026': {
    en: 'The JAX FDM library computes equilibrium shapes of pin-jointed bar systems with the force density method and solves inverse design problems by tuning force densities, loads and support positions with gradient-based optimization against goals and constraints; written in JAX, so the simulation is differentiable and JIT-compiled.',
    es: 'La biblioteca JAX FDM calcula formas de equilibrio de sistemas de barras articuladas con el método de densidad de fuerzas y resuelve problemas de diseño inverso ajustando densidades de fuerza, cargas y posiciones de apoyos con optimización por gradiente frente a objetivos y restricciones; está escrita en JAX, por lo que la simulación es diferenciable y se compila JIT.',
    pt: 'A biblioteca JAX FDM calcula formas de equilíbrio de sistemas de barras articuladas com o método da densidade de forças e resolve problemas de projeto inverso ajustando densidades de força, cargas e posições de apoios com otimização por gradiente frente a objetivos e restrições; é escrita em JAX, de modo que a simulação é diferenciável e compilada JIT.',
    hu: "A JAX FDM könyvtár csuklós rúdrendszerek egyensúlyi alakját számítja az erősűrűség-módszerrel, és inverz tervezési feladatokat old meg: az erősűrűségeket, a terheket és a támaszok helyzetét gradiensalapú optimalizálással hangolja célokhoz és korlátokhoz. JAX-ban készült, így a szimuláció differenciálható és JIT-fordítású.",
    ko: 'JAX FDM 라이브러리는 힘 밀도법으로 핀 접합 부재계의 평형 형상을 계산하고, 목표와 제약에 대해 경사 기반 최적화로 힘 밀도, 하중, 지점 위치를 조정하여 역설계 문제를 풉니다. JAX로 작성되어 시뮬레이션이 미분 가능하고 JIT 컴파일됩니다.',
    zh: "JAX FDM 库用力密度法计算铰接杆系的平衡形状，并通过调整力密度、荷载和支座位置，以梯度优化方法针对目标和约束求解逆向设计问题；该库用 JAX 编写，因此模拟可微分且经 JIT 编译。",
  },
  'fairclough-2026': {
    en: 'The paper incorporates design-dependent self-weight into gridshell topology and geometry optimization using equal-stress catenaries and conic constraints. The first reproduction covers only the five-node square in Table 1 at normalized unit weight 1.65.',
    es: 'El artículo incorpora el peso propio dependiente del diseño en la optimización de topología y geometría de cáscaras reticuladas mediante catenarias de igual tensión y restricciones cónicas. La primera reproducción cubre solo el cuadrado de cinco nodos de la Tabla 1 con peso unitario normalizado 1.65.',
    pt: 'O artigo incorpora o peso próprio dependente do projeto na otimização de topologia e geometria de cascas reticuladas usando catenárias de igual tensão e restrições cônicas. A primeira reprodução cobre apenas o quadrado de cinco nós da Tabela 1 com peso unitário normalizado 1.65.',
    hu: "A cikk a tervezéstől függő önsúlyt beépíti a rácshéjak topológia- és geometriaoptimalizálásába, egyenlő feszültségű láncgörbék és kúpos korlátok segítségével. Az első reprodukció csak az 1. táblázat ötcsomópontos négyzetét fedi le, 1,65 normalizált fajlagos súly mellett.",
    ko: '이 논문은 등응력 현수선과 원뿔 제약을 사용하여 설계에 따라 달라지는 자중을 그리드셸의 위상 및 형상 최적화에 반영합니다. 첫 번째 재현은 정규화 단위 중량 1.65에서 표 1의 5절점 정사각형만 다룹니다.',
    zh: "该论文利用等应力悬链线和圆锥约束，将与设计相关的自重纳入网壳的拓扑与几何优化。第一次复现仅涵盖表 1 中的五节点方形算例，归一化单位重量为 1.65。",
  },
  'macneal-harder-1985': {
    en: 'Proposes patch tests and beam, plate and shell problems for assessing finite element accuracy. Applications to quadrilateral plate and solid brick elements illustrate sensitivity to important accuracy parameters.',
    es: 'Propone ensayos de parcela y problemas de vigas, placas y cáscaras para evaluar la precisión de los elementos finitos. Las aplicaciones a elementos de placa cuadriláteros y a elementos sólidos hexaédricos ilustran la sensibilidad a parámetros importantes de precisión.',
    pt: 'Propõe testes de patch e problemas de vigas, placas e cascas para avaliar a precisão de elementos finitos. As aplicações a elementos de placa quadriláteros e a elementos sólidos hexaédricos ilustram a sensibilidade a parâmetros importantes de precisão.',
    hu: "Foltpróbákat (patch test), valamint gerenda-, lemez- és héjfeladatokat javasol a végeselemek pontosságának értékelésére. A négyszögletes lemezelemekre és téglatest alakú térbeli elemekre vonatkozó alkalmazások a fontos pontossági paraméterekre való érzékenységet szemléltetik.",
    ko: '유한요소 정확도를 평가하기 위한 패치 테스트와 보, 판, 쉘 문제를 제안합니다. 사각형 판 요소와 솔리드 벽돌 요소에 적용하여 주요 정확도 매개변수에 대한 민감도를 보여 줍니다.',
    zh: "提出用于评估有限元精度的分片试验以及梁、板和壳问题。对四边形板单元和实体砖单元的应用，说明了其对重要精度参数的敏感性。",
  },
  'cqc-1981': {
    en: 'Proposes complete quadratic combination to reduce modal-combination errors in response-spectrum analysis; the method approaches SRSS for well-separated natural frequencies.',
    es: 'Propone la combinación cuadrática completa para reducir los errores de combinación modal en el análisis por espectro de respuesta; el método se aproxima a SRSS cuando las frecuencias naturales están bien separadas.',
    pt: 'Propõe a combinação quadrática completa para reduzir os erros de combinação modal na análise por espectro de resposta; o método se aproxima da SRSS quando as frequências naturais estão bem separadas.',
    hu: "A teljes négyzetes kombinációt (CQC) javasolja a modális kombináció hibáinak csökkentésére a válaszspektrum-analízisben; jól elkülönülő sajátfrekvenciák esetén a módszer az SRSS-hez közelít.",
    ko: '응답스펙트럼 해석에서 모드 조합 오차를 줄이기 위해 완전 2차 조합(CQC)을 제안하며, 고유진동수가 충분히 떨어져 있을 때 이 방법은 SRSS에 가까워집니다.',
    zh: "提出完全二次组合（CQC），以减小反应谱分析中的模态组合误差；当自振频率相隔较远时，该方法趋近于 SRSS。",
  },

};

/** A catalogue summary in `locale`, or the papers.yaml text when it has no translation there. */
export function summaryIn(paper: { id: string; summary?: string | null }, locale: string): string {
  const own = SUMMARIES[paper.id];
  if (own && own.en === paper.summary && (locale === 'es' || locale === 'pt' || locale === 'hu' || locale === 'zh' || locale === 'ko')) return own[locale];
  return paper.summary ?? '';
}
