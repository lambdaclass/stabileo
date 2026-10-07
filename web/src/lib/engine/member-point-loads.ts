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
