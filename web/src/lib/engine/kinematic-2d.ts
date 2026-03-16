// Kinematic Analysis for 2D structures
// computeStaticDegree is pure counting math (no solver dependency).
// analyzeKinematics delegates to the WASM engine for the heavy LU rank analysis.

import type { SolverInput } from './types';
import { analyzeKinematics as wasmAnalyzeKinematics } from './wasm-solver';

// ─── Kinematic Analysis ──────────────────────────────────────────

export interface KinematicResult {
  /** Global degree of static indeterminacy (>0 hyperstatic, =0 isostatic, <0 hypostatic) */
  degree: number;
  classification: 'hyperstatic' | 'isostatic' | 'hypostatic';
  /** Number of mechanism modes (dimension of Kff null space) */
  mechanismModes: number;
  /** Nodes participating in mechanism (from rank analysis) */
  mechanismNodes: number[];
  /** Unconstrained DOFs with node and direction */
  unconstrainedDofs: Array<{ nodeId: number; dof: 'ux' | 'uy' | 'rz' }>;
  /** Human-readable diagnosis */
  diagnosis: string;
  /** Whether the structure can be solved */
  isSolvable: boolean;
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
 */
export function computeStaticDegree(input: SolverInput): { degree: number; nodeConditions: Map<number, number> } {
  const hasFrames = Array.from(input.elements.values()).some(e => e.type === 'frame');

  // Count support DOFs
  let r = 0;
  const rotRestrainedNodes = new Set<number>();
  for (const sup of input.supports.values()) {
    const t = sup.type as string;
    if (t === 'fixed') { r += 3; rotRestrainedNodes.add(sup.nodeId); }
    else if (t === 'pinned') r += 2;
    else if (t === 'rollerX' || t === 'rollerY' || t === 'inclinedRoller') r += 1;
    else if (t === 'spring') {
      if (sup.kx && sup.kx > 0) r++;
      if (sup.ky && sup.ky > 0) r++;
      if (sup.kz && sup.kz > 0) { r++; rotRestrainedNodes.add(sup.nodeId); }
    }
  }

  if (!hasFrames) {
    // Pure truss: degree = m + r - 2n
    const m = input.elements.size;
    const n = input.nodes.size;
    return { degree: m + r - 2 * n, nodeConditions: new Map() };
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
  const degree = 3 * mFrame + mTruss + r - 3 * n - c;
  return { degree, nodeConditions };
}

/**
 * Full kinematic analysis: combines degree formula + rank analysis.
 * Uses WASM engine exclusively.
 */
export function analyzeKinematics(input: SolverInput): KinematicResult {
  return wasmAnalyzeKinematics(input);
}
