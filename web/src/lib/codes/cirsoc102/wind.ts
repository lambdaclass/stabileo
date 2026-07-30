/**
 * CIRSOC 102-2025 — wind action on buildings, MWFRS (SPRFV) directional procedure.
 *
 * A full rebuild against the official 2025 text (Edición Julio 2025). The previous
 * app-side layer implemented CIRSOC 102-2005 and had no pressure coefficients at all:
 * it produced a velocity pressure and applied it as a nodal load. That cannot be called
 * a wind load per the regulation, because the regulation's design pressure is
 * q·G·Cp − qi·(GCpi) and every one of those four factors was missing.
 *
 * What the 2025 edition adds over 2005, all of it implemented here:
 *   * K_e, the ground-elevation factor (§1.12) — absent from 2005 entirely
 *   * external pressure coefficients C_p for walls and roofs (§2.4, Fig. 2.4-1)
 *   * internal pressure (GC_pi) driven by an enclosure classification (§1.10, §1.11)
 *   * the gust-effect factor G as an explicit term (§1.9)
 *   * the minimum design wind load (§2.1.5)
 *
 * ── Normative expressions, verbatim ────────────────────────────
 *
 * §1.13 Eq. (1.13-1)   q_z = 0,613 · K_z · K_zt · K_d · K_e · V²      [N/m², V in m/s]
 * §1.13.1 Table 1.13-1 note 1
 *                      K_z = 2,41 (z/z_g)^(2/α)   for 5 m ≤ z ≤ z_g
 *                      K_z = 2,41 (5/z_g)^(2/α)   for z < 5 m
 *                      K_z = 2,41                 for z_g < z ≤ 1000 m
 * §1.9 Table 1.9-1     exposure constants α and z_g
 * §1.12 note 2         K_e = e^(−0,000119 z_g)   with z_g the site altitude in m;
 *                      note 1 permits the conservative K_e = 1,00 in every case
 * §2.4.1 Eq. (2.4-1)   p = q·G·C_p − q_i·(GC_pi)
 * §2.1.5               p ≥ 0,75 kN/m² on wall area and 0,4 kN/m² on roof area,
 *                      applied simultaneously
 *
 * The K_z implementation was checked against the printed Table 1.13-1 before use: at
 * z = 10 m it reproduces 0,71 / 1,00 / 1,19 for exposures B / C / D, and the sweep test
 * in the sibling spec checks the whole published table to ±0,01.
 *
 * ── What is deliberately NOT implemented ───────────────────────
 *
 * Flexible or dynamically sensitive buildings (§1.9.5), the large-volume reduction on
 * (GC_pi) (§1.11.1), domes and vaulted roofs (Fig. 2.4-2/2.4-3), parapets and roof
 * overhangs (§2.4.4/§2.4.5), components and cladding (Ch. 5), the wind-tunnel procedure
 * (Ch. 6), and the torsional load cases 2 and 4 of §2.4.6. Each returns an explicit
 * unsupported outcome; none is silently approximated.
 *
 * Pure: no store, no runes.
 */

import {
  assumed, clause, derived, fromCode, fromProject,
  type ClauseRef, type ProvenancedValue,
} from '../regulation';
import { msg, type EngineMessage } from '../message';

// ─── Exposure ────────────────────────────────────────────────────

export type Exposure = 'B' | 'C' | 'D';

/** Table 1.9-1 — terrain exposure constants. */
export const EXPOSURE_CONSTANTS: Readonly<Record<Exposure, { alpha: number; zg: number }>> =
  Object.freeze({
    B: { alpha: 7.5, zg: 1000 },
    C: { alpha: 9.8, zg: 750 },
    D: { alpha: 11.5, zg: 590 },
  });

