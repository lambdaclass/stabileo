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
  createPlateMesh, createQuadMesh, shellColorForMaterial, paintShell, restoreShellColor,
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
  it('quad flat face has 6 verts mapped 0-1-2-0-2-3', () => {
    const g = createQuadMesh(V(0, 0, 0), V(1, 0, 0), V(1, 1, 0), V(0, 1, 0), 1, {
      renderMode: 'solid', thickness: 0.2,
    });
    const geo = faceMeshOf(g).geometry;
    expect(geo.getAttribute('position').count).toBe(6);
    expect(geo.userData.vertexNodeIndex).toEqual([0, 1, 2, 0, 2, 3]);
  });

  it('plate flat face has 3 verts mapped 0-1-2', () => {
    const g = createPlateMesh(V(0, 0, 0), V(1, 0, 0), V(0, 1, 0), 1, {
      renderMode: 'wireframe', thickness: 0.1,
    });
    const geo = faceMeshOf(g).geometry;
    expect(geo.getAttribute('position').count).toBe(3);
    expect(geo.userData.vertexNodeIndex).toEqual([0, 1, 2]);
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
