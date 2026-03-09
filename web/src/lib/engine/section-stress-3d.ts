// 3D Section Stress Analysis — Complete
// Biaxial bending: σ(y,z) = N/A - My·y/Iz + Mz·z/Iy
// y = section vertical (up), z = section horizontal (right)
// My = strong-axis moment (θy = -dw/dx), Mz = weak-axis moment (θz = +dv/dx)
// Jourawsky shear: τ_Vy(y) = Vy·Q_z(y)/(Iz·b(y)), τ_Vz(z) = Vz·Q_y(z)/(Iy·h_w(z))
// Torsion: τ_T (Bredt for closed, Saint-Venant for open sections)
// Von Mises: σ_vm = √(σ² + 3·(τ_xy² + τ_xz²))

import type { ElementForces3D } from './types-3d';
import type { Section } from '../store/model.svelte';
import { t } from '../i18n';
import {
  resolveSectionGeometry,
  computeMohrCircle,
  checkFailure,
  shearStress,
  normalStress,
  type ResolvedSection,
  type MohrCircle,
  type FailureCheck,
} from './section-stress';

// ─── Legacy quick-compute interface (kept for colorMap compatibility) ───

export interface SectionStress3D {
  sigmaMax: number;   // kN/m² (kPa)
  tauMax: number;
  vonMises: number;
  ratio: number;
}

export function computeSectionStress(
  N: number, Vy: number, Vz: number,
  Mx: number, My: number, Mz: number,
  A: number, Iz: number, Iy: number,
  h: number = 0, b: number = 0,
  fy: number = 355_000,
): SectionStress3D {
  // UBA convention: local Y = horizontal (width b), local Z = vertical/down (height h)
  const yMax = b > 0 ? b / 2 : Math.sqrt(Iz / A) * 2;
  const zMax = h > 0 ? h / 2 : Math.sqrt(Iy / A) * 2;
  const sigmaN = A > 0 ? N / A : 0;
  const sigmaMz = Iz > 0 ? Math.abs(Mz) * yMax / Iz : 0;
  const sigmaMy = Iy > 0 ? Math.abs(My) * zMax / Iy : 0;
  const sigmaMax = Math.abs(sigmaN) + sigmaMz + sigmaMy;
  const kappa = 1.2;
  const tauY = A > 0 ? Math.abs(Vy) * kappa / A : 0;
  const tauZ = A > 0 ? Math.abs(Vz) * kappa / A : 0;
  const tauMax = Math.sqrt(tauY * tauY + tauZ * tauZ);
  const vonMises = Math.sqrt(sigmaMax * sigmaMax + 3 * tauMax * tauMax);
  const ratio = fy > 0 ? vonMises / fy : 0;
  return { sigmaMax, tauMax, vonMises, ratio };
}

export function computeElementStress3D(
  ef: ElementForces3D,
  A: number, Iz: number, Iy: number,
  h: number = 0, b: number = 0,
  fy: number = 355_000,
): { start: SectionStress3D; end: SectionStress3D; max: SectionStress3D } {
  const start = computeSectionStress(ef.nStart, ef.vyStart, ef.vzStart, ef.mxStart, ef.myStart, ef.mzStart, A, Iz, Iy, h, b, fy);
  const end = computeSectionStress(ef.nEnd, ef.vyEnd, ef.vzEnd, ef.mxEnd, ef.myEnd, ef.mzEnd, A, Iz, Iy, h, b, fy);
  const max = start.vonMises >= end.vonMises ? start : end;
  return { start, end, max };
}

// ─── Detailed 3D Stress Analysis ─────────────────────────────────────

export interface StressPoint3D {
  y: number;        // m from centroid
  z: number;        // m from centroid
  sigma: number;    // MPa — normal stress σ_x
  tauVy: number;    // MPa — Jourawsky shear from Vy
  tauVz: number;    // MPa — Jourawsky shear from Vz
  tauT: number;     // MPa — torsion shear
  vonMises: number; // MPa
}

export interface NeutralAxisInfo {
  exists: boolean;
  /** Neutral axis line: y = slope * z + intercept */
  slope: number;
  intercept: number;
  /** Angle of neutral axis from z-axis (rad) */
  angle: number;
}

