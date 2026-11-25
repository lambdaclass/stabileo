import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import { historyStore } from '../history.svelte';
import '../index';
import { initSolver, callCertify } from '../../engine/wasm-solver';
import { applyRefinedMesh } from '../refined-mesh';
import { planRefinedMesh, cornerValues, hangingEdgeNodes, type RefinedMesh } from '../../model/edit/refined-mesh';
import { addPlateLoad, applyPlateMeshes, createPlate, meshBeforeAnalysis, planPlateMesh, plateEntry, plateStatus, preparePlatesForAnalysis } from '../physical-plates';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; modelStore.clear(); historyStore.clear(); });

/** An L-shaped slab of 12 quads of 1 m, fixed along x = 0 and y = 0, with the re-entrant corner at (2, 2). */
function lSlab() {
  const at = new Map<string, number>();
  const node = (i: number, j: number) => {
    const key = `${i},${j}`;
    if (!at.has(key)) at.set(key, modelStore.addNode(i, j, 3));
    return at.get(key)!;
  };
  const quads: number[] = [];
  const quadAt = new Map<string, number>();
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if (i >= 2 && j >= 2) continue;
      const id = modelStore.addQuad([node(i, j), node(i + 1, j), node(i + 1, j + 1), node(i, j + 1)], 1, 0.2);
      quads.push(id);
      quadAt.set(`${i},${j}`, id);
    }
  }
  for (const [key, id] of at) {
    const [i, j] = key.split(',').map(Number);
    if (i === 0 || j === 0) modelStore.addSupport(id, i === 0 && j === 0 ? 'fixed3d' : 'pinned3d');
  }
  for (const id of quads) modelStore.addSurfaceLoad3D(id, 5, 1);
  return { node, quads, quadAt };
}

const wireOf = () => modelStore.singleSolveInput3D(false, false, true)!.wire();
const area = (quadId: number) => {
  const p = modelStore.quads.get(quadId)!.nodes.map((id) => modelStore.nodes.get(id)!);
  const d1 = [p[2]!.x - p[0]!.x, p[2]!.y - p[0]!.y], d2 = [p[3]!.x - p[1]!.x, p[3]!.y - p[1]!.y];
  return Math.abs(d1[0]! * d2[1]! - d1[1]! * d2[0]!) / 2;
};
const adapt = (wire: Record<string, any>, target = 0.5) => {
  const coarse = callCertify('estimate_discretization_3d', [wire]);
  return callCertify('adapt_mesh_3d', [wire, { target: target * coarse.relativeError, geometry: 'faceted', maxPasses: 12 }]);
};

/*
 * The app gives the solver a surface load as forces at the nodes, and the engine's refinement
 * leaves those where they are; the model refined spreads the load over its new nodes. With the
 * engine's loads in its place, the model's own solver input is the engine's refined model.
 */
const estimateWithLoadsOf = (engine: Record<string, any>) =>
  callCertify('estimate_discretization_3d', [{ ...wireOf(), loads: engine.loads }]).relativeError;
const totalFz = (wire: Record<string, any>) => wire.loads.reduce((s: number, l: { data: { fz?: number } }) => s + (l.data.fz ?? 0), 0);

