/**
 * Rotations nothing resists, made solvable — the JS side of the 3D boundary.
 *
 * ── The defect ─────────────────────────────────────────────────────
 *
 * A space frame carries three rotations at every node, because its frame
 * members need them. A node that no frame member rigidly reaches — one met
 * only by truss bars, or where every member end releases its moments — still
 * has those three rotations, and nothing gives them stiffness. The matrix is
 * singular for a reason that has nothing to do with the structure, and the
 * analysis solver reported every such model as a mechanism: a truss roof on
 * columns, a braced frame whose diagonals meet at their own node. They are
 * stable structures.
 *
 * The plane analysis does not have the problem: the solver adds a vanishing
 * spring (1e-10 of the largest stiffness) to a rotation no member resists.
 * The space analysis adds it only for warping. This does the same for
 * rotations, here, before the input crosses into the solver — the fix belongs
 * on this side of the boundary, and the solver is not touched.
 *
 * ── What is added, and why it changes nothing else ─────────────────
 *
 * A rotational spring, on every free rotation of a node whose rotations the
 * frame members at it do not span. Its stiffness is 1e-10 of the largest
 * member stiffness in the model: large enough for the factorisation, too
 * small to carry anything a reader could see. Where a member does resist a
 * rotation the spring is lost in round-off beside it. The solver reports a
 * spring's rotational reaction as zero; `dropArtificialReactions` removes the
 * all-zero reaction entry a node with no real support would otherwise gain.
 */
import type { SolverInput3D, SolverSupport3D } from './types-3d';
import { computeLocalAxes3D } from './local-axes-3d';

type V3 = [number, number, number];

/** Rank of a set of 3-vectors, by Gram–Schmidt. */
function rank(vs: V3[]): number {
  const basis: V3[] = [];
  for (const v of vs) {
    let w: V3 = [...v];
    for (const b of basis) {
      const d = w[0] * b[0] + w[1] * b[1] + w[2] * b[2];
      w = [w[0] - d * b[0], w[1] - d * b[1], w[2] - d * b[2]];
    }
    const n = Math.hypot(w[0], w[1], w[2]);
    if (n > 1e-6) basis.push([w[0] / n, w[1] / n, w[2] / n]);
    if (basis.length === 3) break;
  }
  return basis.length;
}

export interface OrphanStabilisation {
  /** Nodes that received a spring; those without a support before, in `created`. */
  touched: Set<number>;
  created: Set<number>;
}

export function stabiliseOrphanRotations3D(input: SolverInput3D): OrphanStabilisation {
  const touched = new Set<number>();
  const created = new Set<number>();
  const elements = [...input.elements.values()];
  if (!elements.some((e) => e.type === 'frame')) return { touched, created };

  /* The axes each frame end resists rotation about, per node. */
  const resisted = new Map<number, V3[]>();
  let kMax = 0;
  for (const e of elements) {
    if (e.type !== 'frame') continue;
    const ni = input.nodes.get(e.nodeI);
    const nj = input.nodes.get(e.nodeJ);
    const sec = input.sections.get(e.sectionId);
    const mat = input.materials.get(e.materialId);
    if (!ni || !nj || !sec || !mat) continue;
    const ly = e.localYx !== undefined && e.localYy !== undefined && e.localYz !== undefined
      ? { x: e.localYx, y: e.localYy, z: e.localYz } : undefined;
    const ax = computeLocalAxes3D(ni, nj, ly, e.rollAngle, input.leftHand);
    const E = mat.e * 1000;
    const L = ax.L;
    kMax = Math.max(kMax, (E * sec.a) / L, (12 * E * sec.iz) / L ** 3, (12 * E * sec.iy) / L ** 3,
      (4 * E * sec.iz) / L, (4 * E * sec.iy) / L);
    const ends: Array<[number, boolean, boolean, boolean]> = [
      [e.nodeI, !!e.releaseTStart, !!e.releaseMyStart, !!e.releaseMzStart],
      [e.nodeJ, !!e.releaseTEnd, !!e.releaseMyEnd, !!e.releaseMzEnd],
    ];
    for (const [node, t, my, mz] of ends) {
      const list = resisted.get(node) ?? [];
      if (!t) list.push(ax.ex);
      if (!my) list.push(ax.ey);
      if (!mz) list.push(ax.ez);
      resisted.set(node, list);
    }
  }
  if (kMax <= 0) return { touched, created };
  const k = kMax * 1e-10;

  const byNode = new Map<number, [number, SolverSupport3D]>();
  for (const [id, s] of input.supports) byNode.set(s.nodeId, [id, s]);
  let nextId = Math.max(0, ...input.supports.keys()) + 1;

  for (const nodeId of input.nodes.keys()) {
    if (rank(resisted.get(nodeId) ?? []) === 3) continue;
    const found = byNode.get(nodeId);
    const sup: SolverSupport3D = found ? { ...found[1] }
      : { nodeId, rx: false, ry: false, rz: false, rrx: false, rry: false, rrz: false };
    /* A spring makes a DOF free-with-spring: never put one on a restrained rotation. */
    const added: [boolean, boolean, boolean] = [
      !sup.rrx && !(sup.krx && sup.krx > 0),
      !sup.rry && !(sup.kry && sup.kry > 0),
      !sup.rrz && !(sup.krz && sup.krz > 0),
    ];
    if (added[0]) sup.krx = k;
    if (added[1]) sup.kry = k;
    if (added[2]) sup.krz = k;
    if (!added.some(Boolean)) continue;
    touched.add(nodeId);
    /* Marked in-band, so the mark survives a worker's structured clone. The
       axes are recorded too: a `springs` support may keep the user's own
       rotational springs, and those must still count. */
    sup.stabilised = found ? 'springs' : 'created';
    sup.stabilisedAxes = added;
    if (found) input.supports.set(found[0], sup);
    else { input.supports.set(nextId++, sup); created.add(nodeId); }
  }
  return { touched, created };
}

// The reaction filter lives on its own: see stabilised-reactions.ts.
export { stripStabilisedReactions } from './stabilised-reactions';
