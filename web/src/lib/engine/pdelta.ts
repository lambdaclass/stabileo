// P-Delta (second-order) iterative analysis

import type { SolverInput, AnalysisResults, ElementForces } from './types';
import {
  type DofNumbering,
  buildDofNumbering, assemble, solveLU, computeInternalForces,
} from './solver-js';
import { assembleKg } from './geometric-stiffness';
import { choleskySolve } from './matrix-utils';
import { t } from '../i18n';

export interface PDeltaConfig {
  /** Maximum iterations (default 20) */
  maxIter?: number;
  /** Convergence tolerance: ‖Δu‖/‖u‖ (default 1e-4) */
  tolerance?: number;
}

export interface PDeltaResult {
  results: AnalysisResults;
  iterations: number;
  converged: boolean;
  isStable: boolean;
  /** Global amplification factor B₂ = max(|u_pdelta|/|u_linear|) across all DOFs.
   *  B₂ > 1 means P-Delta amplifies displacements. Typical range: 1.0–1.5.
   *  B₂ > 2.5 suggests the structure is close to instability. */
  b2Factor: number;
  /** Per-node amplification: ratio of P-Delta displacement to linear displacement */
  amplification: Array<{ nodeId: number; ratio: number }>;
  /** Linear analysis results for comparison */
  linearResults: AnalysisResults;
}

/**
 * P-Delta iterative analysis.
 * 1. Linear solve → element forces (N)
 * 2. Build Kg from axial forces
 * 3. Solve (K + Kg)·u = F iteratively until convergence
 */
