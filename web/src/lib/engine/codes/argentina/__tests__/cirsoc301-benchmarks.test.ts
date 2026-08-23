/**
 * The first tests the CIRSOC 301 checker has ever had.
 *
 * ── What this does and does not change ─────────────────────────────
 *
 * `cirsoc301-capabilities.ts` declares every facet of every metallic capability `false`, and one of
 * its four stated reasons is that this module has **zero tests**. This file removes that reason and
 * **nothing else.** It does not promote a capability, does not touch the gate, and does not make
 * anything VERIFIED — the remaining blockers (no `ClauseRef` map, `Lb = L`, and a human signature)
 * are untouched, and are the ones that matter.
 *
 * ── Why the expected values are computed here, not tabulated ───────
 *
 * A table of numbers copied from somewhere pins four sections and explains nothing. Each case below
 * names the AISC 360 LRFD expression it holds the checker to and evaluates it inline from the same
 * inputs, so a wrong φ or a lost factor of 1000 shows up as a mismatch instead of as a plausible
 * number.
 *
 * The section is an IPE 200 with its catalogue properties, because a real section puts the
 * slenderness regimes where they fall for real members.
 */

import { describe, it, expect } from 'vitest';
import {
  checkSteelTension, checkSteelCompression, checkSteelFlexure, checkSteelShear,
  checkSteelInteraction, verifySteelElement, type SteelDesignParams,
} from '../cirsoc301';

/**
 * IPE 200 in the units `SteelDesignParams` wants (m, m², m⁴) and in the CHECKER's axis naming:
 * `Iz` is its strong axis and `Iy` the weak one — the opposite of this app's own convention.
 * Catalogue values: A = 28.5 cm², strong I = 1943 cm⁴, weak I = 142 cm⁴.
 */
const IPE200 = (over: Partial<SteelDesignParams> = {}): SteelDesignParams => ({
  Fy: 235, Fu: 360, E: 200_000,
  A: 28.5e-4,
  Iz: 1943e-8,   // strong
  Iy: 142e-8,    // weak
  h: 0.200, b: 0.100, tw: 0.0056, tf: 0.0085,
  L: 4, Lb: 4,
  J: 0,
  ...over,
});

describe('§D — tension', () => {
  it('yields on the gross section at φ = 0.90', () => {
    const p = IPE200();
    const expected = 0.9 * (p.Fy * p.A * 1e6) / 1000;   // kN
    expect(expected).toBeCloseTo(602.775, 3);
    expect(checkSteelTension(p, 100).phiPn).toBeCloseTo(expected, 6);
  });

  it('and takes the lower of yielding and rupture', () => {
    /*
     * D2 is the lesser of φ=0.90·Fy·Ag and φ=0.75·Fu·Ae. This checker takes Ae = Ag — no hole
     * deduction, itself worth knowing — so rupture governs when Fu/Fy < 1.2.
     */
    const yieldGoverns = checkSteelTension(IPE200({ Fu: 500 }), 100);
    const ruptureGoverns = checkSteelTension(IPE200({ Fu: 250 }), 100);
    expect(yieldGoverns.phiPn).toBeCloseTo(602.775, 3);
    expect(ruptureGoverns.phiPn).toBeCloseTo(0.75 * (250 * 28.5e-4 * 1e6) / 1000, 6);
    expect(ruptureGoverns.phiPn).toBeLessThan(yieldGoverns.phiPn);
  });

  it('reports the ratio against the demand, and fails past it', () => {
    const ok = checkSteelTension(IPE200(), 300);
    expect(ok.ratio).toBeCloseTo(300 / ok.phiPn, 9);
    expect(ok.status).toBe('ok');
    const over = checkSteelTension(IPE200(), 900);
    expect(over.ratio).toBeGreaterThan(1);
    expect(over.status).toBe('fail');
  });
});

