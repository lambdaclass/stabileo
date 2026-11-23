import { i18n } from '../i18n';
import { resultsStore } from './results.svelte';
import { buildSheetRows, liveAdopted, rcSheetsData, sheetCode, type SheetRows } from './rc-sheets.svelte';
import { sheetsRun, sheetsStale } from './rc-sheets-view.svelte';
import { decimalFor, makeFmt } from '../rc-sheets/format';

/**
 * The sheets' rows the documents (memoria, IFC) read: the ones on screen while they are current,
 * else built again when the sheets hold adopted bars and the model is solved. Null when there is
 * nothing designed in the sheets.
 */
export function sheetsForDocuments(): SheetRows | null {
  if (!resultsStore.results3D) return null;
  if (sheetsRun.rows && !sheetsRun.progress && !sheetsStale()) return sheetsRun.rows;
  if (!Object.keys(liveAdopted(rcSheetsData(), sheetCode())).length) return null;
  return buildSheetRows(makeFmt(decimalFor(i18n.locale)));
}