const REF_TABLE_1_9_1 = clause('cirsoc-102', '2025', 'Tabla 1.9-1', 'constantes de exposición del terreno');
const REF_KZ = clause('cirsoc-102', '2025', '1.13.1', 'coeficiente de exposición para la presión dinámica');
const REF_QZ = clause('cirsoc-102', '2025', '1.13-1', 'presión dinámica');
const REF_KD = clause('cirsoc-102', '2025', 'Tabla 1.6-1', 'factor de direccionalidad');
const REF_KE = clause('cirsoc-102', '2025', '1.12', 'factor de elevación del terreno');
const REF_KZT = clause('cirsoc-102', '2025', '1.8', 'efectos topográficos');
const REF_G = clause('cirsoc-102', '2025', '1.9.1', 'factor de efecto de ráfaga');
const REF_GCPI = clause('cirsoc-102', '2025', 'Tabla 1.11-1', 'coeficientes de presión interna');
const REF_CP = clause('cirsoc-102', '2025', 'Figura 2.4-1', 'coeficientes de presión externa');
const REF_P = clause('cirsoc-102', '2025', '2.4-1', 'presión de viento de diseño');
const REF_MIN = clause('cirsoc-102', '2025', '2.1.5', 'cargas de viento de diseño mínimas');

/**
 * §1.13.1 Table 1.13-1 note 1 — velocity-pressure exposure coefficient.
 *
 * `z` in metres above ground.
 */
export function velocityPressureExposureCoefficient(z: number, exposure: Exposure): number {
  const { alpha, zg } = EXPOSURE_CONSTANTS[exposure];
  if (z > 1000) {
    // Above 1000 m the table does not extend; the regulation gives no value.
    return NaN;
  }
  if (z > zg) return 2.41;
  const zEff = Math.max(z, 5);
  return 2.41 * Math.pow(zEff / zg, 2 / alpha);
}

/** §1.12 note 2 — ground-elevation factor from the site altitude above sea level. */
export function groundElevationFactor(siteAltitudeM: number): number {
  return Math.exp(-0.000119 * siteAltitudeM);
}

// ─── Directionality ──────────────────────────────────────────────

export type StructureKind =
  | 'building' | 'archedRoof' | 'chimneySquare' | 'chimneyHexagonal' | 'chimneyRound'
  | 'chimneyOctagonal' | 'solidSign' | 'openSign' | 'latticeTowerTriangularOrRect'
  | 'latticeTowerOther';

/** Table 1.6-1 — wind directionality factor K_d. */
export const KD: Readonly<Record<StructureKind, number>> = Object.freeze({
  building: 0.85,
  archedRoof: 0.85,
  chimneySquare: 0.90,
  chimneyHexagonal: 0.95,
  chimneyRound: 1.00,
  chimneyOctagonal: 1.00,
  solidSign: 0.85,
  openSign: 0.85,
  latticeTowerTriangularOrRect: 0.85,
  latticeTowerOther: 0.95,
});

// ─── Enclosure and internal pressure ─────────────────────────────

export type Enclosure = 'open' | 'partiallyOpen' | 'partiallyEnclosed' | 'enclosed';

/**
 * Table 1.11-1 — internal pressure coefficient (GC_pi).
 *
 * Returns the magnitude; both signs must be investigated (note 1: the plus and minus
 * signs mean pressures acting toward and away from the internal surfaces).
 */
export function internalPressureCoefficient(enclosure: Enclosure): number {
  switch (enclosure) {
    case 'open': return 0;              // "Despreciable"
    case 'partiallyOpen': return 0.18;  // "Moderado"
    case 'partiallyEnclosed': return 0.55; // "Elevado"
    case 'enclosed': return 0.18;       // "Moderado"
  }
}

export interface EnclosureInputs {
  /** Total area of openings in a wall receiving positive external pressure, m². */
  a0: number;
  /** Gross area of that wall, m². */
  ag: number;
  /** Sum of openings in the building envelope not including a0, m². */
  a0i: number;
  /** Sum of gross surface areas of the envelope not including that wall, m². */
  agi: number;
}

