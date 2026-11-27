import type { Translations } from '../../types';

const messages: Translations = {
  "diag.model.flangeTwice": "Vigas con sección T bajo una losa también modelada: el ala se cuenta dos veces en la rigidez. Conviene modelar el nervio rectangular y la losa como cáscaras; el ala se considera en el armado desde Datos de diseño.",
  "diag.tooltip.MODEL_FLANGE_TWICE": "Sección T y losa modelada: el ala cuenta dos veces",
  'pro.plates.diag.looseCorner': "Placa con nodos que no se conectan a nada más (ni barra, ni apoyo, ni otra placa): ahí no se transfiere carga",
  "plates.meshedAtAnalysisKept": "Se mallaron {n} placas antes del cálculo ({cells} elementos); las otras {kept} conservaron su malla.",
  'svc.engine.conflictingConstraints': 'El grado de libertad {dof} (nodo {node}) está sujeto a {n} restricciones; sólo vale la última',
  "diag.detail.nodes": "nodos",
  "diag.detail.cases": "casos",
  "diag.detail.computed": "calculado",
  "diag.detail.limit": "límite",
  "diag.detail.ratio": "relación",
  "diag.detail.value": "valor",
  "diag.detail.dofIndices": "grados de libertad",
  "diag.detail.n": "cantidad",
  "diag.detail.add": "a agregar",
  "diag.detail.change": "a cambiar",
  "diag.detail.remove": "a quitar",
  "plates.analysisStale": "Estas placas se calcularon con su malla desactualizada: {names}. Sigue siendo una malla válida, pero no acompaña los últimos cambios del modelo; mallalas o activá «Mallar al calcular» para que los siga.",
  'xls.err.duplicatePhysicalColumn': 'La columna física {k} aparece más de una vez.',
  'xls.err.duplicateLoadSheet': 'Solo se admite una hoja con el nombre {sheet}.',
  'plates.diag.looseCorner': "Placa con nodos que no se conectan a nada más (ni barra, ni apoyo, ni otra placa): ahí no se transfiere carga",
};

export default messages;
