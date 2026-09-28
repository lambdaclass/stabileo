/**
 * A settlement happens once: not in every case, and not Σ factors times in a combination.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import '../../store/index';
import { initSolver } from '../wasm-solver';
import { SETTLEMENT_CASE_ID } from '../settlement-case';

const L = 6, SETTLE = -0.01;
let mid = 0, tip = 0, dead = 0, live = 0, combo = 0;

/** A two-span continuous beam along X whose middle support settles 10 mm. */
function beam() {
  modelStore.clear();
  const a = modelStore.addNode(0, 0, 0);
  mid = modelStore.addNode(L, 0, 0);
  const c = modelStore.addNode(2 * L, 0, 0);
  tip = c;
  const e1 = modelStore.addElement(a, mid, 'frame');
  const e2 = modelStore.addElement(mid, c, 'frame');
  const pin = { dofRestraints: { tx: true, ty: true, tz: true, rx: true, ry: false, rz: false } };
  const roller = { dofRestraints: { tx: false, ty: true, tz: true, rx: false, ry: false, rz: false } };
  modelStore.addSupport(a, 'custom3d', undefined, pin);
  modelStore.addSupport(mid, 'custom3d', undefined, { ...roller, dz: SETTLE });
  modelStore.addSupport(c, 'custom3d', undefined, roller);
  for (const x of [...modelStore.combinations]) modelStore.removeCombination(x.id);
  dead = modelStore.addLoadCase('D', 'D');
  live = modelStore.addLoadCase('L', 'L');
  for (const e of [e1, e2]) modelStore.addDistributedLoad3D(e, 0, 0, -10, -10, undefined, undefined, dead);
  modelStore.addDistributedLoad3D(e1, 0, 0, -5, -5, undefined, undefined, live);
  combo = modelStore.addCombination('1.2D + 1.6L', [{ caseId: dead, factor: 1.2 }, { caseId: live, factor: 1.6 }]);
}

const uz = (r: { displacements: Array<{ nodeId: number; uz: number }> }, n: number) => r.displacements.find((d) => d.nodeId === n)!.uz;
const rz = (r: { reactions: Array<{ nodeId: number; fz: number }> }, n: number) => r.reactions.find((d) => d.nodeId === n)?.fz ?? 0;

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; });
afterEach(() => { uiStore.analysisMode = '3d'; });

describe('an imposed settlement in a combination', () => {
  for (const [name, solve] of [
    ['sequential', () => modelStore.solveCombinations3D(false, false, true)],
    ['parallel', () => modelStore.solveCombinations3DParallel(false, false, true)],
  ] as const) {
    it(`is applied once, whatever the factors (${name})`, async () => {
      beam();
      const r = await solve();
      if (!r || typeof r === 'string') throw new Error(String(r));
      // Each load case is solved on the structure without it: the middle support stays put.
      expect(uz(r.perCase.get(dead)!, mid)).toBeCloseTo(0, 12);
      expect(uz(r.perCase.get(live)!, mid)).toBeCloseTo(0, 12);
      // The settlement case holds it, alone.
      const s = r.perCase.get(SETTLEMENT_CASE_ID)!;
      expect(uz(s, mid)).toBeCloseTo(SETTLE, 12);
      // The combination moves the support by the settlement — not by 2.8 times it.
      const c = r.perCombo.get(combo)!;
      expect(uz(c, mid)).toBeCloseTo(SETTLE, 12);
      // And it is exactly the factored cases plus the settlement, once.
      for (const n of [mid, tip]) {
        expect(rz(c, n)).toBeCloseTo(1.2 * rz(r.perCase.get(dead)!, n) + 1.6 * rz(r.perCase.get(live)!, n) + rz(s, n), 8);
      }
      // A settlement on a continuous beam, with no load, is self-equilibrated.
      const sum = [...s.reactions].reduce((t, x) => t + x.fz, 0);
      expect(Math.abs(sum)).toBeLessThan(1e-8);
    });
  }
});

describe('an imposed settlement in a 2D combination', () => {
  beforeEach(() => { uiStore.analysisMode = '2d'; });

  it('is applied once too', () => {
    modelStore.clear();
    const a = modelStore.addNode(0, 0), m = modelStore.addNode(L, 0), c = modelStore.addNode(2 * L, 0);
    const e1 = modelStore.addElement(a, m, 'frame'), e2 = modelStore.addElement(m, c, 'frame');
    modelStore.addSupport(a, 'pinned');
    modelStore.addSupport(m, 'rollerX', undefined, { dz: SETTLE });
    modelStore.addSupport(c, 'rollerX');
    for (const x of [...modelStore.combinations]) modelStore.removeCombination(x.id);
    const d = modelStore.addLoadCase('D', 'D'), l = modelStore.addLoadCase('L', 'L');
    for (const e of [e1, e2]) modelStore.addDistributedLoad(e, -10, -10, undefined, undefined, d);
    modelStore.addDistributedLoad(e1, -5, -5, undefined, undefined, l);
    const k = modelStore.addCombination('1.2D + 1.6L', [{ caseId: d, factor: 1.2 }, { caseId: l, factor: 1.6 }]);
    const r = modelStore.solveCombinations(false);
    if (!r || typeof r === 'string') throw new Error(String(r));
    // Not 2.8 × 10 mm at the settled support.
    expect(uz(r.perCombo.get(k)! as never, m)).toBeCloseTo(SETTLE, 9);
  });
});

describe('the 2D settlement case', () => {
  beforeEach(() => { uiStore.analysisMode = '2d'; });

  it('is solved on the same structure as the load cases: a sliding joint included', async () => {
    const { validateAndSolve2D } = await import('../solver-service');
    modelStore.clear();
    const a = modelStore.addNode(0, 0), m = modelStore.addNode(L, 0), c = modelStore.addNode(2 * L, 0);
    const e1 = modelStore.addElement(a, m, 'frame'), e2 = modelStore.addElement(m, c, 'frame');
    // The first span slides vertically where it meets the settled support.
    modelStore.updateElement(e1, { releaseJ: { mz: false, slide: 'z', slideAxis: 'global' } } as never);
    modelStore.addSupport(a, 'fixed');
    modelStore.addSupport(m, 'rollerX', undefined, { dz: SETTLE });
    modelStore.addSupport(c, 'rollerX');
    for (const x of [...modelStore.combinations]) modelStore.removeCombination(x.id);
    const d = modelStore.addLoadCase('D', 'D');
    modelStore.addDistributedLoad(e2, -10, -10, undefined, undefined, d);
    modelStore.addCombination('1.2D', [{ caseId: d, factor: 1.2 }]);
    const r = modelStore.solveCombinations(false);
    if (!r || typeof r === 'string') throw new Error(String(r));
    const alone = validateAndSolve2D({ ...modelStore.model, loads: [] } as never, false);
    if (!alone || typeof alone === 'string') throw new Error(String(alone));
    const ry = (x: { reactions: Array<{ nodeId: number; rz?: number; rx?: number; my?: number }> }, n: number) => x.reactions.find((q) => q.nodeId === n);
    expect(ry(r.perCase.get(SETTLEMENT_CASE_ID)! as never, a)).toEqual(ry(alone as never, a));
  });
});
