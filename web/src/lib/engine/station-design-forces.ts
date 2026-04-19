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
 *   - Torsion diagram is linear interpolation (no interior load effects)
 */

import type { ElementForces3D } from './types-3d';
import type { AnalysisResults3D } from './types-3d';
import type { ProvidedReinforcement, RebarGroup, RebarLayer, StirrupDef, BeamRegions, BeamContinuity, LongBarGroup, ColumnReinforcement } from '../store/model.svelte';
import type { Node, Element, Section, Support } from '../store/model.svelte';
import { evaluateDiagramAt } from './diagrams-3d';
import { REBAR_DB, classifyElement } from './codes/argentina/cirsoc201';

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

// ─── Geometry-Aware Beam Critical Sections ───────────────

/** Data needed for support-face computation at one beam end. */
interface EndGeometry {
  /** t-value of the column face (half-depth of connected column / beam length) */
  tFace: number;
  /** t-value of the critical shear section (tFace + d/L per CIRSOC 201 §11.1.3) */
  tCritShear: number;
  /** How the face was determined */
  source: 'column' | 'wall' | 'support' | 'default';
  /** Half-depth of the connected support element (m), or 0 if unknown */
  halfDepth: number;
}

/** Computed beam critical section geometry for both ends. */
export interface BeamCriticalSections {
  start: EndGeometry;  // nodeI end
  end: EndGeometry;    // nodeJ end
  /** Start of span region (after start critical shear section) */
  tSpanStart: number;
  /** End of span region (before end critical shear section) */
  tSpanEnd: number;
  /** Beam effective depth d used for offset computation (m) */
  d: number;
  /** Beam length L (m) */
  L: number;
}

/**
 * Compute geometry-aware beam critical sections from actual connected elements.
 *
 * At each beam end, finds connected columns/walls and uses their section depth
 * to compute the support face position and the critical shear section (d from face).
 *
 * Falls back to a default fraction of span if no column is found at an end.
 */
