import { describe, it, expect } from 'vitest';
import { phiFromStrain } from '../cirsoc201-basis';

// The engine's φ (`cirsoc201_phi`), asked for the 2025 edition.
const phiTable2122 = (epsT: number, fy: number, c: 'ties' | 'spiral' = 'ties') => phiFromStrain(epsT, fy, c, '2025');

// CIRSOC 201-2025 Tabla 21.2.2, for fy = 420 MPa: εty = 420 / 200 000 = 0,0021.
describe('φ by CIRSOC 201-2025 Tabla 21.2.2', () => {
  it('compression-controlled up to εty: 0,65 with ties, 0,75 with a spiral', () => {
    expect(phiTable2122(0.0015, 420)).toBe(0.65);
    expect(phiTable2122(0.0021, 420, 'spiral')).toBe(0.75);
  });
  it('tension-controlled from εty + 0,003, not from 0,005', () => {
    expect(phiTable2122(0.0051, 420)).toBe(0.9);
    expect(phiTable2122(0.0050, 420)).toBeLessThan(0.9);
  });
  it('a straight line over 0,003 between them (rows (c) and (d))', () => {
    expect(phiTable2122(0.0036, 420)).toBeCloseTo(0.65 + 0.25 * 0.0015 / 0.003, 12);
    expect(phiTable2122(0.0036, 420, 'spiral')).toBeCloseTo(0.75 + 0.15 * 0.0015 / 0.003, 12);
  });
});
