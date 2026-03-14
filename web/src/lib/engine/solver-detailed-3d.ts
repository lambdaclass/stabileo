/**
 * Detailed 3D DSM solver — captures all intermediate steps for pedagogical display.
 * Mirrors the logic in solver-3d.ts but stores every matrix, vector, and contribution.
 *
 * 3D DOF order per node: [ux, uy, uz, θx, θy, θz] (6 DOF for frames, 3 DOF for pure trusses)
 * Local DOF order: [u1,v1,w1,θx1,θy1,θz1, u2,v2,w2,θx2,θy2,θz2]
 */

import type {
  SolverInput3D, SolverSupport3D,
  SolverDistributedLoad3D, SolverPointLoad3D,
} from './types-3d';
import { t } from '../i18n';

// Re-export the same DSMStepData interface so the StepWizard can display both 2D and 3D
export type {
  DofInfo, ElementStepData, LoadContribution, ElementForceStep, DSMStepData,
} from './solver-detailed';
import type {
  DofInfo, ElementStepData, LoadContribution, ElementForceStep, DSMStepData,
} from './solver-detailed';

import {
  computeLocalAxes3D,
  frameLocalStiffness3D,
  trussLocalStiffness3D,
  frameTransformationMatrix3D,
} from './solver-3d';

// ─── Internal helpers ────────────────────────────────────────────

function dofKey(nodeId: number, localDof: number): string {
  return `${nodeId}:${localDof}`;
}

/**
 * Check if a DOF is restrained by a 3D support.
 * DOF mapping: 0=ux, 1=uy, 2=uz, 3=rx, 4=ry, 5=rz
 * Spring DOFs are NOT restrained (spring stiffness is added to K).
 */
function isDofRestrained3D(sup: SolverSupport3D, dof: number): boolean {
  const springVal = [sup.kx, sup.ky, sup.kz, sup.krx, sup.kry, sup.krz][dof];
  if (springVal !== undefined && springVal > 0) return false;

  switch (dof) {
    case 0: return sup.rx;
    case 1: return sup.ry;
    case 2: return sup.rz;
    case 3: return sup.rrx;
    case 4: return sup.rry;
    case 5: return sup.rrz;
    default: return false;
  }
}

/**
 * 6×6 transformation matrix for 3D truss element.
 * T = diag(R, R) where R is the 3×3 direction cosine matrix [ex; ey; ez].
 */
function trussTransformationMatrix3D(
  ex: [number, number, number],
  ey: [number, number, number],
  ez: [number, number, number],
): Float64Array {
  const n = 6;
  const T = new Float64Array(n * n);
  for (let block = 0; block < 2; block++) {
    const off = block * 3;
    T[(off + 0) * n + (off + 0)] = ex[0];
    T[(off + 0) * n + (off + 1)] = ex[1];
    T[(off + 0) * n + (off + 2)] = ex[2];
    T[(off + 1) * n + (off + 0)] = ey[0];
    T[(off + 1) * n + (off + 1)] = ey[1];
    T[(off + 1) * n + (off + 2)] = ey[2];
    T[(off + 2) * n + (off + 0)] = ez[0];
    T[(off + 2) * n + (off + 1)] = ez[1];
    T[(off + 2) * n + (off + 2)] = ez[2];
  }
  return T;
}

/** K_global = T^T * K_local * T */
function transformMatrix(kLocal: Float64Array, T: Float64Array, n: number): Float64Array {
  const temp = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) sum += kLocal[i * n + k] * T[k * n + j];
      temp[i * n + j] = sum;
    }
  const kGlobal = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) sum += T[k * n + i] * temp[k * n + j];
      kGlobal[i * n + j] = sum;
    }
  return kGlobal;
}

// ─── Fixed-End Forces ────────────────────────────────────────────

function trapezoidalFEF(qI: number, qJ: number, L: number): [number, number, number, number] {
  const vu = qI * L / 2;
  const mu = qI * L * L / 12;
  const dq = qJ - qI;
  const vti = 3 * dq * L / 20;
  const mti = dq * L * L / 30;
  const vtj = 7 * dq * L / 20;
  const mtj = -dq * L * L / 20;
  return [vu + vti, mu + mti, vu + vtj, -mu + mtj];
}

function pointFEF(P: number, a: number, L: number): [number, number, number, number] {
  const b = L - a;
  const vi = P * b * b * (3 * a + b) / (L * L * L);
  const mi = P * a * b * b / (L * L);
  const vj = P * a * a * (a + 3 * b) / (L * L * L);
  const mj = -P * a * a * b / (L * L);
  return [vi, mi, vj, mj];
}