export function solvePDelta(
  input: SolverInput,
  config?: PDeltaConfig,
): PDeltaResult | string {
  const maxIter = config?.maxIter ?? 20;
  const tol = config?.tolerance ?? 1e-4;

  const dofNum = buildDofNumbering(input);
  const nf = dofNum.nFree;
  const nt = dofNum.nTotal;

  if (nf === 0) return t('pdelta.noFreeDofs');

  // Assemble base stiffness and force
  const { K, F } = assemble(input, dofNum);

  // Extract Kff (free-free partition)
  const Kff = new Float64Array(nf * nf);
  for (let i = 0; i < nf; i++) {
    for (let j = 0; j < nf; j++) {
      Kff[i * nf + j] = K[i * nt + j];
    }
  }

  // Extract Ff
  const Ff = new Float64Array(nf);
  for (let i = 0; i < nf; i++) Ff[i] = F[i];

  // Initial linear solve — Cholesky (faster for SPD) with LU fallback
  let uFree: Float64Array;
  try {
    uFree = choleskySolve(new Float64Array(Kff), new Float64Array(Ff), nf)
          ?? solveLU(new Float64Array(Kff), new Float64Array(Ff), nf);
  } catch {
    return t('pdelta.linearSolveError');
  }

  // Save linear solution for B₂ computation
  const uLinear = new Float64Array(uFree);

  let converged = false;
  let iterations = 0;
  let isStable = true;
  let elementForces: ElementForces[] = [];

  // Build full displacement vector
  function buildFullU(uf: Float64Array): Float64Array {
    const uAll = new Float64Array(nt);
    for (let i = 0; i < nf; i++) uAll[i] = uf[i];
    // Add prescribed displacements for restrained DOFs
    for (let i = nf; i < nt; i++) uAll[i] = F[i] !== undefined ? 0 : 0;
    return uAll;
  }

  for (let iter = 0; iter < maxIter; iter++) {
    iterations = iter + 1;

    // Compute internal forces from current displacement
    const uAll = buildFullU(uFree);
    elementForces = computeInternalForces(input, dofNum, uAll);

    // Assemble geometric stiffness from current axial forces
    const Kg = assembleKg(input, dofNum, elementForces);

    // Modified stiffness: Kmod = Kff + Kg
    const Kmod = new Float64Array(nf * nf);
    for (let i = 0; i < nf * nf; i++) {
      Kmod[i] = Kff[i] + Kg[i];
    }

    // Solve modified system — Cholesky with LU fallback
    let uNew: Float64Array;
    try {
      uNew = choleskySolve(new Float64Array(Kmod), new Float64Array(Ff), nf)
           ?? solveLU(Kmod, new Float64Array(Ff), nf);
    } catch {
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
      elementForces = computeInternalForces(input, dofNum, uAllFinal);
      break;
    }
  }

  if (!converged && isStable) {
    // Didn't converge but didn't diverge — use last result
    const uAll = buildFullU(uFree);
    elementForces = computeInternalForces(input, dofNum, uAll);
  }

  // Build final results (same format as regular solve)
  const uAll = buildFullU(uFree);

  // Displacements
  const displacements: AnalysisResults['displacements'] = [];
  for (const [nodeId] of input.nodes) {
    const ux = getDisp(dofNum, uAll, nodeId, 0);
    const uy = getDisp(dofNum, uAll, nodeId, 1);
    const rz = dofNum.dofsPerNode > 2 ? getDisp(dofNum, uAll, nodeId, 2) : 0;
    displacements.push({ nodeId, ux, uy, rz });
  }

  // Reactions: R = K_rf · u_f + K_rr · u_r - F_r
  const reactions: AnalysisResults['reactions'] = [];
  const nRestrained = nt - nf;
  for (let i = 0; i < nRestrained; i++) {
    let reaction = -F[nf + i];
    for (let j = 0; j < nt; j++) {
      reaction += K[(nf + i) * nt + j] * uAll[j];
    }
    // Map restrained DOF back to node and direction
    const rDofIdx = nf + i;
    for (const [key, idx] of dofNum.map) {
      if (idx === rDofIdx) {
        const [nodeIdStr, localDofStr] = key.split(':');
        const nodeId = parseInt(nodeIdStr);
        const localDof = parseInt(localDofStr);
        let existing = reactions.find(r => r.nodeId === nodeId);
        if (!existing) {
          existing = { nodeId, rx: 0, ry: 0, mz: 0 };
          reactions.push(existing);
        }
        if (localDof === 0) existing.rx = reaction;
        else if (localDof === 1) existing.ry = reaction;
        else if (localDof === 2) existing.mz = reaction;
      }
    }
  }

  // Build linear results for comparison
  const uLinearAll = buildFullU(uLinear);
  const linearEF = computeInternalForces(input, dofNum, uLinearAll);
  const linearDisp: AnalysisResults['displacements'] = [];
  for (const [nodeId] of input.nodes) {
    const ux = getDisp(dofNum, uLinearAll, nodeId, 0);
    const uy = getDisp(dofNum, uLinearAll, nodeId, 1);
    const rz = dofNum.dofsPerNode > 2 ? getDisp(dofNum, uLinearAll, nodeId, 2) : 0;
    linearDisp.push({ nodeId, ux, uy, rz });
  }
  const linearReactions: AnalysisResults['reactions'] = [];
  for (let i = 0; i < nRestrained; i++) {
    let reaction = -F[nf + i];
    for (let j = 0; j < nt; j++) {
      reaction += K[(nf + i) * nt + j] * uLinearAll[j];
    }
    const rDofIdx = nf + i;
    for (const [key, idx] of dofNum.map) {
      if (idx === rDofIdx) {
        const [nodeIdStr, localDofStr] = key.split(':');
        const nodeId = parseInt(nodeIdStr);
        const localDof = parseInt(localDofStr);
        let existing = linearReactions.find(r => r.nodeId === nodeId);
        if (!existing) {
          existing = { nodeId, rx: 0, ry: 0, mz: 0 };
          linearReactions.push(existing);
        }
        if (localDof === 0) existing.rx = reaction;
        else if (localDof === 1) existing.ry = reaction;
        else if (localDof === 2) existing.mz = reaction;
      }
    }
  }
  const linearResults: AnalysisResults = { displacements: linearDisp, reactions: linearReactions, elementForces: linearEF };

  // Compute per-node amplification and global B₂
  const amplification: Array<{ nodeId: number; ratio: number }> = [];
  let b2Factor = 1.0;
  for (const [nodeId] of input.nodes) {
    const pdDisp = displacements.find(d => d.nodeId === nodeId)!;
    const linDisp = linearDisp.find(d => d.nodeId === nodeId)!;
    const pdMag = Math.sqrt(pdDisp.ux * pdDisp.ux + pdDisp.uy * pdDisp.uy);
    const linMag = Math.sqrt(linDisp.ux * linDisp.ux + linDisp.uy * linDisp.uy);
    const ratio = linMag > 1e-15 ? pdMag / linMag : 1.0;
    amplification.push({ nodeId, ratio });
    if (ratio > b2Factor) b2Factor = ratio;
  }

  return {
    results: { displacements, reactions, elementForces },
    iterations,
    converged,
    isStable,
    b2Factor,
    amplification,
    linearResults,
  };
}

function getDisp(dofNum: DofNumbering, u: Float64Array, nodeId: number, localDof: number): number {
  if (localDof >= dofNum.dofsPerNode) return 0;
  const key = `${nodeId}:${localDof}`;
  const idx = dofNum.map.get(key);
  return idx !== undefined ? (u[idx] ?? 0) : 0;
}
