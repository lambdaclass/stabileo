/**
 * A column standing inside a slab with no beam round it (a flat slab, a waffle slab on its drop
 * panels) is a vertex of the slab's mesh, so the slab rests on it: meshed, the region welds to the
 * column's node and the two share it. Before, the mesher placed fixed points on the boundary only,
 * and a column inside a region was left beside its slab, unconnected.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import '../../../store/index';
import { generateMesh } from '../mesher';
import { applyMesh } from '../mesh-apply';

describe('fixed points inside a region', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('the mesher makes an interior fixed point a vertex, the lattice giving way round it', () => {
    const outer = { kind: 'polygon' as const, points: [[0, 0, 3], [8, 0, 3], [8, 6, 3], [0, 6, 3]] as Array<[number, number, number]> };
    const plain = generateMesh({ outer, holes: [], size: 1, element: 'quad' })!;
    expect(plain.structured).toBe(true);
    const col: [number, number, number] = [3.3, 2.7, 3];
    const m = generateMesh({ outer, holes: [], size: 1, element: 'quad', fixedPoints: [col] })!;
    expect(m.structured).toBe(false);
    const hit = m.points.filter((p) => Math.hypot(p[0] - col[0], p[1] - col[1], p[2] - col[2]) < 1e-9);
    expect(hit).toHaveLength(1);
    // The point is used by cells, and no other point crowds it.
    const k = m.points.indexOf(hit[0]!);
    expect(m.cells.some((c) => c.includes(k))).toBe(true);
    const nearest = Math.min(...m.points.filter((_, i) => i !== k).map((p) => Math.hypot(p[0] - col[0], p[1] - col[1])));
    expect(nearest).toBeGreaterThan(0.2);
  });

  it("meshed onto the model, the slab shares the column's node", () => {
    const base = modelStore.addNode(3.3, 2.7, 0), top = modelStore.addNode(3.3, 2.7, 3);
    modelStore.addElement(base, top);
    const r = applyMesh({ outer: { kind: 'polygon', points: [[0, 0, 3], [8, 0, 3], [8, 6, 3], [0, 6, 3]] }, holes: [], size: 1, element: 'quad' }, { materialId: 1, thickness: 0.2, splitBeams: true })!;
    expect(r.nodeIds).toContain(top);
    expect([...modelStore.quads.values()].some((q) => q.nodes.includes(top))).toBe(true);
  });
});

describe('a beam across the inside of a region', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('is followed by the mesh: every piece of it is an edge of the slab\'s cells', () => {
    const a = modelStore.addNode(0, 2.3, 3), b = modelStore.addNode(8, 2.9, 3);
    modelStore.addElement(a, b);
    const outer = { kind: 'polygon' as const, points: [[0, 0, 3], [8, 0, 3], [8, 6, 3], [0, 6, 3]] as Array<[number, number, number]> };
    applyMesh({ outer, holes: [], size: 1, element: 'quad' }, { materialId: 1, thickness: 0.2, splitBeams: true });
    // The beam is cut into pieces, each with both ends on one quad: the slab is its flange.
    const pieces = [...modelStore.elements.values()].filter((e) => {
      const p = modelStore.nodes.get(e.nodeI)!, q = modelStore.nodes.get(e.nodeJ)!;
      const onLine = (n: { x: number; y: number }) => Math.abs((n.y - 2.3) - (n.x * 0.6) / 8) < 1e-6;
      return onLine(p) && onLine(q);
    });
    expect(pieces.length).toBeGreaterThan(4);
    const quads = [...modelStore.quads.values()];
    for (const e of pieces) expect(quads.some((q) => q.nodes.includes(e.nodeI) && q.nodes.includes(e.nodeJ)), `piece ${e.id}`).toBe(true);
  });
});

describe('a beam reaching past the region\'s outline', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('is followed inside it: its crossing with the outline is a station, the part inside an edge of the cells', () => {
    // From a column 0,4 m outside the slab's edge, through the slab, to its far edge.
    const a = modelStore.addNode(-0.4, 3.1, 3), b = modelStore.addNode(8, 3.1, 3);
    modelStore.addElement(a, b);
    const outer = { kind: 'polygon' as const, points: [[0, 0, 3], [8, 0, 3], [8, 6, 3], [0, 6, 3]] as Array<[number, number, number]> };
    applyMesh({ outer, holes: [], size: 1, element: 'quad' }, { materialId: 1, thickness: 0.2, splitBeams: true });
    const onLine = (n: { x: number; y: number }) => Math.abs(n.y - 3.1) < 1e-6;
    const inside = [...modelStore.elements.values()].filter((e) => {
      const p = modelStore.nodes.get(e.nodeI)!, q = modelStore.nodes.get(e.nodeJ)!;
      return onLine(p) && onLine(q) && Math.min(p.x, q.x) >= -1e-6;
    });
    expect(inside.length).toBeGreaterThan(4);
    const quads = [...modelStore.quads.values()];
    for (const e of inside) expect(quads.some((q) => q.nodes.includes(e.nodeI) && q.nodes.includes(e.nodeJ)), `piece ${e.id}`).toBe(true);
    // The outline carries the crossing as a node of the slab.
    expect([...modelStore.nodes.values()].some((n) => Math.abs(n.x) < 1e-6 && Math.abs(n.y - 3.1) < 1e-6)).toBe(true);
  });
});
