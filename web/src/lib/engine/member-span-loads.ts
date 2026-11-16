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

export function splitSpanLoad(load: SpanLoad, length: number, pieces: Piece[]): SolverLoad[] {
  const { qI, qJ } = load.data;
  const a = load.data.a ?? 0, b = load.data.b ?? length;
  spanEndpoints(a, b, length, load.data.elementId);
  const at = (x: number) => x === a ? qI : x === b ? qJ : qI + (qJ - qI) * ((x - a) / (b - a));
  return pieces.flatMap((p): SolverLoad[] => {
    if (!Number.isFinite(p.start) || !Number.isFinite(p.end) || !Number.isFinite(p.length) || p.end <= p.start || p.length <= 0) {
      throw new Error('Invalid generated member load piece');
    }
    const start = Math.max(a, p.start), end = Math.min(b, p.end);
    if (end <= start) return [];
    validateMemberLoadInterval(p.id, start - p.start, end - p.start, p.end - p.start);
    const local = (x: number) => p.length === p.end - p.start ? x - p.start : p.length * ((x - p.start) / (p.end - p.start));
    const x0 = start === p.start ? 0 : local(start);
    const x1 = end === p.end ? p.length : local(end);
    const endpoints = spanEndpoints(x0, x1, p.length, p.id);
    return [{ type: load.type, data: { ...load.data, elementId: p.id, qI: at(start), qJ: at(end), a: endpoints.a, b: endpoints.b } }];
  });
}
