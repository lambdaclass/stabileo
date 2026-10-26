/**
 * The member list's view state: its filter, search, sort, open row and focused row.
 *
 * It was component state of `ProDesignTab`, which unmounts whenever another place of design (or
 * another stage) takes the canvas, so coming back to the list showed it unfiltered, unsearched and
 * folded, and the row a person was reading was gone. Kept here for the session instead, and
 * cleared with it: a new project or another project tab starts from the defaults. The ticked rows
 * are not here: they are the model selection, which the list mirrors.
 */
import { uiStore } from '../../../lib/store';
import type { RowFilter, SortKey } from './design-view';

function createDesignTableUi() {
  let filter = $state<RowFilter>('all');
  let search = $state('');
  let sortKey = $state<SortKey>('element');
  let sortAsc = $state(true);
  let expandedId = $state<number | null>(null);
  let focusedId = $state<number | null>(null);
  return {
    get filter() { return filter; }, set filter(v: RowFilter) { filter = v; },
    get search() { return search; }, set search(v: string) { search = v; },
    get sortKey() { return sortKey; }, set sortKey(v: SortKey) { sortKey = v; },
    get sortAsc() { return sortAsc; }, set sortAsc(v: boolean) { sortAsc = v; },
    get expandedId() { return expandedId; }, set expandedId(v: number | null) { expandedId = v; },
    get focusedId() { return focusedId; }, set focusedId(v: number | null) { focusedId = v; },
    reset() { filter = 'all'; search = ''; sortKey = 'element'; sortAsc = true; expandedId = null; focusedId = null; },
  };
}

export const designTableUi = createDesignTableUi();
uiStore.onSessionReset(() => designTableUi.reset());
