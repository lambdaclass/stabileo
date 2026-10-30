import { researchLocale } from '../i18n';
const en = {
  title: 'Snapping arches by curvature patterning',
  lead: 'Change the width of a curved segment and move the threshold at which a shallow arch switches sides.',
  model: 'From Euler buckling to an equilibrium jump',
  theory: 'A flat-clamped arch stores end shortening in its shape. A preferred-curvature pattern couples to its buckling modes. Equations (2) and (3), arXiv v2 pages 3–4, give the shallow-angle equilibrium and compression spectrum. We restrict this experiment to a centered rectangular pattern.',
  method: 'The production Stabileo 2D frame buckling solver computes 16 modes on 64 elements. A research layer projects the curvature onto these modes and solves the paper’s compression constraint. The same Rust code runs here as WASM and generates the replay.',
  limits: 'This is a shallow, inextensible equilibrium model. The jump connects equilibria; it does not simulate snap dynamics or reproduce laboratory measurements. Arc-length in the production engine rejects prescribed displacements and thermal loading, so it is not used for this curvature-driven path. Only centered patterns and small end shortening are covered.',
  evidence: 'At a stimulated width of 70%, the paper gives α/√ε = {threshold} (arXiv v2 page 3, following Eq. 2). The overlay is regenerated from the authors’ shallow-angle software in Zenodo record 18256271, licensed CC-BY-4.0. It is a numerical reference, not experimental validation.',
  checks: 'Validation and sources',
  checkLabels: ['Zenodo curve: maximum relative error', 'Mesh and mode refinement', 'First Euler load', 'Second Euler load'],
  publishedValue: 'Published threshold at 70% width',
  width: 'Stimulated width γ',
  compression: 'End shortening ε',
  threshold: 'Snap threshold α',
  normalized: 'Normalized threshold α/√ε',
  mode: 'First antisymmetric buckling mode',
  arch: 'Arch equilibrium',
  jump: 'Equilibrium sequence; jump has no physical duration',
  run: 'Recompute live', stop: 'Stop', restart: 'Restart',
  error: 'The solver could not load or complete. The previous result remains available.',
  pending: 'Computing with Stabileo…',
  paper: 'Paper and supplementary equations',
  data: 'Zenodo data and software',
  ours: 'Stabileo modes + shallow-arch equations',
  reference: 'Authors’ Zenodo software',
  parameterNotice: 'Displayed results retain their computed parameters until recomputation completes.',
};
type Strings = typeof en;
const es: Strings = {
  title: 'Arcos que saltan al cambiar el patrón de curvatura',
  lead: 'Cambiá el ancho de un segmento curvo y el umbral en que un arco poco profundo cambia de lado.',
  model: 'Del pandeo de Euler al salto de equilibrio',
  theory: 'Un arco empotrado almacena el acortamiento en su forma. El patrón de curvatura preferida se acopla a sus modos de pandeo. Las ecuaciones (2) y (3), arXiv v2 páginas 3–4, describen el equilibrio de ángulo pequeño y el espectro de compresión. Este experimento usa un patrón rectangular centrado.',
  method: 'El motor de producción de Stabileo calcula 16 modos con 64 elementos de pórtico 2D. Una capa de investigación proyecta la curvatura sobre esos modos y resuelve la restricción de compresión del artículo. El mismo código Rust corre como WASM y genera la reproducción.',
  limits: 'Es un modelo de equilibrio poco profundo e inextensible. El salto conecta equilibrios; no simula la dinámica ni reproduce mediciones de laboratorio. El método de longitud de arco del motor rechaza desplazamientos impuestos y cargas térmicas, por lo que no se usa aquí. Solo se estudian patrones centrados y pequeños acortamientos.',
  evidence: 'Para un ancho estimulado del 70%, el artículo da α/√ε = {threshold} (arXiv v2 página 3, después de la Ec. 2). La curva de referencia se genera con el software de los autores del registro Zenodo 18256271, con licencia CC-BY-4.0. Es una referencia numérica, no una validación experimental.',
  checkLabels: ['Curva de Zenodo: error relativo máximo', 'Refinamiento de malla y modos', 'Primera carga de Euler', 'Segunda carga de Euler'], publishedValue: 'Umbral publicado para un ancho del 70%', checks: 'Validación y fuentes', width: 'Ancho estimulado γ', compression: 'Acortamiento ε', threshold: 'Umbral de salto α', normalized: 'Umbral normalizado α/√ε', mode: 'Primer modo de pandeo antisimétrico', arch: 'Equilibrio del arco', jump: 'Secuencia de equilibrios; el salto no tiene duración física', run: 'Recalcular en vivo', stop: 'Detener', restart: 'Reiniciar', error: 'El cálculo no pudo cargarse o completarse. El resultado anterior sigue disponible.', pending: 'Calculando con Stabileo…', paper: 'Artículo y ecuaciones suplementarias', data: 'Datos y software de Zenodo', ours: 'Modos de Stabileo + ecuaciones del arco', reference: 'Software de los autores en Zenodo', parameterNotice: 'Los resultados conservan sus parámetros hasta completar el nuevo cálculo.',
};
const pt: Strings = {
  title: 'Arcos que saltam por padrões de curvatura', lead: 'Mude a largura de um segmento curvo e o limiar em que um arco raso muda de lado.', model: 'Da flambagem de Euler ao salto de equilíbrio',
  theory: 'Um arco engastado armazena o encurtamento em sua forma. O padrão de curvatura preferida se acopla aos modos de flambagem. As equações (2) e (3), arXiv v2 páginas 3–4, descrevem o equilíbrio de pequeno ângulo e o espectro de compressão. Este experimento usa um padrão retangular centralizado.',
  method: 'O motor de produção Stabileo calcula 16 modos com 64 elementos de pórtico 2D. Uma camada de pesquisa projeta a curvatura nesses modos e resolve a restrição de compressão do artigo. O mesmo código Rust roda como WASM e gera a reprodução.',
  limits: 'Este é um modelo de equilíbrio raso e inextensível. O salto conecta equilíbrios; não simula a dinâmica nem reproduz medições de laboratório. O método de comprimento de arco do motor rejeita deslocamentos impostos e cargas térmicas, portanto não é usado aqui. Apenas padrões centralizados e pequenos encurtamentos são estudados.',
  evidence: 'Para uma largura estimulada de 70%, o artigo fornece α/√ε = {threshold} (arXiv v2 página 3, após a Eq. 2). A curva de referência é gerada pelo software dos autores no registro Zenodo 18256271, sob licença CC-BY-4.0. É uma referência numérica, não uma validação experimental.',
  checkLabels: ['Curva do Zenodo: erro relativo máximo', 'Refinamento de malha e modos', 'Primeira carga de Euler', 'Segunda carga de Euler'], publishedValue: 'Limiar publicado para largura de 70%', checks: 'Validação e fontes', width: 'Largura estimulada γ', compression: 'Encurtamento ε', threshold: 'Limiar do salto α', normalized: 'Limiar normalizado α/√ε', mode: 'Primeiro modo de flambagem antissimétrico', arch: 'Equilíbrio do arco', jump: 'Sequência de equilíbrios; o salto não tem duração física', run: 'Recalcular ao vivo', stop: 'Parar', restart: 'Reiniciar', error: 'O cálculo não pôde carregar ou terminar. O resultado anterior continua disponível.', pending: 'Calculando com Stabileo…', paper: 'Artigo e equações suplementares', data: 'Dados e software do Zenodo', ours: 'Modos Stabileo + equações do arco', reference: 'Software dos autores no Zenodo', parameterNotice: 'Os resultados mantêm seus parâmetros até o novo cálculo terminar.',
};
export const archStrings = (): Strings => {
  const locale = researchLocale();
  return locale === 'es' ? es : locale === 'pt' ? pt : en;
};