describe('§E — compression', () => {
  it('governs on the LARGER slenderness, whichever axis that is', () => {
    /*
     * The property that makes the axis naming harmless HERE: `KL/r` is the maximum of the two, and
     * a maximum is symmetric — swapping `Iz` and `Iy` cannot change the capacity, only the label in
     * the narrative. Pinned because it is why the axis-swap defect fixed in
     * `verification-service.ts` surfaced in flexure and not here.
     */
    const straight = checkSteelCompression(IPE200(), 100);
    const swapped = checkSteelCompression(IPE200({ Iz: 142e-8, Iy: 1943e-8 }), 100);
    expect(swapped.phiPn).toBeCloseTo(straight.phiPn, 9);
    expect(swapped.KLr).toBeCloseTo(straight.KLr, 9);
  });

  it('computes Euler’s stress from the governing slenderness', () => {
    // Fe = π²E/(KL/r)² (E3-4), with ry = √(Iy/A) governing at K = 1.
    const p = IPE200();
    const KLr = 4 / Math.sqrt(p.Iy / p.A);
    const r = checkSteelCompression(p, 100);
    expect(r.KLr).toBeCloseTo(KLr, 6);
    expect(r.Fe).toBeCloseTo((Math.PI ** 2 * p.E) / KLr ** 2, 6);
  });

  it('picks the inelastic branch below 4.71·√(E/Fy) and the elastic one above', () => {
    // E3: Fcr = 0.658^(Fy/Fe)·Fy up to the limit, 0.877·Fe past it. Both exercised.
    const limit = 4.71 * Math.sqrt(200_000 / 235);
    const slender = checkSteelCompression(IPE200({ L: 4 }), 100);
    const stocky = checkSteelCompression(IPE200({ L: 1 }), 100);
    expect(slender.KLr).toBeGreaterThan(limit);
    expect(slender.Fcr).toBeCloseTo(0.877 * slender.Fe, 6);
    expect(stocky.KLr).toBeLessThan(limit);
    expect(stocky.Fcr).toBeCloseTo(0.658 ** (235 / stocky.Fe) * 235, 6);
  });

  it('and capacity falls as the member lengthens', () => {
    // Monotonic, which no single-point test would catch.
    const caps = [1, 2, 4, 8].map((L) => checkSteelCompression(IPE200({ L }), 100).phiPn);
    for (let i = 1; i < caps.length; i++) expect(caps[i]).toBeLessThan(caps[i - 1]);
  });
});

describe('§F — flexure, and the axis it takes the weak inertia from', () => {
  it('reaches the plastic moment inside the Lp plateau', () => {
    // Lp = 1.76·ry·√(E/Fy) (F2-5); inside it Mn = Mp.
    const r = checkSteelFlexure(IPE200({ Lb: 0.5 }), 10, 'strong');
    expect(r.phiMn).toBeCloseTo(0.9 * r.Mp, 9);
  });

  it('reduces the capacity once Lb passes Lp', () => {
    const short = checkSteelFlexure(IPE200({ Lb: 0.5 }), 10, 'strong');
    const long = checkSteelFlexure(IPE200({ Lb: 8 }), 10, 'strong');
    expect(long.phiMn).toBeLessThan(short.phiMn);
  });

  it('takes `Iy` as the WEAK axis — which is what made the swap consequential', () => {
    /*
     * The regression that pins the defect fixed in `verification-service.ts`.
     *
     * `Lp` comes from `ry = √(Iy/A)`, so feeding the STRONG inertia as `Iy` inflates `ry` by
     * √(1943/142) ≈ 3.7 and `Lp` with it. A beam that genuinely needs a lateral-torsional
     * reduction is then judged to be inside the plateau — unconservative, and invisible.
     */
    const correct = checkSteelFlexure(IPE200({ Lb: 4 }), 10, 'strong');
    const swapped = checkSteelFlexure(IPE200({ Lb: 4, Iy: 1943e-8, Iz: 142e-8 }), 10, 'strong');
    /*
     * Measured on `Lp`, not on `phiMn`, and the reason is worth keeping: this assertion used to
     * compare capacities, and implementing the F.2.1 cap broke it — swapping the inertias also
     * shrinks `Sx = Iz/(h/2)`, so the cap clamps the swapped case and the capacity comparison
     * inverted. The capacity was a confounded observable all along; `Lp` is the mechanism.
     *
     * `Lp = 1,76·ry·√(E/Fy)` with `ry = √(Iy/A)`, so feeding the strong inertia scales `ry` — and
     * `Lp` with it — by √(1943/142) ≈ 3,70.
     */
    expect(swapped.Lp / correct.Lp).toBeCloseTo(Math.sqrt(1943 / 142), 6);
    // And the consequence: a beam outside the plateau is judged inside it.
    expect(correct.Lp).toBeLessThan(4);
    expect(swapped.Lp).toBeGreaterThan(4);
  });

  it('applies no lateral-torsional reduction about the weak axis', () => {
    // Correct: there is no LTB in minor-axis bending, so Lb must not matter.
    const a = checkSteelFlexure(IPE200({ Lb: 0.5 }), 5, 'weak');
    const b = checkSteelFlexure(IPE200({ Lb: 12 }), 5, 'weak');
    expect(a.phiMn).toBeCloseTo(b.phiMn, 9);
    expect(a.phiMn).toBeCloseTo(0.9 * a.Mp, 9);
  });
});

