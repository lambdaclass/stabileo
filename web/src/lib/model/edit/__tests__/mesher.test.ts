/**
 * The shell mesher: the structured grid where the region allows it, a conforming free mesh
 * elsewhere, areas that match the region, boundary nodes kept, and a clamped circular plate
 * against its closed form.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import '../../../store';
import * as wasmSolver from '../../../engine/wasm-solver';
import { validateAndSolve3D } from '../../../engine/solver-service';
import { generateMesh, gradedStations, meshArea, type MeshOutput } from '../mesher';
import { applyMesh } from '../mesh-apply';
import type { Vec3 } from '../affine';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});
beforeEach(() => { modelStore.clear(); historyStore.clear(); });

const rect = (w: number, h: number, z = 0): Vec3[] => [[0, 0, z], [w, 0, z], [w, h, z], [0, h, z]];

/** Every edge used by one or two cells, the boundary ones once: a conforming mesh. */
function conforming(m: MeshOutput): boolean {
  const use = new Map<string, number>();
  for (const c of m.cells) for (let i = 0; i < c.length; i++) {
    const a = c[i]!, b = c[(i + 1) % c.length]!;
    const k = a < b ? `${a},${b}` : `${b},${a}`;
    use.set(k, (use.get(k) ?? 0) + 1);
  }
  return [...use.values()].every((n) => n === 1 || n === 2);
}

describe('structured', () => {
  it('a rectangle by size is the grid', () => {
    const m = generateMesh({ outer: { kind: 'polygon', points: rect(6, 4) }, holes: [], size: 1, element: 'quad' })!;
    expect(m.structured).toBe(true);
    expect(m.cells).toHaveLength(24);
    expect(m.points).toHaveLength(35);
    expect(meshArea(m)).toBeCloseTo(24, 9);
  });

  it('bias grades a side: last segment over first', () => {
    const s = gradedStations(4, 3);
    const segs = s.slice(1).map((v, i) => v - s[i]!);
    expect(segs[3]! / segs[0]!).toBeCloseTo(3, 9);
    expect(s[4]).toBe(1);
    const m = generateMesh({
      outer: { kind: 'polygon', points: rect(4, 2) }, holes: [], size: 1, element: 'quad',
      sides: [{ divisions: 4, bias: 3 }, { divisions: 2 }, { divisions: 4, bias: 1 / 3 }, { divisions: 2 }],
    })!;
    expect(m.structured).toBe(true);
    expect(meshArea(m)).toBeCloseTo(8, 9);
  });

  it('triangles are the grid split', () => {
    const m = generateMesh({ outer: { kind: 'polygon', points: rect(2, 2) }, holes: [], size: 1, element: 'tri' })!;
    expect(m.cells).toHaveLength(8);
    expect(m.cells.every((c) => c.length === 3)).toBe(true);
  });
});

