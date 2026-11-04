/**
 * §24.3.2 crack-control bar spacing against StructurePoint's published examples. Recorded in
 * docs/verification/DESIGN_EXAMPLES.md (serviceability).
 *
 * [SP-WALL] StructurePoint, "Reinforced Concrete Cantilever Retaining Wall Analysis and Design
 *           (ACI 318-19)", spWall v10.50 (Mar. 2026), p. 14.
 * [SP-SLAB] StructurePoint, "One-Way Slab Analysis and Design (ACI 318-14)", spBeam v10.00, p. 14.
 *
 * Both work in inch-pound units, s = 15(40 000/fs) − 2,5cc ≤ 12(40 000/fs), with fs = 2/3·fy =
 * 40 000 psi. The checker applies the code's SI form, 380(280/fs) − 2,5cc ≤ 300(280/fs) in MPa
 * and mm, a soft conversion (380 mm ≈ 15 in, 280 MPa ≈ 40 ksi = 275,8 MPa): at fy = 60 ksi the
 * SI cover term is 1,5 % to 1,9 % more permissive than the US one, and the SI cap is 0,1 % below
 * 12 in. The US value is therefore compared at 2 %, and the SI one exactly.
 */
import { describe, it, expect } from 'vitest';
import { crackControlMaxSpacing } from '../crack-control';

const IN = 0.0254;
const KSI = 6.894_757_293; // MPa

function published(actual: number, printed: number, rel: number, what: string) {
  const err = Math.abs(actual - printed) / Math.abs(printed);
  expect(err, `${what}: stabileo ${actual}, published ${printed}`).toBeLessThanOrEqual(rel);
}

describe('§24.3.2 against published examples', () => {
  it('[SP-WALL] stem, cc = 2.00 in: s = 15 − 2.5·2.0 = 10 in governs over 12 in', () => {
    const r = crackControlMaxSpacing('2025', { fy: 60 * KSI, clearCoverToTensionFace: 2.0 * IN });
    published(r.fs, 40 * KSI, 1e-12, 'fs = 2/3·fy');
    expect(r.governedBy).toBe('coverTerm');
    published(r.maxSpacing / IN, 10, 0.02, 's, cover term (SI soft conversion)');
    published(r.terms.coverTermMm, 380 * (280 / (40 * KSI)) - 2.5 * 50.8, 1e-12, 'SI cover term');
  });

  it('[SP-SLAB] cc = 0.75 in: 13.13 in, capped at 12 in', () => {
    const r = crackControlMaxSpacing('2025', { fy: 60 * KSI, clearCoverToTensionFace: 0.75 * IN });
    published(r.terms.coverTermMm / 25.4, 13.13, 0.02, 'cover term, in');
    expect(r.governedBy).toBe('cap');
    published(r.maxSpacing / IN, 12, 0.002, 's = 12(40 000/fs)');
  });
});
