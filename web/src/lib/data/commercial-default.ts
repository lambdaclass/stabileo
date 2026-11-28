/**
 * commercial-default.ts — the steel a section arrives in.
 *
 * # What this decides
 *
 * Picking a profile from the catalogue says what SHAPE a member is. It also
 * says something about the steel, because a mill rolls each family in a
 * particular grade — an IPN comes in F-24 the way a W comes in A992 — and a
 * model whose sections are catalogue profiles but whose material is whatever
 * was lying around is describing a member nobody would order.
 *
 * So choosing a profile can carry its grade along with it. The whole question
 * is when that is help and when it is interference.
 *
 * # The rule, and why this one
 *
 * The grade is applied ONLY when the element's current material did not come
 * from the catalogue and was not entered by the user — when nobody has chosen a
 * steel on purpose yet.
 *
 * The alternative, applying it always, would silently overwrite a deliberate
 * choice: an engineer verifying an existing structure sets the steel FIRST,
 * because that is the fact they are given, and then tries sections against it.
 * Overwriting that on every section change would be actively destructive, and
 * quietly, since the section is what they were looking at.
 *
 * Doing nothing at all — which is what happened until now, because this
 * mechanism was written and never wired up — leaves every new frame with
 * profiles from a mill catalogue and a generic steel underneath.
 *
 * # What it never does
 *
 * It never edits an existing material. Materials are SHARED between elements,
 * so changing one to suit the member you happen to be editing would change
 * every other member made of it. Applying a grade means pointing this element
 * at a different material, and creating that material if the model has none.
 */

import { commercialGrade, commercialGradesFor, gradeById, type GradeRegion, type StructuralGrade } from './structural-grades';

/** The part of a material this decision looks at. */
export interface MaterialLike {
  /** Present when the material came from the grade catalogue. */
  gradeId?: string;
  /** True when the user entered the material's own numbers. */
  userDefined?: boolean;
  alpha?: number;
}

/**
 * The grade a newly-chosen profile should bring with it, or null to leave the
 * element's material alone.
 *
 * `region` narrows to one country's practice — the design code the user is
 * filtering by. Without one, the first recorded practice for the family is
 * used, which puts local practice first for the families that have it.
 */
export function commercialDefaultFor(
  family: string | undefined,
  current: MaterialLike | undefined,
  region?: GradeRegion | null,
): StructuralGrade | null {
  // A steel was chosen on purpose. Not ours to change.
  if (current?.alpha !== undefined || current?.gradeId || current?.userDefined !== false) return null;
  if (!family) return null;

  const pairing = region
    ? commercialGrade(family, region)
    : (commercialGradesFor(family)[0] ?? null);
  if (!pairing) return null;

  /*
   * A pairing pointing at a grade that no longer exists means the catalogue
   * moved and this table did not. Returning null leaves the model exactly as
   * it was, which is the safe half of a bug rather than a material built from
   * undefined properties.
   */
  return gradeById(pairing.gradeId) ?? null;
}

/** The material fields a grade supplies. Shape matches `addMaterial`. */
export interface MaterialFromGrade {
  name: string;
  e: number;
  nu: number;
  rho: number;
  fy: number;
  gradeId: string;
}

/**
 * A material built from a grade.
 *
 * Named by its designation, which is how it is written on a drawing — "F-24",
 * not "Steel 2". `gradeId` travels with it so the pairing note and any later
 * check can tell where it came from without parsing the name.
 */
export function materialFromGrade(grade: StructuralGrade): MaterialFromGrade {
  return {
    name: grade.designation,
    e: grade.e,
    nu: grade.nu,
    rho: grade.rho,
    fy: grade.fy,
    gradeId: grade.id,
  };
}

/**
 * An existing material carrying this grade, if the model already has one.
 *
 * Reused rather than duplicated: a frame of twenty IPN members should have one
 * F-24, not twenty. Matched on `gradeId` rather than on name, since a user may
 * have renamed it.
 */
export function findMaterialWithGrade<T extends { id: number; gradeId?: string }>(
  materials: Iterable<T>,
  gradeId: string,
): T | undefined {
  /*
   * The guard is not defensive noise. Without it an absent `gradeId` matches
   * every material that also has none — `undefined === undefined` — so asking
   * for "no grade" would hand back the first uncatalogued material in the
   * model and the caller would point the element at it. "Not from the
   * catalogue" is a state, not a key.
   */
  if (!gradeId) return undefined;
  for (const m of materials) if (m.gradeId === gradeId) return m;
  return undefined;
}
