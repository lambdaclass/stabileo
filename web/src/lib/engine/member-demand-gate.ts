import { CompleteDemandSet, IncompleteConcurrentDemandError, demandCoverage, memberDemandScope } from './complete-demand-set';
import type { GoverningDemand } from './station-design-forces';
import type { MemberContext, StationTuple } from './design/other-codes/types';

export interface MemberDemandInput {
  readonly elementId: number;
  readonly demands: readonly GoverningDemand[];
  readonly tuples?: readonly StationTuple[];
  readonly expectedCombinationIds?: readonly number[];
  readonly stationTs?: readonly number[];
}

export function completeMemberDemands<T extends MemberDemandInput>(members: readonly T[], memberIds?: readonly number[]) {
  for (const m of members) {
    if (m.tuples?.length && m.tuples.some(t => !t.inventory && !t.coverage)
      && (!m.expectedCombinationIds || !m.stationTs)) throw new IncompleteConcurrentDemandError([{ code: 'missing-scope', elementId: m.elementId }], 'A coverage inventory or declared combinations and stations is required');
  }
  const coverages = members.map(m => demandCoverage({ combinationIds: [...(m.expectedCombinationIds ?? []), ...m.demands.map(d => d.comboId)], stationTs: m.stationTs }, m.tuples));
  const names = new Map<number, string>();
  for (const c of coverages) for (const d of c.combinations ?? []) names.set(d.comboId, d.comboName);
  for (const m of members) for (const d of m.demands) names.set(d.comboId, d.comboName);
  const combinations = [...new Set(coverages.flatMap(c => c.combinationIds))].map(comboId => ({ comboId, comboName: names.get(comboId) ?? '' }));
  return CompleteDemandSet.require(memberDemandScope(members.map((m, i) => ({ elementId: m.elementId, ...coverages[i]!, combinations }))),
    members.flatMap((member, i) => (member.tuples ?? []).map(tuple => ({ coverage: coverages[i]!, elementId: member.elementId, comboId: tuple.comboId, stationT: tuple.forces.t, tuple, inventory: tuple.inventory ?? tuple.coverage?.inventory, member, governing: false as boolean }))), undefined, memberIds);
}

export function completeMemberCases<T extends MemberDemandInput>(complete: ReturnType<typeof completeMemberDemands<T>>) {
  const members = new Map(complete.values.map(row => [row.member, row.coverage]));
  return complete.prepend([...members].flatMap(([member, coverage]) => member.demands.map(tuple => ({
    coverage, elementId: member.elementId, comboId: tuple.comboId, stationT: tuple.forces.t, tuple, inventory: complete.inventory, member, governing: true,
  }))));
}

export type CompleteMemberContexts = ReturnType<typeof completeMemberDemands<MemberContext>>;
