import { afterEach, expect, it } from 'vitest';
import { checkShear, prepareElementVerification, verifyElement } from '../codes/argentina/cirsoc201';
import { verifyConcurrentElement } from '../concurrent-verification';
import { declaredTestDemands } from './helpers/declared-demands';
import { solve, solvePDelta, solve3D, solvePDelta3D } from '../wasm-solver';
import { autoVerifyFromResults } from '../auto-verify';
import { computeStationDemands, runCirsocDesign, runUnifiedVerification, setCompactStationTransfer } from '../verification-service';
import type { SolverInput } from '../types';
import type { SolverInput3D } from '../types-3d';
import { columnTieSpacing } from '../../codes/cirsoc201/transverse-spacing';

const section = { b: 0.6, h: 0.2, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 };
const column = { barCount: 8, barDia: 16 };

for (const elementType of ['column', 'wall'] as const) for (const axis of ['My', 'Mz'] as const)
  for (const direction of ['primary', 'secondary'] as const) for (const entry of ['direct', 'prepared', 'concurrent'] as const)
    for (const factor of [0, 0.999, 1, 1.001]) {
      it(`known wrong result: #2198 column shear applicability ${elementType} ${axis} ${direction} ${entry} ${factor}`, () => {
        const sec = direction === 'primary' ? section : { ...section, b: section.h, h: section.b };
        const threshold = 0.5 * checkShear(section, 0).phiVc;
        const load = threshold * factor;
        const primary = axis === 'My' ? 'vz' : 'vy';
        const secondary = axis === 'My' ? 'vy' : 'vz';
        const demand = declaredTestDemands([{ comboId: 1, comboName: 'threshold', forces: {
          t: 0, x: 0, n: 0, my: 0, mz: 0, vy: 0, vz: 0, torsion: 0,
          [direction === 'primary' ? primary : secondary]: load,
        } }])[0]!.section(axis);
        const input = { ...sec, elementId: 1, elementType, edition: '2025' as const, demand };
        const fixed = { column, shear: { spacing: 0.1, legs: 2, secondaryLegs: 2 } };
        const v = entry === 'direct' ? verifyElement(input, fixed) : entry === 'prepared' ? prepareElementVerification(input)(fixed) : verifyConcurrentElement([input], fixed);
        const s = direction === 'primary' ? v.shear : v.shearSecondary;
        if (direction === 'secondary' && factor === 0) expect(s).toBeUndefined();
        else {
          expect(s).toBeDefined();
          expect(s!.ratio).toBeLessThan(1);
          expect(s!.stirrupLegs).toBe(2);
          expect(s!.status).toBe(factor > 1 ? 'fail' : 'ok');
          expect(s!.steps.some(step => typeof step !== 'string' && step.key === 'codes.cirsoc201.shear.legsInsufficient')).toBe(false);
          if (factor > 1) expect(s!.steps.some(step => typeof step === 'string' && step.includes('10.7.6.5.2'))).toBe(true);
        }
        if (factor <= 1) expect(v.overallStatus).toBe('ok');
        else expect(v.overallStatus).toBe('fail');
      });
    }

for (const direction of ['primary', 'secondary'] as const) for (const factor of [0.999, 1, 1.001]) {
  it(`known wrong result: #2198 legacy ordinary column tie boundary ${direction} ${factor}`, () => {
    const sec = { ...section, b: 0.3, h: 0.3 };
    const limit = columnTieSpacing('2025', column.barDia, sec.stirrupDia, sec.b).spacing;
    const demand = declaredTestDemands([{ comboId: 1, comboName: 'ordinary ties', forces: {
      t: 0, x: 0, n: 0, my: 0, mz: 0, vy: direction === 'secondary' ? 1 : 0, vz: direction === 'primary' ? 1 : 0, torsion: 0,
    } }])[0]!.section('My');
    const v = verifyElement({ ...sec, elementId: 1, elementType: 'column', demand },
      { column, shear: { spacing: limit * factor, legs: 2, secondaryLegs: 2 } });
    const s = direction === 'primary' ? v.shear : v.shearSecondary!;
    expect(v.column!.stirrupSpacing).toBe(Math.floor(limit * 40) / 40);
    expect(s.ratio).toBeLessThan(1);
    expect(s.status).toBe(factor > 1 ? 'fail' : 'ok');
    expect(v.overallStatus).toBe(factor > 1 ? 'fail' : 'ok');
  });
}

it('known wrong result: #2198 Russian batch label explicitly names secondary shear', async () => {
  const { default: ru } = await import('../../i18n/locales/ru');
  expect(ru['design.batch.secondaryLegs']).toBe('ветви для среза во вторичном направлении (связи включены)');
});

for (const direction of ['primary', 'secondary'] as const) for (const row of [1, 2]) for (const factor of [0.999, 1, 1.001]) {
  it(`known wrong result: #2198 legacy required column spacing boundary ${direction} row${row} ${factor}`, () => {
    const side = row === 2 ? 0.4 : 0.3;
    const sec = { ...section, b: side, h: side };
    const d = sec.h - sec.cover - sec.stirrupDia / 1000 - 16 / 2000;
    const limit = d / (row === 1 ? 2 : 4);
    const legs = row === 1 ? 2 : 6;
    const load = checkShear(sec, 0).phiVc * 0.6;
    const demand = declaredTestDemands([{ comboId: 1, comboName: 'required ties', forces: {
      t: 0, x: 0, n: 0, my: 0, mz: 0, vy: direction === 'secondary' ? load : 0, vz: direction === 'primary' ? load : 0, torsion: 0,
    } }])[0]!.section('My');
    const v = verifyElement({ ...sec, elementId: 1, elementType: 'column', demand },
      { column: { ...column, barCount: 4 + 4 * (legs - 2) }, shear: { spacing: limit * factor, legs, secondaryLegs: legs } });
    const s = direction === 'primary' ? v.shear : v.shearSecondary!;
    expect(s.ratio).toBeLessThan(1);
    expect(s.status).toBe(factor > 1 ? 'fail' : 'ok');
    if (factor > 1) expect(s.steps.some(step => typeof step === 'string' && step.includes('10.7.6.5.2'))).toBe(true);
  });
}