export interface SectionStressResult3D {
  // Internal forces at this section
  N: number; Vy: number; Vz: number;
  Mx: number; My: number; Mz: number;

  // Resolved geometry
  resolved: ResolvedSection;
  /** Iy in Navier notation = about Z-axis (vertical) = resolved.iz = sec.iz (m⁴) */
  Iz: number;

  // Stress distributions along section height (eje y, z=0)
  distributionY: StressPoint3D[];
  // Stress distributions along section width (eje z, y=0)
  distributionZ: StressPoint3D[];

  // Stresses at selected fiber
  sigmaAtFiber: number;     // MPa — biaxial normal
  tauVyAtFiber: number;     // MPa — Jourawsky from Vy
  tauVzAtFiber: number;     // MPa — Jourawsky from Vz
  tauTorsion: number;       // MPa — torsion
  tauTotal: number;         // MPa — combined shear

  // Combined neutral axis
  neutralAxis: NeutralAxisInfo;

  // Mohr's circle (plane stress: σ_x, τ_total)
  mohr: MohrCircle;

  // Failure check
  failure: FailureCheck;
}

// ─── Normal stress — Navier biaxial ─────────────────────────────────

/**
 * σ_x(y,z) = N/A - My·y/Iz + Mz·z/Iy
 *
 * Section coordinates: y = vertical (up), z = horizontal (right).
 * Solver moments: My = about Y horizontal (vertical bending, θy = -dw/dx),
 *                 Mz = about Z vertical (horizontal bending, θz = +dv/dx).
 * In Navier's formula, "Iz" pairs with My·y (vertical stress variation, uses Iy_model = resolved.iy).
 * Similarly, "Iy" pairs with Mz·z (horizontal stress variation, uses Iz_model = resolved.iz).
 * Note: param names (Iz, Iy) follow Navier notation, NOT model naming convention.
 *
 * My negative sign: θy = -dw/dx convention inverts My relative to standard M.
 * Mz positive sign: θz = +dv/dx, same convention as 2D.
 *
 * All forces in kN, geometry in m → result in MPa (÷1000)
 */
function normalStress3D(
  N: number, Mz: number, My: number,
  A: number, Iz: number, Iy: number,
  y: number, z: number,
): number {
  let sigma = 0;
  if (A > 1e-15) sigma += N / A;
  // My (about Y horiz) → stress varies with y (vertical) → Iz param = resolved.iy (about Y horiz).
  // Negative sign from θy = -dw/dx convention.
  if (Iz > 1e-15) sigma -= My * y / Iz;
  // Mz (about Z vert) → stress varies with z (horizontal) → Iy param = resolved.iz (about Z vert).
  // Same sign convention as 2D (θz = +dv/dx).
  if (Iy > 1e-15) sigma += Mz * z / Iy;
  return sigma / 1000; // kN/m² → MPa
}

// ─── Jourawsky shear — weak axis ────────────────────────────────────

/**
 * Compute Q_y(z) and width h_w(z) for weak-axis shear (Vz).
 * This is the "transposed" version of computeQandB from section-stress.ts.
 * For I/H sections: Vz is resisted primarily by the flanges.
 */
