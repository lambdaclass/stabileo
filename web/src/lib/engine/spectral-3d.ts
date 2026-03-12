// Response Spectrum Analysis for 3D Structures — Modal Spectral Method
//
// Combines 3D modal analysis results with a design response spectrum
// to compute peak structural responses (displacements, forces).
//
// References:
//   - Chopra, "Dynamics of Structures" (4th ed.), Ch. 13
//   - INPRES-CIRSOC 103, Part I (Argentine seismic code)

import { getSpectralAcceleration, cirsoc103Spectrum } from './spectral';
import type { DesignSpectrum, CombinationRule } from './spectral';
import type { ModalResult3D, ModeShape3D } from './modal-3d';
import { assemble3D, buildDofNumbering3D, computeInternalForces3D, globalDof3D } from './solver-3d';
import type { DofNumbering3D } from './solver-3d';
import type { SolverInput3D, AnalysisResults3D, Displacement3D, Reaction3D, ElementForces3D } from './types-3d';
import type { SolverDiagnostic } from './types';
import { buildMassMatrix3D } from './mass-matrix-3d';
import { matVec } from './matrix-utils';

// ─── Configuration ───────────────────────────────────────────────

export interface SpectralConfig3D {
  direction: 'X' | 'Y' | 'Z';
  spectrum: DesignSpectrum;
  rule?: CombinationRule;       // 'SRSS' | 'CQC', default CQC
  xi?: number;                  // damping ratio, default 0.05
  importanceFactor?: number;    // default 1.0
  reductionFactor?: number;     // R factor, default 1.0
}

// ─── Results ─────────────────────────────────────────────────────

export interface SpectralResult3D {
  baseShear: number;  // kN
  results: AnalysisResults3D;  // peak envelope
  perMode: Array<{
    mode: number;
    period: number;
    sa: number;      // spectral acceleration (m/s²)
    shear: number;   // modal base shear (kN)
  }>;
  rule: CombinationRule;
  diagnostics?: SolverDiagnostic[];
}

// ─── CQC Correlation ─────────────────────────────────────────────

/**
 * CQC correlation coefficient (Chopra Eq. 13.7.5)
 * ρ_ij = 8·ξ²·(1+r)·r^(3/2) / ((1-r²)² + 4·ξ²·r·(1+r)²)
 * where r = ωi/ωj
 */
function cqcCoefficient(omegaI: number, omegaJ: number, xi: number): number {
  const r = omegaI / omegaJ;
  const xi2 = xi * xi;
  const r2 = r * r;
  const num = 8 * xi2 * (1 + r) * Math.pow(r, 1.5);
  const den = (1 - r2) * (1 - r2) + 4 * xi2 * r * (1 + r) * (1 + r);
  return den > 1e-20 ? num / den : (Math.abs(r - 1) < 0.01 ? 1 : 0);
}

/**
 * Combine modal response values using SRSS or CQC.
 * @param values  Per-mode response values
 * @param omegas  Per-mode angular frequencies (for CQC)
 * @param rule    Combination rule
 * @param xi      Damping ratio
 */
function combineModal(
  values: number[],
  omegas: number[],
  rule: CombinationRule,
  xi: number,
): number {
  if (values.length === 0) return 0;

  if (rule === 'SRSS') {
    let sum = 0;
    for (const v of values) sum += v * v;
    return Math.sqrt(sum);
  }

  // CQC: R = sqrt(sum_i sum_j rho_ij * r_i * r_j)
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    for (let j = 0; j < values.length; j++) {
      const rho = cqcCoefficient(omegas[i], omegas[j], xi);
      sum += values[i] * rho * values[j];
    }
  }
  return Math.sqrt(Math.abs(sum));
}

// ─── DOF direction mapping ───────────────────────────────────────

/** Map direction label to DOF index: X=0, Y=1, Z=2 */
function directionDofIndex(dir: 'X' | 'Y' | 'Z'): number {
  return dir === 'X' ? 0 : dir === 'Y' ? 1 : 2;
}

// ─── Main solver ─────────────────────────────────────────────────

