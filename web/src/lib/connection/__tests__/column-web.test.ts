/**
 * §J.10 by hand on a HEB 240 column (d 24, tw 1,0, tf 1,7, k = tf + r = 1,7 + 2,1 = 3,8 cm,
 * A = 106 cm², F-24) and an IPE 360 beam (d 36, tf 1,27) with 150 kN·m:
 *   flange force Ff = 150/(0,36 − 0,0127) = 431,9 kN;
 *   J.10.1: 0,9·0,625·1,7²·240 = 390,2 kN → stiffeners;
 *   J.10.2: (5·3,8 + 1,27)·240·1,0/10 = 486,5 kN;
 *   J.10.6: 0,9·0,6·240·24·1,0/10 = 311,0 kN (Pu = 300 ≤ 0,4·Py = 1017,6); demand 431,9 − 40 = 391,9 kN.
 */
import { describe, it, expect } from 'vitest';
import { columnAtMomentJoint, panelZoneShear } from '../column-web';

describe('§J.10 — a column at a moment connection', () => {
  const r = columnAtMomentJoint({
    column: { d: 24, tw: 1.0, tf: 1.7, k: 3.8, Fy: 240, A: 106 }, beam: { d: 36, tf: 1.27 },
    momentsKNm: [150], columnShearKN: 40, columnAxialKN: 300,
  });
  it('flange local bending asks for stiffeners', () => {
    expect(r[0]!.demandKN).toBeCloseTo(431.9, 1);
    expect(r[0]!.phiRnKN).toBeCloseTo(390.15, 1);
    expect(r[0]!.stiffener).toBe(true);
  });
  it('web local yielding holds', () => {
    expect(r[1]!.phiRnKN).toBeCloseTo(486.5, 1);
    expect(r[1]!.stiffener).toBe(false);
  });
  it('the panel zone is over its shear', () => {
    expect(r[2]!.phiRnKN).toBeCloseTo(311.04, 1);
    expect(r[2]!.demandKN).toBeCloseTo(391.9, 1);
  });
  it('reduces the panel above 0,4·Py', () => {
    expect(panelZoneShear({ dc: 24, tw: 1, Fy: 240, Pu: 600, Py: 1000 })).toBeCloseTo(0.9 * 345.6 * 0.8, 6);
  });
});
