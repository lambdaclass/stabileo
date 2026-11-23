/**
 * What the Advanced panel's header row says while something inside it is open: where the reader
 * is ("Advanced › Dynamics"), how to go back, and what the open thing does. The view that is on
 * screen publishes it and the panel draws it, so every function and step-by-step view shares one
 * header instead of drawing its own row under the panel's.
 */
import { untrack } from 'svelte';

export interface Crumb {
  label: string;
  /** Going to this level; none for the level on screen. */
  go?: () => void;
}

export interface Trail {
  /** The levels below the panel's own name, outermost first; the last is the one on screen. */
  crumbs: Crumb[];
  back?: { run: () => void; title: string; testid: string };
  /** Back to the list of functions, from the panel's own name. */
  home?: () => void;
  /** What the open function does, shown under the header when its ? is pressed. */
  help?: string;
  /** The advanced function on screen, as its catalog id. */
  running?: string;
}

let entries = $state<{ id: number; trail: Trail }[]>([]);
let next = 0;

export const panelTrail = {
  get current(): Trail | null { return entries.at(-1)?.trail ?? null; },
  /** Publish from an effect and return what it returns: the trail leaves with the view. */
  publish(trail: Trail): () => void {
    const id = ++next;
    entries = [...untrack(() => entries), { id, trail }];
    return () => { entries = untrack(() => entries).filter((e) => e.id !== id); };
  },
};
