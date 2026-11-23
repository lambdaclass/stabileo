import { describe, it, expect } from 'vitest';
import { inwardPartner } from '../../model/foundation/edges';
import { groupRoom, type Placed } from '../footing-group';
import { strapDefault } from '../footing-strap';
import type { FootingDemand } from '../footing-types';

describe('the footing a core at a property line is strapped to', () => {
  const core = { id: 1, x: 1.2, y: 7.5 };
  const others = [{ id: 5, x: 6, y: 6 }, { id: 9, x: 12, y: 6 }];

  it('is the nearest inward one within the core\'s width, not a farther one in line past it', () => {
    expect(inwardPartner(core, [-1, 0], others)!.id).toBe(9);
    expect(inwardPartner(core, [-1, 0], others, 1.6)!.id).toBe(5);
  });

  it('takes a beam of a beam\'s width, not the width of the whole core', () => {
    const d = { column: { b: 3.1, h: 3.2 }, pier: { key: 'p', nodes: [1], walls: [] }, edge: { partners: [{ axis: 'x', L: 4.8 }] } } as unknown as FootingDemand;
    expect(strapDefault(d, { h: 0.3 }, 'x').b).toBeLessThanOrEqual(0.6);
    const col = { column: { b: 0.3, h: 0.4 }, edge: { partners: [{ axis: 'x', L: 4.8 }] } } as unknown as FootingDemand;
    expect(strapDefault(col, { h: 0.3 }, 'x').b).toBeCloseTo(0.4, 9);
  });
});

describe('the room a mat\'s bars have to anchor past its outer columns', () => {
  const p = (x: number, y: number): Placed => ({ demand: {} as FootingDemand, x, y, b: 0.3, h: 0.3, anchor: [0, 0] });

  it('is not read on a side flush with the columns, where no cantilever is left to anchor', () => {
    const cols = [p(-5.85, 0), p(5.85, 0), p(-5.85, 6), p(5.85, 6)].map((c) => ({ ...c, y: c.y - 3 }));
    const flush = groupRoom(cols, { B: 12, L: 6.3 }, 0.05);
    const overhung = groupRoom(cols, { B: 13, L: 6.3 }, 0.05);
    expect(flush).toBeGreaterThan(overhung);
    expect(overhung).toBeCloseTo(0.5 + 0.3 - 0.05, 6);
  });
});
