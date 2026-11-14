import { expect, it } from 'vitest';
import { ConcurrentDemand } from '../concurrent-demand';
import { verifyConcurrentElement } from '../concurrent-verification';
import { prepareElementVerification, verifyElement, type ConcurrentVerificationInput } from '../codes/argentina/cirsoc201';
import { evaluateBeamSection } from '../codes/argentina/cirsoc201-beam-kernel';

for (const edition of ['2005', '2025'] as const) {
  for (const axis of ['My', 'Mz'] as const) {
    for (const elementType of ['beam', 'column', 'wall'] as const) {
      it(`#2080 ${edition} ${axis} ${elementType} shared cage memo reports the evaluated reinforcement and capacity`, () => {
        const inputs: ConcurrentVerificationInput[] = ConcurrentDemand.fromTuples([20, 100].map((m, i) => ({ comboId: i + 1, comboName: `C${i + 1}`,
          forces: { t: 0.5, x: 2, n: 0, my: m, mz: m, vy: 1, vz: 1, torsion: 0 } })))
          .map(d => ({ elementId: 1, elementType, edition, demand: d.section(axis), b: 0.4, h: 0.4, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8 }));
        const small = verifyElement(inputs[0]!).flexure;
        const large = verifyElement(inputs[1]!).flexure;
        expect(large.AsProv).toBeGreaterThan(small.AsProv);
        const checks = [verifyElement(inputs[0]!, { flexure: large }), prepareElementVerification(inputs[0]!)({ flexure: large }),
          ...verifyConcurrentElement(inputs).concurrentChecks!.map(c => c.verification)];
        for (const v of checks) {
          const f = v.flexure;
          const evaluated = evaluateBeamSection({ edition, fc: inputs[0]!.fc * 1e6, fy: inputs[0]!.fy * 1e6,
            b: inputs[0]!.b, h: inputs[0]!.h, d: f.d, As: f.AsProv * 1e-4, AsComp: (f.AsComp ?? 0) * 1e-4,
            dPrime: f.barDiaComp ? inputs[0]!.cover + inputs[0]!.stirrupDia / 1000 + f.barDiaComp / 2000 : 0,
            Ag: inputs[0]!.b * inputs[0]!.h, NuCompression: 0 })!;
          expect(f.phiMn).toBe(evaluated.phiMn / 1e3);
          expect(f.steps).toContain(`Armadura tracción: ${f.bars} (${f.AsProv.toFixed(2)} cm²)`);
          expect(f.steps).toContain(`φMn = ${f.phiMn.toFixed(2)} kN·m`);
          expect(f.steps).toContain(`a = ${(evaluated.a * 100).toFixed(2)} cm, c = ${(evaluated.c * 100).toFixed(2)} cm`);
          expect(f.steps).toContain(`εt = ${(evaluated.epsilonT * 1000).toFixed(2)}‰ → φ = ${evaluated.phi.toFixed(3)}`);
        }
      });
    }
  }
}

it('#2080 one correct cage and zero demand remain finite and retain the evaluated capacity in the memo', () => {
  const demand = ConcurrentDemand.fromTuples([{ comboId: 1, comboName: 'C', forces: { t: 0, x: 0, n: 0, my: 0, mz: 0, vy: 0, vz: 0, torsion: 0 } }])[0]!;
  const input: ConcurrentVerificationInput = { elementId: 1, elementType: 'beam', demand: demand.section('My'), b: 0.4, h: 0.4, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8 };
  const result = verifyConcurrentElement([input]).flexure;
  expect(result.ratio).toBe(0);
  expect(result.steps).toContain(`φMn = ${result.phiMn.toFixed(2)} kN·m`);
});

it('independent sizing returns a correct finite capacity and zero utilization for zero moment', () => {
  const demand = ConcurrentDemand.fromTuples([{ comboId: 1, comboName: 'C', forces: { t: 0, x: 0, n: 0, my: 0, mz: 0, vy: 0, vz: 0, torsion: 0 } }])[0]!;
  const input: ConcurrentVerificationInput = { elementId: 1, elementType: 'beam', demand: demand.section('My'), b: 0.4, h: 0.4, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8 };
  const f = verifyElement(input).flexure;
  expect(f.ratio).toBe(0);
  expect(f.phiMn).toBeGreaterThan(0);
  expect(f.steps).toContain(`φMn = ${f.phiMn.toFixed(2)} kN·m`);
});
