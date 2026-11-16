import { expect, it } from 'vitest';
import { buildLoadPlan, type LoadPlanInput } from '../load-plan';
import { defaultRegulations, type ProjectRegulations } from '../../../codes/roles';

it('#2207 concentrated cross-references cannot be lost behind a numeric uniform load', () => {
  const regulations = Object.fromEntries(Object.entries(defaultRegulations()).map(([key, value]) =>
    [key, value.adapterId ? { ...value, configComplete: true, state: 'applied' } : value])) as ProjectRegulations;
  for (const key of ['escalera_privada', 'escalera_otros', 'garaje_autos']) for (const roof of [false, true]) for (const applyLiveReduction of [false, true]) {
    const occupancyKey = roof ? 'vivienda' : key;
    const input: LoadPlanInput = {
      regulations, occupancyKey, dead: [], tributaryWidth: 1,
      ...(roof ? { roof: { use: 'occupancy' as const, occupancyKey: key, dead: 0, slopeDeg: 0 } } : {}),
      reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction, generateCombinations: false,
      model: { nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 3 }], [2, { id: 2, x: 2, y: 0, z: 3 }]]),
        elements: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 }]]),
        sections: new Map([[1, { id: 1, a: 0.01 }]]), materials: new Map([[1, { id: 1, rho: 0 }]]), loadCases: [] },
    };
    const p = buildLoadPlan(input);
    expect.soft(p.outcome, occupancyKey).toBe('BLOCKED');
    expect.soft(p.blockedKeys.some(m => m.key === 'loadPlan.blocked.concentratedRule'), occupancyKey).toBe(true);
  }
});
