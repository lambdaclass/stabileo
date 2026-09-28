/**
 * The project's analysis rules, one field on the model (`analysis`), carried by the snapshot,
 * undo, the `.ded` and the model code.
 *
 *   selfWeight         the self-weight as a load inside a case: which case, which global
 *                      direction, a factor (−1 along Z is gravity) and the members it covers
 *                      (a list, a group, or every member and shell). Absent means the older
 *                      rule the app ran on, self-weight in every dead-load case, which a PRO
 *                      project is migrated off when it opens.
 *   combinationMethod  with one-way members or lifting supports, a combination is either
 *                      solved on its own factored loads ('solveEach', the default) or summed
 *                      from its cases, each solved with its own active set ('superpose').
 *   perCombination     each combination solved linearly, or with P-Delta on its own factored
 *                      loads.
 */

export type GlobalAxis = 'X' | 'Y' | 'Z';

export interface SelfWeightLoad {
  caseId: number;
  direction: GlobalAxis;
  /** Multiplies ρ·A (and ρ·t over a shell) along +direction. Gravity is −1 along Z. */
  factor: number;
  /** Members it covers. Neither this nor `groupId`: every member and shell. */
  elements?: number[];
  groupId?: number;
}

export type CombinationMethod = 'solveEach' | 'superpose';
export type PerCombination = 'linear' | 'pdelta';

export interface AnalysisSettings {
  selfWeight?: SelfWeightLoad[];
  combinationMethod?: CombinationMethod;
  perCombination?: PerCombination;
}

/** The self-weight rule a gravity case gets when none is written: the whole model, downward. */
export const GRAVITY_SELF_WEIGHT = { direction: 'Z' as const, factor: -1 };

/** Whether settings say anything; an empty object is stored as absent. */
export function isEmptyAnalysis(a: AnalysisSettings | undefined): boolean {
  return !a || ((a.selfWeight === undefined) && a.combinationMethod === undefined && a.perCombination === undefined);
}

export interface SelfWeightPlan {
  selfWeight: SelfWeightLoad[];
  /** The dead-load case the weight goes into; `null` when a new one has to be made. */
  caseId: number | null;
  /** How many dead-load cases the older rule would have put it in. */
  deadCases: number;
}

/**
 * The rule a project without one is given: self-weight in its first dead-load case, on the whole
 * model, downward, when the project had self-weight on. With no dead-load case, `caseId` is null
 * and the caller makes one.
 */
export function planSelfWeight(loadCases: ReadonlyArray<{ id: number; type?: string }>, includeSelfWeight: boolean): SelfWeightPlan {
  const dead = loadCases.filter((c) => c.type === 'D');
  if (!includeSelfWeight) return { selfWeight: [], caseId: dead[0]?.id ?? null, deadCases: dead.length };
  const first = dead[0];
  return first
    ? { selfWeight: [{ caseId: first.id, ...GRAVITY_SELF_WEIGHT }], caseId: first.id, deadCases: dead.length }
    : { selfWeight: [], caseId: null, deadCases: 0 };
}
