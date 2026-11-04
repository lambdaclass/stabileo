/**
 * Build the scene once per document, not once per reactive touch.
 *
 * ── The 2,4 seconds this exists to remove ──────────────────────────
 *
 * `buildSceneModel` samples 20 917 bars with `samplePath` on the 7-storey building. That is
 * the expensive step, and it was being repeated for reasons that had nothing to do with the
 * steel: `membersFromModel` returns a fresh array on every call, so the `$derived` that feeds
 * the scene saw a new input whenever anything in the workspace changed — a checkbox, an
 * opacity slider, a selection — and rebuilt the whole projection.
 *
 * Returning from another browser tab was the worst case, because Svelte flushes every pending
 * effect at once and the user waited ~2,4 s with a dead panel.
 *
 * The cache asks the only question that matters: is this the same document, projected over the
 * same members. Both halves are needed. Keying on the document alone would serve a stale scene
 * after a section edit; keying on the members alone would serve one after a re-design.
 *
 * ── Why one entry and not an LRU ───────────────────────────────────
 *
 * A workspace shows one document. A second entry would hold a second copy of 20 917 sampled
 * polylines alive for a document nobody is looking at, which is the memory this is meant to
 * stop spending. Switching documents evicts.
 *
 * Pure: no store, no runes. The staleness question is answered by the inputs, never by a
 * timer or a manual invalidation someone can forget to call.
 */

import {
  buildSceneModel, type MemberGeometry, type SceneModel, type SceneOptions,
} from './scene-model';
import type { DocumentModel } from './document-model';

/**
 * A fingerprint of the member geometry handed to the scene.
 *
 * Covers everything the projection reads off a member: which member, what shape, and where.
 * A section edit changes `width`/`depth`, a moved node changes the endpoints, and either must
 * produce a different scene — so either must produce a different key.
 *
 * Rounded to a millimetre because that is the precision the geometry is authored at, and
 * because float noise in the last bits would defeat the cache without changing any drawing.
 */
export function membersSignature(members: readonly MemberGeometry[]): string {
  let h = 2166136261;
  const eat = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  };
  const mm = (n: number) => Math.round(n * 1000);
  for (const m of members) {
    eat(`${m.elementId}|${m.kind}|${mm(m.width)}|${mm(m.depth)}|${Math.round(m.rollDeg ?? 0)}`);
    eat(`${mm(m.start.x)},${mm(m.start.y)},${mm(m.start.z)}`);
    eat(`${mm(m.end.x)},${mm(m.end.y)},${mm(m.end.z)}`);
  }
  return `${members.length}:${h >>> 0}`;
}

interface CacheEntry {
  doc: DocumentModel;
  membersKey: string;
  /** The physical frame the scene was cut with: a new frame is a new model, so a new scene. */
  physical: SceneOptions['physical'];
  scene: SceneModel;
}

let entry: CacheEntry | null = null;

/** How many times a caller was served without rebuilding. Read by the benchmark. */
let hits = 0;
let misses = 0;

/**
 * The scene for this document and these members, built at most once.
 *
 * The document is compared by IDENTITY, deliberately. `buildDocument` produces a new object
 * every time it runs, and that is exactly when the scene must be rebuilt — a document rebuilt
 * from the same detailing is still a new statement, with its own revision and readiness.
 * Comparing its contents instead would be slower and would serve a scene carrying the wrong
 * revision on its face.
 */
export function cachedSceneModel(
  doc: DocumentModel, members: readonly MemberGeometry[], opts: SceneOptions = {},
): SceneModel {
  const membersKey = membersSignature(members);
  if (entry && entry.doc === doc && entry.membersKey === membersKey && entry.physical === opts.physical) {
    hits += 1;
    return entry.scene;
  }
  misses += 1;
  const scene = buildSceneModel(doc, { ...opts, members });
  entry = { doc, membersKey, physical: opts.physical, scene };
  return scene;
}

/** Cache statistics, for the reactivation benchmark to assert against. */
export function sceneCacheStats(): { hits: number; misses: number } {
  return { hits, misses };
}

/**
 * Drop the cached scene.
 *
 * For tests, which build many documents in one process and would otherwise measure each
 * other's entries. Production never needs it: the key answers the staleness question.
 */
export function resetSceneCache(): void {
  entry = null;
  hits = 0;
  misses = 0;
}
