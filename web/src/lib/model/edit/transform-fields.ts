/**
 * What an isometry does to each thing a member, a shell, a support or a load carries.
 *
 * Coordinates are the easy part. The rest is stated in frames that move with the geometry, and
 * a rotation or a reflection has to carry them along or the copy is a different structure drawn
 * in the same place:
 *
 *   · A member's LOCAL FRAME. The copy's frame is the original's, carried by A. It is written as
 *     an explicit local-Y reference with the roll that cancels the section's own rotation, so the
 *     solver rebuilds exactly that frame — unless the automatic frame already produces it, in
 *     which case the copy keeps the original's compact form.
 *   · A REFLECTION reverses handedness, and a right-handed frame cannot follow it on all three
 *     axes. One of local y or z has to flip. Which one is decided by the section: a profile that
 *     is symmetric across local y (an I, a box, a tee) keeps z — its depth — and flips y, which it
 *     does not notice; a channel, symmetric across local z, keeps its flanges' mirrored direction
 *     and flips z. A profile symmetric in neither (an angle, a zed) cannot become its own mirror
 *     image; it keeps z and the command says so.
 *   · Loads in LOCAL axes follow the flipped axis's sign, so the copy carries the mirror image of
 *     the load. Nodal forces move as vectors and moments as axial vectors (they turn the other way
 *     in a mirror).
 *   · Joint masks and support restraints are stated per GLOBAL degree of freedom, and survive
 *     exactly only a transform that maps global axes onto global axes. Anything else is not
 *     guessed at: it is left off the copy and reported.
 *
 * Pure: no store.
 */

import { computeLocalAxes3D } from '../../engine/local-axes-3d';
import type { Element, Section, Support, Joint3D, Load, NodalLoad3D, DistributedLoad3D, PointLoadOnElement3D, ThermalLoad } from '../../store/model.svelte';
import type { MemberOffset } from '../element-3d-metadata';
import { applyAxial, applyVector, axisPermutation, dot, isReflection, type Affine, type Vec3 } from './affine';

export type EditWarning =
  | 'asymmetricProfile'   // mirrored, but the profile cannot be its own mirror image
  | 'jointDropped'        // a joint mask could not be carried by this transform
  | 'supportDropped'      // a support's restraints could not be carried
  | 'loadDropped'         // a 2D-style load could not be carried
  | 'surfaceLoadTilted'   // a vertical surface load was kept vertical on a tilted copy
  | 'groupDataVerbatim';  // a group was copied with its data unchanged

/** Profiles whose section is symmetric across local y (z ↦ −z leaves them unchanged)... */
const SYM_ACROSS_Y = new Set(['I', 'H', 'rect', 'RHS', 'CHS', 'C', 'U']);
/** ...and across local z (y ↦ −y). */
const SYM_ACROSS_Z = new Set(['I', 'H', 'rect', 'RHS', 'CHS', 'T']);

/**
 * The signs the copy's local y and z take relative to the carried ones: ey' = sy·A·ey,
 * ez' = sz·A·ez, with sy·sz = det A so the frame stays right-handed.
 */
export function frameSigns(T: Affine, section: Pick<Section, 'shape'> | undefined): { sy: 1 | -1; sz: 1 | -1; exact: boolean } {
  if (!isReflection(T)) return { sy: 1, sz: 1, exact: true };
  const shape = section?.shape ?? 'rect';
  // Keep the depth (z) when y can flip unnoticed, or when nothing can: gravity-direction loads
  // stay meaningful that way.
  if (SYM_ACROSS_Z.has(shape)) return { sy: -1, sz: 1, exact: true };
  if (SYM_ACROSS_Y.has(shape)) return { sy: 1, sz: -1, exact: true };
  return { sy: -1, sz: 1, exact: false };
}

type P = { x: number; y: number; z?: number };
const near = (a: Vec3, b: Vec3, tol = 1e-9) => Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol && Math.abs(a[2] - b[2]) < tol;

