import { declaredTestDemands } from './helpers/declared-demands';
import { expect, it } from 'vitest';
import { checkTorsion, prepareElementVerification, verifyElement, type ConcurrentVerificationInput } from '../codes/argentina/cirsoc201';

const p = { b: 0.3, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 };
function input(edition: '2005' | '2025', axis: 'My' | 'Mz', elementType: 'beam' | 'column' | 'wall', Tu: number): ConcurrentVerificationInput {
  const d = declaredTestDemands([{ comboId: 1, comboName: 'torsion', forces: {
    t: 0, x: 0, n: 0, my: 20, mz: 20, vy: 0, vz: 0, torsion: Tu,
  } }])[0]!;
  return { ...p, edition, elementId: 1, elementType, demand: d.section(axis) };
}
for (const edition of ['2005', '2025'] as const) for (const axis of ['My', 'Mz'] as const) for (const elementType of ['beam', 'column', 'wall'] as const) {
  for (const entry of ['direct', 'prepared'] as const) for (const fixedShear of [false, true]) for (const fixedTorsion of [false, true]) {
    it(`known wrong result: #2080 checks every stirrup cage ${edition} ${axis} ${elementType} ${entry} shear=${fixedShear} torsion=${fixedTorsion}`, () => {
      const i = input(edition, axis, elementType, 30);
      const need = checkTorsion(p, i.demand, edition);
      const fixed = { ...(fixedShear ? { shear: { spacing: 0.275, legs: 2 } } : {}), ...(fixedTorsion ? { torsion: { AlProv: need.AlReq } } : {}) };
      const v = entry === 'direct' ? verifyElement(i, fixed) : prepareElementVerification(i)(fixed);
      expect(v.torsion!.status).toBe('fail');
      expect(v.torsion!.AtOverSProv).toBeLessThan(need.AtOverS);
      expect(v.torsion!.reinforcementRatio).toBeGreaterThan(1);
      expect(v.overallStatus).toBe('fail');
      expect(v.diagnostics).toContainEqual(expect.objectContaining({ code: 'VERIF_FAIL_TORSION' }));
    });
  }
  for (const entry of ['direct', 'prepared'] as const) for (const fixedTorsion of [false, true]) for (const factor of [1 - 1e-8, 1, 1 + 1e-8]) {
    it(`known wrong result: #2080 torsion spacing boundary ${edition} ${axis} ${elementType} ${entry} torsion=${fixedTorsion} ${factor}`, () => {
      const i = input(edition, axis, elementType, 6);
      const need = checkTorsion(p, i.demand, edition);
      const fixed = { shear: { spacing: need.spacingMax! * factor, legs: 2 }, ...(fixedTorsion ? { torsion: { AlProv: need.AlReq } } : {}) };
      const v = entry === 'direct' ? verifyElement(i, fixed) : prepareElementVerification(i)(fixed);
      expect(v.torsion!.status === 'fail').toBe(factor > 1);
      expect(v.torsion!.AtOverSProv).toBeGreaterThanOrEqual(need.AtOverS);
      expect(v.torsion!.reinforcementRatio).toBeCloseTo(Math.max(need.AtOverS / v.torsion!.AtOverSProv!, factor, ...(fixedTorsion ? [1] : [])), 12);
    });
  }
  for (const entry of ['direct', 'prepared'] as const) for (const factor of [1 - 1e-8, 1 + 1e-8]) {
    it(`known wrong result: #2080 transverse capacity boundary ${edition} ${axis} ${elementType} ${entry} ${factor}`, () => {
      const i = input(edition, axis, elementType, 30);
      const need = checkTorsion(p, i.demand, edition);
      const area = Math.PI * (p.stirrupDia / 1000) ** 2 / 4 * 1e4;
      const fixed = { shear: { spacing: area / need.AtOverS * factor, legs: 2 } };
      expect(fixed.shear.spacing).toBeLessThan(need.spacingMax!);
      const v = entry === 'direct' ? verifyElement(i, fixed) : prepareElementVerification(i)(fixed);
      expect(v.torsion!.AtOverSProv).toBeCloseTo(need.AtOverS / factor, 12);
      expect(v.torsion!.status === 'fail').toBe(factor > 1);
    });
  }
  for (const factor of [1 - 1e-8, 1, 1 + 1e-8]) {
    it(`known wrong result: #2080 no longitudinal override at neglect boundary ${edition} ${axis} ${elementType} ${factor}`, () => {
      const base = input(edition, axis, elementType, 30);
      const threshold = 0.75 * checkTorsion(p, base.demand, edition).Tcr / 4;
      const v = verifyElement(input(edition, axis, elementType, threshold * factor), { shear: { spacing: 0.275, legs: 2 } });
      expect(v.torsion!.neglect).toBe(factor < 1);
      expect(v.torsion!.status === 'fail').toBe(factor >= 1);
    });
  }
  it('zero torque keeps its correct answer ' + [edition, axis, elementType].join(' '), () => {
    const v = verifyElement(input(edition, axis, elementType, 0), { shear: { spacing: 0.275, legs: 2 } });
    expect(v.torsion).toBeUndefined();
    expect(v.overallStatus).not.toBe('fail');
  });
}
