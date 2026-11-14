import { afterEach, expect, it } from 'vitest';
import { solve3D, solvePDelta3D } from '../wasm-solver';
import type { SolverInput3D } from '../types-3d';
import { ConcurrentDemand } from '../concurrent-demand';
import { computeStationDemands, setCompactStationTransfer, runUnifiedVerification, runCirsocDesign } from '../verification-service';
import { autoVerifyFromResults, type AutoVerifyModelData } from '../auto-verify';
import { checkSlender, verifyElement } from '../codes/argentina/cirsoc201';
import type { AnalysisResults3D, ElementForces3D } from '../types-3d';

const params = { b: 0.4, h: 0.4, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8 };
const model = {
  elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 }]]),
  nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: 8 }]]),
  sections: new Map([[1, { id: 1, name: 'RC', ...params, a: 0.16, iy: params.b * params.h ** 3 / 12, iz: params.h * params.b ** 3 / 12, j: 0.001 }]]),
  materials: new Map([[1, { id: 1, name: 'H30', fc: 30, fy: 30, e: 25000, nu: 0.2 }]]), supports: new Map(),
} satisfies AutoVerifyModelData;
const force = (): ElementForces3D => ({ elementId: 1, length: 8, nStart: -300, nEnd: -300,
  myStart: -20, myEnd: 20, mzStart: -20, mzEnd: 20, vyStart: 10, vyEnd: -10, vzStart: 10, vzEnd: -10, mxStart: 0, mxEnd: 0,
  qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, distributedLoadsY: [], distributedLoadsZ: [], pointLoadsY: [], pointLoadsZ: [],
  releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false });
afterEach(() => setCompactStationTransfer(true));
for (const axis of ['My', 'Mz'] as const) for (const kind of ['uniform', 'partial', 'point', 'unloaded'] as const) {
  for (const compact of [false, true]) it(`#2089 ${axis} ${kind} loading survives compact=${compact} and every RC entry`, () => {
    const ef = force();
    const z = axis === 'My';
    if (kind === 'uniform') { if (z) ef.qZI = 2; else ef.qYI = 2; }
    if (kind === 'partial') { if (z) ef.distributedLoadsZ = [{ a: 1, b: 7, qI: 0, qJ: 2 }]; else ef.distributedLoadsY = [{ a: 1, b: 7, qI: 0, qJ: 2 }]; }
    if (kind === 'point') { if (z) ef.pointLoadsZ = [{ a: 4, p: 2 }]; else ef.pointLoadsY = [{ a: 4, p: 2 }]; }
    const raw: AnalysisResults3D = { elementForces: [ef], displacements: [], reactions: [] };
    setCompactStationTransfer(compact);
    const data = computeStationDemands(new Map([[1, raw]]), [{ id: 1, name: 'load', factors: [] }], model);
    const ds = ConcurrentDemand.fromStations(data.stations.get(1)!);
    const expected = kind !== 'unloaded';
    expect(ds.every(d => d.transverseLoading?.[axis] === expected)).toBe(true);
    expect(ConcurrentDemand.endpoints(ef)[0]!.transverseLoading?.[axis]).toBe(expected);
    const direct = verifyElement({ ...params, elementId: 1, elementType: 'column', Lu: 8, demand: ds[0]!.section(axis) });
    const [a, b] = ds[0]!.ends[axis === 'My' ? 'my' : 'mz'];
    const [big, small] = Math.abs(a) >= Math.abs(b) ? [a, b] : [b, a];
    const expectedCm = kind === 'unloaded' ? checkSlender(params, 300, ds[0]!.section(axis).Mu, 8,
      { M1: Math.sign(a) === Math.sign(b) ? Math.abs(small) : -Math.abs(small), M2: Math.abs(big) }).Cm : 1;
    expect(direct.slender!.Cm).toBe(expectedCm);
    for (const demands of [undefined, data.demands]) {
      const checks = [autoVerifyFromResults(raw, model, null, undefined, demands).concrete[0]!,
        runUnifiedVerification(raw, model, null, demands)[0]!, runCirsocDesign(raw, model, demands, new Map(), null).concrete[0]!];
      for (const v of checks) for (const c of v.concurrentChecks!) {
        const s = c.verification;
        const selected = c.demand.section(axis).axis;
        expect(selected).toBe(axis);
        const loaded = v.flexureAxis === axis ? s.slender! : s.slenderSecondary!;
        const unloaded = v.flexureAxis === axis ? s.slenderSecondary! : s.slender!;
        const [la, lb] = c.demand.ends[axis === 'My' ? 'my' : 'mz'];
        const [lbig, lsmall] = Math.abs(la) >= Math.abs(lb) ? [la, lb] : [lb, la];
        const ownCm = kind !== 'unloaded' ? 1 : checkSlender(params, 300, c.demand.section(axis).Mu, 8,
          { M1: Math.sign(la) === Math.sign(lb) ? Math.abs(lsmall) : -Math.abs(lsmall), M2: Math.abs(lbig) }).Cm;
        expect(loaded.Cm).toBe(ownCm);
        const other = axis === 'My' ? 'Mz' : 'My';
        const [a, b] = c.demand.ends[other === 'My' ? 'my' : 'mz'];
        const [big, small] = Math.abs(a) >= Math.abs(b) ? [a, b] : [b, a];
        const cm = checkSlender(params, 300, c.demand.section(other).Mu, 8,
          { M1: Math.sign(a) === Math.sign(b) ? Math.abs(small) : -Math.abs(small), M2: Math.abs(big) }).Cm;
        expect(unloaded.Cm).toBe(cm);
      }
    }
  });
}
for (const a of [0, 1e-8, 8 - 1e-8, 8]) it(`point load location boundary ${a}`, () => {
  const ef = force(); ef.pointLoadsZ = [{ a, p: 2 }];
  expect(ConcurrentDemand.endpoints(ef)[0]!.transverseLoading?.My).toBe(a > 0 && a < 8);
});

