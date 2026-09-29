/**
 * The design check, the adapter's detailing limits and the report read one development length:
 * Tabla 25.4.2.3, the one the drawings use. The check read the 2005 fy·db/(3,2·√f'c), about half.
 */
import { describe, it, expect } from 'vitest';
import { requiredLd } from '../station-design-forces';
import { deriveDevelopment } from '../../codes/cirsoc201/anchorage';

describe('development length', () => {
  it('matches Tabla 25.4.2.3 at H-25, ADN 420', () => {
    // favourable row: 420/(2,1·5)·16 = 640 mm; above Ø19 the coefficient is 1,7.
    expect(requiredLd(16, 25, 420)).toBeCloseTo(0.640, 3);
    expect(requiredLd(20, 25, 420)).toBeCloseTo(0.988, 3);
    expect(requiredLd(25, 25, 420)).toBeCloseTo(1.235, 3);
  });

  it('is the value the drawings read', () => {
    for (const d of [10, 12, 16, 20, 25]) {
      expect(requiredLd(d, 30, 420)).toBe(deriveDevelopment({ diameterMm: d, fy: 420, fc: 30, favourableSpacing: true, edition: '2025' }).ldM);
    }
  });
});
