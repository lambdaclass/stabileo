import { defaultDesignData } from '../../model/design-data';
import { withCirsocCovers } from '../../rc-sheets/cover-data';
/**
 * The CIRSOC 201 flexure post's beam: 20×40, H-25, 5 m simply supported, D = 12 kN/m plus self-weight
 * and L = 8 kN/m. A 90° hook on its Ø25 bottom bars does not fit 40 cm, and a simple support
 * does not need one: the bars stop straight where §9.7.3.8.3(a) holds, 15 cm into the support.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore, resultsStore } from '..';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows } from '../rc-sheets.svelte';

beforeAll(async () => { await wasmSolver.initSolver(); });

describe('a simply supported 20×40 beam of 5 m', () => {
  it('designs itself with no failing check, its bottom bars straight into the supports', async () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
    await modelStore.loadExample('rc-beam-flexure');
    modelStore.setDesignData(withCirsocCovers(defaultDesignData()));
    modelStore.updateSupport(2, { type: 'custom3d', dofRestraints: { tx: false, ty: true, tz: true, rx: true, ry: false, rz: false } });
    recognizePhysicalElements(); syncDefinedLoadsForAnalysis(); recognizePhysicalElements();
    resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
    publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
    const rows = buildSheetRows();
    expect(rows.line).toHaveLength(1);
    const line = rows.line[0]!;
    expect(line.verifications.filter((v) => !v.ok)).toEqual([]);
    expect(line.status).not.toBe('fail');
    for (const r of rows.beam) expect(r.verifications.filter((v) => !v.ok)).toEqual([]);
    const bottom = line.bars.find((b) => b.face === 'bottom' && b.kind === 'continuous')!;
    expect(bottom.bars).toEqual({ count: 2, dia: 25 });
    expect(bottom.hooks).toEqual([false, false]);
    expect(bottom.from).toBeCloseTo(-0.15, 9);
    expect(bottom.to).toBeCloseTo(line.length + 0.15, 9);
    const straight = line.steps.flatMap((g) => g.steps).filter((s) => s.label === 'rcSheets.s.lineStraightEnd');
    expect(straight).toHaveLength(2);
    expect(line.verifications.some((v) => v.label === 'rcSheets.v.lineHookFit')).toBe(false);
  }, 300000);
});
