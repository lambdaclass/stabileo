/**
 * A level's slab plan is its floor's: a landing between floors named for the level is a panel of
 * its own, barred at its own height, not a package of the floor laid at the landing's.
 */
import { describe, it, expect } from 'vitest';
import { atFloorHeight } from '../slab-plan';

const panel = (key: string, x0: number, x1: number, z: number) => ({ key, demand: { bounds: { x0, x1, y0: 0, y1: 4, z } } });

describe('a level\'s slab plan', () => {
  it('holds the panels at the height most of its area is at', () => {
    const rows = [panel('a', 0, 4, 3), panel('b', 4, 8, 3), panel('landing', 8, 10, 4.4)];
    expect(atFloorHeight(rows as never[]).map((r: { key: string }) => r.key)).toEqual(['a', 'b']);
  });

  it('keeps every panel of a level at one height', () => {
    const rows = [panel('a', 0, 4, 3), panel('b', 4, 8, 3)];
    expect(atFloorHeight(rows as never[])).toHaveLength(2);
  });
});
