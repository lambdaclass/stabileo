import { readFileSync } from 'node:fs';
import { memberForceExtrema } from '../member-force-extrema';
/**
 * The across-combination tables: every value comes from a result set, with where and under what.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { summaryRows, envelopeRows, allRows, maxByType, rowsOf, toCsv, columnsOf, whereOf, type Source } from '../result-tables';
import { magnitudeCombination } from '../combination-methods';
import { computeGlobalMax3D, evaluateDiagramAt, memberCriticalOrdinates3D, memberEndForces3D } from '../diagrams-3d';
import { criticalForceStations, extractForcesAtStation } from '../station-forces';
import { envelopeMembers, envelopeOver, pruneScopes } from '../result-scopes';
import { DEFAULT_AXES } from '../../axes/frame';
import { modelStore } from '../../store/model.svelte';
import { resultsStore } from '../../store/results.svelte';
import { computeSectionProperties } from '../../data/section-shapes';
import { uiStore } from '../../store/ui.svelte';
import '../../store/index';
import { combineResultsEnvelope3D, computeEnvelope3D, initSolver, input3DToWireObject, solve3D, solveMultiCase3D, solvePDelta3D } from '../wasm-solver';
import { publishCombinations3D, activePerCombo3D, activeCombinations } from '../../store/active-results';
import { computeStationDemands, steelDemandOf } from '../verification-service';
import { combinationPeakRows } from '../../export/excel';
import { resultSheets } from '../../export/workbook-results';
import { envelopeSectionHtml } from '../report/project-sections';
import { forceTable3D } from '../report/calc-report-extra';
import { bindSpatialEnvelope, buildQueryRows, componentEnds, extremeRow, filterByAbsThreshold } from '../result-query';
import { ConcurrentDemand } from '../concurrent-demand';
import { computeElementStress3D } from '../section-stress-3d';
import { generateCalcReportHtml } from '../calc-report';
import { stationForces3D } from '../../section/panel';
import { DIAGRAM_EXTREMA_UNAVAILABLE, bindMemberEnvelopeEnds, memberEnvelopeOrdinates, requireConcurrentSectionForces } from '../member-diagram';
import { buildSolverInput3D, solveCombinations3D, solveCombinations3DParallel } from '../solver-service';
import { POINT_END_TOL } from '../member-point-loads';
import { expandVariableMembers, variableExpansionFor } from '../variable-members';
import { collapseVariableResults } from '../variable-member-results';
import type { AnalysisResults3D, ElementForces3D, SolverInput3D, SolverLoad3D } from '../types-3d';

const disp = (nodeId: number, ux: number, uz: number) => ({ nodeId, ux, uy: 0, uz, rx: 0, ry: 0, rz: 0 });
const set = (d: ReturnType<typeof disp>[]) => ({ displacements: d, reactions: [], elementForces: [] }) as unknown as AnalysisResults3D;

const canonical = { axes: DEFAULT_AXES };
const A: Source = { id: 1, name: 'A', results: set([disp(1, 0.001, -0.004), disp(2, -0.003, 0)]) };
const B: Source = { id: 2, name: 'B', results: set([disp(1, 0.002, -0.001), disp(2, 0.000, -0.009)]) };

describe('pure tables', () => {
  it('summary: the extreme of each column, where and under which set', () => {
    const s = summaryRows('displacements', [A, B], canonical);
    const ux = s.find((r) => r.column.key === 'ux')!;
    expect(ux.max).toMatchObject({ value: 0.002, entity: 1, source: B });
    expect(ux.min).toMatchObject({ value: -0.003, entity: 2, source: A });
    const uz = s.find((r) => r.column.key === 'uz')!;
    expect(uz.min).toMatchObject({ value: -0.009, entity: 2, source: B });
  });

  it('envelope: per node, max and min of each column with its source', () => {
    const e = envelopeRows('displacements', [A, B], canonical);
    const n1 = e.find((r) => r.entity === 1)!;
    expect(n1.max[0]).toEqual({ value: 0.002, source: B });
    expect(n1.min[2]).toEqual({ value: -0.004, source: A });
  });

  it('all: every set, every row', () => {
    expect(allRows('displacements', [A, B], canonical).map((r) => `${r.source.name}${r.entity}`)).toEqual(['A1', 'A2', 'B1', 'B2']);
  });

  it('member rows are one per end', () => {
    const f = { elementId: 7, nStart: 1, nEnd: 2, vyStart: 0, vyEnd: 0, vzStart: 0, vzEnd: 0, mxStart: 0, mxEnd: 0, myStart: 3, myEnd: 4, mzStart: 0, mzEnd: 0 };
    const r = rowsOf('forces', { displacements: [], reactions: [], elementForces: [f] } as never, canonical);
    expect(r).toEqual([{ entity: 7, end: 'i', x: 0, values: [1, 0, 0, 0, 3, 0] }, { entity: 7, end: 'j', values: [2, 0, 0, 0, 4, 0] }]);
  });

  it('narrows to the given nodes, adds the resultant, and groups by node on request', () => {
    const only1 = { ...canonical, entities: new Set([1]), resultant: true };
    const rows = rowsOf('displacements', A.results, only1);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.values[6]).toBeCloseTo(Math.hypot(0.001, -0.004), 12);
    expect(columnsOf('displacements', only1).map((c) => c.key)).toEqual(['ux', 'uy', 'uz', 'rx', 'ry', 'rz', 'u']);
    expect(allRows('displacements', [A, B], canonical, 'entity').map((r) => `${r.source.name}${r.entity}`)).toEqual(['A1', 'B1', 'A2', 'B2']);
    expect(summaryRows('displacements', [A, B], only1).find((r) => r.column.key === 'u')!.max).toMatchObject({ entity: 1, source: A });
  });

  it('member resultants are √(Vy² + Vz²) and √(My² + Mz²)', () => {
    const f = { elementId: 7, length: 2, nStart: 1, nEnd: 1, vyStart: 3, vyEnd: 3, vzStart: 4, vzEnd: 4, mxStart: 0, mxEnd: 0, myStart: 6, myEnd: 0, mzStart: 8, mzEnd: 0 };
    const r = rowsOf('forces', { displacements: [], reactions: [], elementForces: [f] } as never, { ...canonical, resultant: true });
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
    // A name a shared project carries is not a formula the spreadsheet runs.
    expect(toCsv(['combo'], [['=HYPERLINK("http://x","y")'], ['+1'], ['@SUM(A1)'], [-3]]))
      .toBe('combo\n"\'=HYPERLINK(""http://x"",""y"")"\n\'+1\n\'@SUM(A1)\n-3');
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
    const rows = rowsOf('forces', r, { ...canonical, stations: 5 });
    expect(rows).toHaveLength(5);
    expect(rows.map((x) => x.x)).toEqual([0, 1.5, 3, 4.5, 6]);
    expect(rows[0]!.end).toBe('i');
    expect(rows[4]!.end).toBe('j');
    expect(Math.abs(rows[2]!.values[4]!)).toBeCloseTo((10 * 36) / 8, 4);
    const ends = rowsOf('forces', r, canonical);
    expect(rows[0]!.values[4]).toBeCloseTo(ends[0]!.values[4]!, 9);
    expect(rows[4]!.values[2]).toBeCloseTo(ends[1]!.values[2]!, 9);
    // Each station is its own envelope row.
    expect(envelopeRows('forces', [{ id: 1, name: 'x', results: r }], { ...canonical, stations: 5 })).toHaveLength(5);
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

describe('ties within round-off', () => {
  it('name the lowest entity, whichever came first and whichever is larger in the last digit', async () => {
    const { beatsExtreme } = await import('../result-tables');
    // 8047 and 11007 carry the same value to 1e-15: 8047 is named in either order.
    const a = { value: 12.5, entity: 11007 };
    expect(beatsExtreme(1, 12.5 * (1 - 1e-15), 8047, 0, a)).toBe(true);
    const b = { value: 12.5 * (1 - 1e-15), entity: 8047 };
    expect(beatsExtreme(1, 12.5, 11007, 0, b)).toBe(false);
    // Beyond round-off the larger value wins, whoever holds it.
    expect(beatsExtreme(1, 12.6, 11007, 0, b)).toBe(true);
    expect(beatsExtreme(-1, -3, 5, 0, { value: -2, entity: 1 })).toBe(true);
  });
});

it('known wrong result: #2226 finds a narrow one-sided shear peak in the project and critical table summaries', () => {
  const a = 33 / 64, b = 34 / 64, jump = 11;
  const f = {
    elementId: 7, length: 1, nStart: 0, nEnd: 0, vyStart: 0, vyEnd: 0, vzStart: 0, vzEnd: 0,
    mxStart: 0, mxEnd: 0, myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0,
    pointLoadsZ: [{ a, p: jump }], distributedLoadsZ: [{ a, b, qI: -jump / (b - a), qJ: -jump / (b - a) }],
  } as ElementForces3D;
  const sources = [{ ...A, results: { ...A.results, elementForces: [f] } }];
  const critical = summaryRows('forces', sources, { ...canonical, stations: 'critical' });
  expect.soft(critical.find(r => r.column.key === 'vz')?.max).toMatchObject({ value: jump, x: a });
  const html = envelopeSectionHtml(sources, key => key, 'Envelope').join('');
  expect.soft(html).toContain('Vz (kN)</td><td class="num">11.000</td>');
});

it('known wrong result: #2226 finds a shear resultant minimum between component stations', () => {
  const f = {
    elementId: 7, length: 1, nStart: 0, nEnd: 0, vyStart: -3, vyEnd: 5, vzStart: -7, vzEnd: 1,
    mxStart: 0, mxEnd: 0, myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0,
    distributedLoadsY: [{ a: 0, b: 1, qI: 8, qJ: 8 }],
    distributedLoadsZ: [{ a: 0, b: 1, qI: 8, qJ: 8 }],
  } as ElementForces3D;
  const sources = [{ ...A, results: { ...A.results, elementForces: [f] } }];
  const critical = summaryRows('forces', sources, { ...canonical, stations: 'critical', resultant: true });
  expect(critical.find(r => r.column.key === 'v')?.min).toMatchObject({ value: Math.hypot(2, -2), x: 5 / 8 });
});

it('#2226 withholds a project summary whose nested magnitude has only a bound', () => {
  const f = {
    elementId: 7, length: 1, nStart: 0, nEnd: 0, vyStart: 3, vyEnd: 3, vzStart: 4, vzEnd: 4,
    mxStart: 0, mxEnd: 0, myStart: 0, myEnd: 4, mzStart: 0, mzEnd: -3,
  } as ElementForces3D;
  const makeSources = (forces: ElementForces3D) => [{ ...A, results: { ...A.results, elementForces: [forces] } }];
  const tr = (key: string) => key === DIAGRAM_EXTREMA_UNAVAILABLE ? 'Extrema withheld' : key;
  expect(envelopeSectionHtml(makeSources(f), tr, 'Envelope').join('')).toContain('V (kN)</td><td class="num">5.000</td>');
  const srss: ElementForces3D = { ...f, combined: { method: 'srss', parts: [f, { ...f, vyStart: -1 }] } };
  const combined: ElementForces3D = { ...f, combined: { method: 'abs', parts: [f, srss] } };
  expect(() => envelopeSectionHtml(makeSources(combined), tr, 'Envelope')).toThrow('Extrema withheld');
});

it('known wrong result: #2226 evaluates both transverse components at the physical jump cut', () => {
  const length = 3, a = 1.5, x = a + Number.EPSILON, slope = 2 ** 52;
  const f: ElementForces3D = {
    elementId: 7, length, nStart: 0, nEnd: 0, vyStart: 0, vyEnd: a * slope, vzStart: 4, vzEnd: 0,
    mxStart: 0, mxEnd: 0, myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0,
    releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false,
    qYI: 0, qYJ: 0, qZI: 0, qZJ: 0,
    pointLoadsY: [], pointLoadsZ: [{ a: x, p: -4 }], distributedLoadsZ: [],
    distributedLoadsY: [{ a, b: length, qI: slope, qJ: slope }],
  };
  const end = { ...f, length: 1, vyStart: f.vyEnd, distributedLoadsY: [], pointLoadsZ: [], vzStart: 0 };
  const piecewise = { ...f, length: 4, pieces: [{ x0: 0, x1: 3, sectionId: 1, forces: f }, { x0: 3, x1: 4, sectionId: 2, forces: end }] };
  for (const forces of [f, piecewise]) {
    const sources = [{ ...A, results: { ...A.results, elementForces: [forces] } }];
    const options = { ...canonical, stations: 'critical', resultant: true } as const;
    const summary = summaryRows('forces', sources, options);
    expect.soft(summary.find(r => r.column.key === 'v')?.min).toMatchObject({ value: 1, x });
    expect.soft(memberCriticalOrdinates3D(forces, ['shearY', 'shearZ']).filter(p => p.x === x)).toEqual([
      { t: x / forces.length, x, value: Math.hypot(1, 4), side: 'left' },
      { t: x / forces.length, x, value: 1, right: true, side: 'right' },
    ]);
    const cuts = criticalForceStations(forces).filter(cut => cut.t === x / forces.length);
    expect.soft(cuts.map(cut => {
      const { vy, vz } = extractForcesAtStation(forces, cut);
      return [vy, vz];
    })).toEqual([[1, 4], [1, 0]]);
    expect.soft(rowsOf('forces', sources[0]!.results, options).find(row => row.x === x)?.values[6]).toBe(Math.hypot(1, 4));
  }
  const next = x + Number.EPSILON;
  expect(next / length).toBe(x / length);
  expect(() => memberCriticalOrdinates3D({ ...f, pointLoadsY: [{ a: next, p: 1 }] }, ['shearY', 'shearZ']))
    .toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
});

it('known wrong result: #2226 finds the transverse extrema of an ordinary SRSS combination', () => {
  const f: ElementForces3D = {
    elementId: 7, length: 1, nStart: 0, nEnd: 0, vyStart: -3, vyEnd: 5, vzStart: -7, vzEnd: 1,
    mxStart: 0, mxEnd: 0, myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0,
    releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false,
    qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, pointLoadsY: [], pointLoadsZ: [],
    distributedLoadsY: [{ a: 0, b: 1, qI: 8, qJ: 8 }],
    distributedLoadsZ: [{ a: 0, b: 1, qI: 8, qJ: 8 }],
  };
  const constant = { ...f, vyStart: 4, vyEnd: 4, vzStart: 0, vzEnd: 0, distributedLoadsY: [], distributedLoadsZ: [] };
  const cases = new Map<number, AnalysisResults3D>([
    [1, { ...A.results, elementForces: [f] }],
    [2, { ...A.results, elementForces: [constant] }],
  ]);
  const factors = [{ caseId: 1, factor: 1 }, { caseId: 2, factor: 1 }];
  const options = { ...canonical, stations: 'critical', resultant: true } as const;
  const results = magnitudeCombination('srss', factors, cases)!;
  const sources = [{ ...A, results }];
  expect(summaryRows('forces', sources, options).find(r => r.column.key === 'v')?.min)
    .toMatchObject({ value: Math.hypot(2, -2, 4), x: 5 / 8 });
  expect(envelopeSectionHtml(sources, k => k, 'Envelope').join('')).toContain('4.899');
  const abs = magnitudeCombination('abs', factors, cases)!;
  const absV = summaryRows('forces', [{ ...A, results: abs }], options).find(row => row.column.key === 'v');
  expect(absV?.min).toMatchObject({ value: Math.hypot(4, 4), x: 3 / 8 });
  expect(absV?.max).toMatchObject({ value: Math.hypot(7, 7), x: 0 });
});

const reviewForces: ElementForces3D = {
  elementId: 7, length: 1, nStart: 0, nEnd: 0, vyStart: 0, vyEnd: 0, vzStart: 4, vzEnd: 0,
  mxStart: 0, mxEnd: 0, myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0,
  releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false,
  releaseTStart: false, releaseTEnd: false, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0,
  pointLoadsY: [], pointLoadsZ: [], distributedLoadsY: [], distributedLoadsZ: [],
};

const criticalOptions = { ...canonical, stations: 'critical', resultant: true } as const;
const reviewSources = (forces: ElementForces3D) => [{ ...A, results: { ...A.results, elementForces: [forces] } }];

it('known wrong result: #2581 shares component curves between the report summary and its resultants', () => {
  let reads = 0;
  const loads = [{ a: 0, b: 1, qI: 8, qJ: 8 }];
  const forces: ElementForces3D = {
    ...reviewForces, vyStart: -3, vyEnd: 5, vzStart: -7, vzEnd: 1,
    get distributedLoadsY() {
      reads++;
      return loads;
    },
    distributedLoadsZ: loads,
  };
  const html = envelopeSectionHtml(reviewSources(forces), key => key, 'Envelope').join('');
  expect.soft(html).toContain('<td>V (kN)</td>');
  expect.soft(html).toContain('<td class="num">2.828</td><td>7 @ 0.63</td>');
  expect(reads).toBe(2);
});

it('known wrong result: #2226 refuses distinct transverse jumps that round to the same rebased cut', () => {
  const first = 0.25 - 2 ** -55;
  const second = 0.25;
  expect(first).toBeLessThan(second);
  expect(1 + first).toBe(1 + second);
  const firstPiece = { x0: 0, x1: 1, sectionId: 1, forces: reviewForces };
  const parent = (a: number) => ({
    ...reviewForces, length: 2,
    pieces: [firstPiece, {
      x0: 1, x1: 2, sectionId: 2, forces: { ...reviewForces, pointLoadsY: [{ a, p: 3 }], pointLoadsZ: [{ a: second, p: -4 }] },
    }],
  });
  const summary = (a: number) => summaryRows('forces', reviewSources(parent(a)), criticalOptions).find(r => r.column.key === 'v');
  expect.soft(() => summary(first)).toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
  const tr = (key: string) => key === DIAGRAM_EXTREMA_UNAVAILABLE ? 'Extrema withheld' : key;
  expect.soft(() => envelopeSectionHtml(reviewSources(parent(first)), tr, 'Envelope')).toThrow('Extrema withheld');
  expect.soft(() => criticalForceStations(parent(first))).toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
  expect.soft(summary(second)?.max?.value).toBe(4);
  expect.soft(summary(0.25 - 2 ** -52)?.max?.value).toBe(5);
});

it('known wrong result: #2226 summarizes the exact transverse norm of a one-part ABS combination', () => {
  const f = {
    ...reviewForces, vyStart: -3, vyEnd: 5, vzStart: -7, vzEnd: 1,
    distributedLoadsY: [{ a: 0, b: 1, qI: 8, qJ: 8 }],
    distributedLoadsZ: [{ a: 0, b: 1, qI: 8, qJ: 8 }],
  };
  const cases = new Map([[1, reviewSources(f)[0]!.results]]);
  const results = magnitudeCombination('abs', [{ caseId: 1, factor: 1 }], cases)!;
  const sources = [{ ...A, results }];
  const v = summaryRows('forces', sources, criticalOptions).find(r => r.column.key === 'v');
  expect.soft(v?.min).toMatchObject({ value: Math.hypot(2, -2), x: 5 / 8 });
  expect.soft(v?.max).toMatchObject({ value: Math.hypot(-3, -7), x: 0 });
  expect.soft(envelopeSectionHtml(sources, k => k, 'Envelope').join('')).toContain('2.828');
});

it('known wrong result: #2226 labels the governing jump face in critical summaries', () => {
  const a = 0.5;
  const f = {
    ...reviewForces, vzStart: -4, vzEnd: 0,
    pointLoadsZ: [{ a, p: 11 }],
    distributedLoadsZ: [{ a: 0, b: a, qI: -2, qJ: -2 }, { a, b: 1, qI: -12, qJ: -12 }],
  };
  const sources = reviewSources(f);
  const summary = summaryRows('forces', sources, criticalOptions).find(r => r.column.key === 'vz')!;
  expect.soft(summary.min).toMatchObject({ value: -5, x: a, side: 'left' });
  expect.soft(summary.max).toMatchObject({ value: 6, x: a, side: 'right' });
  expect.soft(whereOf(summary.min!, true)).toBe('7 @ 0.50⁻');
  expect.soft(whereOf(summary.max!, true)).toBe('7 @ 0.50⁺');
  const html = envelopeSectionHtml(sources, k => k, 'Envelope').join('');
  expect.soft(html).toContain('7 @ 0.50⁺');
  expect.soft(html).toContain('7 @ 0.50⁻');
  const [sheet] = resultSheets({
    sources: sources.map(source => ({ ...source, kind: 'combination' })), stations: 'critical', statics: null,
  }, name => name === 'Maxima');
  const side = sheet!.rows[0]!.indexOf('cut side');
  expect.soft(side).toBeGreaterThanOrEqual(0);
  expect.soft(sheet!.rows.find(row => row[1] === 'Vz' && row[3] === 'max')?.[side]).toBe('+');
  expect.soft(sheet!.rows.find(row => row[1] === 'Vz' && row[3] === 'min')?.[side]).toBe('−');
});

it('known wrong result: #2226 keeps the strict critical force extremes at nearly equal jump faces', () => {
  const a = 0.5, step = 2 ** -32;
  const f = {
    ...reviewForces, vzStart: -1, vzEnd: 1, vyStart: 1, vyEnd: -1,
    pointLoadsY: [{ a, p: step }], pointLoadsZ: [{ a, p: -step }],
    distributedLoadsY: [{ a, b: 1, qI: -4 - 2 * step, qJ: -4 - 2 * step }],
    distributedLoadsZ: [{ a, b: 1, qI: 4 + 2 * step, qJ: 4 + 2 * step }],
  };
  const sources = reviewSources(f);
  const rows = summaryRows('forces', sources, criticalOptions);
  expect.soft(rows.find(row => row.column.key === 'vy')?.max).toMatchObject({ value: 1 + step, x: a, side: 'right' });
  expect.soft(rows.find(row => row.column.key === 'vz')?.min).toMatchObject({ value: -1 - step, x: a, side: 'right' });
  const html = envelopeSectionHtml(sources, k => k, 'Envelope').join('');
  expect.soft(html.match(/7 @ 0\.50⁺/g)).toHaveLength(3);
  const tied = reviewSources({ ...reviewForces, vyStart: 1, vyEnd: 1 });
  const tiedRows = summaryRows('forces', tied, criticalOptions);
  expect.soft(tiedRows.find(row => row.column.key === 'vy')?.max).toMatchObject({ value: 1, x: 0, end: 'i' });
});

it('known wrong result: #2226 evaluates a rebased cut in both piece-local components', () => {
  const a = 0.25 - 2 ** -55;
  const first = { ...reviewForces, vyStart: -(2 ** 53), vyEnd: -(2 ** 53), vzStart: 0 };
  const next = {
    ...first, vyEnd: 3 * 2 ** 53, vzEnd: 4,
    distributedLoadsY: [{ a: 0, b: 1, qI: 2 ** 55, qJ: 2 ** 55 }],
    pointLoadsZ: [{ a, p: 4 }],
  };
  const forces = {
    ...first, length: 2,
    pieces: [{ x0: 0, x1: 1, sectionId: 1, forces: first }, { x0: 1, x1: 2, sectionId: 2, forces: next }],
  };
  const v = summaryRows('forces', reviewSources(forces), criticalOptions).find(r => r.column.key === 'v');
  expect.soft(v?.min).toMatchObject({ value: 1, x: 1.25, side: 'left' });
  expect.soft(memberCriticalOrdinates3D(forces, ['shearY', 'shearZ']).filter(p => p.x === 1.25)
    .map(p => p.value)).toEqual([1, Math.hypot(1, 4)]);
  const after = { ...next, vzStart: 4, vzEnd: 0, pointLoadsZ: [{ a, p: -4 }] };
  const unavailable = { ...forces, pieces: [forces.pieces[0]!, { ...forces.pieces[1]!, forces: after }] };
  expect(() => summaryRows('forces', reviewSources(unavailable), criticalOptions)).toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
});

it('known wrong result: #2226 keeps both faces in critical rows and row envelopes', () => {
  const a = 0.5;
  const f = {
    ...reviewForces, vzStart: -5, vzEnd: 6, pointLoadsZ: [{ a, p: 11 }],
  };
  const [source] = reviewSources(f);
  const rows = rowsOf('forces', source!.results, criticalOptions).filter(row => row.x === a);
  expect.soft(rows.map(row => [whereOf(row, true), row.values[2]])).toEqual([['7 @ 0.50⁻', -5], ['7 @ 0.50⁺', 6]]);
  const envelope = envelopeRows('forces', [source!], criticalOptions).filter(row => row.x === a);
  expect.soft(envelope.map(row => [whereOf(row, true), row.max[2]!.value])).toEqual([['7 @ 0.50⁻', -5], ['7 @ 0.50⁺', 6]]);
  const sheets = resultSheets({
    sources: [{ ...source!, kind: 'combination' }], stations: 'critical', statics: null,
  }, name => name === 'Stations' || name === 'Envelope');
  const stationSheet = sheets.find(sheet => sheet.name === 'Stations')!;
  const side = stationSheet.rows[0]!.indexOf('cut side');
  const distance = stationSheet.rows[0]!.indexOf('x [m]');
  expect.soft(stationSheet.rows.filter(row => row[distance] === a).map(row => row[side])).toEqual(['−', '+']);
  const envelopeSheet = sheets.find(sheet => sheet.name === 'Envelope')!;
  expect.soft(envelopeSheet.rows.filter(row => row[3] === a && row[4] === 'Vz').map(row => row.at(-1))).toEqual(['−', '+']);
});

it('known wrong result: #2226 summarizes a two-case ABS resultant through the project report', () => {
  const a = { ...reviewForces, vyStart: -3, vyEnd: -3, vzStart: 0 };
  const b = { ...reviewForces, vyStart: 0, vzStart: 4, vzEnd: 4 };
  const cases = new Map([[1, reviewSources(a)[0]!.results], [2, reviewSources(b)[0]!.results]]);
  const results = magnitudeCombination('abs', [{ caseId: 1, factor: 1 }, { caseId: 2, factor: 1 }], cases)!;
  const sources = [{ ...A, results }];
  const v = summaryRows('forces', sources, criticalOptions).find(row => row.column.key === 'v');
  expect.soft(v?.min?.value).toBe(5);
  expect.soft(v?.max?.value).toBe(5);
  expect.soft(envelopeSectionHtml(sources, k => k, 'Envelope').join('')).toContain('V (kN)</td><td class="num">5.000</td>');
});

it('known wrong result: #2226 evaluates every combination at each critical station and face', () => {
  const a = 1.72, peak = 2;
  const lowForces = {
    ...reviewForces, length: 3, nStart: -10, nEnd: 10, pointLoadsX: [{ a, p: -20 }],
    vzStart: 4, vzEnd: -2, distributedLoadsZ: [{ a: 0, b: 3, qI: -2, qJ: -2 }],
  };
  const highForces = { ...reviewForces, length: 3, nStart: 100, nEnd: 100, vzStart: 0 };
  const low = reviewSources(lowForces)[0]!;
  const high = { ...B, results: reviewSources(highForces)[0]!.results };
  const stations = (sources: Source[]) => envelopeRows('forces', sources, criticalOptions);
  for (const sources of [[low, high], [high, low]]) {
    const rows = stations(sources);
    expect.soft(rows.filter(row => row.x === a).map(row => [row.side, row.min[0], row.max[0]])).toEqual([
      ['left', { value: -10, source: low }, { value: 100, source: high }],
      ['right', { value: 10, source: low }, { value: 100, source: high }],
    ]);
    expect.soft(rows.find(row => row.x === peak)?.max[0]).toEqual({ value: 100, source: high });
    expect.soft(rows.find(row => row.x === 0.75)?.min[0]).toEqual({ value: -10, source: low });
    expect.soft(rows.find(row => row.x === 3)?.max[0]).toEqual({ value: 100, source: high });
  }
  expect.soft(stations([high]).every(row => row.max[0]?.value === 100 && !row.side)).toBe(true);

  const sheets = resultSheets({
    sources: [low, high].map(source => ({ ...source, kind: 'combination' })), stations: 'critical', statics: null,
  }, name => name === 'Envelope');
  const axial = sheets.find(sheet => sheet.name === 'Envelope')!.rows.filter(row => row[3] === a && row[4] === 'N');
  expect.soft(axial.map(row => [row[6], row[8], row.at(-1)])).toEqual([[100, high.name, '−'], [100, high.name, '+']]);
});

it('known wrong result: #2581 summarizes only inward member-end forces', async () => {
  await initSolver();
  const span = 4;
  const tipY = -3, tipZ = -4;
  const pointY = 5 * tipY, pointZ = 5 * tipZ;
  const input: SolverInput3D = {
    nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: span, y: 0, z: 0 }]]),
    materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 0.0001, iy: 0.0001, j: 0.0001 }]]),
    elements: new Map([[7, {
      id: 7, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1,
      releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false,
      releaseTStart: false, releaseTEnd: false,
    }]]),
    supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: tipY, fz: tipZ, mx: 0, my: 0, mz: 0 } }],
  };

  for (const a of [0, span / 4, span, undefined]) {
    const loaded: SolverInput3D = a === undefined ? input : {
      ...input,
      loads: [...input.loads, { type: 'pointOnElement', data: { elementId: 7, a, py: pointY, pz: pointZ } }],
    };
    const nonlinear = solvePDelta3D(loaded);
    expect(nonlinear.converged).toBe(true);

    const pointCrossesAnInwardCut = a !== undefined && a > 0;
    const maxY = -(tipY + (pointCrossesAnInwardCut ? pointY : 0));
    const maxZ = -(tipZ + (pointCrossesAnInwardCut ? pointZ : 0));
    const maxV = Math.hypot(maxY, maxZ);
    for (const [mode, results] of [['linear', solve3D(loaded)], ['P-Delta', nonlinear.results]] as const) {
      const basis = `${mode}, point station ${a}: equilibrium on the J side of a cut includes the tip force and any point force beyond the cut. At I the support takes the point force directly.`;
      const sources = [{ ...A, results }];
      const summary = summaryRows('forces', sources, criticalOptions);
      for (const [key, value] of [['vy', maxY], ['vz', maxZ], ['v', maxV]] as const) {
        expect.soft(summary.find(row => row.column.key === key)?.max?.value, basis).toBeCloseTo(value, 12);
      }
      const html = envelopeSectionHtml(sources, key => key, 'Envelope').join('');
      expect.soft(html, basis).toContain(`<td>Vz (kN)</td><td class="num">${maxZ.toFixed(3)}</td>`);
      expect.soft(html, basis).toContain(`<td>V (kN)</td><td class="num">${maxV.toFixed(3)}</td>`);
      const [sheet] = resultSheets({
        sources: sources.map(source => ({ ...source, kind: 'combination' })), stations: 'critical', statics: null,
      }, name => name === 'Maxima');
      const peak = sheet!.rows.find(row => row[1] === 'Vz' && row[3] === 'max');
      expect.soft(peak?.[4], basis).toBeCloseTo(maxZ, 12);
    }
  }
});

it('known wrong result: #2581 exports only inward ends and both interior jump faces', () => {
  const length = 4, axial = 10, shear = 20;
  const control = reviewSources({ ...reviewForces, length, vzStart: 0, vzEnd: 0 })[0]!;
  const high = { ...control, id: 2, name: 'Continuous' };
  for (const a of [0, 1, length]) {
    const forces = {
      ...reviewForces, length, nStart: axial, vzStart: shear,
      nEnd: a === length ? axial : 0, vzEnd: a === length ? -shear : 0,
      pointLoadsX: [{ a, p: axial }], pointLoadsZ: [{ a, p: -shear }],
    };
    const source = reviewSources(forces)[0]!;
    const at = a === 0 ? [[0, 0]] : a === length ? [[axial, shear]] : [[axial, shear], [0, 0]];
    const direct = rowsOf('forces', source.results, criticalOptions).filter(row => row.x === a);
    expect.soft(direct.map(row => [row.values[0], row.values[2]]), `rows at ${a}`).toEqual(at);
    for (const stations of [2, 5]) {
      const ends = envelopeRows('forces', [source, high], { ...canonical, stations });
      expect.soft(ends.find(row => row.end === 'i')?.max[0]?.value).toBe(a === 0 ? 0 : axial);
      expect.soft(ends.find(row => row.end === 'j')?.max[0]?.value).toBe(a === length ? axial : 0);
    }
    const [queryI, queryJ] = buildQueryRows([forces], 'N');
    expect.soft(queryI?.value).toBe(a === 0 ? 0 : axial);
    expect.soft(queryJ?.value).toBe(a === length ? axial : 0);
    const report = forceTable3D('axial', source.results, String, 'kN', String, 'm');
    expect.soft(report).toContain(`<td>I</td><td class="num">${a === 0 ? 0 : axial}</td>`);
    expect.soft(report).toContain(`<td>J</td><td class="num">${a === length ? axial : 0}</td>`);
    for (const sources of [[source, high], [high, source]]) {
      const envelope = envelopeRows('forces', sources, criticalOptions).filter(row => row.x === a);
      expect.soft(envelope.map(row => [row.max[0]!.value, row.max[2]!.value]), `envelope at ${a}`).toEqual(at);
      const [sheet] = resultSheets({
        sources: sources.map(s => ({ ...s, kind: 'combination' })), stations: 'critical', statics: null,
      }, name => name === 'Envelope');
      expect.soft(sheet!.rows.filter(row => row[3] === a && row[4] === 'N').map(row => row[6]), `workbook at ${a}`)
        .toEqual(at.map(values => values[0]));
    }
  }
  const legacy = {
    kind: 'axial' as const, globalMax: axial,
    elements: [{ elementId: reviewForces.elementId, tPositions: [0, 0, 1], posValues: [axial, 0, 0], negValues: [0, 0, 0] }],
  };
  expect(memberEnvelopeOrdinates(legacy.elements[0]!, length).map(row => row.value)).toEqual([0, 0]);
  expect(rowsOf('forces', control.results, criticalOptions).map(row => row.x)).toEqual([0, 1, 2, 3, 4]);
});

it('known wrong result: #2581 reads the J cell inside the point-load jump', async () => {
  await initSolver();
  const length = 4;
  const tip = 24, point = 15;
  const input: SolverInput3D = {
    nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: length, y: 0, z: 0 }]]),
    materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 0.0001, iy: 0.0001, j: 0.0001 }]]),
    elements: new Map([[7, {
      id: 7, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1,
      releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false,
      releaseTStart: false, releaseTEnd: false,
    }]]),
    supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -tip, fz: -tip, mx: 0, my: 0, mz: 0 } }],
  };
  for (const a of [0, length * (1 - Number.EPSILON), length, undefined]) {
    const loaded: SolverInput3D = a === undefined ? input : {
      ...input, loads: [...input.loads, { type: 'pointOnElement', data: { elementId: 7, a, py: point, pz: point } }],
    };
    const nonlinear = solvePDelta3D(loaded);
    expect(nonlinear.converged).toBe(true);
    const inwardI = a !== undefined && a > 0 ? tip - point : tip;
    const inwardJ = a === length ? tip - point : tip;
    for (const [mode, results] of [['linear', solve3D(loaded)], ['P-Delta', nonlinear.results]] as const) {
      const basis = `${mode}, point station ${a}. Equilibrium on the free side of the cut includes the tip force and any point force beyond the cut.`;
      const force = results.elementForces[0]!;
      expect.soft(force.vyEnd, basis).toBeCloseTo(tip, 12);
      for (const [component, kind, column] of [['Vy', 'shearY', 1], ['Vz', 'shearZ', 2]] as const) {
        const ends = memberEndForces3D(force, kind);
        expect.soft(ends[0], basis).toBeCloseTo(inwardI, 12);
        expect.soft(ends[1], basis).toBeCloseTo(inwardJ, 12);
        expect.soft(buildQueryRows([force], component).find(row => row.end === 'j')?.value, basis).toBeCloseTo(inwardJ, 12);
        const source = { ...A, results };
        for (const stations of [2, 5, 'critical'] as const) {
          const row = rowsOf('forces', results, { ...canonical, stations }).find(row => row.end === 'j');
          expect.soft(row?.values[column], basis).toBeCloseTo(inwardJ, 12);
          const envelope = envelopeRows('forces', [source], { ...canonical, stations }).find(row => row.end === 'j');
          expect.soft(envelope?.max[column]?.value, basis).toBeCloseTo(inwardJ, 12);
        }
      }
      const report = forceTable3D('shear', results, value => value.toFixed(2), 'kN', String, 'm');
      expect.soft(report, basis).toContain(`<td>J</td><td class="num">${inwardJ.toFixed(2)}</td><td class="num">${inwardJ.toFixed(2)}</td>`);
      const fullReport = generateCalcReportHtml({
        config: { projectName: 'P', engineerName: '', companyName: '', date: '', notes: '' },
        is3D: true, analysisMode: '3D', provenance: { kind: 'single' }, hasDesignChecks: false,
        nodes: [], elements: [], materials: [], sections: [], supports: [], loads: [], loadCases: [], combinations: [],
        results3D: results,
      });
      expect.soft(fullReport, basis).toContain(`<td>J</td><td class="num">0</td><td class="num">${inwardJ.toFixed(2)}</td><td class="num">${inwardJ.toFixed(2)}</td>`);
      const end = ConcurrentDemand.endpoints(force).find(demand => demand.stationT === 1);
      expect.soft(end?.forces.vy, basis).toBeCloseTo(inwardJ, 12);
      expect.soft(end?.forces.vz, basis).toBeCloseTo(inwardJ, 12);
      expect.soft(steelDemandOf(force).Vu, basis).toBeCloseTo(Math.max(inwardI, inwardJ), 12);
      const section = stationForces3D(force, 1);
      expect.soft(section.vy, basis).toBeCloseTo(inwardJ, 12);
      expect.soft(section.vz, basis).toBeCloseTo(inwardJ, 12);
      const stress = computeElementStress3D(force, 1, 1, 1);
      expect.soft(stress.end.tauMax, basis).toBeCloseTo(Math.hypot(inwardJ, inwardJ) * 1.2, 12);
    }
  }
});

it('known wrong result: #2581 excludes the exterior axial value at J', () => {
  const length = 4, tip = 24, point = 15;
  const force = { ...reviewForces, length, nStart: tip - point, nEnd: tip, pointLoadsX: [{ a: length, p: -point }] };
  const { results } = reviewSources(force)[0]!;
  expect.soft(memberEndForces3D(force, 'axial')).toEqual([tip - point, tip - point]);
  expect.soft(buildQueryRows([force], 'N').find(row => row.end === 'j')?.value).toBe(tip - point);
  expect.soft(rowsOf('forces', results, canonical).find(row => row.end === 'j')?.values[0]).toBe(tip - point);
  expect.soft(ConcurrentDemand.endpoints(force).find(demand => demand.stationT === 1)?.forces.n).toBe(tip - point);
  expect.soft(steelDemandOf(force).Nt).toBe(tip - point);
  expect.soft(stationForces3D(force, 1).n).toBe(tip - point);
});

it('known wrong result: #2581 reads the aggregate spatial J cell from its case envelope', async () => {
  await initSolver();
  const length = 4, inward = 9, exterior = 24, start = 30, end = 18;
  const point = { ...reviewForces, length, vyStart: inward, vyEnd: exterior, pointLoadsY: [{ a: length, p: exterior - inward }] };
  const uniform = { ...reviewForces, length, vyStart: start, vyEnd: end, distributedLoadsY: [
    { a: 0, b: length, qI: (end - start) / length, qJ: (end - start) / length },
  ] };
  for (const cases of [[point, uniform], [uniform, point]]) {
    const envelope = computeEnvelope3D(cases.map(force => reviewSources(force)[0]!.results))!;
    const results = envelope.maxAbsResults3D;
    expect.soft(rowsOf('forces', results, canonical).find(row => row.end === 'j')?.values[1]).toBe(end);
    expect.soft(buildQueryRows(results.elementForces, 'Vy').find(row => row.end === 'j')?.value).toBe(end);
  }
});

describe('spatial cantilever end queries', () => {
  const length = 4;
  let elementId: number, tip: number;

  beforeAll(async () => { await initSolver(); });
  beforeEach(() => {
    uiStore.analysisMode = '3d';
    modelStore.clear();
    const root = modelStore.addNode(0, 0, 0);
    tip = modelStore.addNode(length, 0, 0);
    elementId = modelStore.addElement(root, tip, 'frame');
    modelStore.addSupport(root, 'fixed3d');
  });

  function solveModel() {
    const model = expandVariableMembers(modelStore.model);
    const input = buildSolverInput3D(model, false, false)!;
    const linear = solve3D(input);
    const nonlinear = solvePDelta3D(input);
    expect(nonlinear.converged).toBe(true);
    const expansion = variableExpansionFor(modelStore.model);
    return [linear, nonlinear.results].map(result => collapseVariableResults(result, expansion));
  }

  it('known wrong result: #2581 converge signed spatial envelopes preserve concurrence and attained minima', () => {
    const tension = 10, shearY = 3, shearZ = 4;
    const loadId = modelStore.addLoadEntry({
      type: 'nodal3d', data: { id: 1, nodeId: tip, fx: tension, fy: -shearY, fz: 0, mx: 0, my: 0, mz: 0 },
    });
    const y = solveModel();
    expect(modelStore.updateLoad(loadId, { fx: 2 * tension, fy: 0, fz: -shearZ })).toBe(true);
    const z = solveModel();

    for (const [mode, first] of y.entries()) {
      const cases = [first, z[mode]!];
      const results = computeEnvelope3D(cases)!.maxAbsResults3D;
      const opts = { ...canonical, resultant: true };
      for (const stations of [undefined, 5, 'critical'] as const) {
        if (stations !== 'critical') {
          expect.soft(() => summaryRows('forces', [{ ...A, results }], { ...opts, stations }))
            .toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
        }
        expect.soft(() => rowsOf('forces', results, { ...opts, stations })).toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
      }
      const critical = summaryRows('forces', [{ ...A, results }], { ...opts, stations: 'critical' });
      expect.soft(critical.find(row => row.column.key === 'n')?.min?.value).toBeCloseTo(tension, 12);
      expect.soft(critical.find(row => row.column.key === 'n')?.max?.value).toBeCloseTo(2 * tension, 12);
      expect.soft(critical.find(row => row.column.key === 'v')?.max?.value).toBeCloseTo(shearZ, 12);
    }
  });

  it('known wrong result: #2581 envelopes the signed +10 and -8 spatial case forces', () => {
    const loadId = modelStore.addLoadEntry({
      type: 'nodal3d', data: { id: 1, nodeId: tip, fx: 10, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 },
    });
    const plus = solveModel();
    expect(modelStore.updateLoad(loadId, { fx: -8 })).toBe(true);
    const minus = solveModel();

    for (const [mode, first] of plus.entries()) {
      const sources = [{ ...A, results: first }, { ...B, results: minus[mode]! }];
      const envelope = computeEnvelope3D(sources.map(source => source.results))!;
      const aggregate = { id: 3, name: 'Envelope', results: envelope.maxAbsResults3D };
      const detached = bindMemberEnvelopeEnds(structuredClone(envelope));
      for (const stations of [2, 5, 'critical'] as const) {
        const opts = { ...canonical, stations, resultant: false };
        const direct = envelopeRows('forces', sources, opts);
        const aggregated = envelopeRows('forces', [aggregate], opts);
        expect(direct).not.toHaveLength(0);
        expect.soft(aggregated).toHaveLength(direct.length);
        for (const row of aggregated) {
          expect.soft(row.entity).toBe(elementId);
          expect.soft(row.max[0]?.value).toBeCloseTo(10, 12);
          expect.soft(row.min[0]?.value).toBeCloseTo(-8, 12);
        }
        expect.soft(envelopeRows('forces', [aggregate, ...sources], opts)).toEqual(direct);
        expect.soft(() => envelopeRows('forces', [{ ...aggregate, results: detached.maxAbsResults3D }], opts))
          .toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
        expect.soft(() => envelopeRows('forces', [aggregate], { ...opts, resultant: true }))
          .toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
      }
    }
  });

  it('known wrong result: #2581 recovers the signed query maximum from bound members alone', () => {
    const id = modelStore.addLoadEntry({
      type: 'nodal3d', data: { id: 1, nodeId: tip, fx: -80, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 },
    });
    const negative = solveModel();
    expect(modelStore.updateLoad(id, { fx: 30 })).toBe(true);
    const positive = solveModel();
    for (const [i, result] of negative.entries()) {
      const envelope = computeEnvelope3D([result, positive[i]!])!;
      const forces = envelope.maxAbsResults3D.elementForces;
      expect(forces).toHaveLength(1);
      const queried = buildQueryRows([...forces], 'N', { elementIds: [elementId] });
      for (const end of ['i', 'j'] as const) {
        const rows = queried.filter(row => row.end === end);
        expect.soft(extremeRow(rows, 'min')?.value).toBeCloseTo(-80, 12);
        expect.soft(extremeRow(rows, 'max')?.value).toBeCloseTo(30, 12);
        expect.soft(extremeRow(rows, 'absmax')?.value).toBeCloseTo(-80, 12);
      }
      expect.soft(queried).toEqual(buildQueryRows(forces, 'N', { envelope }));
      expect.soft(buildQueryRows(forces, 'N', { elementIds: [] })).toEqual([]);
      expect.soft(buildQueryRows(positive[i]!.elementForces, 'N').map(row => row.value))
        .toEqual(queried.filter(row => row.value > 0).map(row => row.value));
      const detached = bindMemberEnvelopeEnds(structuredClone(envelope));
      expect.soft(() => buildQueryRows(detached.maxAbsResults3D.elementForces, 'N')).toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
    }
  });

  it('known wrong result: #2581 recovers the signed member-end and spaced summary maximum', () => {
    const id = modelStore.addLoadEntry({
      type: 'nodal3d', data: { id: 1, nodeId: tip, fx: -80, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 },
    });
    const negative = solveModel();
    expect(modelStore.updateLoad(id, { fx: 30 })).toBe(true);
    const positive = solveModel();
    for (const [i, result] of negative.entries()) {
      const cases = [{ ...A, results: result }, { ...B, results: positive[i]! }];
      const envelope = computeEnvelope3D(cases.map(source => source.results))!;
      const aggregate = { id: 3, name: 'Envelope', results: envelope.maxAbsResults3D };
      const detached = bindMemberEnvelopeEnds(structuredClone(envelope));
      for (const stations of [2, 5, 'critical'] as const) {
        const opts = { ...canonical, stations };
        const axial = (sources: Source[]) => summaryRows('forces', sources, opts)[0]!;
        const row = axial([aggregate]);
        expect.soft(row.min?.value).toBeCloseTo(-80, 12);
        expect.soft(row.max?.value).toBeCloseTo(30, 12);
        expect.soft(axial([aggregate, ...cases])).toEqual(axial(cases));
        expect.soft(axial([cases[1]!]).min?.value).toBeCloseTo(30, 12);
        expect.soft(() => axial([{ ...aggregate, results: detached.maxAbsResults3D }])).toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
      }
    }
  });

  it('known wrong result: #2581 queries signed bounds from linear and P-Delta case envelopes', () => {
    const positive = 100, negative = -60;
    const id = modelStore.addLoadEntry({
      type: 'nodal3d', data: { id: 1, nodeId: tip, fx: 0, fy: -positive, fz: -positive, mx: 0, my: 0, mz: 0 },
    });
    const plus = solveModel();
    expect(modelStore.updateLoad(id, { fy: -negative, fz: -negative })).toBe(true);
    const minus = solveModel();

    for (const [i, result] of plus.entries()) {
      const envelope = computeEnvelope3D([result, minus[i]!])!;
      for (const component of ['Vy', 'Vz'] as const) {
        const rows = buildQueryRows(envelope.maxAbsResults3D.elementForces, component, { envelope });
        for (const end of ['i', 'j'] as const) {
          const at = rows.filter(row => row.end === end);
          expect.soft(extremeRow(at, 'max')?.value).toBeCloseTo(positive, 12);
          expect.soft(extremeRow(at, 'min')?.value).toBeCloseTo(negative, 12);
          expect.soft(extremeRow(at, 'absmax')?.value).toBeCloseTo(positive, 12);
        }
        const single = buildQueryRows(result.elementForces, component);
        expect.soft(single).toHaveLength(2);
        for (const row of single) expect.soft(row.value).toBeCloseTo(positive, 12);
      }
    }
  });

  it.each([
    { label: 'all-positive', values: [10, 20], min: 10, max: 20, absmax: 20 },
    { label: 'all-negative', values: [-10, -20], min: -20, max: -10, absmax: -20 },
    { label: 'mixed with a zero case', values: [-20, 0, 10, 15], min: -20, max: 15, absmax: -20 },
  ])('known wrong result: #2581 queries the true $label spatial case ends', ({ values, min, max, absmax }) => {
    const loadId = modelStore.addLoadEntry({
      type: 'nodal3d', data: { id: 1, nodeId: tip, fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 },
    });
    const solved = [...values, 100].map(value => {
      expect(modelStore.updateLoad(loadId, { fy: -value, fz: -value })).toBe(true);
      return solveModel();
    });
    for (const mode of [0, 1]) {
      const cases = new Map(solved.map((results, i) => [i + 1, results[mode]!]));
      const ids = values.map((_, i) => i + 1);
      const selected = ids.map(id => cases.get(id)!);
      const factors = ids.map(caseId => [{ caseId, factor: 1 }]);
      const envelopes = [
        computeEnvelope3D(selected),
        combineResultsEnvelope3D(factors, cases, new Map()).envelope,
        envelopeOver(new Map(), [], cases, ids),
      ];
      for (const envelope of envelopes) {
        expect(envelope).not.toBeNull();
        const result = envelope!.maxAbsResults3D;
        for (const component of ['Vy', 'Vz'] as const) {
          const rows = buildQueryRows(result.elementForces, component, { envelope: envelope! });
          for (const end of ['i', 'j'] as const) {
            const at = rows.filter(row => row.end === end);
            expect.soft(extremeRow(at, 'min')?.value).toBeCloseTo(min, 12);
            expect.soft(extremeRow(at, 'max')?.value).toBeCloseTo(max, 12);
            expect.soft(extremeRow(at, 'absmax')?.value).toBeCloseTo(absmax, 12);
            const expectValues = (actual: typeof at, expected: number[]) => {
              expect.soft(actual).toHaveLength(expected.length);
              expected.sort((a, b) => b - a).forEach((value, index) => {
                expect.soft(actual[index]?.value).toBeCloseTo(value, 12);
              });
            };
            expectValues(at, [...values]);
            const boundary = Math.abs(buildQueryRows(selected[values.findIndex(value => Math.abs(value) === 10)]!.elementForces, component)
              .find(row => row.end === end)!.value);
            expectValues(filterByAbsThreshold(at, boundary), values.filter(value => Math.abs(value) >= 10));
            expectValues(filterByAbsThreshold(at, boundary + 1), values.filter(value => Math.abs(value) >= 11));
          }
        }
      }
    }
  });

  const tipLoad = 10;
  function expectSignedEndTable(envelope: NonNullable<ReturnType<typeof computeEnvelope3D>>, min: number, max: number) {
    const aggregate = { id: 3, name: 'Envelope', results: envelope.maxAbsResults3D };
    const rows = envelopeRows('forces', [aggregate], canonical);
    expect(rows.map(row => row.end)).toEqual(['i', 'j']);
    for (const row of rows) {
      expect(row.min[2]?.value).toBeCloseTo(min, 12);
      expect(row.max[2]?.value).toBeCloseTo(max, 12);
    }
  }

  function expectFactoredTipShears(envelope: NonNullable<ReturnType<typeof computeEnvelope3D>>) {
    expectSignedEndTable(envelope, tipLoad, 2 * tipLoad);
    const rows = buildQueryRows(envelope.maxAbsResults3D.elementForces, 'Vz', { envelope });
    for (const end of ['i', 'j']) {
      const at = rows.filter(row => row.end === end);
      expect(at).toHaveLength(2);
      expect.soft(extremeRow(at, 'min')?.value, 'Cantilever shear equals the factored downward tip load').toBeCloseTo(tipLoad, 12);
      expect.soft(extremeRow(at, 'max')?.value).toBeCloseTo(2 * tipLoad, 12);
    }
  }

  it.each(['prepared', 'constrained'] as const)(
    'known wrong result: #2581 $0 WASM multi-case envelope keeps the signed combination minimum',
    mode => {
      const input = buildSolverInput3D(modelStore.model, false, false)!;
      if (mode === 'constrained') {
        const root = [...input.supports.values()][0]!.nodeId;
        input.constraints = [{ type: 'equalDOF', masterNode: root, slaveNode: tip, dofs: [1] }];
      }
      const tipForce = (fz: number): SolverLoad3D => ({
        type: 'nodal', data: { nodeId: tip, fx: 0, fy: 0, fz, mx: 0, my: 0, mz: 0 },
      });
      const result = solveMultiCase3D({
        solver: mode === 'prepared' ? input : input3DToWireObject(input),
        loadCases: [
          { name: 'tip', loads: [tipForce(-tipLoad)] },
          { name: 'unused', loads: [tipForce(-10 * tipLoad)] },
        ],
        combinations: [{ name: 'one', factors: { tip: 1 } }, { name: 'two', factors: { tip: 2 } }],
      });
      expect(result.combinationResults).toHaveLength(2);
      expect(result.caseResults).toHaveLength(2);
      expectFactoredTipShears(result.envelope);
    },
  );

  it.each([
    ['synchronous', solveCombinations3D],
    ['asynchronous', solveCombinations3DParallel],
  ] as const)('known wrong result: #2581 %s spatial combination solve publishes signed end queries', async (_mode, run) => {
    const loadCase = modelStore.addLoadCase('Tip', 'L');
    modelStore.addLoadEntry({
      type: 'nodal3d', data: { id: 1, nodeId: tip, fx: 0, fy: 0, fz: -tipLoad, mx: 0, my: 0, mz: 0, caseId: loadCase },
    });
    const one = modelStore.addCombination('one', [{ caseId: loadCase, factor: 1 }]);
    const two = modelStore.addCombination('two', [{ caseId: loadCase, factor: 2 }]);
    const combinations = modelStore.combinations.filter(combination => combination.id === one || combination.id === two);
    const result = await run(modelStore.model, modelStore.loadCases, combinations);
    if (!result || typeof result === 'string') throw new Error(String(result));
    expectFactoredTipShears(result.envelope);
  });

  it('keeps the case ends when publishing or viewing a variable-member envelope', () => {
    const rect = (h: number) => {
      const params = { b: 0.2, h };
      const props = computeSectionProperties('concrete-rect', params)!;
      return modelStore.addSection({
        ...props, name: `R${h}`, shape: 'rect', rotation: 0, built: { shapeType: 'concrete-rect', params },
      });
    };
    modelStore.updateElement(elementId, { sectionId: rect(0.6), variableSection: { sectionJ: rect(0.3), segments: 2 } });
    const loadId = modelStore.addLoadEntry({
      type: 'nodal3d', data: { id: 1, nodeId: tip, fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 },
    });
    const values = [10, 20];
    const cases = new Map(values.map((value, index) => {
      expect(modelStore.updateLoad(loadId, { fz: -value })).toBe(true);
      const model = expandVariableMembers(modelStore.model);
      return [index + 1, solve3D(buildSolverInput3D(model, false, false)!)];
    }));
    const factors = [...cases.keys()].map(caseId => [{ caseId, factor: 1 }]);
    const { envelope } = combineResultsEnvelope3D(factors, cases, new Map());
    expect(envelope?.maxAbsResults3D.elementForces).toHaveLength(2);
    resultsStore.setCombinationResults3D(cases, cases, envelope!);
    resultsStore.activeView = 'envelope';

    const checkEnds = () => {
      const active = resultsStore.fullEnvelope3D!;
      expect(active.maxAbsResults3D.elementForces.map(force => force.elementId)).toEqual([elementId]);
      expectSignedEndTable(active, values[0]!, values[1]!);
      const rows = buildQueryRows(resultsStore.results3D!.elementForces, 'Vz', { envelope: active });
      for (const end of ['i', 'j']) {
        const at = rows.filter(row => row.end === end);
        expect(at).toHaveLength(2);
        expect(extremeRow(at, 'min')?.value).toBeCloseTo(values[0]!, 12);
        expect(extremeRow(at, 'max')?.value).toBeCloseTo(values[1]!, 12);
      }
    };
    checkEnds();
    const input = buildSolverInput3D(expandVariableMembers(modelStore.model), false, false)!;
    const nonlinear = values.map(value => {
      const loads = input.loads.map(load => load.type === 'nodal' && load.data.nodeId === tip
        ? { ...load, data: { ...load.data, fz: -value } } : load);
      const result = solvePDelta3D({ ...input, loads });
      expect(result.converged).toBe(true);
      return collapseVariableResults(result.results, variableExpansionFor(modelStore.model));
    });
    for (const collapsed of [[...resultsStore.perCase3D.values()], nonlinear]) {
      const direct = computeEnvelope3D(collapsed)!;
      expectSignedEndTable(direct, values[0]!, values[1]!);
      const member = direct.maxAbsResults3D.elementForces[0]!;
      expect(member.pieces).toHaveLength(2);
      for (const end of memberEndForces3D(member, 'shearZ')) expect(end).toBeCloseTo(values[1]!, 12);
      expect(() => requireConcurrentSectionForces(member)).toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
    }
    const viewed = envelopeOver(new Map(), [], resultsStore.perCase3D, [...cases.keys()]);
    expect(viewed).not.toBeNull();
    resultsStore.viewEnvelope3D(viewed, 'Variable member cases');
    checkEnds();
  });

  it.each([0, POINT_END_TOL / 2, length / 4, 3 * length / 4, length - POINT_END_TOL / 2, length])(
    'selects the member side of bending couples and torque applied at %s m',
    a => {
      const moments = [12, 16, 20] as const;
      modelStore.addLoadEntry({
        type: 'pointOnElement3d',
        data: { id: 1, elementId, a, py: 0, pz: 0, mx: moments[0], my: moments[1], mz: moments[2] },
      });
      const atI = a <= POINT_END_TOL, atJ = a >= length - POINT_END_TOL;
      for (const results of solveModel()) {
        const member = results.elementForces.find(f => f.elementId === elementId)!;
        expect.soft(member.pieces?.length ?? 0).toBe(atI || atJ ? 0 : 2);
        const ends = rowsOf('forces', results, canonical);
        for (const [column, kind, component] of [[3, 'torsion', 'T'], [4, 'momentY', 'My'], [5, 'momentZ', 'Mz']] as const) {
          const applied = moments[column - 3]!;
          const range = memberForceExtrema(member, kind);
          expect.soft(range.kind).toBe('exact');
          if (range.kind !== 'exact') throw new Error('Member extrema unavailable');
          expect.soft(range.min.value).toBeCloseTo(atI ? 0 : -applied, 10);
          expect.soft(range.min.x).toBeGreaterThanOrEqual(0);
          expect.soft(range.min.x).toBeLessThanOrEqual(atI || atJ ? length : a);
          expect.soft(evaluateDiagramAt(member, kind, range.min)).toBeCloseTo(atI ? 0 : -applied, 10);
          expect.soft(computeGlobalMax3D([member], kind)).toBeCloseTo(atI ? 0 : applied, 10);

          const query = buildQueryRows([member], component);
          const expected = [atI ? 0 : -applied, atJ ? -applied : 0];
          for (const [i, end] of ['i', 'j'].entries()) {
            expect.soft(memberEndForces3D(member, kind)[i]).toBeCloseTo(expected[i]!, 10);
            expect.soft(query.find(row => row.end === end)?.value).toBeCloseTo(expected[i]!, 10);
            expect.soft(ends.find(row => row.end === end)?.values[column]).toBeCloseTo(expected[i]!, 10);
          }
          if (!atI && !atJ) {
            expect.soft(evaluateDiagramAt(member, kind, a / length, false)).toBeCloseTo(-applied, 10);
            expect.soft(evaluateDiagramAt(member, kind, a / length, true)).toBeCloseTo(0, 10);
          }
        }
      }
    },
  );
});

it('known wrong result: #2581 converge a force envelope requires the same members in every combination', () => {
  const member = (elementId: number, n: number): ElementForces3D => ({
    ...reviewForces, elementId, length: 4, nStart: n, nEnd: n, vzStart: 0,
  });
  const a: Source = { ...A, results: { ...A.results, elementForces: [member(7, 100), member(8, 20)] } };
  const b: Source = { ...B, results: { ...B.results, elementForces: [member(8, 30), member(7, 200)] } };
  const incomplete = { ...b, results: { ...b.results, elementForces: [b.results.elementForces[0]!] } };
  const sheet = (sources: Source[], stations: 2 | 3 | 'critical') => resultSheets({
    sources: sources.map(source => ({ ...source, kind: 'combination' })), stations, statics: null,
  }, name => name === 'Envelope')[0]!;
  const report = (sources: Source[]) => envelopeSectionHtml(sources, key => key, 'Envelope');
  expect.soft(() => report([a, incomplete])).toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
  expect(report([a, b]).join('')).toContain('data-printed="envelope-forces"');
  for (const stations of [2, 3, 'critical'] as const) {
    const opts = { ...canonical, stations, resultant: true };
    for (const sources of [[a, incomplete], [incomplete, a]]) {
      expect.soft(() => envelopeRows('forces', sources, opts)).toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
      expect.soft(() => envelopeRows('forces', sources, { ...opts, entities: new Set([7]) })).toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
      const selected = envelopeRows('forces', sources, { ...opts, entities: new Set([8]) });
      expect(selected.map(row => [row.entity, row.min[0]?.value, row.max[0]?.value]))
        .toEqual(Array.from({ length: stations === 'critical' ? 5 : stations }, () => [8, 20, 30]));
    }
    expect.soft(() => sheet([a, incomplete], stations)).toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
    expect(sheet([a, b], stations).rows.some(row => row[0] === 'forces' && row[1] === 7)).toBe(true);
    const duplicate = { ...b, results: { ...b.results, elementForces: [b.results.elementForces[1]!, ...b.results.elementForces] } };
    expect.soft(() => envelopeRows('forces', [a, duplicate], opts)).toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
    const complete = envelopeRows('forces', [a, b], opts).filter(row => row.entity === 7);
    expect(complete.map(row => [row.min[0]?.value, row.max[0]?.value]))
      .toEqual(Array.from({ length: stations === 'critical' ? 5 : stations }, () => [100, 200]));
  }
});


it('known wrong result: #2581 converge end resultants never combine independent envelope winners', async () => {
  await initSolver();
  const y = reviewSources({ ...reviewForces, vyStart: 3, vyEnd: 3, vzStart: 0, vzEnd: 0 })[0]!;
  const z = { ...B, results: reviewSources({ ...reviewForces, vzStart: 4, vzEnd: 4 })[0]!.results };
  const envelope = { ...A, results: computeEnvelope3D([y.results, z.results])!.maxAbsResults3D };
  const opts = { ...canonical, resultant: true };
  expect(rowsOf('forces', envelope.results, canonical).map(row => row.values.slice(1, 3))).toEqual([[3, 4], [3, 4]]);
  expect(rowsOf('forces', y.results, opts).map(row => row.values[6])).toEqual([3, 3]);
  expect(envelopeRows('forces', [y, z], opts).map(row => row.max[6]?.value)).toEqual([4, 4]);
  expect.soft(() => rowsOf('forces', envelope.results, opts)).toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
  expect.soft(() => allRows('forces', [envelope], opts)).toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
  expect.soft(() => summaryRows('forces', [envelope], opts)).toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
  expect.soft(() => envelopeRows('forces', [envelope], opts)).toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
});

it.each([1, -1])('known wrong result: #2581 converge critical envelope summaries report attained signed extrema (%s)', async sign => {
  await initSolver();
  const sources = [10, 20].map((v, i) => ({
    ...[A, B][i]!,
    results: reviewSources({ ...reviewForces, nStart: sign * v, nEnd: sign * v, vzStart: 0, vzEnd: 0 })[0]!.results,
  }));
  const envelope = computeEnvelope3D(sources.map(source => source.results))!;
  const aggregate = { id: 3, name: 'Envelope', results: envelope.maxAbsResults3D };
  const opts = { ...canonical, stations: 'critical' } as const;
  const axial = (sets: Source[]) => summaryRows('forces', sets, opts).find(row => row.column.key === 'n')!;
  const [min, max] = (sign > 0 ? [10, 20] : [-20, -10]);
  expect.soft(axial([aggregate])).toMatchObject({ min: { value: min }, max: { value: max } });
  expect.soft(axial([aggregate, ...sources])).toEqual(axial(sources));
  expect.soft(axial([sources[0]!])).toMatchObject({
    min: { value: sign * 10, source: sources[0] }, max: { value: sign * 10, source: sources[0] },
  });
  const detached = bindMemberEnvelopeEnds(structuredClone(envelope));
  expect.soft(() => axial([{ ...aggregate, results: detached.maxAbsResults3D }])).toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
});

it('known wrong result: #2581 converge spatial WASM envelope paths share their finalizer', () => {
  const source = readFileSync(new URL('../wasm-solver.ts', import.meta.url), 'utf8');
  const compute = source.slice(source.indexOf('export function computeEnvelope3D('), source.indexOf('export function computeInfluenceLineWasm('));
  expect(compute.match(/return bindSpatialEnvelope\(/g)).toHaveLength(2);
  expect(compute).not.toContain('bindEnvelopeQuerySources');
});


it('known wrong result: #2581 signed force readers never access bound display forces', async () => {
  await initSolver();
  const cases = [-80, 30].map((n, i) => ({
    ...[A, B][i]!, results: reviewSources({ ...reviewForces, nStart: n, nEnd: n })[0]!.results,
  }));
  const envelope = computeEnvelope3D(cases.map(source => source.results))!;
  const results = envelope.maxAbsResults3D;
  const displayRead = () => { throw new Error('Signed reader accessed envelope display ordinates'); };
  for (const member of results.elementForces) {
    for (const field of Object.keys(member).filter(key => /^(n|v[yz]|m[xyz])(Start|End)$/.test(key))) {
      Object.defineProperty(member, field, { get: displayRead });
    }
  }
  for (const curve of [envelope.axial, envelope.shearY, envelope.shearZ, envelope.torsion, envelope.momentY, envelope.momentZ]) {
    for (const member of curve.elements) {
      Object.defineProperties(member, { posValues: { get: displayRead }, negValues: { get: displayRead } });
    }
  }
  const aggregate = { id: 3, name: 'Envelope', results };
  const forces = results.elementForces;
  const expected = [30, -80, 30, -80];
  expect.soft(() => componentEnds(forces[0]!, 'N')).toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
  expect.soft(buildQueryRows(forces, 'N').map(row => row.value)).toEqual(expected);
  expect.soft(buildQueryRows(forces, 'N', { envelope }).map(row => row.value)).toEqual(expected);
  for (const stations of [2, 5, 'critical'] as const) {
    const opts = { ...canonical, signedOnly: true, stations };
    expect.soft(summaryRows('forces', [aggregate], opts)[0]).toMatchObject({ min: { value: -80 }, max: { value: 30 } });
    expect.soft(envelopeRows('forces', [aggregate, ...cases], opts)).toEqual(envelopeRows('forces', cases, opts));
    expect.soft(rowsOf('forces', results, opts)).toEqual(cases.flatMap(source => rowsOf('forces', source.results, opts)));
    expect.soft(allRows('forces', [aggregate, ...cases], opts)).toEqual(allRows('forces', cases, opts));
    const workbook = resultSheets({
      sources: [{ ...aggregate, kind: 'envelope' }], stations, statics: null,
    }, name => name === 'Maxima' || name === 'Envelope');
    const axial = (name: string, index: number) => workbook.find(sheet => sheet.name === name)!.rows
      .filter(row => row[0] === 'forces' && row[index] === 'N');
    expect.soft(axial('Maxima', 1).map(row => [row[3], row[4]])).toEqual([['max', 30], ['min', -80]]);
    expect.soft(axial('Envelope', 4).map(row => [row[6], row[9]]))
      .toEqual(Array.from({ length: rowsOf('forces', cases[0]!.results, opts).length }, () => [30, -80]));
  }
});


it('known wrong result: #2581 signed bound reads require one matching physical member per case', async () => {
  await initSolver();
  const valid = reviewSources(reviewForces)[0]!.results;
  const member = valid.elementForces[0]!;
  const malformed = [
    [],
    [{ ...member, length: member.length * 2 }],
    [member, member],
    [{ ...member, combined: { method: 'abs' as const, parts: [member] } }],
  ];
  const opts = { ...canonical, signedOnly: true };
  for (const elementForces of malformed) {
    const envelope = computeEnvelope3D([valid])!;
    bindSpatialEnvelope(envelope, [valid, { ...valid, elementForces }]);
    const results = envelope.maxAbsResults3D;
    const source = { ...A, results };
    expect.soft(() => buildQueryRows(results.elementForces, 'N')).toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
    expect.soft(() => buildQueryRows(results.elementForces, 'N', { envelope })).toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
    expect.soft(() => summaryRows('forces', [source], opts)).toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
    expect.soft(() => envelopeRows('forces', [source], opts)).toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
    expect.soft(() => rowsOf('forces', results, opts)).toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
  }
  const envelope = computeEnvelope3D([valid])!;
  expect(buildQueryRows(envelope.maxAbsResults3D.elementForces, 'N')).toEqual(buildQueryRows(valid.elementForces, 'N'));
});
