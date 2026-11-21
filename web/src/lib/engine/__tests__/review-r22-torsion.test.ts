import { declaredTestDemands } from './helpers/declared-demands';
import { expect, it } from 'vitest';
import { normalizeCirsoc201 } from '../design-check-results';
import { verifyConcurrentElement } from '../concurrent-verification';
import { checkTorsion, verifyElement, prepareElementVerification } from '../codes/argentina/cirsoc201';

const params = { b: 0.3, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 };
for (const edition of ['2005', '2025'] as const) for (const axis of ['My', 'Mz'] as const) for (const elementType of ['beam', 'column', 'wall'] as const) {
  const input = (torque: number) => ({ ...params, edition, elementId: 1, elementType,
    demand: declaredTestDemands([{ comboId: 1, comboName: 'torsion', forces: {
      t: 0, x: 0, n: 0, my: 20, mz: 20, vy: 0, vz: 0, torsion: torque,
    } }])[0]!.section(axis) });
  for (const entry of ['direct', 'prepared', 'concurrent'] as const) {
    it(`known wrong result: #2080 missing longitudinal provision is not checked ${edition} ${axis} ${elementType} ${entry}`, () => {
      const i = input(6);
      const fixed = { shear: { spacing: 0.05, legs: 2 } };
      const v = entry === 'direct' ? verifyElement(i, fixed) : entry === 'prepared' ? prepareElementVerification(i)(fixed) : verifyConcurrentElement([i]);
      expect(v.torsion!.AlReq).toBeGreaterThan(0);
      expect(v.torsion!.AlProv).toBeUndefined();
      expect(v.torsion).toHaveProperty('longitudinalProvision', 'not-checked');
      const fixedCage = entry !== 'concurrent';
      const reason = 'diag.rcTorsionPerimeter';
      expect(v.torsion!.status).toBe(fixedCage ? 'fail' : 'warn');
      expect(v.overallStatus).not.toBe('ok');
      const normalized = normalizeCirsoc201([v], new Map())[0]!;
      expect(normalized.status).toBe(fixedCage ? 'fail' : 'held');
      const torsion = normalized.checks.find(c => c.name === (fixedCage ? reason : 'Torsion'))!;
      expect(torsion).toBeDefined();
      expect(torsion).toHaveProperty('longitudinalProvision', 'not-checked');
      expect(torsion.demand).toBe(Math.abs(v.torsion!.Tu));
      expect(torsion.capacity).toBe(v.torsion!.phiTn);
      expect(torsion.ratio).toBe(v.torsion!.ratio);
      if (fixedCage) {
        expect(torsion.ratio).toBe(Infinity);
        expect(v.torsion!.steps).toContain(reason);
        expect(v.diagnostics).toContainEqual(expect.objectContaining({ code: 'VERIF_FAIL_TORSION', message: reason }));
      } else {
        expect(torsion.ratio).toBeCloseTo(torsion.demand / torsion.capacity, 12);
        expect(torsion.ratio).not.toBe(1);
        if (elementType === 'beam') expect(v.engineRecheck!.certified!.ok).toBe(false);
        expect(v.torsion!.steps.join(' ')).toContain('longitudinal por torsión no verificada');
        expect(v.diagnostics).toContainEqual(expect.objectContaining({ code: 'VERIF_TORSION_LONGITUDINAL_NOT_CHECKED' }));
      }
    });
  }
  for (const factor of [0, 1 - 1e-8, 1, 1 + 1e-8]) {
    it(`fixed longitudinal provision verdict ${edition} ${axis} ${elementType} ${factor}`, () => {
      const i = input(6), need = checkTorsion(params, i.demand, edition);
      const shear = { spacing: 0.05, legs: 2 };
      const v = verifyElement(i, { shear, torsion: { AlProv: need.AlReq * factor } });
      const normalized = normalizeCirsoc201([v], new Map())[0]!;
      const torsion = normalized.checks.find(c => c.name === 'diag.rcTorsionPerimeter')!;
      expect(torsion.demand).toBe(Math.abs(v.torsion!.Tu));
      expect(torsion.capacity).toBe(v.torsion!.phiTn);
      expect(torsion.ratio).toBe(v.torsion!.ratio);
      expect(v.torsion).toMatchObject({ status: 'fail', refusal: 'diag.rcTorsionPerimeter', longitudinalProvision: 'not-checked' });
      expect(v.torsion!.AlProv).toBeUndefined();
      expect(torsion.ratio).toBe(Infinity);
      expect(normalized.status).toBe('fail');
      expect(v.torsion!.reinforcementRatio).toBe(verifyElement(i, { shear }).torsion!.reinforcementRatio);
    });
  }
  it(`zero torque keeps the correct answer ${edition} ${axis} ${elementType}`, () => {
    const v = verifyConcurrentElement([input(0)]);
    expect(v.torsion).toBeUndefined();
    expect(v.overallStatus).not.toBe('fail');
    const normalized = normalizeCirsoc201([v], new Map())[0]!;
    expect(normalized.checks.some(c => c.name.startsWith('Torsion'))).toBe(false);
    expect(normalized.status).not.toBe('held');
  });
}
