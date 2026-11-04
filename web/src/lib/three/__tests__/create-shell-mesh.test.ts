/**
 * CP1 — shell render/thickness/visualization.
 *
 * Pins the geometry contract the rest of the shell stack depends on:
 *  - flat vs extruded ('sections') vertex layout,
 *  - `vertexNodeIndex` (used by the stress heatmap to colour every vertex,
 *    including the extruded slab faces),
 *  - thickness → slab depth along the face normal,
 *  - per-material palette + paint/restore.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  createPlateMesh, createQuadMesh, shellColorForMaterial, paintShell, restoreShellColor, createPhysicalPlateMesh,
} from '../create-shell-mesh';

const V = (x: number, y: number, z: number) => ({ x, y, z });

function faceMeshOf(group: THREE.Group): THREE.Mesh {
  let found: THREE.Mesh | null = null;
  group.traverse((c) => { if (c instanceof THREE.Mesh && c.userData?.shellFace) found = c; });
  if (!found) throw new Error('no shell face mesh');
  return found;
}

describe('shellColorForMaterial', () => {
  it('material 0 keeps the historic teal and wraps the palette', () => {
    expect(shellColorForMaterial(0)).toBe(0x4ecdc4);
    expect(shellColorForMaterial(7)).toBe(shellColorForMaterial(0)); // 7-entry palette wraps
    expect(shellColorForMaterial(undefined)).toBe(0x4ecdc4);
    expect(shellColorForMaterial(1)).not.toBe(shellColorForMaterial(0));
  });
});

describe('flat shell geometry (solid / wireframe)', () => {
  /*
   * These asserted six vertices for a quad and three for a plate — the
   * minimum that draws the shape, and the minimum that can carry a RESULT:
   * four corner colours across two triangles give a seam down the diagonal
   * and a field that is flat everywhere in between. The face is subdivided
   * now, so the count is no longer the invariant; what still has to hold is
   * that the face is exactly the polygon and that every display vertex is a
   * stated combination of its corners. See `shell-contour.test.ts`.
   */
  it('quad flat face is subdivided, and stays inside its own four corners', () => {
    const g = createQuadMesh(V(0, 0, 0), V(1, 0, 0), V(1, 1, 0), V(0, 1, 0), 1, {
      renderMode: 'solid', thickness: 0.2,
    });
    const geo = faceMeshOf(g).geometry;
    const count = geo.getAttribute('position').count;
    expect(count).toBeGreaterThan(6);
    const nodeIdx = geo.userData.vertexNodeIndex as number[];
    expect(nodeIdx.length).toBe(count);
    expect(Math.max(...nodeIdx)).toBe(3);
    expect(Math.min(...nodeIdx)).toBe(0);
    geo.computeBoundingBox();
    const size = new THREE.Vector3();
    geo.boundingBox!.getSize(size);
    expect(size.x).toBeCloseTo(1, 6);
    expect(size.y).toBeCloseTo(1, 6);
    expect(size.z).toBeCloseTo(0, 6);
  });

  it('plate flat face is subdivided over its three corners', () => {
    const g = createPlateMesh(V(0, 0, 0), V(1, 0, 0), V(0, 1, 0), 1, {
      renderMode: 'wireframe', thickness: 0.1,
    });
    const geo = faceMeshOf(g).geometry;
    const count = geo.getAttribute('position').count;
    expect(count).toBeGreaterThan(3);
    const nodeIdx = geo.userData.vertexNodeIndex as number[];
    expect(Math.max(...nodeIdx)).toBe(2);
    expect((geo.userData.vertexNodeWeights as number[][])[0].length).toBe(3);
  });
});

