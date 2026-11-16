import type { SolverInput, SolverLoad } from './types';

type SpanLoad = Extract<SolverLoad, { type: 'distributed' | 'axialDistributed' }>;
interface Piece { id: number; start: number; end: number; length: number }

export function memberLength(input: Pick<SolverInput, 'nodes' | 'elements'>, id: number): number {
  const e = input.elements.get(id)!;
  const i = input.nodes.get(e.nodeI)!, j = input.nodes.get(e.nodeJ)!;
  const dx = j.x - i.x, dz = j.z - i.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function spanEndpoints(a: number, b: number, length: number): { a?: number; b?: number } {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < a || b > length) {
    throw new Error(`Invalid generated member load interval [${a}, ${b}] on length ${length}`);
  }
  return { a: a === 0 ? undefined : a, b: b === length ? undefined : b };
}

export function splitSpanLoad(load: SpanLoad, length: number, pieces: Piece[]): SpanLoad[] {
  const { qI, qJ } = load.data;
  const a = load.data.a ?? 0, b = load.data.b ?? length;
  spanEndpoints(a, b, length);
  const at = (x: number) => x === a ? qI : x === b ? qJ : qI + (qJ - qI) * ((x - a) / (b - a));
  return pieces.flatMap((p) => {
    const start = Math.max(a, p.start), end = Math.min(b, p.end);
    if (end <= start) return [];
    const x0 = start === p.start ? 0 : p.length * ((start - p.start) / (p.end - p.start));
    const x1 = end === p.end ? p.length : p.length * ((end - p.start) / (p.end - p.start));
    return [{ type: load.type, data: { ...load.data, elementId: p.id, qI: at(start), qJ: at(end), ...spanEndpoints(x0, x1, p.length) } }];
  });
}