function partialDistributedFEF(qI: number, qJ: number, a: number, b: number, L: number): [number, number, number, number] {
  const span = b - a;
  if (span < 1e-12) return [0, 0, 0, 0];
  const N = 20;
  const h = span / N;
  let Vi = 0, Mi = 0, Vj = 0, Mj = 0;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = a + t * span;
    const q = qI + (qJ - qI) * t;
    let w: number;
    if (i === 0 || i === N) w = h / 3;
    else if (i % 2 === 1) w = 4 * h / 3;
    else w = 2 * h / 3;
    const dP = q * w;
    if (Math.abs(dP) < 1e-15) continue;
    const [vi, mi, vj, mj] = pointFEF(dP, x, L);
    Vi += vi; Mi += mi; Vj += vj; Mj += mj;
  }
  return [Vi, Mi, Vj, Mj];
}

function adjustFEFForHinges(
  vi: number, mi: number, vj: number, mj: number,
  L: number, hingeStart: boolean, hingeEnd: boolean,
): [number, number, number, number] {
  if (!hingeStart && !hingeEnd) return [vi, mi, vj, mj];
  if (hingeStart && hingeEnd) return [vi - (mi + mj) / L, 0, vj + (mi + mj) / L, 0];
  if (hingeStart) return [vi - (3 / (2 * L)) * mi, 0, vj + (3 / (2 * L)) * mi, mj - 0.5 * mi];
  return [vi - (3 / (2 * L)) * mj, mi - 0.5 * mj, vj + (3 / (2 * L)) * mj, 0];
}

// ─── LU Solver ───────────────────────────────────────────────────

function solveLU(A: Float64Array, b: Float64Array, n: number): Float64Array {
  const a = new Float64Array(A);
  const bw = new Float64Array(b);

  let maxDiag = 0;
  for (let i = 0; i < n; i++) maxDiag = Math.max(maxDiag, Math.abs(A[i * n + i]));
  const singularityTol = Math.max(1e-10, maxDiag * 1e-12);

  for (let k = 0; k < n - 1; k++) {
    let maxVal = Math.abs(a[k * n + k]);
    let maxRow = k;
    for (let i = k + 1; i < n; i++) {
      const val = Math.abs(a[i * n + k]);
      if (val > maxVal) { maxVal = val; maxRow = i; }
    }
    if (maxVal < singularityTol) throw new Error(t('detailed3d.singularMatrix'));
    if (maxRow !== k) {
      for (let j = 0; j < n; j++) {
        const tmp = a[k * n + j]; a[k * n + j] = a[maxRow * n + j]; a[maxRow * n + j] = tmp;
      }
      const tmp = bw[k]; bw[k] = bw[maxRow]; bw[maxRow] = tmp;
    }
    for (let i = k + 1; i < n; i++) {
      const factor = a[i * n + k] / a[k * n + k];
      for (let j = k + 1; j < n; j++) a[i * n + j] -= factor * a[k * n + j];
      bw[i] -= factor * bw[k];
    }
  }
  if (Math.abs(a[(n - 1) * n + (n - 1)]) < singularityTol) throw new Error(t('detailed3d.singularHypostatic'));
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = bw[i];
    for (let j = i + 1; j < n; j++) sum -= a[i * n + j] * x[j];
    x[i] = sum / a[i * n + i];
  }
  return x;
}

// ─── Utility ─────────────────────────────────────────────────────

function float64ToMatrix(arr: Float64Array | number[], rows: number, cols: number): number[][] {
  const m: number[][] = [];
  for (let i = 0; i < rows; i++) {
    const row: number[] = [];
    for (let j = 0; j < cols; j++) row.push(arr[i * cols + j]);
    m.push(row);
  }
  return m;
}

function dofLabel3D(nodeId: number, localDof: number, dofsPerNode: number): string {
  const labels6 = ['u', 'v', 'w', '\u03B8x', '\u03B8y', '\u03B8z'];
  const labels3 = ['u', 'v', 'w'];
  const labels = dofsPerNode === 6 ? labels6 : labels3;
  return `${labels[localDof]}${nodeId}`;
}

// ─── Main detailed 3D solver ────────────────────────────────────

