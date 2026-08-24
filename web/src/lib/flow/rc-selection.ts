/**
 * What can be selected in the concrete flow, and how the detailing list groups it.
 *
 * ── This module does NOT hold a selection ──────────────────────────
 *
 * That is the point of it. `rebarWorkspace.selection` is the channel and stays the only one;
 * this is the vocabulary its two consumers agree on. The store already states the rule, on the
 * `conflict` field it deliberately carries instead of splitting out:
 *
 *   "Carried on the selection rather than in a channel of its own so that 'what is selected'
 *    has exactly one answer. A second selection channel is how a panel comes to highlight one
 *    thing while the viewport highlights another."
 *
 * The measured problem §3 of the scope names is that the channel is confined to the 3-D
 * overlay. Its eight consumers — RebarWorkspace, RebarScenePanel, RebarStatusPanel,
 * RebarLayersPanel, SelectionDetails, ConflictInspector, DesignFamilyPanel, App — are all
 * overlay components, and `DetailingWorkflow.svelte` and `ProRcWorkflowTab.svelte` reference it
 * zero times. So today the detailing list and the viewer genuinely ARE two independent
 * representations of the same element.
 *
 * The fix is scope, not mechanism: the list reads and writes the same `selection`. Anything
 * here that stored one would recreate the defect it was written to close.
 *
 * ── Why a `.ts` and not part of the store ──────────────────────────
 *
 * Grouping and family resolution are pure functions of the scene's kinds. Keeping them out of
 * the `.svelte.ts` means the detailing list's grouping can be asserted without a rune, a
 * component or a browser — which is what `workspaceFilter` had to be moved out of a component
 * to achieve.
 */

import { SCENE_SOLID_KINDS, type SceneSolidKind } from '../engine/detailing/scene-model';

/**
 * The three groups the detailing stage lists elements under, per §3 of the scope.
 *
 * They are a presentation of the six scene families, not a replacement for them: the renderer
 * still batches per family and the layer switches still toggle per family. A seventh family
 * added to the scene without a group here is a family that would silently vanish from the
 * list, which `rcGroupOf` makes impossible — see the exhaustiveness test.
 */
export type RcElementGroup = 'linear' | 'surface' | 'foundation';

/** The groups in the order the list presents them. */
export const RC_ELEMENT_GROUPS: readonly RcElementGroup[] = ['linear', 'surface', 'foundation'];

/**
 * Which group a scene family belongs to.
 *
 * `pedestal` sits with foundations and not with columns, though it is a column-shaped thing:
 * it is part of what transfers the column into the footing, it is designed by the footing
 * pass, and a user looking for it is looking under Fundaciones. Grouped by where the work
 * happens, not by geometry.
 */
export function rcGroupOf(kind: SceneSolidKind): RcElementGroup {
  switch (kind) {
    case 'beam':
    case 'column':
      return 'linear';
    case 'slab':
    case 'wall':
      return 'surface';
    case 'footing':
    case 'pedestal':
      return 'foundation';
  }
}

/** The families in a group, in scene order so the list and the layer switches agree. */
export function rcFamiliesIn(group: RcElementGroup): SceneSolidKind[] {
  return SCENE_SOLID_KINDS.filter((k) => rcGroupOf(k) === group);
}

/**
 * i18n key for a group's heading. This module names keys; it never translates.
 *
 * `design.elementGroup.*` and not `design.group.*`: the latter namespace is already twenty-one
 * keys about how a BATCH EDIT groups members — by elevation, by structural plane, by frame
 * line. Two unrelated meanings under one prefix is how a key gets reused for the wrong thing.
 */
export function rcGroupLabelKey(group: RcElementGroup): string {
  return `design.elementGroup.${group}`;
}

/**
 * What a click in the detailing list is asking for.
 *
 * Three shapes, because the list has three kinds of row and they mean different things:
 *
 *   `element`  one member. Resolves to a selection with that member's id.
 *   `family`   every member of one scene family — "all the beams".
 *   `group`    every member of the three-way grouping — "everything linear".
 *
 * A family or group target is NOT a selection of its own kind. It resolves to the element ids
 * it contains and is then handed to the same `select()` the viewport uses, so a group click and
 * a rubber-band in the viewport produce the same state. If a group could be "selected" as a
 * group, the panel and the viewport would again be describing different things.
 */
export type RcSelectTarget =
  | { kind: 'element'; elementId: number }
  | { kind: 'family'; family: SceneSolidKind }
  | { kind: 'group'; group: RcElementGroup };

/**
 * The element ids a target names.
 *
 * `membership` is the scene's own family map — `ReadonlyMap<elementId, SceneSolidKind>`, which
 * `scene-model.ts` already builds. Passed in rather than read, so this stays pure and so the
 * caller cannot accidentally resolve against a scene other than the one on screen.
 *
 * Returns them sorted, because a selection is a set and two clicks that name the same members
 * must compare equal.
 */
