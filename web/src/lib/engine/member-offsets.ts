// Analytical member offsets via ephemeral helper nodes + eccentric constraints.
//
// A member with offset metadata is parallel-shifted off its node centerline.
// We DO NOT change the solver or persist helper topology. Instead, inside the
// solver-input builder we:
//   - generate a helper node at jointPos + offset for each offset end,
//   - retarget the element's end to the helper node,
//   - add an EccentricConnection (master = real joint, slave = helper, all DOFs
//     rigid) so the member's end forces transfer to the joint through the rigid
//     arm — producing real eccentricity moments.
// Helpers live only in the solver input; results for them are pruned before
// they reach the UI (see pruneHelperNodeResults).

import { computeLocalAxes3D } from './local-axes-3d';
import type { SolverInput3D, SolverNode3D, AnalysisResults3D } from './types-3d';
import type { Element } from '../store/model.svelte';
import type { MemberOffset, MemberOffsetVec } from '../model/element-3d-metadata';
import { createEccentricHelpers, RIGID_RELEASES } from './helper-expansion';

const EPS = 1e-9;

function vecNonZero(v?: MemberOffsetVec): boolean {
  return !!v && (Math.abs(v.x) > EPS || Math.abs(v.y) > EPS || Math.abs(v.z) > EPS);
}

/** True if the element carries a non-zero offset at either end. */
export function hasMemberOffset(e: { offset?: MemberOffset }): boolean {
  return !!e.offset && (vecNonZero(e.offset.i) || vecNonZero(e.offset.j));
}

/** Any element in the model carries an offset. */
export function modelHasMemberOffsets(elements: Iterable<Element>): boolean {
  for (const e of elements) if (hasMemberOffset(e)) return true;
  return false;
}

/** Convert an offset vector to a solver-space global vector. */
export function offsetVecToSolver(
  vec: MemberOffsetVec,
  frame: 'global' | 'local',
  axes: { ex: [number, number, number]; ey: [number, number, number]; ez: [number, number, number] },
): { x: number; y: number; z: number } {
  if (frame === 'global') return { x: vec.x, y: vec.y, z: vec.z };
  // local: vec.x along ex, vec.y along ey, vec.z along ez
  return {
    x: vec.x * axes.ex[0] + vec.y * axes.ey[0] + vec.z * axes.ez[0],
    y: vec.x * axes.ex[1] + vec.y * axes.ey[1] + vec.z * axes.ez[1],
    z: vec.x * axes.ex[2] + vec.y * axes.ey[2] + vec.z * axes.ez[2],
  };
}

/**
 * Mutate `input` in place: expand offset members into helper nodes + eccentric
 * constraints. Deterministic helper ids (maxNodeId + sequential, elements in id
 * order, i-end before j-end). No-op when no element has an offset → leaves the
 * input byte-identical. Returns the set of helper node ids created.
 *
 * NOTE: intended for genuine 3D (non-projected) models; the caller gates this.
 */
export function expandMemberOffsets(
  input: SolverInput3D,
  modelElements: Map<number, Element>,
): Set<number> {
  const offsetEls = [...modelElements.values()].filter(hasMemberOffset).sort((a, b) => a.id - b.id);
  if (offsetEls.length === 0) return new Set<number>();

  const helpers = createEccentricHelpers(input);

  for (const e of offsetEls) {
    const solverEl: any = input.elements.get(e.id);
    if (!solverEl) continue;
    const nI = input.nodes.get(solverEl.nodeI);
    const nJ = input.nodes.get(solverEl.nodeJ);
    if (!nI || !nJ) continue;

    // Axes consistent with how the solver orients this element.
    const localY = (solverEl.localYx !== undefined && solverEl.localYy !== undefined && solverEl.localYz !== undefined)
      ? { x: solverEl.localYx, y: solverEl.localYy, z: solverEl.localYz } : undefined;
    let axes;
    try {
      axes = computeLocalAxes3D(nI, nJ, localY, solverEl.rollAngle, input.leftHand);
    } catch {
      continue; // zero-length — skip
    }

    const ends: Array<['i' | 'j', SolverNode3D]> = [['i', nI], ['j', nJ]];
    for (const [end, joint] of ends) {
      const vec = end === 'i' ? e.offset!.i : e.offset!.j;
      if (!vecNonZero(vec)) continue;
      const v = offsetVecToSolver(vec!, e.offset!.frame, axes);

      // Rigid eccentric arm: joint (master) → helper at joint+v (slave), where the
      // member now connects. All DOFs rigid.
      const helperId = helpers.add(joint, v, RIGID_RELEASES);
      if (end === 'i') solverEl.nodeI = helperId; else solverEl.nodeJ = helperId;
    }
  }

  return helpers.finish();
}

/**
 * Remove helper-node entries (displacements/reactions) from results so they
 * never surface in node tables, reports, result query, CSV, or selection.
 * Element forces are keyed by element id and are left untouched. No-op when the
 * results contain no helper nodes (all node ids are real model nodes).
 */
export function pruneHelperNodeResults(
  results: AnalysisResults3D,
  modelNodeIds: Set<number>,
): AnalysisResults3D {
  const dispLeak = results.displacements.some((d) => !modelNodeIds.has(d.nodeId));
  const reacLeak = results.reactions.some((r) => !modelNodeIds.has(r.nodeId));
  // The eccentric arms emit constraint forces keyed to helper node ids — they
  // would surface in the constraint-forces table and corrupt its arrow scale.
  const cfLeak = (results.constraintForces ?? []).some((c) => !modelNodeIds.has(c.nodeId));
  if (!dispLeak && !reacLeak && !cfLeak) return results;
  return {
    ...results,
    displacements: results.displacements.filter((d) => modelNodeIds.has(d.nodeId)),
    reactions: results.reactions.filter((r) => modelNodeIds.has(r.nodeId)),
    ...(results.constraintForces
      ? { constraintForces: results.constraintForces.filter((c) => modelNodeIds.has(c.nodeId)) }
      : {}),
  };
}

/**
 * World-space offset vectors for an element, computed with the SAME axes the
 * solver expansion uses: effectiveRoll = rollAngle + section rotation, plus the
 * leftHand convention. The single shared resolver for every visualization —
 * a preview that uses different axes than the analysis lies about where the
 * member actually acts.
 */
export function resolveOffsetWorldVectors(
  elem: { offset?: MemberOffset; localYx?: number; localYy?: number; localYz?: number; rollAngle?: number },
  pI: { x: number; y: number; z: number },
  pJ: { x: number; y: number; z: number },
  sectionRotation: number | undefined,
  leftHand: boolean,
): { i: { x: number; y: number; z: number } | null; j: { x: number; y: number; z: number } | null } | null {
  if (!hasMemberOffset(elem)) return null;
  const localY = (elem.localYx !== undefined && elem.localYy !== undefined && elem.localYz !== undefined)
    ? { x: elem.localYx, y: elem.localYy, z: elem.localYz } : undefined;
  let axes;
  try {
    axes = computeLocalAxes3D(
      { id: 0, ...pI }, { id: 0, ...pJ },
      localY, (elem.rollAngle ?? 0) + (sectionRotation ?? 0), leftHand,
    );
  } catch {
    return null; // zero-length
  }
  const off = elem.offset!;
  return {
    i: off.i && vecNonZero(off.i) ? offsetVecToSolver(off.i, off.frame, axes) : null,
    j: off.j && vecNonZero(off.j) ? offsetVecToSolver(off.j, off.frame, axes) : null,
  };
}
