/**
 * CIRSOC 101-2025 §4.7.2 and §4.8.1 against published worked examples.
 *
 * CIRSOC 101-2025 Eq. (4.1), L = Lo (0,25 + 4,57/√(KLL·At)) with At in m², is ASCE 7's
 * L = Lo (0,25 + 15/√(KLL·AT)) with AT in ft² (15 ft = 4,572 m; the SI constant is rounded to
 * 4,57, a relative difference of 4·10⁻⁴ on the second term). §4.8.1.(a)'s R1 = 1,2 − 0,01076 At
 * and R2 = 1,2 − 0,05 F with F = 0,12 × slope % are ASCE 7's R1 = 1,2 − 0,001 AT (ft²) and
 * R2 = 1,2 − 0,05 F with F the rise in inches per foot, exactly (0,001 ft⁻² = 0,010764 m⁻²). So
 * the ratios L/Lo, R1 and R2 of an ASCE example are CIRSOC's; the loads themselves are not (Lo and
 * the Lr bounds differ), and only the ratios are compared.
 *
 * No INTI-CIRSOC worked example of §4.7 or §4.8 was found (INTI publishes examples volumes for
 * CIRSOC 201 and 301, none for 101). The commentary's own tables are held in
 * `verification-loads-tables.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { reduceLiveLoad } from '../live-loads';
import { roofLiveLoad } from '../roof-live';

const FT2 = 0.3048 * 0.3048;

describe('ENERCALC, "SEL Verification Example Series — Live Load Reduction", 2026 V1 (ASCE 7-22)', () => {
  // https://assets.enercalc.com/uploads/2026/03/04170504/Live-Load-Reduction-Verification-Example-V1-2026.pdf
  it('Problem Statement 2 (p. 2): interior column, AT = 570 ft², KLL = 4, one floor → L/Lo = 0,5641', () => {
    // Printed: L = 45,131 psf for Lo = 80 psf; the report table prints the factor 0,5641.
    const r = reduceLiveLoad({ loKNm2: 3.0, tributaryAreaM2: 570 * FT2, elementKind: 'interiorColumn', floorsSupported: 1 });
    expect(r.ratio).toBeCloseTo(45.131 / 80, 3);
    expect(Math.abs(r.ratio - 0.5641)).toBeLessThan(0.0002); // 4,57 vs 4,572
  });

  it('Problem Statement 1 (p. 1): roof beam, AT = 570 ft², pitch 5:12 → R1 = 0,63, R2 = 0,95, and the minimum governs', () => {
    // 5:12 is a 41,67 % slope: F = 0,12 × 41,67 = 5, the rise in inches per foot.
    const r = roofLiveLoad({ weight: 'heavy', atM2: 570 * FT2, slopePercent: (5 / 12) * 100 });
    expect(r.r1).toBeCloseTo(0.63, 3);
    expect(r.r2).toBeCloseTo(0.95, 12);
    // ASCE: 20 × 0,63 × 0,95 = 11,97 psf < 12 psf, the minimum. CIRSOC: 0,96 × 0,6302 × 0,95 =
    // 0,5747 < 0,58, its minimum, likewise.
    expect(0.96 * r.r1 * r.r2).toBeLessThan(0.58);
    expect(r.lr).toBe(0.58);
  });
});

describe('Alderliesten, "Introduction to Aerospace Structures and Materials", TU Delft Open, §2.5 Example 2.7 (ASCE 7-16)', () => {
  // https://eng.libretexts.org/…/02%3A_Structural_Loads_and_Loading_System/2.05%3A_Live_Load_Reduction
  it('interior column of a four-storey school, AT = 900 ft², KLL = 4 → L/Lo = 0,50 > 0,4', () => {
    // Printed: KLL·AT = 3600 ft² > 400 ft²; L = 40 (0,25 + 15/√3600) = 20 psf; 20/40 = 0,50 > 0,4.
    const r = reduceLiveLoad({ loKNm2: 3.0, tributaryAreaM2: 900 * FT2, elementKind: 'interiorColumn', floorsSupported: 3 });
    expect(r.reduced).toBe(true);
    expect(r.ratio).toBeCloseTo(0.5, 3);
    expect(r.ratio).toBeGreaterThan(0.4);
  });
});
