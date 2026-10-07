/**
 * Tools that write shell loads as the model keeps them:
 *
 *   hydrostatic   a fluid to a level, on the shells chosen: γ·(level − z) normal to each, pushing
 *                 away from the fluid, nothing above the level. A wall and a bottom alike;
 *   point         a force at a point of a shell, as the nodal forces of its shape functions.
 *
 * ── Which side the fluid is on ───────────────────────────────────
 *
 * Read off the plan, as the load generator reads it (`special-loads.ts`): a wall (a shell within
 * about 6° of vertical) with one side closed in by the other walls picked and the other side open
 * bounds the fluid, which is on the closed side; a side is open when some line from the wall's
 * middle within 75° of its normal leaves the plan without meeting another wall. A wall closed in
 * on both sides is an interior one, fluid on both sides, and takes nothing. The lowest horizontal
 * shells picked are the bottom, the fluid above them.
 *
 * A point given in the fluid says what the plan cannot: a wall open on both sides (a lone wall), a
 * horizontal shell above the bottom (a lid, a step), an inclined one (a hopper), each pushed away
 * from the point; and, when the point is outside every region the walls close in, that the fluid
 * is outside them (a cofferdam). Without it such a shell has no side, and the tool refuses instead
 * of guessing. It used to push away from the middle of the shells picked: on a single wall, a side
 * set by the order of its nodes; in an L-shaped tank, a middle outside the fluid, the inner walls
 * pushed into it.
 *
 * Pure: the caller adds what comes back in one undo step.
 */
import { shellFrame, shellPointForces, type ShellPoint, type Vec3 } from '../../engine/shell-load-integration';
import type { NodalLoad3D, SurfaceLoad3D } from '../../store/model.svelte';

export interface ShellRef { id: number; on?: 'plate'; pts: ShellPoint[]; nodes: number[] }

/** The fluid's loads, or the shells it cannot tell the side of. */
export type HydrostaticResult =
  | { loads: Array<Omit<SurfaceLoad3D, 'id' | 'caseId'>> }
  | { refused: 'sideUnknown'; shells: ShellRef[] };

type V2 = [number, number];

/** Whether the segment a→b meets the segment s (b's end excluded, a's never on it). */
function meets(a: V2, b: V2, s: [V2, V2]): boolean {
  const r: V2 = [b[0] - a[0], b[1] - a[1]], q: V2 = [s[1][0] - s[0][0], s[1][1] - s[0][1]];
  const den = r[0] * q[1] - r[1] * q[0];
  if (Math.abs(den) < 1e-12) return false;
  const w: V2 = [s[0][0] - a[0], s[0][1] - a[1]];
  const t = (w[0] * q[1] - w[1] * q[0]) / den, u = (w[0] * r[1] - w[1] * r[0]) / den;
  return t > 1e-9 && t < 1 - 1e-9 && u >= -1e-9 && u <= 1 + 1e-9;
}

/** Whether every line from `from` within `half` degrees of `dir` meets one of the segments. */
function closedIn(from: V2, dir: V2, segs: Array<[V2, V2]>, reach: number, half: number, step: number): boolean {
  for (let deg = -half; deg <= half + 1e-9; deg += step) {
    const t = (deg * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t);
    const to: V2 = [from[0] + (dir[0] * cs - dir[1] * sn) * reach, from[1] + (dir[0] * sn + dir[1] * cs) * reach];
    if (!segs.some((g) => meets(from, to, g))) return false;
  }
  return true;
}

