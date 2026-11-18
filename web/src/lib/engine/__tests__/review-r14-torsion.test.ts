import { declaredTestDemands } from './helpers/declared-demands';
import { expect, it } from 'vitest';
import { verifyConcurrentElement } from '../concurrent-verification';
import { checkTorsion, prepareElementVerification, verifyElement, type ConcurrentVerificationInput } from '../codes/argentina/cirsoc201';

const params = { b: 0.3, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 };
function inputs(edition: '2005' | '2025', axis: 'My' | 'Mz', elementType: 'beam' | 'column' | 'wall', pairs = [[300, 5], [0, 30]]): ConcurrentVerificationInput[] {
  return declaredTestDemands(pairs.map(([v, t], i) => ({ comboId: i + 1, comboName: `C${i + 1}`, forces: {
    t: i, x: 0.4 * i, n: 0, my: 20, mz: 20, vy: axis === 'Mz' ? v! : 0, vz: axis === 'My' ? v! : 0, torsion: t!,
  } }))).map(d => ({ ...params, edition, elementId: 1, elementType, demand: d.section(axis) }));
}
for (const edition of ['2005', '2025'] as const) for (const axis of ['My', 'Mz'] as const) for (const elementType of ['beam', 'column', 'wall'] as const) {
  for (const reverse of [false, true]) it(`#2080 torsion requirements survive the utilization governor ${edition} ${axis} ${elementType} reverse=${reverse}`, () => {
    const ins = inputs(edition, axis, elementType);
    const own = ins.map(i => checkTorsion(params, i.demand, edition));
    const out = verifyConcurrentElement(reverse ? [...ins].reverse() : ins);
    expect(out.torsion!.AtOverS).toBe(Math.max(...own.map(t => t.AtOverS)));
    expect(out.torsion!.AlReq).toBe(Math.max(...own.map(t => t.AlReq)));
    expect(out.torsion!.neglect).toBe(false);
    expect(out.torsion!.AtOverSProv).toBeGreaterThanOrEqual(out.torsion!.AtOverS);
    expect(out.torsion!.reinforcementRatio).toBe(Math.max(...out.concurrentChecks!.map(c => c.verification.torsion!.reinforcementRatio!)));
    expect(out.governingCombos).toMatchObject({ torsionReinforcement: { comboId: 2, comboName: 'C2' } });
    for (const c of out.concurrentChecks!) {
      expect(c.verification.torsion!.AlProv).toBe(c.verification.torsion!.neglect ? 0 : undefined);
      expect(c.verification.torsion).toHaveProperty('longitudinalProvision', c.verification.torsion!.neglect ? 'not-required' : 'not-checked');
      if (!c.verification.torsion!.neglect) {
        expect(c.verification.torsion).toHaveProperty('AtOverSProv');
        expect(c.verification.torsion).toHaveProperty('reinforcementRatio');
        expect(c.verification.torsion).toMatchObject({ status: 'warn' });
      }
    }
  });
  for (const entry of ['direct', 'prepared'] as const) for (const factor of [1 - 1e-8, 1, 1 + 1e-8]) {
    it(`#2080 ${entry} checks fixed longitudinal torsion steel ${edition} ${axis} ${elementType} ${factor}`, () => {
      const i = inputs(edition, axis, elementType, [[0, 30]])[0]!;
      const need = checkTorsion(params, i.demand, edition);
      const fixed = { shear: { spacing: 0.05, legs: 2 }, torsion: { AlProv: need.AlReq * factor } };
      const v = entry === 'direct' ? verifyElement(i, fixed) : prepareElementVerification(i)(fixed);
      expect(v.torsion).toMatchObject({ AlProv: fixed.torsion.AlProv });
      expect(v.torsion!.status === 'fail').toBe(factor < 1);
      expect(v.torsion).toHaveProperty('reinforcementRatio');
    });
  }
}
for (const entry of ['direct', 'prepared'] as const) for (const spacing of [0.05, 0.275]) {
  it(`#2080 ${entry} checks combined shear and torsion against shared stirrups s=${spacing}`, () => {
    const i = inputs('2025', 'My', 'beam', [[300, 30]])[0]!;
    const need = checkTorsion(params, i.demand, '2025');
    const fixed = { shear: { spacing, legs: 3 }, torsion: { AlProv: need.AlReq } };
    const v = entry === 'direct' ? verifyElement(i, fixed) : prepareElementVerification(i)(fixed);
    expect(v.torsion).toHaveProperty('reinforcementRatio');
    expect(v.torsion!.status === 'fail').toBe(spacing === 0.275);
  });
}
for (const edition of ['2005', '2025'] as const) for (const factor of [1 - 1e-8, 1, 1 + 1e-8]) {
  it(`#2080 torsion neglect threshold still checks shared steel ${edition} ${factor}`, () => {
    const coefficient = edition === '2005' ? 1 / 12 : 0.083;
    const threshold = 0.75 * coefficient * Math.sqrt(params.fc) * 1000 * (params.b * params.h) ** 2 / (2 * (params.b + params.h));
    const i = inputs(edition, 'My', 'beam', [[0, threshold * factor]])[0]!;
    const out = verifyConcurrentElement([i]);
    expect(out.torsion!.neglect).toBe(factor < 1);
    expect(out.torsion!.AlProv).toBe(factor < 1 ? 0 : undefined);
    expect(out.torsion).toHaveProperty('longitudinalProvision', factor < 1 ? 'not-required' : 'not-checked');
    expect(out.torsion!.status).toBe(factor < 1 ? 'ok' : 'warn');
  });
}
it('zero torsion retains the independent answer and has no torsion requirement', () => {
  const ins = inputs('2025', 'My', 'beam', [[0, 0]]);
  const own = verifyElement(ins[0]!);
  const out = verifyConcurrentElement(ins);
  expect(out.torsion).toBeUndefined();
  expect(out.flexure.phiMn).toBe(own.flexure.phiMn);
  expect(out.shear.spacing).toBe(own.shear.spacing);
  expect(out.overallStatus).not.toBe('fail');
});
for (const factor of [1 - 1e-8, 1, 1 + 1e-8]) it(`#2080 shared torsion stirrup spacing boundary ${factor}`, () => {
  const i = inputs('2025', 'My', 'beam', [[0, 6]])[0]!;
  const need = checkTorsion(params, i.demand, '2025');
  const ph = 2 * (params.b + params.h - 4 * params.cover - 2 * params.stirrupDia / 1000);
  const fixed = { shear: { spacing: Math.min(ph / 8, 0.3) * factor, legs: 2 }, torsion: { AlProv: need.AlReq } };
  const v = verifyElement(i, fixed);
  expect(v.torsion).toHaveProperty('reinforcementRatio');
  expect(v.torsion!.status === 'fail').toBe(factor > 1);
});
for (const offset of [-1e-8, 1e-8]) it(`section-limit verdict remains at its existing tolerance ${offset}`, () => {
  const base = inputs('2025', 'My', 'beam', [[0, 30]])[0]!;
  const cap = checkTorsion(params, base.demand, '2025').phiTn;
  const i = inputs('2025', 'My', 'beam', [[0, cap * (1 + 1e-6 + offset)]])[0]!;
  expect(verifyConcurrentElement([i]).torsion!.status === 'fail').toBe(offset > 0);
});
