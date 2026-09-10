/**
 * The bars proposed must never be less steel than the bars required.
 *
 * ── Why this is the test worth having ──────────────────────────────
 *
 * The panel prints two numbers a line apart: the area the clauses demand,
 * and an arrangement that is supposed to supply it. When the second is
 * smaller than the first, nothing crashes and no verdict flips — the section
 * still says "verifica", because the verdict was computed from the AREA. The
 * only thing that is wrong is the line a person would actually build from.
 *
 * That is exactly how it shipped: a 30×30 column needing 21.31 cm² over two
 * levels was offered "2 Ø32 = 16.08 cm²", 25 % light. `chooseBarsForCount`
 * had fallen back to the largest bar in the database when no bar covered a
 * share, and returning something is a worse failure than raising, because it
 * reads as an answer.
 *
 * So the invariant is stated once and swept, rather than spot-checked: for
 * every case the calculator can size, `barChoice.areaCm2 >= AstCm2`.
 */

import { describe, it, expect } from 'vitest';
import { solveFlex, type FlexInput } from '../cirsoc-flex';
import { chooseBars, chooseBarsForCount, chooseBarsPerLevel } from '../cirsoc201-bars';
import { REBAR_DB } from '../cirsoc201';

describe('a proposal covers the area it was asked for', () => {
  it('never returns less steel than requested, at any area', () => {
    /*
     * Up past what fits in the sections this panel offers — the point is to
     * cross the ceiling where a single Ø32 stops being enough, which is
     * where the old fallback silently gave up.
     */
    for (let As = 0.5; As <= 200; As += 0.5) {
      expect(chooseBars(As).areaCm2, `As = ${As}`).toBeGreaterThanOrEqual(As - 1e-9);
    }
  });

  it('raises the COUNT rather than lowering the area, when a share is too big', () => {
    const largest = REBAR_DB[REBAR_DB.length - 1];
    /* Two bars can hold 2 × 8.04 = 16.08 cm². Ask for more than that. */
    const tooMuchForTwo = 2 * largest.area + 5;
    const choice = chooseBarsForCount(tooMuchForTwo, 2);
    expect(choice.areaCm2).toBeGreaterThanOrEqual(tooMuchForTwo);
    expect(choice.count).toBeGreaterThan(2);
    /*
     * And it stays a MULTIPLE of what the reader chose. A ring of twelve
     * becoming a ring of twenty-four is still recognisably their ring;
     * becoming a ring of nineteen is a different arrangement wearing the
     * same label.
     */
    expect(choice.count % 2).toBe(0);
  });

  it('keeps the arrangement a multiple of the layout, for every layout size', () => {
    for (const count of [2, 4, 6, 8, 12, 16, 20]) {
      for (const As of [10, 45, 90, 150]) {
        const c = chooseBarsForCount(As, count);
        expect(c.areaCm2, `${count} bars, ${As} cm²`).toBeGreaterThanOrEqual(As - 1e-9);
        expect(c.count % count, `${count} bars, ${As} cm²`).toBe(0);
      }
    }
  });

  it('gives a level at least two bars, so a rectangular column has four', () => {
    /*
     * §10.9.2. A level sized on area alone would take one bar whenever one
     * bar covered it, and two levels of one bar is not a tied column.
     */
    expect(chooseBarsPerLevel(1.0).count).toBeGreaterThanOrEqual(2);
    expect(chooseBarsPerLevel(0.1).count).toBeGreaterThanOrEqual(2);
  });
});

describe('every case the panel can size proposes buildable steel', () => {
  /** The panel's own defaults, per case, so this sweeps what a user meets. */
  const CASES: Array<{ name: string; input: FlexInput }> = [
    {
      name: 'FSR',
      input: { mode: 'design', kase: 'FSR', fc: 25, fy: 420, b: 0.30, h: 0.50,
        dPrimeS: 0.05, dPrime: 0.05, Pu: 0, Mu: 150 } as unknown as FlexInput,
    },
    {
      name: 'FST',
      input: { mode: 'design', kase: 'FST', fc: 25, fy: 420, b: 0.60, h: 0.50,
        bw: 0.15, bf: 0.60, hf: 0.10, dPrimeS: 0.05, dPrime: 0.05,
        Pu: 0, Mu: 200 } as unknown as FlexInput,
    },
    {
      name: 'FCR',
      input: { mode: 'design', kase: 'FCR', fc: 25, fy: 420, b: 0.30, h: 0.30,
        dPrimeS: 0.05, dPrime: 0.05, ratio: 1, Pu: 500, Mu: 100 } as unknown as FlexInput,
    },
    {
      name: 'FCR-CIR',
      input: { mode: 'design', kase: 'FCR-CIR', fc: 25, fy: 420, D: 0.50,
        dPrimeS: 0.05, dPrime: 0.05, barCount: 12, Pu: 1000, Mu: 200 } as unknown as FlexInput,
    },
    {
      name: 'FCO',
      input: { mode: 'design', kase: 'FCO', fc: 25, fy: 420, b: 0.30, h: 0.30,
        dPrimeH: 0.05, dPrimeV: 0.05, dPrimeS: 0.05, dPrime: 0.05,
        pctA1: 40, pctA2: 40, pctA3: 20, nA1: 3, nA2: 3, nA3: 2,
        Pu: 500, Mux: 60, Muy: 40 } as unknown as FlexInput,
    },
  ];

  for (const { name, input } of CASES) {
    it(`${name}: the bars supply at least the area`, () => {
      const r = solveFlex(input);
      expect(r.barChoice, `${name} proposes bars at all`).toBeDefined();
      const need = name === 'FCR' ? r.AstCm2 / 2 : r.AstCm2;
      expect(r.barChoice!.areaCm2, `${name}: needs ${need.toFixed(2)} cm²`)
        .toBeGreaterThanOrEqual(need - 1e-9);
    });
  }

  it('FCR proposes a level, and two of them clear §10.9.2', () => {
    const r = solveFlex(CASES[2].input);
    /*
     * The bug this file exists for. FCR's layout has two ENTRIES and they
     * are levels, not bars — read as bars they gave a proposal a quarter
     * light, and a two-bar rectangular column besides.
     */
    expect(r.barChoice!.count).toBeGreaterThanOrEqual(2);
    expect(r.barChoice!.count * 2).toBeGreaterThanOrEqual(4);
    expect(r.barChoice!.areaCm2 * 2).toBeGreaterThanOrEqual(r.AstCm2 - 1e-9);
  });

  it('a layout that places no bars proposes none, rather than inventing one', () => {
    /*
     * Found by this file: an FCO split that put 0 % on all three faces
     * still came back with "8 Ø32", a count assembled from the sizer's own
     * fallback and labelled as though the reader had chosen it.
     */
    const r = solveFlex({
      ...CASES[4].input, pctA1: 0, pctA2: 0, pctA3: 0,
    } as unknown as FlexInput);
    expect(r.bars.length).toBe(0);
    expect(r.barChoice).toBeUndefined();
  });

  it('rising demand never buys less steel', () => {
    /*
     * Monotonicity across the proposal, not just across the area. Bars come
     * in steps, so the count may hold while the moment rises — what may not
     * happen is the proposal going DOWN as the demand goes up, which is the
     * shape the old fallback had once it hit its ceiling.
     */
    let previous = 0;
    for (let Mu = 60; Mu <= 400; Mu += 10) {
      const r = solveFlex({ ...CASES[0].input, Mu } as unknown as FlexInput);
      if (!r.ok) break;
      expect(r.barChoice!.areaCm2, `Mu = ${Mu}`).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = r.barChoice!.areaCm2;
    }
  });
});
