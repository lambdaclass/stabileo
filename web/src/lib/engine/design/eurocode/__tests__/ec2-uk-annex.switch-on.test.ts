import { describe, expect, it } from 'vitest';
import { EC2_RECOMMENDED, EC2_UK } from '../ec2-params';
import { ec2BeamDesign, ec2FlexuralSteel } from '../ec2-beam';

const beam = { b: 0.3, h: 0.6, cover: 0.03, linkDia: 10, barDia: 20, fck: 30, fyk: 500, MEdNeg: 0 };

describe('EC2 beams under the UK National Annex', () => {
  it('αcc = 0,85 and xu/d ≤ 0,6 by its 5.5(4) ask for more steel than the recommended values', () => {
    const uk = ec2FlexuralSteel(250, 0.3, 0.55, 0.05, 30, 500, EC2_UK);
    expect(uk.Kp).toBeCloseTo(0.20673, 4);
    expect(uk.as * 1e4).toBeCloseTo(11.8045, 3);
    const d = ec2BeamDesign({ ...beam, MEdPos: 250, VEd: 200, params: EC2_UK });
    expect(d.rows[0]!.code).toBe('bs-en-1992-1-1');
    expect(d.asBottom).toBeGreaterThan(ec2BeamDesign({ ...beam, MEdPos: 250, VEd: 200, params: EC2_RECOMMENDED }).asBottom);
  });
});
