/**
 * What the detailing list shows, per family, and what it is not allowed to claim.
 *
 * ── Why this module exists at all ──────────────────────────────────
 *
 * Objectives 1 and 2 of §8 are "group bars, plates and foundations" and "list beams and columns;
 * the rest only if they exist". `rc-selection.ts` already owns the GROUPING — `rcGroupOf`,
 * `rcFamiliesIn`, `rcGroupCounts` — and nothing here duplicates it. What was missing is the
 * census the listing needs, and it turned out not to be readable from any single place:
 *
 *   which families the MODEL holds        `modelStore` (frame elements, shells, footings)
 *   which family each ELEMENT is          `verificationStore.contexts[id].elementType`
 *   which elements have DETAILING         `detailingStore.assemblies[].elementIds`
 *
 * Three sources, joined nowhere before this. Kept as a pure function of its inputs, following
 * `rc-selection.ts`'s precedent, so the list's census can be asserted without a rune, a component
 * or a browser.
 *
 * ── The finding that shaped it: `AssemblyKind` is not a family ──────
 *
 * The obvious implementation reads the family off the assembly. It does not work.
 * `run-detailing.ts` builds ONE assembly per level, always with `kind: 'beamLine'`, whose
 * `elementIds` are that level's members — beams and columns together. So `kind` says how the
 * assembly was coordinated, not what its members are, and a list keyed on it would file every
 * column in the building under "beams" while looking entirely plausible.
 *
 * The family per element comes from the verification contexts, and that has a consequence which
 * is the whole reason this module has three states instead of a count.
 *
 * ── Three states, because "none" and "not counted yet" differ ───────
 *
 * `verificationStore.contexts` is populated by the DEMAND pass. Before it runs, the app cannot
 * say whether a model has columns, beams, or both — `DesignFamilyPanel` already documents this
 * and works around it by offering both families whenever there are frame elements at all.
 *
 * So a family has three situations, and flattening them is the defect §2 of the scope names:
 *
 *   `absent`   the model holds none. A real statement about the structure.
 *   `unknown`  the model holds candidates, but nothing has classified them yet. NOT zero.
 *   `present`  classified members exist; `total` and `detailed` are meaningful.
 *
 * `unknown` rendered as `absent` is the specific lie to avoid: it would tell a user their
 * building has no columns because they have not pressed Compute demands yet. The vocabulary for
 * saying it already exists — `design.families.census.unknown` reads "not counted yet" against
 * `design.families.state.noElements`' "no members in this model" — so this reuses it rather than
 * inventing a fourth way to say the same thing.
 */

import {
  RC_ELEMENT_GROUPS, rcGroupOf, rcFamiliesIn, rcGroupLabelKey,
  type RcElementGroup,
} from './rc-selection';
import { SCENE_SOLID_KINDS, type SceneSolidKind } from '../engine/detailing/scene-model';

/** Whether a family is in the model, and whether we are yet in a position to say. */
export type RcFamilyState = 'absent' | 'unknown' | 'present';

export interface RcFamilyCensus {
  family: SceneSolidKind;
  state: RcFamilyState;
  /** Classified members of this family. Zero unless `state === 'present'`. */
  total: number;
  /** How many of those carry coordinated detailing. Never greater than `total`. */
  detailed: number;
}

/** One member row. The id is kept because it is what every other surface keys on. */
export interface RcMemberRow {
  elementId: number;
  family: SceneSolidKind;
  detailed: boolean;
}

export interface RcFamilySection {
  family: SceneSolidKind;
  census: RcFamilyCensus;
  /** i18n key for the family's heading. This module names keys; it never translates. */
  labelKey: string;
  rows: RcMemberRow[];
}

export interface RcGroupSection {
  group: RcElementGroup;
  labelKey: string;
  families: RcFamilySection[];
  /**
   * Whether the list should render this group at all.
   *
   * Linear is always rendered: every reinforced-concrete frame has beams and columns, and a
   * missing heading would read as "this panel does not do frames". Surface and foundation are
   * rendered only when they are not entirely `absent` — which is what "show slabs, walls and
   * foundations only if they exist" means — and `unknown` counts as a reason to render, never
   * as a reason to hide. Hiding an `unknown` family is the flattening this module exists to stop.
   */
  render: boolean;
}

/** i18n key for a family's heading. Reuses the selector's labels rather than a second set. */
export function rcFamilyLabelKey(family: SceneSolidKind): string {
  return `design.families.${family}`;
}

