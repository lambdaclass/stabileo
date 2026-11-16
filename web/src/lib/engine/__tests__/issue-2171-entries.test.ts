import { declaredTestDemands } from './helpers/declared-demands';
import main from './fixtures/issue-2171-main.json';
import { afterEach, expect, it } from 'vitest';
import { ConcurrentDemand } from '../concurrent-demand';
import { verifyElement, prepareElementVerification } from '../codes/argentina/cirsoc201';
import { verifyConcurrentElement } from '../concurrent-verification';
import { verifyProvidedReinforcement } from '../station-design-forces';
import { evaluateBeamSection } from '../codes/argentina/cirsoc201-beam-kernel';
import { autoVerifyFromResults } from '../auto-verify';
import { solve, solvePDelta, solve3D, solvePDelta3D } from '../wasm-solver';
import { computeStationDemands, setCompactStationTransfer, runUnifiedVerification, runCirsocDesign } from '../verification-service';
import type { SolverInput } from '../types';
import type { SolverInput3D } from '../types-3d';

const p = { b: 0.2, h: 0.4, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 };
const demand = (secondary: number, torque: number, axis: 'My' | 'Mz') => declaredTestDemands([
  { comboId: 1, comboName: 'C1', forces: { t: 0, x: 0, n: 0, my: axis === 'My' ? 20 : 0,
    mz: axis === 'Mz' ? 20 : 0, vy: axis === 'My' ? secondary : 0, vz: axis === 'Mz' ? secondary : 0, torsion: torque } },
])[0]!.section(axis);
const capacity = (edition: '2005' | '2025', legs: number) => evaluateBeamSection({ edition,
  fc: p.fc * 1e6, fy: p.fy * 1e6, b: p.h, h: p.b, d: p.b - p.cover - p.stirrupDia / 1000 - 0.008,
  As: 0, Av: legs * 0.503 * 1e-4, s: 0.1, fyt: p.fy * 1e6, Ag: p.b * p.h, NuCompression: 0,
})!.phiVn / 1000;

