/**
 * The before/after preview of applying a load plan. Moved out of `load-plan.ts` as it was.
 */
import { expandCombinations, type ExpandOptions } from './combination-cases';
import { msg, type EngineMessage } from '../../codes/message';
import type { LoadPlan } from './load-plan';

// ─── Delta, for the before/after preview ─────────────────────────

/**
 * How many combinations applying the plan adds — counted by the expansion Apply runs
 * (`combination-cases.ts`), so the two cannot disagree. Counting one per wind or seismic case
 * by hand missed both senses of the earthquake, the Wa cases and the snow patterns.
 */
function plannedCombinationCount(plan: LoadPlan, bothSenses: ExpandOptions['bothSenses'], patternsInCompanions?: boolean): number {
  const cases = plan.cases.map((c, i) => ({ id: i + 1, type: c.type, name: String(i), ...(c.alternatives ? { alternatives: c.alternatives } : {}), ...(c.pattern ? { pattern: true } : {}) }));
  return expandCombinations(plan.combinations, cases, { bothSenses, patternsInCompanions }).length;
}


/**
 * What happens to one load case type when the plan is applied.
 *
 * This type exists because the preview used to lie. It reported `after` as the plan's own
 * counts, which is only true when the user has ticked "replace existing loads"; with the
 * box clear, applying a 28-load plan to a model that already had 28 leaves 56, not 28. And
 * a model carrying W and E cases from an earlier run, re-planned with wind and seismic
 * switched off, silently lost every combination that referenced them — the plan simply
 * stopped mentioning them and nothing said so.
 *
 * So every case type present before or after now gets an explicit disposition, and the
 * preview is a function of the replace flag rather than of wishful thinking.
 */
export type CaseAction =
  /** The plan creates this case; the model had none. */
  | 'created'
  /** The plan regenerates loads into a case that already exists. */
  | 'regenerated'
  /**
   * The model has this case, the plan does not produce it, and replace is OFF — so its
   * loads survive untouched. Combinations that referenced it are still regenerated
   * without it, which is why this is reported rather than passed over.
   */
  | 'retained'
  /** The model has this case, the plan does not produce it, and replace is ON: deleted. */
  | 'cleared';

export interface CaseDisposition {
  caseType: string;
  action: CaseAction;
  /** Why — always present, so no disposition is unexplained. */
  reason: EngineMessage;
  /** True when the user loses data or a case stops participating in combinations. */
  lossy: boolean;
}

export interface PlanDelta {
  /** Loads the model currently has, by case type. */
  before: { distributed: number; nodal: number; combinations: number; cases: string[] };
  /** Loads the model WILL have. Accounts for the replace flag. */
  after: { distributed: number; nodal: number; combinations: number; cases: string[] };
  /** New case types the plan introduces. */
  addedCaseTypes: string[];
  /** Case types the plan no longer produces. */
  removedCaseTypes: string[];
  /** One entry per case type touched, added or left behind. Never elides one. */
  dispositions: CaseDisposition[];
  /** Dispositions a user must see before applying. Rendered as warnings, not notes. */
  warnings: EngineMessage[];
  /** True when the plan changes anything at all. */
  changes: boolean;
  /** Echo of the flag the counts were computed under. */
  replaceExisting: boolean;
  /**
   * With replace on, what carries no generator mark in the cases the plan writes into, and the
   * combinations that use them (`store/apply-load-plan.ts`, `replaceScope`); null when there is none.
   * Kept and added to unless `alsoUnmarked`, which is echoed here.
   */
  unmarked: { loads: number; combinations: number; cases: string[] } | null;
  alsoUnmarked: boolean;
}

export interface CurrentLoadState {
  distributed: number;
  nodal: number;
  combinations: number;
  caseTypes: string[];
  /** Existing load counts per case type. Enables an honest `after` when replace is off. */
  perCaseType?: Record<string, { distributed: number; nodal: number }>;
  /**
   * What the generator wrote, per case type, and the combinations a code wrote: what "replace"
   * removes (`apply-load-plan.ts`). Absent: every existing load and combination counts as such.
   */
  generated?: { byType: Record<string, { distributed: number; nodal: number }>; combinations: number };
  /**
   * What carries no generator mark in the cases the plan writes into, by case type, and the
   * combinations using them that no code wrote: typed by hand, edited, or written by a version
   * before the marks. "Replace" keeps them unless asked (`alsoUnmarked`).
   */
  unmarked?: { byType: Record<string, { distributed: number; nodal: number; other?: number }>; combinations: number };
}

/**
 * The before/after the user sees, computed under the flag they actually have set.
 *
 * `replaceExisting` is not optional: getting it wrong is the defect this signature exists
 * to prevent, so a caller has to state it.
 */
