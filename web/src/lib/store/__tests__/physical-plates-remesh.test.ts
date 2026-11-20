import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import type { AnalysisResults3D } from '../../engine/types-3d';
import { historyStore, modelStore, uiStore } from '..';
import { plateLoops } from '../../model/physical/plate';
import {
  addPlateLoad, applyPlateMeshes, clearPlateMesh, createPlate, meshBeforeAnalysis, planPlateMesh, plateStatus,
  preparePlatesForAnalysis,
} from '../physical-plates';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { deserializeProject, serializeProject } from '../file';

function build(bays = 2, rows = bays) {
  const nodes = new Map<string, number>();
  const edges = new Set<string>();
  const ids: number[] = [];
  const node = (x: number, y: number) => {
    const key = `${x},${y}`;
    if (!nodes.has(key)) nodes.set(key, modelStore.addNode(x, y, 0));
    return nodes.get(key)!;
  };
  modelStore.batch(() => {
    for (let y = 0; y < rows; y++) for (let x = 0; x < bays; x++) {
      const outline = [node(x * 6, y * 4), node((x + 1) * 6, y * 4),
        node((x + 1) * 6, (y + 1) * 4), node(x * 6, (y + 1) * 4)];
      for (let k = 0; k < 4; k++) {
        const a = outline[k]!, b = outline[(k + 1) % 4]!;
        const key = [a, b].sort((a, b) => a - b).join(',');
        if (!edges.has(key)) { edges.add(key); modelStore.addElement(a, b); }
      }
      const p = createPlate({ outline, materialId: 1, thickness: 0.15,
        mesh: { size: 0.5, element: 'quad', followMembers: true } });
      if (!('id' in p)) throw new Error(JSON.stringify(p));
      ids.push(p.id);
    }
  });
  return { ids, originalNodes: [...nodes.values()] };
}

function mesh(ids: number[], size = 0.5, element: 'quad' | 'tri' = 'quad') {
  const plans = ids.map((id) => planPlateMesh(id, { size, element, followMembers: true })!);
  for (const p of plans) expect(p.mesh, p.refused).not.toBeNull();
  const result = applyPlateMeshes(plans);
  expect(result.refused).toEqual([]);
  expect(result.plates).toBe(ids.length);
  expect(result.droppedLocalLoads).toBe(0);
  return result;
}

function geometry() {
  const at = (id: number) => {
    const n = modelStore.nodes.get(id)!;
    return [n.x, n.y, n.z ?? 0];
  };
  return {
    nodes: [...modelStore.nodes.keys()].map((id) => JSON.stringify(at(id))).sort(),
    quads: [...modelStore.quads.values()].map((q) => JSON.stringify([q.nodes.map(at), q.materialId, q.thickness])).sort(),
    plates: [...modelStore.plates.values()].map((q) => JSON.stringify([q.nodes.map(at), q.materialId, q.thickness])).sort(),
    members: [...modelStore.elements.values()].map((e) => JSON.stringify([at(e.nodeI), at(e.nodeJ), e.materialId, e.sectionId])).sort(),
  };
}

const owned = (id: number) => plateLoops(modelStore.model.groups.get(id)!).owned;
const shellNodes = (id: number) => {
  const g = modelStore.model.groups.get(id)!;
  return new Set([...(g.members.quads ?? []).flatMap((q) => modelStore.quads.get(q)!.nodes),
    ...(g.members.plates ?? []).flatMap((q) => modelStore.plates.get(q)!.nodes)]);
};

function solve() {
  syncDefinedLoadsForAnalysis();
  const result = modelStore.solve3D(false, false, true);
  if (typeof result === 'string') throw new Error(result);
  return result as AnalysisResults3D;
}

function expectConnected(ids: number[]) {
  for (const [a, b, axis, value] of [[0, 1, 'x', 6], [2, 3, 'x', 6], [0, 2, 'y', 4], [1, 3, 'y', 4]] as const) {
    const edge = (id: number) => [...shellNodes(id)].filter((n) => modelStore.nodes.get(n)![axis] === value).sort((a, b) => a - b);
    expect(edge(ids[a]!)).toEqual(edge(ids[b]!));
    expect(edge(ids[a]!).length).toBeGreaterThan(2);
  }
}

