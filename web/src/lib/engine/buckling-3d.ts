// Linear buckling analysis for 3D structures
//
// Solves generalized eigenvalue problem: K * phi = lambda * (-Kg) * phi
// where lambda_cr = critical load factor (smallest positive eigenvalue)
//
// Algorithm:
// 1. Linear solve -> get axial forces N per element
// 2. Build geometric stiffness Kg3D (12x12 element Kg)
// 3. Solve generalized eigenvalue problem
// 4. lambda_cr = critical load factor
//
// Reference: Przemieniecki, "Theory of Matrix Structural Analysis" Ch. 11

import {
  solve3D, assemble3D, buildDofNumbering3D,
  computeInternalForces3D, computeLocalAxes3D,
  frameTransformationMatrix3D, trussTransformationMatrix3D,
  globalDof3D,
} from './solver-3d';
import type { DofNumbering3D } from './solver-3d';
import type { SolverInput3D, AnalysisResults3D, ElementForces3D } from './types-3d';
import type { SolverDiagnostic } from './types';
import { solveGeneralizedEigen, choleskySolve } from './matrix-utils';

// ─── Result types ────────────────────────────────────────────────

export interface BucklingMode3D {
  loadFactor: number;  // lambda_cr
  displacements: Array<{
    nodeId: number;
    ux: number; uy: number; uz: number;
    rx: number; ry: number; rz: number;
  }>;
}

export interface ElementBucklingData3D {
  elementId: number;
  axialForce: number;     // kN (from linear analysis)
  criticalForce: number;  // kN = lambda_cr * |N|
  kEffective: number;     // effective length factor
  effectiveLength: number; // m
  length: number;         // m
  slendernessY: number;   // KL/ry
  slendernessZ: number;   // KL/rz
}

export interface BucklingResult3D {
  modes: BucklingMode3D[];
  nDof: number;
  elementData: ElementBucklingData3D[];
  diagnostics?: SolverDiagnostic[];
}

// ─── 3D Geometric Stiffness Matrices ─────────────────────────────

/**
 * 12x12 geometric stiffness matrix for a 3D frame element in local coords.
 *
 * DOFs: [u1, v1, w1, theta_x1, theta_y1, theta_z1,
 *        u2, v2, w2, theta_x2, theta_y2, theta_z2]
 *
 * Consistent formulation (Przemieniecki):
 * Bending about Z (v, theta_z) and bending about Y (w, theta_y) each get
 * the standard 4x4 geometric stiffness sub-block.
 *
 * N = axial force (positive = tension)
 * L = element length
 */
function frameGeometricStiffness3D(N: number, L: number): Float64Array {
  const n = 12;
  const kg = new Float64Array(n * n);
  const c = N / (30 * L);
  const L2 = L * L;

  // ── Bending about Z-axis (v1=1, theta_z1=5, v2=7, theta_z2=11) ──
  //       v1    theta_z1   v2     theta_z2
  //  v1:  36     3L       -36     3L
  //  tz1: 3L     4L^2     -3L    -L^2
  //  v2: -36    -3L        36    -3L
  //  tz2: 3L    -L^2      -3L     4L^2
  kg[1 * n + 1]   =  36 * c;
  kg[1 * n + 5]   =  3 * L * c;
  kg[1 * n + 7]   = -36 * c;
  kg[1 * n + 11]  =  3 * L * c;

  kg[5 * n + 1]   =  3 * L * c;
  kg[5 * n + 5]   =  4 * L2 * c;
  kg[5 * n + 7]   = -3 * L * c;
  kg[5 * n + 11]  = -L2 * c;

  kg[7 * n + 1]   = -36 * c;
  kg[7 * n + 5]   = -3 * L * c;
  kg[7 * n + 7]   =  36 * c;
  kg[7 * n + 11]  = -3 * L * c;

  kg[11 * n + 1]  =  3 * L * c;
  kg[11 * n + 5]  = -L2 * c;
  kg[11 * n + 7]  = -3 * L * c;
  kg[11 * n + 11] =  4 * L2 * c;

  // ── Bending about Y-axis (w1=2, theta_y1=4, w2=8, theta_y2=10) ──
  // Same structure but for w-theta_y plane.
  // Sign convention: theta_y = -dw/dx, so cross-terms have opposite sign
  //       w1     theta_y1   w2     theta_y2
  //  w1:  36    -3L        -36    -3L
  //  ty1:-3L     4L^2       3L    -L^2
  //  w2: -36     3L         36     3L
  //  ty2:-3L    -L^2        3L     4L^2
  kg[2 * n + 2]   =  36 * c;
  kg[2 * n + 4]   = -3 * L * c;
  kg[2 * n + 8]   = -36 * c;
  kg[2 * n + 10]  = -3 * L * c;

  kg[4 * n + 2]   = -3 * L * c;
  kg[4 * n + 4]   =  4 * L2 * c;
  kg[4 * n + 8]   =  3 * L * c;
  kg[4 * n + 10]  = -L2 * c;

  kg[8 * n + 2]   = -36 * c;
  kg[8 * n + 4]   =  3 * L * c;
  kg[8 * n + 8]   =  36 * c;
  kg[8 * n + 10]  =  3 * L * c;

  kg[10 * n + 2]  = -3 * L * c;
  kg[10 * n + 4]  = -L2 * c;
  kg[10 * n + 8]  =  3 * L * c;
  kg[10 * n + 10] =  4 * L2 * c;

  return kg;
}

