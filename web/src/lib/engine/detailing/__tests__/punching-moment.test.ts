/**
 * Punching with moment transfer (§8.4.4.2), by hand.
 *
 * Interior column 40×40, d = 0,20 m: b1 = b2 = 0,60, bo = 2,40 m,
 *   Jc = d·b1³/6 + b1·d³/6 + d·b2·b1²/2 = 0,0072 + 0,0008 + 0,0216 = 0,0296 m⁴, γv = 1 − 1/(1 + ⅔) = 0,40.
 *   Vu = 500 kN, My = 60 kN·m: vu = 500/(2,40·0,20) + 0,40·60·0,30/0,0296 = 1,04167 + 0,24324 kPa·10⁻³.
 * Edge column 40×40 flush with the edge (free edge across x): the sides meeting the edge run
 *   c + d/2 = 0,50, the third c + d = 0,60: bo = 1,60 m (it was taken as 2·0,60 + 0,60 = 1,80);
 *   centroid x̄ = (2·0,50·(−0,05) + 0,60·(−0,30))/1,60 = −0,14375; Jc about y = 2·(0,2·0,5³/12
 *   + 0,5·0,2³/12 + 0,2·0,5·0,09375²) + 0,2·0,6·0,15625² = 0,0095208 m⁴.
 */
import { describe, it, expect } from 'vitest';
import { criticalGeometry, eccentricShear, gammaV, openingReduction, designPunchingReinforcement } from '../punching-moment';
import { checkPunchingShear, criticalSection } from '../punching-shear';

describe('punching with moment transfer', () => {
  it('an interior column', () => {
    const g = criticalGeometry(0.4, 0.4, 0.2, 'interior');
    expect(g.bo).toBeCloseTo(2.4, 12);
    expect(g.JcY).toBeCloseTo(0.0296, 12);
    expect(gammaV(0.6, 0.6)).toBeCloseTo(0.4, 12);
    const e = eccentricShear({ b: 0.4, h: 0.4, d: 0.2, position: 'interior', Vu: 500, Mx: 0, My: 60 });
    expect(e.vDirect).toBeCloseTo(1.041667, 5);
    expect(e.vMomentY).toBeCloseTo(0.243243, 5);
    expect(e.vu).toBeCloseTo(1.284910, 5);
  });

  it('an edge column: the critical section stops at the edge, its centroid moves in', () => {
    const g = criticalGeometry(0.4, 0.4, 0.2, 'edge');
    expect(g.bo).toBeCloseTo(1.6, 12);
    expect(g.cx).toBeCloseTo(-0.14375, 12);
    expect(g.JcY).toBeCloseTo(0.0095208, 6);
    expect(criticalSection(0.4, 0.4, 0.2, 'edge').bo).toBeCloseTo(1.6, 12);
    expect(criticalSection(0.4, 0.4, 0.2, 'corner').bo).toBeCloseTo(1.0, 12);
  });

  it('the check evaluates a significant moment instead of refusing it', () => {
    const c = checkPunchingShear({
      fc: 25, columnB: 0.4, columnH: 0.4, d: 0.2, position: 'interior',
      demand: { supportReaction: 500, loadInsidePerimeter: 0, unbalancedMomentY: 60, unbalancedMomentX: 0 },
    });
    expect(c.momentTransfer.status).toBe('EVALUATED');
    expect(c.status).not.toBe('UNSUPPORTED');
    expect(c.eccentric!.vMomentY).toBeGreaterThan(0);
  });

  it('openings within 4h take their angular share of the perimeter', () => {
    const g = criticalGeometry(0.4, 0.4, 0.2, 'interior');
    // An opening 0,30 wide, right of the column, centred on its axis: its corners at
    // (0,50, ±0,15) and (0,80, ±0,15) cut the right side between y = ±0,15·0,30/0,50 = ±0,09.
    expect(openingReduction(g, [{ x0: 0.5, y0: -0.15, x1: 0.8, y1: 0.15 }], 0.25, 0.2)).toBeCloseTo(0.18, 2);
    expect(openingReduction(g, [{ x0: 3, y0: -0.15, x1: 3.3, y1: 0.15 }], 0.25, 0.2)).toBe(0);
  });

  it('stirrups for the shear the concrete does not carry', () => {
    // vu = 1,50 MPa, H-25: vc = 0,17·1·5 = 0,85; vs = 1,50/0,75 − 0,85 = 1,15 MPa;
    // s = d/2 = 0,10; Av = 1,15·2,40·0,10/420 = 657 mm² per line.
    const r = designPunchingReinforcement({ vu: 1.5, Vu: 720, fc: 25, fyt: 420, b: 0.4, h: 0.4, d: 0.2, bo: 2.4, lambdaS: 1, position: 'interior' });
    expect(r.spacing).toBeCloseTo(0.1, 12);
    expect(r.avPerLine).toBeCloseTo(657.14, 1);
    expect(r.overCeiling).toBe(false);
    expect(r.extent).toBeGreaterThan(0);
  });
});
