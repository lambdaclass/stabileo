/**
 * The CIRSOC 301 steel checker against INTI-CIRSOC's own published worked examples.
 *
 * Source: G. Troglia, D. Troglia, J. Angulo Bocco, *Ejemplos de Aplicación del Reglamento
 * CIRSOC 301-2018*, INTI-CIRSOC, July 2018 ("Ej." page numbers below are the example's own).
 *
 * Inputs are the example's printed inputs; expected values are the numbers it prints, compared
 * at their printed rounding (three significant figures → 0.5 % relative, which also absorbs the
 * example's habit of rounding intermediates before reusing them). Coverage and the root cause of
 * every disagreement: `docs/verification/DESIGN_EXAMPLES.md`.
 *
 * The checker's axis naming is the opposite of the app's: `Iz` is the STRONG axis, `Iy` the weak.
 */

import { describe, it, expect } from 'vitest';
import {
  checkSteelCompression, checkSteelFlexure, checkSteelShear, type SteelDesignParams,
} from '../cirsoc301';

/** |actual − printed| / printed within `rel`, with a message that says by how much. */
function published(actual: number, printed: number, rel = 0.005): void {
  const err = Math.abs(actual - printed) / Math.abs(printed);
  expect(err, `stabileo ${actual}, published ${printed} (off by ${(err * 100).toFixed(3)} %)`)
    .toBeLessThanOrEqual(rel);
}

const base = (p: Partial<SteelDesignParams>): SteelDesignParams => ({
  Fy: 235, Fu: 370, E: 200_000,
  A: 0, Iz: 0, Iy: 0, h: 0, b: 0, tw: 0, tf: 0,
  L: 0, Lb: 0,
  ...p,
});

