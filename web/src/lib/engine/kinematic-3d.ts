// 3D Kinematic Analysis — Static degree & mechanism detection
// computeStaticDegree3D is pure counting math (no solver dependency).
// analyzeKinematics3D delegates to the WASM engine for the heavy LU rank analysis.

import type { SolverInput3D, SolverSupport3D } from './types-3d';
import { analyzeKinematics3D as wasmAnalyzeKinematics3D, isWasmReady } from './wasm-solver';
import { t } from '../i18n';
import { localizeKinematicDiagnosis, classifyKinematic } from './kinematic-2d';
import { memberAxes3D } from './orphan-rotations-3d';
import { addConstraintConnectivity } from './constraint-connectivity';

// ─── Result type ─────────────────────────────────────────────────

export interface KinematicResult3D {
  /** Global degree of static indeterminacy (>0 hyperstatic, =0 isostatic, <0 hypostatic) */
  degree: number;
  classification: 'hyperstatic' | 'isostatic' | 'hypostatic';
  /** Number of mechanism modes (dimension of Kff null space) */
  mechanismModes: number;
  /** Nodes participating in mechanism (from rank analysis) */
  mechanismNodes: number[];
  /** Unconstrained DOFs with node and direction */
  unconstrainedDofs: Array<{ nodeId: number; dof: string }>;
  /** Human-readable diagnosis */
  diagnosis: string;
  /** Whether the structure can be solved */
  isSolvable: boolean;
  /** The engine's validation message when the model's data was refused before analysis. */
  invalidInput?: string;
  /**
   * Whether the rank check ran: `'unavailable'` (the engine had not loaded,
   * only the count is known) and `'invalid'` (the engine refused the data)
   * both mean `mechanismModes: 0` is not a finding. As in 2D.
   */
  rankAnalysis?: 'available' | 'unavailable' | 'invalid';
}

// ─── Static Degree ───────────────────────────────────────────────

type V3 = [number, number, number];

/** Orthonormal basis of the span of a set of 3-vectors (Gram–Schmidt). */
function spanBasis(vs: V3[]): V3[] {
  const basis: V3[] = [];
  for (const v of vs) {
    let w: V3 = [v[0], v[1], v[2]];
    for (const b of basis) {
      const d = w[0] * b[0] + w[1] * b[1] + w[2] * b[2];
      w = [w[0] - d * b[0], w[1] - d * b[1], w[2] - d * b[2]];
    }
    const n = Math.hypot(w[0], w[1], w[2]);
    if (n > 1e-6) basis.push([w[0] / n, w[1] / n, w[2] / n]);
    if (basis.length === 3) break;
  }
  return basis;
}

const AXES: V3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

/** The restraints of one support, split into what the degree count needs. */
export interface SupportRestraints3D {
  /** Translational restraints (ux, uy, uz, plus an inclined-plane normal). */
  translations: string[];
  /** Rotational restraints the model has (rx, ry, rz), without the stabiliser's vanishing springs. */
  rotations: Array<'rx' | 'ry' | 'rz'>;
}

/**
 * The restraints of a 3D support, per DOF.
 *
 * A rigid restraint and a spring on the same DOF restrain it once. The
 * rotational springs `stabiliseOrphanRotations3D` adds on rotations no member
 * resists are not part of the structure (they carry 1e-10 of the stiffness and
 * the reactions drop them), so they are left out here too — the engine's own
 * count still includes them.
 */
export function supportRestraints3D(sup: SolverSupport3D): SupportRestraints3D {
  const translations: string[] = [];
  if (sup.rx || (sup.kx ?? 0) > 0) translations.push('ux');
  if (sup.ry || (sup.ky ?? 0) > 0) translations.push('uy');
  if (sup.rz || (sup.kz ?? 0) > 0) translations.push('uz');
  if (sup.isInclined && sup.normalX !== undefined && sup.normalY !== undefined && sup.normalZ !== undefined
    && Math.hypot(sup.normalX, sup.normalY, sup.normalZ) > 1e-12) translations.push('u_n');
  const artificial = (i: number) => !!sup.stabilised && (sup.stabilisedAxes ? sup.stabilisedAxes[i] : true);
  const rotations: Array<'rx' | 'ry' | 'rz'> = [];
  const rigid = [sup.rrx, sup.rry, sup.rrz];
  const springs = [sup.krx, sup.kry, sup.krz];
  (['rx', 'ry', 'rz'] as const).forEach((name, i) => {
    if (rigid[i] || ((springs[i] ?? 0) > 0 && !artificial(i))) rotations.push(name);
  });
  return { translations, rotations };
}

/** How one node enters the count. */
export interface NodeCount3D {
  nodeId: number;
  /** Only truss bars reach it (every node, in a pure truss): three equations, no rotations. */
  trussOnly: boolean;
  /** Rotations the frame ends at the node resist rigidly (rank of the unreleased axes, 0–3). */
  rotationRank: number;
  /** Released rotation components at the frame ends meeting here (T, My, Mz each count 1). */
  released: number;
  /** Frame ends with a release here, and which components. */
  releasedEnds: Array<{ elemId: number; end: 'I' | 'J'; components: Array<'T' | 'My' | 'Mz'> }>;
  /** Rotational restraints of the support here. */
  rotRestraints: number;
  /** How many of those hold a rotation the node has. */
  rotRestraintsEffective: number;
  /** Internal conditions at the node. */
  ci: number;
}

