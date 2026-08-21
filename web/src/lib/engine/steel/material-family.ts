/**
 * What a material IS, and how confident the app is entitled to be about it.
 *
 * ── The defect this closes ─────────────────────────────────────────
 *
 * `Material.fy` carries f'c for a concrete material and f_y for a steel one: one field, two
 * meanings, told apart by magnitude. The audit found that guess made independently in four
 * places — `auto-verify.ts`, `verification-service.ts`, the CIRSOC 201 adapter, and
 * `member-context.ts`, which does not make it at all and hands a steel member to the
 * concrete pipeline with its yield strength read as a concrete strength.
 *
 * Four copies of a rule is four chances to disagree. This module is the one place the
 * question is answered, and it answers with its own BASIS attached, because "this is steel
 * because someone said so" and "this is steel because its fy is above 80" are different
 * claims and only one of them is worth acting on without a second look.
 *
 * ── Interoperating with what the other branches are doing ──────────
 *
 * Two branches in flight touch this ground and neither is merged:
 *
 *  · PR #125 adds `rcCheckability()` to `auto-verify.ts` with a `CONCRETE_FY_CEILING`
 *    constant of 80 — the same threshold, named, answering the same question from the
 *    concrete side. The ceiling here is deliberately the same number for that reason. When
 *    #125 lands, `auto-verify.ts` should import `CONCRETE_FY_CEILING` from here and delete
 *    its own; that is a two-line follow-up and it is recorded in the handoff.
 *
 *  · PR #132 adds `Material.gradeId`, pointing at a catalogued grade that STATES the family
 *    instead of implying it. This module cannot import that catalogue — it does not exist
 *    on this branch — so the lookup is injected. Post-merge, wiring it is one call site.
 *
 * Pure: no store, no runes, no i18n.
 */

/**
 * The material families the product distinguishes.
 *
 * `unknown` is a real answer, not a missing one: a material with no strength recorded at
 * all cannot be classified, and saying so is better than defaulting it into whichever
 * pipeline happens to ask first.
 */
export const STRUCTURAL_MATERIAL_FAMILIES = [
  'concrete', 'steel', 'timber', 'masonry', 'aluminium', 'unknown',
] as const;

export type StructuralMaterialFamily = (typeof STRUCTURAL_MATERIAL_FAMILIES)[number];

/**
 * The highest characteristic strength, MPa, that is read as concrete rather than metal.
 *
 * Comfortably above any concrete CIRSOC 201 covers and far below any structural metal, so
 * the split is unambiguous in practice. It is still a GUESS about what the number means,
 * which is why every verdict that used it says so.
 */
export const CONCRETE_FY_CEILING = 80;

export type FamilyBasis =
  /** A catalogued grade states the family. Nothing was inferred. */
  | 'declaredGrade'
  /** Inferred from the magnitude of `fy`. Correct in practice, still a guess. */
  | 'inferredFromFy'
  /** No material, or no strength on it. */
  | 'noData';

export interface MaterialFamilyVerdict {
  family: StructuralMaterialFamily;
  basis: FamilyBasis;
  /**
   * i18n key qualifying the verdict. Present whenever the basis is not `declaredGrade`.
   *
   * Never absent on an inference: a surface that shows a family without showing that it was
   * guessed is a surface that has turned a heuristic into a fact.
   */
  caveatKey?: string;
}

/** The minimum a material has to look like for this module to read it. */
export interface FamilyReadableMaterial {
  fy?: number;
  /** PR #132's field. Absent on this branch; read defensively so both shapes work. */
  gradeId?: string;
}

/**
 * Resolve a catalogued grade id to a family.
 *
 * Injected rather than imported so this module works before and after PR #132 lands, and so
 * it stays testable without a catalogue. Return null for an id the catalogue does not know —
 * a stored project can name a grade that has since been withdrawn, and falling back to the
 * inference is better than reporting `unknown` for a material that plainly has a strength.
 */
export type GradeFamilyLookup = (gradeId: string) => StructuralMaterialFamily | null;

/**
 * Classify a material.
 *
 * Never throws and never returns nothing: every material gets a verdict, and the verdict
 * carries how it was reached.
 */
export function materialFamilyOf(
  material: FamilyReadableMaterial | undefined | null,
  lookupGrade?: GradeFamilyLookup,
): MaterialFamilyVerdict {
  if (!material) return { family: 'unknown', basis: 'noData', caveatKey: 'steel.family.noMaterial' };

  // A declared grade wins over any inference. That is the whole point of PR #132's field:
  // it is a fact the project recorded, not a magnitude this code interpreted.
  if (material.gradeId && lookupGrade) {
    const declared = lookupGrade(material.gradeId);
    if (declared) return { family: declared, basis: 'declaredGrade' };
  }

  const fy = material.fy;
  if (fy === undefined || fy === null || !Number.isFinite(fy) || fy <= 0) {
    return { family: 'unknown', basis: 'noData', caveatKey: 'steel.family.noStrength' };
  }

  if (fy <= CONCRETE_FY_CEILING) {
    return { family: 'concrete', basis: 'inferredFromFy', caveatKey: 'steel.family.inferredConcrete' };
  }

  /**
   * Above the ceiling the material is metal — and this inference cannot say WHICH metal.
   *
   * An aluminium 6061-T6 preset carries fy = 276 MPa and is indistinguishable here from a
   * steel grade. Reporting `steel` with the caveat is the useful answer, because everything
   * downstream currently treats non-ferrous metals as unsupported anyway; reporting
   * `unknown` would hide a member that a user can plainly see is metallic. The caveat is
   * what stops it from being a claim, and PR #132's `gradeId` removes the ambiguity for
   * good the moment a grade is bound.
   */
  return { family: 'steel', basis: 'inferredFromFy', caveatKey: 'steel.family.inferredMetalNotFerrousChecked' };
}

/** Convenience: is this material one the concrete pipeline should be handed? */
export function isConcrete(v: MaterialFamilyVerdict): boolean {
  return v.family === 'concrete';
}

/** Convenience: is this material one the metallic surface should list? */
export function isSteel(v: MaterialFamilyVerdict): boolean {
  return v.family === 'steel';
}

/** True when the verdict rests on a magnitude rather than on a declaration. */
export function isInferred(v: MaterialFamilyVerdict): boolean {
  return v.basis !== 'declaredGrade';
}
