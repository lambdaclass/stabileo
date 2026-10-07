/**
 * A member load moved to the other frame, the same load: its components re-expressed so it acts
 * as it did. The frame toggle on the edit card (Global / Local) is a choice of how to read the
 * load, not a change of what it is.
 *
 * It used to change only the frame. A column with a global qX = 5 kN/m (sideways), switched to
 * Local, kept qX, which in the local frame is along the member: the card showed qY = qZ = 0 and
 * the column took 15 kN down its axis instead of a push to the side. Every component at both ends
 * is re-expressed here (`member-loads.ts` and `member-point-loads.ts` read them), so the global
 * resultant is the same before and after.
 *
 * A projected load (per metre of plan) becomes, under Global or Local, the same load per metre of
 * member.
 */
import { memberRef3D, type ModelData } from '../../engine/solver-service';
import { distributedGlobalEnds, dot, type DistributedLoad3DLike, type MemberAxes, type Vec3 } from '../../engine/member-loads';
import { pointGlobal, type PointLoad3DLike } from '../../engine/member-point-loads';

export type LoadFrame = 'global' | 'local';

/** A rounding remainder is no component: cos 90° is 6e-17, and a card showing it reads as a load. */
const clean = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v);

/** A global vector on the frame asked for: itself, or its components on the member's axes. */
function onFrame(g: Vec3, axes: MemberAxes, to: LoadFrame, leftHand: boolean): Vec3 {
  if (to === 'global') return [clean(g[0]), clean(g[1]), clean(g[2])];
  // Local y is the displayed axis, which the left-handed convention flips (`member-loads.ts`).
  const ys = leftHand ? -1 : 1;
  return [clean(dot(g, axes.ex)), clean(ys * dot(g, axes.ey)), clean(dot(g, axes.ez))];
}

/** The distributed load's components in `to`, at both ends, with the frame as `updateLoad` takes it. */
export function reframedDistributed(d: DistributedLoad3DLike, axes: MemberAxes, to: LoadFrame, leftHand = false) {
  const { gI, gJ } = distributedGlobalEnds(d, axes, leftHand);
  const I = onFrame(gI, axes, to, leftHand), J = onFrame(gJ, axes, to, leftHand);
  return {
    frame: to === 'global' ? 'global' as const : undefined,
    qXI: I[0], qYI: I[1], qZI: I[2], qXJ: J[0], qYJ: J[1], qZJ: J[2],
  };
}

/** The point load's force and moment in `to`, with the frame as `updateLoad` takes it. */
export function reframedPoint(d: PointLoad3DLike, axes: MemberAxes, to: LoadFrame, leftHand = false) {
  const { F, M } = pointGlobal(d, axes, leftHand);
  const f = onFrame(F, axes, to, leftHand), m = onFrame(M, axes, to, leftHand);
  return {
    frame: to === 'global' ? 'global' as const : undefined,
    px: f[0], py: f[1], pz: f[2], mx: m[0], my: m[1], mz: m[2],
  };
}

/**
 * The edit that moves a member load to frame `to`, acting as before; null for a load that has no
 * frame to move, or a member whose axes cannot be built (it then keeps its frame).
 */
export function reframedMemberLoad(
  load: { type: string; data: unknown }, model: ModelData, to: LoadFrame, leftHand = false,
): Record<string, number | string | undefined> | null {
  if (load.type !== 'distributed3d' && load.type !== 'pointOnElement3d') return null;
  const d = load.data as { elementId: number };
  let ref: ReturnType<typeof memberRef3D> = null;
  try { ref = memberRef3D(model, d.elementId); } catch { return null; }
  if (!ref) return null;
  return load.type === 'distributed3d'
    ? reframedDistributed(load.data as DistributedLoad3DLike, ref.axes, to, leftHand)
    : reframedPoint(load.data as PointLoad3DLike, ref.axes, to, leftHand);
}
