/**
 * The across-combination tables: every value comes from a result set, with where and under what.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { summaryRows, envelopeRows, allRows, maxByType, rowsOf, toCsv, type Source } from '../result-tables';
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
    expect(r).toEqual([{ entity: 7, end: 'i', values: [1, 0, 0, 0, 3, 0] }, { entity: 7, end: 'j', values: [2, 0, 0, 0, 4, 0] }]);
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
    const m = rows[0]!.bending!;
    expect(m.absValue).toBeCloseTo((1.4 * 10 * 36) / 8, 6);
    expect(m.stationX).toBeCloseTo(3, 6);
    expect(m.comboId).toBe(heavy);
    expect(rows[0]!.shear!.absValue).toBeCloseTo((1.4 * 10 * 6) / 2, 6);
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
