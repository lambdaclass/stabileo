import type { LoadCombination } from '../../../store/model.svelte';
import { resolveCombinationFactors } from '../../solver-service';
import { CompleteDemandSet, IncompleteConcurrentDemandError } from '../../complete-demand-set';
import type { ComboStationResult, ElementStationResult } from '../../station-design-forces';

export type SeismicDemandRefusal =
  | 'seisDes.issue.noSeismicCombinations'
  | 'seisDes.issue.uncombinedCase'
  | 'seisDes.issue.incompleteStations';

type SeismicDemandScope = {
  combinations: readonly LoadCombination[];
  refusal: SeismicDemandRefusal | null;
};

export function seismicDemandScope(cases: ReadonlySet<number>, active: LoadCombination[]): SeismicDemandScope {
  const normalized = cases.size ? resolveCombinationFactors(active) : [];
  const covered = new Set<number>();
  const combinations = typeof normalized === 'string' ? [] : normalized.filter(combo => {
    const contributing = combo.factors.filter(f => cases.has(f.caseId) && Number.isFinite(f.factor) && f.factor !== 0);
    for (const { caseId } of contributing) covered.add(caseId);
    return contributing.length > 0;
  });
  const refusal = covered.size !== cases.size ? 'seisDes.issue.uncombinedCase'
    : !combinations.length ? 'seisDes.issue.noSeismicCombinations' : null;
  return { combinations, refusal };
}

export class CompleteSeismicStations {
  readonly #combinationIds: ReadonlySet<number>;

  private constructor(readonly groups: readonly ComboStationResult[]) {
    this.#combinationIds = new Set(groups.map(group => group.comboId));
  }

  hasCombination(id: number): boolean {
    return this.#combinationIds.has(id);
  }

  static read(scope: SeismicDemandScope, stations: ElementStationResult | undefined): CompleteSeismicStations | SeismicDemandRefusal {
    if (scope.refusal) return scope.refusal;
    if (!stations) return 'seisDes.issue.incompleteStations';
    const { elementId, stationTs, inventory } = stations;
    const ids = new Set(scope.combinations.map(combo => combo.id));
    const groups = stations.comboResults.filter(group => ids.has(group.comboId));
    try {
      const declared = inventory?.coverageForMember(elementId).combinationStations;
      const declaredByCombo = new Map(declared?.map(combo => [combo.comboId, combo.stationTs]));
      CompleteDemandSet.require({
        combinations: scope.combinations.map(({ id: comboId, name: comboName }) => ({
          comboId, comboName,
          members: [{ elementId, stationTs: [...stationTs, ...(declaredByCombo.get(comboId) ?? [])] }],
        })),
      }, groups.flatMap(group => group.stations.map(station => ({ elementId, comboId: group.comboId, stationT: station.t }))));
    } catch (error) {
      if (!(error instanceof IncompleteConcurrentDemandError)) throw error;
      return 'seisDes.issue.incompleteStations';
    }
    return new CompleteSeismicStations(groups);
  }
}
