/**
 * A plate with a curved side:
 *  - curved through a node, with no member on it: drawn and meshed on the arc, its mesh's area
 *    the arc's within the chords' error, and its area load giving q times that area;
 *  - with a curved member on the side: the plate follows the member when it is made, and its mesh
 *    passes through the member's own nodes, so they share them and the member is not cut again;
 *  - the member remade with more segments puts the plate's mesh out of date, and meshed again it
 *    follows the new nodes;
 *  - a side made curved and straight again from the panel's command.
 */
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore } from '..';
import { addPlateLoad, applyPlateMeshes, createPlate, planPlateMesh, plateEntry, plateSides, plateStatus, setPlateSideArc } from '../physical-plates';
import { createArc, remakeArc } from '../curved-members';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { plateArea, plateGeometry } from '../../model/physical/plate';
import type { AnalysisResults3D } from '../../engine/types-3d';

const R = 4;
/** A quarter disc of radius R at z = 0: corners at the centre, (R,0) and (0,R), the arc between them. */
function quarter() {
  modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
  const o = modelStore.addNode(0, 0, 0), a = modelStore.addNode(R, 0, 0), b = modelStore.addNode(0, R, 0);
  const s = Math.SQRT1_2 * R;
  const m = modelStore.addNode(s, s, 0);
  for (const n of [o, a, b]) modelStore.addSupport(n, 'pinned3d');
  return { o, a, b, m };
}
const meshArea = () => {
  let s = 0;
  for (const q of modelStore.quads.values()) {
    const p = q.nodes.map((id) => modelStore.nodes.get(id)!);
    s += Math.abs((p[0]!.x * p[1]!.y - p[1]!.x * p[0]!.y) + (p[1]!.x * p[2]!.y - p[2]!.x * p[1]!.y) + (p[2]!.x * p[3]!.y - p[3]!.x * p[2]!.y) + (p[3]!.x * p[0]!.y - p[0]!.x * p[3]!.y)) / 2;
  }
  for (const q of modelStore.plates.values()) {
    const p = q.nodes.map((id) => modelStore.nodes.get(id)!);
    s += Math.abs((p[1]!.x - p[0]!.x) * (p[2]!.y - p[0]!.y) - (p[2]!.x - p[0]!.x) * (p[1]!.y - p[0]!.y)) / 2;
  }
  return s;
};

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

