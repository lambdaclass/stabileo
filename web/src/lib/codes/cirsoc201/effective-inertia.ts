/**
 * Deflection of a reinforced concrete beam beyond the gross section: the cracked transformed
 * inertia, the effective inertia of CIRSOC 201-2025 Table 24.2.3.5, and the long-term multiplier
 * λΔ = ξ / (1 + 50ρ′) of §24.2.4.1. Rectangular sections, SI units (m, kN, MPa→kN/m² inside).
 */

export interface CrackedSectionInput {
  b: number; h: number;
  /** Depth to the tension steel's centroid, and to the compression steel's, m. */
  d: number; dPrime: number;
  /** Tension and compression steel areas, m². */
  As: number; AsPrime: number;
  /** Modular ratio Es / Ec. */
  n: number;
}

/** The cracked transformed inertia, m⁴, and the neutral axis depth kd, m. */
export function crackedInertia(i: CrackedSectionInput): { Icr: number; kd: number } {
  const { b, d, dPrime, As, AsPrime, n } = i;
  // b·x²/2 + (n−1)·As′·(x − d′) − n·As·(d − x) = 0
  const A = b / 2, B = (n - 1) * AsPrime + n * As, C = -((n - 1) * AsPrime * dPrime + n * As * d);
  const kd = (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
  const Icr = (b * kd ** 3) / 3 + n * As * (d - kd) ** 2 + (n - 1) * AsPrime * (kd - dPrime) ** 2;
  return { Icr, kd };
}

/** The cracking moment, kN·m: fr = 0.62·λ·√f′c (§19.2.3.1) on the gross section. */
export function crackingMoment(b: number, h: number, fcMPa: number, lambda = 1): number {
  const fr = 0.62 * lambda * Math.sqrt(fcMPa) * 1000; // kN/m²
  return (fr * ((b * h ** 3) / 12)) / (h / 2);
}

/**
 * The effective inertia of Table 24.2.3.5: the gross section while Ma ≤ ⅔·Mcr, else
 * Icr / (1 − ((⅔·Mcr) / Ma)² · (1 − Icr/Ig)).
 */
export function effectiveInertia(Ig: number, Icr: number, Mcr: number, Ma: number): number {
  const m = (2 / 3) * Mcr;
  if (!(Ma > m)) return Ig;
  return Math.min(Ig, Icr / (1 - (m / Ma) ** 2 * (1 - Icr / Ig)));
}

/** The long-term multiplier of §24.2.4.1: ξ = 2 for five years or more, ρ′ at midspan. */
export const longTermMultiplier = (rhoPrime: number, xi = 2): number => xi / (1 + 50 * Math.max(0, rhoPrime));
