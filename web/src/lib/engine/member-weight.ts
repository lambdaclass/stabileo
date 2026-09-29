/**
 * A member's weight per metre, kN/m: ρ·A, or Σ ρᵢ·Aᵢ for a section drawn in more than one material.
 *
 * A composite drawn section's `a` is transformed (Σ n·Aᵢ), right for stiffness and wrong for
 * weight: an HEB 300 filled with concrete weighed −31 % with steel as the reference and +43 % with
 * concrete. Self-weight, the statics check and the quantities all read this one function.
 *
 * Pure.
 */
type Mat = { rho: number };
type Sec = { a: number; drawn?: { areas?: Array<{ materialId: number | null; a: number }> } };

export function weightPerMetre(mat: Mat, sec: Sec, materials: ReadonlyMap<number, Mat>): number {
  const areas = sec.drawn?.areas;
  if (!areas?.length) return mat.rho * sec.a;
  let w = 0;
  for (const part of areas) w += (part.materialId == null ? mat.rho : materials.get(part.materialId)?.rho ?? mat.rho) * part.a;
  return w;
}
