import { describe, it, expect } from 'vitest';
import { meshLabel, stirrupsLabel } from '../bars';

describe('a spacing printed on the drawings and the schedule', () => {
  it('is the one checked, to the millimetre: 12.5 cm stays 12.5, never 13', () => {
    expect(stirrupsLabel({ dia: 8, legs: 2, spacing: 0.125 })).toBe('Ø8 c/12.5');
    expect(meshLabel({ dia: 10, spacing: 0.075 })).toBe('Ø10 c/7.5');
    expect(meshLabel({ dia: 10, spacing: 0.2 })).toBe('Ø10 c/20');
  });
});
