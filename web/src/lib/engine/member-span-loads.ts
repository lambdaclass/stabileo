import { tp } from '../i18n';
import { requireEngine } from './engine-unavailable';
import type { SolverInput, SolverLoad } from './types';

type SpanLoad = Extract<SolverLoad, { type: 'distributed' | 'axialDistributed' }>;
interface Piece { id: number; start: number; end: number; length: number }

export function memberLength(input: Pick<SolverInput, 'nodes' | 'elements'>, id: number): number {
  const e = input.elements.get(id)!;
  const i = input.nodes.get(e.nodeI)!, j = input.nodes.get(e.nodeJ)!;
  const dx = j.x - i.x, dz = j.z - i.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export const MEMBER_GEOMETRY_LIMIT = 1e-10;

export type MemberEndpoints = readonly [readonly number[], readonly number[]];
type MemberIntervalKernel = (i: Float64Array, j: Float64Array, a: number, b: number, values?: Float64Array) => Float64Array;
let intervalKernel: MemberIntervalKernel | null = null;
export function registerMemberIntervalKernel(kernel: MemberIntervalKernel | null): void { intervalKernel = kernel; }

export class MemberLoadIntervalError extends Error {}

export function validateMemberLoadInterval(id: number, a: number, b: number, length: number, points?: MemberEndpoints): void {
  if (b > length && points) {
    requireEngine(intervalKernel !== null, 'member load interval');
    [a, b, length] = intervalKernel!(Float64Array.from(points[0]), Float64Array.from(points[1]), a, b);
  }
  if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < a || b > length) {
    throw new MemberLoadIntervalError(tp('engine.memberLoad.invalidInterval', { id, a, b, length }));
  }
  if ((b - a) / length < MEMBER_GEOMETRY_LIMIT) {
    throw new MemberLoadIntervalError(tp('engine.memberLoad.geometryLimit', { id, a, b, length, limit: MEMBER_GEOMETRY_LIMIT }));
  }
}

export function canonicalSpanLoad(id: number, a: number, b: number, length: number, values: ReadonlyArray<readonly [number, number]>, points?: MemberEndpoints): { a: number; b: number; values: Array<[number, number]> } {
  let mapped = values.map(([i, j]): [number, number] => [i, j]);
  if (b > length && points) {
    requireEngine(intervalKernel !== null, 'member load interval');
    const result = intervalKernel!(Float64Array.from(points[0]), Float64Array.from(points[1]), a, b, Float64Array.from(values.flat()));
    [a, b, length] = result;
    mapped = values.map((_, k) => [result[3 + 2 * k], result[4 + 2 * k]]);
  }
  validateMemberLoadInterval(id, a, b, length);
  return { a, b, values: mapped };
}

export function spanEndpoints(a: number, b: number, length: number, id: number): { a?: number; b?: number } {
  validateMemberLoadInterval(id, a, b, length);
  return { a: a === 0 ? undefined : a, b: b === length ? undefined : b };
}

export function generatedMemberBounds(length: number, lengths: readonly number[], points?: readonly (readonly number[])[]): number[] {
  if (points) {
    const a = points[0], b = points[points.length - 1];
    const delta = a.map((x, k) => b[k] - x);
    const axis = delta.reduce((best, d, k) => Math.abs(d) > Math.abs(delta[best]) ? k : best, 0);
    let previous = 0;
    for (const point of points) {
      const t = (point[axis] - a[axis]) / delta[axis];
      if (!Number.isFinite(t) || t < previous || t > 1) throw new Error(tp('engine.memberLoad.geometryOrdering'));
      const parameterRounding = Number.EPSILON * 4 * (Math.abs(point[axis]) + Math.abs(a[axis]) + Math.abs(t * delta[axis])) / Math.abs(delta[axis]);
      for (let k = 0; k < a.length; k++) {
        const expected = a[k] + t * delta[k];
        const rounding = Number.EPSILON * 4 * (Math.abs(a[k]) + Math.abs(point[k]) + Math.abs(t * delta[k])) + Math.abs(delta[k]) * parameterRounding;
        if (!Number.isFinite(point[k]) || Math.abs(point[k] - expected) > rounding) throw new Error(tp('engine.memberLoad.geometryLine'));
      }
      previous = t;
    }
  }
  const bounds = [0];
  for (const child of lengths) {
    if (!Number.isFinite(child) || child <= 0) throw new Error(tp('engine.memberLoad.invalidGeometry'));
    bounds.push(bounds[bounds.length - 1] + child);
  }
  const total = bounds[bounds.length - 1];
  const rounding = Number.EPSILON * (lengths.length + 2) * Math.max(length, total);
  if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(total) || Math.abs(total - length) > rounding) {
    throw new Error(tp('engine.memberLoad.geometryPartition'));
  }
  bounds[bounds.length - 1] = length;
  return bounds;
}

export function remapSpanInterval(id: number, a: number, b: number, start: number, end: number, length: number): { lo: number; hi: number; scale: number; a?: number; b?: number } | null {
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(length) || end <= start || length <= 0) {
    throw new Error(tp('engine.memberLoad.invalidPiece'));
  }
  if (Math.abs(length - (end - start)) > Number.EPSILON * 4 * Math.max(Math.abs(start), Math.abs(end), length)) {
    throw new Error(tp('engine.memberLoad.geometrySpan', { id, span: end - start, length }));
  }
  const lo = Math.max(a, start), hi = Math.min(b, end);
  if (hi <= lo) return null;
  validateMemberLoadInterval(id, lo - start, hi - start, end - start);
  const scale = (end - start) / length;
  const local = (x: number) => (x - start) / scale;
  const endpoints = spanEndpoints(lo === start ? 0 : local(lo), hi === end ? length : local(hi), length, id);
  return { lo, hi, scale, ...endpoints };
}

export function splitSpanLoad(load: SpanLoad, length: number, pieces: Piece[], points?: MemberEndpoints): SolverLoad[] {
  const { a, b, values } = canonicalSpanLoad(load.data.elementId, load.data.a ?? 0, load.data.b ?? length, length, [[load.data.qI, load.data.qJ]], points);
  const [[qI, qJ]] = values;
  const at = (x: number) => x === a ? qI : x === b ? qJ : qI + (qJ - qI) * ((x - a) / (b - a));
  return pieces.flatMap((p): SolverLoad[] => {
    const interval = remapSpanInterval(p.id, a, b, p.start, p.end, p.length);
    if (!interval) return [];
    return [{ type: load.type, data: { ...load.data, elementId: p.id, qI: at(interval.lo) * interval.scale, qJ: at(interval.hi) * interval.scale, a: interval.a, b: interval.b } }];
  });
}
