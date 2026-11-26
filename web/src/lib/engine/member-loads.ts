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
 * Frame loads stay distributed in all three local directions so recovery retains the axial
 * variation along the member. On a member that carries no bending (a
 * truss, or a one-way member in the active-set loop) the load goes to the end nodes, as the reactions of a simply supported span: the engine's truss assembly drops a
 * transverse member load, and the load would otherwise vanish. Its axial part is tagged with its
 * member and end, so the member's axial force is given it back after the solve (`axial-shares.ts`):
 * the member never sees that part, and would otherwise carry its average along its length.
 */
import type { SolverLoad3D } from './types-3d';
import { assembledMagnitudes3D, LoadVector, zero, type MemberLineSource } from './accounting-math';
import type { ModelData } from './solver-service';
import { mapModelNodeToSolver3D, shouldEmbedFlat2DModelIn3D } from './model-embedding';
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

function trapezoidSpan(a: number, b: number) {
  const length = b - a;
  return length > 0 ? { half: length / 2, stationI: a + length / 3, stationJ: a + (2 * length) / 3 } : null;
}

/**
 * The resultant of a linear load between a and b, and its position from end I: two triangles,
 * each at its third point, so a couple (ends of opposite sign) keeps its moment.
 */
export function trapezoidPieces(gI: Vec3, gJ: Vec3, a: number, b: number): Array<{ force: Vec3; s: number }> {
  const span = trapezoidSpan(a, b);
  if (!span) return [];
  return [
    { force: scale(gI, span.half), s: span.stationI },
    { force: scale(gJ, span.half), s: span.stationJ },
  ];
}

/**
 * Point resultants of one trapezoidal/partial distributed component (qI at a … qJ at b),
 * statically exact. When qI and qJ share a sign that is one force at the trapezoid's centroid; a
 * sign-reversing trapezoid has no single equivalent force on the span, so it is its two triangles.
 */
