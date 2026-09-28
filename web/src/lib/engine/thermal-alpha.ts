/**
 * The coefficient of thermal expansion each material is solved with.
 *
 * The engine applies α = 12·10⁻⁶ /°C to every member's thermal load, whatever it is made of,
 * and to every shell's unless the load states its own. Steel's is about that; concrete's is
 * 10·10⁻⁶ (CIRSOC 201's value), aluminium's twice steel's, timber's along the grain about a
 * third. So a thermal load on a concrete frame was 20 % too strong, and on aluminium half as
 * strong as it is.
 *
 * Without touching the engine: a member's thermal load is linear in α·ΔT, so sending
 * ΔT·(α / α_engine) is exact. Shell thermal loads carry α themselves, so they get it directly.
 *
 * A material states its α (`Material.alpha`); otherwise its family's value is used. The family
 * is the declared grade's, or else read from E, in bands no two families share: concrete
 * 15–50 GPa, aluminium 60–80 GPa, steel 180–220 GPa. Not from fy, which cannot tell timber
 * from concrete or aluminium from steel. Anything else — timber and masonry among them, whose
 * moduli overlap — keeps the engine's value, which is what it had before, until it states one.
 */
import type { StructuralMaterialFamily } from './steel/material-family';
import { catalogueGradeFamily } from './steel/grade-family';

/** What the engine assumes for members, and for shells without their own α. 1/°C. */
export const ENGINE_ALPHA = 12e-6;

/** α by material family, 1/°C. */
export const FAMILY_ALPHA: Readonly<Record<StructuralMaterialFamily, number>> = {
  concrete: 10e-6,
  steel: 12e-6,
  aluminium: 23e-6,
  timber: 5e-6,
  masonry: 7e-6,
  unknown: ENGINE_ALPHA,
};

export interface AlphaReadableMaterial { e?: number; gradeId?: string; alpha?: number }

/** The family α is read for, from the declared grade or from E. */
export function thermalFamilyOf(material: AlphaReadableMaterial | undefined | null): StructuralMaterialFamily {
  if (!material) return 'unknown';
  const declared = material.gradeId ? catalogueGradeFamily(material.gradeId) : undefined;
  if (declared) return declared;
  const e = material.e ?? 0;   // MPa
  if (e >= 15_000 && e <= 50_000) return 'concrete';
  if (e >= 60_000 && e <= 80_000) return 'aluminium';
  if (e >= 180_000 && e <= 220_000) return 'steel';
  return 'unknown';
}

/** The α a material is solved with, 1/°C. */
export function thermalAlphaOf(material: AlphaReadableMaterial | undefined | null): number {
  if (material && material.alpha !== undefined && material.alpha > 0) return material.alpha;
  return FAMILY_ALPHA[thermalFamilyOf(material)];
}

/** The factor a member's ΔT is sent with, so the engine's fixed α becomes the material's. */
export function memberThermalScale(material: Parameters<typeof thermalAlphaOf>[0]): number {
  return thermalAlphaOf(material) / ENGINE_ALPHA;
}
