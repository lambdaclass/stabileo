/**
 * The statics check of the last solve, for every place that shows it: the results table, its CSV
 * and the report. One row per solved load case (`engine/statics-check.ts`), then one per solved
 * combination, whose applied side is the cases' with the combination's factors.
 *
 * It reads the last solve. An edit clears the results (the model store's mutation hook), so the
 * rows never set a solve against a model edited after it.
 */
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { uiStore } from './ui.svelte';
import { staticsCheck, combinationStatics, type StaticsCheckRow, type ComboStaticsRow } from '../engine/statics-check';
import { toCsv } from '../engine/result-tables';

/** Below this, a residual is round-off. The solve's own residuals sit around 1e-10. */
export const BALANCED = 1e-6;

export interface StaticsRows { cases: StaticsCheckRow[]; combos: ComboStaticsRow[] }

/** The rows of the last solve, or null before one. */
export function staticsRows(): StaticsRows | null {
  const perCase = resultsStore.perCase3D;
  const single = resultsStore.results3D;
  if (perCase.size === 0 && !single) return null;
  const reactionsByCase = new Map<number | null, never>(
    (perCase.size > 0 ? [...perCase].map(([id, r]) => [id, r.reactions]) : [[null, single!.reactions]]) as never,
  );
  const md = {
    nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
    loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
    quads: modelStore.quads, plates: modelStore.plates,
  };
  const cases = staticsCheck({
    model: md as never,
    reactionsByCase,
    includeSelfWeight: uiStore.includeSelfWeight,
    caseTypes: new Map(modelStore.model.loadCases.map((c) => [c.id, c.type])),
    caseNames: new Map(modelStore.model.loadCases.map((c) => [c.id, c.name])),
  });
  const combos = perCase.size > 0
    ? combinationStatics(cases, modelStore.combinations, new Map([...resultsStore.perCombo3D].map(([id, r]) => [id, r.reactions])), modelStore.nodes)
    : [];
  return { cases, combos };
}

const K = ['fx', 'fy', 'fz', 'mx', 'my', 'mz'] as const;

/** Every row with all six components of both sides and of the difference, as CSV. */
export function staticsCsv(rows: StaticsRows, labels: { name: string; kind: string; caseLabel: string; comboLabel: string; applied: string; reactions: string; residual: string; relative: string }): string {
  const units = (k: string) => (k.startsWith('f') ? 'kN' : 'kN·m');
  const header = [labels.kind, labels.name,
    ...K.map((k) => `${labels.applied} Σ${k.toUpperCase()} (${units(k)})`),
    ...K.map((k) => `${labels.reactions} Σ${k.toUpperCase()} (${units(k)})`),
    ...K.map((k) => `${labels.residual} ${k.toUpperCase()} (${units(k)})`), labels.relative];
  const line = (kind: string, r: StaticsCheckRow) => [kind, r.caseName, ...K.map((k) => r.applied[k]), ...K.map((k) => r.reactions[k]), ...K.map((k) => r.difference[k]), r.worstRelative];
  return toCsv(header, [...rows.cases.map((r) => line(labels.caseLabel, r)), ...rows.combos.map((r) => line(labels.comboLabel, r))]);
}
