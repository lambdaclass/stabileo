import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore, uiStore } from '../../../store';
import { nextMember } from '../../../store/next-member.svelte';
import { physicalGroups } from '../../../store/physical';

describe('members drawn as what they are', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro'; nextMember.physical = null; });

  it('a chain of beams is one beam, a column drawn storey by storey is one column, a brace is each its own', () => {
    modelStore.setGrid({ axes: [], levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }, { id: 'N2', name: 'P2', z: 6 }] });
    const a = modelStore.addNode(0, 0, 3), b = modelStore.addNode(5, 0, 3), c = modelStore.addNode(10, 0, 3);
    nextMember.physical = { kind: 'beam', typology: 'dropped' };
    nextMember.add(a, b); nextMember.add(b, c);
    const beams = physicalGroups().filter((g) => g.physical.kind === 'beam');
    expect(beams).toHaveLength(1);
    expect(beams[0]!.members.elements).toHaveLength(2);
    expect(beams[0]!.physical).toMatchObject({ levelFrom: 'N1', levelTo: 'N1', typology: 'dropped', provenance: 'declared' });

    const p0 = modelStore.addNode(0, 5, 0), p1 = modelStore.addNode(0, 5, 3), p2 = modelStore.addNode(0, 5, 6);
    nextMember.physical = { kind: 'column', typology: 'concrete' };
    nextMember.add(p0, p1); nextMember.add(p1, p2);
    const col = physicalGroups().find((g) => g.physical.kind === 'column')!;
    expect(col.members.elements).toHaveLength(2);
    expect(col.physical).toMatchObject({ levelFrom: 'N0', levelTo: 'N2' });

    nextMember.physical = { kind: 'brace', typology: 'steel' };
    nextMember.add(p0, b); nextMember.add(b, p2);
    expect(physicalGroups().filter((g) => g.physical.kind === 'brace')).toHaveLength(2);

    // An inclined beam between two levels keeps both.
    nextMember.physical = { kind: 'beam' };
    nextMember.add(c, p2);
    const inclined = physicalGroups().filter((g) => g.physical.kind === 'beam').at(-1)!;
    expect(inclined.physical).toMatchObject({ levelFrom: 'N1', levelTo: 'N2' });

    // Each drawn member is still one undo step, its declaration with it.
    const n = physicalGroups().length;
    historyStore.undo();
    expect(physicalGroups()).toHaveLength(n - 1);
  });

  it('with no kind chosen a drawn member is a plain bar', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(1, 0, 0);
    nextMember.add(a, b);
    expect(physicalGroups()).toHaveLength(0);
  });
});
