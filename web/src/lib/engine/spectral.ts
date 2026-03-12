// Response Spectrum Analysis — Modal Spectral Method
//
// Combines modal analysis results with a design response spectrum
// to compute peak structural responses (displacements, forces).
//
// References:
//   - Chopra, "Dynamics of Structures" (4th ed.), Ch. 13
//   - INPRES-CIRSOC 103, Part I (Argentine seismic code)
//   - Clough & Penzien, "Dynamics of Structures"

import type { ModalResult, ModeShape } from './modal';
import type { AnalysisResults, ElementForces, SolverInput } from './types';
import { buildDofNumbering, assemble, computeInternalForces } from './solver-js';
import { assembleMassMatrix } from './mass-matrix';
import { matVec } from './matrix-utils';
import { t } from '../i18n';

// ─── Design Spectrum ─────────────────────────────────────────────

export interface DesignSpectrum {
  /** Name of the spectrum */
  name: string;
  /** Spectral acceleration values Sa(T) in g or m/s².
   *  Defined as period-acceleration pairs, linearly interpolated. */
  points: Array<{ period: number; sa: number }>;
  /** Whether Sa values are in g (true) or m/s² (false). Default: true */
  inG?: boolean;
}

/** Get spectral acceleration for a given period by linear interpolation */
export function getSpectralAcceleration(spectrum: DesignSpectrum, T: number): number {
  const pts = spectrum.points;
  if (pts.length === 0) return 0;
  if (T <= pts[0].period) return pts[0].sa;
  if (T >= pts[pts.length - 1].period) return pts[pts.length - 1].sa;

  for (let i = 0; i < pts.length - 1; i++) {
    if (T >= pts[i].period && T <= pts[i + 1].period) {
      const t = (T - pts[i].period) / (pts[i + 1].period - pts[i].period);
      return pts[i].sa + t * (pts[i + 1].sa - pts[i].sa);
    }
  }
  return pts[pts.length - 1].sa;
}

// ─── Predefined Spectra ──────────────────────────────────────────

/** CIRSOC 103 elastic design spectrum (simplified, Zone 4, Soil Type II) */
export function cirsoc103Spectrum(
  zone: 1 | 2 | 3 | 4,
  soilType: 'I' | 'II' | 'III',
): DesignSpectrum {
  // Simplified CIRSOC 103 spectrum parameters
  const as: Record<number, number> = { 1: 0.04, 2: 0.10, 3: 0.18, 4: 0.35 };
  const Ca: Record<string, number> = { 'I': 1.0, 'II': 1.2, 'III': 1.5 };
  const Cv: Record<string, number> = { 'I': 1.0, 'II': 1.4, 'III': 2.0 };
  const Ts: Record<string, number> = { 'I': 0.3, 'II': 0.5, 'III': 0.8 };
  const T0 = 0.1 * Ts[soilType];

  const a = as[zone];
  const ca = Ca[soilType];
  const cv = Cv[soilType];
  const ts = Ts[soilType];
  const t0 = T0;

  // Build spectrum points
  const SaMax = 2.5 * a * ca; // plateau
  const points: Array<{ period: number; sa: number }> = [
    { period: 0, sa: a * ca },
    { period: t0, sa: SaMax },
    { period: ts, sa: SaMax },
  ];

  // Descending branch: Sa = a·Cv·Ts/T
  for (let T = ts + 0.1; T <= 6; T += 0.1) {
    points.push({ period: T, sa: a * cv * ts / T });
  }

  return {
    name: `CIRSOC 103 Zona ${zone}, Suelo ${soilType}`,
    points,
    inG: true,
  };
}

// ─── Modal Combination Rules ─────────────────────────────────────

export type CombinationRule = 'SRSS' | 'CQC';

/**
 * CQC correlation coefficient (Chopra Eq. 13.7.5)
 * ρ_ij = 8·ξ²·(1+r)·r^(3/2) / ((1-r²)² + 4ξ²·r·(1+r)²)
 * where r = ωᵢ/ωⱼ
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
 * Combine modal responses using SRSS or CQC.
 * @param values Array of modal response values (one per mode)
 * @param modes Mode shapes (for CQC cross-correlation)
 * @param rule Combination rule
 * @param xi Damping ratio for CQC (default 0.05)
 */
