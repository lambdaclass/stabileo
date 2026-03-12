// Modal analysis — natural frequencies and mode shapes

import type { SolverInput } from './types';
import type { DofNumbering } from './solver-js';
import { buildDofNumbering, assemble } from './solver-js';
import { assembleMassMatrix } from './mass-matrix';
import { solveGeneralizedEigen, matVec } from './matrix-utils';
import { t } from '../i18n';

export interface ModeShape {
  /** Natural frequency (Hz) */
  frequency: number;
  /** Period (s) */
  period: number;
  /** Angular frequency ω (rad/s) */
  omega: number;
  /** Mode shape displacements per node: { nodeId, ux, uy, rz } normalized */
  displacements: Array<{ nodeId: number; ux: number; uy: number; rz: number }>;
  /** Modal participation factor Γ in X direction */
  participationX: number;
  /** Modal participation factor Γ in Y direction */
  participationY: number;
  /** Effective modal mass in X direction (t = kN·s²/m) */
  effectiveMassX: number;
  /** Effective modal mass in Y direction (t = kN·s²/m) */
  effectiveMassY: number;
  /** Effective mass ratio in X: Meff_x / Mtotal */
  massRatioX: number;
  /** Effective mass ratio in Y: Meff_y / Mtotal */
  massRatioY: number;
}

/** Rayleigh damping coefficients: C = a0·M + a1·K */
export interface RayleighDamping {
  /** Mass-proportional coefficient a₀ */
  a0: number;
  /** Stiffness-proportional coefficient a₁ */
  a1: number;
  /** ω₁ used for computation */
  omega1: number;
  /** ω₂ used for computation */
  omega2: number;
  /** Damping ratios by mode index: ξₙ = a₀/(2ωₙ) + a₁ωₙ/2 */
  dampingRatios: number[];
}

export interface ModalResult {
  modes: ModeShape[];
  /** Number of DOFs in the problem */
  nDof: number;
  /** Total mass of the structure (t = kN·s²/m) */
  totalMass: number;
  /** Cumulative effective mass ratio in X after all computed modes */
  cumulativeMassRatioX: number;
  /** Cumulative effective mass ratio in Y after all computed modes */
  cumulativeMassRatioY: number;
  /** Rayleigh damping for 5% critical (computed from modes 1 & last) */
  rayleigh?: RayleighDamping;
}

/**
 * Solve for natural frequencies and mode shapes.
 * K·φ = ω²·M·φ  →  generalized eigenvalue problem
 *
 * @param input Solver input (structure definition)
 * @param densities Map of materialId → density in kg/m³
 * @param numModes Number of modes to return (default: min(6, nFree))
 */