export function pointResultants(qI: number, qJ: number, a: number, b: number): Array<{ mag: number; at: number }> {
  const L = b - a;
  if (!(L > 1e-12)) return [];
  if (qI * qJ >= 0) {
    const sum = qI + qJ;
    if (Math.abs(sum) < 1e-12) return [];
    return [{ mag: (sum / 2) * L, at: a + (L / 3) * (qI + 2 * qJ) / sum }];
  }
  return [{ mag: (qI * L) / 2, at: a + L / 3 }, { mag: (qJ * L) / 2, at: a + (2 * L) / 3 }];
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
const nodal = (nodeId: number, f: Vec3, arm?: Vec3): Extract<SolverLoad3D, { type: 'nodal' }> => {
  const m: Vec3 = arm ? [arm[1] * f[2] - arm[2] * f[1], arm[2] * f[0] - arm[0] * f[2], arm[0] * f[1] - arm[1] * f[0]] : [0, 0, 0];
  return { type: 'nodal', data: { nodeId, fx: f[0], fy: f[1], fz: f[2], mx: m[0], my: m[1], mz: m[2] } };
};

export interface MemberRef {
  elementId: number; nodeI: number; nodeJ: number; axes: MemberAxes;
  /** From each node to its member end, when an offset separates them. */
  armI?: Vec3; armJ?: Vec3;
  points?: readonly [Vec3, Vec3];
}

export const PLANAR_LINE_COMPONENT_CUTOFF = 1e-10;
export const TRUSS_LOAD_COMPONENT_CUTOFF = 1e-12;

export function distributedSolverRow3D(elementId: number, qI: LoadVector, qJ: LoadVector, a?: number, b?: number, source: MemberLineSource = 'external'): SolverLoad3D {
  const [qXI, qYI, qZI] = qI.value, [qXJ, qYJ, qZJ] = qJ.value;
  const row: SolverLoad3D = { type: 'distributed', data: { elementId, qXI, qXJ, qYI, qYJ, qZI, qZJ, a, b } };
  assembledMagnitudes3D.set(row, { qI, qJ, source });
  return row;
}

/**
 * A global distributed load resolved onto all three local member axes.
 * `axialOnly` transfers the load to end nodes for members that carry no bending.
 */
export function globalDistributedToSolver(m: MemberRef, gI: Vec3, gJ: Vec3, a: number, b: number, axialOnly = false): SolverLoad3D[] {
  return distributedVectorsToSolver(m, LoadVector.from(gI).projectOnto(m.axes),
    LoadVector.from(gJ).projectOnto(m.axes), a, b, axialOnly, 'external');
}

export function localDistributedToSolver(m: MemberRef, qI: Vec3, qJ: Vec3, a: number, b: number): SolverLoad3D[] {
  return distributedVectorsToSolver(m, LoadVector.from(qI), LoadVector.from(qJ), a, b, false, 'external');
}

function distributedVectorsToSolver(
  m: MemberRef, qI: LoadVector, qJ: LoadVector, a: number, b: number, axialOnly: boolean, source: MemberLineSource,
): SolverLoad3D[] {
  const { ex, ey, ez, L } = m.axes;
  if (!axialOnly) {
    return [...qI.value, ...qJ.value].some(v => v !== 0) ? [distributedSolverRow3D(m.elementId, qI, qJ, a, b, source)] : [];
  }

  const span = trapezoidSpan(a, b);
  if (!span) return [];
  const out: SolverLoad3D[] = [];
  const tiny = (v: number) => Math.abs(v) < TRUSS_LOAD_COMPONENT_CUTOFF;
  const toNodes = (vI: LoadVector, vJ: LoadVector, axial = false) => {
    let fI = LoadVector.from(zero()), fJ = LoadVector.from(zero());
    for (const [q, station] of [[vI, span.stationI], [vJ, span.stationJ]] as const) {
      const force = q.scale(span.half);
      const t = Math.min(1, Math.max(0, station / L));
      fI = fI.add(force.scale(1 - t));
      fJ = fJ.add(force.scale(t));
    }
    for (const [end, nodeId, force, arm] of [
      ['i', m.nodeI, fI, m.armI], ['j', m.nodeJ, fJ, m.armJ],
    ] as const) {
      if (force.value.every(tiny)) continue;
      const row = nodal(nodeId, force.value, arm);
      if (axial) row.data.axialOf = { elementId: m.elementId, end, p: dot(force.value, ex) };
      assembledMagnitudes3D.set(row, {
        force, couple: arm ? force.momentAt(arm) : LoadVector.from(zero()),
        memberLine: { member: m.elementId, end, source },
      });
      out.push(row);
    }
  };

  const transverse = (q: LoadVector) => q.componentAlong(1, ey).add(q.componentAlong(2, ez));
  if ([qI.value[1], qI.value[2], qJ.value[1], qJ.value[2]].some(v => !tiny(v))) toNodes(transverse(qI), transverse(qJ));
  if (!(tiny(qI.value[0]) && tiny(qJ.value[0]))) toNodes(qI.componentAlong(0, ex), qJ.componentAlong(0, ex), true);
  return out;
}

/** Members that work one way only: axial members to the active-set loop (`member-behaviour.ts`). */
const ONE_WAY = new Set(['tensionOnly', 'compressionOnly', 'cable']);

/**
 * Whether a member takes no bending: a truss, or a one-way member, which the active-set loop
 * solves as one. A concentrated load on it goes to its end nodes by the lever rule and is never a
 * reason to cut it, a moment on it has nothing to resist it, and a tendon in it is an axial force.
 * The one predicate for the solve's cuts (`variable-members.ts`) and for those loads.
 */
export function takesNoBending(e: { type?: string; behaviour?: string } | undefined): boolean {
  return !!e && (e.type === 'truss' || (e.behaviour !== undefined && ONE_WAY.has(e.behaviour)));
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
      const magnitudes = assembledMagnitudes3D.get(l);
      const line = magnitudes && 'qI' in magnitudes ? magnitudes : undefined;
      const qI = LoadVector.from([l.data.qXI ?? 0, l.data.qYI, l.data.qZI], line?.qI.magnitude, line?.qI.underflow);
      const qJ = LoadVector.from([l.data.qXJ ?? 0, l.data.qYJ, l.data.qZJ], line?.qJ.magnitude, line?.qJ.underflow);
      out.push(...distributedVectorsToSolver(m, qI, qJ, l.data.a ?? 0, l.data.b ?? m.axes.L, true, line?.source ?? 'external'));
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
): { ni: [number, number, number]; nj: [number, number, number]; ax: ReturnType<typeof computeLocalAxes3D>; armI?: Vec3; armJ?: Vec3 } | null {
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
  if (!hasMemberOffset(el)) return { ni: [A.x, A.y, A.z], nj: [B.x, B.y, B.z], ax };
  const shift = (p: typeof A, v: import('../model/element-3d-metadata').MemberOffsetVec | undefined) => {
    if (!v) return p;
    const g = offsetVecToSolver(v, el.offset!.frame, ax!);
    return { ...p, x: p.x + g.x, y: p.y + g.y, z: p.z + g.z };
  };
  const A2 = shift(A, el.offset!.i), B2 = shift(B, el.offset!.j);
  try { ax = computeLocalAxes3D(A2, B2, localY, roll, false); } catch { return null; }
  return {
    ni: [A2.x, A2.y, A2.z], nj: [B2.x, B2.y, B2.z], ax,
    armI: [A2.x - A.x, A2.y - A.y, A2.z - A.z], armJ: [B2.x - B.x, B2.y - B.y, B2.z - B.z],
  };
}

/**
 * A member's end nodes and local axes as the 3D solve builds them: nodes mapped as for the
 * input, the member's own local-Y vector, and its roll plus the section's rotation.
 */
export function memberRef3D(model: ModelData, elementId: number, project2DToXZ = shouldEmbedFlat2DModelIn3D(model)): MemberRef | null {
  const elem = model.elements.get(elementId);
  if (!elem) return null;
  if (!project2DToXZ) {
    const f = memberFrame3D(model, elem);
    return f && f.ax.L > 1e-10
      ? { elementId, nodeI: elem.nodeI, nodeJ: elem.nodeJ, axes: { ex: f.ax.ex, ey: f.ax.ey, ez: f.ax.ez, L: f.ax.L }, points: [f.ni, f.nj], ...(f.armI ? { armI: f.armI, armJ: f.armJ } : {}) }
      : null;
  }
  const ni = model.nodes.get(elem.nodeI), nj = model.nodes.get(elem.nodeJ);
  if (!ni || !nj) return null;
  const a = mapModelNodeToSolver3D(ni, project2DToXZ), b = mapModelNodeToSolver3D(nj, project2DToXZ);
  const rot = model.sections.get(elem.sectionId)?.rotation ?? 0;
  if (!(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) > 1e-10)) return null;
  const axes = computeLocalAxes3D(a, b, undefined, (elem.rollAngle ?? 0) + rot, false);
  return { elementId, nodeI: elem.nodeI, nodeJ: elem.nodeJ, axes: { ex: axes.ex, ey: axes.ey, ez: axes.ez, L: axes.L }, points: [[a.x, a.y, a.z], [b.x, b.y, b.z]] };
}