for (const direction of ['primary', 'secondary'] as const) {
  it(`known wrong result: #2198 legacy column spacing refuses an unavailable edition ${direction}`, () => {
    const demand = declaredTestDemands([{ comboId: 1, comboName: 'unavailable edition', forces: {
      t: 0, x: 0, n: 0, my: 0, mz: 0, vy: 1, vz: 1, torsion: 0,
    } }])[0]!.section('My');
    const v = verifyElement({ ...section, elementId: 1, elementType: 'column', demand, edition: '2005' },
      { column, shear: { spacing: 0.05, legs: 6, secondaryLegs: 6 } });
    const s = direction === 'primary' ? v.shear : v.shearSecondary!;
    expect(s.status).toBe('fail');
    expect(s.steps).toContain('Column shear spacing not evaluated for CIRSOC 201-2005');
  });
}

const p = { ...section, b: 0.2, h: 0.6 };
afterEach(() => setCompactStationTransfer(true));
for (const edition of ['2025'] as const) for (const nonlinear of [false, true]) for (const compact of [false, true]) {
  it(`known wrong result: #2198 3D low-demand column wrappers retain ordinary ties ${edition} ${nonlinear} ${compact}`, () => {
    const model = {
      elements: new Map([[1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 }]]),
      nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: 0.04 }]]),
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
      expect(v.elementType).toBe('column');
      expect(v.shear.status).toBe('ok');
      expect(v.shearSecondary!.status).toBe('ok');
      expect(v.overallStatus).toBe('ok');
    }
  });
  it(`known wrong result: #2198 2D low-demand column credits only its anchored primary legs after ${nonlinear ? 'P-Delta' : 'linear'} solve ${edition} ${compact}`, () => {
    const section = { ...p, b: p.h, h: p.b };
    const solver: SolverInput = {
      nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 0, z: 0.04 }]]),
      materials: new Map([[1, { id: 1, name: 'H25', fc: p.fc, fy: p.fy, e: 25000, nu: 0.2 }]]),
      sections: new Map([[1, { id: 1, name: 'wide', b: section.b, h: section.h, a: section.b * section.h, iz: section.b * section.h ** 3 / 12 }]]),
      elements: new Map([[1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, hingeStart: false, hingeEnd: false }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as const }]]),
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: 1, my: 1 } }],
    };
    const raw = nonlinear ? solvePDelta(solver).results : solve(solver);
    const ef = raw.elementForces[0]!;
    const inputs = declaredTestDemands(([0, 1] as const).map(t => ({ comboId: 1, comboName: '2D', forces: {
      t, x: t * ef.length, n: t ? ef.nEnd : ef.nStart, my: t ? ef.mEnd : ef.mStart, mz: 0, vy: 0, vz: t ? ef.vEnd : ef.vStart, torsion: 0,
    } }))).map(d => ({ ...section, edition, elementId: 1, elementType: 'column' as const, demand: d.section('My') }));
    for (const count of [2, 5]) {
      const fixed = { shear: { spacing: 0.05, legs: count } };
      for (const v of [verifyElement(inputs[0]!, fixed), prepareElementVerification(inputs[0]!)(fixed), verifyConcurrentElement(inputs, fixed)]) {
        expect(v.shearSecondary).toBeUndefined();
        expect(v.shear.stirrupLegs).toBe(2);
        expect(v.shear.ratio).toBeLessThan(1);
        expect(v.shear.status).toBe(count === 2 ? 'ok' : 'fail');
        expect(v.overallStatus).toBe(count === 2 ? 'ok' : 'fail');
      }
    }
  });
}

for (const direction of ['primary', 'secondary'] as const) for (const entry of ['direct', 'prepared', 'concurrent'] as const) {
  it(`known wrong result: #2198 ordinary ties do not require minimum shear steel ${direction} ${entry}`, () => {
    const sec = { ...section, b: 0.6, h: 0.6, stirrupDia: 6 };
    const demand = declaredTestDemands([{ comboId: 1, comboName: 'ordinary minimum', forces: {
      t: 0, x: 0, n: -100, my: 0, mz: 0, vy: 1, vz: 1, torsion: 0,
    } }])[0]!.section('My');
    const input = { ...sec, elementId: 1, elementType: 'column' as const, demand };
    const fixed = { column: { barCount: 12, barDia: 20 }, shear: { spacing: 0.275, legs: 2, secondaryLegs: 2 } };
    const v = entry === 'direct' ? verifyElement(input, fixed) : entry === 'prepared' ? prepareElementVerification(input)(fixed) : verifyConcurrentElement([input], fixed);
    const s = direction === 'primary' ? v.shear : v.shearSecondary!;
    expect(s.status).toBe('ok');
    expect(s.steps).not.toContain('⚠ Av < Av,mín (§9.6.3.4)');
    expect(v.overallStatus).toBe('ok');
  });
}
