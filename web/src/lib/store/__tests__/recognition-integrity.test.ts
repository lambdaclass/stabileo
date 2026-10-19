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
import type { StructuralGrid } from '../../model/grid';

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
