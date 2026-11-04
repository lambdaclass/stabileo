/**
 * The limit states added to the CIRSOC 301 checker, each against a hand calculation on an IPE 200
 * (A = 28,5 cm², Ix = 1943 cm⁴, Iy = 142 cm⁴, h 200, b 100, tw 5,6, tf 8,5 mm; J = 6,98 cm⁴,
 * Cw = 12 990 cm⁶; Fy 235, Fu 360, E 200 000 MPa).
 *
 * The checks are the engine's (`cirsoc301.ts` is its adapter); these hand calculations, written
 * for the TypeScript checker the engine replaced, now pin the engine and what the adapter adds
 * (per-axis lengths, a Lb per flange, §G.6 on the flanges). Where the engine reads the text
 * differently the expectation says so: G = 77 200 MPa (A.3.5) instead of E/2,6, and the net
 * section declared through the member's end connection (`tensionConnection`), the one model of
 * the connection data.
 */
import { describe, it, expect } from 'vitest';
import { checkSteelCompression, checkSteelFlexure, checkSteelShear, checkSteelTension, verifySteelElement, type SteelDesignParams } from '../cirsoc301';

const IPE200 = (over: Partial<SteelDesignParams> = {}): SteelDesignParams => ({
  Fy: 235, Fu: 360, E: 200_000, A: 28.5e-4, Iz: 1943e-8, Iy: 142e-8,
  h: 0.2, b: 0.1, tw: 0.0056, tf: 0.0085, L: 4, Lb: 4, J: 6.98e-8, Cw: 12990e-12, shape: 'I', ...over,
});

describe('D.3 — the net section with holes', () => {
  it('takes two Ø20 holes (22 mm in the flange) and U = 0,85', () => {
    // An = 2850 − 2·22·8,5 = 2476 mm², Ae = 0,85·2476 = 2104,6 mm²: φPn = 0,75·360·2104,6 = 568,2 kN
    // against 0,90·235·2850 = 602,8 kN in yield. Declared as the end connection's An and U.
    const r = checkSteelTension(IPE200({ tensionConnection: { An: 2850e-6 - 2 * 0.022 * 0.0085, U: 0.85 } }), -100);
    expect(r.phiPn).toBeCloseTo(568.2, 1);
  });
});

describe('G.2.1 and G.6 — shear on each axis', () => {
  it('rates the strong axis on the web with kv = 5', () => {
    // h/tw = 183/5,6 = 32,7 ≤ 1,10·√(5·E/Fy) = 71,8: Cv = 1; φVn = 0,9·0,6·235·200·5,6 = 142,1 kN.
    const r = checkSteelShear(IPE200(), 100);
    expect(r.Cv).toBe(1);
    expect(r.phiVn).toBeCloseTo(142.12, 1);
  });
  it('reduces a slender web by G.2.5', () => {
    // h/tw = 580/4 = 145 > 1,37·√(5·E/Fy) = 89,4: Cv = 1,51·E·5/(145²·235) = 0,3056.
    const r = checkSteelShear(IPE200({ h: 0.6, tw: 0.004, tf: 0.01 }), 100);
    expect(r.Cv).toBeCloseTo(0.3056, 3);
  });
  it('rates the weak axis on both flanges with kv = 1,2', () => {
    // b/tf = 50/8,5 = 5,9, Cv = 1; Aw = 2·100·8,5 = 1700 mm²: φVn = 0,9·0,6·235·1700 = 215,7 kN.
    const r = verifySteelElement({ elementId: 1, Nu: 0, Muz: 0, Muy: 0, Vu: 0, VuWeak: 50, params: IPE200() }).shearWeak!;
    expect(r.phiVn).toBeCloseTo(215.73, 1);
    expect(r.axis).toBe('weak');
    expect(r.clauseRef).toBe('G.6');
  });
});