describe('applying an adaptively refined mesh to the model', () => {
  it('makes the model the mesh the engine refined, to the same estimate under the same loads', () => {
    lSlab();
    const wire = wireOf();
    const out = adapt(wire);
    const applied = applyRefinedMesh(wire, out.mesh);
    if ('refused' in applied) throw new Error(applied.refused);
    expect(estimateWithLoadsOf(out.input)).toBeCloseTo(out.estimate.relativeError, 9);
    const own = wireOf();
    expect(own.loads.length).toBeGreaterThan(wire.loads.length);
    expect(totalFz(own)).toBeCloseTo(totalFz(wire), 9);
  });

  it('keeps the members, groups, supports and loads of the model, and is undone in one step', () => {
    const { node, quads } = lSlab();
    const beam = modelStore.addElement(node(1, 2), node(2, 2), 'frame');
    const group = modelStore.addGroup('slab', 'custom', { quads: [...quads] });
    const wire = wireOf();
    const out = adapt(wire);
    expect(out.status).toBe('converged');
    expect(out.mesh.shells.length).toBeGreaterThan(0);
    expect(out.mesh.constraints.length).toBeGreaterThan(0);
    expect(out.mesh.frames).toHaveLength(1);
    const before = { nodes: modelStore.nodes.size, quads: modelStore.quads.size };

    const applied = applyRefinedMesh(wire, out.mesh);
    if ('refused' in applied) throw new Error(applied.refused);
    expect(applied.nodes).toBe(out.mesh.nodes.length);
    expect(modelStore.quads.size).toBe(Object.keys(out.input.quads).length);
    expect(modelStore.nodes.size).toBe(Object.keys(out.input.nodes).length);
    expect(modelStore.elements.size).toBe(Object.keys(out.input.elements).length);
    expect(modelStore.elements.has(beam)).toBe(false);
    expect(modelStore.supports.size).toBe(Object.keys(out.input.supports).length);
    expect(modelStore.constraints).toHaveLength(out.input.constraints.length);
    expect(modelStore.constraints.every((c) => c.type === 'linearMPC' && c.terms.every((term) => modelStore.nodes.has(term.nodeId)))).toBe(true);
    expect([...modelStore.model.groups.get(group)!.members.quads!].sort((a, b) => a - b)).toEqual([...modelStore.quads.keys()].sort((a, b) => a - b));

    const loads = modelStore.loads.filter((l) => l.type === 'surface3d');
    expect(loads).toHaveLength(modelStore.quads.size);
    expect(loads.every((l) => l.type === 'surface3d' && l.data.q === 5 && l.data.caseId === 1 && modelStore.quads.has(l.data.quadId))).toBe(true);
    expect(loads.reduce((s, l) => s + (l.type === 'surface3d' ? area(l.data.quadId) : 0), 0)).toBeCloseTo(12, 9);

    const again = callCertify('estimate_discretization_3d', [wireOf()]);
    expect(again.elements).toHaveLength(out.estimate.elements.length);
    expect(Math.abs(again.relativeError - out.estimate.relativeError)).toBeLessThan(0.1 * out.estimate.relativeError);

    historyStore.undo();
    expect(modelStore.nodes.size).toBe(before.nodes);
    expect(modelStore.quads.size).toBe(before.quads);
    expect(modelStore.elements.has(beam)).toBe(true);
    expect(modelStore.constraints).toHaveLength(0);
    expect(modelStore.model.groups.get(group)!.members.quads).toEqual(quads);
    expect(modelStore.loads.filter((l) => l.type === 'surface3d')).toHaveLength(12);
  });

  it('undoes everything and refuses when a member cannot be cut where the mesh needs it', () => {
    const { node } = lSlab();
    const beam = modelStore.addElement(node(1, 2), node(2, 2), 'frame');
    const other = modelStore.addElement(node(2, 1), node(2, 2), 'frame');
    const wire = wireOf();
    const out = adapt(wire);
    expect(out.mesh.frames.length).toBe(2);
    const before = { nodes: modelStore.nodes.size, quads: [...modelStore.quads.keys()], elements: [...modelStore.elements.keys()], loads: modelStore.loads.length };
    const split = modelStore.splitMember.bind(modelStore);
    const spy = vi.spyOn(modelStore, 'splitMember').mockImplementation((id, ts, opts) => (id === Math.max(beam, other) ? null : split(id, ts, opts)));
    try {
      expect(applyRefinedMesh(wire, out.mesh)).toEqual({ refused: 'member' });
    } finally {
      spy.mockRestore();
    }
    expect(modelStore.nodes.size).toBe(before.nodes);
    expect([...modelStore.quads.keys()]).toEqual(before.quads);
    expect([...modelStore.elements.keys()]).toEqual(before.elements);
    expect(modelStore.loads).toHaveLength(before.loads);
    expect(modelStore.constraints).toHaveLength(0);
  });

  it('refuses a model whose constraints were edited since it was solved, whatever their number', () => {
    lSlab();
    const first = wireOf();
    const applied = applyRefinedMesh(first, adapt(first, 0.7).mesh);
    if ('refused' in applied) throw new Error(applied.refused);
    const second = wireOf();
    const out = adapt(second, 0.7);
    const kept = modelStore.constraints[0]!;
    if (kept.type !== 'linearMPC') throw new Error(kept.type);
    modelStore.removeConstraint(0);
    modelStore.addConstraint({ ...kept, terms: kept.terms.map((term, i) => (i === 1 ? { ...term, coefficient: -0.25 } : term)) });
    expect(modelStore.constraints).toHaveLength(second.constraints.length);
    expect(applyRefinedMesh(second, out.mesh)).toEqual({ refused: 'stale' });
  });

  it('can be refined again from the model it made', () => {
    lSlab();
    const first = wireOf();
    const applied = applyRefinedMesh(first, adapt(first, 0.7).mesh);
    if ('refused' in applied) throw new Error(applied.refused);
    const second = wireOf();
    expect(second.constraints.length).toBeGreaterThan(0);
    const out = adapt(second, 0.7);
    expect(out.mesh.shells.length).toBeGreaterThan(0);
    const next = applyRefinedMesh(second, out.mesh);
    if ('refused' in next) throw new Error(next.refused);
    expect(modelStore.quads.size).toBe(Object.keys(out.input.quads).length);
    expect(modelStore.constraints).toHaveLength(out.input.constraints.length);
    expect(estimateWithLoadsOf(out.input)).toBeCloseTo(out.estimate.relativeError, 9);
  });

  it('carries a load given at the corners, a thermal load and their cases onto the parts, the total unchanged', () => {
    const { quadAt } = lSlab();
    const corner = quadAt.get('1,1')!;
    modelStore.addSurfaceLoad3D(corner, 0, 2, { qNodes: [1, 3, 7, 5] });
    modelStore.addThermalLoadQuad3D(corner, 20, 5, 2);
    const wire = wireOf();
    const out = adapt(wire);
    const parts = new Set(out.mesh.shells.filter((s: { parent: number }) => s.parent === corner).map((s: { id: number }) => s.id)).size;
    expect(parts).toBeGreaterThan(1);
    const applied = applyRefinedMesh(wire, out.mesh);
    if ('refused' in applied) throw new Error(applied.refused);

    const varying = modelStore.loads.filter((l) => l.type === 'surface3d' && l.data.qNodes !== undefined);
    expect(varying).toHaveLength(parts);
    let total = 0;
    for (const l of varying) {
      if (l.type !== 'surface3d') continue;
      expect(l.data.caseId).toBe(2);
      const q = modelStore.quads.get(l.data.quadId)!;
      q.nodes.forEach((id, k) => {
        const n = modelStore.nodes.get(id)!;
        expect(l.data.qNodes![k]).toBeCloseTo(1 + 2 * (n.x - 1) + 4 * (n.y - 1), 12);
      });
      total += area(q.id) * l.data.qNodes!.reduce((s, v) => s + v, 0) / 4;
    }
    expect(total).toBeCloseTo(4, 9);
    const thermal = modelStore.loads.filter((l) => l.type === 'thermalQuad3d');
    expect(thermal).toHaveLength(parts);
    expect(thermal.every((l) => l.type === 'thermalQuad3d' && l.data.dtUniform === 20 && l.data.dtGradient === 5 && l.data.caseId === 2)).toBe(true);
  });

  it('gives a new node between two supports the support they share, and only their common restraints when they differ', () => {
    lSlab();
    const wire = wireOf();
    const applied = applyRefinedMesh(wire, adapt(wire).mesh);
    if ('refused' in applied) throw new Error(applied.refused);
    const at = (x: number, y: number) => [...modelStore.nodes.values()].find((n) => n.x === x && n.y === y)?.id;
    const supportAt = (x: number, y: number) => [...modelStore.supports.values()].find((s) => s.nodeId === at(x, y));
    const besideCorner = supportAt(0.5, 0);
    const alongEdge = supportAt(1.5, 0);
    expect(alongEdge).toMatchObject({ type: 'pinned3d' });
    expect(alongEdge!.dofRestraints).toBeUndefined();
    expect(besideCorner).toMatchObject({ type: 'custom3d', dofRestraints: { tx: true, ty: true, tz: true, rx: false, ry: false, rz: false } });
  });
});