/**
 * 6x6 geometric stiffness matrix for a 3D truss element in local coords.
 * DOFs: [u1, v1, w1, u2, v2, w2]
 * N = axial force (positive = tension)
 * L = element length
 */
function trussGeometricStiffness3D(N: number, L: number): Float64Array {
  const n = 6;
  const kg = new Float64Array(n * n);
  const c = N / L;

  // Transverse terms only (v and w directions)
  //       v1    v2
  // v1:   1    -1
  // v2:  -1     1
  kg[1 * n + 1] =  c;
  kg[1 * n + 4] = -c;
  kg[4 * n + 1] = -c;
  kg[4 * n + 4] =  c;

  //       w1    w2
  // w1:   1    -1
  // w2:  -1     1
  kg[2 * n + 2] =  c;
  kg[2 * n + 5] = -c;
  kg[5 * n + 2] = -c;
  kg[5 * n + 5] =  c;

  return kg;
}

// ─── Transform and assemble geometric stiffness ──────────────────

/** Kg_global = T^T * Kg_local * T */
function transformKgToGlobal(kgLocal: Float64Array, T: Float64Array, ndof: number): Float64Array {
  // temp = Kg_local * T
  const temp = new Float64Array(ndof * ndof);
  for (let i = 0; i < ndof; i++) {
    for (let j = 0; j < ndof; j++) {
      let sum = 0;
      for (let k = 0; k < ndof; k++) {
        sum += kgLocal[i * ndof + k] * T[k * ndof + j];
      }
      temp[i * ndof + j] = sum;
    }
  }

  // Kg_global = T^T * temp
  const kgGlobal = new Float64Array(ndof * ndof);
  for (let i = 0; i < ndof; i++) {
    for (let j = 0; j < ndof; j++) {
      let sum = 0;
      for (let k = 0; k < ndof; k++) {
        sum += T[k * ndof + i] * temp[k * ndof + j];
      }
      kgGlobal[i * ndof + j] = sum;
    }
  }

  return kgGlobal;
}

/**
 * Assemble the global geometric stiffness matrix Kg (nFree x nFree).
 * Uses axial forces from a prior linear solve.
 */