for (const edition of ['2005', '2025'] as const) for (const axis of ['My', 'Mz'] as const) {
  for (const torque of [0, 10]) it(`known wrong result: #2171 silent main overall pass becomes secondary shear failure ${edition} ${axis} torque=${torque}`, () => {
    const input = { ...p, edition, elementId: 1, elementType: 'column' as const, demand: demand(capacity(edition, 2) * 1.05, torque, axis) };
    for (const v of [verifyElement(input, { shear: { legs: 4, spacing: 0.1 }, torsion: { AlProv: 100 } }),
      prepareElementVerification(input)({ shear: { legs: 4, spacing: 0.1 }, torsion: { AlProv: 100 } })]) {
      expect(v.shearSecondary!.ratio).toBeCloseTo(1.05, 12);
      expect(v.shearSecondary!.status).toBe('fail');
      expect(v.overallStatus).toBe('fail');
      expect(v.flexure.status).toBe('ok');
      expect(v.column!.status).toBe('ok');
      expect(v.shear.status).toBe('ok');
      if (torque === 0) {
        expect(v.torsion).toBeUndefined();
        expect(v.shearSecondary!.ratio).toBeGreaterThan(v.flexure.ratio);
        expect(v.shearSecondary!.ratio).toBeGreaterThan(v.column!.ratio);
      }
    }
  });
  for (const legs of [2, 3, 4, 5, 6]) for (const secondaryLegs of [undefined, 2, 3, 4, 5, 6]) for (const factor of [0.999, 1.001]) {
    it(`known wrong result: #2171 provided column secondary shear boundary ${edition} ${axis} ${legs}/${secondaryLegs} ${factor}`, () => {
      const shear = +capacity(edition, secondaryLegs ?? 2).toFixed(2);
      const d = demand(shear * factor, 0, axis);
      const stations = { elementId: 1, length: 0.04, stationTs: [0, 1], comboResults: [{ comboId: 1, comboName: 'C1',
        stations: [0, 1].map(t => ({ ...d.source.forces, t, x: t * 0.04 })) }] };
      const r = verifyProvidedReinforcement(1, 'column', { longitudinal: { count: 8, diameter: 16 },
        stirrups: { diameter: 8, legs, secondaryLegs, spacing: 0.1 } }, undefined, {}, p, stations, undefined,
        { spacingRule: { edition, maxAggregateSizeMm: 0 }, axes: { flexure: axis, shear: axis === 'My' ? 'Vz' : 'Vy',
          secondaryFlexure: axis === 'My' ? 'Mz' : 'My', secondaryShear: axis === 'My' ? 'Vy' : 'Vz',
          bFlex: p.b, hFlex: p.h, biaxial: true, sagCategory: `${axis}+`, hogCategory: `${axis}-`, basis: 'stress-proxy', secondaryRatio: 0 } });
      const row = r.checks.find(c => c.category === `Ties (${axis === 'My' ? 'Vy' : 'Vz'})`)!;
      expect(row).toBeDefined();
      expect(row.capacity).toBe(shear);
      expect(row.ratio).toBe(factor);
      expect(row.status === 'fail').toBe(factor > 1);
    });
  }
}
const model = {
  elements: new Map([[1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 }]]),
  nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0.04, y: 0, z: 0 }]]),
  sections: new Map([[1, { id: 1, name: 'RC', b: p.b, h: p.h, a: p.b * p.h,
    iy: p.b * p.h ** 3 / 12, iz: p.h * p.b ** 3 / 12, j: 0.001 }]]),
  materials: new Map([[1, { id: 1, name: 'H25', fc: p.fc, fy: p.fy, e: 25000, nu: 0.2 }]]),
  supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as const }]]),
};
afterEach(() => setCompactStationTransfer(true));
for (const edition of ['2005', '2025'] as const) for (const nonlinear of [false, true]) for (const compact of [false, true]) {
  it(`known wrong result: #2171 3D WASM wrappers retain separate shear legs ${edition} nonlinear=${nonlinear} compact=${compact}`, () => {
    const solver: SolverInput3D = { ...model,
      elements: new Map([[1, { ...model.elements.get(1)!, releaseMyStart: false, releaseMyEnd: false,
        releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
      supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 100, fz: 0, mx: 10, my: 20, mz: 0 } }],
    };
    const raw = nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
    setCompactStationTransfer(compact);
    const complete = computeStationDemands(new Map([[1, raw]]), [{ id: 1, name: 'C1', factors: [] }], model);
    for (const v of [autoVerifyFromResults(raw, model, null, { edition }, complete.demands).concrete[0]!,
      runUnifiedVerification(raw, model, null, complete.demands, { edition })[0]!,
      runCirsocDesign(raw, model, complete.demands, new Map(), null, { edition }).concrete[0]!]) {
      expect(v.shearSecondary).toBeDefined();
      expect(v.shearSecondary!.stirrupLegs).toBe(2);
      for (const c of v.concurrentChecks!) expect(c.verification.shearSecondary!.stirrupLegs).toBe(2);
    }
    for (const source of complete.demands.get(1)!.concurrent!) {
      const input = { ...p, edition, elementId: 1, elementType: 'column' as const, demand: source.section('My') };
      const v = verifyConcurrentElement([input]);
      expect(v.shearSecondary!.stirrupLegs).toBe(2);
    }
  });
  it(`2D WASM primary shear remains answered ${edition} nonlinear=${nonlinear} compact=${compact}`, () => {
    const solver: SolverInput = { nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 0.04, z: 0 }]]),
      materials: model.materials, sections: new Map([[1, { ...model.sections.get(1)!, iz: model.sections.get(1)!.iy }]]),
      elements: new Map([[1, { ...model.elements.get(1)!, hingeStart: false, hingeEnd: false }]]), supports: model.supports,
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: 10, my: 20 } }] };
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
      expect(v.overallStatus).not.toBe('fail');
    }
  });
}