describe('applying it to plates meshed from their outlines', () => {
  /** Two 4 × 4 m slabs side by side at z = 3, meshed at 1 m, held at their six corners, each with its own area load. */
  function twoSlabs() {
    meshBeforeAnalysis.value = true;
    const at = (x: number, y: number) => modelStore.addNode(x, y, 3);
    const [a0, a1, a2, a3, b1, b2] = [at(0, 0), at(4, 0), at(4, 4), at(0, 4), at(8, 0), at(8, 4)];
    for (const n of [a0, a1, a2, a3, b1, b2]) modelStore.addSupport(n, 'pinned3d');
    const made = [createPlate({ outline: [a0, a1, a2, a3], materialId: 1, thickness: 0.2 }), createPlate({ outline: [a1, b1, b2, a2], materialId: 1, thickness: 0.2 })];
    const ids = made.map((r) => { if (!('id' in r)) throw new Error(JSON.stringify(r)); return r.id; });
    for (const id of ids) {
      meshPlate(id, 1);
      addPlateLoad(id, 1, 5);
    }
    syncDefinedLoadsForAnalysis();
    return ids as [number, number];
  }
  const meshPlate = (id: number, size: number) => {
    const plan = planPlateMesh(id, { size, followMembers: true, element: 'quad' })!;
    expect(plan.mesh, String(plan.refused)).not.toBeNull();
    const report = applyPlateMeshes([plan]);
    expect(report.refused).toEqual([]);
  };
  const cellsOf = (id: number) => plateEntry(id)!.group.members.quads ?? [];

  it('leaves each plate with its mesh current, its cells counted and its load on every part', () => {
    const [a, b] = twoSlabs();
    expect([plateStatus(a), plateStatus(b)]).toEqual(['current', 'current']);
    expect(modelStore.quads.size).toBe(32);
    const wire = wireOf();
    const out = adapt(wire);
    expect(out.mesh.shells.length).toBeGreaterThan(0);
    expect(out.mesh.constraints.length).toBeGreaterThan(0);

    const applied = applyRefinedMesh(wire, out.mesh);
    if ('refused' in applied) throw new Error(applied.refused);
    expect(modelStore.quads.size).toBe(Object.keys(out.input.quads).length);
    expect([plateStatus(a), plateStatus(b)]).toEqual(['current', 'current']);
    expect(preparePlatesForAnalysis()).toEqual({ ok: true, meshed: 0, cells: 0 });
    expect(modelStore.quads.size).toBe(Object.keys(out.input.quads).length);
    expect([...cellsOf(a), ...cellsOf(b)].sort((x, y) => x - y)).toEqual([...modelStore.quads.keys()].sort((x, y) => x - y));
    for (const id of [a, b]) {
      const entry = plateEntry(id)!;
      expect(entry.surface.meshed!.cells).toBe(cellsOf(id).length);
    }
    syncDefinedLoadsForAnalysis();
    const solved = modelStore.solve3D(false, false, true);
    expect(typeof solved, String(solved)).not.toBe('string');
    const loaded = new Set(modelStore.loads.flatMap((l) => (l.type === 'surface3d' && l.data.fromDef !== undefined ? [l.data.quadId] : [])));
    expect([...loaded].sort((x, y) => x - y)).toEqual([...modelStore.quads.keys()].sort((x, y) => x - y));
    expect(modelStore.loads.filter((l) => l.type === 'surface3d')).toHaveLength(modelStore.quads.size);
    expect(estimateWithLoadsOf(out.input)).toBeCloseTo(out.estimate.relativeError, 9);
    expect(totalFz(wireOf())).toBeCloseTo(totalFz(wire), 9);

    historyStore.undo();
    expect(modelStore.quads.size).toBe(32);
    expect(modelStore.constraints).toHaveLength(0);
    expect([plateStatus(a), plateStatus(b)]).toEqual(['current', 'current']);
    expect([plateEntry(a)!.surface.meshed!.cells, plateEntry(b)!.surface.meshed!.cells]).toEqual([16, 16]);
  });

  it('is taken away with the mesh when a plate is meshed again, leaving a model that solves', () => {
    const [a, b] = twoSlabs();
    const wire = wireOf();
    const applied = applyRefinedMesh(wire, adapt(wire).mesh);
    if ('refused' in applied) throw new Error(applied.refused);
    const refined = cellsOf(b).length;

    meshPlate(a, 2);
    expect(cellsOf(a)).toHaveLength(4);
    expect(modelStore.constraints).toHaveLength(0);
    expect(plateEntry(b)!.surface.meshed, 'the refinement of the plate beside it goes too').toBeUndefined();
    let prepared = preparePlatesForAnalysis();
    for (let round = 0; round < 2 && !prepared.ok; round++) prepared = preparePlatesForAnalysis();
    expect(prepared.ok, JSON.stringify(prepared)).toBe(true);
    expect([plateStatus(a), plateStatus(b)]).toEqual(['current', 'current']);
    syncDefinedLoadsForAnalysis();
    expect(preparePlatesForAnalysis()).toEqual({ ok: true, meshed: 0, cells: 0 });
    expect(cellsOf(a).length + cellsOf(b).length).toBeLessThanOrEqual(32);
    expect(refined).toBeGreaterThan(16);
    expect(modelStore.nodes.size).toBeLessThan(50);
    const solved = modelStore.solve3D(false, false, true);
    expect(typeof solved, String(solved)).not.toBe('string');
    expect(callCertify('estimate_discretization_3d', [wireOf()]).relativeError).toBeGreaterThan(0);
  });
});