export interface StaticDegreeCount3D {
  degree: number;
  nodeConditions: Map<number, number>;
  isPureTruss: boolean;
  mFrame: number;
  mTruss: number;
  /** Nodes with six equilibrium equations. */
  nFrameNodes: number;
  /** Nodes with three: only truss bars reach them. */
  nTrussNodes: number;
  /** Support reactions that count (rotational restraints at truss-only nodes left out). */
  r: number;
  /** Internal conditions. */
  c: number;
  nodes: Map<number, NodeCount3D>;
}

/**
 * Degree of static indeterminacy of a 3D structure.
 *
 *   g = 6·m_frame + m_truss + r − 6·n_frame − 3·n_truss − c
 *
 * counted on degrees of freedom rather than on hinges:
 *
 * - A truss bar carries one force (its axial force), not three.
 * - A node only truss bars reach has three equilibrium equations: forces that
 *   all pass through a point have no moment about it. The solver treats its
 *   rotations as orphans (`orphan-rotations-3d.ts`) — they carry nothing.
 * - A released rotation component at a frame end (My, Mz or T) is one
 *   condition. A Basic 3D hinge releases My and Mz: two, not three. Where
 *   every frame end at a node releases a rotation axis, that axis is the
 *   node's own free rotation, not a condition: a node keeps `rotationRank`
 *   of its three rotations, and `3 − rotationRank` of the releases are
 *   absorbed by it (a free-end hinge counts 0, two collinear members hinged
 *   into one node count 2).
 * - A rotational restraint counts only on a rotation the node has; one on an
 *   orphan rotation is taken back in `c`.
 *
 * Per node:  c_i = released − (3 − rotationRank) + (rotRestraints − rotRestraintsEffective)
 *
 * Nodes that plates, quads, shells, connectors or constraints reach are
 * counted with all three rotations, as before: this count does not model
 * those elements (and neither does the engine's).
 */
export function countStaticDegree3D(input: SolverInput3D): StaticDegreeCount3D {
  let mFrame = 0, mTruss = 0;
  const frameNodes = new Set<number>();
  const trussNodes = new Set<number>();
  const resisted = new Map<number, V3[]>();
  const releasedAt = new Map<number, NodeCount3D['releasedEnds']>();

  for (const e of input.elements.values()) {
    if (e.type !== 'frame') {
      mTruss++;
      trussNodes.add(e.nodeI); trussNodes.add(e.nodeJ);
      continue;
    }
    mFrame++;
    frameNodes.add(e.nodeI); frameNodes.add(e.nodeJ);
    const ax = memberAxes3D(input, e);
    const axes: V3[] | null = ax ? [ax.ex, ax.ey, ax.ez] : null;
    const ends: Array<[number, 'I' | 'J', boolean, boolean, boolean]> = [
      [e.nodeI, 'I', !!e.releaseTStart, !!e.releaseMyStart, !!e.releaseMzStart],
      [e.nodeJ, 'J', !!e.releaseTEnd, !!e.releaseMyEnd, !!e.releaseMzEnd],
    ];
    for (const [node, end, rt, rmy, rmz] of ends) {
      const list = resisted.get(node) ?? [];
      // A zero-length member has no axes; its ends are read as rigid (the solve refuses it anyway).
      const a = axes ?? AXES;
      if (!rt || !axes) list.push(a[0]);
      if (!rmy || !axes) list.push(a[1]);
      if (!rmz || !axes) list.push(a[2]);
      resisted.set(node, list);
      const components: Array<'T' | 'My' | 'Mz'> = [];
      if (axes) {
        if (rt) components.push('T');
        if (rmy) components.push('My');
        if (rmz) components.push('Mz');
      }
      if (components.length) {
        const r = releasedAt.get(node) ?? [];
        r.push({ elemId: e.id, end, components });
        releasedAt.set(node, r);
      }
    }
  }
  const isPureTruss = mFrame === 0;

  // Nodes this count does not model the rotations of: keep all three.
  const opaque = new Set<number>();
  for (const p of input.plates?.values() ?? []) for (const n of p.nodes) opaque.add(n);
  for (const q of input.quads?.values() ?? []) for (const n of q.nodes) opaque.add(n);
  for (const s of input.curvedShells?.values() ?? []) for (const n of s.nodes) opaque.add(n);
  for (const c of input.connectors?.values() ?? []) { opaque.add(c.nodeI); opaque.add(c.nodeJ); }
  addConstraintConnectivity(opaque, input.constraints);

  const supportsAt = new Map<number, SupportRestraints3D>();
  for (const sup of input.supports.values()) {
    const s = supportRestraints3D(sup);
    const prev = supportsAt.get(sup.nodeId);
    if (!prev) { supportsAt.set(sup.nodeId, s); continue; }
    prev.translations = [...new Set([...prev.translations, ...s.translations])];
    prev.rotations = [...new Set([...prev.rotations, ...s.rotations])];
  }

  let r = 0, c = 0, nTrussNodes = 0;
  const nodes = new Map<number, NodeCount3D>();
  const nodeConditions = new Map<number, number>();
  for (const nodeId of input.nodes.keys()) {
    const trussOnly = !opaque.has(nodeId) && (isPureTruss || (trussNodes.has(nodeId) && !frameNodes.has(nodeId)));
    const sup = supportsAt.get(nodeId);
    const rotRestraints = sup?.rotations.length ?? 0;
    if (trussOnly) {
      nTrussNodes++;
      r += sup?.translations.length ?? 0;
      nodes.set(nodeId, {
        nodeId, trussOnly, rotationRank: 0, released: 0, releasedEnds: [],
        rotRestraints, rotRestraintsEffective: 0, ci: 0,
      });
      continue;
    }
    r += (sup?.translations.length ?? 0) + rotRestraints;
    const basis = opaque.has(nodeId) || !frameNodes.has(nodeId) ? AXES : spanBasis(resisted.get(nodeId) ?? []);
    const rotationRank = basis.length;
    // A restraint about a global axis holds the node's rotations through its projection on them.
    const axisIndex = { rx: 0, ry: 1, rz: 2 } as const;
    const projected: V3[] = (sup?.rotations ?? []).map((a) => {
      const i = axisIndex[a];
      return [basis[0]?.[i] ?? 0, basis[1]?.[i] ?? 0, basis[2]?.[i] ?? 0];
    });
    const rotRestraintsEffective = spanBasis(projected).length;
    const releasedEnds = releasedAt.get(nodeId) ?? [];
    const released = releasedEnds.reduce((s, e) => s + e.components.length, 0);
    const ci = released - (3 - rotationRank) + (rotRestraints - rotRestraintsEffective);
    if (ci !== 0) nodeConditions.set(nodeId, ci);
    c += ci;
    nodes.set(nodeId, { nodeId, trussOnly, rotationRank, released, releasedEnds, rotRestraints, rotRestraintsEffective, ci });
  }

  const nFrameNodes = input.nodes.size - nTrussNodes;
  const degree = 6 * mFrame + mTruss + r - 6 * nFrameNodes - 3 * nTrussNodes - c;
  return { degree, nodeConditions, isPureTruss, mFrame, mTruss, nFrameNodes, nTrussNodes, r, c, nodes };
}

