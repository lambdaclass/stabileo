const labels: Record<string, Record<string, string>> = {
  "triangular-bulk": {
    "es": "Módulo volumétrico triangular",
    "pt": "Módulo volumétrico triangular",
    "de": "Kompressionsmodul Dreiecksgitter",
    "fr": "Module volumique triangulaire",
    "tr": "Üçgen hacim modülü",
    "hu": "Háromszögrács térfogati modulusa",
    'it': "Modulo di compressibilità triangolare",
    "zh": "三角形点阵体积模量",
    "nl": "Compressiemodulus driehoeksrooster"
  },
  "triangular-shear": {
    "es": "Módulo de corte triangular",
    "pt": "Módulo de cisalhamento triangular",
    "de": "Schubmodul Dreiecksgitter",
    "fr": "Module de cisaillement triangulaire",
    "tr": "Üçgen kayma modülü",
    "hu": "Háromszögrács nyírási modulusa",
    'it': "Modulo di taglio triangolare",
    "zh": "三角形点阵剪切模量",
    "nl": "Glijdingsmodulus driehoeksrooster"
  },
  "triangular-poisson": {
    "es": "Poisson triangular = 1/3",
    "pt": "Poisson triangular = 1/3",
    "de": "Poissonzahl Dreiecksgitter = 1/3",
    "fr": "Poisson triangulaire = 1/3",
    "tr": "Üçgen Poisson = 1/3",
    "hu": "Háromszögrács Poisson-tényezője = 1/3",
    'it': "Poisson triangolare = 1/3",
    "zh": "三角形点阵泊松比 = 1/3",
    "nl": "Poisson driehoeksrooster = 1/3"
  },
  "triangular-isotropy": {
    "es": "Isotropía triangular",
    "pt": "Isotropia triangular",
    "de": "Isotropie Dreiecksgitter",
    "fr": "Isotropie triangulaire",
    "tr": "Üçgen izotropi",
    "hu": "Háromszögrács izotrópiája",
    'it': "Isotropia triangolare",
    "zh": "三角形点阵各向同性",
    "nl": "Isotropie driehoeksrooster"
  },
  "triangular-affinity": {
    "es": "Desplazamiento no afín nulo",
    "pt": "Deslocamento não afim nulo",
    "de": "Keine nichtaffine Verschiebung",
    "fr": "Déplacement non affine nul",
    "tr": "Afin olmayan yer değiştirme sıfır",
    "hu": "Nincs nem affin elmozdulás",
    'it': "Spostamento non affine nullo",
    "zh": "无非仿射位移",
    "nl": "Geen niet-affiene verplaatsing"
  },
  "bravais-stiffness": {
    "es": "Rigidez periódica = Cauchy–Born",
    "pt": "Rigidez periódica = Cauchy–Born",
    "de": "Periodische Steifigkeit = Cauchy–Born",
    "fr": "Rigidité périodique = Cauchy–Born",
    "tr": "Periyodik rijitlik = Cauchy–Born",
    "hu": "Periodikus merevség = Cauchy–Born",
    'it': "Rigidezza periodica = Cauchy–Born",
    "zh": "周期性刚度 = Cauchy–Born",
    "nl": "Periodieke stijfheid = Cauchy–Born"
  },
  "bravais-cauchy": {
    "es": "Relación de Cauchy",
    "pt": "Relação de Cauchy",
    "de": "Cauchy-Beziehung",
    "fr": "Relation de Cauchy",
    "tr": "Cauchy bağıntısı",
    "hu": "Cauchy-reláció",
    'it': "Relazione di Cauchy",
    "zh": "Cauchy 关系",
    "nl": "Cauchy-relatie"
  },
  "square-shear": {
    "es": "Red cuadrada: corte nulo",
    "pt": "Rede quadrada: cisalhamento nulo",
    "de": "Quadratgitter: kein Schubmodul",
    "fr": "Réseau carré : cisaillement nul",
    "tr": "Kare kafes: kayma sıfır",
    "hu": "Négyzetrács: zérus nyírási modulus",
    'it': "Reticolo quadrato: modulo di taglio nullo",
    "zh": "正方形点阵：剪切模量为零",
    "nl": "Vierkant rooster: glijdingsmodulus nul"
  },
  "square-stiffness": {
    "es": "Red cuadrada: rigidez axial",
    "pt": "Rede quadrada: rigidez axial",
    "de": "Quadratgitter: axiale Steifigkeit",
    "fr": "Réseau carré : rigidité axiale",
    "tr": "Kare kafes: eksenel rijitlik",
    "hu": "Négyzetrács: tengelyirányú merevség",
    'it': "Reticolo quadrato: rigidezza assiale",
    "zh": "正方形点阵：轴向刚度",
    "nl": "Vierkant rooster: axiale stijfheid"
  },
  "square-tension": {
    "es": "Red cuadrada en tracción: C33 = 2t",
    "pt": "Rede quadrada em tração: C33 = 2t",
    "de": "Quadratgitter unter Zug: C33 = 2t",
    "fr": "Réseau carré en traction : C33 = 2t",
    "tr": "Çekmedeki kare kafes: C33 = 2t",
    "hu": "Húzott négyzetrács: C33 = 2t",
    'it': "Reticolo quadrato in trazione: C33 = 2t",
    "zh": "受拉正方形点阵：C33 = 2t",
    "nl": "Vierkant rooster onder trek: C33 = 2t"
  },
  "energy": {
    "es": "Energía no lineal y tensor C",
    "pt": "Energia não linear e tensor C",
    "de": "Nichtlineare Energie und Tensor C",
    "fr": "Énergie non linéaire et tenseur C",
    "tr": "Doğrusal olmayan enerji ve C tensörü",
    "hu": "Nemlineáris energia és a C tenzor",
    'it': "Energia non lineare e tensore C",
    "zh": "非线性能量与 C 张量",
    "nl": "Niet-lineaire energie en tensor C"
  },
  "energy-prestress": {
    "es": "Energía con pretensión",
    "pt": "Energia com pré-tensão",
    "de": "Energie mit Vorspannung",
    "fr": "Énergie avec précontrainte",
    "tr": "Öngerilmeli enerji",
    "hu": "Energia előfeszítéssel",
    'it': "Energia con pretensione",
    "zh": "含预应力的能量",
    "nl": "Energie met voorspanning"
  },
  "rotation": {
    "es": "Invariancia por rotación",
    "pt": "Invariância por rotação",
    "de": "Rotationsinvarianz",
    "fr": "Invariance par rotation",
    "tr": "Dönme değişmezliği",
    "hu": "Forgatási invariancia",
    'it': "Invarianza per rotazione",
    "zh": "旋转不变性",
    "nl": "Invariantie onder rotatie"
  },
  "dilution-floppy": {
    "es": "Dilución z = 3",
    "pt": "Diluição z = 3",
    "de": "Verdünnung z = 3",
    "fr": "Dilution z = 3",
    "tr": "Seyreltme z = 3",
    "hu": "Ritkítás z = 3",
    'it': "Diluizione z = 3",
    "zh": "稀化 z = 3",
    "nl": "Verdunning z = 3"
  },
  "dilution-rigid": {
    "es": "Dilución z = 5.4: G/k ≥ 0.1",
    "pt": "Diluição z = 5.4: G/k ≥ 0.1",
    "de": "Verdünnung z = 5.4: G/k ≥ 0.1",
    "fr": "Dilution z = 5.4 : G/k ≥ 0.1",
    "tr": "Seyreltme z = 5.4: G/k ≥ 0.1",
    "hu": "Ritkítás z = 5.4: G/k ≥ 0.1",
    'it': "Diluizione z = 5.4: G/k ≥ 0.1",
    "zh": "稀化 z = 5.4：G/k ≥ 0.1",
    "nl": "Verdunning z = 5.4: G/k ≥ 0.1"
  },
  "engine-displacement": {
    "es": "Desplazamientos frente al motor de producción",
    "pt": "Deslocamentos frente ao motor de produção",
    "de": "Verschiebungen gegen Produktionslöser",
    "fr": "Déplacements comparés au solveur de production",
    "tr": "Üretim çözücüsüyle yer değiştirmeler",
    "hu": "Elmozdulások a termékben használt megoldóval",
    'it': "Spostamenti rispetto al motore di produzione",
    "zh": "位移与生产环境求解器对比",
    "nl": "Verplaatsingen ten opzichte van de productie-engine"
  },
  "engine-force": {
    "es": "Fuerzas frente al motor de producción",
    "pt": "Forças frente ao motor de produção",
    "de": "Kräfte gegen Produktionslöser",
    "fr": "Efforts comparés au solveur de production",
    "tr": "Üretim çözücüsüyle kuvvetler",
    "hu": "Erők a termékben használt megoldóval",
    'it': "Forze rispetto al motore di produzione",
    "zh": "力与生产环境求解器对比",
    "nl": "Krachten ten opzichte van de productie-engine"
  },
  "strip-bias": {
    "es": "Franja 13 × 52: sesgo de tamaño",
    "pt": "Faixa 13 × 52: viés de tamanho",
    "de": "Streifen 13 × 52: Größeneffekt",
    "fr": "Bande 13 × 52 : effet de taille",
    "tr": "Şerit 13 × 52: boyut etkisi",
    "hu": "13 × 52-es sáv: méreteffektus",
    'it': "Striscia 13 × 52: distorsione di dimensione",
    "zh": "13 × 52 条带：尺寸效应",
    "nl": "Strip 13 × 52: afmetingseffect"
  },
  "strip-26": {
    "es": "Franja de ancho 26: ν = 0.354",
    "pt": "Faixa de largura 26: ν = 0.354",
    "de": "Streifenbreite 26: ν = 0.354",
    "fr": "Bande de largeur 26 : ν = 0.354",
    "tr": "Şerit genişliği 26: ν = 0.354",
    "hu": "26-os sávszélesség: ν = 0.354",
    'it': "Striscia di larghezza 26: ν = 0.354",
    "zh": "条带宽度 26：ν = 0.354",
    "nl": "Strip met breedte 26: ν = 0.354"
  },
  "strip-52": {
    "es": "Franja de ancho 52: ν = 0.345",
    "pt": "Faixa de largura 52: ν = 0.345",
    "de": "Streifenbreite 52: ν = 0.345",
    "fr": "Bande de largeur 52 : ν = 0.345",
    "tr": "Şerit genişliği 52: ν = 0.345",
    "hu": "52-es sávszélesség: ν = 0.345",
    'it': "Striscia di larghezza 52: ν = 0.345",
    "zh": "条带宽度 52：ν = 0.345",
    "nl": "Strip met breedte 52: ν = 0.345"
  },
  "strip-extrapolation": {
    "es": "Extrapolación de Richardson",
    "pt": "Extrapolação de Richardson",
    "de": "Richardson-Extrapolation",
    "fr": "Extrapolation de Richardson",
    "tr": "Richardson ekstrapolasyonu",
    "hu": "Richardson-extrapoláció",
    'it': "Estrapolazione di Richardson",
    "zh": "Richardson 外推",
    "nl": "Richardson-extrapolatie"
  },
  "eq9": {
    "es": "Ec. (9) suplementaria: rigidez inversa al cuadrado",
    "pt": "Eq. (9) suplementar: rigidez inversa ao quadrado",
    "de": "Ergänzende Gl. (9): inversquadratische Steifigkeit",
    "fr": "Éq. (9) du supplément : rigidité inverse au carré",
    "tr": "Ek Denk. (9): ters kare rijitlik",
    "hu": "Kiegészítő (9) egyenlet: fordított négyzetes merevség",
    'it': "Eq. (9) supplementare: rigidezza inversa al quadrato",
    "zh": "补充材料式 (9)：反平方刚度",
    "nl": "Aanvullende vgl. (9): omgekeerd-kwadratische afhankelijkheid van de stijfheid"
  },
  "hookean-convention": {
    "es": "Constantes iguales: ν = 1/6",
    "pt": "Constantes iguais: ν = 1/6",
    "de": "Gleiche Konstanten: ν = 1/6",
    "fr": "Constantes égales : ν = 1/6",
    "tr": "Eşit sabitler: ν = 1/6",
    "hu": "Azonos állandók: ν = 1/6",
    'it': "Costanti uguali: ν = 1/6",
    "zh": "相同常数：ν = 1/6",
    "nl": "Gelijke constanten: ν = 1/6"
  },
  "eq9-convention": {
    "es": "Ec. (9): ν = 8/27",
    "pt": "Eq. (9): ν = 8/27",
    "de": "Gl. (9): ν = 8/27",
    "fr": "Éq. (9) : ν = 8/27",
    "tr": "Denk. (9): ν = 8/27",
    "hu": "(9) egyenlet: ν = 8/27",
    'it': "Eq. (9): ν = 8/27",
    "zh": "式 (9)：ν = 8/27",
    "nl": "Vgl. (9): ν = 8/27"
  },
  "fig7": {
    "es": "Fig. 7: línea calculada, 741 puntos",
    "pt": "Fig. 7: linha calculada, 741 pontos",
    "de": "Abb. 7: Berechnungslinie, 741 Punkte",
    "fr": "Fig. 7 : courbe calculée, 741 points",
    "tr": "Şekil 7: hesap eğrisi, 741 nokta",
    "hu": "7. ábra: számított görbe, 741 pont",
    'it': "Fig. 7: linea calcolata, 741 punti",
    "zh": "图 7：计算线，741 个点",
    "nl": "Fig. 7: berekende lijn, 741 punten"
  },
  "honey-3": {
    "es": "Panal: ec. (23), k = 10⁻³",
    "pt": "Colmeia: eq. (23), k = 10⁻³",
    "de": "Waben: Gl. (23), k = 10⁻³",
    "fr": "Nid-d’abeilles : éq. (23), k = 10⁻³",
    "tr": "Petek: Denk. (23), k = 10⁻³",
    "hu": "Méhsejtrács: (23) egyenlet, k = 10⁻³",
    'it': "Nido d’ape: eq. (23), k = 10⁻³",
    "zh": "蜂窝：式 (23)，k = 10⁻³",
    "nl": "Honingraat: vgl. (23), k = 10⁻³"
  },
  "honey-6": {
    "es": "Panal: ec. (23), k = 10⁻⁶",
    "pt": "Colmeia: eq. (23), k = 10⁻⁶",
    "de": "Waben: Gl. (23), k = 10⁻⁶",
    "fr": "Nid-d’abeilles : éq. (23), k = 10⁻⁶",
    "tr": "Petek: Denk. (23), k = 10⁻⁶",
    "hu": "Méhsejtrács: (23) egyenlet, k = 10⁻⁶",
    'it': "Nido d’ape: eq. (23), k = 10⁻⁶",
    "zh": "蜂窝：式 (23)，k = 10⁻⁶",
    "nl": "Honingraat: vgl. (23), k = 10⁻⁶"
  },
  "fig9": {
    "es": "Fig. 9: módulos sin desorden",
    "pt": "Fig. 9: módulos sem desordem",
    "de": "Abb. 9: Moduln ohne Unordnung",
    "fr": "Fig. 9 : modules sans désordre",
    "tr": "Şekil 9: düzensiz olmayan modüller",
    "hu": "9. ábra: rendezetlenség nélküli modulusok",
    'it': "Fig. 9: moduli senza disordine",
    "zh": "图 9：无无序度时的模量",
    "nl": "Fig. 9: moduli zonder wanorde"
  },
  "fig5-periodic": {
    "es": "Fig. 5: comparación entre protocolos periódicos y franjas",
    "pt": "Fig. 5: comparação entre protocolos periódicos e faixas",
    "de": "Abb. 5: Vergleich periodischer Zellen mit Streifen",
    "fr": "Fig. 5 : comparaison entre cellules périodiques et bandes",
    "tr": "Şekil 5: periyodik hücre ve şerit karşılaştırması",
    "hu": "5. ábra: periodikus cella és sáv összevetése",
    'it': "Fig. 5: confronto tra protocolli periodici e strisce",
    "zh": "图 5：周期性单元与条带的比较",
    "nl": "Fig. 5: vergelijking tussen periodieke cellen en stroken"
  },
  "zero-crossing": {
    "es": "Cruce por cero entre protocolos",
    "pt": "Cruzamento por zero entre protocolos",
    "de": "Nulldurchgang verschiedener Protokolle",
    "fr": "Passage à zéro entre protocoles",
    "tr": "Protokoller arası sıfır geçişi",
    "hu": "Zérushely-átmenet a protokollok között",
    'it': "Passaggio per zero tra protocolli",
    "zh": "不同方案间的过零点",
    "nl": "Nuldoorgang tussen protocollen"
  },
  "ensemble-regression": {
    "es": "Regresión del conjunto periódico en η = 0.5",
    "pt": "Regressão do conjunto periódico em η = 0.5",
    "de": "Periodische Ensemble-Regression bei η = 0.5",
    "fr": "Régression de l’ensemble périodique à η = 0.5",
    "tr": "η = 0.5 için periyodik topluluk regresyonu",
    "hu": "Periodikus sokaság regressziója η = 0.5 esetén",
    'it': "Regressione dell’insieme periodico a η = 0.5",
    "zh": "η = 0.5 时周期性系综的回归",
    "nl": "Regressie van het periodieke ensemble bij η = 0.5"
  }
};
export function checkLabel(check: {id: string; name: string; tolerance: number}, locale: string) {
  const value = labels[check.id]?.[locale] ?? check.name;
  if (check.id === 'dilution-floppy') return `${value}: max |G|/k ≤ ${check.tolerance.toExponential()}`;
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