describe('applying it to the plates there are', () => {
  const plate = (outline: number[], over: Partial<Parameters<typeof createPlate>[0]> = {}) => {
    const made = createPlate({ outline, materialId: 1, thickness: 0.2, ...over });
    if (!('id' in made)) throw new Error(JSON.stringify(made));
    return made.id;
  };
  const meshed = (id: number, size: number, element: 'quad' | 'tri' = 'quad') => {
    const plan = planPlateMesh(id, { size, followMembers: true, element })!;
    expect(plan.mesh, String(plan.refused)).not.toBeNull();
    expect(applyPlateMeshes([plan]).refused).toEqual([]);
  };
  const shells = () => modelStore.quads.size + modelStore.model.plates.size;

  /** Refine, apply, and hold the model to what a plate must still be afterwards. */
  function refineAndApply(plates: number[], target = 0.6) {
    meshBeforeAnalysis.value = true;
    syncDefinedLoadsForAnalysis();
    expect(plates.map(plateStatus)).toEqual(plates.map(() => 'current'));
    const before = shells();
    const wire = wireOf();
    const out = adapt(wire, target);
    expect(out.status, out.refused).toBe('converged');
    expect(out.mesh.shells.length).toBeGreaterThan(0);
    const applied = applyRefinedMesh(wire, out.mesh);
    if ('refused' in applied) throw new Error(applied.refused);
    expect(shells()).toBeGreaterThan(before);
    expect(shells()).toBe(Object.keys(out.input.quads).length + Object.keys(out.input.plates).length);
    expect(plates.map(plateStatus)).toEqual(plates.map(() => 'current'));
    expect(preparePlatesForAnalysis()).toEqual({ ok: true, meshed: 0, cells: 0 });
    for (const id of plates) {
      const members = plateEntry(id)!.group.members;
      expect(plateEntry(id)!.surface.meshed!.cells).toBe((members.quads?.length ?? 0) + (members.plates?.length ?? 0));
    }
    syncDefinedLoadsForAnalysis();
    const solved = modelStore.solve3D(false, false, true);
    expect(typeof solved, String(solved)).not.toBe('string');
    expect(estimateWithLoadsOf(out.input)).toBeCloseTo(out.estimate.relativeError, 9);
    expect(totalFz(wireOf())).toBeCloseTo(totalFz(wire), 9);
    return out;
  }

  it('a slab with a hole', () => {
    const c = [[0, 0], [6, 0], [6, 4], [0, 4]].map(([x, y]) => modelStore.addNode(x!, y!, 3));
    const h = [[2, 1.5], [3, 1.5], [3, 2.5], [2, 2.5]].map(([x, y]) => modelStore.addNode(x!, y!, 3));
    for (const n of c) modelStore.addSupport(n, 'pinned3d');
    const id = plate(c, { holes: [h] });
    meshed(id, 0.5);
    addPlateLoad(id, 1, 5);
    refineAndApply([id]);
  });

  it('a slab on a wall, with no node left hanging where they meet', () => {
    const at = (x: number, y: number, z: number) => modelStore.addNode(x, y, z);
    const [s0, s1, s2, s3] = [at(0, 0, 3), at(4, 0, 3), at(4, 4, 3), at(0, 4, 3)];
    const [w0, w1] = [at(0, 0, 0), at(4, 0, 0)];
    for (const n of [w0, w1]) modelStore.addSupport(n, 'fixed3d');
    for (const n of [s2, s3]) modelStore.addSupport(n, 'pinned3d');
    const slab = plate([s0, s1, s2, s3]);
    const wall = plate([w0, w1, s1, s0]);
    meshed(slab, 1);
    meshed(wall, 1);
    addPlateLoad(slab, 1, 5);
    const out = refineAndApply([slab, wall], 0.35);
    const joint = new Set([...modelStore.nodes.values()].filter((n) => n.y === 0 && (n.z ?? 0) === 3).map((n) => n.id));
    const hung = out.mesh.constraints.map((terms: Array<{ nodeId: number }>) => terms[0]!.nodeId);
    expect(hung.length).toBeGreaterThan(0);
    expect(modelStore.constraints.filter((c) => c.type === 'linearMPC' && joint.has(c.terms[0]!.nodeId))).toEqual([]);
  });

  it('a slab with a curved side', () => {
    const R = 4, s = Math.SQRT1_2 * R;
    const [o, a, b, m] = [modelStore.addNode(0, 0, 3), modelStore.addNode(R, 0, 3), modelStore.addNode(0, R, 3), modelStore.addNode(s, s, 3)];
    for (const n of [o, a, b]) modelStore.addSupport(n, 'pinned3d');
    const id = plate([o, a, m, b], { arcMids: [2], followArcs: false });
    meshed(id, 0.5);
    addPlateLoad(id, 1, 5);
    refineAndApply([id]);
  });
});

