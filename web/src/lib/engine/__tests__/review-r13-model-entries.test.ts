import { afterEach, expect, it } from 'vitest';
import { solve, solvePDelta, solve3D, solvePDelta3D } from '../wasm-solver';
import type { SolverInput } from '../types';
import type { SolverInput3D } from '../types-3d';
import { computeStationDemands, setCompactStationTransfer, runUnifiedVerification, runCirsocDesign } from '../verification-service';
import { autoVerifyFromResults, type AutoVerifyModelData } from '../auto-verify';
import { ConcurrentDemand } from '../concurrent-demand';
import { verifyElement, prepareElementVerification } from '../codes/argentina/cirsoc201';
import { verifyConcurrentElement } from '../concurrent-verification';

const params = { b: 0.2, h: 0.5, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 };
const model = {
  elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 }]]),
  nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 4, y: 0, z: 0 }]]),
  sections: new Map([[1, { id: 1, name: 'RC', b: params.b, h: params.h, a: params.b * params.h,
    iy: params.b * params.h ** 3 / 12, iz: params.h * params.b ** 3 / 12, j: 0.001 }]]),
  materials: new Map([[1, { id: 1, name: 'H25', fc: params.fc, fy: params.fc, e: 25000, nu: 0.2 }]]),
  supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as const }]]),
} satisfies AutoVerifyModelData;
afterEach(() => setCompactStationTransfer(true));

for (const spatial of [false, true]) for (const nonlinear of [false, true]) for (const compact of [false, true]) {
  for (const entry of ['endpoints', 'auto', 'unified', 'design'] as const) it(`#2080 ${entry} ${spatial ? 'spatial' : 'planar'} nonlinear=${nonlinear} compact=${compact} model entries retain the practical failure`, () => {
    for (const Mu of [150, 800]) {
      const solver: SolverInput3D = { ...model,
        elements: new Map([...model.elements].map(([id, e]) => [id, { ...e, type: 'frame' as const, releaseMyStart: false, releaseMyEnd: false,
          releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }])),
        supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
        loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: 0, mx: 0, my: Mu, mz: spatial ? 50 : 0 } }],
      };
      const raw = nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
      setCompactStationTransfer(compact);
      const complete = computeStationDemands(new Map([[1, raw]]), [{ id: 1, name: 'end moment', factors: [] }], model);
      const v = { endpoints: () => autoVerifyFromResults(raw, model, null).concrete[0]!, auto: () => autoVerifyFromResults(raw, model, null, undefined, complete.demands).concrete[0]!,
        unified: () => runUnifiedVerification(raw, model, null, complete.demands)[0]!, design: () => runCirsocDesign(raw, model, complete.demands, new Map(), null).concrete[0]! }[entry]();
      expect(v.flexure.phiMn).toBeGreaterThan(Mu);
      expect(v.flexure.status === 'fail').toBe(Mu === 800);
      expect(v.overallStatus === 'fail').toBe(Mu === 800);
      expect(v.concurrentChecks!.every(c => c.verification.flexure.status === 'fail')).toBe(Mu === 800);
      expect(v.flexure.AsReq > v.flexure.AsMax).toBe(Mu === 800);
    }
  });
}

for (const nonlinear of [false, true]) {
  for (const entry of ['direct', 'prepared', 'aggregate'] as const) it(`#2080 ${entry} 2D WASM solver nonlinear=${nonlinear} demands retain the practical failure`, () => {
    for (const Mu of [150, 800]) {
      const solver: SolverInput = { nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 4, z: 0 }]]),
        materials: model.materials, sections: new Map([[1, { ...model.sections.get(1)!, iz: model.sections.get(1)!.iy }]]),
        elements: new Map([[1, { ...model.elements.get(1)!, type: 'frame', hingeStart: false, hingeEnd: false }]]), supports: model.supports,
        loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: 0, my: Mu } }] };
      const raw = nonlinear ? solvePDelta(solver).results : solve(solver);
      const ef = raw.elementForces[0]!;
      const inputs = ConcurrentDemand.fromTuples(([0, 1] as const).map(t => ({ comboId: 1, comboName: 'end moment', forces: {
        t, x: t * ef.length, n: t ? ef.nEnd : ef.nStart, my: t ? ef.mEnd : ef.mStart, mz: 0,
        vy: 0, vz: t ? ef.vEnd : ef.vStart, torsion: 0,
      } }))).map(d => ({ ...params, elementId: 1, elementType: 'beam' as const, demand: d.section('My') }));
      const cage = verifyElement(inputs[0]!).flexure;
      const v = { direct: () => verifyElement(inputs[0]!, { flexure: cage }), prepared: () => prepareElementVerification(inputs[0]!)({ flexure: cage }), aggregate: () => verifyConcurrentElement(inputs) }[entry]();
      expect(v.flexure.phiMn).toBeGreaterThan(Mu);
      expect(v.flexure.AsReq > v.flexure.AsMax).toBe(Mu === 800);
      expect(v.flexure.status === 'fail').toBe(Mu === 800);
    }
  });
}
