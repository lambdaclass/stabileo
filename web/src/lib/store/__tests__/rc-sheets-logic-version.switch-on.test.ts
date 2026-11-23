/**
 * Proposals adopted under an older version of the proposals' logic are proposed again; the bars set
 * by hand stay. Adopting stamps the version in force, and the stamp survives a save and reopen.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { uiStore } from '../ui.svelte';
import { historyStore } from '../history.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { adoptAll, buildSheetRows, rcSheetsData, saveRcSheetsData, setAdopted, setSheetCode } from '../rc-sheets.svelte';
import { migrateDesignData } from '../../model/design-data';
import { RC_SHEETS_LOGIC } from '../../rc-sheets/types';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); resultsStore.clear();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.analysisMode = 'pro'; uiStore.includeSelfWeight = false;
});
afterEach(() => { uiStore.analysisMode = '3d'; });

/** A two-span 30×60 beam on three 40×40 columns, 3 m high, fixed at their feet; 30 kN/m of D. */
function frame() {
  const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
  const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.1406 * 0.4 ** 4, b: 0.4, h: 0.4, shape: 'rect' } as never);
  const bm = modelStore.addSection({ name: '30×60', a: 0.18, iy: 0.3 * 0.6 ** 3 / 12, iz: 0.6 * 0.3 ** 3 / 12, j: 0.0037, b: 0.3, h: 0.6, shape: 'rect' } as never);
  const base = [0, 5, 10].map((x) => modelStore.addNode(x, 0, 0)), top = [0, 5, 10].map((x) => modelStore.addNode(x, 0, 3));
  const D = modelStore.model.loadCases.find((c) => c.type === 'D')!.id;
  base.forEach((b, i) => { const c = modelStore.addElement(b, top[i]!, 'frame'); modelStore.updateElementSection(c, col); modelStore.updateElementMaterial(c, conc); modelStore.addSupport(b, 'fixed3d'); });
  for (let i = 0; i < 2; i++) { const e = modelStore.addElement(top[i]!, top[i + 1]!, 'frame'); modelStore.updateElementSection(e, bm); modelStore.updateElementMaterial(e, conc); modelStore.addDistributedLoad3D(e, 0, 0, -30, -30, undefined, undefined, D); }
  modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
  recognizePhysicalElements();
  resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
  publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
  setSheetCode('cirsoc201-2025');
}

describe('adopted proposals and the proposals\' logic', () => {
  it('stamps an adoption with the logic in force, kept through a save and reopen', () => {
    frame();
    const rows = buildSheetRows();
    adoptAll([...rows.column, ...rows.line]);
    expect(rcSheetsData().adoptedLogic).toBe(RC_SHEETS_LOGIC);
    expect(migrateDesignData(JSON.parse(JSON.stringify(modelStore.snapshot().designData))).rcSheets?.adoptedLogic).toBe(RC_SHEETS_LOGIC);
    expect(buildSheetRows().column.every((r) => r.isAdopted)).toBe(true);
  });

  it('proposes again what was adopted under an older logic, and keeps what was set by hand', () => {
    frame();
    const rows = buildSheetRows();
    const col = rows.column[0]!;
    adoptAll([...rows.column, ...rows.line]);
    setAdopted(col.key, { ...col.proposed, tieSpacing: 0.1 });
    const { adoptedLogic: _, ...older } = rcSheetsData();
    saveRcSheetsData(older);
    const again = buildSheetRows();
    expect(again.column.find((r) => r.key === col.key)!.adopted.tieSpacing).toBeCloseTo(0.1, 9);
    expect(again.column.filter((r) => r.key !== col.key).every((r) => !r.isAdopted)).toBe(true);
    expect(again.line.every((l) => !l.isAdopted)).toBe(true);
    adoptAll([...again.column, ...again.line]);
    expect(rcSheetsData().adoptedLogic).toBe(RC_SHEETS_LOGIC);
    expect(buildSheetRows().column.every((r) => r.isAdopted)).toBe(true);
  });
});
