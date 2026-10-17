/**
 * Differential test: the deflection check against the engine's serviceability checker.
 *
 * `checkDeflection` computed its own allowable, ratio and verdict; the engine's
 * `check_serviceability` computes the same three. Compared on random spans, deflections, limits
 * and long-term multipliers they agreed to the last bit — the only TypeScript arithmetic that
 * remains is the long-term multiplier, which the engine does not model. The verdict now comes
 * from the engine; this test pins both against the formula δ·(1 + λ) ≤ L_over / n.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { checkDeflection } from '../../codes/argentina/serviceability';
import { checkServiceability } from '../../wasm-solver';

describe('deflection: adapter, engine and formula agree', () => {
  it('on random members, including cantilevers (limit over 2L)', () => {
    fc.assert(fc.property(
      fc.double({ min: 0.5, max: 25, noNaN: true }),
      fc.double({ min: -0.2, max: 0.2, noNaN: true }),
      fc.constantFrom<'L/240' | 'L/360' | 'L/480' | number>('L/240', 'L/360', 'L/480', 250, 300, 500, 1000),
      fc.double({ min: 0, max: 3, noNaN: true }),
      fc.boolean(),
      (L, delta, rule, lambda, cantilever) => {
        const over = cantilever ? 2 * L : L;
        const n = typeof rule === 'number' ? rule : Number(rule.slice(2));
        const expected = (Math.abs(delta) * (1 + lambda)) / (over / n);
        const r = checkDeflection(L, delta, rule, lambda, over);
        expect(Math.abs(r.ratio - expected)).toBeLessThanOrEqual(1e-12 * Math.max(1, expected));
        expect(r.limit).toBeCloseTo(over / n, 12);
        expect(r.status === 'fail').toBe(expected > 1);
        const [e] = checkServiceability({
          members: [{ elementId: 1, span: over, maxDeflection: r.deltaTotal, criterion: { spanRatio: n } }],
        }) as Array<{ deflectionRatio: number; deflectionOk: boolean }>;
        expect(e.deflectionRatio).toBe(r.ratio);
        expect(e.deflectionOk).toBe(r.status !== 'fail');
      },
    ), { numRuns: 3000, seed: 99 });
  });
});