export function computeBeamCriticalSections(
  elemId: number,
  nodes: Map<number, { id: number; x: number; y: number; z?: number }>,
  elements: Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; type: string }>,
  sections: Map<number, { id: number; b?: number; h?: number }>,
  supports: Map<number, { nodeId: number; type: string }>,
  beamSection: { b: number; h: number; cover: number; stirrupDia: number },
): BeamCriticalSections | null {
  const elem = elements.get(elemId);
  if (!elem) return null;
  const nI = nodes.get(elem.nodeI);
  const nJ = nodes.get(elem.nodeJ);
  if (!nI || !nJ) return null;

  const dx = nJ.x - nI.x, dy = nJ.y - nI.y, dz = (nJ.z ?? 0) - (nI.z ?? 0);
  const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (L < 0.01) return null;

  const d = beamSection.h - beamSection.cover - (beamSection.stirrupDia / 1000) - 0.008;
  const defaultT = 0.15; // fallback: 15% of span for support region

  function getEndGeometry(nodeId: number): EndGeometry {
    // Check if this node has a direct foundation support
    let hasSupport = false;
    for (const [, sup] of supports) {
      if (sup.nodeId === nodeId) { hasSupport = true; break; }
    }

    // Find connected vertical elements (columns/walls) at this node
    let bestHalfDepth = 0;
    let bestSource: EndGeometry['source'] = hasSupport ? 'support' : 'default';

    for (const [, el] of elements) {
      if (el.id === elemId) continue;
      if (el.nodeI !== nodeId && el.nodeJ !== nodeId) continue;
      // Classify the connected element
      const cNI = nodes.get(el.nodeI);
      const cNJ = nodes.get(el.nodeJ);
      if (!cNI || !cNJ) continue;
      const sec = sections.get(el.sectionId);
      const elType = classifyElement(cNI.x, cNI.y, cNI.z ?? 0, cNJ.x, cNJ.y, cNJ.z ?? 0, sec?.b, sec?.h);
      if (elType === 'column' || elType === 'wall') {
        // Use the column/wall section dimension in the beam direction
        // For a column: the dimension perpendicular to the beam axis
        // Approximation: use max(b, h) / 2 as the half-depth from centerline to face
        const colB = sec?.b ?? 0;
        const colH = sec?.h ?? 0;
        const halfD = Math.max(colB, colH) / 2;
        if (halfD > bestHalfDepth) {
          bestHalfDepth = halfD;
          bestSource = elType;
        }
      }
    }

    if (bestHalfDepth > 0) {
      const tFace = bestHalfDepth / L;
      const tCritShear = tFace + d / L; // critical section at d from face
      return { tFace: +tFace.toFixed(4), tCritShear: Math.min(+tCritShear.toFixed(4), 0.4), source: bestSource, halfDepth: bestHalfDepth };
    }

    // Fallback: no column found — use default
    return { tFace: 0, tCritShear: Math.min(d / L, defaultT), source: bestSource, halfDepth: 0 };
  }

  const start = getEndGeometry(elem.nodeI);
  const end = getEndGeometry(elem.nodeJ);

  // The span region is between the two critical shear sections
  const tSpanStart = start.tCritShear;
  const tSpanEnd = 1 - end.tCritShear;

  return {
    start, end,
    tSpanStart: +Math.min(tSpanStart, 0.45).toFixed(4),
    tSpanEnd: +Math.max(tSpanEnd, 0.55).toFixed(4),
    d, L,
  };
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

// ─── Provided Reinforcement Verification ─────────────────

/** Compute total provided steel area (cm²) from a RebarGroup. */
export function rebarGroupArea(group: RebarGroup): number {
  const spec = REBAR_DB.find(r => r.diameter === group.diameter);
  const areaPerBar = spec ? spec.area : (Math.PI / 4) * (group.diameter / 10) ** 2; // cm²
  return group.count * areaPerBar;
}

/** Format a RebarGroup as a human-readable string (e.g., "4 Ø16"). */
export function formatRebarGroup(group: RebarGroup): string {
  return `${group.count} Ø${group.diameter}`;
}

// ─── Layer Geometry Helpers ───────────────────────────────

/**
 * Resolve layers from either explicit RebarLayer[] or a single RebarGroup.
 * Returns a normalized array of layers sorted by row (0 = outermost).
 */
export function resolveLayers(layers?: RebarLayer[], group?: RebarGroup): RebarLayer[] {
  if (layers && layers.length > 0) return [...layers].sort((a, b) => a.row - b.row);
  if (group) return [{ count: group.count, diameter: group.diameter, row: 0 }];
  return [];
}

/**
 * Compute total steel area across all layers (cm²).
 */
export function layersTotalArea(layers: RebarLayer[]): number {
  let total = 0;
  for (const layer of layers) total += rebarGroupArea(layer);
  return total;
}

/**
 * Compute the centroid distance of bar layers from a face.
 *
 * Each row's centroid from face = cover + stirrupDia + barDia/2 + row × verticalGap
 * where verticalGap = max(maxBarDia, 25mm) + maxBarDia (center-to-center).
 *
 * Returns the area-weighted centroid distance from the face (m).
 * This gives the accurate d or d' for the layer group.
 *
 * @param layers Sorted bar layers (row 0 = outermost)
 * @param cover Clear cover (m)
 * @param stirrupDia Stirrup diameter (mm)
 */
export function layerCentroid(layers: RebarLayer[], cover: number, stirrupDia: number): number {
  if (layers.length === 0) return cover + (stirrupDia / 1000) + 0.008;
  const stirDia_m = stirrupDia / 1000;
  let sumAd = 0;
  let sumA = 0;
  for (const layer of layers) {
    const barDia_m = layer.diameter / 1000;
    // Min vertical clear gap between rows: max(barDia, 25mm) per CIRSOC 201 §7.6
    const vertGap = Math.max(layer.diameter, 25) / 1000;
    // Distance from face to this row centroid
    const distFromFace = cover + stirDia_m + barDia_m / 2 + layer.row * (barDia_m + vertGap);
    const area = rebarGroupArea(layer);
    sumAd += area * distFromFace;
    sumA += area;
  }
  return sumA > 0 ? sumAd / sumA : cover + stirDia_m + 0.008;
}

// ─── Bar Group Resolution ────────────────────────────────

/**
 * Resolve bar groups from the partial-curtailment model or fallback to flat layers.
 * When barGroups are defined, returns them directly.
 * Otherwise, wraps the flat layers into a single "all bars" group with legacy continuity.
 */
export function resolveBarGroups(
  groups: LongBarGroup[] | undefined,
  flatLayers: RebarLayer[],
  legacyContinueStart: boolean,
  legacyContinueEnd: boolean,
): LongBarGroup[] {
  if (groups && groups.length > 0) return groups;
  if (flatLayers.length === 0) return [];
  // Wrap flat layers as a single group with legacy continuity
  return [{
    layers: flatLayers,
    label: 'all',
    continueStart: legacyContinueStart,
    continueEnd: legacyContinueEnd,
  }];
}

/**
 * Compute total area and layers of bar groups that continue into an adjacent region
 * and are adequately anchored.
 *
 * @param groups All bar groups on this face
 * @param direction 'start' or 'end' — which adjacent region
 * @param regionLength Available anchorage length (m)
 * @param fc f'c (MPa)
 * @param fy fy (MPa)
 * @returns { layers, area, allAnchored, anchorageIssues }
 */
export function continuingGroupsInto(
  groups: LongBarGroup[],
  direction: 'start' | 'end',
  regionLength: number,
  fc: number, fy: number,
): { layers: RebarLayer[]; area: number; groups: LongBarGroup[]; anchorageIssues: Array<{ msg: string; severity: 'fail' | 'warn' | 'ok' }> } {
  const continuing: LongBarGroup[] = [];
  const anchorageIssues: Array<{ msg: string; severity: 'fail' | 'warn' | 'ok' }> = [];

  for (const g of groups) {
    const continues = direction === 'start' ? (g.continueStart !== false) : (g.continueEnd !== false);
    if (!continues) continue;

    const maxDia = Math.max(...g.layers.map(l => l.diameter), 0);
    if (maxDia === 0) continue;
    const ld = requiredLd(maxDia, fc, fy);
    const ldh = requiredLdh(maxDia, fc, fy);
    const avail = (direction === 'start' ? g.extensionStart : g.extensionEnd) ?? regionLength;
    const anchorType = direction === 'start' ? g.anchorageStart : g.anchorageEnd;
    const effectiveLd = anchorType === 'hook' ? ldh : ld;

    if (avail >= effectiveLd - 0.001) {
      continuing.push(g);
      // Explicitly anchored with hook — note it but it's OK
      if (anchorType === 'hook') {
        anchorageIssues.push({ msg: `${g.label ?? 'group'}: hooked (ldh=${(ldh*100).toFixed(0)}cm, avail ${(avail*100).toFixed(0)}cm)`, severity: 'ok' });
      }
    } else if (anchorType !== 'hook' && avail >= ldh - 0.001) {
      // Would work with a hook — warn but still count the steel
      continuing.push(g);
      anchorageIssues.push({ msg: `${g.label ?? 'group'}: needs hook (avail ${(avail*100).toFixed(0)}cm < ld=${(ld*100).toFixed(0)}cm, ldh=${(ldh*100).toFixed(0)}cm OK)`, severity: 'warn' });
    } else {
      // Truly insufficient — bar group NOT counted
      const hookNote = anchorType === 'hook'
        ? `even with hook: avail ${(avail*100).toFixed(0)}cm < ldh=${(ldh*100).toFixed(0)}cm`
        : `avail ${(avail*100).toFixed(0)}cm < ld=${(ld*100).toFixed(0)}cm (ldh=${(ldh*100).toFixed(0)}cm)`;
      anchorageIssues.push({ msg: `${g.label ?? 'group'}: insufficient ${hookNote}`, severity: 'fail' });
    }
  }

  const layers: RebarLayer[] = [];
  for (const g of continuing) layers.push(...g.layers);
  return {
    layers,
    area: layersTotalArea(layers),
    groups: continuing,
    anchorageIssues,
  };
}

// ─── Development Length / Anchorage ──────────────────────

/** Required development length per CIRSOC 201 §12.2.3 simplified. */
export function requiredLd(barDia: number, fc: number, fy: number): number {
  const db = barDia / 1000; // mm → m
  const ldCalc = (fy * db) / (4 * 0.8 * Math.sqrt(fc)); // α=β=λ=1.0
  return Math.max(ldCalc, 0.3); // minimum 300mm per §12.2.1
}

/** Required hooked development length per CIRSOC 201 §12.5. */
export function requiredLdh(barDia: number, fc: number, fy: number): number {
  const db = barDia / 1000;
  const ldhCalc = (0.24 * fy * db) / Math.sqrt(fc);
  return Math.max(ldhCalc, 8 * db, 0.15); // min 8db or 150mm per §12.5.1
}

/** Result of checking bar anchorage at a region transition. */
export interface AnchorageCheck {
  barGroup: string;           // description (e.g., "bottom 4Ø20")
  face: 'top' | 'bottom';
  fromRegion: string;         // where bar originates
  intoRegion: string;         // where bar is assumed to contribute
  ldRequired: number;         // m — required straight development length
  ldAvailable: number;        // m — available extension from boundary
  ldhRequired: number;        // m — hooked development (alternative)
  adequate: boolean;          // ldAvailable ≥ ldRequired
  adequateHooked: boolean;    // ldAvailable ≥ ldhRequired
}

/**
 * Check anchorage adequacy for all continuing bar groups in a beam.
 *
 * For each bar group that extends from its home region into an adjacent region
 * (per the continuity model), checks whether the available extension length
 * meets the required development length.
 *
 * Available length = distance from region boundary to the far end of the
 * target region (conservative — bar center, not bar end).
 */
export function checkBeamAnchorage(
  continuity: BeamContinuity | undefined,
  topStartLayers: RebarLayer[], topEndLayers: RebarLayer[], bottomLayers: RebarLayer[],
  tStartEnd: number, tEndStart: number, L: number,
  fc: number, fy: number,
): AnchorageCheck[] {
  const checks: AnchorageCheck[] = [];
  const cont = continuity ?? {};
  const bIntoS = cont.bottomIntoStart !== false;
  const bIntoE = cont.bottomIntoEnd !== false;
  const tsIntoSpan = cont.topStartIntoSpan !== false;
  const teIntoSpan = cont.topEndIntoSpan !== false;

  // Bottom bars into start support
  if (bIntoS && bottomLayers.length > 0) {
    const maxDia = Math.max(...bottomLayers.map(l => l.diameter));
    const ld = requiredLd(maxDia, fc, fy);
    const ldh = requiredLdh(maxDia, fc, fy);
    const avail = cont.ldStart ?? tStartEnd * L; // user-specified or region length
    checks.push({
      barGroup: `bottom ${formatLayers(bottomLayers)}`, face: 'bottom',
      fromRegion: 'span', intoRegion: 'start',
      ldRequired: +ld.toFixed(3), ldAvailable: +avail.toFixed(3),
      ldhRequired: +ldh.toFixed(3),
      adequate: avail >= ld - 0.001, adequateHooked: avail >= ldh - 0.001,
    });
  }

  // Bottom bars into end support
  if (bIntoE && bottomLayers.length > 0) {
    const maxDia = Math.max(...bottomLayers.map(l => l.diameter));
    const ld = requiredLd(maxDia, fc, fy);
    const ldh = requiredLdh(maxDia, fc, fy);
    const avail = cont.ldEnd ?? (1 - tEndStart) * L;
    checks.push({
      barGroup: `bottom ${formatLayers(bottomLayers)}`, face: 'bottom',
      fromRegion: 'span', intoRegion: 'end',
      ldRequired: +ld.toFixed(3), ldAvailable: +avail.toFixed(3),
      ldhRequired: +ldh.toFixed(3),
      adequate: avail >= ld - 0.001, adequateHooked: avail >= ldh - 0.001,
    });
  }

  // Top start bars into span
  if (tsIntoSpan && topStartLayers.length > 0) {
    const maxDia = Math.max(...topStartLayers.map(l => l.diameter));
    const ld = requiredLd(maxDia, fc, fy);
    const ldh = requiredLdh(maxDia, fc, fy);
    // Available: how far top bars extend past the start region boundary into span
    // Conservative: assume they extend to midspan from the boundary
    const avail = (tEndStart - tStartEnd) * L * 0.5; // half of span region
    checks.push({
      barGroup: `top-start ${formatLayers(topStartLayers)}`, face: 'top',
      fromRegion: 'start', intoRegion: 'span',
      ldRequired: +ld.toFixed(3), ldAvailable: +avail.toFixed(3),
      ldhRequired: +ldh.toFixed(3),
      adequate: avail >= ld - 0.001, adequateHooked: avail >= ldh - 0.001,
    });
  }

  // Top end bars into span
  if (teIntoSpan && topEndLayers.length > 0) {
    const maxDia = Math.max(...topEndLayers.map(l => l.diameter));
    const ld = requiredLd(maxDia, fc, fy);
    const ldh = requiredLdh(maxDia, fc, fy);
    const avail = (tEndStart - tStartEnd) * L * 0.5;
    checks.push({
      barGroup: `top-end ${formatLayers(topEndLayers)}`, face: 'top',
      fromRegion: 'end', intoRegion: 'span',
      ldRequired: +ld.toFixed(3), ldAvailable: +avail.toFixed(3),
      ldhRequired: +ldh.toFixed(3),
      adequate: avail >= ld - 0.001, adequateHooked: avail >= ldh - 0.001,
    });
  }

  return checks;
}

// ─── Bar-Level Section Layout ────────────────────────────

/** A single bar instance with computed position in the cross-section. */
export interface BarInstance {
  face: 'top' | 'bottom';   // which face of the section
  row: number;               // row index (0 = outermost from face)
  index: number;             // bar index within this row (0 = leftmost)
  diameter: number;          // mm
  /** Center X position from left edge of section (m). */
  x: number;
  /** Center Y position from bottom of section (m). Top bars have large y, bottom bars have small y. */
  y: number;
  /** Whether this bar is part of the tension layer for the current check region. */
  role?: 'tension' | 'compression';
}

/** Computed section layout for one face (top or bottom) of one beam region. */
export interface FaceLayout {
  face: 'top' | 'bottom';
  bars: BarInstance[];
  totalArea: number;         // cm²
  centroid: number;          // distance from face (m) — area-weighted
  fits: boolean;             // all rows fit within section width
}

/** A spacing issue between two adjacent bars or a bar and a boundary. */
export interface SpacingIssue {
  type: 'horizontal' | 'vertical' | 'cover' | 'overlap';
  face: 'top' | 'bottom' | 'cross';
  row: number;
  barIndex?: number;       // index of the bar with the issue
  actual: number;          // m — actual clear distance
  required: number;        // m — minimum required
  description: string;
}

/** Full computed bar-level layout for a beam section region. */
export interface SectionLayout {
  top: FaceLayout;
  bottom: FaceLayout;
  allBars: BarInstance[];     // combined for rendering
  sectionWidth: number;       // m
  sectionHeight: number;      // m
  /** Geometry-driven spacing/packing diagnostics */
  issues: SpacingIssue[];
  /** True if all bars pass spacing, fit, and cover checks */
  constructible: boolean;
}

/**
 * Compute exact bar positions for a set of layers on one face of a beam section.
 *
 * Bars within each row are distributed evenly across the available width:
 *   - First/last bar centers at cover + stirrup + barDia/2 from section edges
 *   - Remaining bars equally spaced between
 *
 * Vertical position (y) for each row:
 *   - Row 0: cover + stirrup + barDia/2 from the face
 *   - Row n: row 0 position + n × (barDia + verticalGap)
 *
 * @param layers Sorted RebarLayer[] for this face
 * @param face 'top' or 'bottom'
 * @param b Section width (m)
 * @param h Section height (m)
 * @param cover Clear cover (m)
 * @param stirrupDia Stirrup diameter (mm)
 */
export function computeFaceLayout(
  layers: RebarLayer[], face: 'top' | 'bottom',
  b: number, h: number, cover: number, stirrupDia: number,
): FaceLayout {
  const stirDia_m = stirrupDia / 1000;
  const availW = b - 2 * cover - 2 * stirDia_m;
  const bars: BarInstance[] = [];
  let sumAd = 0;
  let sumA = 0;
  let allFit = true;

  for (const layer of layers) {
    const barDia_m = layer.diameter / 1000;
    const n = layer.count;
    const minGap = Math.max(barDia_m, 0.025);

    // Check fit
    const reqW = n * barDia_m + Math.max(0, n - 1) * minGap;
    if (reqW > availW + 0.001) allFit = false;

    // X positions: evenly distributed within available width
    const startX = cover + stirDia_m + barDia_m / 2;
    const endX = b - cover - stirDia_m - barDia_m / 2;
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? b / 2 : startX + i * ((endX - startX) / Math.max(1, n - 1));
      bars.push({ face, row: layer.row, index: i, diameter: layer.diameter, x, y: 0 /* set below */ });
    }

    // Y position from face
    const vertGap = Math.max(layer.diameter, 25) / 1000;
    const distFromFace = cover + stirDia_m + barDia_m / 2 + layer.row * (barDia_m + vertGap);
    const area = rebarGroupArea(layer);
    sumAd += area * distFromFace;
    sumA += area;

    // Set Y positions
    for (const bar of bars) {
      if (bar.row === layer.row && bar.face === face) {
        bar.y = face === 'bottom' ? distFromFace : h - distFromFace;
      }
    }
  }

  const centroid = sumA > 0 ? sumAd / sumA : cover + stirDia_m + 0.008;
  return { face, bars, totalArea: sumA > 0 ? layersTotalArea(layers) : 0, centroid, fits: allFit };
}

/**
 * Compute complete bar-level section layout for a beam region,
 * including geometry-driven spacing/packing diagnostics.
 *
 * Checks performed:
 *   1. Horizontal clear spacing between adjacent bars in each row
 *   2. Vertical clear spacing between rows on the same face
 *   3. Vertical clear distance between top and bottom bar groups
 *   4. Cover envelope: bars must not intrude into cover + stirrup zone
 */
