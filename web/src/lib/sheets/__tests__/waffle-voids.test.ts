import { describe, it, expect } from 'vitest';
import { mergeBoxes, waffleVoids } from '../plans/waffle-voids';

/** A 4,10 m square: five cells of 0,82 each way, ribs 0,12 wide, voids 0,70 square. */
const square = [{ x: 0, y: 0 }, { x: 4.1, y: 0 }, { x: 4.1, y: 4.1 }, { x: 0, y: 4.1 }];

describe('the voids of a waffle slab', () => {
  it('fills the slab with one void per cell, a rib width short of it', () => {
    const v = waffleVoids({ loops: [square], solids: [], spacingX: 0.82, spacingY: 0.82, ribWidth: 0.12 });
    expect(v).toHaveLength(25);
    expect(v[0]!.x1 - v[0]!.x0).toBeCloseTo(0.7, 9);
    expect(v[0]!.x0).toBeCloseTo(0.06, 9);
  });

  it('leaves out the cells over a drop and over an opening', () => {
    const drop = mergeBoxes([{ x0: 0, x1: 0.82, y0: 0, y1: 0.82 }, { x0: 0.82, x1: 1.64, y0: 0, y1: 0.82 }]);
    expect(drop).toEqual([{ x0: 0, x1: 1.64, y0: 0, y1: 0.82 }]);
    const hole = [{ x: 3.28, y: 3.28 }, { x: 4.0, y: 3.28 }, { x: 4.0, y: 4.0 }, { x: 3.28, y: 4.0 }];
    const v = waffleVoids({ loops: [square, hole], solids: drop, spacingX: 0.82, spacingY: 0.82, ribWidth: 0.12 });
    expect(v).toHaveLength(25 - 2 - 1);
  });
});
