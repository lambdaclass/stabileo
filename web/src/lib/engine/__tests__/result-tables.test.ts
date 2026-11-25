/**
 * The across-combination tables: every value comes from a result set, with where and under what.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { summaryRows, envelopeRows, allRows, maxByType, rowsOf, toCsv, columnsOf, whereOf, type Source } from '../result-tables';
import { magnitudeCombination } from '../combination-methods';
import { memberCriticalOrdinates3D } from '../diagrams-3d';
import { criticalForceStations, extractForcesAtStation } from '../station-forces';
import { envelopeMembers, pruneScopes } from '../result-scopes';
import { DEFAULT_AXES } from '../../axes/frame';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import '../../store/index';
import { initSolver } from '../wasm-solver';
import { publishCombinations3D, activePerCombo3D, activeCombinations } from '../../store/active-results';
import { computeStationDemands } from '../verification-service';
import { combinationPeakRows } from '../../export/excel';
import { resultSheets } from '../../export/workbook-results';
import { envelopeSectionHtml } from '../report/project-sections';
import { DIAGRAM_EXTREMA_UNAVAILABLE } from '../member-diagram';
import type { AnalysisResults3D, ElementForces3D } from '../types-3d';

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
  const combined: ElementForces3D = { ...f, combined: { method: 'abs', parts: [f, { ...f, vyStart: -1 }] } };
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
      { t: x / forces.length, x, value: Math.hypot(1, 4) },
      { t: x / forces.length, x, value: 1, right: true },
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
  expect(() => summaryRows('forces', [{ ...A, results: abs }], options)).toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
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
