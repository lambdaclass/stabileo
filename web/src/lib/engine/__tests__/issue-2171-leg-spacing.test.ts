import { afterEach, expect, it } from 'vitest';
import { ConcurrentDemand } from '../concurrent-demand';
import { checkShear, prepareElementVerification, verifyElement } from '../codes/argentina/cirsoc201';
import { verifyConcurrentElement } from '../concurrent-verification';
import { transverseSpacingLimits } from '../../codes/cirsoc201/transverse-spacing';
import { solve, solvePDelta, solve3D, solvePDelta3D } from '../wasm-solver';
import { autoVerifyFromResults } from '../auto-verify';
import { computeStationDemands, runCirsocDesign, runUnifiedVerification, setCompactStationTransfer } from '../verification-service';
import type { SolverInput } from '../types';
import type { SolverInput3D } from '../types-3d';

const p = { b: 0.2, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 };
const demand = (axis: 'My' | 'Mz') => ConcurrentDemand.fromTuples([{ comboId: 1, comboName: 'low demand',
  forces: { t: 0, x: 0, n: 0, my: axis === 'My' ? 1 : 0, mz: axis === 'Mz' ? 1 : 0, vy: 1, vz: 1, torsion: 0 },
}])[0]!.section(axis);

for (const edition of ['2005', '2025'] as const) for (const axis of ['My', 'Mz'] as const) {
  for (const direction of ['primary', 'secondary'] as const) for (const elementType of ['beam', 'column', 'wall'] as const) {
    for (const entry of ['direct', 'prepared', 'concurrent'] as const) for (const count of [2, 4, 5, 6]) {
      it(`known wrong result: #2171 low-demand leg distribution ${edition} ${axis} ${direction} ${elementType} ${entry} ${count}`, () => {
        const section = direction === 'primary' ? { ...p, b: p.h, h: p.b } : p;
        const input = { ...section, edition, elementId: 1, elementType, demand: demand(axis) };
        const cage = { spacing: 0.05, legs: direction === 'primary' ? count : 2, secondaryLegs: direction === 'secondary' ? count : 2 };
        const fixed = { shear: cage };
        const v = entry === 'direct' ? verifyElement(input, fixed) : entry === 'prepared' ? prepareElementVerification(input)(fixed) : verifyConcurrentElement([input], fixed);
        const s = direction === 'primary' ? v.shear : v.shearSecondary!;
        const other = direction === 'primary' ? v.shearSecondary! : v.shear;
        expect(s.Vs).toBe(0);
        expect(s.ratio).toBeLessThan(1);
        expect(s.stirrupLegs).toBe(count);
        expect(s.status).toBe(count < 5 ? 'fail' : 'ok');
        expect(other.status).toBe('ok');
        if (count < 5) {
          expect(s.steps).toContain(`⚠ Ramas ${direction}: ${count} < 5 (§9.7.6.2.2, separación transversal)`);
          expect(v.overallStatus).toBe('fail');
          expect(v.diagnostics?.some(d => d.code === 'VERIF_FAIL_SHEAR')).toBe(true);
        }
        expect(cage).toEqual({ spacing: 0.05, legs: direction === 'primary' ? count : 2, secondaryLegs: direction === 'secondary' ? count : 2 });
      });
    }
  }
  for (const direction of ['primary', 'secondary'] as const) for (const offset of [-0.00001, 0, 0.00001]) {
    it(`known wrong result: #2171 two-leg geometry boundary ${edition} ${axis} ${direction} ${offset}`, () => {
      const depth = p.b - p.cover - p.stirrupDia / 1000 - 16 / 2000;
      const width = depth + 2 * p.cover + p.stirrupDia / 1000 + offset;
      const section = { ...p, b: direction === 'primary' ? width : p.b, h: direction === 'primary' ? p.b : width };
      const v = verifyElement({ ...section, edition, elementId: 1, elementType: 'beam', demand: demand(axis) },
        { shear: { spacing: 0.05, legs: 2 } });
      const s = direction === 'primary' ? v.shear : v.shearSecondary!;
      expect(s.stirrupLegs).toBe(2);
      expect(s.Vs).toBe(0);
      expect(s.ratio).toBeLessThan(1);
      expect(s.status).toBe(offset > 0 ? 'fail' : 'ok');
    });
  }
}
for (const edition of ['2005', '2025'] as const) {
  it(`known wrong result: #2171 scalar primary shear preserves insufficient fixed legs ${edition}`, () => {
    const section = { ...p, b: p.h, h: p.b };
    const fixed = checkShear(section, 1, 0, { edition, legs: 2, spacing: 0.05 });
    expect(fixed.stirrupLegs).toBe(2);
    expect(fixed.ratio).toBeLessThan(1);
    expect(fixed.status).toBe('fail');
    const designed = checkShear(section, 1, 0, { edition });
    expect(designed.stirrupLegs).toBe(5);
    expect(designed.status).toBe('ok');
  });
  it(`known wrong result: #2171 secondary default is provided two legs, not a design increase ${edition}`, () => {
    const v = verifyElement({ ...p, edition, elementId: 1, elementType: 'beam', demand: demand('My') });
    expect(v.shearSecondary!.stirrupLegs).toBe(2);
    expect(v.shearSecondary!.ratio).toBeLessThan(1);
    expect(v.shearSecondary!.status).toBe('fail');
    expect(v.overallStatus).toBe('fail');
  });
}

