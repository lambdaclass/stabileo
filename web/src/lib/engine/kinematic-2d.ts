// Kinematic Analysis for 2D structures
// computeStaticDegree is pure counting math (no solver dependency).
// analyzeKinematics delegates to the WASM engine for the heavy LU rank analysis.

import type { SolverInput } from './types';
import { analyzeKinematics as wasmAnalyzeKinematics, isWasmReady } from './wasm-solver';
import { t, tp } from '../i18n';

// ─── Kinematic Analysis ──────────────────────────────────────────

/**
 * The application's 2D degree-of-freedom vocabulary.
 *
 * The app models 2D structures in the X–Z plane: `ux` horizontal, `uz`
 * vertical, `ry` the bending rotation. Every table, diagram and result field
 * uses these names (`Reaction.rx/rz/my`, `Displacement.ux/uz/ry`).
 */
export type Dof2D = 'ux' | 'uz' | 'ry';

export interface KinematicResult {
  /** Global degree of static indeterminacy (>0 hyperstatic, =0 isostatic, <0 hypostatic) */
  degree: number;
  classification: 'hyperstatic' | 'isostatic' | 'hypostatic';
  /** Number of mechanism modes (dimension of Kff null space) */
  mechanismModes: number;
  /** Nodes participating in mechanism (from rank analysis) */
  mechanismNodes: number[];
  /** Unconstrained DOFs with node and direction, in APPLICATION vocabulary. */
  unconstrainedDofs: Array<{ nodeId: number; dof: Dof2D }>;
  /** Human-readable diagnosis, with axis names normalized to match the UI. */
  diagnosis: string;
  /** Whether the structure can be solved */
  isSolvable: boolean;
  /**
   * Whether the stiffness-matrix rank analysis actually ran.
   *
   * `'unavailable'` means only the counting degree is known — a model can have
   * `degree >= 0` and still be a mechanism, so an `'unavailable'` result must
   * never be treated as a verified stable model.
   *
   * `'invalid'` means the engine refused the model's data before analysing
   * it: `mechanismModes: 0` again means "not checked", and `invalidInput`
   * carries the reason. Unlike `'unavailable'`, waiting will not change it.
   */
  rankAnalysis: 'available' | 'unavailable' | 'invalid';
  /**
   * The engine's validation message when `rankAnalysis` is `'invalid'` — the
   * same text a solve would have returned (e.g. "Material 1: Poisson ratio
   * must be in (-1, 0.5)"). Absent otherwise.
   */
  invalidInput?: string;
  /**
   * Raw DOF codes the engine reported that this boundary does not recognise.
   * Normally empty; non-empty means the engine's vocabulary drifted again and
   * something is being lost, so it is surfaced rather than dropped silently.
   */
  unmappedDofs: string[];
}

/**
 * Every number the degree of static indeterminacy is made of, so the report
 * can show the same sum the degree comes from.
 *
 * g = 3·m_frame + m_truss + r − 3·n_frame − 2·n_truss − c
 *
 * A node takes three equilibrium equations when a frame member reaches it,
 * and two when only truss bars do: forces that all pass through a point have
 * no moment about it, so the third equation reads 0 = 0 there. That is also
 * how the solver treats such a node — its rotation is an orphan, restrained by
 * a vanishing spring, and it carries nothing. In a pure truss every node takes
 * two. A node no member reaches keeps three in a model with frames, as before
 * (it is a mechanism either way, and the rank check says so).
 *
 * A rotational restraint (a fixed support's θy, a rotational spring) only
 * counts in `r` where the node has a rotation equation to hold. At a node only
 * truss bars reach it restrains nothing, so a fixed support there counts two.
 *
 * `c` (internal conditions) is computed per node from the frame ends meeting there:
 *   - Node with a rotational restraint (fixed / rotational spring): c_i = j —
 *     each hinged end is an independent condition, however many frame ends
 *     meet (one included: a member hinged at a fixed support is pinned there).
 *   - Otherwise: c_i = min(j, k−1) — when every end is hinged, one release is
 *     absorbed by the node's own free rotation (k = 1 is a free-end hinge, c = 0).
 *
 * This correctly handles discretized arches: an 8-segment arch with crown hinge
 * gives degree=0 (not -1 as the naive formula would produce).
 *
 * `slidingConditions` is the number of internal sliding joints (translational
 * releases). Each one releases exactly ONE scalar relative-translation
 * continuity equation, so it adds 1 to the condition count `c` regardless of
 * the chosen direction (global X/Z or member-local x/z): the direction sets
 * WHICH relative translation is freed, not HOW MANY constraints are released.
 */
