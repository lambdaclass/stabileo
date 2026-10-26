/**
 * Skin reinforcement of a deep beam, CIRSOC 201-2025 §9.7.2.3: past h = 900 mm, longitudinal bars
 * on both side faces over the half of the depth nearest the tension face, spaced as §24.3.2 spaces
 * the bars closest to a tension face (fs = ⅔·fy), cc the clear cover to the skin bars.
 */
import type { RegulationEdition } from '../regulation';
import { crackControlMaxSpacing } from './crack-control';

export const SKIN_DEPTH_LIMIT = 0.9;
export const skinRequired = (h: number): boolean => h > SKIN_DEPTH_LIMIT + 1e-9;

/** The largest spacing the skin bars may have, m, cc measured to them (cover plus the stirrup). */
export function skinMaxSpacing(edition: RegulationEdition, fy: number, cover: number, stirrupDiaMm: number): number {
  return crackControlMaxSpacing(edition, { fy, clearCoverToTensionFace: cover + stirrupDiaMm / 1000 }).maxSpacing;
}

/** The skin the design proposes: Ø10, or Ø12 past 1.2 m, at the largest 25 mm step within the limit. */
export function proposeSkin(edition: RegulationEdition, h: number, fy: number, cover: number, stirrupDiaMm: number): { diameter: number; spacing: number } | null {
  if (!skinRequired(h)) return null;
  const s = Math.floor(skinMaxSpacing(edition, fy, cover, stirrupDiaMm) / 0.025 + 1e-9) * 0.025;
  return s > 0 ? { diameter: h > 1.2 ? 12 : 10, spacing: s } : null;
}
