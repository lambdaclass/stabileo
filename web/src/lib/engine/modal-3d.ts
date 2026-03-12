// Modal analysis for 3D structures — natural frequencies and mode shapes
//
// Solves the generalized eigenvalue problem: K·φ = ω²·M·φ
// Computes participation factors, effective modal masses, and cumulative
// mass ratios in X, Y, Z directions.

import { assemble3D, buildDofNumbering3D, globalDof3D } from './solver-3d';
import type { DofNumbering3D } from './solver-3d';
import type { SolverInput3D } from './types-3d';
import type { SolverDiagnostic } from './types';
import { solveGeneralizedEigen, matVec } from './matrix-utils';
import { buildMassMatrix3D } from './mass-matrix-3d';
import { t } from '../i18n';

// ─── Types ───────────────────────────────────────────────────────

export interface ModeShape3D {
  /** Natural frequency (Hz) */
  frequency: number;
  /** Period (s) */
  period: number;
  /** Angular frequency ω (rad/s) */
  omega: number;
  /** Mode shape displacements per node (normalized, max component = 1) */
  displacements: Array<{
    nodeId: number;
    ux: number; uy: number; uz: number;
    rx: number; ry: number; rz: number;
  }>;
  /** Modal participation factor Γ in X direction */
  participationX: number;
  /** Modal participation factor Γ in Y direction */
  participationY: number;
  /** Modal participation factor Γ in Z direction */
  participationZ: number;
  /** Effective modal mass in X direction (t = kN·s²/m) */
  effectiveMassX: number;
  /** Effective modal mass in Y direction (t = kN·s²/m) */
  effectiveMassY: number;
  /** Effective modal mass in Z direction (t = kN·s²/m) */
  effectiveMassZ: number;
  /** Effective mass ratio in X: Meff_x / Mtotal */
  massRatioX: number;
  /** Effective mass ratio in Y: Meff_y / Mtotal */
  massRatioY: number;
  /** Effective mass ratio in Z: Meff_z / Mtotal */
  massRatioZ: number;
}

export interface ModalResult3D {
  modes: ModeShape3D[];
  /** Number of free DOFs in the problem */
  nDof: number;
  /** Total mass of the structure (t = kN·s²/m) */
  totalMass: number;
  /** Cumulative effective mass ratio in X after all computed modes */
  cumulativeMassRatioX: number;
  /** Cumulative effective mass ratio in Y after all computed modes */
  cumulativeMassRatioY: number;
  /** Cumulative effective mass ratio in Z after all computed modes */
  cumulativeMassRatioZ: number;
  diagnostics?: SolverDiagnostic[];
}

// ─── Solver ──────────────────────────────────────────────────────

/**
 * Solve for natural frequencies and mode shapes of a 3D structure.
 *
 * @param input     Structure definition (nodes, elements, materials, sections, supports, loads)
 * @param densities Map of materialId → density in kg/m³
 * @param numModes  Number of modes to return (default: min(12, nFree))
 * @returns         ModalResult3D on success, or error string on failure
 */
