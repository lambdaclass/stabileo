/**
 * Which families a design run covers, and what "Design all" means by default.
 *
 * ── The workflow this replaces ─────────────────────────────────────
 *
 * "Diseñar todo" designed beams and columns. Slabs, walls and foundations came from a second
 * command, `Ejecutar diseño de pisos`, inside a different disclosure — so a user who pressed
 * the button named "all" got a building with no floors and no way to know that from the
 * button. The 3-D view then showed a frame and the user reported missing slabs.
 *
 * One selection now drives one run. This module owns what the families ARE and what is
 * selected when nobody has chosen; the store owns the running.
 *
 * Pure: no store, no runes, no i18n.
 */

/** The five families a user can include in a run, in the order the selector lists them. */
export const DESIGN_FAMILIES = ['column', 'beam', 'slab', 'wall', 'footing'] as const;

export type DesignFamily = (typeof DESIGN_FAMILIES)[number];

/** The families produced by the frame pass, as opposed to the floor pass. */
export const FRAME_FAMILIES: readonly DesignFamily[] = ['column', 'beam'];
export const FLOOR_FAMILIES: readonly DesignFamily[] = ['slab', 'wall', 'footing'];

/**
 * What the design command covers when the user has not chosen.
 *
 * ── Beams and columns, and nothing else ────────────────────────────
 *
 * They are the two families every reinforced-concrete frame has, and the only two the frame
 * pass can design from the analysis alone. Everything else needs something the user has to
 * supply or confirm:
 *
 *   slabs and walls   come from the floor pass, which is a separate run with its own inputs
 *                     and its own report, and which a frame-only building never runs at all;
 *   footings          need a ground profile with an allowable bearing pressure. Until one is
 *                     supplied the run produces a record stating it could not be verified, so
 *                     including them by default would make the default action report a failure
 *                     the user did not ask for and cannot fix from this screen. Foundations are
 *                     also worked separately in practice, against a soil report that arrives on
 *                     its own schedule.
 *
 * ── This narrowed, and what has to hold for that to be honest ──────
 *
 * It used to be `['column', 'beam', 'slab', 'wall']`. The reason it could be that wide was the
 * defect it was built to close: "Design all" designed beams and columns only, slabs came from a
 * second command in another disclosure, and the button named "all" produced a building with no
 * floors without saying so — the user found out from the 3-D view.
 *
 * Narrowing it re-opens that risk unless one thing holds, and it is the same condition the
 * footing box already relied on: **the scope must be visible before the command runs**. An
 * unticked family that is on screen is a choice; an unticked family nobody can see is the old
 * defect wearing a smaller default. `availableDesignFamilies` exists so the boxes shown are the
 * ones the model actually has, and the command states its own scope beside itself.
 */
export const DEFAULT_DESIGN_FAMILIES: readonly DesignFamily[] = ['column', 'beam'];

export type DesignFamilySelection = readonly DesignFamily[];

export function isFrameFamily(f: DesignFamily): boolean {
  return FRAME_FAMILIES.includes(f);
}

/** True when the run needs the frame pass at all. */
export function needsFramePass(selection: DesignFamilySelection): boolean {
  return FRAME_FAMILIES.some((f) => selection.includes(f));
}

/** True when the run needs the floor pass at all. */
export function needsFloorPass(selection: DesignFamilySelection): boolean {
  return FLOOR_FAMILIES.some((f) => selection.includes(f));
}

/**
 * How a run went, per family.
 *
 * ── Why `noElements` is not `skipped` ──────────────────────────────
 *
 * "You did not ask for footings" and "there are no footings in this model" are different
 * facts with different remedies, and the 7-storey building makes the distinction concrete: it
 * contains no footings at all, so selecting them can only ever report the second. Collapsing
 * the two would tell a user to go and tick a box that would change nothing.
 */
export type FamilyRunState =
  /** Selected, ran, produced results. */
  | 'designed'
  /** Not selected. */
  | 'skipped'
  /** Selected, but the model contains no member of this family. */
  | 'noElements'
  /** Selected and ran, but the command reported an error. */
  | 'failed';

export interface FamilyRunResult {
  family: DesignFamily;
  state: FamilyRunState;
  /** Members the run considered. */
  processed: number;
  /** Members that reached a verified design with reinforcement. */
  designed: number;
  /** Members the design refused, for any reason. */
  refused: number;
  /** Members verified but carrying no bar geometry. */
  notModelled: number;
  /** The command's own failure reason, when `state` is `failed`. */
  errorKey?: string;
  errorParams?: Record<string, string | number>;
}

export function emptyFamilyResult(
  family: DesignFamily, state: FamilyRunState,
): FamilyRunResult {
  return { family, state, processed: 0, designed: 0, refused: 0, notModelled: 0 };
}

export interface DesignRunReport {
  selection: DesignFamilySelection;
  families: FamilyRunResult[];
  /** True when every selected family ran without a command-level error. */
  ok: boolean;
}

/** Totals across the families, for the headline line of the result panel. */
export function totalsOf(report: DesignRunReport): {
  processed: number; designed: number; refused: number; notModelled: number;
} {
  return report.families.reduce((t, f) => ({
    processed: t.processed + f.processed,
    designed: t.designed + f.designed,
    refused: t.refused + f.refused,
    notModelled: t.notModelled + f.notModelled,
  }), { processed: 0, designed: 0, refused: 0, notModelled: 0 });
}

/**
 * The families a model can actually be asked to design.
 *
 * A family with no members is not offered. Not disabled, not ticked-and-inert: absent. A
 * checkbox for something the building does not contain is a question with one answer, and the
 * panel already has to distinguish "this model has no walls" from "the walls have not been
 * designed" — a control that could express only the second would blur exactly that line.
 *
 * `counts` is what the model holds per family, supplied by the caller. Passed in rather than
 * read, so this stays pure and can be exercised without a store.
 *
 * Order follows `DESIGN_FAMILIES`, so two models with the same families list them the same way.
 */
export function availableDesignFamilies(
  counts: Readonly<Partial<Record<DesignFamily, number>>>,
): DesignFamily[] {
  return DESIGN_FAMILIES.filter((f) => (counts[f] ?? 0) > 0);
}

/**
 * The selection to start from, given what the model has.
 *
 * The default intersected with what exists: a frame with no slabs must not open with a slab
 * ticked, and a model with nothing in it selects nothing rather than pretending.
 */
export function initialDesignSelection(
  counts: Readonly<Partial<Record<DesignFamily, number>>>,
): DesignFamily[] {
  const available = availableDesignFamilies(counts);
  return DEFAULT_DESIGN_FAMILIES.filter((f) => available.includes(f));
}

/**
 * A selection narrowed to what the model still has.
 *
 * Called when the model changes under a selection the user made earlier: a family they ticked
 * and then deleted every member of must drop out, or the command would report a scope covering
 * something that is not there.
 */
export function pruneDesignSelection(
  selection: DesignFamilySelection,
  counts: Readonly<Partial<Record<DesignFamily, number>>>,
): DesignFamily[] {
  const available = availableDesignFamilies(counts);
  return DESIGN_FAMILIES.filter((f) => selection.includes(f) && available.includes(f));
}
