/**
 * The deflection check, in one place, for every member a limit covers: concrete and steel.
 *
 * It ran for concrete beams only, inside the verification tab, while the report computed its
 * own; steel beams had no deflection check anywhere. Now the verification tab, the report and
 * the Deflections table all read this: the service deflection relative to the chord
 * (`store/service-deflection.ts`) against the span limit, with the long-term multiplier of the
 * member's material — CIRSOC 201's simplified λΔ = 2 for concrete, none for steel, which does
 * not creep.
 */
import { modelStore } from './model.svelte';
import { serviceSets, serviceDeflections, type MemberDeflection, type DeflectionBasis } from './service-deflection';
import { checkDeflection, type DeflectionResult } from '../engine/codes/argentina/serviceability';
import { materialFamilyOf } from '../engine/steel/material-family';
import { memberKindOf } from '../engine/design/member-grouping';
import { ruleFor, readDeflection, DEFAULT_BEAM_RULE, type DeflectionRule, type RuleContext } from '../engine/deflection-limits';

/** The span limit a beam is checked against when the project states none. */
export const DEFLECTION_LIMIT = `L/${DEFAULT_BEAM_RULE.n}` as const;
/** Long-term multiplier per material family. */
export const LONG_TERM_FACTOR = { concrete: 2.0, steel: 0, other: 0 } as const;

export interface MemberServiceability {
  elementId: number;
  family: 'concrete' | 'steel' | 'other';
  deflection: MemberDeflection;
  /** The rule it is checked against, and the deflection that rule reads. */
  rule: DeflectionRule;
  measured: number;
  check: DeflectionResult;
}

export interface ServiceabilityRun { basis: DeflectionBasis; names: string[]; rows: Map<number, MemberServiceability> }

/** How the project's rules see a member: its kind and its groups. */
export function ruleContext(): RuleContext {
  const groupsOf = new Map<number, number[]>();
  for (const g of modelStore.model.groups.values()) {
    for (const id of g.members.elements ?? []) groupsOf.set(id, [...(groupsOf.get(id) ?? []), g.id]);
  }
  return {
    kindOf: (id) => memberKindOf(modelStore.model as never, id),
    groupsOf: (id) => groupsOf.get(id) ?? [],
  };
}

/**
 * The deflection check of `ids`, or of every member a rule covers (every beam, when the project
 * states no rule), against the rule that applies to each: L/n on the direction it reads, over
 * 2L for a cantilever, with the long-term multiplier of the member's material.
 */
export function deflectionChecks(ids?: Iterable<number>): ServiceabilityRun {
  const svc = serviceSets();
  const ctx = ruleContext();
  const limits = modelStore.deflectionLimits;
  const candidates = ids ? [...ids] : [...modelStore.elements.values()].filter((e) => e.type === 'frame').map((e) => e.id);
  const ruled = new Map<number, DeflectionRule>();
  for (const id of candidates) { const r = ruleFor(id, limits, ctx); if (r) ruled.set(id, r); }
  const rows = new Map<number, MemberServiceability>();
  for (const [id, d] of serviceDeflections(ruled.keys(), svc.sets)) {
    const rule = ruled.get(id);
    if (!rule || d.L <= 0) continue;
    const e = modelStore.elements.get(id)!;
    const fam = materialFamilyOf(modelStore.materials.get(e.materialId) as never).family;
    const family = fam === 'concrete' ? 'concrete' : fam === 'steel' ? 'steel' : 'other';
    const measured = readDeflection(d, rule.direction);
    // The length the limit is taken over: the span, or twice it for a cantilever.
    const over = (d.cantilever ? 2 : 1) * d.L;
    rows.set(id, { elementId: id, family, deflection: d, rule, measured, check: checkDeflection(d.L, measured, rule.n, LONG_TERM_FACTOR[family], over) });
  }
  return { basis: svc.basis, names: svc.names, rows };
}
