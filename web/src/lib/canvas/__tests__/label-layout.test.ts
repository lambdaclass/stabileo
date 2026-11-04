/**
 * Label placement, which is a correctness problem wearing a cosmetic disguise.
 *
 * Two values written on top of each other do not look untidy — they look like
 * the numbers are wrong, because neither can be read. And the reader has no way
 * to tell a rendering collision from a bad result.
 *
 * What is pinned here is the BEHAVIOUR a reader relies on: the biggest number
 * stays where they look for it, everything stays attached to what it describes,
 * and nothing ends up on top of a column.
 */

import { describe, it, expect } from 'vitest';
import { placeLabels, segmentToBox, segmentToBoxes, type LabelBox } from '../label-layout';

const label = (over: Partial<LabelBox> = {}): LabelBox => ({
  x: 100, y: 100, width: 80, height: 14, dirX: 0, dirY: -1, priority: 1, ...over,
});

describe('a label that fits keeps its place', () => {
  it('is not moved when nothing is in the way', () => {
    const [p] = placeLabels([label()]);
    expect(p).toEqual({ x: 100, y: 100, displaced: 0 });
  });

  it('is not moved by an obstacle it does not touch', () => {
    const [p] = placeLabels([label()], [{ x: 400, y: 400, width: 50, height: 20 }]);
    expect(p.displaced).toBe(0);
  });
});

describe('collisions are resolved by magnitude', () => {
  it('the largest keeps its position and the smaller one moves', () => {
    // The whole reason placement is ordered: a reader looks for the biggest
    // number first, so it must be the one that stays put.
    const [small, big] = placeLabels([
      label({ priority: 5 }),
      label({ priority: 50 }),
    ]);
    expect(big.displaced).toBe(0);
    expect(small.displaced).toBeGreaterThan(0);
  });

  it('three at one spot end up stacked, none overlapping', () => {
    const placed = placeLabels([
      label({ priority: 1 }), label({ priority: 3 }), label({ priority: 2 }),
    ]);
    const ys = placed.map((p) => p.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) {
      expect(Math.abs(ys[i] - ys[i - 1])).toBeGreaterThanOrEqual(14);
    }
  });

  it('stacks in magnitude order, biggest nearest the preferred spot', () => {
    // Pushing UP (dirY -1), so the biggest sits lowest — closest to the member
    // it annotates — and the smaller ones climb above it.
    const [a, b, c] = placeLabels([
      label({ priority: 10 }), label({ priority: 30 }), label({ priority: 20 }),
    ]);
    expect(b.y).toBeGreaterThan(c.y);  // 30 below 20
    expect(c.y).toBeGreaterThan(a.y);  // 20 below 10
  });

  it('returns results in INPUT order, not placement order', () => {
    // The caller indexes by its own list; reordering would silently attach
    // every label to the wrong load.
    const placed = placeLabels([
      label({ x: 10, priority: 1 }),
      label({ x: 500, priority: 99 }),
    ]);
    expect(placed[0].x).toBe(10);
    expect(placed[1].x).toBe(500);
  });
});

describe('labels move along their own direction', () => {
  it('a downward label goes down, not up', () => {
    const [, second] = placeLabels([
      label({ priority: 9, dirY: 1 }),
      label({ priority: 1, dirY: 1 }),
    ]);
    expect(second.y).toBeGreaterThan(100);
  });

  it('a sideways label goes sideways', () => {
    const [, second] = placeLabels([
      label({ priority: 9, dirX: 1, dirY: 0 }),
      label({ priority: 1, dirX: 1, dirY: 0 }),
    ]);
    expect(second.x).toBeGreaterThan(100);
    expect(second.y).toBe(100);
  });

  it('one with no direction stays put rather than drifting somewhere arbitrary', () => {
    // Better an overlap the reader can see through than a value floating with
    // no visible connection to anything.
    const [, fixed] = placeLabels([
      label({ priority: 9 }),
      label({ priority: 1, dirX: 0, dirY: 0 }),
    ]);
    expect(fixed.x).toBe(100);
    expect(fixed.y).toBe(100);
  });
});

