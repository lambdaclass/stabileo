/**
 * TEST ORACLE. Not imported by the app.
 *
 * The TypeScript section-stress analysis that `section-stress.ts` and `section-stress-3d.ts` used
 * to run whenever the engine was not loaded, silently. The app now asks only the engine
 * (`postprocess/section_stress.rs`, `section_stress_3d.rs`) and says "engine not available"
 * otherwise. This copy stays as an independent statement of the formulas: the TS unit tests pin
 * it against hand values, and `section-stress-engine.test.ts` compares the engine with it.
 */
import type { Section } from '../../../store/model.svelte';
import type { ElementForces, } from '../../types';
import type { ElementForces3D } from '../../types-3d';
import {
  resolveSectionGeometryLegacy,
  computeMohrCircle,
  checkFailure,
  shearStress,
  normalStress,
  computeStressDistribution,
  type ResolvedSection,
  type SectionStressResult,
} from '../../section-stress';
import { computeDiagramValueAt } from '../../diagrams';
import {
  normalStress3D,
  interpolateForces3D,
  type NeutralAxisInfo,
  type SectionStressResult3D,
  type StressPoint3D,
} from '../../section-stress-3d';

/**
 * Compute Q_y(z) and width h_w(z) for weak-axis (over-the-width) shear.
 * This is the "transposed" version of computeQandB from section-stress.ts.
 * In the PR [12] convention this carries the lateral shear Vy (paired with Mz / width bending).
 * For I/H sections the lateral shear is resisted primarily by the flanges.
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
      // Same derivation as the CHS case of computeQandB in section-stress.ts,
      // with z in place of y — a circle is axisymmetric, so the two copies
      // must agree, and section-stress-3d.test.ts pins that they do. A
      // vertical cut at z severs TWO walls, width = 2t, and Q is the first
      // moment of the WHOLE area beyond the cut:
      //   Q(z) = 2·t·R·√(R²−z²)  →  τ(z) = V·R·√(R²−z²)/I, τ_max = 2V/A.
      // (The old Q = t·(R²−z²) was the one-sided moment against the two-sided
      // width: half the magnitude and the wrong, parabolic, shape.)
      // t = 0 reads as a SOLID round bar: Q(z) = (2/3)·(R²−z²)^{3/2} over the
      // chord 2·√(R²−z²), so τ(z) = V·(R²−z²)/(3·I) and τ_max = 4V/3A.
      const R = rs.h / 2;
      if (Math.abs(z) >= R) return { Q: 0, width: rs.t > 0 ? rs.t : R };
      if (rs.t > 0) {
        const Q = 2 * rs.t * R * Math.sqrt(R * R - z * z);
        return { Q, width: 2 * rs.t };
      }
      const chord = Math.sqrt(R * R - z * z);
      const Q = (2 / 3) * (R * R - z * z) * chord;
      return { Q, width: 2 * chord };
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
 * Weak-axis (over-the-width) shear stress at fiber z.
 * τ(z) = V · Q_y(z) / (I · width(z))
 * In the PR [12] convention this is fed the lateral shear Vy with I = Iz (weak axis).
 */
function shearStressWeakAxis(
  V: number, z: number, rs: ResolvedSection, I: number,
): number {
  if (I < 1e-15) return 0;
  const { Q, width } = computeQyAndWidth(z, rs);
  if (width < 1e-12) return 0;
  return (V * Q) / (I * width) / 1000; // MPa
}

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

