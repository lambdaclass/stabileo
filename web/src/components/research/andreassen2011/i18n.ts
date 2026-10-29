// Article strings share the research platform’s English fallback.
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

export const text = {
  en: { ...article, run: 'Recompute live', stop: 'Stop', restart: 'Restart', play: 'Play', pause: 'Pause', density: 'Density', convergence: 'Convergence', compliance: 'Compliance', volume: 'Volume fraction', iteration: 'Iteration', sensitivity: 'Sensitivity', filter: 'Filter', load: 'Load case', mesh: 'Mesh', replay: 'Precomputed replay (same solver)', live: 'Live computation', cached: 'Cached result', reference: 'Authors’ reference', invalid: 'Invalid parameters or mesh exceeds 3600 cells', noOverlay: 'Reference overlay available only for the default settings', loading: 'Loading replay', failed: 'Could not load experiment assets', penal: 'Penalization', radius: 'Filter radius', material: 'Black = material' },
  es: { ...article, run: 'Recalcular en vivo', stop: 'Detener', restart: 'Reiniciar', play: 'Reproducir', pause: 'Pausar', density: 'Densidad', convergence: 'Convergencia', compliance: 'Flexibilidad', volume: 'Fracción de volumen', iteration: 'Iteración', sensitivity: 'Sensibilidad', filter: 'Filtro', load: 'Caso de carga', mesh: 'Malla', replay: 'Reproducción precalculada (mismo solver)', live: 'Cálculo en vivo', cached: 'Resultado guardado', reference: 'Referencia de los autores', invalid: 'Parámetros inválidos o malla de más de 3600 celdas', noOverlay: 'Referencia disponible solo para los parámetros predeterminados', loading: 'Cargando reproducción', failed: 'No se pudo cargar el experimento', penal: 'Penalización', radius: 'Radio del filtro', material: 'Negro = material' },
  pt: { ...article, run: 'Recalcular ao vivo', stop: 'Parar', restart: 'Reiniciar', play: 'Reproduzir', pause: 'Pausar', density: 'Densidade', convergence: 'Convergência', compliance: 'Flexibilidade', volume: 'Fração de volume', iteration: 'Iteração', sensitivity: 'Sensibilidade', filter: 'Filtro', load: 'Caso de carga', mesh: 'Malha', replay: 'Reprodução pré-calculada (mesmo solver)', live: 'Cálculo ao vivo', cached: 'Resultado salvo', reference: 'Referência dos autores', invalid: 'Parâmetros inválidos ou malha com mais de 3600 células', noOverlay: 'Referência disponível apenas para os parâmetros padrão', loading: 'Carregando reprodução', failed: 'Não foi possível carregar o experimento', penal: 'Penalização', radius: 'Raio do filtro', material: 'Preto = material' },
};

export const topoptStrings = (locale: string) => text[locale as keyof typeof text] ?? text.en;
