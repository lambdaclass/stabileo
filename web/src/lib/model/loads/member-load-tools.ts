/**
 * Tools that write ordinary member loads: what they make is a set of loads the model already has
 * (trapezoids on a stretch, point loads, nodal loads), each one editable afterwards like any other.
 *
 *   · a triangular load with its peak inside the span: two trapezoids that meet at the peak;
 *   · a hydrostatic load on several members: a trapezoid on each, interpolated along a global axis
 *     from w₁ at the lowest coordinate of the members to w₂ at the highest;
 *   · a load on a physical member, a chain of collinear members stated as one: distances along the
 *     whole chain, cut into each member's own stretch;
 *   · a nodal force pointing at another node or point, stated as its global components.
 *
 * Pure: no store. The caller supplies geometry and writes the result.
 */
import type { DistributedLoad3D, PointLoadOnElement3D } from '../../store/model.svelte';
import type { MemberAxes, Vec3 } from '../../engine/member-loads';
import type { MemberFrame } from '../../engine/member-loads';

type P3 = { x: number; y: number; z?: number };
export type DistributedDraft = Omit<DistributedLoad3D, 'id' | 'caseId'>;
export type PointDraft = Omit<PointLoadOnElement3D, 'id' | 'caseId'>;

const EPS = 1e-9;

// ─── Triangular with a peak ───────────────────────────────────────

/**
 * Zero at both ends and `peak` at `at` (m from end I; the middle by default), as two trapezoids:
 * the same component `comp` of the given frame. A peak at an end is one trapezoid.
 */
export function triangularPeak(
  elementId: number, L: number, peak: number, comp: 'x' | 'y' | 'z', frame: MemberFrame = 'local', at = L / 2,
): DistributedDraft[] {
  const s = Math.min(L, Math.max(0, at));
  const one = (a: number, b: number, qa: number, qb: number): DistributedDraft => {
    const d: DistributedDraft = { elementId, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, ...(frame !== 'local' ? { frame } : {}) };
    if (comp === 'x') { d.qXI = qa; d.qXJ = qb; } else if (comp === 'y') { d.qYI = qa; d.qYJ = qb; } else { d.qZI = qa; d.qZJ = qb; }
    if (a > EPS) d.a = a;
    if (b < L - EPS) d.b = b;
    return d;
  };
  const out: DistributedDraft[] = [];
  if (s > EPS) out.push(one(0, s, 0, peak));
  if (s < L - EPS) out.push(one(s, L, peak, 0));
  return out;
}

// ─── Hydrostatic ──────────────────────────────────────────────────

export type GlobalAxis = 'X' | 'Y' | 'Z';
const coord = (p: P3, axis: GlobalAxis) => (axis === 'X' ? p.x : axis === 'Y' ? p.y : (p.z ?? 0));

/**
 * A load varying linearly along a global axis over a set of members: w₁ at the lowest coordinate
 * the members reach on that axis, w₂ at the highest, each member a trapezoid between the values at
 * its ends. `comp` and `frame` say which way the load acts (a fluid against a wall: global X or
 * local z). Members that do not span the axis take a uniform load at their coordinate.
 */
export function hydrostaticLoads(
  members: ReadonlyArray<{ id: number; i: P3; j: P3 }>, axis: GlobalAxis, w1: number, w2: number,
  comp: 'x' | 'y' | 'z', frame: MemberFrame,
): DistributedDraft[] {
  if (members.length === 0) return [];
  const cs = members.flatMap((m) => [coord(m.i, axis), coord(m.j, axis)]);
  const lo = Math.min(...cs), hi = Math.max(...cs);
  const at = (c: number) => (hi - lo > EPS ? w1 + ((w2 - w1) * (c - lo)) / (hi - lo) : w1);
  return members.map((m) => {
    const qI = at(coord(m.i, axis)), qJ = at(coord(m.j, axis));
    const d: DistributedDraft = { elementId: m.id, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, ...(frame !== 'local' ? { frame } : {}) };
    if (comp === 'x') { d.qXI = qI; d.qXJ = qJ; } else if (comp === 'y') { d.qYI = qI; d.qYJ = qJ; } else { d.qZI = qI; d.qZJ = qJ; }
    return d;
  }).filter((d) => [d.qXI, d.qXJ, d.qYI, d.qYJ, d.qZI, d.qZJ].some((v) => v !== undefined && Math.abs(v) > EPS));
}

