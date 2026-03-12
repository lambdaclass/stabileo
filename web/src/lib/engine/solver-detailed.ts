/**
 * Detailed DSM solver — captures all intermediate steps for pedagogical display.
 * Mirrors the logic in solver-js.ts but stores every matrix, vector, and contribution.
 */

import type {
  SolverInput, SolverNode, SolverSupport,
  SolverDistributedLoad, SolverPointLoadOnElement, SolverThermalLoad,
} from './types';
import { t } from '../i18n';

// ─── Types ──────────────────────────────────────────────────────

export interface DofInfo {
  nodeId: number;
  localDof: number;  // 0=ux, 1=uy, 2=θ
  globalIndex: number;
  isFree: boolean;
  label: string; // "u₁", "v₁", "θ₁", etc.
}

export interface ElementStepData {
  elementId: number;
  nodeI: number;
  nodeJ: number;
  type: 'frame' | 'truss';
  length: number;
  angle: number; // radians
  E: number;     // kN/m²
  A: number;     // m²
  Iz: number;    // m⁴
  Iy?: number;   // m⁴ (3D frames only)
  J?: number;    // m⁴ torsion constant (3D frames only)
  G?: number;    // kN/m² shear modulus (3D frames only)
  kLocal: number[][];  // local stiffness (6×6 frame, 4×4 truss) or (12×12, 6×6 for 3D)
  T: number[][];       // transformation matrix
  kGlobal: number[][]; // global stiffness = T^t·k·T
  dofIndices: number[]; // which global DOFs
  dofLabels: string[];  // labels for display
}

export interface LoadContribution {
  dofIndex: number;
  dofLabel: string;
  source: string; // human-readable description
  value: number;
}

export interface ElementForceStep {
  elementId: number;
  uGlobal: number[];     // element displacements in global coords
  uLocal: number[];      // element displacements in local coords
  fLocalRaw: number[];   // k·u_local (before subtracting FEF)
  fixedEndForces: number[]; // FEF from distributed/point/thermal loads
  fLocalFinal: number[]; // final = fLocalRaw - FEF
}

export interface DSMStepData {
  // Step 1: DOF Numbering
  dofNumbering: {
    nFree: number;
    nTotal: number;
    dofsPerNode: number;
    nodeOrder: number[];
    dofs: DofInfo[];
  };

  // Steps 2-3: Element matrices
  elements: ElementStepData[];

  // Step 4: Global assembly
  K: number[][];
  /** Maps "i,j" → array of element IDs that contributed to K[i][j] */
  kContributions: Map<string, number[]>;

  // Step 5: Load vector
  F: number[];
  loadContributions: LoadContribution[];

  // Step 6: Partitioning
  Kff: number[][];
  Kfr: number[][];
  Krf: number[][];
  Krr: number[][];
  Ff: number[];
  Fr: number[];
  uPrescribed: number[];
  FfMod: number[]; // Ff - Kfr·uR

  // Step 7: Solution
  uFree: number[];
  uAll: number[];

  // Step 8: Reactions
  reactionsRaw: number[]; // raw reaction vector (nRestr)

  // Step 9: Internal forces
  elementForces: ElementForceStep[];

  // Labels for display
  dofLabels: string[]; // nTotal labels: "u₁", "v₁", "θ₁", ...
  freeDofLabels: string[];
  restrDofLabels: string[];
}

// ─── Internal helpers (same as solver-js.ts) ────────────────────

function dofKey(nodeId: number, localDof: number): string {
  return `${nodeId}:${localDof}`;
}

function isDofRestrained(sup: SolverSupport, localDof: number): boolean {
  switch (sup.type) {
    case 'fixed': return true;
    case 'pinned': return localDof === 0 || localDof === 1;
    case 'rollerX': return localDof === 1;
    case 'rollerY': return localDof === 0;
    case 'spring': return false;
    default: return false;
  }
}

function nodeDistance(a: SolverNode, b: SolverNode): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

