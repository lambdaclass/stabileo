import { analyzeSectionStress, resolveSectionGeometryLegacy } from '../section-stress';
import { ConcurrentDemand } from '../concurrent-demand';
import { extractForcesAtStation } from '../station-forces';
import { completeResultDemands } from '../result-demand-gate';
import { memberEndForces2D } from '../diagrams';
import { memberEndForces3D } from '../diagrams-3d';
import { analyzeSectionStress3D, computeElementStress3D, interpolateForces3D } from '../section-stress-3d';
import { stationForces2D, stationForces3D } from '../../section/panel';
import { forcePeakScale } from '../member-force-extrema';
import { bindMemberEnvelopeEnds, envelopeForceExtrema } from '../member-diagram';
import { steelDemandOf } from '../verification-service';
import { sampleElementValues } from '../../three/stress-heatmap';
/**
 * The report's internal-force tables: each member's ends and the largest value along it, with
 * where it is — for one load state, for the envelope, in 2D and in 3D — and the figure numbers.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { generateCalcReportHtml, DEFAULT_REPORT_CONTENT, type CalcReportData, type CalcReportContent } from '../calc-report';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import '../../store/index';
import { computeEnvelope, computeEnvelope3D, computeSectionStress3D, initSolver, solve, solve3D, solvePDelta, solvePDelta3D, solvePDelta3DAsync, solvePDelta3DWire } from '../wasm-solver';
import type { AnalysisResults, ElementForces, SolverInput } from '../types';
import type { AnalysisResults3D, ElementForces3D, SolverInput3D } from '../types-3d';

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

  it('#2226 reads the inward I shear after a fixed-end point load', () => {
    const span = 4;
    const tipLoad = 4;
    const rootLoad = 20;
    const input: SolverInput = {
      nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: span, z: 0 }]]),
      materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]),
      sections: new Map([[1, { id: 1, a: 0.01, iz: 0.0001 }]]),
      elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
      loads: [
        { type: 'pointOnElement', data: { elementId: 1, a: 0, p: -rootLoad } },
        { type: 'nodal', data: { nodeId: 2, fx: 0, fz: -tipLoad, my: 0 } },
      ],
    };
    const nonlinear = solvePDelta(input);
    expect(nonlinear.converged).toBe(true);
    for (const [mode, result] of [['linear', solve(input)], ['P-Delta', nonlinear.results]] as const) {
      const [row] = rows(report('shear', { results2D: result }));
      expect.soft(row?.slice(1).map(num), `${mode}: the fixed support carries the root load, so only the tip load crosses either inward cut.`)
        .toEqual([tipLoad, tipLoad, tipLoad, 0]);
    }
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

it.each([
  [20, 0], [0, -20], [20, -20], [0, 0],
])('#2226 reads inward planar shear with end actions %i and %i', (atI, atJ) => {
  const length = 4;
  const results2D = r2D(ef2D({
    length, vStart: 4 - atI, vEnd: 8 + atJ,
    pointLoads: [{ a: 0, p: atI }, { a: length, p: atJ }].filter(load => load.p !== 0),
    distributedLoads: [{ a: 0, b: length, qI: 1, qJ: 1 }],
  }));
  const [row] = rows(report('shear', { results2D }));
  expect(row?.slice(1).map(num)).toEqual([4, 8, 8, length]);
});

it('known wrong result: #2581 reads both planar ends inside a point-load jump in the full report', async () => {
  await initSolver();
  const length = 4, tip = 24, point = 15;
  const input: SolverInput = {
    nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: length, z: 0 }]]),
    materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 0.0001 }]]),
    elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: -tip, my: 0 } }],
  };
  for (const a of [0, length * (1 - Number.EPSILON), length, undefined]) {
    const loaded: SolverInput = a === undefined ? input : {
      ...input, loads: [...input.loads, { type: 'pointOnElement', data: { elementId: 1, a, p: point } }],
    };
    const nonlinear = solvePDelta(loaded);
    expect(nonlinear.converged).toBe(true);
    const inwardI = a !== undefined && a > 0 ? tip - point : tip;
    const inwardJ = a === length ? tip - point : tip;
    for (const [mode, results2D] of [['linear', solve(loaded)], ['P-Delta', nonlinear.results]] as const) {
      const cells = rows(report('shear', { results2D, content: undefined }));
      expect.soft(cells.find(row => row[1] === 'I')?.[3], `${mode}, station ${a}, I`).toBe(inwardI.toFixed(2));
      expect.soft(cells.find(row => row[0] === 'J')?.[2], `${mode}, station ${a}, J`).toBe(inwardJ.toFixed(2));
    }
  }
});

it('known wrong result: #2581 reads the aggregate planar J cell from its case envelope', async () => {
  await initSolver();
  const length = 4, inward = 9, exterior = 24, start = 30, end = 18;
  const point = ef2D({ length, vStart: inward, vEnd: exterior, pointLoads: [{ a: length, p: exterior - inward }] });
  const q = (end - start) / length;
  const uniform = ef2D({ length, vStart: start, vEnd: end, qI: q, qJ: q });
  for (const cases of [[point, uniform], [uniform, point]]) {
    const envelope2D = computeEnvelope(cases.map(r2D))!;
    const table = rows(report('shear', { results2D: envelope2D.maxAbsResults, envelope2D, provenance: { kind: 'envelope' }, content: undefined }));
    expect.soft(table.find(row => row[0] === 'J')?.[2]).toBe(end.toFixed(2));
  }
});

describe('default report whole-member peaks', () => {
  const peak = (html: string, index: number) => {
    const summary = rows(html.slice(0, html.indexOf('5.2 ')));
    return num(summary[index]![1]!);
  };

  it('known wrong result: #2581 planar default report gives wL²/8', () => {
    const f = ef2D({ length: 6, vStart: 30, vEnd: -30, qI: -10, qJ: -10 });
    expect(peak(report('moment', { content: undefined, results2D: r2D(f) }), 2)).toBe(10 * 6 ** 2 / 8);
  });

  it('known wrong result: #2581 spatial default report gives wL²/8 on both bending axes', () => {
    const f = ef3D({ vyStart: 30, vyEnd: -30, vzStart: 30, vzEnd: -30, qYI: -10, qYJ: -10, qZI: -10, qZJ: -10 });
    const html = report('moment', { content: undefined, is3D: true, analysisMode: '3D', results3D: r3D(f) });
    expect(peak(html, 4)).toBe(10 * 6 ** 2 / 8);
    expect(peak(html, 5)).toBe(10 * 6 ** 2 / 8);
  });

  it('known wrong result: #2581 default report uses the envelope rather than the combined end records', () => {
    const f = ef2D({ length: 6 });
    const results = r2D(f);
    const env = computeEnvelope([results, r2D(ef2D({ length: 6, vStart: -30, vEnd: 30, qI: 10, qJ: 10 }))]);
    if (!env) throw new Error("Envelope unavailable");
    const html = report('moment', { content: undefined, provenance: { kind: 'envelope' }, results2D: env.maxAbsResults, envelope2D: env });
    expect(peak(html, 2)).toBe(10 * 6 ** 2 / 8);
  });
});


it('the planar force colours and legend use the same exact magnitudes for both members', () => {
  const span = 6, intensity = 10;
  const a = ef2D({ elementId: 1, length: span, vStart: intensity * span / 2, vEnd: -intensity * span / 2, qI: -intensity, qJ: -intensity });
  const b = ef2D({ ...a, elementId: 2, vStart: a.vStart / 2, vEnd: a.vEnd / 2, qI: a.qI / 2, qJ: a.qJ / 2 });
  const moment = intensity * span ** 2 / 8;
  expect(forcePeakScale([a, b], 'moment')).toEqual({ max: moment, values: new Map([[1, moment], [2, moment / 2]]) });

  const c = ef2D({ elementId: 1, length: 4, qI: 8, qJ: -8 });
  const d = ef2D({ ...c, elementId: 2, qI: c.qI / 2, qJ: c.qJ / 2 });
  const shear = c.qI * c.length / 4;
  expect(forcePeakScale([c, d], 'shear')).toEqual({ max: shear, values: new Map([[1, shear], [2, shear / 2]]) });
});

it('a default report refuses a conservative-only peak while a flat exact load state remains reportable', () => {
  const leaf = ef3D({ nStart: 12, nEnd: 12 });
  const inner = ef3D({ combined: { method: 'srss', parts: [leaf, ef3D({})] } });
  const outer = ef3D({ combined: { method: 'abs', parts: [inner, ef3D({})] } });
  const html = (f: ElementForces3D) => report('axial', { content: undefined, is3D: true, results3D: r3D(f) });
  expect(() => html(outer)).toThrow('solver.diagramExtremaUnavailable');
  expect(num(rows(html(inner))[0]![1]!)).toBe(12);
});

describe('consumer sweep #2581', () => {
  beforeAll(async () => { await initSolver(); });

  it('known wrong result: #2581 copied planar results still use the selected envelope ends and peak', () => {
    const selected = r2D(ef2D({ nStart: -10, nEnd: -10 }));
    const envelope = computeEnvelope([selected])!;
    const copied = r2D(ef2D({ nStart: 2, nEnd: 2 }));
    const [row] = rows(report('axial', { provenance: { kind: 'envelope' }, results2D: copied, envelope2D: envelope }));
    expect(row?.slice(1).map(num)).toEqual([-10, -10, -10, 0]);
  });

  it('known wrong result: #2581 copied spatial results still use the selected envelope ends and peak', () => {
    const selected = r3D(ef3D({ nStart: -10, nEnd: -10 }));
    const envelope = computeEnvelope3D([selected])!;
    const copied = r3D(ef3D({ nStart: 2, nEnd: 2 }));
    const table = rows(report('axial', {
      is3D: true, analysisMode: '3D', provenance: { kind: 'envelope' }, results3D: copied, envelope3D: envelope,
    }));
    expect(table.find(row => row[1] === 'I')?.at(-1)).toBe('-10.00');
    expect(table.find(row => row[0] === 'J')?.at(-1)).toBe('-10.00');
    expect(table.find(row => row[0] === 'Max |value|')?.at(-1)).toBe('-10.00 (x = 0 m)');
  });

  it('known wrong result: #2581 the steel fallback reads concurrent interior bending on a uniformly loaded simple span', () => {
    const length = 6;
    const load = 10;
    const reaction = load * length / 2;
    const forces = ef3D({ length, vzStart: reaction, vzEnd: -reaction,
      distributedLoadsZ: [{ qI: -load, qJ: -load, a: 0, b: length }] });
    const demand = steelDemandOf(forces);
    expect.soft(demand.MuStrong).toBeCloseTo(load * length ** 2 / 8, 10);
    expect.soft(demand.VuStrong).toBeCloseTo(reaction, 10);
    expect.soft(demand.concurrent?.some(cut => cut.stationT === 0.5 && cut.vz === 0
      && Math.abs(cut.my) === load * length ** 2 / 8)).toBe(true);
  });

  it('known wrong result: #2581 the spatial heatmap refuses nonconcurrent stress components', () => {
    const section = { A: 1, Iz: 1, Iy: 1, h: 1, b: 1, fy: 100 };
    const axial = ef3D({ nStart: 10, nEnd: 10 });
    const bending = ef3D({ myStart: 20, myEnd: 20 });
    const control = sampleElementValues(axial, 'sigmaMax', section);
    expect(control.peak).toBe(10);
    for (const method of ['abs', 'srss'] as const) {
      const combined = ef3D({ combined: { method, parts: [axial, bending] } });
      for (const variable of ['sigmaMax', 'tauMax', 'vonMises', 'stressRatio'] as const) {
        expect(() => sampleElementValues(combined, variable, section)).toThrow('solver.diagramExtremaUnavailable');
      }
    }
    const envelope = computeEnvelope3D([r3D(axial), r3D(bending)])!;
    expect(() => sampleElementValues(envelope.maxAbsResults3D.elementForces[0]!, 'sigmaMax', section))
      .toThrow('solver.diagramExtremaUnavailable');
  });

  it('known wrong result: #2581 spatial envelope shear uses both components on each shared face', () => {
    const section = { A: 1, Iz: 1, Iy: 1, h: 1, b: 1, fy: null };
    const forces = ef3D({ vyStart: 3, vzStart: 4,
      pointLoadsY: [{ a: 3, p: -3 }], pointLoadsZ: [{ a: 3, p: -4 }] });
    const envelope = computeEnvelope3D([r3D(forces)])!;
    const result = sampleElementValues(envelope.maxAbsResults3D.elementForces[0]!, 'shear', section);
    expect.soft(result.peak).toBe(5);
    expect.soft(result.stations.filter(cut => cut.t === 0.5).map(cut => cut.value)).toEqual([5, 0]);
    expect(result.stations.at(-1)?.value).toBe(0);

    const z = ef3D({ vzStart: 3, pointLoadsZ: [{ a: 4.5, p: -3 }] });
    const twoCases = computeEnvelope3D([r3D(forces), r3D(z)])!;
    const shared = sampleElementValues(twoCases.maxAbsResults3D.elementForces[0]!, 'shear', section);
    expect(shared.peak).toBe(5);
    expect(shared.stations.filter(cut => cut.t === 0.5).map(cut => cut.value)).toEqual([5, 3]);
    expect(shared.stations.filter(cut => cut.t === 0.75).map(cut => cut.value)).toEqual([3, 0]);

    const detached = bindMemberEnvelopeEnds(structuredClone(twoCases)).maxAbsResults3D.elementForces[0]!;
    expect(sampleElementValues(detached, 'shearZ', section).peak).toBe(4);
    expect(() => sampleElementValues(detached, 'shear', section)).toThrow('solver.diagramExtremaUnavailable');
  });

  it('known wrong result: #2581 spatial envelope moment takes concurrent resultants on shared cuts', () => {
    const section = { A: 1, Iz: 1, Iy: 1, h: 1, b: 1, fy: null };
    const concurrent = r3D(ef3D({ myStart: 3, myEnd: 3, mzStart: 4, mzEnd: 4 }));
    const y = r3D(ef3D({ myStart: 3, myEnd: 3 }));
    const z = r3D(ef3D({ mzStart: 4, mzEnd: 4 }));
    for (const [sources, peak] of [[[concurrent], 5], [[y, z], 4]] as const) {
      const envelope = computeEnvelope3D([...sources])!;
      const result = sampleElementValues(envelope.maxAbsResults3D.elementForces[0]!, 'moment', section);
      expect.soft(result.peak).toBe(peak);
      expect.soft(result.stations.every(cut => cut.value === peak)).toBe(true);
      expect.soft(new Set(result.stations.map(cut => cut.t)).size).toBe(result.stations.length);
    }
  });
});

describe('concurrent section result consumers', () => {
  const section = { A: 1, Iz: 1, Iy: 1, h: 2, b: 2, fy: 100 };
  const axial = ef3D({ nStart: -100, nEnd: -100 });
  const bending = ef3D({ myStart: 50, myEnd: 50 });

  function nonconcurrentRecords() {
    return [
      computeEnvelope3D([r3D(axial), r3D(bending)])!.maxAbsResults3D.elementForces[0]!,
      ...(['abs', 'srss'] as const).map(method => ef3D({ combined: { method, parts: [axial, bending] } })),
    ];
  }

  it.skip('known wrong result: #2581 round 3 endpoint demands refuse independent axial and bending maxima', () => {
    expect(ConcurrentDemand.endpoints(axial).map(d => [d.n, d.my])).toEqual([[-100, 0], [-100, 0]]);
    expect(ConcurrentDemand.endpoints(bending).map(d => [d.n, d.my])).toEqual([[0, 50], [0, 50]]);
    for (const record of nonconcurrentRecords()) {
      expect.soft(() => ConcurrentDemand.endpoints(record)).toThrow('solver.diagramExtremaUnavailable');
      expect.soft(() => completeResultDemands(r3D(record), [record.elementId])).toThrow('solver.diagramExtremaUnavailable');
    }
  });

  it.skip('known wrong result: #2581 round 3 quick end stress refuses independent force components', () => {
    const stress = (record: ElementForces3D) => computeElementStress3D(record, section.A, section.Iz, section.Iy, section.h, section.b, section.fy);
    for (const [force, sigma] of [[axial, 100], [bending, 50]] as const) {
      const { start, end, max } = stress(force);
      expect([start.sigmaMax, end.sigmaMax, max.sigmaMax]).toEqual([sigma, sigma, sigma]);
    }
    for (const record of nonconcurrentRecords()) {
      expect.soft(() => stress(record)).toThrow('solver.diagramExtremaUnavailable');
    }
  });

  it.skip('known wrong result: #2581 round 3 every piece must carry concurrent forces', () => {
    const first = { ...axial, length: 3 };
    const concurrent = ef3D({ pieces: [{ x0: 0, x1: 3, sectionId: 1, forces: first }, { x0: 3, x1: 6, sectionId: 1, forces: { ...bending, length: 3 } }] });
    expect(ConcurrentDemand.endpoints(concurrent).map(d => [d.n, d.my])).toEqual([[-100, 0], [0, 50]]);
    expect(interpolateForces3D(concurrent, { t: 0.5, right: false }).N).toBe(-100);
    expect(interpolateForces3D(concurrent, { t: 0.5, right: true }).My).toBe(50);
    for (const bad of nonconcurrentRecords()) {
      const inner = ef3D({ length: 6, pieces: [{ x0: 0, x1: 6, sectionId: 1, forces: bad }] });
      const parent = ef3D({ length: 9, pieces: [{ x0: 0, x1: 3, sectionId: 1, forces: first }, { x0: 3, x1: 9, sectionId: 1, forces: inner }] });
      expect.soft(() => ConcurrentDemand.endpoints(parent)).toThrow('solver.diagramExtremaUnavailable');
      expect.soft(() => computeElementStress3D(parent, 1, 1, 1, 2, 2)).toThrow('solver.diagramExtremaUnavailable');
      for (const station of [0, 1 / 3, 1]) {
        expect.soft(() => interpolateForces3D(parent, station)).toThrow('solver.diagramExtremaUnavailable');
        expect.soft(() => extractForcesAtStation(parent, station)).toThrow('solver.diagramExtremaUnavailable');
        expect.soft(() => stationForces3D(parent, station)).toThrow('solver.diagramExtremaUnavailable');
      }
      expect.soft(() => steelDemandOf(parent)).toThrow('solver.diagramExtremaUnavailable');
      expect.soft(() => sampleElementValues(parent, 'shear', section)).toThrow('solver.diagramExtremaUnavailable');
      for (const variable of ['sigmaMax', 'tauMax', 'vonMises', 'stressRatio'] as const) {
        expect.soft(() => sampleElementValues(parent, variable, section)).toThrow('solver.diagramExtremaUnavailable');
      }
    }
  });

  it.skip('known wrong result: #2581 round 3 the section panel refuses aggregate planar and spatial records', () => {
    const planarAxial = ef2D({ nStart: -100, nEnd: -100 });
    const planarBending = ef2D({ mStart: 50, mEnd: 50 });
    const planar = computeEnvelope([r2D(planarAxial), r2D(planarBending)])!.maxAbsResults.elementForces[0]!;
    for (const t of [0, 0.5, 1]) {
      expect.soft(stationForces2D(planarAxial, t).n).toBe(-100);
      expect.soft(stationForces3D(bending, t).my).toBe(50);
      expect.soft(() => stationForces2D(planar, t)).toThrow('solver.diagramExtremaUnavailable');
      for (const record of nonconcurrentRecords()) {
        expect.soft(() => stationForces3D(record, t)).toThrow('solver.diagramExtremaUnavailable');
      }
    }
  });

  it.skip('known wrong result: #2581 round 3 envelope ends and extrema refuse the same malformed ordinates', () => {
    const planar = computeEnvelope([r2D(ef2D({ nStart: -10, nEnd: -10 }))])!;
    const spatial = computeEnvelope3D([r3D(ef3D({ nStart: -10, nEnd: -10 }))])!;
    for (const [source, member, endForces] of [
      [planar.axial.elements[0]!, planar.maxAbsResults.elementForces[0]!, () => memberEndForces2D(planar.maxAbsResults.elementForces[0]!, 'axial')],
      [spatial.axial.elements[0]!, spatial.maxAbsResults3D.elementForces[0]!, () => memberEndForces3D(spatial.maxAbsResults3D.elementForces[0]!, 'axial')],
    ] as const) {
      expect(endForces()).toEqual([-10, -10]);
      expect(envelopeForceExtrema(source, member.length).absolute.value).toBe(-10);
      const valid = structuredClone(source);
      for (const damage of [
        () => Reflect.deleteProperty(source, 'negValues'),
        () => source.negValues.pop(),
        () => { delete source.negValues[0]; },
        () => { source.posValues[0] = Number.NaN; },
        () => { source.posValues[0] = -1; },
        () => { source.negValues[0] = 1; },
        () => { source.tPositions[1] = -1; },
        () => { source.tPositions[0] = 0.25; },
        () => { source.tPositions[source.tPositions.length - 1] = 0.75; },
      ]) {
        damage();
        expect.soft(endForces).toThrow('solver.diagramExtremaUnavailable');
        expect.soft(() => envelopeForceExtrema(source, member.length)).toThrow('solver.diagramExtremaUnavailable');
        Object.assign(source, structuredClone(valid));
      }
    }
  });

  it.skip('known wrong result: #2581 round 3 moment colours use the larger component at shared faces', () => {
    const left = ef3D({ length: 3, myStart: 3, myEnd: 3, mzStart: 4, mzEnd: 4 });
    const right = ef3D({ length: 3, myStart: -2, myEnd: -2, mzStart: 1, mzEnd: 1 });
    const member = ef3D({ pieces: [{ x0: 0, x1: 3, sectionId: 1, forces: left }, { x0: 3, x1: 6, sectionId: 1, forces: right }] });
    const sample = sampleElementValues(member, 'moment', section);
    expect.soft(sample.peak).toBe(4);
    expect.soft(sample.stations.filter(cut => cut.t === 0.5).map(cut => cut.value)).toEqual([4, 2]);
    expect.soft(sample.stations[0]?.value).toBe(4);
    expect.soft(sample.stations.at(-1)?.value).toBe(2);

    const envelope = computeEnvelope3D([r3D({ ...left, length: 6 }), r3D(ef3D({ mzStart: -3, mzEnd: -3 }))])!;
    const aggregate = sampleElementValues(envelope.maxAbsResults3D.elementForces[0]!, 'moment', section);
    expect.soft(aggregate.peak).toBe(4);
    expect.soft(aggregate.stations.every(cut => cut.value === 4)).toBe(true);
  });
});

it.skip('known wrong result: #2581 round 3 solved linear and nonlinear envelopes cannot drive section stress', async () => {
  await initSolver();
  const length = 4;
  const axialLoad = -100;
  const bendingLoad = 50;
  const section = { id: 1, name: 'Rectangle', shape: 'rect' as const, a: 0.01, iz: 0.0001, iy: 0.0001, h: 0.1, b: 0.1 };
  const material = { id: 1, e: 200000, nu: 0.3 };
  const element = { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 };
  const planar = (fx: number, my: number): SolverInput => ({
    nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: length, z: 0 }]]),
    materials: new Map([[1, material]]),
    sections: new Map([[1, section]]),
    elements: new Map([[1, { ...element, hingeStart: false, hingeEnd: false }]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
    loads: [{ type: 'nodal', data: { nodeId: 2, fx, fz: 0, my } }],
  });
  const spatial = (fx: number, my: number): SolverInput3D => ({
    nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: length, y: 0, z: 0 }]]),
    materials: new Map([[1, material]]),
    sections: new Map([[1, { ...section, j: 0.0001 }]]),
    elements: new Map([[1, { ...element, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
    supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
    loads: [{ type: 'nodal', data: { nodeId: 2, fx, fy: 0, fz: 0, mx: 0, my, mz: 0 } }],
  });
  const planarCases = [planar(axialLoad, 0), planar(0, bendingLoad)];
  const planarNonlinear = planarCases.map(input => solvePDelta(input));
  expect(planarNonlinear.every(result => result.converged)).toBe(true);
  for (const cases of [planarCases.map(input => solve(input)), planarNonlinear.map(result => result.results)]) {
    const envelope = computeEnvelope(cases)!.maxAbsResults.elementForces[0]!;
    expect.soft(analyzeSectionStress(cases[0]!.elementForces[0]!, section, undefined, 0.5).N).toBeCloseTo(axialLoad, 10);
    expect.soft(() => analyzeSectionStress(envelope, section, undefined, 0.5)).toThrow('solver.diagramExtremaUnavailable');
  }

  const spatialCases = [spatial(axialLoad, 0), spatial(0, bendingLoad)];
  const spatialNonlinear = spatialCases.map(input => solvePDelta3D(input));
  const { solve_pdelta_3d } = await import('../../wasm/dedaliano_engine.js');
  let workerAnswers = 0;
  const asyncNonlinear = await Promise.all(spatialCases.map(input => solvePDelta3DAsync(input, 20, 1e-4,
    async (wire, iterations, tolerance) => {
      const answer = solvePDelta3DWire(wire, iterations, tolerance, solve_pdelta_3d);
      workerAnswers++;
      return answer;
    })));
  expect(workerAnswers).toBe(spatialCases.length);
  expect([...spatialNonlinear, ...asyncNonlinear].every(result => result.converged)).toBe(true);
  for (const cases of [spatialCases.map(solve3D), spatialNonlinear.map(result => result.results), asyncNonlinear.map(result => result.results)]) {
    const envelope = computeEnvelope3D(cases)!.maxAbsResults3D.elementForces[0]!;
    const control = cases[0]!.elementForces[0]!;
    const stress = (elementForces: ElementForces3D) => computeSectionStress3D({ elementForces, section: resolveSectionGeometryLegacy(section), t: 0.5 });
    expect.soft(stress(control).N).toBeCloseTo(axialLoad, 10);
    expect.soft(analyzeSectionStress3D(control, section, undefined, 0.5).N).toBeCloseTo(axialLoad, 10);
    expect.soft(ConcurrentDemand.endpoints(control)[0]!.n).toBeCloseTo(axialLoad, 10);
    expect.soft(() => stress(envelope)).toThrow('solver.diagramExtremaUnavailable');
    expect.soft(() => analyzeSectionStress3D(envelope, section, undefined, 0.5)).toThrow('solver.diagramExtremaUnavailable');
    expect.soft(() => ConcurrentDemand.endpoints(envelope)).toThrow('solver.diagramExtremaUnavailable');
  }
});
