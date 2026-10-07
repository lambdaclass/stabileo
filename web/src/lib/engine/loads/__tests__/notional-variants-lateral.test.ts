/**
 * Which combinations take notional variants: those without lateral load. A composite case is
 * read through what it takes in, not through its own type, which is a label the user left.
 */
import { describe, it, expect } from 'vitest';
import { withNotionalVariants } from '../notional-combinations';

const D = 1, W = 2, N = 3, C = 4;
const combo = (caseId: number) => ({ name: 'c', factors: [{ caseId: 1, factor: 1.2 }, { caseId, factor: 1 }], purpose: 'strength' as const, specId: '1' });
const notional = { id: N, type: 'N', notional: { sourceCaseId: D, fraction: 0.002, dir: '+X' } } as never;

describe('notional variants and composite cases', () => {
  it('a composite that takes wind in is lateral, whatever its own type', () => {
    const cases = [{ id: D, type: 'D' }, { id: W, type: 'W' }, notional, { id: C, type: 'D', includes: [{ caseId: W, factor: 1 }] }] as never;
    expect(withNotionalVariants([combo(C)], cases)).toHaveLength(1);
  });
  it('a composite typed W that takes in only gravity is not', () => {
    const cases = [{ id: D, type: 'D' }, notional, { id: C, type: 'W', includes: [{ caseId: D, factor: 1 }] }] as never;
    expect(withNotionalVariants([combo(C)], cases)).toHaveLength(2);
  });
  it('reads nested composites, and a loop ends', () => {
    const B = 5;
    const cases = [{ id: D, type: 'D' }, { id: W, type: 'W' }, notional,
      { id: C, type: '', includes: [{ caseId: B, factor: 1 }] }, { id: B, type: '', includes: [{ caseId: W, factor: 0.5 }, { caseId: C, factor: 1 }] }] as never;
    expect(withNotionalVariants([combo(C)], cases)).toHaveLength(1);
  });
});
