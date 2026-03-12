// P-Delta (second-order) iterative analysis for 3D structures
//
// Uses the existing 3D solver as a building block — does NOT modify solver-3d.ts.
// Algorithm:
//   1. Assemble K and F via assemble3D
//   2. Linear solve → baseline displacements and element forces
//   3. Extract axial forces N from each element
//   4. Build 12×12 (frame) or 6×6 (truss) geometric stiffness Kg per element
//   5. Assemble global Kg, extract Kg_ff
//   6. Solve (Kff + Kg_ff) · u = Ff iteratively until convergence
//   7. Return amplified results with B2 factor

import type {
  SolverInput3D,
  AnalysisResults3D,
  Displacement3D,
  Reaction3D,
  ElementForces3D,
} from './types-3d';
import type { SolverDiagnostic } from './types';
import {
  assemble3D,
  buildDofNumbering3D,
  computeInternalForces3D,
  computeLocalAxes3D,
  frameTransformationMatrix3D,
  trussTransformationMatrix3D,
  globalDof3D,
  isDofRestrained3D,
} from './solver-3d';
import type { DofNumbering3D } from './solver-3d';
import { choleskySolve } from './matrix-utils';
import { t } from '../i18n';

// ─── Public interface ────────────────────────────────────────────

export interface PDeltaResult3D {
  results: AnalysisResults3D;
  iterations: number;
  converged: boolean;
  isStable: boolean;
  /** Global amplification factor B₂ = max(|u_pdelta|/|u_linear|) across all nodes.
   *  B₂ > 1 means P-Delta amplifies displacements. Typical range: 1.0–1.5.
   *  B₂ > 2.5 suggests the structure is close to instability. */
  b2Factor: number;
  /** Per-node amplification: ratio of P-Delta displacement to linear displacement */
  amplification: Array<{ nodeId: number; ratio: number }>;
  /** Linear analysis results for comparison */
  linearResults: AnalysisResults3D;
  diagnostics?: SolverDiagnostic[];
}

