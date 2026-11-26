/**
 * Translate 3D-authored constraints onto the 2D solver's DOF convention.
 *
 * The app stores ONE constraints array, always authored in 3D semantics
 * (ProConstraintsTab): DOF indices 0..5 = [ux, uy, uz, rx, ry, rz] and
 * eccentric releases as a 6-bool array. The Rust 2D solver uses 3 DOFs per
 * node — [0=ux, 1=uz, 2=ry] — and hard-errors on any dof >= 3, while a 6-bool
 * releases array would be silently misread ([1]=uy interpreted as the uz
 * slot). This module is the single dimension-translation layer between the
 * stored shape and the 2D wire (mirrors how supports and loads are remapped):
 *
 *   3D dof 0 (ux) → 2D 0 (ux)        in-plane horizontal
 *   3D dof 2 (uz) → 2D 1 (uz)        in-plane vertical
 *   3D dof 4 (ry) → 2D 2 (ry)        in-plane rotation
 *   3D dofs 1/3/5 (uy/rx/rz)         out-of-plane — dropped (the 2D solve
 *                                    restrains those implicitly)
 *
 * Constraints left without any in-plane DOF are dropped entirely.
 *
 * The plane model is the X–Z plane of the 3D one, and its rotation θ is counter-clockwise from
 * +X to +Z, a rotation about −Y: θ = −ry (docs/solver/assembly-constraints.md §2.3). An equation
 * that mixes ry with anything else (a linear MPC) changes the sign of its ry coefficient; an
 * equality of rotations does not care.
 *
 * Two constraints meant one thing in a space solve and another in the plane one (AC-3, AC-5):
 *   · A rigid link with no DOFs listed is "all translational" in 3D (the slave's rotation stays
 *     free, a pinned arm), but the plane solver's default ties the rotation (a fixed arm). It is
 *     sent with its translations listed, [ux, uz], so both solves model the same link.
 *   · A diaphragm is a rigid body in ITS plane. The plane solver's diaphragm is always the
 *     in-plane rigid body of the model plane, so a floor ("XY", horizontal) diaphragm made the
 *     beams it ties rigid in vertical bending. Its trace on the X–Z plane is sent instead:
 *       XY (a floor)            → ux_s = ux_m            (θz and Δy are out of the plane)
 *       YZ (a wall across)      → uz_s = uz_m            (θx and Δy are out of the plane)
 *       XZ (the model's plane)  → the rigid body, rotation tied (as the space solve ties it)
 */

import { t, tp } from '../i18n';
import { dyadicInteger } from './accounting-math';
import { ModelInputError, requireEccentricReleaseMask } from './model-input-numbers';
import { rigidLinkDofs } from './types-3d';
import type { Constraint3D, EccentricConnectionConstraint, LinearMpcConstraint } from './types-3d';
import type { DrawPlane } from '../geometry/plane-projection';

/**
 * Each plane's global axes, renamed so that the plane reads as X–Z: horizontal → X, vertical → Z,
 * normal → Y. The renaming of Y–Z (and of X–Y) is a reflection, so the in-plane rotation, θ = rx
 * on Y–Z and rz on X–Y, lands on ry with its sign reversed (θ = −ry on X–Z).
 */
const AXES_IN_XZ: Record<Exclude<DrawPlane, 'xz'>, [number, number, number]> = { yz: [1, 0, 2], xy: [0, 2, 1] };

/**
 * The constraints of a model standing in `plane`, written as if it stood in X–Z, the plane
 * `constraintsTo2D` reads them in (#466).
 */
export function constraintsInXZ(plane: DrawPlane, constraints: readonly Constraint3D[]): Constraint3D[] {
  for (const [index, c] of constraints.entries()) {
    if (c.type === 'eccentricConnection') requireEccentricReleaseMask(`constraints[${index}].releases`, c.releases);
  }
  if (plane === 'xz') return [...constraints];
  return remapConstraintAxes(constraints, AXES_IN_XZ[plane]);
}

