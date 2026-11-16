import { expect, it } from 'vitest';
import { transverseSpacingLimits } from '../../codes/cirsoc201/transverse-spacing';
import { normalizeCirsoc201 } from '../design-check-results';
import { ConcurrentDemand } from '../concurrent-demand';
import { verifyConcurrentElement } from '../concurrent-verification';
import { checkTorsion, verifyElement, prepareElementVerification } from '../codes/argentina/cirsoc201';

const params = { b: 0.3, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 };
const adequateShear = { spacing: 0.05, legs: 2, secondaryLegs: 4 };
it('the longitudinal torsion boundary fixture satisfies both transverse leg counts', () => {
  const required = [{ b: params.b, h: params.h }, { b: params.h, h: params.b }].map(section =>
    transverseSpacingLimits('2025', { VsRequired: 0, bw: section.b,
      d: section.h - params.cover - params.stirrupDia / 1000 - 16 / 2000,
      fc: params.fc, cover: params.cover, stirrupDiaMm: params.stirrupDia }).requiredLegs);
  expect(required).toEqual([adequateShear.legs, adequateShear.secondaryLegs]);
});
for (const edition of ['2005', '2025'] as const) for (const axis of ['My', 'Mz'] as const) for (const elementType of ['beam', 'column', 'wall'] as const) {
  const input = (torque: number) => ({ ...params, edition, elementId: 1, elementType,
    demand: ConcurrentDemand.fromTuples([{ comboId: 1, comboName: 'torsion', forces: {
      t: 0, x: 0, n: 0, my: 20, mz: 20, vy: 0, vz: 0, torsion: torque,
    } }])[0]!.section(axis) });
  for (const entry of ['direct', 'prepared', 'concurrent'] as const) {
    it(`known wrong result: #2080 missing longitudinal provision is not checked ${edition} ${axis} ${elementType} ${entry}`, () => {
      const i = input(6);
      const fixed = { shear: adequateShear };
      const v = entry === 'direct' ? verifyElement(i, fixed) : entry === 'prepared' ? prepareElementVerification(i)(fixed) : verifyConcurrentElement([i], fixed);
      expect(v.shear.status).toBe('ok');
      expect(v.shearSecondary!.status).toBe('ok');
      expect(v.torsion!.AlReq).toBeGreaterThan(0);
      expect(v.torsion!.AlProv).toBeUndefined();
      expect(v.torsion).toHaveProperty('longitudinalProvision', 'not-checked');
      expect(v.torsion!.status).toBe('warn');
      expect(v.overallStatus).not.toBe('ok');
      const normalized = normalizeCirsoc201([v], new Map())[0]!;
      expect(normalized.status).toBe('held');
      const torsion = normalized.checks.find(c => c.name === 'Torsion')!;
      expect(torsion).toBeDefined();
      expect(torsion).toHaveProperty('longitudinalProvision', 'not-checked');
      expect(torsion.demand).toBe(Math.abs(v.torsion!.Tu));
      expect(torsion.capacity).toBe(v.torsion!.phiTn);
      expect(torsion.ratio).toBe(v.torsion!.ratio);
      expect(torsion.ratio).toBeCloseTo(torsion.demand / torsion.capacity, 12);
      expect(torsion.ratio).not.toBe(1);
      if (entry === 'concurrent' && elementType === 'beam') expect(v.engineRecheck!.certified!.ok).toBe(false);
      expect(v.torsion!.steps.join(' ')).toContain('longitudinal por torsión no verificada');
      expect(v.diagnostics).toContainEqual(expect.objectContaining({ code: 'VERIF_TORSION_LONGITUDINAL_NOT_CHECKED' }));
    });
  }
  for (const factor of [0, 1 - 1e-8, 1, 1 + 1e-8]) {
    it(`explicit longitudinal provision retains its boundary ${edition} ${axis} ${elementType} ${factor}`, () => {
      const i = input(6), need = checkTorsion(params, i.demand, edition);
      const v = verifyElement(i, { shear: adequateShear, torsion: { AlProv: need.AlReq * factor } });
      expect(v.shear.status).toBe('ok');
      expect(v.shearSecondary!.status).toBe('ok');
      expect(v.torsion!.AlProv).toBe(need.AlReq * factor);
      expect(v.torsion!.status === 'fail').toBe(factor < 1);
      expect(v.torsion!.reinforcementRatio).toBe(factor === 0 ? Infinity : 1 / factor);
      const normalized = normalizeCirsoc201([v], new Map())[0]!;
      const torsion = normalized.checks.find(c => c.name === 'Torsion')!;
      expect(torsion.demand).toBe(Math.abs(v.torsion!.Tu));
      expect(torsion.capacity).toBe(v.torsion!.phiTn);
      expect(torsion.ratio).toBe(v.torsion!.ratio);
      expect(normalized.status === 'fail').toBe(factor < 1);
      expect(normalized.status).not.toBe('held');
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
