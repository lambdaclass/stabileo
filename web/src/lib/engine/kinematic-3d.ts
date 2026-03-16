// 3D Kinematic Analysis — Static degree & mechanism detection
// computeStaticDegree3D is pure counting math (no solver dependency).
// analyzeKinematics3D delegates to the WASM engine for the heavy LU rank analysis.

import type { SolverInput3D, SolverSupport3D } from './types-3d';
import { analyzeKinematics3D as wasmAnalyzeKinematics3D, isWasmReady } from './wasm-solver';

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
}

// ─── Static Degree ───────────────────────────────────────────────

/**
 * Count the number of support restraints for a 3D support.
 */
function countSupportRestraints3D(sup: SolverSupport3D): {
  r: number;
  hasRotRestraint: boolean;
} {
  let r = 0;
  let hasRotRestraint = false;

  if (sup.rx) r++;
  if (sup.ry) r++;
  if (sup.rz) r++;

  if (sup.rrx) { r++; hasRotRestraint = true; }
  if (sup.rry) { r++; hasRotRestraint = true; }
  if (sup.rrz) { r++; hasRotRestraint = true; }

  if (sup.kx && sup.kx > 0) r++;
  if (sup.ky && sup.ky > 0) r++;
  if (sup.kz && sup.kz > 0) r++;
  if (sup.krx && sup.krx > 0) { r++; hasRotRestraint = true; }
  if (sup.kry && sup.kry > 0) { r++; hasRotRestraint = true; }
  if (sup.krz && sup.krz > 0) { r++; hasRotRestraint = true; }

  if (sup.isInclined && sup.normalX !== undefined && sup.normalY !== undefined && sup.normalZ !== undefined) {
    const nLen = Math.sqrt(sup.normalX * sup.normalX + sup.normalY * sup.normalY + sup.normalZ * sup.normalZ);
    if (nLen > 1e-12) r++;
  }

  return { r, hasRotRestraint };
}

/**
 * Compute the static degree of indeterminacy for a 3D structure.
 *
 * Pure truss:  GH = m + r - 3n
 * Frame/mixed: GH = 6*m_frame + 3*m_truss + r - 6*n - c
 *
 * In 3D, each hinge releases 3 rotation DOFs (rx, ry, rz).
 */
export function computeStaticDegree3D(
  input: SolverInput3D,
): { degree: number; nodeConditions: Map<number, number> } {
  const hasFrames = Array.from(input.elements.values()).some(e => e.type === 'frame');

  let r = 0;
  const rotRestrainedNodes = new Set<number>();
  for (const sup of input.supports.values()) {
    const result = countSupportRestraints3D(sup);
    r += result.r;
    if (result.hasRotRestraint) rotRestrainedNodes.add(sup.nodeId);
  }

  if (!hasFrames) {
    const m = input.elements.size;
    const n = input.nodes.size;
    return { degree: m + r - 3 * n, nodeConditions: new Map() };
  }

  let mFrame = 0, mTruss = 0;
  for (const elem of input.elements.values()) {
    if (elem.type === 'frame') mFrame++;
    else mTruss++;
  }

  const nodeHinges = new Map<number, number>();
  const nodeFrameElems = new Map<number, number>();
  for (const elem of input.elements.values()) {
    if (elem.type !== 'frame') continue;
    nodeFrameElems.set(elem.nodeI, (nodeFrameElems.get(elem.nodeI) ?? 0) + 1);
    nodeFrameElems.set(elem.nodeJ, (nodeFrameElems.get(elem.nodeJ) ?? 0) + 1);
    if (elem.hingeStart) nodeHinges.set(elem.nodeI, (nodeHinges.get(elem.nodeI) ?? 0) + 1);
    if (elem.hingeEnd) nodeHinges.set(elem.nodeJ, (nodeHinges.get(elem.nodeJ) ?? 0) + 1);
  }

  let c = 0;
  const nodeConditions = new Map<number, number>();
  for (const [nodeId, j] of nodeHinges) {
    const k = nodeFrameElems.get(nodeId) ?? 0;
    let ci: number;
    if (k <= 1) {
      ci = 0;
    } else if (rotRestrainedNodes.has(nodeId)) {
      ci = 3 * j;
    } else {
      ci = 3 * Math.min(j, k - 1);
    }
    if (ci > 0) nodeConditions.set(nodeId, ci);
    c += ci;
  }

  const n = input.nodes.size;
  const degree = 6 * mFrame + 3 * mTruss + r - 6 * n - c;
  return { degree, nodeConditions };
}

// ─── Main Analysis ───────────────────────────────────────────────

/**
 * Full 3D kinematic analysis: combines degree formula + rank analysis.
 * Uses WASM engine exclusively.
 */
export function analyzeKinematics3D(input: SolverInput3D): KinematicResult3D {
  if (!isWasmReady()) {
    const { degree } = computeStaticDegree3D(input);
    const classification = degree > 0 ? 'hyperstatic' : degree === 0 ? 'isostatic' : 'hypostatic';
    return {
      degree,
      classification,
      mechanismModes: 0,
      mechanismNodes: [],
      unconstrainedDofs: [],
      diagnosis: 'WASM not initialized — degree estimate only',
      isSolvable: degree >= 0,
    };
  }
  return wasmAnalyzeKinematics3D(input);
}