/**
 * The local-Y REFERENCE the solve builds a member's frame from: its own, or — for a frame member
 * with none — the automatic y of its node-to-node line. The solver input writes that reference
 * explicitly (`buildSolverInput3D`), and it matters: a member with end offsets is solved as a
 * segment that tilts away from the node line, and the segment's frame is the fixed reference
 * projected onto it, rotated by the roll.
 */
function referenceOf(ni: P, nj: P, e: Pick<Element, 'type' | 'localYx' | 'localYy' | 'localYz'>): Vec3 | null {
  if (e.localYx !== undefined && e.localYy !== undefined && e.localYz !== undefined) return [e.localYx, e.localYy, e.localYz];
  if (e.type === 'truss') return null;
  const base = computeLocalAxes3D({ id: 0, x: ni.x, y: ni.y, z: ni.z ?? 0 }, { id: 0, x: nj.x, y: nj.y, z: nj.z ?? 0 });
  return base.ey as Vec3;
}

/**
 * The orientation fields of the copy of member `e`, whose ends move from (ni, nj) to (ni2, nj2).
 *
 * Built on the reference, not on the final frame: the reference is carried, ref' = sy·A·ref, and
 * the roll becomes ρ' = det(A)·(ρ + θ) − θ, θ the section's own rotation (a reflection reverses the
 * sense of a rotation about the member). Because projection onto a line commutes with an isometry,
 * the copy's frame is then the original's carried by A on ANY segment of it — the node line or a
 * tilted offset segment alike. Carrying the final frame instead was exact on the node line and
 * off by the tilt on an offset member.
 */
export function carriedOrientation(
  T: Affine, e: Element, ni: P, nj: P, ni2: P, nj2: P,
  section: Pick<Section, 'shape' | 'rotation'> | undefined, _leftHand: boolean,
): { fields: Pick<Element, 'localYx' | 'localYy' | 'localYz' | 'rollAngle'>; sy: 1 | -1; sz: 1 | -1; exact: boolean } {
  const theta = section?.rotation ?? 0;
  const { sy, sz, exact } = frameSigns(T, section);
  const ref = referenceOf(ni, nj, e);
  const d = isReflection(T) ? -1 : 1;
  const rho = e.rollAngle ?? 0;
  const roll = d * (rho + theta) - theta;
  if (!ref) return { fields: pick({ rollAngle: roll }), sy, sz, exact };
  const a = applyVector(T, ref);
  const ref2: Vec3 = [sy * a[0], sy * a[1], sy * a[2]];

  // The compact form when it says the same thing: no explicit reference, because the automatic
  // one of the copy's own line is already ref', and the roll unchanged.
  if (e.localYx === undefined && Math.abs(roll - rho) < 1e-9) {
    const auto = referenceOf(ni2, nj2, { type: e.type });
    if (auto && near(auto, ref2, 1e-9)) return { fields: pick({ rollAngle: rho }), sy, sz, exact };
  }
  return { fields: pick({ localYx: ref2[0], localYy: ref2[1], localYz: ref2[2], rollAngle: roll }), sy, sz, exact };
}

function pick(f: { localYx?: number; localYy?: number; localYz?: number; rollAngle?: number }) {
  const out: Pick<Element, 'localYx' | 'localYy' | 'localYz' | 'rollAngle'> = {};
  if (f.localYx !== undefined) { out.localYx = f.localYx; out.localYy = f.localYy; out.localYz = f.localYz; }
  if (f.rollAngle !== undefined && Math.abs(f.rollAngle) > 1e-12) out.rollAngle = f.rollAngle;
  return out;
}

/** A member offset, carried: global vectors by A, local components by the frame signs. */
export function carriedOffset(T: Affine, o: MemberOffset | undefined, sy: 1 | -1, sz: 1 | -1): MemberOffset | undefined {
  if (!o) return undefined;
  const map = (v: { x: number; y: number; z: number }) => {
    if (o.frame === 'global') { const w = applyVector(T, [v.x, v.y, v.z]); return { x: w[0], y: w[1], z: w[2] }; }
    return { x: v.x, y: sy * v.y, z: sz * v.z };
  };
  const out: MemberOffset = { frame: o.frame };
  if (o.i) out.i = map(o.i);
  if (o.j) out.j = map(o.j);
  return out;
}

