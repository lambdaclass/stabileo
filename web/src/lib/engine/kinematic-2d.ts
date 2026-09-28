// Kinematic Analysis for 2D structures
// computeStaticDegree is pure counting math (no solver dependency).
// analyzeKinematics delegates to the WASM engine for the heavy LU rank analysis.

import type { SolverInput } from './types';
import { analyzeKinematics as wasmAnalyzeKinematics, isWasmReady } from './wasm-solver';

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
 * Compute degree of static indeterminacy with corrected hinge counting.
 *
 * Frame: grado = 3·m_frame + m_truss + r − 3·n − c
 * Pure truss: grado = m + r − 2·n
 *
 * The key correction: c (internal conditions) is computed per-node as:
 *   - k ≤ 1 element at node: c_i = 0 (free-end hinge, no equilibrium condition)
 *   - Node with rotational support (fixed/rot spring): c_i = j (each hinge independent)
 *   - Otherwise: c_i = min(j, k-1) (one release absorbed by free rotation DOF)
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
export function computeStaticDegree(input: SolverInput, slidingConditions = 0): { degree: number; nodeConditions: Map<number, number> } {
  const hasFrames = Array.from(input.elements.values()).some(e => e.type === 'frame');

  // Count support DOFs
  let r = 0;
  const rotRestrainedNodes = new Set<number>();
  for (const sup of input.supports.values()) {
    const t = sup.type as string;
    if (t === 'fixed') { r += 3; rotRestrainedNodes.add(sup.nodeId); }
    else if (t === 'pinned') r += 2;
    else if (t === 'rollerX' || t === 'rollerZ' || t === 'inclinedRoller') r += 1;
    else if (t === 'spring') {
      if (sup.kx && sup.kx > 0) r++;
      if (sup.ky && sup.ky > 0) r++;
      if (sup.kz && sup.kz > 0) { r++; rotRestrainedNodes.add(sup.nodeId); }
    }
  }

  if (!hasFrames) {
    // Pure truss: degree = m + r - 2n (sliders are a frame feature, normally 0 here)
    const m = input.elements.size;
    const n = input.nodes.size;
    return { degree: m + r - 2 * n - slidingConditions, nodeConditions: new Map() };
  }

  // Frame (or mixed frame/truss)
  let mFrame = 0, mTruss = 0;
  for (const elem of input.elements.values()) {
    if (elem.type === 'frame') mFrame++;
    else mTruss++;
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

  // Compute c (internal conditions) per node
  let c = 0;
  const nodeConditions = new Map<number, number>();
  for (const [nodeId, j] of nodeHinges) {
    const k = nodeFrameElems.get(nodeId) ?? 0;
    let ci: number;
    if (k <= 1) {
      ci = 0;
    } else if (rotRestrainedNodes.has(nodeId)) {
      ci = j;
    } else {
      ci = Math.min(j, k - 1);
    }
    if (ci > 0) nodeConditions.set(nodeId, ci);
    c += ci;
  }

  const n = input.nodes.size;
  const degree = 3 * mFrame + mTruss + r - 3 * n - c - slidingConditions;
  return { degree, nodeConditions };
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
    diagnosis: normalizeDiagnosisAxes(raw.diagnosis),
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
      diagnosis:
        'Stability check unavailable: the WASM engine is not initialized yet, so only the ' +
        'counting degree could be computed. Retry once the solver has loaded.',
      isSolvable: false,
      rankAnalysis: 'unavailable',
      unmappedDofs: [],
    };
  }
  return normalizeKinematicResult(wasmAnalyzeKinematics(input));
}
