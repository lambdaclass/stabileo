import { tp } from '../i18n';
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

export function validateMemberLoadInterval(id: number, a: number, b: number, length: number): void {
  if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < a || b > length) {
    throw new Error(tp('engine.memberLoad.invalidInterval', { id, a, b, length }));
  }
  if ((b - a) / length < MEMBER_GEOMETRY_LIMIT) {
    throw new Error(tp('engine.memberLoad.geometryLimit', { id, a, b, length, limit: MEMBER_GEOMETRY_LIMIT }));
  }
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
      if (!Number.isFinite(t) || t < previous || t > 1) throw new Error('Invalid generated member geometry ordering');
      const parameterRounding = Number.EPSILON * 4 * (Math.abs(point[axis]) + Math.abs(a[axis]) + Math.abs(t * delta[axis])) / Math.abs(delta[axis]);
      for (let k = 0; k < a.length; k++) {
        const expected = a[k] + t * delta[k];
        const rounding = Number.EPSILON * 4 * (Math.abs(a[k]) + Math.abs(point[k]) + Math.abs(t * delta[k])) + Math.abs(delta[k]) * parameterRounding;
        if (!Number.isFinite(point[k]) || Math.abs(point[k] - expected) > rounding) throw new Error('Generated member geometry leaves the source line');
      }
      previous = t;
    }
  }
  const bounds = [0];
  for (const child of lengths) {
    if (!Number.isFinite(child) || child <= 0) throw new Error('Invalid generated member geometry');
    bounds.push(bounds[bounds.length - 1] + child);
  }
  const total = bounds[bounds.length - 1];
  const rounding = Number.EPSILON * (lengths.length + 2) * Math.max(length, total);
  if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(total) || Math.abs(total - length) > rounding) {
    throw new Error('Generated member geometry does not partition the source member');
  }
  bounds[bounds.length - 1] = length;
  return bounds;
}

export function remapSpanInterval(id: number, a: number, b: number, start: number, end: number, length: number): { lo: number; hi: number; scale: number; a?: number; b?: number } | null {
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(length) || end <= start || length <= 0) {
    throw new Error('Invalid generated member load piece');
  }
  if (Math.abs(length - (end - start)) > Number.EPSILON * 4 * Math.max(Math.abs(start), Math.abs(end), length)) {
    throw new Error(`Element ${id}: generated member geometry changes source span ${end - start} to length ${length}; distributed loads cannot be rescaled`);
  }
  const lo = Math.max(a, start), hi = Math.min(b, end);
  if (hi <= lo) return null;
  validateMemberLoadInterval(id, lo - start, hi - start, end - start);
  const scale = (end - start) / length;
  const local = (x: number) => (x - start) / scale;
  const endpoints = spanEndpoints(lo === start ? 0 : local(lo), hi === end ? length : local(hi), length, id);
  return { lo, hi, scale, ...endpoints };
}

export function splitSpanLoad(load: SpanLoad, length: number, pieces: Piece[]): SolverLoad[] {
  const { qI, qJ } = load.data;
  const a = load.data.a ?? 0, b = load.data.b ?? length;
  spanEndpoints(a, b, length, load.data.elementId);
  const at = (x: number) => x === a ? qI : x === b ? qJ : qI + (qJ - qI) * ((x - a) / (b - a));
  return pieces.flatMap((p): SolverLoad[] => {
    const interval = remapSpanInterval(p.id, a, b, p.start, p.end, p.length);
    if (!interval) return [];
    return [{ type: load.type, data: { ...load.data, elementId: p.id, qI: at(interval.lo) * interval.scale, qJ: at(interval.hi) * interval.scale, a: interval.a, b: interval.b } }];
  });
}
