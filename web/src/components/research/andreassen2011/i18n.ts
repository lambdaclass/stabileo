// Research strings use English for unsupported locales.
const article = {
  "experimentHeading": "The experiment",
  "overview": "The authors’ abstract describes a compact successor to the 99-line code, adding density filtering and improving efficiency through preallocation and vectorization. Here we implement its main minimum-compliance method.",
  "method": "Each square uses a bilinear plane-stress element. SIMP interpolates its stiffness as E = 10⁻⁹ + ρᵖ(1 − 10⁻⁹). Optimality criteria redistribute material, with a move limit of 0.2. The engine’s sparse Cholesky solves equilibrium at every iteration.",
  "reproductionHeading": "Reproduction",
  "defaultsDescription": "Defaults: 60 × 20 elements, volume fraction 0.5, penalization 3, filter radius 2.4. These are section 3.4 and Figure 3(a) of the authors’ manuscript (pages 6–7). Sensitivity and density filtering use the same settings. Physical densities are shown.",
  "recordingDescription": "Compliance is measured before each update; volume and density are recorded after it, exactly as in top88. Stop when the largest design change is at most 0.01. The reference overlay is shown only for matching default parameters.",
  "evidenceHeading": "Evidence and limitations",
  "referenceDescription": "The reference runner downloads the authors’ unmodified function, checks its SHA-256, and observes full-precision data at its plotting calls in GNU Octave. Rust tests compare iteration counts, every compliance, volume and change, and final densities, alongside independent element and filter checks.",
  "limitations": "The accessible manuscript reports optimized images and timing tables, not final compliance or iteration counts for these cases. We do not claim a paper-figure comparison. Agreement between implementations is not experimental validation or engineering certification. Alternate boundary conditions are delegated to the 2001 paper; this experiment supports the MBB load case.",
  "title": "Topology optimization of an MBB beam",
  "lead": "An educational SIMP optimizer: redistribute a fixed amount of material to reduce compliance.",
  "viewerLabel": "Topology optimization",
  "publishedLimitations": "Figure 3 settings reproduced; no digitized figure comparison or published compliance values claimed.",
  "referenceLink": "Abstract, manuscript and authors’ reference",
  "publication": "Journal volume 43 (2011), pages 1–16; Crossref records the online publication in 2010.",
  "mbb": "MBB",
  "nelx": "Horizontal elements",
  "nely": "Vertical elements",
  "thumbnailAlt": "Material density of the optimized MBB beam",
  "hook": "Redistribute material using SIMP and compare both filters against the authors’ code."
};

const articleEs: typeof article = {
  "experimentHeading": "El experimento",
  "overview": "El resumen de los autores describe un sucesor compacto del código de 99 líneas, que añade filtrado de densidad y mejora la eficiencia mediante preasignación y vectorización. Aquí implementamos su método principal de mínima flexibilidad.",
  "method": "Cada cuadrado usa un elemento bilineal de tensión plana. SIMP interpola su rigidez como E = 10⁻⁹ + ρᵖ(1 − 10⁻⁹). Los criterios de optimalidad redistribuyen material, con un límite de movimiento de 0.2. La factorización de Cholesky dispersa del motor resuelve el equilibrio en cada iteración.",
  "reproductionHeading": "Reproducción",
  "defaultsDescription": "Valores predeterminados: 60 × 20 elementos, fracción de volumen 0.5, penalización 3, radio del filtro 2.4. Corresponden a la sección 3.4 y la Figura 3(a) del manuscrito de los autores (páginas 6–7). Los filtros de sensibilidad y densidad usan los mismos parámetros. Se muestran las densidades físicas.",
  "recordingDescription": "La flexibilidad se mide antes de cada actualización; el volumen y la densidad se registran después, exactamente como en top88. Se detiene cuando el mayor cambio de diseño es como máximo 0.01. La referencia se superpone solo si coinciden los parámetros predeterminados.",
  "evidenceHeading": "Evidencia y limitaciones",
  "referenceDescription": "El ejecutor de referencia descarga la función original de los autores, comprueba su SHA-256 y observa datos de precisión completa en sus llamadas de dibujo en GNU Octave. Las pruebas de Rust comparan el número de iteraciones, cada valor de flexibilidad, volumen y cambio, y las densidades finales, junto con comprobaciones independientes de elementos y filtros.",
  "limitations": "El manuscrito accesible presenta imágenes optimizadas y tablas de tiempos, no la flexibilidad final ni el número de iteraciones para estos casos. No afirmamos una comparación con las figuras del artículo. El acuerdo entre implementaciones no es validación experimental ni certificación de ingeniería. Las condiciones de contorno alternativas se remiten al artículo de 2001; este experimento admite el caso de carga MBB.",
  "title": "Optimización topológica de una viga MBB",
  "lead": "Un optimizador SIMP educativo: redistribuye una cantidad fija de material para reducir la flexibilidad.",
  "viewerLabel": "Optimización topológica",
  "publishedLimitations": "Parámetros de la Figura 3 reproducidos; no se afirma una comparación con figuras digitalizadas ni valores publicados de flexibilidad.",
  "referenceLink": "Resumen, manuscrito y referencia de los autores",
  "publication": "Volumen 43 (2011), páginas 1–16; Crossref registra la publicación en línea en 2010.",
  "mbb": "MBB",
  "nelx": "Elementos horizontales",
  "nely": "Elementos verticales",
  "thumbnailAlt": "Densidad de material de la viga MBB optimizada",
  "hook": "Redistribuye material mediante SIMP y compara ambos filtros con el código de los autores."
};

