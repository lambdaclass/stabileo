const labels: Record<string, Record<string, string>> = {
  "triangular-bulk": {
    "es": "Módulo volumétrico triangular",
    "pt": "Módulo volumétrico triangular",
    "de": "Kompressionsmodul Dreiecksgitter",
    "fr": "Module volumique triangulaire",
    "tr": "Üçgen hacim modülü"
  },
  "triangular-shear": {
    "es": "Módulo de corte triangular",
    "pt": "Módulo de cisalhamento triangular",
    "de": "Schubmodul Dreiecksgitter",
    "fr": "Module de cisaillement triangulaire",
    "tr": "Üçgen kayma modülü"
  },
  "triangular-poisson": {
    "es": "Poisson triangular = 1/3",
    "pt": "Poisson triangular = 1/3",
    "de": "Poissonzahl Dreiecksgitter = 1/3",
    "fr": "Poisson triangulaire = 1/3",
    "tr": "Üçgen Poisson = 1/3"
  },
  "triangular-isotropy": {
    "es": "Isotropía triangular",
    "pt": "Isotropia triangular",
    "de": "Isotropie Dreiecksgitter",
    "fr": "Isotropie triangulaire",
    "tr": "Üçgen izotropi"
  },
  "triangular-affinity": {
    "es": "Desplazamiento no afín nulo",
    "pt": "Deslocamento não afim nulo",
    "de": "Keine nichtaffine Verschiebung",
    "fr": "Déplacement non affine nul",
    "tr": "Afin olmayan yer değiştirme sıfır"
  },
  "bravais-stiffness": {
    "es": "Rigidez periódica = Cauchy–Born",
    "pt": "Rigidez periódica = Cauchy–Born",
    "de": "Periodische Steifigkeit = Cauchy–Born",
    "fr": "Rigidité périodique = Cauchy–Born",
    "tr": "Periyodik rijitlik = Cauchy–Born"
  },
  "bravais-cauchy": {
    "es": "Relación de Cauchy",
    "pt": "Relação de Cauchy",
    "de": "Cauchy-Beziehung",
    "fr": "Relation de Cauchy",
    "tr": "Cauchy bağıntısı"
  },
  "square-shear": {
    "es": "Red cuadrada: corte nulo",
    "pt": "Rede quadrada: cisalhamento nulo",
    "de": "Quadratgitter: kein Schubmodul",
    "fr": "Réseau carré : cisaillement nul",
    "tr": "Kare kafes: kayma sıfır"
  },
  "square-stiffness": {
    "es": "Red cuadrada: rigidez axial",
    "pt": "Rede quadrada: rigidez axial",
    "de": "Quadratgitter: axiale Steifigkeit",
    "fr": "Réseau carré : rigidité axiale",
    "tr": "Kare kafes: eksenel rijitlik"
  },
  "square-tension": {
    "es": "Red cuadrada en tracción: C33 = 2t",
    "pt": "Rede quadrada em tração: C33 = 2t",
    "de": "Quadratgitter unter Zug: C33 = 2t",
    "fr": "Réseau carré en traction : C33 = 2t",
    "tr": "Çekmedeki kare kafes: C33 = 2t"
  },
  "energy": {
    "es": "Energía no lineal y tensor C",
    "pt": "Energia não linear e tensor C",
    "de": "Nichtlineare Energie und Tensor C",
    "fr": "Énergie non linéaire et tenseur C",
    "tr": "Doğrusal olmayan enerji ve C tensörü"
  },
  "energy-prestress": {
    "es": "Energía con pretensión",
    "pt": "Energia com pré-tensão",
    "de": "Energie mit Vorspannung",
    "fr": "Énergie avec précontrainte",
    "tr": "Öngerilmeli enerji"
  },
  "rotation": {
    "es": "Invariancia por rotación",
    "pt": "Invariância por rotação",
    "de": "Rotationsinvarianz",
    "fr": "Invariance par rotation",
    "tr": "Dönme değişmezliği"
  },
  "dilution-floppy": {
    "es": "Dilución z = 3: G nulo",
    "pt": "Diluição z = 3: G nulo",
    "de": "Verdünnung z = 3: G verschwindet",
    "fr": "Dilution z = 3 : G nul",
    "tr": "Seyreltme z = 3: G sıfır"
  },
  "dilution-rigid": {
    "es": "Dilución z = 5.4: G/k ≥ 0.1",
    "pt": "Diluição z = 5.4: G/k ≥ 0.1",
    "de": "Verdünnung z = 5.4: G/k ≥ 0.1",
    "fr": "Dilution z = 5.4 : G/k ≥ 0.1",
    "tr": "Seyreltme z = 5.4: G/k ≥ 0.1"
  },
  "engine-displacement": {
    "es": "Desplazamientos frente al motor de producción",
    "pt": "Deslocamentos frente ao motor de produção",
    "de": "Verschiebungen gegen Produktionslöser",
    "fr": "Déplacements comparés au solveur de production",
    "tr": "Üretim çözücüsüyle yer değiştirmeler"
  },
  "engine-force": {
    "es": "Fuerzas frente al motor de producción",
    "pt": "Forças frente ao motor de produção",
    "de": "Kräfte gegen Produktionslöser",
    "fr": "Efforts comparés au solveur de production",
    "tr": "Üretim çözücüsüyle kuvvetler"
  },
  "strip-bias": {
    "es": "Franja 13 × 52: sesgo de tamaño",
    "pt": "Faixa 13 × 52: viés de tamanho",
    "de": "Streifen 13 × 52: Größeneffekt",
    "fr": "Bande 13 × 52 : effet de taille",
    "tr": "Şerit 13 × 52: boyut etkisi"
  },
  "strip-26": {
    "es": "Franja de ancho 26: ν = 0.354",
    "pt": "Faixa de largura 26: ν = 0.354",
    "de": "Streifenbreite 26: ν = 0.354",
    "fr": "Bande de largeur 26 : ν = 0.354",
    "tr": "Şerit genişliği 26: ν = 0.354"
  },
  "strip-52": {
    "es": "Franja de ancho 52: ν = 0.345",
    "pt": "Faixa de largura 52: ν = 0.345",
    "de": "Streifenbreite 52: ν = 0.345",
    "fr": "Bande de largeur 52 : ν = 0.345",
    "tr": "Şerit genişliği 52: ν = 0.345"
  },
  "strip-extrapolation": {
    "es": "Extrapolación de Richardson",
    "pt": "Extrapolação de Richardson",
    "de": "Richardson-Extrapolation",
    "fr": "Extrapolation de Richardson",
    "tr": "Richardson ekstrapolasyonu"
  },
  "eq9": {
    "es": "Ec. (9) suplementaria: rigidez inversa al cuadrado",
    "pt": "Eq. (9) suplementar: rigidez inversa ao quadrado",
    "de": "Ergänzende Gl. (9): inversquadratische Steifigkeit",
    "fr": "Éq. (9) du supplément : rigidité inverse au carré",
    "tr": "Ek Denk. (9): ters kare rijitlik"
  },
  "hookean-convention": {
    "es": "Constantes iguales: ν = 1/6",
    "pt": "Constantes iguais: ν = 1/6",
    "de": "Gleiche Konstanten: ν = 1/6",
    "fr": "Constantes égales : ν = 1/6",
    "tr": "Eşit sabitler: ν = 1/6"
  },
  "eq9-convention": {
    "es": "Ec. (9): ν = 8/27",
    "pt": "Eq. (9): ν = 8/27",
    "de": "Gl. (9): ν = 8/27",
    "fr": "Éq. (9) : ν = 8/27",
    "tr": "Denk. (9): ν = 8/27"
  },
  "fig7": {
    "es": "Fig. 7: línea calculada, 741 puntos",
    "pt": "Fig. 7: linha calculada, 741 pontos",
    "de": "Abb. 7: Berechnungslinie, 741 Punkte",
    "fr": "Fig. 7 : courbe calculée, 741 points",
    "tr": "Şekil 7: hesap eğrisi, 741 nokta"
  },
  "honey-3": {
    "es": "Panal: ec. (23), k = 10⁻³",
    "pt": "Colmeia: eq. (23), k = 10⁻³",
    "de": "Waben: Gl. (23), k = 10⁻³",
    "fr": "Nid-d’abeilles : éq. (23), k = 10⁻³",
    "tr": "Petek: Denk. (23), k = 10⁻³"
  },
  "honey-6": {
    "es": "Panal: ec. (23), k = 10⁻⁶",
    "pt": "Colmeia: eq. (23), k = 10⁻⁶",
    "de": "Waben: Gl. (23), k = 10⁻⁶",
    "fr": "Nid-d’abeilles : éq. (23), k = 10⁻⁶",
    "tr": "Petek: Denk. (23), k = 10⁻⁶"
  },
  "fig9": {
    "es": "Fig. 9: módulos sin desorden",
    "pt": "Fig. 9: módulos sem desordem",
    "de": "Abb. 9: Moduln ohne Unordnung",
    "fr": "Fig. 9 : modules sans désordre",
    "tr": "Şekil 9: düzensiz olmayan modüller"
  },
  "fig5-periodic": {
    "es": "Fig. 5: comparación entre protocolos periódicos y franjas",
    "pt": "Fig. 5: comparação entre protocolos periódicos e faixas",
    "de": "Abb. 5: Vergleich periodischer Zellen mit Streifen",
    "fr": "Fig. 5 : comparaison entre cellules périodiques et bandes",
    "tr": "Şekil 5: periyodik hücre ve şerit karşılaştırması"
  },
  "zero-crossing": {
    "es": "Cruce por cero entre protocolos",
    "pt": "Cruzamento por zero entre protocolos",
    "de": "Nulldurchgang verschiedener Protokolle",
    "fr": "Passage à zéro entre protocoles",
    "tr": "Protokoller arası sıfır geçişi"
  },
  "ensemble-regression": {
    "es": "Regresión del conjunto periódico en η = 0.5",
    "pt": "Regressão do conjunto periódico em η = 0.5",
    "de": "Periodische Ensemble-Regression bei η = 0.5",
    "fr": "Régression de l’ensemble périodique à η = 0.5",
    "tr": "η = 0.5 için periyodik topluluk regresyonu"
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
