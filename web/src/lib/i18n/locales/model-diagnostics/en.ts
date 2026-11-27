import type { Translations } from '../../types';

const messages: Translations = {
  "diag.model.flangeTwice": "Beams with a T section under a slab that is modeled too: the flange counts twice in their stiffness. Model the web as a rectangle and the slab as shells; the flange is taken in the design from Design data.",
  "diag.tooltip.MODEL_FLANGE_TWICE": "T section and modeled slab: the flange counts twice",
  'pro.plates.diag.looseCorner': "Plate with nodes connected to nothing else (no member, support or other plate): no load is transferred there",
  "plates.meshedAtAnalysisKept": "{n} plates meshed before the analysis ({cells} elements); the other {kept} kept their mesh.",
  'svc.engine.conflictingConstraints': 'Degree of freedom {dof} (node {node}) is tied by {n} constraints; only the last one applies',
  "diag.detail.nodes": "nodes",
  "diag.detail.cases": "cases",
  "diag.detail.computed": "computed",
  "diag.detail.limit": "limit",
  "diag.detail.ratio": "ratio",
  "diag.detail.value": "value",
  "diag.detail.dofIndices": "degrees of freedom",
  "diag.detail.n": "count",
  "diag.detail.add": "to add",
  "diag.detail.change": "to change",
  "diag.detail.remove": "to remove",
  "plates.analysisStale": "These plates were solved on their out-of-date mesh: {names}. It is still a valid mesh, but it does not follow the model's latest changes; mesh them or turn on «Mesh before analysis» so it does.",
  'xls.err.duplicatePhysicalColumn': 'The physical column {k} appears more than once.',
  'xls.err.duplicateLoadSheet': 'Only one sheet named {sheet} is allowed.',
  'plates.diag.looseCorner': "Plate with nodes connected to nothing else (no member, support or other plate): no load is transferred there",
};

export default messages;
