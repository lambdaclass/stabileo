/**
 * CIRSOC 301-2018 chapter F, strong axis: FL = Fy − Fr, and F.4 / F.5.
 *
 * Expected values are the clauses evaluated by hand, here, from the printed expressions
 * (`docs/codes/CIRSOC/markdown/cirsoc-301-2018/capitulo-f-proyecto-de-vigas-y-otros-miembros.md`):
 * F.2.4c/d X1 and X2 and F.2.6a in the text's own closed form, which the checker writes as the
 * root of Mcr(Lr) = FL·Sx instead. The two INTI beams are checked against our own hand values; the
 * numbers INTI prints are quoted for comparison only, because that publication is not in the
 * repository and its inputs could not be read from the source.
 */
import { describe, it, expect } from 'vitest';
import { checkSteelFlexure, verifySteelElement, type SteelDesignParams } from '../cirsoc301';
import { steelRatio } from '../cirsoc301-verdict';

/** FL = min(Fyf − Fr, Fyw), MPa, Fr = 69 rolled and 114 welded (F.2.7): the hand value. */
const flangeLimitStress = (Fy: number, welded: boolean): number => Math.min(Fy - (welded ? 114 : 69), Fy);

/** The Lb at which F.2.4a's Mcr equals M (the root F.2.6a writes in closed form), mm: the hand value. */
function elasticLtbLength(M: number, E: number, G: number, Iy: number, J: number, Cw: number): number {
  const a = Math.PI ** 2 * E * Iy * G * J;
  const u = (a + Math.sqrt(a * a + 4 * M * M * Math.PI ** 4 * E * E * Iy * Cw)) / (2 * M * M);
  return Math.sqrt(u);
}

const E = 200_000, G = E / 2.6, Fy = 235;

/** A doubly symmetric plate I, by its plates (mm), in the checker's units and axis naming. */
function plateI(h: number, b: number, tw: number, tf: number, over: Partial<SteelDesignParams> = {}): SteelDesignParams {
  const hw = h - 2 * tf, ho = h - tf;
  const A = 2 * b * tf + hw * tw;
  const Ix = (b * h ** 3 - (b - tw) * hw ** 3) / 12;
  const Iy = (2 * tf * b ** 3) / 12 + (hw * tw ** 3) / 12;
  const Zx = b * tf * (h - tf) + (tw * hw ** 2) / 4;
  const J = (2 * b * tf ** 3 + hw * tw ** 3) / 3;
  return {
    Fy, Fu: 360, E, G, A: A * 1e-6, Iz: Ix * 1e-12, Iy: Iy * 1e-12, h: h / 1000, b: b / 1000, tw: tw / 1000, tf: tf / 1000,
    Zx: Zx * 1e-9, Sx: (Ix / (h / 2)) * 1e-9, J: J * 1e-12, Cw: ((Iy * ho ** 2) / 4) * 1e-18, L: 6, Lb: 3, shape: 'I',
    // The hand values are F.2.4a, F.2.5a and F.2.6a: the load on the web or the bottom flange.
    loadPosition: 'web', ...over,
  };
}

/** F.2.6a as printed, cm and MPa: Lr = (ry·X1/FL)·√(1 + √(1 + X2·FL²)), with F.2.4c and F.2.4d. */
function lrPrinted(p: SteelDesignParams, FL: number): number {
  const Sx = p.Sx! * 1e6, J = p.J! * 1e8, A = p.A * 1e4, Cw = p.Cw! * 1e12, Iy = p.Iy * 1e8, ry = Math.sqrt(Iy / A);
  const X1 = (Math.PI / Sx) * Math.sqrt((E * G * J * A) / 2);
  const X2 = 4 * (Cw / Iy) * (Sx / (G * J)) ** 2;
  return ((ry * X1) / FL) * Math.sqrt(1 + Math.sqrt(1 + X2 * FL * FL)) / 100; // m
}

