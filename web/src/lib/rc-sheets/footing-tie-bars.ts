import { barArea } from './bars';
import type { Criteria } from './criteria';

/** The tie's bars: `fewest` or more of one diameter, an even count, Ast = Tu/(0,90·fy) and never under `least`, cm², half above and half below. */
export function tieBars(Tu: number, fy: number, diameters: readonly number[], least = 0, fewest = 2): { asReq: number; count: number; dia: number; asProvided: number } {
  const asReq = Math.max((10 * Tu) / (0.9 * fy), least);
  const floor = 2 * Math.ceil(fewest / 2);
  const pick = diameters.map((dia) => ({ dia, count: Math.max(floor, 2 * Math.ceil(asReq / barArea(dia) / 2)) })).find((x) => x.count <= Math.max(8, floor)) ?? { dia: diameters[diameters.length - 1] ?? 16, count: Math.max(floor, 2 * Math.ceil(asReq / barArea(diameters[diameters.length - 1] ?? 16) / 2)) };
  return { asReq, ...pick, asProvided: pick.count * barArea(pick.dia) };
}

/** The tie's steel and detailing that no criterion sets: Es, kN/m², the clear gap between its bars and its stirrup, m. */
export const TIE = { es: 2e8, gap: 0.025, stirrup: 0.008 } as const;

/** The limits of a footing with a tie, by the Stabileo criteria (FIUBA Cim. §6.2, §6.5): Ns, H, e ≤ H/n, μ = tg(2φ/3), the sliding factor and the stretch, ΔL ≤ H/n. */
export const tieLimits = (cr: Criteria) => ({
  maxNs: cr.footingTieMaxLoad, minH: cr.footingTieMinArm, maxE: 1 / cr.footingTieOffset, slide: cr.footingTieSlide,
  mu: Math.tan((2 / 3) * (cr.footingTieFriction * Math.PI) / 180), phi: cr.footingTieFriction, stretch: 1 / cr.footingTieStretch,
});
