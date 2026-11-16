import { computeShearCapacity } from '../../../engine/station-design-forces';
import { expect, it } from 'vitest';
import { stirrupLegs, shearProvision } from '../../../design-contract/directional-stirrups';
import { providedTorsionStirrups } from '../torsion';

for (const legs of [2, 3, 4, 5, 6]) for (const secondaryLegs of [undefined, 2, 3, 4, 5, 6]) {
  it(`known wrong result: #2171 each face has only its own legs and torsion one hoop leg ${legs}/${secondaryLegs}`, () => {
    const cage = { diameter: 8, spacing: 0.1, legs, secondaryLegs };
    const area = Math.PI * (cage.diameter / 1000) ** 2 / 4;
    const r = providedTorsionStirrups(cage);
    expect(r.transverseProvided).toBe(shearProvision('primary', stirrupLegs(cage, 'primary'), area, cage.spacing));
    expect(r.transverseSecondaryProvided).toBe(shearProvision('secondary', stirrupLegs(cage, 'secondary'), area, cage.spacing));
    expect(r.outerLegProvided).toBe(area / cage.spacing);
  });
}
for (const count of [-1, 0, 1, 1.999, 2, 6, NaN, Infinity]) {
  it(`directional leg count refusal boundary ${count}`, () => {
    const invoke = () => stirrupLegs({ legs: 4, secondaryLegs: count }, 'secondary');
    if (Number.isInteger(count) && count >= 2) expect(invoke().count).toBe(count);
    else expect(invoke).toThrow('Invalid secondary stirrup leg count');
  });
}
for (const spacing of [-1, 0, 0.05, 0.1, NaN, Infinity]) {
  it(`provision spacing refusal boundary ${spacing}`, () => {
    const invoke = () => shearProvision('secondary', stirrupLegs({ legs: 4 }, 'secondary'), 1, spacing);
    if (spacing > 0 && Number.isFinite(spacing)) expect(invoke()).toBe(2 / spacing);
    else expect(invoke).toThrow('Invalid stirrup spacing');
  });
}

for (const legs of [-1, 1]) it(`legacy primary shear cannot turn ${legs} legs into two`, () => {
  expect(() => computeShearCapacity(8, legs, 0.1, 0.3, 0.259, 25, 420)).toThrow('Invalid primary stirrup leg count');
});
it('absent shear steel remains absent in the scalar compatibility entry point', () => {
  const absent = computeShearCapacity(8, 0, 0.1, 0.3, 0.259, 25, 420);
  const closed = computeShearCapacity(8, 2, 0.1, 0.3, 0.259, 25, 420);
  expect(absent.VsProv).toBe(0);
  expect(closed.VsProv).toBeGreaterThan(0);
  expect(absent.phiVn).toBeLessThan(closed.phiVn);
});
