import { physicalRoofRuns, snowCoordinate, samePhysicalPoint, collinearSnowMembers, connectedSnowMembers } from './physical-roof-geometry';
export { snowCoordinate } from './physical-roof-geometry';
import { roofMembers, type WindModel } from './wind-cases';
import { beamLike, type GravityLayout } from './plan-gravity';
import { UNBALANCED_WIDTH_LIMIT } from '../../codes/cirsoc104/snow';

type P2 = [number, number];
type Point = { x: number; y: number; z?: number };
const Z = (p: Point) => p.z ?? 0;
export const SNOW_INTENSITY_RELATIVE_ERROR = 1e-4;

export function onSnowRoof(layout: GravityLayout, piece: { elementId: number; roof: boolean }, only?: ReadonlySet<number>): boolean {
  if (!only) return piece.roof;
  return only.has(piece.elementId) && (piece.roof || !layout.roof.has(piece.elementId));
}

export class SnowRoofPlaneRefusal extends Error {
  constructor() { super('snow.refused.roofPlane'); }
}
export function boundedSnowIntensity(qI: number, centre: number, qJ: number, referenceScale = 0) {
  const scale = Math.max(referenceScale, Math.abs(qI), Math.abs(qJ), Math.abs(centre));
  if (!Number.isFinite(scale) || Math.max(qI, centre, qJ) > 0) throw new SnowRoofPlaneRefusal();
  const rawDelta = centre - (qI + qJ) / 2;
  if (!Number.isFinite(rawDelta)) throw new SnowRoofPlaneRefusal();
  const delta = Math.abs(rawDelta) <= 128 * Number.EPSILON * scale ? 0 : rawDelta;
  const count = Math.max(1, Math.ceil(Math.sqrt(Math.abs(delta) / (3 * SNOW_INTENSITY_RELATIVE_ERROR * scale)) || 0));
  const value = (t: number) => qI + (qJ - qI) * t + 4 * delta * t * (1 - t);
  const vertex = delta === 0 ? -1 : (qJ - qI + 4 * delta) / (8 * delta);
  const cuts = Array.from({ length: count + 1 }, (_, j) => j / count);
  if (vertex > 0 && vertex < 1 && cuts.every(t => t !== vertex)) cuts.push(vertex);
  cuts.sort((a, b) => a - b);
  const segments: Array<{ a: number; b: number; q: number; qJ: number }> = [];
  for (let j = 1; j < cuts.length; j++) {
    const start = cuts[j - 1]!, end = cuts[j]!, mid = (start + end) / 2;
    const first = value(start), last = value(end), middle = (8 * value(mid) - first - last) / 6;
    if (![first, middle, last].every(Number.isFinite) || Math.max(first, middle, last) > 128 * Number.EPSILON * scale) throw new SnowRoofPlaneRefusal();
    segments.push({ a: start, b: mid, q: Math.min(0, first), qJ: Math.min(0, middle) }, { a: mid, b: end, q: Math.min(0, middle), qJ: Math.min(0, last) });
  }
  return { segments, approximated: delta !== 0, absoluteErrorBound: Math.abs(delta) / (3 * count * count) + Math.abs(rawDelta - delta) };
}

const cross = (a: P2, b: P2, c: P2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);


function footprints(edges: Array<{ a: Point; b: Point }>, gradient: P2): P2[][] {
  const points: Point[] = [];
  const index = (p: Point) => {
    const k = points.findIndex(q => Math.hypot(p.x - q.x, p.y - q.y) < 1e-8);
    if (k >= 0) return k;
    points.push(p); return points.length - 1;
  };
  for (const e of edges) { index(e.a); index(e.b); }
  const adj = points.map(() => new Set<number>());
  const link = (a: number, b: number) => { adj[a]!.add(b); adj[b]!.add(a); };
  for (const e of edges) {
    const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, l2 = dx * dx + dy * dy;
    const on = points.map((q, k) => ({ k, t: ((q.x - e.a.x) * dx + (q.y - e.a.y) * dy) / l2 }))
      .filter(({ k, t }) => t >= -1e-9 && t <= 1 + 1e-9 && Math.abs(cross([e.a.x, e.a.y], [e.b.x, e.b.y], [points[k]!.x, points[k]!.y])) < 1e-8 * Math.sqrt(l2)).sort((a, b) => a.t - b.t);
    for (let k = 1; k < on.length; k++) link(on[k - 1]!.k, on[k]!.k);
  }
  const leaves = points.map((_, k) => k).filter(k => adj[k]!.size === 1);
  const norm = Math.hypot(...gradient);
  for (const z of [Math.min(...points.map(Z)), Math.max(...points.map(Z))]) {
    const row = leaves.filter(k => Math.abs(Z(points[k]!) - z) < 1e-8).sort((a, b) => (points[a]!.x - points[b]!.x) * -gradient[1] + (points[a]!.y - points[b]!.y) * gradient[0]);
    if (row.length < 2 || norm === 0) continue;
    const first = points[row[0]!]!;
    if (!row.every(k => Math.abs((points[k]!.x - first.x) * gradient[0] + (points[k]!.y - first.y) * gradient[1]) < 1e-8)) continue;
    const reachable = new Set([row[0]!]);
    for (const k of reachable) for (const j of adj[k]!) reachable.add(j);
    if (!row.every(k => reachable.has(k))) continue;
    if (!edges.some(e => reachable.has(index(e.a)) && reachable.has(index(e.b)) && Math.abs(Z(e.a) - Z(e.b)) < 1e-8 && Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) > 1e-8)) continue;
    for (let k = 1; k < row.length; k++) link(row[k - 1]!, row[k]!);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const [k, ns] of adj.entries()) if (ns.size === 1) {
      for (const j of ns) adj[j]!.delete(k);
      ns.clear(); changed = true;
    }
  }
  const ordered = adj.map((ns, k) => [...ns].sort((a, b) => Math.atan2(points[a]!.y - points[k]!.y, points[a]!.x - points[k]!.x) - Math.atan2(points[b]!.y - points[k]!.y, points[b]!.x - points[k]!.x)));
  const seen = new Set<string>(), out: P2[][] = [];
  for (const [start, ns] of ordered.entries()) for (const next of ns) {
    let a = start, b = next;
    const poly: P2[] = [];
    while (!seen.has(`${a}:${b}`)) {
      seen.add(`${a}:${b}`); poly.push([points[a]!.x, points[a]!.y]);
      const row = ordered[b]!, c = row[(row.indexOf(a) + row.length - 1) % row.length]!;
      a = b; b = c;
    }
    const area = signedSnowArea(poly);
    if (area < -1e-8) out.push(poly);
  }
  return out;
}

