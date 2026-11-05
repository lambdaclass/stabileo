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

import type { Constraint3D } from './types-3d';
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
  if (plane === 'xz') return [...constraints];
  const axis = AXES_IN_XZ[plane];
  const dof = (d: number) => (d < 3 ? axis[d] : 3 + axis[d - 3]);
  const inPlaneRotation = plane === 'yz' ? 3 : 5;
  const letter = (c: string) => 'XYZ'[axis['XYZ'.indexOf(c)]] ?? c;
  return constraints.map((c): Constraint3D => {
    switch (c.type) {
      case 'rigidLink': return c.dofs ? { ...c, dofs: c.dofs.map(dof) } : { ...c };
      case 'equalDOF': return { ...c, dofs: c.dofs.map(dof) };
      case 'linearMPC': return { ...c, terms: c.terms.map((t) => ({ ...t, dof: dof(t.dof), coefficient: t.dof === inPlaneRotation ? -t.coefficient : t.coefficient })) };
      case 'diaphragm': {
        const name = (c.plane ?? 'XY').toUpperCase();
        return /^[XYZ]{2}$/.test(name) ? { ...c, plane: [...name].map(letter).sort().join('') } : { ...c };
      }
      case 'eccentricConnection': {
        const offsets = [c.offsetX ?? 0, c.offsetY ?? 0, c.offsetZ ?? 0];
        const moved = [0, 0, 0];
        offsets.forEach((v, i) => { moved[axis[i]] = v; });
        let releases = c.releases;
        if (releases && releases.length === 6) {
          const out = new Array<boolean>(6).fill(false);
          releases.forEach((r, i) => { out[dof(i)] = r; });
          releases = out;
        }
        return { ...c, offsetX: moved[0], offsetY: moved[1], offsetZ: moved[2], releases };
      }
    }
  });
}

const DOF_3D_TO_2D: Record<number, number> = { 0: 0, 2: 1, 4: 2 };

/**
 * The constraints, already written in X–Z, that tie a DOF in the plane to one out of it: a
 * linear MPC with terms on both sides, or an eccentric connection whose offset leaves the plane.
 * The plane solver has no out-of-plane DOFs, so it cannot keep that coupling (#466).
 */
export function constraintsCoupledAcrossPlane(constraints: readonly Constraint3D[]): Constraint3D[] {
  return constraints.filter((c) => {
    if (c.type === 'linearMPC') {
      const live = c.terms.filter((t) => t.coefficient !== 0);
      return live.some((t) => DOF_3D_TO_2D[t.dof] !== undefined) && live.some((t) => DOF_3D_TO_2D[t.dof] === undefined);
    }
    return c.type === 'eccentricConnection' && (c.offsetY ?? 0) !== 0;
  });
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
      if (c.dofs && c.dofs.length > 0 && c.dofs.every((d) => d >= 3)) return false;
      ids = [c.masterNode, c.slaveNode];
    } else if (c.type === 'diaphragm') ids = [c.masterNode, ...c.slaveNodes];
    else return false;
    const depths = ids.map(depth).filter((d): d is number => d !== undefined);
    return depths.length > 1 && Math.max(...depths) - Math.min(...depths) > 1e-6;
  });
}

function mapDofs(dofs: number[] | undefined): number[] | undefined {
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
  for (const c of constraints) {
    switch (c.type) {
      case 'rigidLink': {
        // No DOFs listed: all translational, as the space solve reads it; listed for the plane
        // solver, whose own default would tie the rotation as well.
        if (!c.dofs || c.dofs.length === 0) { out.push({ ...c, dofs: [0, 1] }); break; }
        const dofs = mapDofs(c.dofs);
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
        // An equation involving an out-of-plane DOF has no 2D meaning — drop whole.
        if (c.terms.some(t => DOF_3D_TO_2D[t.dof] === undefined)) break;
        // θ = −ry: an ry term keeps its meaning with its coefficient negated.
        out.push({ ...c, terms: c.terms.map(t => ({ ...t, dof: DOF_3D_TO_2D[t.dof], coefficient: t.dof === 4 ? -t.coefficient : t.coefficient })) });
        break;
      }
      case 'eccentricConnection': {
        // 2D solver kinematics read offset_x (horizontal) and offset_y
        // (VERTICAL — its dy slot); the stored 3D shape keeps vertical in
        // offsetZ. The out-of-plane offsetY is dropped, like uy loads.
        out.push({
          ...c,
          offsetX: c.offsetX,
          offsetY: c.offsetZ,
          offsetZ: 0,
          releases: [
            c.releases?.[0] ?? false, // ux
            c.releases?.[2] ?? false, // uz → 2D slot 1
            c.releases?.[4] ?? false, // ry → 2D slot 2
          ],
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
