/** Hanging steel at an indirect support, with hand values. */
import { describe, it, expect } from 'vitest';
import { hangerArea, hangersPlaced, withHangers } from '../beam-hangers';
import type { BeamLineReinforcement } from '../../../design-contract/beam-line';

const line = (spacing: number): BeamLineReinforcement => ({
  version: 1 as never, members: [1, 2], lengths: [5, 4], bars: [],
  stirrups: [{ id: 'z1', from: 0, to: 5, diameter: 8, legs: 2, spacing }, { id: 'z2', from: 5, to: 9, diameter: 8, legs: 2, spacing }],
});

describe('hanging steel', () => {
  it('Ah = Vu / (φ·fyt): 90 kN at 420 MPa is 2,86 cm²', () => {
    expect(hangerArea(90, 420)).toBeCloseTo(90 / (0.75 * 420) * 10, 9);
    expect(hangerArea(90, 500)).toBeCloseTo(hangerArea(90, 420), 9);
  });

  it('counts the stirrups a stretch holds: eØ8 c/20 over 0,60 m is 3 × 2 × 0,503 = 3,02 cm²', () => {
    expect(hangersPlaced(line(0.2).stirrups, 2.7, 3.3)).toBeCloseTo(3 * 2 * Math.PI * 0.16, 9);
  });

  it('closes the stirrups up over the stretch only, never opening them', () => {
    // Need 5 cm² over 0,60 m with eØ8 two legs (1,005 cm² each): 5 stirrups, s = 0,60/5 = 0,12 m, rounded down to 0,10 m.
    const next = withHangers(line(0.2), 2.7, 3.3, 5);
    const z = next.stirrups.find((q) => q.from === 2.7 && q.to === 3.3)!;
    expect(z.spacing).toBeCloseTo(0.1, 9);
    expect(hangersPlaced(next.stirrups, 2.7, 3.3)).toBeGreaterThanOrEqual(5);
    expect(next.stirrups.filter((q) => q.to <= 2.7 || q.from >= 3.3).every((q) => q.spacing === 0.2)).toBe(true);
    // A stretch already dense enough keeps its spacing.
    expect(withHangers(line(0.05), 2.7, 3.3, 1).stirrups.find((q) => q.from === 2.7)!.spacing).toBe(0.05);
  });
});
