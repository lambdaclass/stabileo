/**
 * CIRSOC 301-2018 E.7 for every shape the checker classifies, E.4 where it is not carried, and the
 * member checked as rolled and as welded when the section does not declare which.
 *
 * Expected values by hand from E.7.4–E.7.19 (`capitulo-e-…md`), Fy = 235, E = 200 000 MPa,
 * √(E/Fy) = 29,173.
 */
import { describe, it, expect } from 'vitest';
import { checkSteelCompression, verifySteelElement, type SteelDesignParams } from '../cirsoc301';
import { checkSteelMember } from '../../../verification-service';

const E = 200_000, Fy = 235;
const base = (p: Partial<SteelDesignParams>): SteelDesignParams => ({
  Fy, Fu: 360, E, A: 0, Iz: 0, Iy: 0, h: 0, b: 0, tw: 0, tf: 0, L: 1, Lb: 1, ...p,
});

describe('E.7 — Q for each shape', () => {
  it('RHS 200 × 100 × 3, case 6: E.7.18 with f = Fy on the deep walls', () => {
    // Flats 191 and 91 mm (b − 3t): 191/3 = 63,7 > 1,40·√(E/Fy) = 40,8, 91/3 = 30,3 below it.
    // be = 1,91·3·29,173·(1 − 0,38/63,67·29,173) = 138,05 mm; Ag = 1764 mm² (sharp corners);
    // Qa = (1764 − 2·(191 − 138,05)·3)/1764 = 0,8199 (E.7.16).
    const r = checkSteelCompression(base({ A: 1764e-6, Iz: 9.0e-6, Iy: 3.1e-6, h: 0.2, b: 0.1, tw: 0.003, tf: 0.003, shape: 'RHS' }), 50);
    expect(r.Q).toBeCloseTo(0.8199, 4);
    expect(r.clauseRef).toBe('E.7');
    expect(r.notEvaluatedMessage).toBeUndefined();
  });

  it('CHS, case 10: Q = 0,038·E/(Fy·D/t) + 2/3 (E.7.19); beyond 0,45·E/Fy not evaluated', () => {
    // D/t = 500/4 = 125, between 0,11·E/Fy = 93,6 and 0,45·E/Fy = 383,0: Q = 0,9254.
    const tube = (t: number) => base({ A: Math.PI * (0.5 - t) * t, Iz: 1e-4, Iy: 1e-4, h: 0.5, b: 0.5, tw: t, tf: t, shape: 'CHS' });
    expect(checkSteelCompression(tube(0.004), 50).Q).toBeCloseTo(0.92539, 4);
    // Beyond 0,45·E/Fy E.7.2(c) does not cover the tube: the engine refuses it by name, the check is held.
    const thin = checkSteelCompression(tube(0.0012), 50);
    expect(thin.notEvaluatedMessage?.key).toBe('c301.refuse.chsTooSlender');
    expect(thin.status).toBe('held');
  });

  it('tee 200 × 150, tf 12, tw 6: the stem, case 4, E.7.15', () => {
    // d/t = 33,3 > 1,03·√(E/Fy) = 30,05: Qs = 0,69·E/(Fy·(d/t)²) = 0,5285. Flange b/2tf = 6,25: Qs = 1.
    /*
     * The engine carries E.4 for a tee (E.4.10 with the shear-centre offset), and refuses it
     * without J, so J is given here: J = (bf·tf³ + d·tw³)/3. The TypeScript checker left E.4 out
     * for tees and reported Q with the member held; the engine evaluates both.
     */
    const J = (150 * 12 ** 3 + 200 * 6 ** 3) / 3 * 1e-12;
    const r = checkSteelCompression(base({ A: 3.0e-3, Iz: 1e-5, Iy: 3.4e-6, h: 0.2, b: 0.15, tw: 0.006, tf: 0.012, J, shape: 'T', builtUp: false }), 50);
    expect(r.Q).toBeCloseTo(0.52851, 4);
    expect(r.notEvaluatedMessage).toBeUndefined();
    // Without J, E.4 cannot be formed: refused by name, held.
    const noJ = checkSteelCompression(base({ A: 3.0e-3, Iz: 1e-5, Iy: 3.4e-6, h: 0.2, b: 0.15, tw: 0.006, tf: 0.012, shape: 'T', builtUp: false }), 50);
    expect([noJ.status, noJ.notEvaluatedMessage?.key]).toEqual(['held', 'c301.refuse.e4NoJ']);
  });

  it('angle 100 × 100 × 6, case 3: E.7.11 on the longer leg', () => {
    // b/t = 16,67 between 0,45·√(E/Fy) = 13,13 and 0,91·√(E/Fy) = 26,55:
    // Qs = 1,34 − 0,76·16,67·√(Fy/E) = 0,9058.
    // An angle is checked by E.5 with its legs and how it is loaded (`angle`); concentrically loaded here.
    const r = checkSteelCompression(base({
      A: 11.6e-4, Iz: 1.1e-6, Iy: 1.1e-6, h: 0.1, b: 0.1, tw: 0.006, tf: 0.006, J: (2 * 100 * 6 ** 3) / 3 * 1e-12, shape: 'L',
      angle: { legLong: 0.1, legShort: 0.1, t: 0.006, endCondition: 'concentric' },
    }), 50);
    expect(r.Q).toBeCloseTo(0.90581, 4);
  });

  it('I 400 × 400 × 10 × 10: case 1 rolled (E.7.5), case 2 welded (E.7.8)', () => {
    // b/t = 20, web 380/10 = 38 ≤ 1,49·√(E/Fy) = 43,5 (not slender). Rolled: 1,415 − 0,74·20·√(Fy/E)
    // = 0,9077. Welded: kc = 4/√38 = 0,6489, 0,64·√(kc·E/Fy) = 15,04 < 20 ≤ 1,17·√(kc·E/Fy) = 27,5:
    // 1,415 − 0,65·20·√(Fy/(kc·E)) = 0,8618.
    const p = (welded: boolean) => base({ A: 11.8e-3, Iz: 3.6e-4, Iy: 1.07e-4, h: 0.4, b: 0.4, tw: 0.01, tf: 0.01, shape: 'I', builtUp: welded });
    expect(checkSteelCompression(p(false), 50).Q).toBeCloseTo(0.90768, 4);
    expect(checkSteelCompression(p(true), 50).Q).toBeCloseTo(0.86181, 4);
  });

  it('a slender web takes f = Fcr at Q = 1 (E.7.2(a)), with 1,91 of E.7.17', () => {
    // I 600 × 200 × 4 × 16, short (L = 0,5 m): Fe large, Fcr(Q=1) ≈ Fy. hw/tw = 568/4 = 142 > 1,49·√(E/Fy).
    const p = base({ A: (2 * 200 * 16 + 568 * 4) * 1e-6, Iz: 6.5e-4, Iy: 2.1e-5, h: 0.6, b: 0.2, tw: 0.004, tf: 0.016, L: 0.5, shape: 'I', builtUp: true });
    const r = checkSteelCompression(p, 50);
    const Ag = 2 * 200 * 16 + 568 * 4, ry = Math.sqrt(2.1e-5 / (Ag * 1e-6)), Fe = Math.PI ** 2 * E / (0.5 / ry) ** 2;
    const f = 0.658 ** (Fy / Fe) * Fy, s = Math.sqrt(E / f);
    const be = 1.91 * 4 * s * (1 - (0.34 / 142) * s);
    expect(r.Q).toBeCloseTo((Ag - (568 - be) * 4) / Ag, 6);
  });

  it('an unknown shape is not evaluated in compression, and a member left with it is held', () => {
    const p = base({ A: 28.5e-4, Iz: 1943e-8, Iy: 142e-8, h: 0.2, b: 0.1, tw: 0.0056, tf: 0.0085, L: 2 });
    // The engine refuses the shape by name; a member without a shape is not taken as an I.
    const r = checkSteelCompression({ ...p, shape: 'undeclared' }, 100);
    expect([r.status, r.notEvaluatedMessage?.key]).toEqual(['held', 'c301.refuse.unknownShape']);
    const v = verifySteelElement({ elementId: 1, Nu: 100, Muz: 0, Muy: 0, Vu: 0, params: p });
    expect(v.overallStatus).toBe('held');
    /*
     * Changed with the engine: it refuses the check whole and reports no capacity, so even far
     * beyond any flexural strength nothing is proven and the member stays held (the TypeScript
     * checker reported its flexural buckling as an upper bound and failed it).
     */
    expect(verifySteelElement({ elementId: 1, Nu: 5000, Muz: 0, Muy: 0, Vu: 0, params: p }).overallStatus).toBe('held');
  });

  it('a channel in compression without J: E.4 not evaluated, so held; with J, evaluated; in tension, connected, nothing is left out', () => {
    const upn = base({ A: 32.2e-4, Iz: 1910e-8, Iy: 148e-8, h: 0.2, b: 0.075, tw: 0.0085, tf: 0.0115, L: 2, shape: 'U', builtUp: false });
    expect(verifySteelElement({ elementId: 1, Nu: 50, Muz: 0, Muy: 0, Vu: 0, params: upn }).overallStatus).toBe('held');
    // The engine carries E.4 for a channel (E.4.11): with J (UPN 200: 11,9 cm⁴) and Cw it is evaluated.
    expect(verifySteelElement({ elementId: 1, Nu: 50, Muz: 0, Muy: 0, Vu: 0, params: { ...upn, J: 11.9e-8, Cw: 9.07e-9 } }).overallStatus).toBe('ok');
    expect(verifySteelElement({ elementId: 1, Nu: -50, Muz: 0, Muy: 0, Vu: 0, params: { ...upn, tensionConnection: { allElementsConnected: true } } }).overallStatus).toBe('ok');
  });
});

