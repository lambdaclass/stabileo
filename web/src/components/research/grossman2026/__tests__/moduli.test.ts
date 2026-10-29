import { expect, it } from 'vitest';
import { uniaxial } from '../moduli';

it('allows axial square-lattice loads despite floppy shear, but rejects loads involving shear', () => {
  const c = [[1, 0, 0], [0, 1, 0], [0, 0, 0]];
  for (const angle of [0, Math.PI / 2, Math.PI]) {
    const response = uniaxial(c, angle)!;
    expect(response[0]).toBeCloseTo(1, 12);
    expect(response[1]).toBeCloseTo(0, 12);
  }
  expect(uniaxial(c, Math.PI / 4)).toBeNull();
  expect(uniaxial([[1, 0, 0], [0, 0, 0], [0, 0, 0]], 0)).toBeNull();
});
it('preserves isotropic directional responses across stiffness scales', () => {
  for (const k of [1e-15, 1, 1e15]) for (const angle of [0, 0.3, Math.PI / 2]) {
    const response = uniaxial([[3*k, k, 0], [k, 3*k, 0], [0, 0, 4*k]], angle)!;
    expect(response[0] / k).toBeCloseTo(8 / 3, 12);
    expect(response[1]).toBeCloseTo(1 / 3, 12);
  }
});
