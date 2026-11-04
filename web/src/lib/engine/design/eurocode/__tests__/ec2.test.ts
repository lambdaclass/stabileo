/**
 * EN 1992-1-1 member design against hand values worked out independently: a 300 × 600 beam in
 * C30/37 and B500 (K, K', the lever arm, the steel, VRd,c, the links and the strut), the same
 * beam needing compression steel, the UK National Annex giving more steel than the recommended
 * values, a short and a slender 400 × 400 column, braced and unbraced, with and without creep, the
 * section's resistance, Annex B's creep coefficient and 6.3.2's torsion.
 */
import { describe, expect, it } from 'vitest';
import { EC2_RECOMMENDED, EC2_UK, ec2CreepCoefficient, ec2Material, ec2Psi2 } from '../ec2-params';
import { ec2BeamDesign, ec2FlexuralSteel } from '../ec2-beam';
import { biaxialExponent, ec2ColumnDesign, momentAt, sectionResistance } from '../ec2-column';
import { ec2MemberDesign } from '../ec2-member';

const beam = { b: 0.3, h: 0.6, cover: 0.03, linkDia: 10, barDia: 20, fck: 30, fyk: 500, MEdNeg: 0 };

describe('EC2 material values', () => {
  it('Table 3.1 and 3.1.7(3)', () => {
    const m = ec2Material(30, 500, EC2_RECOMMENDED);
    expect(m.fcd).toBeCloseTo(20, 9);
    expect(m.fctm).toBeCloseTo(2.8965, 3);
    expect(m.fyd).toBeCloseTo(434.783, 2);
    expect(ec2Material(30, 500, EC2_UK).fcd).toBeCloseTo(17, 9);
    const hi = ec2Material(70, 500, EC2_RECOMMENDED);
    expect(hi.lambda).toBeCloseTo(0.75, 9);
    expect(hi.eta).toBeCloseTo(0.9, 9);
    expect(hi.ecu3 * 1000).toBeCloseTo(2.6 + 35 * 0.2 ** 4, 9);
  });
});

describe('EC2 beams', () => {
  it('flexure: K, K\', the lever arm and the steel', () => {
    const f = ec2FlexuralSteel(250, 0.3, 0.55, 0.05, 30, 500, EC2_RECOMMENDED);
    expect(f.K).toBeCloseTo(0.091827, 5);
    expect(f.Kp).toBeCloseTo(0.1968, 4);
    expect(f.z).toBeCloseTo(0.497673, 5);
    expect(f.as * 1e4).toBeCloseTo(11.5538, 3);
    expect(f.as2).toBe(0);
  });

  it('shear: VRd,c, then links on the flattest strut', () => {
    const d = ec2BeamDesign({ ...beam, MEdPos: 250, VEd: 200, params: EC2_RECOMMENDED });
    expect(d.d).toBeCloseTo(0.55, 9);
    expect(d.vrdc).toBeCloseTo(87.577, 2);
    // VRd,c is an input of the shear row, not a row that could read as passing.
    expect(d.rows.find((r) => r.titleKey === 'check.ec2.shearMax')!.inputs.find((i) => i.symbol === 'VRd,c')!.value).toBeCloseTo(87.577, 2);
    expect(d.cotTheta).toBeCloseTo(2.5, 9);
    expect(d.aswS * 1e4).toBeCloseTo(3.71717, 3);
    expect(d.rows.find((r) => r.titleKey === 'check.ec2.shearMax')!.capacity).toBeCloseTo(540.745, 2);
    const high = ec2BeamDesign({ ...beam, MEdPos: 250, VEd: 600, params: EC2_RECOMMENDED });
    expect(high.cotTheta).toBeCloseTo(2.14806, 4);
    expect(high.aswS * 1e4).toBeCloseTo(12.9786, 3);
  });

  it('a moment past K\' takes compression steel at the top', () => {
    const f = ec2FlexuralSteel(600, 0.3, 0.55, 0.05, 30, 500, EC2_RECOMMENDED);
    expect(f.as2 * 1e4).toBeCloseTo(2.9538, 3);
    expect(f.as * 1e4).toBeCloseTo(30.2778, 3);
    const d = ec2BeamDesign({ ...beam, MEdPos: 600, VEd: 100, params: EC2_RECOMMENDED });
    expect(d.asTop * 1e4).toBeCloseTo(2.9538, 3);
    expect(d.rows[0]!.derivation!.join(' ')).toContain('compression steel');
  });

  it('the UK National Annex (αcc = 0,85) asks for more steel than the recommended values', () => {
    const uk = ec2FlexuralSteel(250, 0.3, 0.55, 0.05, 30, 500, EC2_UK);
    expect(uk.Kp).toBeCloseTo(0.16728, 4);
    expect(uk.as * 1e4).toBeCloseTo(11.8045, 3);
    const d = ec2BeamDesign({ ...beam, MEdPos: 250, VEd: 200, params: EC2_UK });
    expect(d.rows[0]!.code).toBe('bs-en-1992-1-1');
    expect(d.asBottom).toBeGreaterThan(ec2BeamDesign({ ...beam, MEdPos: 250, VEd: 200, params: EC2_RECOMMENDED }).asBottom);
  });

  it('the minimum steel governs a small moment', () => {
    const d = ec2BeamDesign({ ...beam, MEdPos: 10, VEd: 20, params: EC2_RECOMMENDED });
    expect(d.asBottom * 1e4).toBeCloseTo(2.48517, 3);
  });
});

