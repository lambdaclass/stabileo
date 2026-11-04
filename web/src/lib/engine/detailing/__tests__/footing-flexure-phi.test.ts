/**
 * A footing mat is designed tension-controlled by CIRSOC 201-2025: 13.3.3.1 sends a two-way footing
 * to Chapters 7 and 8, and 8.3.3.1 requires a non-prestressed slab to be tension-controlled by
 * Tabla 21.2.2, εt ≥ εty + 0,003 (0,0055 with ADN 500). The 2005 rule took 0,005.
 *
 * 2,00 × 2,00 × 0,25 m, column 0,40 × 0,40 centred, ADN 500, Nu = 1 935 kN. Each direction's
 * singly design by hand at φ = 0,90 on its own width and depth: Rn = Mu/(0,9·b·d²),
 * ρ = 0,85·f'c/fy·(1 − √(1 − 2·Rn/(0,85·f'c))), a = ρ·d·fy/(0,85·f'c), c = a/0,85,
 * εt = 0,003·(d − c)/c. A direction whose εt falls short of 0,0055 needs compression steel, which
 * a pad footing does not take: it is reported, not designed.
 */
import { describe, it, expect } from 'vitest';
import { designFootingMat, type FootingMatDesignInput } from '../footing-flexure';

const input: FootingMatDesignInput = {
  B: 2.0, L: 2.0, thickness: 0.25, cover: 0.05, columnB: 0.4, columnH: 0.4,
  eccentricityB: 0, eccentricityL: 0, fc: 25, fy: 500, factoredAxial: 1935,
  factoredMomentB: 0, factoredMomentL: 0, maxAggregateSizeMm: 20, edition: '2025',
  preferences: { bottomMatDiameterXmm: 16, bottomMatDiameterYmm: 16, bottomMatSpacingPolicy: 'AUTO_CODE_COMPLIANT' },
};

describe('a footing mat, ADN 500', () => {
  it('is refused where the 2025 tension-controlled limit is not reached', () => {
    const r = designFootingMat(input);
    let between = 0;
    for (const dir of [r.x, r.y]) {
      // Mu by statics: q = 1 935/4 kPa on a 0,80 m cantilever, 2,00 m wide.
      expect(dir.Mu).toBeCloseTo(1935 / 4 * 0.8 ** 2 / 2 * 2, 6);
      const b = dir.distributionWidth, d = dir.d;
      const Rn = dir.Mu / (0.9 * b * d * d);
      const rho = (0.85 * 25 / 500) * (1 - Math.sqrt(1 - 2 * Rn / (0.85 * 25000)));
      const a = rho * d * 500 / (0.85 * 25), c = a / 0.85, et = 0.003 * (d - c) / c;
      if (et > 0.005 && et < 0.0055) between++;
      const keys = dir.failures.map((f) => f.key);
      if (et < 0.0055) expect(keys, `εt = ${et.toFixed(5)}`).toContain('footing.mat.needsCompressionSteel');
      else expect(keys).not.toContain('footing.mat.needsCompressionSteel');
    }
    expect(between).toBeGreaterThanOrEqual(1);
  });
});
