/**
 * The seven-storey example's foundation, meshed and solved as the app does: with no property
 * line, with all four, with one and with two, by the selection rule and as footings only, no two
 * foundations overlap, every column stands on exactly one and all found at one level. The rule
 * puts the building on a mat (its footings would cover more than half its plan); a strip or mat
 * written to the model is read back as the same foundation.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore, resultsStore } from '..';
import { ensurePhysicalModel } from '../plates-from-shells';
import { preparePlatesForAnalysis } from '../physical-plates';
import { meshBeforeAnalysis } from '../mesh-policy.svelte';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows, setSheetCode } from '../rc-sheets.svelte';
import { designData, patchDesignData } from '../design-data';
import { setFootingSetup, setFoundationSystem, writeFootingToModel } from '../rc-sheets-footings';
import { footingOverlaps } from '../../rc-sheets/footing-overlaps';
import { PRO_EXAMPLES } from '../../data/pro-examples';
import type { PropertyLines } from '../../model/foundation/edges';
import type { FootingRow, FoundationSystem } from '../../rc-sheets/footing-types';

beforeAll(async () => {
  await wasmSolver.initSolver();
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
  await PRO_EXAMPLES.find((e) => e.id === 'pro-edificio-7p')!.load();
  ensurePhysicalModel();
  meshBeforeAnalysis.value = true;
  preparePlatesForAnalysis();
  syncDefinedLoadsForAnalysis(); recognizePhysicalElements();
  resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
  publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
  setSheetCode('cirsoc201-2025');
}, 600_000);

const ALL: PropertyLines = { minX: true, maxX: true, minY: true, maxY: true };
const members = (r: FootingRow) => r.demand.group?.members ?? (r.demand.carried ? [r.demand, r.demand.carried] : [r.demand]);
const failing = (r: FootingRow) => r.verifications.filter((v) => !v.ok).map((v) => `${v.label} ${v.clause ?? ''}`);

function foundation(lines: PropertyLines | undefined, system: FoundationSystem): FootingRow[] {
  patchDesignData({ propertyLines: lines });
  setFoundationSystem(system);
  return buildSheetRows().footing;
}

describe('the seven-storey foundation', () => {
  it('never overlaps, holds every column once and founds at one level, whatever the lines and the system', () => {
    const cases: Array<[string, PropertyLines | undefined]> = [['none', undefined], ['all four', ALL], ['−Y', { minY: true }], ['−X −Y', { minX: true, minY: true }]];
    for (const system of ['auto', 'footings'] as const) for (const [name, lines] of cases) {
      const rows = foundation(lines, system), tag = `${system} · ${name}`;
      expect(footingOverlaps(rows).pairs, tag).toEqual([]);
      const keys = rows.flatMap(members).map((d) => d.key);
      expect(new Set(keys).size, tag).toBe(keys.length);
      expect(keys.length, tag).toBe(12);
      const levels = new Set(rows.map((r) => Math.round(r.founding * 1000)));
      expect(levels.size, `${tag}: ${[...levels].join(', ')}`).toBe(1);
      for (const r of rows) expect(r.pedestal, `${tag} ${r.name}`).toBeCloseTo(r.demand.at.z - r.founding - r.h, 9);
      console.log(tag, rows.map((r) => `${r.name} [${r.group?.kind ?? (r.combined ? 'combined' : r.edge?.position ?? 'centred')}] ${r.B}×${r.L}×${r.h} ${r.status}${r.status === 'fail' ? ` ${failing(r).join('; ')}` : ''}`).join(' | '));
    }
    setFoundationSystem('auto');
  }, 600_000);

  it('with no line, stands the building on one mat, which verifies', () => {
    const rows = foundation(undefined, 'auto');
    expect(rows).toHaveLength(1);
    const mat = rows[0]!;
    expect(mat.group?.kind).toBe('mat');
    expect(mat.group?.reason).toBe('cover');
    expect(mat.status, failing(mat).join('\n')).toBe('ok');
    expect(mat.group!.columns).toHaveLength(12);
    expect(mat.group!.strips.length).toBeGreaterThanOrEqual(6);
    expect(mat.founding).toBeCloseTo(-mat.h, 9);
  }, 600_000);

  it('with all four lines, holds the mat at the lines; only the punching of the corner columns at two lines is left to the engineer', () => {
    const rows = foundation(ALL, 'auto');
    expect(rows).toHaveLength(1);
    const mat = rows[0]!;
    expect(mat.group?.kind).toBe('mat');
    expect(mat.group!.anchor).toEqual([-1, -1]);
    const xs = mat.group!.columns.map((c) => [c.x - c.b / 2, c.x + c.b / 2]).flat(), ys = mat.group!.columns.map((c) => [c.y - c.h / 2, c.y + c.h / 2]).flat();
    expect(Math.min(...xs)).toBeCloseTo(-mat.B / 2, 6);
    expect(Math.max(...xs)).toBeCloseTo(mat.B / 2, 6);
    expect(Math.min(...ys)).toBeCloseTo(-mat.L / 2, 6);
    expect(Math.max(...ys)).toBeCloseTo(mat.L / 2, 6);
    const bad = mat.verifications.filter((v) => !v.ok);
    for (const v of bad) expect(v.label, failing(mat).join('\n')).toBe('rcSheets.v.footPunching');
    for (const v of bad) expect(mat.group!.columns.find((c) => v.clause?.endsWith(c.name))?.punching?.position).toBe('corner');
  }, 600_000);

  it('a row set to the mat in footings only puts those columns on one mat, and the solution is kept with the design data', () => {
    patchDesignData({ propertyLines: undefined });
    setFoundationSystem('footings');
    const before = buildSheetRows().footing;
    const c6 = before.find((r) => members(r).some((m) => m.name === 'C6'))!;
    const c7 = before.find((r) => members(r).some((m) => m.name === 'C7'))!;
    for (const r of [c6, c7]) for (const m of members(r)) setFootingSetup(m.key, { solution: 'mat' });
    const rows = buildSheetRows().footing;
    const mat = rows.find((r) => r.group?.kind === 'mat')!;
    expect(mat.group!.columns.map((c) => c.name)).toEqual(expect.arrayContaining(['C6', 'C7']));
    expect(footingOverlaps(rows).pairs).toEqual([]);
    expect(designData().rcSheets?.footingSetup?.['footing:n6']?.solution).toBe('mat');
    for (const r of [c6, c7]) for (const m of members(r)) setFootingSetup(m.key, null);
    setFoundationSystem('auto');
  }, 600_000);

  it('a mat written to the model is one footing under every column, read back as the same mat at the same level', () => {
    const rows = foundation(undefined, 'auto');
    const mat = rows[0]!;
    writeFootingToModel(mat);
    const written = [...modelStore.model.footings.values()];
    expect(written).toHaveLength(1);
    expect(written[0]!.kind).toBe('mat');
    expect(written[0]!.foundingElevation).toBeCloseTo(mat.founding, 9);
    const nodes = new Set([written[0]!.nodeId, ...(written[0]!.supportedNodeIds ?? [])]);
    for (const m of mat.demand.group!.members) for (const n of m.pier?.nodes ?? [m.nodeId]) expect(nodes.has(n), m.name).toBe(true);
    const again = buildSheetRows().footing;
    expect(again).toHaveLength(1);
    expect(again[0]!.group?.reason).toBe('model');
    expect(again[0]!.B).toBeCloseTo(mat.B, 9);
    expect(again[0]!.L).toBeCloseTo(mat.L, 9);
    expect(again[0]!.ex).toBeCloseTo(mat.ex, 9);
    expect(again[0]!.ey).toBeCloseTo(mat.ey, 9);
    expect(again[0]!.founding).toBeCloseTo(mat.founding, 9);
    for (const f of written) modelStore.removeFooting(f.id);
  }, 600_000);
});