/**
 * Compute the static degree of indeterminacy for a 3D structure.
 * See `countStaticDegree3D` for the count and its terms.
 */
export function computeStaticDegree3D(
  input: SolverInput3D,
): { degree: number; nodeConditions: Map<number, number> } {
  const { degree, nodeConditions } = countStaticDegree3D(input);
  return { degree, nodeConditions };
}

// ─── Main Analysis ───────────────────────────────────────────────

/**
 * Full 3D kinematic analysis: combines degree formula + rank analysis.
 * Uses WASM engine exclusively.
 */
export function analyzeKinematics3D(input: SolverInput3D): KinematicResult3D {
  const { degree } = computeStaticDegree3D(input);
  if (!isWasmReady()) {
    // Only the count is known: not a verdict on stability (see analyzeKinematics in 2D).
    return {
      degree,
      classification: classifyKinematic(degree, 0),
      mechanismModes: 0,
      mechanismNodes: [],
      unconstrainedDofs: [],
      diagnosis: t('kin.diagUnavailable3d'),
      isSolvable: false,
      rankAnalysis: 'unavailable',
    };
  }
  const raw: KinematicResult3D = wasmAnalyzeKinematics3D(input);
  /*
   * The degree is the JS count, not the engine's. `compute_static_degree_3d`
   * (engine/src/solver/kinematic.rs:434-445) adds three conditions per hinged
   * end, where a Basic 3D hinge releases two (My, Mz): a two-span beam fixed
   * at both ends with a hinge at midspan came back 3 instead of 4. It also
   * counts a truss bar as three forces and gives six equations to a node only
   * truss bars reach, and counts the stabiliser's vanishing springs as
   * supports. The rank check is the engine's and is kept as it is.
   * TODO(engine): count as `countStaticDegree3D` does, then drop this.
   */
  return {
    ...raw,
    degree,
    classification: classifyKinematic(degree, raw.mechanismModes ?? 0),
    rankAnalysis: raw.invalidInput ? 'invalid' : 'available',
    // The engine writes `diagnosis` in Spanish only; rebuild it in the active language.
    diagnosis: localizeKinematicDiagnosis({
      degree,
      mechanismModes: raw.mechanismModes,
      mechanismNodes: raw.mechanismNodes ?? [],
      unconstrainedDofs: raw.unconstrainedDofs ?? [],
      invalidInput: raw.invalidInput,
      rawDiagnosis: raw.diagnosis,
    }),
  };
}
