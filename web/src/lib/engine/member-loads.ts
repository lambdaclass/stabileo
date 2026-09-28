/**
 * Member loads in one representation: a global force per unit of member length at each end of
 * the loaded stretch. Everything that reads a member load goes through here, so the solve, the
 * statics check and the drawing cannot disagree about where a load points.
 *
 * ── Frames of a distributed 3D load ────────────────────────────────
 *
 *   local      qX along the member (I → J), qY and qZ along its local axes, per metre of member.
 *   global     qX, qY, qZ along the global axes, per metre of member.
 *   projected  qX, qY, qZ along the global axes, per metre of the member's projection on the
 *              plane normal to each axis: snow on a rafter is given per metre of plan. Per metre
 *              of member that is q·√(1 − e²), e the member direction's component on that axis.
 *
 * Local Y is entered along the displayed axis, which the left-handed convention flips; the
 * global frames are not affected by it.
 *
 * ── What the engine is given ───────────────────────────────────────
 *
 * The engine's member load is local and transverse. The axial part goes to the end nodes by
 * statics, as the app already did for 2D-style loads. On a member that carries no bending (a
 * truss, or a one-way member in the active-set loop) the transverse part goes to the end nodes
 * too, as the reactions of a simply supported span: the engine's truss assembly drops a
 * transverse member load, and the load would otherwise vanish.
 */
import type { SolverLoad3D } from './types-3d';
import type { ModelData } from './solver-service';
import { computeLocalAxes3D } from './local-axes-3d';
import { hasMemberOffset, offsetVecToSolver } from './member-offsets';

export type Vec3 = [number, number, number];
export type MemberFrame = 'local' | 'global' | 'projected';

export interface MemberAxes { ex: Vec3; ey: Vec3; ez: Vec3; L: number }

export interface DistributedLoad3DLike {
  elementId: number;
  qYI: number; qYJ: number; qZI: number; qZJ: number;
  qXI?: number; qXJ?: number;
  frame?: MemberFrame;
  a?: number; b?: number;
}

const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The load's global intensity per metre of member at each end of its stretch, and the stretch. */
export function distributedGlobalEnds(d: DistributedLoad3DLike, axes: MemberAxes, leftHand = false): { gI: Vec3; gJ: Vec3; a: number; b: number } {
  const a = d.a ?? 0, b = d.b ?? axes.L;
  const frame = d.frame ?? 'local';
  const xI = d.qXI ?? 0, xJ = d.qXJ ?? 0;
  if (frame === 'local') {
    const ys = leftHand ? -1 : 1;
    const at = (x: number, y: number, z: number): Vec3 => add(add(scale(axes.ex, x), axes.ey, ys * y), axes.ez, z);
    return { gI: at(xI, d.qYI, d.qZI), gJ: at(xJ, d.qYJ, d.qZJ), a, b };
  }
  const k: Vec3 = frame === 'projected'
    ? [Math.sqrt(Math.max(0, 1 - axes.ex[0] ** 2)), Math.sqrt(Math.max(0, 1 - axes.ex[1] ** 2)), Math.sqrt(Math.max(0, 1 - axes.ex[2] ** 2))]
    : [1, 1, 1];
  return { gI: [xI * k[0], d.qYI * k[1], d.qZI * k[2]], gJ: [xJ * k[0], d.qYJ * k[1], d.qZJ * k[2]], a, b };
}

/**
 * The resultant of a linear load between a and b, and its position from end I: two triangles,
 * each at its third point, so a couple (ends of opposite sign) keeps its moment.
 */
export function trapezoidPieces(gI: Vec3, gJ: Vec3, a: number, b: number): Array<{ force: Vec3; s: number }> {
  const len = b - a;
  if (!(len > 0)) return [];
  return [
    { force: scale(gI, len / 2), s: a + len / 3 },
    { force: scale(gJ, len / 2), s: a + (2 * len) / 3 },
  ];
}

/** A point force at `s` from end I, as the two end reactions of a simply supported span. */
function toEnds(force: Vec3, s: number, L: number): { fI: Vec3; fJ: Vec3 } {
  const t = Math.min(1, Math.max(0, s / L));
  return { fI: scale(force, 1 - t), fJ: scale(force, t) };
}

/**
 * A force applied at a member end, moved to the end's node: the force, and its couple about the
 * node when an offset puts the member end away from it.
 */
const nodal = (nodeId: number, f: Vec3, arm?: Vec3): SolverLoad3D => {
  const m: Vec3 = arm ? [arm[1] * f[2] - arm[2] * f[1], arm[2] * f[0] - arm[0] * f[2], arm[0] * f[1] - arm[1] * f[0]] : [0, 0, 0];
  return { type: 'nodal', data: { nodeId, fx: f[0], fy: f[1], fz: f[2], mx: m[0], my: m[1], mz: m[2] } };
};

export interface MemberRef {
  elementId: number; nodeI: number; nodeJ: number; axes: MemberAxes;
  /** From each node to its member end, when an offset separates them. */
  armI?: Vec3; armJ?: Vec3;
}

/**
 * A global distributed load as the engine takes it: the transverse part as a local member load,
 * the axial part at the end nodes. `axialOnly`: the transverse part at the end nodes as well.
 */
