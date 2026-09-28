/**
 * Every fixture-based PRO example, loaded through its card, solves every combination the card
 * builds, and its statics close in forces. The corrections the cards apply are checked where they
 * change what is loaded: La Bombonera's dead load is vertical, the diagrid's wind is in its wind
 * case, the industrial building has a crane, and the bridges' cables work in tension only.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import '../../store/index';
import { initSolver } from '../../engine/wasm-solver';
import { PRO_EXAMPLES } from '../pro-examples';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; });
afterEach(() => { uiStore.analysisMode = '3d'; });

/** Σ of the reactions of one result, in global forces. */
const resultant = (r: { reactions: Array<{ fx: number; fy: number; fz: number }> }) =>
  r.reactions.reduce((s, x) => [s[0]! + x.fx, s[1]! + x.fy, s[2]! + x.fz], [0, 0, 0]);

describe.each(PRO_EXAMPLES.filter((e) => e.source === 'fixture').map((e) => [e.id, e] as const))('%s', (id, ex) => {
  it('solves every combination its card builds', async () => {
    await ex.load();
    const r = modelStore.solveCombinations3D(true, false, true);
    if (!r || typeof r === 'string') throw new Error(`${id}: ${String(r)}`);
    expect(r.perCombo.size + (r.unstable?.length ?? 0)).toBe(modelStore.combinations.length);
    expect(r.unstable ?? []).toEqual([]);

    const dead = modelStore.model.loadCases.find((c) => c.type === 'D')!;
    const d = r.perCase.get(dead.id)!;
    const [hx, hy, v] = resultant(d);
    if (id === 'la-bombonera') {
      // Dead load down, and nothing sideways under it: it was written for a Y-up model.
      expect(v).toBeGreaterThan(0);
      expect(Math.hypot(hx, hy)).toBeLessThan(1e-6 * v);
    }
    if (id === 'xl-diagrid-tower') {
      expect(Math.hypot(hx, hy)).toBeLessThan(1e-6 * v);
      const w = modelStore.model.loadCases.find((c) => c.type === 'W')!;
      expect(Math.hypot(...resultant(r.perCase.get(w.id)!).slice(0, 2))).toBeGreaterThan(100);
    }
    if (id === '3d-nave-industrial') {
      const crane = modelStore.model.loadCases.find((c) => c.name === 'Crane')!;
      expect(resultant(r.perCase.get(crane.id)!)[2]).toBeCloseTo(2 * 60 + 2 * 25, 6);
    }
    if (id === 'suspension-bridge' || id === 'cable-stayed-bridge') {
      expect([...modelStore.elements.values()].some((e) => e.behaviour === 'tensionOnly')).toBe(true);
    }
  }, 600_000);
});
