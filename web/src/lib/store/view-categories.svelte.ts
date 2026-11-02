/**
 * What each kind of thing in the PRO view looks like: drawn, drawn in halftone as context, or not
 * drawn. A hidden category is not drawn, picked or taken by "select all"; it is still analysed and
 * saved. Named views remember the states (`SavedViewDisplay.categories`).
 */
import { uiStore } from './ui.svelte';

export const VIEW_CATEGORIES = ['members', 'nodes', 'shells', 'supports', 'loads', 'labels', 'underlays', 'linked'] as const;
export type ViewCategory = typeof VIEW_CATEGORIES[number];
export type CategoryState = 'visible' | 'halftone' | 'hidden';
export const CATEGORY_STATES: readonly CategoryState[] = ['visible', 'halftone', 'hidden'];

/** Opacity of what is drawn in halftone, relative to its own. */
export const HALFTONE_OPACITY = 0.22;

const allVisible = (): Record<ViewCategory, CategoryState> =>
  Object.fromEntries(VIEW_CATEGORIES.map((c) => [c, 'visible'])) as Record<ViewCategory, CategoryState>;

let states = $state(allVisible());
let version = $state(0);

export const viewCategories = {
  get version() { return version; },
  /** Basic draws everything: the states are PRO's. */
  state(c: ViewCategory): CategoryState { return uiStore.analysisMode === 'pro' ? states[c] : 'visible'; },
  set(c: ViewCategory, s: CategoryState) {
    if (states[c] === s) return;
    states = { ...states, [c]: s };
    version++;
  },
  isHidden(c: ViewCategory) { return this.state(c) === 'hidden'; },
  /** The hidden categories, as one key a scene rebuild can follow. */
  get hiddenKey() { return VIEW_CATEGORIES.filter((c) => this.state(c) === 'hidden').join(','); },
  get anyChanged() { return VIEW_CATEGORIES.some((c) => states[c] !== 'visible'); },
  /** The states that differ from "visible", as a named view stores them. */
  snapshot(): Partial<Record<ViewCategory, CategoryState>> {
    return Object.fromEntries(VIEW_CATEGORIES.filter((c) => states[c] !== 'visible').map((c) => [c, states[c]]));
  },
  /** A named view's states; what it does not name is drawn. */
  restore(saved: Partial<Record<string, string>> | undefined) {
    const next = allVisible();
    for (const c of VIEW_CATEGORIES) {
      const s = saved?.[c];
      if (s === 'halftone' || s === 'hidden') next[c] = s;
    }
    states = next;
    version++;
  },
  reset() { states = allVisible(); version++; },
};
