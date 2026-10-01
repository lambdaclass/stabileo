/**
 * exercise-source.ts — the four ways a structure gets into an exercise.
 *
 * # The problem this solves
 *
 * "Take what is drawn" assumed there was something drawn. Switching from Basic
 * to Educational does not carry the model across, so a teacher who had just
 * built a frame in Basic arrived at the authoring panel with an empty canvas
 * and no obvious way back. The button was not wrong; it was the only door in a
 * room that needs four.
 *
 * So: draw it here, load an example, open a `.ded` saved from Basic, or paste a
 * share link from Basic. All four end in the same place — a model in the store,
 * which the capture step then reads.
 *
 * # Why this is a module and not inline in the panel
 *
 * Each route can fail in its own way — a corrupt file, a link from a different
 * app, an example id that no longer exists — and every one of those has to
 * produce a sentence a teacher can act on rather than a silent no-op. That is
 * easier to get right, and far easier to test, outside a component.
 */

import { modelStore, resultsStore } from '../../lib/store';
import { deserializeProject } from '../../lib/store/file';
import { loadFromShareLink, parseShareURL } from '../../lib/utils/url-sharing';
import { buildSolverInput2D } from '../../lib/engine/solver-service';
import { analyzeKinematics } from '../../lib/engine/wasm-solver';

export type SourceResult = { ok: true } | { ok: false; error: string };

/** The 2D examples worth posing as exercises, in teaching order. */
export const EXERCISE_EXAMPLES: Array<{ id: string; nameKey: string }> = [
  { id: 'simply-supported', nameKey: 'ex.simply-supported' },
  { id: 'cantilever', nameKey: 'ex.cantilever' },
  { id: 'cantilever-point', nameKey: 'ex.cantilever-point' },
  { id: 'point-loads', nameKey: 'ex.point-loads' },
  { id: 'continuous-beam', nameKey: 'ex.continuous-beam' },
  { id: 'gerber-beam', nameKey: 'ex.gerber-beam' },
  { id: 'truss', nameKey: 'ex.truss' },
  { id: 'warren-truss', nameKey: 'ex.warren-truss' },
  { id: 'three-hinge-arch', nameKey: 'ex.three-hinge-arch' },
  { id: 'portal-frame', nameKey: 'ex.portal-frame' },
  { id: 'two-story-frame', nameKey: 'ex.two-story-frame' },
];

/** Load one of the app's own examples into the model. */
export async function fromExample(id: string): Promise<SourceResult> {
  try {
    await modelStore.loadExample(id);
    resultsStore.clear();
    resultsStore.forgetView();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? String(e) };
  }
}

/**
 * Open a `.ded` saved from Basic.
 *
 * `deserializeProject` reports success as a boolean and leaves the model
 * untouched on failure, so a bad file cannot half-load over what the teacher
 * already had.
 */
export async function fromFileDed(file: File): Promise<SourceResult> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: 'errFileRead' };
  }
  try {
    if (!deserializeProject(text)) return { ok: false, error: 'errNotDed' };
    resultsStore.clear();
    return { ok: true };
  } catch {
    return { ok: false, error: 'errNotDed' };
  }
}

/**
 * Open a model from a Basic share link.
 *
 * The link is checked for shape BEFORE loading, so pasting the wrong URL — a
 * plain stabileo.com, or somebody else's link entirely — says so instead of
 * appearing to work and leaving the canvas as it was.
 */
export function fromShareUrl(url: string): SourceResult {
  const trimmed = url.trim();
  if (!trimmed) return { ok: false, error: 'errEmptyLink' };
  if (!parseShareURL(trimmed)) return { ok: false, error: 'errNotShareLink' };
  try {
    if (!loadFromShareLink(trimmed)) return { ok: false, error: 'errLinkBroken' };
    resultsStore.clear();
    return { ok: true };
  } catch {
    return { ok: false, error: 'errLinkBroken' };
  }
}

/** True when the store holds something worth capturing. */
export function hasDrawnModel(): boolean {
  return modelStore.model.nodes.size > 0 && modelStore.model.elements.size > 0;
}

// ─── Kinematic classification, detected rather than declared ───────

/**
 * Classify the current model, so the teacher does not have to state it.
 *
 * Asking an author to type "hyperstatic, degree 3" was the worst part of the
 * old panel: it is the ANSWER to a question the app can work out itself, and
 * getting it wrong means marking a class against a mistake. The app already
 * computes the degree of static indeterminacy for its own diagnostics; this
 * reads it.
 *
 * Returns `null` when it cannot be determined, which is honest — a structure
 * that does not resolve should not silently be called isostatic.
 */
export function detectKinematics(): { classification: 'isostatic' | 'hyperstatic'; degree: number } | null {
  try {
    const input = buildSolverInput2D(modelStore.model, false);
    if (!input) return null;
    const r = analyzeKinematics(input);
    const degree = typeof r?.degree === 'number' ? r.degree : null;
    if (degree === null) return null;
    // A mechanism (negative degree) is neither, and posing it as a question
    // would be teaching something false.
    if (degree < 0) return null;
    return degree === 0
      ? { classification: 'isostatic', degree: 0 }
      : { classification: 'hyperstatic', degree };
  } catch {
    return null;
  }
}
