import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { uiStore } from '../ui.svelte';
import { historyStore } from '../history.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows, rcSheetsData, setSheetCode } from '../rc-sheets.svelte';
import { rowsCode, scheduleSettings, setScheduleSettings, sheetsSchedule } from '../rc-sheets-schedule';
import { designData } from '../design-data';
import { migrateDesignData } from '../../model/design-data';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); resultsStore.clear();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.analysisMode = 'pro'; uiStore.includeSelfWeight = false;
});
afterEach(() => { uiStore.analysisMode = '3d'; });

/** Two 30×60 spans on three 40×40 columns, 3 m high, fixed at their feet, 30 kN/m D. */
function frame() {
  const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
  const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.1406 * 0.4 ** 4, b: 0.4, h: 0.4, shape: 'rect' } as never);
  const bm = modelStore.addSection({ name: '30×60', a: 0.18, iy: 0.3 * 0.6 ** 3 / 12, iz: 0.6 * 0.3 ** 3 / 12, j: 0.0037, b: 0.3, h: 0.6, shape: 'rect' } as never);
  const base = [0, 5, 10].map((x) => modelStore.addNode(x, 0, 0));
  const top = [0, 5, 10].map((x) => modelStore.addNode(x, 0, 3));
  const cols = base.map((b, i) => modelStore.addElement(b, top[i]!, 'frame'));
  const beams = [modelStore.addElement(top[0]!, top[1]!, 'frame'), modelStore.addElement(top[1]!, top[2]!, 'frame')];
  for (const c of cols) { modelStore.updateElementSection(c, col); modelStore.updateElementMaterial(c, conc); }
  for (const b of beams) { modelStore.updateElementSection(b, bm); modelStore.updateElementMaterial(b, conc); }
  for (const b of base) modelStore.addSupport(b, 'fixed3d');
  const D = modelStore.model.loadCases.find((c) => c.type === 'D')!.id;
  for (const b of beams) modelStore.addDistributedLoad3D(b, 0, 0, -30, -30, undefined, undefined, D);
  modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
  recognizePhysicalElements();
  const all = modelStore.solve3D(false, false, true);
  if (!all || typeof all === 'string') throw new Error(String(all));
  resultsStore.setResults3D(all);
  const b = modelStore.solveCombinations3D(false, false, true);
  if (!b || typeof b === 'string') throw new Error(String(b));
  publishCombinations3D(b);
}

describe('the bending schedule of the sheets', () => {
  it('waste and mark scope are saved with the sheets, 10 % and per element when never set, waste kept within 0–50 %', () => {
    expect(scheduleSettings()).toEqual({ waste: 0.1, scope: 'element' });
    setScheduleSettings({ waste: 0.07 });
    setScheduleSettings({ scope: 'project' });
    expect(rcSheetsData().schedule).toEqual({ waste: 0.07, scope: 'project' });
    setScheduleSettings({ waste: 3 });
    expect(scheduleSettings().waste).toBe(0.5);
    const reopened = migrateDesignData(JSON.parse(JSON.stringify(designData())));
    expect(reopened.rcSheets?.schedule).toEqual({ waste: 0.5, scope: 'project' });
    expect(migrateDesignData({ ...designData(), rcSheets: { version: 1, adopted: {}, schedule: { waste: -1, scope: 'nowhere' } } }).rcSheets?.schedule).toBeUndefined();
  });

  it('schedules the beams\' and columns\' bars of a solved frame, with the waste set on the order', () => {
    frame();
    const rows = buildSheetRows();
    expect(rowsCode(rows)).toBe('cirsoc201-2025');
    setScheduleSettings({ waste: 0.2 });
    const s = sheetsSchedule(rows);
    expect(new Set(s.rows.map((r) => r.family))).toEqual(new Set(['beam', 'column']));
    expect(s.rows.some((r) => r.kind === 'stirrup')).toBe(true);
    expect(s.rows.some((r) => r.kind === 'hoop')).toBe(true);
    // The three columns hold the same bars: one row group of three.
    expect(s.rows.filter((r) => r.family === 'column').every((r) => r.equal === 3)).toBe(true);
    expect(s.total.withWaste).toBeCloseTo(s.total.kg * 1.2, 9);
    setSheetCode('ts500-2000');
    expect(sheetsSchedule(buildSheetRows()).confirm).toBe('rcSheets.bbs.confirmTs500');
  });
});