describe('INTI CIRSOC 301-2018, Ejemplo 10 — column in axial compression (Ej. 10-1 … 10-5)', () => {
  /**
   * (a) IPE 300: Ag = 53,8 cm², rmin = 3,35 cm, kL = 650 cm → kL/r = 194, λc = 2,117 > 1,5,
   * Fcr = 0,877/λc²·Fy = 46,0 MPa (E.3-3), Rd = 0,85·46,0·53,8·0,1 = 210,3 kN.
   * The strong-axis radius is not printed and does not govern; any larger value will do.
   */
  it('(a) IPE 300 — elastic branch E.3-3', () => {
    const A = 53.8e-4;
    const Iy = A * 0.0335 ** 2;
    const r = checkSteelCompression(base({
      A, Iy, Iz: 10 * Iy, L: 6.5, h: 0.30, b: 0.15, tw: 0.0071, tf: 0.0107,
    }), 200);
    // Ej. 10-1/10-2: flange 7,01 < 16,31 (case 1), web 35,02 < 43,38 (case 5) → Q = 1
    expect(r.Q).toBe(1);
    published(r.KLr, 194);
    published(r.Fcr, 46.0);
    published(r.phiPn, 210.3);
  });

  /**
   * (b) Seamless tube 168,3×4: Ag = 20,65 cm², r = 5,81 cm → kL/r = 111,9, λc = 1,22,
   * Fcr = 0,658^λc²·Fy = 126,04 MPa (E.3-2), Pd = 221,2 kN.
   */
  it('(b) circular tube — inelastic branch E.3-2', () => {
    const A = 20.65e-4;
    const I = A * 0.0581 ** 2;
    const r = checkSteelCompression(base({ A, Iy: I, Iz: I, L: 6.5, shape: 'CHS', h: 0.1683, tw: 0.004 }), 200);
    // D/t = 42,08 < 0,11·E/Fy = 93,61 (case 10) → Q = 1
    expect(r.Q).toBe(1);
    published(r.KLr, 111.9);
    published(r.Fcr, 126.04);
    published(r.phiPn, 221.2);
  });

  /**
   * (c) Welded box 180×180×2,5 with SLENDER walls (b/t = 72 > λr = 43,4): Ag = 17,75 cm²,
   * I = 932,24 cm⁴, kL/r = 89,70; E.7: f = Fcr(Q = 1) = 157,34 MPa, be = 14,21 cm,
   * Aef = 14,085 cm², Q = Qa = 0,794, Fcr = 135,70 MPa, Pd = 204,7 kN (Ej. 10-4/10-5).
   *
   * Regression (D6): the checker had no §E.7 and gave φPn = 237,4 kN, 16 % above the example.
   *
   * The example takes b = 18 cm (the plate width) for b/t and b = 18 / 17,75 cm in Aef, and the
   * 2005 form of E.7.17 (855/√f, 150): fed those widths explicitly the checker reproduces it.
   * B.4.1(b)(c) defines b as the distance between welds, 17,5 cm for every wall of this box, and
   * that is what the checker derives from the geometry: b/t = 70, be = 1,91·t·√(E/f)·[1 −
   * 0,34/(b/t)·√(E/f)] = 14,076 cm, Aef = 17,75 − 4·(17,5 − 14,076)·0,25 = 14,326 cm²,
   * Q = 0,8071, Fcr = Q·0,658^(Q·0,979²)·235 = 137,21 MPa, Pd = 207,0 kN — 1,1 % above the
   * printed value because of the example's wider b (D17), not because of the clause.
   */
  it('(c) slender box — §E.7 Qa with the example\'s element widths', () => {
    const A = 17.75e-4;
    const I = 932.24e-8;
    const r = checkSteelCompression(base({
      A, Iy: I, Iz: I, L: 6.5, shape: 'box', h: 0.18, b: 0.18, tw: 0.0025, tf: 0.0025, builtUp: true,
      compressionElements: [
        { kind: 'stiffened', b: 0.18, t: 0.0025, count: 2 },
        { kind: 'stiffened', b: 0.1775, t: 0.0025, count: 2 },
      ],
    }), 200);
    published(r.KLr, 89.70);
    // The example evaluates be with the 2005 expression it marks (E.7-17)*, 855·t/√f·[1 −
    // 150/((b/t)·√f)]; the 2018 text (E.7.17) is 1,91·t·√(E/f)·[1 − 0,34/(b/t)·√(E/f)], which
    // gives be 0,4 % smaller (14,16 against 14,21 cm). stabileo implements the 2018 text, so Q and
    // Fcr are compared at 1 % and the resistance, where the difference is diluted, at 0,5 %.
    published(r.Q, 0.794, 0.01);
    published(r.Fcr, 135.70, 0.01);
    published(r.phiPn, 204.7);
  });

  it('(c) slender box — §E.7 with B.4.1(b)(c) widths derived from the geometry', () => {
    const A = 17.75e-4;
    const I = 932.24e-8;
    const r = checkSteelCompression(base({
      A, Iy: I, Iz: I, L: 6.5, shape: 'box', h: 0.18, b: 0.18, tw: 0.0025, tf: 0.0025, builtUp: true,
    }), 200);
    published(r.Q, 0.8071, 0.001);
    published(r.Fcr, 137.21, 0.001);
    published(r.phiPn, 207.0, 0.001);
  });
});