export function constraintsInXY(plane: DrawPlane, constraints: readonly Constraint3D[]): Constraint3D[] {
  if (plane === 'xy') return [...constraints];
  return remapConstraintAxes(constraintsInXZ(plane, constraints), AXES_IN_XZ.xy);
}

function remapConstraintAxes(
  constraints: readonly Constraint3D[], axis: [number, number, number],
): Constraint3D[] {
  const [x, y, z] = axis;
  const inversions = Number(x > y) + Number(x > z) + Number(y > z);
  const rotationSign = inversions % 2 === 0 ? 1 : -1;
  const dof = (d: number) => (d < 3 ? axis[d] : 3 + axis[d - 3]);
  const letter = (c: string) => 'XYZ'[axis['XYZ'.indexOf(c)]] ?? c;
  return constraints.map((c): Constraint3D => {
    switch (c.type) {
      case 'rigidLink': return c.dofs ? { ...c, dofs: c.dofs.map(dof) } : { ...c };
      case 'equalDOF': return { ...c, dofs: c.dofs.map(dof) };
      case 'linearMPC': return { ...c, terms: c.terms.map((t) => ({ ...t, dof: dof(t.dof), coefficient: t.dof < 3 ? t.coefficient : rotationSign * t.coefficient })) };
      case 'diaphragm': {
        const name = (c.plane ?? 'XY').toUpperCase();
        return /^[XYZ]{2}$/.test(name) ? { ...c, plane: [...name].map(letter).sort().join('') } : { ...c };
      }
      case 'eccentricConnection': {
        const offsets = [c.offsetX ?? 0, c.offsetY ?? 0, c.offsetZ ?? 0];
        const moved = [0, 0, 0];
        offsets.forEach((v, i) => { moved[axis[i]] = v; });
        const authoredReleases = c.releases;
        let releases: boolean[] | undefined;
        if (authoredReleases) {
          releases = new Array<boolean>(6).fill(false);
          for (let i = 0; i < releases.length; i++) releases[dof(i)] = authoredReleases[i] ?? false;
        }
        return { ...c, offsetX: moved[0], offsetY: moved[1], offsetZ: moved[2], releases };
      }
    }
  });
}

const PLANAR_TRANSLATIONS = [0, 2] as const;
const PLANAR_DOFS = [...PLANAR_TRANSLATIONS, 4];
const DOF_3D_TO_2D: Record<number, number> = { 0: 0, 2: 1, 4: 2 };

/**
 * The constraints, already written in X–Z, that tie a DOF in the plane to one out of it: a
 * linear MPC with terms on both sides, or an eccentric connection whose offset leaves the plane.
 * The plane solver has no out-of-plane DOFs, so it cannot keep that coupling (#466).
 */
export function constraintsCoupledAcrossPlane(constraints: readonly Constraint3D[]): Constraint3D[] {
  return constraints.filter(couplesAcrossPlane);
}

type MpcTerm = LinearMpcConstraint['terms'][number];
type MpcProjection = MpcTerm[] | 'coupled' | 'unrepresentable';

function roundedCoefficient(exact: bigint): number {
  const magnitude = exact < 0n ? -exact : exact;
  const shift = BigInt(Math.max(0, magnitude.toString(2).length - 53));
  let significand = magnitude >> shift;
  if (shift > 0n) {
    const remainder = magnitude - (significand << shift);
    const half = 1n << (shift - 1n);
    if (remainder > half || (remainder === half && (significand & 1n) === 1n)) significand += 1n;
  }
  return (exact < 0n ? -1 : 1) * Number(significand) * 2 ** (Number(shift) - 1074);
}

