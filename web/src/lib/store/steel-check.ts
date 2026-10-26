/**
 * The CIRSOC 301 check of every steel member against the analysis on hand, published to the
 * verification store, so each steel bar's utilisation shows in the design table and colours the
 * 3D view like a concrete member's. The same demands, lengths and unbraced lengths the profile
 * optimiser reads.
 */
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { verificationStore } from './verification.svelte';
import { activeCombinations, activePerCombo3D } from './active-results';
import { computeStationDemands, runSteelVerification } from '../engine/verification-service';
import { memberLengths } from '../engine/steel/unbraced-length';
import type { AnalysisResults3D } from '../engine/types-3d';

export function runSteelCheck(): { checked: number } | { refused: 'noResults' } {
  const results3D = resultsStore.results3D;
  if (!results3D) return { refused: 'noResults' };
  const md = { elements: modelStore.elements, nodes: modelStore.nodes, sections: modelStore.sections, materials: modelStore.materials, supports: modelStore.supports };
  let perCombo: Map<number, AnalysisResults3D> = activePerCombo3D();
  let combos = activeCombinations();
  if (perCombo.size === 0) { perCombo = new Map([[0, results3D]]); combos = [{ id: 0, name: '', factors: [] }] as never; }
  const { demands, stations } = computeStationDemands(perCombo, combos, md as never);
  /*
   * The whole of each member's lengths: `chain`, so F.1.1 reads the diagram over the unbraced
   * segment (`steelSegmentDiagram`), and `freeEnd`, so a cantilever takes Cb = 1. Both were dropped
   * here, and the desk's check read Cb from the element's own diagram: 2,3 on a cantilever.
   */
  const lengths = new Map([...memberLengths(modelStore.model)].map(([id, l]) => [id, { L: l.L, Lb: l.Lb, chain: l.chain, freeEnd: l.freeEnd }]));
  const verifs = runSteelVerification(results3D, md as never, demands, stations, lengths);
  verificationStore.setSteel(verifs);
  return { checked: verifs.length };
}
