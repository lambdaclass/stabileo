/**
 * Where the seconds go when the 3-D workspace opens.
 *
 * ── Why this is in the product and not in a test ───────────────────
 *
 * "The button does not respond, and once it took about ten seconds." Six things happen between
 * that click and a picture — a document is assembled, a scene is projected, a WebGL context is
 * created, the geometry is built, the panels are laid out, a frame is drawn — and from outside
 * they are indistinguishable. Every attempt to attribute the time from a stopwatch on the
 * OUTSIDE guessed wrong at least once: the profile blamed `WebGLRenderer.setSize` for 1,7 s
 * that was really a deferred GPU flush, and blamed the geometry for 1,9 s that was really a
 * quadratic in the document builder.
 *
 * So the phases are recorded where they actually happen. `performance.mark` costs a few
 * microseconds and the marks are useful in a real user's DevTools timeline, not only under
 * Playwright — which is the reason this is not behind the e2e flag: a report of "ten seconds"
 * from a machine nobody has access to is answerable if the phases are already in the trace.
 *
 * Never throws and never returns a partial phase as a whole one. A missing mark means that
 * phase did not run, and it is omitted rather than reported as zero.
 */

/** The phases of one workspace open, in the order they occur. */
export type OpenPhase =
  /** The click handler started. */
  | 'click'
  /** The DocumentModel was assembled (synchronous, inside the handler). */
  | 'document'
  /** The SceneModel was projected from the document (or served from its cache). */
  | 'scene'
  /** The WebGL context, camera and controls exist. */
  | 'renderer'
  /** Tubes, solids and conflict markers are on the GPU. */
  | 'geometry'
  /** The first frame has been rendered. */
  | 'frame';

const PREFIX = 'stabileo:3d:';
const ORDER: OpenPhase[] = ['click', 'document', 'scene', 'renderer', 'geometry', 'frame'];

function perf(): Performance | null {
  return typeof performance !== 'undefined' && typeof performance.mark === 'function'
    ? performance
    : null;
}

/**
 * Record that a phase has just completed.
 *
 * `click` also clears the previous open's marks, so a second visit measures itself rather than
 * the distance back to the first one.
 */
export function markOpenPhase(phase: OpenPhase): void {
  const p = perf();
  if (!p) return;
  try {
    if (phase === 'click') {
      for (const name of ORDER) p.clearMarks(PREFIX + name);
    }
    p.mark(PREFIX + phase);
  } catch {
    // A mark is a diagnostic. It may never be the reason an open fails.
  }
}

/**
 * Milliseconds from the click to the end of each phase that ran.
 *
 * Cumulative rather than per-phase because that is the shape of the question — "how long
 * before the user saw X" — and because per-phase deltas are a subtraction away.
 */
export function openTimeline(): Partial<Record<OpenPhase, number>> {
  const p = perf();
  if (!p) return {};
  try {
    const at = (name: OpenPhase): number | undefined =>
      p.getEntriesByName(PREFIX + name, 'mark').at(-1)?.startTime;
    const t0 = at('click');
    if (t0 === undefined) return {};
    const out: Partial<Record<OpenPhase, number>> = {};
    for (const name of ORDER) {
      const t = at(name);
      if (t !== undefined) out[name] = +(t - t0).toFixed(1);
    }
    return out;
  } catch {
    return {};
  }
}
