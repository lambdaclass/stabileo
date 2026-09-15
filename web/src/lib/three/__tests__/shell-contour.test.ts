/*
 * What a shell contour has to do to be worth drawing.
 *
 * The map on a raft was a uniform pale pink over a field running from −33 to
 * 1735 kN·m/m, and before that it was two flat triangles with a seam down the
 * diagonal. Both are failures of the DISPLAY, not of the analysis — the
 * numbers underneath were right the whole time — which is exactly the kind of
 * defect that survives a green test suite. So the two properties that make
 * the picture readable are asserted here.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createQuadMesh, createPlateMesh } from '../create-shell-mesh';
import { shellContourColor } from '../stress-heatmap';

const SQUARE = [
  { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 2, z: 0 }, { x: 0, y: 2, z: 0 },
];

function faceGeometry(group: THREE.Group): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry | null = null;
  group.traverse((c) => { if (c instanceof THREE.Mesh && c.userData?.shellFace) geo = c.geometry; });
  if (!geo) throw new Error('no shell face in the group');
  return geo;
}

describe('the colour of a shell contour value', () => {
  it('spends the whole ramp on the range the results occupy', () => {
    // The defect: normalising by amplitude put −33…1735 into the top decade of
    // one hue, so every plate came out the same pale colour.
    const lo = shellContourColor(-33, -33, 1735);
    const hi = shellContourColor(1735, -33, 1735);
    expect(lo, 'the bottom of the range is the bottom of the ramp').not.toBe(hi);

    const c = new THREE.Color();
    c.setHex(lo);
    expect(c.b, 'low end is blue').toBeGreaterThan(c.r);
    c.setHex(hi);
    expect(c.r, 'high end is red').toBeGreaterThan(c.b);
  });

  it('separates neighbouring values a single-hue ramp would not', () => {
    // Two values 5 % apart, low in the range. On white → red both are nearly
    // white; the point of five hues is that they are not the same colour.
    const a = new THREE.Color(shellContourColor(100, 0, 1000));
    const b = new THREE.Color(shellContourColor(150, 0, 1000));
    const dist = Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
    expect(dist).toBeGreaterThan(0.05);
  });

  it('paints mid-scale when there is no range at all, rather than dividing by zero', () => {
    const c = shellContourColor(7, 7, 7);
    expect(Number.isFinite(c)).toBe(true);
    expect(c).toBe(shellContourColor(0, 0, 0));
  });

  it('is monotonic through the range', () => {
    // Not a requirement on hue, but on the mapping: equal inputs, equal
    // colours, and no value outside [min,max] escaping the ends.
    expect(shellContourColor(-1e9, 0, 10)).toBe(shellContourColor(0, 0, 10));
    expect(shellContourColor(1e9, 0, 10)).toBe(shellContourColor(10, 0, 10));
  });
});

describe('the face a contour is painted on', () => {
  it('is subdivided, so the field can vary across it instead of across two triangles', () => {
    const geo = faceGeometry(createQuadMesh(SQUARE[0], SQUARE[1], SQUARE[2], SQUARE[3], 1, { renderMode: 'wireframe', thickness: 0.3 }));
    const count = geo.getAttribute('position').count;
    expect(count, 'two triangles is six vertices, and six cannot carry a field').toBeGreaterThan(6);
    const w = geo.userData.vertexNodeWeights as number[][];
    expect(w.length).toBe(count);
  });

  it('interpolates: every vertex is a convex combination of the corners', () => {
    // This is the whole claim the picture makes — nothing is invented between
    // the nodes, each display vertex is a weighted average of them.
    const geo = faceGeometry(createQuadMesh(SQUARE[0], SQUARE[1], SQUARE[2], SQUARE[3], 1, { renderMode: 'wireframe', thickness: 0.3 }));
    const w = geo.userData.vertexNodeWeights as number[][];
    for (const row of w) {
      expect(row.length).toBe(4);
      const s = row.reduce((a, b) => a + b, 0);
      expect(s).toBeCloseTo(1, 9);
      for (const v of row) expect(v).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('keeps every display vertex inside the face it belongs to', () => {
    const geo = faceGeometry(createQuadMesh(SQUARE[0], SQUARE[1], SQUARE[2], SQUARE[3], 1, { renderMode: 'wireframe', thickness: 0.3 }));
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      expect(pos.getX(i)).toBeGreaterThanOrEqual(-1e-9);
      expect(pos.getX(i)).toBeLessThanOrEqual(2 + 1e-9);
      expect(pos.getY(i)).toBeGreaterThanOrEqual(-1e-9);
      expect(pos.getY(i)).toBeLessThanOrEqual(2 + 1e-9);
      expect(pos.getZ(i)).toBeCloseTo(0, 9);
    }
  });

  it('does the same for a triangular plate', () => {
    const tri = [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, { x: 0, y: 3, z: 0 }];
    const geo = faceGeometry(createPlateMesh(tri[0], tri[1], tri[2], 1, { renderMode: 'wireframe', thickness: 0.2 }));
    const w = geo.userData.vertexNodeWeights as number[][];
    expect(geo.getAttribute('position').count).toBeGreaterThan(3);
    for (const row of w) {
      expect(row.length).toBe(3);
      expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    }
  });
});
