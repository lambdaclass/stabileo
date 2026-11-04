/**
 * A concentrated load on a member: a force and a moment at a distance `a` from end I, along the
 * member's local axes or the global ones.
 *
 * ── What the engine takes ──────────────────────────────────────────
 *
 * The engine's point member load has two components, local y and z. A force along the member, or
 * a moment, at an interior point has no place there, so the solve cuts the member at that point
 * (`variable-members.ts`, the same pieces a member of variable section is solved as) and the load
 * goes to the node of the cut. The results come back as one member, with the jump in the axial
 * force or the moment where the load is. That is exact: no equivalent end load stands in for it.
 *
 * At an end of the member (or of a piece) the whole load goes to the node, its force and moment,
 * with the couple of an offset when one separates the member end from the node.
 *
 * ── Frames ─────────────────────────────────────────────────────────
 *
 *   local   px along the member (I → J), py and pz along its local axes; mx, my, mz about them.
 *   global  px, py, pz along the global X, Y and Z; mx, my, mz about them.
 *
 * Local y is the displayed axis, which the left-handed convention flips (`member-loads.ts`).
 */
import type { SolverLoad3D } from './types-3d';
import { dot, type MemberAxes, type MemberRef, type Vec3 } from './member-loads';
import { transverseSign } from './transverse-sign-2d';

export type PointFrame = 'local' | 'global';

export interface PointLoad3DLike {
  elementId: number;
  a: number;
  py: number;
  pz: number;
  px?: number;
  mx?: number;
  my?: number;
  mz?: number;
  frame?: PointFrame;
}

/** Within a micron of an end, a load is at the end. */
export const POINT_END_TOL = 1e-6;

const add3 = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];
const scale3 = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const tiny = (v: number) => Math.abs(v) < 1e-12;

/** The load's force and moment as global vectors. */
export function pointGlobal(d: PointLoad3DLike, axes: MemberAxes, leftHand = false): { F: Vec3; M: Vec3 } {
  if ((d.frame ?? 'local') === 'global') {
    return { F: [d.px ?? 0, d.py ?? 0, d.pz ?? 0], M: [d.mx ?? 0, d.my ?? 0, d.mz ?? 0] };
  }
  const ys = leftHand ? -1 : 1;
  const onAxes = (x: number, y: number, z: number): Vec3 => add3(add3(scale3(axes.ex, x), axes.ey, ys * y), axes.ez, z);
  return { F: onAxes(d.px ?? 0, d.py ?? 0, d.pz ?? 0), M: onAxes(d.mx ?? 0, d.my ?? 0, d.mz ?? 0) };
}

/** Whether a load needs the member cut where it sits: an axial force or a moment inside the span. */
export function pointNeedsCut(d: PointLoad3DLike, axes: MemberAxes, leftHand = false): boolean {
  if (!(d.a > POINT_END_TOL && d.a < axes.L - POINT_END_TOL)) return false;
  const { F, M } = pointGlobal(d, axes, leftHand);
  return !tiny(dot(F, axes.ex)) || M.some((v) => !tiny(v));
}

/** A load whose interior axial part or moment found no cut to go to. */
export class PointLoadNeedsCut extends Error {
  constructor(readonly elementId: number) { super(`point load on member ${elementId} needs a node`); }
}

/**
 * The engine loads of one point load on a member that bends.
 *
 * `forcesOnly`: an interior axial part with no cut goes to the end nodes by the lever rule and a
 * moment is left out, for readers that only want where the forces are (a mass source: a moment
 * has no mass); otherwise an interior axial part or moment with no cut is an error.
 */
export function pointToSolver(m: MemberRef, d: PointLoad3DLike, leftHand = false, forcesOnly = false): SolverLoad3D[] {
  const { F, M } = pointGlobal(d, m.axes, leftHand);
  const { ex, ey, ez, L } = m.axes;
  const nodal = (nodeId: number, f: Vec3, mm: Vec3, arm?: Vec3): SolverLoad3D => {
    const c: Vec3 = arm ? [arm[1] * f[2] - arm[2] * f[1], arm[2] * f[0] - arm[0] * f[2], arm[0] * f[1] - arm[1] * f[0]] : [0, 0, 0];
    return { type: 'nodal', data: { nodeId, fx: f[0], fy: f[1], fz: f[2], mx: mm[0] + c[0], my: mm[1] + c[1], mz: mm[2] + c[2] } };
  };
  const none = F.every(tiny) && M.every(tiny);
  if (d.a <= POINT_END_TOL) return none ? [] : [nodal(m.nodeI, F, M, m.armI)];
  if (d.a >= L - POINT_END_TOL) return none ? [] : [nodal(m.nodeJ, F, M, m.armJ)];
  const out: SolverLoad3D[] = [];
  const py = dot(F, ey), pz = dot(F, ez), px = dot(F, ex);
  if (!tiny(py) || !tiny(pz)) out.push({ type: 'pointOnElement', data: { elementId: m.elementId, a: d.a, py, pz } });
  if (tiny(px) && M.every(tiny)) return out;
  if (!forcesOnly) throw new PointLoadNeedsCut(m.elementId);
  if (!tiny(px)) {
    const t = d.a / L, fx = scale3(ex, px);
    out.push(nodal(m.nodeI, scale3(fx, 1 - t), [0, 0, 0], m.armI), nodal(m.nodeJ, scale3(fx, t), [0, 0, 0], m.armJ));
  }
  return out;
}

