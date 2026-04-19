// Tests for Z-coordinate preservation in node manipulation functions
// Replicates the pure logic of splitElementAtPoint, mirrorNodes, rotateNodes
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

// ─── mirrorNodes: Z preservation ──────────────────────────

describe('mirrorNodes — Z coordinate', () => {
  function mirrorNode(n: Node, cx: number, cy: number, axis: 'x' | 'y'): Node {
    if (axis === 'x') {
      return { id: n.id, x: 2 * cx - n.x, y: n.y, ...(n.z !== undefined ? { z: n.z } : {}) };
    } else {
      return { id: n.id, x: n.x, y: 2 * cy - n.y, ...(n.z !== undefined ? { z: n.z } : {}) };
    }
  }

  it('preserves Z when mirroring about X axis in 3D', () => {
    const n: Node = { id: 1, x: 3, y: 5, z: 7 };
    const result = mirrorNode(n, 0, 0, 'x');
    expect(result.z).toBe(7);
    expect(result.x).toBe(-3);
    expect(result.y).toBe(5);
  });

  it('preserves Z when mirroring about Y axis in 3D', () => {
    const n: Node = { id: 1, x: 3, y: 5, z: 7 };
    const result = mirrorNode(n, 0, 0, 'y');
    expect(result.z).toBe(7);
    expect(result.x).toBe(3);
    expect(result.y).toBe(-5);
  });

  it('omits Z for 2D nodes', () => {
    const n: Node = { id: 1, x: 3, y: 5 };
    const result = mirrorNode(n, 0, 0, 'x');
    expect(result.z).toBeUndefined();
  });
});

// ─── rotateNodes: Z preservation ──────────────────────────

describe('rotateNodes — Z coordinate', () => {
  function rotateNode(n: Node, cx: number, cy: number, angleDeg: number): Node {
    const rad = angleDeg * Math.PI / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const dx = n.x - cx;
    const dy = n.y - cy;
    return {
      id: n.id,
      x: cx + dx * cosA - dy * sinA,
      y: cy + dx * sinA + dy * cosA,
      ...(n.z !== undefined ? { z: n.z } : {}),
    };
  }

  it('preserves Z when rotating a 3D node by 90 degrees', () => {
    const n: Node = { id: 1, x: 1, y: 0, z: 5 };
    const result = rotateNode(n, 0, 0, 90);
    expect(result.z).toBe(5);
    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(1, 10);
  });

  it('preserves Z when rotating a 3D node by 45 degrees', () => {
    const n: Node = { id: 1, x: 2, y: 0, z: 10 };
    const result = rotateNode(n, 0, 0, 45);
    expect(result.z).toBe(10);
  });

  it('omits Z for 2D nodes', () => {
    const n: Node = { id: 1, x: 1, y: 0 };
    const result = rotateNode(n, 0, 0, 90);
    expect(result.z).toBeUndefined();
  });
});
