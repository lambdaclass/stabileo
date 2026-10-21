import { describe, it, expect } from 'vitest';
import { mergeCollinearBeams } from '../plans/formwork-plan';

const b = (name: string, ax: number, bx: number, y = 0) => ({ name, a: { x: ax, y }, b: { x: bx, y }, width: 0.3, depth: 0.3 });

describe('beams on the formwork plan', () => {
  it('draws the pieces of one member that continue one another as one beam', () => {
    // Out of order and one reversed, as the mesh leaves them.
    const m = mergeCollinearBeams([b('L60', 2, 3), b('L60', 0, 1), b('L60', 2, 1), b('L61', 3, 4)]);
    expect(m).toHaveLength(2);
    const l60 = m.find((x) => x.name === 'L60')!;
    expect([Math.min(l60.a.x, l60.b.x), Math.max(l60.a.x, l60.b.x)]).toEqual([0, 3]);
  });

  it('keeps apart what is not end to end, or not on one line', () => {
    expect(mergeCollinearBeams([b('L1', 0, 1), b('L1', 2, 3)])).toHaveLength(2);
    expect(mergeCollinearBeams([b('L1', 0, 1), { ...b('L1', 1, 2), b: { x: 2, y: 1 } }])).toHaveLength(2);
  });
});
