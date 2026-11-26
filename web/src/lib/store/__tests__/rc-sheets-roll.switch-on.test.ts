import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { uiStore } from '../ui.svelte';
import { historyStore } from '../history.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows } from '../rc-sheets.svelte';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); resultsStore.clear();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.analysisMode = 'pro'; uiStore.includeSelfWeight = false;
});
afterEach(() => { uiStore.analysisMode = '3d'; });

/** A 6 m 30×60 beam in two pieces on two 40×40 columns, 3 m high, 30 kN/m D under 1.4D; the second piece rolled `roll`. */
function portal(roll: number) {
  modelStore.clear(); resultsStore.clear();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  const m = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
  const rect = (b: number, h: number) => modelStore.addSection({ name: `${b * 100}×${h * 100}`, a: b * h, iy: b * h ** 3 / 12, iz: h * b ** 3 / 12, j: 0.14 * Math.min(b, h) ** 3 * Math.max(b, h), b, h, shape: 'rect' } as never);
  const col = rect(0.4, 0.4), bm = rect(0.3, 0.6);
  const [a, b, c, mid, d] = [[0, 0], [6, 0], [0, 3], [3, 3], [6, 3]].map(([x, z]) => modelStore.addNode(x!, 0, z!));
  for (const n of [a!, b!]) modelStore.addSupport(n, 'fixed3d');
  const set = (e: number, s: number) => { modelStore.updateElementSection(e, s); modelStore.updateElementMaterial(e, m); return e; };
  set(modelStore.addElement(a!, c!, 'frame'), col); set(modelStore.addElement(b!, d!, 'frame'), col);
  const D = modelStore.model.loadCases.find((x) => x.type === 'D')!.id;
  for (const [i, j] of [[c!, mid!], [mid!, d!]] as const) modelStore.addDistributedLoad3D(set(modelStore.addElement(i, j, 'frame'), bm), 0, 0, -30, -30, undefined, undefined, D, { frame: 'global' });
  const second = [...modelStore.elements.values()].at(-1)!.id;
  if (roll) modelStore.rotateElementLocalAxes(second, roll);
  modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
  recognizePhysicalElements();
  resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
  publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
  return buildSheetRows().beam[0]!.demand;
}

describe('a beam piece rolled half a turn', () => {
  it('reads the same sagging and hogging as the beam drawn upright', () => {
    const upright = portal(0), rolled = portal(180);
    for (const sec of ['start', 'span', 'end'] as const) {
      expect(rolled[sec].pos.value).toBeCloseTo(upright[sec].pos.value, 3);
      expect(rolled[sec].neg.value).toBeCloseTo(upright[sec].neg.value, 3);
    }
    expect(upright.span.pos.value).toBeGreaterThan(10);
  });
});
