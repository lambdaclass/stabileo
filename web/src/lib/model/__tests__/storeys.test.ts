import { describe, expect, it } from 'vitest';
import { ceilingZ, storeyAt, storeyLabel } from '../storeys';

const levels = [{ id: 'b', name: 'P1', z: 3 }, { id: 'a', name: 'PB', z: 0 }, { id: 'c', name: 'Techo', z: 5.8 }];

describe('a storey', () => {
  it('runs from its level to the next one up, in any order the levels come', () => {
    const s = storeyAt(levels, 3);
    expect([s.floor?.name, s.ceiling?.name, s.lowest]).toEqual(['P1', 'Techo', false]);
    expect(storeyAt(levels, 0).lowest).toBe(true);
  });

  it('puts its beams on its ceiling, and on the top level on the level itself', () => {
    expect([ceilingZ(levels, 0), ceilingZ(levels, 3), ceilingZ(levels, 5.8)]).toEqual([3, 5.8, 5.8]);
  });

  it('reads as its name and the heights it spans', () => {
    expect(storeyLabel(levels, levels[1]!)).toBe('PB (+0.00 → +3.00 m)');
    expect(storeyLabel(levels, levels[2]!)).toBe('Techo (+5.80 m)');
  });
});
