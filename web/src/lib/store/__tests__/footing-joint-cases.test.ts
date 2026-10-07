/**
 * A load at a slab–column joint, as a combination puts it there: through a composite case and a
 * reduced one, as the cases were solved (`case-effects.ts`), not the raw loads by case id.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import '../index';
import { historyStore } from '../history.svelte';
import { nodalLoadAtJoint } from '../detailing-footing-inputs';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); });
beforeEach(() => { modelStore.clear(); historyStore.clear(); });

describe('the load at a joint', () => {
  it('a combination takes it through a composite case, and a reduced case reduced', () => {
    const n = modelStore.addNode(0, 0, 3);
    const D = modelStore.addLoadCase('D', 'D'), L = modelStore.addLoadCase('L', 'L');
    modelStore.addNodalLoad3D(n, 0, 0, -100, 0, 0, 0, D);
    modelStore.addNodalLoad3D(n, 0, 0, -50, 0, 0, 0, L);
    modelStore.updateLoadCaseFields(L, { reduction: { ratio: 0.6, tributaryAreaM2: 80, elementKind: 'interiorBeam', floorsSupported: 1 } });
    const C = modelStore.addLoadCase('C', '');
    modelStore.updateLoadCaseFields(C, { includes: [{ caseId: D, factor: 1.2 }] });
    const viaC = modelStore.addCombination('C', [{ caseId: C, factor: 1 }]);
    const direct = modelStore.addCombination('1.2 D + 1.6 L', [{ caseId: D, factor: 1.2 }, { caseId: L, factor: 1.6 }]);
    expect(nodalLoadAtJoint(n, viaC)).toBeCloseTo(120, 9);
    expect(nodalLoadAtJoint(n, direct)).toBeCloseTo(120 + 1.6 * 0.6 * 50, 9);
  });
});
