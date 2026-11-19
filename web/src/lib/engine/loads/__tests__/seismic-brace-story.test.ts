import { expect, it } from 'vitest';
import { bindRole } from '../../../codes/roles';
import { buildLoadPlan, type LoadModelData } from '../load-plan';
import { input } from './gravity-width-mass-fixture';

function bracedFrame(): LoadModelData {
  const nodes = new Map([
    [1, { id: 1, x: 0, y: 0, z: 0 }],
    [2, { id: 2, x: 4, y: 0, z: 0 }],
    [3, { id: 3, x: 0, y: 0, z: 4 }],
    [4, { id: 4, x: 4, y: 0, z: 4 }],
    [5, { id: 5, x: 2, y: 0, z: 2 }],
  ]);
  const elements = new Map([[1, 3], [2, 4], [3, 4], [1, 5], [2, 5], [5, 3], [5, 4]].map(([nodeI, nodeJ], i) => [
    i + 1, { id: i + 1, nodeI: nodeI!, nodeJ: nodeJ!, sectionId: 1, materialId: 1, type: 'frame' as const },
  ]));
  const model = {
    nodes, elements, loadCases: [],
    sections: new Map([[1, { id: 1, a: 0.5 }]]),
    materials: new Map([[1, { id: 1, rho: 4 }]]),
    supports: new Map([[1, { nodeId: 1 }], [2, { nodeId: 2 }]]),
  };
  return model;
}

const regression = process.env.RUN_KNOWN_WRONG === '2330' ? it : it.skip;

regression('known wrong result: #2330 a connected X brace intersection is not a seismic story', () => {
  const model = bracedFrame();
  const options = input(model, {
    dead: [], tributaryWidth: 0,
    seismic: { enabled: true, coefficient: 1, liveParticipation: 0, directions: { x: true, y: false } },
  });
  options.regulations.seismic = { ...bindRole('seismic', 'inpres103-2018'), configComplete: true, state: 'applied' };
  const plan = buildLoadPlan(options);
  const roofForce = 16 + 8 * Math.SQRT2;
  expect(plan.outcome).toBe('READY');
  expect.soft((plan.seismicModel?.levels ?? plan.levels).map(l => l.elevation)).toEqual([0, 4]);
  expect.soft(plan.factors.seismicWeight?.value).toBeCloseTo(roofForce, 10);
  expect.soft(plan.factors.baseShear?.value).toBeCloseTo(roofForce, 10);

  const nodal = plan.nodal.filter(load => load.caseType === 'E');
  expect.soft(plan.distributed.filter(load => load.caseType === 'E')).toEqual([]);
  expect.soft(plan.surface.filter(load => load.caseType === 'E')).toEqual([]);
  expect.soft(nodal.map(load => load.nodeId)).toEqual([3, 4]);
  for (const load of nodal) expect.soft(load.fx).toBeCloseTo(roofForce / 2, 10);

  for (const elevation of [0, 2, 3]) {
    const shear = nodal.reduce((sum, load) => sum + (model.nodes.get(load.nodeId)!.z! > elevation ? load.fx : 0), 0);
    expect.soft(shear).toBeCloseTo(roofForce, 10);
  }
});