describe('FL = Fy − Fr (F.2.7, F.3.2, F.4.6a)', () => {
  it('is 166 MPa rolled and 121 MPa welded in Fy 235; 0,7·Fy overstated the welded Mr by 36 %', () => {
    expect(flangeLimitStress(235, false)).toBe(166);
    expect(flangeLimitStress(235, true)).toBe(121);
    expect((0.7 * 235) / 121).toBeCloseTo(1.3595, 4);
  });

  it('Lr: the root the checker solves is F.2.6a as printed', () => {
    const p = plateI(400, 200, 8, 12);
    for (const FL of [166, 121, 0.7 * 235]) {
      const root = elasticLtbLength(FL * p.Sx! * 1e9, E, G, p.Iy * 1e12, p.J! * 1e12, p.Cw! * 1e18) / 1000;
      expect(root).toBeCloseTo(lrPrinted(p, FL), 6);
    }
    // By hand (X1 = 12 227 MPa, X2 = 3,425e-4 MPa⁻²): 6,862 m rolled, 8,504 m welded.
    expect(lrPrinted(p, 166)).toBeCloseTo(6.8616, 3);
    expect(lrPrinted(p, 121)).toBeCloseTo(8.5035, 3);
  });

  /*
   * Welded-plate I 400 × 200 × 8 × 12 in Fy 235, compact (b/2tf = 8,33 ≤ 11,09; h/tw = 47 ≤ 109,7):
   * Mp = Fy·Zx = 285,28 kN·m, Lp = 1,76·ry·√(E/Fy) = 2325 mm, Lb = 5 m.
   *   rolled: Mr = 166·Sx = 179,40 kN·m, Mn = 285,28 − (285,28 − 179,40)·(5000 − 2325)/(6862 − 2325) = 222,85
   *   welded: Mr = 121·Sx = 130,77 kN·m, Mn = 285,28 − (285,28 − 130,77)·(5000 − 2325)/(8504 − 2325) = 218,39
   */
  it('F.2.2 inelastic LTB with Mr = FL·Sx, rolled and welded', () => {
    const rolled = checkSteelFlexure(plateI(400, 200, 8, 12, { Lb: 5, builtUp: false }), 100, 'strong');
    const welded = checkSteelFlexure(plateI(400, 200, 8, 12, { Lb: 5, builtUp: true }), 100, 'strong');
    expect(rolled.clause).toBe('F.2');
    expect(rolled.Mp).toBeCloseTo(285.279, 2);
    expect(rolled.Lp).toBeCloseTo(2.3254, 3);
    expect(rolled.Lr).toBeCloseTo(6.8616, 3);
    expect(rolled.Mn).toBeCloseTo(222.853, 2);
    expect(welded.Lr).toBeCloseTo(8.5035, 3);
    expect(welded.Mn).toBeCloseTo(218.390, 2);
    // The engine's step (`c301.f.lr`) states FL = Fy − Fr.
    const fl = (r: typeof rolled) => r.messages.find((m) => m.key === 'c301.f.lr')?.params?.FL;
    expect(fl(rolled)).toBe(166);
    expect(fl(welded)).toBe(121);
  });

  it('F.2.3 elastic LTB beyond Lr is F.2.4a, Mcr = Cb·(π/Lb)·√(E·Iy·G·J + (π·E/Lb)²·Iy·Cw)', () => {
    const p = plateI(400, 200, 8, 12, { Lb: 10, builtUp: true });
    const Iy = p.Iy * 1e12, J = p.J! * 1e12, Cw = p.Cw! * 1e18, Lb = 10_000;
    const Mcr = (Math.PI / Lb) * Math.sqrt(E * Iy * G * J + (Math.PI * E / Lb) ** 2 * Iy * Cw) / 1e6;
    expect(checkSteelFlexure(p, 50, 'strong').Mn).toBeCloseTo(Mcr, 6);
  });

  /*
   * F.3, welded I 400 × 300 × 8 × 10, noncompact flange: λ = 15, λp = 0,38·√(E/Fy) = 11,086;
   * welded λr = 0,95·√(kc·E/FL) with kc = 4/√47,5 = 0,5804 and FL = 121 (caso 12), rolled λr = 29,17
   * (caso 11). Mn = Mp − (Mp − FL·Sx)·(λ − λp)/(λr − λp) (F.3.1).
   * The engine reads caso 11's λr as 0,83·√(E/(0,7·Fy)) = 28,94 (0,992·√(E/Fy)), not 1,0·√(E/Fy):
   * 0,8 % below, on the safe side (a smaller λr only lowers the interpolated Mn). Pinned at the
   * engine's form; the transcription of the table keeps 1,0 (`table-b41.ts`, open for review).
   */
  it('F.3.1 reads FL and the flange case of the fabrication', () => {
    for (const welded of [false, true]) {
      const p = plateI(400, 300, 8, 10, { Lb: 0.5, builtUp: welded });
      const r = checkSteelFlexure(p, 100, 'strong');
      const FL = welded ? 121 : 166, Sx = p.Sx! * 1e9, Mp = Fy * p.Zx! * 1e9;
      const lp = 0.38 * Math.sqrt(E / Fy);
      const lr = welded ? 0.95 * Math.sqrt((4 / Math.sqrt(380 / 8)) * E / 121) : 0.83 * Math.sqrt(E / (0.7 * Fy));
      expect(r.clause).toBe('F.3');
      expect(r.Mn).toBeCloseTo((Mp - (Mp - FL * Sx) * ((15 - lp) / (lr - lp))) / 1e6, 6);
    }
  });

  it('F.3.2a for a rolled slender flange, F.3.2b for a welded one', () => {
    // 400 × 500 × 8 × 8: λ = 31,25 above λr = 29,17 rolled (caso 11) and 29,34 welded (caso 12,
    // kc = 4/√48 = 0,577); the web is compact (48 ≤ 109,7) and Lb = 0,3 m is inside Lp.
    for (const welded of [false, true]) {
      const p = plateI(400, 500, 8, 8, { Lb: 0.3, builtUp: welded });
      const r = checkSteelFlexure(p, 10, 'strong');
      const Sx = p.Sx! * 1e9, kc = 4 / Math.sqrt(384 / 8);
      expect(r.Mn).toBeCloseTo((welded ? 0.9 * E * kc * Sx : 0.69 * E * Sx) / 31.25 ** 2 / 1e6, 6);
    }
  });
});

