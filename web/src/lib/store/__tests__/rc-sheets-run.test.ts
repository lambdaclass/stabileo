/**
 * The sheets are designed on asking, once, for the panel and the workspace alike: step by step with
 * how far they have got, and out of date (not designed again) when what they were designed from
 * changes. A bar layout adopted in them is their own edit and makes them no older.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { uiStore } from '../ui.svelte';
import { historyStore } from '../history.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows, setAdopted, setAlternativeOptions, setColumnEndZones, setDeflectionSettings, setRcOption, setSheetCode, setTorsionMode, sheetRowsSteps } from '../rc-sheets.svelte';
import { changeSheetCode, clearSheets, designSheets, refreshSheetEdits, sheetsRun, sheetsStale } from '../rc-sheets-view.svelte';
import { setFootingSetup, setFootingSizing } from '../rc-sheets-footings';
import { solveAndDesign } from '../rc-sheets-solve.svelte';
import { setScheduleSettings } from '../rc-sheets-schedule';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); clearSheets();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.analysisMode = 'pro'; uiStore.includeSelfWeight = false;
});
afterEach(() => { uiStore.analysisMode = '3d'; });

/** A two-span 30×60 beam on three 40×40 columns, 3 m high, fixed at their feet, under 1,2 D + 1,6 L. */
function solvedFrame() {
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
  const L = modelStore.model.loadCases.find((c) => c.type === 'L')!.id;
  for (const b of beams) { modelStore.addDistributedLoad3D(b, 0, 0, -30, -30, undefined, undefined, D); modelStore.addDistributedLoad3D(b, 0, 0, -10, -10, undefined, undefined, L); }
  modelStore.addCombination('1.2D + 1.6L', [{ caseId: D, factor: 1.2 }, { caseId: L, factor: 1.6 }]);
  recognizePhysicalElements();
  const all = modelStore.solve3D(false, false, true);
  if (!all || typeof all === 'string') throw new Error(String(all));
  resultsStore.setResults3D(all);
  const b = modelStore.solveCombinations3D(false, false, true);
  if (!b || typeof b === 'string') throw new Error(String(b));
  publishCombinations3D(b);
}