/** Each shell's surface load of a fluid of unit weight γ to `levelZ` (see the header); shells above it take none. */
export function hydrostaticSurfaceLoads(shells: readonly ShellRef[], gamma: number, levelZ: number, inside?: Vec3): HydrostaticResult {
  const frames = shells.map((s) => ({ s, f: shellFrame(s.on ?? 'quad', s.pts)! })).filter((x) => !!x.f);
  const zOf = (s: ShellRef) => s.pts.map((p) => p.z ?? 0);
  const zMin = Math.min(...shells.flatMap(zOf));
  if (!frames.length || !(zMin < levelZ)) return { loads: [] };
  const wet = frames.filter(({ s }) => Math.min(...zOf(s)) < levelZ);

  // The walls in plan: each one's horizontal normal, middle and segment.
  const isWall = (ez: Vec3) => Math.abs(ez[2]) < 0.1;
  const plan = new Map<ShellRef, { n: V2; c: V2; seg: [V2, V2] }>();
  for (const { s, f } of wet) {
    if (!isWall(f.ez)) continue;
    const h = Math.hypot(f.ez[0], f.ez[1]);
    const n: V2 = [f.ez[0] / h, f.ez[1] / h], c: V2 = [f.centroid[0], f.centroid[1]];
    const along = s.pts.map((p) => -(p.x - c[0]) * n[1] + (p.y - c[1]) * n[0]);
    const lo = Math.min(...along), hi = Math.max(...along);
    plan.set(s, { n, c, seg: [[c[0] - lo * n[1], c[1] + lo * n[0]], [c[0] - hi * n[1], c[1] + hi * n[0]]] });
  }
  const xs = shells.flatMap((s) => s.pts.map((p) => p.x)), ys = shells.flatMap((s) => s.pts.map((p) => p.y));
  const reach = 10 * (Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys)) + 100;
  const segs = (but?: ShellRef) => [...plan].filter(([s]) => s !== but).map(([, w]) => w.seg);
  // A point given outside every region the walls close in: the fluid is outside them.
  const outside = !!inside && !closedIn([inside[0], inside[1]], [1, 0], segs(), reach, 180, 15);
  // The lowest horizontal shells: the bottom.
  const flat = wet.filter(({ f }) => Math.abs(f.ez[2]) > 1 - 1e-9);
  const zBottom = Math.min(...flat.map(({ s }) => Math.min(...zOf(s))));

  const out: Array<Omit<SurfaceLoad3D, 'id' | 'caseId'>> = [];
  const unknown: ShellRef[] = [];
  for (const { s, f } of wet) {
    // +1: the fluid on the side the shell's local z points to; 0: none (an interior wall).
    let side: number | null = null;
    const byPoint = () => {
      if (!inside) return null;
      const d = f.ez[0] * (inside[0] - f.centroid[0]) + f.ez[1] * (inside[1] - f.centroid[1]) + f.ez[2] * (inside[2] - f.centroid[2]);
      return Math.abs(d) > 1e-9 ? Math.sign(d) : null;
    };
    const w = plan.get(s);
    if (w) {
      const off = (k: number): V2 => [w.c[0] + k * 1e-4 * w.n[0], w.c[1] + k * 1e-4 * w.n[1]];
      const others = segs(s);
      const plus = closedIn(off(1), w.n, others, reach, 75, 15), minus = closedIn(off(-1), [-w.n[0], -w.n[1]], others, reach, 75, 15);
      if (plus !== minus) side = (plus ? 1 : -1) * (outside ? -1 : 1);
      else side = byPoint() ?? (plus ? 0 : null);
    } else if (inside) side = byPoint();
    else if (Math.abs(f.ez[2]) > 1 - 1e-9 && Math.min(...zOf(s)) <= zBottom + 1e-6) side = Math.sign(f.ez[2]);
    if (side === null) { unknown.push(s); continue; }
    if (side === 0) continue;
    // Pushed away from the fluid: against the side it is on.
    out.push({
      quadId: s.id, ...(s.on ? { on: s.on } : {}),
      q: 0, frame: 'local',
      vary: { dir: [0, 0, 1], c1: levelZ, q1: 0, c2: zMin, q2: -side * gamma * (levelZ - zMin) },
    });
  }
  return unknown.length ? { refused: 'sideUnknown', shells: unknown } : { loads: out };
}

/** The nodal forces of a force at a point, on the first shell it falls on (projected along Z, then X, then Y). */
export function shellPointNodalLoads(shells: readonly ShellRef[], at: Vec3, force: Vec3): Array<Omit<NodalLoad3D, 'id' | 'caseId'>> | null {
  for (const normal of [[0, 0, 1], [1, 0, 0], [0, 1, 0]] as Vec3[]) {
    for (const s of shells) {
      // Only a shell the point lies on: its plane within 1 mm along the projection.
      const fr = shellFrame(s.on ?? 'quad', s.pts);
      if (!fr) continue;
      const den = fr.ez[0] * normal[0] + fr.ez[1] * normal[1] + fr.ez[2] * normal[2];
      if (Math.abs(den) < 1e-9) continue;
      const gap = (fr.ez[0] * (at[0] - fr.centroid[0]) + fr.ez[1] * (at[1] - fr.centroid[1]) + fr.ez[2] * (at[2] - fr.centroid[2])) / den;
      if (Math.abs(gap) > 1e-3) continue;
      const f = shellPointForces(s.on ?? 'quad', s.pts, at, force, normal);
      if (!f) continue;
      return s.nodes.map((nodeId, i) => ({ nodeId, fx: f[i]![0], fy: f[i]![1], fz: f[i]![2], mx: 0, my: 0, mz: 0 }));
    }
  }
  return null;
}
