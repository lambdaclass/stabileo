/**
 * What PRO's exports draw and write their results from.
 *
 * Every export dialog offers the same choice: the results on screen, one load case, one
 * combination or the envelope. They are read from the store as solved, never switched on screen:
 * exporting a combination does not change what the reader is looking at.
 *
 * An export that needs results solves first, with PRO's own solve (`runGlobalSolve`), the one
 * Calcular runs, so floor loads kept as definitions are rewritten as they are for the screen.
 */
import { modelStore, resultsStore } from '../store';
import { t } from '../i18n';
import { runGlobalSolve } from '../engine/live-calc';
import { resultSetName } from '../export/figure';
import { magnitudeLabel } from '../engine/result-scopes';
import type { AnalysisResults3D } from '../engine/types-3d';

/** A result set an export can be made of: `screen`, `case:3`, `combo:2` or `envelope`. */
export type ResultSetKey = string;

export interface ResultSetChoice { key: ResultSetKey; label: string }

/** Solve unless the model has results; whether it has them afterwards. */
export async function ensureProResults(): Promise<boolean> {
  if (resultsStore.results3D) return true;
  if (modelStore.nodes.size === 0) return false;
  await runGlobalSolve();
  return !!resultsStore.results3D;
}

/** A set's label with what its numbers are when they are SRSS or ABS magnitudes. */
const tagged = (label: string, r: AnalysisResults3D | null | undefined) => { const m = magnitudeLabel(r, t); return m ? `${label} (${m})` : label; };

/** The sets there are to choose from, the screen's first. */
export function resultSetChoices(): ResultSetChoice[] {
  const out: ResultSetChoice[] = [{ key: 'screen', label: tagged(`${t('proExport.resultsScreen')} (${resultSetName()})`, resultsStore.results3D) }];
  for (const c of modelStore.model.loadCases) {
    if (resultsStore.perCase3D.has(c.id)) out.push({ key: `case:${c.id}`, label: `${t('proExport.resultsCase')} ${c.name}` });
  }
  for (const c of modelStore.combinations) {
    if (resultsStore.perCombo3D.has(c.id)) out.push({ key: `combo:${c.id}`, label: tagged(`${t('proExport.resultsCombo')} ${c.name}`, resultsStore.perCombo3D.get(c.id)) });
  }
  if (resultsStore.envelope3D) out.push({ key: 'envelope', label: t('tables.mode.envelope') });
  return out;
}

/** The results of a set and the name a heading gives them; the screen's when the set is gone. */
export function resultSet(key: ResultSetKey): { results: AnalysisResults3D | null; name: string } {
  const [kind, id] = key.split(':');
  const n = Number(id);
  if (kind === 'case' && resultsStore.perCase3D.has(n)) {
    return { results: resultsStore.perCase3D.get(n)!, name: modelStore.model.loadCases.find((c) => c.id === n)?.name ?? `${t('pro.caseN')}${n}` };
  }
  if (kind === 'combo' && resultsStore.perCombo3D.has(n)) {
    return { results: resultsStore.perCombo3D.get(n)!, name: modelStore.combinations.find((c) => c.id === n)?.name ?? `${t('pro.comboN')}${n}` };
  }
  if (kind === 'envelope' && resultsStore.envelope3D) {
    return { results: resultsStore.envelope3D.maxAbsResults3D, name: t('tables.mode.envelope') };
  }
  return { results: resultsStore.results3D, name: resultSetName() };
}

export function hasResultSet(key: ResultSetKey): boolean {
  const [kind, id] = key.split(':');
  const n = Number(id);
  if (kind === 'case') return resultsStore.perCase3D.has(n);
  if (kind === 'combo') return resultsStore.perCombo3D.has(n);
  if (kind === 'envelope') return !!resultsStore.envelope3D && id === undefined;
  return false;
}

/** The set on screen as a key a re-run can select again: the screen itself only for the factor-1 sum. */
export function screenSetKey(): ResultSetKey {
  const v = resultsStore.activeView;
  if (v === 'envelope' && resultsStore.envelope3D) return 'envelope';
  if (v === 'combo' && resultsStore.activeComboId !== null) return `combo:${resultsStore.activeComboId}`;
  if (v === 'single' && resultsStore.activeCaseId !== null && resultsStore.perCase3D.has(resultsStore.activeCaseId)) return `case:${resultsStore.activeCaseId}`;
  return 'screen';
}

/** What a report is of unless the user picks otherwise: the envelope when there are combinations, the one case when there is one. */
export function defaultReportSetKey(): ResultSetKey {
  if (resultsStore.envelope3D && resultsStore.perCombo3D.size > 0) return 'envelope';
  if (resultsStore.perCase3D.size === 1) return `case:${[...resultsStore.perCase3D.keys()][0]}`;
  return 'screen';
}

/** Whether the model has shells: PRO's figures and files then offer theirs. */
export function hasShells(): boolean {
  return modelStore.plates.size + modelStore.quads.size > 0;
}
