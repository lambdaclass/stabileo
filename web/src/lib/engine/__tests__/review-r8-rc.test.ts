import { expect, it } from 'vitest';
import { ConcurrentDemand } from '../concurrent-demand';
import { checkFlexure, prepareElementVerification, verifyElement, amplifiedDemand, verificationCase, type ConcurrentVerificationInput } from '../codes/argentina/cirsoc201';
import { verifyConcurrentElement } from '../concurrent-verification';
import { evaluateBeamSection } from '../codes/argentina/cirsoc201-beam-kernel';
import { verifyElement as manual } from './helpers/verify-element';

const geometry = { b: 0.4, h: 0.4, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8 };
const station = (t: number, m: number) => ({ t, x: 4 * t, n: -300, my: m, mz: m, vy: 0, vz: 0, torsion: 0 });
for (const edition of ['2005', '2025'] as const) for (const axis of ['My', 'Mz'] as const) {
  for (const elementType of ['beam', 'column', 'wall'] as const) {
    it.fails(`#2080 selected bars determine depth and shared capacity ${edition} ${axis} ${elementType}`, () => {
      const inputs = ConcurrentDemand.fromTuples([20, 100].map((m, i) => ({ comboId: i, comboName: `${i}`, forces: { ...station(0.5, m), n: 0 } })))
        .map(d => ({ ...geometry, edition, elementId: 1, elementType, demand: d.section(axis) }));
      const large = verifyElement(inputs[1]!).flexure;
      const depth = geometry.h - geometry.cover - geometry.stirrupDia / 1000 - large.barDia / 2000;
      const oracle = evaluateBeamSection({ edition, fc: geometry.fc * 1e6, fy: geometry.fy * 1e6, b: geometry.b, h: geometry.h,
        d: depth, As: large.AsProv * 1e-4, AsComp: 0, dPrime: 0, Ag: geometry.b * geometry.h, NuCompression: 0 })!;
      for (const v of [verifyElement(inputs[1]!), verifyElement(inputs[0]!, { flexure: large }),
        prepareElementVerification(inputs[0]!)({ flexure: { ...large, d: 0.399 } }),
        ...verifyConcurrentElement(inputs).concurrentChecks!.map(c => c.verification)]) {
        expect(v.flexure.d).toBe(depth);
        expect(v.flexure.phiMn).toBe(oracle.phiMn / 1000);
      }
    });
  }
  for (const loading of [true, undefined]) for (const elementType of ['column', 'wall'] as const) {
    it.fails(`#2080 transverse or unknown load forbids end gradient ${edition} ${axis} ${elementType} ${loading}`, () => {
      const demands = ConcurrentDemand.fromStations({ elementId: 1, length: 4, stationTs: [0, 0.5, 1], comboResults: [{
        comboId: 1, comboName: 'loaded', transverseLoading: { My: loading, Mz: loading },
        stations: [station(0, -20), station(0.5, 60), station(1, 20)],
      }] } as Parameters<typeof ConcurrentDemand.fromStations>[0]);
      const inputs: ConcurrentVerificationInput[] = demands.map(d => ({ ...geometry, edition, elementId: 1, elementType, Lu: 4, demand: d.section(axis) }));
      for (const v of [verifyElement(inputs[1]!), prepareElementVerification(inputs[1]!)(), ...verifyConcurrentElement(inputs).concurrentChecks!.map(c => c.verification)]) {
        expect(v.slender!.isSlender).toBe(true);
        expect(v.slender!.Cm).toBe(1);
        expect(v.slenderSecondary!.Cm).toBe(1);
      }
      const equivalent = { ...inputs[1]!, M1: 60, M2: 60, M1Secondary: 60, M2Secondary: 60 };
      expect(amplifiedDemand(inputs[1]!).Mu).toBe(amplifiedDemand(equivalent).Mu);
    });
  }
}
for (const extra of [{ NuShear: 0 }, { axialLoads: [0] }, { NuShear: -20, axialLoads: [0, 50] }]) {
  it.fails(`#2080 manual adapter retains its distinct compression ${JSON.stringify(extra)}`, () => {
    const result = manual({ ...geometry, elementId: 1, elementType: 'column', Mu: 30, Vu: 10, Nu: 300, ...extra });
    expect(result.concurrentChecks!.map(c => c.demand.section('Mz').Nu)).toContain(300);
  });
}
it('correct independent flexural capacity remains the kernel answer', () => {
  const f = checkFlexure(geometry, 100);
  const d = geometry.h - geometry.cover - geometry.stirrupDia / 1000 - f.barDia / 2000;
  expect(f.phiMn).toBe(evaluateBeamSection({ edition: '2025', fc: geometry.fc * 1e6, fy: geometry.fy * 1e6,
    b: geometry.b, h: geometry.h, d, As: f.AsProv * 1e-4, AsComp: 0, dPrime: 0, Ag: geometry.b * geometry.h, NuCompression: 0 })!.phiMn / 1000);
});
