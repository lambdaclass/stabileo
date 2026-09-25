/**
 * A shallow section where c at the 5 ‰ limit lies above d′: the top bar is in
 * tension there, so compression steel cannot add capacity while εt stays at
 * 5 ‰. Beyond the singly-reinforced maximum the answer is "section too small",
 * never a compression-controlled "design" (εt below the 4 ‰ flexural minimum,
 * as main returned).
 */
import { describe, it, expect } from 'vitest';
import { solveFlex, type FlexInput } from '../cirsoc-flex';
import { sheetRows } from '../../../../../components/flex/sheet-rows';

const BASE: FlexInput = {
  kase: 'FSR', mode: 'design',
  fc: 25, fy: 420, confinement: 'ties', deductDisplacedConcrete: true,
  b: 0.20, h: 0.12, dPrime: 0.04, dPrimeS: 0.03, dPrimeH: 0.05, dPrimeV: 0.05,
  holeB: 0, holeH: 0, bf: 1.37, hf: 0.10, bw: 0.12,
  D: 0.40, Dint: 0, barCount: 12, barAtExtremeFibre: true,
  ratioAsPrime: 1, pctA1: 50, pctA2: 50, pctA3: 0, nA1: 4, nA2: 4, nA3: 4,
  AstGiven: 20, levels: [], Pu: 0, Mu: 5, Muy: 0,
};

describe('shallow section: c at 5 permil lies above d′, so A′s cannot help', () => {
  // h = 12, d = 9, c(5‰) = 3.37 cm < d′ = 4 cm → fsComp < 0 → balance = 0.
  for (const Mu of [9, 12, 30]) {
    it(`Mu = ${Mu} kN·m above MuSinglyMax (~8.4) is flagged, not designed`, () => {
      const r = solveFlex({ ...BASE, Mu });
      expect(r.impossible).toBe(true);
      expect(r.ok).toBe(false);
      expect(r.steps.map((s) => s.key)).toContain('flex.step.impossible');
      // No bars are proposed for it: an arrangement for the ceiling is not an answer.
      expect(r.steps.map((s) => s.key)).not.toContain('flex.step.asBars');
      expect(r.steps.map((s) => s.key)).not.toContain('flex.step.asCompBars');
      const rows = sheetRows({ kase: 'FSR', mode: 'design', r, fc: 25, fy: 420, spiral: false, barCount: 0, Pu: 0, Mu });
      expect(rows.bars).toEqual([]);
      expect(rows.beam[0][1]).toBe('—');
      expect(rows.beam[1][1]).toBe('—');
    });
  }
  it('below MuSinglyMax the same section still designs singly', () => {
    const r = solveFlex({ ...BASE, Mu: 8 });
    expect(r.ok).toBe(true);
    expect(r.AsPrimeCm2).toBe(0);
  });
  it('any design it does return holds εt ≥ 5‰ (never a compression-controlled "design")', () => {
    for (const dPrime of [0.02, 0.03, 0.032, 0.0335, 0.034, 0.04]) {
      for (const Mu of [8.5, 9, 10, 12]) {
        const r = solveFlex({ ...BASE, dPrime, Mu });
        if (r.ok) expect(r.epsilonT!, `d′=${dPrime} Mu=${Mu}`).toBeGreaterThanOrEqual(0.005 - 1e-4);
      }
    }
  });
});