/**
 * Compute the combined neutral axis for biaxial bending + axial (PR [12] convention).
 * σ(y,z) = 0 → N/A − My·y/Iy + Mz·z/Iz = 0
 * (y = depth/vertical, z = width/lateral)
 *
 * When My ≠ 0 (depth bending present): y = (N·Iy)/(A·My) + (Mz·Iy)/(Iz·My)·z
 * When My = 0, Mz ≠ 0: z = −(N·Iz)/(A·Mz)  (vertical line in the width)
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
    const intercept = A > 1e-15 ? (N * Iy) / (A * My) : 0;
    const slope = hasMz && Iz > 1e-20 ? (Mz * Iy) / (Iz * My) : 0;
    const angle = Math.atan(slope);
    return { exists: true, slope, intercept, angle };
  }

  // My = 0, Mz ≠ 0: neutral axis is vertical (z = const)
  // Mz·z/Iz = -N/A → z = -(N·Iz)/(A·Mz)
  const zIntercept = A > 1e-15 ? -(N * Iz) / (A * Mz) : 0;
  return { exists: true, slope: Infinity, intercept: zIntercept, angle: Math.PI / 2 };
}

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

/** The biaxial analysis from forces, in TypeScript: what the 3D panel used to compute without the engine. */
export function analyzeSectionStressFromForcesOracle(
  N: number, Vy: number, Vz: number, Mx: number, My: number, Mz: number,
  sec: Section,
  fy: number | undefined,
  yFiber?: number,
  zFiber?: number,
): SectionStressResult3D {
  const resolved = resolveSectionGeometryLegacy(sec);
  const halfH = resolved.h / 2;

  const Iz = resolved.iz;
  const Iy = resolved.iy;
  const J = resolved.j;

  const yF = yFiber ?? halfH;
  const zF = zFiber ?? 0;

  const yPositions = buildSamplingY(resolved);
  // distributionY = cut along the DEPTH (y, ±h/2). The shear physically present on this cut
  // is the vertical shear Vz (paired with My / depth bending), via the strong-axis Jourawski.
  const distributionY: StressPoint3D[] = yPositions.map(y => {
    const sigma = normalStress3D(N, Mz, My, resolved.a, Iz, Iy, y, 0);
    const tauVy = 0;
    const tauVz = shearStress(Vz, y, resolved); // strong-axis Jourawski over depth (uses rs.iy)
    const tauT = torsionShearStress(Mx, resolved, J);
    const tTotal = Math.sqrt(tauVy * tauVy + tauVz * tauVz + tauT * tauT);
    const vm = Math.sqrt(sigma * sigma + 3 * tTotal * tTotal);
    return { y, z: 0, sigma, tauVy, tauVz, tauT, vonMises: vm };
  });

  const zPositions = buildSamplingZ(resolved);
  // distributionZ = cut along the WIDTH (z, ±b/2). The shear here is the lateral shear Vy
  // (paired with Mz / width bending), via the weak-axis Jourawski (uses Iz).
  const distributionZ: StressPoint3D[] = zPositions.map(z => {
    const sigma = normalStress3D(N, Mz, My, resolved.a, Iz, Iy, 0, z);
    const tauVy = shearStressWeakAxis(Vy, z, resolved, Iz); // weak-axis Jourawski over width
    const tauVz = 0;
    const tauT = torsionShearStress(Mx, resolved, J);
    const tTotal = Math.sqrt(tauVy * tauVy + tauVz * tauVz + tauT * tauT);
    const vm = Math.sqrt(sigma * sigma + 3 * tTotal * tTotal);
    return { y: 0, z, sigma, tauVy, tauVz, tauT, vonMises: vm };
  });

  const sigmaAtFiber = normalStress3D(N, Mz, My, resolved.a, Iz, Iy, yF, zF);
  const tauVyAtFiber = shearStressWeakAxis(Vy, zF, resolved, Iz); // from Vy, at width zF
  const tauVzAtFiber = shearStress(Vz, yF, resolved);            // from Vz, at depth yF
  const tauTorsion = torsionShearStress(Mx, resolved, J);
  const tauTotal = Math.sqrt(tauVyAtFiber ** 2 + tauVzAtFiber ** 2 + tauTorsion ** 2);

  const neutralAxis = computeNeutralAxis(N, Mz, My, resolved.a, Iz, Iy);

  const mohr = computeMohrCircle(sigmaAtFiber, tauTotal);
  const failure = checkFailure(sigmaAtFiber, tauTotal, fy ?? undefined);

  return {
    N, Vy, Vz, Mx, My, Mz,
    resolved,
    Iz,
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

/** `analyzeSectionStress3D` as the TypeScript fallback computed it. */
export function analyzeSectionStress3DOracle(
  ef: ElementForces3D,
  sec: Section,
  fy: number | undefined,
  t: number,
  yFiber?: number,
  zFiber?: number,
): SectionStressResult3D {
  const { N, Vy, Vz, Mx, My, Mz } = interpolateForces3D(ef, t);
  return analyzeSectionStressFromForcesOracle(N, Vy, Vz, Mx, My, Mz, sec, fy, yFiber, zFiber);
}

/** `analyzeSectionStress` (2D) as the TypeScript fallback computed it. */
export function analyzeSectionStressOracle(
  ef: ElementForces,
  sec: Section,
  fy: number | undefined,
  t: number,
  yFiber?: number,
): SectionStressResult {
  const N = computeDiagramValueAt('axial', t, ef);
  const V = computeDiagramValueAt('shear', t, ef);
  const M = computeDiagramValueAt('moment', t, ef);

  const resolved = resolveSectionGeometryLegacy(sec);
  const y = yFiber ?? resolved.h / 2;
  const distribution = computeStressDistribution(N, V, M, resolved);
  const sigmaAtY = normalStress(N, M, resolved.a, resolved.iy, y);
  const tauAtY = shearStress(V, y, resolved);
  const mohr = computeMohrCircle(sigmaAtY, tauAtY);
  const failure = checkFailure(sigmaAtY, tauAtY, fy);

  let neutralAxisY: number | null = null;
  if (Math.abs(M) > 1e-10 && resolved.a > 1e-15) {
    const yEN = -(N * resolved.iy) / (resolved.a * M);
    if (yEN >= resolved.yMin - 1e-6 && yEN <= resolved.yMax + 1e-6) {
      neutralAxisY = yEN;
    }
  }

  return { N, V, M, resolved, distribution, sigmaAtY, tauAtY, mohr, failure, neutralAxisY };
}