describe('INTI CIRSOC 301-2018, Ejemplo 14 — beams in flexure and shear (Ej. 14-1 … 14-10)', () => {
  /**
   * Beam V1, IPN 180 (IRAM-IAS U 500-511): Ag = 27,9 cm², Ix = 1450 cm⁴, Iy = 81,3 cm⁴,
   * Zx = 187 cm³, Sx = 161 cm³, d = 18 cm, tw = 0,69 cm, tf = 1,04 cm (b = 8,2 cm).
   */
  const ipn180 = (p: Partial<SteelDesignParams> = {}) => base({
    A: 27.9e-4, Iz: 1450e-8, Iy: 81.3e-8,
    h: 0.18, b: 0.082, tw: 0.0069, tf: 0.0104,
    Zx: 187e-6, Sx: 161e-6, J: 7.89e-8,
    L: 5, Lb: 0,
    ...p,
  });

  /**
   * Case I-A (continuously braced): compact flange (λf = 3,94 < 11,09) and web (20,6 < 109,6);
   * Mn = Mp = Zx·Fy = 43,95 kNm (F.2-1; printed in case I-B), Zx = 187 < 1,5·Sx = 241,5.
   */
  it('V1 IPN 180 — plastic moment F.2.1', () => {
    const r = checkSteelFlexure(ipn180(), 37.5, 'strong');
    published(r.Mp, 43.95);
    published(r.phiMn, 0.9 * 43.95);
  });

  /** V1 shear: h/tw = 20,6 → Cv = 1 (G.2-3); Vn = 0,6·235·18·0,69·0,1 = 175,1 kN; Vd = 157,6 kN. */
  it('V1 IPN 180 — shear yielding G.2.1, Cv = 1', () => {
    const r = checkSteelShear(ipn180(), 30);
    expect(r.Cv).toBe(1);
    published(r.phiVn / 0.9, 175.1);
    published(r.phiVn, 157.6);
  });

  /**
   * Beam V2, welded I: web 650×4,7 mm, flanges 200×7,94 mm; Ag = 62,31 cm², Ix = 45 129 cm⁴,
   * Sx = 1355,5 cm³, Zx = 1541,2 cm³, Iy = 1059,2 cm⁴.
   */
  const v2 = (p: Partial<SteelDesignParams> = {}) => base({
    A: 62.31e-4, Iz: 45_129e-8, Iy: 1059.2e-8,
    h: 0.65 + 2 * 0.00794, b: 0.20, tw: 0.0047, tf: 0.00794,
    Zx: 1541.2e-6, Sx: 1355.5e-6,
    L: 10, Lb: 2,
    builtUp: true,
    ...p,
  });

  /**
   * V2 shear, slender web: h/tw = 138,3 > 1,37·√(kv·E/Fy) = 89,41 (kv = 5) →
   * Cv = 302 000·kv/((h/tw)²·Fy) = 0,336 (G.2-5); Vn = 0,6·235·65·0,47·0,336·0,1 = 144,7 kN;
   * Vd = 130,3 kN.
   *
   * Regression: the checker used AISC 360-10's 2,24·√(E/Fy) limit and kv = 5,34, had no
   * elastic branch G.2.5, and took Aw = (total depth)·tw for a built-up section — Cv = 0,536,
   * φVn = 207,8 kN, 60 % above the example.
   */
  it('V2 welded girder — elastic web shear buckling G.2.5', () => {
    const r = checkSteelShear(v2(), 78.6);
    published(r.Cv, 0.336);
    published(r.phiVn / 0.9, 144.7);
    published(r.phiVn, 130.3);
  });

  /**
   * V2 flexure: flange NONCOMPACT (λf = 12,60, λp = 11,09, λr = 22,9, kc = 0,35) and web
   * noncompact (138 between 109,6 and 166,34) → §F.4: FL = 235 − 114 = 121 MPa, Mp = 362,2,
   * Mxc = 318,5 kNm, Rpc = 1,069 (F.4-9b); FLB Mn = 317,9 kNm (F.4-12); LTB with Lb = 200 cm:
   * J = 26,77 cm⁴, rt = 5,06 cm, Lp = 162,4 cm (F.4-7), Lr = 711,2 cm (F.4-8),
   * Mn = 328,4 kNm (F.4-2). FLB governs: Md = 0,9·317,9 = 286,1 kNm (Ej. 14-7 … 14-9).
   *
   * Regression (D8): the checker implemented only §F.2 and returned φMp = 0,9·362,2 =
   * 326,0 kNm, 14 % above the example.
   */
  it('V2 welded girder — §F.4 noncompact flange and web', () => {
    const r = checkSteelFlexure(v2({ J: 26.77e-8 }), 280.8, 'strong');
    expect(r.clause).toBe('F.4');
    published(r.Mp, 362.2);
    published(r.Lp * 100, 162.4);
    published(r.Lr * 100, 711.2);
    published(r.Mn, 317.9);
    published(r.phiMn, 286.1);
  });

  /**
   * Case I-B, V1 with Lb = 5 m and the deck bearing on the TOP flange: Lp = 79,1 cm (F.2-5b),
   * FL = Fyf − Fr = 235 − 69 = 166 MPa, X1 = 25 437 MPa (F.2-4c), Lr = 335 cm (F.2-6b),
   * Cb = 1,14, Mcr = 20,43 kNm (F.2-4b), Md = 18,39 kNm (Ej. 14-3/14-4).
   *
   * Regression (D8): the checker had no load-height input and used AISC 360-10's
   * expressions with Mr = 0,7·Fy·Sx instead of CIRSOC 301's FL = Fy − Fr (F.2-6/F.2-7).
   */
  it('V1 top-flange loading — F.2-4b/F.2-5b/F.2-6b, elastic LTB', () => {
    const r = checkSteelFlexure(ipn180({ Lb: 5, Cb: 1.14, Cw: 5924e-12, loadPosition: 'topFlange' }), 37.5, 'strong');
    expect(r.clause).toBe('F.2');
    published(r.Lp * 100, 79.1);
    published(r.Lr * 100, 335);
    published(r.Mn, 20.43);
    published(r.phiMn, 18.39);
  });

  /**
   * Same beam braced at midspan (Ej. 14-4/14-5): Lb = 250 cm, Cb = 1,298, Mp = 43,95,
   * Mr = FL·Sx = 166·161 = 26,73 kNm, Mn = 1,298·[43,95 − (43,95 − 26,73)·(250 − 79,1)/
   * (335 − 79,1)] = 42,12 kNm (F.2-2), Md = 37,91 kNm. The inelastic branch with CIRSOC's FL.
   */
  it('V1 braced at midspan — F.2-2 inelastic LTB with FL = Fy − 69 MPa', () => {
    const r = checkSteelFlexure(ipn180({ Lb: 2.5, Cb: 1.298, Cw: 5924e-12, loadPosition: 'topFlange' }), 37.5, 'strong');
    published(r.Mn, 42.12);
    published(r.phiMn, 37.91);
  });

  /**
   * Beam V3, welded girder with a SLENDER web (Ej. 14-11 … 14-14): web 950×4,76 mm, flanges
   * 350×15,88 mm, Sxc = 5974 cm³, Lb = 1000 cm, Cb = 1. §F.5: aw = 0,814, rt = 9,58 cm,
   * Lp = 307,4 cm (F.5-5a), Lr = 1223,6 cm (F.5-5b), Fcr = 143,5 MPa (F.5-3), Rpg = 1,0
   * (F.5-6 gives 1,007), Mn = 857,2 kNm (F.5-2), Md = 771,4 kNm. Flange compact (FLB n/a).
   *
   * Before, a slender web fell to §F.2 like every other section.
   */
  it('V3 welded girder — §F.5 slender web', () => {
    const r = checkSteelFlexure(base({
      A: 156.38e-4, Iz: 293_292e-8, Iy: 1e-5,
      h: 0.95 + 2 * 0.01588, b: 0.35, tw: 0.00476, tf: 0.01588,
      Sx: 5974e-6, L: 25, Lb: 10, builtUp: true,
    }), 740, 'strong');
    expect(r.clause).toBe('F.5');
    published(r.Lp * 100, 307.4);
    published(r.Lr * 100, 1223.6);
    published(r.Mn, 857.2);
    published(r.phiMn, 771.4);
  });
});

