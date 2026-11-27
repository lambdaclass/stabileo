/** Verify geometric coverage of the promised beam traces before placing a mesh.
 * Portions outside the region or inside openings require no shell edge.
 * An audit that exceeds its work budget refuses; it never assumes compatibility.
 */
import type { Vec3 } from './affine';
import type { MeshInput, MeshOutput } from './mesher';

type P2 = [number, number];
type Interval = [number, number];
const TOL = 1e-6;
export const MAX_COMPATIBILITY_WORK = 5_000_000;
/** Upper bound for intersections plus midpoint classification against all loops. */
export function segmentIntervalWork(input: Pick<MeshInput, 'outer' | 'holes'>): number {
  const n = [input.outer, ...input.holes].reduce((s, l) => s + (l.kind === 'polygon' ? l.points.length : 2), 0);
  return n * (2 * n + 3);
}
const cross = (a: P2, b: P2) => a[0] * b[1] - a[1] * b[0];
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const project = (frame: MeshOutput['plane'], p: Vec3): P2 => {
  const d = p.map((v, i) => v - frame.o[i]!) as Vec3;
  return [d.reduce((s, v, i) => s + v * frame.u[i]!, 0), d.reduce((s, v, i) => s + v * frame.v[i]!, 0)];
};
function onEdge(p: P2, a: P2, b: P2): boolean {
  const d = sub(b, a), l = Math.hypot(...d);
  if (!(l > 0)) return Math.hypot(...sub(p, a)) <= TOL;
  const q = sub(p, a), t = dot(q, d) / l;
  return t >= -TOL && t <= l + TOL && Math.abs(cross(q, d)) / l <= TOL;
}

/** Parameter intervals in the material, including its edges. Null means invalid geometry. */
export function segmentIntervals(input: Pick<MeshInput, 'outer' | 'holes'>, frame: MeshOutput['plane'], segment: [Vec3, Vec3]): Interval[] | null {
  // Bound coordinate products as well as rejecting NaN/Infinity. No structural
  // geometry near this limit is meaningful; refusal keeps arithmetic fail-closed.
  const safe = (v: number) => Number.isFinite(v) && Math.abs(v) <= 1e70;
  if (segmentIntervalWork(input) > MAX_COMPATIBILITY_WORK) return null;
  if (![...segment.flat(), ...frame.o, ...frame.u, ...frame.v].every(safe)) return null;
  if (Math.abs(Math.hypot(...frame.u) - 1) > TOL || Math.abs(Math.hypot(...frame.v) - 1) > TOL
    || Math.abs(frame.u.reduce((s, v, i) => s + v * frame.v[i]!, 0)) > TOL) return null;
  const normal: Vec3 = [frame.u[1] * frame.v[2] - frame.u[2] * frame.v[1], frame.u[2] * frame.v[0] - frame.u[0] * frame.v[2], frame.u[0] * frame.v[1] - frame.u[1] * frame.v[0]];
  if (segment.some(p => Math.abs(p.reduce((s, v, i) => s + (v - frame.o[i]!) * normal[i]!, 0)) > 1e-3)) return []; // Physical plate coplanarity tolerance.
  const a = project(frame, segment[0]), b = project(frame, segment[1]), d = sub(b, a);
  const length = Math.hypot(...d);
  if (!Number.isFinite(length) || length <= TOL) return null;
  const length2 = dot(d, d);
  if (!Number.isFinite(length2) || length2 <= 0) return null;
  const cuts = [0, 1];
  const loops = [input.outer, ...input.holes].map(loop => {
    if (loop.kind === 'circle') {
      if (![...loop.center, loop.radius].every(safe)) return null;
      const center = project(frame, loop.center), q = sub(a, center);
      const closest = -dot(q, d) / length2;
      const foot: P2 = [q[0] + closest * d[0], q[1] + closest * d[1]];
      const height2 = loop.radius * loop.radius - dot(foot, foot);
      if (![...center, closest, height2].every(Number.isFinite) || !(loop.radius > 0)) return null;
      if (height2 >= 0) for (const t of [closest - Math.sqrt(height2) / length, closest + Math.sqrt(height2) / length]) if (t > 0 && t < 1) cuts.push(t);
      return (p: P2) => { const dist = Math.hypot(...sub(p, center)) - loop.radius; return Math.abs(dist) <= TOL ? 0 : dist < 0 ? 1 : -1; };
    }
    if (!loop.points.flat().every(safe)) return null;
    const polygon = loop.points.map(p => project(frame, p));
    if (polygon.length < 3 || polygon.flat().some(v => !Number.isFinite(v))) return null;
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i]!, q = polygon[(i + 1) % polygon.length]!, edge = sub(q, p);
      const den = cross(d, edge);
      if (den !== 0) {
        const t = cross(sub(p, a), edge) / den, u = cross(sub(p, a), d) / den;
        if (!Number.isFinite(t) || !Number.isFinite(u)) return null;
        if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
      } else if (Math.abs(cross(sub(p, a), d)) / length <= TOL) {
        for (const v of [p, q]) { const t = dot(sub(v, a), d) / length2; if (t > 0 && t < 1) cuts.push(t); }
      }
    }
    return (p: P2) => {
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i]!, b = polygon[j]!;
        if (onEdge(p, a, b)) return 0;
        if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * ((p[1] - a[1]) / (b[1] - a[1])) + a[0]) inside = !inside;
      }
      return inside ? 1 : -1;
    };
  });
  if (loops.some(l => l === null)) return null;
  cuts.sort((a, b) => a - b);
  const intervals: Interval[] = [];
  for (let i = 1; i < cuts.length; i++) {
    const lo = cuts[i - 1]!, hi = cuts[i]!;
    if ((hi - lo) * length <= TOL) continue;
    const t = (lo + hi) / 2, p: P2 = [a[0] + t * d[0], a[1] + t * d[1]];
    if (loops[0]!(p) >= 0 && loops.slice(1).every(l => l!(p) <= 0)) intervals.push([lo, hi]);
  }
  return intervals;
}