export function assembleGeometricStiffness3D(
  input: SolverInput3D,
  dofNum: DofNumbering3D,
  elementForces: ElementForces3D[],
): Float64Array {
  const nf = dofNum.nFree;
  const Kg = new Float64Array(nf * nf);

  // Build lookup: elementId -> ElementForces3D
  const forcesById = new Map<number, ElementForces3D>();
  for (const ef of elementForces) {
    forcesById.set(ef.elementId, ef);
  }

  for (const [elemId, elem] of input.elements) {
    const nodeI = input.nodes.get(elem.nodeI)!;
    const nodeJ = input.nodes.get(elem.nodeJ)!;

    const localY = (elem.localYx !== undefined && elem.localYy !== undefined && elem.localYz !== undefined)
      ? { x: elem.localYx, y: elem.localYy, z: elem.localYz }
      : undefined;
    const axes = computeLocalAxes3D(nodeI, nodeJ, localY, elem.rollAngle);
    const L = axes.L;
    if (L < 1e-12) continue;

    // Get axial force (average of start and end)
    const ef = forcesById.get(elemId);
    const N = ef ? (ef.nStart + ef.nEnd) / 2 : 0;
    if (Math.abs(N) < 1e-12) continue;

    if (elem.type === 'frame') {
      const kgLocal = frameGeometricStiffness3D(N, L);
      const T = frameTransformationMatrix3D(axes.ex, axes.ey, axes.ez);
      const kgGlobal = transformKgToGlobal(kgLocal, T, 12);

      // Scatter into global Kg (free DOFs only)
      const dofs: number[] = [];
      for (let d = 0; d < dofNum.dofsPerNode; d++) {
        const idx = globalDof3D(dofNum, elem.nodeI, d);
        if (idx !== undefined) dofs.push(idx);
      }
      for (let d = 0; d < dofNum.dofsPerNode; d++) {
        const idx = globalDof3D(dofNum, elem.nodeJ, d);
        if (idx !== undefined) dofs.push(idx);
      }

      for (let i = 0; i < dofs.length; i++) {
        const gi = dofs[i];
        if (gi >= nf) continue;
        for (let j = 0; j < dofs.length; j++) {
          const gj = dofs[j];
          if (gj >= nf) continue;
          Kg[gi * nf + gj] += kgGlobal[i * 12 + j];
        }
      }
    } else {
      // Truss: 6x6
      const kgLocal = trussGeometricStiffness3D(N, L);
      const T = trussTransformationMatrix3D(axes.ex, axes.ey, axes.ez);
      const kgGlobal = transformKgToGlobal(kgLocal, T, 6);

      const diI0 = globalDof3D(dofNum, elem.nodeI, 0)!;
      const diI1 = globalDof3D(dofNum, elem.nodeI, 1)!;
      const diI2 = globalDof3D(dofNum, elem.nodeI, 2)!;
      const diJ0 = globalDof3D(dofNum, elem.nodeJ, 0)!;
      const diJ1 = globalDof3D(dofNum, elem.nodeJ, 1)!;
      const diJ2 = globalDof3D(dofNum, elem.nodeJ, 2)!;
      const dofs = [diI0, diI1, diI2, diJ0, diJ1, diJ2];

      for (let i = 0; i < 6; i++) {
        const gi = dofs[i];
        if (gi >= nf) continue;
        for (let j = 0; j < 6; j++) {
          const gj = dofs[j];
          if (gj >= nf) continue;
          Kg[gi * nf + gj] += kgGlobal[i * 6 + j];
        }
      }
    }
  }

  return Kg;
}

// ─── Main solver ─────────────────────────────────────────────────

/**
 * Linear buckling analysis for 3D structures.
 *
 * 1. Linear solve -> get axial forces N
 * 2. Build Kg from N
 * 3. Solve eigenvalue: K*phi = lambda*(-Kg)*phi
 * 4. lambda_cr = smallest positive eigenvalue
 */
