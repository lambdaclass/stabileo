/**
 * Footings where the model states no soil: presized and reinforced on the design data's presumed
 * allowable pressure, said so on every row, and on the model's soil once it states one.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore, resultsStore } from '..';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows } from '../rc-sheets.svelte';
import { designData, patchDesignData } from '../design-data';
import { PRO_EXAMPLES } from '../../data/pro-examples';
import { PRESUMED_BEARING_RANGE, migrateDesignData } from '../../model/design-data';

beforeAll(async () => { await wasmSolver.initSolver(); });
afterEach(() => { uiStore.analysisMode = '3d'; });

async function openSolved() {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
  await PRO_EXAMPLES.find((e) => e.id === 'rc-qa-diagnostic')!.load();
  syncDefinedLoadsForAnalysis(); recognizePhysicalElements();
  resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
  publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
}

const presumedLine = (r: { verifications: Array<{ label: string }> }) => r.verifications.find((v) => v.label === 'rcSheets.v.footPresumedSoil');

describe('footings on a model with no soil', () => {
  it('are proposed on the presumed pressure, which every row names, and grow smaller on a stronger one', async () => {
    await openSolved();
    expect(modelStore.model.geotechnical?.profiles?.length ?? 0).toBe(0);
    expect(designData().presumedBearingKPa).toBe(PRESUMED_BEARING_RANGE.default);
    const rows = buildSheetRows().footing;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.demand.soil, r.name).toMatchObject({ allowable: 150, presumed: true });
      expect(r.verifications.some((v) => v.label === 'rcSheets.v.footNoSoil'), r.name).toBe(false);
      expect(r.status, r.name).not.toBe('none');
      expect(r.status, r.name).not.toBe('fail');
      expect(r.B * r.L, r.name).toBeGreaterThan(0);
      expect(r.adopted.x.dia, r.name).toBeGreaterThan(0);
      expect(r.bearing!.qMax, r.name).toBeLessThanOrEqual(150 * (r.bearing!.edgeFactor ?? 1) + 1e-6);
      expect(presumedLine(r)?.demand, r.name).toBe('qadm = 150 kPa');
    }
    const area = (xs: typeof rows) => xs.reduce((s, r) => s + r.B * r.L, 0);
    patchDesignData({ presumedBearingKPa: 300 });
    const stronger = buildSheetRows().footing;
    expect(stronger.every((r) => r.demand.soil?.allowable === 300)).toBe(true);
    expect(area(stronger)).toBeLessThan(area(rows));
  }, 120_000);

  it('read the model soil once it states one, and say nothing of a presumption', async () => {
    await openSolved();
    const soil = modelStore.addSoilProfile('Suelo');
    modelStore.updateSoilProfile(soil, { bearing: { kind: 'allowablePressure', allowableBearingKPa: 220 } });
    const rows = buildSheetRows().footing;
    for (const r of rows) {
      expect(r.demand.soil, r.name).toMatchObject({ allowable: 220 });
      expect(r.demand.soil?.presumed, r.name).toBeUndefined();
      expect(presumedLine(r), r.name).toBeUndefined();
    }
  }, 120_000);
});

describe('the presumed pressure in the design data', () => {
  it('keeps a stated value within its range and falls back to the default otherwise', () => {
    expect(migrateDesignData({ presumedBearingKPa: 250 }).presumedBearingKPa).toBe(250);
    for (const bad of [0, 20, 5000, -1, Number.NaN, '200', null]) expect(migrateDesignData({ presumedBearingKPa: bad }).presumedBearingKPa).toBe(PRESUMED_BEARING_RANGE.default);
  });
});
