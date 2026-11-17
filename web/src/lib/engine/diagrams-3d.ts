// 3D Diagram Computation — Analytical equations
// Compute diagram values (My, Mz, Vy, Vz, N, Mx) along each 3D element
// using equilibrium equations with distributed and point loads.

import { type UnitSystem, formatDiagramValue } from '../utils/units';
import type { ElementForces3D, EnvelopeDiagramData3D } from './types-3d';

export type Diagram3DKind = 'momentY' | 'momentZ' | 'shearY' | 'shearZ' | 'axial' | 'torsion';

export interface DiagramPoint3D {
  /** Normalized position along element [0, 1] */
  t: number;
  /** Diagram value at this point (kN or kN·m) */
  value: number;
}

export interface ElementDiagram3D {
  elementId: number;
  points: DiagramPoint3D[];
  maxValue: number;
  minValue: number;
  maxAbsValue: number;
}

const NUM_POINTS = 21;

/**
 * Build sorted, unique sampling positions (as t ∈ [0,1]) including
 * regular grid points and positions just before/after each point load
 * to capture discontinuities in shear diagrams.
 */
function buildSamplingPositions(
  length: number,
  pointLoads: Array<{ a: number; p: number }>,
  pieces?: ElementForces3D['pieces'],
): number[] {
  const tSet = new Set<number>();

  for (let i = 0; i < NUM_POINTS; i++) {
    tSet.add(i / (NUM_POINTS - 1));
  }
  // A member of variable section: each piece's ends too, where the diagram may kink.
  for (const p of pieces ?? []) tSet.add(Math.min(1, p.x1 / length));

  const eps = 1e-6;
  for (const pl of pointLoads) {
    const tPl = pl.a / length;
    if (tPl > eps) tSet.add(tPl - eps);
    tSet.add(tPl);
    if (tPl < 1 - eps) tSet.add(tPl + eps);
  }

  return Array.from(tSet).sort((a, b) => a - b);
}


function polynomialValue(coefficients: readonly number[], x: number): number {
  return coefficients.reduceRight((sum, c) => sum * x + c, 0);
}

function polynomialDerivative(coefficients: readonly number[]): number[] {
  return coefficients.slice(1).map((c, i) => (i + 1) * c);
}

function cubicOnInterval(evaluate: (t: number) => number, lo: number, hi: number): number[] {
  const nodes = Array.from({ length: 4 }, (_, i) => (1 - Math.cos((2 * i + 1) * Math.PI / 8)) / 2);
  const divided = nodes.map(u => evaluate(lo + (hi - lo) * u));
  for (let j = 1; j < 4; j++) for (let i = 3; i >= j; i--) divided[i] = (divided[i]! - divided[i - 1]!) / (nodes[i]! - nodes[i - j]!);
  let coefficients = [divided[3]!];
  for (let i = 2; i >= 0; i--) {
    const next = Array<number>(coefficients.length + 1).fill(0);
    coefficients.forEach((c, j) => { next[j] -= nodes[i]! * c; next[j + 1] += c; });
    next[0] += divided[i]!;
    coefficients = next;
  }
  if (coefficients.some(c => !Number.isFinite(c))) throw new Error('Cannot form finite member diagram polynomial');
  return coefficients;
}

function polynomialRootCandidates(coefficients: readonly number[], lo = 0, hi = 1): number[] {
  const c = [...coefficients];
  while (c.length && c.at(-1) === 0) c.pop();
  if (c.length < 2) return [];
  if (c.some(v => !Number.isFinite(v))) throw new Error('Cannot isolate non-finite member diagram polynomial');
  const scale = Math.max(...c.map(Math.abs));
  const normalized = c.map(v => v / scale);
  if (c.length === 2) {
    const root = -normalized[0]! / normalized[1]!;
    return root >= lo && root <= hi ? [root] : [];
  }
  const critical = polynomialRootCandidates(polynomialDerivative(normalized), lo, hi);
  const cuts = [...new Set([lo, ...critical, hi])].sort((a, b) => a - b);
  const roots = [...critical];
  for (let k = 0; k + 1 < cuts.length; k++) {
    let a = cuts[k]!, b = cuts[k + 1]!;
    let fa = polynomialValue(normalized, a);
    const fb = polynomialValue(normalized, b);
    if (fa === 0) roots.push(a);
    if (fb === 0) roots.push(b);
    if (fa === 0 || fb === 0 || (fa < 0) === (fb < 0)) continue;
    while (true) {
      const mid = a + (b - a) / 2;
      if (mid === a || mid === b) { roots.push(mid); break; }
      const fm = polynomialValue(normalized, mid);
      if (fm === 0) { roots.push(mid); break; }
      if ((fm < 0) === (fa < 0)) { a = mid; fa = fm; } else b = mid;
    }
  }
  return [...new Set(roots)].sort((a, b) => a - b);
}

