/**
 * The report's internal-force tables: each member's ends and the largest value along it, with
 * where it is — for one load state, for the envelope, in 2D and in 3D — and the figure numbers.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { generateCalcReportHtml, DEFAULT_REPORT_CONTENT, type CalcReportData, type CalcReportContent } from '../calc-report';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import '../../store/index';
import { computeEnvelope, computeEnvelope3D, initSolver } from '../wasm-solver';
import type { AnalysisResults, ElementForces } from '../types';
import type { AnalysisResults3D, ElementForces3D } from '../types-3d';

type Kind = 'moment' | 'shear' | 'axial';

/** Only the one force table asked for: nothing else in the report has rows to confuse it with. */
function onlyTable(kind: Kind): CalcReportContent {
  const c = structuredClone(DEFAULT_REPORT_CONTENT);
  c.modelData = false; c.loads = false; c.kinematics = false; c.despiece = false;
  for (const r of Object.keys(c.rows) as Array<keyof typeof c.rows>) c.rows[r] = { table: false, diagram: false };
  c.rows[kind] = { table: true, diagram: false };
  return c;
}

function report(kind: Kind, patch: Partial<CalcReportData>): string {
  return generateCalcReportHtml({
    config: { projectName: 'P', engineerName: '', companyName: '', date: '1 Jan 2026', notes: '' },
    is3D: false, analysisMode: '2D', provenance: { kind: 'single' }, hasDesignChecks: false,
    nodes: [], elements: [], materials: [], sections: [], supports: [], loads: [], loadCases: [], combinations: [],
    content: onlyTable(kind),
    ...patch,
  });
}

