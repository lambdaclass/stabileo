import { describe, it, expect } from 'vitest';
import { byLevel, plateLevelKey } from '../plate-state';

describe('the plates list by level', () => {
  it('lists a plate with no level at its outline\'s lowest elevation, not at +0', () => {
    expect(plateLevelKey(undefined, [[0, 0, 3], [4, 0, 3], [4, 0, 6]])).toBe('z:3');
    expect(plateLevelKey('N1', [[0, 0, 3]])).toBe('N1');
  });

  it('keeps each level together once, even where two levels at one elevation interleave when sorted', () => {
    const rows = [{ id: 1, level: 'N0' }, { id: 2, level: 'z:0' }, { id: 3, level: 'N0' }, { id: 4, level: 'z:0' }];
    const g = byLevel(rows);
    expect(g.map((x) => x.level)).toEqual(['N0', 'z:0']);
    expect(g.map((x) => x.rows.map((r) => r.id))).toEqual([[1, 3], [2, 4]]);
  });
});