it('the wide low-demand fixture requires five distributed legs from the existing table', () => {
  const d = p.b - p.cover - p.stirrupDia / 1000 - 16 / 2000;
  const table = transverseSpacingLimits('2025', { VsRequired: 0, bw: p.h, d, fc: p.fc, cover: p.cover, stirrupDiaMm: p.stirrupDia });
  expect(d).toBe(0.159);
  expect(table.row).toBe('row1');
  expect(table.acrossSpan).toBe(0.5419999999999999);
  expect(table.acrossMax).toBe(d);
  expect(table.requiredLegs).toBe(5);
});

afterEach(() => setCompactStationTransfer(true));
for (const edition of ['2005', '2025'] as const) for (const nonlinear of [false, true]) for (const compact of [false, true]) {
  it(`known wrong result: #2171 3D low-demand wrappers reject missing distributed secondary legs ${edition} ${nonlinear} ${compact}`, () => {
    const model = {
      elements: new Map([[1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 }]]),
      nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0.04, y: 0, z: 0 }]]),
      sections: new Map([[1, { id: 1, name: 'RC', b: p.b, h: p.h, a: p.b * p.h, iy: p.b * p.h ** 3 / 12, iz: p.h * p.b ** 3 / 12, j: 0.001 }]]),
      materials: new Map([[1, { id: 1, name: 'H25', fc: p.fc, fy: p.fy, e: 25000, nu: 0.2 }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as const }]]),
    };
    const solver: SolverInput3D = { ...model,
      elements: new Map([[1, { ...model.elements.get(1)!, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
      supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 1, fz: 0, mx: 0, my: 1, mz: 0 } }],
    };
    const raw = nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
    setCompactStationTransfer(compact);
    const complete = computeStationDemands(new Map([[1, raw]]), [{ id: 1, name: 'C1', factors: [] }], model);
    for (const v of [autoVerifyFromResults(raw, model, null, { edition }, complete.demands).concrete[0]!,
      runUnifiedVerification(raw, model, null, complete.demands, { edition })[0]!,
      runCirsocDesign(raw, model, complete.demands, new Map(), null, { edition }).concrete[0]!]) {
      expect(v.shearSecondary!.ratio).toBeLessThan(1);
      expect(v.shearSecondary!.stirrupLegs).toBe(2);
      expect(v.shearSecondary!.status).toBe('fail');
      expect(v.overallStatus).toBe('fail');
    }
  });
  it(`known wrong result: #2171 2D low-demand fixed primary legs fail after ${nonlinear ? 'P-Delta' : 'linear'} solve ${edition} ${compact}`, () => {
    const section = { ...p, b: p.h, h: p.b };
    const solver: SolverInput = {
      nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 0.04, z: 0 }]]),
      materials: new Map([[1, { id: 1, name: 'H25', fc: p.fc, fy: p.fy, e: 25000, nu: 0.2 }]]),
      sections: new Map([[1, { id: 1, name: 'wide', b: section.b, h: section.h, a: section.b * section.h, iz: section.b * section.h ** 3 / 12 }]]),
      elements: new Map([[1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, hingeStart: false, hingeEnd: false }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as const }]]),
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: 1, my: 1 } }],
    };
    const raw = nonlinear ? solvePDelta(solver).results : solve(solver);
    const ef = raw.elementForces[0]!;
    const inputs = ConcurrentDemand.fromTuples(([0, 1] as const).map(t => ({ comboId: 1, comboName: '2D', forces: {
      t, x: t * ef.length, n: t ? ef.nEnd : ef.nStart, my: t ? ef.mEnd : ef.mStart, mz: 0, vy: 0, vz: t ? ef.vEnd : ef.vStart, torsion: 0,
    } }))).map(d => ({ ...section, edition, elementId: 1, elementType: 'beam' as const, demand: d.section('My') }));
    for (const count of [2, 5]) {
      const fixed = { shear: { spacing: 0.05, legs: count } };
      for (const v of [verifyElement(inputs[0]!, fixed), prepareElementVerification(inputs[0]!)(fixed), verifyConcurrentElement(inputs, fixed)]) {
        expect(v.shearSecondary).toBeUndefined();
        expect(v.shear.stirrupLegs).toBe(count);
        expect(v.shear.ratio).toBeLessThan(1);
        expect(v.shear.status).toBe(count < 5 ? 'fail' : 'ok');
        expect(v.overallStatus).toBe(count < 5 ? 'fail' : 'ok');
      }
    }
  });
}
