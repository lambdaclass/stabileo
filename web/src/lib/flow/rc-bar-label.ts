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

/**
 * ── A conflict names two bars, and it named them the worst way available ───────────────
 *
 * `DetailingProblems.svelte` rendered `{c.barA} / {c.barB}` — two raw engine keys, in monospace,
 * as the PRIMARY text of the row a reviewer reads first. It is the same defect this module was
 * written for, one component over, and it survived because `BarConflict` carries ids and nothing
 * else: no diameter, no role, no mark. The mark has to be joined in from the assembly's bars.
 *
 * That join can fail, and the failure is not hypothetical — a conflict may reference a bar that
 * is not in the assembly being displayed. So a side is either RESOLVED, and leads with the mark
 * or the diameter like every other bar in this app, or it is not, and leads with the id because
 * there is nothing else true to say. `resolved` reports which, so the component can render the
 * fallback as the reference text it is and the test can scope its negative assertion to the
 * sides that had a bar to name.
 */
export interface RcConflictSide {
  /** What leads the side. The mark, else `Ø16`, else — only when unresolvable — the id. */
  lead: string;
  /** The engine's key. Always carried, and on the row at a secondary level. */
  technicalId: string;
  /** False when no bar with this id was found; then `lead` IS `technicalId`. */
  resolved: boolean;
  /** Null when unresolved. */
  diameterMm: number | null;
}

/** The severity keys that already exist in the dictionaries. */
const SEVERITY_KEY: Record<string, string> = {
  overlap: 'detailing.conflict.overlap',
  clearance: 'detailing.conflict.clearance',
};

/** What this reads from a conflict. Structural, so it needs no collision engine. */
export interface RcConflictLike {
  severity: string;
  barA: string;
  barB: string;
  /** Set when a classifier ran. Passed through; this module names nothing the engine named. */
  classLabelKey?: string;
}

export interface RcConflictLabel {
  a: RcConflictSide;
  b: RcConflictSide;
  severityKey: string;
  classLabelKey: string | null;
  /**
   * Both sides resolved to the SAME mark.
   *
   * Not a defect and not a duplicate row: a mark is a fabrication TYPE, and two physically
   * distinct bars of one type can clash. The row would read `B4 / B4` and look like a bar
   * colliding with itself, so the component is told and shows the two ids without waiting to be
   * asked. This is the one case where the human name is genuinely insufficient on its own.
   */
  sameMark: boolean;
}

/** Name one side of a conflict. */
export function rcConflictSide(
  barId: string,
  barOf: (id: string) => RcBarLike | undefined,
  markOf: (id: string) => string | undefined,
): RcConflictSide {
  const bar = barOf(barId);
  if (!bar) return { lead: barId, technicalId: barId, resolved: false, diameterMm: null };
  const label = rcBarLabel(bar, markOf);
  return {
    lead: rcBarLabelParts(label).lead,
    technicalId: barId,
    resolved: true,
    diameterMm: label.diameterMm,
  };
}

/**
 * Name a conflict the way a person reads it: two named bars, a severity, and the class when the
 * engine classified the pair.
 *
 * The severity mapping moved here from the component, so "what this conflict is called" is
 * decided in one place and the component renders what it is handed. `severity` values this app
 * does not name fall back to the clearance key, which is what the component did before and what
 * every reported conflict that is not an overlap is.
 */
export function rcConflictLabel(
  c: RcConflictLike,
  barOf: (id: string) => RcBarLike | undefined,
  markOf: (id: string) => string | undefined,
): RcConflictLabel {
  const a = rcConflictSide(c.barA, barOf, markOf);
  const b = rcConflictSide(c.barB, barOf, markOf);
  return {
    a,
    b,
    severityKey: SEVERITY_KEY[c.severity] ?? SEVERITY_KEY.clearance,
    classLabelKey: c.classLabelKey ?? null,
    sameMark: a.resolved && b.resolved && a.lead === b.lead,
  };
}
