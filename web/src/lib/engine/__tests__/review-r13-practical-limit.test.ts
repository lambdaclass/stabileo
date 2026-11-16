import { declaredTestDemands } from './helpers/declared-demands';
import { expect, it } from 'vitest';
import { verifyConcurrentElement } from '../concurrent-verification';
import { checkFlexure, prepareElementVerification, verifyElement, type ConcurrentVerificationInput } from '../codes/argentina/cirsoc201';

const params = { fc: 25, fy: 420, cover: 0.025, b: 0.2, h: 0.5, stirrupDia: 8 };
const practicalNotice = (steps: string[]) => steps.filter(s => s.includes('4 %·b·h') && s.includes('agrandar la sección'));
function input(Mu: number, edition: '2005' | '2025', axis: 'My' | 'Mz', elementType: 'beam' | 'column' | 'wall'): ConcurrentVerificationInput {
  const demand = declaredTestDemands([{ comboId: Mu, comboName: `M=${Mu}`, forces: {
    n: 0, my: axis === 'My' ? Mu : 0, mz: axis === 'Mz' ? Mu : 0, vy: 0, vz: 0, torsion: 0, t: 0, x: 0,
  } }])[0]!.section(axis);
  return { ...params, edition, elementId: 1, elementType, demand };
}

for (const edition of ['2005', '2025'] as const) for (const axis of ['My', 'Mz'] as const) for (const kind of ['beam', 'column', 'wall'] as const) {
  for (const entry of ['direct', 'prepared', 'aggregate', 'station'] as const) it(`#2080 ${edition} ${axis} ${kind} ${entry} fixed and shared cages retain the practical maximum failure`, () => {
    const high = input(800, edition, axis, kind), low = input(150, edition, axis, kind);
    const required = verifyElement(high).flexure;
    expect(required.AsReq).toBeGreaterThan(required.AsMax);
    expect(required.status).toBe('fail');
    expect(required.ratio).toBeLessThan(1);
    expect(practicalNotice(required.steps)).toHaveLength(1);
    const shared = verifyConcurrentElement([low, high]);
    const v = { direct: verifyElement(high, { flexure: required }), prepared: prepareElementVerification(high)({ flexure: required }),
      aggregate: shared, station: shared.concurrentChecks![1]!.verification }[entry];
    expect(v.flexure.ratio).toBeLessThan(1);
    expect(v.flexure.AsReq).toBeGreaterThan(v.flexure.AsMax);
    expect(v.flexure.status).toBe('fail');
    expect(practicalNotice(v.flexure.steps)).toEqual(practicalNotice(required.steps));
    expect(v.diagnostics!.some(d => d.code === 'VERIF_FAIL_FLEXURE')).toBe(true);
    expect(v.overallStatus).toBe('fail');
    expect(shared.concurrentChecks![0]!.verification.flexure.status).not.toBe('fail');
    expect(practicalNotice(shared.concurrentChecks![0]!.verification.flexure.steps)).toEqual([]);
  });

  it(`#2080 ${edition} ${axis} ${kind} a correct fixed cage retains its answer`, () => {
    const i = input(150, edition, axis, kind), expected = verifyElement(i).flexure;
    const shared = verifyConcurrentElement([i]);
    for (const v of [verifyElement(i, { flexure: expected }), prepareElementVerification(i)({ flexure: expected }), shared]) {
      expect(v.flexure.AsReq).toBeLessThan(v.flexure.AsMax);
      expect(v.flexure.status).not.toBe('fail');
      expect(v.flexure.phiMn).toBe(expected.phiMn);
      expect(v.flexure.AsProv).toBe(expected.AsProv);
      expect(practicalNotice(v.flexure.steps)).toEqual([]);
    }
  });
}

for (const edition of ['2005', '2025'] as const) {
  for (const entry of ['direct', 'prepared', 'aggregate'] as const) it(`#2080 ${edition} ${entry} fixed cages enforce both sides of the practical boundary`, () => {
    let lo = 500, hi = 800;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      const f = checkFlexure(params, mid, 0, { edition });
      if (f.AsReq > f.AsMax) hi = mid;
      else lo = mid;
    }
    expect(hi - lo).toBeLessThan(1e-8);
    const cage = checkFlexure(params, hi, 0, { edition });
    expect(cage.AsReq).toBeGreaterThan(cage.AsMax);
    expect(checkFlexure(params, lo, 0, { edition }).AsReq).toBeLessThanOrEqual(cage.AsMax);
    for (const Mu of [lo, hi]) {
      const i = input(Mu, edition, 'My', 'beam');
      const shared = verifyConcurrentElement([i]);
      const v = { direct: verifyElement(i, { flexure: cage }), prepared: prepareElementVerification(i)({ flexure: cage }), aggregate: shared }[entry];
      expect(v.flexure.ratio).toBeLessThan(1);
      expect(v.flexure.status === 'fail').toBe(Mu === hi);
      expect(practicalNotice(v.flexure.steps)).toHaveLength(Mu === hi ? 1 : 0);
    }
  });
}