export interface PDeltaConfig3D {
  /** Maximum iterations (default 20) */
  maxIterations?: number;
  /** Convergence tolerance: ‖Δu‖/‖u‖ (default 1e-4) */
  tolerance?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────

/** Get displacement value for a given node/DOF from the full displacement vector */
function getDisp3D(dofNum: DofNumbering3D, u: Float64Array, nodeId: number, localDof: number): number {
  if (localDof >= dofNum.dofsPerNode) return 0;
  const idx = globalDof3D(dofNum, nodeId, localDof);
  return idx !== undefined ? (u[idx] ?? 0) : 0;
}

/** Get the global DOF indices for a frame element (12 DOFs: 6 per node) */
function elementDofs(dofNum: DofNumbering3D, nodeI: number, nodeJ: number): number[] {
  const dofs: number[] = [];
  for (let d = 0; d < dofNum.dofsPerNode; d++) {
    const idx = globalDof3D(dofNum, nodeI, d);
    if (idx !== undefined) dofs.push(idx);
  }
  for (let d = 0; d < dofNum.dofsPerNode; d++) {
    const idx = globalDof3D(dofNum, nodeJ, d);
    if (idx !== undefined) dofs.push(idx);
  }
  return dofs;
}

/** Get the translational global DOF indices for a truss element (6 DOFs: 3 per node) */
function trussDofs(dofNum: DofNumbering3D, nodeI: number, nodeJ: number): number[] {
  const dofs: number[] = [];
  for (let d = 0; d < 3; d++) {
    const idx = globalDof3D(dofNum, nodeI, d);
    if (idx !== undefined) dofs.push(idx);
  }
  for (let d = 0; d < 3; d++) {
    const idx = globalDof3D(dofNum, nodeJ, d);
    if (idx !== undefined) dofs.push(idx);
  }
  return dofs;
}

/**
 * Build the 12×12 local geometric stiffness matrix for a 3D frame element.
 *
 * Local DOF order: [u1, v1, w1, θx1, θy1, θz1, u2, v2, w2, θx2, θy2, θz2]
 *
 * The matrix is (N/L) × coefficients, where N is the axial force (positive = tension).
 * Reference: McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", 2nd ed.
 */
function frameGeometricStiffness3D(N: number, L: number): Float64Array {
  const kg = new Float64Array(12 * 12);
  const c = N / L;
  const L2 = L * L;

  // Helper to set symmetric entry
  function set(i: number, j: number, val: number): void {
    kg[i * 12 + j] = val;
    kg[j * 12 + i] = val;
  }

  // Row/col indices: u=0, v=1, w=2, θx=3, θy=4, θz=5 (node I)
  //                  u=6, v=7, w=8, θx=9, θy=10, θz=11 (node J)

  // v1-v1 block
  set(1, 1, c * 6 / 5);
  // w1-w1 block
  set(2, 2, c * 6 / 5);

  // θy1-w1
  set(4, 2, c * (-L / 10));
  // θz1-v1
  set(5, 1, c * (L / 10));

  // θy1-θy1
  set(4, 4, c * 2 * L2 / 15);
  // θz1-θz1
  set(5, 5, c * 2 * L2 / 15);

  // v2-v1
  set(7, 1, c * (-6 / 5));
  // w2-w1
  set(8, 2, c * (-6 / 5));

  // v2-θz1
  set(7, 5, c * (-L / 10));
  // w2-θy1
  set(8, 4, c * (L / 10));

  // v2-v2
  set(7, 7, c * 6 / 5);
  // w2-w2
  set(8, 8, c * 6 / 5);

  // θy2-w1
  set(10, 2, c * (-L / 10));
  // θz2-v1
  set(11, 1, c * (L / 10));

  // θy2-θy1
  set(10, 4, c * (-L2 / 30));
  // θz2-θz1
  set(11, 5, c * (-L2 / 30));

  // θy2-w2
  set(10, 8, c * (L / 10));
  // θz2-v2
  set(11, 7, c * (-L / 10));

  // θy2-θy2
  set(10, 10, c * 2 * L2 / 15);
  // θz2-θz2
  set(11, 11, c * 2 * L2 / 15);

  return kg;
}

/**
 * Build the 6×6 local geometric stiffness matrix for a 3D truss element.
 *
 * Local DOF order: [u1, v1, w1, u2, v2, w2]
 *
 * For a truss, only the transverse DOFs get geometric stiffness.
 * Same structure as frame but only translational DOFs.
 */
function trussGeometricStiffness3D(N: number, L: number): Float64Array {
  const kg = new Float64Array(6 * 6);
  const c = N / L;

  // v1-v1, w1-w1
  kg[1 * 6 + 1] = c;
  kg[2 * 6 + 2] = c;

  // v2-v1, w2-w1 (off-diagonal)
  kg[4 * 6 + 1] = -c;
  kg[1 * 6 + 4] = -c;
  kg[5 * 6 + 2] = -c;
  kg[2 * 6 + 5] = -c;

  // v2-v2, w2-w2
  kg[4 * 6 + 4] = c;
  kg[5 * 6 + 5] = c;

  return kg;
}

/**
 * Transform a local matrix to global coordinates: Kg_global = T^T · Kg_local · T
 */
function transformToGlobal(kLocal: Float64Array, T: Float64Array, n: number): Float64Array {
  // temp = Kg_local · T
  const temp = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += kLocal[i * n + k] * T[k * n + j];
      }
      temp[i * n + j] = sum;
    }
  }
  // Kg_global = T^T · temp
  const kGlobal = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += T[k * n + i] * temp[k * n + j];
      }
      kGlobal[i * n + j] = sum;
    }
  }
  return kGlobal;
}

/**
 * Assemble the global geometric stiffness matrix (free-free partition only)
 * from element axial forces.
 */