export function computeSectionLayout(
  topLayers: RebarLayer[], bottomLayers: RebarLayer[],
  b: number, h: number, cover: number, stirrupDia: number,
): SectionLayout {
  const top = computeFaceLayout(topLayers, 'top', b, h, cover, stirrupDia);
  const bottom = computeFaceLayout(bottomLayers, 'bottom', b, h, cover, stirrupDia);
  const allBars = [...bottom.bars, ...top.bars];
  const issues: SpacingIssue[] = [];
  const stirDia_m = stirrupDia / 1000;
  const envelope = cover + stirDia_m; // inner face of stirrup

  // ── 1. Horizontal clear spacing within each row ──
  for (const fl of [top, bottom]) {
    const rowNums = [...new Set(fl.bars.map(b => b.row))];
    for (const rn of rowNums) {
      const rowBars = fl.bars.filter(b => b.row === rn).sort((a, b) => a.x - b.x);
      for (let i = 1; i < rowBars.length; i++) {
        const prev = rowBars[i - 1];
        const curr = rowBars[i];
        const clear = (curr.x - prev.x) - (prev.diameter / 2000) - (curr.diameter / 2000);
        const minClear = Math.max(curr.diameter / 1000, prev.diameter / 1000, 0.025);
        if (clear < minClear - 0.001) {
          issues.push({
            type: 'horizontal', face: fl.face, row: rn, barIndex: i,
            actual: +clear.toFixed(4), required: +minClear.toFixed(4),
            description: `${fl.face} r${rn}: clear ${(clear*1000).toFixed(0)}mm < min ${(minClear*1000).toFixed(0)}mm between bars #${i-1}–#${i}`,
          });
        }
      }
    }
  }

  // ── 2. Vertical clear spacing between rows on same face ──
  for (const fl of [top, bottom]) {
    const rowNums = [...new Set(fl.bars.map(b => b.row))].sort((a, b) => a - b);
    for (let i = 1; i < rowNums.length; i++) {
      const prevRow = fl.bars.filter(b => b.row === rowNums[i - 1]);
      const currRow = fl.bars.filter(b => b.row === rowNums[i]);
      if (prevRow.length === 0 || currRow.length === 0) continue;
      // Vertical distance between row centroids
      const prevY = prevRow[0].y;
      const currY = currRow[0].y;
      const vertDist = Math.abs(currY - prevY);
      const prevDia = prevRow[0].diameter / 1000;
      const currDia = currRow[0].diameter / 1000;
      const vertClear = vertDist - prevDia / 2 - currDia / 2;
      const minVertClear = Math.max(currDia, prevDia, 0.025);
      if (vertClear < minVertClear - 0.001) {
        issues.push({
          type: 'vertical', face: fl.face, row: rowNums[i],
          actual: +vertClear.toFixed(4), required: +minVertClear.toFixed(4),
          description: `${fl.face} rows r${rowNums[i-1]}–r${rowNums[i]}: vert clear ${(vertClear*1000).toFixed(0)}mm < min ${(minVertClear*1000).toFixed(0)}mm`,
        });
      }
    }
  }

  // ── 3. Cross-face vertical clear (bottom top-row vs top bottom-row) ──
  if (bottom.bars.length > 0 && top.bars.length > 0) {
    const botTopY = Math.max(...bottom.bars.map(b => b.y + b.diameter / 2000));
    const topBotY = Math.min(...top.bars.map(b => b.y - b.diameter / 2000));
    const crossClear = topBotY - botTopY;
    if (crossClear < 0.025 - 0.001) {
      issues.push({
        type: 'overlap', face: 'cross', row: -1,
        actual: +crossClear.toFixed(4), required: 0.025,
        description: `Top/bottom bars overlap or too close: ${(crossClear*1000).toFixed(0)}mm clear (min 25mm)`,
      });
    }
  }

  // ── 4. Cover envelope check ──
  for (const bar of allBars) {
    const barR = bar.diameter / 2000;
    // Left edge
    if (bar.x - barR < envelope - 0.001) {
      issues.push({
        type: 'cover', face: bar.face, row: bar.row, barIndex: bar.index,
        actual: +(bar.x - barR).toFixed(4), required: +envelope.toFixed(4),
        description: `${bar.face} r${bar.row} #${bar.index}: left edge at ${((bar.x - barR)*1000).toFixed(0)}mm < cover+stirrup ${(envelope*1000).toFixed(0)}mm`,
      });
    }
    // Right edge
    if (bar.x + barR > b - envelope + 0.001) {
      issues.push({
        type: 'cover', face: bar.face, row: bar.row, barIndex: bar.index,
        actual: +(b - bar.x - barR).toFixed(4), required: +envelope.toFixed(4),
        description: `${bar.face} r${bar.row} #${bar.index}: right edge at ${((b - bar.x - barR)*1000).toFixed(0)}mm < cover+stirrup ${(envelope*1000).toFixed(0)}mm`,
      });
    }
  }

  const constructible = issues.length === 0 && top.fits && bottom.fits;

  return {
    top, bottom, allBars,
    sectionWidth: b, sectionHeight: h,
    issues, constructible,
  };
}

// ─── Column Section Layout ───────────────────────────────

/** Computed column bar layout with positions and constructibility diagnostics. */
export interface ColumnLayout {
  bars: BarInstance[];
  totalArea: number;     // cm²
  b: number;             // section width (m)
  h: number;             // section height (m)
  issues: SpacingIssue[];
  constructible: boolean;
}

/**
 * Resolve column reinforcement: structured model preferred, legacy grouped fallback.
 * Returns { cornerDia, faceDia, nBot, nTop, nLeft, nRight, totalCount }.
 */
export function resolveColumnReinf(
  col?: ColumnReinforcement, legacy?: RebarGroup,
): { cornerDia: number; faceDia: number; nBot: number; nTop: number; nLeft: number; nRight: number; totalCount: number } | null {
  if (col) {
    return {
      cornerDia: col.cornerDia, faceDia: col.faceDia,
      nBot: col.nBottom, nTop: col.nTop, nLeft: col.nLeft, nRight: col.nRight,
      totalCount: 4 + col.nBottom + col.nTop + col.nLeft + col.nRight,
    };
  }
  if (legacy && legacy.count >= 4) {
    // Distribute legacy count proportionally: 4 corners + remaining split evenly
    const remaining = legacy.count - 4;
    const perSide = Math.floor(remaining / 4);
    const extra = remaining - perSide * 4;
    return {
      cornerDia: legacy.diameter, faceDia: legacy.diameter,
      nBot: perSide + (extra > 0 ? 1 : 0), nTop: perSide + (extra > 2 ? 1 : 0),
      nRight: perSide + (extra > 1 ? 1 : 0), nLeft: perSide + (extra > 3 ? 1 : 0),
      totalCount: legacy.count,
    };
  }
  return null;
}

/**
 * Compute column bar positions distributed around the section perimeter.
 *
 * Uses structured ColumnReinforcement when available (corner + face breakdown),
 * falls back to legacy grouped RebarGroup with proportional distribution.
 */
export function computeColumnLayout(
  count: number, diameter: number,
  b: number, h: number, cover: number, stirrupDia: number,
  colReinf?: ColumnReinforcement,
): ColumnLayout {
  const resolved = resolveColumnReinf(colReinf, { count, diameter });
  if (!resolved) return { bars: [], totalArea: 0, b, h, issues: [], constructible: true };

  const stirDia_m = stirrupDia / 1000;
  const envelope = cover + stirDia_m;
  const bars: BarInstance[] = [];

  const cornerR = resolved.cornerDia / 2000;
  const faceR = resolved.faceDia / 2000;

  // Corner positions
  const xMin = envelope + cornerR;
  const xMax = b - envelope - cornerR;
  const yMin = envelope + cornerR;
  const yMax = h - envelope - cornerR;

  let idx = 0;
  // 4 corner bars
  const corners: [number, number][] = [[xMin, yMin], [xMax, yMin], [xMax, yMax], [xMin, yMax]];
  for (const [cx, cy] of corners) {
    bars.push({ face: 'bottom', row: 0, index: idx++, diameter: resolved.cornerDia, x: cx, y: cy, role: 'tension' });
  }

  // Face bars (adjusted for possibly different diameter)
  const fxMin = envelope + faceR;
  const fxMax = b - envelope - faceR;
  const fyMin = envelope + faceR;
  const fyMax = h - envelope - faceR;

  function placeFaceBars(n: number, x1: number, y1: number, x2: number, y2: number) {
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / (n + 1);
      bars.push({ face: 'bottom', row: 0, index: idx++, diameter: resolved!.faceDia, x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) });
    }
  }
  placeFaceBars(resolved.nBot, fxMin, fyMin, fxMax, fyMin);
  placeFaceBars(resolved.nRight, fxMax, fyMin, fxMax, fyMax);
  placeFaceBars(resolved.nTop, fxMax, fyMax, fxMin, fyMax);
  placeFaceBars(resolved.nLeft, fxMin, fyMax, fxMin, fyMin);

  // Constructibility checks
  const issues: SpacingIssue[] = [];
  const maxBarDia = Math.max(resolved.cornerDia, resolved.faceDia) / 1000;
  const minClear = Math.max(maxBarDia, 0.025, 0.04);

  for (let i = 0; i < bars.length; i++) {
    const a = bars[i];
    const bBar = bars[(i + 1) % bars.length];
    const dist = Math.sqrt((a.x - bBar.x) ** 2 + (a.y - bBar.y) ** 2);
    const rA = a.diameter / 2000, rB = bBar.diameter / 2000;
    const clear = dist - rA - rB;
    if (clear < minClear - 0.001) {
      issues.push({
        type: 'horizontal', face: 'bottom', row: 0, barIndex: i,
        actual: +clear.toFixed(4), required: +minClear.toFixed(4),
        description: `Bars #${i}–#${(i+1)%bars.length}: clear ${(clear*1000).toFixed(0)}mm < min ${(minClear*1000).toFixed(0)}mm`,
      });
    }
  }

  for (const bar of bars) {
    const r = bar.diameter / 2000;
    if (bar.x - r < envelope - 0.001 || bar.x + r > b - envelope + 0.001 ||
        bar.y - r < envelope - 0.001 || bar.y + r > h - envelope + 0.001) {
      issues.push({
        type: 'cover', face: 'bottom', row: 0, barIndex: bar.index,
        actual: Math.min(bar.x - r, bar.y - r, b - bar.x - r, h - bar.y - r),
        required: +envelope.toFixed(4),
        description: `Bar #${bar.index}: cover violation`,
      });
    }
  }

  // Total area from actual bars
  let totalArea = 0;
  for (const bar of bars) {
    const spec = REBAR_DB.find(r => r.diameter === bar.diameter);
    totalArea += spec ? spec.area : (Math.PI / 4) * (bar.diameter / 10) ** 2;
  }

  return {
    bars, totalArea: +totalArea.toFixed(2), b, h, issues,
    constructible: issues.length === 0,
  };
}