function fitMpcCoefficients(totals: readonly bigint[]): number[] | null {
  const coefficients = totals.map(roundedCoefficient);
  if (coefficients.every(Number.isFinite)) return coefficients;
  if (totals.length === 1) return [1];

  const maxBits = totals.reduce((bits, total) => Math.max(bits, (total < 0n ? -total : total).toString(2).length), 0);
  const maxFiniteBits = dyadicInteger(Number.MAX_VALUE).toString(2).length;
  const shift = BigInt(Math.max(1, maxBits - maxFiniteBits));
  const scaled = totals.map(total => total >> shift);
  const fitted = scaled.map(roundedCoefficient);
  if (scaled.some((value, index) =>
    !Number.isFinite(fitted[index]!) || (value << shift) !== totals[index] || dyadicInteger(fitted[index]!) !== value,
  )) return null;
  const largest = fitted.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  return fitted.some(value => value / largest === 0) ? null : fitted;
}

function projectMpc(terms: readonly MpcTerm[]): MpcProjection {
  const groups = new Map<string, { term: MpcTerm; total: bigint }>();
  for (const term of terms) {
    if (!Number.isFinite(term.coefficient)) return 'unrepresentable';
    const key = `${term.nodeId}:${term.dof}`;
    const coefficient = dyadicInteger(term.coefficient);
    const group = groups.get(key);
    if (group) group.total += coefficient;
    else groups.set(key, { term, total: coefficient });
  }
  const inPlane: Array<{ nodeId: number; dof: number; total: bigint }> = [];
  let outOfPlane = false;
  for (const { term, total } of groups.values()) {
    if (total === 0n) continue;
    const dof = DOF_3D_TO_2D[term.dof];
    if (dof === undefined) outOfPlane = true;
    else inPlane.push({ nodeId: term.nodeId, dof, total: term.dof === 4 ? -total : total });
  }
  if (outOfPlane && inPlane.length > 0) return 'coupled';
  const coefficients = fitMpcCoefficients(inPlane.map(({ total }) => total));
  if (!coefficients) return 'unrepresentable';
  return inPlane.map(({ nodeId, dof }, index) => ({ nodeId, dof, coefficient: coefficients[index]! }));
}

export function hasReducedPlanarMpc(c: Constraint3D): boolean {
  if (c.type !== 'linearMPC' || !c.terms.some(term => DOF_3D_TO_2D[term.dof] !== undefined)) return false;
  const terms = projectMpc(c.terms);
  return terms === 'unrepresentable' || (Array.isArray(terms) && terms.length < c.terms.length);
}

function couplesAcrossPlane(c: Constraint3D): boolean {
  if (c.type === 'linearMPC') return typeof projectMpc(c.terms) === 'string';
  return c.type === 'eccentricConnection' && classifyEccentricNormalOffset(c) === 'coupled';
}

function mpcRefusal(projection: Exclude<MpcProjection, MpcTerm[]>, index: number): string {
  const path = `constraints[${index}].terms`;
  return projection === 'coupled' ? `${t('svc.constraintsCoupled')} ${path}` : tp('svc.engine.invalidInputField', { path });
}

export function classifyEccentricNormalOffset(c: EccentricConnectionConstraint): 'none' | 'separated' | 'coupled' {
  if ((c.offsetY ?? 0) === 0) return 'none';
  return PLANAR_TRANSLATIONS.every(dof => c.releases?.[dof] === true) ? 'separated' : 'coupled';
}

export function planeConstraintRefusal(constraints: readonly Constraint3D[] = [], plane: DrawPlane = 'xz'): string | null {
  for (const [index, c] of constraints.entries()) {
    if (c.type === 'linearMPC') {
      const terms = projectMpc(c.terms);
      if (typeof terms === 'string') return mpcRefusal(terms, index);
    } else if (c.type === 'eccentricConnection' && classifyEccentricNormalOffset(c) === 'coupled') {
      return `${t('svc.constraintsCoupled')} constraints[${index}].offset${NORMAL[plane].toUpperCase()}`;
    }
  }
  return null;
}

const NORMAL: Record<DrawPlane, 'x' | 'y' | 'z'> = { xz: 'y', yz: 'x', xy: 'z' };

/**
 * The rigid links and diaphragms, as written in 3D, whose nodes lie at different depths along the
 * plane's normal: their arm then carries an out-of-plane rotation into an in-plane translation
 * (uy_s − uy_m = Δx·rz on a Y–Z plane), which the plane model cannot hold.
 */