export function solveModal(
  input: SolverInput,
  densities: Map<number, number>,
  numModes?: number,
): ModalResult | string {
  const dofNum = buildDofNumbering(input);
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

  // Assemble stiffness (we only need Kff)
  const { K } = assemble(input, dofNum);
  const nt = dofNum.nTotal;
  const Kff = new Float64Array(nf * nf);
  for (let i = 0; i < nf; i++) {
    for (let j = 0; j < nf; j++) {
      Kff[i * nf + j] = K[i * nt + j];
    }
  }

  // Inject densities into a modified input for mass matrix assembly
  // We need materials with density info — create extended solver input
  const inputWithDensity = {
    ...input,
    materials: new Map(
      Array.from(input.materials.entries()).map(([id, mat]) => [
        id,
        { ...mat, density: densities.get(id) ?? 0 },
      ]),
    ),
  };

  const Mff = assembleMassMatrix(inputWithDensity as any, dofNum);

  // Check that mass matrix is not zero
  let massNorm = 0;
  for (let i = 0; i < nf * nf; i++) massNorm += Mff[i] * Mff[i];
  if (massNorm < 1e-20) return t('modal.zeroMassMatrix');

  // Solve generalized eigenvalue problem: Kff·φ = λ·Mff·φ where λ = ω²
  const eigenResult = solveGeneralizedEigen(Kff, Mff, nf);
  if (!eigenResult) return t('modal.choleskyError');

  const nModes = Math.min(numModes ?? 6, nf);
  const modes: ModeShape[] = [];

  // Build influence vectors for participation factors.
  // {r_x} has 1 for every x-translational DOF, 0 otherwise
  // {r_y} has 1 for every y-translational DOF, 0 otherwise
  const rX = new Float64Array(nf);
  const rY = new Float64Array(nf);
  for (const [nodeId] of input.nodes) {
    const ixKey = `${nodeId}:0`;
    const iyKey = `${nodeId}:1`;
    const ixIdx = dofNum.map.get(ixKey);
    const iyIdx = dofNum.map.get(iyKey);
    if (ixIdx !== undefined && ixIdx < nf) rX[ixIdx] = 1;
    if (iyIdx !== undefined && iyIdx < nf) rY[iyIdx] = 1;
  }

  // Total mass: computed from mass matrix diagonal (translational DOFs only).
  // For 2D frames, mass from X-translational DOFs = mass from Y-translational DOFs
  // when all DOFs are free. But when some DOFs are restrained, they differ.
  // Per Chopra §13.2: total mass = trace of M along translational DOFs in one direction.
  // We use the max of X and Y to handle asymmetric restraints.
  const MrX = matVec(Mff, rX, nf);
  const MrY = matVec(Mff, rY, nf);
  let totalMassX = 0;
  for (let i = 0; i < nf; i++) totalMassX += rX[i] * MrX[i];
  let totalMassY = 0;
  for (let i = 0; i < nf; i++) totalMassY += rY[i] * MrY[i];
  // Use max: the direction with fewer restrained DOFs gives the most complete mass
  const totalMassMax = Math.max(totalMassX, totalMassY);

  let cumulativeMeffX = 0;
  let cumulativeMeffY = 0;

  for (let m = 0; m < nModes; m++) {
    const lambda = eigenResult.values[m];
    if (lambda <= 0) continue; // Skip zero/negative eigenvalues

    const omega = Math.sqrt(lambda);
    const frequency = omega / (2 * Math.PI);
    const period = 1 / frequency;

    // Extract RAW mode shape vector (before normalization for display)
    const phiRaw = new Float64Array(nf);
    for (let i = 0; i < nf; i++) {
      phiRaw[i] = eigenResult.vectors[i * nf + m];
    }

    // Compute participation factors BEFORE visual normalization
    // Γₙ_x = φₙᵀ · M · {r_x} / (φₙᵀ · M · φₙ)
    const Mphi = matVec(Mff, phiRaw, nf);
    let phiMphi = 0;
    for (let i = 0; i < nf; i++) phiMphi += phiRaw[i] * Mphi[i];

    let phiMrX = 0;
    for (let i = 0; i < nf; i++) phiMrX += phiRaw[i] * MrX[i];
    let phiMrY = 0;
    for (let i = 0; i < nf; i++) phiMrY += phiRaw[i] * MrY[i];

    const gammaX = phiMphi > 1e-20 ? phiMrX / phiMphi : 0;
    const gammaY = phiMphi > 1e-20 ? phiMrY / phiMphi : 0;

    // Effective modal mass: Meff = Γ² × (φᵀ·M·φ)
    const meffX = gammaX * gammaX * phiMphi;
    const meffY = gammaY * gammaY * phiMphi;

    cumulativeMeffX += meffX;
    cumulativeMeffY += meffY;

    // Normalize for display: max component = 1
    const phi = new Float64Array(phiRaw);
    let maxAbs = 0;
    for (let i = 0; i < nf; i++) {
      if (Math.abs(phi[i]) > maxAbs) maxAbs = Math.abs(phi[i]);
    }
    if (maxAbs > 0) {
      for (let i = 0; i < nf; i++) phi[i] /= maxAbs;
    }

    // Map to node displacements
    const displacements: ModeShape['displacements'] = [];
    for (const [nodeId] of input.nodes) {
      const ux = getPhiComponent(dofNum, phi, nodeId, 0, nf);
      const uy = getPhiComponent(dofNum, phi, nodeId, 1, nf);
      const rz = dofNum.dofsPerNode > 2 ? getPhiComponent(dofNum, phi, nodeId, 2, nf) : 0;
      displacements.push({ nodeId, ux, uy, rz });
    }

    modes.push({
      frequency, period, omega, displacements,
      participationX: gammaX,
      participationY: gammaY,
      effectiveMassX: meffX,
      effectiveMassY: meffY,
      massRatioX: totalMassMax > 1e-20 ? meffX / totalMassMax : 0,
      massRatioY: totalMassMax > 1e-20 ? meffY / totalMassMax : 0,
    });
  }

  if (modes.length === 0) return t('modal.noModesFound');

  // Compute Rayleigh damping coefficients (Chopra §11.4)
  // C = a₀·M + a₁·K, with ξ = a₀/(2ω) + a₁·ω/2
  // Given ξ₁ = ξ₂ = ξ (target damping, default 5%):
  //   a₀ = 2ξ·ω₁·ω₂/(ω₁+ω₂)
  //   a₁ = 2ξ/(ω₁+ω₂)
  let rayleigh: RayleighDamping | undefined;
  if (modes.length >= 2) {
    const xi = 0.05; // 5% critical damping
    const omega1 = modes[0].omega;
    // Use last mode or mode with highest cumulative mass significance
    const omega2 = modes[modes.length - 1].omega;
    if (omega1 > 1e-10 && omega2 > omega1 * 1.01) {
      const a0 = 2 * xi * omega1 * omega2 / (omega1 + omega2);
      const a1 = 2 * xi / (omega1 + omega2);
      // Compute actual damping ratio for each mode
      const dampingRatios = modes.map(m => a0 / (2 * m.omega) + a1 * m.omega / 2);
      rayleigh = { a0, a1, omega1, omega2, dampingRatios };
    }
  }

  return {
    modes,
    nDof: nf,
    totalMass: totalMassMax,
    cumulativeMassRatioX: totalMassMax > 1e-20 ? cumulativeMeffX / totalMassMax : 0,
    cumulativeMassRatioY: totalMassMax > 1e-20 ? cumulativeMeffY / totalMassMax : 0,
    rayleigh,
  };
}

function getPhiComponent(
  dofNum: DofNumbering,
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
