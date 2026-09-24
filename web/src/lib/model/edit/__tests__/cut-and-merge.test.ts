/**
 * Cutting members where they meet something, and merging collinear ones back.
 *
 * The invariant that matters: merging a member that was cut, loads and all, must give back a
 * member the solver answers for exactly as it did before the cut. The rest pins that the cuts
 * connect what they claim to connect, and that a merge refuses what it cannot represent.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import { validateAndSolve3D } from '../../../engine/solver-service';
import * as wasmSolver from '../../../engine/wasm-solver';
import { splitAtNodes, intersectMembers } from '../cut-members';
import { mergeCollinear } from '../merge-collinear';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});
beforeEach(() => { modelStore.clear(); historyStore.clear(); });

function solve() {
  const md = {
    nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
    loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
    quads: modelStore.quads, plates: modelStore.plates, constraints: modelStore.constraints, connectors: modelStore.connectors,
  };
  const r = validateAndSolve3D(md as never, false, false);
  if (!r || typeof r === 'string') throw new Error(String(r));
  return r;
}

/** A 6 m beam on two pins, steel, with a strong-axis section. */
function beam(): { a: number; b: number; e: number } {
  modelStore.restore({
    nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 6, y: 0, z: 0 }]],
    materials: [[1, { id: 1, name: 'S', e: 200000, nu: 0.3, rho: 78.5 }]],
    sections: [[1, { id: 1, name: 'IPE', a: 0.00539, iz: 1.94e-5, iy: 1.42e-6, j: 1.2e-7, shape: 'I' }]],
    elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]],
    supports: [
      [1, { id: 1, nodeId: 1, type: 'custom3d', dofRestraints: { tx: true, ty: true, tz: true, rx: true, ry: false, rz: false } }],
      [2, { id: 2, nodeId: 2, type: 'custom3d', dofRestraints: { tx: false, ty: true, tz: true, rx: false, ry: false, rz: false } }],
    ],
    loads: [], loadCases: [{ id: 1, type: 'D', name: 'D' }], combinations: [],
    nextId: { node: 10, material: 10, section: 10, element: 10, support: 10, load: 1 },
  } as never);
  historyStore.clear();
  return { a: 1, b: 2, e: 1 };
}

describe('split at nodes', () => {
  it('connects a node drawn on a member, which then carries load like midspan', () => {
    const { e } = beam();
    const mid = modelStore.addNode(3, 0, 0);
    const r = splitAtNodes([e]);
    expect(r.cut).toEqual([{ elementId: e, segments: expect.any(Array) }]);
    expect(r.cut[0]!.segments.length).toBe(2);
    expect(r.nodes).toEqual([]); // the existing node was used, not a new one
    modelStore.addNodalLoad3D(mid, 0, 0, -10, 0, 0, 0, 1);
    const w = solve().displacements.find((d) => d.nodeId === mid)!.uz;
    // PL³/48EI, E in kN/m², I about the axis gravity bends.
    const EI = 200000 * 1000 * 1.42e-6;
    const expected = -10 * 6 ** 3 / (48 * EI);
    expect(Math.abs(w / expected - 1)).toBeLessThan(0.02);
  });

  it('leaves alone a node near a member but off it', () => {
    const { e } = beam();
    modelStore.addNode(3, 0.01, 0);
    expect(splitAtNodes([e]).cut).toEqual([]);
  });
});

describe('intersect', () => {
  it('two crossing diagonals share one new node at the crossing', () => {
    const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(4, 0, 3), modelStore.addNode(4, 0, 0), modelStore.addNode(0, 0, 3)];
    const d1 = modelStore.addElement(n[0]!, n[1]!, 'truss'), d2 = modelStore.addElement(n[2]!, n[3]!, 'truss');
    historyStore.clear();
    const r = intersectMembers([d1, d2]);
    expect(r.cut.length).toBe(2);
    expect(r.nodes.length).toBe(1);
    const x = modelStore.nodes.get(r.nodes[0]!)!;
    expect([x.x, x.y, x.z]).toEqual([expect.closeTo(2, 9), expect.closeTo(0, 9), expect.closeTo(1.5, 9)]);
    for (const c of r.cut) {
      const ends = c.segments.flatMap((id) => { const e = modelStore.elements.get(id)!; return [e.nodeI, e.nodeJ]; });
      expect(ends).toContain(r.nodes[0]);
    }
    expect(historyStore.undoCount).toBe(1);
  });

  it('members that only touch end to end, or pass apart, are not cut', () => {
    const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(2, 0, 0), modelStore.addNode(4, 0, 0), modelStore.addNode(0, 1, 1), modelStore.addNode(4, 1, 1.2)];
    const a = modelStore.addElement(n[0]!, n[1]!, 'frame'), b = modelStore.addElement(n[1]!, n[2]!, 'frame');
    const c = modelStore.addElement(n[3]!, n[4]!, 'frame');
    expect(intersectMembers([a, b, c]).cut).toEqual([]);
  });
});

