import { expect, it } from 'vitest';
import { ConcurrentDemand } from '../concurrent-demand';
import { verifyConcurrentElement } from '../concurrent-verification';
import { checkFlexure, prepareElementVerification, verifyElement, type ConcurrentVerificationInput } from '../codes/argentina/cirsoc201';
import { checkFlexureFlanged } from '../codes/argentina/cirsoc201-flanged';
import { evaluateBeamSection } from '../codes/argentina/cirsoc201-beam-kernel';

for (const edition of ['2005', '2025'] as const) {
  for (const flange of [false, true]) for (const Mu of [0, 120, 400]) {
    it(`#2080 ${edition} flange=${flange} Mu=${Mu} minimum uses the provided depth`, () => {
      const p = { fc: 25, fy: 420, cover: 0.03, b: 0.2, h: 0.6, stirrupDia: 8 };
      const f = flange ? checkFlexureFlanged(p, { bf: 1.2, hf: 0.1, bw: p.b }, Mu, edition) : checkFlexure(p, Mu, 0, { edition });
      const rhoMin = Math.max(0.25 * Math.sqrt(p.fc) / p.fy, 1.4 / p.fy);
      expect(f.AsMin).toBeCloseTo(rhoMin * p.b * f.d * 1e4, 6);
      expect(f.AsReq).toBe(Math.max(f.AsFlexural, f.AsMin));
      expect(f.AsProv).toBeGreaterThanOrEqual(f.AsMin);
    });
  }
  for (const axis of ['My', 'Mz'] as const) for (const elementType of ['beam', 'column', 'wall'] as const) {
    it(`#2080 ${edition} ${axis} ${elementType} keeps required and provided strains distinct`, () => {
      const inputs: ConcurrentVerificationInput[] = ConcurrentDemand.fromTuples([20, 100].map((m, i) => ({ comboId: i + 1, comboName: `C${i + 1}`,
        forces: { t: 0.5, x: 2, n: 0, my: m, mz: m, vy: 1, vz: 1, torsion: 0 } })))
        .map(d => ({ elementId: 1, elementType, edition, demand: d.section(axis), b: 0.4, h: 0.4, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8 }));
      const required = inputs.map(i => verifyElement(i).flexure);
      expect(required[1]!.AsProv).toBeGreaterThan(required[0]!.AsProv);
      const shared = verifyConcurrentElement(inputs).concurrentChecks!.map(c => c.verification);
      for (let k = 0; k < inputs.length; k++) {
        const i = inputs[k]!;
        for (const v of [verifyElement(i, { flexure: required[1]! }), prepareElementVerification(i)({ flexure: required[1]! }), shared[k]!]) {
          const f = v.flexure, req = required[k]!;
          expect([f.designDepth, f.c, f.aReq, f.epsilonT]).toEqual([req.designDepth, req.c, req.aReq, req.epsilonT]);
          const evaluated = evaluateBeamSection({ edition, fc: i.fc * 1e6, fy: i.fy * 1e6, b: i.b, h: i.h, d: f.d, As: f.AsProv * 1e-4 })!;
          expect((f as unknown as { epsilonTProv: number }).epsilonTProv).toBe(evaluated.epsilonT);
          if (k === 0) expect(evaluated.epsilonT).not.toBe(req.epsilonT);
        }
      }
    });
  }
}

for (const edition of ['2005', '2025'] as const) for (const delta of [-1e-8, 0, 1e-8]) {
  it(`#2080 ${edition} shared minimum boundary ${delta}`, () => {
    const demand = ConcurrentDemand.fromTuples([{ comboId: 1, comboName: 'zero', forces: { t: 0, x: 0, n: 0, my: 0, mz: 0, vy: 0, vz: 0, torsion: 0 } }])[0]!;
    const i: ConcurrentVerificationInput = { elementId: 1, elementType: 'beam', edition, demand: demand.section('My'), b: 0.4, h: 0.4, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8 };
    const f = verifyElement(i).flexure;
    const fixed = { ...f, AsProv: f.AsMin + delta };
    for (const v of [verifyElement(i, { flexure: fixed }), prepareElementVerification(i)({ flexure: fixed })]) {
      expect(v.flexure.status).toBe(delta < 0 ? 'fail' : 'ok');
      expect(v.flexure.ratio).toBe(0);
    }
  });
}