describe('F.4 — doubly symmetric I with a noncompact web', () => {
  /*
   * INTI Ejemplo 14, beam V2 (as PR #295 quotes it): welded I, web 650 × 4,7, flanges 200 × 7,94 mm;
   * A = 62,31 cm², Ix = 45 129 cm⁴, Iy = 1059,2 cm⁴, Sx = 1355,5 cm³, Zx = 1541,2 cm³, J = 26,77 cm⁴,
   * Lb = 2 m. By hand:
   *   h/tw = 138,3 between λpw = 109,7 and λrw = 166,3: F.4. Myc = 318,54 kN·m, Mp = 362,18 kN·m,
   *   Rpc = 1,1370 − 0,1370·(138,30 − 109,68)/(166,28 − 109,68) = 1,0677 (F.4.9b), Rpc·Myc = 340,12.
   *   aw = 650·4,7/(200·7,94) = 1,9238; rt = 200/√(12·(650/665,94·… )) = 50,73 mm (F.4.10).
   *   Lp = 1,1·50,73·29,173 = 1628 mm (F.4.7); Lr = 7125 mm (F.4.8) with FL = 121 MPa.
   *   F.4.2: 340,12 − (340,12 − 164,02)·(2000 − 1628)/(7125 − 1628) = 328,2 kN·m.
   *   F.4.3(b): λ = 12,594, λpf = 11,086, λrf = 0,95·√(0,35·E/121) = 22,85 (kc = 4/√138,3 = 0,340 → 0,35):
   *   340,12 − (340,12 − 164,02)·(12,594 − 11,086)/(22,85 − 11,086) = 317,5 kN·m — governs.
   * INTI prints Mp 362,2, Lp 162,4 cm, Lr 711,2 cm, Mn 317,9 and φMn 286,1 kN·m (within 0,2 %).
   * The checker this replaces stopped at F.2/F.3 for this beam («F.4/F.5 no se evalúan») and, with
   * the fabrication it was never given (read as rolled), returned φMn = 315,5 kN·m: 10,4 % above.
   */
  const v2 = (over: Partial<SteelDesignParams> = {}): SteelDesignParams => ({
    Fy, Fu: 370, E, A: 62.31e-4, Iz: 45_129e-8, Iy: 1059.2e-8, h: 0.65 + 2 * 0.00794, b: 0.2, tw: 0.0047, tf: 0.00794,
    Zx: 1541.2e-6, Sx: 1355.5e-6, J: 26.77e-8, L: 10, Lb: 2, shape: 'I', builtUp: true, ...over,
  });

  it('INTI V2, welded: Rpc, rt, Lp, Lr and flange local buckling', () => {
    const r = checkSteelFlexure(v2(), 280.8, 'strong');
    const hw = 650, tw = 4.7, bf = 200, tf = 7.94, d = 650 + 2 * tf, ho = d - tf, Sx = 1355.5e3;
    const Myc = Fy * Sx, Mp = Fy * 1541.2e3;
    const lpw = 3.76 * Math.sqrt(E / Fy), lrw = 5.7 * Math.sqrt(E / Fy);
    const Rpc = Mp / Myc - (Mp / Myc - 1) * ((hw / tw - lpw) / (lrw - lpw));
    const aw = (hw * tw) / (bf * tf);
    const rt = bf / Math.sqrt(12 * (ho / d + (aw * hw * hw) / (6 * ho * d)));
    const Lp = 1.1 * rt * Math.sqrt(E / Fy);
    const jt = 26.77e4 / (Sx * ho);
    const Lr = 1.95 * rt * (E / 121) * Math.sqrt(jt + Math.sqrt(jt * jt + 6.76 * (121 / E) ** 2));
    const lam = bf / 2 / tf, lpf = 0.38 * Math.sqrt(E / Fy), lrf = 0.95 * Math.sqrt((0.35 * E) / 121);
    const flb = Rpc * Myc - (Rpc * Myc - 121 * Sx) * ((lam - lpf) / (lrf - lpf));
    expect(r.clause).toBe('F.4');
    expect(r.Lp * 1000).toBeCloseTo(Lp, 6);
    expect(r.Lr * 1000).toBeCloseTo(Lr, 6);
    expect(r.Mn).toBeCloseTo(flb / 1e6, 6);
    expect(r.Mn).toBeCloseTo(317.54, 1);
    // INTI's printed values, at their rounding.
    expect(Math.abs(r.Mp - 362.2) / 362.2).toBeLessThan(0.005);
    expect(Math.abs(r.Lp * 100 - 162.4) / 162.4).toBeLessThan(0.005);
    expect(Math.abs(r.Lr * 100 - 711.2) / 711.2).toBeLessThan(0.005);
    expect(Math.abs(r.phiMn - 286.1) / 286.1).toBeLessThan(0.005);
    expect(r.notEvaluated).toBeUndefined();
  });

  it('a channel with a noncompact web takes F.4 with rt of F.4.11, and needs Cw for it', () => {
    // Plate channel 400 × 100 × 3 × 14: h/tw = 372/3 = 124 between λpw = 109,7 and λrw = 166,3, flange
    // b/tf = 7,1 compact. The inertias are illustrative: what is checked is the clause it takes.
    const p: SteelDesignParams = {
      Fy, Fu: 360, E, A: (2 * 100 * 14 + 372 * 3) * 1e-6, Iz: 2.2e-4, Iy: 2.6e-6, h: 0.4, b: 0.1, tw: 0.003, tf: 0.014,
      L: 4, Lb: 3, J: 2e-7, Cw: 9e-8, shape: 'U', builtUp: false,
    };
    const r = checkSteelFlexure(p, 50, 'strong');
    expect(r.clause).toBe('F.4');
    expect(r.steps.join('\n')).toContain('(F.4.11)');
    // Without Cw, rt of F.4.11 cannot be formed: the engine refuses F.4 by name, and the check is held.
    const noCw = checkSteelFlexure({ ...p, Cw: undefined }, 50, 'strong');
    expect(noCw.notEvaluatedMessage?.key).toBe('c301.refuse.f4NoCw');
    expect(noCw.status).toBe('held');
  });
});