export function containsSnowPanel(pt: P2, poly: ReadonlyArray<P2>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j]!, b = poly[i]!;
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / l2)) : 0;
    if (Math.hypot(pt[0] - a[0] - t * dx, pt[1] - a[1] - t * dy) <= 1e-8) return true;
    if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}


function insideSnowPanel(pt: P2, poly: ReadonlyArray<P2>): boolean {
  return containsSnowPanel(pt, poly) && !poly.some((a, k) => {
    const b = poly[(k + 1) % poly.length]!, dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / l2 : 0;
    return t >= 0 && t <= 1 && Math.hypot(pt[0] - a[0] - t * dx, pt[1] - a[1] - t * dy) <= 1e-8;
  });
}


function signedSnowArea(poly: P2[]): number {
  return poly.reduce((sum, p, k) => sum + cross(poly[0]!, p, poly[(k + 1) % poly.length]!), 0);
}

function edgeOverlap(a: P2, b: P2, c: P2, d: P2): [number, number] | undefined {
  const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
  if (length === 0 || Math.abs(cross(a, b, c)) > 1e-8 * length || Math.abs(cross(a, b, d)) > 1e-8 * length) return undefined;
  const along = (p: P2) => ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length;
  const lo = Math.max(0, Math.min(along(c), along(d))), hi = Math.min(length, Math.max(along(c), along(d)));
  return hi - lo > 1e-8 ? [lo, hi] : undefined;
}

function overlaps(a: P2[], b: P2[]): boolean {
  const interior = (source: P2[], target: P2[]) => source.some((p, k) => {
    const q = source[(k + 1) % source.length]!, cuts = snowSegmentCuts(p, q, [target]);
    return cuts.slice(1).some((hi, j) => {
      const lo = cuts[j]!, t = (lo + hi) / 2;
      return (hi - lo) * Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-8
        && insideSnowPanel([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])], target);
    });
  });
  if (interior(a, b) || interior(b, a)) return true;
  const area = signedSnowArea(a) * signedSnowArea(b);
  return a.some((p, i) => b.some((r, j) => {
    const q = a[(i + 1) % a.length]!, s = b[(j + 1) % b.length]!;
    return edgeOverlap(p, q, r, s) && area * ((q[0] - p[0]) * (s[0] - r[0]) + (q[1] - p[1]) * (s[1] - r[1])) > 0;
  }));
}

export function snowSegmentCuts(a: P2, b: P2, polygons: ReadonlyArray<ReadonlyArray<P2>>): number[] {
  const ab: P2 = [b[0] - a[0], b[1] - a[1]], l2 = ab[0] ** 2 + ab[1] ** 2;
  const ts = [0, 1];
  if (l2 === 0) return ts;
  for (const poly of polygons) for (const [k, c] of poly.entries()) {
    const d = poly[(k + 1) % poly.length]!, cd: P2 = [d[0] - c[0], d[1] - c[1]];
    const ac: P2 = [c[0] - a[0], c[1] - a[1]], det = cross([0, 0], ab, cd);
    const error = 32 * Number.EPSILON * (Math.abs(ab[0]) * (Math.abs(c[1]) + Math.abs(d[1])) + Math.abs(ab[1]) * (Math.abs(c[0]) + Math.abs(d[0]))
      + (Math.abs(a[0]) + Math.abs(b[0])) * Math.abs(cd[1]) + (Math.abs(a[1]) + Math.abs(b[1])) * Math.abs(cd[0]));
    if (Math.abs(det) <= error) {
      if (Math.abs(cross(a, b, c)) <= 1e-8 * Math.sqrt(l2)) {
        for (const v of [c, d]) ts.push(((v[0] - a[0]) * ab[0] + (v[1] - a[1]) * ab[1]) / l2);
      }
    } else {
      const t = cross([0, 0], ac, cd) / det, u = cross([0, 0], ac, ab) / det;
      if (u >= -1e-9 && u <= 1 + 1e-9) ts.push(t);
    }
  }
  const stationError = 32 * Number.EPSILON * (Math.abs(a[0]) + Math.abs(a[1]) + Math.abs(b[0]) + Math.abs(b[1]) + Math.sqrt(l2)) / Math.sqrt(l2);
  return ts.map(t => Math.abs(t) <= stationError ? 0 : Math.abs(t - 1) <= stationError ? 1 : t)
    .filter(t => t >= 0 && t <= 1).sort((a, b) => a - b).filter((t, k, all) => k === 0 || t - all[k - 1]! > stationError);
}

function memberSupport(a: Point, b: Point, polygon: P2[]) {
  const start: P2 = [a.x, a.y], end: P2 = [b.x, b.y];
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const cuts = snowSegmentCuts(start, end, [polygon]);
  const intervals = cuts.slice(1).flatMap((hi, k) => {
    const lo = cuts[k]!;
    if ((hi - lo) * length <= 1e-8) return [];
    const t = (lo + hi) / 2;
    return [containsSnowPanel([a.x + t * (b.x - a.x), a.y + t * (b.y - a.y)], polygon)];
  });
  return { positive: intervals.some(Boolean), complete: intervals.length > 0 && intervals.every(Boolean) };
}

