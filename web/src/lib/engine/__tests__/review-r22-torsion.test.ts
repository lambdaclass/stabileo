import { expect, it } from 'vitest';
import { ConcurrentDemand } from '../concurrent-demand';
import { verifyConcurrentElement } from '../concurrent-verification';
import { checkTorsion, verifyElement, prepareElementVerification } from '../codes/argentina/cirsoc201';

const params = { b: 0.3, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 };
for (const edition of ['2005', '2025'] as const) for (const axis of ['My', 'Mz'] as const) for (const elementType of ['beam', 'column', 'wall'] as const) {
  const input = (torque: number) => ({ ...params, edition, elementId: 1, elementType,
    demand: ConcurrentDemand.fromTuples([{ comboId: 1, comboName: 'torsion', forces: {
      t: 0, x: 0, n: 0, my: 20, mz: 20, vy: 0, vz: 0, torsion: torque,
    } }])[0]!.section(axis) });
  for (const entry of ['direct', 'prepared', 'concurrent'] as const) {
    it.fails(`known wrong result: #2080 missing longitudinal provision is not checked ${edition} ${axis} ${elementType} ${entry}`, () => {
      const i = input(6);
      const fixed = { shear: { spacing: 0.05, legs: 2 } };
      const v = entry === 'direct' ? verifyElement(i, fixed) : entry === 'prepared' ? prepareElementVerification(i)(fixed) : verifyConcurrentElement([i]);
      expect(v.torsion!.AlReq).toBeGreaterThan(0);
      expect(v.torsion!.AlProv).toBeUndefined();
      expect(v.torsion).toHaveProperty('longitudinalProvision', 'not-checked');
      expect(v.torsion!.status).toBe('warn');
      expect(v.overallStatus).not.toBe('ok');
      expect(v.torsion!.steps.join(' ')).toContain('longitudinal por torsión no verificada');
      expect(v.diagnostics).toContainEqual(expect.objectContaining({ code: 'VERIF_TORSION_LONGITUDINAL_NOT_CHECKED' }));
    });
  }
  for (const factor of [0, 1 - 1e-8, 1, 1 + 1e-8]) {
    it(`explicit longitudinal provision retains its boundary ${edition} ${axis} ${elementType} ${factor}`, () => {
      const i = input(6), need = checkTorsion(params, i.demand, edition);
      const v = verifyElement(i, { shear: { spacing: 0.05, legs: 2 }, torsion: { AlProv: need.AlReq * factor } });
      expect(v.torsion!.AlProv).toBe(need.AlReq * factor);
      expect(v.torsion!.status === 'fail').toBe(factor < 1);
      expect(v.torsion!.reinforcementRatio).toBe(factor === 0 ? Infinity : 1 / factor);
    });
  }
  it(`zero torque keeps the correct answer ${edition} ${axis} ${elementType}`, () => {
    const v = verifyConcurrentElement([input(0)]);
    expect(v.torsion).toBeUndefined();
    expect(v.overallStatus).not.toBe('fail');
  });
}