/** The force section's rows, each as its cells' text. */
function rows(html: string): string[][] {
  const sec = html.slice(html.indexOf('id="sec-forces"'));
  return [...sec.matchAll(/<tr>(.*?)<\/tr>/g)]
    .map((m) => [...m[1]!.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((c) => c[1]!.replace(/<[^>]+>/g, '')))
    .filter((r) => r.length > 0);
}
const num = (s: string) => Number(s.replace('−', '-').replace(/[^\d.eE+-]/g, ''));

const ef2D = (f: Partial<ElementForces>): ElementForces => ({
  elementId: 1, length: 4, nStart: 0, nEnd: 0, vStart: 0, vEnd: 0, mStart: 0, mEnd: 0, qI: 0, qJ: 0,
  pointLoads: [], distributedLoads: [], hingeStart: false, hingeEnd: false, ...f,
} as ElementForces);
const r2D = (f: ElementForces): AnalysisResults => ({ displacements: [], reactions: [], elementForces: [f] });

const ef3D = (f: Partial<ElementForces3D>): ElementForces3D => ({
  elementId: 1, length: 6, nStart: 0, nEnd: 0, vyStart: 0, vyEnd: 0, vzStart: 0, vzEnd: 0, mxStart: 0, mxEnd: 0,
  myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0,
  releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false,
  qYI: 0, qYJ: 0, distributedLoadsY: [], pointLoadsY: [], qZI: 0, qZJ: 0, distributedLoadsZ: [], pointLoadsZ: [], ...f,
});
const r3D = (f: ElementForces3D): AnalysisResults3D => ({ displacements: [], reactions: [], elementForces: [f] } as unknown as AnalysisResults3D);

describe('the largest along a member is the closed form, where the shear is zero', () => {
  it('a triangular load 0 → 10 on a 6 m simple span: qL²/(9√3) at L/√3', () => {
    // R_A = qL/6 = 10; M(x) = 10x − x³/3.6, largest at x = √36/√3 = 3.464.
    const f = ef2D({ length: 6, vStart: 10, vEnd: -20, qJ: -10, distributedLoads: [{ qI: 0, qJ: -10, a: 0, b: 6 }] });
    const [row] = rows(report('moment', { results2D: r2D(f) }));
    expect(row![3]).toBe('23.09');
    expect(row![4]).toBe('3.46');
  });

  it('a uniform load and a point load on a 4 m simple span: R_A²/2w where the shear is zero', () => {
    // w = 12, P = 8 at 3 m: R_A = 24 + 2 = 26, zero shear at 26/12 = 2.167 m, M = 26²/24 = 28.167.
    const f = ef2D({ vStart: 26, vEnd: -30, qI: -12, qJ: -12, distributedLoads: [{ qI: -12, qJ: -12, a: 0, b: 4 }], pointLoads: [{ a: 3, p: -8 }] });
    const [row] = rows(report('moment', { results2D: r2D(f) }));
    expect(row![3]).toBe('28.17');
    expect(row![4]).toBe('2.17');
  });

  it('in 3D too: the triangular load across local z, My = 23.09 at 3.46', () => {
    const f = ef3D({ vzStart: 10, distributedLoadsZ: [{ qI: 0, qJ: -10, a: 0, b: 6 }] });
    const html = report('moment', { is3D: true, analysisMode: '3D', results3D: r3D(f) });
    expect(rows(html).find((r) => r[0] === 'Max |value|' || r[1] === 'Max |value|')!.join(' ')).toMatch(/23\.09 \(x = 3\.46 m\)/);
  });
});

describe('solved', () => {
  beforeAll(async () => { await initSolver(); });
  afterEach(() => { uiStore.analysisMode = '2d'; });

  it('3D: a 6 m simple span under qz = 10 gives My = qL²/8 = 45 at 3.00, not only its ends', () => {
    uiStore.analysisMode = '3d';
    modelStore.clear();
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'pinned3d');
    modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { tx: false, ty: true, tz: true, rx: true, ry: false, rz: false } });
    modelStore.addDistributedLoad3D(e, 0, 0, -10, -10);
    const r = modelStore.solve3D(false, false, false);
    if (!r || typeof r === 'string') throw new Error(String(r));
    const html = report('moment', { is3D: true, analysisMode: '3D', results3D: r });
    const max = rows(html).find((x) => x.includes('Max |value|'))!;
    // My, then Mz and Mx: zero along the member.
    expect(max.join(' ')).toMatch(/45\.00 \(x = 3\.00 m\)/);
  });

  /** A 4 m simple span under D = 10 and L = 10 kN/m, with 1.4D and 1.2D + 1.6L. */
  function envelope2D() {
    uiStore.analysisMode = '2d';
    modelStore.clear();
    for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'pinned');
    modelStore.addSupport(b, 'rollerX');
    const d = modelStore.addLoadCase('Dead', 'D'), l = modelStore.addLoadCase('Live', 'L');
    modelStore.addDistributedLoad(e, -10, -10, undefined, undefined, d);
    modelStore.addDistributedLoad(e, -10, -10, undefined, undefined, l);
    modelStore.addCombination('1.4D', [{ caseId: d, factor: 1.4 }]);
    modelStore.addCombination('1.2D+1.6L', [{ caseId: d, factor: 1.2 }, { caseId: l, factor: 1.6 }]);
    const r = modelStore.solveCombinations(false);
    if (!r || typeof r === 'string') throw new Error(String(r));
    return r.envelope;
  }

  it('the envelope\'s moment is 0 at the supports and 28·4²/8 = 56 at 2.00, not the first combination\'s loads on the largest ends', () => {
    const env = envelope2D();
    const [row] = rows(report('moment', { provenance: { kind: 'envelope' }, results2D: env.maxAbsResults, envelope2D: env }));
    expect(Math.abs(num(row![1]!))).toBeLessThan(0.005);
    expect(Math.abs(num(row![2]!))).toBeLessThan(0.005);
    expect(row![3]).toBe('56.00');
    expect(row![4]).toBe('2.00');
  });

  it('the envelope\'s shear is ±qL/2 = 56 at the two ends', () => {
    const env = envelope2D();
    const [row] = rows(report('shear', { provenance: { kind: 'envelope' }, results2D: env.maxAbsResults, envelope2D: env }));
    expect(Math.abs(num(row![1]!))).toBeCloseTo(56, 2);
    expect(num(row![2]!)).toBeCloseTo(-num(row![1]!), 2);
    expect(Math.abs(num(row![3]!))).toBeCloseTo(56, 2);
  });

  it('3D envelope: 1.0D and 1.4D on a 6 m span give 1.4·10·6²/8 = 63 at 3.00', () => {
    uiStore.analysisMode = 'pro';
    modelStore.clear();
    for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'pinned3d');
    modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { tx: false, ty: true, tz: true, rx: true, ry: false, rz: false } });
    const d = modelStore.addLoadCase('Report dead', 'D');
    modelStore.addDistributedLoad3D(e, 0, 0, -10, -10, undefined, undefined, d);
    modelStore.addCombination('1.0D', [{ caseId: d, factor: 1 }]);
    modelStore.addCombination('1.4D', [{ caseId: d, factor: 1.4 }]);
    const r = modelStore.solveCombinations3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    const html = report('moment', { is3D: true, analysisMode: '3D', provenance: { kind: 'envelope' }, results3D: r.envelope.maxAbsResults3D, envelope3D: r.envelope });
    expect(rows(html).find((x) => x.includes('Max |value|'))!.join(' ')).toMatch(/63\.00 \(x = 3\.00 m\)/);
  });
});

