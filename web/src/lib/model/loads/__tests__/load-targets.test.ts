/**
 * Ids typed as a list (`parseIdList`): a range reads the same with spaces around its dash, or an en
 * dash, as without; a dash with nothing before it is not a negative id.
 */
import { describe, it, expect } from 'vitest';
import { parseIdList, targetModes, keepTargetMode } from '../load-targets';

describe('parseIdList', () => {
  it('a range with spaces around the dash, or an en dash', () => {
    const r = [7, 8, 9, 10, 11, 12];
    expect(parseIdList('7-12')).toEqual(r);
    expect(parseIdList('7 - 12')).toEqual(r);
    expect(parseIdList('7 -12')).toEqual(r);
    expect(parseIdList('7- 12')).toEqual(r);
    expect(parseIdList('7–12')).toEqual(r);
    expect(parseIdList('7 – 12')).toEqual(r);
    expect(parseIdList('1, 4, 7 - 9; 20')).toEqual([1, 4, 7, 8, 9, 20]);
  });

  it('a dash with no id before it is no id: never a negative one', () => {
    expect(parseIdList('-3')).toEqual([]);
    expect(parseIdList('1, -3')).toEqual([1]);
    expect(parseIdList('5 - ')).toEqual([]);
    expect(parseIdList('2,,3')).toEqual([2, 3]);
  });
});

describe('the "apply to" choice when the kind of load changes', () => {
  it('a choice the new kind does not offer goes back to the selection, so the select never shows blank', () => {
    expect(targetModes('members', true)).toContain('chain');
    expect(targetModes('members', false)).not.toContain('chain');
    expect(targetModes('nodes', true)).toEqual(['selection', 'ids', 'group', 'range']);
    expect(keepTargetMode('section', targetModes('nodes', false))).toBe('selection');
    expect(keepTargetMode('chain', targetModes('quads', false))).toBe('selection');
    expect(keepTargetMode('chain', targetModes('members', false))).toBe('selection');
    expect(keepTargetMode('range', targetModes('quads', false))).toBe('range');
  });
});
