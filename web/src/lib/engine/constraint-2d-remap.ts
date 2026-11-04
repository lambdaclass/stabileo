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

const DOF_3D_TO_2D: Record<number, number> = { 0: 0, 2: 1, 4: 2 };

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