export interface MeshCompatibility {
  ok: boolean;
  checkedSegments: number;
  missingSegments: number[];
  reason?: 'invalid' | 'budget' | 'missingEdges';
}

export function auditMeshCompatibility(input: MeshInput, mesh: MeshOutput): MeshCompatibility {
  const report: MeshCompatibility = { ok: true, checkedSegments: 0, missingSegments: [] };
  const fail = (reason: MeshCompatibility['reason']) => ({ ...report, ok: false, reason });
  if (mesh.points.flat().some(v => !Number.isFinite(v) || Math.abs(v) > 1e70)) return fail('invalid');
  const edges = new Map<string, [number, number]>();
  for (const cell of mesh.cells) for (let i = 0; i < cell.length; i++) {
    const a = cell[i]!, b = cell[(i + 1) % cell.length]!;
    if (!mesh.points[a] || !mesh.points[b] || a === b) return fail('invalid');
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    edges.set(key, [a, b]);
  }
  const work = (segmentIntervalWork(input) + edges.size) * (input.fixedSegments?.length ?? 0);
  if (!Number.isFinite(work) || work > MAX_COMPATIBILITY_WORK) return fail('budget');
  for (const [index, segment] of (input.fixedSegments ?? []).entries()) {
    const intervals = segmentIntervals(input, mesh.plane, segment);
    if (!intervals) return fail('invalid');
    if (!intervals.length) continue;
    report.checkedSegments++;
    const delta = segment[1].map((v, i) => v - segment[0][i]!) as Vec3;
    const length = Math.hypot(...delta), direction = delta.map(v => v / length) as Vec3;
    const station = (p: Vec3) => {
      const q = p.map((v, i) => v - segment[0][i]!) as Vec3;
      const s = q.reduce((sum, v, i) => sum + v * direction[i]!, 0);
      const distance = Math.hypot(...q.map((v, i) => v - s * direction[i]!));
      return distance <= TOL ? s / length : null;
    };
    const covered: Interval[] = [];
    for (const [a, b] of edges.values()) {
      const ta = station(mesh.points[a]!), tb = station(mesh.points[b]!);
      if (ta === null || tb === null) continue;
      covered.push([Math.min(ta, tb), Math.max(ta, tb)]);
    }
    covered.sort((a, b) => a[0] - b[0]);
    const eps = TOL / length;
    if (intervals.some(([lo, hi]) => {
      let reached = lo;
      for (const [a, b] of covered) { if (a > reached + eps) break; if (b > reached) reached = b; if (reached >= hi - eps) return false; }
      return reached < hi - eps;
    })) report.missingSegments.push(index);
  }
  return report.missingSegments.length ? fail('missingEdges') : report;
}
