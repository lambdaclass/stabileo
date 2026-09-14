/**
 * Opening the 3-D reinforcement workspace — one operation, four buttons.
 *
 * ── Why this is a module and not a function in a component ─────────
 *
 * PR20 promotes "Ver modelo 3D" out of the detailing disclosure and onto the Design command
 * row, because the viewer is the RESULT of the design and was reachable only from a panel two
 * levels below it. The old button stays where it is, beside the exports it belongs with.
 *
 * Buttons with the same name must not be different operations. They are not: all of them call
 * `openRebar3D`, so the picture the user gets is the same picture whichever they press, built
 * from the same document instance as the report, the schedule and the drawings.
 *
 * ── Why the viewer is NOT a stage command (F3 step 5) ──────────────
 *
 * F3 moved every pipeline command — demands, required steel, design, detailing — into
 * `RcStageTimeline`, and step 5 asked whether this one should follow. It should not, and the
 * reasons are properties of the operation rather than a matter of taste:
 *
 *  - it has FOUR entry points on purpose, and that is asserted: `cmd-open-3d` on the Design row,
 *    `overview-open-3d`, `doc-3d` beside the exports, and `pr-cmd-rebar3d` in the ribbon. Each
 *    strip command has the opposite invariant — exactly one, no copy in any disclosure;
 *  - one of those entries is the RIBBON, which also serves the metallic flow. That flow has no
 *    `RcStageTimeline`, so a viewer reachable only from the RC strip could not serve it;
 *  - it advances no stage. `rc-stages.ts` has no notion of this workspace, and the strip's action
 *    row is keyed by stage — there is no stage this would belong to;
 *  - its inputs are document metadata (author, timestamp), not stage state, and its prerequisite
 *    is the pipeline's OUTPUT rather than its progress: coordinated assemblies exist.
 *
 * A transversal tool for looking at what the pipeline produced, in other words, reachable from
 * wherever that result is being read. Moving it into the strip would have made the strip claim
 * it was a step, and would have left the other three entries behind as copies.
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
import type { DesignFamily } from '../engine/design/design-families';

export interface OpenRebar3DOptions {
  /** Shown on the sheets. Falls back to the caller's own "unnamed" string. */
  author: string;
  /** ISO timestamp stamped on the revision. Passed in so callers stay testable. */
  at: string;
  /**
   * The documentation scope, for the entry point that sits beside the exports.
   *
   * `doc-3d` is the fourth projection of the document being issued and must show what the other
   * three contain. The three entries that are NOT beside the exports pass nothing and get the
   * whole cage, which is what a design tool should show. See `buildDocument`.
   */
  scope?: { elements: readonly number[]; families: readonly DesignFamily[] } | null;
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
  const doc = detailingStore.buildDocument({
    author: opts.author, at: opts.at, scope: opts.scope ?? null,
  });
  if (!doc) return { ok: false, reason: 'no-document' };
  markOpenPhase('document');
  rebarWorkspace.openWorkspace();
  return { ok: true };
}
