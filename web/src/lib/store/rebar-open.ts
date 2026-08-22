/**
 * Opening the 3-D reinforcement workspace — one operation, two buttons.
 *
 * ── Why this is a module and not a function in a component ─────────
 *
 * PR20 promotes "Ver modelo 3D" out of the detailing disclosure and onto the Design command
 * row, because the viewer is the RESULT of the design and was reachable only from a panel two
 * levels below it. The old button stays where it is, beside the exports it belongs with.
 *
 * Two buttons with the same name must not be two operations. They are not: both call
 * `openRebar3D`, so the picture the user gets is the same picture whichever they press, built
 * from the same document instance as the report, the schedule and the drawings.
 *
 * ── Why the document is rebuilt on every open ──────────────────────
 *
 * `detailingStore.document` may hold a revision built before the last rebar edit. Opening on it
 * would show a cage that no longer matches the schedule beside it. Building here is what keeps
 * the 3-D view a projection of the same instance the exports render, rather than of a second
 * document that happens to agree.
 *
 * Nothing here decides anything structural. It builds, it opens, it reports what happened.
 */

import { detailingStore } from './detailing.svelte';
import { rebarWorkspace } from './rebar-workspace.svelte';
import { markOpenPhase } from '../utils/open-timeline';

export interface OpenRebar3DOptions {
  /** Shown on the sheets. Falls back to the caller's own "unnamed" string. */
  author: string;
  /** ISO timestamp stamped on the revision. Passed in so callers stay testable. */
  at: string;
}

export type OpenRebar3DResult =
  | { ok: true }
  /** No coordinated assemblies, so there is nothing to draw. The caller words the refusal. */
  | { ok: false; reason: 'no-document' };

/**
 * Whether the command can do anything right now.
 *
 * Read from the PERSISTED assemblies rather than from a built document, because building one
 * to answer "is the button enabled" would run the whole coordination pass on every keystroke
 * that touches the model. A button that is enabled and then refuses is worse than one that is
 * disabled, so this is deliberately the same condition `buildDocument` requires.
 */
export function canOpenRebar3D(): boolean {
  return detailingStore.assemblies.length > 0;
}

/** Coordinated assemblies currently in the model — the figure the command reports. */
export function rebar3DAssemblyCount(): number {
  return detailingStore.assemblies.length;
}

/**
 * Unresolved bar conflicts.
 *
 * Surfaced ON the command rather than only inside the workspace, so a user who never opens the
 * viewer still learns they exist. Never suppressed, never folded into the assembly count.
 */
export function rebar3DConflictCount(): number {
  return detailingStore.conflicts.length;
}

export function openRebar3D(opts: OpenRebar3DOptions): OpenRebar3DResult {
  // The phases of an open are recorded where they happen — see `open-timeline.ts` for why
  // attributing this from the outside got it wrong twice.
  markOpenPhase('click');
  const doc = detailingStore.buildDocument({ author: opts.author, at: opts.at });
  if (!doc) return { ok: false, reason: 'no-document' };
  markOpenPhase('document');
  rebarWorkspace.openWorkspace();
  return { ok: true };
}
