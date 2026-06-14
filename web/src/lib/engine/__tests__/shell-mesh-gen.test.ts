// Regression tests for the bilinear quad-grid mesher extracted from
// ProShellTab (PR [9]). Pins the exact node placement, corner-id reuse,
// welding behaviour, and cell connectivity of the original in-component code.
import { describe, it, expect } from 'vitest';
import { buildBilinearQuadGrid, type MeshVec3 } from '../shell-mesh-gen';
import { findCoincidentNode } from '../mesh-weld';

interface TestNode { id: number; x: number; y: number; z?: number }

function makeHooks(initial: TestNode[] = []) {
  const nodes: TestNode[] = [...initial];
  const quads: Array<[number, number, number, number]> = [];
  let nextId = initial.reduce((m, n) => Math.max(m, n.id), 0) + 1;
  return {
    nodes,
    quads,
    hooks: {
      findNode: (x: number, y: number, z: number) => findCoincidentNode(nodes, x, y, z),
      addNode: (x: number, y: number, z: number) => {
        const id = nextId++;
        nodes.push({ id, x, y, z });
        return id;
      },
      addQuad: (ns: [number, number, number, number]) => { quads.push(ns); },
    },
  };
}

const FLAT: [MeshVec3, MeshVec3, MeshVec3, MeshVec3] = [
  { x: 0, y: 0, z: 0 },
  { x: 4, y: 0, z: 0 },
  { x: 4, y: 2, z: 0 },
  { x: 0, y: 2, z: 0 },
];

describe('buildBilinearQuadGrid', () => {
  it('2×2 grid: 9 grid slots, bilinear interior node, 4 cells', () => {
    const t = makeHooks();
    const r = buildBilinearQuadGrid(FLAT, 2, 2, t.hooks);
    expect(r.nodeGrid.length).toBe(3);
    expect(r.nodeGrid[0].length).toBe(3);
    expect(r.newNodes).toBe(9);
    expect(r.quadCount).toBe(4);
    // Center node is the bilinear midpoint.
    const centerId = r.nodeGrid[1][1];
    const center = t.nodes.find((n) => n.id === centerId)!;
    expect(center.x).toBeCloseTo(2, 12);
    expect(center.y).toBeCloseTo(1, 12);
  });

  it('reuses supplied corner ids verbatim (ProShellTab flow)', () => {
    const corners: TestNode[] = [
      { id: 11, x: 0, y: 0, z: 0 }, { id: 12, x: 4, y: 0, z: 0 },
      { id: 13, x: 4, y: 2, z: 0 }, { id: 14, x: 0, y: 2, z: 0 },
    ];
    const t = makeHooks(corners);
    const r = buildBilinearQuadGrid(FLAT, 2, 2, t.hooks, [11, 12, 13, 14]);
    expect(r.nodeGrid[0][0]).toBe(11);
    expect(r.nodeGrid[0][2]).toBe(12);
    expect(r.nodeGrid[2][2]).toBe(13);
    expect(r.nodeGrid[2][0]).toBe(14);
    expect(r.newNodes).toBe(5); // 9 slots − 4 corners
  });

  it('welds to pre-existing coincident nodes instead of duplicating', () => {
    // Pre-existing node exactly at the (2, 0) bottom edge midpoint.
    const t = makeHooks([{ id: 99, x: 2, y: 0, z: 0 }]);
    const r = buildBilinearQuadGrid(FLAT, 2, 2, t.hooks);
    expect(r.nodeGrid[0][1]).toBe(99);
    expect(r.newNodes).toBe(8);
  });

  it('cell connectivity follows the c0→c1→c2→c3 convention', () => {
    const t = makeHooks();
    const r = buildBilinearQuadGrid(FLAT, 1, 1, t.hooks);
    expect(r.quadCount).toBe(1);
    expect(t.quads[0]).toEqual([
      r.nodeGrid[0][0], r.nodeGrid[0][1], r.nodeGrid[1][1], r.nodeGrid[1][0],
    ]);
  });

  it('non-rectangular quads interpolate bilinearly (skewed region)', () => {
    const skew: [MeshVec3, MeshVec3, MeshVec3, MeshVec3] = [
      { x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 },
      { x: 5, y: 3, z: 0 }, { x: 1, y: 3, z: 0 },
    ];
    const t = makeHooks();
    const r = buildBilinearQuadGrid(skew, 2, 2, t.hooks);
    const center = t.nodes.find((n) => n.id === r.nodeGrid[1][1])!;
    expect(center.x).toBeCloseTo((0 + 4 + 5 + 1) / 4, 12);
    expect(center.y).toBeCloseTo((0 + 0 + 3 + 3) / 4, 12);
  });

  it('vertical regions (walls) mesh in 3D', () => {
    const wall: [MeshVec3, MeshVec3, MeshVec3, MeshVec3] = [
      { x: 0, y: 2.1, z: 0 }, { x: 6, y: 2.1, z: 0 },
      { x: 6, y: 2.1, z: 3 }, { x: 0, y: 2.1, z: 3 },
    ];
    const t = makeHooks();
    const r = buildBilinearQuadGrid(wall, 2, 1, t.hooks);
    expect(r.quadCount).toBe(2);
    const mid = t.nodes.find((n) => n.id === r.nodeGrid[0][1])!;
    expect(mid.x).toBeCloseTo(3, 12);
    expect(mid.z ?? 0).toBeCloseTo(0, 12);
  });

  // ProShellTab target-size: nx/ny = round(edgeLength / targetSize), so a large
  // picked region gets proportionally more cells than a small one (uniform size)
  // — versus a fixed Nx×Ny that would make tiny/huge elements by region size.
  it('target-size divisions scale with picked-region edge length', () => {
    const divs = (L: number, target: number) => Math.max(1, Math.round(L / target));
    expect(divs(10, 1)).toBe(10);
    expect(divs(2, 1)).toBe(2);
    expect(divs(0.4, 1)).toBe(1); // never zero
    // Big region → ~target cells; small region → fewer, comparable element size.
    const big: [MeshVec3, MeshVec3, MeshVec3, MeshVec3] = [
      { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 6, z: 0 }, { x: 0, y: 6, z: 0 },
    ];
    const t = makeHooks();
    const r = buildBilinearQuadGrid(big, divs(10, 1), divs(6, 1), t.hooks);
    expect(r.quadCount).toBe(60); // 10×6 one-metre cells
  });
});
