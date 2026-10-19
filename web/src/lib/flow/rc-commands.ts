/**
 * The pipeline's actions, in one place, so that any stage can reach them.
 *
 * ── Why this exists ────────────────────────────────────────────────
 *
 * All eleven commands lived in `DesignToolbar`, which F2 moved inside the DISEÑAR stage. So the
 * strip names five stages and the actions of all five sit in one — and navigating to DETALLE
 * through the timeline CLOSES the stage holding the command DETALLE needs.
 *
 * Moving the buttons is the next step and this is its precondition: while each action was a
 * closure inside the component that drew its button, relocating a button meant copying a
 * handler, and a copied handler is a second source of truth about what the action does.
 *
 * ── This module is the action layer, and it is deliberately impure ─
 *
 * Its neighbours in `lib/flow` are contracts: `rc-stages`, `rc-selection` and
 * `rc-forces-report` take plain records and touch no store, precisely so they can be asserted
 * without a browser. This one is the opposite by design — an action IS a store effect. It is
 * here rather than in `lib/store` because it belongs to no single store: `computeDemands`
 * arms a warning store and runs a design store, and that pairing is the thing being preserved.
 *
 * ── What the arming is, and why every design command does it ───────
 *
 * `diagnosticsWarning.arm()` is not incidental. `diagnostics-warning.svelte.ts` states the
 * rule: pressing Calculate on a model that cannot be calculated must explain itself, even when
 * the press is the first thing the user did. Loading a model arms implicitly; an explicit press
 * has to arm explicitly. An action relocated without its `arm()` would drop that silently, which
 * is the failure this extraction exists to make impossible.
 */

import { designRunStore } from '../store/design-run.svelte';
import { detailingStore } from '../store/detailing.svelte';
import { diagnosticsWarning } from '../store/diagnostics-warning.svelte';
import { openRebar3D, type OpenRebar3DResult } from '../store/rebar-open';
import { designEverything, designMembers, undesignedMembers, type DeskReport } from '../store/design-desk';
import type { RunScope } from '../store/design-desk-ui.svelte';

/**
 * Derive the station demands.
 *
 * REGLAMENTOS' action: demands come from the solve and are what the code check reads. Named
 * here so the button can move to that stage without the arming travelling as a copy.
 */
export function rcComputeDemands(): void {
  diagnosticsWarning.arm();
  designRunStore.computeDemands();
}

/**
 * Run the code check against the reinforcement provided.
 *
 * DISEÑAR's action, and not a step before it: checking bars that do not exist yet is the claim
 * F1 removed from the strip, and the command bar still repeats it by putting a "Verify" group
 * ahead of the "Design" one.
 */
export function rcCodeCheck(): void {
  diagnosticsWarning.arm();
  designRunStore.runCodeCheck();
}

/**
 * «Size…»: the ONE design command, from every button that starts a design (the top of the Design
 * stage, the member list's toolbar, a test hook). It used to be three: «Design all» in the classic
 * strip designed over the members a person had edited, with a verifier written into the button
 * and no steel check; «Design selected» did the same over the selection; the desk's «Design» kept
 * the edited ones and checked the steel. The same name ran different things. Now the scope is a
 * choice the command shows (everything, the selection, what has no bars yet), the edited members
 * are kept unless the person chose to overwrite them (`autoDesign`'s rule), the verifier is the
 * project's (`resolveVerifierId`), and the steel check runs when asked.
 */
export interface DesignCommand {
  scope: RunScope;
  /** The members of a `selection` run. */
  ids?: readonly number[];
  /** Members a person edited and did not lock: kept, unless the person chose to overwrite them. */
  edited?: 'keep' | 'overwrite';
  /** Check the steel members (CIRSOC 301) and the other materials after the concrete. */
  steel: boolean;
}

export function rcDesign(c: DesignCommand): DeskReport {
  diagnosticsWarning.arm();
  const edited = c.edited ?? 'keep';
  if (c.scope === 'all') return designEverything({ edited, steel: c.steel });
  const ids = c.scope === 'selection' ? [...(c.ids ?? [])] : undesignedMembers();
  return designMembers(ids, { edited, steel: c.steel });
}

/**
 * Generate the coordinated detailing.
 *
 * DETALLE's action. The prerequisites are RENDERED around the button — `detailing-prerequisites`
 * lists what is missing — and are not part of the call: the store refuses on its own and reports
 * through `detailingStore.lastError`. Worth stating, because an earlier audit of mine claimed
 * this handler carried prerequisite logic and it does not.
 */
export function rcGenerateDetailing(): void {
  detailingStore.generate();
}

/**
 * Stop a running design.
 *
 * Had ZERO test coverage when this module was written — it cancels a design run and nothing
 * exercised it. Extracting it is what makes it testable without mounting a toolbar.
 */
export function rcCancelRun(): void {
  designRunStore.cancel();
}

/**
 * Open the 3-D rebar workspace.
 *
 * A thin pass-through, and that is the point: `openRebar3D` in `lib/store/rebar-open.ts` is
 * already the single implementation behind four entry points — DesignOverview, DesignToolbar,
 * DocumentsSection and ProRibbon. The tree says why in its own words: three ways in, one thing
 * that happens, and a fourth viewer is exactly what this must not be.
 *
 * Re-exposed here so a stage that gains a fifth door reaches the same function rather than
 * importing the store directly and drifting. `at` comes from the CALLER — this module never
 * reads a clock, the same rule the detailing store states about itself.
 */
export function rcOpenRebar3D(author: string, at: string): OpenRebar3DResult {
  return openRebar3D({ author, at });
}
