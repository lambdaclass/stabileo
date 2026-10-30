import evidence from '../../../../../research/benchmarks/newmark-1959/VALIDATION.json';
import { researchLocale } from '../i18n';

const en = {
  title: 'Newmark average acceleration', stage: 'First version · {reviews} reviews',
  lead: 'One undamped degree of freedom under a sudden constant force. Increase the time step to see the numerical period grow.',
  model: 'The example',
  description: 'A 1 m axial frame member, fixed at the left, with only axial translation free at the right. E = 10 MPa, A = 0.01 m², synthetic density = 300000 kg/m³. The consistent axial mass gives m = ρAL/3 = 1 t and k = EA/L = 100 kN/m. A 1 kN step acts from t = 0; initial displacement and velocity are zero. This is an exact SDOF finite-element benchmark, not a continuum bar solution.',
  method: 'The production 3D time-history solver runs through the existing WASM wrapper, with β = ¼, γ = ½ and no damping. The replay is a native run of the same Rust solver. No new integrator is used.',
  reference: 'Exact reference', difference: 'Difference', measured: 'Stabileo',
  formula: 'u(t) = (F/k)[1 − cos(ωt)], ω = √(k/m) = 10 rad/s. T = 2π/ω. The discrete average-acceleration period is Tₙ = πΔt / atan(ωΔt/2). Periods below are measured from successive upward crossings of u = F/k; interpolation affects coarse-step measurements.',
  comparison: 'Period elongation versus time step', period: 'Period (s)', elongation: 'Elongation (%)',
  error: 'Maximum displacement difference (mm)',
  tolerance: 'Checks: every computed sample agrees with the discrete closed form within 10⁻¹⁰ m; measured period agrees with the discrete prediction within 0.5%. At Δt/T = 0.025, maximum error against the continuous solution is below 0.5 mm over four periods. Coarser steps deliberately show larger errors.',
  notYet: 'Not yet', limitations: ['Published figures and numerical examples from the paper.', 'Damping, harmonic loading, nonlinear response and multi-degree-of-freedom frames.', 'Independent reviews (0); this is not engineering certification.'],
  replay: 'Precomputed replay (same solver)', live: 'Live computation in your browser', cached: 'Cached result (computed in this browser)',
  run: 'Recompute live', stop: 'Stop', restart: 'Restart', busy: 'Computing…', step: 'Time step', sample: 'Sample',
  displacement: 'Axial displacement', time: 'Time (s)', scaled: 'Deformation ×10; left node fixed, right node axially guided.',
  tryCoarse: 'Try the coarsest time step', failure: 'Computation failed; previous result retained.',
  paper: 'The paper describes a time-stepping procedure for structural dynamics. Here we exercise its average-acceleration specialization on a deliberately small linear benchmark; we do not claim to reproduce a figure from the paper.',
  alt: 'Axial displacement history from our production Newmark run',
};
type Strings = { [K in keyof typeof en]: (typeof en)[K] };
const es: Strings = {
  title: 'Aceleración media de Newmark', stage: 'Primera versión · {reviews} revisiones',
  lead: 'Un grado de libertad sin amortiguamiento bajo una fuerza constante aplicada de golpe. Aumentá el paso temporal para ver cómo crece el período numérico.',
  model: 'El ejemplo',
  description: 'Una barra de pórtico axial de 1 m, fija a la izquierda y con solo la traslación axial libre a la derecha. E = 10 MPa, A = 0,01 m², densidad sintética = 300000 kg/m³. La masa axial consistente da m = ρAL/3 = 1 t y k = EA/L = 100 kN/m. Un escalón de 1 kN actúa desde t = 0; desplazamiento y velocidad iniciales nulos. Es un ensayo exacto de un grado de libertad de elementos finitos, no la solución de una barra continua.',
  method: 'El solver de historia temporal 3D de producción se ejecuta mediante el wrapper WASM existente, con β = ¼, γ = ½ y sin amortiguamiento. La reproducción proviene de una ejecución nativa del mismo solver Rust. No se usa un integrador nuevo.',
  reference: 'Referencia exacta', difference: 'Diferencia', measured: 'Stabileo',
  formula: 'u(t) = (F/k)[1 − cos(ωt)], ω = √(k/m) = 10 rad/s. T = 2π/ω. El período discreto de aceleración media es Tₙ = πΔt / atan(ωΔt/2). Los períodos se miden entre cruces ascendentes de u = F/k; la interpolación afecta los pasos gruesos.',
  comparison: 'Alargamiento del período frente al paso temporal', period: 'Período (s)', elongation: 'Alargamiento (%)', error: 'Diferencia máxima de desplazamiento (mm)',
  tolerance: 'Verificaciones: cada muestra coincide con la solución discreta dentro de 10⁻¹⁰ m; el período medido coincide con la predicción discreta dentro del 0,5%. Con Δt/T = 0,025, el error máximo frente a la solución continua es menor que 0,5 mm en cuatro períodos. Los pasos mayores muestran errores mayores deliberadamente.',
  notYet: 'Todavía no', limitations: ['Figuras y ejemplos numéricos publicados en el artículo.', 'Amortiguamiento, carga armónica, respuesta no lineal y pórticos con múltiples grados de libertad.', 'Revisiones independientes (0); esto no es una certificación de ingeniería.'],
  replay: 'Reproducción precalculada (mismo solver)', live: 'Cálculo en vivo en tu navegador', cached: 'Resultado guardado (calculado en este navegador)', run: 'Recalcular en vivo', stop: 'Detener', restart: 'Reiniciar', busy: 'Calculando…', step: 'Paso temporal', sample: 'Muestra', displacement: 'Desplazamiento axial', time: 'Tiempo (s)', scaled: 'Deformación ×10; nodo izquierdo fijo, nodo derecho guiado axialmente.', tryCoarse: 'Probar el paso temporal más grueso', failure: 'Falló el cálculo; se conserva el resultado anterior.',
  paper: 'El artículo describe un procedimiento de integración temporal para dinámica estructural. Aquí probamos su especialización de aceleración media en un ensayo lineal pequeño; no afirmamos reproducir una figura del artículo.', alt: 'Historia de desplazamiento axial de nuestra ejecución de Newmark de producción',
};
const pt: Strings = {
  title: 'Aceleração média de Newmark', stage: 'Primeira versão · {reviews} revisões',
  lead: 'Um grau de liberdade sem amortecimento sob uma força constante aplicada subitamente. Aumente o passo de tempo para ver o período numérico crescer.',
  model: 'O exemplo', description: 'Uma barra de pórtico axial de 1 m, fixa à esquerda e com apenas a translação axial livre à direita. E = 10 MPa, A = 0,01 m², densidade sintética = 300000 kg/m³. A massa axial consistente fornece m = ρAL/3 = 1 t e k = EA/L = 100 kN/m. Um degrau de 1 kN atua desde t = 0; deslocamento e velocidade iniciais nulos. É um ensaio exato de um grau de liberdade de elementos finitos, não a solução de uma barra contínua.',
  method: 'O solver de histórico temporal 3D de produção é executado pelo wrapper WASM existente, com β = ¼, γ = ½ e sem amortecimento. A reprodução vem de uma execução nativa do mesmo solver Rust. Nenhum integrador novo é usado.', reference: 'Referência exata', difference: 'Diferença', measured: 'Stabileo',
  formula: 'u(t) = (F/k)[1 − cos(ωt)], ω = √(k/m) = 10 rad/s. T = 2π/ω. O período discreto de aceleração média é Tₙ = πΔt / atan(ωΔt/2). Os períodos são medidos entre cruzamentos ascendentes de u = F/k; a interpolação afeta os passos maiores.', comparison: 'Alongamento do período versus passo de tempo', period: 'Período (s)', elongation: 'Alongamento (%)', error: 'Diferença máxima de deslocamento (mm)',
  tolerance: 'Verificações: cada amostra coincide com a solução discreta dentro de 10⁻¹⁰ m; o período medido coincide com a previsão discreta dentro de 0,5%. Com Δt/T = 0,025, o erro máximo frente à solução contínua é menor que 0,5 mm em quatro períodos. Passos maiores mostram erros maiores deliberadamente.', notYet: 'Ainda não', limitations: ['Figuras e exemplos numéricos publicados no artigo.', 'Amortecimento, carga harmônica, resposta não linear e pórticos com múltiplos graus de liberdade.', 'Revisões independentes (0); isto não é uma certificação de engenharia.'],
  replay: 'Reprodução pré-calculada (mesmo solver)', live: 'Cálculo ao vivo no navegador', cached: 'Resultado salvo (calculado neste navegador)', run: 'Recalcular ao vivo', stop: 'Parar', restart: 'Reiniciar', busy: 'Calculando…', step: 'Passo de tempo', sample: 'Amostra', displacement: 'Deslocamento axial', time: 'Tempo (s)', scaled: 'Deformação ×10; nó esquerdo fixo, nó direito guiado axialmente.', tryCoarse: 'Testar o maior passo de tempo', failure: 'O cálculo falhou; o resultado anterior foi mantido.', paper: 'O artigo descreve um procedimento de integração temporal para dinâmica estrutural. Aqui testamos sua especialização de aceleração média em um pequeno ensaio linear; não afirmamos reproduzir uma figura do artigo.', alt: 'Histórico de deslocamento axial da nossa execução de Newmark de produção',
};
export const translations = { en, es, pt };
export const strings = () => {
  const locale = researchLocale();
  const translated = translations[locale === 'es' || locale === 'pt' ? locale : 'en'];
  return { ...translated, stage: evidence.stage === 'first-version' ? translated.stage.replace('{reviews}', String(evidence.reviews.length)) : '' };
};
