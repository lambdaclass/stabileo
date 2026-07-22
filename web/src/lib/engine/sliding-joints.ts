// Basic 2D internal sliding joints via ephemeral coincident helper nodes + MPCs.
//
// A sliding joint is stored as a translational release on a frame element END
// (Release.slide / Release.slideAxis) — mechanically the dual of the hinge,
// which is a rotational release. The 2D frame element has no translational
// condensation (only Mz can be condensed), so a slider CANNOT be a pure element
// release. Instead, inside the 2D solver-input builder we:
//   - duplicate the joint node into a coincident helper node,
//   - retarget the sliding element end to the helper node,
//   - tie every DOF EXCEPT the released translation between the real joint
//     (master) and the helper (slave):
//       * global X slide  → equalDOF [uz, ry]      (releases ux)
//       * global Z slide  → equalDOF [ux, ry]      (releases uz)
//       * local  x slide  → linearMPC: perpendicular translation tied + equalDOF [ry]
//                           (releases the along-member direction)
//       * local  z slide  → linearMPC: along-member translation tied + equalDOF [ry]
//                           (releases the perpendicular direction)
// The constrained 2D solver (solve_2d auto-delegates when constraints exist)
// then permits exactly the released relative translation while transferring the
// tied shear/axial + moment across the joint. Helpers live only in the solver
// input; their results are pruned before reaching the UI (pruneHelperNodeResults
// in member-offsets.ts handles any node id not in the model).
//
// DOF convention here is the 2D solver wire: 0=ux, 1=uz, 2=ry. The constraints
// are appended to input.constraints already in this convention (serializeInput2D
// passes them verbatim to WASM solve_2d), so they must NOT go through
// constraintsTo2D again.

import type { SolverInput } from './types';
import type { Constraint3D } from './types-3d';
import type { Element, ReleaseEnd } from '../store/model.svelte';

const EPS = 1e-12;

/** True if the element carries a sliding-joint release at either end. */
export function hasSlidingJoint(e: { releaseI?: { slide?: string }; releaseJ?: { slide?: string } }): boolean {
  return e.releaseI?.slide != null || e.releaseJ?.slide != null;
}

/** Any element in the model carries a sliding joint. */
export function modelHasSlidingJoints(elements: Iterable<Element>): boolean {
  for (const e of elements) if (hasSlidingJoint(e)) return true;
  return false;
}

/**
 * Mutate `input` in place: expand each sliding-joint element end into a
 * coincident helper node + the DOF-tying constraints described above.
 * Deterministic helper ids (maxNodeId + sequential; elements in id order, i-end
 * before j-end). No-op (byte-identical input) when no element has a slider →
 * returns an empty set. Returns the set of helper node ids created.
 */
export function expandSlidingJoints2D(
  input: SolverInput,
  modelElements: Map<number, Element>,
): Set<number> {
  const helperIds = new Set<number>();
  const slideEls = [...modelElements.values()].filter(hasSlidingJoint).sort((a, b) => a.id - b.id);
  if (slideEls.length === 0) return helperIds;

  let nextId = 0;
  for (const id of input.nodes.keys()) if (id > nextId) nextId = id;
  nextId += 1;

  const constraints: Constraint3D[] = [...(input.constraints ?? [])];

  for (const e of slideEls) {
    const solverEl = input.elements.get(e.id);
    if (!solverEl) continue;
    const nI = input.nodes.get(solverEl.nodeI);
    const nJ = input.nodes.get(solverEl.nodeJ);
    if (!nI || !nJ) continue;

    // Member local x axis (I→J). Released/tied directions are measured against it.
    const dx = nJ.x - nI.x, dz = nJ.z - nI.z;
    const L = Math.hypot(dx, dz);
    if (L < EPS) continue; // zero-length — skip
    const c = dx / L, s = dz / L; // cosθ, sinθ of the member

    const ends: Array<[ReleaseEnd, typeof nI]> = [['i', nI], ['j', nJ]];
    for (const [end, joint] of ends) {
      const rel = end === 'i' ? e.releaseI : e.releaseJ;
      if (rel?.slide == null) continue;
      const slide = rel.slide;
      const axis = rel.slideAxis ?? 'global';

      const helperId = nextId++;
      const jointId = joint.id;
      input.nodes.set(helperId, { id: helperId, x: joint.x, z: joint.z });
      helperIds.add(helperId);

      // Retarget the sliding end to the coincident helper node.
      if (end === 'i') solverEl.nodeI = helperId;
      else solverEl.nodeJ = helperId;

      if (axis === 'global') {
        // Tie everything except the released world translation.
        const dofs = slide === 'x' ? [1, 2] : [0, 2]; // [uz,ry] or [ux,ry]
        constraints.push({ type: 'equalDOF', masterNode: jointId, slaveNode: helperId, dofs });
      } else {
        // Local: tie the relative translation in the NON-released direction to
        // zero (a linear MPC over the in-plane translation DOFs), and tie the
        // rotation. tieDir is the unit vector whose relative component stays 0.
        // slide 'x' releases along the member (c,s) → tie perpendicular (-s,c).
        // slide 'z' releases perpendicular (-s,c)  → tie along the member (c,s).
        const tieX = slide === 'x' ? -s : c;
        const tieZ = slide === 'x' ? c : s;
        constraints.push({
          type: 'linearMPC',
          terms: [
            { nodeId: jointId, dof: 0, coefficient: tieX },
            { nodeId: jointId, dof: 1, coefficient: tieZ },
            { nodeId: helperId, dof: 0, coefficient: -tieX },
            { nodeId: helperId, dof: 1, coefficient: -tieZ },
          ],
        });
        constraints.push({ type: 'equalDOF', masterNode: jointId, slaveNode: helperId, dofs: [2] });
      }
    }
  }

  input.constraints = constraints;
  return helperIds;
}
