/**
 * The catalogue side of `materialFamilyOf`: a declared grade, resolved to a family.
 *
 * ── Why this file exists at all ────────────────────────────────────
 *
 * `material-family.ts` deliberately does not import a catalogue. It takes a
 * `GradeFamilyLookup` so it stays pure and testable, and PR21 left every call site passing
 * `undefined` with a comment saying the grade catalogue "is not on this branch". It is: the
 * merge that brought `structural-grades.ts` and `non-metal-grades.ts` in
 * (`d1ba4fb2`, PR #132) is an ancestor of this branch's base. So the lookup can be supplied,
 * and every family verdict that used to be a guess about the magnitude of `fy` becomes a
 * reading of what the project recorded.
 *
 * The injection point stays where it was. This module is the implementation, not a
 * replacement of the seam: `materialFamilyOf` still works with no catalogue at all, which is
 * what keeps its tests free of one.
 *
 * ── Why the non-metals are in here too ────────────────────────────
 *
 * `material-presets.ts` writes `gradeId` for concrete and timber as well — `cirsoc-h25`,
 * `en338-c24` — because they come out of the same picker. A lookup that only knew the metals
 * would return null for those and fall back to the `fy <= 80` inference, which happens to
 * get concrete right and would get a 60 MPa timber class wrong in a way nobody would notice.
 * Answering from the catalogue for every family it has is both easier and honest.
 *
 * ── What it will not do ───────────────────────────────────────────
 *
 * It never guesses. An id the catalogue does not know returns null, which sends
 * `materialFamilyOf` back to the inference — the right answer for a project saved against a
 * grade that has since been withdrawn, and the reason the inference is kept rather than
 * deleted.
 *
 * Pure: no store, no runes, no i18n.
 */

import { gradeById, type GradeFamily } from '../../data/structural-grades';
import { CONCRETE, TIMBER } from '../../data/non-metal-grades';
import type { GradeFamilyLookup, StructuralMaterialFamily } from './material-family';

/**
 * A metal grade's family, as the product-standard catalogue names it, mapped onto the
 * families the product distinguishes.
 *
 * Stainless resolves to `steel` because it is one: ferrous, same modulus order, and the
 * distinction that matters downstream is metal-versus-concrete, not the alloy. That is not a
 * claim that a stainless member can be checked to CIRSOC 301 — nothing metallic can be
 * checked to anything here — it is a statement about what the material is.
 *
 * Written as an exhaustive switch rather than a record so that a new `GradeFamily` in the
 * catalogue fails to compile here instead of silently resolving to `unknown`.
 */
function familyOfMetalGrade(family: GradeFamily): StructuralMaterialFamily {
  switch (family) {
    case 'hot-rolled':
    case 'cold-formed':
    case 'stainless':
      return 'steel';
    case 'aluminium':
      return 'aluminium';
  }
}

/**
 * Non-metal ids, indexed once.
 *
 * Both arrays are module-level constants, so this map is built once per session and cannot
 * drift from them. `concrete` and `timber` are the `family` fields of those very rows, read
 * rather than restated.
 */
const NON_METAL: Map<string, StructuralMaterialFamily> = new Map([
  ...CONCRETE.map((c) => [c.id, c.family] as const),
  ...TIMBER.map((w) => [w.id, w.family] as const),
]);

/**
 * The lookup to hand `materialFamilyOf`.
 *
 * Null for an unknown id, which is the contract: not "unknown family", but "this catalogue
 * cannot answer", so the caller falls back rather than reporting a material with a plain
 * strength as unclassifiable.
 */
export const catalogueGradeFamily: GradeFamilyLookup = (gradeId) => {
  const metal = gradeById(gradeId);
  if (metal) return familyOfMetalGrade(metal.family);
  return NON_METAL.get(gradeId) ?? null;
};
