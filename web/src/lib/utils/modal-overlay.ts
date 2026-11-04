/**
 * Whether a modal surface covers the model: the design desk, the 3-D reinforcement workspace, or
 * any dialog that declares `aria-modal="true"`.
 *
 * The global keyboard layer (`KeyboardShortcuts.svelte`) edits the model, and it listens on the
 * window, so a key pressed inside an overlay reached it too: Delete with the desk open deleted the
 * members still selected in the model behind it, and the Escape that closed the desk also cleared
 * the model selection. While this answers true, the model's editing shortcuts stand down and the
 * overlay keeps its own keys.
 *
 * Read from the stores the overlays already own, plus the DOM for every other dialog, so no
 * overlay has to register itself anywhere. `doc` is a parameter only so the unit suite, which has
 * no DOM, can pass one.
 *
 * Two window listeners edit the model from the keyboard (`KeyboardShortcuts.svelte` and PRO's own
 * in `App.svelte`), and they ask `overlayWasOpenAtKeydown()` rather than `modalOverlayOpen()`:
 * the overlay's own Escape listener may already have closed it by the time they run, and the
 * Escape that closed the desk would then find no desk and clear the selection anyway. The answer
 * is taken once per key, in the capture phase, before any of them runs.
 */
import { deskUi } from '../store/design-desk-ui.svelte';
import { rebarWorkspace } from '../store/rebar-workspace.svelte';

type Queryable = Pick<Document, 'querySelector'>;

export function modalOverlayOpen(doc: Queryable | undefined = typeof document === 'undefined' ? undefined : document): boolean {
  if (deskUi.open || rebarWorkspace.open) return true;
  return !!doc?.querySelector('[aria-modal="true"]');
}

let openAtKeydown = false;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', () => { openAtKeydown = modalOverlayOpen(); }, true);
}

/** Whether a modal surface covered the model when the current key went down. */
export function overlayWasOpenAtKeydown(): boolean {
  return openAtKeydown;
}
