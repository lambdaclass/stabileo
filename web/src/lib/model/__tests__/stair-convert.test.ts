/**
 * Converting a drawn slab into a flight keeps the slab's loads and leaves no corner behind.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { historyStore } from '../../store/history.svelte';
import { convertQuadToFlight } from '../stair-convert';

beforeEach(() => { modelStore.clear(); historyStore.clear(); });

/** A 1.2 m × 4.2 m slab at z = 0, its low edge along y = 0, held on that edge. */
function slab() {
  const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(1.2, 0, 0), modelStore.addNode(1.2, 4.2, 0), modelStore.addNode(0, 4.2, 0)] as [number, number, number, number];
  modelStore.addSupport(n[0], 'pinned3d');
  modelStore.addSupport(n[1], 'pinned3d');
  const q = modelStore.addQuad(n, 1, 0.15);
  return { n, q };
}

const surfaceTotal = () => {
  let total = 0;
  for (const l of modelStore.loads) {
    if (l.type !== 'surface3d') continue;
    const quad = modelStore.model.quads.get(l.data.quadId)!;
    const p = quad.nodes.map((id) => modelStore.nodes.get(id)!).map((x) => [x.x, x.y ?? 0, x.z ?? 0]);
    // Area of the (planar) quad: half the cross product of its diagonals.
    const d1 = [p[2]![0]! - p[0]![0]!, p[2]![1]! - p[0]![1]!, p[2]![2]! - p[0]![2]!];
    const d2 = [p[3]![0]! - p[1]![0]!, p[3]![1]! - p[1]![1]!, p[3]![2]! - p[1]![2]!];
    const c = [d1[1]! * d2[2]! - d1[2]! * d2[1]!, d1[2]! * d2[0]! - d1[0]! * d2[2]!, d1[0]! * d2[1]! - d1[1]! * d2[0]!];
    total += l.data.q * Math.hypot(c[0]!, c[1]!, c[2]!) / 2;
  }
  return total;
};

describe('converting a slab into a flight', () => {
  it('puts the slab load on the flight with the same total, and removes the raised corners', () => {
    const { n, q } = slab();
    modelStore.addSurfaceLoad3D(q, 3, 2);
    const before = surfaceTotal();
    historyStore.clear();
    const r = convertQuadToFlight(q, 0, 2.8, { divisions: 15, materialId: 1, waist: 0.15, stepLoad: 0, deadCase: 1 })!;
    expect(r.quadIds).toHaveLength(15);
    expect(r.carriedLoads).toBe(1);
    expect(modelStore.loads.filter((l) => l.type === 'surface3d')).toHaveLength(15);
    expect(modelStore.loads.every((l) => l.type !== 'surface3d' || l.data.caseId === 2)).toBe(true);
    expect(surfaceTotal()).toBeCloseTo(before, 9);
    // The two corners at the old far edge are joined to nothing now, and are gone.
    expect(r.removedNodes).toBe(2);
    expect(modelStore.nodes.has(n[2])).toBe(false);
    expect(modelStore.nodes.has(n[3])).toBe(false);
    // The low edge stays: it is where the flight starts, and it has the supports.
    expect(modelStore.nodes.has(n[0]) && modelStore.nodes.has(n[1])).toBe(true);
    expect(historyStore.undoCount).toBe(1);
    historyStore.undo();
    expect(modelStore.model.quads.has(q)).toBe(true);
    expect(modelStore.nodes.has(n[2])).toBe(true);
  });

  it('keeps a far corner that something else uses', () => {
    const { n, q } = slab();
    const out = modelStore.addNode(0, 6, 0);
    modelStore.addElement(n[3], out, 'frame');
    const r = convertQuadToFlight(q, 0, 2.8, { divisions: 4, materialId: 1, waist: 0.15, stepLoad: 0, deadCase: 1 })!;
    expect(r.removedNodes).toBe(1);
    expect(modelStore.nodes.has(n[3])).toBe(true);
  });
});
