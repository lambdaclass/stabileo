/**
 * Checking a beam has to look at the steel the reader typed.
 *
 * ── What was happening ─────────────────────────────────────────────
 *
 * `solveFlex` branched on `mode` for the column cases and not for the beams.
 * FSR and FST fell through into the sizing code, which designs the section to
 * the moment and then reports the ratio between demand and the capacity it
 * had just built to match — necessarily 1.000, whatever `AstGiven` said.
 *
 * So on a 20 × 50, checking 2 cm² against 150 kN·m came back "verifica". The
 * number the reader entered was never read. Nothing in the panel gave it
 * away either, because a ratio of exactly 1.000 looks like a section sized
 * to its demand, which is what the other mode legitimately produces.
 *
 * ── The invariant that catches it ──────────────────────────────────
 *
 * The two modes are each other's check. Design an amount of steel for a
 * moment, feed that steel back as a check against the same moment, and the
 * ratio must be 1. Anything less coupled — asserting a particular capacity,
 * say — would have passed while the bug was live, because the bug produced
 * exactly the right number by the wrong route. What it could not survive is
 * the answer having to MOVE with the input.
 */

import { describe, it, expect } from 'vitest';
import { solveFlex, type FlexInput } from '../cirsoc-flex';

const BEAM = { fc: 25, fy: 420, b: 0.20, h: 0.50, dPrimeS: 0.03, dPrime: 0.03 };

const design = (Mu: number, kase = 'FSR', extra: Record<string, unknown> = {}) =>
  solveFlex({ mode: 'design', kase, ...BEAM, ...extra, Pu: 0, Mu } as unknown as FlexInput);

const verify = (Mu: number, AstGiven: number, kase = 'FSR', extra: Record<string, unknown> = {}) =>
  solveFlex({
    mode: 'verify', kase, ...BEAM, ...extra, Pu: 0, Mu, AstGiven,
  } as unknown as FlexInput);

describe('the answer moves with the steel', () => {
  it('more steel carries more moment', () => {
    /*
     * The bug in one assertion: this was flat. Stopping below the
     * over-reinforced range, where adding steel genuinely buys less because
     * φ falls faster than the lever arm holds.
     */
    let previous = 0;
    for (const As of [2, 4, 6, 8, 10, 12, 14, 16]) {
      const r = verify(150, As);
      expect(r.phiMn!, `As = ${As}`).toBeGreaterThan(previous);
      previous = r.phiMn!;
    }
  });

  it('too little steel does not verify, and says so', () => {
    const r = verify(150, 2);
    expect(r.ok).toBe(false);
    expect(r.ratio).toBeGreaterThan(1);
    expect(r.steps.map((s) => s.key)).toContain('flex.step.fails');
  });

  it('enough steel verifies', () => {
    const r = verify(150, 14);
    expect(r.ok).toBe(true);
    expect(r.ratio).toBeLessThan(1);
  });
});

describe('the two modes are each other’s check', () => {
  for (const Mu of [80, 150, 250, 350, 500]) {
    it(`Mu = ${Mu} kN·m: what design produces, verify confirms at exactly 1`, () => {
      const d = design(Mu);
      if (!d.ok) return;
      /*
       * Design reports tension and compression steel separately; the check
       * takes tension alone, so this pairing only holds where the section
       * is singly reinforced. Above that the design has a second layer of
       * steel the check is not being told about, and the comparison would
       * be between two different sections.
       */
      if ((d.AsPrimeCm2 ?? 0) > 0) return;
      const v = verify(Mu, d.AsCm2!);
      expect(v.ratio, `design said ${d.AsCm2!.toFixed(3)} cm²`).toBeCloseTo(1, 2);
      expect(v.ok).toBe(true);
    });
  }

  it('and one bar less does not', () => {
    /*
     * The other side of the same coin. If design is right at the boundary,
     * a section just under it must fail — otherwise the boundary is not
     * where the tool says it is.
     */
    const d = design(150);
    const v = verify(150, d.AsCm2! * 0.9);
    expect(v.ok).toBe(false);
  });

  it('holds for a T as well as a rectangle', () => {
    const tee = { bf: 1.37, hf: 0.10, bw: 0.12, b: 1.37, h: 0.40, dPrimeS: 0.032, dPrime: 0.032 };
    const d = solveFlex({
      mode: 'design', kase: 'FST', fc: 25, fy: 420, ...tee, Pu: 0, Mu: 52,
    } as unknown as FlexInput);
    const v = solveFlex({
      mode: 'verify', kase: 'FST', fc: 25, fy: 420, ...tee, Pu: 0, Mu: 52,
      AstGiven: d.AsCm2!,
    } as unknown as FlexInput);
    expect(v.ratio).toBeCloseTo(1, 2);
  });
});

describe('checking respects the same geometry as sizing', () => {
  it('steel that must stack loses depth here too', () => {
    /*
     * 40 cm² does not fit across a 20 cm web whether the reader chose it or
     * the sizing did. If `verify` assumed one layer it would report a
     * capacity the section does not have — the optimistic direction.
     */
    const v = verify(300, 40);
    expect(v.barChoice!.layers!).toBeGreaterThan(1);
    const dEff = BEAM.h - v.barChoice!.centroidFromFaceM!;
    expect(v.cMax!).toBeCloseTo((dEff * 0.003) / 0.008, 3);
  });

  it('flags steel below the §9.6.1.2 minimum rather than passing it quietly', () => {
    /*
     * A sliver of steel in a big section can satisfy a small moment by
     * arithmetic and still be a section the code will not accept.
     */
    const r = verify(5, 0.5);
    expect(r.AsCm2!).toBeLessThan(r.AsMinCm2);
    expect(r.steps.map((s) => s.key)).toContain('flex.step.belowMin');
  });

  it('says the steel was a given, not a proposal', () => {
    const r = verify(150, 14);
    expect(r.steps.map((s) => s.key)).toContain('flex.step.givenAs');
  });
});
