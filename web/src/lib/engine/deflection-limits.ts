/**
 * Deflection limits as project data: which members are checked, against which span ratio, and in
 * which direction.
 *
 * A rule names its members by kind (beams, columns), by group, or one by one, and gives L/n and
 * the direction it is read in: the resultant, or one local plane. The most specific rule wins:
 * members named one by one over a group, a group over a kind. With no rule for it, a beam is
 * checked at L/360 on the resultant, which is what the check always did, and any other member is
 * not checked.
 *
 * A cantilever (a span with one free end, `deflection-spans.ts`) is measured from the tangent at
 * its root, not from its chord, and its limit is taken over twice its length: 2L/n, so L/360
 * reads L/180 on the cantilever's own length.
 *
 * Pure.
 */

export type DeflectionDirection = 'resultant' | 'localY' | 'localZ';

export type DeflectionScope =
  | { kind: 'memberKind'; value: 'beam' | 'column' }
  | { kind: 'group'; groupId: number }
  | { kind: 'members'; ids: number[] };

export interface DeflectionRule {
  id: number;
  scope: DeflectionScope;
  /** The limit is L/n. */
  n: number;
  direction: DeflectionDirection;
}

export interface DeflectionLimits { rules: DeflectionRule[] }

/** The rule a beam gets when none is stated. */
export const DEFAULT_BEAM_RULE: DeflectionRule = { id: 0, scope: { kind: 'memberKind', value: 'beam' }, n: 360, direction: 'resultant' };

const RANK = { members: 3, group: 2, memberKind: 1 } as const;

export interface RuleContext {
  kindOf(elementId: number): 'beam' | 'column' | 'wall' | null;
  groupsOf(elementId: number): readonly number[];
}

/** The rule that applies to a member, or null when it is not checked. */
export function ruleFor(elementId: number, limits: DeflectionLimits | undefined, ctx: RuleContext): DeflectionRule | null {
  let best: DeflectionRule | null = null;
  let rank = 0;
  const groups = ctx.groupsOf(elementId);
  const kind = ctx.kindOf(elementId);
  for (const r of limits?.rules ?? []) {
    const hit = r.scope.kind === 'members' ? r.scope.ids.includes(elementId)
      : r.scope.kind === 'group' ? groups.includes(r.scope.groupId)
      : r.scope.value === kind;
    if (!hit) continue;
    const k = RANK[r.scope.kind];
    // Among rules of the same rank the later one wins: it was written after.
    if (k >= rank) { best = r; rank = k; }
  }
  if (best) return best;
  return kind === 'beam' ? DEFAULT_BEAM_RULE : null;
}

/** The deflection a rule reads: the resultant, or one local plane. */
export function readDeflection(d: { max: number; maxV: number; maxW: number }, direction: DeflectionDirection): number {
  return direction === 'localY' ? d.maxV : direction === 'localZ' ? d.maxW : d.max;
}

/** How a rule reads, "L/360", "2L/360", with its direction. */
export function ruleLabel(rule: DeflectionRule, cantilever = false): string {
  return `${cantilever ? '2L' : 'L'}/${rule.n}`;
}
