// Despiece / member free-body view for Basic 3D: what acts at every member end.
//
// The drawing is `canvas/free-body.ts`, over the scene, shared with the 2D view and the
// exported figures; `viewport3d/free-body-3d.ts` turns these end actions into what it draws.
// Its equilibrium on real solves is checked in despiece-3d-equilibrium.test.ts.

import { userVecParts } from '../axes/user-names';
import { computeLocalAxes3D } from '../engine/local-axes-3d';
import type { ElementForces3D } from '../engine/types-3d';

export const DESPIECE_COL = {
  axial: '#ff7070',
  shear: '#4ecdc4',
  moment: '#ffd166',
  reaction: '#00e676',
  member: '#9aa7c7',
  remnant: '#5a6478',
  load: '#ffa726',
};

export type DespieceVectorMode = 'all' | 'members' | 'nodes';
export type DespieceBasis = 'local' | 'global';

type V3 = { x: number; y: number; z: number };

type Vec3 = [number, number, number];

/**
 * The action the joint exerts ON the member at one end, in world axes.
 *
 * Engine convention (checked against real solves in
 * despiece-3d-equilibrium.test.ts): ElementForces3D are section resultants with
 * N positive in tension and V, M, T signed on the member's NEGATIVE face, so
 * that V(x) = V_I + ∫q and M(x) = M_I ∓ V·x along the member (diagrams-3d.ts).
 * At I the joint acts on the member with −N·ex + Vy·ey + Vz·ez and with the
 * moment T·ex + My·ey + Mz·ez; at J with the same expression of the J values
 * times −1 (`axialOut` = +1 at I, −1 at J, the opposite outward normals of the
 * two cuts). A cantilever along +X fixed at I: a tip Fy = +10 gives
 * vy = −10, mzStart = −20, and the fixed end's reaction (−10·ey, −20·ez) is
 * exactly the I action. Unloaded, V and M are the same sign at both ends, so the
 * two end shears are OPPOSITE and form the couple the end moments balance.
 *
 * The local basis is the solver's right-handed one; the left-hand convention
 * only changes how the axes are labelled, never these vectors.
 */
export function memberEndAction3D(
  ex: Vec3, ey: Vec3, ez: Vec3, axialOut: 1 | -1,
  n: number, vy: number, vz: number, mx: number, my: number, mz: number,
): { force: Vec3; moment: Vec3 } {
  const f = (k: number) => (-n * ex[k] + vy * ey[k] + vz * ez[k]) * axialOut;
  const m = (k: number) => (mx * ex[k] + my * ey[k] + mz * ez[k]) * axialOut;
  return { force: [f(0), f(1), f(2)], moment: [m(0), m(1), m(2)] };
}


// ─── Inspection (pure aggregation, basis-aware) ─────────────────────

export interface Despiece3DEndAction {
  elementId: number; end: 'I' | 'J'; nodeId: number;
  components: Array<{ label: string; value: number }>;
}

interface Inspect3DArgs {
  elements: Iterable<DespieceElement3D>;
  getNode: (id: number) => V3 | undefined;
  getForces: (id: number) => ElementForces3D | undefined;
  basis: DespieceBasis;
  leftHand?: boolean;
}
/**
 * `sectionRotation` is the section's own rotation (Section.rotation, degrees): the
 * solver folds it into the roll angle, so the basis here has to as well, or the
 * inspected Fx/Fy/Fz of a member with a rotated section disagree with the arrows.
 */
export interface DespieceElement3D { id: number; nodeI: number; nodeJ: number; localYx?: number; localYy?: number; localYz?: number; rollAngle?: number; sectionRotation?: number; }

function end3DComponents(
  ex: Vec3, ey: Vec3, ez: Vec3, axialOut: 1 | -1,
  n: number, vy: number, vz: number, mx: number, my: number, mz: number, basis: DespieceBasis,
): Array<{ label: string; value: number }> {
  if (basis === 'global') {
    // The same end action the arrows draw (memberEndAction3D).
    const f = memberEndAction3D(ex, ey, ez, axialOut, n, vy, vz, mx, my, mz).force;
    return [...userVecParts('F', f).map((c) => ({ label: c.name, value: c.value })), { label: 'My', value: my }, { label: 'Mz', value: mz }, { label: 'T', value: mx }];
  }
  return [{ label: 'N', value: n }, { label: 'Vy', value: vy }, { label: 'Vz', value: vz }, { label: 'My', value: my }, { label: 'Mz', value: mz }, { label: 'T', value: mx }];
}

function endAction3D(args: Inspect3DArgs, el: DespieceElement3D, end: 'I' | 'J'): Despiece3DEndAction | null {
  const nI = args.getNode(el.nodeI), nJ = args.getNode(el.nodeJ);
  const ef = args.getForces(el.id);
  if (!nI || !nJ || !ef) return null;
  let axes;
  try {
    const localY = (el.localYx !== undefined && el.localYy !== undefined && el.localYz !== undefined) ? { x: el.localYx, y: el.localYy, z: el.localYz } : undefined;
    const roll = (el.rollAngle ?? 0) + (el.sectionRotation ?? 0);
    axes = computeLocalAxes3D({ id: 0, ...nI }, { id: 0, ...nJ }, localY, roll, false); // the solver's right-handed frame
  } catch { return null; }
  const [axialOut, n, vy, vz, mx, my, mz, nodeId]: [1 | -1, number, number, number, number, number, number, number] =
    end === 'I' ? [1, ef.nStart, ef.vyStart, ef.vzStart, ef.mxStart, ef.myStart, ef.mzStart, el.nodeI]
                : [-1, ef.nEnd, ef.vyEnd, ef.vzEnd, ef.mxEnd, ef.myEnd, ef.mzEnd, el.nodeJ];
  return { elementId: el.id, end, nodeId, components: end3DComponents(axes.ex, axes.ey, axes.ez, axialOut, n, vy, vz, mx, my, mz, args.basis) };
}

/** Both end actions (I and J) of one member. */
export function inspectMember3D(args: Inspect3DArgs, elementId: number): { elementId: number; ends: Despiece3DEndAction[] } | null {
  let target: DespieceElement3D | undefined;
  for (const el of args.elements) if (el.id === elementId) { target = el; break; }
  if (!target) return null;
  const ends = (['I', 'J'] as const).map(e => endAction3D(args, target!, e)).filter((x): x is Despiece3DEndAction => !!x);
  return { elementId, ends };
}

/** Every connected member-end action converging at a node. */
export function inspectNode3D(args: Inspect3DArgs, nodeId: number): { nodeId: number; actions: Despiece3DEndAction[] } {
  const actions: Despiece3DEndAction[] = [];
  for (const el of args.elements) {
    if (el.nodeI === nodeId) { const a = endAction3D(args, el, 'I'); if (a) actions.push(a); }
    if (el.nodeJ === nodeId) { const a = endAction3D(args, el, 'J'); if (a) actions.push(a); }
  }
  return { nodeId, actions };
}
