// 3D Kinematic Analysis — Static degree & mechanism detection
// computeStaticDegree3D is pure counting math (no solver dependency).
// analyzeKinematics3D delegates to the WASM engine for the heavy LU rank analysis.

import type { SolverInput3D, SolverSupport3D } from './types-3d';
import { analyzeKinematics3D as wasmAnalyzeKinematics3D, isWasmReady } from './wasm-solver';
import { buildDofNumbering3D, assemble3D, dofKey, type DofNumbering3D } from './solver-3d';
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
 * Uses WASM engine when available, falls back to TS implementation.
 */
export function analyzeKinematics3D(input: SolverInput3D): KinematicResult3D {
  if (isWasmReady()) {
    return wasmAnalyzeKinematics3D(input);
  }
  return analyzeKinematics3DTS(input);
}

// ─── TS Fallback (used in tests without WASM) ───────────────────

const DOF_LABELS_6 = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'] as const;
const DOF_LABELS_3 = ['ux', 'uy', 'uz'] as const;

function luRankAnalysis3D(Kff: Float64Array, n: number): {
  rank: number;
  zeroPivotDofs: number[];
} {
  const a = new Float64Array(Kff);
  const perm = Array.from({ length: n }, (_, i) => i);

  let maxDiag = 0;
  for (let i = 0; i < n; i++) maxDiag = Math.max(maxDiag, Math.abs(a[i * n + i]));
  const tol = Math.max(1e-10, maxDiag * 1e-10);

  const zeroPivotDofs: number[] = [];
  let rank = 0;

  for (let k = 0; k < n; k++) {
    let maxVal = 0, maxRow = k;
    for (let i = k; i < n; i++) {
      const val = Math.abs(a[i * n + k]);
      if (val > maxVal) { maxVal = val; maxRow = i; }
    }

    if (maxVal < tol) {
      zeroPivotDofs.push(perm[k]);
      continue;
    }

    rank++;

    if (maxRow !== k) {
      for (let j = 0; j < n; j++) {
        const tmp = a[k * n + j]; a[k * n + j] = a[maxRow * n + j]; a[maxRow * n + j] = tmp;
      }
      const tmp = perm[k]; perm[k] = perm[maxRow]; perm[maxRow] = tmp;
    }

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

function mapPivotsToNodes3D(
  zeroPivotDofs: number[],
  dofNum: DofNumbering3D,
): { mechanismNodes: number[]; unconstrainedDofs: Array<{ nodeId: number; dof: string }> } {
  const dofLabels = dofNum.dofsPerNode === 6 ? DOF_LABELS_6 : DOF_LABELS_3;

  const reverseMap = new Map<number, { nodeId: number; localDof: number }>();
  for (const [key, idx] of dofNum.map) {
    if (idx >= dofNum.nFree) continue;
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

function analyzeKinematics3DTS(input: SolverInput3D): KinematicResult3D {
  const { degree } = computeStaticDegree3D(input);

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

  const { K } = assemble3D(input, dofNum, true);
  const nt = dofNum.nTotal;

  const Kff = new Float64Array(nf * nf);
  for (let i = 0; i < nf; i++) {
    for (let j = 0; j < nf; j++) {
      Kff[i * nf + j] = K[i * nt + j];
    }
  }

  const { zeroPivotDofs } = luRankAnalysis3D(Kff, nf);

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

    for (const [nodeId, hinges] of nodeHingeCount) {
      const frames = nodeFrameCount.get(nodeId) ?? 0;
      if (hinges >= frames && frames >= 1 && !rotRestrainedNodes.has(nodeId)) {
        for (let rd = 3; rd <= 5; rd++) {
          const key = dofKey(nodeId, rd);
          const idx = dofNum.map.get(key);
          if (idx !== undefined && idx < nf) {
            expectedZeroDofs.add(idx);
          }
        }
      }
    }

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

  const trueMechanismDofs = zeroPivotDofs.filter(d => !expectedZeroDofs.has(d));
  const mechanismModes = trueMechanismDofs.length;

  const { mechanismNodes, unconstrainedDofs } = mapPivotsToNodes3D(trueMechanismDofs, dofNum);

  const isSolvable = mechanismModes === 0;

  let classification: 'hyperstatic' | 'isostatic' | 'hypostatic';
  if (degree > 0 && isSolvable) classification = 'hyperstatic';
  else if (degree === 0 && isSolvable) classification = 'isostatic';
  else classification = 'hypostatic';

  const diagnosis = buildDiagnosis3D(degree, mechanismModes, mechanismNodes, unconstrainedDofs);

  return { degree, classification, mechanismModes, mechanismNodes, unconstrainedDofs, diagnosis, isSolvable };
}
