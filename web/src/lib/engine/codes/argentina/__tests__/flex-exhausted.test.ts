/**
 * "Impossible" is a proof; an exhausted search is not one.
 *
 * The calculator used to call a design impossible ("no admissible reinforcement makes this
 * section work") whenever the bars IT tries did not fit in three layers. That is the end of its
 * own search (one diameter a face, its diameter list, three layers), not a statement about the
 * section: bundles, mixed diameters or another arrangement may still fit, and a doubly reinforced
 * beam has no ratio ceiling in the code. Only a bound no steel lifts — the ratio ceiling, the
 * moment curve not reaching Mu, εt under 4 ‰ — is impossible. On a grid of 6 widths × 5 depths ×
 * 3 concretes × Mu 20–1500 kN·m, 486 designs were relabelled from the first to the second.
 */
import { describe, it, expect } from 'vitest';
import { solveFlex, type FlexInput } from '../cirsoc-flex';
import { sheetRows } from '../../../../../components/flex/sheet-rows';

const BASE: FlexInput = {
  kase: 'FSR', mode: 'design', fc: 25, fy: 420, confinement: 'ties', deductDisplacedConcrete: true,
  b: 0.30, h: 0.60, dPrime: 0.05, dPrimeS: 0.05, dPrimeH: 0.05, dPrimeV: 0.05, holeB: 0, holeH: 0,
  bf: 1.0, hf: 0.10, bw: 0.25, D: 0.40, Dint: 0, barCount: 12, barAtExtremeFibre: true, ratioAsPrime: 1,
  pctA1: 50, pctA2: 50, pctA3: 0, nA1: 4, nA2: 4, nA3: 4, AstGiven: 20, levels: [], Pu: 0, Mu: 200, Muy: 0,
} as FlexInput;
const keys = (r: ReturnType<typeof solveFlex>) => r.steps.map((s) => s.key);

describe('a design the calculator cannot place is exhausted, not impossible', () => {
  it('10 × 70, H-20, Mu 500 kN·m: As 26,28 + A′s 19,79 = 46,07 cm² do not fit in three layers', () => {
    const r = solveFlex({ ...BASE, b: 0.10, h: 0.70, fc: 20, Mu: 500 });
    // Before (7bbab5dcb): [ true, undefined, false ] — and the step said impossible.
    expect([r.impossible, r.exhausted, keys(r).includes('flex.step.exhausted')]).toEqual([false, true, true]);
    expect(keys(r)).not.toContain('flex.step.impossible');
    expect(r.ok).toBe(false);
    expect([r.AsCm2, r.AsPrimeCm2, r.AstCm2].map((x) => Math.round((x ?? 0) * 100) / 100)).toEqual([26.28, 19.79, 46.07]);
    const rows = sheetRows({ kase: 'FSR', mode: 'design', r, fc: 20, fy: 420, spiral: false, barCount: 0, Pu: 0, Mu: 500 } as never);
    expect(JSON.stringify(rows)).not.toContain('flex.out.sectionTooSmall');
  });

  it('a bound still reads impossible: 12 × 50, Mu 330 kN·m is over the ratio ceiling', () => {
    const r = solveFlex({ ...BASE, b: 0.12, h: 0.50, Mu: 330 });
    expect([r.impossible, r.exhausted]).toEqual([true, undefined]);
    expect(keys(r)).toContain('flex.step.impossible');
  });
});
