/**
 * TEST ORACLE. Not imported by the app.
 *
 * The TypeScript station extraction (`extractElementStations`) that `computeStationDemands` ran,
 * silently, whenever the engine was not loaded. The app now asks only the engine
 * (`extract_beam_station_buffer_3d`) and throws `EngineUnavailableError` otherwise.
 */
import type { AnalysisResults3D } from '../../types-3d';
import type { LoadCombination } from '../../../store/model.svelte';
import {
  buildCriticalStations,
  extractForcesAtStation,
  extractGoverningDemands,
  type ElementDesignDemands,
  type ElementStationResult,
  type ComboStationResult,
} from '../../station-design-forces';

/** Extract station forces for one element across all combos. */
export function extractElementStationsOracle(
  elementId: number,
  perCombo: Map<number, AnalysisResults3D>,
  comboNames: Map<number, string>,
): ElementStationResult | null {
  // Get element forces from first combo to determine station positions
  const firstCombo = perCombo.values().next().value;
  if (!firstCombo) return null;
  const refEf = firstCombo.elementForces.find(ef => ef.elementId === elementId);
  if (!refEf) return null;

  const stationTs = buildCriticalStations(refEf);

  const comboResults: ComboStationResult[] = [];
  for (const [comboId, results] of perCombo) {
    const ef = results.elementForces.find(e => e.elementId === elementId);
    if (!ef) continue;
    const stations = stationTs.map(t => extractForcesAtStation(ef, t));
    comboResults.push({
      comboId,
      comboName: comboNames.get(comboId) ?? `Combo ${comboId}`,
      stations,
    });
  }

  return {
    elementId,
    length: refEf.length,
    stationTs,
    comboResults,
  };
}


/** `computeStationDemands` as its TypeScript fallback computed it. */
export function computeStationDemandsOracle(
  perCombo3D: Map<number, AnalysisResults3D>,
  combinations: LoadCombination[],
): { demands: Map<number, ElementDesignDemands>; stations: Map<number, ElementStationResult> } {
  const demands = new Map<number, ElementDesignDemands>();
  const stations = new Map<number, ElementStationResult>();
  const comboNames = new Map<number, string>();
  for (const c of combinations) comboNames.set(c.id, c.name);
  const firstCombo = perCombo3D.values().next().value;
  if (!firstCombo) return { demands, stations };
  for (const ef of firstCombo.elementForces) {
    const esr = extractElementStationsOracle(ef.elementId, perCombo3D, comboNames);
    if (esr) {
      stations.set(ef.elementId, esr);
      demands.set(ef.elementId, extractGoverningDemands(esr));
    }
  }
  return { demands, stations };
}
