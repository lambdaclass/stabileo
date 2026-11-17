import type { LoadModelData, LoadPlanInput } from '../load-plan';
import { defaultRegulations } from '../../../codes/roles';

export function witness(separation = 3, angle = 0, pieces = 1, mirror = 1): LoadModelData {
  const nodes: LoadModelData['nodes'] = new Map();
  const elements: LoadModelData['elements'] = new Map();
  const radians = angle * Math.PI / 180;
  let nodeId = 0, elementId = 0;
  for (const [y, count] of [[0, pieces], [separation, 1]]) {
    let previous = 0;
    for (let i = 0; i <= count; i++) {
      const x = 10 * i / count;
      const id = ++nodeId;
      nodes.set(id, { id, x: x * Math.cos(radians) - mirror * y * Math.sin(radians), y: x * Math.sin(radians) + mirror * y * Math.cos(radians), z: 3 });
      if (i > 0) {
        const id = ++elementId;
        elements.set(id, { id, nodeI: previous, nodeJ: nodeId, sectionId: 1, materialId: 1 });
      }
      previous = id;
    }
  }
  return {
    nodes, elements,
    sections: new Map([[1, { id: 1, a: 0.1 }]]), materials: new Map([[1, { id: 1, rho: 25 }]]),
    loadCases: [{ id: 1, type: 'D', name: 'Dead' }, { id: 2, type: 'L', name: 'Live' }],
  };
}

export function input(model: LoadModelData, overrides: Partial<LoadPlanInput> = {}): LoadPlanInput {
  const regulations = defaultRegulations();
  for (const key of Object.keys(regulations) as Array<keyof typeof regulations>) {
    if (regulations[key].adapterId) regulations[key] = { ...regulations[key], configComplete: true, state: 'applied' };
  }
  return {
    regulations, model, dead: [{ labelKey: 'a', q: 1 }], occupancyKey: 'vivienda', tributaryWidth: 3,
    gravity: { mode: 'width' }, reductionElementKind: 'interiorBeam', floorsSupported: 1,
    applyLiveReduction: false, generateCombinations: false, ...overrides,
  };
}

