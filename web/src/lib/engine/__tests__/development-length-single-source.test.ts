/**
 * The design check, the adapter's detailing limits and the report read one development length:
 * Tabla 25.4.2.3, the one the drawings use. The check read the 2005 fy·db/(3,2·√f'c), about half.
 */
import { describe, it, expect } from 'vitest';
import { requiredLd } from '../station-design-forces';
import { deriveDevelopment } from '../../codes/cirsoc201/anchorage';

describe('development length', () => {
  it('matches Tabla 25.4.2.3 at H-25, ADN 420', () => {
    // favourable row, once established: 420/(2,1·5)·16 = 640 mm; above Ø16 the coefficient is 1,7.
    const fav = { favourableSpacing: true };
    expect(requiredLd(16, 25, 420, fav)).toBeCloseTo(0.640, 3);
    expect(requiredLd(20, 25, 420, fav)).toBeCloseTo(0.988, 3);
    expect(requiredLd(25, 25, 420, fav)).toBeCloseTo(1.235, 3);
    // Not established, the «other cases» row: 420/(1,4·5)·16 = 960 mm.
    expect(requiredLd(16, 25, 420)).toBeCloseTo(0.960, 3);
  });

  it('is the value the drawings read, for the same row and ψt', () => {
    for (const d of [10, 12, 16, 20, 25]) {
      for (const favourableSpacing of [true, false]) {
        expect(requiredLd(d, 30, 420, { favourableSpacing, concreteBelowM: 0.45 }))
          .toBe(deriveDevelopment({ diameterMm: d, fy: 420, fc: 30, favourableSpacing, psiT: 1.3, edition: '2025' }).ldM);
      }
    }
  });
});
