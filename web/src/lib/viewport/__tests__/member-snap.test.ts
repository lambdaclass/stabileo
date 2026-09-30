import { describe, it, expect } from 'vitest';
import { resolveMemberSnap, type MemberSnapInput, type SnapMember, type SnapNode } from '../member-snap';

const tol = { node: 0.3, point: 0.25, member: 0.2, align: 0.15 };
const nodes: SnapNode[] = [
  { id: 1, x: 0, y: 0 }, { id: 2, x: 4, y: 0 },   // a beam along X
  { id: 3, x: 2, y: -2 }, { id: 4, x: 2, y: 2 },  // a post crossing it at (2, 0)
  { id: 5, x: 6, y: 0 }, { id: 6, x: 10, y: 4 },  // an inclined member
];
const at = (id: number) => nodes.find((n) => n.id === id)!;
const members: SnapMember[] = [
  { id: 1, a: at(1), b: at(2) },
  { id: 2, a: at(3), b: at(4) },
  { id: 3, a: at(5), b: at(6) },
];
const snap = (cursor: { x: number; y: number }, extra: Partial<MemberSnapInput> = {}) =>
  resolveMemberSnap({ cursor, grid: null, start: null, nodes, members, tol, ...extra });

describe('member tool snaps', () => {
  it('catches a node before anything else', () => {
    expect(snap({ x: 4.1, y: 0.05 })).toMatchObject({ kind: 'node', nodeId: 2, x: 4, y: 0 });
  });

  it('catches where two members cross', () => {
    expect(snap({ x: 2.1, y: 0.1 })).toMatchObject({ kind: 'intersection', x: 2, y: 0 });
  });

  it('catches a midpoint', () => {
    expect(snap({ x: 8.1, y: 2.05 })).toMatchObject({ kind: 'midpoint', x: 8, y: 2 });
  });

  it('catches the foot of the perpendicular from the start', () => {
    // From (6, 2), the perpendicular foot on the inclined member (6,0)→(10,4) is (7, 1).
    const s = snap({ x: 7.05, y: 0.98 }, { start: { x: 6, y: 2 } });
    expect(s.kind).toBe('perpendicular');
    expect(s.x).toBeCloseTo(7);
    expect(s.y).toBeCloseTo(1);
  });

  it('catches any other point on a member, on the grid when the grid snaps', () => {
    const s = snap({ x: 3.1, y: 0.1 }, { grid: { x: 3, y: 0 } });
    expect(s).toMatchObject({ kind: 'onMember', x: 3, y: 0 });
  });

  it('lines up with the start, level or plumb', () => {
    expect(snap({ x: 12.1, y: 7 }, { start: { x: 12, y: 1 } })).toMatchObject({ kind: 'vertical', x: 12, y: 7 });
    expect(snap({ x: 15, y: 1.05 }, { start: { x: 12, y: 1 } })).toMatchObject({ kind: 'horizontal', x: 15, y: 1 });
  });

  it('falls back to the grid, or to the cursor with the grid off', () => {
    expect(snap({ x: 14.2, y: 8.3 }, { grid: { x: 14, y: 8 } })).toMatchObject({ kind: 'grid', x: 14, y: 8 });
    expect(snap({ x: 14.2, y: 8.3 })).toMatchObject({ kind: 'free', x: 14.2, y: 8.3 });
  });

  it('takes a point on a member within 1 cm of a node as that node', () => {
    const tiny: SnapNode[] = [{ id: 1, x: 0, y: 0 }, { id: 2, x: 0.1, y: 0 }];
    const s = resolveMemberSnap({
      cursor: { x: 0.052, y: 0.001 }, grid: null, start: null, nodes: tiny,
      members: [{ id: 1, a: tiny[0], b: tiny[1] }], tol: { node: 0.001, point: 0.001, member: 0.2, align: 0.1 },
    });
    expect(s.kind).toBe('onMember');
    const e = resolveMemberSnap({
      cursor: { x: 0.095, y: 0.001 }, grid: null, start: null, nodes: tiny,
      members: [{ id: 1, a: tiny[0], b: tiny[1] }], tol: { node: 0.001, point: 0.001, member: 0.2, align: 0.1 },
    });
    // t = 0.95 is on the member, and 5 mm from node 2: it is node 2.
    expect(e).toMatchObject({ kind: 'node', nodeId: 2 });
  });

  it('says what a grid point lands on exactly: a crossing, a member', () => {
    // Far from the crossing, but its grid point is the crossing.
    expect(snap({ x: 2.4, y: 0.4 }, { grid: { x: 2, y: 0 } })).toMatchObject({ kind: 'intersection', x: 2, y: 0 });
    expect(snap({ x: 3.4, y: 0.4 }, { grid: { x: 3, y: 0 } })).toMatchObject({ kind: 'onMember', x: 3, y: 0 });
  });
});
