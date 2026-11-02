// Research-local article keys use English fallback, like the shared research dictionary.
const article = {
  "title": "MacNeal–Harder (1985): engine benchmarks",
  "lead": "The production Stabileo engine, tested live against stated references. Every result below is computed in this browser; failures stay visible.",
  "referenceWhy": "No separate reference solver: this page runs the production engine.",
  "publishedWhy": "Numerical table provenance pending. The live table separates paper-reference cases from analytical frame adaptations.",
  "testedHeading": "What is tested",
  "testedDescription": "MacNeal and Harder proposed accuracy problems for finite elements. This first selection runs straight cantilevers with regular, trapezoidal and parallelogram meshes using MITC4 shells, plus the existing Euler–Bernoulli frame adaptations. It is not a claim to pass the entire published problem set.",
  "modelDescription": "The shell strip has length 6, width 0.2, thickness 0.1, Young’s modulus 10⁷ and Poisson’s ratio 0.3, with six elements and a unit end force. The engine takes modulus divided by 1000. The frame adaptations retain their own material, section and meshes; their analytical values are not the paper’s tabulated shell values.",
  "definitionHeading": "One benchmark definition",
  "definitionLink": "The engine-owned case file",
  "definitionDescription": " contains the inputs, measurement locations, references, sources and tolerances. Native tests and this page read it. No research solver supplies these results.",
  "accuracyHeading": "Accuracy and regression bounds",
  "accuracyDescription": "The live table uses a strict relative error below 2%. Existing native tests also check convergence, rigid modes and regression floors. A permissive regression floor is not an accuracy pass. The Research workflow compares native and WASM values and classifications.",
  "limitationsHeading": "Known limitations and registry",
  "limitationsBeforeRegistry": "Distorted low-order elements can lock. Failing rows link here and remain in the denominator. The ",
  "registryLink": "engine known-issues registry",
  "registryStatus": " currently contains no open shell entry. ",
  "ledgerLink": "The engine test ledger records the four live failures",
  "limitationsAfterLedger": ". A solver-owner decision is needed to add runtime diagnostics; this track does not edit production engine code.",
  "referenceProvenance": "Reference values retain the existing tests’ provenance. The original paper’s exact numerical table/page locators still require verification. Native shell suites also cover roof, cylinder, hemisphere and twisted-beam configurations; they are not included in this first live selection.",
  "hook": "Run the production engine on shared accuracy cases; inspect every result, including failures."
};
export const strings = {
  en: { ...article, run: 'Run again', running: 'Running production engine…', summary: 'Stabileo passes MacNeal–Harder', within: 'within', subset: 'Selected cases; not the entire published suite', reference: 'Reference', error: 'Error', pass: 'Pass', fail: 'Fail', pending: 'Not computed', native: 'Covered in native CI only', open: 'Open in Stabileo', viewer: 'Model', results: 'Results', issue: 'Known limitation / registry status', projection: 'Projection: x versus displacement direction; out-of-plane deflection is drawn vertically on the plan mesh.', scale: 'Deformation scale', failed: 'Engine unavailable', select: 'Case' },
  es: { ...article, run: 'Ejecutar de nuevo', running: 'Ejecutando el motor de producción…', summary: 'Stabileo supera MacNeal–Harder', within: 'dentro del', subset: 'Casos seleccionados; no es la serie publicada completa', reference: 'Referencia', error: 'Error', pass: 'Cumple', fail: 'No cumple', pending: 'Sin calcular', native: 'Cubierto solo en CI nativo', open: 'Abrir en Stabileo', viewer: 'Modelo', results: 'Resultados', issue: 'Limitación conocida / estado del registro', projection: 'Proyección: x y dirección del desplazamiento; la deformación fuera del plano se dibuja verticalmente sobre la malla en planta.', scale: 'Escala de deformación', failed: 'Motor no disponible', select: 'Caso' },
  pt: { ...article, run: 'Executar novamente', running: 'Executando o motor de produção…', summary: 'Stabileo passa MacNeal–Harder', within: 'dentro de', subset: 'Casos selecionados; não é a série publicada completa', reference: 'Referência', error: 'Erro', pass: 'Passa', fail: 'Falha', pending: 'Não calculado', native: 'Coberto apenas no CI nativo', open: 'Abrir no Stabileo', viewer: 'Modelo', results: 'Resultados', issue: 'Limitação conhecida / estado do registro', projection: 'Projeção: x e direção do deslocamento; a deformação fora do plano é desenhada verticalmente sobre a malha em planta.', scale: 'Escala de deformação', failed: 'Motor indisponível', select: 'Caso' },
};
