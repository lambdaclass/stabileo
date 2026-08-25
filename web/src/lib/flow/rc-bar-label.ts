/**
 * How a bar is named to a person, and where its technical id goes instead.
 *
 * ── The defect ─────────────────────────────────────────────────────
 *
 * The detailing bar list rendered `bar.id` in a monospace column: `col-61:ties:stirrup:0.000`.
 * That string is a stable key for the coordination engine and it is the right thing for a test
 * hook, a conflict record or a schedule join. It is the wrong thing to put in front of an
 * engineer, for a reason that is not aesthetic: it encodes the generator's internal grammar —
 * an owner tag, a generator family, a slot name and a station coordinate — and none of those
 * four is what a person needs to know about that bar.
 *
 * What they do need is on the bar already, and on the mark that groups it:
 *
 *   mark          `B12`, the tag on the drawing and on the schedule. What a bender asks for.
 *   diameter      `Ø16`.
 *   role          longitudinal or transverse.
 *   owner         the members it belongs to. A continuous bar over a support names both.
 *
 * ── Kept, not hidden ───────────────────────────────────────────────
 *
 * The id stays on the row at a secondary level. Two different people need the two forms — an
 * engineer reads the mark, and whoever is reconciling a conflict record or a bug report needs
 * the exact key — and dropping it would trade one unusable list for another.
 *
 * ── Why this is a module and not a template expression ─────────────
 *
 * Because the assertion that matters is negative and has to be checkable: the PRIMARY label
 * must never be a technical id. `rcLooksTechnical` is that check, and it is here so the test
 * and the component agree on what "technical" means instead of each guessing.
 */

/** The role keys that already exist in the dictionaries. */
const ROLE_KEY: Record<string, string> = {
  longitudinal: 'detailing.schedule.role.longitudinal',
  transverse: 'detailing.schedule.role.transverse',
};

/** Everything needed to name one bar. Keys, never translated strings. */
export interface RcBarLabel {
  /** The drawing mark, when the bar has one. Null before marks are assigned. */
  mark: string | null;
  diameterMm: number;
  /** i18n key for the role, or null when the role is not one this app names. */
  roleKey: string | null;
  /** The members it belongs to, sorted. A bar continuous over a support names both. */
  ownerElementIds: readonly number[];
  /**
   * The engine's key for this bar.
   *
   * Carried so the row can show it at a secondary level. It is never the primary label — see
   * `rcLooksTechnical`.
   */
  technicalId: string;
}

/** The shape this reads from a bar. Structural, so it can be exercised without the engine. */
export interface RcBarLike {
  id: string;
  diameterMm: number;
  role: string;
  ownerElementIds: readonly number[];
}

/**
 * Name one bar.
 *
 * `markOf` maps a bar id to its mark and is supplied by the caller, because marks are assigned
 * per assembly by `assignMarks` and this module must not reach for an assembly to find one.
 * A bar with no mark yet returns `null` rather than a placeholder: "not marked yet" and "marked
 * B0" are different facts, and a schedule that showed the second for the first would be wrong
 * on the one column a bender reads.
 */
export function rcBarLabel(bar: RcBarLike, markOf: (id: string) => string | undefined): RcBarLabel {
  return {
    mark: markOf(bar.id) ?? null,
    diameterMm: bar.diameterMm,
    roleKey: ROLE_KEY[bar.role] ?? null,
    ownerElementIds: [...bar.ownerElementIds].sort((a, b) => a - b),
    technicalId: bar.id,
  };
}

/**
 * Whether a string is one of the engine's keys rather than something to show a person.
 *
 * Deliberately structural rather than a list of known prefixes: the grammar is
 * `owner:family:slot:station`, so anything carrying a colon-separated tail is a key. A future
 * generator that invents a new family would still be caught, which a prefix list would not do.
 *
 * Used by the test that keeps the primary label honest, and by the component to decide what
 * belongs in the secondary slot.
 */
export function rcLooksTechnical(s: string): boolean {
  return /:/.test(s);
}

/**
 * The parts of the primary label, in reading order, as already-resolvable pieces.
 *
 * Returns keys and numbers; the caller translates. A bar with no mark leads with its diameter,
 * because that is the next most identifying thing a person has — not with a blank.
 */
export function rcBarLabelParts(l: RcBarLabel): {
  lead: string;
  diameter: number;
  roleKey: string | null;
  owners: readonly number[];
} {
  return {
    lead: l.mark ?? `Ø${l.diameterMm}`,
    diameter: l.diameterMm,
    roleKey: l.roleKey,
    owners: l.ownerElementIds,
  };
}
