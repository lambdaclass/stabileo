/**
 * Converting a drawn slab into a flight keeps the slab's loads and leaves no corner behind.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { historyStore } from '../../store/history.svelte';
import { convertQuadToFlight } from '../stair-convert';
import { addLoads } from '../../store/load-ops';
import { shellLoadForces, type ShellLoadSpec, type Vec3 } from '../../engine/shell-load-integration';

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

/** Per case: the total force of the surface loads on quads, and its plan moments (Σfz·x, Σfz·y, Σfx·y, Σfy·x). */
function byCase(): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const l of modelStore.loads) {
    if (l.type !== 'surface3d' || l.data.on) continue;
    const pts = modelStore.model.quads.get(l.data.quadId)!.nodes.map((id) => modelStore.nodes.get(id)!);
    const r = shellLoadForces('quad', pts, l.data)!;
    const acc = out.get(l.data.caseId!) ?? [0, 0, 0, 0, 0, 0, 0];
    r.forces.forEach((f: Vec3, i) => {
      const p = pts[i]!;
      acc[0] += f[0]; acc[1] += f[1]; acc[2] += f[2];
      acc[3] += f[2] * p.x; acc[4] += f[2] * p.y; acc[5] += f[0] * p.y; acc[6] += f[1] * p.x;
    });
    out.set(l.data.caseId!, acc);
  }
  return out;
}

describe('the slab\'s loads on the flight, every field of them', () => {
  const opts = { divisions: 6, materialId: 1, waist: 0.15, stepLoad: 0, deadCase: 99 };
  const loads: ShellLoadSpec[] = [
    // A fluid on the slab, as the fluid tool writes it: nothing but its variation.
    { q: 0, frame: 'local', vary: { dir: [0, 0, 1], c1: 2, q1: 0, c2: 0, q2: -20 } },
    { q: 0, qNodes: [1, 2, 3, 4] },
    { q: 0, frame: 'global', dir: [1, 0, 0], vary: { dir: [0, 1, 0], c1: 1, q1: 2, c2: 3, q2: 4 } },
    { q: 5, region: { normal: [0, 0, 1], points: [[0.2, 0.5, 7], [1, 0.5, 7], [1, 2, 7], [0.2, 2, 7]], holes: [[[0.4, 1, 7], [0.8, 1, 7], [0.8, 1.5, 7], [0.4, 1.5, 7]]] } },
    { q: 1.5, frame: 'projected', dir: [0, 0, -1] },
    // A variation along a direction that rises, and a region seen along one: read off the slab.
    { q: 0, vary: { dir: [1, 0, 1], c1: 0, q1: 1, c2: 0.5, q2: 3 } },
    { q: 2, frame: 'local', region: { normal: [0, 1, 1], points: [[0.2, 1, 2], [1, 1, 2], [1, 3, 2], [0.2, 3, 2]] } },
  ];

  it('keeps each load\'s total and where it acts in plan', () => {
    const { q } = slab();
    loads.forEach(({ q: qv, ...rest }, i) => modelStore.addSurfaceLoad3D(q, qv, i + 1, rest));
    const before = byCase();
    const r = convertQuadToFlight(q, 0, 2.8, opts)!;
    expect(r.carriedLoads).toBe(loads.length);
    const after = byCase();
    for (let c = 1; c <= loads.length; c++) {
      const b = before.get(c)!, a = after.get(c);
      expect(Math.hypot(b[0]!, b[1]!, b[2]!)).toBeGreaterThan(0.1);
      expect(a, `case ${c}`).toBeDefined();
      b.forEach((v, k) => expect(a![k], `case ${c}, component ${k}`).toBeCloseTo(v, 6));
    }
  });

  it('leaves a triangle numbered as the slab with its own loads', () => {
    const { q } = slab();
    const t = modelStore.addPlate([modelStore.addNode(5, 0, 0), modelStore.addNode(6, 0, 0), modelStore.addNode(5, 1, 0)], 1, 0.15);
    expect(t).toBe(q);
    modelStore.addSurfaceLoad3D(t, 4, 1, { on: 'plate' });
    addLoads([{ type: 'thermalQuad3d', data: { id: 0, quadId: t, on: 'plate', dtUniform: 15, dtGradient: 0, caseId: 1 } }]);
    const r = convertQuadToFlight(q, 0, 2.8, opts)!;
    expect(r.carriedLoads).toBe(0);
    expect(modelStore.loads.map((l) => [l.type, (l.data as { quadId?: number }).quadId, (l.data as { on?: string }).on])).toEqual([['surface3d', t, 'plate'], ['thermalQuad3d', t, 'plate']]);
  });
});
