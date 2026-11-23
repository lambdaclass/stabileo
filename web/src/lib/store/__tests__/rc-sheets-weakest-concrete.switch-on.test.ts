import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { uiStore } from '../ui.svelte';
import { historyStore } from '../history.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows, setSheetCode } from '../rc-sheets.svelte';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); resultsStore.clear();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.analysisMode = 'pro'; uiStore.includeSelfWeight = false;
  setSheetCode('cirsoc201-2025');
});
afterEach(() => { uiStore.analysisMode = '3d'; });

describe('a beam drawn in pieces of different concrete', () => {
  it('is designed with the weakest of them, whichever piece comes first', () => {
    const strong = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
    const weak = modelStore.addMaterial({ name: 'H-20', e: 22000, nu: 0.2, rho: 25, fy: 20, fc: 20 });
    const rect = (b: number, h: number) => modelStore.addSection({ name: `${b * 100}×${h * 100}`, a: b * h, iy: b * h ** 3 / 12, iz: h * b ** 3 / 12, j: 0.14 * Math.min(b, h) ** 3 * Math.max(b, h), b, h, shape: 'rect' } as never);
    const col = rect(0.4, 0.4), bm = rect(0.3, 0.6);
    const [a, b, c, mid, d] = [[0, 0], [6, 0], [0, 3], [3, 3], [6, 3]].map(([x, z]) => modelStore.addNode(x!, 0, z!));
    for (const n of [a!, b!]) modelStore.addSupport(n, 'fixed3d');
    const set = (e: number, s: number, m: number) => { modelStore.updateElementSection(e, s); modelStore.updateElementMaterial(e, m); return e; };
    set(modelStore.addElement(a!, c!, 'frame'), col, strong); set(modelStore.addElement(b!, d!, 'frame'), col, strong);
    const D = modelStore.model.loadCases.find((x) => x.type === 'D')!.id;
    for (const [i, j, m] of [[c!, mid!, strong], [mid!, d!, weak]] as const) modelStore.addDistributedLoad3D(set(modelStore.addElement(i, j, 'frame'), bm, m), 0, 0, -30, -30, undefined, undefined, D, { frame: 'global' });
    modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
    recognizePhysicalElements();
    resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
    publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
    const row = buildSheetRows().beam[0]!;
    const materials = row.steps.flatMap((g) => g.steps).find((s) => s.label === 'rcSheets.s.materials')!;
    expect(materials.value).toMatch(/^20 · /);
  });
});