function computeQyAndWidth(z: number, rs: ResolvedSection): { Q: number; width: number } {
  const halfB = rs.b / 2;

  switch (rs.shape) {
    case 'rect':
    case 'generic': {
      // Q_y(z) = (h/2)·(b²/4 - z²)
      const Q = (rs.h / 2) * (halfB * halfB - z * z);
      return { Q, width: rs.h };
    }

    case 'I':
    case 'H': {
      // For I/H: weak-axis shear flows through the flanges
      // Top flange: from -b/2 to b/2, thickness tf
      // Web doesn't contribute to weak-axis shear (it's thin in z)
      const zAbs = Math.abs(z);
      if (zAbs >= halfB) return { Q: 0, width: 2 * rs.tf };

      // Both flanges contribute: Q_y(z) = 2 × tf × ∫_z^(b/2) ζ dζ
      // = 2 × tf × (b²/8 - z²/2) = tf × (b²/4 - z²)
      const Q = rs.tf * (halfB * halfB - z * z);
      // Width at cut = 2 × tf (one top flange + one bottom flange)
      return { Q, width: 2 * rs.tf };
    }

    case 'U': {
      // U section: single flange contributes
      const zAbs = Math.abs(z);
      if (zAbs >= halfB) return { Q: 0, width: rs.tf };
      const Q = rs.tf * (halfB * halfB - z * z) / 2;
      return { Q, width: rs.tf };
    }

    case 'RHS': {
      const bOuter = rs.b;
      const bInner = bOuter - 2 * rs.t;
      const halfBi = bInner / 2;
      const zAbs = Math.abs(z);
      if (zAbs > halfB) return { Q: 0, width: rs.h };

      if (zAbs > halfBi) {
        // In the "flange wall" (side wall)
        const dz = halfB - zAbs;
        const Q = rs.h * dz * (halfB - dz / 2);
        return { Q, width: rs.h };
      }

      // In the "web" zone
      const Qwall = rs.h * rs.t * (halfB - rs.t / 2);
      const webBeyond = halfBi - zAbs;
      const Qweb = 2 * rs.t * webBeyond * (halfBi - webBeyond / 2);
      return { Q: Qwall + Qweb, width: 2 * rs.t };
    }

    case 'CHS': {
      const R = rs.h / 2;
      if (Math.abs(z) >= R) return { Q: 0, width: rs.t };
      const Q = rs.t * (R * R - z * z);
      return { Q, width: 2 * rs.t };
    }

    case 'L': {
      const Q = (rs.t / 2) * (halfB * halfB - z * z);
      return { Q, width: rs.t };
    }

    default: {
      // Rectangular fallback
      const Q = (rs.h / 2) * (halfB * halfB - z * z);
      return { Q, width: rs.h };
    }
  }
}

/**
 * Weak-axis shear stress τ_Vz at fiber z.
 * τ(z) = Vz · Q_y(z) / (Iy · width(z))
 */
function shearStressWeakAxis(
  Vz: number, z: number, rs: ResolvedSection, Iy: number,
): number {
  if (Iy < 1e-15) return 0;
  const { Q, width } = computeQyAndWidth(z, rs);
  if (width < 1e-12) return 0;
  return (Vz * Q) / (Iy * width) / 1000; // MPa
}

// ─── Torsion shear stress ────────────────────────────────────────────

/**
 * Torsion shear stress.
 * Closed sections (RHS, CHS): Bredt formula τ = Mx / (2·Am·t)
 * Open sections (I, H, U, L, T): Saint-Venant τ = Mx·t_max / J
 */
function torsionShearStress(Mx: number, rs: ResolvedSection, J: number): number {
  if (Math.abs(Mx) < 1e-15 || J < 1e-15) return 0;

  const isClosed = rs.shape === 'RHS' || rs.shape === 'CHS';

  if (isClosed) {
    // Bredt: τ = Mx / (2·Am·t)
    let Am: number;
    let t: number;
    if (rs.shape === 'CHS') {
      const Rm = (rs.h / 2) - (rs.t / 2); // mean radius
      Am = Math.PI * Rm * Rm;
      t = rs.t > 0 ? rs.t : rs.h * 0.05;
    } else {
      // RHS
      t = rs.t > 0 ? rs.t : Math.min(rs.b, rs.h) * 0.05;
      Am = (rs.b - t) * (rs.h - t);
    }
    if (Am < 1e-15 || t < 1e-12) return 0;
    return Math.abs(Mx) / (2 * Am * t) / 1000; // MPa
  } else {
    // Open section: τ = Mx · t_max / J
    let tMax: number;
    if (rs.shape === 'I' || rs.shape === 'H') {
      tMax = Math.max(rs.tw, rs.tf);
    } else if (rs.shape === 'U') {
      tMax = Math.max(rs.tw, rs.tf);
    } else if (rs.shape === 'T' || rs.shape === 'invL') {
      tMax = Math.max(rs.tw, rs.tf);
    } else if (rs.shape === 'L') {
      tMax = rs.t > 0 ? rs.t : rs.b * 0.1;
    } else {
      // rect/generic: use min(b,h) as "thickness" for Saint-Venant
      tMax = Math.min(rs.b, rs.h);
    }
    if (tMax < 1e-12) return 0;
    return Math.abs(Mx) * tMax / J / 1000; // MPa
  }
}