/**
 * 3D Response Spectrum Analysis (Chopra Ch. 13).
 *
 * Steps:
 * 1. For each mode m, get Sa_m = Sa(T_m) from the design spectrum
 * 2. Peak modal displacement: u_m = Gamma_dir * Sa / omega^2 * phi_m
 * 3. Compute element forces for each mode displacement
 * 4. Combine modes via SRSS or CQC
 */
export function solveSpectral3D(
  input: SolverInput3D,
  modalResult: ModalResult3D,
  densities: Map<number, number>,
  config: SpectralConfig3D,
): SpectralResult3D | string {
  const rule = config.rule ?? 'CQC';
  const xi = config.xi ?? 0.05;
  const I = config.importanceFactor ?? 1.0;
  const R = config.reductionFactor ?? 1.0;
  const g = 9.81; // m/s²

  const modes = modalResult.modes;
  if (modes.length === 0) return 'No modes available for spectral analysis.';

  const dofNum = buildDofNumbering3D(input);
  const nf = dofNum.nFree;
  const nt = dofNum.nTotal;

  // Build mass matrix (needed for effective mass / participation)
  const Mff = buildMassMatrix3D(input, dofNum, densities);

  // Build influence vector for the specified direction
  const dirDof = directionDofIndex(config.direction);
  const rDir = new Float64Array(nf);
  for (const [nodeId] of input.nodes) {
    const key = `${nodeId}:${dirDof}`;
    const idx = dofNum.map.get(key);
    if (idx !== undefined && idx < nf) rDir[idx] = 1;
  }

  // M * rDir (used for participation factors)
  const MrDir = matVec(Mff, rDir, nf);

  // Per-mode data
  const perMode: SpectralResult3D['perMode'] = [];
  const modalDisplacements: Float64Array[] = [];
  const modalElementForces: ElementForces3D[][] = [];
  const modalReactions: Reaction3D[][] = [];
  const omegas: number[] = [];

  for (let m = 0; m < modes.length; m++) {
    const mode = modes[m];
    const T = mode.period;
    let saRaw = getSpectralAcceleration(config.spectrum, T);

    // Convert to m/s² if in g
    if (config.spectrum.inG !== false) saRaw *= g;

    // Apply importance and reduction factors
    const sa = saRaw * I / R;
    const sd = mode.omega > 1e-10 ? sa / (mode.omega * mode.omega) : 0;

    // Extract raw eigenvector DOF values from mode shape displacements
    const phiRaw = new Float64Array(nf);
    for (const d of mode.displacements) {
      const dofMap: [number, number][] = [
        [0, d.ux], [1, d.uy], [2, d.uz],
        [3, d.rx], [4, d.ry], [5, d.rz],
      ];
      for (const [dofIdx, val] of dofMap) {
        const key = `${d.nodeId}:${dofIdx}`;
        const gIdx = dofNum.map.get(key);
        if (gIdx !== undefined && gIdx < nf) phiRaw[gIdx] = val;
      }
    }

    // Participation factor: Gamma = phi^T * M * r / (phi^T * M * phi)
    const Mphi = matVec(Mff, phiRaw, nf);
    let phiMphi = 0;
    for (let i = 0; i < nf; i++) phiMphi += phiRaw[i] * Mphi[i];
    let phiMr = 0;
    for (let i = 0; i < nf; i++) phiMr += phiRaw[i] * MrDir[i];

    const gamma = phiMphi > 1e-20 ? phiMr / phiMphi : 0;

    // Effective modal mass
    const meff = gamma * gamma * phiMphi;

    // Peak modal displacement vector: u_m = Gamma * Sd * phi
    const uModal = new Float64Array(nf);
    const scaleFactor = gamma * sd;
    for (let i = 0; i < nf; i++) uModal[i] = phiRaw[i] * scaleFactor;
    modalDisplacements.push(uModal);

    // Build full displacement vector for internal forces computation
    const uAll = new Float64Array(nt);
    for (let i = 0; i < nf; i++) uAll[i] = uModal[i];

    const ef = computeInternalForces3D(input, dofNum, uAll);
    modalElementForces.push(ef);

    // Compute reactions for this mode
    const { K, F } = assemble3D(input, dofNum);
    const reactions: Reaction3D[] = [];
    for (const sup of input.supports.values()) {
      const nodeId = sup.nodeId;
      const fx = computeReactionComponent(K, uAll, F, dofNum, nodeId, 0, nt);
      const fy = computeReactionComponent(K, uAll, F, dofNum, nodeId, 1, nt);
      const fz = computeReactionComponent(K, uAll, F, dofNum, nodeId, 2, nt);
      const mx = computeReactionComponent(K, uAll, F, dofNum, nodeId, 3, nt);
      const my = computeReactionComponent(K, uAll, F, dofNum, nodeId, 4, nt);
      const mz = computeReactionComponent(K, uAll, F, dofNum, nodeId, 5, nt);
      reactions.push({ nodeId, fx, fy, fz, mx, my, mz });
    }
    modalReactions.push(reactions);

    // Modal base shear: Meff * Sa
    const modalShear = meff * sa;

    omegas.push(mode.omega);
    perMode.push({
      mode: m + 1,
      period: T,
      sa: saRaw,  // store raw Sa (before I/R)
      shear: modalShear,
    });
  }

  // ─── Combine modal responses ───────────────────────────────────

  // Displacements
  const displacements: Displacement3D[] = [];
  for (const [nodeId] of input.nodes) {
    const components: number[][] = [[], [], [], [], [], []]; // ux, uy, uz, rx, ry, rz
    for (let m = 0; m < modes.length; m++) {
      for (let d = 0; d < 6; d++) {
        const key = `${nodeId}:${d}`;
        const gIdx = dofNum.map.get(key);
        const val = (gIdx !== undefined && gIdx < nf) ? modalDisplacements[m][gIdx] : 0;
        components[d].push(val);
      }
    }
    displacements.push({
      nodeId,
      ux: combineModal(components[0], omegas, rule, xi),
      uy: combineModal(components[1], omegas, rule, xi),
      uz: combineModal(components[2], omegas, rule, xi),
      rx: combineModal(components[3], omegas, rule, xi),
      ry: combineModal(components[4], omegas, rule, xi),
      rz: combineModal(components[5], omegas, rule, xi),
    });
  }

  // Reactions
  const reactions: Reaction3D[] = [];
  for (const sup of input.supports.values()) {
    const nodeId = sup.nodeId;
    const fxVals: number[] = [], fyVals: number[] = [], fzVals: number[] = [];
    const mxVals: number[] = [], myVals: number[] = [], mzVals: number[] = [];
    for (let m = 0; m < modes.length; m++) {
      const r = modalReactions[m].find(r => r.nodeId === nodeId);
      fxVals.push(r?.fx ?? 0);
      fyVals.push(r?.fy ?? 0);
      fzVals.push(r?.fz ?? 0);
      mxVals.push(r?.mx ?? 0);
      myVals.push(r?.my ?? 0);
      mzVals.push(r?.mz ?? 0);
    }
    reactions.push({
      nodeId,
      fx: combineModal(fxVals, omegas, rule, xi),
      fy: combineModal(fyVals, omegas, rule, xi),
      fz: combineModal(fzVals, omegas, rule, xi),
      mx: combineModal(mxVals, omegas, rule, xi),
      my: combineModal(myVals, omegas, rule, xi),
      mz: combineModal(mzVals, omegas, rule, xi),
    });
  }

  // Element forces
  const elementForces: ElementForces3D[] = [];
  // Use first mode's element forces as template for element list
  const templateForces = modalElementForces[0] ?? [];

  for (const template of templateForces) {
    const eid = template.elementId;
    const forceComponents: Record<string, number[]> = {
      nStart: [], nEnd: [],
      vyStart: [], vyEnd: [],
      vzStart: [], vzEnd: [],
      mxStart: [], mxEnd: [],
      myStart: [], myEnd: [],
      mzStart: [], mzEnd: [],
    };

    for (let m = 0; m < modes.length; m++) {
      const ef = modalElementForces[m].find(e => e.elementId === eid);
      forceComponents.nStart.push(ef?.nStart ?? 0);
      forceComponents.nEnd.push(ef?.nEnd ?? 0);
      forceComponents.vyStart.push(ef?.vyStart ?? 0);
      forceComponents.vyEnd.push(ef?.vyEnd ?? 0);
      forceComponents.vzStart.push(ef?.vzStart ?? 0);
      forceComponents.vzEnd.push(ef?.vzEnd ?? 0);
      forceComponents.mxStart.push(ef?.mxStart ?? 0);
      forceComponents.mxEnd.push(ef?.mxEnd ?? 0);
      forceComponents.myStart.push(ef?.myStart ?? 0);
      forceComponents.myEnd.push(ef?.myEnd ?? 0);
      forceComponents.mzStart.push(ef?.mzStart ?? 0);
      forceComponents.mzEnd.push(ef?.mzEnd ?? 0);
    }

    elementForces.push({
      elementId: eid,
      length: template.length,
      nStart: combineModal(forceComponents.nStart, omegas, rule, xi),
      nEnd: combineModal(forceComponents.nEnd, omegas, rule, xi),
      vyStart: combineModal(forceComponents.vyStart, omegas, rule, xi),
      vyEnd: combineModal(forceComponents.vyEnd, omegas, rule, xi),
      vzStart: combineModal(forceComponents.vzStart, omegas, rule, xi),
      vzEnd: combineModal(forceComponents.vzEnd, omegas, rule, xi),
      mxStart: combineModal(forceComponents.mxStart, omegas, rule, xi),
      mxEnd: combineModal(forceComponents.mxEnd, omegas, rule, xi),
      myStart: combineModal(forceComponents.myStart, omegas, rule, xi),
      myEnd: combineModal(forceComponents.myEnd, omegas, rule, xi),
      mzStart: combineModal(forceComponents.mzStart, omegas, rule, xi),
      mzEnd: combineModal(forceComponents.mzEnd, omegas, rule, xi),
      hingeStart: template.hingeStart,
      hingeEnd: template.hingeEnd,
      // Envelope has no meaningful load data (spectral is peak response)
      qYI: 0, qYJ: 0,
      distributedLoadsY: [],
      pointLoadsY: [],
      qZI: 0, qZJ: 0,
      distributedLoadsZ: [],
      pointLoadsZ: [],
    });
  }

  // Base shear: combine modal base shears
  const baseShearVals = perMode.map(pm => pm.shear);
  const baseShear = combineModal(baseShearVals, omegas, rule, xi);

  const diags: SolverDiagnostic[] = [];
  if (modalResult.cumulativeMassRatioX < 0.9 || modalResult.cumulativeMassRatioY < 0.9 || modalResult.cumulativeMassRatioZ < 0.9) {
    diags.push({ severity: 'warning', code: 'SPECTRAL_INSUFFICIENT_MODES', message: 'diag.spectralInsufficientModes', source: 'solver', details: { x: modalResult.cumulativeMassRatioX, y: modalResult.cumulativeMassRatioY, z: modalResult.cumulativeMassRatioZ } });
  }

  return {
    baseShear,
    results: { displacements, reactions, elementForces },
    perMode,
    rule,
    diagnostics: diags.length > 0 ? diags : undefined,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Compute a single reaction component for a restrained DOF.
 * R_i = sum_j K[i][j]*u[j] - F[i]  (for restrained DOF i)
 */
function computeReactionComponent(
  K: Float64Array, u: Float64Array, F: Float64Array,
  dofNum: DofNumbering3D, nodeId: number, localDof: number,
  nt: number,
): number {
  const gIdx = globalDof3D(dofNum, nodeId, localDof);
  if (gIdx === undefined || gIdx < dofNum.nFree) return 0;

  let reaction = 0;
  for (let j = 0; j < nt; j++) {
    reaction += K[gIdx * nt + j] * u[j];
  }
  reaction -= F[gIdx];
  return reaction;
}

// ─── Re-exports for convenience ──────────────────────────────────

export { cirsoc103Spectrum, getSpectralAcceleration } from './spectral';
export type { DesignSpectrum, CombinationRule } from './spectral';
