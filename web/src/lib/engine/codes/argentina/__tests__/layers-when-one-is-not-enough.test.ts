/**
 * A beam that needs more steel than its web can hold gets another layer.
 *
 * ── The behaviour this replaces ────────────────────────────────────
 *
 * Reported from the site: past the demand one layer of bars can carry, the
 * calculator stopped designing. Two different wrong answers were in play.
 * `checkFlexure` declared the section insufficient at 4 %·b·h and told the
 * reader to make it bigger. `solveFlex` kept cramming a single layer and
 * reported arrangements with NEGATIVE clear spacing — five Ø32 in a 20 cm
 * web, bars overlapping in space — while still printing "verifica".
 *
 * Neither is what a detailer does. They add a second layer.
 *
 * ── Why layers cannot be bolted on after sizing ────────────────────
 *
 * Steel in a second layer sits further from the tension face, so the group's
 * centroid rises, `d` shrinks, and the section is worth less than the
 * one-layer arithmetic promised. More steel is then needed, which can force
 * another layer. Sizing and layout are one problem, and `solveFlex` now
 * iterates until the cover it assumed equals the cover the bars produce.
 *
 * These tests pin the three things that can silently break: the arrangement
 * must be physically placeable, `d` must follow the bars rather than the
 * input field, and the whole thing must stay monotonic across the demand.
 */

import { describe, it, expect } from 'vitest';
import { solveFlex, type FlexInput } from '../cirsoc-flex';
import { chooseBars, barsPerLayer } from '../cirsoc201-bars';

/** The section from the bug report. */
const BEAM = { fc: 25, fy: 420, b: 0.20, h: 0.50, dPrimeS: 0.03, dPrime: 0.03 };


const design = (Mu: number, over: Partial<typeof BEAM> = {}) =>
  solveFlex({
    mode: 'design', kase: 'FSR', ...BEAM, ...over, Pu: 0, Mu,
  } as unknown as FlexInput);

describe('how many bars fit across one layer', () => {
  it('counts the span between bar centres, not the span minus a stirrup twice', () => {
    /*
     * `coverM` is the cover to the bar CENTRE, so the centre is already
     * inside the stirrup. The old check subtracted the stirrup diameter
     * again, which made every arrangement read ~16 mm tighter than it is
     * and turned a buildable 3 Ø32 into a failure.
     *
     * 20 cm web, 3 cm to the centre: the centres span 140 mm, and Ø32 needs
     * 32 + 32 = 64 mm from centre to centre. 140/64 = 2.19, so three bars.
     */
    expect(barsPerLayer(0.20, 0.03, 32)).toBe(3);
    /* Ø25 needs 25 + 25 = 50: 140/50 = 2.8, so three. */
    expect(barsPerLayer(0.20, 0.03, 25)).toBe(3);
    /* The workbook's 12 cm web: 52 mm of span takes two Ø25 and one Ø32. */
    expect(barsPerLayer(0.12, 0.034, 25)).toBe(2);
    expect(barsPerLayer(0.12, 0.034, 32)).toBe(1);
  });

  it('never claims a layer holds fewer than one bar', () => {
    /* A section narrower than its own cover is nonsense, but not a crash. */
    expect(barsPerLayer(0.05, 0.03, 32)).toBe(1);
    expect(barsPerLayer(0.06, 0.03, 32)).toBe(1);
  });
});

describe('the arrangement is one you could tie', () => {
  it('never reports negative or sub-minimum clear spacing', () => {
    /*
     * The defect in one line. Every arrangement offered as placeable must
     * clear §25.2 in its fullest layer — not "mostly", and never a negative
     * number, which is bars occupying the same space.
     */
    for (let As = 1; As <= 80; As += 0.5) {
      const c = chooseBars(As, { widthM: 0.20, coverM: 0.03, heightM: 0.50 });
      if (c.placeable === false) continue;
      const spacing = c.clearSpacingMm ?? 0;
      expect(spacing, `As = ${As}: ${c.label} → ${spacing.toFixed(1)} mm`)
        .toBeGreaterThanOrEqual(Math.min(c.diameter, 25) - 1e-6);
    }
  });

  it('adds a layer instead of overfilling one', () => {
    const one = chooseBars(15, { widthM: 0.20, coverM: 0.03, heightM: 0.50 });
    const two = chooseBars(35, { widthM: 0.20, coverM: 0.03, heightM: 0.50 });
    const three = chooseBars(55, { widthM: 0.20, coverM: 0.03, heightM: 0.50 });
    expect(one.layers).toBe(1);
    expect(two.layers).toBe(2);
    expect(three.layers).toBeGreaterThanOrEqual(2);
    /* Every layer holds at most what the width allows. */
    for (const c of [one, two, three]) {
      const cap = barsPerLayer(0.20, 0.03, c.diameter);
      for (const n of c.perLayer ?? []) expect(n).toBeLessThanOrEqual(cap);
      expect((c.perLayer ?? []).reduce((s, n) => s + n, 0)).toBe(c.count);
    }
  });

  it('puts the fullest layer nearest the tension face', () => {
    /*
     * Both what a detailer does and the stack with the smallest centroid,
     * so it is the arrangement that keeps the most effective depth.
     */
    const c = chooseBars(35, { widthM: 0.20, coverM: 0.03, heightM: 0.50 });
    const rows = c.perLayer ?? [];
    for (let k = 1; k < rows.length; k++) expect(rows[k]).toBeLessThanOrEqual(rows[k - 1]);
  });

  it('prefers the stack with more effective depth over the one with fewer bars', () => {
    /*
     * In a 12 cm web, 3 Ø25 stacked 2+1 sit 51 mm off the face and 2 Ø32
     * stacked 1+1 sit 63 mm. Same two layers; the "fewer bars" answer
     * throws away 12 mm of `d`.
     */
    const c = chooseBars(11, { widthM: 0.12, coverM: 0.034, heightM: 0.40 });
    expect(c.layers).toBe(2);
    expect(c.diameter).toBe(25);
    expect(c.centroidFromFaceM!).toBeLessThan(0.055);
  });
});