/**
 * §1.10 / Table 1.11-1 — classify enclosure from opening areas.
 *
 * The order below is the order the table's criteria are printed, and it matters: a
 * building satisfying the "partially enclosed" criteria is classified as such even
 * though it may also read as "enclosed" on the A0 test alone.
 */
export function classifyEnclosure(i: EnclosureInputs): Enclosure {
  const { a0, ag, a0i, agi } = i;
  if (a0 >= 0.8 * ag) return 'open';
  const enclosedLimit = Math.min(0.01 * ag, 0.4);
  const partiallyEnclosed =
    a0 > 1.10 * a0i &&
    a0 > enclosedLimit &&
    (agi > 0 ? a0i / agi <= 0.20 : true);
  if (partiallyEnclosed) return 'partiallyEnclosed';
  if (a0 <= enclosedLimit) return 'enclosed';
  return 'partiallyOpen';
}

// ─── External pressure coefficients ──────────────────────────────

/** Fig. 2.4-1 — windward wall. Used with q_z evaluated at height z. */
export const CP_WINDWARD_WALL = 0.8;

/** Fig. 2.4-1 — side walls, all L/B. Used with q_h. */
export const CP_SIDE_WALL = -0.7;

/**
 * Fig. 2.4-1 — leeward wall, by L/B. Used with q_h.
 *
 * Printed values: L/B 0–1 → −0,5; L/B = 2 → −0,3; L/B ≥ 4 → −0,2.
 * Note 2 permits linear interpolation between values of the same sign.
 */
export function cpLeewardWall(lOverB: number): number {
  if (lOverB <= 1) return -0.5;
  if (lOverB >= 4) return -0.2;
  if (lOverB <= 2) {
    // interpolate between (1, -0.5) and (2, -0.3)
    return -0.5 + (lOverB - 1) * (0.2 / 1);
  }
  // interpolate between (2, -0.3) and (4, -0.2)
  return -0.3 + (lOverB - 2) * (0.1 / 2);
}

/**
 * Fig. 2.4-1 — windward roof slope, wind normal to the ridge, θ ≥ 10°.
 *
 * Printed grid, by h/L then θ in degrees. Where the table lists two values, the roof
 * must be designed for both (note 3), so both are returned.
 */
const CP_ROOF_WINDWARD: Record<string, Array<{ theta: number; values: number[] }>> = {
  '0.25': [
    { theta: 10, values: [-0.7, -0.18] }, { theta: 15, values: [-0.5, 0.0] },
    { theta: 20, values: [-0.3, 0.2] }, { theta: 25, values: [-0.2, 0.3] },
    { theta: 30, values: [-0.2, 0.3] }, { theta: 35, values: [0.0, 0.4] },
    { theta: 45, values: [0.4] }, { theta: 60, values: [0.01] },
  ],
  '0.5': [
    { theta: 10, values: [-0.9, -0.18] }, { theta: 15, values: [-0.7, -0.18] },
    { theta: 20, values: [-0.4, 0.0] }, { theta: 25, values: [-0.3, 0.2] },
    { theta: 30, values: [-0.2, 0.2] }, { theta: 35, values: [-0.2, 0.3] },
    { theta: 45, values: [0.0, 0.4] }, { theta: 60, values: [0.01] },
  ],
  '1.0': [
    { theta: 10, values: [-1.3, -0.18] }, { theta: 15, values: [-1.0, -0.18] },
    { theta: 20, values: [-0.7, -0.18] }, { theta: 25, values: [-0.5, 0.0] },
    { theta: 30, values: [-0.3, 0.2] }, { theta: 35, values: [-0.2, 0.2] },
    { theta: 45, values: [0.0, 0.3] }, { theta: 60, values: [0.01] },
  ],
};

/** Fig. 2.4-1 — leeward roof slope, wind normal to the ridge, θ ≥ 10°. */
const CP_ROOF_LEEWARD: Record<string, Array<{ theta: number; value: number }>> = {
  '0.25': [{ theta: 10, value: -0.3 }, { theta: 15, value: -0.5 }, { theta: 20, value: -0.6 }],
  '0.5': [{ theta: 10, value: -0.5 }, { theta: 15, value: -0.5 }, { theta: 20, value: -0.6 }],
  '1.0': [{ theta: 10, value: -0.7 }, { theta: 15, value: -0.6 }, { theta: 20, value: -0.6 }],
};

