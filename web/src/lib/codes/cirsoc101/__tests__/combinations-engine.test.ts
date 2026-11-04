/**
 * Differential test: the CIRSOC 101 combinations, engine against the verified TypeScript oracle.
 *
 * `generateCombinations` is an adapter over `engine/src/loads/cirsoc101_combinations.rs`. The
 * TypeScript generator verified clause by clause in #292 (docs/verification/LOADS.md) is kept as
 * `combinations-oracle.ts`. Every subset of the ten loads, crossed with Exception 1's inputs, the
 * H actions and the seismic companions, must give the same combinations in the same order: ids,
 * terms, labels, clause references and notes.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { generateCombinations, liveLoadFactorInCompanion, type CombinationInputs } from '../combinations';
import { generateCombinations as oracle, liveLoadFactorInCompanion as oracleLive } from './combinations-oracle';

const SYMBOLS = ['L', 'Lr', 'S', 'R', 'W', 'E', 'F', 'H', 'Wa', 'T'] as const;

function presentOf(mask: number): CombinationInputs['present'] {
  const p = {} as Record<string, boolean>;
  SYMBOLS.forEach((s, i) => { p[s] = (mask & (1 << i)) !== 0; });
  return p as CombinationInputs['present'];
}

describe('CIRSOC 101 combinations: engine against the verified oracle', () => {
  it('every subset of the ten loads, default options', () => {
    for (let mask = 0; mask < 1 << SYMBOLS.length; mask++) {
      const inputs: CombinationInputs = { present: presentOf(mask) };
      expect(generateCombinations(inputs), `mask ${mask}`).toEqual(oracle(inputs));
    }
  }, 120_000);

  it('random options over random subsets', () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: (1 << SYMBOLS.length) - 1 }),
      fc.option(fc.constantFrom(2, 3, 4.99, 5, 5.01, 7.5), { nil: undefined }),
      fc.boolean(),
      fc.option(fc.constantFrom<'adds' | 'opposes' | 'unknown'>('adds', 'opposes', 'unknown'), { nil: undefined }),
      fc.boolean(),
      fc.option(fc.record({ f1: fc.option(fc.constantFrom(0, 0.25, 0.5, 0.75, 1), { nil: undefined }), f2: fc.option(fc.constantFrom(0.2, 0.7), { nil: undefined }) }), { nil: undefined }),
      fc.option(fc.boolean(), { nil: undefined }),
      (mask, lo, garage, action, permanent, companions, notActing) => {
        const inputs: CombinationInputs = {
          present: presentOf(mask),
          ...(lo !== undefined ? { maxLoKNm2: lo } : {}),
          hasGarageOrPublicAssembly: garage,
          ...(action ? { earthPressureAction: action } : {}),
          earthPressurePermanent: permanent,
          ...(companions ? { seismicCompanions: companions } : {}),
          ...(notActing !== undefined ? { notActing } : {}),
        };
        expect(generateCombinations(inputs)).toEqual(oracle(inputs));
        expect(liveLoadFactorInCompanion(inputs)).toEqual(oracleLive(inputs));
      },
    ), { numRuns: 3000, seed: 101 });
  }, 120_000);
});
