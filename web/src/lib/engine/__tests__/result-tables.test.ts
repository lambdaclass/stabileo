/**
 * The across-combination tables: every value comes from a result set, with where and under what.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { summaryRows, envelopeRows, allRows, maxByType, rowsOf, toCsv, columnsOf, whereOf, type Source } from '../result-tables';
import { envelopeMembers, pruneScopes } from '../result-scopes';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import '../../store/index';
import { initSolver } from '../wasm-solver';
import { publishCombinations3D, activePerCombo3D, activeCombinations } from '../../store/active-results';
import { computeStationDemands } from '../verification-service';
import { combinationPeakRows } from '../../export/excel';
import type { AnalysisResults3D } from '../types-3d';

const disp = (nodeId: number, ux: number, uz: number) => ({ nodeId, ux, uy: 0, uz, rx: 0, ry: 0, rz: 0 });
const set = (d: ReturnType<typeof disp>[]) => ({ displacements: d, reactions: [], elementForces: [] }) as unknown as AnalysisResults3D;

const A: Source = { id: 1, name: 'A', results: set([disp(1, 0.001, -0.004), disp(2, -0.003, 0)]) };
const B: Source = { id: 2, name: 'B', results: set([disp(1, 0.002, -0.001), disp(2, 0.000, -0.009)]) };

describe('pure tables', () => {
  it('summary: the extreme of each column, where and under which set', () => {
    const s = summaryRows('displacements', [A, B]);
    const ux = s.find((r) => r.column.key === 'ux')!;
    expect(ux.max).toMatchObject({ value: 0.002, entity: 1, source: B });
    expect(ux.min).toMatchObject({ value: -0.003, entity: 2, source: A });
    const uz = s.find((r) => r.column.key === 'uz')!;
    expect(uz.min).toMatchObject({ value: -0.009, entity: 2, source: B });
  });

  it('envelope: per node, max and min of each column with its source', () => {
    const e = envelopeRows('displacements', [A, B]);
    const n1 = e.find((r) => r.entity === 1)!;
    expect(n1.max[0]).toEqual({ value: 0.002, source: B });
    expect(n1.min[2]).toEqual({ value: -0.004, source: A });
  });

  it('all: every set, every row', () => {
    expect(allRows('displacements', [A, B]).map((r) => `${r.source.name}${r.entity}`)).toEqual(['A1', 'A2', 'B1', 'B2']);
  });

  it('member rows are one per end', () => {
    const f = { elementId: 7, nStart: 1, nEnd: 2, vyStart: 0, vyEnd: 0, vzStart: 0, vzEnd: 0, mxStart: 0, mxEnd: 0, myStart: 3, myEnd: 4, mzStart: 0, mzEnd: 0 };
    const r = rowsOf('forces', { displacements: [], reactions: [], elementForces: [f] } as never);
    expect(r).toEqual([{ entity: 7, end: 'i', x: 0, values: [1, 0, 0, 0, 3, 0] }, { entity: 7, end: 'j', values: [2, 0, 0, 0, 4, 0] }]);
  });

  it('narrows to the given nodes, adds the resultant, and groups by node on request', () => {
    const only1 = { entities: new Set([1]), resultant: true };
    const rows = rowsOf('displacements', A.results, only1);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.values[6]).toBeCloseTo(Math.hypot(0.001, -0.004), 12);
    expect(columnsOf('displacements', only1).map((c) => c.key)).toEqual(['ux', 'uy', 'uz', 'rx', 'ry', 'rz', 'u']);
    expect(allRows('displacements', [A, B], {}, 'entity').map((r) => `${r.source.name}${r.entity}`)).toEqual(['A1', 'B1', 'A2', 'B2']);
    expect(summaryRows('displacements', [A, B], only1).find((r) => r.column.key === 'u')!.max).toMatchObject({ entity: 1, source: A });
  });

  it('member resultants are √(Vy² + Vz²) and √(My² + Mz²)', () => {
    const f = { elementId: 7, length: 2, nStart: 1, nEnd: 1, vyStart: 3, vyEnd: 3, vzStart: 4, vzEnd: 4, mxStart: 0, mxEnd: 0, myStart: 6, myEnd: 0, mzStart: 8, mzEnd: 0 };
    const r = rowsOf('forces', { displacements: [], reactions: [], elementForces: [f] } as never, { resultant: true });
    expect(r[0]!.values.slice(6)).toEqual([5, 10]);
    expect(whereOf(r[0]!)).toBe('7·i');
    expect(whereOf({ entity: 7, x: 1.5 }, true)).toBe('7 @ 1.50');
  });

  it('a named envelope reads its combinations and its load cases, and forgets a case that is gone', () => {
    const perCombo = new Map([[1, A.results]]), perCase = new Map([[1, B.results], [2, A.results]]);
    const m = envelopeMembers({ comboIds: [1], caseIds: [1, 3] }, perCombo, perCase);
    expect(m.map((x) => `${x.kind}${x.id}`)).toEqual(['combo1', 'case1']);
    const pruned = pruneScopes({ envelopes: [{ id: 1, name: 'S', purpose: 'service', comboIds: [1], caseIds: [1, 2] }] }, new Set([1]), new Set([2]));
    expect(pruned!.envelopes![0]!.caseIds).toEqual([2]);
  });

  it('CSV quotes what needs quoting', () => {
    expect(toCsv(['a', 'b'], [['x, "y"', 1.5]])).toBe('a,b\n"x, ""y""",1.5');
  });
});

describe('solved: max by type reads along the member, and the Excel sheet is no longer zero', () => {
  let heavy = 0;
  beforeAll(async () => { await initSolver(); });
  beforeEach(() => {
    uiStore.analysisMode = 'pro';
    modelStore.clear();
    // A simply supported beam under a uniform load: the moment peaks at midspan, where no end is.
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'pinned3d');
    modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { tx: false, ty: true, tz: true, rx: true, ry: false, rz: false } });
    for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
    const dead = modelStore.addLoadCase('Tables dead', 'D');
    modelStore.addDistributedLoad3D(e, 0, 0, -10, -10, undefined, undefined, dead);
    modelStore.addCombination('1.0D', [{ caseId: dead, factor: 1 }]);
    heavy = modelStore.addCombination('1.4D', [{ caseId: dead, factor: 1.4 }]);
    const r = modelStore.solveCombinations3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    publishCombinations3D(r);
  });
  afterEach(() => { uiStore.analysisMode = '3d'; });

  it('the governing moment is qL²/8 at midspan, under the heavier combination', () => {
    const md = { elements: modelStore.elements, nodes: modelStore.nodes, sections: modelStore.sections, materials: modelStore.materials, supports: modelStore.supports };
    const rows = maxByType(computeStationDemands(activePerCombo3D(), activeCombinations(), md as never).demands);
    expect(rows).toHaveLength(1);
    // A load along −Z on a member along X bends it about its local y: My, and Vz. Each axis has
    // its own column, so the other one reads nothing.
    const m = rows[0]!.momentY!;
    expect(m.absValue).toBeCloseTo((1.4 * 10 * 36) / 8, 6);
    expect(m.stationX).toBeCloseTo(3, 6);
    expect(m.comboId).toBe(heavy);
    expect(rows[0]!.shearZ!.absValue).toBeCloseTo((1.4 * 10 * 6) / 2, 6);
    expect(Math.abs(rows[0]!.momentZ?.value ?? 0)).toBeLessThan(1e-6);
    expect(maxByType(computeStationDemands(activePerCombo3D(), activeCombinations(), md as never).demands, new Set([999]))).toEqual([]);
  });

  it('stations along the member read the diagram: qL²/8 at midspan, the end forces at the ends', () => {
    const r = [...activePerCombo3D().values()][0]!;
    const rows = rowsOf('forces', r, { stations: 5 });
    expect(rows).toHaveLength(5);
    expect(rows.map((x) => x.x)).toEqual([0, 1.5, 3, 4.5, 6]);
    expect(rows[0]!.end).toBe('i');
    expect(rows[4]!.end).toBe('j');
    expect(Math.abs(rows[2]!.values[4]!)).toBeCloseTo((10 * 36) / 8, 4);
    const ends = rowsOf('forces', r);
    expect(rows[0]!.values[4]).toBeCloseTo(ends[0]!.values[4]!, 9);
    expect(rows[4]!.values[2]).toBeCloseTo(ends[1]!.values[2]!, 9);
    // Each station is its own envelope row.
    expect(envelopeRows('forces', [{ id: 1, name: 'x', results: r }], { stations: 5 })).toHaveLength(5);
  });

  it('the Excel combinations sheet carries the forces', () => {
    const rows = combinationPeakRows();
    expect(rows).toHaveLength(2);
    const h = rows.find((r) => r[0] === '1.4D')!;
    expect(h[2]).toBeCloseTo(63, 2); // the midspan moment qL²/8 — no member end carries it
    expect(h[3]).toBeCloseTo(42, 2); // shear at the supports, qL/2
    expect(h[4]).toBeCloseTo(0, 6);
  });
});
