import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { uiStore } from '../ui.svelte';
import { historyStore } from '../history.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows, setRcOption } from '../rc-sheets.svelte';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); resultsStore.clear();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.analysisMode = 'pro'; uiStore.includeSelfWeight = false;
  setRcOption('faces', true);
});
afterEach(() => { uiStore.analysisMode = '3d'; setRcOption('faces', false); });

/** A 6 m 30×60 beam on two 40×40 columns, 3 m high, 20 kN/m D and 200 kN at `a` m from its left node, under 1.4D. */
function beamWithLoadAt(a: number) {
  modelStore.clear(); resultsStore.clear();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  setRcOption('faces', true);
  const m = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
  const rect = (b: number, h: number) => modelStore.addSection({ name: `${b * 100}×${h * 100}`, a: b * h, iy: b * h ** 3 / 12, iz: h * b ** 3 / 12, j: 0.14 * Math.min(b, h) ** 3 * Math.max(b, h), b, h, shape: 'rect' } as never);
  const col = rect(0.4, 0.4), bm = rect(0.3, 0.6);
  const [n0, n1, c, d] = [[0, 0], [6, 0], [0, 3], [6, 3]].map(([x, z]) => modelStore.addNode(x!, 0, z!));
  for (const n of [n0!, n1!]) modelStore.addSupport(n, 'fixed3d');
  const set = (e: number, s: number) => { modelStore.updateElementSection(e, s); modelStore.updateElementMaterial(e, m); return e; };
  set(modelStore.addElement(n0!, c!, 'frame'), col); set(modelStore.addElement(n1!, d!, 'frame'), col);
  const beam = set(modelStore.addElement(c!, d!, 'frame'), bm);
  const D = modelStore.model.loadCases.find((x) => x.type === 'D')!.id;
  modelStore.addDistributedLoad3D(beam, 0, 0, -20, -20, undefined, undefined, D, { frame: 'global' });
  modelStore.addPointLoadOnElement3D(beam, a, 0, -200, D);
  modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
  recognizePhysicalElements();
  resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
  publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
  return buildSheetRows().beam[0]!.demand;
}

describe('the shear a beam is checked for', () => {
  it('is read at the face where a concentrated load sits between the face and d', () => {
    const near = beamWithLoadAt(0.5), far = beamWithLoadAt(3);
    expect(near.vu.source!.x!).toBeCloseTo(near.start.x, 6);
    expect(far.vu.source!.x!).toBeGreaterThan(far.start.x + 0.1);
  });
});