export function solveDetailed3D(input: SolverInput3D): DSMStepData {
  // ─── Step 1: DOF Numbering ────────────────────────────────────
  const hasFrames = Array.from(input.elements.values()).some(e => e.type === 'frame');
  const dofsPerNode = hasFrames ? 6 : 3;
  const nodeOrder = Array.from(input.nodes.keys()).sort((a, b) => a - b);

  const dofMap = new Map<string, number>();
  let freeDofIdx = 0;
  const restrainedDofs: [number, number][] = [];

  const supportByNode = new Map<number, SolverSupport3D>();
  for (const sup of input.supports.values()) supportByNode.set(sup.nodeId, sup);

  // First pass: assign free DOFs
  for (const nodeId of nodeOrder) {
    const sup = supportByNode.get(nodeId);
    for (let ld = 0; ld < dofsPerNode; ld++) {
      const isRestrained = sup ? isDofRestrained3D(sup, ld) : false;
      if (isRestrained) restrainedDofs.push([nodeId, ld]);
      else dofMap.set(dofKey(nodeId, ld), freeDofIdx++);
    }
  }
  const nFree = freeDofIdx;

  // Second pass: assign restrained DOFs
  for (const [nodeId, ld] of restrainedDofs) dofMap.set(dofKey(nodeId, ld), freeDofIdx++);
  const nTotal = freeDofIdx;

  // Build DOF info array
  const dofsInfo: DofInfo[] = [];
  const allDofLabels: string[] = new Array(nTotal);
  for (const [key, idx] of dofMap) {
    const [nid, ld] = key.split(':').map(Number);
    const lbl = dofLabel3D(nid, ld, dofsPerNode);
    dofsInfo.push({ nodeId: nid, localDof: ld, globalIndex: idx, isFree: idx < nFree, label: lbl });
    allDofLabels[idx] = lbl;
  }
  dofsInfo.sort((a, b) => a.globalIndex - b.globalIndex);

  const freeDofLabels = allDofLabels.slice(0, nFree);
  const restrDofLabels = allDofLabels.slice(nFree);

  const globalDof = (nodeId: number, ld: number) => dofMap.get(dofKey(nodeId, ld));
  const elementDofs = (nodeI: number, nodeJ: number): number[] => {
    const dofs: number[] = [];
    for (let d = 0; d < dofsPerNode; d++) { const i = globalDof(nodeI, d); if (i !== undefined) dofs.push(i); }
    for (let d = 0; d < dofsPerNode; d++) { const i = globalDof(nodeJ, d); if (i !== undefined) dofs.push(i); }
    return dofs;
  };

  // ─── Steps 2-4: Element matrices + Assembly ───────────────────
  const K = new Float64Array(nTotal * nTotal);
  const F = new Float64Array(nTotal);
  const kContributions = new Map<string, number[]>();
  const elementsData: ElementStepData[] = [];

  for (const elem of input.elements.values()) {
    const nodeI = input.nodes.get(elem.nodeI)!;
    const nodeJ = input.nodes.get(elem.nodeJ)!;
    const mat = input.materials.get(elem.materialId)!;
    const sec = input.sections.get(elem.sectionId)!;
    const E_kNm2 = mat.e * 1000; // MPa -> kN/m2
    const G_kNm2 = E_kNm2 / (2 * (1 + mat.nu));

    const localY = (elem.localYx !== undefined && elem.localYy !== undefined && elem.localYz !== undefined)
      ? { x: elem.localYx, y: elem.localYy, z: elem.localYz }
      : undefined;
    const axes = computeLocalAxes3D(nodeI, nodeJ, localY, elem.rollAngle, input.leftHand);
    const L = axes.L;

    if (elem.type === 'frame') {
      const nDof = 12;
      const kLocal = frameLocalStiffness3D(E_kNm2, G_kNm2, sec.a, sec.iy, sec.iz, sec.j, L, elem.hingeStart, elem.hingeEnd);
      const T = frameTransformationMatrix3D(axes.ex, axes.ey, axes.ez);
      const kGlobal = transformMatrix(kLocal, T, nDof);
      const dofs = elementDofs(elem.nodeI, elem.nodeJ);
      const dLabels = dofs.map(d => allDofLabels[d]);

      elementsData.push({
        elementId: elem.id, nodeI: elem.nodeI, nodeJ: elem.nodeJ, type: 'frame',
        length: L, angle: 0, E: E_kNm2, A: sec.a, Iz: sec.iz,
        Iy: sec.iy, J: sec.j, G: G_kNm2,
        kLocal: float64ToMatrix(kLocal, nDof, nDof),
        T: float64ToMatrix(T, nDof, nDof),
        kGlobal: float64ToMatrix(kGlobal, nDof, nDof),
        dofIndices: dofs, dofLabels: dLabels,
      });

      for (let i = 0; i < dofs.length; i++) {
        for (let j = 0; j < dofs.length; j++) {
          const gi = dofs[i], gj = dofs[j];
          K[gi * nTotal + gj] += kGlobal[i * nDof + j];
          const key = `${gi},${gj}`;
          const existing = kContributions.get(key);
          if (existing) existing.push(elem.id);
          else kContributions.set(key, [elem.id]);
        }
      }
    } else {
      // Truss: 6×6 in 3D (3 translations per node)
      const nDof = 6;
      const kLocal = trussLocalStiffness3D(E_kNm2, sec.a, L);
      const T = trussTransformationMatrix3D(axes.ex, axes.ey, axes.ez);
      const kGlobal = transformMatrix(kLocal, T, nDof);

      // Map the 6 truss DOFs to global indices (ux,uy,uz per node)
      const diI0 = globalDof(elem.nodeI, 0)!;
      const diI1 = globalDof(elem.nodeI, 1)!;
      const diI2 = globalDof(elem.nodeI, 2)!;
      const diJ0 = globalDof(elem.nodeJ, 0)!;
      const diJ1 = globalDof(elem.nodeJ, 1)!;
      const diJ2 = globalDof(elem.nodeJ, 2)!;
      const dofs = [diI0, diI1, diI2, diJ0, diJ1, diJ2];
      const dLabels = dofs.map(d => allDofLabels[d]);

      elementsData.push({
        elementId: elem.id, nodeI: elem.nodeI, nodeJ: elem.nodeJ, type: 'truss',
        length: L, angle: 0, E: E_kNm2, A: sec.a, Iz: 0,
        kLocal: float64ToMatrix(kLocal, nDof, nDof),
        T: float64ToMatrix(T, nDof, nDof),
        kGlobal: float64ToMatrix(kGlobal, nDof, nDof),
        dofIndices: dofs, dofLabels: dLabels,
      });

      for (let i = 0; i < nDof; i++) {
        for (let j = 0; j < nDof; j++) {
          K[dofs[i] * nTotal + dofs[j]] += kGlobal[i * nDof + j];
          const key = `${dofs[i]},${dofs[j]}`;
          const existing = kContributions.get(key);
          if (existing) existing.push(elem.id);
          else kContributions.set(key, [elem.id]);
        }
      }
    }
  }

  // Spring supports
  for (const sup of input.supports.values()) {
    const springs = [sup.kx, sup.ky, sup.kz, sup.krx, sup.kry, sup.krz];
    for (let d = 0; d < 6; d++) {
      const kVal = springs[d];
      if (kVal !== undefined && kVal > 0 && d < dofsPerNode) {
        const idx = globalDof(sup.nodeId, d);
        if (idx !== undefined) K[idx * nTotal + idx] += kVal;
      }
    }
  }

  // Artificial rotational springs at all-hinged nodes (same logic as solver-3d.ts)
  if (dofsPerNode >= 6) {
    let maxDiagK = 0;
    for (let i = 0; i < nTotal; i++) maxDiagK = Math.max(maxDiagK, Math.abs(K[i * nTotal + i]));
    const artificialK = maxDiagK > 0 ? maxDiagK * 1e-10 : 1e-6;

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
          const idx = globalDof(nodeId, rd);
          if (idx !== undefined && idx < nFree) K[idx * nTotal + idx] += artificialK;
        }
      }
    }
  }

  // ─── Step 5: Load vector ──────────────────────────────────────
  const loadContributions: LoadContribution[] = [];

  const addLC = (nodeId: number, ld: number, val: number, desc: string) => {
    if (Math.abs(val) < 1e-15) return;
    const idx = globalDof(nodeId, ld);
    if (idx !== undefined) {
      F[idx] += val;
      loadContributions.push({ dofIndex: idx, dofLabel: allDofLabels[idx], source: desc, value: val });
    }
  };

  for (const load of input.loads) {
    if (load.type === 'nodal') {
      const { nodeId, fx, fy, fz, mx, my, mz } = load.data;
      const vals = [fx, fy, fz, mx, my, mz];
      for (let d = 0; d < dofsPerNode; d++) {
        if (d < vals.length && Math.abs(vals[d]) > 1e-15) {
          addLC(nodeId, d, vals[d], `Carga nodal en nodo ${nodeId}, DOF ${d}`);
        }
      }

    } else if (load.type === 'distributed') {
      assembleDistLoadDetailed(input, load.data, globalDof, allDofLabels, dofsPerNode, F, loadContributions);

    } else if (load.type === 'pointOnElement') {
      assemblePointLoadDetailed(input, load.data, globalDof, allDofLabels, dofsPerNode, F, loadContributions);
    }
  }

  // ─── Step 6: Partitioning ─────────────────────────────────────
  const nRestr = nTotal - nFree;
  const uR = new Float64Array(nRestr);

  for (const sup of input.supports.values()) {
    const prescribedVals = [sup.dx, sup.dy, sup.dz, sup.drx, sup.dry, sup.drz];
    for (let d = 0; d < dofsPerNode; d++) {
      if (!isDofRestrained3D(sup, d)) continue;
      const val = prescribedVals[d];
      if (val !== undefined && val !== 0) {
        const gIdx = globalDof(sup.nodeId, d);
        if (gIdx !== undefined && gIdx >= nFree) uR[gIdx - nFree] = val;
      }
    }
  }

  // Extract partitions
  const KffArr = new Float64Array(nFree * nFree);
  const KfrArr = new Float64Array(nFree * nRestr);
  const KrfArr = new Float64Array(nRestr * nFree);
  const KrrArr = new Float64Array(nRestr * nRestr);

  for (let i = 0; i < nFree; i++) {
    for (let j = 0; j < nFree; j++) KffArr[i * nFree + j] = K[i * nTotal + j];
    for (let j = 0; j < nRestr; j++) KfrArr[i * nRestr + j] = K[i * nTotal + (nFree + j)];
  }
  for (let i = 0; i < nRestr; i++) {
    for (let j = 0; j < nFree; j++) KrfArr[i * nFree + j] = K[(nFree + i) * nTotal + j];
    for (let j = 0; j < nRestr; j++) KrrArr[i * nRestr + j] = K[(nFree + i) * nTotal + (nFree + j)];
  }

  const FfRaw = Array.from(F.subarray(0, nFree));
  const FrRaw = Array.from(F.subarray(nFree));

  // F_mod = Ff - Kfr * uR
  const FfMod = new Float64Array(FfRaw);
  for (let i = 0; i < nFree; i++) {
    for (let j = 0; j < nRestr; j++) {
      FfMod[i] -= K[i * nTotal + (nFree + j)] * uR[j];
    }
  }

  // ─── Step 7: Solve ────────────────────────────────────────────
  let uf: Float64Array;
  const uAll = new Float64Array(nTotal);
  if (nFree > 0) {
    uf = solveLU(KffArr, FfMod, nFree);
    for (let i = 0; i < nFree; i++) uAll[i] = uf[i];
  } else {
    uf = new Float64Array(0);
  }
  for (let i = 0; i < nRestr; i++) uAll[nFree + i] = uR[i];

  // ─── Step 8: Reactions ────────────────────────────────────────
  const reactionsRaw = new Float64Array(nRestr);
  for (let i = 0; i < nRestr; i++) {
    let sum = 0;
    for (let j = 0; j < nFree; j++) sum += K[(nFree + i) * nTotal + j] * uf[j];
    for (let j = 0; j < nRestr; j++) sum += K[(nFree + i) * nTotal + (nFree + j)] * uR[j];
    reactionsRaw[i] = sum - F[nFree + i];
  }

  // ─── Step 9: Internal forces ──────────────────────────────────
  const elementForcesSteps: ElementForceStep[] = [];

  for (const elem of input.elements.values()) {
    const nodeI = input.nodes.get(elem.nodeI)!;
    const nodeJ = input.nodes.get(elem.nodeJ)!;
    const mat = input.materials.get(elem.materialId)!;
    const sec = input.sections.get(elem.sectionId)!;
    const E_kNm2 = mat.e * 1000;
    const G_kNm2 = E_kNm2 / (2 * (1 + mat.nu));

    const localYVec = (elem.localYx !== undefined && elem.localYy !== undefined && elem.localYz !== undefined)
      ? { x: elem.localYx, y: elem.localYy, z: elem.localYz }
      : undefined;
    const axes = computeLocalAxes3D(nodeI, nodeJ, localYVec, elem.rollAngle, input.leftHand);
    const L = axes.L;

    // Collect loads on this element
    const distLoads: SolverDistributedLoad3D[] = [];
    const pointLoads: SolverPointLoad3D[] = [];
    for (const load of input.loads) {
      if (load.type === 'distributed' && load.data.elementId === elem.id) {
        distLoads.push(load.data);
      } else if (load.type === 'pointOnElement' && load.data.elementId === elem.id) {
        pointLoads.push(load.data);
      }
    }

    if (elem.type === 'frame') {
      // Get global displacements (12 DOFs)
      const uGlob = new Float64Array(12);
      for (let d = 0; d < 6; d++) {
        const iI = globalDof(elem.nodeI, d); uGlob[d] = iI !== undefined ? uAll[iI] : 0;
        const iJ = globalDof(elem.nodeJ, d); uGlob[6 + d] = iJ !== undefined ? uAll[iJ] : 0;
      }

      // Transform to local: u_local = T * u_global
      const T = frameTransformationMatrix3D(axes.ex, axes.ey, axes.ez);
      const uLoc = new Float64Array(12);
      for (let i = 0; i < 12; i++) {
        let sum = 0;
        for (let j = 0; j < 12; j++) sum += T[i * 12 + j] * uGlob[j];
        uLoc[i] = sum;
      }

      // F_local_raw = K_local * u_local
      const kL = frameLocalStiffness3D(E_kNm2, G_kNm2, sec.a, sec.iy, sec.iz, sec.j, L, elem.hingeStart, elem.hingeEnd);
      const fRaw = new Float64Array(12);
      for (let i = 0; i < 12; i++) {
        let sum = 0;
        for (let j = 0; j < 12; j++) sum += kL[i * 12 + j] * uLoc[j];
        fRaw[i] = sum;
      }

      // Fixed-end forces (12-component local vector)
      const fef = new Float64Array(12);

      for (const dl of distLoads) {
        const a = dl.a ?? 0;
        const b = dl.b ?? L;

        // Y-plane FEF -> DOFs 1,5,7,11
        if (Math.abs(dl.qYI) > 1e-15 || Math.abs(dl.qYJ) > 1e-15) {
          let vi0: number, mi0: number, vj0: number, mj0: number;
          if (a < 1e-10 && Math.abs(b - L) < 1e-10) {
            [vi0, mi0, vj0, mj0] = trapezoidalFEF(dl.qYI, dl.qYJ, L);
          } else {
            [vi0, mi0, vj0, mj0] = partialDistributedFEF(dl.qYI, dl.qYJ, a, b, L);
          }
          const [vi, mi, vj, mj] = adjustFEFForHinges(vi0, mi0, vj0, mj0, L, elem.hingeStart, elem.hingeEnd);
          fef[1] += vi; fef[5] += mi; fef[7] += vj; fef[11] += mj;
        }

        // Z-plane FEF -> DOFs 2,4,8,10 (sign inversion for My)
        if (Math.abs(dl.qZI) > 1e-15 || Math.abs(dl.qZJ) > 1e-15) {
          let vi0: number, mi0: number, vj0: number, mj0: number;
          if (a < 1e-10 && Math.abs(b - L) < 1e-10) {
            [vi0, mi0, vj0, mj0] = trapezoidalFEF(dl.qZI, dl.qZJ, L);
          } else {
            [vi0, mi0, vj0, mj0] = partialDistributedFEF(dl.qZI, dl.qZJ, a, b, L);
          }
          const [vi, mi, vj, mj] = adjustFEFForHinges(vi0, mi0, vj0, mj0, L, elem.hingeStart, elem.hingeEnd);
          // Sign inversion for My (theta_y = -dw/dx)
          fef[2] += vi; fef[4] += -mi; fef[8] += vj; fef[10] += -mj;
        }
      }

      for (const pl of pointLoads) {
        if (Math.abs(pl.py) > 1e-15) {
          const [vi0, mi0, vj0, mj0] = pointFEF(pl.py, pl.a, L);
          const [vi, mi, vj, mj] = adjustFEFForHinges(vi0, mi0, vj0, mj0, L, elem.hingeStart, elem.hingeEnd);
          fef[1] += vi; fef[5] += mi; fef[7] += vj; fef[11] += mj;
        }
        if (Math.abs(pl.pz) > 1e-15) {
          const [vi0, mi0, vj0, mj0] = pointFEF(pl.pz, pl.a, L);
          const [vi, mi, vj, mj] = adjustFEFForHinges(vi0, mi0, vj0, mj0, L, elem.hingeStart, elem.hingeEnd);
          fef[2] += vi; fef[4] += -mi; fef[8] += vj; fef[10] += -mj;
        }
      }

      // Final local forces = raw - FEF
      const fFinal = new Float64Array(12);
      for (let i = 0; i < 12; i++) fFinal[i] = fRaw[i] - fef[i];

      elementForcesSteps.push({
        elementId: elem.id,
        uGlobal: Array.from(uGlob), uLocal: Array.from(uLoc),
        fLocalRaw: Array.from(fRaw), fixedEndForces: Array.from(fef),
        fLocalFinal: Array.from(fFinal),
      });

    } else {
      // Truss: 6-component arrays [ux1,uy1,uz1,ux2,uy2,uz2]
      const uGlob = new Float64Array(6);
      for (let d = 0; d < 3; d++) {
        const iI = globalDof(elem.nodeI, d); uGlob[d] = iI !== undefined ? uAll[iI] : 0;
        const iJ = globalDof(elem.nodeJ, d); uGlob[3 + d] = iJ !== undefined ? uAll[iJ] : 0;
      }

      // Transform to local using T
      const T = trussTransformationMatrix3D(axes.ex, axes.ey, axes.ez);
      const uLoc = new Float64Array(6);
      for (let i = 0; i < 6; i++) {
        let sum = 0;
        for (let j = 0; j < 6; j++) sum += T[i * 6 + j] * uGlob[j];
        uLoc[i] = sum;
      }

      // Raw force = kLocal * uLocal
      const kL = trussLocalStiffness3D(E_kNm2, sec.a, L);
      const fRaw = new Float64Array(6);
      for (let i = 0; i < 6; i++) {
        let sum = 0;
        for (let j = 0; j < 6; j++) sum += kL[i * 6 + j] * uLoc[j];
        fRaw[i] = sum;
      }

      elementForcesSteps.push({
        elementId: elem.id,
        uGlobal: Array.from(uGlob),
        uLocal: Array.from(uLoc),
        fLocalRaw: Array.from(fRaw),
        fixedEndForces: [0, 0, 0, 0, 0, 0],
        fLocalFinal: Array.from(fRaw), // No FEF for trusses (no distributed loads on trusses)
      });
    }
  }

  // ─── Build result ─────────────────────────────────────────────
  return {
    dofNumbering: { nFree, nTotal, dofsPerNode, nodeOrder, dofs: dofsInfo },
    elements: elementsData,
    K: float64ToMatrix(K, nTotal, nTotal),
    kContributions,
    F: Array.from(F),
    loadContributions,
    Kff: float64ToMatrix(KffArr, nFree, nFree),
    Kfr: float64ToMatrix(KfrArr, nFree, nRestr),
    Krf: float64ToMatrix(KrfArr, nRestr, nFree),
    Krr: float64ToMatrix(KrrArr, nRestr, nRestr),
    Ff: FfRaw,
    Fr: FrRaw,
    uPrescribed: Array.from(uR),
    FfMod: Array.from(FfMod),
    uFree: Array.from(uf),
    uAll: Array.from(uAll),
    reactionsRaw: Array.from(reactionsRaw),
    elementForces: elementForcesSteps,
    dofLabels: allDofLabels,
    freeDofLabels,
    restrDofLabels,
  };
}