export interface StaticDegreeCount2D {
  degree: number;
  /** Hinge conditions per node (sliding joints are not per node and are not in here). */
  nodeConditions: Map<number, number>;
  isPureTruss: boolean;
  mFrame: number;
  mTruss: number;
  /** Nodes that take three equations (a frame member reaches them, or none does). */
  nFrameNodes: number;
  /** Nodes that take two: only truss bars reach them (every node, in a pure truss). */
  nTrussNodes: number;
  /** The nodes counted in `nTrussNodes`. */
  trussOnlyNodes: Set<number>;
  /** Support reactions that count. */
  r: number;
  /** Nodes whose support restrains a rotation the node does not have, left out of `r`. */
  rotationNotCounted: Set<number>;
  /** Internal conditions: hinges plus sliding joints. */
  c: number;
}

export function countStaticDegree2D(input: SolverInput, slidingConditions = 0): StaticDegreeCount2D {
  let mFrame = 0, mTruss = 0;
  const frameNodes = new Set<number>();
  const trussNodes = new Set<number>();
  for (const elem of input.elements.values()) {
    const set = elem.type === 'frame' ? frameNodes : trussNodes;
    if (elem.type === 'frame') mFrame++; else mTruss++;
    set.add(elem.nodeI);
    set.add(elem.nodeJ);
  }
  const isPureTruss = mFrame === 0;

  /** Nodes that have no rotation equation: every node of a pure truss, and those only truss bars reach. */
  const trussOnlyNodes = new Set<number>();
  for (const id of input.nodes.keys()) {
    if (isPureTruss || (trussNodes.has(id) && !frameNodes.has(id))) trussOnlyNodes.add(id);
  }
  const hasRotation = (nodeId: number) => !trussOnlyNodes.has(nodeId);

  // Count support DOFs
  let r = 0;
  const rotRestrainedNodes = new Set<number>();
  const rotationNotCounted = new Set<number>();
  for (const sup of input.supports.values()) {
    const t = sup.type as string;
    let rotational = false;
    if (t === 'fixed') { r += 2; rotational = true; }
    else if (t === 'pinned') r += 2;
    else if (t === 'rollerX' || t === 'rollerZ' || t === 'inclinedRoller') r += 1;
    else if (t === 'spring') {
      if (sup.kx && sup.kx > 0) r++;
      if (sup.ky && sup.ky > 0) r++;
      if (sup.kz && sup.kz > 0) rotational = true;
    }
    if (!rotational) continue;
    if (hasRotation(sup.nodeId)) { r++; rotRestrainedNodes.add(sup.nodeId); }
    else rotationNotCounted.add(sup.nodeId);
  }

  // Count hinges and elements per node (frame elements only for hinge counting)
  const nodeHinges = new Map<number, number>();
  const nodeFrameElems = new Map<number, number>();
  for (const elem of input.elements.values()) {
    if (elem.type !== 'frame') continue;
    nodeFrameElems.set(elem.nodeI, (nodeFrameElems.get(elem.nodeI) ?? 0) + 1);
    nodeFrameElems.set(elem.nodeJ, (nodeFrameElems.get(elem.nodeJ) ?? 0) + 1);
    if (elem.hingeStart) nodeHinges.set(elem.nodeI, (nodeHinges.get(elem.nodeI) ?? 0) + 1);
    if (elem.hingeEnd) nodeHinges.set(elem.nodeJ, (nodeHinges.get(elem.nodeJ) ?? 0) + 1);
  }

  // Compute c (internal conditions) per node. The rotational restraint is
  // looked at first: `k ≤ 1 → c = 0` read a member hinged at a fixed support
  // as a free-end hinge, i.e. as clamped.
  let c = 0;
  const nodeConditions = new Map<number, number>();
  for (const [nodeId, j] of nodeHinges) {
    const k = nodeFrameElems.get(nodeId) ?? 0;
    const ci = rotRestrainedNodes.has(nodeId) ? j : Math.max(0, Math.min(j, k - 1));
    if (ci > 0) nodeConditions.set(nodeId, ci);
    c += ci;
  }
  c += slidingConditions;

  const nTrussNodes = trussOnlyNodes.size;
  const nFrameNodes = input.nodes.size - nTrussNodes;
  const degree = 3 * mFrame + mTruss + r - 3 * nFrameNodes - 2 * nTrussNodes - c;
  return {
    degree, nodeConditions, isPureTruss, mFrame, mTruss,
    nFrameNodes, nTrussNodes, trussOnlyNodes, r, rotationNotCounted, c,
  };
}

