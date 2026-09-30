/**
 * Model tools: renumbering part of the model from a number (and refusing to hit what was not
 * chosen), shells too; the hygiene findings; and reversing a member, which must leave the
 * structure's answer exactly as it was.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import '../../../store/index';
import { initSolver } from '../../../engine/wasm-solver';
import { renumber } from '../renumber';
import { looseParts, freeShellEdges, unconnectedCrossings, repeatedProperties } from '../hygiene';
import { flipMembers } from '../flip-members';
import { unifyProperties } from '../cleanup';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); });

describe('renumber', () => {
  it('only the selection, from a number, and refused when that number is taken outside it', () => {
    const n = [0, 1, 2, 3].map((x) => modelStore.addNode(x * 2, 0, 0));
    const e = [0, 1, 2].map((k) => modelStore.addElement(n[k]!, n[k + 1]!, 'frame'));
    const r = renumber({ nodes: false, members: true, order: 'xyz', only: { elements: new Set([e[1]!, e[2]!]) }, start: 20 });
    expect('refused' in r).toBe(false);
    expect([...modelStore.elements.keys()].sort((a, b) => a - b)).toEqual([e[0]!, 20, 21]);
    const bad = renumber({ nodes: false, members: true, order: 'xyz', only: { elements: new Set([20]) }, start: e[0]! });
    expect(bad).toEqual({ refused: 'collision', kind: 'members', ids: [e[0]!] });
  });

  it('shells by their centroids, with their loads following', () => {
    const a = modelStore.addNode(4, 0, 0), b = modelStore.addNode(6, 0, 0), c = modelStore.addNode(6, 2, 0), d = modelStore.addNode(4, 2, 0);
    const p = modelStore.addNode(0, 0, 0), q = modelStore.addNode(2, 0, 0), r = modelStore.addNode(2, 2, 0), s = modelStore.addNode(0, 2, 0);
    const far = modelStore.addQuad([a, b, c, d], 1, 0.2);
    const near = modelStore.addQuad([p, q, r, s], 1, 0.2);
    modelStore.addSurfaceLoad3D(far, 5);
    const res = renumber({ nodes: false, members: false, shells: true, order: 'xyz' });
    expect('refused' in res).toBe(false);
    // The quad nearer the origin comes first.
    expect(modelStore.quads.get(1)!.nodes).toEqual([p, q, r, s]);
    void near;
    const l = modelStore.loads.find((x) => x.type === 'surface3d')!;
    expect((l.data as { quadId: number }).quadId).toBe(2);
  });
});

describe('hygiene', () => {
  it('finds a loose part, a free edge, a crossing, and repeated properties', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0), c = modelStore.addNode(2, -2, 0), d = modelStore.addNode(2, 2, 0);
    modelStore.addElement(a, b, 'frame');
    modelStore.addElement(c, d, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    const f1 = modelStore.addNode(10, 0, 0), f2 = modelStore.addNode(12, 0, 0);
    const loose = modelStore.addElement(f1, f2, 'frame');
    const m = { nodes: modelStore.nodes, elements: modelStore.elements, quads: modelStore.quads, plates: modelStore.plates, supports: modelStore.supports, materials: modelStore.materials, sections: modelStore.sections };
    const parts = looseParts(m as never);
    expect(parts.map((p) => p.elements).flat()).toContain(loose);
    expect(unconnectedCrossings(modelStore.elements.keys())).toHaveLength(1);
    const q1 = modelStore.addNode(0, 5, 0), q2 = modelStore.addNode(1, 5, 0), q3 = modelStore.addNode(1, 6, 0), q4 = modelStore.addNode(0, 6, 0);
    modelStore.addQuad([q1, q2, q3, q4], 1, 0.2);
    expect(freeShellEdges({ ...m, quads: modelStore.quads } as never)).toHaveLength(4);
    const mat = [...modelStore.materials.values()][0]!;
    const { id: _id, ...rest } = mat;
    const dup = modelStore.addMaterial({ ...rest, name: 'copy' } as never);
    const rep = repeatedProperties({ ...m, materials: modelStore.materials } as never);
    expect(rep.materials).toEqual([[mat.id, dup]]);
    expect(unifyProperties('materials', rep.materials)).toBe(1);
    expect(modelStore.materials.has(dup)).toBe(false);
  });
});

describe('reversing a member', () => {
  it('leaves the displacements and reactions as they were, and moves its loads', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    modelStore.updateElement(e, { releaseJ: { my: true, mz: false, t: false } } as never);
    modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { tx: false, ty: true, tz: true, rx: false, ry: false, rz: false } });
    modelStore.addDistributedLoad3D(e, 0, 0, -10, -4, 1, 5);
    modelStore.addPointLoadOnElement3D(e, 2, 0, -7);
    const solve = () => { const r = modelStore.solve3D(false, false, true); if (!r || typeof r === 'string') throw new Error(String(r)); return r; };
    const before = solve();
    const rep = flipMembers([e]);
    expect(rep.flipped).toEqual([e]);
    const el = modelStore.elements.get(e)!;
    expect([el.nodeI, el.nodeJ]).toEqual([b, a]);
    expect(el.releaseI.my).toBe(true);
    const after = solve();
    for (const d of before.displacements) {
      const x = after.displacements.find((y) => y.nodeId === d.nodeId)!;
      expect(x.uz).toBeCloseTo(d.uz, 9);
      expect(x.ry).toBeCloseTo(d.ry, 9);
    }
    for (const r of before.reactions) {
      const x = after.reactions.find((y) => y.nodeId === r.nodeId)!;
      expect(x.fz).toBeCloseTo(r.fz, 6);
      expect(x.my).toBeCloseTo(r.my, 6);
    }
  });
});

describe('reversing a member leaves every load where it acts', () => {
  const solve = () => { const r = modelStore.solve3D(false, false, true); if (!r || typeof r === 'string') throw new Error(String(r)); return r; };
  const same = (before: ReturnType<typeof solve>, after: ReturnType<typeof solve>) => {
    for (const r of before.reactions) {
      const x = after.reactions.find((y) => y.nodeId === r.nodeId)!;
      for (const k of ['fx', 'fy', 'fz', 'mx', 'my', 'mz'] as const) expect(x[k]).toBeCloseTo(r[k], 6);
    }
    for (const d of before.displacements) {
      const x = after.displacements.find((y) => y.nodeId === d.nodeId)!;
      for (const k of ['ux', 'uy', 'uz'] as const) expect(x[k]).toBeCloseTo(d[k], 9);
    }
  };

  it('a temperature gradient: the hot face stays the hot face', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addSupport(b, 'fixed3d');
    modelStore.addThermalLoad(e, 10, 20);
    const before = solve();
    flipMembers([e]);
    same(before, solve());
  });

  it.each([
    ['a flat model, in its drawn axes', 'flat'],
    ['a model in the XY plane', 'plane'],
    ['a space model', 'space'],
  ] as const)('plane member loads in %s: along the length, and in the same direction', (_name, kind) => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    if (kind === 'flat') {
      modelStore.addSupport(a, 'fixed');
      modelStore.addSupport(b, 'rollerX');
    } else {
      modelStore.addSupport(a, 'fixed3d');
      modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { tx: false, ty: true, tz: true, rx: true, ry: false, rz: false } });
    }
    if (kind === 'space') {
      // A post out of the plane makes the model a space one.
      const c = modelStore.addNode(0, 0, 3);
      modelStore.addElement(a, c, 'frame');
      modelStore.addSupport(c, 'fixed3d');
    }
    modelStore.addDistributedLoad(e, -10, -4, 0, false, undefined, 1, 5);
    modelStore.addDistributedLoad(e, -3, -3, 30, false);
    modelStore.addPointLoadOnElement(e, 2, -7, { px: 3 });
    modelStore.addPointLoadOnElement(e, 4, -5, { angle: 20 });
    const before = solve();
    flipMembers([e]);
    same(before, solve());
  });
});

describe('repeated properties', () => {
  const props = () => repeatedProperties({ nodes: modelStore.nodes, elements: modelStore.elements, quads: modelStore.quads, plates: modelStore.plates, supports: modelStore.supports, materials: modelStore.materials, sections: modelStore.sections } as never);

  it('are the same in everything but id: a rotated section, or another α, is not a repeat', () => {
    const base = { a: 0.00538, iz: 8.36e-5, iy: 6.04e-6, j: 2.01e-7, b: 0.15, h: 0.3, shape: 'I' as const, tw: 0.0071, tf: 0.0107 };
    // The same profile added twice, and once more turned 90°. (The name counts: it is what finds
    // the catalogue outline a section's stresses are read on.)
    const s1 = modelStore.addSection({ name: 'IPE 300', ...base } as never);
    const s2 = modelStore.addSection({ name: 'IPE 300', ...base, rotation: 90 } as never);
    const s3 = modelStore.addSection({ name: 'IPE 300', ...base } as never);
    expect(props().sections).toEqual([[s1, s3]]);
    void s2;
    const m1 = modelStore.addMaterial({ name: 'A', e: 200000, nu: 0.3, rho: 78.5, fy: 250 } as never);
    const m2 = modelStore.addMaterial({ name: 'B', e: 200000, nu: 0.3, rho: 78.5, fy: 250, alpha: 1e-5 } as never);
    expect(props().materials.some((g) => g.includes(m1) && g.includes(m2))).toBe(false);
  });
});

describe('renumbering what refers to members, shells and nodes', () => {
  it('moves a deflection rule, a saved view’s hidden members and shells, and a time-history force with them', () => {
    // Drawn right to left, so numbering by position reverses them.
    const n = [3, 2, 1, 0].map((k) => modelStore.addNode(k * 2, 0, 0));
    const e = [0, 1, 2].map((k) => modelStore.addElement(n[k]!, n[k + 1]!, 'frame'));
    const c = [[0, 5], [1, 5], [1, 6], [0, 6]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
    const c2 = [[4, 5], [5, 5], [5, 6], [4, 6]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
    const qRight = modelStore.addQuad(c2 as [number, number, number, number], 1, 0.2);
    modelStore.addQuad(c as [number, number, number, number], 1, 0.2);
    const tracked = e[0]!, trackedNode = n[0]!;
    const at = (id: number) => { const el = modelStore.elements.get(id)!; return modelStore.nodes.get(el.nodeI)!.x + modelStore.nodes.get(el.nodeJ)!.x; };
    const where = at(tracked);
    modelStore.setDeflectionLimits({ rules: [{ id: 1, scope: { kind: 'members', ids: [tracked] }, n: 500, direction: 'resultant' }] });
    modelStore.saveView('v', { x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 0 }, { hidden: { elements: [tracked], shells: [`q${qRight}`] } } as never);
    modelStore.setDynamics({ timeHistory: { dt: 0.01, nSteps: 10, method: 'newmark', alpha: 0, damping: 0.05,
      ground: { x: { source: 'none', scale: 1 }, y: { source: 'none', scale: 1 }, z: { source: 'none', scale: 1 } },
      forces: [{ nodeId: trackedNode, dir: 'z', kind: 'step', amplitude: 1 }] } });
    const r = renumber({ nodes: true, members: true, shells: true, order: 'xyz' });
    expect('refused' in r).toBe(false);
    const newTracked = [...modelStore.elements.keys()].find((id) => at(id) === where)!;
    const newNode = [...modelStore.nodes.values()].find((p) => p.x === 6 && p.y === 0)!.id;
    const newQuad = [...modelStore.quads.values()].find((q) => modelStore.nodes.get(q.nodes[0])!.x === 4)!.id;
    expect(newTracked).not.toBe(tracked);
    expect(modelStore.deflectionLimits!.rules[0]!.scope).toEqual({ kind: 'members', ids: [newTracked] });
    expect(modelStore.model.views![0]!.display!.hidden).toEqual({ elements: [newTracked], shells: [`q${newQuad}`] });
    expect(modelStore.model.dynamics!.timeHistory!.forces[0]!.nodeId).toBe(newNode);
  });
});
