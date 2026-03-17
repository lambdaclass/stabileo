/**
 * Bar Bending Schedule (BBS) — Pure JS (no WASM dependency)
 * CIRSOC 201-2005 §12: Development lengths, lap splices, bar scheduling
 *
 * Follows the connection-design.ts wrapper pattern:
 *  - Embedded code tables from CIRSOC 201
 *  - Focused input/result interfaces
 *  - Pure functions, no side effects
 *
 * Units: mm, m, cm², kg, MPa (same as cirsoc201.ts)
 */

import { REBAR_DB, checkFlexure, checkShear } from './codes/argentina/cirsoc201';
import type { ElementVerification, ConcreteDesignParams, FlexureResult, ShearResult } from './codes/argentina/cirsoc201';
import { evaluateDiagramAt } from './diagrams-3d';
import type { ElementForces3D } from './types-3d';

// ─── Constants ──────────────────────────────────────────────

const STEEL_DENSITY = 7850; // kg/m³
const HOOK_FACTOR = 0.7;   // CIRSOC 201 §12.5.3: hooks reduce ld by 0.7

// ─── Development Length (CIRSOC 201 §12.2 / ACI 318 §25.4) ─

/** Conditions affecting development length */
export interface DevLengthConditions {
  fc: number;          // f'c (MPa)
  fy: number;          // steel yield (MPa)
  barDia: number;      // mm
  cover: number;       // concrete cover (m)
  isTopBar: boolean;   // top reinforcement factor ψt = 1.3
  isEpoxyCoated: boolean; // ψe = 1.5 if cover < 3db or spacing < 6db, else 1.2
  isLightweight: boolean;  // λ = 0.75 for lightweight concrete
  hasHook: boolean;    // standard 90° or 180° hook
  confinement: 'none' | 'stirrups' | 'spiral'; // transverse reinforcement
}

export interface DevLengthResult {
  ld: number;       // development length (m)
  ldh: number;      // hooked development length (m) — 0 if no hook
  barDia: number;   // mm
  barLabel: string;  // e.g. "Ø16"
  steps: string[];
}

/**
 * Compute development length per CIRSOC 201 §12.2
 * Simplified method (§12.2.2 / ACI 318 Table 25.4.2.2)
 */
export function computeDevLength(cond: DevLengthConditions): DevLengthResult {
  const { fc, fy, barDia, cover, isTopBar, isEpoxyCoated, isLightweight, hasHook, confinement } = cond;
  const db = barDia; // mm
  const steps: string[] = [];

  // Modification factors
  const psi_t = isTopBar ? 1.3 : 1.0;     // §12.2.4(a) — top bar
  const psi_e = isEpoxyCoated ? 1.2 : 1.0; // §12.2.4(b) — coating
  const psi_s = db <= 20 ? 0.8 : 1.0;      // §12.2.4(c) — bar size ≤ Ø20
  const lambda = isLightweight ? 0.75 : 1.0; // §12.2.4(d) — lightweight

  // Combined factor limit: ψt × ψe ≤ 1.7
  const psi_te = Math.min(psi_t * psi_e, 1.7);

  const sqrtFc = Math.sqrt(fc);

  // CIRSOC 201 §12.2.2 simplified:
  //   ld/db = (fy × ψt × ψe × ψs) / (1.1 × λ × √f'c)  for cb ≥ db and confined
  //   ld/db = (fy × ψt × ψe × ψs) / (0.7 × λ × √f'c)  otherwise
  const cb_mm = cover * 1000; // cover in mm
  const isConfined = confinement !== 'none' && cb_mm >= db;
  const denom = isConfined ? 1.1 : 0.7;

  let ld_mm = (fy * psi_te * psi_s) / (denom * lambda * sqrtFc) * db;
  // Minimum: ld ≥ 300 mm (§12.2.1)
  ld_mm = Math.max(ld_mm, 300);

  steps.push(`db = ${db} mm`);
  steps.push(`ψt = ${psi_t}, ψe = ${psi_e}, ψs = ${psi_s}, λ = ${lambda}`);
  steps.push(`ld = (${fy} × ${psi_te.toFixed(2)} × ${psi_s}) / (${denom} × ${lambda} × √${fc}) × ${db} = ${ld_mm.toFixed(0)} mm`);

  // Hooked development (§12.5)
  let ldh_mm = 0;
  if (hasHook) {
    ldh_mm = (0.24 * fy * psi_e) / (lambda * sqrtFc) * db;
    // Hook reduction for confinement (§12.5.3)
    if (confinement === 'stirrups') ldh_mm *= HOOK_FACTOR;
    ldh_mm = Math.max(ldh_mm, Math.max(8 * db, 150));
    steps.push(`ldh = ${ldh_mm.toFixed(0)} mm (hooked)`);
  }

  const barSpec = REBAR_DB.find(r => r.diameter === barDia);
  return {
    ld: ld_mm / 1000,    // → m
    ldh: ldh_mm / 1000,  // → m
    barDia,
    barLabel: barSpec?.label ?? `Ø${barDia}`,
    steps,
  };
}

