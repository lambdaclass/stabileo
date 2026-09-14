/**
 * Which of the viewer's standing notices the reader has folded away.
 *
 * ── What "closed" is allowed to mean here ──────────────────────────
 *
 * Not "gone". The two notices this governs say that steel on screen is a PROPOSAL and that
 * torsion was never checked, and `ProvisionalBanner` states the reason those sentences cannot be
 * dismissed outright: "the whole risk of drawing provisional steel is that it looks exactly like
 * the real thing from across a desk". A control that removed them would be a control for making
 * the drawing look finished.
 *
 * So closing FOLDS the paragraph and leaves the claim: the notice collapses to a one-line chip
 * carrying the same label and the same count, with the detail one click away. On the 7-storey
 * building the two notices were 48 px each — 96 px of a 720 px window, permanently, measured —
 * and the geometry the user opened the viewer for got the remainder. Folded, they cost one row.
 *
 * ── Why the session and not the project ────────────────────────────
 *
 * Folding is a reading gesture, not a property of the works. It is the same line
 * `document-scope.svelte.ts` draws about which elements a document covers and
 * `detailing-sheet.svelte.ts` draws about the sheet kind: persisting it would mean a project
 * reopened weeks later hid a construction warning because somebody once folded it, and would ask
 * for a model-version bump to carry a value whose honest default is "open".
 *
 * Nothing here is written to storage. A reload shows both notices in full.
 *
 * ── Why the fold is keyed on the COUNT ─────────────────────────────
 *
 * Because a different count is a different statement. Folding "5 members carry a proposal" must
 * not also fold "60 members carry a proposal" after a regeneration — that is the one way a fold
 * could hide something the reader has not seen. The key is the count, so the notice re-opens by
 * itself when the number changes and stays folded while it does not.
 */

/** The viewer notices that can be folded. Each is a different fact about different members. */
export type ViewerNoticeKind = 'provisional' | 'torsion';

function createViewerNotices() {
  /** Kind → the count that was on screen when the reader folded it. */
  let foldedAt = $state<Partial<Record<ViewerNoticeKind, number>>>({});

  return {
    /**
     * Whether this notice is folded FOR THIS COUNT.
     *
     * `count` is required rather than optional: a caller that forgot to pass it would get a fold
     * that outlives the statement it was applied to, which is the one failure this store's key
     * exists to prevent.
     */
    folded(kind: ViewerNoticeKind, count: number): boolean {
      return foldedAt[kind] === count;
    },

    fold(kind: ViewerNoticeKind, count: number): void {
      foldedAt = { ...foldedAt, [kind]: count };
    },

    unfold(kind: ViewerNoticeKind): void {
      const next = { ...foldedAt };
      delete next[kind];
      foldedAt = next;
    },

    toggle(kind: ViewerNoticeKind, count: number): void {
      if (this.folded(kind, count)) this.unfold(kind);
      else this.fold(kind, count);
    },

    /** Both notices open again. For tests, and for a reset of the session's reading state. */
    reset(): void { foldedAt = {}; },
  };
}

export const viewerNotices = createViewerNotices();
