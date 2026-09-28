// Tests for Z-coordinate preservation in node manipulation functions
// The split replicates the pure logic of splitElementAtPoint; mirror and rotate run the edit layer.
// to verify Z is preserved for 3D models.

import { describe, it, expect } from 'vitest';

interface Node {
  id: number;
  x: number;
  y: number;
  z?: number;
}

// ─── splitElementAtPoint: new node Z preservation ─────────

describe('splitElementAtPoint — Z coordinate', () => {
  // Replicate the interpolation + node creation logic from model.svelte.ts
  function computeSplitNode(ni: Node, nj: Node, t: number): { x: number; y: number; z?: number } {
    const px = ni.x + t * (nj.x - ni.x);
    const py = ni.y + t * (nj.y - ni.y);
    const hasZ = ni.z !== undefined || nj.z !== undefined;
    const pz = (ni.z ?? 0) + t * ((nj.z ?? 0) - (ni.z ?? 0));
    return { x: px, y: py, ...(hasZ ? { z: pz } : {}) };
  }

  it('preserves Z when splitting a 3D element at midpoint', () => {
    const ni: Node = { id: 1, x: 0, y: 0, z: 0 };
    const nj: Node = { id: 2, x: 10, y: 0, z: 6 };
    const result = computeSplitNode(ni, nj, 0.5);
    expect(result.z).toBe(3);
  });

  it('preserves Z when splitting at t=0.25 with non-zero Z on both ends', () => {
    const ni: Node = { id: 1, x: 0, y: 0, z: 2 };
    const nj: Node = { id: 2, x: 8, y: 4, z: 10 };
    const result = computeSplitNode(ni, nj, 0.25);
    expect(result.z).toBe(4); // 2 + 0.25*(10-2) = 4
  });

  it('omits Z for 2D nodes (no z on either end)', () => {
    const ni: Node = { id: 1, x: 0, y: 0 };
    const nj: Node = { id: 2, x: 10, y: 0 };
    const result = computeSplitNode(ni, nj, 0.5);
    expect(result.z).toBeUndefined();
  });

  it('includes Z when only one node has z defined', () => {
    const ni: Node = { id: 1, x: 0, y: 0, z: 4 };
    const nj: Node = { id: 2, x: 10, y: 0 }; // z undefined, treated as 0
    const result = computeSplitNode(ni, nj, 0.5);
    expect(result.z).toBe(2); // 4 + 0.5*(0-4) = 2
  });

  it('element length includes Z for 3D models', () => {
    const ni: Node = { id: 1, x: 0, y: 0, z: 0 };
    const nj: Node = { id: 2, x: 3, y: 4, z: 5 };
    // Correct 3D length: sqrt(9+16+25) = sqrt(50)
    const dz = (nj.z ?? 0) - (ni.z ?? 0);
    const L = Math.sqrt((nj.x - ni.x) ** 2 + (nj.y - ni.y) ** 2 + dz * dz);
    expect(L).toBeCloseTo(Math.sqrt(50), 10);
  });

  it('duplicate node check includes Z for 3D models', () => {
    const px = 5, py = 0, pz = 3;
    const existingNode: Node = { id: 99, x: 5, y: 0, z: 3 };
    // A proper 3D duplicate check must also compare Z
    const isDuplicate =
      Math.abs(existingNode.x - px) < 0.01 &&
      Math.abs(existingNode.y - py) < 0.01 &&
      Math.abs((existingNode.z ?? 0) - pz) < 0.01;
    expect(isDuplicate).toBe(true);

    // A node at same XY but different Z should NOT be a duplicate
    const differentZNode: Node = { id: 100, x: 5, y: 0, z: 10 };
    const isDuplicate2 =
      Math.abs(differentZNode.x - px) < 0.01 &&
      Math.abs(differentZNode.y - py) < 0.01 &&
      Math.abs((differentZNode.z ?? 0) - pz) < 0.01;
    expect(isDuplicate2).toBe(false);
  });
});

// ─── Mirror and rotate in place: Z preservation ───────────
// These used to replicate the store's own mirrorNodes / rotateNodes. Those are gone: the context
// menu mirrors and rotates through the edit layer, and this runs that code.

import { beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { mirrorSelectionInPlace, rotateSelectionInPlace } from '../../model/edit/transform-in-place';

describe('mirror and rotate in place — Z coordinate', () => {
  beforeEach(() => modelStore.clear());
  const setup = () => [modelStore.addNode(0, 0, 3), modelStore.addNode(4, 2, 5)];

  it('a mirror normal to X keeps every z', () => {
    const [a, b] = setup();
    mirrorSelectionInPlace([a!, b!], 'x');
    expect(modelStore.nodes.get(a!)).toMatchObject({ x: 4, y: 0, z: 3 });
    expect(modelStore.nodes.get(b!)).toMatchObject({ x: 0, y: 2, z: 5 });
  });

  it('a rotation about the vertical keeps every z', () => {
    const [a, b] = setup();
    rotateSelectionInPlace([a!, b!], 90);
    for (const [id, z] of [[a!, 3], [b!, 5]] as const) expect(modelStore.nodes.get(id)!.z).toBeCloseTo(z, 12);
  });
});
