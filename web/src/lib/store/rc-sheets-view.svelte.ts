/**
 * The sheets' rows for a component, built a frame after what they read changes so the page can say
 * it is building them first. Call it while the component is created.
 */
import { i18n } from '../i18n';
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { nextFrame } from './mesh-progress.svelte';
import { buildSheetRows, type SheetRows } from './rc-sheets.svelte';
import { decimalFor, makeFmt } from '../rc-sheets/format';

export function liveSheetRows(enabled: () => boolean): { readonly rows: SheetRows | null; readonly building: boolean } {
  let rows = $state.raw<SheetRows | null>(null);
  let building = $state(false);
  $effect(() => {
    void resultsStore.perCombo3D; void resultsStore.results3D; void modelStore.designData; void modelStore.model.groups;
    const locale = i18n.locale;
    if (!enabled()) { rows = null; building = false; return; }
    let live = true;
    building = true;
    void nextFrame().then(() => {
      if (!live) return;
      rows = buildSheetRows(makeFmt(decimalFor(locale)));
      building = false;
    });
    return () => { live = false; };
  });
  return { get rows() { return rows; }, get building() { return building; } };
}

/** What the sheets read, for the note while they are built: combinations, members and shell elements. */
export function sheetSize(): { combos: number; members: number; shells: number } {
  return { combos: Math.max(1, resultsStore.perCombo3D.size), members: modelStore.elements.size, shells: modelStore.quads.size + modelStore.plates.size };
}
