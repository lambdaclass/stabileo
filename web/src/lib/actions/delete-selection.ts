/**
 * Delete what is selected — the one implementation behind the Delete key and
 * the on-screen delete button.
 *
 * There were two copies (the keyboard layer and App's PRO handler), and a
 * phone has neither: without a keyboard, a selection could be made but never
 * removed. The button needs the same operation, so there is now one.
 *
 * Everything selected goes, every kind at once, as one undo step. The keyboard
 * used to take supports first and stop there, so a mixed selection needed as
 * many presses as it had kinds.
 */
import { modelStore, uiStore, resultsStore } from '../store';
import { resolveDeleteTargets } from '../store/delete-selection';

export type SelectionKind = 'elements' | 'nodes' | 'supports' | 'loads' | 'shells';

/** How many of each kind are selected, in a fixed order, zeros left out. */
export function selectionSummary(): Array<{ kind: SelectionKind; n: number }> {
  const counts: Array<{ kind: SelectionKind; n: number }> = [
    { kind: 'elements', n: [...uiStore.selectedElements].filter((id) => modelStore.elements.has(id)).length },
    { kind: 'nodes', n: uiStore.selectedNodes.size },
    { kind: 'supports', n: uiStore.selectedSupports.size },
    { kind: 'loads', n: uiStore.selectedLoads.size },
    { kind: 'shells', n: uiStore.selectedShells.size },
  ];
  return counts.filter((c) => c.n > 0);
}

export function hasDeletableSelection(): boolean {
  return selectionSummary().length > 0;
}

/** Delete every selected entity as one undo step. Returns whether anything went. */
export function deleteSelection(): boolean {
  if (!hasDeletableSelection()) return false;
  const supports = [...uiStore.selectedSupports];
  const loads = [...uiStore.selectedLoads];
  const targets = resolveDeleteTargets(
    { nodes: uiStore.selectedNodes, elements: uiStore.selectedElements, shells: uiStore.selectedShells },
    (id) => modelStore.elements.has(id),
  );
  modelStore.batch(() => {
    /* Loads and supports first: a node going with them would take them anyway. */
    for (const id of loads) modelStore.removeLoad(id);
    for (const id of supports) if (modelStore.supports.has(id)) modelStore.removeSupport(id);
    modelStore.deleteEntities(targets);
  });
  uiStore.clearSelection();
  resultsStore.clear();
  return true;
}