for (const edition of ['2005', '2025'] as const) for (const axis of ['My', 'Mz'] as const) {
  for (const legs of [2, 3, 4, 5, 6]) for (const secondaryLegs of [undefined, 2, 3, 4, 5, 6]) {
    it(`known wrong result: #2171 provided beam torsion checks both faces ${edition} ${axis} ${legs}/${secondaryLegs}`, () => {
      const section = { ...p, b: 0.3, h: 0.6 };
      const d = demand(220.235, 30, axis);
      const cage = { diameter: 8, legs, secondaryLegs, spacing: 0.1 };
      const r = verifyProvidedReinforcement(1, 'beam', { regions: {
        bottomSpan: { count: 4, diameter: 16 }, topStart: { count: 4, diameter: 16 }, topEnd: { count: 4, diameter: 16 },
        stirrupsSpan: cage, stirrupsSupport: cage,
      } }, undefined, {}, section, { elementId: 1, length: 0.04, stationTs: [0, 0.5, 1], comboResults: [{ comboId: 1, comboName: 'C1',
        stations: [0, 0.5, 1].map(t => ({ ...d.source.forces, t, x: t * 0.04 })) }] }, undefined,
      { spacingRule: { edition, maxAggregateSizeMm: 0 }, axes: { flexure: axis, shear: axis === 'My' ? 'Vz' : 'Vy',
        secondaryFlexure: axis === 'My' ? 'Mz' : 'My', secondaryShear: axis === 'My' ? 'Vy' : 'Vz',
        bFlex: section.b, hFlex: section.h, biaxial: false, sagCategory: `${axis}+`, hogCategory: `${axis}-`, basis: 'stress-proxy', secondaryRatio: 0 } });
      const ds = section.b - section.cover - 0.008 - 0.008;
      const Aoh = (section.b - 2 * section.cover - 0.008) * (section.h - 2 * section.cover - 0.008);
      const ph = 2 * (section.b + section.h - 4 * section.cover - 0.016);
      const AbOverS = Math.PI * (cage.diameter / 1000) ** 2 / 4 / cage.spacing;
      const at = 30 / (0.75 * 2 * 0.85 * Aoh * section.fy * 1000);
      const sectionRatio = Math.hypot(220.235 / (section.h * ds), 30 * ph / (1.7 * Aoh ** 2))
        / (0.75 * (0.17 + 0.66) * Math.sqrt(section.fc) * 1000);
      const avSecondary = Math.max(0, 220.235 / 0.75 - 0.17 * Math.sqrt(section.fc) * 1000 * section.h * ds)
        / (section.fy * 1000 * ds);
      const min = Math.max(0.062 * Math.sqrt(section.fc), 0.35) / section.fy;
      const expected = Math.max(sectionRatio, at / AbOverS, cage.spacing / Math.min(ph / 8, 0.3),
        Math.max(2 * at, min * section.b) / (legs * AbOverS),
        Math.max(avSecondary + 2 * at, min * section.h) / ((secondaryLegs ?? 2) * AbOverS));
      const rows = r.checks.filter(c => c.category.startsWith('Torsion ') && !c.category.startsWith('Torsion Al'));
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.ratio).toBe(+expected.toFixed(3));
        expect(row.status === 'fail').toBe(expected > 1);
      }
    });
  }
}


for (const edition of ['2005', '2025'] as const) it(`two-legged square cage preserves main exactly ${edition}`, () => {
  const v = verifyElement({ ...p, b: 0.3, h: 0.3, edition, elementId: 1, elementType: 'column', demand: demand(40, 0, 'My') },
    { shear: { legs: 2, spacing: 0.1 } });
  const expected = main.twoLegControls[edition].main;
  expect(v.overallStatus).toBe(expected.overallStatus);
  expect(v.shear).toMatchObject(expected.shear);
  expect(v.shearSecondary).toMatchObject(expected.shearSecondary);
  expect(v.flexure.status).toBe(expected.flexureStatus);
  expect(v.column!.status).toBe(expected.columnStatus);
  expect(v.torsion).toBeUndefined();
});
