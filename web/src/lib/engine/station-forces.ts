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
import { criticalDiagramStations3D, evaluateDiagramAt } from './diagrams-3d';
import { sortedStations, type DiagramStation } from './member-diagram';

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

export function criticalForceStations(ef: ElementForces3D): DiagramStation[] {
  if (ef.length < 1e-10) return [{ t: 0 }, { t: 1 }];
  const cuts = criticalDiagramStations3D(ef);
  const ts = new Set(cuts.map(cut => cut.t));
  return [...cuts, ...[0.25, 0.5, 0.75].filter(t => !ts.has(t)).map(t => ({ t }))].sort((a, b) => a.t - b.t);
}

export function buildCriticalStations(ef: ElementForces3D): number[] {
  return sortedStations(criticalForceStations(ef).map(cut => cut.t));
}

/**
 * Where along a member results are read: `n` equally spaced stations, ends included, or the
 * critical ones of `buildCriticalStations` (quarters, load positions, zero shear).
 */
export type StationSpec = number | 'critical';

/** The stations of one member under `spec`, as t ∈ [0, 1], ends included, ascending. */
export function stationTs(ef: ElementForces3D, spec: StationSpec): number[] {
  if (spec === 'critical') return buildCriticalStations(ef);
  const n = Math.max(2, Math.floor(spec));
  return Array.from({ length: n }, (_, k) => k / (n - 1));
}

/** Extract the full force tuple at a single station. */
export function extractForcesAtStation(ef: ElementForces3D, station: number | DiagramStation): StationForces {
  const { t, right } = typeof station === 'number' ? { t: station, right: false } : station;
  const x = t * ef.length;
  return {
    t,
    x: +x.toFixed(4),
    n: evaluateDiagramAt(ef, 'axial', t, right),
    vy: evaluateDiagramAt(ef, 'shearY', t, right),
    vz: evaluateDiagramAt(ef, 'shearZ', t, right),
    my: evaluateDiagramAt(ef, 'momentY', t, right),
    mz: evaluateDiagramAt(ef, 'momentZ', t, right),
    torsion: evaluateDiagramAt(ef, 'torsion', t, right),
  };
}
