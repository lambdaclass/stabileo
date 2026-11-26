/**
 * The sheets' rows, one set for the whole application: the panel and the workspace read the same
 * one. Opening the sheets designs nothing; "Design reinforcement" designs every member once, in
 * steps that let the page draw between them (`sheetRowsSteps`), with how many are done of how many
 * (`sheetsRun.progress`). When the results, the model's members or the design data change after
 * that, the rows say they are out of date (`sheetsStale`) until designed again; nothing is designed
 * again by itself but for a change of code (`changeSheetCode`). A bar layout adopted in the sheets is their own edit: the rows follow it at
 * once, each row from its cache.
 */
import { i18n } from '../i18n';
import { criteriaKey } from '../rc-sheets/criteria';
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { nextFrame } from './mesh-progress.svelte';
import { buildSheetRows, forgetRedesigners, optionsView, rcSheetsData, setSheetCode, sheetCode, sheetRowsSteps, type SheetProgress, type SheetRows } from './rc-sheets.svelte';
import type { SheetCode } from '../rc-sheets/types';
import { designData } from './design-data';
import { activeResultSet3D } from './active-results';
import { decimalFor, makeFmt } from '../rc-sheets/format';
import { sheetsProgress } from './rc-sheets-progress.svelte';

/** What the rows were designed from: what makes them out of date when it changes. */
interface Stamp {
  results: unknown; perCombo: unknown; groups: unknown; modelVersion: number;
  /** The design data but the bars adopted in the sheets and how their schedule is ordered. */
  design: string;
  /** What the sheets set row by row: the rows follow it at once. */
  adopted: string;
  locale: string;
}

export const sheetsRun = $state<{ rows: SheetRows | null; stamp: Stamp | null; readonly progress: SheetProgress | null }>({
  rows: null, stamp: null, get progress() { return sheetsProgress.now; },
});
const setProgress = (p: SheetProgress | null) => { sheetsProgress.now = p; };

function stampNow(): Stamp {
  void modelStore.designData;
  const { adopted, bentLines, edited: _edited, adoptedCode: _adoptedCode, adoptedSeismic: _adoptedSeismic, adoptedLogic: _adoptedLogic, adoptedBasis: _adoptedBasis, schedule: _schedule, code: _code, ...sheets } = rcSheetsData();
  // The options as the design reads them: an option stated at its default is no change.
  const { rcSheets: _, designOptions, ...own } = designData();
  const rest = { ...own, designOptions: { ...optionsView(designOptions), criteria: criteriaKey(designOptions?.criteria), deflection: designOptions?.deflection ?? null, alternatives: designOptions?.alternatives ?? null } };
  return {
    // The result shown is a view of these, not an input: the combinations', or with none the one set designed.
    results: resultsStore.perCombo3D.size ? resultsStore.perCase3D : activeResultSet3D(), perCombo: resultsStore.perCombo3D, groups: modelStore.model.groups,
    modelVersion: modelStore.modelVersion,
    design: JSON.stringify({ rest, sheets, code: sheetCode() }), adopted: JSON.stringify({ adopted: adopted ?? null, bentLines }), locale: i18n.locale,
  };
}

const sameInputs = (a: Stamp, b: Stamp) => a.results === b.results && a.perCombo === b.perCombo && a.groups === b.groups && a.design === b.design;
const sameRunInputs = (a: Stamp, b: Stamp) => sameInputs(a, b) && a.modelVersion === b.modelVersion && a.adopted === b.adopted && a.locale === b.locale;

/** The rows were designed and something they were designed from has changed since (reactive). */
export function sheetsStale(): boolean {
  const s = sheetsRun.stamp;
  return !!s && !!sheetsRun.rows && !sameInputs(s, stampNow());
}

let runId = 0;

/**
 * Design every member, letting the page draw every ~30 ms; one run at a time, the newest wins. What
 * changed while it ran is designed again: reading the forces can settle what the design data hold,
 * so a run whose inputs moved runs once more from them, and rows only ever carry the inputs they
 * were designed from.
 */
export async function designSheets(): Promise<void> {
  if (!__PUBLIC_FEATURES__.proRcSheets) return;
  const id = ++runId;
  const stamp = stampNow();
  const it = sheetRowsSteps(makeFmt(decimalFor(stamp.locale)));
  setProgress({ phase: 'demands', done: 0, total: 1 });
  await nextFrame();
  try {
    if (id !== runId || !sameRunInputs(stamp, stampNow())) return;
    let last = performance.now();
    for (;;) {
      const r = it.next();
      if (r.done) {
        if (!sameRunInputs(stamp, stampNow())) return;
        sheetsRun.rows = r.value;
        sheetsRun.stamp = stamp;
        break;
      }
      if (performance.now() - last > 30) {
        setProgress(r.value);
        await nextFrame();
        if (id !== runId || !sameRunInputs(stamp, stampNow())) return;
        last = performance.now();
      }
    }
  } finally {
    if (id === runId) setProgress(null);
  }
}

/** Design to another code: at once when there are results, the rows edited by hand kept; the code in force already changes nothing. */
export async function changeSheetCode(code: SheetCode): Promise<void> {
  if (code === sheetCode()) return;
  setSheetCode(code);
  if (resultsStore.results3D) await designSheets();
}

/** Forget the rows (a new project): the sheets ask to be designed again. */
export function clearSheets(): void {
  runId++;
  sheetsRun.rows = null; sheetsRun.stamp = null; setProgress(null);
  forgetRedesigners();
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
