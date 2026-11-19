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

const regression = process.env.RUN_KNOWN_WRONG === '2316' ? it : it.skip;

regression('known wrong result: #2316 a connected X brace intersection is not a seismic story', () => {
  const model = bracedFrame();
  const options = input(model, {
    dead: [], tributaryWidth: 0,
    seismic: { enabled: true, coefficient: 1, liveParticipation: 0, directions: { x: true, y: false } },
  });
  options.regulations.seismic = { ...bindRole('seismic', 'inpres103-2018'), configComplete: true, state: 'applied' };
  const plan = buildLoadPlan(options);
  const roofForce = 16 + 8 * Math.SQRT2;
  expect(plan.outcome).toBe('READY');
  expect.soft((plan.seismicLevels ?? plan.levels).map(l => l.elevation)).toEqual([0, 4]);
  expect.soft(plan.factors.seismicWeight?.value).toBeCloseTo(roofForce, 10);
  expect.soft(plan.factors.baseShear?.value).toBeCloseTo(roofForce, 10);

  const nodal = plan.nodal.filter(load => load.caseType === 'E');
  const loads = plan.distributed.filter(load => load.caseType === 'E');
  expect.soft(nodal).toEqual([]);
  const loadedSpans = new Map([[1, [2, 4]], [2, [2, 4]], [3, [0, 4]], [6, [0, 2 * Math.SQRT2]], [7, [0, 2 * Math.SQRT2]]]);
  for (const id of model.elements.keys()) {
    const expected = loadedSpans.get(id);
    const pieces = loads.filter(load => load.elementId === id);
    expect.soft(pieces, `member ${id}`).toHaveLength(expected ? 1 : 0);
    if (!expected || !pieces[0]) continue;
    const piece = pieces[0];
    expect.soft(piece.frame).toBe('global');
    expect.soft(piece.a).toBeCloseTo(expected[0]!, 10);
    expect.soft(piece.b).toBeCloseTo(expected[1]!, 10);
    expect.soft(piece.qX).toBeCloseTo(2, 10);
    expect.soft(piece.qXJ).toBeCloseTo(2, 10);
  }

  function shearAbove(z: number) {
    let shear = nodal.reduce((sum, load) => sum + (model.nodes.get(load.nodeId)!.z! > z ? load.fx : 0), 0);
    for (const load of loads) {
      const member = model.elements.get(load.elementId)!;
      const i = model.nodes.get(member.nodeI)!, j = model.nodes.get(member.nodeJ)!;
      const rise = j.z! - i.z!;
      const length = Math.hypot(j.x - i.x, j.y - i.y, rise);
      const a = load.a ?? 0, b = load.b ?? length;
      const start = rise === 0 ? (i.z! > z ? a : b) : Math.max(a, (z - i.z!) * length / rise);
      if (start >= b) continue;
      const qI = load.qX ?? 0, qJ = load.qXJ ?? qI;
      const qStart = qI + (qJ - qI) * (start - a) / (b - a);
      shear += (b - start) * (qStart + qJ) / 2;
    }
    return shear;
  }

  expect.soft(shearAbove(0)).toBeCloseTo(roofForce, 10);
  expect.soft(shearAbove(2)).toBeCloseTo(roofForce, 10);
  expect.soft(shearAbove(3)).toBeCloseTo(12 + 4 * Math.SQRT2, 10);
});
