/**
 * A seismic frame whose project allows only Ø6 stirrups, never closer than 7,5 cm: chapter 18 cannot
 * be met with them, so the sheets offer to allow the next diameter, the one the members verify
 * with; applied, it is the design data that changes, and designed again the frame verifies. And
 * chapter 18 read against the loads: recommended where a seismic case carries loads and it is off,
 * questioned where it is on with none.
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
import { buildSheetRows, seismicAdvice, setRcOption, setSheetCode } from '../rc-sheets.svelte';
import { alternatives, lineAlternatives, widerTieLists } from '../rc-sheets-resize';
import { applyAlternative, canApply } from '../rc-sheets-apply';
import { designData, patchDesignData } from '../design-data';
import { lineRowStatus } from '../../rc-sheets/beam-line';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); resultsStore.clear();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.analysisMode = 'pro'; uiStore.includeSelfWeight = false;
});
afterEach(() => { uiStore.analysisMode = '3d'; });

/** A two-span 30×60 beam on three 40×40 columns, 3 m high, fixed at their feet, under 45 kN/m dead and 15 kN/m live, 1,2 D + 1,6 L. */
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
  for (const b of beams) { modelStore.addDistributedLoad3D(b, 0, 0, -45, -45, undefined, undefined, D); modelStore.addDistributedLoad3D(b, 0, 0, -15, -15, undefined, undefined, L); }
  modelStore.addCombination('1.2D + 1.6L', [{ caseId: D, factor: 1.2 }, { caseId: L, factor: 1.6 }]);
  recognizePhysicalElements();
  resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
  publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
}

describe('stirrups the project does not allow', () => {
  it('are offered where chapter 18 cannot be met with the allowed ones, and applied they change the design data the frame then verifies with', () => {
    solvedFrame();
    setSheetCode('cirsoc201-2025');
    setRcOption('seismic', true);
    patchDesignData({ stirrupDiametersMm: [6] });
    expect(widerTieLists()[0]).toEqual({ dia: 8, list: [6, 8] });
    expect(widerTieLists().every((k) => k.dia > 6 && k.dia <= 16 && k.list.join() === `6,${k.dia}`)).toBe(true);

    const rows = buildSheetRows();
    const column = rows.column.find((r) => r.status === 'fail')!;
    expect(column.verifications.filter((v) => !v.ok).map((v) => v.label)).toContain('rcSheets.v.seisColAsh');
    const [first] = alternatives(column);
    expect(first).toEqual({ kind: 'ties', from: [6], to: 8 });
    expect(canApply(column, first!)).toBe(true);

    const line = rows.line[0]!;
    const spans = rows.beam.filter((r) => r.demand.line?.group === line.group);
    expect(lineRowStatus(line, spans)).toBe('fail');
    expect(lineAlternatives(line, spans)[0]).toEqual({ kind: 'ties', from: [6], to: 8 });

    expect(applyAlternative(column, first!)).toEqual({ name: 'Ø8', created: false, members: 0, plates: 0 });
    expect(designData().stirrupDiametersMm).toEqual([6, 8]);
    const again = buildSheetRows();
    expect(again.column.filter((r) => r.status === 'fail').map((r) => r.name)).toEqual([]);
    const lineAgain = again.line[0]!;
    expect(lineRowStatus(lineAgain, again.beam.filter((r) => r.demand.line?.group === lineAgain.group))).not.toBe('fail');
  });
});

describe('chapter 18 against the loads', () => {
  it('is recommended with seismic loads and off, questioned on without them (the empty earthquake case of a new model is none), and silent when both agree or the code has no such chapter', () => {
    setSheetCode('cirsoc201-2025');
    expect(seismicAdvice()).toBeNull();
    setRcOption('seismic', true);
    expect(seismicAdvice()).toBe('withoutLoads');
    const quake = modelStore.model.loadCases.find((c) => c.type === 'E')!.id;
    expect(seismicAdvice()).toBe('withoutLoads');
    modelStore.addNodalLoad3D(modelStore.addNode(0, 0, 3), 50, 0, 0, 0, 0, 0, quake);
    expect(seismicAdvice()).toBeNull();
    setRcOption('seismic', false);
    expect(seismicAdvice()).toBe('recommend');
    setSheetCode('en1992-1-1');
    expect(seismicAdvice()).toBeNull();
  });
});
