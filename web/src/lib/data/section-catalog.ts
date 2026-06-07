// Lightweight SectionCatalog classification layer.
//
// ARCHITECTURE ONLY — this does NOT add or alter any profile data. It classifies
// the existing steel families (steel-profiles.ts) by standard / country /
// material / series so the section picker and future catalogs (CIRSOC, AISC,
// cold-formed, aluminium, wood, …) can be grouped and extended without churn.
//
// Honest status: the existing tables are European/Euronorm dimensions. No real
// CIRSOC tables are included here; `code: 'CIRSOC 301'` labelling would require
// importing the actual normalized Argentine profile dimensions first.

import type { ProfileFamily } from './steel-profiles';

export type SectionMaterial = 'hot-rolled-steel' | 'cold-formed-steel';
export type SectionSeries = 'i-beam' | 'channel' | 'angle' | 'hollow';

export interface FamilyClassification {
  family: ProfileFamily;
  /** Standard the dimensions come from (honest: current data is Euronorm). */
  standard: string;
  country: string;
  material: SectionMaterial;
  series: SectionSeries;
}

/**
 * Classification of the 8 currently-shipped families. Per Bauti's call, RHS/CHS
 * are treated as cold-formed for now; the rest are hot-rolled. This is the seam
 * a future CIRSOC/AISC catalog plugs into (add entries with their own standard).
 */
export const FAMILY_CLASSIFICATION: Record<ProfileFamily, FamilyClassification> = {
  IPE: { family: 'IPE', standard: 'Euronorm', country: 'EU', material: 'hot-rolled-steel', series: 'i-beam' },
  IPN: { family: 'IPN', standard: 'Euronorm', country: 'EU', material: 'hot-rolled-steel', series: 'i-beam' },
  HEB: { family: 'HEB', standard: 'Euronorm', country: 'EU', material: 'hot-rolled-steel', series: 'i-beam' },
  HEA: { family: 'HEA', standard: 'Euronorm', country: 'EU', material: 'hot-rolled-steel', series: 'i-beam' },
  UPN: { family: 'UPN', standard: 'Euronorm', country: 'EU', material: 'hot-rolled-steel', series: 'channel' },
  L:   { family: 'L',   standard: 'Euronorm', country: 'EU', material: 'hot-rolled-steel', series: 'angle' },
  RHS: { family: 'RHS', standard: 'Euronorm', country: 'EU', material: 'cold-formed-steel', series: 'hollow' },
  CHS: { family: 'CHS', standard: 'Euronorm', country: 'EU', material: 'cold-formed-steel', series: 'hollow' },
};

/** All families belonging to a material class (for grouped pickers). */
export function familiesByMaterial(material: SectionMaterial): ProfileFamily[] {
  return (Object.values(FAMILY_CLASSIFICATION) as FamilyClassification[])
    .filter((c) => c.material === material)
    .map((c) => c.family);
}

/** Classification for a family, or undefined if not registered. */
export function classifyFamily(family: ProfileFamily): FamilyClassification | undefined {
  return FAMILY_CLASSIFICATION[family];
}
