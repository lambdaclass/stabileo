/**
 * The selections made before this one, so "previous selection" can bring one back after a click
 * elsewhere cleared it. Every change of the selection is recorded, empties aside; ten are kept.
 */
import { uiStore } from './ui.svelte';

interface Snap { nodes: number[]; elements: number[]; shells: string[]; supports: number[]; loads: number[] }
const LIMIT = 10;

let history = $state<Snap[]>([]);
let restoring = false;

const snap = (): Snap => ({
  nodes: [...uiStore.selectedNodes], elements: [...uiStore.selectedElements], shells: [...uiStore.selectedShells],
  supports: [...uiStore.selectedSupports], loads: [...uiStore.selectedLoads],
});
const KEYS = ['nodes', 'elements', 'shells', 'supports', 'loads'] as const;
const empty = (s: Snap) => KEYS.every((k) => s[k].length === 0);
const same = (a: Snap, b: Snap) => KEYS.every((k) => a[k].join() === b[k].join());

let started = false;
/** Start recording; idempotent. Called by the panel that offers the history. */
export function trackSelectionHistory(): void {
  if (started) return;
  started = true;
  $effect.root(() => {
    $effect(() => {
      const s = snap();
      if (restoring || empty(s)) return;
      const last = history[history.length - 1];
      if (last && same(last, s)) return;
      history = [...history, s].slice(-LIMIT);
    });
  });
}

/*
 * Empties are not recorded, so after a click on nothing the last entry is the selection that was
 * just lost, not the current one. Reading it as the current one disabled "previous selection" in
 * exactly the case it exists for.
 */
const currentIsRecorded = () => !empty(snap());

export const selectionHistory = {
  /** Selections before the current one, most recent last. */
  get previous(): Snap[] { return currentIsRecorded() ? history.slice(0, -1) : history; },
  /** Restore the selection before the current one. */
  back(): boolean {
    const recorded = currentIsRecorded();
    if (history.length < (recorded ? 2 : 1)) return false;
    const prev = history[history.length - (recorded ? 2 : 1)]!;
    if (recorded) history = history.slice(0, -1);
    restoring = true;
    uiStore.setSelection(new Set(prev.nodes), new Set(prev.elements), true, new Set(prev.shells));
    uiStore.selectedSupports = new Set(prev.supports);
    uiStore.selectedLoads = new Set(prev.loads);
    queueMicrotask(() => { restoring = false; });
    return true;
  },
};
