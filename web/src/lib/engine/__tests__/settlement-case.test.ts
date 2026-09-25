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
