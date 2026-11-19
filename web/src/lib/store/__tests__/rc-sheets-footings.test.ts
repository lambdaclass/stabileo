/**
 * The footing family on solved projects: the committed footing project (one modelled footing on
 * a stated soil, three column bases without one) and the seven-storey example on a soil given
 * here; the sizing modes, a footing written back to the model, and what makes the rows stale.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore, resultsStore } from '..';
import { deserializeProject } from '../file';
import { ensurePhysicalModel } from '../plates-from-shells';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows, rcSheetsData, setSheetCode } from '../rc-sheets.svelte';
import { foundationStamp, setFootingSizing, setFoundationSystem, writeFootingToModel } from '../rc-sheets-footings';
import { PRO_EXAMPLES } from '../../data/pro-examples';
import type { FootingRow } from '../../rc-sheets/footing-types';
import { barsInTension, columnBars } from '../../rc-sheets/column-row';

beforeAll(async () => { await wasmSolver.initSolver(); });

function solve() {
  syncDefinedLoadsForAnalysis(); recognizePhysicalElements();
  resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
  publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
}

const summary = (r: FootingRow) => `${r.name} N=${r.demand.service?.N.toFixed(1)} ${r.B}×${r.L}×${r.h} q=${r.bearing?.qMax.toFixed(0)}/${r.bearing?.allowable} X ${r.adopted.x.dia}/${r.adopted.x.spacing} Y ${r.adopted.y.dia}/${r.adopted.y.spacing} dw ${r.adopted.dowels?.count}Ø${r.adopted.dowels?.dia} u=${r.utilization.toFixed(2)} ${r.status}`;

function openPoc() {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
  expect(deserializeProject(readFileSync(new URL('../../export/__fixtures__/rc-footing-cad-poc.ded.json', import.meta.url), 'utf8'))).toBe(true);
  solve();
}

/** Each footing's dowels lap in tension where its column's bars do, as the column's own splice reads them, and only there; how many columns the axial force alone (0.1·f'c·Ag) would have read the other way. */
function dowelsFollow(rows: ReturnType<typeof buildSheetRows>): number {
  let misread = 0;
  for (const f of rows.footing) {
    const col = rows.column.find((c) => c.key === f.demand.column?.rowKey);
    if (!col || !f.dowels) continue;
    const ctx = { mat: { fc: 25, fy: 420 }, cover: col.cover, tieDia: col.adopted.tieDia, diameters: [] };
    const tension = barsInTension(col.demand, columnBars(col.demand, col.adopted, ctx), col.demand.cases.flatMap((k) => [{ pu: k.puMin ?? k.pu, mx: k.mxTop, my: k.myTop }, { pu: k.pu, mx: k.mxBot, my: k.myBot }]));
    if (tension === col.req.compressionDominated) misread++;
    expect(col.req.barsTension, col.name).toBe(tension);
    expect(f.dowels.tension, f.name).toBe(tension);
  }
  return misread;
}

describe('the committed footing project', () => {
  it('designs Z1 as modelled and a footing under every other column base, on the project soil', () => {
    openPoc();
    const rows = buildSheetRows().footing;
    console.log(rows.map(summary).join('\n'));
    expect(rows).toHaveLength(4);
    const z1 = rows.find((r) => r.name === 'Z1')!;
    expect(z1.demand.footing).toMatchObject({ B: 2, L: 2, h: 0.5 });
    expect(z1.demand.soil).toMatchObject({ allowable: 250 });
    expect(z1.demand.service!.N).toBeGreaterThan(0);
    expect(Math.min(...z1.demand.combos.map((k) => k.N))).toBeGreaterThan(0);
    expect(z1.B).toBeGreaterThanOrEqual(2);
    expect(z1.h).toBeGreaterThanOrEqual(0.5);
    for (const r of rows) {
      expect(r.status, r.name).toBe('ok');
      expect(r.bearing!.qMax, r.name).toBeLessThanOrEqual(250 + 1e-6);
      expect(r.verifications.some((v) => v.label === 'rcSheets.v.footPunching'), r.name).toBe(true);
    }
  }, 120_000);

  it('keeps Z1 as modelled with only its bars under "reinforce", and reads Z1 from the model once written there', () => {
    openPoc();
    setFootingSizing('reinforce');
    expect(rcSheetsData().footingSizing).toBe('reinforce');
    const kept = buildSheetRows().footing.find((r) => r.name === 'Z1')!;
    expect([kept.B, kept.L, kept.h, kept.sizing.from]).toEqual([2, 2, 0.5, 'model']);
    setFootingSizing('minimum');
    expect(rcSheetsData().footingSizing).toBeUndefined();
    const other = buildSheetRows().footing.find((r) => !r.demand.footing)!;
    const before = foundationStamp();
    const id = writeFootingToModel(other);
    expect(foundationStamp()).not.toBe(before);
    const f = modelStore.model.footings.get(id)!;
    expect(f).toMatchObject({ nodeId: other.demand.nodeId, B: other.B, L: other.L, thickness: other.h });
    expect(f.foundingElevation).toBeCloseTo(other.demand.at.z - other.h, 9);
    const again = buildSheetRows().footing.find((r) => r.key === other.key)!;
    expect(again.demand.footing?.id).toBe(id);
    expect([again.B, again.L, again.h]).toEqual([other.B, other.L, other.h]);
  }, 120_000);

  it('under EN 1992-1-1 reads only the soil and says footings are not covered', () => {
    openPoc();
    setSheetCode('en1992-1-1');
    const rows = buildSheetRows().footing;
    expect(rows.every((r) => r.uncovered && r.status === 'none')).toBe(true);
    expect(rows[0]!.verifications.at(-1)!.label).toBe('rcSheets.v.footCodeOut');
    setSheetCode('cirsoc201-2025');
  }, 120_000);
});

describe('the seven-storey example', () => {
  it('designs a footing under each column base on a 200 kPa soil when asked for footings only, its dowels lapped in tension under the columns some combination pulls and only those', async () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
    await PRO_EXAMPLES.find((e) => e.id === 'pro-edificio-7p')!.load();
    ensurePhysicalModel();
    setFoundationSystem('footings');
    const soil = modelStore.addSoilProfile('Suelo');
    modelStore.updateSoilProfile(soil, { bearing: { kind: 'allowablePressure', allowableBearingKPa: 200 } });
    solve();
    const all = buildSheetRows(), rows = all.footing;
    console.log(rows.map(summary).join('\n'));
    expect(rows.length).toBeGreaterThan(0);
    dowelsFollow(all);
    const core = rows.find((r) => r.demand.pier)!;
    expect(core.name).toBe('M1 + M2 + M3 + C1');
    expect(core.dowels!.count).toBeGreaterThan(8);
    expect(rows.some((r) => r.name === 'C1')).toBe(false);
    for (const r of rows) {
      expect(r.demand.column, r.name).not.toBeNull();
      expect(r.bearing!.qMax, r.name).toBeLessThanOrEqual(200 + 1e-6);
      expect(r.sizing.reached, r.name).toBe(true);
    }
  }, 600_000);
});
