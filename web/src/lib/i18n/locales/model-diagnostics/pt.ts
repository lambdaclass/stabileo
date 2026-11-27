import type { Translations } from '../../types';

const messages: Translations = {
  "diag.model.flangeTwice": "Vigas com seção T sob uma laje também modelada: a mesa conta duas vezes na rigidez. Convém modelar a alma retangular e a laje como cascas; a mesa é considerada no dimensionamento em Dados de projeto.",
  "diag.tooltip.MODEL_FLANGE_TWICE": "Seção T e laje modelada: a mesa conta duas vezes",
  'pro.plates.diag.looseCorner': "Placa com nós que não se conectam a nada mais (nem barra, nem apoio, nem outra placa): ali não se transfere carga",
  "plates.meshedAtAnalysisKept": "{n} placas malhadas antes do cálculo ({cells} elementos); as outras {kept} mantiveram sua malha.",
  'svc.engine.conflictingConstraints': 'O grau de liberdade {dof} (nó {node}) está sujeito a {n} restrições; só vale a última',
  "diag.detail.nodes": "nós",
  "diag.detail.cases": "casos",
  "diag.detail.computed": "calculado",
  "diag.detail.limit": "limite",
  "diag.detail.ratio": "relação",
  "diag.detail.value": "valor",
  "diag.detail.dofIndices": "graus de liberdade",
  "diag.detail.n": "quantidade",
  "diag.detail.add": "a adicionar",
  "diag.detail.change": "a alterar",
  "diag.detail.remove": "a remover",
  "plates.analysisStale": "Estas placas foram calculadas com a malha desatualizada: {names}. Continua sendo uma malha válida, mas não acompanha as últimas mudanças do modelo; malhe-as ou ative «Malhar ao calcular» para que acompanhe.",
  'xls.err.duplicatePhysicalColumn': 'A coluna física {k} aparece mais de uma vez.',
  'xls.err.duplicateLoadSheet': 'Só é permitida uma folha com o nome {sheet}.',
  'plates.diag.looseCorner': "Placa com nós que não se conectam a nada mais (nem barra, nem apoio, nem outra placa): ali não se transfere carga",
};

export default messages;