function nodeAngle(a: SolverNode, b: SolverNode): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function frameLocalStiffness(
  e: number, a: number, iz: number, l: number,
  hingeStart: boolean, hingeEnd: boolean,
): Float64Array {
  const n = 6;
  const k = new Float64Array(n * n);
  const ea_l = e * a / l;
  const ei_l = e * iz / l;
  const ei_l2 = ei_l / l;
  const ei_l3 = ei_l2 / l;

  k[0 * n + 0] = ea_l;   k[0 * n + 3] = -ea_l;
  k[3 * n + 0] = -ea_l;  k[3 * n + 3] = ea_l;

  if (!hingeStart && !hingeEnd) {
    k[1*n+1] = 12*ei_l3;   k[1*n+2] = 6*ei_l2;   k[1*n+4] = -12*ei_l3;  k[1*n+5] = 6*ei_l2;
    k[2*n+1] = 6*ei_l2;    k[2*n+2] = 4*ei_l;     k[2*n+4] = -6*ei_l2;   k[2*n+5] = 2*ei_l;
    k[4*n+1] = -12*ei_l3;  k[4*n+2] = -6*ei_l2;   k[4*n+4] = 12*ei_l3;   k[4*n+5] = -6*ei_l2;
    k[5*n+1] = 6*ei_l2;    k[5*n+2] = 2*ei_l;     k[5*n+4] = -6*ei_l2;   k[5*n+5] = 4*ei_l;
  } else if (hingeStart && !hingeEnd) {
    k[1*n+1] = 3*ei_l3;   k[1*n+4] = -3*ei_l3;  k[1*n+5] = 3*ei_l2;
    k[4*n+1] = -3*ei_l3;  k[4*n+4] = 3*ei_l3;   k[4*n+5] = -3*ei_l2;
    k[5*n+1] = 3*ei_l2;   k[5*n+4] = -3*ei_l2;  k[5*n+5] = 3*ei_l;
  } else if (!hingeStart && hingeEnd) {
    k[1*n+1] = 3*ei_l3;   k[1*n+2] = 3*ei_l2;   k[1*n+4] = -3*ei_l3;
    k[2*n+1] = 3*ei_l2;   k[2*n+2] = 3*ei_l;    k[2*n+4] = -3*ei_l2;
    k[4*n+1] = -3*ei_l3;  k[4*n+2] = -3*ei_l2;  k[4*n+4] = 3*ei_l3;
  }

  return k;
}

function frameTransformationMatrix(cos: number, sin: number): Float64Array {
  const t = new Float64Array(36);
  t[0*6+0] = cos;  t[0*6+1] = sin;
  t[1*6+0] = -sin; t[1*6+1] = cos;
  t[2*6+2] = 1;
  t[3*6+3] = cos;  t[3*6+4] = sin;
  t[4*6+3] = -sin; t[4*6+4] = cos;
  t[5*6+5] = 1;
  return t;
}

function transformMatrix(kLocal: Float64Array, t: Float64Array, n: number): Float64Array {
  const temp = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) sum += kLocal[i * n + k] * t[k * n + j];
      temp[i * n + j] = sum;
    }
  const kGlobal = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) sum += t[k * n + i] * temp[k * n + j];
      kGlobal[i * n + j] = sum;
    }
  return kGlobal;
}

function trapezoidalFixedEndForces(qI: number, qJ: number, l: number): [number, number, number, number] {
  const vu = qI * l / 2;
  const mu = qI * l * l / 12;
  const dq = qJ - qI;
  const vti = 3 * dq * l / 20;
  const mti = dq * l * l / 30;
  const vtj = 7 * dq * l / 20;
  const mtj = -dq * l * l / 20;
  return [vu + vti, mu + mti, vu + vtj, -mu + mtj];
}

function pointFixedEndForces(p: number, a: number, l: number): [number, number, number, number] {
  const b = l - a;
  const vi = p * b * b * (3 * a + b) / (l * l * l);
  const mi = p * a * b * b / (l * l);
  const vj = p * a * a * (a + 3 * b) / (l * l * l);
  const mj = -p * a * a * b / (l * l);
  return [vi, mi, vj, mj];
}