describe('EC2 columns', () => {
  const col = { b: 0.4, h: 0.4, cover: 0.035, linkDia: 10, barDia: 20, fck: 30, fyk: 500, params: EC2_RECOMMENDED };
  const m = ec2Material(30, 500, EC2_RECOMMENDED), s = { b: 0.4, h: 0.4, d2: 0.055 };

  it('the section by strain compatibility', () => {
    expect(momentAt(1500, { ...s, as: 0.002 }, m, 200000)).toBeCloseTo(275.65, 1);
    expect(momentAt(800, { ...s, as: 0 }, m, 200000)).toBeCloseTo(120, 3);
    // Wholly in compression, the steel at the pivot strain εc3.
    expect(sectionResistance(400, { ...s, as: 0.004 }, m, 200000).n).toBeCloseTo(4599.9, 0);
  });

  it('a short column: first order with the imperfection, the minimum steel of 9.5.2(2)', () => {
    // φef = 2: A = 1/(1 + 0,2·2) = 0,714; n = 1500/(0,16·20 000) = 0,469; ei = 2,5/400 = 6,25 mm,
    // M01 = 50 + 9,375 = 59,375, M02 = 100 + 9,375 = 109,375, rm = 0,543, C = 1,157;
    // λlim = 20·0,714·1,1·1,157/√0,469 = 26,559 > λ = 2,5·√12/0,4 = 21,65.
    const d = ec2ColumnDesign({ ...col, NEd: 1500, M01: 50, M02: 100, l0: 2.5, phiEf: 2 });
    expect(d.lambda).toBeCloseTo(21.6506, 3);
    expect(d.lambdaLim).toBeCloseTo(26.559, 2);
    expect(d.M2).toBe(0);
    expect(d.MEd).toBeCloseTo(109.375, 6);
    expect(d.as! * 1e4).toBeCloseTo(3.45, 3);
  });

  /*
   * The slender column below: N = 1200 kN over 400 × 400, C30/37, B500 (fyd = 434,78 MPa, εyd = 2,174 ‰),
   * d2 = 55 mm. Both layers yield (x = 1200/(20 000·0,4·0,8) = 0,1875 m, in 145,2 to 212,8 mm), so
   * MRd = 1200·(0,2 − 0,075) + As·434 783·0,145 = 150 + 63 043·As. n = 0,375 < 0,4: Kr = 1 whatever As,
   * and M2 = 1200·(εyd/(0,45·0,345))·8²/10 = 107,540 kN·m.
   */
  it('a slender column: second order by nominal curvature', () => {
    // φef = 0: A = 1, λlim = 20·1·1,1·0,7/√0,375 = 25,148 < λ = 69,28. MEd = 84 + 107,54 = 191,54;
    // As = (191,54 − 150)/63 043 = 6,589 cm².
    const d = ec2ColumnDesign({ ...col, NEd: 1200, M01: 60, M02: 60, l0: 8, phiEf: 0 });
    expect(d.lambda).toBeCloseTo(69.282, 2);
    expect(d.lambdaLim).toBeCloseTo(25.1481, 3);
    expect(d.M2).toBeCloseTo(107.5404, 2);
    expect(d.MEd).toBeCloseTo(191.5404, 2);
    expect(d.as! * 1e4).toBeCloseTo(6.5892, 2);
    expect(d.rows.map((r) => r.clause)).toEqual(['6.1; 5.8']);
  });

  it('φef > 0 enters both λlim\'s A and the curvature\'s Kφ', () => {
    // φef = 2: λlim = 25,148/1,4 = 17,963; β = 0,35 + 30/200 − 69,282/150 = 0,03812, Kφ = 1,07624,
    // M2 = 107,540·1,07624 = 115,739, MEd = 84 + 115,739 = 199,739; As = (199,739 − 150)/63 043 = 7,890 cm².
    const d = ec2ColumnDesign({ ...col, NEd: 1200, M01: 60, M02: 60, l0: 8, phiEf: 2 });
    expect(d.lambdaLim).toBeCloseTo(17.9629, 3);
    expect(d.M2).toBeCloseTo(115.7393, 2);
    expect(d.MEd).toBeCloseTo(199.7393, 2);
    expect(d.as! * 1e4).toBeCloseTo(7.8897, 2);
  });

  it('braced and unbraced: C and the design moment of 5.8.8.2', () => {
    // Double curvature, M01 = −60, M02 = 60: with ei = 20 mm, M01 = −36, M02 = 84, rm = −0,4286.
    // Braced: C = 1,7 + 0,4286 = 2,1286, λlim = 20·1,1·2,1286/√0,375 = 76,47 > 69,28: first order, MEd = 84.
    const braced = ec2ColumnDesign({ ...col, NEd: 1200, M01: -60, M02: 60, l0: 8, phiEf: 0 });
    expect(braced.lambdaLim).toBeCloseTo(76.4707, 3);
    expect(braced.M2).toBe(0);
    expect(braced.MEd).toBeCloseTo(84, 6);
    // Unbraced: C = 0,7, λlim = 25,148: slender, MEd = M02 + M2 = 84 + 107,54 = 191,54, As = 6,589 cm².
    const sway = ec2ColumnDesign({ ...col, NEd: 1200, M01: -60, M02: 60, l0: 8, phiEf: 0, braced: false });
    expect(sway.lambdaLim).toBeCloseTo(25.1481, 3);
    expect(sway.MEd).toBeCloseTo(191.5404, 2);
    expect(sway.as! * 1e4).toBeCloseTo(6.5892, 2);
  });

  it('a section that cannot carry it at the largest steel fails', () => {
    const d = ec2ColumnDesign({ ...col, NEd: 6000, M01: 0, M02: 0, l0: 2, phiEf: 0 });
    expect(d.as).toBeNull();
    expect(d.rows[0]!.status).toBe('fail');
  });

  it('Eq. 5.39: the exponent a from NEd/NRd', () => {
    expect(biaxialExponent(0.05)).toBe(1);
    expect(biaxialExponent(0.4)).toBeCloseTo(1.25, 12);
    expect(biaxialExponent(0.7)).toBeCloseTo(1.5, 12);
    expect(biaxialExponent(0.85)).toBeCloseTo(1.75, 12);
    expect(biaxialExponent(1.2)).toBe(2);
  });
});

