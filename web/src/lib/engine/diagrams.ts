// Diagram calculation: M(x), V(x), N(x) along each element
// Given end forces and distributed load, compute intermediate values

import { computeDeformedShape as wasmComputeDeformedShape } from './wasm-solver';
import { checkedCurveValue, checkedSectionValue, curveExtrema, diagramCriticalPoints, diagramCurvePoints, envelopeMemberEndValues, diagramLineValue, distributedActionTerms, fullSpanFallback, indexDiagramExtrema, inwardMemberEndValues, maxAbsDiagramOrdinate, memberDiagram, prepareCurveExtrema, unavailableDiagramExtrema, type DiagramOrdinate, type DiagramStation } from './member-diagram';

export interface DiagramPoint extends DiagramStation {
  /** World coordinates */
  x: number;
  y: number;
  /** Value at this point */
  value: number;
}

export interface ElementDiagram {
  elementId: number;
  points: DiagramPoint[];
  maxValue: number;
  minValue: number;
  /** Position of max absolute value (for label) */
  maxAbsT: number;
  maxAbsValue: number;
}

type PlanarKind = 'moment' | 'shear' | 'axial';

type PlanarForces = {
  mStart: number; mEnd: number; vStart: number; vEnd: number; nStart: number; nEnd: number;
  qI: number; qJ: number; length: number;
  pointLoads?: Array<{ a: number; p: number; px?: number; my?: number }>;
  distributedLoads?: Array<{ qI: number; qJ: number; a: number; b: number }>;
  distributedLoadsX?: Array<{ qI: number; qJ: number; a: number; b: number }>;
};

type PlanarCurveArgs = Parameters<typeof memberDiagram>;

function planarCurveArgs(kind: PlanarKind, ef: PlanarForces): PlanarCurveArgs {
  const { length } = ef;
  const points = [...(ef.pointLoads ?? [])].sort((a, b) => a.a - b.a);
  if (kind === 'axial') {
    const loads = ef.distributedLoadsX ?? [];
    const axial = points.filter(p => p.px).map(p => ({ a: p.a, jump: -p.px! }));
    const pointTotal = axial.reduce((sum, p) => sum - p.jump, 0);
    const distributedTotal = loads.reduce((sum, load) => sum + distributedActionTerms(load, length)[0], 0);
    return [length, ef.nStart, ef.nEnd + pointTotal + distributedTotal - ef.nStart, loads, axial, 'force', -1];
  }
  const loads = fullSpanFallback(length, ef.distributedLoads, ef.qI, ef.qJ);
  return kind === 'moment'
    ? [length, ef.mStart, 0, loads,
      points.map(p => ({ a: p.a, jump: p.my ?? 0, slope: -p.p })), 'moment', -1, -ef.vStart]
    : [length, ef.vStart, 0, loads, points.map(p => ({ a: p.a, jump: p.p }))];
}

function planarCurve(kind: PlanarKind, ef: PlanarForces) {
  return memberDiagram(...planarCurveArgs(kind, ef));
}

let lastPlanarQuery: { key: readonly (number | string | undefined)[]; evaluate: (t: number, right: boolean) => number } | undefined;

function planarQuery([length, start, change, loads, points, order, sign, rate]: PlanarCurveArgs) {
  const key = [length, start, change, order, sign, rate, loads.length,
    ...loads.flatMap(({ a, b, qI, qJ }) => [a, b, qI, qJ]),
    ...points.flatMap(({ a, jump, slope }) => [a, jump, slope]),
  ];
  const cached = lastPlanarQuery;
  if (cached?.key.length === key.length && key.every((entry, i) => Object.is(entry, cached.key[i]))) {
    return cached.evaluate;
  }
  const curve = memberDiagram(length, start, change, loads, points, order, sign, rate);
  const extremaAt = prepareCurveExtrema(curve, length);
  const evaluate = curve.hasDistributedActions
    ? (t: number, right: boolean) => checkedCurveValue(curve, { t, right }, indexDiagramExtrema(extremaAt(t)))
    : (t: number, right: boolean) => curve.value({ t, right });
  lastPlanarQuery = { key, evaluate };
  return evaluate;
}

type PlanarMemberForces = PlanarForces & { elementId: number };

export function memberEndForces2D(ef: PlanarMemberForces, kind: PlanarKind): [number, number] {
  const envelopeEnds = envelopeMemberEndValues(ef, kind);
  if (envelopeEnds) return envelopeEnds;
  const stored: [number, number] = kind === 'axial' ? [ef.nStart, ef.nEnd]
    : kind === 'shear' ? [ef.vStart, ef.vEnd] : [ef.mStart, ef.mEnd];
  const jump = kind === 'axial' ? 'px' : kind === 'shear' ? 'p' : 'my';
  return inwardMemberEndValues(ef.length, stored,
    x => ef.pointLoads?.some(p => p.a === x && (p[jump] ?? 0) !== 0) ?? false,
    () => {
      const evaluate = planarQuery(planarCurveArgs(kind, ef));
      return ({ t, right }) => evaluate(t, right ?? false);
    });
}