// ─── Row Fit / Spacing Verification ──────────────────────

/** Result of checking whether bars in one row fit the section width. */
export interface RowFitResult {
  row: number;
  count: number;
  diameter: number;      // mm
  requiredWidth: number; // m — total width needed for bars + min gaps
  availableWidth: number; // m — width inside cover + stirrups
  clearSpacing: number;  // m — actual clear gap between bars (0 if doesn't fit)
  minSpacing: number;    // m — code minimum clear spacing
  fits: boolean;
  maxBarsInRow: number;  // max bars that fit in this row
}

/** Check all rows for a layer set against a section width. */
export interface LayerFitResult {
  rows: RowFitResult[];
  allFit: boolean;
  totalBars: number;
  totalArea: number; // cm²
}

/**
 * Check whether provided bar rows fit within the section width.
 *
 * Per CIRSOC 201 §7.6.1: minimum clear spacing between parallel bars
 * in a layer shall not be less than:
 *   - bar diameter
 *   - 25 mm
 *   - (4/3) × max aggregate size (typically 20mm → 27mm; we use 25mm as default)
 *
 * @param layers Bar rows to check
 * @param b Section width (m)
 * @param cover Clear cover (m)
 * @param stirrupDia Stirrup diameter (mm)
 */
export function checkRowFit(
  layers: RebarLayer[], b: number, cover: number, stirrupDia: number,
): LayerFitResult {
  const stirDia_m = stirrupDia / 1000;
  const availW = b - 2 * cover - 2 * stirDia_m;
  const rows: RowFitResult[] = [];
  let allFit = true;

  for (const layer of layers) {
    const barDia_m = layer.diameter / 1000;
    const minGap = Math.max(barDia_m, 0.025); // CIRSOC 201 §7.6.1
    const n = layer.count;
    // Required width: n bars + (n-1) gaps
    const reqW = n * barDia_m + Math.max(0, n - 1) * minGap;
    const maxBars = availW > barDia_m ? Math.max(1, Math.floor((availW + minGap) / (barDia_m + minGap))) : 0;
    const fits = reqW <= availW + 0.001; // 1mm tolerance
    const clearSpacing = n > 1 && fits ? (availW - n * barDia_m) / (n - 1) : (n === 1 ? availW - barDia_m : 0);

    if (!fits) allFit = false;
    rows.push({
      row: layer.row, count: n, diameter: layer.diameter,
      requiredWidth: +reqW.toFixed(4),
      availableWidth: +availW.toFixed(4),
      clearSpacing: +Math.max(0, clearSpacing).toFixed(4),
      minSpacing: +minGap.toFixed(4),
      fits, maxBarsInRow: maxBars,
    });
  }

  return {
    rows, allFit,
    totalBars: layers.reduce((s, l) => s + l.count, 0),
    totalArea: layersTotalArea(layers),
  };
}

/** Format layers for display (e.g., "4Ø20 + 2Ø16[r1]"). */
export function formatLayers(layers: RebarLayer[]): string {
  if (layers.length === 0) return '—';
  return layers.map(l => `${l.count}Ø${l.diameter}${l.row > 0 ? `[r${l.row}]` : ''}`).join(' + ');
}

/** Result of verifying one reinforcement check against provided steel. */
export interface ProvidedRebarCheck {
  category: string;           // e.g., "Flexure Bottom (Mz+)", "Shear (Vy)", "Longitudinal"
  demandCategory: GoverningDemand['category'] | null;  // linked governing demand
  /** For capacity checks: demand (kN·m or kN) and capacity (kN·m or kN). */
  demand?: number;
  capacity?: number;
  /** For area-based fallback: required and provided areas. */
  required?: number;          // required area (cm²) or Av/s (cm²/m)
  provided?: number;          // provided area (cm²) or Av/s (cm²/m)
  ratio: number;              // capacity/demand (≥1 = OK) or provided/required (≥1 = OK)
  status: 'ok' | 'warn' | 'fail';
  unit: string;               // "kN·m", "kN", "cm²", "cm²/m"
  /** 'capacity' = true phi·Mn/phi·Vn recalculation; 'area' = As comparison fallback */
  method: 'capacity' | 'area';
  /** How many tuples were evaluated to find this governing result */
  tuplesChecked: number;
  /** Region range [tStart, tEnd] — which portion of the beam this check covers */
  regionRange?: [number, number];
  description: string;        // e.g., "4 Ø16 → φMn = 125.3 kN·m"
  comboName?: string;         // governing combo that drives the demand
  stationX?: number;          // station where the demand occurs
}

/** Full provided-reinforcement verification result for one element. */
export interface ProvidedRebarResult {
  elementId: number;
  elementType: 'beam' | 'column' | 'wall';
  hasProvided: boolean;       // whether user has set any provided reinforcement
  checks: ProvidedRebarCheck[];
  overallStatus: 'ok' | 'warn' | 'fail' | 'none';
  /** Geometry-aware critical section data (beams only, when computed) */
  criticalSections?: BeamCriticalSections;
}

// ─── CIRSOC 201 Capacity Recalculation (from provided reinforcement) ───

/** β1 per CIRSOC 201 — Whitney stress block parameter */
function beta1(fc: number): number {
  if (fc <= 28) return 0.85;
  return Math.max(0.65, 0.85 - 0.05 * (fc - 28) / 7);
}

/** α1 factor — 0.85 per CIRSOC 201 */
const ALPHA1 = 0.85;

/**
 * Compute φ·Mn for a rectangular beam section with optional compression steel.
 * Uses CIRSOC 201 §10.2 Whitney stress block method with strain compatibility.
 *
 * **Strain-compatible doubly reinforced** (when AsComp > 0):
 *   Uses iterative equilibrium to find neutral axis c, then:
 *   - εs' = 0.003·(c - d')/c — actual compression steel strain
 *   - fs' = min(Es·εs', fy) — compression steel stress (may not yield)
 *   - Cs = As'·(fs' - α1·f'c) if fs' > α1·f'c, else Cs = 0
 *   - Equilibrium: As·fy = α1·f'c·a·b + Cs → solve for c
 *   - φMn = φ·(Cc·(d - a/2) + Cs·(d - d'))
 *
 * **Singly reinforced** (when AsComp = 0):
 *   - a = (As·fy)/(α1·f'c·b), c = a/β1
 *   - φMn = φ·As·fy·(d - a/2)
 *
 * @param AsProv_cm2 Provided tension steel area (cm²)
 * @param b Section width (m)
 * @param d Effective depth to tension steel centroid (m)
 * @param fc Concrete compressive strength (MPa)
 * @param fy Steel yield strength (MPa)
 * @param AsComp_cm2 Provided compression steel area (cm², 0 for singly reinforced)
 * @param dPrime Depth to compression steel centroid (m)
 * @param tensDia Tension bar diameter (mm) — for improved d computation (optional)
 * @param compDia Compression bar diameter (mm) — for improved d' computation (optional)
 */
export function computeFlexureCapacity(
  AsProv_cm2: number, b: number, d: number, fc: number, fy: number,
  AsComp_cm2: number = 0, dPrime: number = 0,
  tensDia: number = 0, compDia: number = 0,
): {
  phiMn: number; a: number; c: number; phi: number; epsilonT: number;
  isDoubly: boolean; compYields: boolean; fsComp: number; epsilonComp: number;
} | null {
  if (AsProv_cm2 <= 0 || b <= 0 || d <= 0 || fc <= 0 || fy <= 0) return null;
  const As_m2 = AsProv_cm2 * 1e-4;
  const AsComp_m2 = AsComp_cm2 * 1e-4;
  const fc_kPa = fc * 1000;
  const fy_kPa = fy * 1000;
  const Es = 200000 * 1000; // Steel elastic modulus: 200,000 MPa → kPa
  const b1 = beta1(fc);
  const isDoubly = AsComp_m2 > 1e-8 && dPrime > 0;

  let a: number;
  let c: number;
  let fsComp = 0;       // actual compression steel stress (kPa)
  let epsilonComp = 0;  // compression steel strain
  let compYields = false;

  if (isDoubly) {
    // ── Strain-compatible iterative solution for doubly reinforced section ──
    // Start from singly-reinforced c as initial guess, then iterate
    const cInitial = (As_m2 * fy_kPa) / (ALPHA1 * fc_kPa * b * b1);
    c = cInitial;

    for (let iter = 0; iter < 20; iter++) {
      // Compression steel strain from strain diagram
      epsilonComp = c > dPrime ? 0.003 * (c - dPrime) / c : 0;
      // Compression steel stress: fs' = min(Es·εs', fy)
      fsComp = Math.min(Es * epsilonComp, fy_kPa);
      // Compression steel force (net, minus displaced concrete)
      const CsNet = AsComp_m2 * Math.max(0, fsComp - ALPHA1 * fc_kPa);
      // Equilibrium: T = Cc + Cs → As·fy = α1·f'c·β1·c·b + Cs
      const cNew = (As_m2 * fy_kPa - CsNet) / (ALPHA1 * fc_kPa * b1 * b);
      // Check convergence
      if (Math.abs(cNew - c) < 0.0001) { c = Math.max(0.001, cNew); break; }
      c = Math.max(0.001, cNew);
    }

    a = b1 * c;
    compYields = epsilonComp >= (fy / 200000); // εy = fy/Es
    // Final compression steel force with converged c
    epsilonComp = c > dPrime ? 0.003 * (c - dPrime) / c : 0;
    fsComp = Math.min(Es * epsilonComp, fy_kPa);
  } else {
    // Singly reinforced — direct solution
    a = (As_m2 * fy_kPa) / (ALPHA1 * fc_kPa * b);
    c = a / b1;
  }

  // Strain in tension steel
  const epsilonT = c > 0 ? 0.003 * (d - c) / c : 999;

  // φ factor based on tension steel strain (CIRSOC 201 §9.3.2)
  const epsilonY = fy / 200000; // exact yield strain
  let phi: number;
  if (epsilonT >= 0.005) {
    phi = 0.9; // tension-controlled
  } else if (epsilonT >= epsilonY) {
    phi = 0.65 + 0.25 * (epsilonT - epsilonY) / (0.005 - epsilonY); // transition
  } else {
    phi = 0.65; // compression-controlled
  }

  // Moment capacity
  let phiMn: number;
  if (isDoubly) {
    const Cc = ALPHA1 * fc_kPa * a * b;
    const CsNet = AsComp_m2 * Math.max(0, fsComp - ALPHA1 * fc_kPa);
    phiMn = phi * (Cc * (d - a / 2) + CsNet * (d - dPrime));
  } else {
    phiMn = phi * As_m2 * fy_kPa * (d - a / 2);
  }

  return {
    phiMn: +phiMn.toFixed(2), a, c, phi, epsilonT,
    isDoubly, compYields, fsComp: +(fsComp / 1000).toFixed(1), // MPa for display
    epsilonComp: +epsilonComp.toFixed(5),
  };
}

