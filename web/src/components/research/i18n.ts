import { publicI18n } from '../../lib/i18n/store.svelte';

/** The research pages' interface strings (the articles themselves are in English for now). */
export type ResearchStrings = {
  sourceLabel: Record<'crossref-abstract' | 'publisher-abstract' | 'repository-readme' | 'full-text' | 'reference-code', string>;
  resetParameters: string;
  summaryIntro: string;
  noAbstract: string;
  runIt: string;
  comingNext: string;
  inProgress: string;
  catalog: string;
  field: string;
  status: string;
  all: string;
  readRun: string;
  paper: string;
  code: string;
  openInStabileo: string;
  soon: string;
  notDesign: string;
  checksPass: string;
  notCompared: string;
  research: string;
  suggest: string;
  onlyEnglish: string;
  againstCode: string;
  againstPaper: string;
  of: string;
  seeChecks: string;
  disclaimer: string;
  notComparedWhy: string;
};

const STRINGS: Record<'en' | 'es' | 'pt', ResearchStrings> = {
  en: {
    resetParameters: 'Reset to the reference-code parameters',
    sourceLabel: { 'crossref-abstract': 'from the abstract', 'publisher-abstract': 'from the abstract', 'repository-readme': 'from the code’s README', 'full-text': 'from the paper', 'reference-code': 'from the reference code' },
    summaryIntro: 'Summary in our words,',
    noAbstract: 'Abstract not available.',
    runIt: 'Run it',
    comingNext: 'Coming next',
    inProgress: 'in progress',
    catalog: 'On our list: papers we plan to reproduce',
    field: 'Field',
    status: 'Status',
    all: 'All',
    readRun: 'Read & run',
    paper: 'Paper',
    code: 'Code',
    openInStabileo: 'Open in Stabileo',
    soon: 'coming with research mode',
    notDesign: 'Research, not a design tool',
    checksPass: 'checks pass',
    notCompared: 'Published figures not compared',
    research: 'Research',
    suggest: 'Suggest a paper to reproduce →',
    onlyEnglish: '',
    againstCode: 'Against the author’s code',
    againstPaper: 'Against the paper’s figures',
    of: 'of',
    seeChecks: 'see the checks',
    disclaimer: 'Research, not a design tool. Nothing here is an engineering result.',
    notComparedWhy: 'Not compared: the full text was not accessible to us',
  },
  es: {
    resetParameters: 'Restablecer los parámetros del código de referencia',
    sourceLabel: { 'crossref-abstract': 'a partir del resumen', 'publisher-abstract': 'a partir del resumen', 'repository-readme': 'a partir del README del código', 'full-text': 'a partir del artículo', 'reference-code': 'a partir del código de referencia' },
    summaryIntro: 'Resumen en nuestras palabras,',
    noAbstract: 'Resumen no disponible.',
    runIt: 'Ejecutalo',
    comingNext: 'Próximamente',
    inProgress: 'en curso',
    catalog: 'En nuestra lista: artículos que planeamos reproducir',
    field: 'Área',
    status: 'Estado',
    all: 'Todos',
    readRun: 'Leer y ejecutar',
    paper: 'Artículo',
    code: 'Código',
    openInStabileo: 'Abrir en Stabileo',
    soon: 'llega con el modo investigación',
    notDesign: 'Investigación, no una herramienta de diseño',
    checksPass: 'controles aprobados',
    notCompared: 'Sin comparar con las figuras publicadas',
    research: 'Investigación',
    suggest: 'Sugerí un artículo para reproducir →',
    onlyEnglish: 'Este artículo está disponible solo en inglés.',
    againstCode: 'Frente al código del autor',
    againstPaper: 'Frente a las figuras del artículo',
    of: 'de',
    seeChecks: 'ver los controles',
    disclaimer: 'Investigación, no una herramienta de diseño. Nada de esto es un resultado de ingeniería.',
    notComparedWhy: 'No comparado: no tuvimos acceso al texto completo',
  },
  pt: {
    resetParameters: 'Restaurar os parâmetros do código de referência',
    sourceLabel: { 'crossref-abstract': 'a partir do resumo', 'publisher-abstract': 'a partir do resumo', 'repository-readme': 'a partir do README do código', 'full-text': 'a partir do artigo', 'reference-code': 'a partir do código de referência' },
    summaryIntro: 'Resumo em nossas palavras,',
    noAbstract: 'Resumo não disponível.',
    runIt: 'Execute',
    comingNext: 'Em breve',
    inProgress: 'em andamento',
    catalog: 'Na nossa lista: artigos que planejamos reproduzir',
    field: 'Área',
    status: 'Status',
    all: 'Todos',
    readRun: 'Ler e executar',
    paper: 'Artigo',
    code: 'Código',
    openInStabileo: 'Abrir no Stabileo',
    soon: 'chega com o modo pesquisa',
    notDesign: 'Pesquisa, não uma ferramenta de projeto',
    checksPass: 'verificações aprovadas',
    notCompared: 'Sem comparar com as figuras publicadas',
    research: 'Pesquisa',
    suggest: 'Sugira um artigo para reproduzir →',
    onlyEnglish: 'Este artigo está disponível apenas em inglês.',
    againstCode: 'Frente ao código do autor',
    againstPaper: 'Frente às figuras do artigo',
    of: 'de',
    seeChecks: 'ver as verificações',
    disclaimer: 'Pesquisa, não uma ferramenta de projeto. Nada aqui é um resultado de engenharia.',
    notComparedWhy: 'Não comparado: não tivemos acesso ao texto completo',
  },
};