describe('designing the sheets on asking', () => {
  it('nothing is designed until asked; then the rows are those of buildSheetRows', async () => {
    solvedFrame();
    expect(sheetsRun.rows).toBeNull();
    expect(sheetsStale()).toBe(false);
    await designSheets();
    expect(sheetsRun.progress).toBeNull();
    const rows = sheetsRun.rows!;
    expect(rows.beam.length).toBeGreaterThan(0);
    expect(rows.column.length).toBeGreaterThan(0);
    expect(rows.beam.map((r) => r.key)).toEqual(buildSheetRows().beam.map((r) => r.key));
  });

  it('the steps count every member up to the total', () => {
    solvedFrame();
    const it = sheetRowsSteps();
    const steps = [];
    let r = it.next();
    for (; !r.done; r = it.next()) steps.push(r.value);
    const design = steps.filter((s) => s.phase === 'design');
    expect(design.length).toBeGreaterThan(0);
    expect(design.map((s) => s.done)).toEqual(design.map((_, k) => k + 1));
    expect(design[design.length - 1]!.done).toBe(design[0]!.total);
    expect(r.value.beam.length).toBeGreaterThan(0);
  });

  it('out of date, not designed again, when the design data change; an adopted layout is the sheets\' own edit', async () => {
    solvedFrame();
    await designSheets();
    const before = sheetsRun.rows;
    const row = before!.column[0]!;
    setAdopted(row.key, row.proposed as never);
    expect(sheetsStale()).toBe(false);
    setSheetCode('aci318-19');
    expect(sheetsStale()).toBe(true);
    expect(sheetsRun.rows).toBe(before);
    await designSheets();
    expect(sheetsStale()).toBe(false);
    expect(sheetsRun.rows!.code).not.toBe(before!.code);
  });

  it('a footing set at a corner or sized otherwise is the sheets\' own edit: the rows follow it at once', async () => {
    solvedFrame();
    await designSheets();
    const key = sheetsRun.rows!.footing![0]!.key;
    expect(sheetsRun.rows!.footing![0]!.edge).toBeUndefined();
    setFootingSetup(key, { position: 'corner' });
    expect(sheetsStale()).toBe(false);
    refreshSheetEdits();
    const corner = sheetsRun.rows!.footing!.find((r) => r.key === key)!;
    expect(corner.edge!.position).toBe('corner');
    expect(Math.abs(corner.ex) + Math.abs(corner.ey)).toBeGreaterThan(0);
    setFootingSizing('full');
    expect(sheetsStale()).toBe(false);
  });

  it('out of date when the deflection settings or the alternatives options change', async () => {
    solvedFrame();
    await designSheets();
    setAlternativeOptions({ fcMax: 40 });
    expect(sheetsStale()).toBe(true);
    await designSheets();
    expect(sheetsStale()).toBe(false);
    setDeflectionSettings({ sustained: 0.5 });
    expect(sheetsStale()).toBe(true);
  });

  it('no older when the schedule\'s waste or mark scope change, which only order the bars', async () => {
    solvedFrame();
    await designSheets();
    setScheduleSettings({ waste: 0.2, scope: 'project' });
    expect(sheetsStale()).toBe(false);
  });

  it('a change of code designs again at once, keeping the rows edited by hand; the code in force changes nothing', async () => {
    solvedFrame();
    await designSheets();
    const before = sheetsRun.rows!;
    await changeSheetCode('cirsoc201-2025');
    expect(sheetsRun.rows).toBe(before);
    setSheetCode('cirsoc201-2025');
    expect(sheetsStale()).toBe(false);
    const col = before.column[0]!;
    setAdopted(col.key, { ...col.proposed, tieSpacing: 0.1 } as never);
    await changeSheetCode('aci318-19');
    expect(sheetsStale()).toBe(false);
    expect(sheetsRun.rows!.code).not.toBe(before.code);
    expect(sheetsRun.rows!.column.find((r) => r.key === col.key)!.adopted.tieSpacing).toBeCloseTo(0.1, 9);
  });

  it('out of date when the results change', async () => {
    solvedFrame();
    await designSheets();
    const b = modelStore.solveCombinations3D(false, false, true);
    if (!b || typeof b === 'string') throw new Error(String(b));
    publishCombinations3D(b);
    expect(sheetsStale()).toBe(true);
  });
});

describe('solving from the sheets', () => {
  it('designs the rows on the results the solve gives, with no step between', async () => {
    let solved = 0;
    const ok = await solveAndDesign(async () => { solved++; solvedFrame(); return { ok: true, combinationsLeftOut: null }; });
    expect(ok).toBe(true);
    expect(solved).toBe(1);
    expect(sheetsRun.rows!.beam.length).toBeGreaterThan(0);
    expect(sheetsStale()).toBe(false);
  });
});

describe('a design run the inputs change under', () => {
  it('designs again from what holds when it ends, instead of marking rows of the old inputs current', async () => {
    solvedFrame();
    let clock = 0;
    const now = vi.spyOn(performance, 'now').mockImplementation(() => (clock += 100));
    try {
      const run = designSheets();
      for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
      expect(sheetsRun.progress).not.toBeNull();
      setRcOption('faces', true);
      await run;
    } finally { now.mockRestore(); }
    expect(sheetsStale()).toBe(false);
    expect(sheetsRun.rows!.beam.every((r) => !!r.demand.faces)).toBe(true);
  });
});

describe('a design option stated at its default', () => {
  it('leaves the sheets current: torsion by equilibrium chosen, a flag turned off that was off, the end zones turned off', async () => {
    solvedFrame();
    await designSheets();
    expect(sheetsStale()).toBe(false);
    setTorsionMode('equilibrium');
    expect(sheetsStale()).toBe(false);
    setRcOption('faces', false);
    expect(sheetsStale()).toBe(false);
    setColumnEndZones(false);
    expect(sheetsStale()).toBe(false);
    setTorsionMode('compatibility');
    expect(sheetsStale()).toBe(true);
  });
});