/**
 * Compute φ·Vn for a beam section with provided stirrups.
 * Uses CIRSOC 201 §11.2-11.4.
 *
 * @param stirrupDia Stirrup bar diameter (mm)
 * @param legs Number of stirrup legs
 * @param spacing Stirrup spacing (m)
 * @param b Section width (m)
 * @param d Effective depth (m)
 * @param fc Concrete compressive strength (MPa)
 * @param fy Steel yield strength (MPa)
 * @param Nu Axial force (kN, + = compression) — modifies Vc
 * @returns { phiVn, phiVc, VsProv, phi }
 */
export function computeShearCapacity(
  stirrupDia: number, legs: number, spacing: number,
  b: number, d: number, fc: number, fy: number, Nu: number = 0,
): { phiVn: number; phiVc: number; VsProv: number; phi: number } {
  const phi = 0.75; // φ for shear per CIRSOC 201

  // Vc = (1/6)·√f'c·bw·d (kN)
  const Ag = b * d * 1000; // approximate for Vc modification (m² → use b*h ideally)
  const Vc0 = (1 / 6) * Math.sqrt(fc) * (b * 1000) * (d * 1000) / 1000;
  let Vc: number;
  if (Nu > 0) {
    Vc = (1 + Nu / (14 * b * d * 1000)) * Vc0; // simplified Ag = b*d for beam
  } else if (Nu < 0) {
    Vc = Math.max(0, (1 + 0.3 * Nu / (b * d * 1000)) * Vc0);
  } else {
    Vc = Vc0;
  }
  const phiVc = phi * Vc;

  // Vs from provided stirrups: Vs = (Av · fy · d) / s
  const stirrupBar = REBAR_DB.find(r => r.diameter === stirrupDia);
  const legArea = stirrupBar ? stirrupBar.area : (Math.PI / 4) * (stirrupDia / 10) ** 2; // cm²
  const Av = legs * legArea; // cm²
  const VsProv = (Av / spacing) * fy * d / 10; // kN (Av in cm², spacing in m, fy MPa, d m)

  const phiVn = phi * (Vc + VsProv);

  return {
    phiVn: +phiVn.toFixed(2),
    phiVc: +phiVc.toFixed(2),
    VsProv: +VsProv.toFixed(2),
    phi,
  };
}

/**
 * Compute column P-M interaction capacity from provided longitudinal bars.
 * Uses CIRSOC 201 §10.3 simplified interaction (same as checkColumn):
 *   φPn = φ·0.80·(0.85·f'c·(Ag - As) + fy·As)
 *   φMn = φ·As·fy·(d - d')·0.8
 *   ratio = Nu/φPn + Mu/φMn  (linear interaction, conservative)
 *
 * Also checks 1% ≤ ρ ≤ 8% limits per CIRSOC 201 §10.9.1.
 */
/**
 * Strain-compatible uniaxial P-M section analysis for rectangular columns.
 *
 * When explicit bar positions are provided, finds the neutral axis depth `c`
 * that produces equilibrium for the applied axial force Nu, then computes
 * the corresponding moment capacity Mn(c).
 *
 * For each trial neutral axis c (measured from compression face):
 *   - Concrete: Cc = α1·f'c·a·bw, where a = β1·c ≤ section depth
 *   - Each bar i at depth d_i from compression face:
 *       εs_i = 0.003·(c - d_i)/c  (positive = compression, negative = tension)
 *       fs_i = sign(εs_i)·min(Es·|εs_i|, fy)
 *       Fs_i = As_i·fs_i  (net of displaced concrete for bars in compression zone)
 *   - Equilibrium: Cc + ΣFs_i = Nu → iterate c until satisfied
 *   - Capacity: Mn = Cc·(h/2 - a/2) + Σ(Fs_i·(h/2 - d_i))
 *   - φ from tension steel strain (CIRSOC 201 §9.3.2)
 *
 * Falls back to simplified linear interaction when no bar positions are available.
 */
export function computeColumnCapacity(
  AsProv_cm2: number, b: number, h: number,
  fc: number, fy: number, cover: number, stirrupDia: number,
  Nu: number, Mu: number,
  bars?: BarInstance[],
  axis: 'z' | 'y' = 'z',
): {
  phiPn: number; phiMn: number; ratio: number;
  rhoPercent: number; rhoOk: boolean;
  geometryAware: boolean;
  strainCompatible: boolean;
  cNeutral?: number;    // neutral axis depth (m) when strain-compatible
  status: 'ok' | 'warn' | 'fail';
} {
  const fc_kPa = fc * 1000;
  const fy_kPa = fy * 1000;
  const Es = 200000 * 1000; // kPa
  const Ag = b * h;
  const As_m2 = AsProv_cm2 * 1e-4;
  const b1 = beta1(fc);
  const NuAbs = Math.abs(Nu);
  const MuAbs = Math.abs(Mu);
  const sectionDepth = axis === 'z' ? h : b;
  const sectionWidth = axis === 'z' ? b : h;

  const rhoPercent = +(AsProv_cm2 / (Ag * 1e4) * 100).toFixed(2);
  const rhoOk = rhoPercent >= 0.99 && rhoPercent <= 8.01;

  // Pure axial capacity
  const phiPn = 0.65 * 0.80 * (0.85 * fc_kPa * (Ag - As_m2) + fy_kPa * As_m2);

  let phiMn: number;
  let geometryAware = false;
  let strainCompatible = false;
  let cNeutral: number | undefined;

  if (bars && bars.length >= 4) {
    geometryAware = true;
    strainCompatible = true;

    // Bar depths from compression face (top for axis='z', right for axis='y')
    const barData: Array<{ d: number; area_m2: number }> = [];
    for (const bar of bars) {
      const pos = axis === 'z' ? bar.y : bar.x;
      const dFromCompFace = sectionDepth - pos; // distance from compression face
      const spec = REBAR_DB.find(r => r.diameter === bar.diameter);
      const area = spec ? spec.area * 1e-4 : (Math.PI / 4) * (bar.diameter / 1000) ** 2;
      barData.push({ d: dFromCompFace, area_m2: area });
    }

    // Function: given neutral axis c, compute (N, M) about centroid
    function sectionForces(c: number): { N: number; M: number; epsTmax: number } {
      const a = Math.min(b1 * c, sectionDepth);
      // Concrete compression
      const Cc = ALPHA1 * fc_kPa * a * sectionWidth;
      let Nsteel = 0;
      let Msteel = 0;
      let epsTmax = 0;
      for (const bd of barData) {
        const eps = c > 0.001 ? 0.003 * (c - bd.d) / c : 0;
        const fs = Math.sign(eps) * Math.min(Es * Math.abs(eps), fy_kPa);
        // Net steel force (subtract displaced concrete for bars in compression zone)
        const fsNet = bd.d <= a ? fs - ALPHA1 * fc_kPa : fs;
        const Fs = bd.area_m2 * fsNet;
        Nsteel += Fs;
        // Moment about section centroid (h/2)
        Msteel += Fs * (sectionDepth / 2 - bd.d);
        // Track max tension strain
        if (eps < epsTmax) epsTmax = eps;
      }
      const Mc = Cc * (sectionDepth / 2 - a / 2);
      return { N: Cc + Nsteel, M: Mc + Msteel, epsTmax: Math.abs(epsTmax) };
    }

    // Find c that gives N = NuAbs (bisection)
    // Search range: c from 0.01·h to 5·h
    let cLow = 0.001;
    let cHigh = sectionDepth * 5;
    const targetN = NuAbs; // kN (compression positive)
    for (let iter = 0; iter < 50; iter++) {
      const cMid = (cLow + cHigh) / 2;
      const { N } = sectionForces(cMid);
      if (N < targetN) cLow = cMid;
      else cHigh = cMid;
      if (Math.abs(cHigh - cLow) < 0.0001) break;
    }
    const cSolved = (cLow + cHigh) / 2;
    cNeutral = +cSolved.toFixed(4);
    const result = sectionForces(cSolved);

    // φ from max tension strain
    const epsY = fy / 200000;
    let phi: number;
    if (result.epsTmax >= 0.005) phi = 0.9;
    else if (result.epsTmax >= epsY) phi = 0.65 + 0.25 * (result.epsTmax - epsY) / (0.005 - epsY);
    else phi = 0.65;

    phiMn = phi * Math.abs(result.M);
  } else {
    // Simplified fallback
    const d = h - cover - (stirrupDia / 1000) - 0.008;
    const dPrime = cover + (stirrupDia / 1000) + 0.008;
    phiMn = 0.9 * As_m2 * fy_kPa * (d - dPrime) * 0.8;
  }

  // ── Pass/fail determination ──
  let ratio: number;
  if (strainCompatible) {
    // Direct capacity check: φMn IS the moment capacity at the applied Nu.
    // Check Mu ≤ φMn(Nu). The ratio is capacity/demand (≥1 = OK).
    // Also check Nu ≤ φPn (axial limit).
    if (NuAbs > phiPn + 0.1) {
      // Axial overload — section fails regardless of moment
      ratio = phiPn > 0.01 ? +(phiPn / NuAbs).toFixed(3) : 0;
    } else if (MuAbs < 0.01) {
      ratio = phiPn > 0.01 ? +(phiPn / NuAbs).toFixed(3) : 999;
    } else {
      // Direct: capacity/demand for moment at this axial load
      ratio = phiMn > 0.01 ? +(phiMn / MuAbs).toFixed(3) : 0;
    }
  } else {
    // Simplified fallback: linear interaction Nu/φPn + Mu/φMn
    // Here ratio is inverted (capacity/demand convention: ≥1 = OK)
    let interactionDemand: number;
    if (MuAbs < 0.01) interactionDemand = NuAbs / phiPn;
    else if (NuAbs < 0.01) interactionDemand = MuAbs / phiMn;
    else interactionDemand = (NuAbs / phiPn) + (MuAbs / phiMn);
    ratio = interactionDemand > 0.001 ? +(1 / interactionDemand).toFixed(3) : 999;
  }

  let status: 'ok' | 'warn' | 'fail' = 'ok';
  if (!rhoOk) status = 'fail';
  else if (ratio < 1.0) status = 'fail';
  else if (ratio < 1.18) status = 'warn'; // ~15% margin

  return {
    phiPn: +phiPn.toFixed(1), phiMn: +phiMn.toFixed(2),
    ratio: +ratio, rhoPercent, rhoOk,
    geometryAware, strainCompatible, cNeutral, status,
  };
}

/**
 * Compute biaxial column capacity using Bresler reciprocal load method.
 * Uses the same approach as CIRSOC 201 checkBiaxial():
 *   1/φPn = 1/φPnx + 1/φPny - 1/φPn0
 *
 * Where:
 *   φPn0 = pure axial capacity (no moment)
 *   φPnx = uniaxial capacity for Muz alone (bending about Z axis, using b as width)
 *   φPny = uniaxial capacity for Muy alone (bending about Y axis, using h as width)
 *
 * @param AsProv_cm2 Total provided longitudinal steel (cm²)
 * @param b Section width (m) — perpendicular to Z axis
 * @param h Section height (m) — perpendicular to Y axis
 * @param fc f'c (MPa)
 * @param fy fy (MPa)
 * @param cover Concrete cover (m)
 * @param stirrupDia Stirrup diameter (mm)
 * @param Nu Axial force (kN, absolute)
 * @param Muy Moment about Y axis (kN·m, absolute)
 * @param Muz Moment about Z axis (kN·m, absolute)
 */