function magnitudeStations(parts: readonly ((t: number) => number)[], method: 'abs' | 'srss', cuts: readonly number[]): number[] {
  const positions = new Set<number>();
  for (let k = 0; k + 1 < cuts.length; k++) {
    const lo = cuts[k]!, hi = cuts[k + 1]!, width = hi - lo;
    if (!(width > 0)) continue;
    const polynomials = parts.map(evaluate => cubicOnInterval(evaluate, lo, hi));
    const scale = Math.max(0, ...polynomials.flatMap(p => p.map(Math.abs)));
    if (scale === 0) continue;
    const normalized = polynomials.map(p => p.map(c => c / scale));
    if (method === 'srss') {
      const squared = Array<number>(7).fill(0);
      for (const p of normalized) p.forEach((a, i) => p.forEach((b, j) => { squared[i + j] += a * b; }));
      for (const u of polynomialRootCandidates(polynomialDerivative(squared))) positions.add(lo + width * u);
    } else {
      const zeros = [...new Set([0, 1, ...normalized.flatMap(p => polynomialRootCandidates(p))])].sort((a, b) => a - b);
      for (const u of zeros) positions.add(lo + width * u);
      for (let j = 0; j + 1 < zeros.length; j++) {
        const a = zeros[j]!, b = zeros[j + 1]!;
        const sum = Array<number>(4).fill(0);
        for (const p of normalized) {
          const sign = polynomialValue(p, a + (b - a) / 2) < 0 ? -1 : 1;
          p.forEach((c, i) => { sum[i] += sign * c; });
        }
        for (const u of polynomialRootCandidates(polynomialDerivative(sum), a, b)) positions.add(lo + width * u);
      }
    }
  }
  return [...positions];
}

function polynomialCuts(ef: ElementForces3D, kind: Diagram3DKind): number[] {
  if (ef.combined) throw new Error('Nested magnitude combinations do not have polynomial components');
  if (ef.pieces?.length) {
    return ef.pieces.flatMap(p => polynomialCuts(p.forces, kind).map(t => (p.x0 + (p.x1 - p.x0) * t) / ef.length));
  }
  const distributed = kind === 'axial' ? ef.distributedLoadsX
    : kind === 'momentY' || kind === 'shearZ' ? ef.distributedLoadsZ
      : kind === 'momentZ' || kind === 'shearY' ? ef.distributedLoadsY : [];
  const points = pointLoadsOf(ef, kind);
  return [0, 1, ...points.map(p => p.a / ef.length),
    ...(distributed ?? []).flatMap(p => [p.a / ef.length, p.b / ef.length])]
    .filter(t => Number.isFinite(t) && t >= 0 && t <= 1);
}

function pointLoadsOf(ef: ElementForces3D, kind: Diagram3DKind) {
  if (kind === 'momentZ' || kind === 'shearY') return ef.pointLoadsY ?? [];
  if (kind === 'momentY' || kind === 'shearZ') return ef.pointLoadsZ ?? [];
  return [];
}

function hasCombination(ef: ElementForces3D): boolean {
  return !!ef.combined || (ef.pieces?.some(p => hasCombination(p.forces)) ?? false);
}

function diagramPoints(ef: ElementForces3D, kind: Diagram3DKind): DiagramPoint3D[] {
  if (ef.combined) {
    const { parts, method } = ef.combined;
    const cuts = [...new Set([0, 1, ...parts.flatMap(p => polynomialCuts(p, kind))])].sort((a, b) => a - b);
    const extrema = magnitudeStations(parts.map(p => t => evaluateDiagram(p, kind, t, t)), method, cuts);
    const stations = [...new Set([...buildSamplingPositions(ef.length, []), ...cuts, ...extrema])].sort((a, b) => a - b);
    const boundaries = new Map(cuts.map((t, i) => [t, i]));
    return stations.flatMap(t => {
      const i = boundaries.get(t);
      if (i === undefined) return [{ t, value: evaluateDiagram(ef, kind, t, t) }];
      const valueFrom = (other: number) => evaluateDiagram(ef, kind, t, t + (other - t) / 2);
      const left = valueFrom(cuts[Math.max(0, i - 1)]!);
      const right = valueFrom(cuts[Math.min(cuts.length - 1, i + 1)]!);
      if (i === 0) return [{ t, value: right }];
      if (i === cuts.length - 1 || left === right) return [{ t, value: left }];
      return [{ t, value: left }, { t, value: right }];
    });
  }
  if (ef.pieces?.length && hasCombination(ef)) {
    return ef.pieces.flatMap(p => diagramPoints(p.forces, kind)
      .map(({ t, value }) => ({ t: (p.x0 + (p.x1 - p.x0) * t) / ef.length, value })));
  }
  return buildSamplingPositions(ef.length, pointLoadsOf(ef, kind), ef.pieces)
    .map(t => ({ t, value: evaluateDiagram(ef, kind, t) }));
}