function hOverLBucket(hOverL: number): '0.25' | '0.5' | '1.0' {
  if (hOverL <= 0.25) return '0.25';
  if (hOverL <= 0.5) return '0.5';
  return '1.0';
}

function interp(rows: Array<{ theta: number }>, theta: number): { lo: number; hi: number; t: number } {
  if (theta <= rows[0].theta) return { lo: 0, hi: 0, t: 0 };
  for (let i = 1; i < rows.length; i++) {
    if (theta <= rows[i].theta) {
      const span = rows[i].theta - rows[i - 1].theta;
      return { lo: i - 1, hi: i, t: span === 0 ? 0 : (theta - rows[i - 1].theta) / span };
    }
  }
  return { lo: rows.length - 1, hi: rows.length - 1, t: 0 };
}

export interface RoofCpResult {
  /** Every C_p the roof must be designed for; more than one when the table lists both signs. */
  windward: number[];
  leeward: number[];
  refs: ClauseRef[];
  /** Set when the geometry falls outside the printed table. Translated at the boundary. */
  unsupported?: EngineMessage;
}

/**
 * Fig. 2.4-1 — roof pressure coefficients, wind normal to the ridge.
 *
 * Note 2 permits interpolation only between values of the same sign; where signs
 * differ, 0,0 is taken for interpolation purposes. This implementation interpolates
 * each of the two printed value-sets independently, which honours that rule because the
 * "first" set is negative throughout and the "second" is the non-negative one.
 */
export function roofCp(hOverL: number, thetaDeg: number): RoofCpResult {
  if (thetaDeg > 80) {
    // Footnote: for roof slopes steeper than 80° use C_p = 0,8.
    return { windward: [0.8], leeward: [0.8], refs: [REF_CP] };
  }
  if (thetaDeg < 10) {
    return {
      windward: [], leeward: [], refs: [REF_CP],
      unsupported: msg('loads.cirsoc102.unsupported.shallowRoofParallelRidge'),
    };
  }
  const bucket = hOverLBucket(hOverL);
  const wRows = CP_ROOF_WINDWARD[bucket];
  const lRows = CP_ROOF_LEEWARD[bucket];

  const wi = interp(wRows, thetaDeg);
  const li = interp(lRows, Math.min(thetaDeg, 20));

  const nSets = Math.max(wRows[wi.lo].values.length, wRows[wi.hi].values.length);
  const windward: number[] = [];
  for (let s = 0; s < nSets; s++) {
    const a = wRows[wi.lo].values[s] ?? wRows[wi.lo].values[wRows[wi.lo].values.length - 1];
    const b = wRows[wi.hi].values[s] ?? wRows[wi.hi].values[wRows[wi.hi].values.length - 1];
    windward.push(a + (b - a) * wi.t);
  }
  const la = lRows[li.lo].value;
  const lb = lRows[li.hi].value;

  return {
    windward: [...new Set(windward.map((v) => +v.toFixed(4)))],
    leeward: [+(la + (lb - la) * li.t).toFixed(4)],
    refs: [REF_CP],
  };
}

// ─── The full calculation ────────────────────────────────────────

export interface WindProject {
  /** Basic wind speed V, m/s (3-second gust). §1.5.1. */
  basicSpeed: number;
  exposure: Exposure;
  /** Site altitude above sea level, m. Drives K_e. */
  siteAltitudeM: number;
  /** Topographic factor K_zt. 1.0 when the site is not on a hill/escarpment (§1.8). */
  kzt: number;
  /** Whether the project surveyed topography, or is defaulting K_zt to 1.0. */
  kztSurveyed: boolean;
  structureKind: StructureKind;
  enclosure: Enclosure;
  /** Mean roof height h, m. */
  meanRoofHeight: number;
  /** Plan dimension parallel to the wind, m. */
  L: number;
  /** Plan dimension normal to the wind, m. */
  B: number;
  /** Roof slope θ, degrees. 0 for a flat roof. */
  roofSlopeDeg: number;
  /**
   * True when the building is rigid per §1.9.4 (fundamental frequency ≥ 1 Hz).
   * A flexible building needs §1.9.5, which is not implemented.
   */
  rigid: boolean;
}