// ─── Distributed load assembly helper (with step tracking) ───────

function assembleDistLoadDetailed(
  input: SolverInput3D,
  load: SolverDistributedLoad3D,
  globalDof: (nodeId: number, ld: number) => number | undefined,
  allDofLabels: string[],
  dofsPerNode: number,
  F: Float64Array,
  loadContributions: LoadContribution[],
) {
  const elem = input.elements.get(load.elementId);
  if (!elem) return;
  const nodeI = input.nodes.get(elem.nodeI)!;
  const nodeJ = input.nodes.get(elem.nodeJ)!;

  const localY = (elem.localYx !== undefined && elem.localYy !== undefined && elem.localYz !== undefined)
    ? { x: elem.localYx, y: elem.localYy, z: elem.localYz }
    : undefined;
  const axes = computeLocalAxes3D(nodeI, nodeJ, localY, elem.rollAngle, input.leftHand);
  const L = axes.L;

  const a = load.a ?? 0;
  const b = load.b ?? L;

  // Build 12-vector of equivalent nodal forces in local coords
  const fLocal = new Float64Array(12);

  // Y-plane FEF
  if (Math.abs(load.qYI) > 1e-15 || Math.abs(load.qYJ) > 1e-15) {
    let vi0: number, mi0: number, vj0: number, mj0: number;
    if (a < 1e-10 && Math.abs(b - L) < 1e-10) {
      [vi0, mi0, vj0, mj0] = trapezoidalFEF(load.qYI, load.qYJ, L);
    } else {
      [vi0, mi0, vj0, mj0] = partialDistributedFEF(load.qYI, load.qYJ, a, b, L);
    }
    const [vi, mi, vj, mj] = adjustFEFForHinges(vi0, mi0, vj0, mj0, L, elem.hingeStart, elem.hingeEnd);
    fLocal[1] = vi; fLocal[5] = mi; fLocal[7] = vj; fLocal[11] = mj;
  }

  // Z-plane FEF
  if (Math.abs(load.qZI) > 1e-15 || Math.abs(load.qZJ) > 1e-15) {
    let vi0: number, mi0: number, vj0: number, mj0: number;
    if (a < 1e-10 && Math.abs(b - L) < 1e-10) {
      [vi0, mi0, vj0, mj0] = trapezoidalFEF(load.qZI, load.qZJ, L);
    } else {
      [vi0, mi0, vj0, mj0] = partialDistributedFEF(load.qZI, load.qZJ, a, b, L);
    }
    const [vi, mi, vj, mj] = adjustFEFForHinges(vi0, mi0, vj0, mj0, L, elem.hingeStart, elem.hingeEnd);
    fLocal[2] = vi; fLocal[4] = -mi; fLocal[8] = vj; fLocal[10] = -mj;
  }

  // Transform to global: F_global = T^T * F_local
  const T = frameTransformationMatrix3D(axes.ex, axes.ey, axes.ez);
  const fGlobal = new Float64Array(12);
  for (let i = 0; i < 12; i++) {
    let sum = 0;
    for (let k = 0; k < 12; k++) sum += T[k * 12 + i] * fLocal[k];
    fGlobal[i] = sum;
  }

  // Scatter to global F with tracking
  const desc = `Carga distrib. elem ${elem.id}`;
  const dofNames = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
  const dofs = [elem.nodeI, elem.nodeJ];
  for (let n = 0; n < 2; n++) {
    const nodeId = dofs[n];
    for (let d = 0; d < dofsPerNode; d++) {
      const val = fGlobal[n * dofsPerNode + d];
      if (Math.abs(val) < 1e-15) continue;
      const idx = globalDof(nodeId, d);
      if (idx !== undefined) {
        F[idx] += val;
        loadContributions.push({
          dofIndex: idx,
          dofLabel: allDofLabels[idx],
          source: `${desc}, nodo ${n === 0 ? 'I' : 'J'} ${dofNames[d]}`,
          value: val,
        });
      }
    }
  }
}