export function solveBuckling3D(
  input: SolverInput3D,
  numModes?: number,
): BucklingResult3D | string {
  const dofNum = buildDofNumbering3D(input);
  const nf = dofNum.nFree;
  const nt = dofNum.nTotal;

  if (nf === 0) return 'No free DOFs for buckling analysis.';
  if (nf > 500) return 'Model too large for buckling analysis (max 500 DOF).';

  // Step 1: Linear solve
  const linearResult = solve3D(input);
  if (typeof linearResult === 'string') return `Linear solve failed: ${linearResult}`;

  // Extract Kff from assembled system
  const { K, F } = assemble3D(input, dofNum);
  const Kff = new Float64Array(nf * nf);
  for (let i = 0; i < nf; i++) {
    for (let j = 0; j < nf; j++) {
      Kff[i * nf + j] = K[i * nt + j];
    }
  }

  // Step 2: Build Kg from element forces
  const elementForces = linearResult.elementForces;
  const Kg = assembleGeometricStiffness3D(input, dofNum, elementForces);

  // Check Kg is not zero
  let kgNorm = 0;
  for (let i = 0; i < nf * nf; i++) kgNorm += Kg[i] * Kg[i];
  if (kgNorm < 1e-20) return 'No axial forces found — buckling analysis requires compression members.';

  // Step 3: Generalized eigenvalue problem
  // K*phi = lambda*(-Kg)*phi  ->  (-Kg)*phi = mu*K*phi  where mu = 1/lambda
  const negKg = new Float64Array(nf * nf);
  for (let i = 0; i < nf * nf; i++) negKg[i] = -Kg[i];

  const eigen = solveGeneralizedEigen(negKg, Kff, nf);
  if (!eigen) return 'Cholesky decomposition failed — stiffness matrix may not be positive definite.';

  // eigenvalues mu satisfy (-Kg)*phi = mu*K*phi -> lambda = 1/mu
  // We want positive lambda (smallest): from positive mu
  const nModes = Math.min(numModes ?? 4, nf);
  const modes: BucklingMode3D[] = [];

  const candidates: Array<{ lambdaCr: number; modeIdx: number }> = [];
  for (let i = 0; i < nf; i++) {
    const mu = eigen.values[i];
    if (mu > 1e-10) {
      candidates.push({ lambdaCr: 1 / mu, modeIdx: i });
    }
  }
  candidates.sort((a, b) => a.lambdaCr - b.lambdaCr);

  for (let m = 0; m < Math.min(nModes, candidates.length); m++) {
    const { lambdaCr, modeIdx } = candidates[m];

    // Extract mode shape
    const phi = new Float64Array(nf);
    for (let i = 0; i < nf; i++) {
      phi[i] = eigen.vectors[i * nf + modeIdx];
    }

    // Normalize to max = 1
    let maxAbs = 0;
    for (let i = 0; i < nf; i++) {
      if (Math.abs(phi[i]) > maxAbs) maxAbs = Math.abs(phi[i]);
    }
    if (maxAbs > 0) {
      for (let i = 0; i < nf; i++) phi[i] /= maxAbs;
    }

    // Map to node displacements
    const displacements: BucklingMode3D['displacements'] = [];
    for (const [nodeId] of input.nodes) {
      displacements.push({
        nodeId,
        ux: getPhiVal(dofNum, phi, nodeId, 0, nf),
        uy: getPhiVal(dofNum, phi, nodeId, 1, nf),
        uz: getPhiVal(dofNum, phi, nodeId, 2, nf),
        rx: getPhiVal(dofNum, phi, nodeId, 3, nf),
        ry: getPhiVal(dofNum, phi, nodeId, 4, nf),
        rz: getPhiVal(dofNum, phi, nodeId, 5, nf),
      });
    }

    modes.push({ loadFactor: lambdaCr, displacements });
  }

  if (modes.length === 0) return 'No positive buckling modes found.';

  // Step 4: Compute per-element buckling data using first (critical) mode
  const lambdaCr1 = modes[0].loadFactor;
  const elementData: ElementBucklingData3D[] = [];

  for (const ef of elementForces) {
    const elem = input.elements.get(ef.elementId);
    if (!elem) continue;
    const nodeI = input.nodes.get(elem.nodeI);
    const nodeJ = input.nodes.get(elem.nodeJ);
    if (!nodeI || !nodeJ) continue;

    const N = (ef.nStart + ef.nEnd) / 2; // average axial force
    if (N >= -1e-10) continue; // only compressed elements (N < 0)

    const dx = nodeJ.x - nodeI.x;
    const dy = nodeJ.y - nodeI.y;
    const dz = nodeJ.z - nodeI.z;
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (L < 1e-12) continue;

    const sec = input.sections.get(elem.sectionId);
    const mat = input.materials.get(elem.materialId);
    if (!sec || !mat) continue;

    const E_kNm2 = mat.e * 1000; // MPa -> kN/m²
    const absN = Math.abs(N);
    const Pcr = lambdaCr1 * absN;

    // Effective length factor from Pcr = pi^2 * E * I / (K * L)^2
    // Use the weaker axis for the overall K factor
    const EIy = E_kNm2 * sec.iy;
    const EIz = E_kNm2 * sec.iz;
    const EImin = Math.min(EIy, EIz);

    const kEff = Pcr > 1e-15 ? Math.PI * Math.sqrt(EImin / Pcr) / L : Infinity;
    const Le = kEff * L;

    // Radii of gyration
    const ry = Math.sqrt(sec.iy / sec.a); // about Y axis
    const rz = Math.sqrt(sec.iz / sec.a); // about Z axis

    const slendernessY = Le / ry;
    const slendernessZ = Le / rz;

    elementData.push({
      elementId: ef.elementId,
      axialForce: N,
      criticalForce: Pcr,
      kEffective: kEff,
      effectiveLength: Le,
      length: L,
      slendernessY,
      slendernessZ,
    });
  }

  const diags: SolverDiagnostic[] = [];
  if (modes.length > 0) {
    const firstFactor = modes[0].loadFactor;
    if (firstFactor < 1.0) {
      diags.push({ severity: 'error', code: 'BUCKLING_LOW_FACTOR', message: 'diag.bucklingLowFactor', source: 'stability', details: { loadFactor: firstFactor } });
    } else if (firstFactor < 3.0) {
      diags.push({ severity: 'warning', code: 'BUCKLING_LOW_FACTOR', message: 'diag.bucklingLowFactor', source: 'stability', details: { loadFactor: firstFactor } });
    }
  }

  return { modes, nDof: nf, elementData, diagnostics: diags.length > 0 ? diags : undefined };
}

// ─── Helpers ─────────────────────────────────────────────────────

function getPhiVal(
  dofNum: DofNumbering3D,
  phi: Float64Array,
  nodeId: number,
  localDof: number,
  nFree: number,
): number {
  if (localDof >= dofNum.dofsPerNode) return 0;
  const key = `${nodeId}:${localDof}`;
  const idx = dofNum.map.get(key);
  if (idx === undefined || idx >= nFree) return 0;
  return phi[idx];
}
