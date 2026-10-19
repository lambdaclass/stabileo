/**
 * The CIRSOC 301 checker's branches, read from its own result, on an IPE 300 in S235 (Fy 235 MPa,
 * E 200 000 MPa): h 300, b 150, tw 7,1, tf 10,7 mm; Ix 8356 cm⁴, Iy 603,8 cm⁴, A 53,8 cm².
 * By hand, with the checker's own plate formulas (Zx = b·tf·(h − tf) + tw·hw²/4, Zy = tf·b²/2 +
 * hw·tw²/4, Sx = Ix/(h/2), Sy = Iy/(b/2), hw = h − 2·tf = 278,6 mm):
 *   Zx = 150·10,7·289,3 + 7,1·278,6²/4 = 602 098 mm³, Sx = 557 067 mm³: Zx/Sx = 1,081 ≤ 1,5, no cap.
 *   Zy = 10,7·150²/2 + 278,6·7,1²/4 = 123 886 mm³, Sy = 80 507 mm³: Zy/Sy = 1,539 > 1,5: F.6.1 caps it,
 *     AISC 360-10 F6-1 would not (1,539 < 1,6).
 *   Web h/tw = 278,6/7,1 = 39,2 ≤ 3,76·√(E/Fy) = 109,7 (compact) and ≤ 1,10·√(5·E/Fy) = 71,8 (Cv = 1).
 *   Flange b/2tf = 7,01 ≤ 0,38·√(E/Fy) = 11,1 (compact).
 */
import { describe, it, expect } from 'vitest';
import { verifySteelElement, type SteelDesignParams } from '../../../codes/argentina/cirsoc301';
import { steelBranches } from '../equivalence';

const ipe300: SteelDesignParams = {
  Fy: 235, Fu: 360, E: 200000, A: 53.8e-4, Iz: 8356e-8, Iy: 603.8e-8, h: 0.3, b: 0.15, tw: 0.0071, tf: 0.0107,
  J: 20.12e-8, Cw: 125.9e-9, L: 6, Lb: 6, shape: 'I',
};

describe('the CIRSOC 301 checker\'s branches, from its result', () => {
  it('an IPE 300: no strong-axis cap, the weak-axis cap of F.6.1, a compact web and flange, Cv = 1', () => {
    const v = verifySteelElement({ elementId: 1, Nu: -100, Muz: 60, Muy: 5, Vu: 50, params: ipe300 });
    expect(steelBranches(v)).toEqual({
      strongCapBinds: false, strongSimplifiedLtb: false, webCompactFlexure: true, flangeCompactFlexure: true,
      // Lb = 6 m > Lp: Mr = FL·Sx with CIRSOC's FL = Fy − Fr (F.2.7), not AISC's 0,7·Fy.
      strongReadsFL: true,
      weakCapBinds: true, webShearCv1: true, interactionAxial: 'tension',
    });
    expect(steelBranches(verifySteelElement({ elementId: 1, Nu: 100, Muz: 60, Muy: 5, Vu: 50, params: ipe300 })).interactionAxial).toBe('compression');
  });

  it('without J and Cw, beyond Lp, Lr and Fcr come from the simplified formulas; within Lp they do not matter', () => {
    const { J: _j, Cw: _c, ...noTorsion } = ipe300;
    expect(steelBranches(verifySteelElement({ elementId: 1, Nu: 0, Muz: 60, Muy: 0, Vu: 50, params: noTorsion })).strongSimplifiedLtb).toBe(true);
    // Lp = 1,76·ry·√(E/Fy) = 1,76·33,5·29,17 mm = 1,72 m.
    expect(steelBranches(verifySteelElement({ elementId: 1, Nu: 0, Muz: 60, Muy: 0, Vu: 50, params: { ...noTorsion, Lb: 1.5 } })).strongSimplifiedLtb).toBe(false);
  });
});
