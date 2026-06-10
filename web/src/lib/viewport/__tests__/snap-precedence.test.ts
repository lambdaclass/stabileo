/**
 * Snap precedence regression test.
 *
 * Bug: with grid snap enabled, drawing an element to an off-grid existing
 * node would silently fail because the node search ran from the
 * grid-snapped position, missing nodes further than `nodeThreshold` from
 * the nearest grid intersection. The user had to disable grid snap to
 * connect cleanly.
 *
 * Fix: snapWithMidpoint searches for nodes from the RAW cursor position.
 * Grid snap is the fallback when no node and no midpoint match.
 */

import { describe, it, expect } from 'vitest';
import { snapWithMidpoint } from '../spatial-queries';
import type { Node, Element } from '../../store/model.svelte';

const elements = new Map<number, Element>();

// Grid snap to a 1m grid — same shape uiStore.snapWorld returns.
const gridSnap = (x: number, y: number) => ({ x: Math.round(x), y: Math.round(y) });

function nodes(...entries: Array<[number, number, number]>): Map<number, Node> {
  const m = new Map<number, Node>();
  for (const [id, x, y] of entries) m.set(id, { id, x, y });
  return m;
}

describe('snapWithMidpoint — node snap takes precedence over grid snap', () => {
  it('cursor directly on an off-grid node returns the node coords (was: grid-snapped, missing the node)', () => {
    // Node at (1.7, 2.3) — distance to nearest grid intersection (2, 2)
    // is sqrt(0.09 + 0.09) ≈ 0.42, within the 0.5 threshold for THIS spot.
    // But cursor at (1.7, 2.3) and gridSnap → (2, 2). Old code searched from
    // (2, 2), found the node within 0.42m. So this case was actually OK.
    const ns = nodes([1, 1.7, 2.3]);
    const r = snapWithMidpoint(1.7, 2.3, gridSnap, ns, elements);
    expect(r).toEqual({ x: 1.7, y: 2.3 });
  });

  it('cursor on a node that is far from any grid intersection — old code missed it, new code finds it', () => {
    // Node at (3.0, 3.4). Cursor exactly on top.
    // gridSnap(3.0, 3.4) = (3, 3). Distance from (3, 3) to node is 0.4 — within
    // the 0.5 threshold (so this still worked under old code).
    // Now bump the offset: node at (3.0, 3.49). Grid snap → (3, 3). Distance
    // from grid snap to node is 0.49, still within threshold. Bump further:
    // node at (3.4, 3.4). Grid snap → (3, 3). Distance 0.566 — OUTSIDE 0.5.
    // Old code: findNearestNode((3,3), 0.5) misses → returns gridSnapped = (3,3).
    // New code: findNearestNode((3.4, 3.4), 0.5) hits → returns node coords.
    const ns = nodes([7, 3.4, 3.4]);
    const r = snapWithMidpoint(3.4, 3.4, gridSnap, ns, elements);
    expect(r).toEqual({ x: 3.4, y: 3.4 });
  });

  it('cursor near (but not on) an off-grid node — node still wins if within nodeThreshold of raw cursor', () => {
    // Node at (5.0, 5.4). Cursor at (5.05, 5.42). Distance ≈ 0.054 — well within 0.5.
    // gridSnap(5.05, 5.42) = (5, 5). Distance from (5, 5) to node is 0.4.
    // Old code: search from (5, 5) within 0.5 → finds node at (5.0, 5.4) ✓.
    // New code: search from (5.05, 5.42) within 0.5 → finds same node ✓.
    // Both behaviors agree here. The point: precedence didn't break the
    // already-working grid-aligned case.
    const ns = nodes([2, 5.0, 5.4]);
    const r = snapWithMidpoint(5.05, 5.42, gridSnap, ns, elements);
    expect(r).toEqual({ x: 5.0, y: 5.4 });
  });

  it('cursor far from any node — falls back to grid snap', () => {
    // Node at (0, 0), cursor at (10.3, 10.4). Far from both nodes and elements.
    // Should grid-snap to (10, 10).
    const ns = nodes([1, 0, 0]);
    const r = snapWithMidpoint(10.3, 10.4, gridSnap, ns, elements);
    expect(r).toEqual({ x: 10, y: 10 });
  });

  it('cursor between two nodes — picks the one closer to the raw cursor', () => {
    // Node A on-grid at (2, 2). Node B off-grid at (3.4, 2). Cursor at (3.0, 2).
    // Distance to A: 1.0. Distance to B: 0.4. B is closer.
    // Old code: gridSnap(3.0, 2) = (3, 2). findNearestNode((3, 2), 0.5):
    //   distance from (3,2) to A=(2,2) is 1.0 (out), to B=(3.4,2) is 0.4 (in).
    //   Picks B. New code picks B too (raw cursor 0.4 from B). Both agree.
    // Honest case: no regression on the proximity-based pick.
    const ns = nodes([1, 2, 2], [2, 3.4, 2]);
    const r = snapWithMidpoint(3.0, 2, gridSnap, ns, elements);
    expect(r).toEqual({ x: 3.4, y: 2 });
  });

  it('cursor at a grid intersection that has no node — uses grid (no false-positive node)', () => {
    // Empty model. Cursor at (4, 4) — already on grid. gridSnap is identity.
    // Should return (4, 4) via grid fallback.
    const ns = nodes();
    const r = snapWithMidpoint(4, 4, gridSnap, ns, elements);
    expect(r).toEqual({ x: 4, y: 4 });
  });
});