function inwardSnowPanel(a: Point, b: Point, polygon: P2[]): P2 {
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
  const edge = polygon.find((c, k) => edgeOverlap([a.x, a.y], [b.x, b.y], c, polygon[(k + 1) % polygon.length]!));
  const area = signedSnowArea(polygon);
  if (!edge || area === 0) throw new SnowRoofPlaneRefusal();
  const next = polygon[(polygon.indexOf(edge) + 1) % polygon.length]!;
  const sign = Math.sign(area) * Math.sign((next[0] - edge[0]) * dx + (next[1] - edge[1]) * dy);
  return [-sign * dy / length, sign * dx / length];
}

function segmentAbovePanel(a: Point, b: Point, polygon: P2[], z: number): boolean {
  const point = (t: number): P2 => [a.x + t * (b.x - a.x), a.y + t * (b.y - a.y)];
  const height = (t: number) => Z(a) + t * (Z(b) - Z(a));
  const ts = snowSegmentCuts([a.x, a.y], [b.x, b.y], [polygon]);
  const low = Z(a) <= Z(b) ? a : b;
  return Z(low) > z + 1e-8 && containsSnowPanel([low.x, low.y], polygon)
    || ts.some(t => height(t) > z + 1e-8 && insideSnowPanel(point(t), polygon))
    || ts.some((hi, k) => k > 0 && Math.max(height(ts[k - 1]!), height(hi)) > z + 1e-8 && containsSnowPanel(point((ts[k - 1]! + hi) / 2), polygon));
}

export interface SnowPlane {
  kind: 'plane' | 'section';
  origin: Point;
  gradient: P2;
  polygon: P2[];
  members: Set<number>;
  slope: number;
  W: number;
  elevation: (pt: P2) => number;
}

export interface RoofGeometry {
  axis: 'x' | 'y';
  ridge: number;
  W: number;
  slopeDeg: number;
  direction: P2;
  transverse: P2;
  origin: { x: number; y: number };
}


