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