function assembleKg3D(
  input: SolverInput3D,
  dofNum: DofNumbering3D,
  forces: ElementForces3D[],
): Float64Array {
  const nf = dofNum.nFree;
  const Kg = new Float64Array(nf * nf);

  // Build a lookup from elementId → ElementForces3D
  const forceMap = new Map<number, ElementForces3D>();
  for (const ef of forces) {
    forceMap.set(ef.elementId, ef);
  }

  for (const elem of input.elements.values()) {
    const ef = forceMap.get(elem.id);
    if (!ef) continue;

    // Average axial force (negative = compression for P-Delta)
    const N = (ef.nStart + ef.nEnd) / 2;

    const nodeI = input.nodes.get(elem.nodeI)!;
    const nodeJ = input.nodes.get(elem.nodeJ)!;

    const localY = (elem.localYx !== undefined && elem.localYy !== undefined && elem.localYz !== undefined)
      ? { x: elem.localYx, y: elem.localYy, z: elem.localYz }
      : undefined;
    const axes = computeLocalAxes3D(nodeI, nodeJ, localY, elem.rollAngle);
    const L = axes.L;

    if (elem.type === 'frame') {
      const kgLocal = frameGeometricStiffness3D(N, L);
      const T = frameTransformationMatrix3D(axes.ex, axes.ey, axes.ez);
      const kgGlobal = transformToGlobal(kgLocal, T, 12);

      const dofs = elementDofs(dofNum, elem.nodeI, elem.nodeJ);
      for (let i = 0; i < dofs.length; i++) {
        if (dofs[i] >= nf) continue; // skip restrained DOFs
        for (let j = 0; j < dofs.length; j++) {
          if (dofs[j] >= nf) continue;
          Kg[dofs[i] * nf + dofs[j]] += kgGlobal[i * 12 + j];
        }
      }
    } else {
      // Truss
      const kgLocal = trussGeometricStiffness3D(N, L);
      const T = trussTransformationMatrix3D(axes.ex, axes.ey, axes.ez);
      const kgGlobal = transformToGlobal(kgLocal, T, 6);

      const dofs = trussDofs(dofNum, elem.nodeI, elem.nodeJ);
      for (let i = 0; i < dofs.length; i++) {
        if (dofs[i] >= nf) continue;
        for (let j = 0; j < dofs.length; j++) {
          if (dofs[j] >= nf) continue;
          Kg[dofs[i] * nf + dofs[j]] += kgGlobal[i * 6 + j];
        }
      }
    }
  }

  return Kg;
}

// ─── Build results ───────────────────────────────────────────────

/** Build AnalysisResults3D from a full displacement vector (same logic as solve3D) */
function buildResults3D(
  input: SolverInput3D,
  dofNum: DofNumbering3D,
  K: Float64Array,
  F: Float64Array,
  uAll: Float64Array,
): AnalysisResults3D {
  const nf = dofNum.nFree;
  const nt = dofNum.nTotal;

  // Displacements
  const displacements: Displacement3D[] = [];
  for (const nodeId of dofNum.nodeOrder) {
    displacements.push({
      nodeId,
      ux: getDisp3D(dofNum, uAll, nodeId, 0),
      uy: getDisp3D(dofNum, uAll, nodeId, 1),
      uz: getDisp3D(dofNum, uAll, nodeId, 2),
      rx: getDisp3D(dofNum, uAll, nodeId, 3),
      ry: getDisp3D(dofNum, uAll, nodeId, 4),
      rz: getDisp3D(dofNum, uAll, nodeId, 5),
    });
  }

  // Reactions: R = K_row · uAll - F_row for restrained DOFs
  const reactions: Reaction3D[] = [];
  for (const sup of input.supports.values()) {
    let fx = 0, fy = 0, fz = 0, mx = 0, my = 0, mz = 0;
    const dofVals = [0, 0, 0, 0, 0, 0]; // fx, fy, fz, mx, my, mz

    for (let d = 0; d < dofNum.dofsPerNode; d++) {
      const gIdx = globalDof3D(dofNum, sup.nodeId, d);
      if (gIdx === undefined || gIdx < nf) continue; // only restrained DOFs

      let reaction = -F[gIdx];
      for (let j = 0; j < nt; j++) {
        reaction += K[gIdx * nt + j] * uAll[j];
      }
      dofVals[d] = reaction;
    }

    // Also compute spring reactions for spring DOFs (which are free DOFs)
    const springs = [sup.kx, sup.ky, sup.kz, sup.krx, sup.kry, sup.krz];
    for (let d = 0; d < dofNum.dofsPerNode; d++) {
      const kVal = springs[d];
      if (kVal !== undefined && kVal > 0) {
        const gIdx = globalDof3D(dofNum, sup.nodeId, d);
        if (gIdx !== undefined && gIdx < nf) {
          dofVals[d] = kVal * uAll[gIdx];
        }
      }
    }

    fx = dofVals[0]; fy = dofVals[1]; fz = dofVals[2];
    mx = dofVals[3]; my = dofVals[4]; mz = dofVals[5];

    reactions.push({ nodeId: sup.nodeId, fx, fy, fz, mx, my, mz });
  }

  // Element forces
  const elementForces = computeInternalForces3D(input, dofNum, uAll);

  return { displacements, reactions, elementForces };
}

