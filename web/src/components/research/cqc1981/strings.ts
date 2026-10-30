import { researchLocale } from '../i18n';

export const translations = {
  en: {
    srss: 'SRSS', cqc: 'CQC',
    title: 'Closely spaced modes: SRSS vs CQC', stage: 'First version · 0 reviews',
    lead: 'One small 3D shear-building idealization, solved by the production modal and response-spectrum engine.',
    model: 'The example', description: 'Four fixed-base columns, 3 m high on a 4 × 3 m plan. Each roof node carries 5 t in X. Roof rotations and Y/Z translations are restrained; equal-X constraints join each transverse pair. Two axial roof ties couple the two remaining coordinates. This is our illustration of the method, not the paper’s original building.',
    referenceNote: 'No authors’ code used; closed-form comparison below.', method: 'Closed-form reference', equations: 'The reduced matrices are M = diag(10, 10) t and K = [[1020, −20], [−20, 1230]] kN/m. Solve det(K − ω²M) = 0; normalize each mode to unit modal mass. For Sa = 1 m/s², the modal base shears are Γ²Sa. SRSS discards cross terms; CQC retains their equal-damping correlation at ξ = 5%.',
    explanation: 'The paper proposes CQC to reduce modal-combination errors and recovers SRSS for well-separated frequencies. Here SRSS is lower than CQC for base shear. This difference is relative to the CQC estimate, not a measured error against an earthquake record.',
    comparison: 'Base shear · kN', reference: 'Closed form', result: 'Stabileo', delta: 'Difference · %',
    modes: 'Frequencies · Hz', correlation: 'Modal correlation', deficit: 'SRSS relative to CQC · %',
    notYet: 'Not yet', limitations: ['Original paper building and published numerical tables.', 'Time-history envelope and record-specific accuracy.', 'Torsional response, multi-storey models and parameter sweeps.', 'Independent reviews or design certification.'],
    run: 'Recompute live', stop: 'Stop', restart: 'Restart', running: 'Computing…',
    replay: 'Precomputed replay (same solver)', live: 'Live result (production WASM)', cached: 'Cached result',
    viewer: 'Roof X displacement · mm', viewNote: 'Axonometric projection in Stabileo’s viewer. Deformation ×40; the animation scales the envelope, it is not a time history.',
    step: 'Envelope display', rule: 'Combination', tolerance: 'Relative tolerance: 1 × 10⁻⁸ for frequencies, base shear and roof displacement. Reference agreement is not engineering certification.',
    error: 'Live calculation failed', disclaimer: 'Research, not a design tool.',
  },
  es: {
    srss: 'SRSS', cqc: 'CQC',
    title: 'Modos próximos: SRSS y CQC', stage: 'Primera versión · 0 revisiones',
    lead: 'Un pequeño edificio 3D idealizado a corte, resuelto con el motor de producción modal y de espectro de respuesta.',
    model: 'El ejemplo', description: 'Cuatro columnas empotradas de 3 m en una planta de 4 × 3 m. Cada nodo de techo tiene 5 t en X. Se restringen los giros y las traslaciones Y/Z; restricciones de igual X unen cada par transversal. Dos tirantes axiales acoplan las dos coordenadas restantes. Es nuestra ilustración del método, no el edificio original del artículo.',
    referenceNote: 'Sin código de los autores; comparación analítica abajo.', method: 'Referencia analítica', equations: 'Las matrices reducidas son M = diag(10, 10) t y K = [[1020, −20], [−20, 1230]] kN/m. Se resuelve det(K − ω²M) = 0 y se normaliza cada modo a masa modal unitaria. Para Sa = 1 m/s², los cortantes modales son Γ²Sa. SRSS omite los términos cruzados; CQC conserva su correlación con amortiguamiento uniforme ξ = 5%.',
    explanation: 'El artículo propone CQC para reducir errores de combinación modal y recupera SRSS para frecuencias separadas. Aquí SRSS da un cortante basal menor que CQC. Esta diferencia se refiere a la estimación CQC, no a un error medido frente a un registro sísmico.',
    comparison: 'Cortante basal · kN', reference: 'Analítico', result: 'Stabileo', delta: 'Diferencia · %',
    modes: 'Frecuencias · Hz', correlation: 'Correlación modal', deficit: 'SRSS respecto de CQC · %',
    notYet: 'Pendiente', limitations: ['Edificio original y tablas numéricas publicadas.', 'Envolvente de historia temporal y precisión por registro.', 'Respuesta torsional, varios pisos y barridos de parámetros.', 'Revisiones independientes o certificación de diseño.'],
    run: 'Recalcular en vivo', stop: 'Detener', restart: 'Reiniciar', running: 'Calculando…',
    replay: 'Reproducción precalculada (mismo motor)', live: 'Resultado en vivo (WASM de producción)', cached: 'Resultado guardado',
    viewer: 'Desplazamiento X del techo · mm', viewNote: 'Proyección axonométrica en el visor de Stabileo. Deformación ×40; la animación escala la envolvente, no es una historia temporal.',
    step: 'Visualización de envolvente', rule: 'Combinación', tolerance: 'Tolerancia relativa: 1 × 10⁻⁸ para frecuencias, cortante basal y desplazamiento del techo. La concordancia no es una certificación de ingeniería.',
    error: 'Falló el cálculo en vivo', disclaimer: 'Investigación, no una herramienta de diseño.',
  },
  pt: {
    srss: 'SRSS', cqc: 'CQC',
    title: 'Modos próximos: SRSS e CQC', stage: 'Primeira versão · 0 revisões',
    lead: 'Um pequeno edifício 3D idealizado ao cisalhamento, resolvido pelo motor de produção modal e de espectro de resposta.',
    model: 'O exemplo', description: 'Quatro colunas engastadas de 3 m numa planta de 4 × 3 m. Cada nó da cobertura tem 5 t em X. Rotações e translações Y/Z são restringidas; restrições de X igual unem cada par transversal. Dois tirantes axiais acoplam as duas coordenadas restantes. É nossa ilustração do método, não o edifício original do artigo.',
    referenceNote: 'Sem código dos autores; comparação analítica abaixo.', method: 'Referência analítica', equations: 'As matrizes reduzidas são M = diag(10, 10) t e K = [[1020, −20], [−20, 1230]] kN/m. Resolve-se det(K − ω²M) = 0 e normaliza-se cada modo para massa modal unitária. Para Sa = 1 m/s², os cortantes modais são Γ²Sa. SRSS omite termos cruzados; CQC mantém sua correlação com amortecimento uniforme ξ = 5%.',
    explanation: 'O artigo propõe CQC para reduzir erros de combinação modal e recupera SRSS para frequências separadas. Aqui SRSS dá um cortante basal menor que CQC. A diferença é relativa à estimativa CQC, não um erro medido contra um registro sísmico.',
    comparison: 'Cortante basal · kN', reference: 'Analítico', result: 'Stabileo', delta: 'Diferença · %',
    modes: 'Frequências · Hz', correlation: 'Correlação modal', deficit: 'SRSS em relação a CQC · %',
    notYet: 'Ainda não', limitations: ['Edifício original e tabelas numéricas publicadas.', 'Envoltória de histórico temporal e precisão por registro.', 'Resposta torcional, vários pisos e varreduras de parâmetros.', 'Revisões independentes ou certificação de projeto.'],
    run: 'Recalcular ao vivo', stop: 'Parar', restart: 'Reiniciar', running: 'Calculando…',
    replay: 'Reprodução pré-calculada (mesmo motor)', live: 'Resultado ao vivo (WASM de produção)', cached: 'Resultado em cache',
    viewer: 'Deslocamento X da cobertura · mm', viewNote: 'Projeção axonométrica no visualizador do Stabileo. Deformação ×40; a animação escala a envoltória, não é um histórico temporal.',
    step: 'Exibição da envoltória', rule: 'Combinação', tolerance: 'Tolerância relativa: 1 × 10⁻⁸ para frequências, cortante basal e deslocamento da cobertura. A concordância não é certificação de engenharia.',
    error: 'Falha no cálculo ao vivo', disclaimer: 'Pesquisa, não uma ferramenta de projeto.',
  },
};
export const cqcStrings = () => {
  const locale = researchLocale();
  return translations[locale === 'es' || locale === 'pt' ? locale : 'en'];
};