// ─── Lap Splices (CIRSOC 201 §12.15 / ACI 318 §25.5) ──────

export type SpliceClass = 'A' | 'B';

export interface LapSpliceResult {
  spliceLength: number;  // m
  spliceClass: SpliceClass;
  barDia: number;        // mm
  barLabel: string;
}

/**
 * Compute lap splice length per CIRSOC 201 §12.15
 * Class A: As,prov / As,req ≥ 2 and ≤ 50% spliced at same location
 * Class B: all other cases (default — conservative)
 */
export function computeLapSplice(
  devLength: number,      // ld in m (from computeDevLength)
  barDia: number,         // mm
  spliceClass: SpliceClass = 'B',
): LapSpliceResult {
  // §12.15.1: Class A = 1.0 × ld, Class B = 1.3 × ld
  const factor = spliceClass === 'A' ? 1.0 : 1.3;
  let spliceLength = factor * devLength;
  // Minimum: 300 mm (§12.15.1)
  spliceLength = Math.max(spliceLength, 0.3);

  const barSpec = REBAR_DB.find(r => r.diameter === barDia);
  return {
    spliceLength,
    spliceClass,
    barDia,
    barLabel: barSpec?.label ?? `Ø${barDia}`,
  };
}

// ─── Bar Shape Types ────────────────────────────────────────

export type BarShape =
  | 'straight'
  | 'L-hook-90'
  | 'U-hook-180'
  | 'stirrup-closed'
  | 'stirrup-open';

// ─── Individual Bar Entry ───────────────────────────────────

export interface BarEntry {
  mark: string;          // unique bar mark, e.g. "V1-1", "E1-1"
  shape: BarShape;
  diameter: number;      // mm
  label: string;         // e.g. "Ø16"
  count: number;         // quantity of identical bars
  lengthEach: number;    // total length per bar (m), including hooks/bends
  weightEach: number;    // kg per bar
  weightTotal: number;   // kg total (count × weightEach)
  elementIds: number[];  // elements using this bar
  elementType: 'beam' | 'column' | 'wall';
  zone?: string;         // stirrup zone label, e.g. "critical" or "mid-span"
}

// ─── BBS Summary ────────────────────────────────────────────

export interface BBSSummary {
  bars: BarEntry[];
  /** Weight aggregated by diameter */
  weightByDia: Array<{ diameter: number; label: string; totalWeight: number; totalCount: number }>;
  totalWeight: number;   // kg
  totalCount: number;    // total number of individual bars
}

// ─── Bar Length Computation ─────────────────────────────────

/** Standard hook extensions per CIRSOC 201 §7.1 */
function hookExtension(barDia: number, hookType: '90' | '180'): number {
  const db = barDia; // mm
  if (hookType === '180') {
    // 180° hook: extension = 4db (min 65mm) beyond the bend
    return Math.max(4 * db, 65) / 1000; // → m
  }
  // 90° hook: extension = 12db beyond the bend
  return (12 * db) / 1000; // → m
}

/** Stirrup perimeter for a closed rectangular stirrup */
function stirrupLength(b: number, h: number, cover: number, barDia: number): number {
  // Inner dimensions: subtract cover + half stirrup dia on each side
  const db_m = barDia / 1000;
  const innerB = b - 2 * cover + db_m; // approximate to centerline
  const innerH = h - 2 * cover + db_m;
  // Perimeter + two 135° hooks (6db extension each, per §7.1.3)
  const hookLen = 2 * (6 * barDia / 1000);
  return 2 * (innerB + innerH) + hookLen;
}