export function computeStaticDegree(input: SolverInput, slidingConditions = 0): { degree: number; nodeConditions: Map<number, number> } {
  const { degree, nodeConditions } = countStaticDegree2D(input, slidingConditions);
  return { degree, nodeConditions };
}

/** Classification from a degree and the rank check, by the engine's rule. */
export function classifyKinematic(degree: number, mechanismModes: number): KinematicResult['classification'] {
  if (mechanismModes > 0) return 'hypostatic';
  return degree > 0 ? 'hyperstatic' : degree === 0 ? 'isostatic' : 'hypostatic';
}

// ─── Engine → application vocabulary normalization ────────────────
//
// The 2D engine reports its DOFs in a Y-up vocabulary inherited from the
// pre-WASM solver: vertical translation as `uy`, bending rotation as `rz`.
// Everything the student sees — reaction tables, diagrams, displacement
// fields — uses Z-up: `uz` and `ry`. Left unmapped, a mechanism diagnosis
// tells a student "the Y displacement is unrestrained" and sends them looking
// for a Y column that does not exist.
//
// The mapping is applied here, at the boundary, so the kinematic mathematics
// is untouched. Codes already in application vocabulary map to themselves,
// which means this becomes an identity transform if the engine is ever
// changed to emit Z-up directly.

const DOF_CODE_MAP: Record<string, Dof2D> = {
  ux: 'ux',
  uy: 'uz',   // engine vertical → application vertical
  uz: 'uz',
  rz: 'ry',   // engine bending rotation → application bending rotation
  ry: 'ry',
};

/**
 * Spanish DOF phrases as the engine builds them (see `dof_label` in
 * `engine/src/solver/kinematic.rs`), mapped to the application's axis names.
 *
 * Rewritten in a single pass so the two substitutions cannot chain into each
 * other (a naive sequential replace of "en Y"→"en Z" then "en Z"→"en Y" would
 * round-trip straight back to the wrong text).
 */
const DIAGNOSIS_PHRASE_MAP: Record<string, string> = {
  'desplazamiento en Y': 'desplazamiento en Z',
  'rotación en Z': 'rotación en Y',
};
const DIAGNOSIS_PHRASE_RE = new RegExp(
  Object.keys(DIAGNOSIS_PHRASE_MAP).join('|'),
  'g',
);

/** Rewrite engine axis names inside a localized diagnosis sentence. */
export function normalizeDiagnosisAxes(diagnosis: string): string {
  if (!diagnosis) return diagnosis;
  return diagnosis.replace(DIAGNOSIS_PHRASE_RE, (m) => DIAGNOSIS_PHRASE_MAP[m] ?? m);
}

/** Dictionary key for each DOF code the diagnosis can name (2D app vocabulary and 3D). */
const DOF_LABEL_KEY: Record<string, string> = {
  ux: 'kin.dof3dUx', uy: 'kin.dof3dUy', uz: 'kin.dof3dUz',
  rx: 'kin.dof3dRx', ry: 'kin.dof3dRy', rz: 'kin.dof3dRz',
};

/**
 * The engine's diagnosis sentence, rebuilt in the active language.
 *
 * The engine writes `diagnosis` in Spanish only (`build_diagnosis_2d` in
 * `engine/src/solver/kinematic.rs`), and it reaches the user as the toast that
 * stops a solve. Every value that sentence is made of is also returned as a
 * structured field, so the sentence is composed here from those fields with the
 * same rules as the engine, instead of showing the Spanish text in every locale.
 * `dofs` must already be in the application's vocabulary.
 */
export function localizeKinematicDiagnosis(r: {
  degree: number;
  mechanismModes: number;
  mechanismNodes: number[];
  unconstrainedDofs: Array<{ nodeId: number; dof: string }>;
  invalidInput?: string;
  rawDiagnosis: string;
}): string {
  if (r.invalidInput) return t('kin.diagInvalidData');
  if (r.mechanismModes === 0) {
    // The engine's "every DOF is restrained" case carries no structured flag of its own.
    if (/^Todos los GDL/.test(r.rawDiagnosis ?? '')) return t('kin.allDofConstrained');
    if (r.degree > 0) return tp('kin.diagHyperstatic', { degree: r.degree });
    if (r.degree === 0) return t('kin.diagIsostatic');
    return tp('kin.diagStableButNeg', { degree: r.degree });
  }
  const nodes = r.mechanismNodes;
  const nodeList = nodes.slice(0, 8).join(', ');
  const dofList = r.unconstrainedDofs
    .slice(0, 8)
    .map((d) => `${t('kin.nodeLC')} ${d.nodeId} (${DOF_LABEL_KEY[d.dof] ? t(DOF_LABEL_KEY[d.dof]) : d.dof})`)
    .join('; ');
  const ms = r.mechanismModes > 1 ? 's' : '';
  if (nodes.length <= 3) {
    return tp('kin.diagMechSmall', {
      s: nodes.length > 1 ? 's' : '', nodes: nodeList, modes: r.mechanismModes, ms, dofs: dofList,
    });
  }
  return tp('kin.diagMechLarge', {
    degree: r.degree, modes: r.mechanismModes, ms, nNodes: nodes.length, nodes: nodeList,
    dots1: nodes.length > 8 ? '...' : '', dofs: dofList, dots2: r.unconstrainedDofs.length > 8 ? '...' : '',
  });
}