// ─── Main entry point ────────────────────────────────────────────

/**
 * P-Delta iterative analysis for 3D structures.
 *
 * 1. Assemble global K and F
 * 2. Linear solve → baseline displacements and element forces
 * 3. Build Kg from axial forces, assemble into free-free partition
 * 4. Solve (Kff + Kg_ff) · u = Ff iteratively until convergence
 * 5. Return amplified results with B2 factor
 *
 * Returns a string error message on failure.
 */
export function solvePDelta3D(
  input: SolverInput3D,
  config?: PDeltaConfig3D,
): PDeltaResult3D | string {
  try {
    return solvePDelta3DInternal(input, config);
  } catch (e: unknown) {
    return e instanceof Error ? e.message : String(e);
  }
}

function solvePDelta3DInternal(
  input: SolverInput3D,
  config?: PDeltaConfig3D,
): PDeltaResult3D {
  const maxIter = config?.maxIterations ?? 20;
  const tol = config?.tolerance ?? 1e-4;

  // Build DOF numbering
  const dofNum = buildDofNumbering3D(input);
  const nf = dofNum.nFree;
  const nt = dofNum.nTotal;

  if (nf === 0) {
    throw new Error(t('pdelta.noFreeDofs'));
  }

  // Assemble base stiffness and force vector
  const { K, F } = assemble3D(input, dofNum);

  // Extract Kff (free-free partition)
  const Kff = new Float64Array(nf * nf);
  for (let i = 0; i < nf; i++) {
    for (let j = 0; j < nf; j++) {
      Kff[i * nf + j] = K[i * nt + j];
    }
  }

  // Extract Ff, adjusted for prescribed displacements: Ff = F_f - K_fr · u_r
  const nRestr = nt - nf;
  const uR = new Float64Array(nRestr);
  for (const sup of input.supports.values()) {
    const prescribedVals = [sup.dx, sup.dy, sup.dz, sup.drx, sup.dry, sup.drz];
    for (let d = 0; d < dofNum.dofsPerNode; d++) {
      if (!isDofRestrained3D(sup, d)) continue;
      const val = prescribedVals[d];
      if (val !== undefined && val !== 0) {
        const gIdx = globalDof3D(dofNum, sup.nodeId, d);
        if (gIdx !== undefined && gIdx >= nf) {
          uR[gIdx - nf] = val;
        }
      }
    }
  }

  const Ff = new Float64Array(nf);
  for (let i = 0; i < nf; i++) {
    Ff[i] = F[i];
    for (let j = 0; j < nRestr; j++) {
      Ff[i] -= K[i * nt + (nf + j)] * uR[j];
    }
  }

  // Initial linear solve
  let uFree = choleskySolve(new Float64Array(Kff), new Float64Array(Ff), nf);
  if (!uFree) {
    throw new Error(t('pdelta.linearSolveError'));
  }

  // Save linear solution for B₂ computation
  const uLinearFree = new Float64Array(uFree);

  // Build full displacement vector helper
  function buildFullU(uf: Float64Array): Float64Array {
    const uAll = new Float64Array(nt);
    for (let i = 0; i < nf; i++) uAll[i] = uf[i];
    for (let i = 0; i < nRestr; i++) uAll[nf + i] = uR[i];
    return uAll;
  }

  let converged = false;
  let iterations = 0;
  let isStable = true;
  let elementForces: ElementForces3D[] = [];

  for (let iter = 0; iter < maxIter; iter++) {
    iterations = iter + 1;

    // Compute internal forces from current displacements
    const uAll = buildFullU(uFree);
    elementForces = computeInternalForces3D(input, dofNum, uAll);

    // Assemble geometric stiffness (free-free partition)
    const Kg = assembleKg3D(input, dofNum, elementForces);

    // Modified stiffness: Kmod = Kff + Kg
    const Kmod = new Float64Array(nf * nf);
    for (let i = 0; i < nf * nf; i++) {
      Kmod[i] = Kff[i] + Kg[i];
    }

    // Solve modified system
    const uNew = choleskySolve(new Float64Array(Kmod), new Float64Array(Ff), nf);
    if (!uNew) {
      // Cholesky failed — system is no longer positive definite (instability)
      isStable = false;
      converged = false;
      break;
    }

    // Check for divergence
    let uNorm = 0;
    for (let i = 0; i < nf; i++) uNorm += uNew[i] * uNew[i];
    uNorm = Math.sqrt(uNorm);

    let uPrevNorm = 0;
    for (let i = 0; i < nf; i++) uPrevNorm += uFree[i] * uFree[i];
    uPrevNorm = Math.sqrt(uPrevNorm);

    if (uNorm > 10 * uPrevNorm && uPrevNorm > 1e-10) {
      isStable = false;
      converged = false;
      break;
    }

    // Check convergence: ‖Δu‖/‖u‖
    let duNorm = 0;
    for (let i = 0; i < nf; i++) {
      const du = uNew[i] - uFree[i];
      duNorm += du * du;
    }
    duNorm = Math.sqrt(duNorm);

    uFree = uNew;

    if (uNorm > 1e-15 && duNorm / uNorm < tol) {
      converged = true;
      // Final internal forces update
      const uAllFinal = buildFullU(uFree);
      elementForces = computeInternalForces3D(input, dofNum, uAllFinal);
      break;
    }
  }

  if (!converged && isStable) {
    // Didn't converge but didn't diverge — use last result
    const uAll = buildFullU(uFree);
    elementForces = computeInternalForces3D(input, dofNum, uAll);
  }

  // Build final P-Delta results
  const uAllFinal = buildFullU(uFree);
  const results = buildResults3D(input, dofNum, K, F, uAllFinal);

  // Build linear results for comparison
  const uAllLinear = buildFullU(uLinearFree);
  const linearResults = buildResults3D(input, dofNum, K, F, uAllLinear);

  // Compute per-node amplification and global B₂
  const amplification: Array<{ nodeId: number; ratio: number }> = [];
  let b2Factor = 1.0;

  for (const nodeId of dofNum.nodeOrder) {
    const pdDisp = results.displacements.find(d => d.nodeId === nodeId)!;
    const linDisp = linearResults.displacements.find(d => d.nodeId === nodeId)!;

    const pdMag = Math.sqrt(
      pdDisp.ux * pdDisp.ux + pdDisp.uy * pdDisp.uy + pdDisp.uz * pdDisp.uz,
    );
    const linMag = Math.sqrt(
      linDisp.ux * linDisp.ux + linDisp.uy * linDisp.uy + linDisp.uz * linDisp.uz,
    );

    const ratio = linMag > 1e-15 ? pdMag / linMag : 1.0;
    amplification.push({ nodeId, ratio });
    if (ratio > b2Factor) b2Factor = ratio;
  }

  const diags: SolverDiagnostic[] = [];
  if (!converged) {
    diags.push({ severity: 'error', code: 'PDELTA_NOT_CONVERGED', message: 'diag.pdeltaNotConverged', source: 'solver', details: { iterations, tolerance: config?.tolerance ?? 1e-4 } });
  }
  if (!isStable) {
    diags.push({ severity: 'error', code: 'PDELTA_UNSTABLE', message: 'diag.pdeltaUnstable', source: 'solver', details: { b2Factor } });
  }
  if (isStable && b2Factor > 1.5) {
    diags.push({ severity: 'warning', code: 'PDELTA_HIGH_B2', message: 'diag.pdeltaHighB2', source: 'solver', details: { b2Factor } });
  }

  return {
    results,
    iterations,
    converged,
    isStable,
    b2Factor,
    amplification,
    linearResults,
    diagnostics: diags.length > 0 ? diags : undefined,
  };
}