export function describePlanDelta(
  plan: LoadPlan,
  current: CurrentLoadState,
  options: { replaceExisting: boolean; bothSenses?: ExpandOptions['bothSenses']; patternsInCompanions?: boolean; alsoUnmarked?: boolean },
): PlanDelta {
  const replace = options.replaceExisting;
  const alsoUnmarked = !!options.alsoUnmarked;
  const afterTypes = [...new Set(plan.cases.map((c) => String(c.type)))].sort();
  const beforeTypes = [...new Set(current.caseTypes)].sort();
  const added = afterTypes.filter((t) => !beforeTypes.includes(t));
  const removed = beforeTypes.filter((t) => !afterTypes.includes(t));

  // A per-action replace (the model says what the generator wrote) leaves the other actions' cases as they are.
  const g = current.generated;
  const clears = replace && !g;
  // What a per-action replace keeps in the cases it regenerates: a project saved before the marks
  // keeps the generator's own loads there, and the plan doubles them. Kept unless asked.
  const u = replace && g ? current.unmarked : undefined;
  const unmarkedIn = (t: string) => { const r = u?.byType[t]; return r ? r.distributed + r.nodal + (r.other ?? 0) : 0; };
  const keepsUnmarked = (t: string) => !alsoUnmarked && unmarkedIn(t) > 0;
  const dispositions: CaseDisposition[] = [];
  for (const t of afterTypes) {
    const existed = beforeTypes.includes(t);
    dispositions.push({
      caseType: t,
      action: existed ? 'regenerated' : 'created',
      reason: msg(existed
        ? 'loadPlan.disposition.regenerated'
        : 'loadPlan.disposition.created', { caseType: t }),
      // Regenerating into a case that keeps its old loads doubles them up. Say so.
      lossy: existed && (!replace || keepsUnmarked(t)),
    });
  }
  for (const t of removed) {
    dispositions.push({
      caseType: t,
      action: clears ? 'cleared' : 'retained',
      reason: msg(clears
        ? 'loadPlan.disposition.cleared'
        : 'loadPlan.disposition.retained', { caseType: t }),
      lossy: true,
    });
  }
  dispositions.sort((a, b) => a.caseType.localeCompare(b.caseType));

  // Counts. With replace ON the plan is the whole model; with it OFF the plan is added to
  // what is there, except combinations, which are always regenerated wholesale.
  // Per action, when the model says what the generator wrote: what it wrote for the plan's actions
  // goes, the rest stays (cases of other actions and everything typed by hand).
  // With `alsoUnmarked`, the unmarked loads of the cases it writes into go too.
  const takenUnmarked = u && alsoUnmarked ? u : undefined;
  const gone = g ? afterTypes.reduce((acc, t) => ({
    distributed: acc.distributed + (g.byType[t]?.distributed ?? 0) + (takenUnmarked?.byType[t]?.distributed ?? 0),
    nodal: acc.nodal + (g.byType[t]?.nodal ?? 0) + (takenUnmarked?.byType[t]?.nodal ?? 0),
  }), { distributed: 0, nodal: 0 }) : null;
  const after = replace && g && gone
    ? {
        distributed: current.distributed - gone.distributed + plan.distributed.length,
        nodal: current.nodal - gone.nodal + plan.nodal.length,
        combinations: current.combinations - g.combinations - (takenUnmarked?.combinations ?? 0) + plannedCombinationCount(plan, options.bothSenses, options.patternsInCompanions),
        cases: [...new Set([...beforeTypes, ...afterTypes])].sort(),
      }
    : replace
    ? {
        distributed: plan.distributed.length, nodal: plan.nodal.length,
        combinations: plannedCombinationCount(plan, options.bothSenses, options.patternsInCompanions), cases: afterTypes,
      }
    : {
        distributed: current.distributed + plan.distributed.length,
        nodal: current.nodal + plan.nodal.length,
        combinations: current.combinations + plannedCombinationCount(plan, options.bothSenses, options.patternsInCompanions),
        cases: [...new Set([...beforeTypes, ...afterTypes])].sort(),
      };

  const warnings: EngineMessage[] = [];
  for (const t of removed) {
    // The load case is one thing; its participation in the combinations is another, and
    // that participation ends either way. That is the part users were not being told.
    warnings.push(msg(clears
      ? 'loadPlan.warning.caseCleared'
      : 'loadPlan.warning.caseRetainedNotCombined', { caseType: t }));
  }
  const unmarkedCases = afterTypes.filter((t) => unmarkedIn(t) > 0);
  const unmarkedLoads = unmarkedCases.reduce((n, t) => n + unmarkedIn(t), 0);
  const unmarked = u && (unmarkedLoads > 0 || u.combinations > 0)
    ? { loads: unmarkedLoads, combinations: u.combinations, cases: unmarkedCases }
    : null;
  if (unmarked) {
    warnings.push(msg(alsoUnmarked ? 'loadPlan.warning.unmarkedRemoved' : 'loadPlan.warning.unmarkedKept', {
      loads: unmarked.loads, combinations: unmarked.combinations, cases: unmarked.cases.join(', ') || '—',
    }));
  }
  if (!replace) {
    const duplicated = afterTypes.filter((t) => beforeTypes.includes(t));
    if (duplicated.length > 0) {
      warnings.push(msg('loadPlan.warning.addedOnTopOfExisting', {
        cases: duplicated.join(', '), count: duplicated.length,
      }));
    }
  }

  return {
    before: {
      distributed: current.distributed, nodal: current.nodal,
      combinations: current.combinations, cases: beforeTypes,
    },
    after, addedCaseTypes: added, removedCaseTypes: removed,
    dispositions, warnings, replaceExisting: replace, unmarked, alsoUnmarked,
    changes: current.distributed !== after.distributed
      || current.nodal !== after.nodal
      || current.combinations !== after.combinations
      || added.length > 0 || removed.length > 0,
  };
}

