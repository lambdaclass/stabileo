import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import '../index';
import { physicalGroups, recognizePhysicalElements, declarePhysicalKind } from '../physical';

function portal() {
  modelStore.clear();
  historyStore.clear();
  const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(0, 0, 3), modelStore.addNode(6, 0, 3), modelStore.addNode(6, 0, 0),
    modelStore.addNode(12, 0, 3), modelStore.addNode(12, 0, 0)];
  modelStore.addElement(n[0]!, n[1]!, 'frame');
  modelStore.addElement(n[3]!, n[2]!, 'frame');
  modelStore.addElement(n[5]!, n[4]!, 'frame');
  modelStore.addElement(n[1]!, n[2]!, 'frame');
  modelStore.addElement(n[2]!, n[4]!, 'frame');
}

describe('physical elements in the model', () => {
  beforeEach(portal);

  it('recognises three columns and one continuous beam, in one undo step', () => {
    expect(recognizePhysicalElements()).toBe(4);
    const beam = physicalGroups().find((g) => g.physical.kind === 'beam')!;
    expect(beam.members.elements).toHaveLength(2);
    historyStore.undo();
    expect(physicalGroups()).toHaveLength(0);
  });

  it('keeps a declared kind through a new recognition', () => {
    recognizePhysicalElements();
    const col = physicalGroups().find((g) => g.physical.kind === 'column')!;
    declarePhysicalKind(col.id, 'wall');
    recognizePhysicalElements();
    const again = physicalGroups().find((g) => g.id === col.id)!;
    expect(again.physical).toMatchObject({ kind: 'wall', provenance: 'declared' });
    expect(physicalGroups()).toHaveLength(4);
  });

  it('round-trips through a snapshot, an unknown kind included', () => {
    recognizePhysicalElements();
    const g = physicalGroups()[0]!;
    modelStore.setGroupData(g.id, { ...g.data, kind: 'precastPanel', extra: { a: 1 } });
    const snap = JSON.parse(JSON.stringify(modelStore.snapshot()));
    modelStore.clear();
    modelStore.restore(snap);
    expect(modelStore.model.groups.get(g.id)!.data).toMatchObject({ kind: 'precastPanel', extra: { a: 1 } });
  });
});