export function memberEndSections2D(ef: PlanarMemberForces) {
  const [ni, nj] = memberEndForces2D(ef, 'axial');
  const [vi, vj] = memberEndForces2D(ef, 'shear');
  const [mi, mj] = memberEndForces2D(ef, 'moment');
  return [{ n: ni, v: vi, m: mi }, { n: nj, v: vj, m: mj }] as const;
}

function buildDiagram(
  kind: PlanarKind,
  ef: PlanarForces,
  nodeIx: number, nodeIy: number,
  nodeJx: number, nodeJy: number,
): ElementDiagram {
  const curve = planarCurve(kind, ef);
  const critical = diagramCriticalPoints(curve, curveExtrema(curve, ef.length), 'diagram');
  const points = diagramCurvePoints(curve, critical).map(point => ({
    ...point,
    x: nodeIx + point.t * (nodeJx - nodeIx),
    y: nodeIy + point.t * (nodeJy - nodeIy),
  }));
  return { elementId: 0, points, ...planarExtrema(critical) };
}

function planarExtrema(critical: readonly DiagramOrdinate[]) {
  let maxValue = -Infinity, minValue = Infinity;
  for (const { value } of critical) {
    if (value > maxValue) maxValue = value;
    if (value < minValue) minValue = value;
  }
  const { t: maxAbsT, value: maxAbsValue, side: maxAbsSide } = maxAbsDiagramOrdinate(critical);
  return { maxValue, minValue, maxAbsT, maxAbsValue, maxAbsSide };
}

export function computePlanarDiagramExtrema(kind: PlanarKind, ef: PlanarForces, faces?: 'diagram') {
  const curve = planarCurve(kind, ef);
  const critical = diagramCriticalPoints(curve, curveExtrema(curve, ef.length), faces);
  const extrema = planarExtrema(critical);
  return {
    ...extrema,
    startValue: critical[0]!.value,
    endValue: critical.at(-1)!.value,
    maxAbsX: curve.cutDistances.get(extrema.maxAbsT) ?? extrema.maxAbsT * ef.length,
  };
}

export function computeElementDiagram(
  kind: 'moment' | 'shear' | 'axial',
  ef: Parameters<typeof computeDiagramValueAt>[2],
  nodeIx: number, nodeIy: number,
  nodeJx: number, nodeJy: number,
): ElementDiagram {
  return buildDiagram(kind, ef, nodeIx, nodeIy, nodeJx, nodeJy);
}

/**
 * Compute moment diagram M(x) along element (full-length loads only: `qI`, `qJ`)
 */
export function computeMomentDiagram(
  mStart: number, _mEnd: number,
  vStart: number, qI: number, qJ: number,
  length: number,
  nodeIx: number, nodeIy: number,
  nodeJx: number, nodeJy: number,
  pointLoads: Array<{ a: number; p: number; px?: number; my?: number }> = [],
): ElementDiagram {
  const ef = { mStart, mEnd: _mEnd, vStart, vEnd: 0, nStart: 0, nEnd: 0, qI, qJ, length, pointLoads };
  return buildDiagram('moment', ef, nodeIx, nodeIy, nodeJx, nodeJy);
}

/**
 * Compute shear diagram V(x)
 */
export function computeShearDiagram(
  vStart: number, qI: number, qJ: number,
  length: number,
  nodeIx: number, nodeIy: number,
  nodeJx: number, nodeJy: number,
  pointLoads: Array<{ a: number; p: number; px?: number; my?: number }> = [],
): ElementDiagram {
  const ef = { mStart: 0, mEnd: 0, vStart, vEnd: 0, nStart: 0, nEnd: 0, qI, qJ, length, pointLoads };
  return buildDiagram('shear', ef, nodeIx, nodeIy, nodeJx, nodeJy);
}

/**
 * Compute axial force diagram N(x)
 */
export function computeAxialDiagram(
  nStart: number, nEnd: number,
  length: number,
  nodeIx: number, nodeIy: number,
  nodeJx: number, nodeJy: number,
  pointLoads: Array<{ a: number; p: number; px?: number; my?: number }> = [],
): ElementDiagram {
  const ef = { mStart: 0, mEnd: 0, vStart: 0, vEnd: 0, nStart, nEnd, qI: 0, qJ: 0, length, pointLoads };
  return buildDiagram('axial', ef, nodeIx, nodeIy, nodeJx, nodeJy);
}

/**
 * Compute the value of a diagram (M, V, or N) at a given normalized position t ∈ [0,1]
 */
