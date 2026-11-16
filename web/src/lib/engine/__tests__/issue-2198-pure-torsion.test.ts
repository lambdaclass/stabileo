import { afterEach, expect, it } from 'vitest';
import { declaredTestDemands } from './helpers/declared-demands';
import { prepareElementVerification, verifyElement } from '../codes/argentina/cirsoc201';
import { verifyConcurrentElement } from '../concurrent-verification';
import { autoVerifyFromResults } from '../auto-verify';
import { computeStationDemands, runCirsocDesign, runUnifiedVerification, setCompactStationTransfer } from '../verification-service';
import { solve, solve3D, solvePDelta, solvePDelta3D } from '../wasm-solver';

const round9 = process.env.RUN_KNOWN_WRONG === '2198' ? it : it.skip;
const p = { b: 0.3, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 };
const demand = (secondary: number, torque: number, axis: 'My' | 'Mz') => declaredTestDemands([{ comboId: 1, comboName: 'C1',
  forces: { t: 0, x: 0, n: 0, my: axis === 'My' ? 20 : 0, mz: axis === 'Mz' ? 20 : 0,
    vy: axis === 'My' ? secondary : 0, vz: axis === 'Mz' ? secondary : 0, torsion: torque },
}])[0]!.section(axis);
const area = Math.PI * (p.stirrupDia / 1000) ** 2 / 4;
const x = p.b - 2 * p.cover - p.stirrupDia / 1000;
const y = p.h - 2 * p.cover - p.stirrupDia / 1000;
const ph = 2 * (x + y);
const at = 10 / (0.75 * 2 * 0.85 * x * y * p.fy * 1000) * 1e4;

for (const edition of ['2005', '2025'] as const) for (const axis of ['My', 'Mz'] as const) {
  for (const elementType of ['beam', 'column', 'wall'] as const) for (const entry of ['direct', 'prepared', 'concurrent'] as const) {
    for (const secondary of [-0.010001, 0, 0.010001]) for (const secondaryLegs of [2, 4]) {
      round9(`known wrong result: #2198 torsion keeps two outer legs without secondary shear ${edition} ${axis} ${elementType} ${entry} ${secondary} ${secondaryLegs}`, () => {
        const input = { ...p, edition, elementId: 1, elementType, demand: demand(secondary, 10, axis) };
        const fixed = { shear: { spacing: 0.1, legs: 2, secondaryLegs }, torsion: { AlProv: 100 } };
        const v = entry === 'direct' ? verifyElement(input, fixed) : entry === 'prepared' ? prepareElementVerification(input)(fixed) : verifyConcurrentElement([input], fixed);
        expect(v.torsion!.neglect).toBe(false);
        expect(v.torsion!.status).toBe('ok');
        expect(v.torsion!.AtOverS).toBe(at);
        expect(v.torsion!.AtOverSProv).toBe(area / fixed.shear.spacing * 1e4);
        expect(v.shearSecondary!.stirrupLegs).toBe(secondaryLegs);
        expect(v.shearSecondary!.Vu).toBe(Math.abs(secondary));
        expect(v.shearSecondary!.ratio).toBeLessThan(1);
        const refuses = secondary !== 0 && secondaryLegs < 4;
        expect(v.shearSecondary!.status).toBe(refuses ? 'fail' : 'ok');
        expect(v.overallStatus).toBe(refuses ? 'fail' : 'ok');
        expect(v.diagnostics?.some(d => d.code === 'VERIF_FAIL_SHEAR') ?? false).toBe(refuses);
      });
    }
  }
  for (const factor of [0.999, 1, 1.001]) {
    round9(`known wrong result: #2198 pure torsion retains its own hoop spacing boundary ${edition} ${axis} ${factor}`, () => {
      const spacing = Math.min(ph / 8, 0.3) * factor;
      const v = verifyElement({ ...p, edition, elementId: 1, elementType: 'beam', demand: demand(0, 10, axis) },
        { shear: { spacing, legs: 2 }, torsion: { AlProv: 100 } });
      expect(v.shearSecondary!.stirrupLegs).toBe(2);
      expect(v.shearSecondary!.status).toBe('ok');
      expect(v.torsion!.spacingMax).toBe(Math.min(ph / 8, 0.3));
      expect(v.torsion!.reinforcementRatio).toBe(spacing / Math.min(ph / 8, 0.3));
      expect(v.torsion!.status).toBe(factor > 1 ? 'fail' : 'ok');
      expect(v.overallStatus).toBe(factor > 1 ? 'fail' : 'ok');
    });
  }
}