describe('the depth follows the bars, not the input field', () => {
  it('reports d at the group centroid once there are two layers', () => {
    const r = design(500);
    expect(r.barChoice!.layers!).toBeGreaterThan(1);
    const centroid = r.barChoice!.centroidFromFaceM!;
    expect(centroid, 'centroid is below the first layer').toBeGreaterThan(BEAM.dPrimeS);
    /*
     * `cMax` is computed from the effective depth, so it is the observable
     * that gives the assumed `d` away.
     */
    const dEff = BEAM.h - centroid;
    expect(r.cMax!).toBeCloseTo((dEff * 0.003) / 0.008, 3);
  });

  it('says so in the memo, so two numbers can be reconciled', () => {
    const r = design(500);
    /* The key, not the sentence — the wording belongs to the locale files. */
    const keys = r.steps.map((s) => s.key);
    expect(keys).toContain('flex.step.dLayers');
    const dStep = r.steps.find((s) => s.key === 'flex.step.dLayers')!;
    expect(dStep.params!.layers).toBe(r.barChoice!.layers);
  });

  it('leaves the single-layer answer exactly as it was', () => {
    /*
     * The whole iteration must be inert while one layer holds the bars —
     * otherwise every number already checked against the workbook moves.
     */
    const r = design(200);
    expect(r.barChoice!.layers).toBe(1);
    expect(r.cMax!).toBeCloseTo(((BEAM.h - BEAM.dPrimeS) * 0.003) / 0.008, 6);
  });
});

describe('more demand is never refused for wanting a second layer', () => {
  it('keeps designing well past one layer’s worth of steel', () => {
    /*
     * The report: "falla en el momento que lo solicitamos más que la
     * posibilidad que permite una capa". One layer of this web holds about
     * 24 cm²; the section must still design far above that.
     */
    for (const Mu of [400, 450, 500, 550, 600]) {
      const r = design(Mu);
      expect(r.ok, `Mu = ${Mu} must still design`).toBe(true);
      expect(r.barChoice!.placeable).toBe(true);
    }
  });

  it('refuses only when the steel genuinely cannot be placed', () => {
    /*
     * And when it does refuse, it is because of the stack or the ratio
     * ceiling — a reason that survives being asked "why".
     */
    const r = design(1200);
    expect(r.ok).toBe(false);
    const reason =
      (r.barChoice?.placeable === false) || r.AstCm2 > 0.08 * BEAM.b * BEAM.h * 1e4;
    expect(reason, 'the refusal has a stated cause').toBe(true);
  });

  it('the steel rises monotonically across the layer changes', () => {
    /*
     * Where a layer is added, `d` drops and the steel jumps. A jump is fine;
     * a DROP is the dead-band bug wearing different clothes, and the layer
     * transitions are exactly where it would reappear.
     */
    let previous = 0;
    for (let Mu = 100; Mu <= 650; Mu += 10) {
      const r = design(Mu);
      if (!r.ok) break;
      expect(r.AsCm2!, `Mu = ${Mu}`).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = r.AsCm2!;
    }
  });

  it('a T beam layers on its web, which is the width that binds', () => {
    const r = solveFlex({
      mode: 'design', kase: 'FST', fc: 25, fy: 420, b: 0.60, h: 0.50,
      bw: 0.15, bf: 0.60, hf: 0.10, dPrimeS: 0.04, dPrime: 0.04,
      Pu: 0, Mu: 600,
    } as unknown as FlexInput);
    /* The flange is 60 cm wide and holds none of the tension steel. */
    const cap = barsPerLayer(0.15, 0.04, r.barChoice!.diameter);
    for (const n of r.barChoice!.perLayer ?? []) expect(n).toBeLessThanOrEqual(cap);
  });
});
