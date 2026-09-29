/**
 * A workbook becomes the model on screen.
 *
 * ── Why this is so short ───────────────────────────────────────────
 *
 * Because it refuses to be a loader. `parse.ts` produces a `JSONModel` — the
 * shape every bundled example already has — and `loadFixture` is the one path
 * that turns one into a live model. This file only supplies the ceremony
 * around it, and even that is copied rather than invented: `generator-apply.ts`
 * had already worked out what a wholesale replacement has to do, and got the
 * undo grouping right in a way that is easy to get wrong.
 *
 * The batch wrapper is the part worth naming. Without it `clear()` pushes one
 * undo snapshot and `bulkMutate()` pushes a second of the now-empty model, so
 * the first Ctrl+Z after an import restores nothing — which, for a command
 * that just replaced somebody's structure, is the one failure they cannot
 * recover from.
 */

import { modelStore, uiStore } from '../store';
import { t } from '../i18n';
import { shouldProjectModelToXZ } from '../geometry/coordinate-system';
import { loadFixture } from '../templates/load-fixture';
import { parseWorkbook, type ParseResult } from './parse';

export interface ImportOutcome extends ParseResult {
  /** What actually landed in the store, counted after the fact. */
  loaded: { nodes: number; elements: number; sections: number };
}

/**
 * Read the sheets, replace the model, and report what happened.
 *
 * Nothing is loaded when the workbook yielded no nodes: a model with members
 * pointing at nothing is not a partial success, and replacing a reader's
 * structure with an empty canvas because their file had the wrong sheet names
 * would be the most expensive way to tell them so. The problems come back
 * either way, which is what the caller shows.
 */
export function applyWorkbook(sheets: Record<string, unknown[][]>): ImportOutcome {
  const parsed = parseWorkbook(sheets);

  if (parsed.model.nodes.length === 0) {
    return { ...parsed, loaded: { nodes: 0, elements: 0, sections: 0 } };
  }

  const api = modelStore.fixtureApi();
  modelStore.batch(() => {
    modelStore.clear();
    modelStore.bulkMutate(() => {
      loadFixture(parsed.model as never, api as never);
    });
  });
  modelStore.refreshCanonicalSections();
  /*
   * A flat workbook (X and Z, Y blank) is a plane frame, stored the way the app stores one. In
   * 3D and PRO it has to be shown standing on X–Z, as a bundled 2D example is: `clear()` had
   * set the native view, and the portal came in lying on the floor.
   */
  const flat = shouldProjectModelToXZ({
    nodes: modelStore.nodes.values(), supports: modelStore.supports.values(), loads: modelStore.loads,
    plateCount: modelStore.plates.size, quadCount: modelStore.quads.size,
  });
  if (flat && (uiStore.analysisMode === '3d' || uiStore.analysisMode === 'pro')) uiStore.useUpright2DIn3DPresentation();
  else uiStore.useNative3DPresentation();
  modelStore.bumpModelVersion();

  return {
    ...parsed,
    loaded: {
      nodes: modelStore.nodes.size,
      elements: modelStore.elements.size,
      sections: modelStore.sections.size,
    },
  };
}

/**
 * Everything from a chosen file, including turning it into sheets.
 *
 * The xlsx module is loaded here rather than in `parse.ts` so that the reading
 * rules stay testable without it — the parser takes arrays and returns a
 * model, and the 18 cases covering it run in milliseconds and need no
 * workbook at all.
 */
export async function importExcelFile(file: File): Promise<ImportOutcome | null> {
  const { loadXlsxModule } = await import('../export/excel');
  const XLSX = await loadXlsxModule();
  if (!XLSX) return null;

  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheets: Record<string, unknown[][]> = {};
  for (const name of wb.SheetNames) {
    /*
     * `header: 1` gives arrays rather than objects keyed by header, which is
     * what lets a duplicate or blank header be reported instead of silently
     * overwriting its twin. `defval: ''` keeps the columns aligned: without
     * it a row whose middle cells are empty comes back short, and every value
     * after the gap lands under the wrong key.
     */
    sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], {
      header: 1,
      defval: '',
      blankrows: false,
    }) as unknown[][];
  }
  return applyWorkbook(sheets);
}

/**
 * The toast after an import, the same in Basic and PRO. The report beside the button carries the
 * rows to fix; this says in one line whether anything landed.
 */
export function announceImport(outcome: ImportOutcome): void {
  if (outcome.loaded.nodes > 0) {
    uiStore.toast(
      t('xls.ui.imported')
        .replace('{n}', String(outcome.loaded.nodes))
        .replace('{e}', String(outcome.loaded.elements)),
      outcome.problems.length > 0 ? 'info' : 'success',
    );
  } else {
    uiStore.toast(t('xls.ui.nothingLoaded'), 'error');
  }
}
