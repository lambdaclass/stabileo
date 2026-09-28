/**
 * The deflection check, in one place, for every beam — concrete and steel.
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

/** The span limit the check is written against. */
export const DEFLECTION_LIMIT = 'L/360' as const;
/** Long-term multiplier per material family. */
export const LONG_TERM_FACTOR = { concrete: 2.0, steel: 0, other: 0 } as const;

export interface MemberServiceability {
  elementId: number;
  family: 'concrete' | 'steel' | 'other';
  deflection: MemberDeflection;
  check: DeflectionResult;
}

export interface ServiceabilityRun { basis: DeflectionBasis; names: string[]; rows: Map<number, MemberServiceability> }

/** The deflection check of `ids`, or of every beam in the model. */
export function deflectionChecks(ids?: Iterable<number>): ServiceabilityRun {
  const svc = serviceSets();
  const members = ids
    ? [...ids]
    : [...modelStore.elements.keys()].filter((id) => memberKindOf(modelStore.model as never, id) === 'beam');
  const rows = new Map<number, MemberServiceability>();
  for (const [id, d] of serviceDeflections(members, svc.sets)) {
    if (d.L <= 0) continue;
    const e = modelStore.elements.get(id)!;
    const fam = materialFamilyOf(modelStore.materials.get(e.materialId) as never).family;
    const family = fam === 'concrete' ? 'concrete' : fam === 'steel' ? 'steel' : 'other';
    rows.set(id, { elementId: id, family, deflection: d, check: checkDeflection(d.L, d.max, DEFLECTION_LIMIT, LONG_TERM_FACTOR[family]) });
  }
  return { basis: svc.basis, names: svc.names, rows };
}
