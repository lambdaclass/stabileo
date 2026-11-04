/**
 * The coefficient of thermal expansion each material is solved with.
 *
 * A member's thermal load carries its material's α (`alpha`) and its section's real depth
 * (`depth` in the plane, `depthY`/`depthZ` in space) to the engine (#407, FR-4). The engine
 * used to apply α = 12·10⁻⁶ /°C and the equivalent rectangle's depth √(12·I/A) to every
 * member, and the app scaled ΔT by α/12·10⁻⁶ and the gradient by √(12·I/A)/h to compensate;
 * a load without them is still solved that way, with a warning (`thermal_default_assumed`).
 * Steel's α is about 12·10⁻⁶; concrete's is 10·10⁻⁶ (CIRSOC 201's value), aluminium's twice
 * steel's, timber's along the grain about a third.
 *
 * A material states its α (`Material.alpha`); otherwise its family's value is used. The family
 * is the declared grade's, or else read from E, in bands no two families share: concrete
 * 15–50 GPa, aluminium 60–80 GPa, steel 180–220 GPa. Not from fy, which cannot tell timber
 * from concrete or aluminium from steel. Anything else — timber and masonry among them, whose
 * moduli overlap — has no α the app knows (`memberAlphaOf` is undefined): the load goes without
 * one, the engine keeps its default and says so, until the material states one.
 */
import type { StructuralMaterialFamily } from './steel/material-family';
import { catalogueGradeFamily } from './steel/grade-family';

/** What the engine assumes for a member, or a shell, whose load states no α. 1/°C. */
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

/**
 * The α a member's thermal load is sent with: the material's own, or its family's when the
 * family is known; undefined when neither is (the engine then keeps its default and warns).
 */
export function memberAlphaOf(material: AlphaReadableMaterial | undefined | null): number | undefined {
  if (material && material.alpha !== undefined && material.alpha > 0) return material.alpha;
  const family = thermalFamilyOf(material);
  return family === 'unknown' ? undefined : FAMILY_ALPHA[family];
}

/** The α a solver thermal load is solved with, as the engine reads it: its own, else the default. */
export function loadAlpha(load: { alpha?: number | null }): number {
  return load.alpha ?? ENGINE_ALPHA;
}

/**
 * The depth a solver thermal gradient acts across, as the engine reads it: the load's own, else
 * the section's equivalent rectangle's √(12·I/A) (0.1 for a section with no area).
 */
export function loadDepth(depth: number | undefined | null, a: number, i: number): number {
  return depth ?? (a > 1e-15 ? Math.sqrt((12 * i) / a) : 0.1);
}