/**
 * Compute a 3D diagram for one element.
 * Delegates to evaluateDiagramAt for each sample point.
 */
export function computeDiagram3D(
  ef: ElementForces3D,
  kind: Diagram3DKind,
): ElementDiagram3D {
  const points = diagramPoints(ef, kind);
  let maxVal = -Infinity;
  let minVal = Infinity;
  let maxAbsValue = 0;

  for (const { value } of points) {
    if (value > maxVal) maxVal = value;
    if (value < minVal) minVal = value;
    if (Math.abs(value) > Math.abs(maxAbsValue)) maxAbsValue = value;
  }

  return { elementId: ef.elementId, points, maxValue: maxVal, minValue: minVal, maxAbsValue };
}

/**
 * Compute the global maximum absolute value for a diagram kind across all elements.
 */
export function computeGlobalMax3D(
  elementForces: ElementForces3D[],
  kind: Diagram3DKind,
): number {
  let globalMax = 0;
  for (const ef of elementForces) {
    const d = computeDiagram3D(ef, kind);
    globalMax = Math.max(globalMax, Math.abs(d.maxValue), Math.abs(d.minValue));
  }
  return globalMax;
}

/**
 * A member's envelope as diagrams: its positive and its negative station curve, each drawn as it
 * stands. Envelope end forces (`maxAbsResults3D`) are each end's largest from its own
 * combination, no load state to integrate with `computeDiagram3D`.
 */
export function envelopeDiagrams3D(env: EnvelopeDiagramData3D, elementId: number): ElementDiagram3D[] {
  const e = env.elements.find((e) => e.elementId === elementId);
  if (!e) return [];
  return [e.posValues, e.negValues].map((values) => {
    let maxValue = -Infinity, minValue = Infinity, maxAbsValue = 0;
    const points = e.tPositions.map((t, i) => {
      const value = values[i] ?? 0;
      maxValue = Math.max(maxValue, value); minValue = Math.min(minValue, value);
      if (Math.abs(value) > Math.abs(maxAbsValue)) maxAbsValue = value;
      return { t, value };
    });
    return { elementId, points, maxValue, minValue, maxAbsValue };
  }).filter((d) => d.points.length > 0);
}

/**
 * Determine the perpendicular direction for a diagram kind.
 *
 * - Mz, Vy  → bending in local XY plane  → perpendicular = ey  → return 'y'
 * - My, Vz  → bending in local XZ plane  → perpendicular = ez  → return 'z'
 * - N, Mx   → drawn in local XZ plane    → perpendicular = ez  → return 'z'
 */
export function getDiagramLocalDirection(kind: Diagram3DKind): 'y' | 'z' {
  switch (kind) {
    case 'momentZ':
    case 'shearY':
      return 'y';
    case 'momentY':
    case 'shearZ':
    case 'axial':
    case 'torsion':
      return 'z';
  }
}

/**
 * Evaluate the diagram value at a specific normalized position t ∈ [0,1].
 * Uses analytical equilibrium equations.
 */
export function evaluateDiagramAt(
  ef: ElementForces3D,
  kind: Diagram3DKind,
  t: number,
): number {
  return evaluateDiagram(ef, kind, t, hasCombination(ef) ? t : undefined);
}

