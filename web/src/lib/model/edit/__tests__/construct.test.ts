/**
 * Construction commands and hole filling.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import { perpendicularMember, midpointMember, fillHoles } from '../construct';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); });
beforeEach(() => { modelStore.clear(); historyStore.clear(); });

const SPEC = { type: 'frame' as const, materialId: 1, sectionId: 1 };

describe('perpendicular and midpoint members', () => {
  it('drops a member from a node onto the foot of its perpendicular, cutting the target there', () => {
    const a = modelStore.addNode(0, 0, 3), b = modelStore.addNode(6, 0, 3), c = modelStore.addNode(2, 4, 3);
    const e = modelStore.addElement(a, b, 'frame');
    historyStore.clear();
    const r = perpendicularMember(c, e, SPEC);
    if ('refused' in r) throw new Error(r.refused);
    const foot = modelStore.nodes.get(r.footNode)!;
    expect([foot.x, foot.y, foot.z]).toEqual([2, 0, 3]);
    const m = modelStore.elements.get(r.elementId)!;
    expect([m.nodeI, m.nodeJ]).toEqual([c, r.footNode]);
    expect(modelStore.elements.size).toBe(3);
    expect(historyStore.undoCount).toBe(1);
  });

  it('refuses a foot at the member end, or a node already on the member', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    expect(perpendicularMember(modelStore.addNode(-1, 3, 0), e, SPEC)).toEqual({ refused: 'footAtEnd' });
    expect(perpendicularMember(modelStore.addNode(3, 0, 0), e, SPEC)).toEqual({ refused: 'alreadyOnMember' });
  });

  it('joins two members at their midpoints', () => {
    const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(4, 0, 0), modelStore.addNode(0, 5, 0), modelStore.addNode(4, 5, 0)];
    const e1 = modelStore.addElement(n[0]!, n[1]!, 'frame'), e2 = modelStore.addElement(n[2]!, n[3]!, 'frame');
    const r = midpointMember(e1, e2, SPEC);
    if ('refused' in r) throw new Error(r.refused);
    expect(r.nodes.map((id) => { const p = modelStore.nodes.get(id)!; return [p.x, p.y]; })).toEqual([[2, 0], [2, 5]]);
  });
});

describe('fill holes', () => {
  /** A 2 × 2 grid of 4 m bays at z = 3. */
  function grid(): number[] {
    const id = (i: number, j: number) => ids[i * 3 + j]!;
    const ids: number[] = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) ids.push(modelStore.addNode(4 * j, 4 * i, 3));
    const els: number[] = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) els.push(modelStore.addElement(id(i, j), id(i, j + 1), 'frame'));
    for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) els.push(modelStore.addElement(id(i, j), id(i + 1, j), 'frame'));
    historyStore.clear();
    return els;
  }

  it('fills each bay of a floor grid with one quad, normal up', () => {
    const r = fillHoles(grid(), 1, 0.15);
    if ('refused' in r) throw new Error(r.refused);
    expect(r.quads.length).toBe(4);
    expect(r.plates.length).toBe(0);
    // Counter-clockwise seen from above: the normal points up.
    for (const q of r.quads) {
      const p = modelStore.quads.get(q)!.nodes.map((n) => modelStore.nodes.get(n)!);
      const u = [p[1]!.x - p[0]!.x, p[1]!.y - p[0]!.y], v = [p[2]!.x - p[0]!.x, p[2]!.y - p[0]!.y];
      expect(u[0]! * v[1]! - u[1]! * v[0]!).toBeGreaterThan(0);
    }
  });

  it('at an element size, meshes each bay with the shell mesher and cuts the beams at its edge nodes', () => {
    const els = grid();
    const r = fillHoles(els, 1, 0.15, { density: { mode: 'targetSize', size: 2 } });
    if ('refused' in r) throw new Error(r.refused);
    expect(r.quads.length).toBe(16);
    // Every beam of the 12 now runs through a midpoint node, so it became two.
    expect(modelStore.elements.size).toBe(24);
    expect(historyStore.undoCount).toBe(1);
  });

  it('a second fill adds nothing, and an L-shaped hole becomes triangles', () => {
    const els = grid();
    fillHoles(els, 1, 0.15);
    const again = fillHoles(els, 1, 0.15);
    if ('refused' in again) throw new Error(again.refused);
    expect(again.skippedExisting).toBe(4);
    modelStore.clear();
    const n = [[0, 0], [6, 0], [6, 3], [3, 3], [3, 6], [0, 6]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
    const ring = n.map((id, k) => modelStore.addElement(id, n[(k + 1) % n.length]!, 'frame'));
    const r = fillHoles(ring, 1, 0.2);
    if ('refused' in r) throw new Error(r.refused);
    expect(r.quads.length).toBe(0);
    expect(r.plates.length).toBe(4);
  });

  it('given a whole frame, fills its floor level by level and leaves the columns alone', () => {
    const els = grid();
    const base = [0, 2, 6, 8].map((k) => [...modelStore.nodes.values()][k]!.id);
    for (const n of base) {
      const p = modelStore.nodes.get(n)!;
      els.push(modelStore.addElement(modelStore.addNode(p.x, p.y, 0), n, 'frame'));
    }
    const r = fillHoles(els, 1, 0.15);
    if ('refused' in r) throw new Error(r.refused);
    expect(r.quads.length).toBe(4);
  });

  it('refuses members that are not in one plane and have no level', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0), c = modelStore.addNode(4, 4, 1), d = modelStore.addNode(0, 4, 0);
    const els = [modelStore.addElement(a, b, 'frame'), modelStore.addElement(b, c, 'frame'), modelStore.addElement(c, d, 'frame'), modelStore.addElement(d, a, 'frame')];
    // Two of the four are level at z = 0, but they bound nothing on their own.
    expect(fillHoles(els, 1, 0.15)).toEqual({ refused: 'noHoles' });
  });
});