/** A joint mask, permuted with the global axes, or null when the transform does not map them. */
export function carriedJoint(T: Affine, j: Joint3D | undefined): Joint3D | null | undefined {
  if (!j) return undefined;
  const p = axisPermutation(T.A);
  if (p) {
    const dof = [...j.dof] as Joint3D['dof'];
    for (let i = 0; i < 3; i++) { dof[p.perm[i]!] = j.dof[i]!; dof[3 + p.perm[i]!] = j.dof[3 + i]!; }
    return { dof };
  }
  // Invariant under any rotation only if it treats all three translations alike, and all three
  // rotations alike.
  const [a, b, c, d, e, f] = j.dof;
  return a === b && b === c && d === e && e === f ? { dof: [...j.dof] as Joint3D['dof'] } : null;
}

const SYMMETRIC_SUPPORTS = new Set(['fixed3d', 'pinned3d', 'fixed', 'pinned']);

/**
 * A support carried to the copy's node, or null when its restraints cannot be.
 *
 * `elementMap` renames the member a locally framed support refers to; a support framed by a
 * member that is not copied is dropped.
 */
export function carriedSupport(T: Affine, s: Support, nodeId: number, elementMap: Map<number, number>): Omit<Support, 'id'> | null {
  const { id: _id, ...rest } = s;
  const out: Omit<Support, 'id'> = JSON.parse(JSON.stringify(rest));
  out.nodeId = nodeId;
  if (s.dofFrame === 'local' || s.dofLocalElementId !== undefined) {
    const m = s.dofLocalElementId !== undefined ? elementMap.get(s.dofLocalElementId) : undefined;
    if (m === undefined) return null;
    out.dofLocalElementId = m;
    return out; // local restraints move with the member's frame
  }
  if (s.normalX !== undefined || s.normalY !== undefined || s.normalZ !== undefined) {
    const n = applyVector(T, [s.normalX ?? 0, s.normalY ?? 0, s.normalZ ?? 0]);
    out.normalX = n[0]; out.normalY = n[1]; out.normalZ = n[2];
  }
  const translationOnly = T.A.every((v, i) => Math.abs(v - [1, 0, 0, 0, 1, 0, 0, 0, 1][i]!) < 1e-12);
  if (translationOnly) return out;
  const hasPerDof = !!s.dofRestraints || [s.kx, s.ky, s.kz, s.krx, s.kry, s.krz, s.dx, s.dy, s.dz, s.drx, s.dry, s.drz]
    .some((v) => v !== undefined && v !== 0);
  if (!hasPerDof && SYMMETRIC_SUPPORTS.has(String(s.type))) return out;
  const p = axisPermutation(T.A);
  if (!p) {
    const r = s.dofRestraints;
    const uniform = r && r.tx === r.ty && r.ty === r.tz && r.rx === r.ry && r.ry === r.rz;
    return uniform && !hasSprings(s) && !hasPrescribed(s) ? out : null;
  }
  const t = ['tx', 'ty', 'tz'] as const, rr = ['rx', 'ry', 'rz'] as const;
  if (s.dofRestraints) {
    const r = { ...s.dofRestraints };
    for (let i = 0; i < 3; i++) { r[t[p.perm[i]!]] = s.dofRestraints[t[i]!]; r[rr[p.perm[i]!]] = s.dofRestraints[rr[i]!]; }
    out.dofRestraints = r;
  }
  const k = ['kx', 'ky', 'kz'] as const, kr = ['krx', 'kry', 'krz'] as const;
  const d = ['dx', 'dy', 'dz'] as const, dr = ['drx', 'dry', 'drz'] as const;
  const axialSign = isReflection(T) ? -1 : 1;
  for (let i = 0; i < 3; i++) {
    const j = p.perm[i]!;
    out[k[j]] = s[k[i]]; out[kr[j]] = s[kr[i]];
    out[d[j]] = s[d[i]] === undefined ? undefined : s[d[i]]! * p.sign[i]!;
    out[dr[j]] = s[dr[i]] === undefined ? undefined : s[dr[i]]! * p.sign[i]! * axialSign;
  }
  for (const key of [...k, ...kr, ...d, ...dr]) if (out[key] === undefined) delete out[key];
  return out;
}

