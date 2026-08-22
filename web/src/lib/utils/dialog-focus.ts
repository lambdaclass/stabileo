/**
 * Focus management for a dialog that declares `aria-modal="true"`.
 *
 * ── Why this is not optional ──────────────────────────────────────
 *
 * `aria-modal="true"` tells assistive technology that everything outside the element does not
 * exist. A Tab that then walks out of the dialog puts the user in controls their screen reader
 * has just been told are not there — and, for a `position: fixed` overlay, controls that are
 * also underneath it. The declaration is a promise; a dialog that makes it and does not trap
 * focus is worse off than one that never claimed to be modal.
 *
 * Three parts, all standard, none of them interesting:
 *
 *   - remember what had focus, and move focus INTO the dialog on open;
 *   - cycle Tab and Shift+Tab within it;
 *   - put focus back where it was on close.
 *
 * Extracted from `RebarWorkspace.svelte` rather than written inline there: the RC design
 * components carry a 600-line ceiling (`rc-design-gates.test.ts`), and the next dialog that
 * needs this should not be the one that re-derives it.
 */

/**
 * Everything inside `root` that Tab can reach, in document order.
 *
 * Asked for at the moment of the keystroke, never cached. Rails fold, banners come and go with
 * the scene, and detail panels appear only once something is selected — a list captured on open
 * goes stale the first time any of that happens, and a stale trap is a trap with holes in it.
 */
const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]),'
  + ' select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function tabbablesIn(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>(TABBABLE)]
    // `offsetParent` is null for anything `display: none`, which is how a folded rail hides.
    // The active element is kept regardless: focus can legitimately sit on a control that is
    // being animated out, and dropping it would restart the cycle from the wrong end.
    .filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/**
 * Handle a Tab keystroke inside `root`. Returns true if it consumed the event.
 *
 * The caller still owns `preventDefault`; this reports whether focus was moved so that a
 * component can keep its own keydown handler readable.
 */
export function cycleTabWithin(root: HTMLElement | null, e: KeyboardEvent): boolean {
  if (e.key !== 'Tab' || !root) return false;

  const items = tabbablesIn(root);
  if (items.length === 0) { root.focus(); return true; }

  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement as HTMLElement | null;

  // Focus on the container itself — where it lands on open, and where a click on a canvas
  // leaves it — is outside `items`, so neither edge test below would fire and the browser
  // would walk into the page behind. Send it to an end explicitly.
  if (active === root || !root.contains(active)) {
    (e.shiftKey ? last : first).focus();
    return true;
  }
  if (!e.shiftKey && active === last) { first.focus(); return true; }
  if (e.shiftKey && active === first) { last.focus(); return true; }
  return false;
}

/**
 * Move focus into `root` and hand back the function that restores it.
 *
 * Focus goes to the container, not to its first control, so a screen reader reads the dialog's
 * accessible name and the user arrives at the top of it rather than part-way through a toolbar.
 */
export function captureFocus(root: HTMLElement | null): () => void {
  // Read once, at the transition into open. `document.activeElement` at any later point is
  // whatever this function has already moved focus to, which would make the restore a no-op.
  const opener = document.activeElement as HTMLElement | null;
  root?.focus();
  return () => {
    // `isConnected` guards the case where the opener was unmounted while the dialog was up —
    // typically because the dialog covers the panel that owns it. Focusing a detached node
    // silently sends focus to `<body>`, i.e. the top of the document, which is the outcome
    // this whole module exists to prevent.
    if (opener?.isConnected) opener.focus();
  };
}
