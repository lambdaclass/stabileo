/**
 * What the regression of the sheets' proposals runs on a gallery example: solved once, designed
 * under each code, every row either verifies or is a proposal with no reinforcement for its section
 * and concrete that offers an alternative it verifies with.
 */
import { expect } from 'vitest';
import { historyStore, modelStore, uiStore, resultsStore } from '..';
import { ensurePhysicalModel } from '../plates-from-shells';
import { preparePlatesForAnalysis } from '../physical-plates';
import { meshBeforeAnalysis } from '../mesh-policy.svelte';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows, setSheetCode, type SheetRow } from '../rc-sheets.svelte';
import { patchDesignData, designData } from '../design-data';
import { alternatives, lineAlternatives, noArrangement } from '../rc-sheets-resize';
import { lineRowStatus } from '../../rc-sheets/beam-line';
import { PRO_EXAMPLES } from '../../data/pro-examples';
import { SHEET_CODE_LIST, type SheetCode } from '../../rc-sheets/types';

export async function solveExample(id: string): Promise<void> {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
  await PRO_EXAMPLES.find((e) => e.id === id)!.load();
  ensurePhysicalModel();
  meshBeforeAnalysis.value = true;
  preparePlatesForAnalysis();
  syncDefinedLoadsForAnalysis(); recognizePhysicalElements();
  resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
  publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
}

/** The rows that do not verify under `code`, by name, each checked to say it has no reinforcement and to offer an alternative. */
export function failingUnder(code: SheetCode, seismic = false): string[] {
  setSheetCode(code);
  patchDesignData({ designOptions: { ...(designData().designOptions ?? {}), seismic: seismic || undefined } as never });
  const rows = buildSheetRows();
  const out: string[] = [];
  for (const l of rows.line) {
    const spans = rows.beam.filter((r) => r.demand.line?.group === l.group);
    if (lineRowStatus(l, spans) !== 'fail') continue;
    out.push(`line ${l.name}`);
    expect(noArrangement(l, spans), `${code} ${l.name}`).toBe(true);
    expect(lineAlternatives(l, spans).length, `${code} ${l.name}`).toBeGreaterThan(0);
  }
  const rest: SheetRow[] = [...rows.column, ...rows.slab, ...rows.wall, ...rows.punching];
  for (const r of rest.filter((x) => x.status === 'fail')) {
    out.push(`${r.family} ${r.name}`);
    expect(noArrangement(r), `${code} ${r.name}`).toBe(true);
    expect(alternatives(r).length, `${code} ${r.name}`).toBeGreaterThan(0);
  }
  return out;
}

export const CODES = SHEET_CODE_LIST;
