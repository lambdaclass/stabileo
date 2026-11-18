/**
 * The Stabileo criteria in the project's design data: kept on save and load, dropped at their
 * defaults, counted as a change of the design data that leaves the rows out of date and proposes
 * again what was adopted from a proposal, read by the alternatives offered; and the rows of a
 * solved frame citing them, never the course they come from.
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
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { adoptAll, buildSheetRows, proposalBasis, resetCriteria, setCriterion, setSheetCode, sheetCriteria } from '../rc-sheets.svelte';
import { designSheets, sheetsStale } from '../rc-sheets-view.svelte';
import { beamSections } from '../rc-sheets-resize';
import { designData, setDesignData, storedDesignData } from '../design-data';
import { migrateDesignData, migrateStoredDesignData } from '../../model/design-data';
import { CRITERION, criteriaOf, localizeCriterion } from '../../rc-sheets/criteria';
import { t } from '../../i18n';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); resultsStore.clear();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.analysisMode = 'pro'; uiStore.includeSelfWeight = false;
  setDesignData(null);
});
afterEach(() => { uiStore.analysisMode = '3d'; });

/** A two-span 30×90 beam on three 40×40 columns, 3 m high, fixed at their feet, under a heavy load. */
function frame() {
  const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
  const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.1406 * 0.4 ** 4, b: 0.4, h: 0.4, shape: 'rect' } as never);
  const bm = modelStore.addSection({ name: '30×90', a: 0.27, iy: 0.3 * 0.9 ** 3 / 12, iz: 0.9 * 0.3 ** 3 / 12, j: 0.006, b: 0.3, h: 0.9, shape: 'rect' } as never);
  const base = [0, 6, 12].map((x) => modelStore.addNode(x, 0, 0)), top = [0, 6, 12].map((x) => modelStore.addNode(x, 0, 3));
  const D = modelStore.model.loadCases.find((c) => c.type === 'D')!.id, L = modelStore.model.loadCases.find((c) => c.type === 'L')!.id;
  base.forEach((b, i) => { const c = modelStore.addElement(b, top[i]!, 'frame'); modelStore.updateElementSection(c, col); modelStore.updateElementMaterial(c, conc); modelStore.addSupport(b, 'fixed3d'); });
  for (let i = 0; i < 2; i++) {
    const e = modelStore.addElement(top[i]!, top[i + 1]!, 'frame');
    modelStore.updateElementSection(e, bm); modelStore.updateElementMaterial(e, conc);
    modelStore.addDistributedLoad3D(e, 0, 0, -60, -60, undefined, undefined, D);
    modelStore.addDistributedLoad3D(e, 0, 0, -30, -30, undefined, undefined, L);
  }
  modelStore.addNodalLoad3D(top[0]!, 60, 0, 0, 0, 0, 0, L);
  modelStore.addCombination('1.2D + 1.6L', [{ caseId: D, factor: 1.2 }, { caseId: L, factor: 1.6 }]);
  syncDefinedLoadsForAnalysis(); recognizePhysicalElements();
  resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
  publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
  setSheetCode('cirsoc201-2025');
}

describe('the criteria in the design data', () => {
  it('are kept through a save and a load, and dropped at their defaults', () => {
    setCriterion('beamStirrupSpacing', 20);
    setCriterion('footingTieMaxLoad', 900);
    setCriterion('slabJoinThickness', 2);
    expect(storedDesignData().designOptions?.criteria).toEqual({ beamStirrupSpacing: 20, footingTieMaxLoad: 900 });
    const loaded = migrateStoredDesignData(JSON.parse(JSON.stringify(storedDesignData())));
    expect(loaded?.designOptions?.criteria).toEqual({ beamStirrupSpacing: 20, footingTieMaxLoad: 900 });
    setDesignData(null);
    setDesignData(loaded!);
    expect(sheetCriteria()).toEqual(criteriaOf({ beamStirrupSpacing: 20, footingTieMaxLoad: 900 }));
    expect(migrateDesignData({ version: 1, designOptions: { criteria: { beamStirrupSpacing: 20 } } }).designOptions?.criteria).toEqual({ beamStirrupSpacing: 20 });
    setCriterion('beamStirrupSpacing', 30);
    expect(designData().designOptions?.criteria).toEqual({ footingTieMaxLoad: 900 });
    setCriterion('footingTieMaxLoad', null);
    expect(designData().designOptions?.criteria).toBeUndefined();
    setCriterion('columnBarPitch', 25);
    resetCriteria();
    expect(designData().designOptions?.criteria).toBeUndefined();
  });

  it('leave the proposals\' basis as it was at their defaults, and change it when one is stated', () => {
    const before = proposalBasis();
    setCriterion('columnSwayKMin', 1.2);
    expect(proposalBasis()).toBe(before);
    setCriterion('columnSwayKMin', 1.3);
    expect(proposalBasis()).not.toBe(before);
  });

  it('set the beam sections an alternative is tried at', () => {
    expect(beamSections(0.2, 0.4, 0.45)).toEqual([[0.2, 0.45]]);
    setCriterion('beamWidthFrom', 4); setCriterion('beamWidthTo', 2); setCriterion('beamSectionStep', 10);
    expect(beamSections(0.1, 0.4, 0.6)).toEqual([[0.2, 0.4], [0.2, 0.5], [0.2, 0.6], [0.3, 0.6]]);
  });

  it('change the rows, leave them out of date and propose again what was adopted from a proposal', async () => {
    frame();
    await designSheets();
    expect(sheetsStale()).toBe(false);
    const base = buildSheetRows();
    adoptAll([...base.beam, ...base.line, ...base.column]);
    expect(buildSheetRows().line.every((l) => l.isAdopted)).toBe(true);
    expect(base.line.flatMap((l) => l.zones).some((z) => z.stirrups.spacing > 0.2 + 1e-9)).toBe(true);
    setCriterion('beamStirrupSpacing', 20);
    expect(sheetsStale()).toBe(true);
    const after = buildSheetRows();
    expect(after.line.every((l) => !l.isAdopted)).toBe(true);
    expect(after.column.every((r) => !r.isAdopted)).toBe(true);
    const spacing = after.beam.flatMap((r) => r.verifications.filter((v) => v.label === 'rcSheets.v.stirrupSpacing'));
    expect(spacing.length).toBeGreaterThan(0);
    expect(spacing.some((v) => v.capacity === '≤ 20,0 cm' && v.clause?.includes(CRITERION))).toBe(true);
    expect(spacing.every((v) => v.capacity === '≤ 20,0 cm' || !v.clause?.includes(CRITERION))).toBe(true);
    await designSheets();
    expect(sheetsStale()).toBe(false);
  });

  it('are cited in the rows of a solved frame by the token alone, which reads as the criterion\'s name', () => {
    frame();
    const rows = buildSheetRows();
    const text = JSON.stringify(rows);
    expect(text).not.toMatch(/FIUBA/);
    expect(text).toContain(CRITERION);
    const clauses = [...rows.beam, ...rows.column, ...rows.line].flatMap((r) => r.verifications.map((v) => v.clause ?? ''));
    const cited = clauses.filter((c) => c.includes(CRITERION));
    expect(cited.length).toBeGreaterThan(0);
    expect(cited.map((c) => localizeCriterion(c, t)).every((c) => !c.includes(CRITERION) && c.includes(t('rcSheets.criterion')))).toBe(true);
  });
});