// ─── BBS Generation ─────────────────────────────────────────

export interface BBSInput {
  verifications: ElementVerification[];
  elementLengths: Map<number, number>; // elementId → length in m
  elementForces?: Map<number, ElementForces3D>; // optional: enables zone-aware stirrups
  devLengthConditions?: Partial<DevLengthConditions>; // overrides for dev length calc
}

/**
 * Generate a formal Bar Bending Schedule from verification results.
 * Groups identical bars across elements, computes individual bar lengths
 * with hooks and development lengths, and aggregates weights by diameter.
 */
export function generateBBS(input: BBSInput): BBSSummary {
  const { verifications, elementLengths, elementForces, devLengthConditions } = input;
  const bars: BarEntry[] = [];
  let markCounter = 0;

  function nextMark(prefix: string): string {
    markCounter++;
    return `${prefix}${markCounter}`;
  }

  // Group verifications by identical design (same as RebarScheduleEntry logic)
  interface DesignGroup {
    verifs: ElementVerification[];
    elementIds: number[];
    elementType: 'beam' | 'column' | 'wall';
  }
  const groups = new Map<string, DesignGroup>();

  for (const v of verifications) {
    const mainBars = v.column ? v.column.bars : v.flexure.bars;
    const stirrups = `${v.shear.stirrupDia}_${(v.shear.spacing * 100).toFixed(0)}`;
    const key = `${v.elementType}_${(v.b * 100).toFixed(0)}x${(v.h * 100).toFixed(0)}_${mainBars}_${stirrups}`;
    const existing = groups.get(key);
    if (existing) {
      existing.verifs.push(v);
      existing.elementIds.push(v.elementId);
    } else {
      groups.set(key, {
        verifs: [v],
        elementIds: [v.elementId],
        elementType: v.elementType,
      });
    }
  }

  for (const [, group] of groups) {
    const v = group.verifs[0]; // representative verification
    const avgLength = averageLength(group.elementIds, elementLengths);
    if (avgLength <= 0) continue;

    const isColumn = v.elementType === 'column' || v.elementType === 'wall';
    const prefix = isColumn ? 'C' : 'V'; // Columna / Viga

    // Development length for this bar
    const mainDia = v.column ? v.column.barDia : v.flexure.barDia;
    const devCond: DevLengthConditions = {
      fc: v.fc,
      fy: v.fy,
      barDia: mainDia,
      cover: v.cover,
      isTopBar: !isColumn, // beams: top bars for negative moment
      isEpoxyCoated: false,
      isLightweight: false,
      hasHook: isColumn,  // columns typically get hooks at foundation
      confinement: 'stirrups', // assume stirrup confinement
      ...devLengthConditions,
    };
    const dev = computeDevLength(devCond);

    // ── Longitudinal bars ──
    const mainCount = v.column ? v.column.barCount : v.flexure.barCount;
    const mainArea = REBAR_DB.find(r => r.diameter === mainDia)?.area ?? 0;

    // Bar length = element length + development at each end (simplified)
    // For beams: straight + hook extensions at supports
    // For columns: story height + lap splice at top
    let mainBarLength: number;
    let mainShape: BarShape;
    if (isColumn) {
      // Column bar: full height + one lap splice at top
      const lap = computeLapSplice(dev.ld, mainDia, 'B');
      mainBarLength = avgLength + lap.spliceLength;
      mainShape = 'L-hook-90';
    } else {
      // Beam bar: span + hook at each end
      const hookExt = hookExtension(mainDia, '90');
      mainBarLength = avgLength + 2 * hookExt;
      mainShape = 'L-hook-90';
    }

    const mainWeightEach = barWeight(mainDia, mainBarLength);
    const totalElements = group.elementIds.length;

    bars.push({
      mark: nextMark(prefix),
      shape: mainShape,
      diameter: mainDia,
      label: REBAR_DB.find(r => r.diameter === mainDia)?.label ?? `Ø${mainDia}`,
      count: mainCount * totalElements,
      lengthEach: mainBarLength,
      weightEach: mainWeightEach,
      weightTotal: mainWeightEach * mainCount * totalElements,
      elementIds: group.elementIds,
      elementType: group.verifs[0].elementType,
    });

    // Compression steel for doubly reinforced beams
    if (!isColumn && v.flexure.isDoublyReinforced && v.flexure.barCountComp && v.flexure.barDiaComp) {
      const compDia = v.flexure.barDiaComp;
      const compCount = v.flexure.barCountComp;
      const hookExt = hookExtension(compDia, '90');
      const compBarLength = avgLength + 2 * hookExt;
      const compWeightEach = barWeight(compDia, compBarLength);

      bars.push({
        mark: nextMark(prefix),
        shape: 'L-hook-90',
        diameter: compDia,
        label: REBAR_DB.find(r => r.diameter === compDia)?.label ?? `Ø${compDia}`,
        count: compCount * totalElements,
        lengthEach: compBarLength,
        weightEach: compWeightEach,
        weightTotal: compWeightEach * compCount * totalElements,
        elementIds: group.elementIds,
        elementType: group.verifs[0].elementType,
      });
    }

    // ── Stirrups (zone-aware when element forces available) ──
    const stirrupDia = v.shear.stirrupDia;
    const stirrupLen = stirrupLength(v.b, v.h, v.cover, stirrupDia);
    const stirrupWeightEach = barWeight(stirrupDia, stirrupLen);
    const stirrupLabel = REBAR_DB.find(r => r.diameter === stirrupDia)?.label ?? `Ø${stirrupDia}`;

    // Try zone-aware stirrups for beams with available element forces
    const repEf = !isColumn && elementForces ? elementForces.get(v.elementId) : undefined;
    if (repEf && !isColumn) {
      const params: ConcreteDesignParams = { fc: v.fc, fy: v.fy, cover: v.cover, b: v.b, h: v.h, stirrupDia };
      const env = computeBeamDesignEnvelope(repEf, params, v);

      if (env.stirrupZones.length > 1) {
        // Multiple zones — generate separate entries per zone
        for (const zone of env.stirrupZones) {
          const zoneLen = (zone.tEnd - zone.tStart) * avgLength;
          if (zoneLen < 0.01) continue;
          const nStirrups = Math.max(Math.ceil(zoneLen / zone.spacing), 1);
          bars.push({
            mark: nextMark('E'),
            shape: 'stirrup-closed',
            diameter: stirrupDia,
            label: stirrupLabel,
            count: nStirrups * totalElements,
            lengthEach: stirrupLen,
            weightEach: stirrupWeightEach,
            weightTotal: stirrupWeightEach * nStirrups * totalElements,
            elementIds: group.elementIds,
            elementType: v.elementType,
            zone: zone.label,
          });
        }
      } else {
        // Single zone — fallback to uniform
        const spacing = env.stirrupZones[0]?.spacing ?? v.shear.spacing;
        const nStirrups = Math.max(Math.ceil(avgLength / spacing), 2);
        bars.push({
          mark: nextMark('E'),
          shape: 'stirrup-closed',
          diameter: stirrupDia,
          label: stirrupLabel,
          count: nStirrups * totalElements,
          lengthEach: stirrupLen,
          weightEach: stirrupWeightEach,
          weightTotal: stirrupWeightEach * nStirrups * totalElements,
          elementIds: group.elementIds,
          elementType: v.elementType,
        });
      }
    } else {
      // No forces available or column — uniform spacing
      const spacing = v.shear.spacing;
      const nStirrups = Math.max(Math.ceil(avgLength / spacing), 2);
      bars.push({
        mark: nextMark('E'),
        shape: 'stirrup-closed',
        diameter: stirrupDia,
        label: stirrupLabel,
        count: nStirrups * totalElements,
        lengthEach: stirrupLen,
        weightEach: stirrupWeightEach,
        weightTotal: stirrupWeightEach * nStirrups * totalElements,
        elementIds: group.elementIds,
        elementType: group.verifs[0].elementType,
      });
    }
  }

  // Aggregate by diameter
  const diaMap = new Map<number, { label: string; totalWeight: number; totalCount: number }>();
  for (const bar of bars) {
    const existing = diaMap.get(bar.diameter);
    if (existing) {
      existing.totalWeight += bar.weightTotal;
      existing.totalCount += bar.count;
    } else {
      diaMap.set(bar.diameter, {
        label: bar.label,
        totalWeight: bar.weightTotal,
        totalCount: bar.count,
      });
    }
  }
  const weightByDia = Array.from(diaMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([diameter, d]) => ({ diameter, ...d }));

  const totalWeight = bars.reduce((s, b) => s + b.weightTotal, 0);
  const totalCount = bars.reduce((s, b) => s + b.count, 0);

  return { bars, weightByDia, totalWeight, totalCount };
}