describe('extruded shell geometry (sections = mini rendered model)', () => {
  it('quad slab is a closed prism (36 verts) thickened along its normal', () => {
    const t = 0.3;
    const g = createQuadMesh(V(0, 0, 0), V(2, 0, 0), V(2, 2, 0), V(0, 2, 0), 1, {
      renderMode: 'sections', thickness: t,
    });
    const geo = faceMeshOf(g).geometry;
    // top(2 tris) + bottom(2 tris) + 4 side quads(2 tris each) = 12 tris = 36 verts
    expect(geo.getAttribute('position').count).toBe(36);
    const nodeIdx = geo.userData.vertexNodeIndex as number[];
    expect(nodeIdx.length).toBe(36);
    expect(Math.max(...nodeIdx)).toBe(3); // only corner nodes 0..3
    // Face lies in XY → extrusion is along Z by ±t/2 → z-extent == thickness.
    geo.computeBoundingBox();
    const size = new THREE.Vector3();
    geo.boundingBox!.getSize(size);
    expect(size.z).toBeCloseTo(t, 6);
  });

  it('plate slab is a closed prism (24 verts)', () => {
    const g = createPlateMesh(V(0, 0, 0), V(1, 0, 0), V(0, 1, 0), 1, {
      renderMode: 'sections', thickness: 0.15,
    });
    const geo = faceMeshOf(g).geometry;
    // top(1) + bottom(1) + 3 side quads(2 each) = 8 tris = 24 verts
    expect(geo.getAttribute('position').count).toBe(24);
    expect((geo.userData.vertexNodeIndex as number[]).length).toBe(24);
  });
});

describe('paint / restore', () => {
  it('paints face + edge then restores base colours', () => {
    const base = shellColorForMaterial(2);
    const g = createQuadMesh(V(0, 0, 0), V(1, 0, 0), V(1, 1, 0), V(0, 1, 0), 1, {
      renderMode: 'solid', thickness: 0.2, faceColor: base,
    });
    const faceMat = () => (faceMeshOf(g).material as THREE.MeshStandardMaterial).color.getHex();
    expect(faceMat()).toBe(base);
    paintShell(g, 0x00ffff, 0x00ffff);
    expect(faceMat()).toBe(0x00ffff);
    restoreShellColor(g);
    expect(faceMat()).toBe(base);
  });
});

describe('a physical plate with no mesh', () => {
  // A pentagon in a vertical plane (x = 1), with a square hole.
  const outer = [V(1, 0, 0), V(1, 4, 0), V(1, 5, 2), V(1, 2, 4), V(1, -1, 2)];
  const hole = [V(1, 1, 1), V(1, 2, 1), V(1, 2, 2), V(1, 1, 2)];
  const uv = { outer: outer.map((p) => [p.y, p.z] as [number, number]), holes: [hole.map((p) => [p.y, p.z] as [number, number])] };

  it('is a slab of its thickness in the views that draw thickness, holes and all', () => {
    const t = 0.25;
    const geo = faceMeshOf(createPhysicalPlateMesh(outer, [hole], uv, 7, { renderMode: 'sections', thickness: t })).geometry;
    geo.computeBoundingBox();
    const size = new THREE.Vector3();
    geo.boundingBox!.getSize(size);
    // Thickened along the plane's normal (x), not in its plane.
    expect(size.x).toBeCloseTo(t, 6);
    expect(size.y).toBeCloseTo(6, 6);
    expect(size.z).toBeCloseTo(4, 6);
    // Top and bottom (the triangulation twice) and a wall of two triangles per edge of both loops.
    const tris = geo.getAttribute('position').count / 3;
    const faceTris = (outer.length + hole.length + 2 * 1 - 2);
    expect(tris).toBe(2 * faceTris + 2 * (outer.length + hole.length));
  });

  it('is flat in the other views, and without a thickness', () => {
    for (const [mode, th] of [['solid', 0.25], ['wireframe', 0.25], ['sections', 0]] as const) {
      const geo = faceMeshOf(createPhysicalPlateMesh(outer, [hole], uv, 7, { renderMode: mode, thickness: th })).geometry;
      geo.computeBoundingBox();
      const size = new THREE.Vector3();
      geo.boundingBox!.getSize(size);
      expect(size.x, `${mode} ${th}`).toBeCloseTo(0, 9);
    }
  });
});
