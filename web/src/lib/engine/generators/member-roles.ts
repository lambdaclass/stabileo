/**
 * What a generated member IS, as a fact rather than as a name.
 *
 * ── Why this exists ────────────────────────────────────────────────
 *
 * The one industrial-building example in this repository carries its member roles in
 * SECTION NAMES — `Col cord 2L75`, `Cab diag L60`. Nothing in the model knows that the
 * first is a lattice-column chord and the second a truss diagonal; a reader knows because
 * a human wrote the abbreviation. Rename the section and the meaning is gone.
 *
 * Reading a role back out of a name is the same guess this codebase refuses everywhere
 * else — `resolveCanonicalSection` looks a profile up by name only to fetch dimensions,
 * and a test pins that renaming can never change geometry. So the role is carried as data.
 *
 * A generator knows every role with certainty at the moment it places the member: it put
 * the chord there BECAUSE it is a chord. That certainty is worth keeping, and it is what
 * lets the preview count by role, the 3-D view colour by role, and a later design pass ask
 * "which members are purlins" without pattern-matching a string.
 *
 * ── What a role is not ─────────────────────────────────────────────
 *
 * It is not a structural classification and it decides nothing. `classifyElement()` still
 * decides beam/column from geometry, and the design pipeline still reads that. A role
 * records the generator's intent; it never overrides a measurement.
 *
 * Pure: no store, no runes, no i18n.
 */

/** The roles a generator can place. Ordered as the profile editor lists them. */
export const MEMBER_ROLES = [
  'chord',
  'post',
  'diagonal',
  'rafter',
  'column',
  'beam',
  'purlin',
  'bracing',
] as const;

export type MemberRole = (typeof MEMBER_ROLES)[number];

/*
 * There is deliberately no fixed list of "the roles a dialog offers".
 *
 * `requiredRoles(topology)` derives it from the members actually placed, so a generator that
 * stops emitting diagonals stops asking for a diagonal profile without anyone remembering to
 * update a list. An earlier version exported a hardcoded lattice-role list and a
 * `roleLabelKey` helper; neither had a caller, and a dead export beside a live one reads as
 * the API to use.
 */

/**
 * Tally members by role.
 *
 * Every role in `MEMBER_ROLES` is present in the result, at zero when unused. A preview
 * that shows "Diagonal (0)" tells the user the generator considered diagonals and placed
 * none; a preview with the row missing reads as "diagonals are not a thing here", which
 * for a Pratt truss with zero diagonals would be a lie about the topology.
 */
export function tallyRoles(members: ReadonlyArray<{ role: MemberRole }>): Record<MemberRole, number> {
  const out = {} as Record<MemberRole, number>;
  for (const r of MEMBER_ROLES) out[r] = 0;
  for (const m of members) out[m.role]++;
  return out;
}

/** Roles that actually occur, in `MEMBER_ROLES` order — for legends that hide empty rows. */
export function rolesPresent(counts: Record<MemberRole, number>): MemberRole[] {
  return MEMBER_ROLES.filter((r) => counts[r] > 0);
}
