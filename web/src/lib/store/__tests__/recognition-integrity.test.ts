/**
 * Recognising the physical elements of an existing model must not leave references pointing at
 * nothing, must not touch a model it would not change, and must read the slabs as the building
 * tools make them (one per bay), so both ways into the design reach the same elements.
 *
 * The building: two bays of 6 m by one of 5 m, two storeys of 3 m, columns, beams both ways and
 * a slab in every bay, meshed at 1 m. Recognition starts from the same bars and shells with no
 * physical element, as an existing PRO model would.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import '../index';
import { placeFrame, placeSlabs } from '../../model/building/build-on-grid';
import { physicalGroups, declarePhysicalKind } from '../physical';
import { planRecognition, applyRecognition } from '../physical-recognition';
import { groupReferences } from '../group-references';
import { designData, patchOwnDesignData } from '../design-data';
import type { StructuralGrid } from '../../model/grid';
import { expandAll } from '../../model/loads/floor-definitions';

const grid: StructuralGrid = {
  axes: [
    { id: 'A', name: 'A', axis: 'x', at: 0 }, { id: 'B', name: 'B', axis: 'x', at: 6 }, { id: 'C', name: 'C', axis: 'x', at: 12 },
    { id: '1', name: '1', axis: 'y', at: 0 }, { id: '2', name: '2', axis: 'y', at: 5 },
  ],
  levels: [{ id: 'N0', name: 'N0', z: 0 }, { id: 'N1', name: 'N1', z: 3 }, { id: 'N2', name: 'N2', z: 6 }],
};

/** The building as the building tools make it; with `bare`, then stripped of its physical elements. */
function building(bare: boolean): void {
  modelStore.clear(); historyStore.clear();
  modelStore.setGrid(grid);
  const S = { sectionId: 1, materialId: 1 };
  placeFrame(grid, { x: ['A', 'C'], y: ['1', '2'], levels: ['N0', 'N2'], columns: S, beamsX: S, beamsY: S }, { fixBase: true });
  placeSlabs(grid, { levels: ['N1', 'N2'], thickness: 0.15, materialId: 1, meshSize: 1 });
  if (bare) modelStore.batch(() => { for (const g of physicalGroups()) modelStore.removeGroup(g.id); });
  historyStore.clear();
}

const byKind = () => {
  const out: Record<string, number> = {};
  for (const g of physicalGroups()) out[g.physical.kind] = (out[g.physical.kind] ?? 0) + 1;
  return out;
};
const ids = () => physicalGroups().map((g) => g.id).sort((a, b) => a - b);
const undoDepth = () => historyStore.getStacks().undo.length;

