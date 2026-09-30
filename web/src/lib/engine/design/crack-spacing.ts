/**
 * Crack control of a beam face by bar spacing: CIRSOC 201-2025 §24.3.2 on the bars closest to the
 * tension face (§9.7.2.2 sends beams there), from the bars as provided.
 *
 * The row next to the face is the one the clause limits. Its bars are spread evenly across the
 * width inside the stirrups, as the section layout places them (`computeFaceLayout`), so their
 * centre-to-centre spacing is the width between the outer bar centres over the gaps. c_c, the
 * distance from the bar surface to the tension face, is the cover plus the stirrup. f_s is taken
 * as (2/3) f_y, §24.3.2.1's permission, since the service moment of each region is not at hand
 * here; the result says so.
 *
 * Pure.
 */
import { crackControlMaxSpacing, type CrackControlSpacing } from '../../codes/cirsoc201/crack-control';
import type { RegulationEdition } from '../../codes/regulation';

export interface FaceSpacing { count: number; diameterMm: number; spacing: number; limit: CrackControlSpacing; ok: boolean }

/** The spacing of the row next to the face, against §24.3.2, or null when the row is empty. */
export function crackControlFaceSpacing(
  edition: RegulationEdition,
  layers: ReadonlyArray<{ count: number; diameter: number; row: number }>,
  b: number, cover: number, stirrupDiaMm: number, fy: number,
): FaceSpacing | null {
  const first = layers.filter((l) => l.row === 0);
  const count = first.reduce((s, l) => s + l.count, 0);
  if (count === 0) return null;
  const diameterMm = Math.max(...first.map((l) => l.diameter));
  const inner = b - 2 * (cover + stirrupDiaMm / 1000) - diameterMm / 1000;
  // One bar alone leaves the whole width on each side of it unreinforced.
  const spacing = count > 1 ? inner / (count - 1) : b - 2 * (cover + stirrupDiaMm / 1000);
  const limit = crackControlMaxSpacing(edition, { fy, clearCoverToTensionFace: cover + stirrupDiaMm / 1000 });
  return { count, diameterMm, spacing, limit, ok: spacing <= limit.maxSpacing + 1e-6 };
}
