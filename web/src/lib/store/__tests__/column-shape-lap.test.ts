/**
 * The column editor's section shape and lap: a shape change writes one section to the lift, the
 * stack or the group, and takes off bars chosen for the old shape (said, not hidden); a lap set
 * for a group is kept through a save and reaches the detailing's column stack.
 */
import { describe, it, expect } from 'vitest';
import { sectionForShape } from '../column-stack-store';
import { isSolidCircle } from '../../section/solid-circle';
import { columnShapeOf } from '../../engine/design/shaped-column';
import { migrateStoredDecisions } from '../../design-contract/decisions';

describe('column section shape', () => {
  it('a circle is the solid circle the design reads as one', () => {
    const s = sectionForShape({ kind: 'circle', D: 0.5 });
    expect(isSolidCircle(s as never)).toBe(true);
    expect(columnShapeOf(s as never)).toEqual({ kind: 'circle', D: 0.5 });
    expect(s.a).toBeCloseTo(Math.PI * 0.0625, 12);
  });

  it('a rectangle has its inertias about each axis and reads as a rectangle', () => {
    const s = sectionForShape({ kind: 'rect', b: 0.3, h: 0.6 });
    expect([s.a, s.iy, s.iz]).toEqual([0.18, 0.3 * 0.6 ** 3 / 12, 0.6 * 0.3 ** 3 / 12].map((v) => expect.closeTo(v, 12)));
    expect(columnShapeOf(s as never)).toBeNull();
    // Square: β = 1/3 − 0,21·(1 − 1/12) = 0,1408 (the 0,1406 tabulated).
    expect(sectionForShape({ kind: 'rect', b: 0.4, h: 0.4 }).j / 0.4 ** 4).toBeCloseTo(0.1408, 4);
  });
});

describe('column laps set by a person', () => {
  it('survive a save and reopen of the decisions', () => {
    const d = migrateStoredDecisions(JSON.parse(JSON.stringify({ version: 1, locked: [], proposals: {}, copies: [], columnLaps: { '3': 0.9, '4': 0.9, '5': -1 } })));
    expect(d.columnLaps).toEqual({ '3': 0.9, '4': 0.9 });
  });
});