describe('F.2.1 and F.6.1 — the 1,5·My cap, now applied', () => {
  /*
   * ── Read out of the shipped text, not from AISC ──────────────────
   *
   * F.2.1:  Mn = Mp = Fy Zx(10-3) ≤ 1,5 My,  «My el momento elástico … (= Fy Sx (10-3) para
   *         secciones homogéneas)»
   * F.6.1:  Mn = Mp = Fy Zy (10)-3 ≤ 1,5 Fy Sy (10)-3
   *
   * Both caps were missing and neither needed a new input: `Sx` was already computed for `Lr`, and
   * `Sy` is `Iy/(b/2)`, the mirror of `computeSx`. A missing upper bound is unconservative, which
   * is why these are assertions and not a note.
   */

  it('does not bind on a rolled I-section, where Zx/Sx is about 1,1–1,2', () => {
    // The common case: the cap must not silently reduce a normal beam.
    const p = IPE200({ Lb: 0.3 });
    const r = checkSteelFlexure(p, 10, 'strong');
    const Zx = 220.6e-6;   // m³ — the catalogue plastic modulus of an IPE 200
    void Zx;
    const Sx = p.Iz / (p.h / 2);
    const My = p.Fy * Sx * 1e9 / 1e6;
    expect(r.Mp).toBeLessThanOrEqual(1.5 * My + 1e-9);
    // And it is the plastic moment that governs, not the cap.
    expect(r.Mp).toBeGreaterThan(My);
  });

  it('BINDS on a shape whose plastic-to-elastic ratio exceeds 1,5', () => {
    /*
     * A solid rectangle has Zx/Sx = 1,5 exactly, so it sits on the boundary. To land ABOVE it the
     * geometry has to be pushed past what a rolled section reaches — a very thick web with thin
     * flanges — which is exactly the regime the cap exists for.
     *
     * Verified by construction rather than asserted: the test computes both quantities from the
     * same params the checker is given and requires the reported `Mp` to equal the cap.
     */
    const p = IPE200({ h: 0.2, b: 0.02, tf: 0.002, tw: 0.06, Lb: 0.2 });
    const Zx = p.b * p.tf * (p.h - p.tf) + p.tw * (p.h - 2 * p.tf) ** 2 / 4;
    const Sx = p.Iz / (p.h / 2);
    const ratio = Zx / Sx;
    const r = checkSteelFlexure(p, 1, 'strong');
    if (ratio > 1.5) {
      const My = p.Fy * Sx * 1e9 / 1e6;
      expect(r.Mp).toBeCloseTo(1.5 * My, 6);
      expect(r.Mp).toBeLessThan(p.Fy * Zx * 1e9 / 1e6);
    } else {
      // If the chosen geometry does not exceed 1,5, the cap must NOT have reduced anything — the
      // assertion still means something rather than being skipped.
      expect(r.Mp).toBeCloseTo(p.Fy * Zx * 1e9 / 1e6, 6);
    }
  });

  it('and reports which branch governed, in words', () => {
    // The steps are the audit trail. «Mp = Fy·Zx» and «Mp = 1,5·My» are different findings and the
    // narrative has to say which one the number came from.
    const r = checkSteelFlexure(IPE200({ Lb: 0.3 }), 10, 'strong');
    const joined = r.steps.join(' ');
    expect(joined).toContain('F.2.1');
    expect(joined).toMatch(/Zx\/Sx/);
  });

  it('caps the weak axis too, per F.6.1', () => {
    /*
     * The same 1,5 bound, written in F.6.1 as `1,5 Fy Sy`. It could not be applied before because
     * `Sy` did not exist; `computeSy` is `Iy/(b/2)`, the mirror of `computeSx`.
     */
    const p = IPE200();
    const r = checkSteelFlexure(p, 5, 'weak');
    const Sy = p.Iy / (p.b / 2);
    const cap = 1.5 * p.Fy * Sy * 1e9 / 1e6;
    expect(r.Mp).toBeLessThanOrEqual(cap + 1e-9);
  });

  it('and says that F.6.2 — flange local buckling — is not implemented', () => {
    /*
     * Correct: there is no lateral-torsional buckling about the minor axis. But F.6.2 DOES define a
     * flange-local-buckling limit state for that case, and it is not implemented — declared in the
     * steps rather than left as an absence a reader would have to notice.
     */
    const r = checkSteelFlexure(IPE200(), 5, 'weak');
    expect(r.steps.join(' ')).toContain('F.6.2');
  });
});