export function solveModal3D(
  input: SolverInput3D,
  densities: Map<number, number>,
  numModes?: number,
): ModalResult3D | string {
  const dofNum = buildDofNumbering3D(input);
  const nf = dofNum.nFree;

  if (nf === 0) return t('modal.noFreeDofs');
  if (nf > 500) return t('modal.modelTooLarge');

  // Validate that at least one material has density assigned
  const materialsUsed = new Set<number>();
  for (const elem of input.elements.values()) materialsUsed.add(elem.materialId);
  const missingDensity: number[] = [];
  for (const matId of materialsUsed) {
    const d = densities.get(matId);
    if (d === undefined || d <= 0) missingDensity.push(matId);
  }
  if (missingDensity.length === materialsUsed.size) {
    return t('modal.noDensity');
  }

  // ── Assemble stiffness Kff ──
  const { K } = assemble3D(input, dofNum);
  const nt = dofNum.nTotal;
  const Kff = new Float64Array(nf * nf);
  for (let i = 0; i < nf; i++) {
    for (let j = 0; j < nf; j++) {
      Kff[i * nf + j] = K[i * nt + j];
    }
  }

  // ── Assemble mass Mff ──
  const Mff = buildMassMatrix3D(input, dofNum, densities);

  // Check that mass matrix is not zero
  let massNorm = 0;
  for (let i = 0; i < nf * nf; i++) massNorm += Mff[i] * Mff[i];
  if (massNorm < 1e-20) return t('modal.zeroMassMatrix');

  // ── Solve generalized eigenvalue problem: Kff·φ = λ·Mff·φ where λ = ω² ──
  const eigenResult = solveGeneralizedEigen(Kff, Mff, nf);
  if (!eigenResult) return t('modal.choleskyError');

  const nModes = Math.min(numModes ?? 12, nf);

  // ── Build influence vectors for participation factors ──
  // r_x: 1 at every X-translational DOF, 0 elsewhere
  // r_y: 1 at every Y-translational DOF, 0 elsewhere
  // r_z: 1 at every Z-translational DOF, 0 elsewhere
  const rX = new Float64Array(nf);
  const rY = new Float64Array(nf);
  const rZ = new Float64Array(nf);

  for (const [nodeId] of input.nodes) {
    const ixIdx = globalDof3D(dofNum, nodeId, 0); // ux
    const iyIdx = globalDof3D(dofNum, nodeId, 1); // uy
    const izIdx = globalDof3D(dofNum, nodeId, 2); // uz
    if (ixIdx !== undefined && ixIdx < nf) rX[ixIdx] = 1;
    if (iyIdx !== undefined && iyIdx < nf) rY[iyIdx] = 1;
    if (izIdx !== undefined && izIdx < nf) rZ[izIdx] = 1;
  }

  // Pre-compute M·r for each direction
  const MrX = matVec(Mff, rX, nf);
  const MrY = matVec(Mff, rY, nf);
  const MrZ = matVec(Mff, rZ, nf);

  // Total mass: rᵀ·M·r for each translational direction
  // Use the maximum to handle asymmetric restraints (per Chopra §13.2)
  let totalMassX = 0;
  for (let i = 0; i < nf; i++) totalMassX += rX[i] * MrX[i];
  let totalMassY = 0;
  for (let i = 0; i < nf; i++) totalMassY += rY[i] * MrY[i];
  let totalMassZ = 0;
  for (let i = 0; i < nf; i++) totalMassZ += rZ[i] * MrZ[i];
  const totalMassMax = Math.max(totalMassX, totalMassY, totalMassZ);

  // ── Extract modes ──
  const modes: ModeShape3D[] = [];
  let cumulativeMeffX = 0;
  let cumulativeMeffY = 0;
  let cumulativeMeffZ = 0;

  for (let m = 0; m < nModes; m++) {
    const lambda = eigenResult.values[m];
    if (lambda <= 0) continue; // Skip zero/negative eigenvalues (rigid body modes)

    const omega = Math.sqrt(lambda);
    const frequency = omega / (2 * Math.PI);
    const period = 1 / frequency;

    // Extract raw mode shape vector (before normalization)
    const phiRaw = new Float64Array(nf);
    for (let i = 0; i < nf; i++) {
      phiRaw[i] = eigenResult.vectors[i * nf + m];
    }

    // Compute participation factors BEFORE visual normalization
    // Γ_dir = φᵀ·M·r_dir / (φᵀ·M·φ)
    const Mphi = matVec(Mff, phiRaw, nf);
    let phiMphi = 0;
    for (let i = 0; i < nf; i++) phiMphi += phiRaw[i] * Mphi[i];

    let phiMrX = 0;
    for (let i = 0; i < nf; i++) phiMrX += phiRaw[i] * MrX[i];
    let phiMrY = 0;
    for (let i = 0; i < nf; i++) phiMrY += phiRaw[i] * MrY[i];
    let phiMrZ = 0;
    for (let i = 0; i < nf; i++) phiMrZ += phiRaw[i] * MrZ[i];

    const gammaX = phiMphi > 1e-20 ? phiMrX / phiMphi : 0;
    const gammaY = phiMphi > 1e-20 ? phiMrY / phiMphi : 0;
    const gammaZ = phiMphi > 1e-20 ? phiMrZ / phiMphi : 0;

    // Effective modal mass: Meff = Γ² × (φᵀ·M·φ)
    const meffX = gammaX * gammaX * phiMphi;
    const meffY = gammaY * gammaY * phiMphi;
    const meffZ = gammaZ * gammaZ * phiMphi;

    cumulativeMeffX += meffX;
    cumulativeMeffY += meffY;
    cumulativeMeffZ += meffZ;

    // Normalize for display: max absolute component = 1
    const phi = new Float64Array(phiRaw);
    let maxAbs = 0;
    for (let i = 0; i < nf; i++) {
      if (Math.abs(phi[i]) > maxAbs) maxAbs = Math.abs(phi[i]);
    }
    if (maxAbs > 0) {
      for (let i = 0; i < nf; i++) phi[i] /= maxAbs;
    }

    // Map to node displacements (6 DOF per node)
    const displacements: ModeShape3D['displacements'] = [];
    for (const [nodeId] of input.nodes) {
      const ux = getPhiComponent3D(dofNum, phi, nodeId, 0, nf);
      const uy = getPhiComponent3D(dofNum, phi, nodeId, 1, nf);
      const uz = getPhiComponent3D(dofNum, phi, nodeId, 2, nf);
      const rx = dofNum.dofsPerNode > 3 ? getPhiComponent3D(dofNum, phi, nodeId, 3, nf) : 0;
      const ry = dofNum.dofsPerNode > 3 ? getPhiComponent3D(dofNum, phi, nodeId, 4, nf) : 0;
      const rz = dofNum.dofsPerNode > 3 ? getPhiComponent3D(dofNum, phi, nodeId, 5, nf) : 0;
      displacements.push({ nodeId, ux, uy, uz, rx, ry, rz });
    }

    modes.push({
      frequency, period, omega, displacements,
      participationX: gammaX,
      participationY: gammaY,
      participationZ: gammaZ,
      effectiveMassX: meffX,
      effectiveMassY: meffY,
      effectiveMassZ: meffZ,
      massRatioX: totalMassMax > 1e-20 ? meffX / totalMassMax : 0,
      massRatioY: totalMassMax > 1e-20 ? meffY / totalMassMax : 0,
      massRatioZ: totalMassMax > 1e-20 ? meffZ / totalMassMax : 0,
    });
  }

  if (modes.length === 0) return t('modal.noModesFound');

  const cumRatioX = totalMassMax > 1e-20 ? cumulativeMeffX / totalMassMax : 0;
  const cumRatioY = totalMassMax > 1e-20 ? cumulativeMeffY / totalMassMax : 0;
  const cumRatioZ = totalMassMax > 1e-20 ? cumulativeMeffZ / totalMassMax : 0;

  const diags: SolverDiagnostic[] = [];
  const minParticipation = 0.9;
  if (cumRatioX < minParticipation && cumRatioY < minParticipation && cumRatioZ < minParticipation) {
    diags.push({ severity: 'warning', code: 'MODAL_LOW_MASS_PARTICIPATION', message: 'diag.modalLowMassParticipation', source: 'solver', details: { x: cumRatioX, y: cumRatioY, z: cumRatioZ } });
  }

  return {
    modes,
    nDof: nf,
    totalMass: totalMassMax,
    cumulativeMassRatioX: cumRatioX,
    cumulativeMassRatioY: cumRatioY,
    cumulativeMassRatioZ: cumRatioZ,
    diagnostics: diags.length > 0 ? diags : undefined,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────

function getPhiComponent3D(
  dofNum: DofNumbering3D,
  phi: Float64Array,
  nodeId: number,
  localDof: number,
  nFree: number,
): number {
  if (localDof >= dofNum.dofsPerNode) return 0;
  const idx = globalDof3D(dofNum, nodeId, localDof);
  if (idx === undefined || idx >= nFree) return 0;
  return phi[idx];
}