// ─── Point load on element assembly helper (with step tracking) ──

function assemblePointLoadDetailed(
  input: SolverInput3D,
  load: SolverPointLoad3D,
  globalDof: (nodeId: number, ld: number) => number | undefined,
  allDofLabels: string[],
  dofsPerNode: number,
  F: Float64Array,
  loadContributions: LoadContribution[],
) {
  const elem = input.elements.get(load.elementId);
  if (!elem) return;
  const nodeI = input.nodes.get(elem.nodeI)!;
  const nodeJ = input.nodes.get(elem.nodeJ)!;

  const localY = (elem.localYx !== undefined && elem.localYy !== undefined && elem.localYz !== undefined)
    ? { x: elem.localYx, y: elem.localYy, z: elem.localYz }
    : undefined;
  const axes = computeLocalAxes3D(nodeI, nodeJ, localY, elem.rollAngle, input.leftHand);
  const L = axes.L;

  const fLocal = new Float64Array(12);

  // Y component
  if (Math.abs(load.py) > 1e-15) {
    const [vi0, mi0, vj0, mj0] = pointFEF(load.py, load.a, L);
    const [vi, mi, vj, mj] = adjustFEFForHinges(vi0, mi0, vj0, mj0, L, elem.hingeStart, elem.hingeEnd);
    fLocal[1] += vi; fLocal[5] += mi; fLocal[7] += vj; fLocal[11] += mj;
  }

  // Z component
  if (Math.abs(load.pz) > 1e-15) {
    const [vi0, mi0, vj0, mj0] = pointFEF(load.pz, load.a, L);
    const [vi, mi, vj, mj] = adjustFEFForHinges(vi0, mi0, vj0, mj0, L, elem.hingeStart, elem.hingeEnd);
    fLocal[2] += vi; fLocal[4] += -mi; fLocal[8] += vj; fLocal[10] += -mj;
  }

  // Transform to global
  const T = frameTransformationMatrix3D(axes.ex, axes.ey, axes.ez);
  const fGlobal = new Float64Array(12);
  for (let i = 0; i < 12; i++) {
    let sum = 0;
    for (let k = 0; k < 12; k++) sum += T[k * 12 + i] * fLocal[k];
    fGlobal[i] = sum;
  }

  // Scatter to global F with tracking
  const desc = `Carga puntual elem ${elem.id}`;
  const dofNames = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
  const dofs = [elem.nodeI, elem.nodeJ];
  for (let n = 0; n < 2; n++) {
    const nodeId = dofs[n];
    for (let d = 0; d < dofsPerNode; d++) {
      const val = fGlobal[n * dofsPerNode + d];
      if (Math.abs(val) < 1e-15) continue;
      const idx = globalDof(nodeId, d);
      if (idx !== undefined) {
        F[idx] += val;
        loadContributions.push({
          dofIndex: idx,
          dofLabel: allDofLabels[idx],
          source: `${desc}, nodo ${n === 0 ? 'I' : 'J'} ${dofNames[d]}`,
          value: val,
        });
      }
    }
  }
}