for (const axis of ['My', 'Mz'] as const) it(`missing ${axis} load information remains unknown through endpoint demand`, () => {
  const ef = force();
  if (axis === 'My') delete (ef as Partial<ElementForces3D>).pointLoadsZ;
  else delete (ef as Partial<ElementForces3D>).pointLoadsY;
  const d = ConcurrentDemand.endpoints(ef)[0]!;
  expect(d.transverseLoading?.[axis]).toBeUndefined();
  expect(verifyElement({ ...params, elementId: 1, elementType: 'column', Lu: 8, demand: d.section(axis) }).slender!.Cm).toBe(1);
});

for (const nonlinear of [false, true]) for (const spatial of [false, true]) {
  it(`#2089 solved ${spatial ? 'spatial' : 'planar'} transverse column retains Cm unity nonlinear=${nonlinear}`, () => {
    const fixed = { ...model, supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as const }]]) };
    const solver: SolverInput3D = { ...fixed,
      elements: new Map([...model.elements].map(([id, e]) => [id, { ...e, type: 'frame' as const,
        releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }])),
      supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: -300, mx: 0, my: 0, mz: 0 } },
        { type: 'distributed', data: { elementId: 1, qYI: spatial ? 0.1 : 0, qYJ: spatial ? 0.1 : 0, qZI: 0.1, qZJ: 0.1 } }],
    };
    const raw = nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
    expect(ConcurrentDemand.endpoints(raw.elementForces[0]!)[0]!.transverseLoading?.My).toBe(true);
    for (const compact of [false, true]) {
      setCompactStationTransfer(compact);
      const demands = computeStationDemands(new Map([[1, raw]]), [{ id: 1, name: 'transverse', factors: [] }], fixed).demands;
      for (const d of [undefined, demands]) {
        const checks = [autoVerifyFromResults(raw, fixed, null, undefined, d).concrete[0]!,
          runUnifiedVerification(raw, fixed, null, d)[0]!, runCirsocDesign(raw, fixed, d, new Map(), null).concrete[0]!];
        for (const v of checks) for (const c of v.concurrentChecks!) {
          expect(c.verification.slender!.Cm).toBe(1);
          if (spatial) expect(c.verification.slenderSecondary!.Cm).toBe(1);
        }
      }
    }
  });
}
