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
import type { SolverElement3D, SolverInput3D, SolverSupport3D } from './types-3d';
import { computeLocalAxes3D } from './local-axes-3d';
import { addConstraintConnectivity } from './constraint-connectivity';

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

/**
 * The axes frame member ends resist rotation about, per node (unit vectors in
 * global axes), and the largest member stiffness of the model.
 */
/**
 * A member's local axes in the solve's frame, from its own reference and roll; null where it has
 * none (an end missing, or zero length). The orphan-rotation pass and the 3D static count
 * (`kinematic-3d.ts`) read a frame end's resisted rotations on these same axes.
 */
export function memberAxes3D(input: SolverInput3D, e: SolverElement3D): ReturnType<typeof computeLocalAxes3D> | null {
  const ni = input.nodes.get(e.nodeI), nj = input.nodes.get(e.nodeJ);
  if (!ni || !nj) return null;
  const ly = e.localYx !== undefined && e.localYy !== undefined && e.localYz !== undefined
    ? { x: e.localYx, y: e.localYy, z: e.localYz } : undefined;
  try { return computeLocalAxes3D(ni, nj, ly, e.rollAngle, input.leftHand); } catch { return null; }
}

function frameRotationAxes(input: SolverInput3D): { resisted: Map<number, V3[]>; kMax: number } {
  const resisted = new Map<number, V3[]>();
  let kMax = 0;
  for (const e of input.elements.values()) {
    if (e.type !== 'frame') continue;
    const sec = input.sections.get(e.sectionId);
    const mat = input.materials.get(e.materialId);
    const ax = sec && mat ? memberAxes3D(input, e) : null;
    if (!sec || !mat || !ax) continue;
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
  return { resisted, kMax };
}

export function stabiliseOrphanRotations3D(input: SolverInput3D): OrphanStabilisation {
  const touched = new Set<number>();
  const created = new Set<number>();
  if (![...input.elements.values()].some((e) => e.type === 'frame')) return { touched, created };

  const { resisted, kMax } = frameRotationAxes(input);
  // Offset expansion moves the frame end to a helper node. Its real joint
  // still carries the same rotations through the eccentric constraint, so it
  // must not acquire an artificial spring just because no frame ends there.
  // Share resisted axes across each component of rotationally rigid arms;
  // traversing components also handles chains independently of constraint order.
  const arms = new Map<number, number[]>();
  for (const c of input.constraints ?? []) {
    if (c.type !== 'eccentricConnection' || [3, 4, 5].some((d) => c.releases?.[d])) continue;
    for (const [a, b] of [[c.masterNode, c.slaveNode], [c.slaveNode, c.masterNode]] as const) {
      const neighbours = arms.get(a) ?? [];
      neighbours.push(b);
      arms.set(a, neighbours);
    }
  }
  const linkedRank = new Map<number, number>();
  const visited = new Set<number>();
  for (const start of arms.keys()) {
    if (visited.has(start)) continue;
    const stack = [start], component: number[] = [], axes: V3[] = [];
    visited.add(start);
    while (stack.length) {
      const node = stack.pop()!;
      component.push(node);
      axes.push(...(resisted.get(node) ?? []));
      for (const neighbour of arms.get(node) ?? []) {
        if (visited.has(neighbour)) continue;
        visited.add(neighbour);
        stack.push(neighbour);
      }
    }
    const componentRank = rank(axes);
    for (const node of component) linkedRank.set(node, componentRank);
  }
  if (kMax <= 0) return { touched, created };
  const k = kMax * 1e-10;

  const byNode = new Map<number, [number, SolverSupport3D]>();
  for (const [id, s] of input.supports) byNode.set(s.nodeId, [id, s]);
  let nextId = Math.max(0, ...input.supports.keys()) + 1;

  for (const nodeId of input.nodes.keys()) {
    if ((linkedRank.get(nodeId) ?? rank(resisted.get(nodeId) ?? [])) === 3) continue;
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

/**
 * Nodes whose rotations are real even where no frame member reaches them: a
 * shell, a connector or a constraint acts on them.
 */
function rotationsActedOnOtherwise(input: SolverInput3D): Set<number> {
  const out = new Set<number>();
  for (const shells of [input.plates, input.quads, input.curvedShells]) {
    for (const sh of shells?.values() ?? []) for (const n of sh.nodes) out.add(n);
  }
  for (const c of input.connectors?.values() ?? []) { out.add(c.nodeI); out.add(c.nodeJ); }
  addConstraintConnectivity(out, input.constraints);
  return out;
}

const ROT_FLAGS = ['rrx', 'rry', 'rrz'] as const;
const ROT_SPRINGS = ['krx', 'kry', 'krz'] as const;

/**
 * Global rotation axes at each node that no frame end resists at all: `e_i`
 * orthogonal to every axis a member end there holds. Rotating a node about
 * such an axis strains nothing, so holding it is exact.
 */
function freeGlobalRotations(input: SolverInput3D): Map<number, [boolean, boolean, boolean]> {
  const out = new Map<number, [boolean, boolean, boolean]>();
  if (![...input.elements.values()].some((e) => e.type === 'frame')) return out;
  const { resisted } = frameRotationAxes(input);
  const skip = rotationsActedOnOtherwise(input);
  for (const nodeId of input.nodes.keys()) {
    if (skip.has(nodeId)) continue;
    const axes = resisted.get(nodeId) ?? [];
    const free = [0, 1, 2].map((i) => axes.every((v) => Math.abs(v[i]) < 1e-9)) as [boolean, boolean, boolean];
    if (free.some(Boolean)) out.set(nodeId, free);
  }
  return out;
}

/**
 * The input of an eigenvalue analysis, with the rotations nothing resists held
 * exactly instead of on a vanishing spring.
 *
 * `stabiliseOrphanRotations3D` keeps the linear solves factorable with a
 * 1e-10 spring. The modal analysis cannot live with it: a node that only truss
 * bars meet has three rotations with that spring and no mass, and the
 * decomposition fails ("Eigenvalue decomposition failed") on a frame with one
 * tie, a king-post beam, a truss roof on columns — while the static solve of
 * the same model works. The buckling analysis fails the same way.
 *
 * A rotation about a global axis that every frame end at the node is
 * orthogonal to carries no stiffness and no mass, so restraining it is exact:
 * no other number changes, and the mode shapes give it the zero it has in
 * every result. Only those axes are held; a rotation some member resists, a
 * user's own rotational spring, and any node a shell, connector or constraint
 * acts on are left as they are. The input is not modified.
 */
export function exactOrphanRotations3D(input: SolverInput3D): SolverInput3D {
  const free = freeGlobalRotations(input);
  if (!free.size) return input;
  const byNode = new Map<number, [number, SolverSupport3D]>();
  for (const [id, sp] of input.supports) byNode.set(sp.nodeId, [id, sp]);
  const supports = new Map(input.supports);
  let nextId = Math.max(0, ...input.supports.keys()) + 1;
  let changed = false;
  for (const [nodeId, axes] of free) {
    const found = byNode.get(nodeId);
    const sup: SolverSupport3D = found ? { ...found[1] }
      : { nodeId, rx: false, ry: false, rz: false, rrx: false, rry: false, rrz: false, stabilised: 'created', stabilisedAxes: [false, false, false] };
    const marks: [boolean, boolean, boolean] = [...(sup.stabilisedAxes ?? [false, false, false])] as [boolean, boolean, boolean];
    let any = false;
    for (let i = 0; i < 3; i++) {
      if (!axes[i] || sup[ROT_FLAGS[i]]) continue;
      const spring = sup[ROT_SPRINGS[i]] ?? 0;
      const vanishing = !!sup.stabilised && !!sup.stabilisedAxes?.[i];
      if (spring > 0 && !vanishing) continue; // the user's own spring: part of the structure
      sup[ROT_FLAGS[i]] = true;
      delete sup[ROT_SPRINGS[i]];
      marks[i] = true;
      any = true;
    }
    if (!any) continue;
    sup.stabilised = sup.stabilised ?? (found ? 'springs' : 'created');
    sup.stabilisedAxes = marks;
    if (found) supports.set(found[0], sup);
    else supports.set(nextId++, sup);
    changed = true;
  }
  return changed ? { ...input, supports } : input;
}

/**
 * Nodal moments that nothing at their node can take.
 *
 * A moment on a node that only truss bars meet — or where every member end
 * releases all three moments — has no member to go into. The linear solve put
 * it into the vanishing spring of `stabiliseOrphanRotations3D`, turned the node
 * through 1e5 rad and dropped the spring's reaction, so the reactions no longer
 * balanced the loads; a pure truss model dropped the moment outright. Here a
 * moment is refused when its node has no frame end resisting any rotation, and
 * the part of the moment about the axes its support does not hold (or spring)
 * is not zero. Returns the first such node, or null.
 */
export function unheldNodalMoment3D(input: SolverInput3D): number | null {
  const frames = [...input.elements.values()].some((e) => e.type === 'frame');
  const { resisted } = frames ? frameRotationAxes(input) : { resisted: new Map<number, V3[]>() };
  const skip = frames ? rotationsActedOnOtherwise(input) : new Set<number>();
  const supOf = new Map([...input.supports.values()].map((sp) => [sp.nodeId, sp]));
  for (const l of input.loads) {
    if (l.type !== 'nodal') continue;
    const { nodeId, mx, my, mz } = l.data;
    const m = [mx ?? 0, my ?? 0, mz ?? 0];
    const scale = Math.hypot(m[0], m[1], m[2]);
    if (!(scale > 1e-12)) continue;
    if (frames && (skip.has(nodeId) || (resisted.get(nodeId)?.length ?? 0) > 0)) continue;
    // A pure truss model has no rotations at all: the solver drops every moment.
    const sp = frames ? supOf.get(nodeId) : undefined;
    const held = [0, 1, 2].map((i) => !!sp && (sp[ROT_FLAGS[i]] || ((sp[ROT_SPRINGS[i]] ?? 0) > 0 && !(sp.stabilised && sp.stabilisedAxes?.[i]))));
    if (m.some((c, i) => Math.abs(c) > 1e-9 * scale && !held[i])) return nodeId;
  }
  return null;
}

// The reaction filter lives on its own: see stabilised-reactions.ts.
export { stripStabilisedReactions } from './stabilised-reactions';