// ─── Neutral axis computation ────────────────────────────────────────

/**
 * Compute the combined neutral axis for biaxial bending + axial.
 * σ(y,z) = 0 → N/A - My·y/Iz + Mz·z/Iy = 0
 *
 * When My ≠ 0: y = (N·Iz)/(A·My) + (Mz·Iz)/(Iy·My)·z
 * When My = 0, Mz ≠ 0: z = -(N·Iy)/(A·Mz)  (vertical line)
 */
function computeNeutralAxis(
  N: number, Mz: number, My: number,
  A: number, Iz: number, Iy: number,
): NeutralAxisInfo {
  const hasMz = Math.abs(Mz) > 1e-10;
  const hasMy = Math.abs(My) > 1e-10;

  if (!hasMz && !hasMy) {
    // Pure axial: no neutral axis if N ≠ 0 (uniform σ), or entire section neutral if N = 0
    return { exists: false, slope: 0, intercept: 0, angle: 0 };
  }

  if (hasMy) {
    // y = intercept + slope · z
    const intercept = A > 1e-15 ? (N * Iz) / (A * My) : 0;
    const slope = hasMz && Iy > 1e-20 ? (Mz * Iz) / (Iy * My) : 0;
    const angle = Math.atan(slope);
    return { exists: true, slope, intercept, angle };
  }

  // My = 0, Mz ≠ 0: neutral axis is vertical (z = const)
  // Mz·z/Iy = -N/A → z = -(N·Iy)/(A·Mz)
  const zIntercept = A > 1e-15 ? -(N * Iy) / (A * Mz) : 0;
  return { exists: true, slope: Infinity, intercept: zIntercept, angle: Math.PI / 2 };
}

/**
 * Compute neutral axis considering bending moments only (N=0).
 * σ = -My·y/Iz + Mz·z/Iy = 0
 * When My ≠ 0: y = (Mz·Iz)/(Iy·My)·z  (passes through centroid)
 * Uniaxial My only: horizontal NA (y=0)
 * Uniaxial Mz only: vertical NA (z=0)
 */
export function computeNeutralAxisMomentsOnly(
  Mz: number, My: number,
  Iz: number, Iy: number,
): NeutralAxisInfo {
  const hasMz = Math.abs(Mz) > 1e-10;
  const hasMy = Math.abs(My) > 1e-10;

  if (!hasMz && !hasMy) {
    return { exists: false, slope: 0, intercept: 0, angle: 0 };
  }

  if (hasMy) {
    // y = slope · z (intercept = 0 since N=0 → passes through centroid)
    const slope = hasMz && Iy > 1e-20 ? (Mz * Iz) / (Iy * My) : 0;
    const angle = Math.atan(slope);
    return { exists: true, slope, intercept: 0, angle };
  }

  // My = 0, Mz ≠ 0: NA is vertical through centroid (z = 0)
  return { exists: true, slope: Infinity, intercept: 0, angle: Math.PI / 2 };
}

// ─── Perpendicular-to-NA stress distribution ────────────────────────

export interface PerpNAPoint {
  /** Signed distance from neutral axis along perpendicular direction (m) */
  d: number;
  /** y coordinate from centroid (m) */
  y: number;
  /** z coordinate from centroid (m) */
  z: number;
  /** Normal stress at this point (MPa) */
  sigma: number;
}

/**
 * Sample stress distribution perpendicular to the combined neutral axis.
 * For biaxial bending, σ varies linearly in the direction ⊥ to the NA.
 * Returns points ordered from max compression to max tension.
 */
