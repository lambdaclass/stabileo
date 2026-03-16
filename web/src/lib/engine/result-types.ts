// Shared result types for advanced analysis solvers (WASM-only)
//
// Extracted from individual TS solver files that have been replaced by Rust WASM.
// Types are still needed by stores, canvas drawing, and UI components.

import type { AnalysisResults } from './types';
import type { AnalysisResults3D } from './types-3d';
import type { SolverDiagnostic } from './types';

// ─── Plastic Analysis ──────────────────────────────────────────

export interface PlasticHinge {
  elementId: number;
  end: 'start' | 'end';
  moment: number;
  loadFactor: number;
  step: number;
  position?: number;
}

export interface PlasticStep {
  loadFactor: number;
  hingesFormed: PlasticHinge[];
  results: AnalysisResults;
}

export interface PlasticResult {
  collapseFactor: number;
  steps: PlasticStep[];
  hinges: PlasticHinge[];
  isMechanism: boolean;
  redundancy: number;
}

export interface PlasticConfig {
  maxHinges?: number;
  mpOverrides?: Map<number, number>;
}

export interface PlasticStep3D {
  loadFactor: number;
  hingesFormed: PlasticHinge[];
  results: AnalysisResults3D;
}

export interface PlasticResult3D {
  collapseFactor: number;
  steps: PlasticStep3D[];
  hinges: PlasticHinge[];
  isMechanism: boolean;
  redundancy: number;
}

// ─── P-Delta Analysis ──────────────────────────────────────────

export interface PDeltaConfig {
  maxIter?: number;
  tolerance?: number;
}

export interface PDeltaResult {
  results: AnalysisResults;
  iterations: number;
  converged: boolean;
  isStable: boolean;
  b2Factor: number;
  amplification: Array<{ nodeId: number; ratio: number }>;
  linearResults: AnalysisResults;
}

export interface PDeltaResult3D {
  results: AnalysisResults3D;
  iterations: number;
  converged: boolean;
  isStable: boolean;
  b2Factor: number;
  amplification: Array<{ nodeId: number; ratio: number }>;
  linearResults: AnalysisResults3D;
  diagnostics?: SolverDiagnostic[];
}

export interface PDeltaConfig3D {
  maxIterations?: number;
  tolerance?: number;
}

// ─── Modal Analysis ────────────────────────────────────────────

export interface ModeShape {
  frequency: number;
  period: number;
  omega: number;
  displacements: Array<{ nodeId: number; ux: number; uy: number; rz: number }>;
  participationX: number;
  participationY: number;
  effectiveMassX: number;
  effectiveMassY: number;
  massRatioX: number;
  massRatioY: number;
}

export interface RayleighDamping {
  a0: number;
  a1: number;
  omega1: number;
  omega2: number;
  dampingRatios: number[];
}

export interface ModalResult {
  modes: ModeShape[];
  nDof: number;
  totalMass: number;
  cumulativeMassRatioX: number;
  cumulativeMassRatioY: number;
  rayleigh?: RayleighDamping;
}

export interface ModeShape3D {
  frequency: number;
  period: number;
  omega: number;
  displacements: Array<{
    nodeId: number;
    ux: number; uy: number; uz: number;
    rx: number; ry: number; rz: number;
  }>;
  participationX: number;
  participationY: number;
  participationZ: number;
  effectiveMassX: number;
  effectiveMassY: number;
  effectiveMassZ: number;
  massRatioX: number;
  massRatioY: number;
  massRatioZ: number;
}

export interface ModalResult3D {
  modes: ModeShape3D[];
  nDof: number;
  totalMass: number;
  cumulativeMassRatioX: number;
  cumulativeMassRatioY: number;
  cumulativeMassRatioZ: number;
  diagnostics?: SolverDiagnostic[];
}

// ─── Buckling Analysis ─────────────────────────────────────────

export interface BucklingMode {
  loadFactor: number;
  displacements: Array<{ nodeId: number; ux: number; uy: number; rz: number }>;
}

export interface ElementBucklingData {
  elementId: number;
  axialForce: number;
  criticalForce: number;
  kEffective: number;
  effectiveLength: number;
  length: number;
  slenderness: number;
}

export interface BucklingResult {
  modes: BucklingMode[];
  nDof: number;
  elementData: ElementBucklingData[];
}

export interface BucklingMode3D {
  loadFactor: number;
  displacements: Array<{
    nodeId: number;
    ux: number; uy: number; uz: number;
    rx: number; ry: number; rz: number;
  }>;
}

export interface ElementBucklingData3D {
  elementId: number;
  axialForce: number;
  criticalForce: number;
  kEffective: number;
  effectiveLength: number;
  length: number;
  slendernessY: number;
  slendernessZ: number;
}

export interface BucklingResult3D {
  modes: BucklingMode3D[];
  nDof: number;
  elementData: ElementBucklingData3D[];
  diagnostics?: SolverDiagnostic[];
}

// ─── Spectral Analysis ─────────────────────────────────────────

export interface DesignSpectrum {
  name: string;
  points: Array<{ period: number; sa: number }>;
  inG?: boolean;
}

export type CombinationRule = 'SRSS' | 'CQC';

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

/** CIRSOC 103 elastic design spectrum (simplified) */
export function cirsoc103Spectrum(
  zone: 1 | 2 | 3 | 4,
  soilType: 'I' | 'II' | 'III',
): DesignSpectrum {
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

  const SaMax = 2.5 * a * ca;
  const points: Array<{ period: number; sa: number }> = [
    { period: 0, sa: a * ca },
    { period: t0, sa: SaMax },
    { period: ts, sa: SaMax },
  ];

  for (let T = ts + 0.1; T <= 6; T += 0.1) {
    points.push({ period: T, sa: a * cv * ts / T });
  }

  return {
    name: `CIRSOC 103 Zona ${zone}, Suelo ${soilType}`,
    points,
    inG: true,
  };
}

export interface SpectralConfig {
  direction: 'X' | 'Y';
  spectrum: DesignSpectrum;
  rule?: CombinationRule;
  xi?: number;
  importanceFactor?: number;
  reductionFactor?: number;
}

export interface SpectralResult {
  displacements: Array<{ nodeId: number; ux: number; uy: number; rz: number }>;
  elementForces: Array<{
    elementId: number;
    nMax: number; vMax: number; mMax: number;
  }>;
  baseShear: number;
  perMode: Array<{
    mode: number;
    period: number;
    sa: number;
    sd: number;
    participation: number;
    modalForce: number;
  }>;
  rule: CombinationRule;
}

export interface SpectralConfig3D {
  direction: 'X' | 'Y' | 'Z';
  spectrum: DesignSpectrum;
  rule?: CombinationRule;
  xi?: number;
  importanceFactor?: number;
  reductionFactor?: number;
}

export interface SpectralResult3D {
  baseShear: number;
  results: AnalysisResults3D;
  perMode: Array<{
    mode: number;
    period: number;
    sa: number;
    shear: number;
  }>;
  rule: CombinationRule;
  diagnostics?: SolverDiagnostic[];
}
