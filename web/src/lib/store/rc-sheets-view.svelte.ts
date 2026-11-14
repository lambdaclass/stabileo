/**
 * The sheets' rows, one set for the whole application: the panel and the workspace read the same
 * one. Opening the sheets designs nothing; "Design reinforcement" designs every member once, in
 * steps that let the page draw between them (`sheetRowsSteps`), with how many are done of how many
 * (`sheetsRun.progress`). When the results, the model's members or the design data change after
 * that, the rows say they are out of date (`sheetsStale`) until designed again; nothing is designed
 * again by itself. A bar layout adopted in the sheets is their own edit: the rows follow it at
 * once, each row from its cache.
 */
import { i18n } from '../i18n';
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { nextFrame } from './mesh-progress.svelte';
import { buildSheetRows, rcSheetsData, sheetRowsSteps, type SheetProgress, type SheetRows } from './rc-sheets.svelte';
import { designData } from './design-data';
import { activeResultSet3D } from './active-results';
import { decimalFor, makeFmt } from '../rc-sheets/format';
import { sheetsProgress } from './rc-sheets-progress.svelte';
import type { SheetFamily } from '../rc-sheets/types';

export const sheetsWorkspace = $state<{ open: boolean; family: SheetFamily }>({ open: false, family: 'beam' });

export function openSheets(family: SheetFamily = sheetsWorkspace.family): void { sheetsWorkspace.family = family; sheetsWorkspace.open = true; }
export function closeSheets(): void { sheetsWorkspace.open = false; }

/** What the rows were designed from: what makes them out of date when it changes. */
interface Stamp {
  results: unknown; perCombo: unknown; groups: unknown;
  /** The design data but the bars adopted in the sheets. */
  design: string;
  adopted: string;
  locale: string;
}

export const sheetsRun = $state<{ rows: SheetRows | null; stamp: Stamp | null; readonly progress: SheetProgress | null }>({
  rows: null, stamp: null, get progress() { return sheetsProgress.now; },
});
const setProgress = (p: SheetProgress | null) => { sheetsProgress.now = p; };

function stampNow(): Stamp {
  void modelStore.designData;
  const { adopted, ...sheets } = rcSheetsData();
  const { rcSheets: _, ...rest } = designData() as { rcSheets?: unknown };
  return {
    // The result shown is a view of these, not an input: the combinations', or with none the one set designed.
    results: resultsStore.perCombo3D.size ? resultsStore.perCase3D : activeResultSet3D(), perCombo: resultsStore.perCombo3D, groups: modelStore.model.groups,
    design: JSON.stringify({ rest, sheets }), adopted: JSON.stringify(adopted ?? null), locale: i18n.locale,
  };
}

const sameInputs = (a: Stamp, b: Stamp) => a.results === b.results && a.perCombo === b.perCombo && a.groups === b.groups && a.design === b.design;

/** The rows were designed and something they were designed from has changed since (reactive). */
export function sheetsStale(): boolean {
  const s = sheetsRun.stamp;
  return !!s && !!sheetsRun.rows && !sameInputs(s, stampNow());
}

let runId = 0;

/** Design every member, letting the page draw every ~30 ms; one run at a time, the newest wins. */
export async function designSheets(): Promise<void> {
  const id = ++runId;
  const stamp = stampNow();
  const it = sheetRowsSteps(makeFmt(decimalFor(stamp.locale)));
  setProgress({ phase: 'demands', done: 0, total: 1 });
  await nextFrame();
  try {
    let last = performance.now();
    for (;;) {
      if (id !== runId) return;
      const r = it.next();
      if (r.done) {
        sheetsRun.rows = r.value;
        // Taken again at the end: reading the forces can settle what the design data hold.
        sheetsRun.stamp = stampNow();
        break;
      }
      if (performance.now() - last > 30) {
        setProgress(r.value);
        await nextFrame();
        last = performance.now();
      }
    }
  } finally {
    if (id === runId) setProgress(null);
  }
}

/** Forget the rows (a new project): the sheets ask to be designed again. */
export function clearSheets(): void {
  closeSheets();
  runId++;
  sheetsRun.rows = null; sheetsRun.stamp = null; setProgress(null);
}

/**
 * Keeps the rows on a bar layout adopted in the sheets, or a change of language: each row comes
 * from its cache, nothing is designed again. Drops them when the results are gone. Call it while a
 * component that shows rows is created.
 */
export function followSheetEdits(): void {
  $effect(() => {
    // No results (a project opened, a model cleared): the rows were another model's.
    if (!resultsStore.results3D) { if (sheetsRun.rows && !sheetsRun.progress) clearSheets(); return; }
    const s = stampNow();
    const was = sheetsRun.stamp;
    if (!was || !sheetsRun.rows || sheetsRun.progress || !sameInputs(was, s)) return;
    if (was.adopted === s.adopted && was.locale === s.locale) return;
    sheetsRun.rows = buildSheetRows(makeFmt(decimalFor(s.locale)));
    sheetsRun.stamp = s;
  });
}

/** What the sheets read, for the note while they are built: combinations, members and shell elements. */
export function sheetSize(): { combos: number; members: number; shells: number } {
  return { combos: Math.max(1, resultsStore.perCombo3D.size), members: modelStore.elements.size, shells: modelStore.quads.size + modelStore.plates.size };
}