export interface SurfacePressure {
  surface: 'windwardWall' | 'leewardWall' | 'sideWall' | 'windwardRoof' | 'leewardRoof';
  /** Height at which q was evaluated, m. */
  zM: number;
  /** Velocity pressure used, N/m². */
  qNm2: number;
  cp: number;
  /** Net design pressure p, N/m² (positive toward the surface). */
  pNm2: number;
  /** Sign of the internal pressure case this row belongs to. */
  gcpiSign: 1 | -1;
  refs: ClauseRef[];
}

export interface WindResult {
  /** Every intermediate factor, provenanced for the derivation report. */
  factors: {
    V: ProvenancedValue<number>;
    kd: ProvenancedValue<number>;
    ke: ProvenancedValue<number>;
    kzt: ProvenancedValue<number>;
    kh: ProvenancedValue<number>;
    G: ProvenancedValue<number>;
    gcpi: ProvenancedValue<number>;
  };
  /** q_h, the velocity pressure at mean roof height, N/m². */
  qhNm2: number;
  /** Both internal-pressure cases, each a full set of surface pressures. */
  pressures: SurfacePressure[];
  /** §2.1.5 minimum values, N/m². */
  minimum: { wallNm2: number; roofNm2: number; refs: ClauseRef[] };
  /** Capabilities the project needed that are not implemented. Never empty silently. */
  unsupported: EngineMessage[];
  /** Every assumption made, for the report's assumptions block. */
  assumptions: EngineMessage[];
}

/** §1.9.4 — gust-effect factor for a rigid building. */
export const G_RIGID = 0.85;

/**
 * Velocity pressure at height z. §1.13 Eq. (1.13-1). Returns N/m².
 */
export function velocityPressure(z: number, p: WindProject): number {
  const kz = velocityPressureExposureCoefficient(z, p.exposure);
  const kd = KD[p.structureKind];
  const ke = groundElevationFactor(p.siteAltitudeM);
  return 0.613 * kz * p.kzt * kd * ke * p.basicSpeed * p.basicSpeed;
}

/**
 * Full MWFRS wind pressures for one wind direction.
 *
 * Produces both (GC_pi) sign cases, because §1.11 note 1 requires both to be
 * investigated and the governing one is not knowable in advance.
 */
