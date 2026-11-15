import { afterEach, expect, it } from 'vitest';
import { solve, solvePDelta, solve3D, solvePDelta3D } from '../wasm-solver';
import type { SolverInput } from '../types';
import type { SolverInput3D } from '../types-3d';
import { computeStationDemands, setCompactStationTransfer, runUnifiedVerification, runCirsocDesign } from '../verification-service';
import { autoVerifyFromResults, type AutoVerifyModelData } from '../auto-verify';
import { ConcurrentDemand } from '../concurrent-demand';
import { verifyConcurrentElement } from '../concurrent-verification';
import { checkTorsion, verifyElement, prepareElementVerification } from '../codes/argentina/cirsoc201';

const params = { b: 0.3, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 };
const model = {
  elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 }]]),
  nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0.4, y: 0, z: 0 }]]),
  sections: new Map([[1, { id: 1, name: 'RC', b: params.b, h: params.h, a: params.b * params.h,
    iy: params.b * params.h ** 3 / 12, iz: params.h * params.b ** 3 / 12, j: 0.001 }]]),
  materials: new Map([[1, { id: 1, name: 'H25', fc: params.fc, fy: params.fc, e: 25000, nu: 0.2 }]]),
  supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as const }]]),
} satisfies AutoVerifyModelData;
afterEach(() => setCompactStationTransfer(true));

for (const nonlinear of [false, true]) for (const compact of [false, true]) for (const entry of ['auto', 'unified', 'design'] as const) {
  it(`#2080 ${entry} 3D nonlinear=${nonlinear} compact=${compact} retains the maximum torsion steel`, () => {
    const combos = [[300, 5], [0, 30]].map(([v, t], i) => {
      const solver: SolverInput3D = { ...model,
        elements: new Map([...model.elements].map(([id, e]) => [id, { ...e, type: 'frame' as const, releaseMyStart: false, releaseMyEnd: false,
          releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }])),
        supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
        loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: v!, mx: t!, my: 20, mz: 0 } }],
      };
      return [i + 1, nonlinear ? solvePDelta3D(solver).results : solve3D(solver)] as const;
    });
    const raw = combos[0]![1];
    setCompactStationTransfer(compact);
    const complete = computeStationDemands(new Map(combos), combos.map(([id]) => ({ id, name: `C${id}`, factors: [] })), model);
    const out = { auto: () => autoVerifyFromResults(raw, model, null, undefined, complete.demands).concrete[0]!,
      unified: () => runUnifiedVerification(raw, model, null, complete.demands)[0]!,
      design: () => runCirsocDesign(raw, model, complete.demands, new Map(), null).concrete[0]! }[entry]();
    const requirements = complete.demands.get(1)!.concurrent!.map(d => checkTorsion(params, d.section('My'), '2025'));
    expect(out.torsion!.AtOverS).toBe(Math.max(...requirements.map(t => t.AtOverS)));
    expect(out.torsion!.AlReq).toBe(Math.max(...requirements.map(t => t.AlReq)));
    expect(out.governingCombos).toMatchObject({ torsionReinforcement: { comboId: 2, comboName: 'C2' } });
    for (const c of out.concurrentChecks!) {
      expect(c.verification.torsion!.AlProv).toBe(c.verification.torsion!.neglect ? 0 : undefined);
      expect(c.verification.torsion).toHaveProperty('longitudinalProvision', c.verification.torsion!.neglect ? 'not-required' : 'not-checked');
      if (!c.verification.torsion!.neglect) expect(c.verification.diagnostics).toContainEqual(expect.objectContaining({ code: 'VERIF_TORSION_LONGITUDINAL_NOT_CHECKED' }));
    }
  });
}
for (const nonlinear of [false, true]) it(`2D WASM nonlinear=${nonlinear} remains an answered torsion-free control`, () => {
  const solver: SolverInput = { nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 0.4, z: 0 }]]),
    materials: model.materials, sections: new Map([[1, { ...model.sections.get(1)!, iz: model.sections.get(1)!.iy }]]),
    elements: new Map([[1, { ...model.elements.get(1)!, type: 'frame', hingeStart: false, hingeEnd: false }]]), supports: model.supports,
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: 0, my: 20 } }] };
  const raw = nonlinear ? solvePDelta(solver).results : solve(solver);
  const ef = raw.elementForces[0]!;
  expect(Math.abs(ef.mStart)).toBeCloseTo(20, 10);
  const inputs = ConcurrentDemand.fromTuples(([0, 1] as const).map(t => ({ comboId: 1, comboName: '2D moment', forces: {
    t, x: t * ef.length, n: t ? ef.nEnd : ef.nStart, my: t ? ef.mEnd : ef.mStart, mz: 0,
    vy: 0, vz: t ? ef.vEnd : ef.vStart, torsion: 0,
  } }))).map(d => ({ ...params, elementId: 1, elementType: 'beam' as const, demand: d.section('My') }));
  for (const v of [verifyElement(inputs[0]!), prepareElementVerification(inputs[0]!)(), verifyConcurrentElement(inputs)]) {
    expect(v.torsion).toBeUndefined();
    expect(v.flexure.Mu).toBeCloseTo(20, 10);
    expect(v.overallStatus).not.toBe('fail');
  }
});
