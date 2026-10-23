/** Geometry shared by the column seed preference and the physical lap generator. */
interface PlanPoint { x: number; y: number }

/** Inward crank that puts concentric lifts' corresponding bars in contact. */
export function inwardContactCrank(
  lower: PlanPoint, upper: PlanPoint, lowerDiameterMm: number, upperDiameterMm: number,
): { dx: number; dy: number; off: number } | null {
  const contact = (lowerDiameterMm + upperDiameterMm) / 2000;
  if (Math.hypot(upper.x - lower.x, upper.y - lower.y) >= contact - 1e-4) return null;
  const radius = Math.hypot(lower.x, lower.y);
  if (radius < 1e-6) return null;
  const ux = -lower.x / radius, uy = -lower.y / radius;
  const off = Math.max(contact, (upper.x - lower.x) * ux + (upper.y - lower.y) * uy + contact);
  return { dx: ux * off, dy: uy * off, off };
}

/**
 * Clearance between the lower lift's bars after cranking into an identical cage above.
 * A seed preference, not a constructibility certificate: the actual upper cage, both lifts'
 * bars, transitions, ties and beam joints still require the full detailing checks.
 */
export function repeatedCageLapClearance(positions: readonly PlanPoint[], diameterMm: number): number {
  const lapped = positions.map(p => {
    const crank = inwardContactCrank(p, p, diameterMm, diameterMm);
    return crank ? { x: p.x + crank.dx, y: p.y + crank.dy } : p;
  });
  let clear = Infinity;
  for (let i = 0; i < lapped.length; i++) {
    for (let j = i + 1; j < lapped.length; j++) {
      clear = Math.min(clear, Math.hypot(lapped[i].x - lapped[j].x, lapped[i].y - lapped[j].y) - diameterMm / 1000);
    }
  }
  return clear;
}
