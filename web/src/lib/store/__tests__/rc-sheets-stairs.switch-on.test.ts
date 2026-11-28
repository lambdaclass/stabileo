import { PHYSICAL_GROUP_KIND } from '../../model/physical/types';
import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore, resultsStore } from '..';
import { ensurePhysicalModel } from '../plates-from-shells';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows } from '../rc-sheets.svelte';
import { saveStair } from '../stairs-pt';
import { buildFlightInto } from '../../model/stair-convert';

beforeAll(async () => { await wasmSolver.initSolver(); });

const solve = () => {
  ensurePhysicalModel(); syncDefinedLoadsForAnalysis(); recognizePhysicalElements();
  resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
  publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
};

describe('the stairs of the sheets', () => {
  it('are none where the project has none, and each flight of the model and each stair of the desk otherwise, never a slab declared one', async () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
    await modelStore.loadExample('rc-beam-flexure');
    solve();
    expect(buildSheetRows().stair).toEqual([]);

    const mat = [...modelStore.materials.values()].find((m) => m.name === 'H-25')!.id;
    const quads = buildFlightInto([{ x: 10, y: 0, z: 0 }, { x: 12.52, y: 0, z: 1.75 }, { x: 12.52, y: 1.2, z: 1.75 }, { x: 10, y: 1.2, z: 0 }], { divisions: 4, materialId: mat, waist: 0.18, stepLoad: 0, deadCase: modelStore.model.loadCases[0]!.id });
    for (const n of new Set(quads.flatMap((q) => modelStore.quads.get(q)!.nodes))) {
      const p = modelStore.nodes.get(n)!;
      if (Math.abs(p.x - 10) < 1e-6 || Math.abs(p.x - 12.52) < 1e-6) modelStore.addSupport(n, 'pinned3d' as never);
    }
    saveStair({ id: 'd1', name: 'Desk', riser: 0.175, tread: 0.28, steps: 10, waist: 0.18, width: 1.2, landingBottom: 0.6, landingTop: 0.6, ends: 'monolithic', finishes: 1, live: 5 });
    solve();
    const rows = buildSheetRows();
    expect(rows.stair.map((r) => r.demand.source).sort()).toEqual(['desk', 'model']);
    const flight = rows.stair.find((r) => r.demand.source === 'model')!;
    expect(flight.demand.quads.sort((a, b) => a - b)).toEqual([...quads].sort((a, b) => a - b));
    expect(flight.demand.spec.width).toBeCloseTo(1.2, 9);
    expect(flight.demand.place!.dir.x).toBeCloseTo(1, 9);
    expect(flight.bars.length).toBeGreaterThan(2);
    const desk = rows.stair.find((r) => r.demand.source === 'desk')!;
    expect(desk.name).toBe('Desk');
    expect(desk.status, desk.verifications.filter((v) => !v.ok).map((v) => v.label).join(', ')).toBe('ok');

    const plate = [...modelStore.model.groups.values()].find((g) => g.kind === PHYSICAL_GROUP_KIND && (g.members.quads ?? []).includes(quads[0]!))!;
    expect((plate.data as { provenance?: string }).provenance).toBe('inferred');
    modelStore.model.groups = new Map([...modelStore.model.groups].map(([id, g]) => [id, id === plate.id ? { ...g, data: { ...g.data, kind: 'slab', provenance: 'declared' } } : g]));
    expect(buildSheetRows().stair.map((r) => r.demand.source), 'a slab declared one, as a sloped roof is, is no flight').toEqual(['desk']);
  }, 300000);
});