/** Adjust FEF for hinges using static condensation (same as solver-js) */
function adjustFEFForHinges(
  vi: number, mi: number, vj: number, mj: number,
  L: number, hingeStart: boolean, hingeEnd: boolean,
): [number, number, number, number] {
  if (!hingeStart && !hingeEnd) return [vi, mi, vj, mj];
  if (hingeStart && hingeEnd) return [vi - (mi + mj) / L, 0, vj + (mi + mj) / L, 0];
  if (hingeStart) return [vi - (3 / (2 * L)) * mi, 0, vj + (3 / (2 * L)) * mi, mj - 0.5 * mi];
  return [vi - (3 / (2 * L)) * mj, mi - 0.5 * mj, vj + (3 / (2 * L)) * mj, 0];
}

function solveLU(A: Float64Array, b: Float64Array, n: number): Float64Array {
  const a = new Float64Array(A);
  const bw = new Float64Array(b);

  // Relative singularity tolerance (same as solver-js.ts)
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
    if (maxVal < singularityTol) throw new Error(t('detailed.singularMatrix'));
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
  if (Math.abs(a[(n - 1) * n + (n - 1)]) < singularityTol) throw new Error(t('detailed.singularHypostatic'));
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = bw[i];
    for (let j = i + 1; j < n; j++) sum -= a[i * n + j] * x[j];
    x[i] = sum / a[i * n + i];
  }
  return x;
}

// ─── Utility ────────────────────────────────────────────────────

function float64ToMatrix(arr: Float64Array | number[], rows: number, cols: number): number[][] {
  const m: number[][] = [];
  for (let i = 0; i < rows; i++) {
    const row: number[] = [];
    for (let j = 0; j < cols; j++) row.push(arr[i * cols + j]);
    m.push(row);
  }
  return m;
}

function dofLabel(nodeId: number, localDof: number, dofsPerNode: number): string {
  const labels = dofsPerNode === 3 ? ['u', 'v', 'θ'] : ['u', 'v'];
  return `${labels[localDof]}${nodeId}`;
}

// ─── Main detailed solver ───────────────────────────────────────