describe('planning the edit', () => {
  const mesh = (over: Partial<RefinedMesh> = {}): RefinedMesh => ({
    nodes: [{ id: 5, x: 0.5, y: 0, z: 0, between: [1, 2] }, { id: 6, x: 0.5, y: 0.5, z: 0 }],
    shells: [{ family: 'quad', parent: 1, id: 9, nodes: [1, 5, 6, 4], weights: [[1, 0, 0, 0], [0.5, 0.5, 0, 0], [0.25, 0.25, 0.25, 0.25], [0, 0, 0, 1]] }],
    frames: [], supports: [], constraints: [], ...over,
  });
  const model = (over: Record<string, unknown> = {}) => ({
    nodes: new Map([[1, { x: 0, y: 0 }], [2, { x: 1, y: 0 }], [3, { x: 1, y: 1 }], [4, { x: 0, y: 1 }]]),
    elements: new Map([[7, { id: 7, nodeI: 1, nodeJ: 2 }]]),
    quads: new Map([[1, { id: 1, nodes: [1, 2, 3, 4] }]]),
    plates: new Map(), supports: new Map(), constraints: [], ...over,
  }) as Parameters<typeof planRefinedMesh>[0];
  const wire = (over: Record<string, unknown> = {}) => ({
    nodes: { 1: { x: 0, y: 0, z: 0 }, 2: { x: 1, y: 0, z: 0 }, 3: { x: 1, y: 1, z: 0 }, 4: { x: 0, y: 1, z: 0 } },
    quads: { 1: { id: 1, nodes: [1, 2, 3, 4] } }, elements: { 7: { id: 7, nodeI: 1, nodeJ: 2 } }, constraints: [], ...over,
  });

  it('plans a mesh that matches the model', () => {
    const plan = planRefinedMesh(model(), wire(), mesh());
    if ('refused' in plan) throw new Error(plan.refused);
    expect(plan.shells).toEqual([{ kind: 'quad', id: 1, children: [{ nodes: [1, 5, 6, 4], weights: mesh().shells[0]!.weights }] }]);
  });

  it('refuses a mesh that was not refined', () => {
    expect(planRefinedMesh(model(), wire(), mesh({ shells: [] }))).toEqual({ refused: 'nothing' });
  });

  it('refuses a model that is no longer the one solved', () => {
    const moved = model({ nodes: new Map([[1, { x: 0, y: 0 }], [2, { x: 1.5, y: 0 }], [3, { x: 1, y: 1 }], [4, { x: 0, y: 1 }]]) });
    expect(planRefinedMesh(moved, wire(), mesh())).toEqual({ refused: 'stale' });
    expect(planRefinedMesh(model({ quads: new Map() }), wire(), mesh())).toEqual({ refused: 'stale' });
    expect(planRefinedMesh(model({ quads: new Map([[1, { id: 1, nodes: [2, 3, 4, 1] }]]) }), wire(), mesh())).toEqual({ refused: 'stale' });
    expect(planRefinedMesh(model({ quads: new Map([[1, { id: 1, nodes: [1, 2, 3, 4], curved: true }]]) }), wire(), mesh())).toEqual({ refused: 'stale' });
    expect(planRefinedMesh(model({ constraints: [{}] }), wire(), mesh())).toEqual({ refused: 'stale' });
    expect(planRefinedMesh(model(), wire(), mesh({ shells: [{ ...mesh().shells[0]!, nodes: [1, 5, 99, 4] }] }))).toEqual({ refused: 'stale' });
    expect(planRefinedMesh(model(), wire(), mesh({ shells: [{ ...mesh().shells[0]!, family: 'quad9' }] }))).toEqual({ refused: 'stale' });
    expect(planRefinedMesh(model({ elements: new Map() }), wire(), mesh({ frames: [{ parent: 7, nodes: [5], at: [0.5] }] }))).toEqual({ refused: 'stale' });
  });

  it('refuses two members along the same split edge', () => {
    const elements = new Map([[7, { id: 7, nodeI: 1, nodeJ: 2 }], [8, { id: 8, nodeI: 1, nodeJ: 2 }]]);
    const twice = wire({ elements: { 7: { id: 7, nodeI: 1, nodeJ: 2 }, 8: { id: 8, nodeI: 1, nodeJ: 2 } } });
    const frames = [{ parent: 7, nodes: [5], at: [0.5] }, { parent: 8, nodes: [5], at: [0.5] }];
    expect(planRefinedMesh(model({ elements }), twice, mesh({ frames }))).toEqual({ refused: 'member' });
    expect('refused' in planRefinedMesh(model({ elements }), twice, mesh({ frames: frames.slice(0, 1) }))).toBe(false);
  });

  it('takes two supports for the same whatever order their fields were written in', () => {
    const supports = new Map([
      [1, { id: 1, nodeId: 1, type: 'custom3d', dofRestraints: { tx: true, ty: true, tz: true, rx: false, ry: false, rz: false }, dz: 0.01 }],
      [2, { id: 2, nodeId: 2, dz: 0.01, dofRestraints: { rz: false, ry: false, rx: false, tz: true, ty: true, tx: true }, type: 'custom3d' }],
    ]);
    const given = mesh({ supports: [{ nodeId: 5, restrained: [true, true, true, false, false, false], plain: false }] });
    const plan = planRefinedMesh(model({ supports }), wire(), given);
    if ('refused' in plan) throw new Error(plan.refused);
    expect(plan.supports[0]!.fields).toMatchObject({ type: 'custom3d', dz: 0.01 });
  });

  it('refuses to split a member of variable section', () => {
    const elements = new Map([[7, { id: 7, nodeI: 1, nodeJ: 2, variableSection: { sectionJ: 2 } }]]);
    expect(planRefinedMesh(model({ elements }), wire(), mesh({ frames: [{ parent: 7, nodes: [5], at: [0.5] }] }))).toEqual({ refused: 'member' });
  });

  it('refuses a support with an imposed displacement between ends that are not held alike', () => {
    const supports = new Map([[1, { id: 1, nodeId: 1, type: 'fixed3d', dz: 0.01 }], [2, { id: 2, nodeId: 2, type: 'pinned3d', dz: 0.01 }]]);
    const given = mesh({ supports: [{ nodeId: 5, restrained: [true, true, true, false, false, false], plain: false }] });
    expect(planRefinedMesh(model({ supports }), wire(), given)).toEqual({ refused: 'support' });
    const alike = new Map([[1, { id: 1, nodeId: 1, type: 'pinned3d', dz: 0.01 }], [2, { id: 2, nodeId: 2, type: 'pinned3d', dz: 0.01 }]]);
    const plan = planRefinedMesh(model({ supports: alike }), wire(), given);
    if ('refused' in plan) throw new Error(plan.refused);
    expect(plan.supports).toEqual([{ nodeId: 5, fields: { type: 'pinned3d', dz: 0.01 } }]);
  });

  it('does not copy a spring onto the new node', () => {
    const supports = new Map([[1, { id: 1, nodeId: 1, type: 'spring', kz: 100 }], [2, { id: 2, nodeId: 2, type: 'spring', kz: 100 }]]);
    const given = mesh({ supports: [{ nodeId: 5, restrained: [false, false, true, false, false, false], plain: true }] });
    const plan = planRefinedMesh(model({ supports }), wire(), given);
    if ('refused' in plan) throw new Error(plan.refused);
    expect(plan.supports).toEqual([{ nodeId: 5, fields: { type: 'custom3d', dofRestraints: { tx: false, ty: false, tz: true, rx: false, ry: false, rz: false } } }]);
  });

  it('knows a hanging node by its six ties and its place, and nothing less', () => {
    const nodes = new Map([[1, { x: 0, y: 0, z: 3 }], [2, { x: 2, y: 0, z: 3 }], [3, { x: 1, y: 0, z: 3 }]]);
    const tie = (dof: number, over: Partial<{ coefficient: number; extra: boolean }> = {}) => ({
      type: 'linearMPC',
      terms: [{ nodeId: 3, dof, coefficient: 1 }, { nodeId: 2, dof, coefficient: -0.5 }, { nodeId: 1, dof, coefficient: over.coefficient ?? -0.5 },
        ...(over.extra ? [{ nodeId: 1, dof: 4, coefficient: 0.25 }, { nodeId: 2, dof: 4, coefficient: -0.25 }] : [])],
    });
    const all = [0, 1, 2, 3, 4, 5].map((dof) => tie(dof, { extra: dof === 2 }));
    expect([...hangingEdgeNodes(all, nodes)]).toEqual([['1:2', 3]]);
    expect(hangingEdgeNodes(all.slice(1), nodes).size).toBe(0);
    expect(hangingEdgeNodes([...all.slice(0, 5), tie(5, { coefficient: -0.4 })], nodes).size).toBe(0);
    expect(hangingEdgeNodes(all, new Map([...nodes, [3, { x: 1.2, y: 0, z: 3 }]])).size).toBe(0);
    expect(hangingEdgeNodes([{ type: 'equalDOF' }, ...all], nodes).size).toBe(1);
    expect(hangingEdgeNodes(undefined, nodes).size).toBe(0);
  });

  it('reads a value given at the corners of a shell at the corners of a part of it', () => {
    expect(cornerValues([[1, 0, 0, 0], [0.5, 0.5, 0, 0], [0.25, 0.25, 0.25, 0.25], [0.5, 0, 0, 0.5]], [1, 3, 7, 5])).toEqual([1, 2, 4, 3]);
  });
});