const hasSprings = (s: Support) => [s.kx, s.ky, s.kz, s.krx, s.kry, s.krz].some((v) => v !== undefined && v !== 0);
const hasPrescribed = (s: Support) => [s.dx, s.dy, s.dz, s.drx, s.dry, s.drz].some((v) => v !== undefined && v !== 0);

/**
 * A load carried to the copy; `{ warning }` with no load when it cannot be carried; null when
 * what it acts on is not part of the copy.
 *
 * `nodeMap` and `elementMap` rename what it acts on; `signsOf` gives each copied member's frame
 * signs. 2D-style loads, stated in a drawing plane, are carried by a translation only.
 */
export function carriedLoad(
  T: Affine, l: Load,
  nodeMap: Map<number, number>, elementMap: Map<number, number>, quadMap: Map<number, number>,
  signsOf: (elementId: number) => { sy: 1 | -1; sz: 1 | -1 },
): { load?: Load; warning?: EditWarning } | null {
  const translationOnly = T.A.every((v, i) => Math.abs(v - [1, 0, 0, 0, 1, 0, 0, 0, 1][i]!) < 1e-12);
  const d = l.data as unknown as Record<string, unknown>;
  switch (l.type) {
    case 'nodal3d': {
      const n = l.data as NodalLoad3D;
      const to = nodeMap.get(n.nodeId);
      if (to === undefined) return null;
      const F = applyVector(T, [n.fx, n.fy, n.fz]);
      const M = applyAxial(T, [n.mx, n.my, n.mz]);
      return { load: { type: 'nodal3d', data: { ...n, nodeId: to, fx: F[0], fy: F[1], fz: F[2], mx: M[0], my: M[1], mz: M[2] } } };
    }
    case 'distributed3d': {
      const q = l.data as DistributedLoad3D;
      const to = elementMap.get(q.elementId);
      if (to === undefined) return null;
      const { sy, sz } = signsOf(q.elementId);
      return { load: { type: 'distributed3d', data: { ...q, elementId: to, qYI: sy * q.qYI, qYJ: sy * q.qYJ, qZI: sz * q.qZI, qZJ: sz * q.qZJ } } };
    }
    case 'pointOnElement3d': {
      const q = l.data as PointLoadOnElement3D;
      const to = elementMap.get(q.elementId);
      if (to === undefined) return null;
      const { sy, sz } = signsOf(q.elementId);
      return { load: { type: 'pointOnElement3d', data: { ...q, elementId: to, py: sy * q.py, pz: sz * q.pz } } };
    }
    case 'thermal': {
      const q = l.data as ThermalLoad;
      const to = elementMap.get(q.elementId);
      if (to === undefined) return null;
      // The gradient is across local z, so it follows z's sign.
      const { sz } = signsOf(q.elementId);
      return { load: { type: 'thermal', data: { ...q, elementId: to, dtGradient: sz * q.dtGradient } } };
    }
    case 'surface3d':
    case 'thermalQuad3d': {
      const to = quadMap.get(d.quadId as number);
      if (to === undefined) return null;
      // A surface load is vertical by definition, and stays so. On a copy that is no longer
      // horizontal that is a choice, and it is reported.
      const up = applyVector(T, [0, 0, 1]);
      const tilted = l.type === 'surface3d' && Math.abs(Math.abs(dot(up, [0, 0, 1])) - 1) > 1e-9;
      return { load: { ...l, data: { ...l.data, quadId: to } } as Load, ...(tilted ? { warning: 'surfaceLoadTilted' as const } : {}) };
    }
    default: {
      if (!translationOnly) return { warning: 'loadDropped' };
      if ('elementId' in d) {
        const to = elementMap.get(d.elementId as number);
        return to === undefined ? null : { load: { ...l, data: { ...l.data, elementId: to } } as Load };
      }
      if ('nodeId' in d) {
        const to = nodeMap.get(d.nodeId as number);
        return to === undefined ? null : { load: { ...l, data: { ...l.data, nodeId: to } } as Load };
      }
      return null;
    }
  }
}