describe('merge collinear', () => {
  it('a member cut in three and merged back solves exactly as before, loads re-measured', () => {
    const { e } = beam();
    modelStore.addDistributedLoad3D(e, 0, 0, -4, -9, 1, 5, 1);
    modelStore.addPointLoadOnElement3D(e, 4.2, 1, -7, 1);
    const before = solve();
    modelStore.subdivideElement(e, 3);
    const segments = [...modelStore.elements.keys()];
    expect(segments.length).toBe(3);
    const r = mergeCollinear(segments);
    expect(r.merged).toEqual([{ elementId: e, absorbed: 2 }]);
    expect(r.removedNodes).toBe(2);
    expect(modelStore.elements.size).toBe(1);
    expect(modelStore.nodes.size).toBe(2);
    const after = solve();
    // Relative 1e-6, not machine precision: the merged member carries the load as three
    // contiguous trapezoids equal to the original one, and the engine integrates each piece on
    // its own. That differs from integrating the single trapezoid at the 1e-7 level.
    const rel = (x: number, y: number, scale: number) => Math.abs(x - y) / Math.max(scale, 1e-12);
    const uMax = Math.max(...before.displacements.flatMap((d) => [Math.abs(d.ux), Math.abs(d.uy), Math.abs(d.uz)]));
    const tMax = Math.max(...before.displacements.flatMap((d) => [Math.abs(d.rx), Math.abs(d.ry), Math.abs(d.rz)]));
    for (const d of before.displacements) {
      const d2 = after.displacements.find((x) => x.nodeId === d.nodeId)!;
      for (const k of ['ux', 'uy', 'uz'] as const) expect(rel(d2[k], d[k], uMax), k).toBeLessThan(1e-6);
      for (const k of ['rx', 'ry', 'rz'] as const) expect(rel(d2[k], d[k], tMax), k).toBeLessThan(1e-6);
    }
    const fMax = Math.max(...before.reactions.flatMap((r) => [Math.abs(r.fx), Math.abs(r.fy), Math.abs(r.fz)]));
    for (const rr of before.reactions) {
      const r2 = after.reactions.find((x) => x.nodeId === rr.nodeId)!;
      for (const k of ['fx', 'fy', 'fz'] as const) expect(rel(r2[k], rr[k], fMax), k).toBeLessThan(1e-6);
    }
  });

  it('refuses through a node that is more than a meeting point, and through an interior hinge', () => {
    const { e } = beam();
    modelStore.subdivideElement(e, 2);
    const [s1, s2] = [...modelStore.elements.keys()];
    const mid = modelStore.elements.get(s1!)!.nodeJ;
    modelStore.addNodalLoad3D(mid, 0, 0, -5, 0, 0, 0, 1);
    expect(mergeCollinear([s1!, s2!]).refused).toEqual({ nodeBusy: 1 });
    modelStore.replaceLoads([]);
    modelStore.updateElement(s1!, { releaseJ: { my: true, mz: true, t: false } });
    expect(mergeCollinear([s1!, s2!]).refused).toEqual({ endConditions: 1 });
    expect(modelStore.elements.size).toBe(2);
  });

  it('keeps the groups: a group that held a segment holds the merged member', () => {
    const { e } = beam();
    modelStore.subdivideElement(e, 2);
    const [s1, s2] = [...modelStore.elements.keys()];
    const g = modelStore.addGroup('far half', 'selection', { elements: [s2!] });
    mergeCollinear([s1!, s2!]);
    expect(modelStore.model.groups.get(g)!.members.elements).toEqual([s1]);
  });
});
