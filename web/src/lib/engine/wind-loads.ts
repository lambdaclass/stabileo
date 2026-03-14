// Wind Load Generator — CIRSOC 102 (Argentine Wind Code)
// Generates distributed loads on structural elements from wind parameters.
// Does NOT modify the solver — produces load objects compatible with the model store.
//
// Based on CIRSOC 102-2005 (Argentine adaptation of ASCE 7)
// Simplified procedure for regular buildings (Method 1, low-rise / Method 2, all heights)

export interface WindParams {
  /** Basic wind speed V (m/s) — from CIRSOC 102 Fig.1 (zone map) */
  V: number;
  /** Exposure category: B (urban), C (open), D (coastal) */
  exposure: 'B' | 'C' | 'D';
  /** Importance factor I (default 1.0) */
  I?: number;
  /** Topographic factor Kzt (default 1.0) */
  Kzt?: number;
  /** Directionality factor Kd (default 0.85) */
  Kd?: number;
  /** Internal pressure coefficient GCpi (default ±0.18 for enclosed buildings) */
  GCpi?: number;
  /** External pressure coefficient Cp (default values by surface) */
  Cp?: { windward?: number; leeward?: number; sidewall?: number; roof?: number };
  /** Gust factor G (default 0.85 for rigid structures) */
  G?: number;
}

export interface WindPressureResult {
  /** Velocity pressure qz at height z (kN/m²) */
  qz: number;
  /** Height z (m) */
  z: number;
  /** Design wind pressure p (kN/m²) — windward */
  pWindward: number;
  /** Design wind pressure p (kN/m²) — leeward */
  pLeeward: number;
  /** Net horizontal pressure (kN/m²) */
  pNet: number;
}

import type { SolverDiagnostic } from './types';

export interface WindLoadOutput {
  /** Per-node lateral forces (kN) */
  nodalForces: Array<{ nodeId: number; Fx: number; Fy: number; Fz: number }>;
  /** Summary info */
  pressures: WindPressureResult[];
  /** Base shear (kN) */
  baseShear: number;
  /** Overturning moment (kN·m) */
  overturningMoment: number;
  steps: string[];
  diagnostics?: SolverDiagnostic[];
}

// ─── Exposure coefficients Kz (CIRSOC 102 Table 6-3) ───

interface ExposureCoeffs { alpha: number; zg: number; }

const EXPOSURE_PARAMS: Record<string, ExposureCoeffs> = {
  B: { alpha: 7.0, zg: 365.76 },
  C: { alpha: 9.5, zg: 274.32 },
  D: { alpha: 11.5, zg: 213.36 },
};

/**
 * Velocity pressure exposure coefficient Kz (CIRSOC 102 §6.5.6.4)
 * Kz = 2.01 · (z/zg)^(2/α) for z ≥ 4.6m
 * Kz = 2.01 · (4.6/zg)^(2/α) for z < 4.6m
 */
function computeKz(z: number, exposure: 'B' | 'C' | 'D'): number {
  const { alpha, zg } = EXPOSURE_PARAMS[exposure];
  const zEff = Math.max(z, 4.6); // minimum height 4.6m (15ft)
  return 2.01 * Math.pow(zEff / zg, 2 / alpha);
}

/**
 * Velocity pressure qz (kN/m²) at height z
 * qz = 0.613 · Kz · Kzt · Kd · V² · I × 1e-3 (Pa → kN/m²)
 *
 * Where 0.613 = 0.5 × ρ_air (1.225 kg/m³) in SI
 */
function computeQz(z: number, V: number, exposure: 'B' | 'C' | 'D',
  Kzt: number, Kd: number, I: number): number {
  const Kz = computeKz(z, exposure);
  return 0.000613 * Kz * Kzt * Kd * V * V * I; // kN/m²
}

/**
 * Compute wind pressures at given heights
 */
export function computeWindPressures(
  params: WindParams,
  heights: number[],
): WindPressureResult[] {
  const I = params.I ?? 1.0;
  const Kzt = params.Kzt ?? 1.0;
  const Kd = params.Kd ?? 0.85;
  const G = params.G ?? 0.85;
  const GCpi = params.GCpi ?? 0.18;
  const CpW = params.Cp?.windward ?? 0.8;
  const CpL = params.Cp?.leeward ?? -0.5; // negative = suction

  return heights.map(z => {
    const qz = computeQz(z, params.V, params.exposure, Kzt, Kd, I);
    // Windward: p = qz·G·Cp - qz·(±GCpi) — use +GCpi for max inward
    const pWindward = qz * G * CpW + qz * GCpi;
    // Leeward: p = qh·G·Cp - qh·(±GCpi) — use -GCpi for max suction
    const pLeeward = qz * G * CpL - qz * GCpi;
    // Net horizontal pressure (windward pushes + leeward suction)
    const pNet = pWindward - pLeeward; // both contribute to lateral force
    return { qz, z, pWindward, pLeeward, pNet };
  });
}

