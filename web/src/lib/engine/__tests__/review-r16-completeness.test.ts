import { afterEach, expect, it } from 'vitest';
import { solve, solvePDelta, solve3D, solvePDelta3D } from '../wasm-solver';
import type { AnalysisResults, SolverInput } from '../types';
import type { AnalysisResults3D, SolverInput3D } from '../types-3d';
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
  const solveModel = () => {
    const solver: SolverInput3D = { ...model,
      elements: new Map([...model.elements].map(([id, e]) => [id, { ...e, type: 'frame' as const, releaseMyStart: false, releaseMyEnd: false,
        releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }])),
      supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 1, fy: spatial ? 1 : 0, fz: -10, mx: 0, my: 0, mz: 0 } }],
    };
    setCompactStationTransfer(compact);
    if (spatial) return nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
    const planar: SolverInput = { nodes: new Map([...model.nodes].map(([id, n]) => [id, { id, x: n.x, z: n.z }])),
      materials: model.materials, sections: model.sections,
      elements: new Map([[1, { ...model.elements.get(1)!, type: 'frame', hingeStart: false, hingeEnd: false }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 1, fz: -10, my: 0 } }] };
    const raw: AnalysisResults = nonlinear ? solvePDelta(planar).results : solve(planar);
    return { ...raw,
      displacements: raw.displacements.map(d => ({ ...d, uy: 0, rx: 0, rz: 0 })),
      reactions: raw.reactions.map(r => ({ nodeId: r.nodeId, fx: r.rx, fz: r.rz, my: r.my, fy: 0, mx: 0, mz: 0 })),
      elementForces: raw.elementForces.map(e => ({
        elementId: e.elementId, length: e.length, nStart: e.nStart, nEnd: e.nEnd,
        myStart: e.mStart, myEnd: e.mEnd, vzStart: e.vStart, vzEnd: e.vEnd,
        mzStart: 0, mzEnd: 0, vyStart: 0, vyEnd: 0, mxStart: 0, mxEnd: 0,
        qYI: 0, qYJ: 0, qZI: e.qI, qZJ: e.qJ, distributedLoadsY: [], distributedLoadsZ: e.distributedLoads,
        pointLoadsY: [], pointLoadsZ: e.pointLoads, releaseMyStart: false, releaseMyEnd: false,
        releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false,
      })) } as unknown as AnalysisResults3D;
  };
  const combinations = [{ id: 1, name: 'first', factors: [] }, { id: 2, name: 'second', factors: [] }];
  const label = `spatial=${spatial} nonlinear=${nonlinear} compact=${compact}`;
  for (const missing of [1, 2, 'all'] as const) it(`known wrong result: #2080 refuses missing active result ${missing} ${label}`, () => {
    const raw = solveModel();
    const partial = new Map(missing === 'all' ? [] : [[missing === 1 ? 2 : 1, raw]]);
    expect(() => computeStationDemands(partial, combinations, model)).toThrow(/complete|combination/i);
    expect(() => memberContexts(model as never, partial, combinations)).toThrow(/complete|combination/i);
  });
  for (const entry of ['auto', 'unified', 'design'] as const) {
    for (const missing of ['element', 'empty', 'undefined', 'first', 'second'] as const) it(`known wrong result: #2080 refuses missing ${missing} at ${entry} ${label}`, () => {
      const raw = solveModel();
      const data = computeStationDemands(new Map([[1, raw], [2, raw]]), combinations, model).demands;
      const d = data.get(1)!;
      if (missing === 'element') data.delete(1);
      else data.set(1, { ...d, concurrent: missing === 'undefined' ? undefined : missing === 'empty' ? []
        : d.concurrent!.filter(t => t.comboId !== (missing === 'first' ? 1 : 2)) });
      const run = { auto: () => autoVerifyFromResults(raw, model, null, undefined, data),
        unified: () => runUnifiedVerification(raw, model, null, data),
        design: () => runCirsocDesign(raw, model, data, new Map(), null) }[entry];
      expect(run).toThrow(/complete|combination|concurrent/i);
    });
  }
  it(`complete data retains both combinations and endpoints still work ${label}`, () => {
    const raw = solveModel();
    const single = computeStationDemands(new Map([[1, raw]]), [combinations[0]!], model);
    expect(new Set(single.demands.get(1)!.concurrent!.map(d => d.comboId))).toEqual(new Set([1]));
    const data = computeStationDemands(new Map([[1, raw], [2, raw]]), combinations, model).demands;
    for (const v of [autoVerifyFromResults(raw, model, null, undefined, data).concrete[0]!,
      runUnifiedVerification(raw, model, null, data)[0]!, runCirsocDesign(raw, model, data, new Map(), null).concrete[0]!]) {
      expect(new Set(v.concurrentChecks!.map(c => c.demand.comboId))).toEqual(new Set([1, 2]));
      expect(v.flexure.phiMn).toBeGreaterThan(0);
    }
    expect(autoVerifyFromResults(raw, model, null).concrete[0]!.flexure.phiMn).toBeGreaterThan(0);
  });
}

it('an empty selection has no station demands', () => {
  const empty = computeStationDemands(new Map(), [], model);
  expect(empty.demands.size).toBe(0);
  expect(empty.stations.size).toBe(0);
});