afterEach(() => setCompactStationTransfer(true));
for (const edition of ['2005', '2025'] as const) for (const nonlinear of [false, true]) for (const compact of [false, true]) {
  round9(`known wrong result: #2198 spatial pure torsion wrappers retain closed hoops ${edition} ${nonlinear} ${compact}`, () => {
    const model = {
      nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0.04, y: 0, z: 0 }]]),
      elements: new Map([[1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 }]]),
      sections: new Map([[1, { id: 1, name: 'RC', ...p, a: p.b * p.h, iy: p.b * p.h ** 3 / 12, iz: p.h * p.b ** 3 / 12, j: 0.001 }]]),
      materials: new Map([[1, { id: 1, name: 'H25', fc: p.fc, fy: p.fy, e: 25000, nu: 0.2 }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as const }]]),
    };
    const solver = { ...model,
      elements: new Map([[1, { ...model.elements.get(1)!, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
      supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
      loads: [{ type: 'nodal' as const, data: { nodeId: 2, fx: 0, fy: 0, fz: 0, mx: 10, my: 20, mz: 0 } }],
    };
    const raw = nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
    setCompactStationTransfer(compact);
    const complete = computeStationDemands(new Map([[1, raw]]), [{ id: 1, name: 'C1', factors: [] }], model);
    for (const v of [autoVerifyFromResults(raw, model, null, { edition }, complete.demands).concrete[0]!,
      runUnifiedVerification(raw, model, null, complete.demands, { edition })[0]!,
      runCirsocDesign(raw, model, complete.demands, new Map(), null, { edition }).concrete[0]!]) {
      expect(v.shearSecondary!.Vu).toBe(0);
      expect(v.shearSecondary!.stirrupLegs).toBe(2);
      expect(v.shearSecondary!.status).toBe('ok');
      expect(v.torsion!.neglect).toBe(false);
      expect(v.torsion!.AtOverS).toBe(at);
      expect(v.torsion!.AtOverSProv).toBeGreaterThanOrEqual(at);
      expect(v.torsion!.status).not.toBe('fail');
      expect(v.overallStatus).not.toBe('fail');
      for (const c of v.concurrentChecks!) {
        expect(c.verification.shearSecondary!.status).toBe('ok');
        expect(c.verification.shearSecondary!.stirrupLegs).toBe(2);
      }
    }
  });
  it(`planar primary shear control remains answered ${edition} ${nonlinear} ${compact}`, () => {
    const solver = {
      nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 0.04, z: 0 }]]),
      elements: new Map([[1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, hingeStart: false, hingeEnd: false }]]),
      sections: new Map([[1, { id: 1, name: 'RC', ...p, a: p.b * p.h, iz: p.b * p.h ** 3 / 12 }]]),
      materials: new Map([[1, { id: 1, name: 'H25', fc: p.fc, fy: p.fy, e: 25000, nu: 0.2 }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as const }]]),
      loads: [{ type: 'nodal' as const, data: { nodeId: 2, fx: 0, fz: 10, my: 20 } }],
    };
    const raw = nonlinear ? solvePDelta(solver).results : solve(solver);
    const ef = raw.elementForces[0]!;
    const inputs = declaredTestDemands(([0, 1] as const).map(t => ({ comboId: 1, comboName: '2D', forces: {
      t, x: t * ef.length, n: t ? ef.nEnd : ef.nStart, my: t ? ef.mEnd : ef.mStart, mz: 0,
      vy: 0, vz: t ? ef.vEnd : ef.vStart, torsion: 0,
    } }))).map(d => ({ ...p, edition, elementId: 1, elementType: 'beam' as const, demand: d.section('My') }));
    for (const v of [verifyElement(inputs[0]!), prepareElementVerification(inputs[0]!)(), verifyConcurrentElement(inputs)]) {
      expect(v.torsion).toBeUndefined();
      expect(v.shearSecondary).toBeUndefined();
      expect(v.shear.status).toBe('ok');
      expect(v.overallStatus).toBe('ok');
    }
  });
}
