import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import { historyStore } from '../history.svelte';
import '../index';
import { initSolver, callCertify } from '../../engine/wasm-solver';
import { applyRefinedMesh } from '../refined-mesh';
import { planRefinedMesh, cornerValues, type RefinedMesh } from '../../model/edit/refined-mesh';

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

  it('refines a slab of triangles where the error is, with no constraints, and carries its loads', () => {
    const at = new Map<string, number>();
    const node = (i: number, j: number) => {
      const key = `${i},${j}`;
      if (!at.has(key)) at.set(key, modelStore.addNode(i, j, 3));
      return at.get(key)!;
    };
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        if (i >= 2 && j >= 2) continue;
        const [a, b, c, d] = [node(i, j), node(i + 1, j), node(i + 1, j + 1), node(i, j + 1)];
        for (const nodes of [[a, b, c], [a, c, d]] as Array<[number, number, number]>) {
          modelStore.addSurfaceLoad3D(modelStore.addPlate(nodes, 1, 0.2), 5, 1, { on: 'plate' });
        }
      }
    }
    for (const [key, id] of at) {
      const [i, j] = key.split(',').map(Number);
      if (i === 0 || j === 0) modelStore.addSupport(id, 'pinned3d');
    }
    const wire = wireOf();
    expect(Object.keys(wire.plates)).toHaveLength(24);
    const out = adapt(wire);
    expect(out.status).toBe('converged');
    expect(out.input.constraints).toHaveLength(0);
    const uniform = 24 * 4 ** (out.passes.length - 1);
    expect(Object.keys(out.input.plates).length).toBeLessThan(uniform);

    const applied = applyRefinedMesh(wire, out.mesh);
    if ('refused' in applied) throw new Error(applied.refused);
    expect(modelStore.model.plates.size).toBe(Object.keys(out.input.plates).length);
    expect(modelStore.nodes.size).toBe(Object.keys(out.input.nodes).length);
    expect(modelStore.supports.size).toBe(Object.keys(out.input.supports).length);
    expect(modelStore.constraints).toHaveLength(0);
    const loads = modelStore.loads.filter((l) => l.type === 'surface3d');
    expect(loads).toHaveLength(modelStore.model.plates.size);
    expect(loads.every((l) => l.type === 'surface3d' && l.data.on === 'plate' && l.data.q === 5 && modelStore.model.plates.has(l.data.quadId))).toBe(true);
    expect(estimateWithLoadsOf(out.input)).toBeCloseTo(out.estimate.relativeError, 9);
    expect(totalFz(wireOf())).toBeCloseTo(totalFz(wire), 9);
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
    plates: new Map(), supports: new Map(), groups: new Map(), constraints: [], ...over,
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

  it('refuses to split a plate meshed from its outline', () => {
    const groups = new Map([[1, { members: { quads: [1] }, data: { surface: {} } }]]);
    expect(planRefinedMesh(model({ groups }), wire(), mesh())).toEqual({ refused: 'physicalPlate' });
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

  it('reads a value given at the corners of a shell at the corners of a part of it', () => {
    expect(cornerValues([[1, 0, 0, 0], [0.5, 0.5, 0, 0], [0.25, 0.25, 0.25, 0.25], [0.5, 0, 0, 0.5]], [1, 3, 7, 5])).toEqual([1, 2, 4, 3]);
  });
});
