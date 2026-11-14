import { expect, it } from 'vitest';
import { checkFlexure, prepareElementVerification, verifyElement } from '../codes/argentina/cirsoc201';
import { checkFlexureFlanged } from '../codes/argentina/cirsoc201-flanged';
import { evaluateBeamSection } from '../codes/argentina/cirsoc201-beam-kernel';
import { ConcurrentDemand } from '../concurrent-demand';
import { verifyConcurrentElement } from '../concurrent-verification';

const p = { fc: 25, fy: 420, cover: 0.02, b: 0.12, h: 0.40, stirrupDia: 6 };
function check(f: ReturnType<typeof checkFlexure>, edition: '2005' | '2025', flange?: { bf: number; hf: number }) {
  expect(f.d).toBe(0.366);
  expect(f.designDepth).toBe(f.d);
  const providedDepth = (f as typeof f & { providedDepth: number }).providedDepth;
  expect(providedDepth).toBe(p.h - p.cover - p.stirrupDia / 1000 - f.barDia / 2000);
  const r = evaluateBeamSection({ edition, fc: p.fc * 1e6, fy: p.fy * 1e6, b: p.b, h: p.h, d: providedDepth,
    As: f.AsProv * 1e-4, AsComp: (f.AsComp ?? 0) * 1e-4,
    dPrime: f.barDiaComp ? p.cover + p.stirrupDia / 1000 + f.barDiaComp / 2000 : 0,
    Ag: flange ? flange.bf * flange.hf + p.b * (p.h - flange.hf) : p.b * p.h, bf: flange?.bf, hf: flange?.hf })!;
  expect(f.phiMn).toBe(r.phiMn / 1000);
  expect(f.epsilonTProv).toBe(r.epsilonT);
}
for (const edition of ['2005', '2025'] as const) {
  for (const Mu of [0, 52, 70]) it(`known wrong result: #2080 sizing depth stays with required steel ${edition} ${Mu}`, () => {
    check(checkFlexure(p, Mu, 0, { edition }), edition);
  });
  it(`known wrong result: #2080 flanged sizing depth ${edition}`, () => {
    const flange = { bf: 1.37, hf: 0.10 };
    check(checkFlexureFlanged(p, { ...flange, bw: p.b }, 52, edition), edition, flange);
  });
  for (const axis of ['My', 'Mz'] as const) for (const elementType of ['beam', 'column', 'wall'] as const) {
    it(`known wrong result: #2080 all verification entries separate depths ${edition} ${axis} ${elementType}`, () => {
      const inputs = ConcurrentDemand.fromTuples([20, 52].map((m, k) => ({ comboId: k + 1, comboName: 'depth', forces: {
        t: k, x: k, n: 0, my: m, mz: m, vy: 0, vz: 0, torsion: 0,
      } }))).map(d => ({ ...p, edition, elementType, elementId: 1, demand: d.section(axis) }));
      const fixed = { ...checkFlexure(p, 52, 0, { edition }), d: 1, providedDepth: 1 };
      for (const i of inputs) for (const f of [verifyElement(i).flexure, verifyElement(i, { flexure: fixed }).flexure,
        prepareElementVerification(i)({ flexure: fixed }).flexure]) check(f, edition);
      for (const c of verifyConcurrentElement(inputs).concurrentChecks!) check(c.verification.flexure, edition);
    });
  }
}