// ─── Helpers ────────────────────────────────────────────────

function averageLength(elementIds: number[], lengths: Map<number, number>): number {
  let sum = 0;
  let count = 0;
  for (const id of elementIds) {
    const L = lengths.get(id);
    if (L && L > 0) { sum += L; count++; }
  }
  return count > 0 ? sum / count : 0;
}

/** Weight of a single bar (kg) */
function barWeight(diameter: number, length: number): number {
  const area_m2 = Math.PI / 4 * (diameter / 1000) ** 2;
  return area_m2 * length * STEEL_DENSITY;
}

// ─── Beam Design Envelope ────────────────────────────────────
// Computes required vs provided reinforcement at multiple sections
// along a beam, using moment/shear diagram sampling + CIRSOC 201 checks.

const ENVELOPE_POINTS = 21;

/** Station along the beam with design check results */
export interface DesignStation {
  t: number;         // normalized position [0, 1]
  x: number;         // position in meters
  Mu: number;        // moment at this station (kN·m)
  Vu: number;        // shear at this station (kN)
  AsReq: number;     // required flexural steel (cm²)
  AsProv: number;    // provided flexural steel (cm²)
  spacing: number;   // required stirrup spacing (m)
}

/** Stirrup zone with uniform spacing */
export interface StirrupZone {
  tStart: number;
  tEnd: number;
  spacing: number;   // m
  stirrupDia: number; // mm
  label: string;      // e.g. "eØ8 c/15"
}