describe('figure numbers', () => {
  const beam = {
    nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 4, y: 0 }] as never,
    elements: [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }] as never,
  };
  const withMoment = () => {
    const c = structuredClone(DEFAULT_REPORT_CONTENT);
    return { content: c, figures: [{ content: 'moment' as const, title: 'Bending moment M', svg: '<svg id="m"></svg>' }] };
  };

  it('the model is Figure 1 and the next is Figure 2', () => {
    const html = report('moment', { ...beam, results2D: r2D(ef2D({})), ...withMoment() });
    expect(html).toMatch(/<figcaption>Figure 1\. The model/);
    expect(html).toContain('Figure 2. Bending moment M');
  });

  it('without a model figure to draw, the first figure is Figure 1', () => {
    const html = report('moment', { results2D: r2D(ef2D({})), ...withMoment() });
    expect(html).not.toContain('The model with the node');
    expect(html).toContain('Figure 1. Bending moment M');
  });
});

it('known wrong result: #2226 reports a shear peak inside a short partial-load interval in both dimensions', () => {
  const a = 0.5, b = a + 2 ** -27, q = 2 ** 29;
  const loads = [{ a, b, qI: q, qJ: -q }];
  const [planar] = rows(report('shear', { results2D: r2D(ef2D({ distributedLoads: loads })) }));
  expect.soft(planar?.slice(3)).toEqual(['1.00', '0.50']);
  const spatial = rows(report('shear', {
    is3D: true, analysisMode: '3D', results3D: r3D(ef3D({ distributedLoadsZ: loads })),
  }));
  expect.soft(spatial.find(row => row.includes('Max |value|'))?.[2]).toBe('1.00 (x = 0.50 m)');
});

it('known wrong result: #2226 identifies both governing cut faces in planar and spatial force tables', () => {
  for (const [length, a, label] of [[1, 0.5, '0.50'], [3, 1.72, '1.72']] as const) {
    for (const [jump, value, side] of [[11, 6, '⁺'], [1, -5, '⁻']] as const) {
      const before = -1 / a, after = (5 - jump) / (length - a);
      const distributed = [{ a: 0, b: a, qI: before, qJ: before }, { a, b: length, qI: after, qJ: after }];
      const planar = r2D(ef2D({ length, vStart: -4, pointLoads: [{ a, p: jump }], distributedLoads: distributed }));
      const spatial = r3D(ef3D({ length, vzStart: -4, pointLoadsZ: [{ a, p: jump }], distributedLoadsZ: distributed }));
      const env2D = computeEnvelope([planar])!;
      const env3D = computeEnvelope3D([spatial])!;
      const old2D = structuredClone(env2D), old3D = structuredClone(env3D);
      delete old2D.shear.elements[0]!.jumpCuts;
      delete old3D.shearZ.elements[0]!.jumpCuts;
      for (const envelope2D of [undefined, env2D, ...(length === 1 ? [old2D] : [])]) {
        const [row] = rows(report('shear', { provenance: { kind: envelope2D ? 'envelope' : 'single' }, results2D: planar, envelope2D }));
        expect.soft(num(row![3]!)).toBe(value);
        expect.soft(row![4]).toBe(label + side);
      }
      for (const envelope3D of [undefined, env3D, ...(length === 1 ? [old3D] : [])]) {
        const html = report('shear', {
          provenance: { kind: envelope3D ? 'envelope' : 'single' }, is3D: true, analysisMode: '3D', results3D: spatial, envelope3D,
        });
        expect.soft(rows(html).at(-1)?.at(-1)).toBe(value.toFixed(2) + ' (x = ' + label + side + ' m)');
      }
    }
  }
});

it('known wrong result: #2226 refuses envelope cuts that share a rounded parent station', () => {
  const boundary = { ux: 0, uy: 0, uz: 0, rx: 0, ry: 0, rz: 0 };
  const [dI, dM, dJ] = [1, 2, 3].map(nodeId => ({ ...boundary, nodeId }));
  const build = (a: number) => r3D(ef3D({
    elementId: 7, length: 2,
    pieces: [
      { x0: 0, x1: 1, sectionId: 1, dI, dJ: dM, forces: ef3D({ elementId: 8, length: 1 }) },
      { x0: 1, x1: 2, sectionId: 1, dI: dM, dJ, forces: ef3D({
        elementId: 9, length: 1, vzEnd: 2, pointLoadsZ: [{ a, p: 1 }, { a: 0.25, p: 1 }],
      }) },
    ],
  }));
  const clear = build(0.25 - 2 ** -52);
  const envelope3D = computeEnvelope3D([clear])!;
  expect(report('shear', {
    is3D: true, analysisMode: '3D', results3D: clear, envelope3D, provenance: { kind: 'envelope' },
  })).toContain('1.25⁺');
  expect(() => computeEnvelope3D([build(0.25 - 2 ** -55)])).toThrow('solver.diagramExtremaUnavailable');
  const coincident = computeEnvelope3D([build(0.25)])!;
  expect(coincident.shearZ.elements[0]?.jumpCuts).toEqual([expect.objectContaining({ distance: 1.25 })]);
});

