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
    const r = checkSteelCompression(base({ A, Iy, Iz: 10 * Iy, L: 6.5 }), 200);
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
    const r = checkSteelCompression(base({ A, Iy: I, Iz: I, L: 6.5 }), 200);
    published(r.KLr, 111.9);
    published(r.Fcr, 126.04);
    published(r.phiPn, 221.2);
  });

  /**
   * (c) Welded box 180×180×2,5 with SLENDER walls (b/t = 72 > λr = 43,4): Ag = 17,75 cm²,
   * I = 932,24 cm⁴, kL/r = 89,70; E.7: be = 14,21 cm, Q = Qa = 0,794, Fcr = 135,70 MPa,
   * Pd = 204,7 kN.
   *
   * DISCREPANCY (stabileo, unconservative): the checker has no slender-element reduction Q
   * (§E.7) and applies E.3 with Q = 1: Fcr = 157,3 MPa, φPn = 237,4 kN, 16 % above the example.
   * Not fixed here — Q needs the element widths of the actual section shape, which the
   * I-section parameters cannot describe for a box.
   */
  it.skip('(c) slender box — §E.7 Q not implemented (reproduction)', () => {
    const A = 17.75e-4;
    const I = 932.24e-8;
    const r = checkSteelCompression(base({ A, Iy: I, Iz: I, L: 6.5 }), 200);
    published(r.phiPn, 204.7);
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
   * V2 flexure: flange NONCOMPACT (λf = 12,60, λp = 11,09, λr = 22,9) and web noncompact
   * (138 between 109,6 and 166,34) → §F.4: Rpc = 1,069, FL = 121 MPa, FLB governs,
   * Mn = 317,9 kNm (F.4-12), Md = 286,1 kNm.
   *
   * DISCREPANCY (stabileo, unconservative): the checker implements only §F.2 (compact
   * sections) and returns φMp = 0,9·362,2 = 326,0 kNm, 14 % above the example. Not fixed here:
   * §F.3/F.4 (Rpc, kc, FL, hc) is a new limit-state family, not a correction.
   */
  it.skip('V2 welded girder — §F.4 noncompact flange/web not implemented (reproduction)', () => {
    const r = checkSteelFlexure(v2(), 280.8, 'strong');
    published(r.phiMn, 286.1);
  });

  /**
   * Case I-B, V1 with Lb = 5 m and the deck bearing on the TOP flange: Lp = 79,1 cm (F.2-5b),
   * FL = 166 MPa, X1 = 25 437 MPa, Lr = 335 cm (F.2-6b, top flange), Cb = 1,14,
   * Mcr = 20,43 kNm (F.2-4b), Md = 18,39 kNm.
   *
   * DISCREPANCY (stabileo, unconservative): the checker has no load-height input and always
   * uses the web/bottom-flange expressions; it also uses AISC 360-10's Mr = 0,7·Fy·Sx and its
   * Lr instead of CIRSOC 301's FL = Fy − Fr (F.2-6a/F.2-7a).
   */
  it.skip('V1 top-flange loading — F.2-4b/F.2-5b/F.2-6b not implemented (reproduction)', () => {
    const r = checkSteelFlexure(ipn180({ Lb: 5, Cb: 1.14, Cw: 5924e-12 }), 37.5, 'strong');
    published(r.phiMn, 18.39);
  });
});
