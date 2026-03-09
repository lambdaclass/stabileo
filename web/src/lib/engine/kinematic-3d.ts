// 3D Kinematic Analysis — Static degree & mechanism detection
// Adapted from 2D kinematic analysis (solver-js.ts) for 6-DOF/node structures.
//
// Key differences from 2D:
//   - 6 DOF/node for frames (ux, uy, uz, rx, ry, rz), 3 DOF/node for trusses
//   - Hinge releases 3 rotational DOFs (rx, ry, rz) per connection in 3D
//   - Static degree: GH = 6*m_frame + 3*m_truss + r - 6*n - c (frames)
//                    GH = m + r - 3*n (pure truss)

import type { SolverInput3D, SolverSupport3D } from './types-3d';
import {
  buildDofNumbering3D, assemble3D, dofKey,
  type DofNumbering3D,
} from './solver-3d';
import { t } from '../i18n';

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
  /** Human-readable diagnosis in Spanish */
  diagnosis: string;
  /** Whether the structure can be solved */
  isSolvable: boolean;
}

// ─── Static Degree ───────────────────────────────────────────────

/**
 * Count the number of support restraints for a 3D support.
 * Springs count as 1 restraint each (stiffness added to K, DOF stays "free"
 * in numbering but contributes a reaction).
 * For the static-degree formula, springs count as external restraints (r).
 */
