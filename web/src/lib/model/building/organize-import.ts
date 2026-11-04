/**
 * After a drawing comes in as a model: the grid read off its columns when the model has none,
 * and its pieces recognised as physical elements on those levels. Part of the import's own undo
 * step when called inside it.
 */
import { modelStore } from '../../store/model.svelte';
import { gridFromModel } from '../grid';
import { recognizePhysicalElements } from '../../store/physical';

export interface Organized { gridRead: boolean; elements: number }

export function organizeImported(): Organized {
  let gridRead = false;
  if (!modelStore.grid || modelStore.grid.levels.length === 0) {
    const g = gridFromModel(modelStore.nodes.values(), modelStore.elements.values());
    if (g.levels.length > 0) { modelStore.setGrid({ axes: modelStore.grid?.axes.length ? modelStore.grid.axes : g.axes, levels: g.levels }); gridRead = true; }
  }
  const elements = recognizePhysicalElements();
  return { gridRead, elements };
}