/**
 * Compute biaxial column capacity using Bresler reciprocal load method
 * with strain-compatible uniaxial capacities when bar positions are available.
 *
 * When bars are provided, each uniaxial capacity uses the strain-compatible
 * section analysis from computeColumnCapacity (finding c that equilibrates N,
 * then computing Mn from actual bar strains).
 */
export function computeBiaxialCapacity(
  AsProv_cm2: number, b: number, h: number,
  fc: number, fy: number, cover: number, stirrupDia: number,
  Nu: number, Muy: number, Muz: number,
  bars?: BarInstance[],
): {
  phiPn: number; phiPn0: number; phiPnx: number; phiPny: number;
  ratio: number; rhoPercent: number; rhoOk: boolean;
  method: 'bresler'; geometryAware: boolean; strainCompatible: boolean;
  status: 'ok' | 'warn' | 'fail';
} {
  const fc_kPa = fc * 1000;
  const fy_kPa = fy * 1000;
  const Ag = b * h;
  const As_m2 = AsProv_cm2 * 1e-4;

  const rhoPercent = +(AsProv_cm2 / (Ag * 1e4) * 100).toFixed(2);
  const rhoOk = rhoPercent >= 0.99 && rhoPercent <= 8.01;

  const Pn0 = 0.85 * fc_kPa * (Ag - As_m2) + fy_kPa * As_m2;
  const phiPn0 = 0.65 * 0.80 * Pn0;

  let phiPnx: number;
  let phiPny: number;
  let geometryAware = false;
  let strainCompatible = false;

  if (bars && bars.length >= 4) {
    geometryAware = true;
    strainCompatible = true;

    // Strain-compatible uniaxial capacity for Muz (about Z, using h as depth)
    const capZ = computeColumnCapacity(AsProv_cm2, b, h, fc, fy, cover, stirrupDia, Nu, Muz, bars, 'z');
    // Strain-compatible uniaxial capacity for Muy (about Y, using b as depth)
    const capY = computeColumnCapacity(AsProv_cm2, b, h, fc, fy, cover, stirrupDia, Nu, Muy, bars, 'y');

    // Uniaxial eccentric capacity: φPn at eccentricity e = Mu/Nu
    // For strain-compatible: if Mn(c@Nu) ≥ Mu, section is adequate → φPnx = Nu
    // Otherwise: φPnx = Nu · (φMn / Mu) — ratio of capacity to demand
    phiPnx = (Muz > 0.01 && capZ.phiMn > 0.01) ? Nu * (capZ.phiMn / Muz) : phiPn0;
    phiPny = (Muy > 0.01 && capY.phiMn > 0.01) ? Nu * (capY.phiMn / Muy) : phiPn0;
    // Clamp to phiPn0
    phiPnx = Math.min(phiPnx, phiPn0);
    phiPny = Math.min(phiPny, phiPn0);
  } else {
    const dy = h - cover - (stirrupDia / 1000) - 0.008;
    const dz = b - cover - (stirrupDia / 1000) - 0.008;
    phiPnx = estimateUniaxialCapacityLocal(fc_kPa, fy_kPa, b, dy, Ag, As_m2, Muz, Nu);
    phiPny = estimateUniaxialCapacityLocal(fc_kPa, fy_kPa, h, dz, Ag, As_m2, Muy, Nu);
  }

  // Bresler reciprocal
  let phiPn: number;
  if (phiPnx > 0 && phiPny > 0 && phiPn0 > 0) {
    const reciprocal = 1 / phiPnx + 1 / phiPny - 1 / phiPn0;
    phiPn = reciprocal > 0 ? 1 / reciprocal : phiPn0;
  } else {
    phiPn = Math.min(phiPnx || phiPn0, phiPny || phiPn0);
  }

  // Ratio: capacity/demand (≥1 = OK), consistent with uniaxial convention
  const ratio = Nu > 0.01 && phiPn > 0.01 ? +(phiPn / Nu).toFixed(3) : 999;
  let status: 'ok' | 'warn' | 'fail' = 'ok';
  if (!rhoOk) status = 'fail';
  else if (ratio < 1.0) status = 'fail';
  else if (ratio < 1.18) status = 'warn';

  return {
    phiPn: +phiPn.toFixed(1), phiPn0: +phiPn0.toFixed(1),
    phiPnx: +phiPnx.toFixed(1), phiPny: +phiPny.toFixed(1),
    ratio: +ratio, rhoPercent, rhoOk,
    method: 'bresler', geometryAware, strainCompatible, status,
  };
}

/**
 * Estimate uniaxial eccentric capacity for one axis.
 * Same method as CIRSOC 201 estimateUniaxialCapacity() in cirsoc201.ts.
 */
function estimateUniaxialCapacityLocal(
  fc_kPa: number, fy_kPa: number,
  bw: number, d: number, Ag: number, As_m2: number,
  Mu: number, Nu: number,
): number {
  if (Nu < 0.01) return 0.65 * 0.80 * (0.85 * fc_kPa * Ag + fy_kPa * As_m2);
  const e = Mu / Nu;
  const eb = 0.4 * d;
  if (e <= eb) {
    const Pn0 = 0.85 * fc_kPa * (Ag - As_m2) + fy_kPa * As_m2;
    const Pb = 0.85 * fc_kPa * bw * 0.6 * d + As_m2 * fy_kPa * 0.5;
    const t = e / eb;
    return 0.65 * ((1 - t) * Pn0 * 0.80 + t * Pb);
  } else {
    const Mnb = As_m2 * fy_kPa * (d - 0.4 * d * 0.5);
    return 0.65 * Mnb / e;
  }
}

/**
 * Verify provided reinforcement by sweeping ALL station × combo tuples,
 * selecting the governing (worst-ratio) result per check family.
 *
 * This replaces the previous single-demand approach. For each check family
 * (beam flexure bottom, beam flexure top, beam shear, column P-M, column ties),
 * the system evaluates capacity at every relevant tuple and reports the worst.
 *
 * For beams:
 *   - Flexure bottom: swept over all tuples where mz > 0 (sagging)
 *   - Flexure top: swept over all tuples where mz < 0 (hogging)
 *   - Shear: swept over all tuples (|vy| with concurrent n for Vc modifier)
 * For columns:
 *   - P-M interaction: swept over all tuples (biaxial Bresler when both axes significant)
 *   - Ties: swept over all tuples (|vy| with concurrent n)
 *
 * Limitations:
 *   - Beam flexure assumes singly reinforced (compression steel not in capacity calc yet)
 *   - Column Bresler uses simplified uniaxial eccentric capacity estimates
 *   - Effective depth d assumes Ø16 bar diameter (consistent with auto-design)
 */
