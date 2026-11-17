/**
 * Whether the model now open came in from a file, an example or an import and its shells are yet
 * to be made plates. Those shells were built when a plain support at both ends of an outline side
 * held the whole side, so the plates made from them declare those sides held (`edgeSupports`);
 * plates drawn or placed afterwards declare none.
 */
let pending = false;

export function markLoadedModel(): void { pending = true; }

/** Whether a model came in since the last time this was asked, and forget it. */
export function takeLoadedModel(): boolean {
  const was = pending;
  pending = false;
  return was;
}
