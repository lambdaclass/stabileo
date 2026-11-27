const labels: Record<string, Record<string, string>> = {
  "triangular-bulk": {
    "es": "Módulo volumétrico triangular",
    "pt": "Módulo volumétrico triangular",
    "de": "Kompressionsmodul Dreiecksgitter",
    "fr": "Module volumique triangulaire",
    "tr": "Üçgen hacim modülü",
    "hu": "Háromszögrács térfogati modulusa",
    "zh": "三角形点阵体积模量"
  },
  "triangular-shear": {
    "es": "Módulo de corte triangular",
    "pt": "Módulo de cisalhamento triangular",
    "de": "Schubmodul Dreiecksgitter",
    "fr": "Module de cisaillement triangulaire",
    "tr": "Üçgen kayma modülü",
    "hu": "Háromszögrács nyírási modulusa",
    "zh": "三角形点阵剪切模量"
  },
  "triangular-poisson": {
    "es": "Poisson triangular = 1/3",
    "pt": "Poisson triangular = 1/3",
    "de": "Poissonzahl Dreiecksgitter = 1/3",
    "fr": "Poisson triangulaire = 1/3",
    "tr": "Üçgen Poisson = 1/3",
    "hu": "Háromszögrács Poisson-tényezője = 1/3",
    "zh": "三角形点阵泊松比 = 1/3"
  },
  "triangular-isotropy": {
    "es": "Isotropía triangular",
    "pt": "Isotropia triangular",
    "de": "Isotropie Dreiecksgitter",
    "fr": "Isotropie triangulaire",
    "tr": "Üçgen izotropi",
    "hu": "Háromszögrács izotrópiája",
    "zh": "三角形点阵各向同性"
  },
  "triangular-affinity": {
    "es": "Desplazamiento no afín nulo",
    "pt": "Deslocamento não afim nulo",
    "de": "Keine nichtaffine Verschiebung",
    "fr": "Déplacement non affine nul",
    "tr": "Afin olmayan yer değiştirme sıfır",
    "hu": "Nincs nem affin elmozdulás",
    "zh": "无非仿射位移"
  },
  "bravais-stiffness": {
    "es": "Rigidez periódica = Cauchy–Born",
    "pt": "Rigidez periódica = Cauchy–Born",
    "de": "Periodische Steifigkeit = Cauchy–Born",
    "fr": "Rigidité périodique = Cauchy–Born",
    "tr": "Periyodik rijitlik = Cauchy–Born",
    "hu": "Periodikus merevség = Cauchy–Born",
    "zh": "周期性刚度 = Cauchy–Born"
  },
  "bravais-cauchy": {
    "es": "Relación de Cauchy",
    "pt": "Relação de Cauchy",
    "de": "Cauchy-Beziehung",
    "fr": "Relation de Cauchy",
    "tr": "Cauchy bağıntısı",
    "hu": "Cauchy-reláció",
    "zh": "Cauchy 关系"
  },
  "square-shear": {
    "es": "Red cuadrada: corte nulo",
    "pt": "Rede quadrada: cisalhamento nulo",
    "de": "Quadratgitter: kein Schubmodul",
    "fr": "Réseau carré : cisaillement nul",
    "tr": "Kare kafes: kayma sıfır",
    "hu": "Négyzetrács: zérus nyírási modulus",
    "zh": "正方形点阵：剪切模量为零"
  },
  "square-stiffness": {
    "es": "Red cuadrada: rigidez axial",
    "pt": "Rede quadrada: rigidez axial",
    "de": "Quadratgitter: axiale Steifigkeit",
    "fr": "Réseau carré : rigidité axiale",
    "tr": "Kare kafes: eksenel rijitlik",
    "hu": "Négyzetrács: tengelyirányú merevség",
    "zh": "正方形点阵：轴向刚度"
  },
  "square-tension": {
    "es": "Red cuadrada en tracción: C33 = 2t",
    "pt": "Rede quadrada em tração: C33 = 2t",
    "de": "Quadratgitter unter Zug: C33 = 2t",
    "fr": "Réseau carré en traction : C33 = 2t",
    "tr": "Çekmedeki kare kafes: C33 = 2t",
    "hu": "Húzott négyzetrács: C33 = 2t",
    "zh": "受拉正方形点阵：C33 = 2t"
  },
  "energy": {
    "es": "Energía no lineal y tensor C",
    "pt": "Energia não linear e tensor C",
    "de": "Nichtlineare Energie und Tensor C",
    "fr": "Énergie non linéaire et tenseur C",
    "tr": "Doğrusal olmayan enerji ve C tensörü",
    "hu": "Nemlineáris energia és a C tenzor",
    "zh": "非线性能量与 C 张量"
  },
  "energy-prestress": {
    "es": "Energía con pretensión",
    "pt": "Energia com pré-tensão",
    "de": "Energie mit Vorspannung",
    "fr": "Énergie avec précontrainte",
    "tr": "Öngerilmeli enerji",
    "hu": "Energia előfeszítéssel",
    "zh": "含预应力的能量"
  },
  "rotation": {
    "es": "Invariancia por rotación",
    "pt": "Invariância por rotação",
    "de": "Rotationsinvarianz",
    "fr": "Invariance par rotation",
    "tr": "Dönme değişmezliği",
    "hu": "Forgatási invariancia",
    "zh": "旋转不变性"
  },
  "dilution-floppy": {
    "es": "Dilución z = 3: G nulo",
    "pt": "Diluição z = 3: G nulo",
    "de": "Verdünnung z = 3: G verschwindet",
    "fr": "Dilution z = 3 : G nul",
    "tr": "Seyreltme z = 3: G sıfır",
    "hu": "Ritkítás z = 3: G zérus",
    "zh": "稀化 z = 3：G 为零"
  },
  "dilution-rigid": {
    "es": "Dilución z = 5.4: G/k ≥ 0.1",
    "pt": "Diluição z = 5.4: G/k ≥ 0.1",
    "de": "Verdünnung z = 5.4: G/k ≥ 0.1",
    "fr": "Dilution z = 5.4 : G/k ≥ 0.1",
    "tr": "Seyreltme z = 5.4: G/k ≥ 0.1",
    "hu": "Ritkítás z = 5.4: G/k ≥ 0.1",
    "zh": "稀化 z = 5.4：G/k ≥ 0.1"
  },
  "engine-displacement": {
    "es": "Desplazamientos frente al motor de producción",
    "pt": "Deslocamentos frente ao motor de produção",
    "de": "Verschiebungen gegen Produktionslöser",
    "fr": "Déplacements comparés au solveur de production",
    "tr": "Üretim çözücüsüyle yer değiştirmeler",
    "hu": "Elmozdulások a termékben használt megoldóval",
    "zh": "位移与生产环境求解器对比"
  },
  "engine-force": {
    "es": "Fuerzas frente al motor de producción",
    "pt": "Forças frente ao motor de produção",
    "de": "Kräfte gegen Produktionslöser",
    "fr": "Efforts comparés au solveur de production",
    "tr": "Üretim çözücüsüyle kuvvetler",
    "hu": "Erők a termékben használt megoldóval",
    "zh": "力与生产环境求解器对比"
  },
  "strip-bias": {
    "es": "Franja 13 × 52: sesgo de tamaño",
    "pt": "Faixa 13 × 52: viés de tamanho",
    "de": "Streifen 13 × 52: Größeneffekt",
    "fr": "Bande 13 × 52 : effet de taille",
    "tr": "Şerit 13 × 52: boyut etkisi",
    "hu": "13 × 52-es sáv: méreteffektus",
    "zh": "13 × 52 条带：尺寸效应"
  },
  "strip-26": {
    "es": "Franja de ancho 26: ν = 0.354",
    "pt": "Faixa de largura 26: ν = 0.354",
    "de": "Streifenbreite 26: ν = 0.354",
    "fr": "Bande de largeur 26 : ν = 0.354",
    "tr": "Şerit genişliği 26: ν = 0.354",
    "hu": "26-os sávszélesség: ν = 0.354",
    "zh": "条带宽度 26：ν = 0.354"
  },
  "strip-52": {
    "es": "Franja de ancho 52: ν = 0.345",
    "pt": "Faixa de largura 52: ν = 0.345",
    "de": "Streifenbreite 52: ν = 0.345",
    "fr": "Bande de largeur 52 : ν = 0.345",
    "tr": "Şerit genişliği 52: ν = 0.345",
    "hu": "52-es sávszélesség: ν = 0.345",
    "zh": "条带宽度 52：ν = 0.345"
  },
  "strip-extrapolation": {
    "es": "Extrapolación de Richardson",
    "pt": "Extrapolação de Richardson",
    "de": "Richardson-Extrapolation",
    "fr": "Extrapolation de Richardson",
    "tr": "Richardson ekstrapolasyonu",
    "hu": "Richardson-extrapoláció",
    "zh": "Richardson 外推"
  },
  "eq9": {
    "es": "Ec. (9) suplementaria: rigidez inversa al cuadrado",
    "pt": "Eq. (9) suplementar: rigidez inversa ao quadrado",
    "de": "Ergänzende Gl. (9): inversquadratische Steifigkeit",
    "fr": "Éq. (9) du supplément : rigidité inverse au carré",
    "tr": "Ek Denk. (9): ters kare rijitlik",
    "hu": "Kiegészítő (9) egyenlet: fordított négyzetes merevség",
    "zh": "补充材料式 (9)：反平方刚度"
  },
  "hookean-convention": {
    "es": "Constantes iguales: ν = 1/6",
    "pt": "Constantes iguais: ν = 1/6",
    "de": "Gleiche Konstanten: ν = 1/6",
    "fr": "Constantes égales : ν = 1/6",
    "tr": "Eşit sabitler: ν = 1/6",
    "hu": "Azonos állandók: ν = 1/6",
    "zh": "相同常数：ν = 1/6"
  },
  "eq9-convention": {
    "es": "Ec. (9): ν = 8/27",
    "pt": "Eq. (9): ν = 8/27",
    "de": "Gl. (9): ν = 8/27",
    "fr": "Éq. (9) : ν = 8/27",
    "tr": "Denk. (9): ν = 8/27",
    "hu": "(9) egyenlet: ν = 8/27",
    "zh": "式 (9)：ν = 8/27"
  },
  "fig7": {
    "es": "Fig. 7: línea calculada, 741 puntos",
    "pt": "Fig. 7: linha calculada, 741 pontos",
    "de": "Abb. 7: Berechnungslinie, 741 Punkte",
    "fr": "Fig. 7 : courbe calculée, 741 points",
    "tr": "Şekil 7: hesap eğrisi, 741 nokta",
    "hu": "7. ábra: számított görbe, 741 pont",
    "zh": "图 7：计算线，741 个点"
  },
  "honey-3": {
    "es": "Panal: ec. (23), k = 10⁻³",
    "pt": "Colmeia: eq. (23), k = 10⁻³",
    "de": "Waben: Gl. (23), k = 10⁻³",
    "fr": "Nid-d’abeilles : éq. (23), k = 10⁻³",
    "tr": "Petek: Denk. (23), k = 10⁻³",
    "hu": "Méhsejtrács: (23) egyenlet, k = 10⁻³",
    "zh": "蜂窝：式 (23)，k = 10⁻³"
  },
  "honey-6": {
    "es": "Panal: ec. (23), k = 10⁻⁶",
    "pt": "Colmeia: eq. (23), k = 10⁻⁶",
    "de": "Waben: Gl. (23), k = 10⁻⁶",
    "fr": "Nid-d’abeilles : éq. (23), k = 10⁻⁶",
    "tr": "Petek: Denk. (23), k = 10⁻⁶",
    "hu": "Méhsejtrács: (23) egyenlet, k = 10⁻⁶",
    "zh": "蜂窝：式 (23)，k = 10⁻⁶"
  },
  "fig9": {
    "es": "Fig. 9: módulos sin desorden",
    "pt": "Fig. 9: módulos sem desordem",
    "de": "Abb. 9: Moduln ohne Unordnung",
    "fr": "Fig. 9 : modules sans désordre",
    "tr": "Şekil 9: düzensizlik sıfırken modüller",
    "hu": "9. ábra: rendezetlenség nélküli modulusok",
    "zh": "图 9：无序度为零时的模量"
  },
  "fig5-periodic": {
    "es": "Fig. 5: comparación entre protocolos periódicos y franjas",
    "pt": "Fig. 5: comparação entre protocolos periódicos e faixas",
    "de": "Abb. 5: Vergleich periodischer Zellen mit Streifen",
    "fr": "Fig. 5 : comparaison entre cellules périodiques et bandes",
    "tr": "Şekil 5: periyodik hücre ve şerit karşılaştırması",
    "hu": "5. ábra: periodikus cella és sáv összevetése",
    "zh": "图 5：周期性单元与条带的比较"
  },
  "zero-crossing": {
    "es": "Cruce por cero entre protocolos",
    "pt": "Cruzamento por zero entre protocolos",
    "de": "Nulldurchgang verschiedener Protokolle",
    "fr": "Passage à zéro entre protocoles",
    "tr": "Protokoller arası sıfır geçişi",
    "hu": "Zérushely-átmenet a protokollok között",
    "zh": "不同方案间的过零点"
  },
  "ensemble-regression": {
    "es": "Regresión del conjunto periódico en η = 0.5",
    "pt": "Regressão do conjunto periódico em η = 0.5",
    "de": "Periodische Ensemble-Regression bei η = 0.5",
    "fr": "Régression de l’ensemble périodique à η = 0.5",
    "tr": "η = 0.5 için periyodik topluluk regresyonu",
    "hu": "Periodikus sokaság regressziója η = 0.5 esetén",
    "zh": "η = 0.5 时周期性系综的回归"
  }
};
export function checkLabel(check: {id: string; name: string}, locale: string) {
  const value = labels[check.id]?.[locale] ?? check.name;
  return value.replace(/\b\d+\.\d+\b/g, (n) => new Intl.NumberFormat(locale).format(Number(n)));
}
export function checkMetric(metric: string, locale: string) {
  const metrics: Record<string, string> = {
    'relative difference': '|Δ| / |ref|', 'absolute difference': '|Δ|', 'max relative difference': 'max |Δ| / |ref|',
    'nonaffinity': 'Γ', 'max difference': 'max |Δ|', 'max absolute difference': 'max |Δ|',
    'max |nu difference|': 'max |Δν|', 'max |Y difference|': 'max |ΔY|', 'markers outside': 'Σ(ν ∉ [lo − 0.003, hi + 0.003])',
    '|mean nu - recorded mean|': '|⟨ν⟩ − νref|',
  };
  return (metrics[metric] ?? metric).replace(/\b\d+\.\d+\b/g, (n) => new Intl.NumberFormat(locale).format(Number(n)));
}
const comparisonLabels: Record<string, Record<string, string>> = {
  eq9: {
    en: 'Ordered lattices, ν (Supplemental Eq. 9), 7 lattices × 37 orientations',
    es: 'Redes ordenadas, ν (ec. 9 suplementaria), 7 redes × 37 orientaciones',
    pt: 'Redes ordenadas, ν (eq. 9 suplementar), 7 redes × 37 orientações',
    de: 'Geordnete Gitter, ν (ergänzende Gl. 9), 7 Gitter × 37 Orientierungen',
    fr: 'Réseaux ordonnés, ν (éq. 9 du supplément), 7 réseaux × 37 orientations',
    tr: 'Düzenli kafesler, ν (Ek Denk. 9), 7 kafes × 37 yönelim',
    hu: 'Rendezett rácsok, ν (kiegészítő 9. egyenlet), 7 rács × 37 irány',
    zh: '有序点阵的 ν（补充材料式 9），7 种点阵 × 37 个方向',
  },
  fig7: {
    en: 'Young’s modulus of the (3, 2) lattice against orientation, times the triangle area',
    es: 'Módulo de Young de la red (3, 2) según la orientación, por el área del triángulo',
    pt: 'Módulo de Young da rede (3, 2) em função da orientação, vezes a área do triângulo',
    de: 'Elastizitätsmodul des (3, 2)-Gitters über der Orientierung, mal Dreiecksfläche',
    fr: 'Module d’Young du réseau (3, 2) selon l’orientation, multiplié par l’aire du triangle',
    tr: '(3, 2) kafesinin yönelime göre Young modülü, üçgen alanıyla çarpılmış',
    hu: 'A (3, 2) rács Young-modulusa az irány függvényében, a háromszög területével szorozva',
    zh: '(3, 2) 点阵杨氏模量随方向的变化，乘以三角形面积',
  },
  'honey-3': {
    en: 'Honeycomb ν, Eq. (23), soft center springs k = 10⁻³',
    es: 'Panal: ν según la ec. (23), resortes centrales blandos k = 10⁻³',
    pt: 'Colmeia: ν pela eq. (23), molas centrais macias k = 10⁻³',
    de: 'Waben: ν nach Gl. (23), weiche Mittelfedern k = 10⁻³',
    fr: 'Nid-d’abeilles : ν selon l’éq. (23), ressorts centraux souples k = 10⁻³',
    tr: 'Petek: Denk. (23)’e göre ν, yumuşak merkez yayları k = 10⁻³',
    hu: 'Méhsejtrács: ν a (23) egyenlet szerint, puha középső rugók, k = 10⁻³',
    zh: '蜂窝：式 (23) 的 ν，软中心弹簧 k = 10⁻³',
  },
  'honey-6': {
    en: 'Honeycomb ν, Eq. (23), soft center springs k = 10⁻⁶',
    es: 'Panal: ν según la ec. (23), resortes centrales blandos k = 10⁻⁶',
    pt: 'Colmeia: ν pela eq. (23), molas centrais macias k = 10⁻⁶',
    de: 'Waben: ν nach Gl. (23), weiche Mittelfedern k = 10⁻⁶',
    fr: 'Nid-d’abeilles : ν selon l’éq. (23), ressorts centraux souples k = 10⁻⁶',
    tr: 'Petek: Denk. (23)’e göre ν, yumuşak merkez yayları k = 10⁻⁶',
    hu: 'Méhsejtrács: ν a (23) egyenlet szerint, puha középső rugók, k = 10⁻⁶',
    zh: '蜂窝：式 (23) 的 ν，软中心弹簧 k = 10⁻⁶',
  },
  'fig9-bulk': {
    en: 'Bulk modulus B of the perfect triangular lattice (Fig. 9, η = 0)',
    es: 'Módulo volumétrico B de la red triangular perfecta (Fig. 9, η = 0)',
    pt: 'Módulo volumétrico B da rede triangular perfeita (Fig. 9, η = 0)',
    de: 'Kompressionsmodul B des perfekten Dreiecksgitters (Abb. 9, η = 0)',
    fr: 'Module de compressibilité B du réseau triangulaire parfait (fig. 9, η = 0)',
    tr: 'Kusursuz üçgen kafesin hacim modülü B (Şekil 9, η = 0)',
    hu: 'A tökéletes háromszögrács B térfogati modulusa (9. ábra, η = 0)',
    zh: '完美三角形点阵的体积模量 B（图 9，η = 0）',
  },
  'fig9-shear': {
    en: 'Shear modulus G of the perfect triangular lattice (Fig. 9, η = 0)',
    es: 'Módulo de corte G de la red triangular perfecta (Fig. 9, η = 0)',
    pt: 'Módulo de cisalhamento G da rede triangular perfeita (Fig. 9, η = 0)',
    de: 'Schubmodul G des perfekten Dreiecksgitters (Abb. 9, η = 0)',
    fr: 'Module de cisaillement G du réseau triangulaire parfait (fig. 9, η = 0)',
    tr: 'Kusursuz üçgen kafesin kayma modülü G (Şekil 9, η = 0)',
    hu: 'A tökéletes háromszögrács G nyírási modulusa (9. ábra, η = 0)',
    zh: '完美三角形点阵的剪切模量 G（图 9，η = 0）',
  },
  'fig5-periodic': {
    en: 'Foam ν, periodic mean against the Fig. 5 strip error bars (η = 0 … {last}; different protocols)',
    es: 'Espuma: ν periódico medio frente a las barras de error de la Fig. 5 (η = 0 … {last}; protocolos distintos)',
    pt: 'Espuma: ν periódico médio diante das barras de erro da Fig. 5 (η = 0 … {last}; protocolos diferentes)',
    de: 'Schaum: mittleres periodisches ν gegen die Fehlerbalken der Abb. 5 (η = 0 … {last}; verschiedene Protokolle)',
    fr: 'Mousse : ν périodique moyen face aux barres d’erreur de la fig. 5 (η = 0 … {last} ; protocoles différents)',
    tr: 'Köpük: periyodik ortalama ν, Şekil 5 hata çubuklarına karşı (η = 0 … {last}; farklı protokoller)',
    hu: 'Hab: a periodikus átlagos ν az 5. ábra hibasávjaihoz képest (η = 0 … {last}; eltérő protokollok)',
    zh: '泡沫：周期性平均 ν 与图 5 误差棒对比（η = 0 … {last}；方案不同）',
  },
  'zero-crossing': {
    en: 'Disorder η where the foam’s ν crosses zero (periodic cells; the paper used strips)',
    es: 'Desorden η en que el ν de la espuma cruza cero (celdas periódicas; el artículo usó franjas)',
    pt: 'Desordem η em que o ν da espuma cruza zero (células periódicas; o artigo usou faixas)',
    de: 'Unordnung η, bei der ν des Schaums null wird (periodische Zellen; der Artikel nutzt Streifen)',
    fr: 'Désordre η auquel le ν de la mousse s’annule (cellules périodiques ; l’article utilise des bandes)',
    tr: 'Köpüğün ν değerinin sıfırı geçtiği düzensizlik η (periyodik hücreler; makale şerit kullandı)',
    hu: 'Az a η rendezetlenség, ahol a hab ν-je nullán halad át (periodikus cellák; a cikk sávokat használt)',
    zh: '泡沫 ν 过零时的无序度 η（周期性单元；论文使用条带）',
  },
  strip: {
    en: 'Strip ν at η = {eta} (13 × 52, mean of 10 samples)',
    es: 'ν de la franja en η = {eta} (13 × 52, media de 10 muestras)',
    pt: 'ν da faixa em η = {eta} (13 × 52, média de 10 amostras)',
    de: 'ν des Streifens bei η = {eta} (13 × 52, Mittel aus 10 Proben)',
    fr: 'ν de la bande à η = {eta} (13 × 52, moyenne de 10 échantillons)',
    tr: 'η = {eta} için şerit ν değeri (13 × 52, 10 örneğin ortalaması)',
    hu: 'A sáv ν-je η = {eta} esetén (13 × 52, 10 minta átlaga)',
    zh: 'η = {eta} 时条带的 ν（13 × 52，10 个样本的平均值）',
  },
};
export function comparisonNames(rows: { id: string; eta?: number; samples?: number[][] }[], locale: string): Record<string, string> {
  const nf = (n: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const pick = (key: string) => comparisonLabels[key][locale] ?? comparisonLabels[key].en;
  const etas = rows.find(r => r.id === 'fig5-periodic')?.samples?.map(p => p[0]) ?? [];
  const last = etas.length ? nf(Math.max(...etas)) : '…';
  return Object.fromEntries(rows.map((r) => [r.id, r.eta !== undefined
    ? pick('strip').replace('{eta}', nf(r.eta))
    : (comparisonLabels[r.id] ? pick(r.id).replace('{last}', last) : r.id)]));
}
