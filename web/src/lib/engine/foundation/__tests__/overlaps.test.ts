import { describe, it, expect } from 'vitest';
import { footingOverlaps, rectanglesOverlap, footingCorners } from '../overlaps';
import { newFooting, type Footing } from '../../../model/footing';

const OPTS = { cover: 0.05, foundingElevation: -1.5, soilProfileId: 1 };
const at = (id: number, nodeId: number, over: Partial<Footing> = {}): Footing => ({ ...newFooting(id, nodeId, `Z${id}`, OPTS), B: 2, L: 2, ...over });
const nodes = new Map([[1, { x: 0, y: 0 }], [2, { x: 1.9, y: 0 }], [3, { x: 2.1, y: 0 }], [4, { x: 10, y: 0 }], [5, { x: 1.3, y: 1.3 }]]);

describe('overlapping footings', () => {
  it('finds two square bases that overlap and not two that clear', () => {
    expect(footingOverlaps([at(1, 1), at(2, 2)], nodes).pairs).toEqual([{ a: 1, b: 2 }]);
    expect(footingOverlaps([at(1, 1), at(3, 3)], nodes).pairs).toEqual([]);
    // 10 cm apart, with 15 cm of clearance asked for, they count.
    expect(footingOverlaps([at(1, 1), at(3, 3)], nodes, 0.15).pairs).toHaveLength(1);
  });

  it('separates by the edges of a turned base', () => {
    // A 2 m square turned 45° reaches √2 along the diagonal: centred at (1,3; 1,3) its corner
    // enters the unturned square at the origin; centred at (2,5; 2,5) it clears it.
    const a = footingCorners(at(1, 1), nodes.get(1)!), b = footingCorners(at(5, 5, { rotationDeg: 45 }), nodes.get(5)!);
    expect(rectanglesOverlap(a, b)).toBe(true);
    const c = footingCorners(at(5, 5, { rotationDeg: 45 }), { x: 2.5, y: 2.5 });
    expect(rectanglesOverlap(a, c)).toBe(false);
  });

  it('groups chains of overlaps into one', () => {
    const g = footingOverlaps([at(1, 1), at(2, 2), at(3, 3), at(4, 4)], nodes).groups;
    expect(g).toEqual([[1, 2, 3]]);
  });
});
