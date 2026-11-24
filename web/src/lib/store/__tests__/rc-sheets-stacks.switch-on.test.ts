/**
 * The seven-storey example's stacks: each storey's walls, which recognition makes walls of their
 * own, lap their verticals into the storey above; and the columns, whose faces step in from 40 to
 * 35 cm, take the bars from below cranked 1:6.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore, resultsStore } from '..';
import { ensurePhysicalModel } from '../plates-from-shells';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows } from '../rc-sheets.svelte';
import { galleryExample } from '../../data/__tests__/gallery-examples';
import { scheduleElements } from '../../rc-sheets/schedule/pieces';
import { developedLength } from '../../rc-sheets/shape';

beforeAll(async () => { await wasmSolver.initSolver(); });

describe('the seven-storey example\'s stacks', () => {
  it('laps each storey\'s wall verticals into the wall above, and cranks the column bars where the faces step in', async () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
    await galleryExample('pro-edificio-7p').load();
    ensurePhysicalModel();
    syncDefinedLoadsForAnalysis(); recognizePhysicalElements();
    resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
    publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
    const rows = buildSheetRows();
    const stacked = rows.wall.filter((w) => w.stack?.above);
    expect(stacked.length).toBeGreaterThan(0);
    const els = scheduleElements({ line: [], column: [], slab: [], wall: rows.wall }, { code: 'cirsoc201-2025', slabCover: 0.02, endZones: false });
    for (const w of stacked) {
      const up = rows.wall.find((x) => x.key === w.stack!.above)!;
      expect(up.stack?.below).toBe(w.key);
      expect(up.demand.z).toBeCloseTo(w.demand.z! + w.height, 6);
      const lap = w.vLaps!.find((x) => x.dia === w.adopted.vertical.diameter)!.lap;
      const v = els.find((e) => e.key === w.key)!.pieces.filter((p) => p.kind === 'vertical');
      expect(Math.max(...v.map((p) => developedLength(p.shape)))).toBeGreaterThanOrEqual(Math.min(12, w.height + lap) - 1e-6);
    }
    const stepped = rows.column.filter((c) => c.step);
    expect(stepped.length).toBeGreaterThan(0);
    for (const c of stepped) {
      expect(c.step).toEqual({ offset: expect.closeTo(0.025, 6), dowels: false });
      expect(c.verifications.some((v) => v.label === 'rcSheets.v.colCrank')).toBe(true);
    }
  }, 600_000);
});
