/**
 * A shipped example opened in PRO gets the self-weight rule it was built for, even when the PRO
 * panel's rule effect runs while the example is still loading.
 *
 * `loadExample` clears the model and then awaits the fixture. In the browser the PRO panel's
 * `selfWeightRuleEffect` runs during that await, sees an empty model with no rule, and states
 * `selfWeight: []` for it, as it does for a new project. `loadExample` then read that [] as the
 * example's own rule and left it alone, so the 408-member RC frame solved with no self-weight:
 * ΣRz in its dead-load case was 22 800 kN instead of 36 096.25 kN, and Design all reported
 * 384 verified / 24 biaxial proposals in the browser against 395 / 13 in the engine tests.
 *
 * Effects do not run under vitest, so the test calls the effect where the browser may run it:
 * right after the load starts, and again after a microtask, while the fixture is in flight.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import '../index';
import { selfWeightRuleEffect } from '../self-weight-migration';
import { initSolver } from '../../engine/wasm-solver';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; uiStore.includeSelfWeight = true; uiStore.selfWeightCaseId = null; modelStore.clear(); });

describe('an example loaded while the PRO self-weight effect is live', () => {
  it('keeps the rule the example was built for, and its dead-load case carries the weight', async () => {
    const loading = modelStore.loadExample('rc-design-frame');
    selfWeightRuleEffect();
    await Promise.resolve();
    selfWeightRuleEffect();
    await loading;
    selfWeightRuleEffect();

    expect(modelStore.elements.size).toBe(408);
    expect(modelStore.analysis?.selfWeight).toEqual([{ caseId: 1, direction: 'Z', factor: -1 }]);

    const r = modelStore.solveCombinations3D(uiStore.includeSelfWeight, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    const sumFz = (caseId: number) => r.perCase.get(caseId)!.reactions.reduce((s, x) => s + x.fz, 0);
    // 22 800 kN of explicit dead load plus Σ ρ·A·L = 25 kN/m³ × (3 400 + 9 896.25) / 25 kN.
    expect(sumFz(1)).toBeCloseTo(22_800 + 13_296.25, 3);
    // The weight goes in the dead-load case only.
    expect(sumFz(2)).toBeCloseTo(12_360, 3);
  });
});