/** A point load on a member that takes no bending: its force to the end nodes by the lever rule. */
export function pointToEnds(m: MemberRef, d: PointLoad3DLike, leftHand = false): SolverLoad3D[] {
  const { F } = pointGlobal(d, m.axes, leftHand);
  const t = Math.min(1, Math.max(0, d.a / m.axes.L));
  const at = (nodeId: number, f: Vec3): SolverLoad3D => ({ type: 'nodal', data: { nodeId, fx: f[0], fy: f[1], fz: f[2], mx: 0, my: 0, mz: 0 } });
  return F.every(tiny) ? [] : [at(m.nodeI, scale3(F, 1 - t)), at(m.nodeJ, scale3(F, t))];
}

/**
 * The same load stated after its member's local components change sign (`s` per axis: a reversed
 * member, a mirrored copy). A force follows the axes; a moment, an axial vector, also takes the
 * determinant of the physical transform (`det`, −1 for a mirror). A global load is untouched here.
 */
export function reexpressPointLocal<T extends PointLoad3DLike>(d: T, s: { x?: 1 | -1; y: 1 | -1; z: 1 | -1 }, det: 1 | -1 = 1): T {
  if ((d.frame ?? 'local') === 'global') return d;
  const sx = s.x ?? 1;
  const out = { ...d, py: s.y * d.py, pz: s.z * d.pz } as T;
  if (d.px !== undefined) out.px = sx * d.px;
  if (d.mx !== undefined) out.mx = det * sx * d.mx;
  if (d.my !== undefined) out.my = det * s.y * d.my;
  if (d.mz !== undefined) out.mz = det * s.z * d.mz;
  return out;
}

/** Whether a load carries anything beyond the two transverse components the engine takes. */
export function pointHasExtras(d: PointLoad3DLike): boolean {
  return (d.frame ?? 'local') === 'global' || [d.px, d.mx, d.my, d.mz].some((v) => v !== undefined && !tiny(v));
}

/** A plane model's point load on a member, as drawn: across it (or at an angle), with an axial part and a couple. */
export interface PlanePointLoadLike {
  elementId: number;
  a: number;
  p: number;
  px?: number;
  my?: number;
  mz?: number;
  angle?: number;
  isGlobal?: boolean;
}

/**
 * A plane point load in the space solve's global axes, as the solve of an embedded plane model
 * reads it: the force in the member's plane, its axial part and the couple about the plane's
 * normal, as for a nodal moment — about Z when it lies in X–Y, about −Y when it stands in X–Z
 * (`project2DToXZ`), which reflects the drawn plane, (x, y) → (x, 0, y). `dx`, `dPlan`: the member from I to J in the plane. The couple and an interior
 * axial part reach the engine at the node the solve cuts there (`pointToSolver`); the couple used
 * to be dropped, and the axial part lumped at the member's ends.
 */
export function planePointLoad3D(d: PlanePointLoadLike, dx: number, dPlan: number, project2DToXZ: boolean): PointLoad3DLike {
  const L = Math.hypot(dx, dPlan);
  const c = L > 0 ? dx / L : 1, s = L > 0 ? dPlan / L : 0;
  const ang = ((d.angle ?? 0) * Math.PI) / 180;
  let gx: number, gv: number;
  if (d.isGlobal) {
    gx = Math.sin(ang) * d.p; gv = Math.cos(ang) * d.p;
  } else {
    // Across the member in its drawn axes (transverse-sign-2d.ts), as the plane solve.
    const across = (project2DToXZ ? transverseSign(dx, dPlan) : 1) * Math.cos(ang) * d.p;
    const along = Math.sin(ang) * d.p;
    gx = -s * across + c * along; gv = c * across + s * along;
  }
  gx += c * (d.px ?? 0); gv += s * (d.px ?? 0);
  const m = d.my ?? d.mz ?? 0;
  return project2DToXZ
    ? { elementId: d.elementId, a: d.a, frame: 'global', px: gx, py: 0, pz: gv, mx: 0, my: -m, mz: 0 }
    : { elementId: d.elementId, a: d.a, frame: 'global', px: gx, py: gv, pz: 0, mx: 0, my: 0, mz: m };
}

/** A force at a point of a member that takes no bending and a couple there: both to its end nodes. */
export function pointWithCoupleToEnds(m: MemberRef, d: PointLoad3DLike, leftHand = false): SolverLoad3D[] {
  const out = pointToEnds(m, d, leftHand);
  const { M } = pointGlobal(d, m.axes, leftHand);
  if (M.every(tiny)) return out;
  // The couple as two equal and opposite forces at the ends, M × x̂ / L at J: L·x̂ × (M × x̂)/L = M.
  const { ex, L } = m.axes;
  const f: Vec3 = scale3([M[1] * ex[2] - M[2] * ex[1], M[2] * ex[0] - M[0] * ex[2], M[0] * ex[1] - M[1] * ex[0]], 1 / L);
  const at = (nodeId: number, v: Vec3): SolverLoad3D => ({ type: 'nodal', data: { nodeId, fx: v[0], fy: v[1], fz: v[2], mx: 0, my: 0, mz: 0 } });
  return [...out, at(m.nodeI, scale3(f, -1)), at(m.nodeJ, f)];
}