export function rcResolveTarget(
  target: RcSelectTarget,
  membership: ReadonlyMap<number, SceneSolidKind>,
): number[] {
  switch (target.kind) {
    case 'element':
      return membership.has(target.elementId) ? [target.elementId] : [];
    case 'family':
      return [...membership.entries()]
        .filter(([, k]) => k === target.family).map(([id]) => id).sort((a, b) => a - b);
    case 'group':
      return [...membership.entries()]
        .filter(([, k]) => rcGroupOf(k) === target.group).map(([id]) => id).sort((a, b) => a - b);
  }
}

/**
 * How many members each group holds, for the list's headings.
 *
 * Every group appears in the result, including the empty ones. A group missing from the map
 * would let the list drop its heading, and §2 of the scope is explicit that a family which does
 * not exist in the model must be distinguishable from one that has not been designed — the same
 * distinction the floor tabs already make with a dash rather than a zero.
 */
export function rcGroupCounts(
  membership: ReadonlyMap<number, SceneSolidKind>,
): Record<RcElementGroup, number> {
  const out: Record<RcElementGroup, number> = { linear: 0, surface: 0, foundation: 0 };
  for (const kind of membership.values()) out[rcGroupOf(kind)] += 1;
  return out;
}

/**
 * Whether an edit to one member has to invalidate what is drawn for it.
 *
 * ── The invariant §3 states, made checkable ────────────────────────
 *
 * "No puede haber dos representaciones independientes de un mismo elemento." Selection is one
 * half of that and is handled above. The other half is EDITS: a bar changed in the 2-D detail
 * must change in the 3-D viewer, and vice versa, without either side re-deriving it.
 *
 * The app already has the single source — `rebar-edit.ts` writes through
 * `modelStore.reinforcementTransaction`, and `invalidateAffected` drops the assemblies that
 * depended on what changed. What has not been stated anywhere is the RULE, which is why this
 * is here rather than in a comment:
 *
 *   an edit is retroactive iff every representation of the edited member is rebuilt from the
 *   model after it, and none is patched in place.
 *
 * Patching in place is the failure mode worth naming: it is faster, it looks correct on the
 * surface that was patched, and it is exactly how the two representations drift.
 */
export interface RcEditConsequence {
  /** Members whose stored reinforcement changed. */
  written: readonly number[];
  /** Assemblies that must be dropped because they were derived from what changed. */
  invalidated: readonly string[];
  /**
   * Whether the 3-D scene must be rebuilt.
   *
   * True whenever anything was written. Deliberately not "only when a bar count changed": the
   * scene draws diameters, lengths, hooks and spacings, and a rule that tried to decide which
   * edits the scene cares about would be a second model of what the scene draws.
   */
  rebuildScene: boolean;
}

/** The consequence of writing `written`, given the assemblies that depended on them. */
export function rcEditConsequence(
  written: Iterable<number>,
  invalidated: Iterable<string>,
): RcEditConsequence {
  const w = [...new Set(written)].sort((a, b) => a - b);
  return {
    written: w,
    invalidated: [...new Set(invalidated)].sort(),
    rebuildScene: w.length > 0,
  };
}

/**
 * Whether the app can truthfully say which members were retouched by hand.
 *
 * ── A gap recorded rather than papered over ────────────────────────
 *
 * §4 requires every export to state its manually retouched elements. The set exists —
 * `designRunStore.manualOverrides`, written by `commitManual` and `commitManualBatch` in
 * `rebar-edit.ts` — and it is `$state` in the store and nothing else. Neither `file.ts` nor
 * `tabs.svelte.ts` captures it, so it does NOT survive saving and reopening a project.
 *
 * So after a reload the honest answer is "unknown", not "none". Those are different claims and
 * only one of them is true: an export that printed "manually retouched: none" for a project
 * full of hand edits would be a false statement in the one place whose purpose is to say what
 * is in the drawing.
 *
 * `known` is what the caller must check before rendering a count. Making it persist is a
 * decision about the `.ded` format and belongs with the ExportRecord persistence question, not
 * here.
 */
export interface RcRetouchProvenance {
  /** False when the project was reopened and the override set could not be restored. */
  known: boolean;
  /** The members known to have been edited by hand. Empty and meaningless when `!known`. */
  members: readonly number[];
}

/** `unknown` is the state a reopened project is in, and it is not the same as none. */
export const RC_RETOUCH_UNKNOWN: RcRetouchProvenance = { known: false, members: [] };

/** Provenance from a live override set. */
export function rcRetouch(members: Iterable<number>): RcRetouchProvenance {
  return { known: true, members: [...new Set(members)].sort((a, b) => a - b) };
}
