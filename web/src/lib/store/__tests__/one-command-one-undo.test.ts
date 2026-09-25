/**
 * One command, one undo step, and nothing left pointing at a deleted id.
 *
 * The geometry commands compose store mutations — a mirror adds nodes and members and copies
 * the groups that hold them; an intersection splits two members. For Ctrl+Z to take such a
 * command back in one press, every mutation it calls must join the command's batch, and every
 * removal must take its references with it. These pin both, on the store the app uses.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';

beforeAll(async () => {
  // The history store wires itself into the model store on a microtask.
  await new Promise((r) => setTimeout(r, 0));
});

beforeEach(() => {
  modelStore.clear();
  historyStore.clear();
});

/** A 6 m beam on two supports, material and section 1. */
function beam(): { a: number; b: number; e: number } {
  const a = modelStore.addNode(0, 0, 0);
  const b = modelStore.addNode(6, 0, 0);
  const e = modelStore.addElement(a, b, 'frame');
  historyStore.clear();
  return { a, b, e };
}

describe('batches compose', () => {
  it('a batch inside a batch is part of it', () => {
    beam();
    const before = modelStore.nodes.size;
    modelStore.batch(() => {
      modelStore.addNode(1, 1, 0);
      modelStore.batch(() => modelStore.addNode(2, 2, 0));
      modelStore.addNode(3, 3, 0);
    });
    expect(historyStore.undoCount).toBe(1);
    historyStore.undo();
    expect(modelStore.nodes.size).toBe(before);
  });

  it('a split inside a batch does not close it', () => {
    const { e } = beam();
    modelStore.batch(() => {
      modelStore.splitElementAtPoint(e, 0.5);
      modelStore.addNode(9, 9, 9);
      modelStore.addGroup('g', 'selection', { nodes: [] });
    });
    expect(historyStore.undoCount).toBe(1);
    historyStore.undo();
    expect(modelStore.elements.size).toBe(1);
    expect(modelStore.model.groups.size).toBe(0);
  });
});

describe('ids are not reused', () => {
  it('a group created after opening a file with groups gets a new id', () => {
    beam();
    const g1 = modelStore.addGroup('A', 'selection', { nodes: [1] });
    const snap = JSON.parse(JSON.stringify(modelStore.snapshot()));
    modelStore.clear();
    modelStore.restore(snap);
    const g2 = modelStore.addGroup('B', 'selection', { nodes: [2] });
    expect(g2).not.toBe(g1);
    expect(modelStore.model.groups.get(g1)?.name).toBe('A');
  });
});

describe('removals take their references with them', () => {
  it('removing a node removes its members through removeElement: loads and groups go too', () => {
    const { a, e } = beam();
    modelStore.addDistributedLoad3D(e, 0, 0, -10, -10, undefined, undefined, 1);
    const g = modelStore.addGroup('beam', 'selection', { elements: [e] });
    modelStore.removeNode(a);
    expect(modelStore.elements.has(e)).toBe(false);
    expect(modelStore.loads.some((l) => (l.data as { elementId?: number }).elementId === e)).toBe(false);
    expect(modelStore.model.groups.get(g)?.members.elements).toEqual([]);
  });

  it('removing a quad or a plate drops it from its groups', () => {
    const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(1, 0, 0), modelStore.addNode(1, 1, 0), modelStore.addNode(0, 1, 0)];
    const q = modelStore.addQuad([n[0]!, n[1]!, n[2]!, n[3]!], 1, 0.2);
    const p = modelStore.addPlate([n[0]!, n[1]!, n[2]!], 1, 0.2);
    const g = modelStore.addGroup('slab', 'floor', { quads: [q], plates: [p] });
    modelStore.removeQuad(q);
    modelStore.removePlate(p);
    expect(modelStore.model.groups.get(g)?.members).toEqual({ quads: [], plates: [] });
  });
});

/** Resultant force and its moment about node I, along the member, of every load on `ids`. */
function resultantOn(ids: number[], L: number[]): { F: number; M: number } {
  let F = 0, M = 0;
  let offset = 0;
  ids.forEach((id, k) => {
    for (const l of modelStore.loads) {
      if ((l.data as { elementId?: number }).elementId !== id) continue;
      if (l.type === 'distributed3d') {
        const d = l.data as any;
        const a = d.a ?? 0, b = d.b ?? L[k]!;
        const P = (d.qZI + d.qZJ) / 2 * (b - a);
        const x = Math.abs(d.qZI + d.qZJ) < 1e-12 ? (a + b) / 2 : a + (b - a) * (d.qZI + 2 * d.qZJ) / (3 * (d.qZI + d.qZJ));
        F += P; M += P * (offset + x);
      } else if (l.type === 'pointOnElement3d') {
        const d = l.data as any;
        F += d.pz; M += d.pz * (offset + d.a);
      }
    }
    offset += L[k]!;
  });
  return { F, M };
}

