import { expect, it } from 'vitest';
import { ConcurrentDemand } from '../concurrent-demand';
import { checkShear, prepareElementVerification, verifyElement } from '../codes/argentina/cirsoc201';
import { verifyConcurrentElement } from '../concurrent-verification';
import { checkTorsion2025 } from '../../codes/cirsoc201/torsion';
import { evaluateBeamSection } from '../codes/argentina/cirsoc201-beam-kernel';

const p = { b: 0.3, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 };
const demand = (secondary: number, torque = 30, axis: 'My' | 'Mz' = 'My', primary = 0) => ConcurrentDemand.fromTuples([
  { comboId: 1, comboName: 'C1', forces: { t: 0, x: 0, n: 0, my: axis === 'My' ? 20 : 0,
    mz: axis === 'Mz' ? 20 : 0, vy: axis === 'My' ? secondary : primary, vz: axis === 'Mz' ? secondary : primary, torsion: torque } },
])[0]!.section(axis);
const capacity = (edition: '2005' | '2025', legs: number) => evaluateBeamSection({ edition,
  fc: p.fc * 1e6, fy: p.fy * 1e6, b: p.h, h: p.b, d: p.b - p.cover - p.stirrupDia / 1000 - 0.008,
  As: 0, Av: legs * 0.503 * 1e-4, s: 0.1, fyt: p.fy * 1e6, Ag: p.b * p.h, NuCompression: 0,
})!.phiVn / 1000;

for (const edition of ['2005', '2025'] as const) {
  for (const axis of ['My', 'Mz'] as const) for (const elementType of ['beam', 'column', 'wall'] as const) {
    for (const entry of ['direct', 'prepared', 'concurrent'] as const) for (const legs of [2, 3, 4, 5, 6]) {
      for (const secondaryLegs of [undefined, 2, 3, 4, 5, 6]) for (const direction of ['primary', 'secondary', 'both'] as const) {
        it(`known wrong result: #2171 directional shear ${edition} ${axis} ${elementType} ${entry} ${legs}/${secondaryLegs} ${direction}`, () => {
          const secondary = direction === 'primary' ? 0 : 220.235;
          const primary = direction === 'secondary' ? 0 : 100;
          const input = { ...p, edition, elementId: 1, elementType, demand: demand(secondary, 30, axis, primary) };
          const fixed = { shear: { spacing: 0.1, legs, secondaryLegs }, torsion: { AlProv: 100 } };
          const v = entry === 'direct' ? verifyElement(input, fixed) : entry === 'prepared' ? prepareElementVerification(input)(fixed) : verifyConcurrentElement([input], fixed);
          expect(v.shear.stirrupLegs).toBe(legs);
          const primaryCapacity = evaluateBeamSection({ edition, fc: p.fc * 1e6, fy: p.fy * 1e6, b: p.b, h: p.h,
            d: p.h - p.cover - p.stirrupDia / 1000 - 0.008, As: v.flexure.AsProv * 1e-4,
            Av: legs * 0.503 * 1e-4, s: 0.1, fyt: p.fy * 1e6, Ag: p.b * p.h, NuCompression: 0 })!.phiVn / 1000;
          expect(v.shear.phiVn).toBeCloseTo(primaryCapacity, 10);
          expect(v.shear.ratio).toBeCloseTo(primary / primaryCapacity, 12);
          expect(v.shearSecondary).toBeDefined();
          expect(v.shearSecondary!.stirrupLegs).toBe(secondaryLegs ?? 2);
          expect(v.shearSecondary!.phiVn).toBeCloseTo(capacity(edition, secondaryLegs ?? 2), 10);
          expect(v.shearSecondary!.ratio).toBeCloseTo(secondary / capacity(edition, secondaryLegs ?? 2), 12);
        });
      }
    }
  }
  it(`known wrong result: #2171 exact four-leg column witness ${edition}`, () => {
    const v = verifyElement({ ...p, edition, elementId: 1, elementType: 'column', demand: demand(edition === '2005' ? 220.235 : 222.18) },
      { shear: { spacing: 0.1, legs: 4 }, torsion: { AlProv: 100 } });
    expect(v.shearSecondary!.phiVn).toBeCloseTo(capacity(edition, 2), 10);
    expect(v.shearSecondary!.status).toBe('fail');
  });
}
for (const legs of [2, 3, 4, 5, 6]) for (const secondaryLegs of [2, 3, 4, 5, 6]) {
  it(`known wrong result: #2171 shared torsion checks each face ${legs}/${secondaryLegs}`, () => {
    const d = p.h - p.cover - p.stirrupDia / 1000 - 0.008;
    const ds = p.b - p.cover - p.stirrupDia / 1000 - 0.008;
    const input = { ...p, d, dSecondary: ds, stirrupDiaMm: p.stirrupDia, fyt: p.fy, demand: demand(220.235),
      stirrup: { diameter: p.stirrupDia, spacing: 0.1, legs, secondaryLegs } };
    const r = checkTorsion2025(input);
    const AbOverS = Math.PI * (p.stirrupDia / 1000) ** 2 / 4 / 0.1;
    const AvSecondary = Math.max(0, 220.235 / 0.75 - 0.17 * Math.sqrt(p.fc) * 1000 * p.h * ds) / (p.fy * 1000 * ds);
    const required = Math.max(AvSecondary + 2 * r.AtOverS, Math.max(0.062 * Math.sqrt(p.fc), 0.35) * p.h / p.fy);
    expect(r.outerLegProvided).toBe(AbOverS);
    expect(r.ratio).toBeCloseTo(Math.max(r.sectionRatio, r.AtOverS / AbOverS, 0.1 / r.sMax,
      required / (secondaryLegs * AbOverS), Math.max(2 * r.AtOverS, Math.max(0.062 * Math.sqrt(p.fc), 0.35) * p.b / p.fy) / (legs * AbOverS)), 12);
  });
}
it('two-leg primary shear control retains its answer', () => {
  for (const edition of ['2005', '2025'] as const) {
    const v = checkShear(p, 100, 0, { edition, legs: 2, spacing: 0.1 });
    expect(v.stirrupLegs).toBe(2);
    expect(v.status).toBe('ok');
    expect(v.ratio).toBeCloseTo(100 / v.phiVn, 12);
  }
});