export function computePerpNADistribution(
  N: number, Mz: number, My: number,
  A: number, Iz: number, Iy: number,
  na: NeutralAxisInfo,
  rs: ResolvedSection,
  numPoints: number = 21,
): PerpNAPoint[] {
  if (!na.exists) return [];

  const halfH = rs.h / 2;
  const halfB = rs.b / 2;

  // Perpendicular direction to the NA line: y = slope·z + intercept
  // f(y,z) = y - slope·z - intercept = 0 → ∇f = (1, -slope)
  // Perpendicular unit vector in (y,z) space: (1, -slope) / ||(1, -slope)||
  let perpY: number, perpZ: number;
  if (na.slope === Infinity) {
    // Vertical NA (z = intercept) → perpendicular is horizontal: (0, 1)
    perpY = 0;
    perpZ = 1;
  } else {
    const len = Math.hypot(1, na.slope);
    perpY = 1 / len;
    perpZ = -na.slope / len;
  }

  // Project bounding box corners onto perpendicular to find range
  const corners = [
    { y: halfH, z: halfB },
    { y: halfH, z: -halfB },
    { y: -halfH, z: halfB },
    { y: -halfH, z: -halfB },
  ];

  // Signed distance from NA for each corner
  const dCorners = corners.map(c => {
    if (na.slope === Infinity) return c.z - na.intercept;
    return (c.y - na.slope * c.z - na.intercept) / Math.hypot(1, na.slope);
  });
  const dMin = Math.min(...dCorners);
  const dMax = Math.max(...dCorners);

  if (Math.abs(dMax - dMin) < 1e-12) return [];

  // Reference point on NA (for offset computation)
  let refY: number, refZ: number;
  if (na.slope === Infinity) {
    refY = 0;
    refZ = na.intercept;
  } else {
    refY = na.intercept;
    refZ = 0;
  }

  // Sample along perpendicular direction
  const points: PerpNAPoint[] = [];
  for (let i = 0; i < numPoints; i++) {
    const d = dMin + (i / (numPoints - 1)) * (dMax - dMin);
    const y = refY + d * perpY;
    const z = refZ + d * perpZ;
    const sigma = normalStress3D(N, Mz, My, A, Iz, Iy, y, z);
    points.push({ d, y, z, sigma });
  }

  return points;
}

// ─── Force interpolation at arbitrary position t ─────────────────────

/**
 * Interpolate internal forces at normalized position t ∈ [0,1].
 * Uses element forces + distributed/point loads for accurate interpolation.
 */
export function interpolateForces3D(
  ef: ElementForces3D, t: number,
): { N: number; Vy: number; Vz: number; Mx: number; My: number; Mz: number } {
  const x = t * ef.length;
  const L = ef.length;

  // N: linear (no distributed axial loads assumed)
  const N = ef.nStart + t * (ef.nEnd - ef.nStart);

  // Mx: linear (no distributed torsion loads assumed)
  const Mx = ef.mxStart + t * (ef.mxEnd - ef.mxStart);

  // Vy: start value + cumulative distributed load in Y (dV/dx = q convention)
  let Vy = ef.vyStart;
  for (const dl of ef.distributedLoadsY) {
    if (x > dl.a + 1e-10) {
      const xEnd = Math.min(x, dl.b);
      const s = xEnd - dl.a;
      const span = dl.b - dl.a;
      if (span < 1e-12 || s < 1e-12) continue;
      const dq = (dl.qJ - dl.qI) / span;
      // ∫_0^s (qI + dq·u) du = qI·s + dq·s²/2
      Vy += dl.qI * s + dq * s * s / 2;
    }
  }
  for (const pl of ef.pointLoadsY) {
    if (x > pl.a + 1e-10) Vy += pl.p;
  }

  // Mz: start value - integral of Vy
  let Mz = ef.mzStart - ef.vyStart * x;
  for (const dl of ef.distributedLoadsY) {
    if (x > dl.a + 1e-10) {
      const xEnd = Math.min(x, dl.b);
      const s = xEnd - dl.a;
      const span = dl.b - dl.a;
      if (span < 1e-12 || s < 1e-12) continue;
      const dq = (dl.qJ - dl.qI) / span;
      const d = x - dl.a;
      Mz -= dl.qI * (d * s - s * s / 2) + dq * (d * s * s / 2 - s * s * s / 3);
    }
  }
  for (const pl of ef.pointLoadsY) {
    if (x > pl.a + 1e-10) Mz -= pl.p * (x - pl.a);
  }

  // Vz: start value + cumulative distributed load in Z (dV/dx = q convention)
  let Vz = ef.vzStart;
  for (const dl of ef.distributedLoadsZ) {
    if (x > dl.a + 1e-10) {
      const xEnd = Math.min(x, dl.b);
      const s = xEnd - dl.a;
      const span = dl.b - dl.a;
      if (span < 1e-12 || s < 1e-12) continue;
      const dq = (dl.qJ - dl.qI) / span;
      Vz += dl.qI * s + dq * s * s / 2;
    }
  }
  for (const pl of ef.pointLoadsZ) {
    if (x > pl.a + 1e-10) Vz += pl.p;
  }

  // My: positive signs because θy = -dw/dx inverts the relation → dMy/dx = +Vz
  // This matches the convention in diagrams-3d.ts:
  //   My(x) = myStart + vzStart·x + Σ distributed + Σ point loads
  let My = ef.myStart + ef.vzStart * x;
  for (const dl of ef.distributedLoadsZ) {
    if (x > dl.a + 1e-10) {
      const xEnd = Math.min(x, dl.b);
      const s = xEnd - dl.a;
      const span = dl.b - dl.a;
      if (span < 1e-12 || s < 1e-12) continue;
      const dq = (dl.qJ - dl.qI) / span;
      const d = x - dl.a;
      My += dl.qI * (d * s - s * s / 2) + dq * (d * s * s / 2 - s * s * s / 3);
    }
  }
  for (const pl of ef.pointLoadsZ) {
    if (x > pl.a + 1e-10) My += pl.p * (x - pl.a);
  }

  return { N, Vy, Vz, Mx, My, Mz };
}