export function roofSurfaceModel(model: WindModel, only?: ReadonlySet<number>) {
  const exposed = roofMembers(model);
  const targetIds = new Set((only ? roofMembers(model, only) : exposed).map(m => m.id));
  const roofIds = new Set([...exposed.map(m => m.id), ...targetIds]);
  const roof = [...model.elements.values()].filter(e => (e as { type?: string }).type !== 'truss' && beamLike(model, e).ok).flatMap(e => {
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    if (Z(a) <= 0.05 || Z(b) <= 0.05) return [];
    const dx = b.x - a.x, dy = b.y - a.y, dz = Z(b) - Z(a);
    return [{ id: e.id, a, b, dx, dy, dz, lh: Math.hypot(dx, dy), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }];
  });
  const targets = roof.filter(m => targetIds.has(m.id));
  const runs = physicalRoofRuns(targets);
  const parent = roof.map((_, k) => k);
  const root = (k: number): number => parent[k] === k ? k : (parent[k] = root(parent[k]!));
  for (let a = 0; a < roof.length; a++) for (let b = a + 1; b < roof.length; b++) {
    if ([roof[a]!.a, roof[a]!.b].some(p => [roof[b]!.a, roof[b]!.b].some(q => samePhysicalPoint(p, q)))) parent[root(a)] = root(b);
  }
  const component = new Map(roof.map((m, k) => [m.id, root(k)]));
  const sloped = roof.filter(m => Math.abs(m.dz) > 1e-8 * m.lh);
  const planes: SnowPlane[] = [];
  const atMember = new Map<number, SnowPlane>();
  for (const m of sloped) {
    const connected = roof.filter(r => component.get(r.id) === component.get(m.id));
    const candidates: Array<{ gradient: P2; supported: typeof roof; score: number }> = [];
    for (const pool of [connected]) {
      for (const other of pool) {
        if (other.id === m.id) continue;
        for (const p of [other.a, other.b]) {
          const x = p.x - m.a.x, y = p.y - m.a.y, z = Z(p) - Z(m.a);
          const det = m.dx * y - m.dy * x;
          if (Math.abs(det) <= 1e-10 * m.lh * Math.hypot(x, y)) continue;
          const gradient: P2 = [(m.dz * y - m.dy * z) / det, (m.dx * z - m.dz * x) / det];
          const on = (q: Point) => Math.abs(Z(q) - Z(m.a) - gradient[0] * (q.x - m.a.x) - gradient[1] * (q.y - m.a.y)) <= 1e-8;
          if (!on(other.a) || !on(other.b)) continue;
          const supported = pool.filter(r => on(r.a) && on(r.b));
          candidates.push({ gradient, supported, score: supported.reduce((s, r) => s + r.lh, 0) });
        }
      }
      if (candidates.length) break;
    }
    candidates.sort((a, b) => b.score - a.score || Math.hypot(...a.gradient) - Math.hypot(...b.gradient));
    const unique = candidates.filter((c, k) => !candidates.slice(0, k).some(p => Math.hypot(p.gradient[0] - c.gradient[0], p.gradient[1] - c.gradient[1]) < 1e-8));
    const bounded = unique.filter(c => footprints(c.supported, c.gradient).some(p => memberSupport(m.a, m.b, p).positive));
    for (const best of bounded.length ? bounded : [candidates[0]]) {
      const gradient: P2 = best?.gradient ?? [m.dz * m.dx / m.lh ** 2, m.dz * m.dy / m.lh ** 2];
      const supported = best?.supported ?? collinearSnowMembers(connected, m, gradient);
      if (!supported.some(r => roofIds.has(r.id))) continue;
      const norm = Math.hypot(...gradient);
      const outlines = best ? footprints(supported, gradient) : [];
      const polygons = outlines.some(p => memberSupport(m.a, m.b, p).positive) ? outlines : [[]];
      const section = connectedSnowMembers(m, supported);
      for (const polygon of polygons) {
        const members = polygon.length ? supported.filter(r => memberSupport(r.a, r.b, polygon).positive) : section;
        if (!members.some(r => r.id === m.id)) continue;
        const existing = planes.find(p => p.members.has(m.id) && Math.hypot(p.gradient[0] - gradient[0], p.gradient[1] - gradient[1]) < 1e-8 && Math.abs(p.elevation([m.a.x, m.a.y]) - Z(m.a)) < 1e-8);
        if (existing) { atMember.set(m.id, existing); continue; }
        const points: P2[] = polygon.length ? polygon : members.flatMap(r => [[r.a.x, r.a.y] as P2, [r.b.x, r.b.y] as P2]);
        const coordinates = points.map(p => ((p[0] - m.a.x) * gradient[0] + (p[1] - m.a.y) * gradient[1]) / norm);
        const plane: SnowPlane = {
          kind: polygon.length ? 'plane' : 'section', origin: m.a, gradient, members: new Set(members.map(r => r.id)),
          polygon, slope: Math.atan(norm) * 180 / Math.PI,
          W: Math.max(...coordinates) - Math.min(...coordinates),
          elevation: pt => Z(m.a) + gradient[0] * (pt[0] - m.a.x) + gradient[1] * (pt[1] - m.a.y),
        };
        planes.push(plane); atMember.set(m.id, plane);
      }
    }
  }
  for (const m of roof) {
    if (atMember.has(m.id)) continue;
    const on = planes.filter(p => p.members.has(m.id));
    if (on.length) atMember.set(m.id, on[0]!);
  }
  const supportFor = (id: number) => {
    const m = roof.find(r => r.id === id);
    if (!m) return { planes: [], partial: false };
    const on = planes.filter(p => p.kind === 'plane'
      && [m.a, m.b].every(q => Math.abs(p.elevation([q.x, q.y]) - Z(q)) < 1e-8))
      .map(p => ({ plane: p, support: memberSupport(m.a, m.b, p.polygon) })).filter(p => p.support.positive);
    return {
      planes: on.length ? on.map(p => p.plane) : planes.filter(p => p.kind === 'section' && p.members.has(id)),
      partial: on.some(p => !p.support.complete),
    };
  };
  const memberPlanes = (id: number) => {
    const support = supportFor(id);
    if (support.partial) throw new SnowRoofPlaneRefusal();
    return support.planes;
  };
  for (const m of roof) {
    const ps = supportFor(m.id).planes;
    if (ps[0]) atMember.set(m.id, ps[0]);
  }
  for (let k = planes.length - 1; k >= 0; k--) {
    const p = planes[k]!;
    if (p.kind === 'section' && [...p.members].every(id => supportFor(id).planes.some(q => q.kind === 'plane'))) planes.splice(k, 1);
  }
  const targetPlaneSet = new Set(roof.filter(m => targetIds.has(m.id)).flatMap(m => supportFor(m.id).planes));
  const targetPlanes = planes.filter(p => !only || targetPlaneSet.has(p));
  const sourceWidth = (source: SnowPlane) => {
    const norm = Math.hypot(...source.gradient), dir: P2 = [source.gradient[0] / norm, source.gradient[1] / norm];
    const group = new Set([source]);
    for (const p of group) for (const q of planes) {
      if (group.has(q) || q.kind !== 'plane' || Math.abs(cross([0, 0], dir, q.gradient)) > 1e-8 || dir[0] * q.gradient[0] + dir[1] * q.gradient[1] <= 0) continue;
      const shared = p.polygon.some((a, k) => {
        const b = p.polygon[(k + 1) % p.polygon.length]!, dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
        return q.polygon.some((c, j) => {
          const d = q.polygon[(j + 1) % q.polygon.length]!;
          const overlap = edgeOverlap(a, b, c, d);
          return overlap !== undefined && overlap.every(t => {
            const pt: P2 = [a[0] + t * dx / len, a[1] + t * dy / len];
            return Math.abs(p.elevation(pt) - q.elevation(pt)) < 1e-8;
          });
        });
      });
      if (shared) group.add(q);
    }
    const coords = [...group].flatMap(p => p.polygon.map(v => (v[0] - source.origin.x) * dir[0] + (v[1] - source.origin.y) * dir[1]));
    return coords.length ? Math.max(...coords) - Math.min(...coords) : source.W;
  };
  const readPanel = (index: number, layout?: GravityLayout) => {
    const p = layout?.panels[index];
    const datum = p ? [...model.nodes.values()].filter(n => Math.abs(Z(n) - p.z) <= 0.05 && p.polygon.some(v => Math.hypot(n.x - v[0], n.y - v[1]) < 1e-8))
      .sort((a, b) => Math.abs(Z(a) - p.z) - Math.abs(Z(b) - p.z))[0] : undefined;
    const eligible = planes.filter(sf => p && sf.polygon.length >= 3 && overlaps(p.polygon, sf.polygon));
    const at = (pt: P2) => eligible.filter(sf => sf.elevation(pt) >= (p?.z ?? 0) - 0.05 && containsSnowPanel(pt, sf.polygon))
      .filter(sf => !layout?.panels.some(other => other !== p && other.z > (p?.z ?? 0) + 0.05 && other.z <= sf.elevation(pt) + 0.05 && insideSnowPanel(pt, other.polygon)))
      .sort((a, b) => a.elevation(pt) - b.elevation(pt))[0];
    const centre: P2 = p ? [p.polygon.reduce((s, v) => s + v[0], 0) / p.polygon.length, p.polygon.reduce((s, v) => s + v[1], 0) / p.polygon.length] : [0, 0];
    const resolved = !p || !layout?.points.some(pt => pt.roof && pt.panel === index && eligible.length > 1) && !planes.some(sf => sf.kind === 'section' && [...sf.members].some(id => {
      const m = roof.find(r => r.id === id)!;
      return segmentAbovePanel(m.a, m.b, p.polygon, p.z);
    }));
    return { resolved, planes: eligible, planeAt: at, slope: at(centre)?.slope ?? 0, slopeAt: (pt: P2) => at(pt)?.slope ?? 0, elevation: (pt: P2) => at(pt)?.elevation(pt) ?? (datum ? Z(datum) : p?.z ?? 0) };
  };
  const cache = new WeakMap<GravityLayout, Map<number, ReturnType<typeof readPanel>>>();
  const panel = (index: number, layout?: GravityLayout) => {
    if (!layout) return readPanel(index);
    let byIndex = cache.get(layout);
    if (!byIndex) { byIndex = new Map(); cache.set(layout, byIndex); }
    let value = byIndex.get(index);
    if (!value) { value = readPanel(index, layout); byIndex.set(index, value); }
    if (!value.resolved) throw new SnowRoofPlaneRefusal();
    return value;
  };
  const approximation = { maxAbsoluteError: 0 };
  const pieceLoads = (pc: GravityLayout['pieces'][number], layout: GravityLayout, pressure: (plane: SnowPlane | undefined, pt: P2, inside: P2) => number, boundaries: P2[][] = []) => {
    const e = model.elements.get(pc.elementId)!;
    const memberA = model.nodes.get(e.nodeI)!, memberB = model.nodes.get(e.nodeJ)!;
    const memberLength = Math.hypot(memberB.x - memberA.x, memberB.y - memberA.y, Z(memberB) - Z(memberA));
    const run = allocationRunAtMember.get(pc.elementId);
    const a = run?.a ?? memberA, b = run?.b ?? memberB;
    const L = Math.hypot(b.x - a.x, b.y - a.y, Z(b) - Z(a));
    const horizontalLength = Math.hypot(b.x - a.x, b.y - a.y);
    const direction: P2 = [(b.x - a.x) / horizontalLength, (b.y - a.y) / horizontalLength];
    const position = (p: Point) => snowCoordinate([p.x, p.y], [a.x, a.y], direction, [0, horizontalLength]) * L / horizontalLength;
    const offset = position(memberA), sense = position(memberB) >= offset ? 1 : -1;
    const from = offset + sense * (pc.a ?? 0), to = offset + sense * (pc.b ?? memberLength);
    const dir: P2 = [(b.x - a.x) / L, (b.y - a.y) / L];
    const poly = layout.panels[pc.panel]!.polygon;
    const inward = inwardSnowPanel(a, b, poly);
    const pitched = memberPlanes(pc.elementId).length > 0;
    const strips = layout.pieces.filter(p => p.panel === pc.panel && (run ? run.members.has(p.elementId) : p === pc)).map(p => {
      const edge = model.elements.get(p.elementId)!, i = model.nodes.get(edge.nodeI)!, j = model.nodes.get(edge.nodeJ)!;
      const length = Math.hypot(j.x - i.x, j.y - i.y, Z(j) - Z(i)), start = position(i), sign = position(j) >= start ? 1 : -1;
      const lo = start + sign * (p.a ?? 0), hi = start + sign * (p.b ?? length);
      return lo < hi ? { a: lo, b: hi, wI: p.wI, wJ: p.wJ, sources: new Set([p]) } : { a: hi, b: lo, wI: p.wJ, wJ: p.wI, sources: new Set([p]) };
    }).sort((a, b) => a.a - b.a);
    const merged: typeof strips = [];
    for (const strip of strips) {
      const slope = (strip.wJ - strip.wI) / (strip.b - strip.a);
      const joined = merged.find(p => strip.a <= p.b + 1e-8
        && Math.abs((p.wJ - p.wI) / (p.b - p.a) - slope) < 1e-9
        && Math.abs(p.wI + slope * (strip.a - p.a) - strip.wI) < 1e-9);
      if (joined) {
        if (strip.b > joined.b) { joined.b = strip.b; joined.wJ = strip.wJ; }
        for (const source of strip.sources) joined.sources.add(source);
      } else merged.push({ ...strip, sources: new Set(strip.sources) });
    }
    const physicalPolygon = (polygon: P2[]) => polygon.filter((p, k) => {
      const prev = polygon[(k + polygon.length - 1) % polygon.length]!, next = polygon[(k + 1) % polygon.length]!;
      return Math.abs(cross(prev, p, next)) > 1e-8 * Math.hypot(next[0] - prev[0], next[1] - prev[1]);
    });
    const polygons = [...planes.map(p => physicalPolygon(p.polygon)), ...boundaries];
    const cuts = (a: P2, b: P2) => snowSegmentCuts(a, b, polygons);
    const out: Array<{ q: number; qJ: number; a: number; b: number }> = [];
    const append = (lo: number, hi: number, qI: number, qJ: number) => {
      const start = Math.max(lo, Math.min(from, to)), end = Math.min(hi, Math.max(from, to));
      const error = 64 * Number.EPSILON * (L + Math.abs(from) + Math.abs(to));
      if (end - start <= error) return;
      const q = (x: number) => {
        const t = (x - lo) / (hi - lo);
        return (1 - t) * qI + t * qJ;
      };
      const first = sense > 0 ? start : end, last = sense > 0 ? end : start;
      const station = (x: number) => {
        const value = (x - offset) * sense;
        return Math.abs(value - (pc.a ?? 0)) <= error ? pc.a ?? 0 : Math.abs(value - (pc.b ?? memberLength)) <= error ? pc.b ?? memberLength : value;
      };
      out.push({ a: station(first), b: station(last), q: q(first), qJ: q(last) });
    };
    for (const strip of merged.filter(strip => strip.sources.has(pc))) {
      const overlap = Math.min(strip.b, Math.max(from, to)) - Math.max(strip.a, Math.min(from, to));
      if (overlap <= 64 * Number.EPSILON * (L + Math.abs(from) + Math.abs(to))) continue;
      const x0 = strip.a, x1 = strip.b;
      const depth = (x: number) => {
        const value = strip.wI + (strip.wJ - strip.wI) * (x - x0) / (x1 - x0);
        const error = 32 * Number.EPSILON * (Math.abs(strip.wI) + Math.abs(strip.wJ) + L);
        return Math.abs(value) <= error ? 0 : value;
      };
      const point = (x: number, d: number): P2 => [a.x + dir[0] * x + inward[0] * d, a.y + dir[1] * x + inward[1] * d];
      const sf = panel(pc.panel, layout);
      const intensity = (x: number, insideX: number) => {
        const dep = depth(x);
        if (dep <= 0) return 0;
        const ts = cuts(point(x, 0), point(x, dep));
        let q = 0;
        for (let k = 1; k < ts.length; k++) {
          const lo = ts[k - 1]!, hi = ts[k]!, pt = point(x, dep * (lo + hi) / 2);
          const inside = point(insideX, depth(insideX) * (lo + hi) / 2), plane = sf.planeAt(inside);
          if (pitched && !plane) throw new SnowRoofPlaneRefusal();
          q += dep * (hi - lo) * pressure(plane, pt, inside);
        }
        return -q;
      };
      const activeStrips = strips.filter(p => {
        const source = [...p.sources][0]!;
        return strip.sources.has(source) && onSnowRoof(layout, source, only);
      });
      const sourceEvents = strips.filter(p => strip.sources.has([...p.sources][0]!))
        .flatMap(p => {
          const active = activeStrips.includes(p) ? 1 : 0;
          return [{ x: p.a, delta: 1, active }, { x: p.b, delta: -1, active: -active }];
        }).sort((a, b) => a.x - b.x);
      const coverageChanges: typeof sourceEvents = [];
      for (const event of sourceEvents) {
        const last = coverageChanges[coverageChanges.length - 1];
        if (last && Math.abs(last.x - event.x) < 1e-8) { last.delta += event.delta; last.active += event.active; }
        else coverageChanges.push({ ...event });
      }
      const xs = [x0, x1, ...coverageChanges.filter(e => e.delta !== 0 || e.active !== 0).map(e => e.x)];
      for (const d of [0, 1]) for (const t of cuts(point(x0, d * depth(x0)), point(x1, d * depth(x1)))) xs.push(x0 + (x1 - x0) * t);
      for (const polygon of polygons) for (const v of polygon) {
        const x = ((v[0] - a.x) * dir[0] + (v[1] - a.y) * dir[1]) / (dir[0] ** 2 + dir[1] ** 2);
        if (x > x0 && x < x1) xs.push(x);
      }
      const sorted = [x0, ...xs.filter(x => x > x0 + 1e-8 && x < x1 - 1e-8).sort((a, b) => a - b).filter((x, k, all) => k === 0 || x - all[k - 1]! > 1e-8), x1];
      const intervals = sorted.slice(1).flatMap((hi, k) => {
        const lo = sorted[k]!, mid = (lo + hi) / 2;
        const active = coverageChanges.reduce((count, event) => count + (event.x <= mid ? event.active : 0), 0);
        if (active === 0) return [];
        return [{ lo, hi, qI: intensity(lo, lo + (hi - lo) * 1e-6), qJ: intensity(hi, hi - (hi - lo) * 1e-6), centre: intensity(mid, mid) }];
      });
      const referenceScale = intervals.reduce((scale, p) => Math.max(scale, Math.abs(p.qI), Math.abs(p.qJ), Math.abs(p.centre)), 0);
      for (const { lo, hi, qI, qJ, centre } of intervals) {
        const profile = boundedSnowIntensity(qI, centre, qJ, referenceScale);
        if (profile.approximated) approximation.maxAbsoluteError = Math.max(approximation.maxAbsoluteError, profile.absoluteErrorBound);
        for (const segment of profile.segments) append(lo + (hi - lo) * segment.a, lo + (hi - lo) * segment.b, segment.q, segment.qJ);
      }
    }
    out.sort((a, b) => a.a - b.a);
    const loads: typeof out = [];
    const loadScale = out.reduce((scale, p) => Math.max(scale, Math.abs(p.q), Math.abs(p.qJ)), 0);
    const coordinateScale = Math.abs(a.x) + Math.abs(a.y) + Math.abs(b.x) + Math.abs(b.y) + L;
    const depthScale = strips.reduce((scale, p) => Math.min(scale, ...[p.wI, p.wJ].filter(w => w > 0)), L);
    const coalescingRoundoff = Math.min(1e-9, 128 * Number.EPSILON * loadScale * (1 + coordinateScale / depthScale));
    for (const p of out) {
      const last = loads[loads.length - 1];
      const combined = (x: number) => {
        const t = (x - last!.a) / (p.b - last!.a);
        return (1 - t) * last!.q + t * p.qJ;
      };
      if (last && Math.abs(last.b - p.a) < 1e-8
        && Math.abs(last.qJ - p.q) < 1e-9
        && Math.abs((last.qJ - last.q) / (last.b - last.a) - (p.qJ - p.q) / (p.b - p.a)) < 1e-9
        && Math.abs(last.qJ - combined(last.b)) <= coalescingRoundoff
        && Math.abs(p.q - combined(p.a)) <= coalescingRoundoff) { last.b = p.b; last.qJ = p.qJ; }
      else loads.push(p);
    }
    return loads.map(p => ({ elementId: pc.elementId, q: p.q, qJ: p.qJ, ...(loads.length === 1 && pc.a === undefined ? {} : { a: p.a, b: p.b }), frame: 'projected' as const }));
  };
  const transverse = (direction: P2): P2 => {
    const axis: P2 = [-direction[1], direction[0]];
    const reference = roof.find(m => targetIds.has(m.id) && Math.abs(m.dx * axis[0] + m.dy * axis[1]) > 1e-8 * m.lh);
    return reference && reference.dx * axis[0] + reference.dy * axis[1] > 0 ? [-axis[0], -axis[1]] : axis;
  };
  const orientations: P2[] = [];
  for (const p of planes) {
    const norm = Math.hypot(...p.gradient), dir: P2 = [p.gradient[0] / norm, p.gradient[1] / norm];
    if (!orientations.some(other => Math.abs(cross([0, 0], dir, other)) <= 1e-9)) orientations.push(dir);
  }
  const edgeRanges = (a: P2, b: P2, layout: GravityLayout, margins: (pt: P2) => number[]) => {
    const point = (t: number): P2 => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    const cuts = snowSegmentCuts(a, b, [...planes.map(p => p.polygon), ...layout.panels.map(p => p.polygon)]);
    const out: Array<{ from: number; to: number; point: P2 }> = [];
    for (let k = 1; k < cuts.length; k++) {
      const lo = cuts[k - 1]!, hi = cuts[k]!;
      const m0 = margins(point(lo + (hi - lo) / 4)), mm = margins(point((lo + hi) / 2)), m1 = margins(point(lo + 3 * (hi - lo) / 4));
      const roots = m0.flatMap((v, j) => {
        let a = 8 * (v - 2 * mm[j]! + m1[j]!);
        const error = 128 * Number.EPSILON * Math.max(Math.abs(v), Math.abs(mm[j]!), Math.abs(m1[j]!));
        if (Math.abs(a) <= error) a = 0;
        const b = 2 * (m1[j]! - v) - a, c = mm[j]! - a / 4 - b / 2;
        if (a === 0) return b === 0 ? [] : [-c / b];
        const det = b * b - 4 * a * c;
        if (det < 0) return [];
        const q = -(b + (b < 0 ? -1 : 1) * Math.sqrt(det)) / 2;
        return q === 0 ? [-b / (2 * a)] : [q / a, c / q];
      }).filter(t => t > 0 && t < 1).map(t => lo + (hi - lo) * t);
      const ts = [lo, ...roots.sort((a, b) => a - b).filter((v, j, all) => j === 0 || v - all[j - 1]! > 128 * Number.EPSILON), hi];
      for (let j = 1; j < ts.length; j++) out.push({ from: ts[j - 1]!, to: ts[j]!, point: point((ts[j - 1]! + ts[j]!) / 2) });
    }
    return out;
  };
  const edgeHeights = (a: P2, b: P2, layout: GravityLayout, left: number, right: number) => edgeRanges(a, b, layout, () => []).flatMap(r => {
    const L = panel(left, layout), R = panel(right, layout);
    const lp = L.planeAt(r.point), rp = R.planeAt(r.point);
    return [r.from, (r.from + r.to) / 2, r.to].flatMap(t => {
      const pt: P2 = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      return [L.elevation(pt) - R.elevation(pt), (lp?.elevation(pt) ?? L.elevation(pt)) - (rp?.elevation(pt) ?? R.elevation(pt))];
    });
  });
  const resolves = (layout?: GravityLayout) => {
    if (roof.some(m => targetIds.has(m.id) && supportFor(m.id).partial)) return false;
    if (!layout) return true;
    if (!layout.panels.every((p, k) => !p.roof || readPanel(k, layout).resolved)) return false;
    try {
      for (const pc of layout.pieces) if (targetIds.has(pc.elementId) && onSnowRoof(layout, pc, only)) pieceLoads(pc, layout, () => 0);
    } catch (error) {
      if (error instanceof SnowRoofPlaneRefusal) return false;
      throw error;
    }
    return true;
  };
  const profilePoints = runs.flatMap(r => [r.a, r.b]).filter((p, k, all) => !all.slice(0, k).some(q => samePhysicalPoint(p, q)));
  const runAtMember = new Map(runs.flatMap(r => [...r.members].map(id => [id, r] as const)));
  const allocationRunAtMember = new Map(physicalRoofRuns(roof).flatMap(r => [...r.members].map(id => [id, r] as const)));
  const geometry = (() : RoofGeometry | null => {
    if (!targets.length) return null;
    const longest = runs.reduce((best, run) => run.length - best.length > 32 * Number.EPSILON * Math.max(run.length, best.length) ? run : best);
    const alignment = (p: SnowPlane) => (-longest.direction[1] * p.gradient[0] + longest.direction[0] * p.gradient[1]) / Math.hypot(...p.gradient);
    const primary = targetPlanes.reduce<SnowPlane | undefined>((best, p) => !best || alignment(p) - alignment(best) > 32 * Number.EPSILON ? p : best, undefined);
    const norm = primary ? Math.hypot(...primary.gradient) : 1;
    const direction: P2 = primary ? [primary.gradient[0] / norm, primary.gradient[1] / norm] : [-longest.direction[1], longest.direction[0]];
    const origin = targets[0]!.a;
    const coord = (p: Point) => snowCoordinate([p.x, p.y], [origin.x, origin.y], direction);
    const zMax = Math.max(...profilePoints.map(Z));
    const top = profilePoints.filter(p => Math.abs(Z(p) - zMax) <= 1e-8);
    const ridge = (Math.min(...top.map(coord)) + Math.max(...top.map(coord))) / 2;
    const low = profilePoints.reduce((a, b) => coord(a) <= coord(b) ? a : b);
    const width = Math.max(...profilePoints.map(p => snowCoordinate([p.x, p.y], [low.x, low.y], direction, [0, 2 * UNBALANCED_WIDTH_LIMIT]))) / 2;
    const sloped = runs.filter(r => Math.abs(Z(r.b) - Z(r.a)) > 1e-8 * r.length);
    const weight = sloped.reduce((s, r) => s + r.length, 0);
    const slopeDeg = weight ? sloped.reduce((s, r) => s + atMember.get([...r.members][0]!)!.slope * r.length, 0) / weight
      : targetPlanes.length && only ? targetPlanes.reduce((s, p) => s + p.slope, 0) / targetPlanes.length : 0;
    const W = primary ? Math.max(...targetPlanes.map(p => p.W)) : width;
    return { axis: Math.abs(direction[0]) >= Math.abs(direction[1]) ? 'x' : 'y', direction, transverse: transverse(direction), origin, ridge, W, slopeDeg };
  })();
  const roofCoordinates = geometry ? profilePoints.map(p => snowCoordinate([p.x, p.y], [geometry.origin.x, geometry.origin.y], geometry.direction)) : [];
  const transverseCoordinates = geometry ? profilePoints.map(p => snowCoordinate([p.x, p.y], [geometry.origin.x, geometry.origin.y], geometry.transverse)) : [];
  const roofPoint = (p: Point) => geometry ? {
    x: snowCoordinate([p.x, p.y], [geometry.origin.x, geometry.origin.y], geometry.direction, [geometry.ridge, ...roofCoordinates]),
    y: snowCoordinate([p.x, p.y], [geometry.origin.x, geometry.origin.y], geometry.transverse, transverseCoordinates), z: p.z,
  } : p;
  const memberValues = (id: number, field: (p: Point) => number, point?: Point): [number, number] => {
    const run = runAtMember.get(id), m = targets.find(m => m.id === id);
    if (!run || !m) return [0, 0];
    const a = field(run.a), b = field(run.b);
    const at = (p: Point) => a + (b - a) * snowCoordinate([p.x, p.y], [run.a.x, run.a.y], run.direction, [0, run.length]) / run.length;
    return point ? [at(point), at(point)] : [at(m.a), at(m.b)];
  };
  const pressureProfile = (field: (id: number, point: Point, inside: Point, surface?: SnowPlane, panel?: number) => number, splitRidge = false) => {
    const boundaries: P2[][] = [];
    if (splitRidge && geometry && targets.some(m => supportFor(m.id).planes.length === 0)) {
      const centre: P2 = [geometry.origin.x + geometry.ridge * geometry.direction[0], geometry.origin.y + geometry.ridge * geometry.direction[1]];
      const extent = 1 + Math.max(...profilePoints.map(p => Math.hypot(p.x - centre[0], p.y - centre[1])));
      boundaries.push([-1, 1].map(sign => [centre[0] + sign * extent * geometry.transverse[0], centre[1] + sign * extent * geometry.transverse[1]]));
    }
    const memberLoads = (id: number, from = 0, to?: number) => {
      const e = model.elements.get(id)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
      const length = Math.hypot(b.x - a.x, b.y - a.y, Z(b) - Z(a)), end = to ?? length;
      const point = (x: number): Point => ({ x: a.x + (b.x - a.x) * x / length, y: a.y + (b.y - a.y) * x / length, z: Z(a) + (Z(b) - Z(a)) * x / length });
      const startStation = roofPoint(a).x, endStation = roofPoint(b).x;
      const crossing = boundaries.length && supportFor(id).planes.length === 0 && startStation !== endStation ? (geometry!.ridge - startStation) * length / (endStation - startStation) : undefined;
      const cuts = [from, ...(crossing !== undefined && crossing > from && crossing < end ? [crossing] : []), end];
      return cuts.slice(1).map((hi, k) => {
        const lo = cuts[k]!, inside = point((lo + hi) / 2);
        return { a: lo, b: hi, q: field(id, point(lo), inside), qJ: field(id, point(hi), inside) };
      });
    };
    return { at: field, boundaries, memberLoads };
  };
  return { approximation, geometry, roofPoint, profilePoints, pressureProfile, memberValues, planes, targetPlanes, orientations, edgeRanges, edgeHeights, atMember, transverse, memberPlanes, sourceWidth, pieceLoads, roof: roof.filter(m => roofIds.has(m.id)), targets, runs, panel, resolves };
}