export function rs(): ResearchStrings {
  return STRINGS[publicI18n.locale as keyof typeof STRINGS] ?? STRINGS.en;
}

export const FIELD_NAMES: Record<string, Record<string, string>> = {
  en: { fracture: 'Fracture and damage', 'differentiable-fem': 'Differentiable FEM', optimization: 'Optimization', metamaterials: 'Metamaterials', constitutive: 'Constitutive models', 'digital-twins': 'Digital twins', 'numerical-methods': 'Numerical methods', seismic: 'Seismic and dynamics', shells: 'Shells and buckling' },
  es: { fracture: 'Fractura y daño', 'differentiable-fem': 'FEM diferenciable', optimization: 'Optimización', metamaterials: 'Metamateriales', constitutive: 'Modelos constitutivos', 'digital-twins': 'Gemelos digitales', 'numerical-methods': 'Métodos numéricos', seismic: 'Sísmica y dinámica', shells: 'Cáscaras y pandeo' },
  pt: { fracture: 'Fratura e dano', 'differentiable-fem': 'MEF diferenciável', optimization: 'Otimização', metamaterials: 'Metamateriais', constitutive: 'Modelos constitutivos', 'digital-twins': 'Gêmeos digitais', 'numerical-methods': 'Métodos numéricos', seismic: 'Sísmica e dinâmica', shells: 'Cascas e flambagem' },
};

export const STATUS_NAMES: Record<string, Record<string, string>> = {
  en: { proposed: 'Proposed', 'reference-reproduced': 'Reference reproduced', 'implementation-in-progress': 'Implementation in progress', 'numerically-validated': 'Numerically validated', 'published-figures-compared': 'Published figures compared', interactive: 'Interactive' },
  es: { proposed: 'Propuesto', 'reference-reproduced': 'Referencia reproducida', 'implementation-in-progress': 'Implementación en curso', 'numerically-validated': 'Validado numéricamente', 'published-figures-compared': 'Comparado con las figuras publicadas', interactive: 'Interactivo' },
  pt: { proposed: 'Proposto', 'reference-reproduced': 'Referência reproduzida', 'implementation-in-progress': 'Implementação em andamento', 'numerically-validated': 'Validado numericamente', 'published-figures-compared': 'Comparado com as figuras publicadas', interactive: 'Interativo' },
};

export const fieldName = (f: string) => FIELD_NAMES[publicI18n.locale]?.[f] ?? FIELD_NAMES.en[f] ?? f;
export const statusName = (s: string) => STATUS_NAMES[publicI18n.locale]?.[s] ?? STATUS_NAMES.en[s] ?? s;