// ─── Sampling positions ──────────────────────────────────────────────

const NUM_POINTS = 31;

function buildSamplingY(rs: ResolvedSection): number[] {
  const halfH = rs.h / 2;
  const eps = rs.h * 0.001;
  const yMin = rs.yMin;
  const yMax = rs.yMax;
  const span = yMax - yMin;
  const positions: number[] = [];
  for (let i = 0; i < NUM_POINTS; i++) {
    positions.push(yMin + (i / (NUM_POINTS - 1)) * span);
  }
  // Junction points for I/H/U
  if ((rs.shape === 'I' || rs.shape === 'H' || rs.shape === 'U') && rs.tf > 0) {
    const yJ = halfH - rs.tf;
    positions.push(yJ + eps, yJ - eps, -yJ + eps, -yJ - eps);
  }
  if (rs.shape === 'RHS' && rs.t > 0) {
    const yI = halfH - rs.t;
    positions.push(yI + eps, yI - eps, -yI + eps, -yI - eps);
  }
  positions.sort((a, b) => a - b);
  return positions;
}

function buildSamplingZ(rs: ResolvedSection): number[] {
  const halfB = rs.b / 2;
  const positions: number[] = [];
  for (let i = 0; i < NUM_POINTS; i++) {
    positions.push(-halfB + (i / (NUM_POINTS - 1)) * rs.b);
  }
  positions.sort((a, b) => a - b);
  return positions;
}

// ─── Full detailed analysis ──────────────────────────────────────────

/**
 * Full 3D section stress analysis at position t along element.
 * Computes biaxial normal stress, Jourawsky shear in both axes,
 * torsion shear, neutral axis, Mohr's circle, and failure check.
 */
