import { ConcurrentDemand } from '../../concurrent-demand';
import { demandCoverage } from '../../complete-demand-set';
import { checkSteelMember } from '../../verification-service';

export function declaredTestDemands(tuples: Parameters<typeof ConcurrentDemand.fromTuples>[0]) {
  if (!tuples.length) return [];
  const rows = tuples.map(t => ({ ...t, elementId: t.elementId ?? 1 }));
  return ConcurrentDemand.fromTuples(rows, demandCoverage({ combinationIds: rows.map(t => t.comboId), stationTs: [] }, rows));
}

export function checkDeclaredSteelMember(...args: Parameters<typeof checkSteelMember>) {
  const demand = args[1];
  if (demand.tuples && !demand.concurrent && !demand.coverage) args[1] = { ...demand, coverage: {
    combinationIds: [...new Set(demand.tuples.map(t => t.comboId))], stationTs: [],
    combinationStations: [...new Set(demand.tuples.map(t => t.comboId))].map(comboId => ({ comboId,
      stationTs: demand.tuples!.filter(t => t.comboId === comboId).map(t => t.t) })),
  } };
  args[1] = { ...args[1], memberId: args[0] };
  return checkSteelMember(...args);
}