export function verifyProvidedReinforcement(
  elementId: number,
  elementType: 'beam' | 'column' | 'wall',
  provided: ProvidedReinforcement | undefined,
  demands: ElementDesignDemands | undefined,
  autoDesign: {
    flexure?: { AsReq: number; AsComp?: number; isDoublyReinforced?: boolean; d?: number };
    shear?: { AvOverS: number; AvOverSMin: number; d?: number; phiVc?: number };
    column?: { AsTotal: number };
  },
  section?: { b: number; h: number; fc: number; fy: number; cover: number; stirrupDia: number },
  stationResult?: ElementStationResult,
  modelData?: {
    nodes: Map<number, { id: number; x: number; y: number; z?: number }>;
    elements: Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; type: string }>;
    sections: Map<number, { id: number; b?: number; h?: number }>;
    supports: Map<number, { nodeId: number; type: string }>;
  },
): ProvidedRebarResult {
  if (!provided) {
    return { elementId, elementType, hasProvided: false, checks: [], overallStatus: 'none' };
  }

  const checks: ProvidedRebarCheck[] = [];

  // Compute geometry-aware critical sections for beams
  let critSections: BeamCriticalSections | undefined;
  if ((elementType === 'beam' || elementType === 'wall') && section && modelData) {
    critSections = computeBeamCriticalSections(
      elementId, modelData.nodes, modelData.elements, modelData.sections, modelData.supports,
      { b: section.b, h: section.h, cover: section.cover, stirrupDia: section.stirrupDia },
    ) ?? undefined;
  }

  // Collect ALL force tuples from station × combo results for sweeping
  type Tuple = { n: number; vy: number; vz: number; my: number; mz: number; comboName: string; comboId: number; stationX: number; stationT: number };
  const allTuples: Tuple[] = [];
  if (stationResult) {
    for (const cr of stationResult.comboResults) {
      for (const s of cr.stations) {
        allTuples.push({
          n: s.n, vy: s.vy, vz: s.vz, my: s.my, mz: s.mz,
          comboName: cr.comboName, comboId: cr.comboId,
          stationX: s.x, stationT: s.t,
        });
      }
    }
  }
  const hasTuples = allTuples.length > 0;

  if ((elementType === 'beam' || elementType === 'wall') && section) {
    const reg = provided.regions;

    // ── Resolve layers from explicit layers or grouped bars ──
    const bottomLayers = resolveLayers(reg?.bottomSpanLayers, reg?.bottomSpan ?? provided.bottom);
    const topStartLayers = resolveLayers(reg?.topStartLayers, reg?.topStart ?? provided.top);
    const topEndLayers = resolveLayers(reg?.topEndLayers, reg?.topEnd ?? provided.top);

    // ── Compute d and d' from layer centroids (exact when multi-row) ──
    // d = h - centroid_from_tension_face
    const bottomCentroid = layerCentroid(bottomLayers, section.cover, section.stirrupDia);
    const topStartCentroid = layerCentroid(topStartLayers, section.cover, section.stirrupDia);
    const topEndCentroid = layerCentroid(topEndLayers, section.cover, section.stirrupDia);

    const dBottom = section.h - bottomCentroid; // effective depth for bottom tension (span Mz+)
    const dTopStart = section.h - topStartCentroid; // effective depth for top tension (start Mz-)
    const dTopEnd = section.h - topEndCentroid; // effective depth for top tension (end Mz-)
    // d' = centroid of compression layer from compression face
    const dPrimeFromTop = topStartCentroid; // top bars as compression (for span Mz+)
    const dPrimeFromBottom = bottomCentroid; // bottom bars as compression (for support Mz-)
    const d = dBottom; // default d for shear and other checks

    // Region boundaries: geometry-aware (from connected columns) or user-specified or default
    const userT = reg?.regionT;
    const tStartEnd = critSections ? critSections.start.tCritShear : (userT ?? 0.25);
    const tEndStart = critSections ? (1 - critSections.end.tCritShear) : (1 - (userT ?? 0.25));

    // Resolve reinforcement groups per region (for stirrups and backward compat display)
    const topStart = reg?.topStart ?? provided.top;
    const topEnd = reg?.topEnd ?? provided.top;
    const bottomSpan = reg?.bottomSpan ?? provided.bottom;
    const stirSupport = reg?.stirrupsSupport ?? provided.stirrups;
    const stirSpan = reg?.stirrupsSpan ?? provided.stirrups;

    // Partition tuples into regions using geometry-aware boundaries
    const startTuples = hasTuples ? allTuples.filter(t => t.stationT <= tStartEnd) : [];
    const spanTuples = hasTuples ? allTuples.filter(t => t.stationT > tStartEnd && t.stationT < tEndStart) : [];
    const endTuples = hasTuples ? allTuples.filter(t => t.stationT >= tEndStart) : [];

    // ── Resolve bar groups (partial curtailment or legacy continuity) ──
    const cont = reg?.continuity;
    const bottomIntoStart = cont?.bottomIntoStart !== false;
    const bottomIntoEnd = cont?.bottomIntoEnd !== false;
    const topStartIntoSpan = cont?.topStartIntoSpan !== false;
    const topEndIntoSpan = cont?.topEndIntoSpan !== false;

    const bottomGroups = resolveBarGroups(reg?.bottomGroups, bottomLayers, bottomIntoStart, bottomIntoEnd);
    const topStartGroups = resolveBarGroups(reg?.topStartGroups, topStartLayers, true, topStartIntoSpan);
    const topEndGroups = resolveBarGroups(reg?.topEndGroups, topEndLayers, topEndIntoSpan, true);

    const beamL = stationResult?.length ?? critSections?.L ?? 6;
    const startRegLen = tStartEnd * beamL;
    const endRegLen = (1 - tEndStart) * beamL;
    const spanHalfLen = (tEndStart - tStartEnd) * beamL * 0.5;

    // Compute which bottom bar groups continue into supports (for compression steel)
    const botIntoStartResult = continuingGroupsInto(bottomGroups, 'start', startRegLen, section.fc, section.fy);
    const botIntoEndResult = continuingGroupsInto(bottomGroups, 'end', endRegLen, section.fc, section.fy);
    // Compute which top bar groups continue into span (for compression steel)
    const topIntoSpanResult = continuingGroupsInto(topStartGroups, 'end', spanHalfLen, section.fc, section.fy);

    // Surface anchorage issues with correct severity
    const allAnchIssues = [...botIntoStartResult.anchorageIssues, ...botIntoEndResult.anchorageIssues, ...topIntoSpanResult.anchorageIssues];
    for (const issue of allAnchIssues) {
      if (issue.severity === 'ok') continue; // Don't clutter with OK notes
      checks.push({
        category: 'Anchorage', demandCategory: null,
        status: issue.severity, ratio: issue.severity === 'fail' ? 0 : 0.5,
        unit: 'm', method: 'capacity', tuplesChecked: 0,
        description: issue.msg, comboName: undefined, stationX: undefined,
      });
    }

    // ─── Flexure: span Mz+ → bottom=tension, top=compression (from continuing groups) ───
    if (bottomLayers.length > 0) {
      const tensArea = layersTotalArea(bottomLayers);
      const compArea = topIntoSpanResult.area; // only groups that continue + are anchored
      const cap = computeFlexureCapacity(tensArea, section.b, dBottom, section.fc, section.fy, compArea, dPrimeFromTop);
      if (cap) {
        const sagging = spanTuples.filter(t => t.mz > 0.001);
        let worst: { ratio: number; Mu: number; comboName: string; stationX: number } | null = null;
        for (const t of sagging) {
          const r = cap.phiMn / t.mz;
          if (!worst || r < worst.ratio) worst = { ratio: r, Mu: t.mz, comboName: t.comboName, stationX: t.stationX };
        }
        if (worst) {
          const tensLabel = formatLayers(bottomLayers);
          const nTopGroups = topStartGroups.length;
          const nTopCont = topIntoSpanResult.groups.length;
          const compLabel = topIntoSpanResult.area > 0.01 ? ` + ${formatLayers(topIntoSpanResult.layers)} comp.` : '';
          const contNote = nTopGroups > 0 && nTopCont < nTopGroups ? ` [${nTopCont}/${nTopGroups} groups cont.]` : (nTopGroups > 0 && nTopCont === 0 ? ' [top not continuous]' : '');
          const strainNote = cap.isDoubly ? (cap.compYields ? ` (doubly, fs'=fy)` : ` (doubly, fs'=${cap.fsComp}MPa)`) : '';
          const nRows = bottomLayers.length;
          checks.push({
            category: 'Bottom Span (Mz+)', demandCategory: 'Mz+',
            demand: +worst.Mu.toFixed(2), capacity: cap.phiMn,
            ratio: +worst.ratio.toFixed(3),
            status: worst.ratio >= 0.99 ? 'ok' : 'fail',
            unit: 'kN·m', method: 'capacity', tuplesChecked: sagging.length,
            regionRange: [tStartEnd, tEndStart],
            description: `${tensLabel}${compLabel}${contNote} → φMn=${cap.phiMn.toFixed(1)} kN·m${strainNote}, d=${(dBottom*100).toFixed(1)}cm${nRows > 1 ? ` (${nRows} rows)` : ''}, span [${tStartEnd.toFixed(2)}–${tEndStart.toFixed(2)}]${critSections ? ' (geom)' : ''}`,
            comboName: worst.comboName, stationX: worst.stationX,
          });
        }
      }
    }

    // ─── Flexure: start support Mz- → topStart=tension, bottom=compression (from continuing groups) ───
    if (topStartLayers.length > 0) {
      const tensArea = layersTotalArea(topStartLayers);
      const compArea = botIntoStartResult.area;
      const cap = computeFlexureCapacity(tensArea, section.b, dTopStart, section.fc, section.fy, compArea, dPrimeFromBottom);
      if (cap) {
        const hogging = startTuples.filter(t => t.mz < -0.001);
        let worst: { ratio: number; Mu: number; comboName: string; stationX: number } | null = null;
        for (const t of hogging) {
          const Mu = Math.abs(t.mz);
          const r = cap.phiMn / Mu;
          if (!worst || r < worst.ratio) worst = { ratio: r, Mu, comboName: t.comboName, stationX: t.stationX };
        }
        if (worst) {
          const tensLabel = formatLayers(topStartLayers);
          const nBotGroups = bottomGroups.length;
          const nBotCont = botIntoStartResult.groups.length;
          const compLabel = botIntoStartResult.area > 0.01 ? ` + ${formatLayers(botIntoStartResult.layers)} comp.` : '';
          const contNote = nBotGroups > 0 && nBotCont < nBotGroups ? ` [${nBotCont}/${nBotGroups} groups cont.]` : (nBotGroups > 0 && nBotCont === 0 ? ' [bot not continuous]' : '');
          const strainNote = cap.isDoubly ? (cap.compYields ? ` (doubly, fs'=fy)` : ` (doubly, fs'=${cap.fsComp}MPa)`) : '';
          const faceInfo = critSections?.start.source !== 'default' ? ` face=${(critSections!.start.halfDepth*200).toFixed(0)}cm` : '';
          const nRows = topStartLayers.length;
          checks.push({
            category: 'Top Start (Mz-)', demandCategory: 'Mz-',
            demand: +worst.Mu.toFixed(2), capacity: cap.phiMn,
            ratio: +worst.ratio.toFixed(3),
            status: worst.ratio >= 0.99 ? 'ok' : 'fail',
            unit: 'kN·m', method: 'capacity', tuplesChecked: hogging.length,
            regionRange: [0, tStartEnd],
            description: `${tensLabel}${compLabel}${contNote} → φMn=${cap.phiMn.toFixed(1)} kN·m${strainNote}, d=${(dTopStart*100).toFixed(1)}cm${nRows > 1 ? ` (${nRows} rows)` : ''}, start [0–${tStartEnd.toFixed(2)}]${faceInfo}`,
            comboName: worst.comboName, stationX: worst.stationX,
          });
        }
      }
    }

    // ─── Flexure: end support Mz- → topEnd=tension, bottom=compression (from continuing groups) ───
    if (topEndLayers.length > 0) {
      const tensArea = layersTotalArea(topEndLayers);
      const compArea = botIntoEndResult.area;
      const cap = computeFlexureCapacity(tensArea, section.b, dTopEnd, section.fc, section.fy, compArea, dPrimeFromBottom);
      if (cap) {
        const hogging = endTuples.filter(t => t.mz < -0.001);
        let worst: { ratio: number; Mu: number; comboName: string; stationX: number } | null = null;
        for (const t of hogging) {
          const Mu = Math.abs(t.mz);
          const r = cap.phiMn / Mu;
          if (!worst || r < worst.ratio) worst = { ratio: r, Mu, comboName: t.comboName, stationX: t.stationX };
        }
        if (worst) {
          const tensLabel = formatLayers(topEndLayers);
          const nBotGroupsE = bottomGroups.length;
          const nBotContE = botIntoEndResult.groups.length;
          const compLabel = botIntoEndResult.area > 0.01 ? ` + ${formatLayers(botIntoEndResult.layers)} comp.` : '';
          const contNote = nBotGroupsE > 0 && nBotContE < nBotGroupsE ? ` [${nBotContE}/${nBotGroupsE} groups cont.]` : (nBotGroupsE > 0 && nBotContE === 0 ? ' [bot not continuous]' : '');
          const strainNote = cap.isDoubly ? (cap.compYields ? ` (doubly, fs'=fy)` : ` (doubly, fs'=${cap.fsComp}MPa)`) : '';
          const faceInfo = critSections?.end.source !== 'default' ? ` face=${(critSections!.end.halfDepth*200).toFixed(0)}cm` : '';
          const nRows = topEndLayers.length;
          checks.push({
            category: 'Top End (Mz-)', demandCategory: 'Mz-',
            demand: +worst.Mu.toFixed(2), capacity: cap.phiMn,
            ratio: +worst.ratio.toFixed(3),
            status: worst.ratio >= 0.99 ? 'ok' : 'fail',
            unit: 'kN·m', method: 'capacity', tuplesChecked: hogging.length,
            regionRange: [tEndStart, 1],
            description: `${tensLabel}${compLabel}${contNote} → φMn=${cap.phiMn.toFixed(1)} kN·m${strainNote}, d=${(dTopEnd*100).toFixed(1)}cm${nRows > 1 ? ` (${nRows} rows)` : ''}, end [${tEndStart.toFixed(2)}–1]${faceInfo}`,
            comboName: worst.comboName, stationX: worst.stationX,
          });
        }
      }
    }

    // ─── Shear: support-region stirrups ───
    if (stirSupport && hasTuples) {
      const supportTuples = [...startTuples, ...endTuples];
      let worst: { ratio: number; Vu: number; phiVn: number; comboName: string; stationX: number } | null = null;
      let count = 0;
      for (const t of supportTuples) {
        const Vu = Math.abs(t.vy);
        if (Vu < 0.001) continue;
        count++;
        const cap = computeShearCapacity(stirSupport.diameter, stirSupport.legs, stirSupport.spacing, section.b, d, section.fc, section.fy, t.n);
        const r = cap.phiVn / Vu;
        if (!worst || r < worst.ratio) worst = { ratio: r, Vu, phiVn: cap.phiVn, comboName: t.comboName, stationX: t.stationX };
      }
      if (worst) {
        checks.push({
          category: 'Shear Support (Vy)', demandCategory: 'Vy',
          demand: +worst.Vu.toFixed(2), capacity: worst.phiVn,
          ratio: +worst.ratio.toFixed(3),
          status: worst.ratio >= 0.99 ? 'ok' : 'fail',
          unit: 'kN', method: 'capacity', tuplesChecked: count,
          regionRange: [0, tStartEnd],
          description: `eØ${stirSupport.diameter} ${stirSupport.legs}L c/${(stirSupport.spacing * 100).toFixed(0)} support [0–${tStartEnd.toFixed(2)}]${critSections ? ' (d from face)' : ''}, ${count} tuples`,
          comboName: worst.comboName, stationX: worst.stationX,
        });
      }
    }

    // ─── Shear: span-region stirrups ───
    if (stirSpan && hasTuples) {
      let worst: { ratio: number; Vu: number; phiVn: number; comboName: string; stationX: number } | null = null;
      let count = 0;
      for (const t of spanTuples) {
        const Vu = Math.abs(t.vy);
        if (Vu < 0.001) continue;
        count++;
        const cap = computeShearCapacity(stirSpan.diameter, stirSpan.legs, stirSpan.spacing, section.b, d, section.fc, section.fy, t.n);
        const r = cap.phiVn / Vu;
        if (!worst || r < worst.ratio) worst = { ratio: r, Vu, phiVn: cap.phiVn, comboName: t.comboName, stationX: t.stationX };
      }
      if (worst) {
        checks.push({
          category: 'Shear Span (Vy)', demandCategory: 'Vy',
          demand: +worst.Vu.toFixed(2), capacity: worst.phiVn,
          ratio: +worst.ratio.toFixed(3),
          status: worst.ratio >= 0.99 ? 'ok' : 'fail',
          unit: 'kN', method: 'capacity', tuplesChecked: count,
          regionRange: [tStartEnd, tEndStart],
          description: `eØ${stirSpan.diameter} ${stirSpan.legs}L c/${(stirSpan.spacing * 100).toFixed(0)} span [${tStartEnd.toFixed(2)}–${tEndStart.toFixed(2)}], ${count} tuples`,
          comboName: worst.comboName, stationX: worst.stationX,
        });
      }
    }

    // ─── Constructibility: row fit checks ───
    const fitSets: Array<{ label: string; layers: RebarLayer[]; field: string }> = [
      { label: 'Top Start', layers: topStartLayers, field: 'topStart' },
      { label: 'Bottom Span', layers: bottomLayers, field: 'bottomSpan' },
      { label: 'Top End', layers: topEndLayers, field: 'topEnd' },
    ];
    for (const fs of fitSets) {
      if (fs.layers.length === 0) continue;
      const fit = checkRowFit(fs.layers, section.b, section.cover, section.stirrupDia);
      for (const rf of fit.rows) {
        if (!rf.fits) {
          checks.push({
            category: `Fit: ${fs.label} r${rf.row}`, demandCategory: null,
            required: rf.maxBarsInRow, provided: rf.count,
            ratio: rf.maxBarsInRow > 0 ? +(rf.count / rf.maxBarsInRow).toFixed(2) : 0,
            status: 'fail',
            unit: 'bars', method: 'capacity', tuplesChecked: 0,
            description: `${rf.count}Ø${rf.diameter} need ${(rf.requiredWidth*100).toFixed(1)}cm, avail ${(rf.availableWidth*100).toFixed(1)}cm — max ${rf.maxBarsInRow} bars/row`,
            comboName: undefined, stationX: undefined,
          });
        }
      }
    }
  }

  if (elementType === 'column' && section) {
    // Resolve column reinforcement from structured or legacy model
    const colResolved = resolveColumnReinf(provided.column, provided.longitudinal);
    const colLayout = colResolved
      ? computeColumnLayout(colResolved.totalCount, colResolved.cornerDia, section.b, section.h, section.cover, section.stirrupDia, provided.column)
      : undefined;
    const colBars = colLayout?.bars;

    // ─── Column longitudinal: geometry-aware sweep all tuples ───
    if (colResolved && hasTuples) {
      const provArea = colLayout?.totalArea ?? (provided.longitudinal ? rebarGroupArea(provided.longitudinal) : 0);
      // ratio is now capacity/demand (≥1 = OK). Worst = lowest ratio.
      let worst: { ratio: number; phiMn: number; Nu: number; My: number; Mz: number; phiPn: number; biaxial: boolean; geo: boolean; sc: boolean; comboName: string; stationX: number; cN?: number } | null = null;
      let count = 0;
      for (const t of allTuples) {
        const Nu = Math.abs(t.n);
        const My = Math.abs(t.my);
        const Mz = Math.abs(t.mz);
        if (Nu < 0.01 && My < 0.01 && Mz < 0.01) continue;
        count++;
        const isBiax = My > 0.1 && Mz > 0.1;
        let ratio: number;
        let phiPn: number;
        let phiMn = 0;
        let geo = false;
        let sc = false;
        let cN: number | undefined;
        if (isBiax) {
          const cap = computeBiaxialCapacity(provArea, section.b, section.h, section.fc, section.fy, section.cover, section.stirrupDia, Nu, My, Mz, colBars);
          ratio = cap.ratio;
          phiPn = cap.phiPn;
          geo = cap.geometryAware;
          sc = cap.strainCompatible;
        } else {
          const Mu = Math.max(Mz, My);
          const axis: 'z' | 'y' = Mz >= My ? 'z' : 'y';
          const cap = computeColumnCapacity(provArea, section.b, section.h, section.fc, section.fy, section.cover, section.stirrupDia, Nu, Mu, colBars, axis);
          ratio = cap.ratio;
          phiPn = cap.phiPn;
          phiMn = cap.phiMn;
          geo = cap.geometryAware;
          sc = cap.strainCompatible;
          cN = cap.cNeutral;
        }
        // Lowest ratio = worst case (capacity/demand, <1 = fail)
        if (!worst || ratio < worst.ratio) {
          worst = { ratio, phiMn, Nu, My, Mz, phiPn, biaxial: isBiax, geo, sc, comboName: t.comboName, stationX: t.stationX, cN };
        }
      }
      if (worst) {
        const methodLabel = worst.biaxial ? 'Biaxial P-M (Bresler)' : 'Uniaxial P-M';
        const geoTag = worst.sc ? ' [strain-compat]' : worst.geo ? ' [bar-geom]' : '';
        const status: 'ok' | 'fail' = worst.ratio >= 0.99 ? 'ok' : 'fail';
        const Mu = Math.max(worst.Mz, worst.My);
        const directNote = worst.sc && !worst.biaxial
          ? ` φMn(Nu=${worst.Nu.toFixed(0)})=${worst.phiMn.toFixed(1)} kN·m vs Mu=${Mu.toFixed(1)}${worst.cN ? ` c=${(worst.cN*100).toFixed(1)}cm` : ''}`
          : '';
        checks.push({
          category: methodLabel, demandCategory: 'N_compression',
          demand: +worst.Nu.toFixed(1), capacity: worst.sc && !worst.biaxial ? worst.phiMn : worst.phiPn,
          ratio: +worst.ratio, status,
          unit: worst.sc && !worst.biaxial ? 'kN·m' : 'kN',
          method: 'capacity', tuplesChecked: count,
          description: `${provided.column ? `4cØ${provided.column.cornerDia}+${colResolved!.nBot+colResolved!.nTop+colResolved!.nLeft+colResolved!.nRight}fØ${provided.column.faceDia}` : provided.longitudinal ? formatRebarGroup(provided.longitudinal) : '—'}${geoTag}` +
            (directNote || (worst.biaxial ? ` → φPn(Bresler)=${worst.phiPn.toFixed(0)} kN, My=${worst.My.toFixed(1)}, Mz=${worst.Mz.toFixed(1)}` : ` → φPn=${worst.phiPn.toFixed(0)} kN, Mu=${Mu.toFixed(1)} kN·m`)) +
            `, ratio=${worst.ratio.toFixed(3)}, swept ${count} tuples`,
          comboName: worst.comboName, stationX: worst.stationX,
        });
      }
    } else if (provided.longitudinal && autoDesign.column) {
      // Fallback: area comparison when no station data
      const provArea = rebarGroupArea(provided.longitudinal);
      const reqArea = autoDesign.column.AsTotal;
      const demandMap = demands ? new Map(demands.demands.map(dd => [dd.category, dd])) : new Map<string, GoverningDemand>();
      const nComp = demandMap.get('N_compression');
      checks.push({
        category: 'Longitudinal', demandCategory: 'N_compression',
        required: +reqArea.toFixed(2), provided: +provArea.toFixed(2),
        ratio: reqArea > 0.001 ? +(provArea / reqArea).toFixed(3) : 999,
        status: provArea >= reqArea * 0.99 ? 'ok' : 'fail',
        unit: 'cm²', method: 'area', tuplesChecked: 1,
        description: `${formatRebarGroup(provided.longitudinal)} = ${provArea.toFixed(2)} cm²`,
        comboName: nComp?.comboName, stationX: nComp?.stationX,
      });
    }

    // ─── Column ties: sweep all tuples ───
    if (provided.stirrups && section && hasTuples) {
      const d = section.h - section.cover - (section.stirrupDia / 1000) - 0.008;
      let worst: { ratio: number; Vu: number; phiVn: number; comboName: string; stationX: number } | null = null;
      let count = 0;
      for (const t of allTuples) {
        const Vu = Math.abs(t.vy);
        if (Vu < 0.001) continue;
        count++;
        const cap = computeShearCapacity(provided.stirrups.diameter, provided.stirrups.legs, provided.stirrups.spacing, section.b, d, section.fc, section.fy, t.n);
        const r = cap.phiVn / Vu;
        if (!worst || r < worst.ratio) worst = { ratio: r, Vu, phiVn: cap.phiVn, comboName: t.comboName, stationX: t.stationX };
      }
      if (worst) {
        checks.push({
          category: 'Ties (Vy)', demandCategory: 'Vy',
          demand: +worst.Vu.toFixed(2), capacity: worst.phiVn,
          ratio: +worst.ratio.toFixed(3),
          status: worst.ratio >= 0.99 ? 'ok' : 'fail',
          unit: 'kN', method: 'capacity', tuplesChecked: count,
          description: `eØ${provided.stirrups.diameter} ${provided.stirrups.legs}L c/${(provided.stirrups.spacing * 100).toFixed(0)} → φVn varies with N, swept ${count} tuples`,
          comboName: worst.comboName, stationX: worst.stationX,
        });
      }
    }
  }

  const overallStatus = checks.length === 0 ? 'none'
    : checks.some(c => c.status === 'fail') ? 'fail'
    : checks.some(c => c.status === 'warn') ? 'warn'
    : 'ok';

  return { elementId, elementType, hasProvided: true, checks, overallStatus, criticalSections: critSections };
}
