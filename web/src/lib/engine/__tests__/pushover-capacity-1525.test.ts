import { beforeAll, describe, expect, it } from 'vitest';
import { historyStore, modelStore, uiStore } from '../../store';
import { centerlineInput } from '../../store/dynamic-input';
import { plasticInput3D } from '../plastic-moments';
import { plasticForSolve, pushoverNonSteel } from '../advanced-analyses';
import { initSolver, solvePlastic3D } from '../wasm-solver';
import { errorText } from '../../utils/error-text';

const examples = ['3d-portal-frame', '3d-tower', 'space-frame', 'grid-beams', 'tower-3d-2'];

beforeAll(async () => { await initSolver(); });

describe('the PRO pushover payload on 3D steel examples (#1525)', () => {
  it('gives every frame member a plastic moment, and each example solves to a positive collapse factor', async () => {
    const outcome: Record<string, string> = {};
    for (const name of examples) {
      historyStore.clear(); uiStore.analysisMode = 'pro'; modelStore.clear();
      await modelStore.loadExample(name);
      if (pushoverNonSteel(modelStore.elements.values(), modelStore.materials as never).length > 0) { outcome[name] = 'not steel'; continue; }
      const input = centerlineInput({ caseDisplacements: false });
      const p = plasticForSolve(plasticInput3D(modelStore.sections, modelStore.materials, modelStore.elements), input as never, (id) => modelStore.elements.get(id)?.sectionId);
      for (const [, e] of (input as { elements: Map<number, { type: string; sectionId: number }> }).elements) {
        if (e.type !== 'frame') continue;
        const mp = p.mpOverrides[String(e.sectionId)];
        expect(mp, `${name}: section ${e.sectionId}`).toBeDefined();
        expect(mp!.every((m) => Number.isFinite(m) && m > 0), `${name}: section ${e.sectionId} ${mp}`).toBe(true);
      }
      try {
        const r = solvePlastic3D({ solver: input, ...p, maxHinges: 2 });
        expect(r.collapseFactor, name).toBeGreaterThan(0);
        outcome[name] = `λ ${r.collapseFactor}`;
      } catch (err) {
        const text = String(err instanceof Error ? err.message : err);
        expect(text, name).not.toContain('plastic_capacity_missing');
        outcome[name] = errorText(err, '?').slice(0, 60);
      }
    }
    expect(Object.entries(outcome).filter(([, o]) => !o.startsWith('λ '))).toEqual([]);
    uiStore.analysisMode = '2d';
  }, 120_000);
});