describe('F.5 — doubly symmetric I with a slender web', () => {
  /*
   * INTI Ejemplo 14, beam V3 (as PR #295 quotes it): web 950 × 4,76, flanges 350 × 15,88 mm,
   * Sxc = 5974 cm³, Lb = 10 m, Cb = 1, welded. By hand:
   *   aw = 950·4,76/(350·15,88) = 0,8136; rt = 95,85 mm (F.4.10); Lp = 1,1·rt·√(E/Fy) = 3073 mm;
   *   Lr = π·rt·√(E/(Fy − Fr)) = 12 233 mm (F.5.5b).
   *   F.5.3 as printed: Fcr = 235 − (235 − 114)·(10 000 − 3073)/(12 233 − 3073) = 143,5 MPa.
   *   Rpg = 1 − 0,8136/(1200 + 244,1)·(199,6 − 5,70·√(E/143,5)) = 1,0074 → 1 (F.5.6, Fcrf = 143,5).
   *   Mn = Rpg·Fcr·Sxc = 857,3 kN·m (F.5.2), φMn = 771,5 kN·m.
   * INTI prints Lp 307,4 cm, Lr 1223,6 cm, Fcr 143,5 MPa, Mn 857,2 and Md 771,4 kN·m.
   */
  it('INTI V3, welded girder', () => {
    const p: SteelDesignParams = {
      Fy, Fu: 370, E, A: 156.38e-4, Iz: 293_292e-8, Iy: 1e-5, h: 0.95 + 2 * 0.01588, b: 0.35, tw: 0.00476, tf: 0.01588,
      Sx: 5974e-6, L: 25, Lb: 10, shape: 'I', builtUp: true,
    };
    const r = checkSteelFlexure(p, 740, 'strong');
    const bf = 350, tf = 15.88, hw = 950, tw = 4.76, d = hw + 2 * tf, ho = d - tf;
    const aw = (hw * tw) / (bf * tf);
    const rt = bf / Math.sqrt(12 * (ho / d + (aw * hw * hw) / (6 * ho * d)));
    const Lp = 1.1 * rt * Math.sqrt(E / Fy), Lr = Math.PI * rt * Math.sqrt(E / 121);
    const Fcr = 235 - 121 * ((10_000 - Lp) / (Lr - Lp));
    expect(r.clause).toBe('F.5');
    expect(r.Lp * 1000).toBeCloseTo(Lp, 6);
    expect(r.Lr * 1000).toBeCloseTo(Lr, 6);
    expect(r.Mn).toBeCloseTo((Fcr * 5974e3) / 1e6, 6);
    expect(Math.abs(r.phiMn - 771.4) / 771.4).toBeLessThan(0.005);
  });
});