export function computeDiagramValueAt(kind: PlanarKind, t: number, ef: PlanarForces, right = false): number {
  const { length } = ef;
  if (!(length > 0 && Number.isFinite(length))) throw unavailableDiagramExtrema();
  if (kind === 'axial') {
    if (!ef.distributedLoadsX?.length && !ef.pointLoads?.some(p => p.px)) {
      return diagramLineValue(ef.nStart, ef.nEnd - ef.nStart, 0, t * length, t);
    }
  } else if (!ef.distributedLoads?.length && !ef.pointLoads?.length && !ef.qI && !ef.qJ) {
    const moment = kind === 'moment';
    return diagramLineValue(moment ? ef.mStart : ef.vStart, 0, moment ? -ef.vStart : 0, t * length, t);
  }
  return planarQuery(planarCurveArgs(kind, ef))(t, right);
}

export function computePlanarSectionValue(kind: PlanarKind, distance: number, ef: PlanarForces): number {
  if (!(distance >= 0 && distance <= ef.length)) throw unavailableDiagramExtrema();
  return checkedSectionValue(planarCurve(kind, ef), { t: distance / ef.length, distance });
}

export function prepareDiagramValueAt(kind: PlanarKind, ef: PlanarForces): (t: number) => number {
  const curve = planarCurve(kind, ef);
  if (!curve.hasDistributedActions) return t => curve.value({ t });
  let extrema: ReturnType<typeof indexDiagramExtrema> | undefined;
  return t => {
    extrema ??= indexDiagramExtrema(curveExtrema(curve, ef.length));
    return checkedCurveValue(curve, { t }, extrema);
  };
}

type PlanarRecoveryRequest = {
  nodeIx: number; nodeIy: number; nodeJx: number; nodeJy: number;
  uIx: number; uIy: number; rIz: number; uJx: number; uJy: number; rJz: number;
  length: number; hingeStart: boolean; hingeEnd: boolean;
  ei: number | undefined; gas: number | undefined;
  loadQi: number | undefined; loadQj: number | undefined;
  loadPoints: Array<{ a: number; p: number; my?: number }> | undefined;
  distLoads: Array<{ qI: number; qJ: number; a: number; b: number }> | undefined;
};

function planarRecoveryRequest({ distLoads, loadPoints, ...input }: PlanarRecoveryRequest) {
  return { ...input, scale: 1, loadPoints: loadPoints ?? [],
    distLoads: (distLoads?.length ? distLoads : [{ qI: input.loadQi ?? 0, qJ: input.loadQj ?? 0, a: 0, b: input.length }])
      .map(d => [d.qI, d.qJ, d.a, d.b]) };
}

export function computeDeformedShape(
  nodeIx: number, nodeIy: number,
  nodeJx: number, nodeJy: number,
  uIx: number, uIy: number, rIz: number,
  uJx: number, uJy: number, rJz: number,
  scale: number,
  length: number,
  hingeStart: boolean = false,
  hingeEnd: boolean = false,
  EI?: number,
  loadQI?: number,
  loadQJ?: number,
  loadPoints?: Array<{ a: number; p: number; my?: number }>,
  distLoads?: Array<{ qI: number; qJ: number; a: number; b: number }>,
  gas?: number,
): { x: number; y: number }[] {
  return wasmComputeDeformedShape({ ...planarRecoveryRequest({
    nodeIx, nodeIy, nodeJx, nodeJy, uIx, uIy, rIz, uJx, uJy, rJz,
    length, hingeStart, hingeEnd, ei: EI, gas, loadQi: loadQI, loadQj: loadQJ, loadPoints, distLoads,
  }), scale });
}

/**
 * Compute the actual displacement (ux, uz in metres) at parameter t ∈ [0,1]
 * along an element, using Hermite cubic + particular solution.
 *
 * Unlike linear interpolation, this correctly captures mid-span deflection
 * even when both end-nodes have zero displacement (e.g. simply supported beam).
 */
export function computeDisplacementAt(
  t: number,
  nodeIx: number, nodeIy: number,
  nodeJx: number, nodeJy: number,
  uIx: number, uIy: number, rIz: number,
  uJx: number, uJy: number, rJz: number,
  length: number,
  hingeStart: boolean = false,
  hingeEnd: boolean = false,
  EI?: number,
  loadQI?: number,
  loadQJ?: number,
  loadPoints?: Array<{ a: number; p: number; my?: number }>,
  distLoads?: Array<{ qI: number; qJ: number; a: number; b: number }>,
  gas?: number,
): { ux: number; uz: number; ry: number } {
  if (length < 1e-12) return { ux: uIx, uz: uIy, ry: rIz };
  const sample = wasmComputeDeformedShape({ ...planarRecoveryRequest({
    nodeIx, nodeIy, nodeJx, nodeJy, uIx, uIy, rIz, uJx, uJy, rJz,
    length, hingeStart, hingeEnd, ei: EI, gas, loadQi: loadQI, loadQj: loadQJ, loadPoints, distLoads,
  }), displacementsOnly: true, positions: [Math.max(0, Math.min(1, t))] })[0];
  if (!sample || !Number.isFinite(sample.ux) || !Number.isFinite(sample.uz) || !Number.isFinite(sample.ry)) {
    throw new Error('Member displacement recovery did not return finite displacement and rotation.');
  }
  return sample;
}