describe('rolled or welded: evaluated at both when the section does not declare it', () => {
  // The welded-plate I 400 × 200 × 8 × 12 of `cirsoc301-chapter-f.test.ts`, Lb = 5 m:
  // φMn = 0,9·222,853 = 200,57 kN·m rolled, 0,9·218,390 = 196,55 kN·m welded.
  const hw = 376, A = 2 * 200 * 12 + hw * 8, Ix = (200 * 400 ** 3 - 192 * hw ** 3) / 12, Iy = (2 * 12 * 200 ** 3) / 12 + (hw * 8 ** 3) / 12;
  const p = (over: Partial<SteelDesignParams> = {}): SteelDesignParams => base({
    A: A * 1e-6, Iz: Ix * 1e-12, Iy: Iy * 1e-12, h: 0.4, b: 0.2, tw: 0.008, tf: 0.012, G: E / 2.6,
    Zx: (200 * 12 * 388 + (8 * hw ** 2) / 4) * 1e-9, Sx: (Ix / 200) * 1e-9, J: ((2 * 200 * 12 ** 3 + hw * 8 ** 3) / 3) * 1e-12,
    // The hand values are F.2.4a…F.2.6a, the load on the web (declared, so only the fabrication is read both ways).
    Cw: ((Iy * 388 ** 2) / 4) * 1e-18, L: 5, Lb: 5, shape: 'I', loadPosition: 'web', ...over,
  });
  const at = (Muz: number, over: Partial<SteelDesignParams> = {}) => verifySteelElement({ elementId: 1, Nu: 0, Muz, Muy: 0, Vu: 0, params: p(over) });

  it('the verdict differs between the two: held on the datum, with both ratios', () => {
    const v = at(198.5);
    expect(v.overallStatus).toBe('held');
    expect(v.fabrication).toMatchObject({ basis: 'undeclared', dependsOnIt: true, governs: 'welded' });
    if (v.fabrication?.basis !== 'undeclared') throw new Error('undeclared');
    expect(v.fabrication.rolled.ratio).toBeCloseTo(198.5 / 200.568, 4);
    expect(v.fabrication.welded.ratio).toBeCloseTo(198.5 / 196.551, 4);
    expect(v.fabrication.rolled.status).toBe('warn');
    expect(v.fabrication.welded.status).toBe('fail');
    expect(v.steps.join('\n')).toContain('depende de si el perfil es laminado o soldado');
  });

  it('declared, the same member has one verdict', () => {
    expect(at(198.5, { builtUp: false }).overallStatus).toBe('warn');
    expect(at(198.5, { builtUp: true }).overallStatus).toBe('fail');
    expect(at(198.5, { builtUp: true }).fabrication).toEqual({ basis: 'declared', welded: true });
  });

  it('the same verdict with both: that verdict, reported on the larger ratio', () => {
    const v = at(150);
    expect(v.overallStatus).toBe('ok');
    expect(v.fabrication).toMatchObject({ basis: 'undeclared', dependsOnIt: false });
    expect(v.flexureZ.ratio).toBeCloseTo(150 / 196.551, 4);
    expect(at(260).overallStatus).toBe('fail');
  });

  it('the member check reads the section\'s declaration and never the catalogue family', () => {
    const section = {
      a: A * 1e-6, iy: Ix * 1e-12, iz: Iy * 1e-12, h: 0.4, b: 0.2, tw: 0.008, tf: 0.012, shape: 'I', profileFamily: 'IPE',
    };
    const material = { fy: 235, fu: 360, e: 200_000 };
    const demand = { Nc: 0, Nt: 0, MuStrong: 198.5, MuWeak: 0, Vu: 0, diagram: [] };
    // The load on the web, declared, as in the hand values above (only the fabrication is read both ways).
    const lengths = { L: 5, Lb: 5, loadPosition: 'web' as const };
    // A catalogue family is not a declaration: still checked as both.
    const undeclared = checkSteelMember(1, demand as never, section as never, material, lengths)!;
    expect(undeclared.fabrication?.basis).toBe('undeclared');
    const rolled = checkSteelMember(1, demand as never, { ...section, fabrication: 'rolled' } as never, material, lengths)!;
    expect(rolled.fabrication).toEqual({ basis: 'declared', welded: false });
    const welded = checkSteelMember(1, demand as never, { ...section, fabrication: 'welded' } as never, material, lengths)!;
    expect(welded.fabrication).toEqual({ basis: 'declared', welded: true });
    expect(welded.flexureZ.phiMn).toBeLessThan(rolled.flexureZ.phiMn);
  });
});