describe('what chapter F does not cover is not evaluated, never passed', () => {
  it('a channel with a slender web: held at any demand, without a ratio claim', () => {
    const p: SteelDesignParams = {
      Fy, Fu: 360, E, A: (2 * 80 * 10 + 580 * 3) * 1e-6, Iz: 1.5e-4, Iy: 1.5e-6, h: 0.6, b: 0.08, tw: 0.003, tf: 0.01,
      L: 4, Lb: 1, J: 1e-7, Cw: 1e-7, shape: 'U', builtUp: false,
    };
    const f = checkSteelFlexure(p, 1, 'strong');
    expect(f.notEvaluatedMessage?.key).toBe('c301.refuse.f5Channel');
    expect(f.clauseRef).toBe('F.5');
    for (const Muz of [1, 10_000]) {
      const v = verifySteelElement({ elementId: 1, Nu: 0, Muz, Muy: 0, Vu: 0, params: p });
      expect(v.overallStatus).toBe('held');
      // No ratio claim: the engine computed no capacity, and the member's ratio leaves the check out.
      expect(v.flexureZ.status).toBe('held');
      expect(Number.isFinite(steelRatio(v))).toBe(true);
    }
  });

  it('a tube or an unknown shape in flexure is held; without moment it is not', () => {
    const rhs: SteelDesignParams = { Fy, Fu: 360, E, A: 1764e-6, Iz: 9.0e-6, Iy: 3.1e-6, h: 0.2, b: 0.1, tw: 0.003, tf: 0.003, L: 3, Lb: 3, shape: 'RHS' };
    expect(verifySteelElement({ elementId: 1, Nu: 0, Muz: 5, Muy: 0, Vu: 1, params: rhs }).overallStatus).toBe('held');
    // In tension with every element connected (D.3(1)): nothing is left out. Without a connection
    // rupture is not evaluated (main, #295), which is what the tension-connection tests pin.
    expect(verifySteelElement({ elementId: 1, Nu: -50, Muz: 0, Muy: 0, Vu: 0, params: { ...rhs, tensionConnection: { allElementsConnected: true } } }).overallStatus).toBe('ok');
    const unknown = { ...rhs, shape: undefined };
    const v = verifySteelElement({ elementId: 1, Nu: 0, Muz: 5, Muy: 0, Vu: 1, params: unknown });
    expect(v.overallStatus).toBe('held');
    // An undeclared shape is not read as an I: the engine refuses it by name.
    expect(v.notEvaluated?.map((n) => [n.clause, n.key])).toEqual([['F', 'c301.refuse.unknownShape']]);
  });

  it('LTB beyond Lp without Cw: the warping term taken as 0, a lower bound; a demand above Mp fails', () => {
    /*
     * Changed with the engine: without Cw it reads F.2.4a and F.2.6a with X2 = 0, the warping term
     * dropped, which only lowers Mcr and Lr: a lower bound of the capacity, so the check is evaluated
     * on the safe side rather than held (the TypeScript checker held it). F.4.11 for a channel,
     * which needs Cw for rt, is still refused (see F.4 above).
     */
    const p = plateI(400, 200, 8, 12, { Lb: 6, Cw: undefined, builtUp: false });
    const low = verifySteelElement({ elementId: 1, Nu: 0, Muz: 10, Muy: 0, Vu: 0, params: p });
    expect(low.overallStatus).toBe('ok');
    // The same beam with its Cw has at least that capacity.
    expect(low.flexureZ.Mn).toBeLessThanOrEqual(checkSteelFlexure({ ...p, Cw: plateI(400, 200, 8, 12).Cw }, 10, 'strong').Mn);
    // φMp = 256,8 kN·m: 400 kN·m exceeds every Mn the clause could give.
    expect(verifySteelElement({ elementId: 1, Nu: 0, Muz: 400, Muy: 0, Vu: 0, params: p }).overallStatus).toBe('fail');
  });
});
