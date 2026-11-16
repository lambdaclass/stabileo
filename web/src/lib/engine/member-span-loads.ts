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
    throw new Error(`Element ${id}: invalid distributed load interval [${a}, ${b}] on length ${length}`);
  }
  if ((b - a) / length < MEMBER_GEOMETRY_LIMIT) {
    throw new Error(`Element ${id}: distributed load interval [${a}, ${b}] on length ${length} is below the relative geometry limit ${MEMBER_GEOMETRY_LIMIT}`);
  }
}

export function spanEndpoints(a: number, b: number, length: number, id: number): { a?: number; b?: number } {
  validateMemberLoadInterval(id, a, b, length);
  return { a: a === 0 ? undefined : a, b: b === length ? undefined : b };
}

export function remapSpanInterval(id: number, a: number, b: number, start: number, end: number, length: number): { lo: number; hi: number; a?: number; b?: number } | null {
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(length) || end <= start || length <= 0) {
    throw new Error('Invalid generated member load piece');
  }
  const lo = Math.max(a, start), hi = Math.min(b, end);
  if (hi <= lo) return null;
  validateMemberLoadInterval(id, lo - start, hi - start, end - start);
  const local = (x: number) => length === end - start ? x - start : length * ((x - start) / (end - start));
  const endpoints = spanEndpoints(lo === start ? 0 : local(lo), hi === end ? length : local(hi), length, id);
  return { lo, hi, ...endpoints };
}

export function splitSpanLoad(load: SpanLoad, length: number, pieces: Piece[]): SolverLoad[] {
  const { qI, qJ } = load.data;
  const a = load.data.a ?? 0, b = load.data.b ?? length;
  spanEndpoints(a, b, length, load.data.elementId);
  const at = (x: number) => x === a ? qI : x === b ? qJ : qI + (qJ - qI) * ((x - a) / (b - a));
  return pieces.flatMap((p): SolverLoad[] => {
    const interval = remapSpanInterval(p.id, a, b, p.start, p.end, p.length);
    if (!interval) return [];
    return [{ type: load.type, data: { ...load.data, elementId: p.id, qI: at(interval.lo), qJ: at(interval.hi), a: interval.a, b: interval.b } }];
  });
}
