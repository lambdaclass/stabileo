/**
 * When the autosave actually runs.
 *
 * ── Why a 30-second timer is not enough ────────────────────────────
 *
 * The old autosave fired on a `setInterval` and nowhere else. That is a defensible design for
 * a model somebody is editing node by node — at most half a minute of typing is at risk. It is
 * indefensible for the operations this branch added, because each of them is a single click
 * that produces minutes of computed work: `Calcular`, `Diseñar`, `Diseñar pisos`,
 * `Generar detallado`. Losing one of those is not losing thirty seconds of typing, it is
 * losing the run.
 *
 * So the timer stays as the floor, and every operation that produces expensive state asks for
 * a save when it finishes. `requestAutosave` is that ask.
 *
 * ── Coalescing, and why it is not a debounce ───────────────────────
 *
 * Writes must not overlap: two in-flight writes race for the revision counter, and the loser
 * silently retires the winner's record. A debounce would fix that by DELAYING work, which is
 * the wrong trade for a save. This coalesces instead — a request that arrives while a write is
 * in flight is remembered, and one more write runs when that one lands. The state finally
 * stored is therefore always at least as new as the newest request, and never older.
 *
 * Nothing here decides whether a save succeeded. That is `saveAutosave`'s job, and it reports
 * failure to the user itself; this module only records the outcome so a panel or a test can
 * read it back.
 */

import { modelStore } from './model.svelte';
import { saveAutosave } from './file';
import type { AutosaveWriteResult } from './autosave-db';

/** What prompted a save. Recorded so "when did this last save?" has a real answer. */
export type AutosaveReason =
  | 'timer'
  | 'solve'
  | 'design'
  | 'floorDesign'
  | 'detailing'
  | 'viewer'
  | 'restore'
  | 'manual';

export interface AutosaveOutcome {
  reason: AutosaveReason;
  at: string;
  ok: boolean;
  backend: AutosaveWriteResult['backend'];
  revision: number | null;
  failureKind: string | null;
}

let inFlight: Promise<AutosaveWriteResult | null> | null = null;
let pendingReason: AutosaveReason | null = null;
let last: AutosaveOutcome | null = null;

/** The most recent write attempt, successful or not. Null before the first one. */
export function lastAutosaveOutcome(): AutosaveOutcome | null {
  return last;
}

/** Test seam: forget the recorded outcome and any coalesced request. */
export function resetAutosaveService(): void {
  inFlight = null;
  pendingReason = null;
  last = null;
}

/**
 * Ask for an autosave.
 *
 * Resolves to `null` when there was nothing worth saving — an empty model. Never overwrites a
 * stored project with an empty one: the single autosave slot is shared across modes, and an
 * empty write would destroy a pending save whose restore banner the current mode is hiding.
 */
function statesProjectData(): boolean {
  const m = modelStore.model as unknown as Record<string, unknown>;
  return ['grid', 'analysis', 'projectInfo', 'deflectionLimits', 'dynamics', 'notes'].some((k) => m[k] !== undefined && m[k] !== null);
}

export function requestAutosave(reason: AutosaveReason): Promise<AutosaveWriteResult | null> {
  // A project with no nodes yet can still hold work: its grid and levels, its analysis rules, its
  // data. It is saved when it states any of that.
  if (modelStore.nodes.size === 0 && !statesProjectData()) return Promise.resolve(null);
  if (inFlight) {
    // Keep the newest reason: it is the one a reader wants to see attached to the record.
    pendingReason = reason;
    return inFlight;
  }
  inFlight = runOne(reason);
  return inFlight;
}

async function runOne(reason: AutosaveReason): Promise<AutosaveWriteResult | null> {
  try {
    const result = await saveAutosave();
    last = {
      reason,
      at: new Date().toISOString(),
      ok: result.ok,
      backend: result.backend,
      revision: result.revision,
      failureKind: result.failure?.kind ?? null,
    };
    return result;
  } finally {
    inFlight = null;
    const queued = pendingReason;
    pendingReason = null;
    if (queued) void requestAutosave(queued);
  }
}

/** Await whatever write is in flight. Tests and teardown use this; the app does not. */
export function autosaveSettled(): Promise<unknown> {
  return inFlight ?? Promise.resolve(null);
}
