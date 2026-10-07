/**
 * The selections made before this one, so "previous selection" can bring one back after a click
 * elsewhere cleared it. Every change of the selection is recorded, empties aside; ten are kept.
 */
import { uiStore } from './ui.svelte';

interface Snap { nodes: number[]; elements: number[]; shells: string[]; supports: number[]; loads: number[] }
const LIMIT = 10;

let history = $state<Snap[]>([]);
let restoring = false;
/* A tab switch or a new project resets the session: the ids recorded here belong to the model
   left behind, and "previous selection" would select whatever carries them in the next one. */
uiStore.onSessionReset(() => { history = []; });

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

type Kind = typeof KEYS[number];
/** A selection narrowed to the kinds armed in the panel; all of them when none is named. */
const narrow = (s: Snap, kinds?: ReadonlySet<Kind>): Snap =>
  kinds ? { nodes: [], elements: [], shells: [], supports: [], loads: [], ...Object.fromEntries(KEYS.filter((k) => kinds.has(k)).map((k) => [k, s[k]])) } : s;

/**
 * The entry "previous selection" brings back for these kinds: the most recent one that holds
 * something of them and is not what is selected now. Narrowed, so with members armed it gives
 * back the members picked before, never the plates or supports picked in another mode (which the
 * next Delete would then reach while the panel says members).
 */
function previousIndex(kinds?: ReadonlySet<Kind>): number {
  const now = narrow(snap(), kinds);
  for (let i = history.length - 1; i >= 0; i--) {
    const h = narrow(history[i]!, kinds);
    if (!empty(h) && !same(h, now)) return i;
  }
  return -1;
}

export const selectionHistory = {
  /** Selections before the current one, most recent last. */
  get previous(): Snap[] { return currentIsRecorded() ? history.slice(0, -1) : history; },
  /** Whether there is a previous selection of these kinds to go back to. */
  canGoBack(kinds?: ReadonlySet<Kind>): boolean { return previousIndex(kinds) >= 0; },
  /** Restore the selection before the current one, of these kinds (all, when none are named). */
  back(kinds?: ReadonlySet<Kind>): boolean {
    const i = previousIndex(kinds);
    if (i < 0) return false;
    const prev = narrow(history[i]!, kinds);
    history = history.slice(0, i + 1);
    restoring = true;
    uiStore.setSelection(new Set(prev.nodes), new Set(prev.elements), true, new Set(prev.shells));
    uiStore.selectedSupports = new Set(prev.supports);
    uiStore.selectedLoads = new Set(prev.loads);
    queueMicrotask(() => { restoring = false; });
    return true;
  },
};