describe('free', () => {
  it('a circle in quadrilaterals is an O-grid covering its inscribed polygon', () => {
    const r = 2, h = 0.4;
    const m = generateMesh({ outer: { kind: 'circle', center: [0, 0, 0], radius: r }, holes: [], size: h, element: 'quad' })!;
    expect(m.structured).toBe(true);
    const n = 4 * Math.max(2, 2 * Math.round((Math.PI * r) / 4 / h));
    expect(meshArea(m)).toBeCloseTo((n / 2) * r * r * Math.sin((2 * Math.PI) / n), 6);
    expect(conforming(m)).toBe(true);
    expect(m.cells.every((c) => c.length === 4)).toBe(true);
  });

  it('a square with a round hole', () => {
    const m = generateMesh({
      outer: { kind: 'polygon', points: rect(4, 4) }, holes: [{ kind: 'circle', center: [2, 2, 0], radius: 0.8 }],
      size: 0.4, element: 'tri',
    })!;
    const n = Math.max(8, Math.round((2 * Math.PI * 0.8) / 0.4));
    const hole = (n / 2) * 0.64 * Math.sin((2 * Math.PI) / n);
    expect(meshArea(m)).toBeCloseTo(16 - hole, 6);
    expect(conforming(m)).toBe(true);
  });

  it('an L-shaped slab, in a tilted plane', () => {
    const L: Vec3[] = [[0, 0, 0], [4, 0, 0], [4, 2, 1], [2, 2, 1], [2, 4, 2], [0, 4, 2]];
    const m = generateMesh({ outer: { kind: 'polygon', points: L }, holes: [], size: 0.5, element: 'quad' })!;
    // Plan area 12 m², on a plane rising 1 in 2 along y.
    expect(meshArea(m)).toBeCloseTo(12 * Math.hypot(1, 0.5), 6);
    expect(conforming(m)).toBe(true);
  });

  it('keeps a model node that lies on the outline', () => {
    const m = generateMesh({
      outer: { kind: 'polygon', points: rect(4, 4) }, holes: [{ kind: 'circle', center: [2, 2, 0], radius: 0.5 }],
      size: 1, element: 'tri', fixedPoints: [[1.3, 0, 0]],
    })!;
    expect(m.points.some((p) => Math.hypot(p[0] - 1.3, p[1], p[2]) < 1e-9)).toBe(true);
  });
});

describe('free circles', () => {
  it('in triangles, the circle is a conforming free mesh', () => {
    const r = 2, h = 0.4;
    const m = generateMesh({ outer: { kind: 'circle', center: [0, 0, 0], radius: r }, holes: [], size: h, element: 'tri' })!;
    expect(m.structured).toBe(false);
    const n = Math.round((2 * Math.PI * r) / h);
    expect(meshArea(m)).toBeCloseTo((n / 2) * r * r * Math.sin((2 * Math.PI) / n), 6);
    expect(conforming(m)).toBe(true);
  });
});

describe('into the model', () => {
  it('welds onto existing nodes and is one undo step', () => {
    const ids = rect(3, 3).map((p) => modelStore.addNode(p[0], p[1], p[2]));
    const undo0 = historyStore.undoCount, n0 = modelStore.nodes.size;
    const r = applyMesh({ outer: { kind: 'polygon', points: rect(3, 3) }, holes: [], size: 1, element: 'quad' }, { materialId: 1, thickness: 0.2, splitBeams: false })!;
    expect(r.quads).toHaveLength(9);
    expect(r.newNodes).toBe(16 - 4);
    expect(ids.every((id) => r.nodeIds.includes(id))).toBe(true);
    expect(historyStore.undoCount).toBe(undo0 + 1);
    historyStore.undo();
    expect(modelStore.nodes.size).toBe(n0);
  });

  it('a clamped circular plate deflects q·a⁴/(64·D) at the centre', () => {
    const a = 2, t = 0.1, E = 30_000, nu = 0.2, q = 10;
    const mat = modelStore.addMaterial({ name: 'H', e: E, nu, rho: 0 });
    const r = applyMesh({ outer: { kind: 'circle', center: [0, 0, 0], radius: a }, holes: [], size: 0.25, element: 'quad' }, { materialId: mat, thickness: t, splitBeams: false })!;
    for (const id of r.nodeIds) {
      const n = modelStore.nodes.get(id)!;
      if (Math.abs(Math.hypot(n.x, n.y) - a) < 1e-6) modelStore.addSupport(id, 'fixed3d' as never);
    }
    for (const qid of r.quads) modelStore.addSurfaceLoad3D(qid, q, 1);
    const md = {
      nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
      loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
      quads: modelStore.quads, plates: modelStore.plates, constraints: modelStore.constraints, connectors: modelStore.connectors,
    };
    const res = validateAndSolve3D(md as never);
    if (!res || typeof res === 'string') throw new Error(String(res));
    const D = (E * 1000 * t ** 3) / (12 * (1 - nu * nu));
    const exact = (q * a ** 4) / (64 * D);
    const w = Math.max(...res.displacements.map((d) => -d.uz));
    expect(Math.abs(w - exact) / exact).toBeLessThan(0.05);
  });
});