// ─── A physical member ────────────────────────────────────────────

export interface ChainLink {
  id: number;
  /** Drawn from the chain's far end toward its start. */
  reversed: boolean;
  /** Where it starts along the chain, m, and its length. */
  s0: number;
  L: number;
}

const dist = (a: P3, b: P3) => Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));

/**
 * The members as one chain, end to end and collinear, in order from the chain's start (the end of
 * the first member listed that is free). Null when they are not one straight chain.
 */
export function orderedChain(
  ids: readonly number[],
  member: (id: number) => { nodeI: number; nodeJ: number } | undefined,
  node: (id: number) => P3 | undefined,
): { links: ChainLink[]; total: number } | null {
  const ms = ids.map((id) => ({ id, m: member(id) })).filter((x): x is { id: number; m: { nodeI: number; nodeJ: number } } => !!x.m);
  if (ms.length === 0 || ms.length !== ids.length) return null;
  const degree = new Map<number, number>();
  for (const { m } of ms) for (const n of [m.nodeI, m.nodeJ]) degree.set(n, (degree.get(n) ?? 0) + 1);
  if ([...degree.values()].some((d) => d > 2)) return null;
  const ends = [...degree].filter(([, d]) => d === 1).map(([n]) => n);
  if (ends.length !== 2) return null;
  // Start at the free end of the first member listed when it has one, so a chain reads as picked.
  const first = ms[0]!.m;
  let at = ends.includes(first.nodeI) ? first.nodeI : ends.includes(first.nodeJ) ? first.nodeJ : ends[0]!;
  const left = new Set(ms.map((x) => x.id));
  const links: ChainLink[] = [];
  let s = 0;
  let dir: Vec3 | null = null;
  while (left.size) {
    const next = ms.find((x) => left.has(x.id) && (x.m.nodeI === at || x.m.nodeJ === at));
    if (!next) return null;
    const reversed = next.m.nodeJ === at;
    const from = node(at), toId = reversed ? next.m.nodeI : next.m.nodeJ, to = node(toId);
    if (!from || !to) return null;
    const L = dist(from, to);
    if (!(L > EPS)) return null;
    const d: Vec3 = [(to.x - from.x) / L, (to.y - from.y) / L, ((to.z ?? 0) - (from.z ?? 0)) / L];
    if (dir && dir[0] * d[0] + dir[1] * d[1] + dir[2] * d[2] < 1 - 1e-6) return null;
    dir = d;
    links.push({ id: next.id, reversed, s0: s, L });
    s += L;
    left.delete(next.id);
    at = toId;
  }
  return { links, total: s };
}

/**
 * The chain's frame: its first member's axes, turned to run along the chain. A first member walked
 * J→I is seen as the member drawn the other way, (−ex, −ey, ez): x along the chain, z where the
 * member's own z is (up for a level beam), still right-handed. Negating ez with ex turned a local
 * qz = −10 into an upward load whenever the members were picked from the J end.
 */
export function chainFrame(first: MemberAxes, reversed: boolean): MemberAxes {
  if (!reversed) return first;
  const neg = (v: Vec3) => v.map((x) => -x) as Vec3;
  return { ...first, ex: neg(first.ex), ey: neg(first.ey) };
}

/** A load along a physical member, its positions measured along the whole chain. */
export type ChainLoad =
  | { kind: 'distributed'; a: number; b: number; frame: MemberFrame; qI: Vec3; qJ: Vec3 }
  | { kind: 'point'; a: number; frame: 'local' | 'global'; F: Vec3; M: Vec3 };

