/**
 * PRO examples arrive with CIRSOC 101-2025's strength combinations built from their cases: W at
 * 1,0 or 0,5 (never the 2005 1,6), each wind or seismic case alone and in both senses. The
 * offshore platform keeps its own: its "E" is wave and current, not an earthquake.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import '../../store/index';
import { initSolver } from '../../engine/wasm-solver';
import { PRO_EXAMPLES } from '../pro-examples';

const byFixture = (id: string) => PRO_EXAMPLES.find((e) => new RegExp(`['"]${id}['"]`).test(String(e.load)))!;
const wFactors = () => {
  const w = new Set(modelStore.model.loadCases.filter((c) => c.type === 'W').map((c) => c.id));
  return new Set(modelStore.combinations.flatMap((c) => c.factors.filter((f) => w.has(f.caseId) && f.factor !== 0).map((f) => Math.abs(f.factor))));
};

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; });
afterEach(() => { uiStore.analysisMode = '3d'; });

describe('PRO examples load with CIRSOC 101-2025 combinations', () => {
  it('replaces a fixture’s 2005 combinations (1,6 W) with 2025 ones', async () => {
    await byFixture('rc-design-frame').load();
    // 0,5 W only accompanies a roof action (combination 1), and this frame has none.
    expect([...wFactors()]).toEqual([1]);
    expect(modelStore.combinations.every((c) => /^U\d+: /.test(c.name))).toBe(true);
    // Both senses: a wind combination and its mirror.
    const w = modelStore.model.loadCases.find((c) => c.type === 'W')!.id;
    const signs = new Set(modelStore.combinations.flatMap((c) => c.factors.filter((f) => f.caseId === w).map((f) => Math.sign(f.factor))));
    expect(signs).toEqual(new Set([1, -1]));
  });

  it('gives combinations to an example that had none', async () => {
    await byFixture('pipe-rack').load();
    expect(modelStore.combinations.length).toBeGreaterThan(4);
    expect([...wFactors()]).toEqual([1]);
  });

  it('with a roof case, W also enters at 0,5', async () => {
    await byFixture('pro-edificio-7p').load();
    expect([...wFactors()].sort()).toEqual([0.5, 1]);
  });

  it('keeps the offshore platform as stated', async () => {
    await byFixture('offshore-platform').load();
    expect(modelStore.combinations.some((c) => c.name.startsWith('U3: 1.2D + L + 1.6W'))).toBe(true);
  });
});