export function combineModalResponses(
  values: number[],
  modes: ModeShape[],
  rule: CombinationRule,
  xi = 0.05,
): number {
  if (values.length === 0) return 0;

  if (rule === 'SRSS') {
    // SRSS: R = √(Σ rₙ²)  — Chopra Eq. 13.7.2
    let sum = 0;
    for (const v of values) sum += v * v;
    return Math.sqrt(sum);
  }

  // CQC: R = √(Σᵢ Σⱼ rᵢ·ρᵢⱼ·rⱼ)  — Chopra Eq. 13.7.4
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    for (let j = 0; j < values.length; j++) {
      const rho = cqcCoefficient(modes[i].omega, modes[j].omega, xi);
      sum += values[i] * rho * values[j];
    }
  }
  return Math.sqrt(Math.abs(sum));
}

// ─── Spectral Analysis ──────────────────────────────────────────

export interface SpectralConfig {
  /** Direction of seismic input: 'X' or 'Y' */
  direction: 'X' | 'Y';
  /** Design response spectrum */
  spectrum: DesignSpectrum;
  /** Combination rule (default: CQC) */
  rule?: CombinationRule;
  /** Damping ratio for CQC (default: 0.05) */
  xi?: number;
  /** Importance factor I (multiplier on Sa, default: 1.0) */
  importanceFactor?: number;
  /** Response modification factor R (divides Sa, default: 1.0 = elastic) */
  reductionFactor?: number;
}

export interface SpectralResult {
  /** Peak displacements per node (all positive — envelope) */
  displacements: Array<{ nodeId: number; ux: number; uy: number; rz: number }>;
  /** Peak element forces (all positive — envelope) */
  elementForces: Array<{
    elementId: number;
    nMax: number; vMax: number; mMax: number;
  }>;
  /** Base shear in the direction of excitation (kN) */
  baseShear: number;
  /** Per-mode spectral data */
  perMode: Array<{
    mode: number;
    period: number;
    sa: number;
    sd: number;
    participation: number;
    modalForce: number; // Vn = Γₙ·Saₙ·Meff_n
  }>;
  /** Combination rule used */
  rule: CombinationRule;
}

/**
 * Response Spectrum Analysis (Chopra Ch. 13).
 *
 * Steps:
 * 1. For each mode n, get Saₙ = Sa(Tₙ) from the design spectrum
 * 2. Peak modal displacement: uₙ = Γₙ · φₙ · Sdₙ where Sdₙ = Saₙ/ωₙ²
 * 3. Peak modal force: fₙ = K · uₙ = ωₙ² · M · Γₙ · φₙ · Sdₙ = Γₙ · Saₙ · M · φₙ
 * 4. Combine modes via SRSS or CQC
 *
 * The input structure must have been previously analyzed with solveModal().
 */
