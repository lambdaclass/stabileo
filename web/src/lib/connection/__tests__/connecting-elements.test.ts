/**
 * §J.4 by hand on a 10 mm plate of F-24 (Fy 240, Fu 370 MPa), 15 cm wide, three Ø20 bolts in a
 * line (holes 2,2 cm) at 7 cm pitch, 4 cm end and 4 cm edge distance.
 *
 *   Tension: Ag = 15 cm², An = 15 − 2,2 = 12,8 cm² (one hole across) ≤ 0,85·15 = 12,75 → Ae = 12,75;
 *     φRn = min(0,9·240·15, 0,75·370·12,75)/10 = min(324,0; 353,8) = 324,0 kN, yielding.
 *   Shear on the 15 cm: Agv = 15, Anv = 15 − 3·2,2 = 8,4 cm²:
 *     min(0,9·0,6·240·15, 0,75·0,6·370·8,4)/10 = min(194,4; 139,9) = 139,9 kN, rupture.
 *   Block: lv = 2·7 + 4 = 18 cm; Agv = 18, Anv = (18 − 2,5·2,2) = 12,5, Ant = (4 − 1,1) = 2,9 cm²;
 *     rupture 0,6·370·12,5 + 370·2,9 = 2775 + 1073 = 3848; cap 0,6·240·18 + 1073 = 3665;
 *     φRn = 0,75·3665/10 = 274,9 kN.
 */
import { describe, it, expect } from 'vitest';
import { blockShear, boltLineBlock, shearStrength, tensionStrength } from '../connecting-elements';

describe('§J.4 — connecting elements', () => {
  it('tension: yielding against rupture, with Ae ≤ 0,85·Ag', () => {
    const r = tensionStrength({ Ag: 15, An: 12.8, Fy: 240, Fu: 370, boltedPlate: true });
    expect(r.phiRn).toBeCloseTo(324.0, 1);
    expect(r.governs).toBe('J.4.1(a)');
  });
  it('shear: rupture governs through three holes', () => {
    const r = shearStrength({ Agv: 15, Anv: 15 - 3 * 2.2, Fy: 240, Fu: 370 });
    expect(r.phiRn).toBeCloseTo(139.86, 1);
    expect(r.governs).toBe('J.4.2(b)');
  });
  it('block shear of a line of three bolts, capped by yielding of the shear plane', () => {
    const b = boltLineBlock({ n: 3, s: 7, le: 4, lt: 4, t: 1, dh: 2.2 });
    expect(b).toEqual({ Agv: 18, Anv: 12.5, Ant: 2.9 });
    const r = blockShear({ ...b, Fy: 240, Fu: 370 });
    expect(r.phiRn).toBeCloseTo(274.9, 1);
  });
});
