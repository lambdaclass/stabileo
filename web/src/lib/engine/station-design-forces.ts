/**
 * Station-based, sign-aware, per-combo force extraction for member design.
 *
 * This module bridges the gap between the solver's endpoint-only force output
 * and the design layer's need for forces at critical sections. It uses the
 * analytical diagram evaluation (evaluateDiagramAt) to compute exact interior
 * forces from endpoint forces + applied loads, preserving:
 *   - combo provenance (comboId, comboName)
 *   - station location (t ∈ [0,1], physical x in m)
 *   - sign (positive/negative moments for top/bottom reinforcement)
 *   - full force tuple (N, Vy, Vz, My, Mz, T)
 *
 * LIMITATIONS (current solver contract):
 *   - No P-delta interior forces (P-delta results are endpoint-only)
 *   - No cracked-section iteration
 *   - No support-face offsets (stations are at element coordinates, not at d from column face)
 *   - Torsion diagram is linear interpolation (no interior load effects)
 */

import type { ElementForces3D } from './types-3d';
import type { AnalysisResults3D } from './types-3d';
import { evaluateDiagramAt } from './diagrams-3d';

// ─── Types ──────────────────────────────────────────────

/** Full force state at one station of one element under one combination. */
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

/** Per-combo station forces for one element. */
export interface ComboStationResult {
  comboId: number;
  comboName: string;
  stations: StationForces[];
}

/** Full station-based results for one element across all combos. */
export interface ElementStationResult {
  elementId: number;
  length: number;
  stationTs: number[];  // the t-values used
  comboResults: ComboStationResult[];
}

/** A governing demand identified by check category. */
export interface GoverningDemand {
  category: 'Mz+' | 'Mz-' | 'My+' | 'My-' | 'Vy' | 'Vz' | 'N_compression' | 'N_tension' | 'Torsion';
  value: number;         // the governing value (signed for moments, absolute for shear)
  absValue: number;      // absolute value for ranking
  comboId: number;
  comboName: string;
  stationT: number;      // where along the element
  stationX: number;
  /** The full force tuple at this station/combo — for combined checks. */
  forces: StationForces;
}

/** Complete design demand summary for one element. */
export interface ElementDesignDemands {
  elementId: number;
  length: number;
  demands: GoverningDemand[];
}

// ─── Station Strategy ───────────────────────────────────

/**
 * Build the set of critical stations for an element.
 * Includes:
 *   - endpoints (t=0, t=1)
 *   - midpoint (t=0.5)
 *   - quarter points (t=0.25, t=0.75)
 *   - point-load positions (from both Y and Z load arrays)
 *   - distributed-load start/end positions
 *   - midpoint of each distributed-load span (where parabolic peak may occur)
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

// ─── Force Extraction ───────────────────────────────────

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

/** Extract station forces for one element across all combos. */
export function extractElementStations(
  elementId: number,
  perCombo: Map<number, AnalysisResults3D>,
  comboNames: Map<number, string>,
): ElementStationResult | null {
  // Get element forces from first combo to determine station positions
  const firstCombo = perCombo.values().next().value;
  if (!firstCombo) return null;
  const refEf = firstCombo.elementForces.find(ef => ef.elementId === elementId);
  if (!refEf) return null;

  const stationTs = buildCriticalStations(refEf);

  const comboResults: ComboStationResult[] = [];
  for (const [comboId, results] of perCombo) {
    const ef = results.elementForces.find(e => e.elementId === elementId);
    if (!ef) continue;
    const stations = stationTs.map(t => extractForcesAtStation(ef, t));
    comboResults.push({
      comboId,
      comboName: comboNames.get(comboId) ?? `Combo ${comboId}`,
      stations,
    });
  }

  return {
    elementId,
    length: refEf.length,
    stationTs,
    comboResults,
  };
}

// ─── Governing Demand Extraction ────────────────────────

/** Extract governing demands from station-level per-combo data. */
export function extractGoverningDemands(esr: ElementStationResult): ElementDesignDemands {
  const demands: GoverningDemand[] = [];

  type Cat = GoverningDemand['category'];
  const best = new Map<Cat, GoverningDemand>();

  function updateBest(cat: Cat, value: number, absValue: number, forces: StationForces, comboId: number, comboName: string) {
    const existing = best.get(cat);
    if (!existing || absValue > existing.absValue) {
      best.set(cat, {
        category: cat,
        value,
        absValue,
        comboId,
        comboName,
        stationT: forces.t,
        stationX: forces.x,
        forces,
      });
    }
  }

  for (const cr of esr.comboResults) {
    for (const s of cr.stations) {
      // Mz: positive (sagging/bottom tension) and negative (hogging/top tension) tracked separately
      if (s.mz > 0) updateBest('Mz+', s.mz, s.mz, s, cr.comboId, cr.comboName);
      if (s.mz < 0) updateBest('Mz-', s.mz, Math.abs(s.mz), s, cr.comboId, cr.comboName);

      // My: same sign-aware tracking
      if (s.my > 0) updateBest('My+', s.my, s.my, s, cr.comboId, cr.comboName);
      if (s.my < 0) updateBest('My-', s.my, Math.abs(s.my), s, cr.comboId, cr.comboName);

      // Shear: absolute maximum (sign doesn't affect design)
      updateBest('Vy', s.vy, Math.abs(s.vy), s, cr.comboId, cr.comboName);
      updateBest('Vz', s.vz, Math.abs(s.vz), s, cr.comboId, cr.comboName);

      // Axial: separate compression and tension
      if (s.n < 0) updateBest('N_compression', s.n, Math.abs(s.n), s, cr.comboId, cr.comboName);
      if (s.n > 0) updateBest('N_tension', s.n, s.n, s, cr.comboId, cr.comboName);

      // Torsion: absolute maximum
      updateBest('Torsion', s.torsion, Math.abs(s.torsion), s, cr.comboId, cr.comboName);
    }
  }

  return {
    elementId: esr.elementId,
    length: esr.length,
    demands: Array.from(best.values()).sort((a, b) => b.absValue - a.absValue),
  };
}