describe('remeshing adjacent plates with boundary members', () => {
  beforeAll(async () => {
    await new Promise((r) => setTimeout(r, 0));
    expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
  });
  beforeEach(() => {
    modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro'; meshBeforeAnalysis.value = true;
  });

  it('preserves generated-node provenance through explicit clear, save and remesh', () => {
    const { ids } = build();
    mesh(ids);
    const before = geometry();
    clearPlateMesh(ids[0]!);
    const saved = serializeProject();
    modelStore.clear();
    expect(deserializeProject(saved)).toBe(true);
    mesh([ids[0]!]);
    expect(geometry()).toEqual(before);
    expectConnected(ids);
    expect(ids.map(plateStatus)).toEqual(ids.map(() => 'current'));
    for (const id of ids) clearPlateMesh(id);
    expect(modelStore.nodes.size).toBe(9);
    expect(modelStore.elements.size).toBe(12);
  });

  it('coarsens the whole batch, preserving shared edges and one undo step', () => {
    const { ids } = build();
    mesh(ids);
    const before = modelStore.snapshot();
    const history = historyStore.undoCount;
    expect(mesh(ids, 1).cells).toBe(96);
    expectConnected(ids);
    expect(ids.map(plateStatus)).toEqual(ids.map(() => 'current'));
    const after = modelStore.snapshot();
    expect(historyStore.undoCount).toBe(history + 1);
    historyStore.undo();
    expect(modelStore.snapshot()).toEqual(before);
    historyStore.redo();
    expect(modelStore.snapshot()).toEqual(after);
    expect(mesh(ids, 0.5).cells).toBe(384);
    expectConnected(ids);
  });

  it('preserves triangular shared meshes through explicit clearing and batch coarsening', () => {
    const { ids } = build();
    expect(mesh(ids, 0.5, 'tri').cells).toBe(768);
    const before = geometry();
    clearPlateMesh(ids[0]!);
    mesh([ids[0]!], 0.5, 'tri');
    expect(geometry()).toEqual(before);
    expectConnected(ids);
    expect(mesh(ids, 1, 'tri').cells).toBe(192);
    expectConnected(ids);
    expect(ids.map(plateStatus)).toEqual(ids.map(() => 'current'));
  });

  it('marks a mesh stale when a removed neighbor releases its imposed spacing', () => {
    const { ids } = build(2, 1);
    mesh(ids);
    expect(mesh([ids[0]!], 1).cells).toBe(48);
    clearPlateMesh(ids[1]!);
    expect(plateStatus(ids[0]!)).toBe('stale');
    expect(planPlateMesh(ids[0]!)!.cells).toBe(24);
  });

  it('restores the whole model when a coordinated replacement exceeds the mesh budget', () => {
    const { ids } = build();
    mesh(ids);
    const plans = ids.map((id) => planPlateMesh(id, { size: 0.03 })!);
    expect(plans.every((p) => p.mesh !== null)).toBe(true);
    const before = modelStore.snapshot();
    const result = applyPlateMeshes(plans);
    expect(result.plates).toBe(0);
    expect(result.refused.length).toBeGreaterThan(0);
    expect(modelStore.snapshot()).toEqual(before);
    expectConnected(ids);
  });

  it('restores shells, loads and provenance if a later replacement is occupied', () => {
    const { ids } = build(2, 1);
    mesh(ids);
    const q = modelStore.quads.get(modelStore.model.groups.get(ids[1]!)!.members.quads![0]!)!;
    modelStore.addSurfaceLoad3D(q.id, -3);
    modelStore.addQuad(q.nodes, q.materialId, q.thickness);
    const plans = ids.map((id) => planPlateMesh(id, { size: 1 })!);
    const before = modelStore.snapshot();
    const result = applyPlateMeshes(plans);
    expect(result).toMatchObject({ plates: 0, cells: 0, droppedLocalLoads: 0, refused: expect.arrayContaining([{ id: ids[1], reason: 'occupied' }]) });
    expect(modelStore.snapshot()).toEqual(before);
  });

  it('restores the coordinated batch if applying a mesh throws', () => {
    const { ids } = build();
    mesh(ids);
    const plans = ids.map((id) => planPlateMesh(id, { size: 1 })!);
    const before = modelStore.snapshot();
    const add = vi.spyOn(modelStore, 'addQuad').mockImplementationOnce(() => { throw new Error('mesh application failed'); });
    try { expect(() => applyPlateMeshes(plans)).toThrow('mesh application failed'); }
    finally { add.mockRestore(); }
    expect(modelStore.snapshot()).toEqual(before);
  });

  it('keeps a loaded generated node in a replacement mesh with a different target size', () => {
    const { ids } = build(1);
    mesh(ids);
    const n = owned(ids[0]!).find((id) => { const p = modelStore.nodes.get(id)!; return Math.abs(p.x - 0.5) < 1e-9 && Math.abs(p.y - 0.5) < 1e-9; })!;
    expect(n).toBeDefined();
    modelStore.addNodalLoad3D(n, 0, 0, -7, 0, 0, 0);
    expect(plateStatus(ids[0]!)).toBe('current');
    expect(preparePlatesForAnalysis()).toEqual({ ok: true, meshed: 0, cells: 0 });
    const loads = modelStore.snapshot().loads;
    mesh(ids, 1);
    expect(shellNodes(ids[0]!).has(n)).toBe(true);
    expect(modelStore.snapshot().loads).toEqual(loads);
    expect(plateStatus(ids[0]!)).toBe('current');
  });

  it('solves a coarsened loaded batch like a fresh mesh at the same target size', () => {
    const loaded = () => {
      const { ids, originalNodes } = build();
      for (const n of originalNodes) modelStore.addSupport(n, 'pinned3d');
      for (const id of ids) addPlateLoad(id, 1, 5);
      modelStore.addDistributedLoad3D([...modelStore.elements.keys()][0]!, 0, 0, -10, -10);
      return ids;
    };
    const response = (r: AnalysisResults3D) => {
      const at = (id: number) => { const n = modelStore.nodes.get(id)!; return `${n.x},${n.y},${n.z ?? 0}`; };
      return new Map([
        ...r.displacements.map((d) => [`d:${at(d.nodeId)}`, [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz]] as const),
        ...r.reactions.map((d) => [`r:${at(d.nodeId)}`, [d.fx, d.fy, d.fz, d.mx, d.my, d.mz]] as const),
      ]);
    };
    const ids = loaded();
    mesh(ids);
    expect(mesh(ids, 1).cells).toBe(96);
    expectConnected(ids);
    const result = solve();
    expect(result.reactions.reduce((s, r) => s + r.fz, 0)).toBeCloseTo(540, 6);
    const actual = response(result), actualGeometry = geometry();
    modelStore.clear(); historyStore.clear();
    mesh(loaded(), 1);
    expect(geometry()).toEqual(actualGeometry);
    const reference = response(solve());
    expect([...actual.keys()].sort()).toEqual([...reference.keys()].sort());
    for (const [key, values] of actual) values.forEach((value, i) => {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeCloseTo(reference.get(key)![i]!, key.startsWith('d:') ? 10 : 7);
    });
  });

  it('keeps shared-node provenance, geometry and connectivity over repeated remeshes', () => {
    const { ids, originalNodes } = build();
    originalNodes.push(modelStore.addNode(0.5, 0.5, 0));
    expect(mesh(ids).cells).toBe(384);
    const initial = geometry();
    const sharedOwned = ids.map((id) => owned(id).filter((n) => ids.some((other) => other !== id && shellNodes(other).has(n))));
    expect(sharedOwned.flat().length).toBeGreaterThan(0);
    for (let round = 0; round < 3; round++) {
      expect(mesh(ids).cells).toBe(384);
      expect(geometry()).toEqual(initial);
      expectConnected(ids);
      expect(ids.map(plateStatus)).toEqual(ids.map(() => 'current'));
      ids.forEach((id, i) => {
        expect(owned(id)).toEqual(expect.arrayContaining(sharedOwned[i]!));
        expect(owned(id).some((n) => originalNodes.includes(n))).toBe(false);
        expect(owned(id).some((n) => ids.some((other) => other !== id && owned(other).includes(n)))).toBe(false);
      });
      expect(preparePlatesForAnalysis()).toEqual({ ok: true, meshed: 0, cells: 0 });
    }
  });

  it('retains provenance through undo, redo and saving, without retaining unused old nodes', () => {
    const { ids } = build();
    mesh(ids);
    const initial = modelStore.snapshot();
    mesh(ids);
    const remeshed = modelStore.snapshot();
    historyStore.undo();
    expect(modelStore.snapshot()).toEqual(initial);
    historyStore.redo();
    expect(modelStore.snapshot()).toEqual(remeshed);
    const loops = ids.map((id) => plateLoops(modelStore.model.groups.get(id)!));
    const before = geometry();
    const saved = serializeProject();
    modelStore.clear();
    expect(deserializeProject(saved)).toBe(true);
    expect(ids.map((id) => plateLoops(modelStore.model.groups.get(id)!))).toEqual(loops);
    mesh(ids);
    expect(geometry()).toEqual(before);
    expectConnected(ids);
    mesh([ids[0]!], 1);
    expectConnected(ids);
    for (const id of ids) expect(owned(id).every((n) => shellNodes(id).has(n))).toBe(true);
    expect(loops[0]!.owned.some((n) => !modelStore.nodes.has(n))).toBe(true);
    for (const id of ids) clearPlateMesh(id);
    expect(modelStore.quads.size).toBe(0);
    expect(ids.map(owned)).toEqual(ids.map(() => []));
  });

  it('leaves the existing mesh intact when a replacement exceeds the cell budget', () => {
    const { ids } = build();
    mesh(ids);
    const before = modelStore.snapshot();
    const plan = planPlateMesh(ids[0]!, { size: 1e-6 })!;
    expect(plan.refused).toBe('tooManyCells');
    expect(plan.mesh).toBeNull();
    expect(applyPlateMeshes([plan])).toMatchObject({ plates: 0, cells: 0, refused: [{ id: ids[0], reason: 'tooManyCells' }] });
    expect(modelStore.snapshot()).toEqual(before);
  });

  it.each([1, 0.25])('keeps shared edges connected when remeshing their original owner at size %s', (size) => {
    const { ids } = build();
    mesh(ids);
    const before = geometry();
    const neighbours = ids.slice(1).map((id) => modelStore.model.groups.get(id)!.members.quads!.map((q) => modelStore.quads.get(q)));
    for (let round = 0; round < 2; round++) {
      mesh([ids[0]!], size);
      expectConnected(ids);
      expect(geometry()).toEqual(before);
      expect(ids.slice(1).map((id) => modelStore.model.groups.get(id)!.members.quads!.map((q) => modelStore.quads.get(q)))).toEqual(neighbours);
      expect(ids.map(plateStatus)).toEqual(ids.map(() => 'current'));
      expect(preparePlatesForAnalysis()).toEqual({ ok: true, meshed: 0, cells: 0 });
    }
  });

  it('allows an isolated plate to coarsen without retaining its old boundary spacing', () => {
    const { ids } = build(1);
    expect(mesh(ids).cells).toBe(96);
    expect(mesh(ids, 1).cells).toBe(24);
    expect(plateStatus(ids[0]!)).toBe('current');
    expect(preparePlatesForAnalysis()).toEqual({ ok: true, meshed: 0, cells: 0 });
  });

  it.each([[1, 48], [0.25, 192]])('changes unconstrained spacing at size %s while retaining the shared edge', (size, cells) => {
    const { ids } = build(2, 1);
    mesh(ids);
    const [a, b] = ids as [number, number];
    const edge = (id: number) => [...shellNodes(id)].filter((n) => modelStore.nodes.get(n)!.x === 6).sort((a, b) => a - b);
    const shared = edge(b);
    const before = modelStore.snapshot();
    expect(mesh([a], size).cells).toBe(cells);
    expect(edge(a)).toEqual(shared);
    expect(edge(b)).toEqual(shared);
    expect(ids.map(plateStatus)).toEqual(['current', 'current']);
    const after = modelStore.snapshot();
    historyStore.undo();
    expect(modelStore.snapshot()).toEqual(before);
    historyStore.redo();
    expect(modelStore.snapshot()).toEqual(after);
    expect(preparePlatesForAnalysis()).toEqual({ ok: true, meshed: 0, cells: 0 });
  });

  it('releases the shared-edge spacing after the neighboring mesh is cleared', () => {
    const { ids } = build(2, 1);
    mesh(ids);
    expect(mesh([ids[0]!], 1).cells).toBe(48);
    clearPlateMesh(ids[1]!);
    expect(mesh([ids[0]!], 1).cells).toBe(24);
    expect(plateStatus(ids[0]!)).toBe('current');
    expect(plateStatus(ids[1]!)).toBe('unmeshed');
  });

  it('keeps supported, loaded and constrained generated nodes when replacing and clearing a mesh', () => {
    const { ids, originalNodes } = build();
    mesh(ids);
    const a = ids[0]!;
    const held = owned(a).filter((n) => {
      const p = modelStore.nodes.get(n)!;
      return p.y === 0 && p.x > 0 && p.x < 6;
    }).slice(0, 3);
    expect(held).toHaveLength(3);
    modelStore.addSupport(held[0]!, 'pinned3d');
    modelStore.addNodalLoad3D(held[1]!, 0, 0, -7, 0, 0, 0);
    modelStore.addConstraint({ type: 'equalDOF', masterNode: originalNodes[0]!, slaveNode: held[2]!, dofs: [0] });
    const before = modelStore.snapshot();
    const beforeGeometry = geometry();
    for (let round = 0; round < 2; round++) {
      mesh(ids);
      expect(owned(a)).toEqual(expect.arrayContaining(held));
      expect(held.every((n) => shellNodes(a).has(n))).toBe(true);
      expect(geometry()).toEqual(beforeGeometry);
    }
    clearPlateMesh(a);
    const after = modelStore.snapshot();
    expect(after.supports).toEqual(before.supports);
    expect(after.loads).toEqual(before.loads);
    expect(after.constraints).toEqual(before.constraints);
    expect(held.every((n) => modelStore.nodes.has(n))).toBe(true);
  });

  it('preserves loads, equilibrium and solved displacements through changes in target size at shared edges', () => {
    const { ids, originalNodes } = build();
    for (const n of originalNodes) modelStore.addSupport(n, 'pinned3d');
    for (const id of ids) addPlateLoad(id, 1, 5);
    const beam = [...modelStore.elements.values()][0]!;
    modelStore.addDistributedLoad3D(beam.id, 0, 0, -10, -10);
    const displacements = (r: AnalysisResults3D) => new Map(r.displacements.map(({ nodeId, ...d }) => {
      const n = modelStore.nodes.get(nodeId)!;
      return [JSON.stringify([n.x, n.y, n.z ?? 0]), d];
    }));
    mesh(ids);
    const first = solve();
    const reference = displacements(first);
    for (const size of [0.5, 1, 0.25]) {
      mesh([ids[0]!], size);
      expectConnected(ids);
      const result = solve();
      const current = displacements(result);
      expect([...current.keys()].sort()).toEqual([...reference.keys()].sort());
      for (const [position, d] of current) {
        const expected = reference.get(position)!;
        for (const key of ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'] as const) {
          expect(Number.isFinite(d[key])).toBe(true);
          expect(d[key]).toBeCloseTo(expected[key], 10);
        }
      }
      expect(result.reactions).toHaveLength(first.reactions.length);
      for (const reaction of result.reactions) {
        const expected = first.reactions.find((r) => r.nodeId === reaction.nodeId)!;
        for (const key of ['fx', 'fy', 'fz', 'mx', 'my', 'mz'] as const) {
          expect(Number.isFinite(reaction[key])).toBe(true);
          expect(reaction[key]).toBeCloseTo(expected[key], 7);
        }
      }
      const total = result.reactions.reduce((s, r) => {
        const n = modelStore.nodes.get(r.nodeId)!;
        return { fz: s.fz + r.fz, mx: s.mx + r.fz * n.y + r.mx, my: s.my - r.fz * n.x + r.my };
      }, { fz: 0, mx: 0, my: 0 });
      expect(total.fz).toBeCloseTo(5 * 96 + 60, 6);
      expect(total.mx).toBeCloseTo(5 * 96 * 4, 5);
      expect(total.my).toBeCloseTo(-5 * 96 * 6 - 60 * 3, 5);
      const distributed = modelStore.loads.filter((l) => l.type === 'distributed3d');
      expect(distributed.length).toBeGreaterThan(1);
      const force = distributed.reduce((s, l) => {
        const e = modelStore.elements.get(l.data.elementId)!;
        const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!;
        return s + (l.data.qZI + l.data.qZJ) / 2 * Math.hypot(b.x - a.x, b.y - a.y);
      }, 0);
      expect(force).toBeCloseTo(-60, 9);
      expect(preparePlatesForAnalysis()).toEqual({ ok: true, meshed: 0, cells: 0 });
    }
  });
});
