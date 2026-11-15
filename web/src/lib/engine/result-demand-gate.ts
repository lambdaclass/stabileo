import { CompleteDemandSet, demandCoverage, memberDemandScope } from './complete-demand-set';
import { ConcurrentDemand } from './concurrent-demand';
import type { ElementDesignDemands } from './station-design-forces';
import type { AnalysisResults3D } from './types-3d';
import type { GoverningPerElement3D } from './governing-case';

export function completeResultDemands(
  results: AnalysisResults3D,
  elementIds: readonly number[],
  stationDemands?: ReadonlyMap<number, ElementDesignDemands>,
  governing?: ReadonlyMap<number, GoverningPerElement3D> | null,
) {
  const forces = new Map(results.elementForces.map(ef => [ef.elementId, ef]));
  CompleteDemandSet.require({ combinations: elementIds.length ? [{ comboId: 0, members: elementIds.map(elementId => ({ elementId, stationTs: [0] })) }] : [] },
    results.elementForces.map(ef => ({ elementId: ef.elementId, comboId: 0, stationT: 0 })), [0]);
  const snapshots = new WeakMap<readonly ConcurrentDemand[], readonly ConcurrentDemand[]>();
  const members = elementIds.map(elementId => {
    const ef = forces.get(elementId)!;
    const demands = stationDemands?.get(elementId);
    const needsStations = stationDemands !== undefined || governing?.has(elementId);
    const source = needsStations ? demands?.concurrent ?? [] : ConcurrentDemand.endpoints(ef);
    const previous = snapshots.get(source);
    const tuples = previous && previous.length === source.length && previous.every((d, i) => d === source[i])
      ? previous : Object.freeze([...source]);
    snapshots.set(source, tuples);
    const coverage = demandCoverage({ combinationIds: [...(demands?.expectedCombinationIds ?? []), ...(demands?.demands.map(d => d.comboId) ?? []),
      ...Object.values(governing?.get(elementId) ?? {}).flatMap(d => d ? [d.comboId] : [])], stationTs: demands?.stationTs }, tuples);
    return { elementId, ef, demands, tuples, coverage };
  });
  const names = new Map<number, string>();
  for (const m of members) for (const c of m.coverage.combinations ?? []) names.set(c.comboId, c.comboName);
  for (const m of members) for (const d of m.tuples) if (!names.has(d.comboId)) names.set(d.comboId, d.comboName);
  const combinations = [...new Set(members.flatMap(m => m.coverage.combinationIds))].map(comboId => ({ comboId, comboName: names.get(comboId) ?? '' }));
  return CompleteDemandSet.require(memberDemandScope(members.map(m => ({ elementId: m.elementId, ...m.coverage, combinations }))),
    members.flatMap(member => member.tuples.map(tuple => ({ elementId: member.demands?.elementId ?? member.elementId, comboId: tuple.comboId, stationT: tuple.stationT, member, tuple }))));
}

export type CompleteResultDemands = ReturnType<typeof completeResultDemands>;