export function constraintsAcrossDepth(
  plane: DrawPlane, constraints: readonly Constraint3D[],
  nodeAt: (id: number) => { x: number; y: number; z?: number } | undefined,
): Constraint3D[] {
  const depth = (id: number) => { const n = nodeAt(id); return n ? (n[NORMAL[plane]] ?? 0) : undefined; };
  return constraints.filter((c) => {
    let ids: number[];
    if (c.type === 'rigidLink') {
      if (rigidLinkDofs(c).every(d => d >= 3)) return false;
      ids = [c.masterNode, c.slaveNode];
    } else if (c.type === 'diaphragm') ids = [c.masterNode, ...c.slaveNodes];
    else return false;
    const depths = ids.map(depth).filter((d): d is number => d !== undefined);
    return depths.length > 1 && Math.max(...depths) - Math.min(...depths) > 1e-6;
  });
}

function mapDofs(dofs: readonly number[] | undefined): number[] | undefined {
  if (!dofs) return undefined;
  return dofs
    .map(d => DOF_3D_TO_2D[d])
    .filter((d): d is number => d !== undefined);
}

/**
 * Returns the 2D-wire shape of the given constraints. The result is what both
 * the 2D connectivity preflight and serializeInput2D must consume, so the
 * preflight only credits constraints that actually reach the solver.
 */
export function constraintsTo2D(constraints: Constraint3D[] | undefined): Constraint3D[] {
  if (!constraints || constraints.length === 0) return [];
  const out: Constraint3D[] = [];
  for (const [index, c] of constraints.entries()) {
    switch (c.type) {
      case 'rigidLink': {
        const dofs = mapDofs(rigidLinkDofs(c));
        if (!dofs || dofs.length === 0) break; // only out-of-plane DOFs
        out.push({ ...c, dofs });
        break;
      }
      case 'equalDOF': {
        const dofs = mapDofs(c.dofs) ?? [];
        if (dofs.length === 0) break;
        out.push({ ...c, dofs });
        break;
      }
      case 'linearMPC': {
        const terms = projectMpc(c.terms);
        if (typeof terms === 'string') throw new ModelInputError(mpcRefusal(terms, index));
        if (terms.length > 0) out.push({ ...c, terms });
        break;
      }
      case 'eccentricConnection': {
        requireEccentricReleaseMask(`constraints[${index}].releases`, c.releases);
        if (classifyEccentricNormalOffset(c) === 'coupled') {
          throw new ModelInputError(`${t('svc.constraintsCoupled')} constraints[${index}].offsetY`);
        }
        // 2D solver kinematics read offset_x (horizontal) and offset_y
        // (VERTICAL — its dy slot); the stored 3D shape keeps vertical in
        // offsetZ. The out-of-plane offsetY is dropped, like uy loads.
        out.push({
          ...c,
          offsetX: c.offsetX,
          offsetY: c.offsetZ,
          offsetZ: 0,
          releases: PLANAR_DOFS.map(dof => c.releases?.[dof] ?? false),
        });
        break;
      }
      case 'diaphragm': {
        // Its trace on the model plane (see the header): per slave, an equal DOF or a rigid link.
        const plane = (c.plane ?? 'XY').toUpperCase();
        for (const s of c.slaveNodes) {
          if (s === c.masterNode) continue;
          if (plane === 'XZ') out.push({ type: 'rigidLink', masterNode: c.masterNode, slaveNode: s, dofs: [0, 1, 2] });
          else if (plane === 'YZ') out.push({ type: 'equalDOF', masterNode: c.masterNode, slaveNode: s, dofs: [1] });
          else if (plane === 'XY') out.push({ type: 'equalDOF', masterNode: c.masterNode, slaveNode: s, dofs: [0] });
          // Any other name: sent as it is, for the solver to refuse.
          else out.push({ ...c, slaveNodes: [s] });
        }
        break;
      }
    }
  }
  return out;
}
