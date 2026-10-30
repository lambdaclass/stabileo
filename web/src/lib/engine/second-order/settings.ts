/**
 * How the Basic mode's P-Δ and critical-load analyses are calculated: the method for the effect
 * of the axial force, the elements per member at the solve, whether members keep their length,
 * and how many buckling modes are sought.
 */
import type { SecondOrderOptions } from './system';

export type SoMethod = 'consistent' | 'string' | 'phi';

export interface SoSettings {
  method: SoMethod;
  /** Elements per member at the solve. */
  n: number;
  axialRigid: boolean;
  modes: number;
}

export const DEFAULT_SETTINGS: SoSettings = { method: 'consistent', n: 4, axialRigid: false, modes: 4 };

export const ELEMENT_COUNTS = [1, 2, 4, 8] as const;
export const MAX_MODES = 12;

/** The engine solves the consistent geometric matrix with axial stiffness; the rest is the teaching solver's. */
export const usesEngine = (s: Pick<SoSettings, 'method' | 'axialRigid'>): boolean => s.method === 'consistent' && !s.axialRigid;

export const teachingOptions = (s: Pick<SoSettings, 'method' | 'axialRigid'>): SecondOrderOptions => ({ method: s.method, axialRigid: s.axialRigid });

/** B₂ = 1/(1 − 1/λ₁): the amplification of the first buckling mode at the load applied. */
export function firstModeB2(lambda1: number | null): number {
  if (lambda1 === null || Number.isNaN(lambda1)) return NaN;
  if (!Number.isFinite(lambda1)) return 1;
  return lambda1 > 1 ? 1 / (1 - 1 / lambda1) : Infinity;
}
