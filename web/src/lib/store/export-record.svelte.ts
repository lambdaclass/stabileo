/**
 * The record of what was emitted.
 *
 * ── Why this is its own store and not a field on the document ──────
 *
 * Three reasons, from `docs/handoffs/h1-export-coverage-and-contract.md` §6:
 *
 * 1. `DocumentModel` serialises inside the model and three renderers read it. Adding a field
 *    forces a model version bump and a decision about what an old `.ded` does on open.
 * 2. A record of emissions does not belong to the document; it belongs to the project. The
 *    same document can be issued three times and still be the same document.
 * 3. `supersede()` moves documents to `supersededDocs` without touching records, so a record
 *    can OUTLIVE its document — which is exactly what makes the stale list useful.
 *
 * It is also why this is a new file rather than four more members on `detailing.svelte.ts`:
 * that store is at 795 lines against an 800 ceiling, and separate state deserves separate
 * state.
 *
 * ── Migration: none ────────────────────────────────────────────────
 *
 * A project saved without records reads back with an empty list, and an empty list means "we
 * do not know what was exported" — which is the truth for every project that predates this.
 *
 * ── Forbidden, explicitly ──────────────────────────────────────────
 *
 * Inventing a retroactive record. That a document exists does not prove it was ever exported.
 * There is no method here that takes a document and infers a history, and adding one would
 * produce a list of emissions that never happened.
 */

import {
  isCoherentExport, isStaleExport, staleExports,
  type ExportRecord, type ExportRecordDraft,
} from '../flow/rc-export-record';

function createExportRecordStore() {
  let records = $state<ExportRecord[]>([]);

  return {
    get exports(): readonly ExportRecord[] { return records; },

    /**
     * Record one emission.
     *
     * `seriesId` is supplied by the caller alongside the draft rather than read from the
     * detailing store, so this module does not depend on that one and can be exercised alone.
     * Returns null — recording nothing — when the draft is incoherent: a `ready` with an error,
     * a `failed` without one, or a record still claiming to be `idle` or `running`. A record is
     * written when a generation TERMINATES, and one that has not terminated describes nothing.
     */
    record(seriesId: string, draft: ExportRecordDraft): ExportRecord | null {
      const r: ExportRecord = { ...draft, seriesId };
      if (!isCoherentExport(r)) return null;
      records = [...records, r];
      return r;
    },

    /** The emissions that no longer match `currentRevision`. Information, not a fault. */
    stale(currentRevision: number): readonly ExportRecord[] {
      return staleExports(records, currentRevision);
    },

    /** Whether one record has gone stale. */
    isStale(r: ExportRecord, currentRevision: number): boolean {
      return isStaleExport(r, currentRevision);
    },

    /**
     * Adopt the list from a project file.
     *
     * `undefined` — a file written before the field existed — hydrates to an EMPTY list, and
     * that is the honest reading: we do not know what was exported. Unlike the retouch set,
     * there is no third state to distinguish, because an empty emission list already means
     * "nothing recorded" and never means "nothing was exported" — nothing in the UI may
     * present it as a negative claim.
     */
    hydrate(stored: readonly ExportRecord[] | undefined): void {
      // Filtered on the way in: a hand-edited or truncated file must not be able to introduce
      // a record that `record()` itself would have refused.
      records = (stored ?? []).filter(isCoherentExport);
    },

    /**
     * Drop everything.
     *
     * For a new or reopened project. Note that after a reopen the correct state is an EMPTY
     * list — "we do not know" — and not a reconstruction.
     */
    reset(): void { records = []; },
  };
}

export const exportRecordStore = createExportRecordStore();
