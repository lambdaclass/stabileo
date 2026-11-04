/**
 * The two stamps the stored detailing carries besides its assemblies (`DetailingStore`):
 *
 *  - the document revision, persisted so it does not start over at 1 in every session (an export
 *    record from an earlier session is then compared against the real revision), and moved on
 *    when the model changes after a document was built at it;
 *  - the design fingerprint of the model the assemblies were generated from
 *    (`design-fingerprint.ts`), so every output built from them can say it is out of date, after
 *    a reload too.
 *
 * Pure: the store in, the store out.
 */
import type { DetailingStore } from '../engine/detailing/assembly';

/**
 * The revision after a change, or null when nothing was built at the current one: the document of
 * this session (`hasCurrent`), or one of an earlier session (`documentBuiltRevision`), whose exports
 * are in the log. With neither, nothing that left the app describes this revision.
 */
export function revisionAfterChange(p: DetailingStore, hasCurrent: boolean): number | null {
  const rev = p.documentRevision ?? 1;
  return hasCurrent || p.documentBuiltRevision === rev ? rev + 1 : null;
}

/**
 * `next` written over `p`. The revision never goes back: callers pass a copy of the store read
 * before a retirement moved it on, so the larger of the two is kept. The fingerprint carries over
 * unless `next` gives one (only a regeneration does).
 */
export function withStamps(next: DetailingStore, p: DetailingStore): DetailingStore {
  const max = (a?: number, b?: number) => (a === undefined ? b : b === undefined ? a : Math.max(a, b));
  const documentRevision = max(next.documentRevision, p.documentRevision);
  const documentBuiltRevision = max(next.documentBuiltRevision, p.documentBuiltRevision);
  const modelFingerprint = next.modelFingerprint ?? p.modelFingerprint;
  // The design's refusals are the design's, not the detailing's: a new detailing keeps them.
  const designRefusals = next.designRefusals ?? p.designRefusals;
  return {
    ...next,
    ...(designRefusals !== undefined ? { designRefusals } : {}),
    ...(documentRevision !== undefined ? { documentRevision } : {}),
    ...(documentBuiltRevision !== undefined ? { documentBuiltRevision } : {}),
    ...(modelFingerprint !== undefined ? { modelFingerprint } : {}),
  };
}

/** Whether the assemblies were generated from a model other than `fingerprint`'s. Unknown is not stale. */
export function isModelStale(p: DetailingStore, fingerprint: string): boolean {
  return p.assemblies.length > 0 && !!p.modelFingerprint && p.modelFingerprint !== fingerprint;
}