describe('a plate with a curved side', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('is drawn and meshed on the arc through its node, and loaded on its area', () => {
    const { o, a, b, m } = quarter();
    const r = createPlate({ outline: [o, a, m, b], arcMids: [2], materialId: 1, thickness: 0.2, followArcs: false });
    expect('id' in r, JSON.stringify(r)).toBe(true);
    const id = (r as { id: number }).id;
    const exact = (Math.PI * R * R) / 4;
    const geo = plateGeometry(modelStore, plateEntry(id)!.group)!;
    expect(Math.abs(plateArea(geo) - exact) / exact).toBeLessThan(0.002);
    addPlateLoad(id, 1, 2);
    applyPlateMeshes([planPlateMesh(id, { size: 0.5, element: 'quad', followMembers: true })!]);
    expect(plateStatus(id)).toBe('current');
    // Every mesh node off the two straight sides is inside the circle, and those on the arc on it.
    let onArc = 0;
    for (const n of modelStore.nodes.values()) {
      const d = Math.hypot(n.x, n.y);
      expect(d).toBeLessThanOrEqual(R + 1e-6);
      if (Math.abs(d - R) < 1e-6) onArc++;
    }
    expect(onArc).toBeGreaterThan(8);
    const area = meshArea();
    expect(Math.abs(area - exact) / exact).toBeLessThan(0.01);
    syncDefinedLoadsForAnalysis();
    const res = modelStore.solve3D(false, false, true) as AnalysisResults3D;
    expect(typeof res).not.toBe('string');
    expect(res.reactions.reduce((s, x) => s + x.fz, 0)).toBeCloseTo(2 * area, 6);
  });

  it('follows a curved member on its side and shares its nodes', () => {
    const { o, a, b } = quarter();
    const s = Math.SQRT1_2 * R;
    const arc = createArc(a, { x: s, y: s, z: 0 }, b, 12);
    const arcNodes = new Set(arc.flatMap((id) => { const e = modelStore.elements.get(id)!; return [e.nodeI, e.nodeJ]; }));
    const r = createPlate({ outline: [o, a, b], materialId: 1, thickness: 0.2 }) as { id: number };
    expect(plateSides(r.id).filter((x) => x.mid !== null)).toHaveLength(1);
    applyPlateMeshes([planPlateMesh(r.id, { size: 0.6, element: 'quad', followMembers: true })!]);
    // The member is still the one arc, cut at most at the middle of its chords where the mesh's
    // quadrilaterals (made from triangles) put a node; every one of its nodes is a node of the mesh.
    const arcPieces = [...modelStore.elements.values()].filter((e) => e.arc);
    expect(arcPieces.length === 12 || arcPieces.length === 24).toBe(true);
    const meshNodes = new Set([...modelStore.quads.values(), ...modelStore.plates.values()].flatMap((q) => q.nodes));
    for (const n of arcNodes) expect(meshNodes.has(n), `arc node ${n} in the mesh`).toBe(true);
    // And no mesh node lies on the arc that is not the member's.
    for (const n of meshNodes) { const p = modelStore.nodes.get(n)!; if (Math.abs(Math.hypot(p.x, p.y) - R) < 1e-6) expect(arcNodes.has(n)).toBe(true); }

    // Remade with more segments: the plate's mesh is out of date, and meshed again follows it.
    const arcId = [...modelStore.elements.values()].find((e) => e.arc)!.arc!.id;
    const nodesBefore = modelStore.nodes.size;
    const made = remakeArc(arcId, { segments: 20 })!;
    // The plate's mesh, made on the old nodes, is taken out with them: no node is left behind.
    expect(made.platesCleared).toBe(1);
    expect(plateStatus(r.id)).toBe('unmeshed');
    expect(modelStore.nodes.size).toBeLessThan(nodesBefore);
    for (const n of modelStore.nodes.values()) {
      const used = [...modelStore.elements.values()].some((e) => e.nodeI === n.id || e.nodeJ === n.id) || [...modelStore.model.groups.values()].some((g) => g.members.nodes?.includes(n.id));
      expect(used, `node ${n.id} left behind`).toBe(true);
    }
    applyPlateMeshes([planPlateMesh(r.id)!]);
    const after = new Set([...modelStore.quads.values(), ...modelStore.plates.values()].flatMap((q) => q.nodes));
    expect(made.members).toHaveLength(20);
    for (const e of modelStore.elements.values()) if (e.arc) expect(after.has(e.nodeI) && after.has(e.nodeJ)).toBe(true);
    const after20 = [...modelStore.elements.values()].filter((e) => e.arc).length;
    expect(after20 === 20 || after20 === 40).toBe(true);
  });

  it('turns a side curved and straight again', () => {
    const { o, a, b, m } = quarter();
    const { id } = createPlate({ outline: [o, a, b], materialId: 1, thickness: 0.2, followArcs: false }) as { id: number };
    expect(plateSides(id).map((x) => x.mid)).toEqual([null, null, null]);
    expect(setPlateSideArc(id, 1, m)).toBeNull();
    expect(plateSides(id).map((x) => x.mid)).toEqual([null, m, null]);
    const exact = (Math.PI * R * R) / 4;
    expect(Math.abs(plateArea(plateGeometry(modelStore, plateEntry(id)!.group)!) - exact) / exact).toBeLessThan(0.002);
    expect(setPlateSideArc(id, 1, null)).toBeNull();
    expect(plateSides(id).map((x) => x.mid)).toEqual([null, null, null]);
    expect(plateArea(plateGeometry(modelStore, plateEntry(id)!.group)!)).toBeCloseTo(R * R / 2, 9);
  });
});

describe('a physical plate in the IFC export', () => {
  it('is written with its own outline, its hole and its curved side, mesh or not', async () => {
    const { exportProjectIfc } = await import('../ifc-export');
    const { o, a, b, m } = quarter();
    const h = [[1, 1], [1.5, 1], [1.5, 1.5], [1, 1.5]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
    const r = createPlate({ outline: [o, a, m, b], arcMids: [2], holes: [h], materialId: 1, thickness: 0.2, followArcs: false }) as { id: number };
    const unmeshed = exportProjectIfc((k) => k, 'en', 'test');
    // Unmeshed, it is there all the same, with its void and its curved side said.
    expect(unmeshed).toContain('IFCARBITRARYPROFILEDEFWITHVOIDS');
    expect(unmeshed).toContain('PhysicalPlate');
    expect(unmeshed).toMatch(/CurvedSides/);
    applyPlateMeshes([planPlateMesh(r.id, { size: 0.5, element: 'quad', followMembers: true })!]);
    const meshed = exportProjectIfc((k) => k, 'en', 'test');
    expect((meshed.match(/IFCSLAB\(/g) ?? []).length).toBe(1);
  });
});