describe('EC2 creep, Annex B', () => {
  it('φ(∞,t0) for RH 50 %, t0 = 28 days', () => {
    // fcm = 38 > 35: α1 = (35/38)^0,7, α2 = (35/38)^0,2; h0 = 200 mm: φRH = [1 + 0,5/(0,1·200^(1/3))·α1]·α2 = 1,7778,
    // β(fcm) = 16,8/√38 = 2,7253, β(t0) = 1/(0,1 + 28^0,2) = 0,48844 → 2,36641.
    expect(ec2CreepCoefficient(30, 200)).toBeCloseTo(2.36641, 4);
    // fcm = 33 ≤ 35: φRH = 1 + 0,5/(0,1·200^(1/3)) = 1,85499, β(fcm) = 16,8/√33 → 2,64980.
    expect(ec2CreepCoefficient(25, 200)).toBeCloseTo(2.6498, 4);
    expect(ec2CreepCoefficient(30, 500, 80, 60)).toBeCloseTo(1.40148, 4);
  });

  it('ψ2 of EN 1990 Table A1.1 by case type', () => {
    expect(ec2Psi2('D')).toBe(1);
    expect(ec2Psi2('L')).toBe(0.3);
    expect(ec2Psi2('W')).toBe(0);
    expect(ec2Psi2('S')).toBe(0);
    expect(ec2Psi2('')).toBe(1);
  });
});