describe('E.4 — torsional buckling of a doubly symmetric I', () => {
  it('governs when the weak axis is braced and the twist is not', () => {
    // Lx = 4, Ly = 1, Lz = 4: Fex = π²E/(400/8,257)² = 841 MPa, Fey = 983 MPa,
    // Fez = (π²·E·Cw/Lz² + G·J)/(Ix + Iy) with G = 77 200 MPa (A.3.5, the engine's value; the
    // TypeScript checker took E/2,6 = 76 923): (1,6026e9 + 5,3886e9)/2,085e7 = 335,3 MPa.
    // Fcr = 0,658^(235/335,3)·235 = 175,3 MPa; φPn = 0,85·175,3·2850 = 424,6 kN.
    const r = checkSteelCompression(IPE200({ Lx: 4, Ly: 1, Lz: 4 }), 100);
    expect(r.Fe).toBeCloseTo(841.1, 0); // the flexural Fe; E.4's is in the steps
    expect(r.clauseRef).toBe('E.4');
    expect(r.phiPn).toBeCloseTo(424.6, 0);
    expect(r.steps.join(' ')).toContain('335.3 MPa');
    expect(r.steps.join(' ')).toContain('Gobierna el pandeo torsional');
  });
  it('uses each axis its own length', () => {
    const r = checkSteelCompression(IPE200({ Lx: 6, Ly: 2, shape: undefined }), 100);
    // KL/rx = 600/8,257 = 72,7, KL/ry = 200/2,232 = 89,6: the weak axis still governs.
    expect(r.KLr).toBeCloseTo(200 / Math.sqrt(142 / 28.5), 1);
  });
});

describe('E.7 — a slender flange in compression', () => {
  it('reduces the strength by Qs', () => {
    // b/t = 200/10 = 20 between 0,56·√(E/Fy) = 16,3 and 1,03·√(E/Fy) = 30,0:
    // Qs = 1,415 − 0,74·20·√(235/200000) = 0,9077.
    const p = IPE200({ b: 0.4, tf: 0.01, A: 100e-4, Iz: 8000e-8, Iy: 10667e-8, L: 0.5, Lb: 0.5, J: undefined, Cw: undefined });
    const r = checkSteelCompression(p, 100);
    expect(r.Q).toBeCloseTo(0.9077, 4);
    // The same section with a flange that is not slender (b/t = 16) keeps Q = 1.
    const unreduced = checkSteelCompression({ ...p, tf: 0.0125 }, 100);
    expect(unreduced.Q).toBe(1);
  });
});

describe('F.3 — flange local buckling about the strong axis', () => {
  it('interpolates a noncompact flange between Mp and FL·Sx, FL = Fy − 69 MPa (rolled)', () => {
    // 300 × 300, tf 12, tw 8, Fy 345: b/t = 12,5 between λp = 9,15 and λr (caso 11) as the engine
    // reads it, 0,83·√(E/(0,7·Fy)) = 23,9; the web is compact (34,5 ≤ 90,5). Lb = 0,5 m keeps the
    // beam on the plastic plateau. Mr = FL·Sx with FL = Fy − Fr (F.3.2), not 0,7·Fy.
    const p = IPE200({ h: 0.3, b: 0.3, tf: 0.012, tw: 0.008, Fy: 345, Iz: 20000e-8, Iy: 5400e-8, A: 105e-4, Lb: 0.5, builtUp: false });
    const r = checkSteelFlexure(p, 10, 'strong');
    const Sx = p.Iz / (p.h / 2), lp = 0.38 * Math.sqrt(200000 / 345), lr = 0.83 * Math.sqrt(200000 / (0.7 * 345));
    expect(r.clause).toBe('F.3');
    expect(r.Mn).toBeCloseTo(r.Mp - (r.Mp - (345 - 69) * Sx * 1000) * ((12.5 - lp) / (lr - lp)), 6);
  });
});

describe('each flange its own unbraced length', () => {
  it('checks the hogging moment over the bottom flange length', () => {
    // Top flange braced every metre, bottom one only at the ends of 6 m: the same moment in
    // hogging is the worse one.
    const v = verifySteelElement({ elementId: 1, Nu: 0, Muz: 20, Muy: 0, Vu: 0, MuzPos: 20, MuzNeg: 20, params: IPE200({ Lb: 1, LbNeg: 6 }) });
    expect(v.steps.join(' ')).toContain('ala inferior comprimida, Lb = 6 m');
    const top = checkSteelFlexure(IPE200({ Lb: 1 }), 20, 'strong');
    expect(v.flexureZ.phiMn).toBeLessThan(top.phiMn);
    expect(v.flexureZ.phiMn).toBeCloseTo(checkSteelFlexure(IPE200({ Lb: 6 }), 20, 'strong').phiMn, 9);
  });
});