describe('CIRSOC 301 — refusals instead of unsafe numbers', () => {
  it('a section the classification cannot describe is NOT EVALUATED, never a pass', () => {
    const p = base({ A: 5e-4, Iz: 1e-6, Iy: 2e-7, h: 0.1, b: 0.05, tw: 0.002, tf: 0.002, L: 2, shape: 'C' });
    const c = checkSteelCompression(p, 10);
    expect(c.notEvaluated).toBeTruthy();
    expect(c.status).toBe('fail');
    expect(c.ratio).toBe(Infinity);
    const f = checkSteelFlexure(p, 1, 'strong');
    expect(f.notEvaluated).toBeTruthy();
    expect(f.status).toBe('fail');
  });

  it('a circular tube beyond D/t = 0,45·E/Fy is refused (E.7.2(c) does not cover it)', () => {
    const c = checkSteelCompression(base({ A: 10e-4, Iz: 1e-5, Iy: 1e-5, L: 2, shape: 'CHS', h: 0.5, tw: 0.00085 }), 10);
    expect(c.notEvaluated).toBeTruthy();
    expect(c.status).toBe('fail');
  });

  it('LTB beyond Lp without J is refused, not evaluated with J = 0', () => {
    const r = checkSteelFlexure(base({
      A: 27.9e-4, Iz: 1450e-8, Iy: 81.3e-8, h: 0.18, b: 0.082, tw: 0.0069, tf: 0.0104,
      Zx: 187e-6, Sx: 161e-6, L: 5, Lb: 5,
    }), 10, 'strong');
    expect(r.notEvaluated).toBeTruthy();
    expect(r.status).toBe('fail');
  });
});