export function solveSpectral(
  input: SolverInput,
  modalResult: ModalResult,
  densities: Map<number, number>,
  config: SpectralConfig,
): SpectralResult | string {
  const rule = config.rule ?? 'CQC';
  const xi = config.xi ?? 0.05;
  const I = config.importanceFactor ?? 1.0;
  const R = config.reductionFactor ?? 1.0;
  const g = 9.81; // m/s²

  const modes = modalResult.modes;
  if (modes.length === 0) return t('spectral.noModes');

  const dofNum = buildDofNumbering(input);
  const nf = dofNum.nFree;
  const nt = dofNum.nTotal;

  // Need mass matrix for force computation
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

  // Build influence vector for the specified direction
  const r = new Float64Array(nf);
  const dirDof = config.direction === 'X' ? 0 : 1;
  for (const [nodeId] of input.nodes) {
    const key = `${nodeId}:${dirDof}`;
    const idx = dofNum.map.get(key);
    if (idx !== undefined && idx < nf) r[idx] = 1;
  }

  // Per-mode peak responses
  const perMode: SpectralResult['perMode'] = [];
  const modalDisplacements: Float64Array[] = []; // per-mode displacement vectors (nf)
  const modalElementForces: ElementForces[][] = []; // per-mode element forces

  // Re-extract raw eigenvectors from the modal result
  // We need the raw (un-normalized) mode shapes for force computation
  // Since we only have the normalized ones, we reconstruct peak modal displacements
  // using the participation factor approach

  for (let m = 0; m < modes.length; m++) {
    const mode = modes[m];
    const T = mode.period;
    let saRaw = getSpectralAcceleration(config.spectrum, T);

    // Convert to m/s² if in g
    if (config.spectrum.inG !== false) saRaw *= g;

    // Apply importance and reduction factors
    const sa = saRaw * I / R;
    const sd = mode.omega > 1e-10 ? sa / (mode.omega * mode.omega) : 0;

    // Participation factor for this direction
    const gamma = config.direction === 'X' ? mode.participationX : mode.participationY;

    // Peak modal displacement vector: uₙ = Γₙ · Sdₙ · φₙ (normalized)
    // Since φₙ is normalized to max=1, we need to get the DOF-level shape
    const uModal = new Float64Array(nf);
    for (const d of mode.displacements) {
      const uxKey = `${d.nodeId}:0`;
      const uyKey = `${d.nodeId}:1`;
      const rzKey = `${d.nodeId}:2`;
      const uxIdx = dofNum.map.get(uxKey);
      const uyIdx = dofNum.map.get(uyKey);
      const rzIdx = dofNum.map.get(rzKey);
      if (uxIdx !== undefined && uxIdx < nf) uModal[uxIdx] = d.ux;
      if (uyIdx !== undefined && uyIdx < nf) uModal[uyIdx] = d.uy;
      if (rzIdx !== undefined && rzIdx < nf) uModal[rzIdx] = d.rz;
    }

    // Scale by Γ·Sd
    const scaleFactor = gamma * sd;
    for (let i = 0; i < nf; i++) uModal[i] *= scaleFactor;
    modalDisplacements.push(uModal);

    // Compute element forces for this mode's displacement
    const uAll = new Float64Array(nt);
    for (let i = 0; i < nf; i++) uAll[i] = uModal[i];
    const ef = computeInternalForces(input, dofNum, uAll);
    modalElementForces.push(ef);

    // Modal base shear: Vₙ = Γₙ · Saₙ · Meff_n (but Meff = Γ²·φᵀMφ)
    // More direct: Vₙ = Γₙ² · (φᵀMφ) · Saₙ = Meff_n · Saₙ
    const meff = config.direction === 'X' ? mode.effectiveMassX : mode.effectiveMassY;
    const modalForce = meff * sa;

    perMode.push({
      mode: m + 1,
      period: T,
      sa: saRaw, // store raw Sa (before I/R)
      sd,
      participation: gamma,
      modalForce,
    });
  }

  // Combine modal responses using SRSS or CQC
  // Displacements
  const displacements: SpectralResult['displacements'] = [];
  for (const [nodeId] of input.nodes) {
    const uxVals: number[] = [];
    const uyVals: number[] = [];
    const rzVals: number[] = [];
    for (let m = 0; m < modes.length; m++) {
      const uxKey = `${nodeId}:0`;
      const uyKey = `${nodeId}:1`;
      const rzKey = `${nodeId}:2`;
      const uxIdx = dofNum.map.get(uxKey);
      const uyIdx = dofNum.map.get(uyKey);
      const rzIdx = dofNum.map.get(rzKey);
      uxVals.push(uxIdx !== undefined && uxIdx < nf ? modalDisplacements[m][uxIdx] : 0);
      uyVals.push(uyIdx !== undefined && uyIdx < nf ? modalDisplacements[m][uyIdx] : 0);
      rzVals.push(rzIdx !== undefined && rzIdx < nf ? modalDisplacements[m][rzIdx] : 0);
    }
    displacements.push({
      nodeId,
      ux: combineModalResponses(uxVals, modes, rule, xi),
      uy: combineModalResponses(uyVals, modes, rule, xi),
      rz: combineModalResponses(rzVals, modes, rule, xi),
    });
  }

  // Element forces
  const elementForces: SpectralResult['elementForces'] = [];
  const elementIds = new Set<number>();
  for (const ef of modalElementForces[0] ?? []) elementIds.add(ef.elementId);

  for (const eid of elementIds) {
    const nVals: number[] = [];
    const vVals: number[] = [];
    const mVals: number[] = [];
    for (let m = 0; m < modes.length; m++) {
      const ef = modalElementForces[m].find(e => e.elementId === eid);
      if (ef) {
        nVals.push(Math.max(Math.abs(ef.nStart), Math.abs(ef.nEnd)));
        vVals.push(Math.max(Math.abs(ef.vStart), Math.abs(ef.vEnd)));
        mVals.push(Math.max(Math.abs(ef.mStart), Math.abs(ef.mEnd)));
      } else {
        nVals.push(0);
        vVals.push(0);
        mVals.push(0);
      }
    }
    elementForces.push({
      elementId: eid,
      nMax: combineModalResponses(nVals, modes, rule, xi),
      vMax: combineModalResponses(vVals, modes, rule, xi),
      mMax: combineModalResponses(mVals, modes, rule, xi),
    });
  }

  // Base shear: combine modal base shears
  const baseShearVals = perMode.map(pm => pm.modalForce);
  const baseShear = combineModalResponses(baseShearVals, modes, rule, xi);

  return {
    displacements,
    elementForces,
    baseShear,
    perMode,
    rule,
  };
}