/**
 * The chain load as each member's own: a stretch of a trapezoid on every member it covers, a
 * point load on the member it falls in. `axes(id)` is each member's local frame and `chainAxes` the
 * chain's (its first member's, along the chain). A local load stays local on a member whose axes
 * are the chain's, and goes in global components on one drawn the other way, where its own axes
 * point elsewhere: the load acts where it was stated either way.
 */
export function loadsOnChain(
  chain: { links: ChainLink[]; total: number }, load: ChainLoad,
  axes: (id: number) => MemberAxes | null, chainAxes: MemberAxes,
): Array<{ type: 'distributed3d'; data: DistributedDraft } | { type: 'pointOnElement3d'; data: PointDraft }> {
  const same = (ax: MemberAxes | null) => !!ax
    && ax.ex.every((v, k) => Math.abs(v - chainAxes.ex[k]!) < 1e-6) && ax.ey.every((v, k) => Math.abs(v - chainAxes.ey[k]!) < 1e-6);
  const toGlobal = (v: Vec3): Vec3 => [0, 1, 2].map((k) => chainAxes.ex[k]! * v[0] + chainAxes.ey[k]! * v[1] + chainAxes.ez[k]! * v[2]) as Vec3;
  const out: Array<{ type: 'distributed3d'; data: DistributedDraft } | { type: 'pointOnElement3d'; data: PointDraft }> = [];
  if (load.kind === 'distributed') {
    const lerp = (s: number): Vec3 => {
      const t = load.b - load.a > EPS ? (s - load.a) / (load.b - load.a) : 0;
      return [0, 1, 2].map((k) => load.qI[k]! + (load.qJ[k]! - load.qI[k]!) * t) as Vec3;
    };
    for (const l of chain.links) {
      const lo = Math.max(load.a, l.s0), hi = Math.min(load.b, l.s0 + l.L);
      if (hi - lo <= EPS) continue;
      let vI = lerp(lo), vJ = lerp(hi);
      let frame = load.frame;
      const keepLocal = frame !== 'local' || (!l.reversed && same(axes(l.id)));
      if (!keepLocal) { vI = toGlobal(vI); vJ = toGlobal(vJ); frame = 'global'; }
      // Positions on the member, from its own end I.
      let a = lo - l.s0, b = hi - l.s0;
      if (l.reversed) { [a, b] = [l.L - b, l.L - a]; [vI, vJ] = [vJ, vI]; }
      const d: DistributedDraft = {
        elementId: l.id, qXI: vI[0], qXJ: vJ[0], qYI: vI[1], qYJ: vJ[1], qZI: vI[2], qZJ: vJ[2],
        ...(frame !== 'local' ? { frame } : {}),
      };
      if (a > EPS) d.a = a;
      if (b < l.L - EPS) d.b = b;
      out.push({ type: 'distributed3d', data: d });
    }
    return out;
  }
  const s = Math.min(chain.total, Math.max(0, load.a));
  const l = chain.links.find((x) => s <= x.s0 + x.L + EPS) ?? chain.links[chain.links.length - 1]!;
  let F = load.F, M = load.M, frame = load.frame;
  if (frame === 'local' && (l.reversed || !same(axes(l.id)))) { F = toGlobal(F); M = toGlobal(M); frame = 'global'; }
  const a = l.reversed ? l.L - (s - l.s0) : s - l.s0;
  const d: PointDraft = { elementId: l.id, a: Math.min(l.L, Math.max(0, a)), px: F[0], py: F[1], pz: F[2], mx: M[0], my: M[1], mz: M[2], ...(frame === 'global' ? { frame } : {}) };
  out.push({ type: 'pointOnElement3d', data: d });
  return out;
}

// ─── A nodal force toward a point ────────────────────────────────

/** A force of magnitude `F` from `at` toward `to`, as global components. Null when the two coincide. */
export function inclinedForce(at: P3, to: P3, F: number): Vec3 | null {
  const d = dist(at, to);
  if (!(d > EPS)) return null;
  return [(F * (to.x - at.x)) / d, (F * (to.y - at.y)) / d, (F * ((to.z ?? 0) - (at.z ?? 0))) / d];
}
