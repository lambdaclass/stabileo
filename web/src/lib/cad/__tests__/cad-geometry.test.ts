import { describe, it, expect } from 'vitest';
import {
  pruneCollinear, signedArea, toCCW, pointInPolygon,
  decomposeRectilinear, pairWallLines, pointOnSegment,
} from '../geometry';

describe('pruneCollinear', () => {
  it('removes collinear and duplicate vertices', () => {
    const pts = [
      { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }, // mid collinear
      { x: 4, y: 3 }, { x: 4, y: 3 },                  // duplicate
      { x: 0, y: 3 },
    ];
    const out = pruneCollinear(pts, 1e-6);
    expect(out.length).toBe(4);
  });
});

describe('winding', () => {
  it('signedArea sign and toCCW', () => {
    const cw = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 0 }];
    expect(signedArea(cw)).toBeLessThan(0);
    expect(signedArea(toCCW(cw))).toBeGreaterThan(0);
  });
});

describe('pointInPolygon', () => {
  it('classifies interior and exterior points', () => {
    const sq = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
    expect(pointInPolygon({ x: 2, y: 2 }, sq)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 2 }, sq)).toBe(false);
  });
});

describe('decomposeRectilinear', () => {
  it('returns the rectangle itself for a plain rectangle', () => {
    const r = decomposeRectilinear([
      { x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 5 }, { x: 0, y: 5 },
    ]);
    expect(r).not.toBeNull();
    expect(r!.length).toBe(1);
    expect(r![0]).toEqual({ minX: 0, maxX: 6, minY: 0, maxY: 5 });
  });

  it('decomposes an L-shape into 2 rectangles covering the exact area', () => {
    // L: 6×5 minus the 3×2 top-right notch.
    const L = [
      { x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 3 },
      { x: 3, y: 3 }, { x: 3, y: 5 }, { x: 0, y: 5 },
    ];
    const r = decomposeRectilinear(L);
    expect(r).not.toBeNull();
    const area = r!.reduce((s, q) => s + (q.maxX - q.minX) * (q.maxY - q.minY), 0);
    expect(area).toBeCloseTo(6 * 5 - 3 * 2, 9);
    expect(r!.length).toBe(2);
  });

  it('handles a U-shape (two prongs in one strip)', () => {
    const U = [
      { x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 4, y: 4 },
      { x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 },
    ];
    const r = decomposeRectilinear(U);
    expect(r).not.toBeNull();
    const area = r!.reduce((s, q) => s + (q.maxX - q.minX) * (q.maxY - q.minY), 0);
    expect(area).toBeCloseTo(6 * 4 - 2 * 2, 9);
  });

  it('returns null for non-rectilinear outlines (no fake approximation)', () => {
    const tri = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 3 }];
    expect(decomposeRectilinear(tri)).toBeNull();
  });
});

describe('pairWallLines', () => {
  it('pairs parallel faces into a centerline with the gap as thickness', () => {
    const { paired, unpaired } = pairWallLines(
      [
        { a: { x: 0, y: 2.0 }, b: { x: 6, y: 2.0 } },
        { a: { x: 0, y: 2.2 }, b: { x: 6, y: 2.2 } },
      ],
      { minGap: 0.05, maxGap: 0.5 },
    );
    expect(paired.length).toBe(1);
    expect(unpaired.length).toBe(0);
    expect(paired[0].thickness).toBeCloseTo(0.2, 9);
    expect(paired[0].a.y).toBeCloseTo(2.1, 9);
    expect(paired[0].b.y).toBeCloseTo(2.1, 9);
  });

  it('does not pair lines whose gap is outside the wall range', () => {
    const { paired, unpaired } = pairWallLines(
      [
        { a: { x: 0, y: 0 }, b: { x: 6, y: 0 } },
        { a: { x: 0, y: 1.5 }, b: { x: 6, y: 1.5 } }, // 1.5 m apart — not a wall
      ],
      { minGap: 0.05, maxGap: 0.5 },
    );
    expect(paired.length).toBe(0);
    expect(unpaired.length).toBe(2);
  });

  it('does not pair perpendicular lines', () => {
    const { paired } = pairWallLines(
      [
        { a: { x: 0, y: 0 }, b: { x: 6, y: 0 } },
        { a: { x: 3, y: -1 }, b: { x: 3, y: 1 } },
      ],
      { minGap: 0.05, maxGap: 0.5 },
    );
    expect(paired.length).toBe(0);
  });

  it('uses the overlap region for partially overlapping faces', () => {
    const { paired } = pairWallLines(
      [
        { a: { x: 0, y: 0 }, b: { x: 4, y: 0 } },
        { a: { x: 1, y: 0.2 }, b: { x: 5, y: 0.2 } },
      ],
      { minGap: 0.05, maxGap: 0.5 },
    );
    expect(paired.length).toBe(1);
    const xs = [paired[0].a.x, paired[0].b.x].sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(1, 9);
    expect(xs[1]).toBeCloseTo(4, 9);
  });
});

describe('pointOnSegment', () => {
  it('finds interior points and rejects endpoints', () => {
    const a = { x: 0, y: 0 }, b = { x: 6, y: 0 };
    expect(pointOnSegment({ x: 3, y: 0 }, a, b, 1e-3)).toBeCloseTo(0.5, 9);
    expect(pointOnSegment({ x: 0, y: 0 }, a, b, 1e-3)).toBeNull();
    expect(pointOnSegment({ x: 3, y: 0.5 }, a, b, 1e-3)).toBeNull();
  });
});