describe('EC2 torsion, 6.3.2', () => {
  // 30 × 60, C30/37, fyk = 420, cover 25 mm, Ø8 links, Ø20 bars. tef = max(A/u = 0,18/1,8; 2·43 mm) = 100 mm,
  // Ak = 0,2·0,5 = 0,1 m², uk = 1,4 m, fctd = 0,7·2,8965/1,5 = 1,35169 MPa, TRd,c = 2·0,1·0,1·1351,69 = 27,034 kN·m.
  // With the minimum steel at the bottom (2,996 cm²) VRd,c = vmin·b·d = 0,38770·0,3·0,557 = 64,784 kN.
  const demand = (t: number, v: number) => ({ category: 'My+' as const, value: 10, absValue: 10, comboId: 1, comboName: 'C1', stationT: 0.5, stationX: 3,
    forces: { t: 0.5, x: 3, n: 0, vy: 0, vz: v, my: 10, mz: 0, torsion: t } });
  const member = (t: number, v: number) => ec2MemberDesign({ kind: 'beam', b: 0.3, h: 0.6, L: 6, demands: [demand(t, v)], cover: 0.025, linkDia: 8, barDia: 20, fck: 30, fyk: 420, params: EC2_RECOMMENDED });

  it('below the screen of 6.3.2(5): no torsion steel', () => {
    // 5/27,034 + 30/64,784 = 0,6480.
    const d = member(5, 30);
    if ('skip' in d) throw new Error(d.skip);
    const row = d.rows.find((r) => r.titleKey === 'check.ec2.torsion')!;
    expect(row.clause).toBe('6.3.2(5)');
    expect(row.ratio).toBeCloseTo(0.648, 3);
  });

  it('above it: the struts by Eq. 6.29, the links and ΣAsl by 6.28', () => {
    // VEd = 100 > VRd,c: cotθ = 2,5 (VRd,max = 0,3·0,5013·0,528·20 000/2,9 = 547,63 kN); TRd,max = 2·0,528·20 000·0,1·0,1/2,9
    // = 72,828 kN·m; 20/72,828 + 100/547,63 = 0,4572. Links: shear max(100/(0,5013·365 217·2,5); ρw,min·b = 3,1298) = 3,1298
    // cm²/m, torsion 20/(2·0,1·365 217·2,5) = 1,0952 cm²/m a leg, both legs: 5,3203 cm²/m. ΣAsl = 20·1,4·2,5/(2·0,1·365 217) = 9,583 cm².
    const d = member(20, 100);
    if ('skip' in d) throw new Error(d.skip);
    const row = d.rows.find((r) => r.titleKey === 'check.ec2.torsion')!;
    expect(row.clause).toBe('6.3.2');
    expect(row.ratio).toBeCloseTo(0.4572, 3);
    expect(Number(row.inputs.find((i) => i.symbol === 'Asw/s')!.value)).toBeCloseTo(5.3203, 2);
    expect(Number(row.inputs.find((i) => i.symbol === 'ΣAsl')!.value)).toBeCloseTo(9.583, 2);
  });

  it('a beam\'s axial force: left out up to 0,1·fcd·Ac in compression (360 kN here), said above it', () => {
    const at = (n: number) => ec2MemberDesign({ kind: 'beam', b: 0.3, h: 0.6, L: 6, demands: [{ ...demand(0, 30), forces: { ...demand(0, 30).forces, n } }], cover: 0.025, linkDia: 8, barDia: 20, fck: 30, fyk: 420, params: EC2_RECOMMENDED });
    const flag = (n: number) => { const d = at(n); if ('skip' in d) throw new Error(d.skip); return d.rows.find((r) => r.titleKey === 'check.ec2.axialNotEvaluated')?.status; };
    expect(flag(-350)).toBeUndefined();
    expect(flag(-370)).toBe('notVerified');
    // Tension: 0,01·20·0,18·1000 = 36 kN.
    expect(flag(30)).toBeUndefined();
    expect(flag(40)).toBe('notVerified');
  });
});

describe('EC2: the bars a beam holds', () => {
  it('As,req at the station against the bars there, and the links against the shear\'s', () => {
    // 30 × 60, d = 0,557 m, MEd = 100 kN·m sagging: 4800·x·(0,557 − 0,4x)·… → x = 48,44 mm, z = min(0,5376; 0,95·d) = 0,52915 m,
    // As = 100/(365 217·0,52915) = 5,1745 cm² against 3 Ø16 = 6,0319 cm²: 0,8579.
    // VEd = 100 kN > VRd,c: links max(100/(0,5013·365 217·2,5) = 2,185; ρw,min·b = 3,1298) = 3,1298 cm²/m against
    // Ø8 two legs every 0,20 m = 5,0265 cm²/m: 0,6227 (s/s,max = 0,2/0,4178 = 0,479 does not govern).
    const d = ec2MemberDesign({ kind: 'beam', b: 0.3, h: 0.6, L: 6, cover: 0.025, linkDia: 8, barDia: 20, fck: 30, fyk: 420, params: EC2_RECOMMENDED,
      demands: [{ category: 'My+', value: 100, absValue: 100, comboId: 1, comboName: 'C1', stationT: 0.5, stationX: 3, forces: { t: 0.5, x: 3, n: 0, vy: 0, vz: 100, my: 100, mz: 0, torsion: 0 } }],
      provided: { bottom: { count: 3, diameter: 16 }, stirrups: { diameter: 8, legs: 2, spacing: 0.2 } } });
    if ('skip' in d) throw new Error(d.skip);
    expect(d.rows.find((r) => r.titleKey === 'check.ec2.barsProvided')!.ratio).toBeCloseTo(0.8579, 3);
    expect(d.rows.find((r) => r.titleKey === 'check.ec2.linksProvided')!.ratio).toBeCloseTo(0.6227, 3);
  });
});
