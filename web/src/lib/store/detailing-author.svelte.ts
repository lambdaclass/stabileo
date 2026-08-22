/**
 * Who signs the detailing revision.
 *
 * ── Why this left the component ───────────────────────────────────
 *
 * The name was `let engineer = $state('')` inside `DetailingWorkflow`, which was fine while
 * that panel owned the only button that built a document. PR20 puts a second `Ver modelo 3D`
 * on the Design command row, and a second owner of the same fact is how two buttons with one
 * name become two operations: press the panel's and the revision is signed "A. Ingeniera",
 * press the toolbar's and the very same revision is signed "unnamed".
 *
 * So the name lives here and both read it. It is UI state — nothing in this file decides
 * anything structural, and no detailing rule reads it. It is deliberately NOT persisted with
 * the project: the author of a revision is whoever is at the machine now, and restoring
 * somebody else's name onto your revision would be worse than asking for it again.
 */

let name = $state('');

export const detailingAuthor = {
  get name() { return name; },
  set(v: string) { name = v; },
  /** The name to stamp, or the caller's fallback when nobody has typed one. */
  resolve(fallback: string): string { return name.trim() || fallback; },
};
