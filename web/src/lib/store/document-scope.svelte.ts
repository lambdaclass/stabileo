/**
 * Which members the next export covers.
 *
 * ── Why this is session state and not a project field ──────────────
 *
 * Because narrowing is a GESTURE, not a property of the works. `detailing-sheet.svelte.ts` draws
 * the same line about the sheet kind and the section station, and the argument is the same one:
 * "which drawing you are looking at is not a property of the project, and a reopened project
 * showing somebody else's section through somebody else's beam would be answering a question
 * nobody asked."
 *
 * Persisting it would be worse than useless here. A `.ded` carrying a selection would make a
 * reopened project export a subset that somebody else chose weeks ago, silently, from a button
 * labelled with the whole set's name — and it would need a model version bump and a decision
 * about what an old file does on open, for a value whose honest default is "everything".
 *
 * ── Why the state is a request and not a resolved list ─────────────
 *
 * `null` is the whole documentable base and is NOT the same as ticking every box. The base moves:
 * regenerating the detailing, designing another family, editing the model. A store holding an
 * explicit list would keep exporting the set that was documentable an hour ago and would need a
 * migration every time the drawing changed. `resolveDocumentScope` measures the base in force on
 * every read, so a stale id falls out and is REPORTED as refused rather than dropped.
 *
 * ── What this store does not decide ────────────────────────────────
 *
 * Whether an id is documentable. That is `rc-document-scope.ts`, which is pure and answers it
 * against the design scope; this holds the request and nothing else. A store that filtered on the
 * way in would be a second authority on the same question, and the two would disagree the first
 * time a family was unticked.
 */

/** The members the user asked for, or null for the whole documentable base. */
function createDocumentScopeStore() {
  let requested = $state<number[] | null>(null);

  return {
    /** The request as it stands. Null means the whole base — see the header. */
    get requested(): readonly number[] | null { return requested; },

    /** True when the user has narrowed anything at all. */
    get narrowed(): boolean { return requested !== null; },

    /** Ask for exactly these. An empty array is a real request: it means nothing. */
    set(ids: readonly number[]): void {
      requested = [...new Set(ids)].sort((a, b) => a - b);
    },

    /**
     * Add or remove one member.
     *
     * `base` is what the tick starts FROM when nothing has been narrowed yet: unticking one box
     * out of the whole set has to become "everything except this one", and it cannot be
     * "just this one". The caller supplies it because the base is the panel's to resolve.
     */
    toggle(id: number, base: readonly number[]): void {
      const current = requested ?? [...base];
      this.set(current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id]);
    },

    /** Back to the whole base, whatever the base becomes later. */
    all(): void { requested = null; },

    /** Nothing selected. Blocks every export, and says which of the two refusals it is. */
    none(): void { requested = []; },

    /**
     * Forget the narrowing.
     *
     * Called when a project becomes live — a file opened, a tab activated, a new project — for the
     * reason `rebar-workspace`'s `reset()` gives about the selection it carries: if the document
     * changed, the old selection no longer points at anything.
     */
    reset(): void { requested = null; },
  };
}

export const documentScope = createDocumentScopeStore();
