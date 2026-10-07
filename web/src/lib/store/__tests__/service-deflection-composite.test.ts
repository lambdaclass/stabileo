/**
 * The unfactored gravity sum the deflection check reads without a service envelope leaves a
 * composite case out, whatever it is typed: its cases are in the sum already, and it counted
 * them again with its own loads.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { uiStore } from '../ui.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D } from '../active-results';
import { serviceSets } from '../service-deflection';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); uiStore.analysisMode = 'pro'; });
afterEach(() => { uiStore.analysisMode = '3d'; });

describe('the gravity sum', () => {
  it('leaves a composite case typed D out', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
    const beam = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(b, 'fixed3d');
    for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
    const D = modelStore.addLoadCase('Dd', 'D'), L = modelStore.addLoadCase('Ll', 'L');
    modelStore.addDistributedLoad3D(beam, 0, 0, -10, -10, undefined, undefined, D);
    modelStore.addDistributedLoad3D(beam, 0, 0, -30, -30, undefined, undefined, L);
    const C = modelStore.addLoadCase('Cc', 'D');
    modelStore.updateLoadCaseFields(C, { includes: [{ caseId: D, factor: 1 }, { caseId: L, factor: 1 }] });
    modelStore.addDistributedLoad3D(beam, 0, 0, -5, -5, undefined, undefined, C);
    modelStore.addCombination('1.2D+1.6L', [{ caseId: D, factor: 1.2 }, { caseId: L, factor: 1.6 }]);
    const r = modelStore.solveCombinations3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    resultsStore.setResults3D([...r.perCase.values()][0]!);
    publishCombinations3D(r);
    const s = serviceSets();
    expect(s.basis).toBe('gravity');
    expect(s.sets.find((x) => x.id === -1e9)!.name).toBe('Dd + Ll');
  });
});
