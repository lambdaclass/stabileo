import { expect, it } from 'vitest';
import { evaluateBeamSection } from '../codes/argentina/cirsoc201-beam-kernel';
import { prepareElementVerification, REBAR_DB, verifyElement } from '../codes/argentina/cirsoc201';
import { verifyConcurrentElement } from '../concurrent-verification';
import { declaredTestDemands } from './helpers/declared-demands';

for (const edition of ['2005', '2025'] as const) for (const axis of ['My', 'Mz'] as const) {
  it(`known wrong result: #2198 selected secondary concrete resistance ${edition} ${axis}`, () => {
    const section = { b: 0.4, h: 0.6, cover: 0.025, stirrupDia: 6, fc: 25, fy: 420 };
    const demand = declaredTestDemands([{ comboId: 1, comboName: 'secondary', forces: {
      t: 0, x: 0, n: 0, my: 0, mz: 0, vy: axis === 'My' ? 15 : 0, vz: axis === 'Mz' ? -15 : 0, torsion: 0,
    } }])[0]!.section(axis);
    const input = { ...section, elementId: 1, elementType: 'beam' as const, edition, demand };
    const checkCage = (legs: number, s: number) => evaluateBeamSection({
      edition, fc: section.fc * 1e6, fy: section.fy * 1e6, b: section.h, h: section.b,
      d: section.b - section.cover - section.stirrupDia / 1000 - 0.008, As: 0,
      Av: legs * REBAR_DB.find(bar => bar.diameter === section.stirrupDia)!.area * 1e-4,
      s, fyt: section.fy * 1e6, Ag: section.b * section.h, NuCompression: 0,
    })!;
    for (const result of [verifyElement(input), prepareElementVerification(input)(), verifyConcurrentElement([input])]) {
      const row = result.shearSecondary!;
      const expected = checkCage(row.stirrupLegs, row.spacing);
      expect(row.phiVc).toBe(0.75 * (expected.Vc / 1000));
      expect(row.phiVn).toBe(expected.phiVn / 1000);
    }
    for (const secondaryLegs of [2, 4]) {
      const fixed = { shear: { legs: 4, secondaryLegs, spacing: 0.125 } };
      const expected = checkCage(secondaryLegs, fixed.shear.spacing);
      expect(expected.shearValid).toBe(true);
      if (edition === '2025') expect(expected.avBelowMin).toBe(secondaryLegs === 2);
      for (const result of [verifyElement(input, fixed), prepareElementVerification(input)(fixed), verifyConcurrentElement([input], fixed)]) {
        const row = result.shearSecondary!;
        expect(row.stirrupLegs).toBe(secondaryLegs);
        expect(row.phiVc).toBe(0.75 * (expected.Vc / 1000));
        expect(row.phiVn).toBe(expected.phiVn / 1000);
        if (secondaryLegs === 4) expect(row.status).toBe('ok');
      }
    }
  });
}