export function solveDetailed(input: SolverInput): DSMStepData {
  // ─── Step 1: DOF Numbering ────────────────────────────────────
  const hasFrames = Array.from(input.elements.values()).some(e => e.type === 'frame');
  const dofsPerNode = hasFrames ? 3 : 2;
  const nodeOrder = Array.from(input.nodes.keys()).sort((a, b) => a - b);

  const dofMap = new Map<string, number>();
  let freeDofIdx = 0;
  const restrainedDofs: [number, number][] = [];

  const supportByNode = new Map<number, SolverSupport>();
  for (const sup of input.supports.values()) supportByNode.set(sup.nodeId, sup);

  for (const nodeId of nodeOrder) {
    const sup = supportByNode.get(nodeId);
    for (let ld = 0; ld < dofsPerNode; ld++) {
      const isRestrained = sup ? isDofRestrained(sup, ld) : false;
      if (isRestrained) restrainedDofs.push([nodeId, ld]);
      else dofMap.set(dofKey(nodeId, ld), freeDofIdx++);
    }
  }
  const nFree = freeDofIdx;
  for (const [nodeId, ld] of restrainedDofs) dofMap.set(dofKey(nodeId, ld), freeDofIdx++);
  const nTotal = freeDofIdx;

  // Build DOF info array
  const dofsInfo: DofInfo[] = [];
  const allDofLabels: string[] = new Array(nTotal);
  for (const [key, idx] of dofMap) {
    const [nid, ld] = key.split(':').map(Number);
    const lbl = dofLabel(nid, ld, dofsPerNode);
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
    const l = nodeDistance(nodeI, nodeJ);
    const angle = nodeAngle(nodeI, nodeJ);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const eKnM2 = mat.e * 1000;

    if (elem.type === 'frame') {
      const kLocal = frameLocalStiffness(eKnM2, sec.a, sec.iz, l, elem.hingeStart, elem.hingeEnd);
      const t = frameTransformationMatrix(cos, sin);
      const kGlobal = transformMatrix(kLocal, t, 6);
      const dofs = elementDofs(elem.nodeI, elem.nodeJ);
      const dLabels = dofs.map(d => allDofLabels[d]);

      elementsData.push({
        elementId: elem.id, nodeI: elem.nodeI, nodeJ: elem.nodeJ, type: 'frame',
        length: l, angle, E: eKnM2, A: sec.a, Iz: sec.iz,
        kLocal: float64ToMatrix(kLocal, 6, 6),
        T: float64ToMatrix(t, 6, 6),
        kGlobal: float64ToMatrix(kGlobal, 6, 6),
        dofIndices: dofs, dofLabels: dLabels,
      });

      for (let i = 0; i < dofs.length; i++) {
        for (let j = 0; j < dofs.length; j++) {
          const gi = dofs[i], gj = dofs[j];
          K[gi * nTotal + gj] += kGlobal[i * 6 + j];
          const key = `${gi},${gj}`;
          const existing = kContributions.get(key);
          if (existing) existing.push(elem.id);
          else kContributions.set(key, [elem.id]);
        }
      }
    } else {
      // Truss
      const k = eKnM2 * sec.a / l;
      const c2 = cos * cos, s2 = sin * sin, cs = cos * sin;
      const kG = [k*c2, k*cs, -k*c2, -k*cs, k*cs, k*s2, -k*cs, -k*s2,
                   -k*c2, -k*cs, k*c2, k*cs, -k*cs, -k*s2, k*cs, k*s2];
      // Local truss stiffness (2×2 in local, but show as 4×4 conceptually)
      const kLocalArr = [k, -k, -k, k]; // EA/L * [1 -1; -1 1]
      // Build a 4×4 T for display (truss = 2D rotation for 2 nodes × 2 DOFs)
      const tArr = [cos, sin, 0, 0, -sin, cos, 0, 0, 0, 0, cos, sin, 0, 0, -sin, cos];

      const diI = globalDof(elem.nodeI, 0)!;
      const djI = globalDof(elem.nodeI, 1)!;
      const diJ = globalDof(elem.nodeJ, 0)!;
      const djJ = globalDof(elem.nodeJ, 1)!;
      const dofs = [diI, djI, diJ, djJ];
      const dLabels = dofs.map(d => allDofLabels[d]);

      elementsData.push({
        elementId: elem.id, nodeI: elem.nodeI, nodeJ: elem.nodeJ, type: 'truss',
        length: l, angle, E: eKnM2, A: sec.a, Iz: 0,
        kLocal: float64ToMatrix(kLocalArr, 2, 2),
        T: float64ToMatrix(tArr, 4, 4),
        kGlobal: float64ToMatrix(kG, 4, 4),
        dofIndices: dofs, dofLabels: dLabels,
      });

      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          K[dofs[i] * nTotal + dofs[j]] += kG[i * 4 + j];
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
    if (sup.type === 'spring') {
      if (sup.kx && sup.kx > 0) { const i = globalDof(sup.nodeId, 0); if (i !== undefined) K[i * nTotal + i] += sup.kx; }
      if (sup.ky && sup.ky > 0) { const i = globalDof(sup.nodeId, 1); if (i !== undefined) K[i * nTotal + i] += sup.ky; }
      if (sup.kz && sup.kz > 0 && dofsPerNode >= 3) { const i = globalDof(sup.nodeId, 2); if (i !== undefined) K[i * nTotal + i] += sup.kz; }
    }
  }

  // Fictitious rotational springs at all-hinged nodes (same logic as solver-js.ts)
  if (dofsPerNode >= 3) {
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
      if (sup.type === 'fixed') rotRestrainedNodes.add(sup.nodeId);
      if (sup.type === 'spring' && sup.kz && sup.kz > 0) rotRestrainedNodes.add(sup.nodeId);
    }
    for (const [nodeId, hinges] of nodeHingeCount) {
      const frames = nodeFrameCount.get(nodeId) ?? 0;
      if (hinges >= frames && frames >= 1 && !rotRestrainedNodes.has(nodeId)) {
        const idx = globalDof(nodeId, 2);
        if (idx !== undefined && idx < nFree) K[idx * nTotal + idx] += artificialK;
      }
    }
  }

  // ─── Step 5: Load vector ──────────────────────────────────────
  const loadContributions: LoadContribution[] = [];

  for (const load of input.loads) {
    if (load.type === 'nodal') {
      const { nodeId, fx, fy, mz } = load.data;
      const addLC = (ld: number, val: number, desc: string) => {
        if (Math.abs(val) < 1e-15) return;
        const idx = globalDof(nodeId, ld);
        if (idx !== undefined) {
          F[idx] += val;
          loadContributions.push({ dofIndex: idx, dofLabel: allDofLabels[idx], source: desc, value: val });
        }
      };
      addLC(0, fx, `Fx nodal en nodo ${nodeId}`);
      addLC(1, fy, `Fy nodal en nodo ${nodeId}`);
      if (dofsPerNode >= 3) addLC(2, mz, `Mz nodal en nodo ${nodeId}`);

    } else if (load.type === 'distributed') {
      const dLoad = load.data;
      const elem = input.elements.get(dLoad.elementId);
      if (!elem) continue;
      const nI = input.nodes.get(elem.nodeI)!;
      const nJ = input.nodes.get(elem.nodeJ)!;
      const l = nodeDistance(nI, nJ);
      const ang = nodeAngle(nI, nJ);
      const c = Math.cos(ang), s = Math.sin(ang);
      const [vi0, mi0, vj0, mj0] = trapezoidalFixedEndForces(dLoad.qI, dLoad.qJ, l);
      const [vi, mi, vj, mj] = adjustFEFForHinges(vi0, mi0, vj0, mj0, l, elem.hingeStart, elem.hingeEnd);
      const desc = `Carga distrib. elem ${elem.id}`;
      const addLC = (nodeId: number, ld: number, val: number, d: string) => {
        if (Math.abs(val) < 1e-15) return;
        const idx = globalDof(nodeId, ld);
        if (idx !== undefined) {
          F[idx] += val;
          loadContributions.push({ dofIndex: idx, dofLabel: allDofLabels[idx], source: d, value: val });
        }
      };
      addLC(elem.nodeI, 0, -vi * s, `${desc}, nodo I Fx`);
      addLC(elem.nodeI, 1, vi * c, `${desc}, nodo I Fy`);
      addLC(elem.nodeI, 2, mi, `${desc}, nodo I Mz`);
      addLC(elem.nodeJ, 0, -vj * s, `${desc}, nodo J Fx`);
      addLC(elem.nodeJ, 1, vj * c, `${desc}, nodo J Fy`);
      addLC(elem.nodeJ, 2, mj, `${desc}, nodo J Mz`);

    } else if (load.type === 'pointOnElement') {
      const pLoad = load.data as SolverPointLoadOnElement;
      const elem = input.elements.get(pLoad.elementId);
      if (!elem) continue;
      const nI = input.nodes.get(elem.nodeI)!;
      const nJ = input.nodes.get(elem.nodeJ)!;
      const l = nodeDistance(nI, nJ);
      const ang = nodeAngle(nI, nJ);
      const c = Math.cos(ang), s = Math.sin(ang);
      const [vi0, mi0, vj0, mj0] = pointFixedEndForces(pLoad.p, pLoad.a, l);
      const [vi, mi, vj, mj] = adjustFEFForHinges(vi0, mi0, vj0, mj0, l, elem.hingeStart, elem.hingeEnd);
      const desc = `Carga puntual elem ${elem.id}`;
      const addLC = (nodeId: number, ld: number, val: number, d: string) => {
        if (Math.abs(val) < 1e-15) return;
        const idx = globalDof(nodeId, ld);
        if (idx !== undefined) {
          F[idx] += val;
          loadContributions.push({ dofIndex: idx, dofLabel: allDofLabels[idx], source: d, value: val });
        }
      };
      addLC(elem.nodeI, 0, -vi * s, `${desc}, nodo I Fx`);
      addLC(elem.nodeI, 1, vi * c, `${desc}, nodo I Fy`);
      addLC(elem.nodeI, 2, mi, `${desc}, nodo I Mz`);
      addLC(elem.nodeJ, 0, -vj * s, `${desc}, nodo J Fx`);
      addLC(elem.nodeJ, 1, vj * c, `${desc}, nodo J Fy`);
      addLC(elem.nodeJ, 2, mj, `${desc}, nodo J Mz`);

    } else if (load.type === 'thermal') {
      const tLoad = load.data as SolverThermalLoad;
      const elem = input.elements.get(tLoad.elementId);
      if (!elem) continue;
      const nI = input.nodes.get(elem.nodeI)!;
      const nJ = input.nodes.get(elem.nodeJ)!;
      const mat = input.materials.get(elem.materialId)!;
      const sec = input.sections.get(elem.sectionId)!;
      const ang = nodeAngle(nI, nJ);
      const c = Math.cos(ang), s = Math.sin(ang);
      const eKn = mat.e * 1000;
      const alpha = 1.2e-5;
      const desc = t('detailed.thermalLoadDesc').replace('{id}', String(elem.id));
      const addLC = (nodeId: number, ld: number, val: number, d: string) => {
        if (Math.abs(val) < 1e-15) return;
        const idx = globalDof(nodeId, ld);
        if (idx !== undefined) {
          F[idx] += val;
          loadContributions.push({ dofIndex: idx, dofLabel: allDofLabels[idx], source: d, value: val });
        }
      };
      if (Math.abs(tLoad.dtUniform) > 1e-10) {
        const nTherm = eKn * sec.a * alpha * tLoad.dtUniform;
        addLC(elem.nodeI, 0, nTherm * c, `${desc} ΔT, nodo I Fx`);
        addLC(elem.nodeI, 1, nTherm * s, `${desc} ΔT, nodo I Fy`);
        addLC(elem.nodeJ, 0, -nTherm * c, `${desc} ΔT, nodo J Fx`);
        addLC(elem.nodeJ, 1, -nTherm * s, `${desc} ΔT, nodo J Fy`);
      }
      if (Math.abs(tLoad.dtGradient) > 1e-10 && elem.type === 'frame') {
        const h = Math.sqrt(12 * sec.iz / sec.a);
        const mTherm = eKn * sec.iz * alpha * tLoad.dtGradient / h;
        addLC(elem.nodeI, 2, mTherm, `${desc} ΔTg, nodo I Mz`);
        addLC(elem.nodeJ, 2, -mTherm, `${desc} ΔTg, nodo J Mz`);
      }
    }
  }

  // ─── Step 6: Partitioning ─────────────────────────────────────
  const nRestr = nTotal - nFree;
  const uR = new Float64Array(nRestr);

  for (const sup of input.supports.values()) {
    if (sup.type === 'spring') continue;
    const pDofs: [number, number | undefined][] = [];
    if (isDofRestrained(sup, 0)) pDofs.push([0, sup.dx]);
    if (isDofRestrained(sup, 1)) pDofs.push([1, sup.dy]);
    if (dofsPerNode >= 3 && isDofRestrained(sup, 2)) pDofs.push([2, sup.drz]);
    for (const [ld, value] of pDofs) {
      if (value !== undefined && value !== 0) {
        const gIdx = globalDof(sup.nodeId, ld);
        if (gIdx !== undefined && gIdx >= nFree) uR[gIdx - nFree] = value;
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

  // F_mod = Ff - Kfr · uR
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
    const l = nodeDistance(nodeI, nodeJ);
    const ang = nodeAngle(nodeI, nodeJ);
    const c = Math.cos(ang), s = Math.sin(ang);
    const eKn = mat.e * 1000;

    // Collect loads on element
    let qI = 0, qJ = 0;
    const pLoads: { a: number; p: number }[] = [];
    let dtU = 0, dtG = 0;
    for (const load of input.loads) {
      if (load.type === 'distributed' && load.data.elementId === elem.id) { qI = load.data.qI; qJ = load.data.qJ; }
      else if (load.type === 'pointOnElement' && (load.data as SolverPointLoadOnElement).elementId === elem.id) {
        const pl = load.data as SolverPointLoadOnElement; pLoads.push({ a: pl.a, p: pl.p });
      }
      else if (load.type === 'thermal' && (load.data as SolverThermalLoad).elementId === elem.id) {
        const tl = load.data as SolverThermalLoad; dtU += tl.dtUniform; dtG += tl.dtGradient;
      }
    }

    if (elem.type === 'frame') {
      const uGlob = new Float64Array(6);
      for (let d = 0; d < 3; d++) {
        const iI = globalDof(elem.nodeI, d); uGlob[d] = iI !== undefined ? uAll[iI] : 0;
        const iJ = globalDof(elem.nodeJ, d); uGlob[3 + d] = iJ !== undefined ? uAll[iJ] : 0;
      }
      const t = frameTransformationMatrix(c, s);
      const uLoc = new Float64Array(6);
      for (let i = 0; i < 6; i++) { let sum = 0; for (let j = 0; j < 6; j++) sum += t[i * 6 + j] * uGlob[j]; uLoc[i] = sum; }

      const kL = frameLocalStiffness(eKn, sec.a, sec.iz, l, elem.hingeStart, elem.hingeEnd);
      const fRaw = new Float64Array(6);
      for (let i = 0; i < 6; i++) { let sum = 0; for (let j = 0; j < 6; j++) sum += kL[i * 6 + j] * uLoc[j]; fRaw[i] = sum; }

      const fef = new Float64Array(6);
      if (Math.abs(qI) > 1e-10 || Math.abs(qJ) > 1e-10) {
        const [vi0, mi0, vj0, mj0] = trapezoidalFixedEndForces(qI, qJ, l);
        const [vi, mi, vj, mj] = adjustFEFForHinges(vi0, mi0, vj0, mj0, l, elem.hingeStart, elem.hingeEnd);
        fef[1] = vi; fef[2] = mi; fef[4] = vj; fef[5] = mj;
      }
      for (const pl of pLoads) {
        const [vi0, mi0, vj0, mj0] = pointFixedEndForces(pl.p, pl.a, l);
        const [vi, mi, vj, mj] = adjustFEFForHinges(vi0, mi0, vj0, mj0, l, elem.hingeStart, elem.hingeEnd);
        fef[1] += vi; fef[2] += mi; fef[4] += vj; fef[5] += mj;
      }
      const alpha = 1.2e-5;
      if (Math.abs(dtU) > 1e-10) {
        const nTh = eKn * sec.a * alpha * dtU;
        fef[0] += nTh; fef[3] += -nTh;
      }
      if (Math.abs(dtG) > 1e-10) {
        const h = Math.sqrt(12 * sec.iz / sec.a);
        const mTh = eKn * sec.iz * alpha * dtG / h;
        const [, miTh, , mjTh] = adjustFEFForHinges(0, mTh, 0, -mTh, l, elem.hingeStart, elem.hingeEnd);
        fef[2] += miTh; fef[5] += mjTh;
      }

      const fFinal = new Float64Array(6);
      for (let i = 0; i < 6; i++) fFinal[i] = fRaw[i] - fef[i];

      elementForcesSteps.push({
        elementId: elem.id,
        uGlobal: Array.from(uGlob), uLocal: Array.from(uLoc),
        fLocalRaw: Array.from(fRaw), fixedEndForces: Array.from(fef),
        fLocalFinal: Array.from(fFinal),
      });
    } else {
      // Truss — 4-component arrays [N_i, V_i, N_j, V_j] for consistency with UI
      const uiX = globalDof(elem.nodeI, 0); const uiY = globalDof(elem.nodeI, 1);
      const ujX = globalDof(elem.nodeJ, 0); const ujY = globalDof(elem.nodeJ, 1);
      const uGlob = [
        uiX !== undefined ? uAll[uiX] : 0, uiY !== undefined ? uAll[uiY] : 0,
        ujX !== undefined ? uAll[ujX] : 0, ujY !== undefined ? uAll[ujY] : 0,
      ];
      // Local displacements: project global onto element axis
      const uLocI = uGlob[0] * c + uGlob[1] * s;   // axial at i
      const vLocI = -uGlob[0] * s + uGlob[1] * c;   // transverse at i
      const uLocJ = uGlob[2] * c + uGlob[3] * s;    // axial at j
      const vLocJ = -uGlob[2] * s + uGlob[3] * c;   // transverse at j
      const delta = uLocJ - uLocI;
      const N = eKn * sec.a * delta / l;
      const fef0 = Math.abs(dtU) > 1e-10 ? eKn * sec.a * 1.2e-5 * dtU : 0;

      elementForcesSteps.push({
        elementId: elem.id,
        uGlobal: uGlob,
        uLocal: [uLocI, vLocI, uLocJ, vLocJ],
        fLocalRaw: [-N, 0, N, 0],
        fixedEndForces: [fef0, 0, -fef0, 0],
        fLocalFinal: [-(N - fef0), 0, N - fef0, 0],
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
