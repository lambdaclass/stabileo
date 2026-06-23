// Shared machinery for the three SolverInput3D "expanders" — member offsets
// (member-offsets.ts), shell offsets (shell-offsets.ts), and 3D internal joints
// (expand-joints-3d.ts). Each turns selected real nodes into coincident-or-offset
// HELPER nodes, retargets the element end / shell corner to the helper, and ties
// the helper back to the real node with a rigid (or released) eccentricConnection.
//
// This module owns the parts that MUST agree across all three, where prior drift
// would silently change solver results:
//   - the deterministic helper-id scheme (maxNodeId + sequential) — so an expander
//     is a byte-identical no-op when it has nothing to expand, and helper ids
//     continue past any earlier expander's helpers when run in sequence;
//   - the helper-node creation (at joint + offset);
//   - the eccentricConnection shape (master = real joint, slave = helper);
//   - the clone-then-write-back of input.constraints.
//
// Each expander keeps its OWN item iteration + retarget (element ends vs shell
// corner arrays), which legitimately differ. The 2D sliding-joint expander uses
// SolverInput (2D) + equalDOF/linearMPC and is intentionally NOT built on this.

import type { SolverInput3D, SolverNode3D, Constraint3D } from './types-3d';

/** All six relative DOFs tied — a rigid eccentric arm (offsets, shell offsets). */
export const RIGID_RELEASES: readonly boolean[] = [false, false, false, false, false, false];

type Vec3 = { x: number; y: number; z: number };

export interface EccentricHelpers {
  /** The set of helper node ids created so far (also returned by finish()). */
  readonly helperIds: Set<number>;
  /**
   * Add a helper node at `joint + offset`, tied to the real `joint` by an
   * eccentricConnection (master = joint, slave = helper) with the given relative
   * release mask. Returns the new helper id so the caller can retarget to it.
   */
  add(joint: SolverNode3D, offset: Vec3, releases: readonly boolean[]): number;
  /** Write the accumulated constraints back onto `input` and return the helper-id set. */
  finish(): Set<number>;
}

/**
 * Create a helper allocator over `input`. Construct it AFTER any earlier expander
 * has run (it snapshots the current max node id), so helper ids never collide.
 */
export function createEccentricHelpers(input: SolverInput3D): EccentricHelpers {
  let nextId = 0;
  for (const id of input.nodes.keys()) if (id > nextId) nextId = id;
  nextId += 1;

  const constraints: Constraint3D[] = [...(input.constraints ?? [])];
  const helperIds = new Set<number>();

  return {
    helperIds,
    add(joint, offset, releases) {
      const helperId = nextId++;
      input.nodes.set(helperId, { id: helperId, x: joint.x + offset.x, y: joint.y + offset.y, z: joint.z + offset.z });
      helperIds.add(helperId);
      constraints.push({
        type: 'eccentricConnection',
        masterNode: joint.id,
        slaveNode: helperId,
        offsetX: offset.x, offsetY: offset.y, offsetZ: offset.z,
        releases: [...releases],
      } as Constraint3D);
      return helperId;
    },
    finish() {
      input.constraints = constraints;
      return helperIds;
    },
  };
}
