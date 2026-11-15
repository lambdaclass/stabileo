import { CompleteDemandSet, demandCoverage } from './complete-demand-set';
import type { GoverningDemand } from './station-design-forces';
import type { MemberContext, StationTuple } from './design/other-codes/types';

export interface MemberDemandInput {
  readonly elementId: number;
  readonly demands: readonly GoverningDemand[];
  readonly tuples?: readonly StationTuple[];
  readonly expectedCombinationIds?: readonly number[];
  readonly stationTs?: readonly number[];
}

export function completeMemberDemands<T extends MemberDemandInput>(members: readonly T[]) {
  const coverages = members.map(m => demandCoverage({ combinationIds: [...(m.expectedCombinationIds ?? []), ...m.demands.map(d => d.comboId)], stationTs: m.stationTs }, m.tuples));
  const names = new Map<number, string>();
  for (const c of coverages) for (const d of c.combinations ?? []) names.set(d.comboId, d.comboName);
  for (const m of members) for (const d of m.demands) names.set(d.comboId, d.comboName);
  const combinations = [...new Set(coverages.flatMap(c => c.combinationIds))].map(comboId => ({ comboId, comboName: names.get(comboId) }));
  return CompleteDemandSet.require({ combinations, members: members.map((m, i) => ({ elementId: m.elementId, stationTs: coverages[i]!.stationTs })) },
    members.flatMap(member => (member.tuples ?? []).map(tuple => ({ elementId: member.elementId, comboId: tuple.comboId, stationT: tuple.forces.t, tuple, member }))));
}

export type CompleteMemberContexts = ReturnType<typeof completeMemberDemands<MemberContext>>;
