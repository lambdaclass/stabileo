/**
 * A selection only holds what the model still has.
 *
 * Supports and loads are selected by id, and the model can lose one under the
 * selection: the ✕ of its table row, an undo that takes back its creation, a
 * deleted node that takes its support with it. The ids stayed selected, so
 * the options bar kept saying "Edit support" over an empty panel and the
 * delete button kept counting something that was gone.
 */
import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';

const loadIds = () => new Set(modelStore.loads.map((l) => l.data.id));

/**
 * What the options bar edits: a selected load, else a selected support — one
 * the model still has. A selection of things that are gone edits nothing.
 */
export function editingKind(): 'support' | 'load' | null {
  if (uiStore.selectedLoads.size > 0) {
    const ids = loadIds();
    for (const id of uiStore.selectedLoads) if (ids.has(id)) return 'load';
  }
  for (const id of uiStore.selectedSupports) if (modelStore.supports.has(id)) return 'support';
  return null;
}

/** Drop the selected supports and loads the model no longer has. Leaves the sets alone when nothing went. */
export function pruneStaleSelection(): void {
  const sups = [...uiStore.selectedSupports].filter((id) => modelStore.supports.has(id));
  if (sups.length !== uiStore.selectedSupports.size) uiStore.selectedSupports = new Set(sups);
  if (uiStore.selectedLoads.size > 0) {
    const ids = loadIds();
    const loads = [...uiStore.selectedLoads].filter((id) => ids.has(id));
    if (loads.length !== uiStore.selectedLoads.size) uiStore.selectedLoads = new Set(loads);
  }
}
