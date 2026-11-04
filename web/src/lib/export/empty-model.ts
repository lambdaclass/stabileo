/**
 * An export of an empty model still comes out: the dialogs say so before (`ExportDialog`) and
 * the export says so after, once, in place of the solver's complaints about a model with nothing
 * to solve.
 */
import { modelStore, uiStore } from '../store';
import { t } from '../i18n';

export const modelIsEmpty = (): boolean => modelStore.nodes.size === 0;

/** Says the file came out with no data, when it did. */
export function tellIfEmpty(): boolean {
  if (!modelIsEmpty()) return false;
  uiStore.toast(t('export.emptyModelDone'), 'info');
  return true;
}
