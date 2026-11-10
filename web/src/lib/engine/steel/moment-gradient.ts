/**
 * Cb of one unbraced segment, CIRSOC 301 §F.1(3) Ec. F.1-1, as the engine computes it
 * (`engine/src/postprocess/cirsoc301_inputs.rs`). Computing Cb does not certify the bracing that
 * bounds the segment (Apéndice 6 §6.1).
 */
import { cirsoc301InputsRequest } from './cirsoc301-inputs';

export { registerCirsoc301InputsKernel, cirsoc301InputsAvailable } from './cirsoc301-inputs';

export interface StationMoment {
  t: number;
  m: number;
}

export type CbBasis = 'computed' | 'unityRequiredCantilever' | 'unityNoDiagram' | 'unityOutOfScope';

export type ShapeSymmetry = 'double' | 'single' | 'none' | 'unknown';

export interface MomentGradient {
  cb: number;
  basis: CbBasis;
  reasonKey: string;
  mMax: number;
  mA: number;
  mB: number;
  mC: number;
  curvature: 'single' | 'double' | 'none';
  symmetry: ShapeSymmetry;
}

export interface MomentGradientInput {
  stations: readonly StationMoment[];
  tStart?: number;
  tEnd?: number;
  shape?: string;
  cantileverFreeEnd?: boolean;
}

export function momentGradient(input: MomentGradientInput): MomentGradient {
  return cirsoc301InputsRequest<MomentGradient>('momentGradient', 'the CIRSOC 301 moment gradient Cb', input);
}

export const cbBasisKey = (b: CbBasis): string => `steel.cb.basis.${b}`;