/**
 * Generate wind loads for a 3D structure
 * Applies lateral forces at each floor level based on tributary height
 *
 * @param nodes Structure nodes
 * @param params Wind parameters
 * @param direction Wind direction: 'X' or 'Y' (which axis gets the force)
 * @param buildingWidth Width perpendicular to wind (m) — tributary width per floor
 * @param floorHeights Z-coordinates of floor levels (sorted ascending)
 */
export function generateWindLoads(
  nodes: Map<number, { id: number; x: number; y: number; z?: number }>,
  params: WindParams,
  direction: 'X' | 'Y',
  buildingWidth: number,
  floorHeights?: number[],
): WindLoadOutput {
  const steps: string[] = [];
  const I = params.I ?? 1.0;
  const Kzt = params.Kzt ?? 1.0;
  const Kd = params.Kd ?? 0.85;

  steps.push(`V = ${params.V} m/s, Exposición = ${params.exposure}, I = ${I}`);
  steps.push(`Kzt = ${Kzt}, Kd = ${Kd}`);
  steps.push(`Dirección: ${direction}, Ancho tributario = ${buildingWidth.toFixed(2)} m`);

  // Detect floor levels
  const zSet = new Set<number>();
  for (const n of nodes.values()) {
    zSet.add(Math.round((n.z ?? 0) * 100) / 100);
  }
  const levels = floorHeights ?? [...zSet].sort((a, b) => a - b);

  // Compute pressures at each level
  const pressures = computeWindPressures(params, levels);

  const nodalForces: Array<{ nodeId: number; Fx: number; Fy: number; Fz: number }> = [];
  let baseShear = 0;
  let overturningMoment = 0;

  for (let i = 0; i < levels.length; i++) {
    const z = levels[i];
    const p = pressures[i];

    // Tributary height: half distance to adjacent levels
    let tributaryHeight: number;
    if (levels.length === 1) {
      tributaryHeight = z;
    } else if (i === 0) {
      tributaryHeight = (levels[1] - z) / 2;
    } else if (i === levels.length - 1) {
      tributaryHeight = (z - levels[i - 1]) / 2;
    } else {
      tributaryHeight = (levels[i + 1] - levels[i - 1]) / 2;
    }

    // Total force at this level
    const F_level = p.pNet * buildingWidth * tributaryHeight; // kN

    // Distribute to nodes at this level
    const levelNodes: number[] = [];
    for (const n of nodes.values()) {
      if (Math.abs((n.z ?? 0) - z) < 0.05) {
        levelNodes.push(n.id);
      }
    }

    if (levelNodes.length === 0) continue;

    const forcePerNode = F_level / levelNodes.length;
    for (const nid of levelNodes) {
      const Fx = direction === 'X' ? forcePerNode : 0;
      const Fy = direction === 'Y' ? forcePerNode : 0;
      nodalForces.push({ nodeId: nid, Fx, Fy, Fz: 0 });
    }

    baseShear += F_level;
    overturningMoment += F_level * z;

    steps.push(`z = ${z.toFixed(1)} m: qz = ${(p.qz * 1000).toFixed(1)} Pa, p_net = ${(p.pNet * 1000).toFixed(1)} Pa, F = ${F_level.toFixed(2)} kN (${levelNodes.length} nodos)`);
  }

  steps.push(`Corte basal = ${baseShear.toFixed(2)} kN`);
  steps.push(`Momento volcante = ${overturningMoment.toFixed(2)} kN·m`);

  const diags: SolverDiagnostic[] = [];
  // CIRSOC 102 simplified method is valid up to ~60m height
  const maxHeight = Math.max(...levels);
  if (maxHeight > 60) {
    diags.push({ severity: 'warning', code: 'WIND_HEIGHT_LIMIT', message: 'diag.windHeightLimit', source: 'assembly', details: { maxHeight } });
  }

  return { nodalForces, pressures, baseShear, overturningMoment, steps, diagnostics: diags.length > 0 ? diags : undefined };
}

// ─── Predefined Wind Zones (CIRSOC 102 Zones) ───

export const CIRSOC102_ZONES: Record<string, number> = {
  'I (V=33 m/s)': 33,
  'II (V=39 m/s)': 39,
  'III (V=45 m/s)': 45,
  'IV (V=51 m/s)': 51,
  'V (V=56 m/s)': 56,
};