describe('a split member keeps everything that was on it', () => {
  it('a partial trapezoid across the cut, and a point load beyond it, keep force and moment', () => {
    const { e } = beam();
    modelStore.addDistributedLoad3D(e, 0, 0, -4, -10, 1, 5, 1);   // trapezoid on [1, 5] m
    modelStore.addPointLoadOnElement3D(e, 4.5, 0, -20, 1);                  // at 4.5 m
    const before = resultantOn([e], [6]);
    const r = modelStore.splitMember(e, [0.5])!;                   // cut at 3 m
    const after = resultantOn(r.segmentIds, [3, 3]);
    expect(after.F).toBeCloseTo(before.F, 9);
    expect(after.M).toBeCloseTo(before.M, 9);
    // The point load moved to the second segment, 1.5 m from its start.
    const pl = modelStore.loads.find((l) => l.type === 'pointOnElement3d')!.data as any;
    expect(pl.elementId).toBe(r.segmentIds[1]);
    expect(pl.a).toBeCloseTo(1.5, 12);
  });

  it('subdividing clips a partial load instead of spreading it along the whole member', () => {
    const { e } = beam();
    modelStore.addDistributedLoad(e, -6, -6, undefined, undefined, 1, 0, 2); // 2D load on [0, 2] m only
    modelStore.subdivideElement(e, 3);
    const onSegments = modelStore.loads.filter((l) => l.type === 'distributed');
    expect(onSegments.length).toBe(1);
    const total = onSegments.reduce((s, l) => { const d = l.data as any; return s + (d.qI + d.qJ) / 2 * ((d.b ?? 2) - (d.a ?? 0)); }, 0);
    expect(total).toBeCloseTo(-12, 9);
  });

  it('preserves thermal, releases, the offset line, and the curve tag across segments', () => {
    const { e } = beam();
    modelStore.updateElement(e, {
      releaseI: { my: true, mz: true, t: false }, releaseJ: { my: false, mz: true, t: false },
      offset: { frame: 'global', i: { x: 0, y: 0, z: 0.2 }, j: { x: 0, y: 0, z: -0.2 } },
      arc: { id: 'arc-1', spec: {} as never },
      reinforcement: {} as never,
    } as never);
    modelStore.addThermalLoad(e, 20, 5, 1);
    const r = modelStore.splitMember(e, [1 / 3, 2 / 3])!;
    expect(r.segmentIds.length).toBe(3);
    expect(r.droppedReinforcement).toBe(true);
    const seg = r.segmentIds.map((id) => modelStore.elements.get(id)!);
    expect(seg[0]!.releaseI).toEqual({ my: true, mz: true, t: false });
    expect(seg[0]!.releaseJ).toEqual({ my: false, mz: false, t: false });
    expect(seg[2]!.releaseJ).toEqual({ my: false, mz: true, t: false });
    // Each cut stays on the original straight flexible line from z=0.2 to z=-0.2.
    expect(seg[0]!.offset!.i!.z).toBeCloseTo(0.2, 12);
    expect(seg[0]!.offset!.j!.z).toBeCloseTo(0.2 / 3, 12);
    expect(seg[1]!.offset!.i).toEqual(seg[0]!.offset!.j);
    expect(seg[1]!.offset!.j!.z).toBeCloseTo(-0.2 / 3, 12);
    expect(seg[2]!.offset!.i).toEqual(seg[1]!.offset!.j);
    expect(seg[2]!.offset!.j!.z).toBeCloseTo(-0.2, 12);
    expect(seg.every((s) => (s as any).arc?.id === 'arc-1')).toBe(true);
    expect(seg.every((s) => s.reinforcement === undefined)).toBe(true);
    expect(modelStore.loads.filter((l) => l.type === 'thermal').map((l) => (l.data as any).elementId).sort())
      .toEqual([...r.segmentIds].sort());
  });

  it('a group holding the member holds every segment, and a support framed by it takes its own end', () => {
    const { a, b, e } = beam();
    const g = modelStore.addGroup('beam', 'physicalMember', { elements: [e] }, { data: { rule: 'kept verbatim' } });
    modelStore.addSupport(b, 'fixed3d', undefined, { dofFrame: 'local', dofLocalElementId: e });
    const r = modelStore.splitMember(e, [0.5])!;
    expect(modelStore.model.groups.get(g)?.members.elements).toEqual(r.segmentIds);
    expect(modelStore.model.groups.get(g)?.data).toEqual({ rule: 'kept verbatim' });
    const sup = [...modelStore.supports.values()].find((s) => s.nodeId === b)!;
    expect(sup.dofLocalElementId).toBe(r.segmentIds[1]);
    void a;
  });
});