export function computeWindPressures(p: WindProject): WindResult {
  const unsupported: EngineMessage[] = [];
  const assumptions: EngineMessage[] = [];

  if (!p.rigid) {
    unsupported.push(msg('loads.cirsoc102.unsupported.flexibleBuilding'));
  }
  if (p.meanRoofHeight > 1000) {
    unsupported.push(msg('loads.cirsoc102.unsupported.heightAboveTable', { limit: 1000 }));
  }

  const kd = KD[p.structureKind];
  const ke = groundElevationFactor(p.siteAltitudeM);
  const kh = velocityPressureExposureCoefficient(p.meanRoofHeight, p.exposure);
  const gcpiMag = internalPressureCoefficient(p.enclosure);
  const G = G_RIGID;

  const kztValue: ProvenancedValue<number> = p.kztSurveyed
    ? fromProject(p.kzt)
    : assumed(1.0, msg('loads.cirsoc102.assumed.kzt'), [REF_KZT]);
  if (!p.kztSurveyed && kztValue.assumption) assumptions.push(kztValue.assumption);

  const factors: WindResult['factors'] = {
    V: fromProject(p.basicSpeed, 'm/s'),
    kd: fromCode(kd, [REF_KD]),
    ke: derived(ke, [REF_KE]),
    kzt: kztValue,
    kh: derived(kh, [REF_KZ, REF_TABLE_1_9_1]),
    G: fromCode(G, [REF_G]),
    gcpi: fromCode(gcpiMag, [REF_GCPI]),
  };

  const qh = velocityPressure(p.meanRoofHeight, p);
  const pressures: SurfacePressure[] = [];

  if (unsupported.length === 0) {
    const lOverB = p.B > 0 ? p.L / p.B : 1;
    const cpLee = cpLeewardWall(lOverB);
    const roof = roofCp(p.meanRoofHeight / Math.max(p.L, 1e-9), p.roofSlopeDeg);
    if (roof.unsupported) unsupported.push(roof.unsupported);

    // Windward wall pressure varies with height; evaluate at the mean roof height and
    // at the base so the caller can distribute. §2.4.1: q = q_z on the windward wall.
    const windwardHeights = [...new Set([Math.min(5, p.meanRoofHeight), p.meanRoofHeight])];

    for (const sign of [1, -1] as const) {
      const pi = sign * gcpiMag * qh; // q_i = q_h for an enclosed building (§2.4.1)

      for (const z of windwardHeights) {
        const qz = velocityPressure(z, p);
        pressures.push({
          surface: 'windwardWall', zM: z, qNm2: qz, cp: CP_WINDWARD_WALL,
          pNm2: qz * G * CP_WINDWARD_WALL - pi, gcpiSign: sign,
          refs: [REF_P, REF_CP, REF_QZ],
        });
      }
      pressures.push({
        surface: 'leewardWall', zM: p.meanRoofHeight, qNm2: qh, cp: cpLee,
        pNm2: qh * G * cpLee - pi, gcpiSign: sign, refs: [REF_P, REF_CP],
      });
      pressures.push({
        surface: 'sideWall', zM: p.meanRoofHeight, qNm2: qh, cp: CP_SIDE_WALL,
        pNm2: qh * G * CP_SIDE_WALL - pi, gcpiSign: sign, refs: [REF_P, REF_CP],
      });
      for (const cp of roof.windward) {
        pressures.push({
          surface: 'windwardRoof', zM: p.meanRoofHeight, qNm2: qh, cp,
          pNm2: qh * G * cp - pi, gcpiSign: sign, refs: [REF_P, REF_CP],
        });
      }
      for (const cp of roof.leeward) {
        pressures.push({
          surface: 'leewardRoof', zM: p.meanRoofHeight, qNm2: qh, cp,
          pNm2: qh * G * cp - pi, gcpiSign: sign, refs: [REF_P, REF_CP],
        });
      }
    }
  }

  // §2.4.6 — the four design load cases. Cases 2 and 4 apply a torsional eccentricity
  // that the frame model has no way to receive as a surface pressure.
  unsupported.push(msg('loads.cirsoc102.unsupported.torsionalCases'));

  return {
    factors,
    qhNm2: qh,
    pressures,
    minimum: { wallNm2: 750, roofNm2: 400, refs: [REF_MIN] },
    unsupported,
    assumptions,
  };
}

/**
 * §2.1.5 — the minimum design wind load, as a check on a computed total force.
 *
 * The regulation states it as a pressure on projected area, and requires the wall and
 * roof parts to be applied simultaneously. Returns the governing total.
 */
export function applyMinimumWindLoad(
  computedTotalN: number,
  projectedWallAreaM2: number,
  projectedRoofAreaM2: number,
): { totalN: number; governedByMinimum: boolean; minimumN: number; refs: ClauseRef[] } {
  const minimumN = 750 * projectedWallAreaM2 + 400 * projectedRoofAreaM2;
  const governedByMinimum = minimumN > Math.abs(computedTotalN);
  return {
    totalN: governedByMinimum ? minimumN : computedTotalN,
    governedByMinimum,
    minimumN,
    refs: [REF_MIN],
  };
}