const articlePt: typeof article = {
  "experimentHeading": "O experimento",
  "overview": "O resumo dos autores descreve um sucessor compacto do código de 99 linhas, adicionando filtragem de densidade e melhorando a eficiência por pré-alocação e vetorização. Aqui implementamos seu método principal de mínima flexibilidade.",
  "method": "Cada quadrado usa um elemento bilinear de tensão plana. SIMP interpola sua rigidez como E = 10⁻⁹ + ρᵖ(1 − 10⁻⁹). Os critérios de optimalidade redistribuem material, com limite de movimento de 0.2. A fatoração de Cholesky esparsa do motor resolve o equilíbrio a cada iteração.",
  "reproductionHeading": "Reprodução",
  "defaultsDescription": "Valores padrão: 60 × 20 elementos, fração de volume 0.5, penalização 3, raio do filtro 2.4. Correspondem à seção 3.4 e à Figura 3(a) do manuscrito dos autores (páginas 6–7). Os filtros de sensibilidade e densidade usam os mesmos parâmetros. São mostradas as densidades físicas.",
  "recordingDescription": "A flexibilidade é medida antes de cada atualização; o volume e a densidade são registrados depois, exatamente como em top88. Para quando a maior mudança de projeto é no máximo 0.01. A referência é sobreposta apenas quando os parâmetros padrão coincidem.",
  "evidenceHeading": "Evidências e limitações",
  "referenceDescription": "O executor de referência baixa a função original dos autores, verifica seu SHA-256 e observa dados de precisão completa nas chamadas de desenho em GNU Octave. Os testes de Rust comparam o número de iterações, cada valor de flexibilidade, volume e mudança, e as densidades finais, junto com verificações independentes de elementos e filtros.",
  "limitations": "O manuscrito acessível apresenta imagens otimizadas e tabelas de tempos, não a flexibilidade final nem o número de iterações para estes casos. Não afirmamos uma comparação com as figuras do artigo. A concordância entre implementações não é validação experimental nem certificação de engenharia. As condições de contorno alternativas são remetidas ao artigo de 2001; este experimento suporta o caso de carga MBB.",
  "title": "Otimização topológica de uma viga MBB",
  "lead": "Um otimizador SIMP educativo: redistribua uma quantidade fixa de material para reduzir a flexibilidade.",
  "viewerLabel": "Otimização topológica",
  "publishedLimitations": "Parâmetros da Figura 3 reproduzidos; não se afirma uma comparação com figuras digitalizadas nem valores publicados de flexibilidade.",
  "referenceLink": "Resumo, manuscrito e referência dos autores",
  "publication": "Volume 43 (2011), páginas 1–16; Crossref registra a publicação on-line em 2010.",
  "mbb": "MBB",
  "nelx": "Elementos horizontais",
  "nely": "Elementos verticais",
  "thumbnailAlt": "Densidade de material da viga MBB otimizada",
  "hook": "Redistribua material usando SIMP e compare ambos os filtros com o código dos autores."
};

export const text = {
  en: { ...article, run: 'Recompute live', stop: 'Stop', restart: 'Restart', play: 'Play', pause: 'Pause', density: 'Density', convergence: 'Convergence', compliance: 'Compliance', volume: 'Volume fraction', iteration: 'Iteration', sensitivity: 'Sensitivity', filter: 'Filter', load: 'Load case', mesh: 'Mesh', replay: 'Precomputed replay (same solver)', live: 'Live computation', cached: 'Cached result', reference: 'Authors’ reference', invalid: 'Invalid parameters or mesh exceeds 3600 cells', noOverlay: 'Reference overlay available only for the default settings', loading: 'Loading replay', failed: 'Could not load experiment assets', penal: 'Penalization', radius: 'Filter radius', material: 'Black = material' },
  es: { ...articleEs, run: 'Recalcular en vivo', stop: 'Detener', restart: 'Reiniciar', play: 'Reproducir', pause: 'Pausar', density: 'Densidad', convergence: 'Convergencia', compliance: 'Flexibilidad', volume: 'Fracción de volumen', iteration: 'Iteración', sensitivity: 'Sensibilidad', filter: 'Filtro', load: 'Caso de carga', mesh: 'Malla', replay: 'Reproducción precalculada (mismo solver)', live: 'Cálculo en vivo', cached: 'Resultado guardado', reference: 'Referencia de los autores', invalid: 'Parámetros inválidos o malla de más de 3600 celdas', noOverlay: 'Referencia disponible solo para los parámetros predeterminados', loading: 'Cargando reproducción', failed: 'No se pudo cargar el experimento', penal: 'Penalización', radius: 'Radio del filtro', material: 'Negro = material' },
  pt: { ...articlePt, run: 'Recalcular ao vivo', stop: 'Parar', restart: 'Reiniciar', play: 'Reproduzir', pause: 'Pausar', density: 'Densidade', convergence: 'Convergência', compliance: 'Flexibilidade', volume: 'Fração de volume', iteration: 'Iteração', sensitivity: 'Sensibilidade', filter: 'Filtro', load: 'Caso de carga', mesh: 'Malha', replay: 'Reprodução pré-calculada (mesmo solver)', live: 'Cálculo ao vivo', cached: 'Resultado salvo', reference: 'Referência dos autores', invalid: 'Parâmetros inválidos ou malha com mais de 3600 células', noOverlay: 'Referência disponível apenas para os parâmetros padrão', loading: 'Carregando reprodução', failed: 'Não foi possível carregar o experimento', penal: 'Penalização', radius: 'Raio do filtro', material: 'Preto = material' },
};

export const topoptStrings = (locale: string) => text[locale as keyof typeof text] ?? text.en;