export function analyzeSectionStress3D(
  ef: ElementForces3D,
  sec: Section,
  fy: number | undefined,
  t: number,
  yFiber?: number,
  zFiber?: number,
): SectionStressResult3D {
  // Interpolate forces at position t
  const { N, Vy, Vz, Mx, My, Mz } = interpolateForces3D(ef, t);

  // Resolve section geometry
  const resolved = resolveSectionGeometry(sec);
  const halfH = resolved.h / 2;
  const halfB = resolved.b / 2;

  // Iy in Navier notation = inertia for Mz·z term = about Z vertical = resolved.iz
  const Iy = resolved.iz;
  const J = resolved.j;

  // Default fibers: extreme
  const yF = yFiber ?? halfH;
  const zF = zFiber ?? 0;

  // ── Distributions along Y axis (z=0 cut) ──
  const yPositions = buildSamplingY(resolved);
  const distributionY: StressPoint3D[] = yPositions.map(y => {
    const sigma = normalStress3D(N, Mz, My, resolved.a, resolved.iy, Iy, y, 0);
    const tauVy = shearStress(Vy, y, resolved); // reuse 2D Jourawsky for strong axis
    const tauVz = 0; // at z=0, weak-axis shear contribution is max Q but also depends on cut
    const tauT = torsionShearStress(Mx, resolved, J);
    const tTotal = Math.sqrt(tauVy * tauVy + tauVz * tauVz + tauT * tauT);
    const vm = Math.sqrt(sigma * sigma + 3 * tTotal * tTotal);
    return { y, z: 0, sigma, tauVy, tauVz, tauT, vonMises: vm };
  });

  // ── Distributions along Z axis (y=0 cut) ──
  const zPositions = buildSamplingZ(resolved);
  const distributionZ: StressPoint3D[] = zPositions.map(z => {
    const sigma = normalStress3D(N, Mz, My, resolved.a, resolved.iy, Iy, 0, z);
    const tauVy = 0; // at y=0, Vy shear is maximum but for z-axis scan we show Vz contribution
    const tauVz = shearStressWeakAxis(Vz, z, resolved, Iy);
    const tauT = torsionShearStress(Mx, resolved, J);
    const tTotal = Math.sqrt(tauVy * tauVy + tauVz * tauVz + tauT * tauT);
    const vm = Math.sqrt(sigma * sigma + 3 * tTotal * tTotal);
    return { y: 0, z, sigma, tauVy, tauVz, tauT, vonMises: vm };
  });

  // ── Stresses at selected fiber (yF, zF) ──
  const sigmaAtFiber = normalStress3D(N, Mz, My, resolved.a, resolved.iy, Iy, yF, zF);
  const tauVyAtFiber = shearStress(Vy, yF, resolved);
  const tauVzAtFiber = shearStressWeakAxis(Vz, zF, resolved, Iy);
  const tauTorsion = torsionShearStress(Mx, resolved, J);
  const tauTotal = Math.sqrt(tauVyAtFiber ** 2 + tauVzAtFiber ** 2 + tauTorsion ** 2);

  // ── Neutral axis ──
  const neutralAxis = computeNeutralAxis(N, Mz, My, resolved.a, resolved.iy, Iy);

  // ── Mohr's circle (plane stress: σ_x vs τ_total) ──
  const mohr = computeMohrCircle(sigmaAtFiber, tauTotal);

  // ── Failure check ──
  const fyMPa = fy ?? undefined;
  const failure = checkFailure(sigmaAtFiber, tauTotal, fyMPa);

  return {
    N, Vy, Vz, Mx, My, Mz,
    resolved,
    Iz: Iy,
    distributionY,
    distributionZ,
    sigmaAtFiber,
    tauVyAtFiber,
    tauVzAtFiber,
    tauTorsion,
    tauTotal,
    neutralAxis,
    mohr,
    failure,
  };
}

/**
 * Biaxial stress analysis from raw internal forces (no ElementForces3D needed).
 * Used for 2D sections with rotation: M and V are decomposed by the caller
 * into biaxial components (My, Mz, Vy, Vz) before calling this.
 */
