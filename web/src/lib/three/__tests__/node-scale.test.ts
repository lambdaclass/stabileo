import { describe, it, expect } from 'vitest';
import {
  nodeRadiusFor, nodeRadiusForSections, diagonalOf,
  MIN_NODE_RADIUS_M, MAX_NODE_RADIUS_M,
} from '../node-scale';

describe('the radius follows the model', () => {
  it('grows with the model, which is the whole point', () => {
    const small = nodeRadiusFor({ diagonalM: 10 });
    const large = nodeRadiusFor({ diagonalM: 40 });
    expect(large).toBeGreaterThan(small);
  });

  /*
   * The fixed 0.07 m this replaces was tuned for a mid-sized frame and was wrong at both ends: a
   * third of a member on a 2 m model, a speck on a 30 m shed.
   */
  it('keeps roughly the old value where the old value was right', () => {
    // A 20 m frame is the scale the 7 cm default suited.
    expect(nodeRadiusFor({ diagonalM: 20 })).toBeCloseTo(0.05, 2);
  });

  it('is clamped at both ends', () => {
    expect(nodeRadiusFor({ diagonalM: 1 })).toBe(MIN_NODE_RADIUS_M);
    expect(nodeRadiusFor({ diagonalM: 1000 })).toBe(MAX_NODE_RADIUS_M);
  });

  /*
   * The floor is a PICKING floor. `NodesInstanced` raycasts the visible mesh, so the marker is
   * the click target — a radius that shrank without a floor would make nodes unselectable before
   * it made them invisible, which is the worse failure.
   */
  it('never returns something too small to hit', () => {
    for (const d of [0, -1, Number.NaN, 0.001, 5]) {
      expect(nodeRadiusFor({ diagonalM: d }), String(d)).toBeGreaterThanOrEqual(MIN_NODE_RADIUS_M);
    }
  });

  it('a single-node model still shows its node', () => {
    expect(nodeRadiusFor({ diagonalM: diagonalOf([{ x: 1, y: 2, z: 3 }]) })).toBe(MIN_NODE_RADIUS_M);
  });
});

describe('the section view halves it, and no further', () => {
  it('is smaller than the ordinary marker on a large model', () => {
    const e = { diagonalM: 40 };
    expect(nodeRadiusForSections(e)).toBeLessThan(nodeRadiusFor(e));
  });

  /*
   * A node clickable in wireframe and not in section view would be worse than a large marker.
   * The halving stops at the same floor.
   */
  it('never drops below the picking floor', () => {
    for (const d of [1, 5, 10, 20, 100]) {
      expect(nodeRadiusForSections({ diagonalM: d }), String(d)).toBeGreaterThanOrEqual(MIN_NODE_RADIUS_M);
    }
  });
});

describe('diagonalOf', () => {
  it('measures the bounding box, in three dimensions', () => {
    expect(diagonalOf([{ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }])).toBeCloseTo(5, 9);
    expect(diagonalOf([{ x: 0, y: 0, z: 0 }, { x: 1, y: 2, z: 2 }])).toBeCloseTo(3, 9);
  });

  it('treats a missing z as zero, so a 2-D model measures as one', () => {
    expect(diagonalOf([{ x: 0, y: 0 }, { x: 3, y: 4 }])).toBeCloseTo(5, 9);
  });

  it('is zero for nothing, and for a single point', () => {
    expect(diagonalOf([])).toBe(0);
    expect(diagonalOf([{ x: 5, y: 5, z: 5 }])).toBe(0);
  });
});

describe('the shed, which is the model this was measured against', () => {
  it('gets a marker between the two clamps', () => {
    // The industrial shed spans roughly 20 m by 24 m by 8 m.
    const d = diagonalOf([{ x: 0, y: 0, z: 0 }, { x: 20, y: 24, z: 8 }]);
    const r = nodeRadiusFor({ diagonalM: d });
    expect(r).toBeGreaterThan(MIN_NODE_RADIUS_M);
    expect(r).toBeLessThan(MAX_NODE_RADIUS_M);
  });
});
