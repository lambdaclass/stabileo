import { afterEach, expect, it } from 'vitest';
import { solve3D, solvePDelta3D } from '../wasm-solver';
import type { SolverInput3D } from '../types-3d';
import { computeStationDemands, setCompactStationTransfer, runUnifiedVerification, runCirsocDesign } from '../verification-service';
import { autoVerifyFromResults, type AutoVerifyModelData } from '../auto-verify';
import { memberContexts } from '../design/other-codes/run';

const model = {
  elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 }]]),
  nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: 4 }]]),
  sections: new Map([[1, { id: 1, name: 'RC', b: 0.4, h: 0.4, a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.001 }]]),
  materials: new Map([[1, { id: 1, name: 'H30', fc: 30, fy: 30, e: 25000, nu: 0.2 }]]),
  supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
} satisfies AutoVerifyModelData;
afterEach(() => setCompactStationTransfer(true));
for (const spatial of [false, true]) for (const nonlinear of [false, true]) for (const compact of [false, true]) {
  it(`#2080 ${spatial ? 'spatial' : 'planar'} nonlinear=${nonlinear} compact=${compact} refuses a missing member combination at all model entries`, () => {
    const solver: SolverInput3D = { ...model,
      elements: new Map([...model.elements].map(([id, e]) => [id, { ...e, type: 'frame' as const, releaseMyStart: false, releaseMyEnd: false,
        releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }])),
      supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 1, fy: spatial ? 1 : 0, fz: -10, mx: 0, my: 0, mz: 0 } }],
    };
    const raw = nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
    const combinations = [{ id: 1, name: 'populated', factors: [] }, { id: 2, name: 'second', factors: [] }];
    setCompactStationTransfer(compact);
    const incomplete = new Map([[1, raw], [2, { ...raw, elementForces: [] }]]);
    expect(() => computeStationDemands(incomplete, combinations, model)).toThrow(/complete|combination/i);
    expect(() => memberContexts(model as never, incomplete, combinations)).toThrow(/complete|combination/i);
    const complete = computeStationDemands(new Map([[1, raw], [2, raw]]), combinations, model);
    const checks = [autoVerifyFromResults(raw, model, null, undefined, complete.demands).concrete[0]!,
      runUnifiedVerification(raw, model, null, complete.demands)[0]!, runCirsocDesign(raw, model, complete.demands, new Map(), null).concrete[0]!];
    for (const v of checks) {
      expect(new Set(v.concurrentChecks!.map(c => c.demand.comboId))).toEqual(new Set([1, 2]));
      expect(v.flexure.phiMn).toBeGreaterThan(0);
    }
  });
}
