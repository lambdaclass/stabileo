/**
 * The selections made before this one, so "previous selection" can bring one back after a click
 * elsewhere cleared it. Every change of the selection is recorded, empties aside; ten are kept.
 */
import { uiStore } from './ui.svelte';

interface Snap { nodes: number[]; elements: number[]; shells: string[] }
const LIMIT = 10;

let history = $state<Snap[]>([]);
let restoring = false;

const snap = (): Snap => ({ nodes: [...uiStore.selectedNodes], elements: [...uiStore.selectedElements], shells: [...uiStore.selectedShells] });
const empty = (s: Snap) => s.nodes.length + s.elements.length + s.shells.length === 0;
const same = (a: Snap, b: Snap) => a.nodes.join() === b.nodes.join() && a.elements.join() === b.elements.join() && a.shells.join() === b.shells.join();

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

export const selectionHistory = {
  /** Selections before the current one, most recent last. */
  get previous(): Snap[] { return history.slice(0, -1); },
  /** Restore the selection before the current one. */
  back(): boolean {
    if (history.length < 2) return false;
    const prev = history[history.length - 2]!;
    history = history.slice(0, -1);
    restoring = true;
    uiStore.setSelection(new Set(prev.nodes), new Set(prev.elements), true, new Set(prev.shells));
    queueMicrotask(() => { restoring = false; });
    return true;
  },
};
