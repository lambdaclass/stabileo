/**
 * Each case's totals before solving (the loads panel) and the statics check after it read the same
 * structure: a member declared inactive is out of the solve, and so are its loads and its weight.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import '../../store/index';
import { appliedResultant, staticsCheck } from '../statics-check';

beforeEach(() => { modelStore.clear(); });

describe('the totals of a case with an inactive member', () => {
  it('leave out its loads and its weight, as the statics check does', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0), c = modelStore.addNode(8, 0, 0);
    modelStore.addElement(a, b, 'frame');
    const off = modelStore.addElement(b, c, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    modelStore.updateElement(off, { behaviour: 'inactive' } as never);
    const P = 7, q = 10;
    modelStore.addNodalLoad3D(b, 0, 0, -P, 0, 0, 0);
    modelStore.addDistributedLoad3D(off, 0, 0, -q, -q);
    const caseId = modelStore.model.loadCases[0]!.id;
    const types = new Map(modelStore.model.loadCases.map((x) => [x.id, x.type]));
    // The panel's reading, on the model as it is.
    const bare = appliedResultant(modelStore.model as never, caseId, { includeSelfWeight: false, caseTypes: types });
    expect(bare.applied.fz).toBeCloseTo(-P, 9);
    expect(bare.applied.my).toBeCloseTo(P * 4, 9);
    // With self-weight: what the statics check applies, against reactions of zero.
    const panel = appliedResultant(modelStore.model as never, caseId, { includeSelfWeight: true, caseTypes: types });
    const [row] = staticsCheck({ model: modelStore.model as never, reactionsByCase: new Map([[caseId, []]]), includeSelfWeight: true, caseTypes: types });
    expect(panel.applied.fz).toBeCloseTo(row!.applied.fz, 9);
    expect(panel.applied.my).toBeCloseTo(row!.applied.my, 9);
  });
});
