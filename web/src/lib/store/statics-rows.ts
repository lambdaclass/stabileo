/**
 * The statics check of the last solve, for every place that shows it: the results table, its CSV
 * and the report. One row per solved load case (`engine/statics-check.ts`), then one per solved
 * combination, whose applied side is the cases' with the combination's factors.
 *
 * It reads the last solve. An edit clears the results (the model store's mutation hook), so the
 * rows never set a solve against a model edited after it. The applied side is the cases as solved
 * (`case-effects.ts`): a composite case's what it takes in, a reduced case's its reduced loads. It
 * read the model's own loads, so a composite case applied nothing against its reactions. A case
 * a combination takes without listing it (a reference case, one not solved alone) is no row of its
 * own, but its applied side is the combination's.
 *
 * An SRSS or ABS combination is a magnitude, in no equilibrium by nature: it is not checked, and
 * named as such (`magnitude`), rather than flagged as out of balance.
 */
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { uiStore } from './ui.svelte';
import { staticsCheck, combinationStatics, type StaticsCheckRow, type ComboStaticsRow } from '../engine/statics-check';
import { withCaseEffects } from '../engine/case-effects';
import { isMagnitudeCombination } from '../engine/result-scopes';
import { toCsv } from '../engine/result-tables';

/** Below this, a residual is round-off. The solve's own residuals sit around 1e-10. */
export const BALANCED = 1e-6;

export interface StaticsRows {
  cases: StaticsCheckRow[];
  combos: ComboStaticsRow[];
  /** The solved SRSS and ABS combinations, not checked: magnitudes, in no equilibrium. */
  magnitude?: Array<{ comboId: number; name: string; method: 'srss' | 'abs' }>;
}

/** The rows of the last solve, or null before one. */
export function staticsRows(): StaticsRows | null {
  const perCase = resultsStore.perCase3D;
  const single = resultsStore.results3D;
  if (perCase.size === 0 && !single) return null;
  const reactionsByCase = new Map<number | null, never>(
    (perCase.size > 0 ? [...perCase].map(([id, r]) => [id, r.reactions]) : [[null, single!.reactions]]) as never,
  );
  const loadCases = modelStore.model.loadCases;
  // The loads each case was solved with, as the solve writes them out (`case-effects.ts`).
  const md = withCaseEffects({
    nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
    loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
    quads: modelStore.quads, plates: modelStore.plates,
    analysis: modelStore.analysis, groups: modelStore.model.groups,
  } as never, loadCases, { includeSelfWeight: uiStore.includeSelfWeight, leftHand: uiStore.axisConvention3D === 'leftHand' });
  const check = (reactions: Map<number | null, never>) => staticsCheck({
    model: md as never,
    reactionsByCase: reactions,
    includeSelfWeight: uiStore.includeSelfWeight,
    caseTypes: new Map(loadCases.map((c) => [c.id, c.type])),
    caseNames: new Map(loadCases.map((c) => [c.id, c.name])),
  });
  const cases = check(reactionsByCase);
  if (perCase.size === 0) return { cases, combos: [] };
  const linear = modelStore.combinations.filter((c) => !isMagnitudeCombination(c));
  // The applied side of the cases a combination takes but the results do not list.
  const unlisted = [...new Set(linear.flatMap((c) => c.factors.map((f) => f.caseId)))].filter((id) => !perCase.has(id) && loadCases.some((c) => c.id === id));
  const applied = unlisted.length ? [...cases, ...check(new Map(unlisted.map((id) => [id, [] as never])))] : cases;
  const combos = combinationStatics(applied, linear, new Map([...resultsStore.perCombo3D].map(([id, r]) => [id, r.reactions])), modelStore.nodes);
  const magnitude = modelStore.combinations.filter((c) => isMagnitudeCombination(c) && resultsStore.perCombo3D.has(c.id))
    .map((c) => ({ comboId: c.id, name: c.name, method: c.method as 'srss' | 'abs' }));
  return { cases, combos, ...(magnitude.length ? { magnitude } : {}) };
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