export function snowRoofSurfaces(model: WindModel, layout?: GravityLayout, surfaces = roofSurfaceModel(model)) {
  return (index: number) => surfaces.panel(index, layout);
}

export function snowRoofSteps(model: WindModel, layout: GravityLayout, surfaces = snowRoofSurfaces(model, layout)) {
  const steps: Array<{ lower: number; upper: number; a: P2; b: P2 }> = [];
  for (const [lower, L] of layout.panels.entries()) for (const [upper, U] of layout.panels.entries()) {
    if (!L.roof || !U.roof || lower === upper) continue;
    for (let e = 0; e < L.polygon.length; e++) {
      const a = L.polygon[e]!, b = L.polygon[(e + 1) % L.polygon.length]!;
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      if (len < 1e-9) continue;
      const u: P2 = [dx / len, dy / len];
      for (let f = 0; f < U.polygon.length; f++) {
        const c = U.polygon[f]!, d = U.polygon[(f + 1) % U.polygon.length]!;
        const normal = (p: P2) => (p[0] - a[0]) * -u[1] + (p[1] - a[1]) * u[0];
        if (Math.abs(normal(c)) > 0.01 || Math.abs(normal(d)) > 0.01) continue;
        const along = (p: P2) => (p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1];
        const lo = Math.max(0, Math.min(along(c), along(d))), hi = Math.min(len, Math.max(along(c), along(d)));
        if (hi - lo <= 0.1) continue;
        const point = (t: number): P2 => [a[0] + t * u[0], a[1] + t * u[1]];
        if (![lo, (lo + hi) / 2, hi].some(t => surfaces(upper).elevation(point(t)) - surfaces(lower).elevation(point(t)) > 1e-8)) continue;
        steps.push({ lower, upper, a: point(lo), b: point(hi) });
      }
    }
  }
  return steps;
}
