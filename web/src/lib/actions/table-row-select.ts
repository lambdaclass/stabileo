/**
 * A click on a row of Basic's tables selects what the row is, so the reader
 * can find it on the drawing; shift adds to the selection, and a double click
 * also frames it (as Alt+Z does). A click on the row's delete button or on a
 * control that changes the value only does that: selecting is for the rest of
 * the row, the id and the read-only cells. Moving into one of a row's fields
 * selects the row's subject too (focusRow).
 */
import { uiStore, modelStore } from '../store';

export type RowKind = 'node' | 'element' | 'support' | 'load';

function onControl(e: MouseEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el?.closest('button, select, input, label, textarea, a');
}

export function selectRow(e: MouseEvent, kind: RowKind, id: number): void {
  if (onControl(e)) return;
  const add = e.shiftKey || e.ctrlKey || e.metaKey;
  if (kind === 'node') uiStore.selectNode(id, add);
  else if (kind === 'element') uiStore.selectElement(id, add);
  else if (kind === 'support') uiStore.selectSupport(id, add);
  else uiStore.selectLoad(id, add);
}

/** Editing a value in a row selects what it belongs to, so the drawing shows which one. */
export function focusRow(e: FocusEvent, kind: RowKind, id: number): void {
  const el = e.target as HTMLElement | null;
  if (!el?.closest('input, select')) return;
  if (rowSelected(kind, id)) return;
  if (kind === 'node') uiStore.selectNode(id);
  else if (kind === 'element') uiStore.selectElement(id);
  else if (kind === 'support') uiStore.selectSupport(id);
  else uiStore.selectLoad(id);
}

/** Double click: select the row and frame it in the view. */
export function frameRow(e: MouseEvent, kind: RowKind, id: number): void {
  if (onControl(e)) return;
  selectRow(e, kind, id);
  // A support or a load is framed by the node or member it stands on.
  if (kind === 'support') {
    const sup = modelStore.supports.get(id);
    if (sup) uiStore.selectNode(sup.nodeId, true);
  } else if (kind === 'load') {
    const load = modelStore.loads.find((l) => l.data.id === id);
    const d = load?.data as { nodeId?: number; elementId?: number } | undefined;
    if (d?.nodeId !== undefined) uiStore.selectNode(d.nodeId, true);
    else if (d?.elementId !== undefined) uiStore.selectElement(d.elementId, true);
  }
  window.dispatchEvent(new CustomEvent('stabileo-zoom-to-selection'));
}

/** Whether the row's subject is selected, for its highlight. */
export function rowSelected(kind: RowKind, id: number): boolean {
  if (kind === 'node') return uiStore.selectedNodes.has(id);
  if (kind === 'element') return uiStore.selectedElements.has(id);
  if (kind === 'support') return uiStore.selectedSupports.has(id);
  return uiStore.selectedLoads.has(id);
}
