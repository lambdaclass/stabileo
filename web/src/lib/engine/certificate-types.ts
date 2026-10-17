/**
 * The certificates of the analyses beyond the linear static solve, as the engine's `certify_*`
 * exports return them (docs/verification/CERTIFY.md; Rust types in `engine/src/certify/*.rs`,
 * serde camelCase). An f64 that is +∞ in Rust arrives as null.
 */

type Uncertified = { status: 'uncertified'; reason: string };

/** Enclosure of one ω² near a computed mode; `omega2Upper` null when unbounded. */
export interface ModeEnclosure { omega2Computed: number; omega2Lower: number; omega2Upper: number | null }

/**
 * `completeModes`: the lowest computed modes that are exactly the eigenvalues below
 * `cutoffOmega2` (no mode missed); 0 when completeness could not be certified (`countFailure`).
 */
export type ModalCertificate =
  | { status: 'certified'; modes: ModeEnclosure[]; completeModes: number; cutoffOmega2: number; countFailure: string | null }
  | Uncertified;

/** Newton–Kantorovich bound on the P-Delta fixed point; `stabilityMargin` null when stability is not certified. */
export type PDeltaCertificate =
  | {
      status: 'certified'; absBound: number; relBound: number | null; uniquenessRadius: number | null;
      mu: number; beta: number; residualNorm: number; newtonStep: number; stabilityMargin: number | null;
    }
  | Uncertified;

export interface Enclosure { lo: number; hi: number }

export type SpectralCertificate =
  | {
      status: 'certified';
      modes: Array<{ mode: number; omega2: Enclosure; period: Enclosure; sa: Enclosure; sinTheta: number; shapeError: number }>;
      baseShear: Enclosure;
      maxDisplacementError: number; maxForceError: number; baseShearError: number;
      /** Every reported value lies inside its enclosure. */
      reportedWithin: boolean;
    }
  | Uncertified;

export type HarmonicCertificate =
  | {
      status: 'certified'; a0: number; a1: number;
      points: Array<{ frequency: number; absBound: number; amplitude: Enclosure; reportedError: number }>;
      peakAmplitude: Enclosure; maxReportedError: number; reportedWithin: boolean;
    }
  | Uncertified;

/** Time history: scheme stability for this model and step, and the discrete equations' residuals. */
export interface DynamicsCertificate {
  scheme: string; beta: number; gamma: number; alpha: number | null; dt: number;
  parameters: { unconditionallyStable: boolean; highFrequencyComplex: boolean; conditionallyStable: boolean; omegaCritSq: number | null };
  lambdaMaxUpper: number | null;
  dtCriticalLower: number | null;
  stabilityCertified: boolean;
  stabilityReason: string | null;
  residual: { steps: number; maxAbsEquation: number; maxRelEquation: number; maxRelDisplacementUpdate: number; maxRelVelocityUpdate: number } | null;
  residualReason: string | null;
  timeErrorEstimate: { maxLocalDisplacementError: number; relativeToPeakDisplacement: number } | null;
}

/** λ_c ∈ [lambdaLower, lambdaUpper] from the static and kinematic theorems, checked exactly. */
export interface PlasticCertificate {
  certified: boolean;
  lambdaLower: number | null;
  lambdaUpper: number | null;
  lowerSource: string | null;
  mechanism: Array<{ elementId: number; position: number; rotation: number }>;
  solverCollapseFactor: number | null;
  solverWithinBounds: boolean | null;
  solverDeviation: number | null;
  reason: string | null;
}

/** A certify export's answer without its results: `{ certificate }`. */
export interface CertificateAnswer<C> { certificate: C }

/** One member of a certified design check (`certify_steel/ec3/ec2_members`). */
export interface CertifiedMemberCheck {
  elementId: number;
  certified: boolean;
  reason?: string;
  /** The exact utilization (max over the demands) lies in [utilizationLower, utilizationUpper]. */
  utilizationLower: number;
  utilizationUpper: number;
  certifiedOk: boolean;
  certifiedFail: boolean;
  governingCheck: string;
  checks: Array<{ name: string; lower: number; upper: number }>;
  demandCount: number;
}

/** Bounds |exact − computed| on the forces sent to a design checker (its units). */
export interface DemandBound { n: number; my: number; mz: number; vy: number }
