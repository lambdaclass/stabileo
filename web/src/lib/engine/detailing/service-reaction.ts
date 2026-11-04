/**
 * A support's service reaction under gravity: the unit-factor sum of its gravity cases (dead,
 * live, roof live, snow, rain). Wind and earthquake are left out, since the project models no
 * service factors for them. Shared by the footing check and the footing pre-sizing, so the two
 * read the same load.
 */
import type { CaseReaction } from './run-footing-design';

/** Load-case types that contribute to the service gravity sum. */
export const GRAVITY_CASES: ReadonlySet<string> = new Set(['D', 'L', 'Lr', 'S', 'R']);
/** Load-case types whose SERVICE combination factors this project does not model. */
export const LATERAL_CASES: ReadonlySet<string> = new Set(['W', 'E']);

export interface ServiceGravity {
  /** Downward axial, kN, as a magnitude. */
  axial: number;
  /** Reaction moments about global X and Y, kN·m. */
  mx: number; my: number;
  /** The case types summed, in order. */
  caseTypes: string[];
  /** Lateral cases that load the support and were left out. */
  lateralLeftOut: number;
}

/** Null when no gravity case is among the cases. */
export function serviceGravity(cases: readonly CaseReaction[]): ServiceGravity | null {
  const gravity = cases.filter((c) => GRAVITY_CASES.has(c.caseType));
  if (gravity.length === 0) return null;
  return {
    axial: Math.abs(gravity.reduce((s, c) => s + c.fz, 0)),
    mx: gravity.reduce((s, c) => s + c.mx, 0),
    my: gravity.reduce((s, c) => s + c.my, 0),
    caseTypes: gravity.map((c) => c.caseType),
    lateralLeftOut: cases.filter((c) => LATERAL_CASES.has(c.caseType) && (c.fz !== 0 || c.mx !== 0 || c.my !== 0)).length,
  };
}
