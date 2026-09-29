/**
 * The direct analysis reads the project's rules as Solve does. It used to build its model without
 * `analysis`, so self-weight fell back to the older rule (weight in every dead-load case, or
 * none): a stated self-weight in one case was counted twice or lost, depending on a toggle PRO
 * hides once a rule exists.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { directAnalysis } from '../direct-analysis.svelte';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; modelStore.clear(); directAnalysis.clear(); });

describe('the direct analysis and the self-weight rule', () => {
  for (const toggle of [true, false]) {
    it(`takes the stated self-weight once (legacy toggle ${toggle ? 'on' : 'off'})`, async () => {
      uiStore.includeSelfWeight = toggle;
      const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 4);
      modelStore.addElement(a, b, 'frame');
      modelStore.addSupport(a, 'fixed3d');
      for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
      for (const c of [...modelStore.model.loadCases]) if (c.id !== 1) modelStore.removeLoadCase(c.id);
      const cm = modelStore.addLoadCase('CM', 'D');
      modelStore.addNodalLoad3D(b, 0, 0, -100, 0, 0, 0, cm);
      modelStore.adoptAnalysis({ selfWeight: [{ caseId: 1, direction: 'Z', factor: -1 }] });
      const combo = modelStore.addCombination('PP + CM', [{ caseId: 1, factor: 1 }, { caseId: cm, factor: 1 }]);
      const lin = modelStore.solveCombinations3D(false, false, true);
      if (!lin || typeof lin === 'string') throw new Error(String(lin));
      const rz = (r: { reactions: Array<{ fz: number }> }) => r.reactions.reduce((s, x) => s + x.fz, 0);
      const linear = rz(lin.perCombo.get(combo)!);
      expect(linear).toBeGreaterThan(100);
      await directAnalysis.run();
      expect(directAnalysis.error).toBeNull();
      expect(rz(directAnalysis.forces()!.get(combo)!)).toBeCloseTo(linear, 6);
    });
  }
});
