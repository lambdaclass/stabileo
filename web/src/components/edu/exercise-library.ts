/**
 * exercise-library.ts — where a teacher's own exercises live between sessions.
 *
 * Without this, authoring is a demo: close the tab and the work is gone. An
 * exercise that took twenty minutes to write has to still be there tomorrow,
 * and has to survive the app being updated underneath it.
 *
 * Storage is `localStorage`, the same place the app already autosaves models.
 * That means per-browser, which is honest about what it is — a teacher's own
 * working set — and why exporting to a file and sharing by link both exist
 * beside it rather than instead of it.
 */

import { fromFile, toFile, type ParseResult } from './exercise-capture';
import type { EduExerciseSpec } from './exercise-spec';
import { t } from '../../lib/i18n';

const KEY = 'stabileo.edu.exercises.v1';

/** Everything the teacher has authored, newest first. */
export function loadLibrary(): EduExerciseSpec[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // Private browsing, or storage disabled. An empty library is the right
    // answer; refusing to open the mode over it would not be.
    return [];
  }
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    // Each entry is validated on the way IN, not trusted because it came from
    // our own storage: a half-written entry from an interrupted save, or one
    // from a newer version of the app, must not break the exercise list.
    return list
      .map((e) => fromFile(JSON.stringify({ stabileoExercise: 1, exercise: e })))
      .filter((r): r is Extract<ParseResult, { ok: true }> => r.ok)
      .map((r) => r.exercise);
  } catch {
    return [];
  }
}

function persist(list: EduExerciseSpec[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    // Quota exceeded, most likely. The caller has to be able to tell the
    // teacher their work was NOT saved rather than let them believe it was.
    return false;
  }
}

/**
 * Add or replace an exercise, keyed by id.
 *
 * Saving over an exercise with the same id is an edit, not a duplicate — which
 * is what a teacher means when they open one, change a question and save.
 */
export function saveToLibrary(exercise: EduExerciseSpec): { ok: boolean; library: EduExerciseSpec[] } {
  const list = [exercise, ...loadLibrary().filter((e) => e.id !== exercise.id)];
  return { ok: persist(list), library: list };
}

export function removeFromLibrary(id: string): EduExerciseSpec[] {
  const list = loadLibrary().filter((e) => e.id !== id);
  persist(list);
  return list;
}

// ─── Sharing by link ───────────────────────────────────────────────

/**
 * Encode an exercise into a URL fragment.
 *
 * A teacher hands a class a link, not a file each student has to download and
 * then work out how to open. Base64 of the JSON keeps it dependency-free and
 * self-contained; a whole exercise is a few hundred bytes, well inside what a
 * URL carries comfortably.
 */
export function toShareLink(exercise: EduExerciseSpec, origin: string): string {
  const json = toFile(exercise);
  // `encodeURIComponent` first so non-ASCII in a Spanish statement survives
  // btoa, which only handles latin-1.
  const encoded = btoa(unescape(encodeURIComponent(json)));
  return `${origin}#edu-ex=${encoded}`;
}

/**
 * Read an exercise out of a URL, if there is one.
 *
 * Returns `null` for "no exercise in this link", which is the common case and
 * not an error. A link that CLAIMS to carry one and fails to parse does report,
 * because a student following a broken link needs to know it is broken.
 */
export function fromShareLink(hash: string): ParseResult | null {
  const m = /[#&]edu-ex=([^&]+)/.exec(hash);
  if (!m) return null;
  try {
    const json = decodeURIComponent(escape(atob(m[1])));
    return fromFile(json);
  } catch {
    return { ok: false, error: t('edu.capture.errLinkDamaged') };
  }
}
