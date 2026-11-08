/**
 * Cb of one unbraced segment, CIRSOC 301 §F.1(3) Ec. F.1-1, as the engine computes it
 * (`engine/src/postprocess/cirsoc301_inputs.rs`). Computing Cb does not certify the bracing that
 * bounds the segment (Apéndice 6 §6.1).
 */
import { EngineCheckError, EngineUnavailableError } from '../engine-unavailable';

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

type JsonFn = (json: string) => string;

let kernel: JsonFn | null = null;

export function registerCirsoc301InputsKernel(fn: JsonFn | null): void { kernel = fn; }

export function cirsoc301InputsAvailable(): boolean { return kernel !== null; }

const WHAT = 'the CIRSOC 301 moment gradient Cb';

export function momentGradient(input: MomentGradientInput): MomentGradient {
  if (!kernel) throw new EngineUnavailableError(WHAT);
  let raw: string;
  try { raw = kernel(JSON.stringify({ op: 'momentGradient', ...input })); }
  catch (e) { throw new EngineCheckError(WHAT, e instanceof Error ? e.message : String(e)); }
  return JSON.parse(raw) as MomentGradient;
}

export const cbBasisKey = (b: CbBasis): string => `steel.cb.basis.${b}`;
