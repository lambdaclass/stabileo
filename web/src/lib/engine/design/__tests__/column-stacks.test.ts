/**
 * Column stacks: the columns on one plan position, bottom to top; the ones that repeat; the
 * heaviest lift written to its repeats; a lift's bar breakdown with the lap.
 */
import { describe, it, expect } from 'vitest';
import { columnStacks, columnSteel, equalizeStackGroup, liftBreakdown, repeatedStacks } from '../column-stacks';

const nodes = new Map<number, { x: number; y: number; z: number }>();
const elements = new Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number }>();
let n = 0;
const node = (x: number, y: number, z: number) => { nodes.set(++n, { x, y, z }); return n; };
for (const [x, sec2] of [[0, 1], [5, 1], [10, 2]] as const) {
  const a = node(x, 0, 0), b = node(x, 0, 3), c = node(x, 0, 6);
  elements.set(x * 10 + 1, { id: x * 10 + 1, nodeI: a, nodeJ: b, sectionId: 1 });
  elements.set(x * 10 + 2, { id: x * 10 + 2, nodeI: c, nodeJ: b, sectionId: sec2 }); // drawn top-down
}

describe('column stacks', () => {
  const stacks = columnStacks({ nodes, elements, columns: elements.keys() });
  it('groups by plan position, bottom to top', () => {
    expect(stacks.map((s) => s.lifts.map((l) => l.id))).toEqual([[1, 2], [51, 52], [101, 102]]);
    expect(stacks[0]!.lifts[1]).toMatchObject({ zLo: 3, zHi: 6 });
  });
  it('repeats when every lift matches', () => {
    expect(repeatedStacks(stacks).map((g) => g.map((s) => s.lifts[0]!.id))).toEqual([[1, 51]]);
  });
  it('the heaviest lift is written to its repeats', () => {
    const bars = new Map<number, unknown>([
      [1, { longitudinal: { count: 8, diameter: 16 } }], [51, { longitudinal: { count: 8, diameter: 20 } }],
      [2, { column: { cornerDia: 16, faceDia: 12, nBottom: 1, nTop: 1, nLeft: 0, nRight: 0 } }], [52, { longitudinal: { count: 4, diameter: 16 } }],
    ]);
    expect(columnSteel(bars.get(2) as never)).toBeCloseTo(4 * 2.0106 + 2 * 1.131, 3);
    expect(equalizeStackGroup(repeatedStacks(stacks)[0]!, (id) => bars.get(id) as never)).toEqual([{ target: 1, source: 51 }, { target: 52, source: 2 }]);
  });
  it('breaks a lift down: bars with the lap, ties counted over its zones', () => {
    // 3 m, 8Ø16 with a 0,60 m lap: 3,60 m; ties Ø8 c/20 with 0,5 m end zones at 10 cm:
    // ceil(1,0/0,10) + ceil(2,0/0,20) + 1 = 10 + 10 + 1 = 21.
    const b = liftBreakdown({ zLo: 0, zHi: 3 }, { longitudinal: { count: 8, diameter: 16 }, stirrups: { diameter: 8, legs: 2, spacing: 0.2 }, tieZones: { endLength: 0.5, endSpacing: 0.1 } } as never, () => 0.6, 1.4);
    expect(b).toEqual([{ what: 'long', count: 8, diameter: 16, length: 3.6 }, { what: 'tie', count: 21, diameter: 8, length: 1.55 }]);
  });
});
