import { afterEach, beforeAll, expect, it } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { uiStore } from '../ui.svelte';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows, setSheetCode, sheetRowsSteps, type SheetRows } from '../rc-sheets.svelte';
import { clearSheets, designSheets, sheetsRun } from '../rc-sheets-view.svelte';
import { initSolver } from '../../engine/wasm-solver';
import type { ElementForces3D } from '../../engine/types-3d';

beforeAll(async () => { await initSolver(); });
afterEach(() => { clearSheets(); resultsStore.clear(); modelStore.clear(); uiStore.analysisMode = '2d'; });

function input(secondOrder: boolean) {
  clearSheets(); resultsStore.clear(); modelStore.clear(); uiStore.analysisMode = 'pro';
  const material = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
  const section = modelStore.addSection({ name: 'beam', a: 0.18, iy: 0.0054, iz: 0.00135, j: 0.0037, b: 0.3, h: 0.6, shape: 'rect' });
  const start = modelStore.addNode(0, 0, 0), end = modelStore.addNode(1, 0, 0);
  const id = modelStore.addElement(start, end, 'frame');
  modelStore.updateElementMaterial(id, material); modelStore.updateElementSection(id, section);
  modelStore.addSupport(start, 'fixed3d'); modelStore.addSupport(end, 'fixed3d');
  recognizePhysicalElements(); modelStore.model.combinations = [];
  const forces: ElementForces3D = {
    elementId: id, length: 1, nStart: -10, nEnd: -10, vyStart: 0, vyEnd: 0, vzStart: -1, vzEnd: 0,
    mxStart: 0, mxEnd: 0, myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0,
    releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false,
    qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, distributedLoadsY: [], distributedLoadsZ: [], pointLoadsY: [], pointLoadsZ: [{ a: 0.37, p: 1 / (1 - 0.37) }],
  };
  resultsStore.setResults3D({ displacements: [], reactions: [], elementForces: [forces], ...(secondOrder ? { secondOrder: { converged: true, iterations: 1, stable: true, b2: 1 } } : {}) });
}

it('known wrong result: #2092 every sheet design entry retains critical stations from linear and second-order results', async () => {
  const check = (rows: SheetRows) => {
    expect(rows.beam).toHaveLength(1);
    expect(rows.beam[0]!.demand.env!.find((p) => p.x === 0.37)).toMatchObject({ neg: 0.37, nNeg: 10 });
  };
  for (const secondOrder of [false, true]) for (const code of ['cirsoc201-2025', 'aci318-19', 'en1992-1-1', 'bs-en1992-1-1', 'ts500-2000'] as const) {
    input(secondOrder); setSheetCode(code);
    check(buildSheetRows());
    const steps = sheetRowsSteps();
    for (let step = steps.next(); ; step = steps.next()) { if (step.done) { check(step.value); break; } }
    await designSheets();
    expect(sheetsRun.rows).not.toBeNull();
    check(sheetsRun.rows!);
  }
});
