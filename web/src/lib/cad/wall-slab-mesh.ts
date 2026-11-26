import type { Vec3 } from '../model/edit/affine';
import { generateMesh, meshArea } from '../model/edit/mesher';
import { PLATE_EDGE_TOL } from '../model/physical/plate-analysis';
import { dist, signedArea, type Segment } from './geometry';
import type { CadPt } from './types';

export function clipTrace({ a, b }: Segment, outline: CadPt[], inset: number): Segment | null {
  let start = 0;
  let end = 1;
  for (const [i, p] of outline.entries()) {
    const q = outline[(i + 1) % outline.length]!;
    const dx = q.x - p.x, dy = q.y - p.y;
    const length = Math.hypot(dx, dy);
    const margin = (v: CadPt) => (dx * (v.y - p.y) - dy * (v.x - p.x)) / length - inset;
    const u = margin(a), v = margin(b);
    if (u < 0 && v < 0) return null;
    if (u < 0) start = Math.max(start, u / (u - v));
    if (v < 0) end = Math.min(end, u / (u - v));
    if (end <= start) return null;
  }
  const at = (t: number) => ({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
  return { a: at(start), b: at(end) };
}

function traceEdges(points: CadPt[], cells: number[][], { a, b }: Segment): Array<[number, number]> | null {
  const length = dist(a, b);
  const ux = (b.x - a.x) / length, uy = (b.y - a.y) / length;
  const stations = points.map(p => {
    const x = p.x - a.x, y = p.y - a.y;
    const station = x * ux + y * uy;
    return Math.abs(x * uy - y * ux) <= PLATE_EDGE_TOL
      && station >= -PLATE_EDGE_TOL && station <= length + PLATE_EDGE_TOL ? station : null;
  });
  const forward = new Map<number, number[]>();
  for (const cell of cells) {
    for (const [i, first] of cell.entries()) {
      const last = cell[(i + 1) % cell.length]!;
      const from = stations[first], to = stations[last];
      if (from == null || to == null || from === to) continue;
      const [lo, hi] = from < to ? [first, last] : [last, first];
      const next = forward.get(lo);
      if (next) next.push(hi);
      else forward.set(lo, [hi]);
    }
  }
  const ordered = stations.flatMap((station, i) => station == null ? [] : [{ station, i }])
    .sort((u, v) => u.station - v.station);
  if (ordered.length < 2 || ordered[0]!.station > PLATE_EDGE_TOL
    || ordered[ordered.length - 1]!.station < length - PLATE_EDGE_TOL) return null;
  const edges = ordered.slice(1).map(({ i }, k): [number, number] => [ordered[k]!.i, i]);
  return edges.every(([i, j]) => forward.get(i)?.includes(j)) ? edges : null;
}

function crossing({ a, b }: Segment, { a: c, b: d }: Segment): CadPt | null {
  const ux = b.x - a.x, uy = b.y - a.y;
  const vx = d.x - c.x, vy = d.y - c.y;
  const denominator = ux * vy - uy * vx;
  if (denominator === 0) return null;
  const dx = c.x - a.x, dy = c.y - a.y;
  const t = (dx * vy - dy * vx) / denominator;
  const u = (dx * uy - dy * ux) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + t * ux, y: a.y + t * uy };
}

export function meshSlabAlongWalls(
  corners: CadPt[], walls: Segment[], beams: Array<Segment & { id: number }>, fixed: CadPt[], size: number, divisions?: number,
): { outline: CadPt[]; points: CadPt[]; cells: number[][]; beamEdges: Map<number, Array<[number, number]>> } | null {
  if (corners.length !== 4) return null;
  const origin = corners[0]!;
  const signed = signedArea(corners.map(p => ({ x: p.x - origin.x, y: p.y - origin.y })));
  const area = Math.abs(signed);
  const outline = signed < 0 ? [...corners].reverse() : corners;
  if (!outline.every((p, i) => {
    const q = outline[(i + 1) % 4]!, r = outline[(i + 2) % 4]!;
    return (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x) > 0;
  })) return null;

  if (!walls.some(run => clipTrace(run, outline, PLATE_EDGE_TOL))) return null;
  const traces = [...walls, ...beams].flatMap((run: Segment & { id?: number }) => {
    const clipped = clipTrace(run, outline, 0);
    return clipped && dist(clipped.a, clipped.b) > PLATE_EDGE_TOL ? [{ ...clipped, id: run.id }] : [];
  });
  const stations = traces.flatMap(({ a, b }) => [a, b]);
  for (const [i, trace] of traces.entries()) {
    for (const other of traces.slice(i + 1)) {
      const point = crossing(trace, other);
      if (point) stations.push(point);
    }
  }
  const at = (p: CadPt): Vec3 => [p.x, p.y, 0];
  const mesh = generateMesh({
    outer: { kind: 'polygon', points: outline.map(at) },
    holes: [],
    size,
    sides: divisions === undefined ? undefined : outline.map(() => ({ divisions })),
    element: 'tri',
    fixedPoints: [...fixed, ...stations].map(at),
    fixedSegments: traces.map(({ a, b }) => [at(a), at(b)]),
  });
  if (!mesh || Math.abs(meshArea(mesh) - area) > Number.EPSILON * area * mesh.cells.length) return null;
  const points = mesh.points.map(([x, y]) => ({ x, y }));
  const required = fixed.filter(p => outline.every((a, i) => {
    const b = outline[(i + 1) % outline.length]!;
    return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= 0;
  }));
  if (!required.every(p => points.some(q => dist(p, q) <= PLATE_EDGE_TOL))) return null;
  const beamEdges = new Map<number, Array<[number, number]>>();
  for (const trace of traces) {
    const edges = traceEdges(points, mesh.cells, trace);
    if (!edges) return null;
    if (trace.id !== undefined) beamEdges.set(trace.id, edges);
  }
  return { outline, points, cells: mesh.cells, beamEdges };
}
