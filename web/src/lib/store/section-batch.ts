/**
 * One section given to many members in one step (one undo step): the members whose section
 * changes, returned. The stiffness changes, so the analysis is stale and says so like any section
 * edit; the bars they hold are kept and checked again against the new section by the verifier.
 */
import { modelStore } from './model.svelte';

export function assignSection(ids: readonly number[], sectionId: number): number[] {
  if (!modelStore.sections.has(sectionId)) return [];
  const changed = ids.filter((id) => { const e = modelStore.elements.get(id); return !!e && e.sectionId !== sectionId; });
  if (!changed.length) return [];
  modelStore.batch(() => { for (const id of changed) modelStore.updateElementSection(id, sectionId); });
  return changed;
}
