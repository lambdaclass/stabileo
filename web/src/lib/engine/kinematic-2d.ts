// Kinematic Analysis for 2D structures
// Extracted from solver-js.ts to reduce file size and improve modularity.
//
// Exports:
//   - KinematicResult (interface)
//   - computeStaticDegree()
//   - analyzeKinematics()

import type { SolverInput } from './types';
import { buildDofNumbering, assemble, type DofNumbering } from './solver-js';
import { t } from '../i18n';

function dofKey(nodeId: number, localDof: number): string {
  return `${nodeId}:${localDof}`;
}

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
  /** Human-readable diagnosis in Spanish */
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
      // Free end or single-element node: hinge modifies stiffness
      // but does not add an independent equilibrium condition
      ci = 0;
    } else if (rotRestrainedNodes.has(nodeId)) {
      // Node with rotational restraint: each hinge is independent
      ci = j;
    } else {
      // Node without rotational restraint:
      // All-hinged node has one free rotation DOF → one fewer condition
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
 * LU factorization with partial pivoting for rank analysis.
 * Does NOT throw on zero pivots — instead records them.
 */
function luRankAnalysis(Kff: Float64Array, n: number): {
  rank: number;
  zeroPivotDofs: number[];  // original DOF indices with zero pivots
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
      // Skip this column (don't eliminate, rank deficient)
      // Move to next column but keep same row position
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

/**
 * Map zero-pivot DOF indices back to node IDs and DOF labels.
 */
function mapPivotsToNodes(
  zeroPivotDofs: number[],
  dofNum: DofNumbering,
): { mechanismNodes: number[]; unconstrainedDofs: Array<{ nodeId: number; dof: 'ux' | 'uy' | 'rz' }> } {
  const dofLabels = ['ux', 'uy', 'rz'] as const;

  // Build reverse map: globalDofIndex → { nodeId, localDof }
  const reverseMap = new Map<number, { nodeId: number; localDof: number }>();
  for (const [key, idx] of dofNum.map) {
    if (idx >= dofNum.nFree) continue; // only free DOFs
    const parts = key.split(':');
    reverseMap.set(idx, { nodeId: parseInt(parts[0]), localDof: parseInt(parts[1]) });
  }

  const nodeSet = new Set<number>();
  const unconstrainedDofs: Array<{ nodeId: number; dof: 'ux' | 'uy' | 'rz' }> = [];

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

/**
 * Full kinematic analysis: combines degree formula + rank analysis.
 * Returns classification, mechanism nodes, and diagnosis.
 */
export function analyzeKinematics(input: SolverInput): KinematicResult {
  // Step 1: Compute corrected degree
  const { degree, nodeConditions } = computeStaticDegree(input);

  // Step 2: Build DOF numbering
  const dofNum = buildDofNumbering(input);
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

  // Step 3: Assemble K WITHOUT artificial stiffness
  const { K } = assemble(input, dofNum, true);
  const nt = dofNum.nTotal;

  // Step 4: Extract Kff
  const Kff = new Float64Array(nf * nf);
  for (let i = 0; i < nf; i++) {
    for (let j = 0; j < nf; j++) {
      Kff[i * nf + j] = K[i * nt + j];
    }
  }

  // Step 5: LU rank analysis
  const { rank, zeroPivotDofs } = luRankAnalysis(Kff, nf);

  // Step 5b: Filter out expected zero-stiffness DOFs at valid pin joints.
  // These are rotation DOFs at nodes where ALL frame elements are hinged and
  // there is no rotational restraint from supports. These DOFs correctly have
  // zero stiffness and are handled by artificial stiffness during actual solving.
  // They are NOT true mechanisms (e.g., three-hinge arch crowns, Gerber beam joints).
  const expectedZeroDofs = new Set<number>();
  if (dofNum.dofsPerNode >= 3) {
    const nodeHingeCount = new Map<number, number>();
    const nodeFrameCount = new Map<number, number>();
    for (const elem of input.elements.values()) {
      if (elem.type !== 'frame') continue;
      nodeFrameCount.set(elem.nodeI, (nodeFrameCount.get(elem.nodeI) ?? 0) + 1);
      nodeFrameCount.set(elem.nodeJ, (nodeFrameCount.get(elem.nodeJ) ?? 0) + 1);
      if (elem.hingeStart) nodeHingeCount.set(elem.nodeI, (nodeHingeCount.get(elem.nodeI) ?? 0) + 1);
      if (elem.hingeEnd) nodeHingeCount.set(elem.nodeJ, (nodeHingeCount.get(elem.nodeJ) ?? 0) + 1);
    }
    const rotRestrainedNodes = new Set<number>();
    for (const sup of input.supports.values()) {
      if (sup.type === 'fixed') rotRestrainedNodes.add(sup.nodeId);
      if (sup.type === 'spring' && sup.kz && sup.kz > 0) rotRestrainedNodes.add(sup.nodeId);
    }
    for (const [nodeId, hinges] of nodeHingeCount) {
      const frames = nodeFrameCount.get(nodeId) ?? 0;
      if (hinges >= frames && frames >= 1 && !rotRestrainedNodes.has(nodeId)) {
        const key = dofKey(nodeId, 2); // rotation DOF
        const idx = dofNum.map.get(key);
        if (idx !== undefined && idx < nf) {
          expectedZeroDofs.add(idx);
        }
      }
    }
  }

  // True mechanism DOFs = zero pivots that are NOT expected pin-joint rotations
  const trueMechanismDofs = zeroPivotDofs.filter(d => !expectedZeroDofs.has(d));
  const mechanismModes = trueMechanismDofs.length;

  // Step 6: Map zero pivots to nodes (only true mechanism DOFs)
  const { mechanismNodes, unconstrainedDofs } = mapPivotsToNodes(trueMechanismDofs, dofNum);

  // Step 7: Build classification and diagnosis
  const isSolvable = mechanismModes === 0;

  let classification: 'hyperstatic' | 'isostatic' | 'hypostatic';
  if (degree > 0 && isSolvable) classification = 'hyperstatic';
  else if (degree === 0 && isSolvable) classification = 'isostatic';
  else classification = 'hypostatic';

  const diagnosis = buildDiagnosis(degree, mechanismModes, mechanismNodes, unconstrainedDofs);

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

function buildDiagnosis(
  degree: number,
  mechanismModes: number,
  mechanismNodes: number[],
  unconstrainedDofs: Array<{ nodeId: number; dof: 'ux' | 'uy' | 'rz' }>,
): string {
  const dofNames: Record<string, string> = {
    'ux': t('kin.dofHorizontal'),
    'uy': t('kin.dofVertical'),
    'rz': t('kin.dofRotation'),
  };

  if (mechanismModes === 0) {
    if (degree > 0) return t('kin.diagHyperstatic').replace('{degree}', String(degree));
    if (degree === 0) return t('kin.diagIsostatic');
    return t('kin.diagStableButNeg').replace('{degree}', String(degree));
  }

  // Has mechanism modes
  const nodeList = mechanismNodes.slice(0, 8).join(', ');
  const dofList = unconstrainedDofs.slice(0, 8)
    .map(d => `${t('kin.nodeLC')} ${d.nodeId} (${dofNames[d.dof]})`)
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