function countSupportRestraints3D(sup: SolverSupport3D): {
  r: number;
  hasRotRestraint: boolean;
} {
  let r = 0;
  let hasRotRestraint = false;

  // Translation restraints
  if (sup.rx) r++;
  if (sup.ry) r++;
  if (sup.rz) r++;

  // Rotation restraints
  if (sup.rrx) { r++; hasRotRestraint = true; }
  if (sup.rry) { r++; hasRotRestraint = true; }
  if (sup.rrz) { r++; hasRotRestraint = true; }

  // Springs: each non-zero spring adds a restraint for GH formula
  if (sup.kx && sup.kx > 0) r++;
  if (sup.ky && sup.ky > 0) r++;
  if (sup.kz && sup.kz > 0) r++;
  if (sup.krx && sup.krx > 0) { r++; hasRotRestraint = true; }
  if (sup.kry && sup.kry > 0) { r++; hasRotRestraint = true; }
  if (sup.krz && sup.krz > 0) { r++; hasRotRestraint = true; }

  // Inclined support: penalty method provides 1 translational restraint (in normal direction)
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
 * Where c = internal conditions from hinges.
 * In 3D, each hinge releases 3 rotation DOFs (rx, ry, rz).
 * For a node with k frame elements and j hinged connections:
 *   - k <= 1: c_i = 0 (free end, no independent condition)
 *   - Node has rotational restraint: c_i = 3*j (each hinge releases 3 DOFs)
 *   - Otherwise: c_i = 3 * min(j, k-1)
 */
export function computeStaticDegree3D(
  input: SolverInput3D,
): { degree: number; nodeConditions: Map<number, number> } {
  const hasFrames = Array.from(input.elements.values()).some(e => e.type === 'frame');

  // Count support restraints
  let r = 0;
  const rotRestrainedNodes = new Set<number>();
  for (const sup of input.supports.values()) {
    const result = countSupportRestraints3D(sup);
    r += result.r;
    if (result.hasRotRestraint) rotRestrainedNodes.add(sup.nodeId);
  }

  if (!hasFrames) {
    // Pure truss: degree = m + r - 3n
    const m = input.elements.size;
    const n = input.nodes.size;
    return { degree: m + r - 3 * n, nodeConditions: new Map() };
  }

  // Frame (or mixed frame/truss)
  let mFrame = 0, mTruss = 0;
  for (const elem of input.elements.values()) {
    if (elem.type === 'frame') mFrame++;
    else mTruss++;
  }

  // Count hinges and frame elements per node
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
  // In 3D, each independent hinge releases 3 rotation DOFs
  let c = 0;
  const nodeConditions = new Map<number, number>();
  for (const [nodeId, j] of nodeHinges) {
    const k = nodeFrameElems.get(nodeId) ?? 0;
    let ci: number;
    if (k <= 1) {
      // Free end or single-element node: hinge modifies stiffness
      // but does not add independent equilibrium conditions
      ci = 0;
    } else if (rotRestrainedNodes.has(nodeId)) {
      // Node with rotational restraint: each hinge is independent
      // Each hinge releases 3 rotation DOFs
      ci = 3 * j;
    } else {
      // Node without rotational restraint:
      // All-hinged node has one free rotation set (3 DOFs) → 3 fewer conditions
      ci = 3 * Math.min(j, k - 1);
    }
    if (ci > 0) nodeConditions.set(nodeId, ci);
    c += ci;
  }

  const n = input.nodes.size;
  const degree = 6 * mFrame + 3 * mTruss + r - 6 * n - c;
  return { degree, nodeConditions };
}

// ─── LU Rank Analysis ────────────────────────────────────────────

/**
 * LU factorization with partial pivoting for rank analysis.
 * Does NOT throw on zero pivots — instead records them.
 */
function luRankAnalysis3D(Kff: Float64Array, n: number): {
  rank: number;
  zeroPivotDofs: number[];
} {
  const a = new Float64Array(Kff);
  const perm = Array.from({ length: n }, (_, i) => i);

  // Relative tolerance based on maximum diagonal
  let maxDiag = 0;
  for (let i = 0; i < n; i++) maxDiag = Math.max(maxDiag, Math.abs(a[i * n + i]));
  const tol = Math.max(1e-10, maxDiag * 1e-10);

  const zeroPivotDofs: number[] = [];
  let rank = 0;

  for (let k = 0; k < n; k++) {
    // Find pivot in column k, rows k..n-1
    let maxVal = 0, maxRow = k;
    for (let i = k; i < n; i++) {
      const val = Math.abs(a[i * n + k]);
      if (val > maxVal) { maxVal = val; maxRow = i; }
    }

    if (maxVal < tol) {
      // Zero pivot → record the original DOF index
      zeroPivotDofs.push(perm[k]);
      // Skip this column (rank deficient)
      continue;
    }

    rank++;

    // Swap rows k and maxRow
    if (maxRow !== k) {
      for (let j = 0; j < n; j++) {
        const tmp = a[k * n + j]; a[k * n + j] = a[maxRow * n + j]; a[maxRow * n + j] = tmp;
      }
      const tmp = perm[k]; perm[k] = perm[maxRow]; perm[maxRow] = tmp;
    }

    // Gaussian elimination
    const pivot = a[k * n + k];
    for (let i = k + 1; i < n; i++) {
      const factor = a[i * n + k] / pivot;
      for (let j = k + 1; j < n; j++) {
        a[i * n + j] -= factor * a[k * n + j];
      }
      a[i * n + k] = 0;
    }
  }

  return { rank, zeroPivotDofs };
}

// ─── Map Pivots to Nodes ─────────────────────────────────────────

const DOF_LABELS_6 = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'] as const;
const DOF_LABELS_3 = ['ux', 'uy', 'uz'] as const;

/**
 * Map zero-pivot DOF indices back to node IDs and DOF labels.
 */
function mapPivotsToNodes3D(
  zeroPivotDofs: number[],
  dofNum: DofNumbering3D,
): { mechanismNodes: number[]; unconstrainedDofs: Array<{ nodeId: number; dof: string }> } {
  const dofLabels = dofNum.dofsPerNode === 6 ? DOF_LABELS_6 : DOF_LABELS_3;

  // Build reverse map: globalDofIndex -> { nodeId, localDof }
  const reverseMap = new Map<number, { nodeId: number; localDof: number }>();
  for (const [key, idx] of dofNum.map) {
    if (idx >= dofNum.nFree) continue; // only free DOFs
    const parts = key.split(':');
    reverseMap.set(idx, { nodeId: parseInt(parts[0]), localDof: parseInt(parts[1]) });
  }

  const nodeSet = new Set<number>();
  const unconstrainedDofs: Array<{ nodeId: number; dof: string }> = [];

  for (const dofIdx of zeroPivotDofs) {
    const info = reverseMap.get(dofIdx);
    if (info) {
      nodeSet.add(info.nodeId);
      unconstrainedDofs.push({
        nodeId: info.nodeId,
        dof: dofLabels[info.localDof] ?? 'ux',
      });
    }
  }

  return { mechanismNodes: [...nodeSet].sort((a, b) => a - b), unconstrainedDofs };
}

// ─── Main Analysis ───────────────────────────────────────────────

/**
 * Full 3D kinematic analysis: combines degree formula + rank analysis.
 * Returns classification, mechanism nodes, and diagnosis.
 */
export function analyzeKinematics3D(input: SolverInput3D): KinematicResult3D {
  // Step 1: Compute corrected static degree
  const { degree } = computeStaticDegree3D(input);

  // Step 2: Build DOF numbering
  const dofNum = buildDofNumbering3D(input);
  const nf = dofNum.nFree;

  if (nf === 0) {
    return {
      degree,
      classification: degree > 0 ? 'hyperstatic' : degree === 0 ? 'isostatic' : 'hypostatic',
      mechanismModes: 0,
      mechanismNodes: [],
      unconstrainedDofs: [],
      diagnosis: t('kin.allDofConstrained'),
      isSolvable: true,
    };
  }

  // Step 3: Assemble K WITHOUT artificial stiffness (skipArtificialStiffness = true)
  const { K } = assemble3D(input, dofNum, true);
  const nt = dofNum.nTotal;

  // Step 4: Extract Kff (free-free submatrix)
  const Kff = new Float64Array(nf * nf);
  for (let i = 0; i < nf; i++) {
    for (let j = 0; j < nf; j++) {
      Kff[i * nf + j] = K[i * nt + j];
    }
  }

  // Step 5: LU rank analysis
  const { zeroPivotDofs } = luRankAnalysis3D(Kff, nf);

  // Step 5b: Filter out expected zero-stiffness DOFs at valid pin joints.
  // In 3D, these are rotation DOFs that correctly have zero stiffness:
  // 1. All-hinged frame nodes (all connected frame elements are hinged)
  // 2. Truss-only nodes in mixed systems (trusses have no rotational stiffness)
  // These are handled by artificial stiffness during solving and are NOT true mechanisms.
  const expectedZeroDofs = new Set<number>();
  if (dofNum.dofsPerNode >= 6) {
    const nodeHingeCount = new Map<number, number>();
    const nodeFrameCount = new Map<number, number>();
    const nodeTrussCount = new Map<number, number>();
    for (const elem of input.elements.values()) {
      if (elem.type === 'frame') {
        nodeFrameCount.set(elem.nodeI, (nodeFrameCount.get(elem.nodeI) ?? 0) + 1);
        nodeFrameCount.set(elem.nodeJ, (nodeFrameCount.get(elem.nodeJ) ?? 0) + 1);
        if (elem.hingeStart) nodeHingeCount.set(elem.nodeI, (nodeHingeCount.get(elem.nodeI) ?? 0) + 1);
        if (elem.hingeEnd) nodeHingeCount.set(elem.nodeJ, (nodeHingeCount.get(elem.nodeJ) ?? 0) + 1);
      } else {
        nodeTrussCount.set(elem.nodeI, (nodeTrussCount.get(elem.nodeI) ?? 0) + 1);
        nodeTrussCount.set(elem.nodeJ, (nodeTrussCount.get(elem.nodeJ) ?? 0) + 1);
      }
    }

    const rotRestrainedNodes = new Set<number>();
    for (const sup of input.supports.values()) {
      if (sup.rrx) rotRestrainedNodes.add(sup.nodeId);
      if (sup.rry) rotRestrainedNodes.add(sup.nodeId);
      if (sup.rrz) rotRestrainedNodes.add(sup.nodeId);
      if (sup.krx && sup.krx > 0) rotRestrainedNodes.add(sup.nodeId);
      if (sup.kry && sup.kry > 0) rotRestrainedNodes.add(sup.nodeId);
      if (sup.krz && sup.krz > 0) rotRestrainedNodes.add(sup.nodeId);
    }

    // All-hinged frame nodes
    for (const [nodeId, hinges] of nodeHingeCount) {
      const frames = nodeFrameCount.get(nodeId) ?? 0;
      if (hinges >= frames && frames >= 1 && !rotRestrainedNodes.has(nodeId)) {
        // All 3 rotation DOFs at this node are expected to be zero
        for (let rd = 3; rd <= 5; rd++) {
          const key = dofKey(nodeId, rd);
          const idx = dofNum.map.get(key);
          if (idx !== undefined && idx < nf) {
            expectedZeroDofs.add(idx);
          }
        }
      }
    }

    // Truss-only nodes in mixed systems: nodes connected ONLY to trusses
    // (no frame connections) have no rotational stiffness
    for (const nodeId of input.nodes.keys()) {
      const frames = nodeFrameCount.get(nodeId) ?? 0;
      const trusses = nodeTrussCount.get(nodeId) ?? 0;
      if (frames === 0 && trusses > 0 && !rotRestrainedNodes.has(nodeId)) {
        for (let rd = 3; rd <= 5; rd++) {
          const key = dofKey(nodeId, rd);
          const idx = dofNum.map.get(key);
          if (idx !== undefined && idx < nf) {
            expectedZeroDofs.add(idx);
          }
        }
      }
    }
  }

  // True mechanism DOFs = zero pivots that are NOT expected pin-joint rotations
  const trueMechanismDofs = zeroPivotDofs.filter(d => !expectedZeroDofs.has(d));
  const mechanismModes = trueMechanismDofs.length;

  // Step 6: Map zero pivots to nodes (only true mechanism DOFs)
  const { mechanismNodes, unconstrainedDofs } = mapPivotsToNodes3D(trueMechanismDofs, dofNum);

  // Step 7: Build classification and diagnosis
  const isSolvable = mechanismModes === 0;

  let classification: 'hyperstatic' | 'isostatic' | 'hypostatic';
  if (degree > 0 && isSolvable) classification = 'hyperstatic';
  else if (degree === 0 && isSolvable) classification = 'isostatic';
  else classification = 'hypostatic';

  const diagnosis = buildDiagnosis3D(degree, mechanismModes, mechanismNodes, unconstrainedDofs);

  return {
    degree,
    classification,
    mechanismModes,
    mechanismNodes,
    unconstrainedDofs,
    diagnosis,
    isSolvable,
  };
}

// ─── Diagnosis Builder ───────────────────────────────────────────

function buildDiagnosis3D(
  degree: number,
  mechanismModes: number,
  mechanismNodes: number[],
  unconstrainedDofs: Array<{ nodeId: number; dof: string }>,
): string {
  const dofNames: Record<string, string> = {
    'ux': t('kin.dof3dUx'),
    'uy': t('kin.dof3dUy'),
    'uz': t('kin.dof3dUz'),
    'rx': t('kin.dof3dRx'),
    'ry': t('kin.dof3dRy'),
    'rz': t('kin.dof3dRz'),
  };

  if (mechanismModes === 0) {
    if (degree > 0) return t('kin.diagHyperstatic').replace('{degree}', String(degree));
    if (degree === 0) return t('kin.diagIsostatic');
    return t('kin.diagStableButNeg').replace('{degree}', String(degree));
  }

  // Has mechanism modes
  const nodeList = mechanismNodes.slice(0, 8).join(', ');
  const dofList = unconstrainedDofs.slice(0, 8)
    .map(d => `${t('kin.nodeLC')} ${d.nodeId} (${dofNames[d.dof] ?? d.dof})`)
    .join('; ');

  if (mechanismNodes.length <= 3) {
    return t('kin.diagMechSmall')
      .replace('{s}', mechanismNodes.length > 1 ? t('kin.plural_s') : '')
      .replace('{nodes}', nodeList)
      .replace('{modes}', String(mechanismModes))
      .replace('{ms}', mechanismModes > 1 ? t('kin.plural_s') : '')
      .replace('{dofs}', dofList);
  }

  return t('kin.diagMechLarge')
    .replace('{degree}', String(degree))
    .replace('{modes}', String(mechanismModes))
    .replace('{ms}', mechanismModes > 1 ? t('kin.plural_s') : '')
    .replace('{nNodes}', String(mechanismNodes.length))
    .replace('{nodes}', nodeList)
    .replace('{dots1}', mechanismNodes.length > 8 ? '...' : '')
    .replace('{dofs}', dofList)
    .replace('{dots2}', unconstrainedDofs.length > 8 ? '...' : '');
}