describe('recognition of an existing model', () => {
  beforeEach(() => building(true));

  it('reads one slab per bay, as the building tools place them', () => {
    const placed = (() => { building(false); return byKind(); })();
    building(true);
    applyRecognition(planRecognition());
    expect(placed).toEqual({ column: 6, beam: 10, slab: 4 });
    expect(byKind()).toEqual(placed);
  });

  it('a second reading of an unchanged model keeps every id and writes nothing', () => {
    applyRecognition(planRecognition());
    const before = ids(), depth = undoDepth(), version = modelStore.modelVersion;
    const plan = planRecognition();
    expect(plan.changes).toBe(false);
    const out = applyRecognition(plan);
    expect(out.channel).toBe('none');
    expect(ids()).toEqual(before);
    expect(undoDepth()).toBe(depth);
    expect(modelStore.modelVersion).toBe(version);
  });

  it('a floor load on a recognised slab keeps its target and its loads through a second reading', () => {
    applyRecognition(planRecognition());
    const slab = physicalGroups().find((g) => g.physical.kind === 'slab')!;
    const def = modelStore.addGroup('Live N1', 'floorLoad', {}, {
      data: { caseId: 1, q: 2, target: { by: 'group', groupId: slab.id }, distribution: 'slab' },
    });
    // Something changed elsewhere, so the reading is not a no-op: one column is now declared a beam.
    declarePhysicalKind(physicalGroups().find((g) => g.physical.kind === 'column')!.id, 'beam');
    applyRecognition(planRecognition());
    const target = (modelStore.model.groups.get(def)!.data as { target: { groupId: number } }).target.groupId;
    expect(modelStore.model.groups.has(target)).toBe(true);
    expect(modelStore.model.groups.get(target)!.members.quads).toEqual(slab.members.quads);
  });

  /** The two first-floor slabs, and the beam pieces on the edge they share (x = 6, z = 3). */
  function firstFloorPair() {
    const slabs = physicalGroups().filter((g) => g.physical.kind === 'slab' && g.physical.levelFrom === 'N1');
    expect(slabs).toHaveLength(2);
    const [a, b] = slabs as [typeof slabs[0], typeof slabs[0]];
    const shared = new Set((a.members.quads ?? []).flatMap((q) => modelStore.quads.get(q)!.nodes));
    const between = [...modelStore.elements.values()].filter((e) => {
      const ni = modelStore.nodes.get(e.nodeI)!, nj = modelStore.nodes.get(e.nodeJ)!;
      return Math.abs(ni.x - 6) < 1e-6 && Math.abs(nj.x - 6) < 1e-6 && Math.abs(ni.z! - 3) < 1e-6 && Math.abs(nj.z! - 3) < 1e-6
        && shared.has(e.nodeI) && shared.has(e.nodeJ);
    });
    expect(between.length).toBeGreaterThan(0);
    return { a, b, between };
  }
  /** Per floor-load definition: the shells it loads and with what, which is the load itself for a slab distribution. */
  const floorTotals = () => Object.fromEntries(expandAll(modelStore.model as never, { leftHand: false }).map((x) => [x.defId,
    x.loads.map((l) => { const d = l.data as { quadId: number; q: number }; return `${d.quadId}:${d.q}`; }).sort().join(',')]));

  it('two slabs with different decisions merging: shown as a conflict, left out by default, explicit when accepted, loads kept', () => {
    applyRecognition(planRecognition());
    const { a, b, between } = firstFloorPair();
    // Each slab its own tendon layout and floor load; b also in a construction phase.
    patchOwnDesignData({
      postTension: { panels: { [`S${a.id}`]: { x: { n: 4 } } as never, [`S${b.id}`]: { x: { n: 6 } } as never } },
      site: { phases: [{ id: 'f1', name: 'F1' } as never], assign: { [`g${b.id}`]: 'f1' } },
    });
    const defA = modelStore.addGroup('Live A', 'floorLoad', {}, { data: { caseId: 2, q: 2, target: { by: 'group', groupId: a.id }, distribution: 'slab' } });
    const defB = modelStore.addGroup('Live B', 'floorLoad', {}, { data: { caseId: 2, q: 3, target: { by: 'group', groupId: b.id }, distribution: 'slab' } });
    const loadsBefore = floorTotals();
    expect(loadsBefore[defA]!.split(',')).toHaveLength(a.members.quads!.length);
    expect(loadsBefore[defB]!.split(',')).toHaveLength(b.members.quads!.length);

    // The beam between them goes: recognition now proposes one slab.
    modelStore.batch(() => { for (const e of between) modelStore.removeElement(e.id); });
    const plan = planRecognition();
    const merged = plan.proposals.find((p) => p.kind === 'slab' && p.draft.quads.length === (a.members.quads!.length + b.members.quads!.length))!;
    expect(merged.flags).toContain('conflict');
    expect(merged.conflicts.map((c) => [c.place, c.fromId, c.kind]).sort()).toEqual([
      ['phase', b.id, 'merge'], ['tendons', a.id, 'merge'], ['tendons', b.id, 'merge'],
    ].sort());
    expect(plan.freezes.map((f) => f.fromId).sort()).toEqual([a.id, b.id].sort());

    // By default it stays out: both slabs, both layouts, both loads exactly as they were.
    const out1 = applyRecognition(plan);
    expect(out1.conflicts).toEqual([]);
    expect(physicalGroups().filter((g) => g.physical.kind === 'slab' && g.physical.levelFrom === 'N1').map((g) => g.id).sort()).toEqual([a.id, b.id].sort());
    expect(Object.keys(designData().postTension!.panels!).sort()).toEqual([`S${a.id}`, `S${b.id}`].sort());
    expect(floorTotals()).toEqual(loadsBefore);

    // Accepted on purpose: one slab; a's layout kept, b's reported as not moved; the loads on the same areas.
    const plan2 = planRecognition();
    const out2 = applyRecognition(plan2, () => true);
    const one = physicalGroups().filter((g) => g.physical.kind === 'slab' && g.physical.levelFrom === 'N1');
    expect(one).toHaveLength(1);
    const survivor = one[0]!.id;
    expect(out2.conflicts.length).toBe(3);
    expect(out2.dropped).toEqual([{ place: 'tendons', fromId: b.id, toId: survivor }]);
    expect(designData().postTension!.panels).toEqual({ [`S${survivor}`]: { x: { n: survivor === a.id ? 4 : 6 } } });
    expect(designData().site!.assign).toEqual({ [`g${survivor}`]: 'f1' });
    expect(out2.frozen).toBe(2);
    expect(floorTotals()).toEqual(loadsBefore);
    for (const id of [a.id, b.id]) if (!modelStore.model.groups.has(id)) expect(groupReferences(id)).toEqual([]);
    // One undo takes all of it back.
    historyStore.undo();
    expect(physicalGroups().filter((g) => g.physical.kind === 'slab' && g.physical.levelFrom === 'N1').map((g) => g.id).sort()).toEqual([a.id, b.id].sort());
    expect(Object.keys(designData().postTension!.panels!).sort()).toEqual([`S${a.id}`, `S${b.id}`].sort());
  });

  it('an element split in two: its loads keep their bars, its bars keep their reinforcement, its decision is a conflict', () => {
    applyRecognition(planRecognition());
    // An earlier reading that took two beams as one element: the X beam on axis 1 and the Y beam on axis A, at N1.
    const beams = physicalGroups().filter((g) => g.physical.kind === 'beam' && g.physical.levelFrom === 'N1');
    const onX1 = beams.find((g) => (g.members.elements ?? []).every((id) => Math.abs(modelStore.nodes.get(modelStore.elements.get(id)!.nodeI)!.y) < 1e-6))!;
    const onYA = beams.find((g) => (g.members.elements ?? []).every((id) => Math.abs(modelStore.nodes.get(modelStore.elements.get(id)!.nodeI)!.x) < 1e-6))!;
    const both = [...(onX1.members.elements ?? []), ...(onYA.members.elements ?? [])];
    modelStore.batch(() => {
      modelStore.removeGroup(onYA.id);
      modelStore.setGroupMembers(onX1.id, { elements: both });
    });
    const g = onX1.id;
    // Self-weight scoped to it, a phase decided for it, and bars on one of its pieces.
    const caseId = modelStore.model.loadCases[0]!.id;
    modelStore.setAnalysis({ selfWeight: [{ caseId, direction: 'Z', factor: -1, groupId: g } as never] });
    patchOwnDesignData({ site: { phases: [{ id: 'f1', name: 'F1' } as never], assign: { [`g${g}`]: 'f1' } } });
    const piece = onYA.members.elements![0]!;
    const bars = { longitudinal: { top: [{ count: 2, diameter: 12 }], bottom: [{ count: 3, diameter: 16 }] } };
    modelStore.reinforcementTransaction((api) => api.setReinforcement(piece, bars as never));
    const rebarBefore = JSON.stringify(modelStore.elements.get(piece)!.reinforcement);

    const plan = planRecognition();
    const parts = plan.proposals.filter((p) => p.draft.elements.some((id) => both.includes(id)));
    expect(parts).toHaveLength(2);
    const keeper = parts.find((p) => p.keepId === g)!;
    expect(keeper.conflicts).toEqual([{ place: 'phase', fromId: g, fromName: onX1.name, kind: 'split' }]);
    expect(plan.freezes).toEqual([{ fromId: g, fromName: onX1.name, places: ['selfWeight'] }]);

    // The default leaves the conflicted part out, applies the other; the self-weight still covers both beams.
    applyRecognition(plan);
    const sw = modelStore.model.analysis!.selfWeight![0] as { groupId?: number; elements?: number[] };
    const covered = sw.groupId !== undefined ? modelStore.model.groups.get(sw.groupId)!.members.elements! : sw.elements!;
    expect([...covered].sort((x, y) => x - y)).toEqual([...both].sort((x, y) => x - y));
    expect(JSON.stringify(modelStore.elements.get(piece)!.reinforcement)).toBe(rebarBefore);
    expect(designData().site!.assign).toEqual({ [`g${g}`]: 'f1' });
  });

  it('accepts by kind with exceptions, and what was not accepted stays as it was', () => {
    const plan = planRecognition();
    const beams = plan.proposals.filter((p) => p.kind === 'beam');
    const exception = beams[0]!.key;
    applyRecognition(plan, (p) => p.kind === 'beam' && p.key !== exception);
    expect(byKind()).toEqual({ beam: beams.length - 1 });
  });

  it('declaring a kind is a design edit: the solve survives it and one undo takes it back', () => {
    applyRecognition(planRecognition());
    const col = physicalGroups().find((g) => g.physical.kind === 'column')!;
    const version = modelStore.modelVersion;
    declarePhysicalKind(col.id, 'beam');
    expect(modelStore.modelVersion).toBe(version);
    historyStore.undo();
    expect(physicalGroups().find((g) => g.id === col.id)!.physical.kind).toBe('column');
    expect(modelStore.modelVersion).toBe(version);
  });
});