/**
 * Map a raw engine kinematic result into the application's vocabulary.
 * Exported for testing; callers should use `analyzeKinematics`.
 */
export function normalizeKinematicResult(raw: {
  degree: number;
  classification: KinematicResult['classification'];
  mechanismModes: number;
  mechanismNodes: number[];
  unconstrainedDofs: Array<{ nodeId: number; dof: string }>;
  diagnosis: string;
  isSolvable: boolean;
  invalidInput?: string;
}): KinematicResult {
  const unconstrainedDofs: Array<{ nodeId: number; dof: Dof2D }> = [];
  const unmappedDofs: string[] = [];

  for (const entry of raw.unconstrainedDofs ?? []) {
    const mapped = DOF_CODE_MAP[entry.dof];
    if (mapped) unconstrainedDofs.push({ nodeId: entry.nodeId, dof: mapped });
    else unmappedDofs.push(entry.dof);
  }

  return {
    degree: raw.degree,
    classification: raw.classification,
    mechanismModes: raw.mechanismModes,
    mechanismNodes: raw.mechanismNodes ?? [],
    unconstrainedDofs,
    diagnosis: localizeKinematicDiagnosis({
      degree: raw.degree,
      mechanismModes: raw.mechanismModes,
      mechanismNodes: raw.mechanismNodes ?? [],
      unconstrainedDofs,
      invalidInput: raw.invalidInput,
      rawDiagnosis: normalizeDiagnosisAxes(raw.diagnosis),
    }),
    isSolvable: raw.isSolvable,
    // An invalid model was never analysed, so its `mechanismModes: 0` is not
    // a finding. Reported as 'available', the kinematic report read it as
    // "no mechanisms — the structure is stable".
    rankAnalysis: raw.invalidInput ? 'invalid' : 'available',
    ...(raw.invalidInput ? { invalidInput: raw.invalidInput } : {}),
    unmappedDofs,
  };
}

/**
 * Full kinematic analysis: combines degree formula + rank analysis.
 * Uses the WASM engine for the rank analysis.
 */
export function analyzeKinematics(input: SolverInput): KinematicResult {
  if (!isWasmReady()) {
    // The counting degree is still meaningful and independently validated, so
    // report it — but NOT as a verdict on stability. `degree >= 0` does not
    // imply solvable: all-roller supports, collinear restraints and hidden
    // mechanisms all reach `degree >= 0` while `Kff` is singular. The previous
    // `isSolvable: degree >= 0` let exactly those models through the solve
    // gate as if they had been verified.
    const { degree } = computeStaticDegree(input);
    const classification = degree > 0 ? 'hyperstatic' : degree === 0 ? 'isostatic' : 'hypostatic';
    return {
      degree,
      classification,
      mechanismModes: 0,
      mechanismNodes: [],
      unconstrainedDofs: [],
      diagnosis: t('kin.diagUnavailable2d'),
      isSolvable: false,
      rankAnalysis: 'unavailable',
      unmappedDofs: [],
    };
  }
  const raw = wasmAnalyzeKinematics(input);
  /*
   * The degree is the JS count, not the engine's. The engine counts it with
   * `compute_static_degree_2d` (engine/src/solver/kinematic.rs:64-127), which
   * gives three equations to a node only truss bars reach and reads a member
   * hinged at a fixed support as clamped: a king-post beam came back g = 0 and
   * a queen-post beam, which solves, g = −1 and "hypostatic". The rank check
   * (mechanism modes, free DOFs) is the engine's and is kept as it is; the
   * classification is rebuilt from the corrected degree by the engine's own
   * rule. TODO(engine): count as `countStaticDegree2D` does, then drop this.
   */
  const { degree } = computeStaticDegree(input);
  return normalizeKinematicResult({
    ...raw,
    degree,
    classification: classifyKinematic(degree, raw.mechanismModes ?? 0),
  });
}
