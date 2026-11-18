/**
 * Footings at the property lines and footings that share a base, on a solved frame of 3 × 2
 * columns (x 0, 6, 12 m; y 0, 4 m): two sides declared property lines in the design data make an
 * edge footing of each column on one, a corner footing where they meet, each with its strap beams
 * to the footing inward; a strap the model has keeps its member, designed once with the statics
 * added. Two columns moved within a metre of each other share a combined footing.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { modelStore, resultsStore } from '..';
import { buildSheetRows, setSheetCode } from '../rc-sheets.svelte';
import { designData, patchDesignData } from '../design-data';
import { setFootingSetup, writeFootingToModel } from '../rc-sheets-footings';
import { scheduleElements } from '../../rc-sheets/schedule/pieces';
import { lineRowStatus } from '../../rc-sheets/beam-line';
import { placeFoundationBeams } from '../../model/foundation/generate';
import { footingOverlaps } from '../../rc-sheets/footing-overlaps';
import { CODES, failingUnder, solveExample } from './rc-proposals-verify';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';

beforeAll(async () => { await wasmSolver.initSolver(); });

const byName = (rows: ReturnType<typeof buildSheetRows>['footing'], n: string) => rows.find((r) => r.name === n)!;

function resolve() {
  syncDefinedLoadsForAnalysis(); recognizePhysicalElements();
  resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
  publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
}

describe('two property lines declared in the design data', () => {
  it('make edge and corner footings with their strap beams, and every row verifies or says what to do', async () => {
    await solveExample('rc-qa-diagnostic');
    setSheetCode('cirsoc201-2025');
    const plain = buildSheetRows().footing;
    expect(plain.every((r) => !r.edge)).toBe(true);
    patchDesignData({ propertyLines: { minX: true, maxY: true } });
    expect(designData().propertyLines).toEqual({ minX: true, maxY: true });
    const rows = buildSheetRows();
    const f = rows.footing;
    expect(Object.fromEntries(f.map((r) => [r.name, r.edge?.position ?? 'centred']))).toEqual({ C1: 'edge', C2: 'centred', C3: 'centred', C4: 'corner', C5: 'edge', C6: 'edge' });
    expect(byName(f, 'C2').B).toBeCloseTo(byName(plain, 'C2').B, 9);

    const c1 = byName(f, 'C1');
    expect(c1.L).toBeGreaterThan(1.5 * c1.B);
    expect(c1.ex - c1.B / 2).toBeCloseTo(-c1.demand.column!.b / 2, 9);
    const s1 = c1.edge!.straps[0]!;
    expect([s1.axis, s1.partner, s1.L]).toEqual(['x', 'C2', 6]);
    expect(s1.R1).toBeGreaterThanOrEqual(s1.P1 * 6 / (6 - s1.e) - 1e-6);
    expect(s1.factor).toBeCloseTo(s1.R1 / s1.P1, 9);
    expect(c1.x!.carried).toBe(true);
    expect(c1.x!.lineEnd).toBe(-1);

    const c5 = byName(f, 'C5');
    expect(c5.B).toBeGreaterThan(1.5 * c5.L);
    expect(c5.ey + c5.L / 2).toBeCloseTo(c5.demand.column!.h / 2, 9);
    expect(c5.edge!.straps.map((s) => [s.axis, s.partner])).toEqual([['y', 'C2']]);

    const c4 = byName(f, 'C4');
    expect(c4.B).toBeCloseTo(c4.L, 9);
    expect(c4.edge!.straps.map((s) => s.partner).sort()).toEqual(['C1', 'C5']);

    for (const r of f) for (const s of r.edge?.straps ?? []) {
      expect(s.line, `${r.name} → ${s.partner}`).toBeDefined();
      expect(lineRowStatus(s.line!, [s.beam!]), `${r.name} → ${s.partner}`).not.toBe('fail');
      expect(s.beam!.demand.negAny.value, `${r.name} → ${s.partner}`).toBeGreaterThanOrEqual(s.M - 1e-6);
      expect(s.h, `${r.name} → ${s.partner}`).toBeGreaterThanOrEqual(Math.max(s.L / 8, r.h + 0.1) - 1e-6);
    }
    const sched = scheduleElements({ line: rows.line, column: rows.column, slab: rows.slab, wall: rows.wall, footing: rows.footing }, { code: 'cirsoc201-2025', slabCover: 0.025 });
    const c1Pieces = sched.find((e) => e.key === c1.key)!.pieces;
    expect(c1Pieces.some((p) => p.kind === 'footingX')).toBe(true);
    expect(c1Pieces.some((p) => p.kind === 'stirrup')).toBe(true);

    for (const code of CODES) expect(failingUnder(code), code).toEqual([]);
  }, 600_000);

  it('a row set by hand to a tie or eccentric balance is designed so, and back to the lines when cleared', async () => {
    await solveExample('rc-qa-diagnostic');
    setSheetCode('cirsoc201-2025');
    patchDesignData({ propertyLines: { minX: true } });
    const key = buildSheetRows().footing.find((r) => r.name === 'C1')!.key;
    setFootingSetup(key, { balance: 'tie' });
    const tied = buildSheetRows().footing.find((r) => r.key === key)!;
    expect(tied.edge!.balance).toBe('tie');
    expect(tied.edge!.ties[0]!.Tu).toBeGreaterThan(0);
    expect(tied.edge!.straps).toEqual([]);
    expect(tied.status).toBe('warn');
    setFootingSetup(key, { position: 'centred' });
    expect(buildSheetRows().footing.find((r) => r.key === key)!.edge).toBeUndefined();
    setFootingSetup(key, null);
    expect(buildSheetRows().footing.find((r) => r.key === key)!.edge!.balance).toBe('strap');
  }, 300_000);

  it('a strap beam the model has is that member, designed once with the statics on its analysis forces', async () => {
    await solveExample('rc-qa-diagnostic');
    setSheetCode('cirsoc201-2025');
    patchDesignData({ propertyLines: { minX: true } });
    const at = (x: number, y: number) => [...modelStore.nodes.values()].find((n) => Math.abs(n.x - x) < 1e-6 && Math.abs(n.y - y) < 1e-6 && Math.abs(n.z ?? 0) < 1e-6)!.id;
    const sec = modelStore.addSection({ name: 'VC 30×70', shape: 'rect', b: 0.3, h: 0.7, a: 0.21, iy: 0.3 * 0.7 ** 3 / 12, iz: 0.7 * 0.3 ** 3 / 12, j: 0.005 });
    const concrete = [...modelStore.elements.values()][0]!.materialId;
    placeFoundationBeams([{ a: at(0, 0), b: at(6, 0), kind: 'strap' }], { sectionId: sec, materialId: concrete });
    resolve();
    const rows = buildSheetRows();
    const c1 = rows.footing.find((r) => r.name === 'C1')!;
    const s = c1.edge!.straps[0]!;
    expect(s.group).toBeDefined();
    expect([s.b, s.h]).toEqual([0.3, 0.7]);
    const line = rows.line.find((l) => l.group === s.group)!;
    expect(line).toBe(s.line);
    const span = rows.beam.find((b) => b.demand.line?.group === s.group)!;
    expect(span.demand.negAny.value).toBeGreaterThanOrEqual(s.M - 1e-6);
    expect(rows.line.filter((l) => l.group === s.group)).toHaveLength(1);
    const sched = scheduleElements({ line: rows.line, column: [], slab: [], wall: [], footing: rows.footing }, { code: 'cirsoc201-2025', slabCover: 0.025 });
    expect(sched.find((e) => e.key === c1.key)!.pieces.some((p) => p.kind === 'stirrup')).toBe(false);
  }, 300_000);
});

describe('two columns a metre apart', () => {
  it('share a combined footing centred on their resultant, top bars where it hogs between them, and nothing overlaps', async () => {
    await solveExample('rc-qa-diagnostic');
    setSheetCode('cirsoc201-2025');
    for (const n of [...modelStore.nodes.values()]) if (Math.abs(n.x - 12) < 1e-6) modelStore.updateNode(n.id, 7, n.y, n.z);
    resolve();
    const rows = buildSheetRows();
    const f = rows.footing;
    const combined = f.filter((r) => r.combined);
    expect(combined.map((r) => r.name).sort()).toEqual(['C2 + C3', 'C5 + C6']);
    for (const r of combined) {
      const [n1, n2] = [r.demand.service!.N, r.demand.carried!.service!.N];
      expect(r.ex).toBeCloseTo(n2 * 1 / (n1 + n2), 1);
      expect(!!r.adopted.top).toBe(r.combined!.mTop > 1e-6);
      expect(r.adopted.with).toBe(r.demand.carried!.key);
      expect(r.status, r.name).not.toBe('fail');
    }
    expect(f.some((r) => r.name === 'C3' || r.name === 'C6')).toBe(false);
    expect(footingOverlaps(f).pairs).toEqual([]);
    const sched = scheduleElements({ line: [], column: [], slab: [], wall: [], footing: f }, { code: 'cirsoc201-2025', slabCover: 0.025 });
    for (const r of combined) expect(sched.find((e) => e.key === r.key)!.pieces.find((p) => p.kind === 'dowel')!.count).toBe(r.adopted.dowels!.count + r.adopted.dowels2!.count);
    for (const code of CODES) expect(failingUnder(code), code).toEqual([]);
    setSheetCode('cirsoc201-2025');
    const first = buildSheetRows().footing.find((r) => r.combined)!;
    const id = writeFootingToModel(first);
    expect(modelStore.model.footings.get(id)).toMatchObject({ kind: 'combined', supportedNodeIds: [first.demand.carried!.nodeId], B: first.B, L: first.L, eccentricityB: first.ex });
    const back = buildSheetRows().footing.find((r) => r.key === first.key)!;
    expect(back.demand.footing?.id).toBe(id);
    expect(back.demand.carried?.key).toBe(first.demand.carried!.key);
    expect(back.combined).toBeDefined();
  }, 600_000);
});
