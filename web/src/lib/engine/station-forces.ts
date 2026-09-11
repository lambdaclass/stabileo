/**
 * Where along a member the engine evaluates, and what it finds there.
 *
 * ── Why this is not in `station-design-forces.ts` any more ─────────
 *
 * It was, and it still is where every design caller reaches it from — that file re-exports all
 * three of these, so nothing about the design path changed.
 *
 * What changed is that `station-design-forces.ts` imports `design/design-axes` and
 * `design/outcome`: it knows about strong axes, utilisation and CIRSOC. The raw forces report of
 * §5 must not, and `rc-forces-report.ts` states the rule in its own header — raw solver results
 * and reinforcement design are two documents, and a reader who cannot tell which one is in front
 * of them cannot tell a demand from a capacity.
 *
 * Reimplementing the station set on the raw side would have been the other way to satisfy that,
 * and it is the wrong one: two definitions of "the stations the engine used" is exactly how a
 * report comes to disagree with the design it sits beside. So the design-free half moved down
 * here, unchanged, and both sides read the one definition.
 *
 * Nothing in this file knows what a member is FOR. It needs a diagram and a position.
 */

import type { ElementForces3D } from './types-3d';
import { evaluateDiagramAt } from './diagrams-3d';

/** Full force state at one station of one element. Signs are the solver's and are preserved. */
export interface StationForces {
  t: number;       // normalized position [0, 1]
  x: number;       // physical position (m)
  n: number;       // axial force (kN) — sign preserved
  vy: number;      // shear in local Y (kN) — sign preserved
  vz: number;      // shear in local Z (kN) — sign preserved
  my: number;      // moment about local Y (kN·m) — sign preserved
  mz: number;      // moment about local Z (kN·m) — sign preserved
  torsion: number; // torsion about local X (kN·m) — sign preserved
}

/**
 * Build the set of critical stations for an element.
 * Includes:
 *   - endpoints (t=0, t=1)
 *   - midpoint (t=0.5)
 *   - quarter points (t=0.25, t=0.75)
 *   - point-load positions (from both Y and Z load arrays)
 *   - distributed-load start/end positions
 *   - midpoint of each distributed-load span (where parabolic peak may occur)
 *
 * The quarter grid is seeded UNCONDITIONALLY, which is what makes it a subset of this set on any
 * member of real length — except one: a member of effectively zero length short-circuits to
 * `[0, 1]`. `rc-forces-report.ts` defines the quarter mode as an evaluation rather than a filter
 * for exactly that case.
 */
export function buildCriticalStations(ef: ElementForces3D): number[] {
  const tSet = new Set<number>();

  // Endpoints + midpoint + quarter points
  tSet.add(0);
  tSet.add(0.25);
  tSet.add(0.5);
  tSet.add(0.75);
  tSet.add(1);

  const L = ef.length;
  if (L < 1e-10) return [0, 1];

  // Point load positions
  for (const pl of [...(ef.pointLoadsY ?? []), ...(ef.pointLoadsZ ?? [])]) {
    const t = pl.a / L;
    if (t > 0 && t < 1) tSet.add(+t.toFixed(8));
  }

  // Distributed load boundaries and midpoints
  for (const dl of [...(ef.distributedLoadsY ?? []), ...(ef.distributedLoadsZ ?? [])]) {
    const tA = dl.a / L;
    const tB = dl.b / L;
    if (tA > 0 && tA < 1) tSet.add(+tA.toFixed(8));
    if (tB > 0 && tB < 1) tSet.add(+tB.toFixed(8));
    const tMid = (tA + tB) / 2;
    if (tMid > 0 && tMid < 1) tSet.add(+tMid.toFixed(8));
  }

  // For uniform loads spanning the whole element, the moment peak is at
  // t = Vy_start / (q * L) if within [0, 1]. This is the zero-shear point.
  // We can detect this from the endpoint forces.
  if (ef.vyStart !== 0 && ef.vyEnd !== 0 && Math.sign(ef.vyStart) !== Math.sign(ef.vyEnd)) {
    // Shear crosses zero → moment has an interior extremum
    const tZero = Math.abs(ef.vyStart) / (Math.abs(ef.vyStart) + Math.abs(ef.vyEnd));
    if (tZero > 0.01 && tZero < 0.99) tSet.add(+tZero.toFixed(8));
  }
  if (ef.vzStart !== 0 && ef.vzEnd !== 0 && Math.sign(ef.vzStart) !== Math.sign(ef.vzEnd)) {
    const tZero = Math.abs(ef.vzStart) / (Math.abs(ef.vzStart) + Math.abs(ef.vzEnd));
    if (tZero > 0.01 && tZero < 0.99) tSet.add(+tZero.toFixed(8));
  }

  return Array.from(tSet).sort((a, b) => a - b);
}

/** Extract the full force tuple at a single station. */
export function extractForcesAtStation(ef: ElementForces3D, t: number): StationForces {
  const x = t * ef.length;
  return {
    t,
    x: +x.toFixed(4),
    n: evaluateDiagramAt(ef, 'axial', t),
    vy: evaluateDiagramAt(ef, 'shearY', t),
    vz: evaluateDiagramAt(ef, 'shearZ', t),
    my: evaluateDiagramAt(ef, 'momentY', t),
    mz: evaluateDiagramAt(ef, 'momentZ', t),
    torsion: evaluateDiagramAt(ef, 'torsion', t),
  };
}
