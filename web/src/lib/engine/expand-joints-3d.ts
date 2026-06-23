// Basic 3D internal joints via ephemeral coincident helper nodes + eccentric
// connections (zero offset). The mechanical dual, in 3D, of the 2D sliding
// joint: a per-element-end relative-DOF release mask.
//
// A 3D joint releases a chosen subset of the six relative DOFs between a member
// end and its joint node while tying the rest. The 3D frame element can only
// condense rotations, so translational releases (and a uniform 6-DOF mask)
// cannot be a pure element release — exactly the situation member offsets
// already solve. So, inside buildSolverInput3D we:
//   - duplicate the joint node into a coincident helper node,
//   - retarget the jointed element end to the helper,
//   - add an eccentricConnection (master = real joint node, slave = helper,
//     offset 0) whose `releases` mask IS the joint's released-DOF mask. The
//     constrained 3D solver frees exactly the masked relative DOFs and ties the
//     rest (translations + rotations) across the coincident pair.
// Helpers live only in the solver input; their results are pruned before they
// reach the UI (pruneHelperNodeResults, shared with member offsets).
//
// releases mask / DOF order is the global solver convention:
//   [0]=ux [1]=uy [2]=uz [3]=rx [4]=ry [5]=rz   (true = released/free)

import type { SolverInput3D, SolverNode3D } from './types-3d';
import type { Element } from '../store/model.svelte';
import { jointHasRelease } from '../store/model.svelte';
import { createEccentricHelpers } from './helper-expansion';

const ZERO_OFFSET = { x: 0, y: 0, z: 0 };

/** Any element in the model carries a released 3D internal joint. */
export function modelHasJoints3D(elements: Iterable<Element>): boolean {
  for (const e of elements) if (jointHasRelease(e.jointI) || jointHasRelease(e.jointJ)) return true;
  return false;
}

/**
 * Mutate `input` in place: expand each released 3D joint into a coincident helper
 * node + eccentricConnection. Deterministic helper ids (maxNodeId + sequential;
 * elements in id order, i-end before j-end). No-op when no element has a released
 * joint → returns an empty set. Returns the set of helper node ids created.
 */
/**
 * DOF permutation for the flat-2D embed (model XY → solver XZ, see
 * projectNodeToScene): model dy↔solver dz, dz↔dy, θy↔θz, θz↔θy — i.e. swap
 * indices 1↔2 and 4↔5. `releases[i] = mask[perm[i]]` rewrites a global-axis
 * joint mask into the embedded solver frame. Identity on the genuine-3D path.
 * Only the AXIS matters for a boolean free/fixed flag, so the embed's
 * orientation reversal (a reflection) is irrelevant — no sign/handedness term.
 */
export const EMBED_XZ_DOF_PERMUTATION: readonly number[] = [0, 2, 1, 3, 5, 4];

export function expandJoints3D(
  input: SolverInput3D,
  modelElements: Map<number, Element>,
  /** When set, remap each joint mask into the embedded solver frame (see
   *  EMBED_XZ_DOF_PERMUTATION). Omit for genuine 3D (identity). */
  dofPermutation?: readonly number[],
): Set<number> {
  const jointEls = [...modelElements.values()]
    .filter(e => jointHasRelease(e.jointI) || jointHasRelease(e.jointJ))
    .sort((a, b) => a.id - b.id);
  if (jointEls.length === 0) return new Set<number>();

  const helpers = createEccentricHelpers(input);

  for (const e of jointEls) {
    const solverEl = input.elements.get(e.id);
    if (!solverEl) continue;
    const nI = input.nodes.get(solverEl.nodeI);
    const nJ = input.nodes.get(solverEl.nodeJ);
    if (!nI || !nJ) continue;

    const ends: Array<['i' | 'j', SolverNode3D, typeof e.jointI]> = [
      ['i', nI, e.jointI],
      ['j', nJ, e.jointJ],
    ];
    for (const [end, joint, jointDef] of ends) {
      if (!jointHasRelease(jointDef)) continue;

      // Coincident helper (zero offset); releases = the joint mask, remapped into
      // the embedded solver frame when a permutation is given.
      const dof = jointDef!.dof;
      const releases = dofPermutation ? dofPermutation.map(src => dof[src]) : [...dof];
      const helperId = helpers.add(joint, ZERO_OFFSET, releases);

      // Retarget the jointed end to the coincident helper node.
      if (end === 'i') solverEl.nodeI = helperId;
      else solverEl.nodeJ = helperId;
    }
  }

  return helpers.finish();
}
