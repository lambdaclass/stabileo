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
import type { DesignFamily } from '../engine/design/design-families';

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

/** Design the members the user has selected in the table. */
export function rcAutoDesignSelected(elementIds: readonly number[]): void {
  diagnosticsWarning.arm();
  designRunStore.autoDesign([...elementIds]);
}

/** Design only the members that carry no reinforcement yet. */
export function rcAutoDesignUndesigned(elementIds: readonly number[]): void {
  diagnosticsWarning.arm();
  designRunStore.autoDesign([...elementIds]);
}

/**
 * Run the design over the scope the selector shows.
 *
 * The scope comes from the store rather than from an argument, because it is the same fact the
 * read-out beside the button renders — passing it in would let a caller run a scope the screen
 * never showed.
 */
export function rcDesignScope(verifierId: string): ReturnType<typeof designRunStore.designFamilies> {
  diagnosticsWarning.arm();
  return designRunStore.designFamilies(designRunStore.familySelection, { verifierId });
}

/** The families the next run will cover. Exposed so a caller can report the scope it ran. */
export function rcDesignScopeFamilies(): readonly DesignFamily[] {
  return designRunStore.familySelection;
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
