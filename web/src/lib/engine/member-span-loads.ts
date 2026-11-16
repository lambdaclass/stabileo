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

function halfResultant(q: number, width: number): number {
  return Math.abs(width) < 2 ** -1022 ? (q * width) / 2 : q * (width / 2);
}

function adjacent(x: number, step: bigint): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  view.setBigUint64(0, view.getBigUint64(0) + step);
  return view.getFloat64(0);
}

function interiorStation(x: number, length: number): number {
  const at = x <= 0 ? Number.MIN_VALUE : x >= length ? adjacent(length, -1n) : x;
  if (!(at > 0 && at < length)) throw new Error('Generated member has no representable interior load station');
  return at;
}

function concentrated(type: SpanLoad['type'], elementId: number, at: number, length: number, force: number, moment: number): SolverLoad[] {
  if (!Number.isFinite(force) || !Number.isFinite(moment)) throw new Error('Non-finite generated member load resultant');
  if (type === 'distributed') return [{ type: 'pointOnElement', data: { elementId, a: at, p: force, my: moment } }];
  const out: SolverLoad[] = [{ type: 'pointOnElement', data: { elementId, a: at, p: 0, px: force } }];
  if (moment !== 0) {
    const other = adjacent(at, 1n) < length ? adjacent(at, 1n) : adjacent(at, -1n);
    if (!(other > 0 && other < length && other !== at)) throw new Error('Generated member has no representable axial load pair');
    const pair = moment / (other - at);
    if (!Number.isFinite(pair)) throw new Error('Non-finite generated axial load pair');
    out.push({ type: 'pointOnElement', data: { elementId, a: at, p: 0, px: -pair } },
      { type: 'pointOnElement', data: { elementId, a: other, p: 0, px: pair } });
  }
  return out;
}

export function splitSpanLoad(load: SpanLoad, length: number, pieces: Piece[]): SolverLoad[] {
  const { qI, qJ } = load.data;
  const a = load.data.a ?? 0, b = load.data.b ?? length;
  spanEndpoints(a, b, length);
  const at = (x: number) => x === a ? qI : x === b ? qJ : qI + (qJ - qI) * ((x - a) / (b - a));
  return pieces.flatMap((p): SolverLoad[] => {
    if (!Number.isFinite(p.start) || !Number.isFinite(p.end) || !Number.isFinite(p.length) || p.end <= p.start || p.length <= 0) {
      throw new Error('Invalid generated member load piece');
    }
    const start = Math.max(a, p.start), end = Math.min(b, p.end);
    if (end <= start) return [];
    const x0 = start === p.start ? 0 : p.length * ((start - p.start) / (p.end - p.start));
    const x1 = end === p.end ? p.length : p.length * ((end - p.start) / (p.end - p.start));
    const endpoints = spanEndpoints(x0, x1, p.length);
    const qi = at(start), qj = at(end);
    const width = end - start, mappedWidth = x1 - x0, delta = width - mappedWidth;
    const force = halfResultant(qi, width) + halfResultant(qj, width);
    const correction = halfResultant(qi, delta) + halfResultant(qj, delta);
    const shift = (start - p.start) - x0;
    const out: SolverLoad[] = mappedWidth > 0
      ? [{ type: load.type, data: { ...load.data, elementId: p.id, qI: qi, qJ: qj, ...endpoints } }]
      : [];
    if (delta === 0 && shift === 0) return out;
    const station = interiorStation(x0 + mappedWidth / 2, p.length);
    const moment = force * (shift + delta / 2) + correction * ((x0 - station) + mappedWidth / 2)
      + (halfResultant(qj, delta) - halfResultant(qi, delta)) * ((width + mappedWidth) / 6);
    if (correction !== 0 || moment !== 0) out.push(...concentrated(load.type, p.id, station, p.length, correction, moment));
    return out;
  });
}