function evaluateDiagram(ef: ElementForces3D, kind: Diagram3DKind, t: number, inside?: number): number {
  // A combination by SRSS or ABS: its cases' values here, combined (`combination-methods.ts`).
  if (ef.combined) {
    const vs = ef.combined.parts.map((p) => evaluateDiagram(p, kind, t, inside));
    return ef.combined.method === 'srss' ? Math.hypot(...vs) : vs.reduce((s, v) => s + Math.abs(v), 0);
  }
  const L = ef.length;
  const x = t * L;
  // A member of variable section is read on the piece the point falls in (`variable-members.ts`).
  if (ef.pieces?.length) {
    const p = ef.pieces.find(q => inside === undefined ? x <= q.x1 + 1e-9 : inside <= q.x1 / L)
      ?? ef.pieces[ef.pieces.length - 1]!;
    const start = p.x0 / L, end = p.x1 / L;
    const station = inside === undefined ? (x - p.x0) / Math.max(p.x1 - p.x0, 1e-12) : (t - start) / (end - start);
    const reference = inside === undefined ? undefined : (inside - start) / (end - start);
    return evaluateDiagram(p.forces, kind, Math.min(1, Math.max(0, station)), reference);
  }

  const precedes = (a: number) => inside === undefined ? a < x - 1e-10 : a / L < inside;
  switch (kind) {
    case 'momentZ': {
      let value = ef.mzStart - ef.vyStart * x;
      for (const dl of ef.distributedLoadsY ?? []) {
        const a = dl.a;
        const b = dl.b;
        const span = b - a;
        if (span < 1e-12) continue;
        const dq = dl.qJ - dl.qI;
        const xClamp = Math.min(x, b);
        if (xClamp <= a) continue;
        const s = xClamp - a;
        value -= dl.qI * (s * (x - a) - s * s / 2)
               + dq / span * (s * s / 2 * (x - a) - s * s * s / 3);
      }
      for (const pl of ef.pointLoadsY ?? []) {
        if (precedes(pl.a)) value -= pl.p * (x - pl.a);
      }
      return value;
    }
    case 'momentY': {
      let value = ef.myStart + ef.vzStart * x;
      for (const dl of ef.distributedLoadsZ ?? []) {
        const a = dl.a;
        const b = dl.b;
        const span = b - a;
        if (span < 1e-12) continue;
        const dq = dl.qJ - dl.qI;
        const xClamp = Math.min(x, b);
        if (xClamp <= a) continue;
        const s = xClamp - a;
        value += dl.qI * (s * (x - a) - s * s / 2)
               + dq / span * (s * s / 2 * (x - a) - s * s * s / 3);
      }
      for (const pl of ef.pointLoadsZ ?? []) {
        if (precedes(pl.a)) value += pl.p * (x - pl.a);
      }
      return value;
    }
    case 'shearY': {
      let value = ef.vyStart;
      for (const dl of ef.distributedLoadsY ?? []) {
        const a = dl.a;
        const b = dl.b;
        const span = b - a;
        if (span < 1e-12) continue;
        const dq = dl.qJ - dl.qI;
        const xClamp = Math.min(x, b);
        if (xClamp <= a) continue;
        const s = xClamp - a;
        value += dl.qI * s + dq * s * s / (2 * span);
      }
      for (const pl of ef.pointLoadsY ?? []) {
        if (precedes(pl.a)) value += pl.p;
      }
      return value;
    }
    case 'shearZ': {
      let value = ef.vzStart;
      for (const dl of ef.distributedLoadsZ ?? []) {
        const a = dl.a;
        const b = dl.b;
        const span = b - a;
        if (span < 1e-12) continue;
        const dq = dl.qJ - dl.qI;
        const xClamp = Math.min(x, b);
        if (xClamp <= a) continue;
        const s = xClamp - a;
        value += dl.qI * s + dq * s * s / (2 * span);
      }
      for (const pl of ef.pointLoadsZ ?? []) {
        if (precedes(pl.a)) value += pl.p;
      }
      return value;
    }
    case 'axial': {
      if (!ef.distributedLoadsX?.length) return ef.nStart + t * (ef.nEnd - ef.nStart);
      let value = ef.nStart;
      for (const dl of ef.distributedLoadsX) {
        const span = dl.b - dl.a;
        if (span <= 0) continue;
        const s = Math.max(0, Math.min(x - dl.a, span));
        value -= dl.qI * s + (dl.qJ - dl.qI) * s * s / (2 * span);
      }
      return value;
    }
    case 'torsion':
      return ef.mxStart + t * (ef.mxEnd - ef.mxStart);
  }
}

/** Format a 3D diagram value for display.
 *  Bending moments are negated: internal convention is hogging=positive,
 *  but standard engineering convention is sagging=positive. A torque has no
 *  sagging side: it reads as every table reads Mx, so the moment's flip in
 *  `formatDiagramValue` is undone for it — the label said −5 where the tables said 5. */
export function formatDiagramValue3D(value: number, kind: Diagram3DKind, system: UnitSystem = 'SI'): string {
  const isMoment = kind === 'momentY' || kind === 'momentZ' || kind === 'torsion';
  return formatDiagramValue(kind === 'torsion' ? -value : value, isMoment ? 'moment' : 'force', system);
}
