/**
 * The two things a project remembers about its own history: what was emitted, and what was
 * touched by hand.
 *
 * ── Why they are not restored by `restore()` ───────────────────────
 *
 * `modelStore.restore()` is the undo/redo path as well as the file-open path, and the two want
 * opposite things here.
 *
 * An export is a HISTORICAL FACT. A file left the app and is in someone's folder. Undoing a
 * geometry change cannot un-happen that, and it would: the undo entry was pushed before the
 * export, so it carries the emission list as it was before the file was written, and restoring
 * it would delete a record of something that really happened. The failure is quiet and the
 * user would have no way to notice.
 *
 * So the rule is: **the session store is authoritative while the session lasts.** These are read
 * from a snapshot exactly once per project — when a file is opened, or when a tab is switched to
 * and its captured state becomes live — and never by undo or redo.
 *
 * They still RIDE on the snapshot, because that is what makes saving, autosave and tab capture
 * carry them without four separate wirings.
 *
 * ── Why absence is not zero ────────────────────────────────────────
 *
 * Both fields are optional, and a file written before they existed has neither. That absence is
 * information:
 *
 *   `exports` absent       we have no record of what was exported — never "nothing was".
 *   `manualEdits` absent   we do not know what was retouched — never "none were".
 *
 * The second is the one that can produce a false statement on a drawing, which is why it gets a
 * distinct state rather than an empty list. `manualEdits: []` is a file that recorded that
 * nothing was retouched, and is believed.
 */

import type { ModelSnapshot } from './history.svelte';
import { exportRecordStore } from './export-record.svelte';
import { designRunStore } from './design-run.svelte';

/** The provenance fields of a snapshot, taken from the live session. */
export function captureProjectProvenance(): Pick<ModelSnapshot, 'exports' | 'manualEdits'> {
  return {
    // Copied out of reactive state. A snapshot that aliased the store's array would let a
    // later export mutate an undo entry — the same hazard `restore()` documents for footings.
    exports: exportRecordStore.exports.map((r) => ({
      ...r,
      elements: [...r.elements],
      limitations: [...r.limitations],
      retouched: { ...r.retouched, members: [...r.retouched.members] },
    })),
    manualEdits: [...designRunStore.manualOverrides].sort((a, b) => a - b),
  };
}

/**
 * Adopt a snapshot's provenance into the session.
 *
 * Call on FILE OPEN and on TAB ACTIVATION. Never from undo or redo — see the header.
 */
export function hydrateProjectProvenance(s: Pick<ModelSnapshot, 'exports' | 'manualEdits'>): void {
  exportRecordStore.hydrate(s.exports);
  designRunStore.hydrateManual(s.manualEdits);
}

/**
 * Reset both to what a NEW project knows about itself.
 *
 * Not the same as hydrating from an empty snapshot: a new project genuinely knows that nothing
 * has been retouched, so its provenance is `known` and empty rather than `unknown`.
 */
export function resetProjectProvenance(): void {
  exportRecordStore.reset();
  designRunStore.hydrateManual([]);
}