/** Full beam design envelope */
export interface BeamDesignEnvelope {
  stations: DesignStation[];
  stirrupZones: StirrupZone[];
  maxAsReq: number;   // cm²
  AsProv: number;      // cm² (constant provided by flexure check)
  AsProvComp: number;  // cm² (compression steel, 0 if singly reinforced)
}

/**
 * Compute the design envelope along a beam.
 * Uses evaluateDiagramAt() to sample M(x) and V(x), then runs
 * checkFlexure/checkShear at each station.
 */
export function computeBeamDesignEnvelope(
  ef: ElementForces3D,
  params: ConcreteDesignParams,
  verification: ElementVerification,
): BeamDesignEnvelope {
  const L = ef.length;
  const stations: DesignStation[] = [];

  // Sample at regular intervals
  for (let i = 0; i < ENVELOPE_POINTS; i++) {
    const t = i / (ENVELOPE_POINTS - 1);
    const x = t * L;

    // Get M and V at this position (strong axis: Mz for moment, Vy for shear)
    const Mu = Math.abs(evaluateDiagramAt(ef, 'momentZ', t));
    const Vu = Math.abs(evaluateDiagramAt(ef, 'shearY', t));

    // Run flexure check at this station
    const flexResult = checkFlexure(params, Mu, 0);
    // Run shear check at this station
    const shearResult = checkShear(params, Vu, 0);

    stations.push({
      t, x, Mu, Vu,
      AsReq: Math.max(flexResult.AsReq, flexResult.AsMin),
      AsProv: verification.flexure.AsProv,
      spacing: shearResult.spacing,
    });
  }

  // Build stirrup zones: seismic confinement at ends (2h) + shear-based mid-span
  const mainDia = verification.column ? verification.column.barDia : verification.flexure.barDia;
  const stirrupZones = buildStirrupZones(
    stations, verification.shear.stirrupDia,
    verification.h, ef.length,
    verification.flexure.d, mainDia,
  );

  const maxAsReq = Math.max(...stations.map(s => s.AsReq));

  return {
    stations,
    stirrupZones,
    maxAsReq,
    AsProv: verification.flexure.AsProv,
    AsProvComp: verification.flexure.AsComp ?? 0,
  };
}