it('known wrong result: #2226 uses inward endpoint faces for planar and spatial report peaks', () => {
  const length = 4;
  for (const { start, end, atI, atJ, expected, gradient = 0, peakAt = 0 } of [
    { start: 10, end: 20, atI: -5, atJ: 15, expected: 5 },
    { start: -10, end: -20, atI: 5, atJ: -15, expected: -5 },
    { start: 5, end: 20, atI: 0, atJ: 15, expected: 5 },
    { start: 5, end: 24, atI: 0, atJ: 15, expected: 9, gradient: 1, peakAt: length },
    { start: 10, end: 10, atI: 0, atJ: 0, expected: 10 },
  ]) {
    const points = [{ a: 0, p: atI }, { a: length, p: atJ }].filter(load => load.p !== 0);
    const distributed = gradient === 0 ? [] : [{ a: 0, b: length, qI: gradient, qJ: gradient }];
    const planar = r2D(ef2D({ length, vStart: start, vEnd: end, pointLoads: points, distributedLoads: distributed }));
    const spatial = r3D(ef3D({ length, vzStart: start, vzEnd: end, pointLoadsZ: points, distributedLoadsZ: distributed }));
    const envelope2D = computeEnvelope([planar])!;
    const envelope3D = computeEnvelope3D([spatial])!;
    const legacy2D = structuredClone(envelope2D);
    const legacy3D = structuredClone(envelope3D);
    delete legacy2D.shear.elements[0]!.jumpCuts;
    delete legacy3D.shearZ.elements[0]!.jumpCuts;
    for (const env of [undefined, envelope2D, legacy2D]) {
      const [row] = rows(report('shear', {
        provenance: { kind: env ? 'envelope' : 'single' }, results2D: planar, envelope2D: env,
      }));
      expect.soft(num(row![3]!)).toBe(expected);
      expect.soft(num(row![4]!)).toBe(peakAt);
    }
    for (const env of [undefined, envelope3D, legacy3D]) {
      const spatialRows = rows(report('shear', {
        provenance: { kind: env ? 'envelope' : 'single' },
        is3D: true, analysisMode: '3D', results3D: spatial, envelope3D: env,
      }));
      const [value, x] = spatialRows.at(-1)!.at(-1)!.split(' (x = ');
      expect.soft(num(value!)).toBe(expected);
      expect.soft(num(x!)).toBe(peakAt);
    }
  }
});

it('known wrong result: #2226 reads planar envelope end cells from the same inward faces as the peak', () => {
  const length = 4;
  for (const [atI, atJ] of [[20, 0], [0, -20], [20, -20], [0, 0]] as const) {
    const planar = r2D(ef2D({
      length, vStart: 4 - atI, vEnd: 8 + atJ,
      pointLoads: [{ a: 0, p: atI }, { a: length, p: atJ }].filter(load => load.p !== 0),
      distributedLoads: [{ a: 0, b: length, qI: 1, qJ: 1 }],
    }));
    const envelope2D = computeEnvelope([planar])!;
    if (atJ !== 0) {
      const diagram = envelope2D.shear.elements[0]!;
      diagram.jumpCuts ??= [];
      diagram.jumpCuts.push({ index: diagram.tPositions.length - 1, distance: length });
      diagram.tPositions.push(1);
      diagram.posValues.push(0);
      diagram.negValues.push(8 + atJ);
    }
    const legacy = structuredClone(envelope2D);
    delete legacy.shear.elements[0]!.jumpCuts;
    for (const envelope of [envelope2D, legacy]) {
      const [row] = rows(report('shear', {
        provenance: { kind: 'envelope' }, results2D: envelope.maxAbsResults, envelope2D: envelope,
      }));
      expect.soft(row?.slice(1).map(num), `I action ${atI}, J action ${atJ}`).toEqual([4, 8, 8, length]);
    }
  }
});
