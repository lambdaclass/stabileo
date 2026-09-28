/**
 * A column whose bars do not fit across the face says so in words.
 *
 * The column sheets stop at the area, so the calculator prints no bar
 * arrangement for a column — but one that cannot be placed is a safety
 * signal, not a matter of matching the sheet. Only the drawing showed it.
 */
import { describe, it, expect } from 'vitest';
import { solveFlex } from '../cirsoc-flex';
import type { FlexInput } from '../cirsoc-flex';

const BASE: FlexInput = {
  kase: 'FCR', mode: 'design',
  fc: 25, fy: 420, confinement: 'ties', deductDisplacedConcrete: true,
  b: 0.30, h: 0.30, dPrime: 0.05, dPrimeS: 0.05, dPrimeH: 0.05, dPrimeV: 0.05,
  holeB: 0, holeH: 0,
  bf: 1.37, hf: 0.10, bw: 0.12,
  D: 0.40, Dint: 0, barCount: 12, barAtExtremeFibre: true,
  ratioAsPrime: 1,
  pctA1: 50, pctA2: 50, pctA3: 0, nA1: 4, nA2: 4, nA3: 4,
  AstGiven: 20, levels: [],
  Pu: 500, Mu: 100, Muy: 0,
};

const keys = (r: { steps: Array<{ key: string }> }) => r.steps.map((s) => s.key);

describe('column bars', () => {
  it('an ordinary column carries no warning', () => {
    expect(keys(solveFlex(BASE))).not.toContain('flex.step.wontFitColumn');
  });

  it('a narrow column whose level needs a second row is told its bars do not fit', () => {
    // 6 Ø20 per level on a 15 cm face: three rows of two, which a beam may
    // stack and a column face cannot.
    const r = solveFlex({ ...BASE, b: 0.15, h: 0.50, Pu: 300, Mu: 300 });
    expect(r.barChoice?.layers).toBeGreaterThan(1);
    expect(keys(r)).toContain('flex.step.wontFitColumn');
  });
});
