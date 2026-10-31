import { reviewLabel } from '../reviews';
import { researchLocale } from '../i18n';

const en = {
  title: 'Newmark average acceleration', stage: `First version · ${reviewLabel('newmark-1959', 'en')}`,
  metaTitle: 'Newmark (1959) — Stabileo Research',
  metaDescription: 'First version: production Newmark average acceleration against the exact SDOF step response.',
  lead: 'One undamped degree of freedom under a sudden constant force. Increase the time step to see the numerical period grow.',
  model: 'The example',
  description: 'A {L} m axial frame member, fixed at the left, with only axial translation free at the right. E = {E} MPa, A = {A} m², synthetic density = {rho} kg/m³. The consistent axial mass gives m = ρAL/3 = {m} t and k = EA/L = {k} kN/m. A {F} kN step acts from t = 0; initial displacement and velocity are zero. This is an exact SDOF finite-element benchmark, not a continuum bar solution.',
  method: 'The production 3D time-history solver runs through the existing WASM wrapper, with β = ¼, γ = ½ and no damping. The replay is a native run of the same Rust solver. No new integrator is used.',
  reference: 'Exact reference', difference: 'Difference', measured: 'Stabileo T (s)', predicted: 'Discrete prediction Tₙ (s)',
  formula: 'u(t) = (F/k)[1 − cos(ωt)], ω = √(k/m) = {omega} rad/s, T = 2π/ω = {T} s. The discrete average-acceleration solution is uₙ = (F/k)[1 − cos(nθ)] with θ = 2 atan(ωΔt/2), so its period is Tₙ = πΔt / atan(ωΔt/2). Periods below are measured from successive upward crossings of u = F/k; interpolation affects coarse-step measurements.',
  comparison: 'Period elongation versus time step', elongation: 'Elongation versus T (%)',
  errors: 'Displacement differences', discreteError: 'Max. |u − uₙ| (m)', continuousError: 'Max. |u − u(t)| (mm)', bound: 'Phase-lag bound (mm)',
  error: 'Maximum displacement difference (mm)',
  tolerance: 'Checks, computed from the histories shown (they follow a live recompute): every sample agrees with the discrete solution uₙ within 10⁻¹⁰ m; every measured period agrees with Tₙ within 0.5%; the maximum difference from the continuous solution stays below the phase-lag bound (F/k)·min(2, N(ωΔt − θ)) that follows from uₙ over the N steps; at Δt/T = 0.025 it is also below 0.5 mm over four periods. Coarser steps deliberately show larger errors.',
  published: 'None: this page checks the method against exact closed-form solutions; it does not reproduce a figure or table printed in the paper.',
  notYet: 'Not yet', limitations: ['Published figures and numerical examples from the paper.', 'Damping, harmonic loading, nonlinear response and multi-degree-of-freedom frames.', 'This is not engineering certification.'],
  replay: 'Precomputed replay (same solver)', live: 'Live computation in your browser', cached: 'Cached result (computed in this browser)',
  run: 'Recompute live', stop: 'Stop', restart: 'Restart', busy: 'Computing…', step: 'Time step', sample: 'Sample',
  sampleValue: 'Sample {i} of {n}, t = {t} s',
  speed: 'Playback runs {x} times slower than real time at every time step, so a longer period really takes longer.',
  displacement: 'Axial displacement', time: 'Time (s)', scaled: 'Deformation ×10; left node fixed, right node axially guided.',
  tryCoarse: 'Try the coarsest time step', failure: 'Computation failed; previous result retained.',
  paper: 'The paper describes a time-stepping procedure for structural dynamics. Here we exercise its average-acceleration specialization on a deliberately small linear benchmark; we do not claim to reproduce a figure from the paper.',
  alt: 'Axial displacement history from our production Newmark run',
};
type Strings = { [K in keyof typeof en]: (typeof en)[K] };
const es: Strings = {
  title: 'Aceleración media de Newmark', stage: `Primera versión · ${reviewLabel('newmark-1959', 'es')}`,
  metaTitle: 'Newmark (1959) — Stabileo Research',
  metaDescription: 'Primera versión: la aceleración media de Newmark de producción frente a la respuesta exacta de un grado de libertad a un escalón.',
  lead: 'Un grado de libertad sin amortiguamiento bajo una fuerza constante aplicada de golpe. Aumentá el paso temporal para ver cómo crece el período numérico.',
  model: 'El ejemplo',
  description: 'Una barra de pórtico axial de {L} m, fija a la izquierda y con solo la traslación axial libre a la derecha. E = {E} MPa, A = {A} m², densidad sintética = {rho} kg/m³. La masa axial consistente da m = ρAL/3 = {m} t y k = EA/L = {k} kN/m. Un escalón de {F} kN actúa desde t = 0; desplazamiento y velocidad iniciales nulos. Es un ensayo exacto de un grado de libertad de elementos finitos, no la solución de una barra continua.',
  method: 'El solver de historia temporal 3D de producción se ejecuta mediante el wrapper WASM existente, con β = ¼, γ = ½ y sin amortiguamiento. La reproducción proviene de una ejecución nativa del mismo solver Rust. No se usa un integrador nuevo.',
  reference: 'Referencia exacta', difference: 'Diferencia', measured: 'T de Stabileo (s)', predicted: 'Predicción discreta Tₙ (s)',
  formula: 'u(t) = (F/k)[1 − cos(ωt)], ω = √(k/m) = {omega} rad/s, T = 2π/ω = {T} s. La solución discreta de aceleración media es uₙ = (F/k)[1 − cos(nθ)] con θ = 2 atan(ωΔt/2), así que su período es Tₙ = πΔt / atan(ωΔt/2). Los períodos se miden entre cruces ascendentes de u = F/k; la interpolación afecta los pasos gruesos.',
  comparison: 'Alargamiento del período frente al paso temporal', elongation: 'Alargamiento frente a T (%)',
  errors: 'Diferencias de desplazamiento', discreteError: 'Máx. |u − uₙ| (m)', continuousError: 'Máx. |u − u(t)| (mm)', bound: 'Cota por desfase (mm)',
  error: 'Diferencia máxima de desplazamiento (mm)',
  tolerance: 'Verificaciones, calculadas a partir de las historias mostradas (siguen a un recálculo en vivo): cada muestra coincide con la solución discreta uₙ dentro de 10⁻¹⁰ m; cada período medido coincide con Tₙ dentro del 0,5%; la diferencia máxima frente a la solución continua queda por debajo de la cota por desfase (F/k)·min(2, N(ωΔt − θ)) que se deduce de uₙ en los N pasos; con Δt/T = 0,025 además es menor que 0,5 mm en cuatro períodos. Los pasos mayores muestran errores mayores deliberadamente.',
  published: 'Ninguna: esta página verifica el método frente a soluciones exactas en forma cerrada; no reproduce una figura ni una tabla impresa en el artículo.',
  notYet: 'Todavía no', limitations: ['Figuras y ejemplos numéricos publicados en el artículo.', 'Amortiguamiento, carga armónica, respuesta no lineal y pórticos con múltiples grados de libertad.', 'Esto no es una certificación de ingeniería.'],
  replay: 'Reproducción precalculada (mismo solver)', live: 'Cálculo en vivo en tu navegador', cached: 'Resultado guardado (calculado en este navegador)', run: 'Recalcular en vivo', stop: 'Detener', restart: 'Reiniciar', busy: 'Calculando…', step: 'Paso temporal', sample: 'Muestra',
  sampleValue: 'Muestra {i} de {n}, t = {t} s',
  speed: 'La reproducción va {x} veces más lenta que el tiempo real con cualquier paso temporal, así que un período más largo realmente tarda más.',
  displacement: 'Desplazamiento axial', time: 'Tiempo (s)', scaled: 'Deformación ×10; nodo izquierdo fijo, nodo derecho guiado axialmente.', tryCoarse: 'Probar el paso temporal más grueso', failure: 'Falló el cálculo; se conserva el resultado anterior.',
  paper: 'El artículo describe un procedimiento de integración temporal para dinámica estructural. Aquí probamos su especialización de aceleración media en un ensayo lineal pequeño; no afirmamos reproducir una figura del artículo.', alt: 'Historia de desplazamiento axial de nuestra ejecución de Newmark de producción',
};
const pt: Strings = {
  title: 'Aceleração média de Newmark', stage: `Primeira versão · ${reviewLabel('newmark-1959', 'pt')}`,
  metaTitle: 'Newmark (1959) — Stabileo Research',
  metaDescription: 'Primeira versão: a aceleração média de Newmark de produção frente à resposta exata de um grau de liberdade a um degrau.',
  lead: 'Um grau de liberdade sem amortecimento sob uma força constante aplicada subitamente. Aumente o passo de tempo para ver o período numérico crescer.',
  model: 'O exemplo', description: 'Uma barra de pórtico axial de {L} m, fixa à esquerda e com apenas a translação axial livre à direita. E = {E} MPa, A = {A} m², densidade sintética = {rho} kg/m³. A massa axial consistente fornece m = ρAL/3 = {m} t e k = EA/L = {k} kN/m. Um degrau de {F} kN atua desde t = 0; deslocamento e velocidade iniciais nulos. É um ensaio exato de um grau de liberdade de elementos finitos, não a solução de uma barra contínua.',
  method: 'O solver de histórico temporal 3D de produção é executado pelo wrapper WASM existente, com β = ¼, γ = ½ e sem amortecimento. A reprodução vem de uma execução nativa do mesmo solver Rust. Nenhum integrador novo é usado.', reference: 'Referência exata', difference: 'Diferença', measured: 'T do Stabileo (s)', predicted: 'Previsão discreta Tₙ (s)',
  formula: 'u(t) = (F/k)[1 − cos(ωt)], ω = √(k/m) = {omega} rad/s, T = 2π/ω = {T} s. A solução discreta de aceleração média é uₙ = (F/k)[1 − cos(nθ)] com θ = 2 atan(ωΔt/2), portanto seu período é Tₙ = πΔt / atan(ωΔt/2). Os períodos são medidos entre cruzamentos ascendentes de u = F/k; a interpolação afeta os passos maiores.', comparison: 'Alongamento do período versus passo de tempo', elongation: 'Alongamento frente a T (%)',
  errors: 'Diferenças de deslocamento', discreteError: 'Máx. |u − uₙ| (m)', continuousError: 'Máx. |u − u(t)| (mm)', bound: 'Limite por defasagem (mm)',
  error: 'Diferença máxima de deslocamento (mm)',
  tolerance: 'Verificações, calculadas a partir dos históricos mostrados (acompanham um recálculo ao vivo): cada amostra coincide com a solução discreta uₙ dentro de 10⁻¹⁰ m; cada período medido coincide com Tₙ dentro de 0,5%; a diferença máxima frente à solução contínua fica abaixo do limite por defasagem (F/k)·min(2, N(ωΔt − θ)) que decorre de uₙ nos N passos; com Δt/T = 0,025 também é menor que 0,5 mm em quatro períodos. Passos maiores mostram erros maiores deliberadamente.',
  published: 'Nenhuma: esta página verifica o método frente a soluções exatas em forma fechada; não reproduz uma figura nem uma tabela impressa no artigo.',
  notYet: 'Ainda não', limitations: ['Figuras e exemplos numéricos publicados no artigo.', 'Amortecimento, carga harmônica, resposta não linear e pórticos com múltiplos graus de liberdade.', 'Isto não é uma certificação de engenharia.'],
  replay: 'Reprodução pré-calculada (mesmo solver)', live: 'Cálculo ao vivo no navegador', cached: 'Resultado salvo (calculado neste navegador)', run: 'Recalcular ao vivo', stop: 'Parar', restart: 'Reiniciar', busy: 'Calculando…', step: 'Passo de tempo', sample: 'Amostra',
  sampleValue: 'Amostra {i} de {n}, t = {t} s',
  speed: 'A reprodução é {x} vezes mais lenta que o tempo real em qualquer passo de tempo, então um período mais longo realmente demora mais.',
  displacement: 'Deslocamento axial', time: 'Tempo (s)', scaled: 'Deformação ×10; nó esquerdo fixo, nó direito guiado axialmente.', tryCoarse: 'Testar o maior passo de tempo', failure: 'O cálculo falhou; o resultado anterior foi mantido.', paper: 'O artigo descreve um procedimento de integração temporal para dinâmica estrutural. Aqui testamos sua especialização de aceleração média em um pequeno ensaio linear; não afirmamos reproduzir uma figura do artigo.', alt: 'Histórico de deslocamento axial da nossa execução de Newmark de produção',
};
export const translations = { en, es, pt };
export const strings = () => translations[researchLocale() as keyof typeof translations];
export const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
