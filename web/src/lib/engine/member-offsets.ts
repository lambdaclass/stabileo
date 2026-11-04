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

const RIGID_RELEASES = [false, false, false, false, false, false];

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
  const helperIds = new Set<number>();
  const offsetEls = [...modelElements.values()].filter(hasMemberOffset).sort((a, b) => a.id - b.id);
  if (offsetEls.length === 0) return helperIds;

  let nextId = 0;
  for (const id of input.nodes.keys()) if (id > nextId) nextId = id;
  nextId += 1;

  const constraints = [...(input.constraints ?? [])];

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

      const helperId = nextId++;
      const jointId = joint.id;
      input.nodes.set(helperId, { id: helperId, x: joint.x + v.x, y: joint.y + v.y, z: joint.z + v.z });
      helperIds.add(helperId);

      // Retarget the element's end to the helper (analytical) node.
      if (end === 'i') solverEl.nodeI = helperId; else solverEl.nodeJ = helperId;

      // Rigid eccentric arm: joint (master, keeps supports/loads/other members)
      // → helper (slave, where the member now connects). All DOFs rigid.
      constraints.push({
        type: 'eccentricConnection',
        masterNode: jointId,
        slaveNode: helperId,
        offsetX: v.x,
        offsetY: v.y,
        offsetZ: v.z,
        releases: [...RIGID_RELEASES],
      } as any);
    }
  }

  input.constraints = constraints;
  return helperIds;
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
 * solver expansion uses: effectiveRoll = rollAngle + section rotation, and the
 * right-handed frame (the axis convention never reaches the analysis; see
 * `buildSolverLoads3D`). The single shared resolver for every visualization —
 * a preview that uses different axes than the analysis lies about where the
 * member actually acts.
 */
export function resolveOffsetWorldVectors(
  elem: { offset?: MemberOffset; localYx?: number; localYy?: number; localYz?: number; rollAngle?: number },
  pI: { x: number; y: number; z: number },
  pJ: { x: number; y: number; z: number },
  sectionRotation: number | undefined,
  _leftHand: boolean,
): { i: { x: number; y: number; z: number } | null; j: { x: number; y: number; z: number } | null } | null {
  if (!hasMemberOffset(elem)) return null;
  const localY = (elem.localYx !== undefined && elem.localYy !== undefined && elem.localYz !== undefined)
    ? { x: elem.localYx, y: elem.localYy, z: elem.localYz } : undefined;
  let axes;
  try {
    axes = computeLocalAxes3D(
      { id: 0, ...pI }, { id: 0, ...pJ },
      localY, (elem.rollAngle ?? 0) + (sectionRotation ?? 0), false,
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

// ─── The member's reference line, for everything downstream of the analysis ───
//
// The analysis puts an offset member's flexible length on node + offset (the helper nodes
// above). Everything that reads the member after the solve — the design's support faces,
// its flange, the detailing's bar elevations, joint bands and column cages, the
// concrete solids — has to read the SAME line, or the bars are laid round an axis the forces
// were never computed on. These helpers are that one reading, built on the resolver the
// solver expansion and the viewport already share (`resolveOffsetWorldVectors`).

export type Vec3 = { x: number; y: number; z: number };
const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

/** What an element must carry for its reference line to be read. */
export interface OffsetCarrier {
  offset?: MemberOffset;
  localYx?: number; localYy?: number; localYz?: number;
  rollAngle?: number;
  sectionId?: number;
}

export interface MemberReferenceLine {
  /** The member's centroidal axis at its i and j ends, model coordinates, m. */
  i: Vec3;
  j: Vec3;
  /** Node to axis at each end, global, m: the declared insertion offset, zero where none. */
  offsetI: Vec3;
  offsetJ: Vec3;
  /**
   * Where the line comes from. `insertion`: the model declares an offset, and the axis is the
   * nodes plus it. `node`: the model declares none, so the axis is taken through the nodes —
   * the centroidal convention, which is an assumption about the model and is said as one by
   * whoever reports the derivation.
   */
  datum: 'insertion' | 'node';
}

/**
 * The reference line of a member: its nodes plus its declared insertion offsets, resolved on
 * the axes the solver expansion uses (roll plus section rotation, right-handed). `sections`
 * is needed only for a `local` offset on a rotated section; a `global` one needs nothing.
 */
export function memberReferenceLine(
  elem: OffsetCarrier,
  nI: { x: number; y: number; z?: number },
  nJ: { x: number; y: number; z?: number },
  sections?: ReadonlyMap<number, { rotation?: number }>,
): MemberReferenceLine {
  const pI = { x: nI.x, y: nI.y, z: nI.z ?? 0 };
  const pJ = { x: nJ.x, y: nJ.y, z: nJ.z ?? 0 };
  const rot = elem.sectionId !== undefined ? sections?.get(elem.sectionId)?.rotation : undefined;
  const off = resolveOffsetWorldVectors(elem, pI, pJ, rot, false);
  const oI = off?.i ?? ZERO, oJ = off?.j ?? ZERO;
  return {
    i: { x: pI.x + oI.x, y: pI.y + oI.y, z: pI.z + oI.z },
    j: { x: pJ.x + oJ.x, y: pJ.y + oJ.y, z: pJ.z + oJ.z },
    offsetI: { ...oI }, offsetJ: { ...oJ },
    datum: off ? 'insertion' : 'node',
  };
}

/** Node to axis of a member at one of its nodes, global, m (zero where it declares none). */
export function memberOffsetAt(
  elem: OffsetCarrier & { nodeI: number; nodeJ: number },
  nodeId: number,
  nodes: ReadonlyMap<number, { x: number; y: number; z?: number }>,
  sections?: ReadonlyMap<number, { rotation?: number }>,
): Vec3 {
  if (!hasMemberOffset(elem)) return { ...ZERO };
  const a = nodes.get(elem.nodeI), b = nodes.get(elem.nodeJ);
  if (!a || !b) return { ...ZERO };
  const line = memberReferenceLine(elem, a, b, sections);
  return { ...(nodeId === elem.nodeI ? line.offsetI : line.offsetJ) };
}

/** The datum, in words, for a derivation: the offset declared, or the centroidal assumption. */
export function referenceLineNote(line: Pick<MemberReferenceLine, 'datum' | 'offsetI' | 'offsetJ'>): string {
  if (line.datum === 'node') {
    return 'Línea de referencia: el modelo no declara punto de inserción ni excentricidad para la barra; '
      + 'se toma su eje baricéntrico por los nodos (convención supuesta, no un dato).';
  }
  const v = (o: Vec3) => `(${o.x.toFixed(3)}; ${o.y.toFixed(3)}; ${o.z.toFixed(3)}) m`;
  return `Línea de referencia: eje baricéntrico a ${v(line.offsetI)} del nodo i y ${v(line.offsetJ)} `
    + 'del nodo j, según la inserción declarada en el modelo (la misma que recibe el análisis).';
}
