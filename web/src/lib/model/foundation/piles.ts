/**
 * A pile's allowable capacity from the strata it crosses: the allowable shaft friction of each
 * stratum over the pile's perimeter and the length within it, and the allowable tip resistance
 * of the stratum its tip stands in over its section. The strata's values are allowable ones, as a
 * soil report gives them, so no further factor is applied here.
 *
 * And how a cap lays its piles out: by count, at a spacing between centres.
 */
import type { SoilStratum } from '../geotechnical';
import type { PileLayout } from '../footing';

export interface PileCapacity { shaft: number; tip: number; total: number; tipStratum: string | null; beyondStrata: boolean }

export function pileCapacity(strata: readonly SoilStratum[], diameter: number, length: number): PileCapacity {
  const perimeter = Math.PI * diameter, area = (Math.PI * diameter * diameter) / 4;
  let depth = 0, shaft = 0, tip = 0, tipStratum: string | null = null;
  for (const s of strata) {
    const within = Math.max(0, Math.min(length, depth + s.thickness) - depth);
    shaft += s.shaftFrictionKPa * perimeter * within;
    if (length <= depth + s.thickness + 1e-9 && tipStratum === null) { tip = s.tipResistanceKPa * area; tipStratum = s.name; }
    depth += s.thickness;
    if (depth >= length) break;
  }
  // A pile longer than the strata stated stands in ground nobody described: no tip is counted.
  return { shaft, tip, total: shaft + tip, tipStratum, beyondStrata: length > depth + 1e-9 };
}

/** Pile centres in the cap's plan, about its centre: 1, 2 in a line, 3 in a triangle, 4 square, more in two rows. */
export function pileCentres(p: Pick<PileLayout, 'count' | 'spacing'>): Array<[number, number]> {
  const s = p.spacing, n = Math.max(1, Math.round(p.count));
  if (n === 1) return [[0, 0]];
  if (n === 2) return [[-s / 2, 0], [s / 2, 0]];
  if (n === 3) { const h = (s * Math.sqrt(3)) / 2; return [[-s / 2, -h / 3], [s / 2, -h / 3], [0, (2 * h) / 3]]; }
  if (n === 4) return [[-s / 2, -s / 2], [s / 2, -s / 2], [s / 2, s / 2], [-s / 2, s / 2]];
  const cols = Math.ceil(n / 2);
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const row = i < cols ? 0 : 1, col = i < cols ? i : i - cols;
    const inRow = row === 0 ? cols : n - cols;
    out.push([(col - (inRow - 1) / 2) * s, (row - 0.5) * s]);
  }
  return out;
}

/** The plan of a cap over its piles: the piles' extent plus one diameter clear past each outer pile's face. */
export function capPlan(p: PileLayout): { B: number; L: number } {
  const c = pileCentres(p);
  const ext = (k: 0 | 1) => Math.max(...c.map((q) => q[k])) - Math.min(...c.map((q) => q[k]));
  const edge = 2 * p.diameter;
  return { B: ext(0) + edge, L: ext(1) + edge };
}