export interface RcMemberListInput {
  /**
   * Family per classified element. `kindByElement(scene.solids)` shape, and also what the
   * verification contexts resolve to. Elements absent from it are unclassified, not familyless.
   */
  membership: ReadonlyMap<number, SceneSolidKind>;
  /** Elements carrying coordinated detailing — the union of every assembly's `elementIds`. */
  detailed: ReadonlySet<number>;
  /**
   * What the MODEL holds per family, where it can be counted at all.
   *
   * A family with candidates but no classification yet must appear here with a positive count
   * and be missing from `membership`; that pair is what produces `unknown`. Omitting it instead
   * would produce `absent`, which is the lie.
   */
  modelCounts: Readonly<Partial<Record<SceneSolidKind, number>>>;
}

/** The census for one family. */
export function rcFamilyCensus(
  family: SceneSolidKind, input: RcMemberListInput,
): RcFamilyCensus {
  let total = 0;
  let detailed = 0;
  for (const [id, kind] of input.membership) {
    if (kind !== family) continue;
    total += 1;
    if (input.detailed.has(id)) detailed += 1;
  }
  if (total > 0) return { family, state: 'present', total, detailed };
  /*
   * Nothing classified. The model's own count decides which of the other two this is, and the
   * order matters: a positive count with no classified member is `unknown`, never `absent`.
   */
  const candidates = input.modelCounts[family] ?? 0;
  return { family, state: candidates > 0 ? 'unknown' : 'absent', total: 0, detailed: 0 };
}

/**
 * Member rows for one family, in id order.
 *
 * Sorted so two renders of the same model list members the same way, for the same reason
 * `rcResolveTarget` sorts: a list is a set, and its order must not depend on map iteration.
 */
export function rcMemberRows(
  family: SceneSolidKind, input: RcMemberListInput,
): RcMemberRow[] {
  const rows: RcMemberRow[] = [];
  for (const [id, kind] of input.membership) {
    if (kind === family) rows.push({ elementId: id, family, detailed: input.detailed.has(id) });
  }
  return rows.sort((a, b) => a.elementId - b.elementId);
}

/**
 * The whole list, grouped.
 *
 * Every group and every family is present in the result, including the ones that will not be
 * rendered. That is deliberate and is the same choice `rcGroupCounts` made: a caller that has to
 * ask "is this family missing from the structure, or missing from this array?" has been handed
 * the ambiguity instead of the answer.
 */
export function rcMemberList(input: RcMemberListInput): RcGroupSection[] {
  return RC_ELEMENT_GROUPS.map((group) => {
    const families = rcFamiliesIn(group).map((family) => ({
      family,
      census: rcFamilyCensus(family, input),
      labelKey: rcFamilyLabelKey(family),
      rows: rcMemberRows(family, input),
    }));
    return {
      group,
      labelKey: rcGroupLabelKey(group),
      families,
      render: group === 'linear' || families.some((f) => f.census.state !== 'absent'),
    };
  });
}

/**
 * Families the list will show a heading for, flattened.
 *
 * Exists so a caller does not re-derive the render rule and end up with a second one that
 * disagrees — the same reason the stage strip takes its stages as a prop instead of deriving them.
 */
export function rcVisibleFamilies(input: RcMemberListInput): SceneSolidKind[] {
  const out: SceneSolidKind[] = [];
  for (const g of rcMemberList(input)) {
    if (!g.render) continue;
    for (const f of g.families) {
      if (g.group === 'linear' || f.census.state !== 'absent') out.push(f.family);
    }
  }
  // Scene order, so the list, the layer switches and the renderer agree on sequence.
  return SCENE_SOLID_KINDS.filter((k) => out.includes(k));
}

/**
 * Whether anything at all can be listed.
 *
 * Distinct from "the list is empty": a model whose families are all `unknown` has plenty to say
 * and nothing to enumerate, and the panel owes the user the difference between "no members" and
 * "not classified yet".
 */
export function rcHasListableMembers(input: RcMemberListInput): boolean {
  return input.membership.size > 0;
}

/** Whether any family is waiting on the demand pass rather than genuinely empty. */
export function rcHasUnclassifiedFamilies(input: RcMemberListInput): boolean {
  return rcMemberList(input).some((g) => g.families.some((f) => f.census.state === 'unknown'));
}

/** Every group a family can be filed under, for the exhaustiveness test. */
export function rcGroupOfFamily(family: SceneSolidKind): RcElementGroup {
  return rcGroupOf(family);
}
