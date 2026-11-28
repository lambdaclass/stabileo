import { deskUi } from './design-desk-ui.svelte';
import { rebarWorkspace } from './rebar-workspace.svelte';
/** The out-of-date results notice as the notice board shows it: its sentence and what its buttons do, set by the recheck notice that owns them. */
export const recheckBanner = $state<{ text: string | null; alert: boolean; canRerun: boolean; busy: boolean; review: () => void; rerun: () => void }>({
  text: null, alert: false, canRerun: false, busy: false, review: () => {}, rerun: () => {},
});

/** Whether a full-window workspace covers the notices board: the stale notice then stands over it on its own. */
export const boardCovered = (): boolean => deskUi.open || rebarWorkspace.open;