describe('the structure is an obstacle too', () => {
  it('a label is pushed off a member it would otherwise cross', () => {
    // A value written across a column is exactly as unreadable as one written
    // across another value.
    const column = segmentToBox({ x1: 100, y1: 0, x2: 100, y2: 200 });
    const [p] = placeLabels([label({ dirY: -1, sweep: 'any' })], [column]);
    expect(p.displaced).toBeGreaterThan(0);
    expect(p.x + 40 < 97 || p.x - 40 > 103).toBe(true);
  });

  it('stays put rather than fleeing when its one direction is blocked all the way', () => {
    /*
     * A column taller than the search: sliding up never clears it. Staying is
     * the better failure — the value is still beside the member it belongs to,
     * whereas one parked at the end of the search is both overlapping AND
     * attached to nothing.
     */
    const column = segmentToBox({ x1: 100, y1: -400, x2: 100, y2: 400 });
    const [p] = placeLabels([label({ dirY: -1 })], [column]);
    expect(p).toEqual({ x: 100, y: 100, displaced: 0 });
  });

  it('a segment becomes a box that covers it, with margin', () => {
    const box = segmentToBox({ x1: 10, y1: 20, x2: 60, y2: 20 }, 3);
    expect(box.x).toBe(7);
    expect(box.width).toBe(56);
    // A horizontal line has no height of its own, so the padding IS its height.
    expect(box.height).toBe(6);
  });

  it('gives up gracefully when boxed in on every side', () => {
    // A wall of obstacles along the escape direction. It must still return a
    // finite position rather than loop or fly off screen.
    const wall = Array.from({ length: 20 }, (_, i) => ({
      x: 40, y: 100 - i * 14, width: 200, height: 14,
    }));
    const [p] = placeLabels([label()], wall);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
    expect(p.displaced).toBeLessThanOrEqual(8 * 14);
  });

  it('a diagonal member becomes a chain that follows the line, not its bounding box', () => {
    const boxes = segmentToBoxes({ x1: 0, y1: 0, x2: 200, y2: 200 }, 3, 25);
    expect(boxes.length).toBeGreaterThan(5);

    // The point (180, 20) is inside the bounding box of the diagonal but far
    // from the member itself. A label there must NOT be considered blocked.
    const near = boxes.filter(
      (b) => 180 >= b.x && 180 <= b.x + b.width && 20 >= b.y && 20 <= b.y + b.height,
    );
    expect(near).toHaveLength(0);

    // A point ON the line is still blocked.
    const on = boxes.filter(
      (b) => 100 >= b.x && 100 <= b.x + b.width && 100 >= b.y && 100 <= b.y + b.height,
    );
    expect(on.length).toBeGreaterThan(0);
  });

  it('an axis-aligned member stays a single box', () => {
    expect(segmentToBoxes({ x1: 0, y1: 50, x2: 300, y2: 50 })).toHaveLength(1);
  });
});

describe('anchoring and sweep direction', () => {
  it('a left-anchored label is tested where it will be drawn', () => {
    // Obstacle sitting to the RIGHT of x=100, which a left-aligned label
    // occupies and a centred one only half touches.
    const obstacle = { x: 130, y: 80, width: 40, height: 30 };
    const asLeft = placeLabels([label({ anchorX: 'left' })], [obstacle])[0];
    expect(asLeft.displaced).toBeGreaterThan(0);

    // Far to the left of the anchor: a left-aligned label never reaches it.
    const behind = { x: 0, y: 80, width: 40, height: 30 };
    expect(placeLabels([label({ anchorX: 'left' })], [behind])[0].displaced).toBe(0);
  });

  it('sweep "both" tries the preferred side first, then the other', () => {
    const blocked = { x: 20, y: 80, width: 70, height: 30 };
    const [p] = placeLabels(
      [label({ dirX: -1, dirY: 0, sweep: 'both', anchorX: 'left' })],
      [{ x: 100, y: 90, width: 20, height: 20 }, blocked],
    );
    // It moved, and it did not stop inside the obstacle on the left.
    expect(p.displaced).toBeGreaterThan(0);
    expect(p.x < 100 - 1e-9 || p.x > 100 + 1e-9).toBe(true);
  });

  it('sweep "forward" never moves against its direction', () => {
    const [p] = placeLabels(
      [label({ dirX: 0, dirY: -1 })],
      [{ x: 60, y: 86, width: 80, height: 14 }],
    );
    // Upward only: y strictly decreases, never below the preferred spot.
    expect(p.y).toBeLessThan(100);
  });

  it('stacks distributed loads by magnitude, largest nearest its arrows', () => {
    const big = label({ priority: 100, anchorX: 'left' });
    const mid = label({ priority: 50, anchorX: 'left' });
    const small = label({ priority: 5, anchorX: 'left' });
    // Passed smallest-first on purpose: the result must depend on magnitude,
    // not on the order the loads happen to be stored in.
    const [pSmall, pMid, pBig] = placeLabels([small, mid, big]);
    expect(pBig.y).toBe(100);
    // Upward is decreasing y on a canvas, so "above" means a smaller number.
    expect(pMid.y).toBeLessThan(pBig.y);
    expect(pSmall.y).toBeLessThan(pMid.y);
  });
});

describe('a figure that cannot be zoomed drops what has no room', () => {
  const crowd = () => Array.from({ length: 40 }, (_, i) => label({ dirX: 1, dirY: 0, priority: 40 - i, sweep: 'any' }));
  const box = (l: LabelBox, p: { x: number; y: number }) => ({ x: p.x - l.width / 2, y: p.y - l.height, width: l.width, height: l.height });
  const clash = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

  it('writes no label over another, keeps the largest, and says which it left out', () => {
    const labels = crowd();
    const placed = placeLabels(labels, [], undefined, undefined, { drop: true });
    const shown = placed.map((p, i) => ({ p, i })).filter(({ p }) => !p.hidden);
    expect(shown.length).toBeGreaterThan(1);
    expect(shown.length).toBeLessThan(labels.length);
    expect(placed[0]!.hidden).toBeFalsy();
    for (const a of shown) for (const b of shown) {
      if (a.i < b.i) expect(clash(box(labels[a.i]!, a.p), box(labels[b.i]!, b.p)), `${a.i}/${b.i}`).toBe(false);
    }
  });

  it('puts a label over a member rather than leave it out when only the member is in the way', () => {
    const member = segmentToBox({ x1: 0, y1: 95, x2: 1000, y2: 95 }, 200);
    const [p] = placeLabels([label({ dirX: 0, dirY: -1 })], [member], undefined, undefined, { drop: true });
    expect(p!.hidden).toBeFalsy();
  });

  it('on screen, still draws them all', () => {
    expect(placeLabels(crowd()).every((p) => !p.hidden)).toBe(true);
  });
});