/**
 * Build stirrup zones with seismic confinement at beam ends.
 *
 * CIRSOC 201 §21.5.3: confinement zone = 2h from each support face.
 * Confinement spacing = min(d/4, 6·db_long, 150mm) per §21.5.3.4
 * Mid-span spacing = from shear check (typically d/2 or 300mm max)
 *
 * This ALWAYS produces 3 zones for beams because confinement spacing
 * is genuinely tighter than regular shear spacing.
 */
function buildStirrupZones(
  stations: DesignStation[], stirrupDia: number,
  h: number, L: number, d?: number, mainBarDia?: number,
): StirrupZone[] {
  if (stations.length === 0) return [];

  // Effective depth (estimate if not provided)
  const dEff = d ?? h * 0.85;
  const dbLong = mainBarDia ?? 16; // mm, default assumption

  // Confinement zone length: 2h from each end, capped at L/3
  const confLen = Math.min(2 * h, L / 3);
  const tConf = confLen / L;

  // Seismic confinement spacing: CIRSOC 201 §21.5.3.4
  // s_conf = min(d/4, 6·db_long, 150mm)
  const sConf = Math.min(dEff / 4, 6 * dbLong / 1000, 0.15);
  const confSpacing = roundSpacing(sConf);

  // Mid-span: use the loosest spacing from middle stations (shear-governed)
  const midStations = stations.filter(s => s.t > tConf && s.t < 1 - tConf);
  const midSpacing = midStations.length > 0
    ? roundSpacing(Math.max(...midStations.map(s => s.spacing)))
    : confSpacing;

  // If confinement is same or looser than mid-span (shouldn't happen, but safety)
  if (confSpacing >= midSpacing) {
    return [{
      tStart: 0, tEnd: 1,
      spacing: Math.min(confSpacing, midSpacing), stirrupDia,
      label: `eØ${stirrupDia} c/${(Math.min(confSpacing, midSpacing) * 100).toFixed(0)}`,
    }];
  }

  return [
    {
      tStart: 0, tEnd: tConf,
      spacing: confSpacing, stirrupDia,
      label: `eØ${stirrupDia} c/${(confSpacing * 100).toFixed(0)}`,
    },
    {
      tStart: tConf, tEnd: 1 - tConf,
      spacing: midSpacing, stirrupDia,
      label: `eØ${stirrupDia} c/${(midSpacing * 100).toFixed(0)}`,
    },
    {
      tStart: 1 - tConf, tEnd: 1,
      spacing: confSpacing, stirrupDia,
      label: `eØ${stirrupDia} c/${(confSpacing * 100).toFixed(0)}`,
    },
  ];
}

/** Round spacing to nearest 5cm for practical zone grouping */
function roundSpacing(s: number): number {
  return Math.round(s * 20) / 20; // 5cm increments
}

// ─── CSV Export ──────────────────────────────────────────────

export function bbsToCSV(bbs: BBSSummary): string {
  const lines: string[] = [];
  lines.push('Marca,Forma,Diámetro,Cantidad,Largo c/u (m),Peso c/u (kg),Peso total (kg),Zona,Elementos');
  for (const bar of bbs.bars) {
    lines.push([
      bar.mark,
      bar.shape,
      bar.label,
      bar.count,
      bar.lengthEach.toFixed(3),
      bar.weightEach.toFixed(2),
      bar.weightTotal.toFixed(2),
      bar.zone ?? '',
      `"${bar.elementIds.join(', ')}"`,
    ].join(','));
  }
  lines.push('');
  lines.push('Resumen por diámetro');
  lines.push('Diámetro,Cantidad,Peso total (kg)');
  for (const d of bbs.weightByDia) {
    lines.push(`${d.label},${d.totalCount},${d.totalWeight.toFixed(2)}`);
  }
  lines.push('');
  lines.push(`Total,${bbs.totalCount},${bbs.totalWeight.toFixed(2)}`);
  return lines.join('\n');
}