describe('§G — shear', () => {
  it('takes the web area as d·tw, not the gross area', () => {
    const p = IPE200();
    const r = checkSteelShear(p, 10);
    const Aw = p.h * 1000 * p.tw * 1000;
    expect(r.phiVn).toBeCloseTo(0.9 * 0.6 * p.Fy * Aw * r.Cv / 1000, 4);
    expect(Aw).toBeLessThan(p.A * 1e6);
  });

  it('gives Cv = 1 for a compact web and less for a slender one', () => {
    // h/tw ≈ 33 on an IPE 200, well under 2.24·√(E/Fy) ≈ 65.
    const compact = checkSteelShear(IPE200(), 10);
    const slender = checkSteelShear(IPE200({ h: 1.2, tw: 0.003 }), 10);
    expect(compact.Cv).toBeCloseTo(1, 9);
    expect(slender.Cv).toBeLessThan(compact.Cv);
  });
});

describe('§H — interaction', () => {
  it('grows with the axial demand, across the H1-1a/H1-1b boundary', () => {
    /*
     * H1-1a: Pr/Pc + 8/9·(Mrx/Mcx + Mry/Mcy) when Pr/Pc ≥ 0.2
     * H1-1b: Pr/(2Pc) + (Mrx/Mcx + Mry/Mcy) otherwise
     * A wrong branch condition shows up as a step rather than a rise.
     */
    const high = checkSteelInteraction(IPE200(), 400, 20, 5);
    const low = checkSteelInteraction(IPE200(), 20, 20, 5);
    expect(low.ratio).toBeGreaterThan(0);
    expect(high.ratio).toBeGreaterThan(low.ratio);
  });

  it('grows with every demand component', () => {
    const base = checkSteelInteraction(IPE200(), 100, 10, 2).ratio;
    expect(checkSteelInteraction(IPE200(), 200, 10, 2).ratio).toBeGreaterThan(base);
    expect(checkSteelInteraction(IPE200(), 100, 30, 2).ratio).toBeGreaterThan(base);
    expect(checkSteelInteraction(IPE200(), 100, 10, 8).ratio).toBeGreaterThan(base);
  });
});

describe('the whole element, and what it still must not claim', () => {
  it('returns every limit state it ran', () => {
    const v = verifySteelElement({
      elementId: 7, Nu: -200, Muy: 5, Muz: 30, Vu: 40, params: IPE200(),
    });
    expect(v.elementId).toBe(7);
    expect(v.flexureZ).toBeDefined();
    expect(v.shear).toBeDefined();
    expect(v.steps.length).toBeGreaterThan(0);
  });

  it('and its status is one of three words, none of them “verified”', () => {
    /*
     * The boundary this file must not cross. Producing numbers is not verification: the capability
     * matrix gates every metallic facet and `steelCountsAsVerified()` returns the literal `false`.
     * These tests remove ONE of the four stated reasons for that gate and leave the others standing.
     */
    const v = verifySteelElement({
      elementId: 1, Nu: -100, Muy: 2, Muz: 10, Vu: 20, params: IPE200(),
    });
    expect(['ok', 'warn', 'fail']).toContain(v.overallStatus);
  });

  it('is deterministic — same inputs, same numbers', () => {
    // A benchmark is worthless if the thing under test drifts between calls.
    const run = () => verifySteelElement({
      elementId: 1, Nu: -150, Muy: 3, Muz: 18, Vu: 25, params: IPE200(),
    });
    const a = run(), b = run();
    expect(a.flexureZ.phiMn).toBe(b.flexureZ.phiMn);
    expect(a.shear.phiVn).toBe(b.shear.phiVn);
    expect(a.overallStatus).toBe(b.overallStatus);
  });
});
