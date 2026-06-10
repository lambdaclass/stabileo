/**
 * Curved member generation (PR [8] QA-C).
 *
 * Curved members live in the MEMBER workflow (ProElementsTab "Curved Members"):
 * a 3-node arc is fit to a circle and expanded into straight frame chords, so
 * results map back through the normal frame machinery. This pins arcPolyline
 * (the actual app function) and verifies the RC QA Diagnostic Shells fixture's
 * curved balcony beam is the SAME arc the app would generate.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { arcPolyline, type V3 } from '../curved-beam';

describe('arcPolyline — geometry', () => {
  it('returns segments+1 points, endpoints pinned exactly', () => {
    const pts = arcPolyline({ x: 0, y: 4, z: 3 }, { x: 3, y: 5, z: 3 }, { x: 6, y: 4, z: 3 }, 6);
    expect(pts.length).toBe(7);
    expect(pts[0]).toEqual({ x: 0, y: 4, z: 3 });
    expect(pts[6]).toEqual({ x: 6, y: 4, z: 3 });
  });

  it('all sampled points lie on the fitted circle (centre (3,0,3), r=5)', () => {
    const pts = arcPolyline({ x: 0, y: 4, z: 3 }, { x: 3, y: 5, z: 3 }, { x: 6, y: 4, z: 3 }, 6);
    for (const p of pts) {
      const r = Math.hypot(p.x - 3, p.y - 0, p.z - 3);
      expect(r).toBeCloseTo(5, 6);
    }
    // The arc actually bulges toward the mid point (apex y > endpoints' y).
    const apex = pts[3];
    expect(apex.y).toBeGreaterThan(4);
  });

  it('collinear input falls back to a straight line', () => {
    const pts = arcPolyline({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, 4);
    expect(pts.length).toBe(5);
    for (let i = 0; i < pts.length; i++) expect(pts[i].x).toBeCloseTo(i, 9);
    expect(pts.every(p => p.y === 0 && p.z === 0)).toBe(true);
  });

  it('clamps segments to ≥ 1', () => {
    expect(arcPolyline({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 2, y: 0, z: 0 }, 0).length).toBe(2);
  });
});

describe('curved beam in the RC QA Diagnostic Shells fixture', () => {
  it('the fixture contains the arc nodes the app would generate', () => {
    const json = JSON.parse(readFileSync('src/lib/templates/fixtures/rc-qa-diagnostic-shells.json', 'utf8'));
    const pts = arcPolyline({ x: 0, y: 4, z: 3 }, { x: 3, y: 5, z: 3 }, { x: 6, y: 4, z: 3 }, 6);
    const has = (p: V3) => json.nodes.some(
      (n: any) => Math.abs(n.x - p.x) < 1e-4 && Math.abs(n.y - p.y) < 1e-4 && Math.abs((n.z ?? 0) - p.z) < 1e-4,
    );
    // The 5 interior arc points (endpoints are slab corners) must exist as nodes.
    for (let i = 1; i < pts.length - 1; i++) expect(has(pts[i])).toBe(true);
    // …and be wired as a connected chain of 6 frame elements.
    const ids = pts.map(p => json.nodes.find(
      (n: any) => Math.abs(n.x - p.x) < 1e-4 && Math.abs(n.y - p.y) < 1e-4 && Math.abs((n.z ?? 0) - p.z) < 1e-4)!.id);
    for (let i = 0; i < ids.length - 1; i++) {
      const a = ids[i], b = ids[i + 1];
      expect(json.elements.some((e: any) => (e.nodeI === a && e.nodeJ === b) || (e.nodeI === b && e.nodeJ === a))).toBe(true);
    }
  });
});