export function analyzeSectionStressFromForces(
  N: number, Vy: number, Vz: number, Mx: number, My: number, Mz: number,
  sec: Section,
  fy: number | undefined,
  yFiber?: number,
  zFiber?: number,
): SectionStressResult3D {
  const resolved = resolveSectionGeometry(sec);
  const halfH = resolved.h / 2;
  const halfB = resolved.b / 2;

  const Iy = resolved.iz; // Navier Iy = about Z vertical = resolved.iz
  const J = resolved.j;

  const yF = yFiber ?? halfH;
  const zF = zFiber ?? 0;

  // ── Distributions along Y axis (z=0 cut) ──
  const yPositions = buildSamplingY(resolved);
  const distributionY: StressPoint3D[] = yPositions.map(y => {
    const sigma = normalStress3D(N, Mz, My, resolved.a, resolved.iy, Iy, y, 0);
    const tauVy = shearStress(Vy, y, resolved);
    const tauVz = 0;
    const tauT = torsionShearStress(Mx, resolved, J);
    const tTotal = Math.sqrt(tauVy * tauVy + tauVz * tauVz + tauT * tauT);
    const vm = Math.sqrt(sigma * sigma + 3 * tTotal * tTotal);
    return { y, z: 0, sigma, tauVy, tauVz, tauT, vonMises: vm };
  });

  // ── Distributions along Z axis (y=0 cut) ──
  const zPositions = buildSamplingZ(resolved);
  const distributionZ: StressPoint3D[] = zPositions.map(z => {
    const sigma = normalStress3D(N, Mz, My, resolved.a, resolved.iy, Iy, 0, z);
    const tauVy = 0;
    const tauVz = shearStressWeakAxis(Vz, z, resolved, Iy);
    const tauT = torsionShearStress(Mx, resolved, J);
    const tTotal = Math.sqrt(tauVy * tauVy + tauVz * tauVz + tauT * tauT);
    const vm = Math.sqrt(sigma * sigma + 3 * tTotal * tTotal);
    return { y: 0, z, sigma, tauVy, tauVz, tauT, vonMises: vm };
  });

  // ── Stresses at selected fiber (yF, zF) ──
  const sigmaAtFiber = normalStress3D(N, Mz, My, resolved.a, resolved.iy, Iy, yF, zF);
  const tauVyAtFiber = shearStress(Vy, yF, resolved);
  const tauVzAtFiber = shearStressWeakAxis(Vz, zF, resolved, Iy);
  const tauTorsion = torsionShearStress(Mx, resolved, J);
  const tauTotal = Math.sqrt(tauVyAtFiber ** 2 + tauVzAtFiber ** 2 + tauTorsion ** 2);

  // ── Neutral axis ──
  const neutralAxis = computeNeutralAxis(N, Mz, My, resolved.a, resolved.iy, Iy);

  // ── Mohr's circle ──
  const mohr = computeMohrCircle(sigmaAtFiber, tauTotal);

  // ── Failure check ──
  const failure = checkFailure(sigmaAtFiber, tauTotal, fy ?? undefined);

  return {
    N, Vy, Vz, Mx, My, Mz,
    resolved,
    Iz: Iy,
    distributionY,
    distributionZ,
    sigmaAtFiber,
    tauVyAtFiber,
    tauVzAtFiber,
    tauTorsion,
    tauTotal,
    neutralAxis,
    mohr,
    failure,
  };
}

/**
 * Suggest critical sections along a 3D element.
 * Returns positions where stresses are likely maximum.
 */
export function suggestCriticalSections3D(ef: ElementForces3D): Array<{ t: number; reason: string }> {
  const sections: Array<{ t: number; reason: string }> = [];

  // Start and end
  sections.push({ t: 0, reason: t('stress.endI') });
  sections.push({ t: 1, reason: t('stress.endJ') });

  // Midspan
  sections.push({ t: 0.5, reason: t('stress.midspan') });

  // Where Vy = 0 (max Mz)
  if (Math.abs(ef.vyStart) > 1e-6 && Math.abs(ef.vyEnd) > 1e-6 && ef.vyStart * ef.vyEnd < 0) {
    const tVy0 = ef.vyStart / (ef.vyStart - ef.vyEnd);
    if (tVy0 > 0.01 && tVy0 < 0.99) {
      sections.push({ t: tVy0, reason: 'Vy=0 (Mz max)' });
    }
  }

  // Where Vz = 0 (max My)
  if (Math.abs(ef.vzStart) > 1e-6 && Math.abs(ef.vzEnd) > 1e-6 && ef.vzStart * ef.vzEnd < 0) {
    const tVz0 = ef.vzStart / (ef.vzStart - ef.vzEnd);
    if (tVz0 > 0.01 && tVz0 < 0.99) {
      sections.push({ t: tVz0, reason: 'Vz=0 (My max)' });
    }
  }

  // Point load positions
  for (const pl of ef.pointLoadsY) {
    const tp = pl.a / ef.length;
    if (tp > 0.01 && tp < 0.99) {
      sections.push({ t: tp, reason: t('stress.pointLoadY') });
    }
  }
  for (const pl of ef.pointLoadsZ) {
    const tp = pl.a / ef.length;
    if (tp > 0.01 && tp < 0.99) {
      sections.push({ t: tp, reason: t('stress.pointLoadZ') });
    }
  }

  // Deduplicate by proximity
  sections.sort((a, b) => a.t - b.t);
  const deduped: typeof sections = [];
  for (const s of sections) {
    if (deduped.length === 0 || Math.abs(s.t - deduped[deduped.length - 1].t) > 0.02) {
      deduped.push(s);
    }
  }
  return deduped;
}
