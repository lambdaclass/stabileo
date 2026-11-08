import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { uiStore } from '../ui.svelte';
import { historyStore } from '../history.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows, rcSheetsData, setAdopted, setTorsionMode, adoptAll } from '../rc-sheets.svelte';
import { rcSheetsWorkbook } from '../../rc-sheets/workbook';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); resultsStore.clear();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.analysisMode = 'pro'; uiStore.includeSelfWeight = false;
});
afterEach(() => { uiStore.analysisMode = '3d'; });

function solve() {
  recognizePhysicalElements();
  const all = modelStore.solve3D(false, false, true);
  if (!all || typeof all === 'string') throw new Error(String(all));
  resultsStore.setResults3D(all);
  const b = modelStore.solveCombinations3D(false, false, true);
  if (!b || typeof b === 'string') throw new Error(String(b));
  publishCombinations3D(b);
}

/** A two-span 30×60 beam on three 40×40 columns, 3 m high, fixed at their feet; 30 kN/m D and 10 kN/m L. */
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
  const L = modelStore.model.loadCases.find((c) => c.type === 'L')!.id;
  for (const b of beams) { modelStore.addDistributedLoad3D(b, 0, 0, -30, -30, undefined, undefined, D); modelStore.addDistributedLoad3D(b, 0, 0, -10, -10, undefined, undefined, L); }
  modelStore.addCombination('1.2D + 1.6L', [{ caseId: D, factor: 1.2 }, { caseId: L, factor: 1.6 }]);
  modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
}

/** A 4 × 4 m slab of 4 × 4 quads, 15 cm, simply supported on its edges, 10 kPa of D. */
function slab() {
  const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
  const N = 4, id: number[][] = [];
  for (let i = 0; i <= N; i++) { id.push([]); for (let j = 0; j <= N; j++) id[i]!.push(modelStore.addNode(i, j, 3)); }
  const D = modelStore.model.loadCases.find((c) => c.type === 'D')!.id;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const q = modelStore.addQuad([id[i]![j]!, id[i + 1]![j]!, id[i + 1]![j + 1]!, id[i]![j + 1]!], conc, 0.15);
    modelStore.addSurfaceLoad3D(q, -10, D);
  }
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) if (i === 0 || j === 0 || i === N || j === N) modelStore.addSupport(id[i]![j]!, 'pinned3d');
  modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
}

describe('reinforcement sheets from a solved model', () => {
  it('cuts the continuous beam into its two spans at the middle column and envelopes each whole', () => {
    frame(); solve();
    const rows = buildSheetRows();
    expect(rows.basis).toBe('combinations');
    expect(rows.beam.map((r) => r.name)).toEqual(['V1-1', 'V1-2']);
    const [a, b] = rows.beam;
    expect(a!.demand.mNegEnd.value).toBeGreaterThan(a!.demand.mPos.value);
    expect(a!.demand.mNegEnd.value).toBeCloseTo(b!.demand.mNegStart.value, 6);
    expect(a!.demand.mPos.value).toBeCloseTo(b!.demand.mPos.value, 6);
    expect(a!.demand.mPos.source?.combo).toBe('1.2D + 1.6L');
    // 52 kN/m over 5 m: the sagging and the interior hogging bracket qL²/8 between a fixed and a pinned end.
    expect(a!.demand.mPos.value + a!.demand.mNegEnd.value / 2).toBeGreaterThan(52 * 25 / 8 * 0.8);
  });

  it('cuts a column per storey, with its clear height and the fixed foot\'s restraint', () => {
    frame(); solve();
    const rows = buildSheetRows();
    expect(rows.column).toHaveLength(3);
    const c = rows.column[0]!;
    expect(c.demand.lu).toBeCloseTo(3 - 0.6 / 2, 6);
    expect(c.demand.psiBot).toBeCloseTo(0.2, 6);
    expect(c.demand.cases.find((x) => x.combo === '1.2D + 1.6L')!.puD).toBeGreaterThan(0);
  });

  it('designs a simply supported slab with bottom steel at midspan and top steel at the corners for the twisting moment', () => {
    slab(); solve();
    const rows = buildSheetRows();
    expect(rows.slab).toHaveLength(1);
    const s = rows.slab[0]!;
    expect(s.demand.m.bottomX.value).toBeGreaterThan(6);
    expect(s.demand.m.bottomX.value).toBeCloseTo(s.demand.m.bottomY.value, 6);
    expect(s.demand.m.topX.value).toBeGreaterThan(0);
    expect(s.demand.m.bottomX.value).toBeLessThan(0.0479 * 14 * 16 * 1.15);
  });

  it('keeps the adopted bars in the project and reads them back after a reload', () => {
    frame(); solve();
    const first = buildSheetRows().beam[0]!;
    setAdopted(first.key, { ...first.proposed, bottom: [{ count: 2, dia: 12 }] });
    const snap = JSON.parse(JSON.stringify(modelStore.snapshot()));
    modelStore.clear();
    modelStore.restore(snap);
    expect((rcSheetsData().adopted[first.key] as { bottom: unknown }).bottom).toEqual([{ count: 2, dia: 12 }]);
    solve();
    const again = buildSheetRows().beam.find((r) => r.key === first.key)!;
    expect(again.isAdopted).toBe(true);
    expect(again.status).toBe('fail');
    setAdopted(first.key, null);
    expect(buildSheetRows().beam.find((r) => r.key === first.key)!.isAdopted).toBe(false);
  });

  it('adopts every proposal at once and switches the torsion mode', () => {
    frame(); solve();
    const rows = buildSheetRows();
    adoptAll(rows.beam);
    expect(Object.keys(rcSheetsData().adopted)).toHaveLength(2);
    setTorsionMode('compatibility');
    expect(rcSheetsData().torsion).toBe('compatibility');
  });

  it('exports a sheet per family with a row per element', () => {
    frame(); solve();
    const sheets = rcSheetsWorkbook(buildSheetRows(), (k) => k);
    expect(sheets.map((s) => s.name)).toEqual(['rcSheets.family.beam', 'rcSheets.family.column', 'rcSheets.family.slab']);
    expect(sheets[0]!.rows).toHaveLength(3);
    expect(sheets[1]!.rows).toHaveLength(4);
  });

  it('says there is nothing to design before a solve', () => {
    frame(); recognizePhysicalElements();
    expect(buildSheetRows().basis).toBe('none');
  });
});