export function globalDistributedToSolver(m: MemberRef, gI: Vec3, gJ: Vec3, a: number, b: number, axialOnly = false): SolverLoad3D[] {
  const out: SolverLoad3D[] = [];
  const { ex, ey, ez, L } = m.axes;
  const yI = dot(gI, ey), yJ = dot(gJ, ey), zI = dot(gI, ez), zJ = dot(gJ, ez);
  const xI = dot(gI, ex), xJ = dot(gJ, ex);
  const tiny = (v: number) => Math.abs(v) < 1e-12;
  const toNodes = (vI: Vec3, vJ: Vec3) => {
    let fI: Vec3 = [0, 0, 0], fJ: Vec3 = [0, 0, 0];
    for (const p of trapezoidPieces(vI, vJ, a, b)) {
      const r = toEnds(p.force, p.s, L);
      fI = add(fI, r.fI); fJ = add(fJ, r.fJ);
    }
    if (fI.some((v) => !tiny(v))) out.push(nodal(m.nodeI, fI, m.armI));
    if (fJ.some((v) => !tiny(v))) out.push(nodal(m.nodeJ, fJ, m.armJ));
  };
  if (!(tiny(yI) && tiny(yJ) && tiny(zI) && tiny(zJ))) {
    if (axialOnly) toNodes(add(scale(ey, yI), ez, zI), add(scale(ey, yJ), ez, zJ));
    else out.push({ type: 'distributed', data: { elementId: m.elementId, qYI: yI, qYJ: yJ, qZI: zI, qZJ: zJ, a, b } });
  }
  if (!(tiny(xI) && tiny(xJ))) toNodes(scale(ex, xI), scale(ex, xJ));
  return out;
}

/**
 * The engine's local member loads on members that take no bending, moved to their end nodes.
 * Loads on other members pass through untouched.
 */
export function transverseToNodes(loads: SolverLoad3D[], axialOnly: (elementId: number) => MemberRef | null): SolverLoad3D[] {
  const out: SolverLoad3D[] = [];
  for (const l of loads) {
    if (l.type === 'distributed') {
      const m = axialOnly(l.data.elementId);
      if (!m) { out.push(l); continue; }
      const { ey, ez } = m.axes;
      const gI = add(scale(ey, l.data.qYI), ez, l.data.qZI), gJ = add(scale(ey, l.data.qYJ), ez, l.data.qZJ);
      out.push(...globalDistributedToSolver(m, gI, gJ, l.data.a ?? 0, l.data.b ?? m.axes.L, true));
    } else if (l.type === 'pointOnElement') {
      const m = axialOnly(l.data.elementId);
      if (!m) { out.push(l); continue; }
      const f = add(scale(m.axes.ey, l.data.py), m.axes.ez, l.data.pz);
      const r = toEnds(f, l.data.a, m.axes.L);
      out.push(nodal(m.nodeI, r.fI, m.armI), nodal(m.nodeJ, r.fJ, m.armJ));
    } else {
      out.push(l);
    }
  }
  return out;
}

/**
 * A member's flexible segment as the 3D solve builds it: the end nodes moved by their offsets,
 * the member's own local-Y vector or, for a frame, the automatic one of the node-to-node line
 * (which the solver input fixes on every frame member), and its roll plus the section's
 * rotation. Member loads are stated on this segment.
 */
export function memberFrame3D(
  model: Pick<ModelData, 'nodes' | 'sections'>,
  el: { type?: string; nodeI: number; nodeJ: number; sectionId: number; localYx?: number; localYy?: number; localYz?: number; rollAngle?: number; offset?: import('../model/element-3d-metadata').MemberOffset },
): { ni: [number, number, number]; ax: ReturnType<typeof computeLocalAxes3D>; armI?: Vec3; armJ?: Vec3 } | null {
  const a = model.nodes.get(el.nodeI);
  const b = model.nodes.get(el.nodeJ);
  if (!a || !b) return null;
  const roll = (el.rollAngle ?? 0) + (model.sections.get(el.sectionId)?.rotation ?? 0);
  const A = { id: el.nodeI, x: a.x, y: a.y, z: a.z ?? 0 };
  const B = { id: el.nodeJ, x: b.x, y: b.y, z: b.z ?? 0 };
  // The solver input gives every frame member an explicit local-Y reference: its own, or the
  // automatic y of the NODE-TO-NODE line. On a tilted offset segment that fixed reference, not a
  // fresh automatic frame, is what the solve uses.
  let localY = el.localYx !== undefined ? { x: el.localYx, y: el.localYy ?? 0, z: el.localYz ?? 0 } : undefined;
  if (!localY && el.type !== 'truss') {
    try { const base = computeLocalAxes3D(A, B); localY = { x: base.ey[0], y: base.ey[1], z: base.ey[2] }; } catch { return null; }
  }
  let ax;
  try { ax = computeLocalAxes3D(A, B, localY, roll, false); } catch { return null; }
  if (!hasMemberOffset(el)) return { ni: [A.x, A.y, A.z], ax };
  const shift = (p: typeof A, v: import('../model/element-3d-metadata').MemberOffsetVec | undefined) => {
    if (!v) return p;
    const g = offsetVecToSolver(v, el.offset!.frame, ax!);
    return { ...p, x: p.x + g.x, y: p.y + g.y, z: p.z + g.z };
  };
  const A2 = shift(A, el.offset!.i), B2 = shift(B, el.offset!.j);
  try { ax = computeLocalAxes3D(A2, B2, localY, roll, false); } catch { return null; }
  return {
    ni: [A2.x, A2.y, A2.z], ax,
    armI: [A2.x - A.x, A2.y - A.y, A2.z - A.z], armJ: [B2.x - B.x, B2.y - B.y, B2.z - B.z],
  };
}
