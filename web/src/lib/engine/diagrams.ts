// Diagram calculation: M(x), V(x), N(x) along each element
// Given end forces and distributed load, compute intermediate values

export interface DiagramPoint {
  /** Position along element [0, 1] normalized */
  t: number;
  /** World coordinates */
  x: number;
  y: number;
  /** Value at this point */
  value: number;
}

export interface ElementDiagram {
  elementId: number;
  points: DiagramPoint[];
  maxValue: number;
  minValue: number;
  /** Position of max absolute value (for label) */
  maxAbsT: number;
  maxAbsValue: number;
}

const NUM_POINTS = 21; // number of sampling points per element

/**
 * Build sorted, unique sampling positions (as t ∈ [0,1]) including
 * regular grid points and positions just before/after each point load
 * to capture discontinuities.
 */
function buildSamplingPositions(
  length: number,
  pointLoads: Array<{ a: number; p: number; px?: number; mz?: number }>,
): number[] {
  const tSet = new Set<number>();

  // Regular grid
  for (let i = 0; i < NUM_POINTS; i++) {
    tSet.add(i / (NUM_POINTS - 1));
  }

  // Add positions around point loads
  const eps = 1e-6;
  for (const pl of pointLoads) {
    const tPl = pl.a / length;
    if (tPl > eps) tSet.add(tPl - eps);
    tSet.add(tPl);
    if (tPl < 1 - eps) tSet.add(tPl + eps);
  }

  return Array.from(tSet).sort((a, b) => a - b);
}

/**
 * Compute moment diagram M(x) along element
 *
 * The solver's vStart/mStart represent forces the element exerts on nodes
 * (opposite sign from standard internal forces). The equilibrium gives:
 *   dV_solver/dx = q
 *   dM_solver/dx = -V_solver
 *
 * Therefore: M(x) = mStart - vStart·x - q·x²/2
 * With point loads at positions a_i: M jumps in slope by -P at each a_i
 */
export function computeMomentDiagram(
  mStart: number, _mEnd: number,
  vStart: number, qI: number, qJ: number,
  length: number,
  nodeIx: number, nodeIy: number,
  nodeJx: number, nodeJy: number,
  pointLoads: Array<{ a: number; p: number; px?: number; mz?: number }> = [],
): ElementDiagram {
  const positions = buildSamplingPositions(length, pointLoads);

  const points: DiagramPoint[] = [];
  let maxVal = -Infinity, minVal = Infinity;
  let maxAbsT = 0, maxAbsValue = 0;

  const sortedPL = [...pointLoads].sort((a, b) => a.a - b.a);
  const dq = qJ - qI; // linear variation rate

  for (const t of positions) {
    const xi = t * length;

    // M(x) = mStart - vStart·x - qI·x²/2 - (qJ-qI)·x³/(6·L)
    let value = mStart - vStart * xi - qI * xi * xi / 2 - dq * xi * xi * xi / (6 * length);

    for (const pl of sortedPL) {
      if (pl.a < xi - 1e-10) {
        value -= pl.p * (xi - pl.a);
        // Concentrated moment: step in moment diagram
        if (pl.mz) value -= pl.mz;
      }
    }

    const x = nodeIx + t * (nodeJx - nodeIx);
    const y = nodeIy + t * (nodeJy - nodeIy);

    points.push({ t, x, y, value });

    if (value > maxVal) maxVal = value;
    if (value < minVal) minVal = value;
    if (Math.abs(value) > Math.abs(maxAbsValue)) {
      maxAbsT = t;
      maxAbsValue = value;
    }
  }

  return { elementId: 0, points, maxValue: maxVal, minValue: minVal, maxAbsT, maxAbsValue };
}

/**
 * Compute shear diagram V(x)
 * V(x) = V_i + q·x  (dV_solver/dx = q)
 * With point loads: V has a jump of -P at each position a_i
 */
export function computeShearDiagram(
  vStart: number, qI: number, qJ: number,
  length: number,
  nodeIx: number, nodeIy: number,
  nodeJx: number, nodeJy: number,
  pointLoads: Array<{ a: number; p: number; px?: number; mz?: number }> = [],
): ElementDiagram {
  const positions = buildSamplingPositions(length, pointLoads);

  const points: DiagramPoint[] = [];
  let maxVal = -Infinity, minVal = Infinity;
  let maxAbsT = 0, maxAbsValue = 0;

  const sortedPL = [...pointLoads].sort((a, b) => a.a - b.a);
  const dq = qJ - qI;

  for (const t of positions) {
    const xi = t * length;

    // V(x) = vStart + qI·x + (qJ-qI)·x²/(2·L)
    let value = vStart + qI * xi + dq * xi * xi / (2 * length);

    for (const pl of sortedPL) {
      if (pl.a < xi - 1e-10) {
        value += pl.p;
      }
    }

    const x = nodeIx + t * (nodeJx - nodeIx);
    const y = nodeIy + t * (nodeJy - nodeIy);

    points.push({ t, x, y, value });

    if (value > maxVal) maxVal = value;
    if (value < minVal) minVal = value;
    if (Math.abs(value) > Math.abs(maxAbsValue)) {
      maxAbsT = t;
      maxAbsValue = value;
    }
  }

  return { elementId: 0, points, maxValue: maxVal, minValue: minVal, maxAbsT, maxAbsValue };
}

/**
 * Compute axial force diagram N(x)
 * N(x) = N_start (constant, no distributed axial load)
 * With axial point loads (px): N has a jump of +px at each position a_i
 */
export function computeAxialDiagram(
  nStart: number, nEnd: number,
  length: number,
  nodeIx: number, nodeIy: number,
  nodeJx: number, nodeJy: number,
  pointLoads: Array<{ a: number; p: number; px?: number; mz?: number }> = [],
): ElementDiagram {
  // Check if there are any axial point loads
  const hasAxialPL = pointLoads.some(pl => pl.px && Math.abs(pl.px) > 1e-15);
  const positions = hasAxialPL ? buildSamplingPositions(length, pointLoads) :
    Array.from({ length: NUM_POINTS }, (_, i) => i / (NUM_POINTS - 1));

  const points: DiagramPoint[] = [];
  let maxVal = -Infinity, minVal = Infinity;
  let maxAbsT = 0, maxAbsValue = 0;

  const sortedPL = hasAxialPL ? [...pointLoads].filter(pl => pl.px && Math.abs(pl.px!) > 1e-15).sort((a, b) => a.a - b.a) : [];

  for (const t of positions) {
    const xi = t * length;
    // Linear interpolation between nStart and nEnd
    let value = nStart + t * (nEnd - nStart);

    // Add axial point load jumps
    for (const pl of sortedPL) {
      if (pl.a < xi - 1e-10) {
        value += pl.px!;
      }
    }

    const x = nodeIx + t * (nodeJx - nodeIx);
    const y = nodeIy + t * (nodeJy - nodeIy);

    points.push({ t, x, y, value });

    if (value > maxVal) maxVal = value;
    if (value < minVal) minVal = value;
    if (Math.abs(value) > Math.abs(maxAbsValue)) {
      maxAbsT = t;
      maxAbsValue = value;
    }
  }

  return { elementId: 0, points, maxValue: maxVal, minValue: minVal, maxAbsT, maxAbsValue };
}

/**
 * Compute the value of a diagram (M, V, or N) at a given normalized position t ∈ [0,1]
 */
export function computeDiagramValueAt(
  kind: 'moment' | 'shear' | 'axial',
  t: number,
  ef: { mStart: number; mEnd: number; vStart: number; vEnd: number; nStart: number; nEnd: number; qI: number; qJ: number; length: number; pointLoads?: Array<{ a: number; p: number; px?: number; mz?: number }>; distributedLoads?: Array<{ qI: number; qJ: number; a: number; b: number }> },
): number {
  const xi = t * ef.length;
  const sortedPL = [...(ef.pointLoads ?? [])].sort((a, b) => a.a - b.a);

  // Use distributedLoads array if available (supports partial loads), otherwise fall back to legacy qI/qJ
  const dLoads = ef.distributedLoads ?? (
    (Math.abs(ef.qI) > 1e-10 || Math.abs(ef.qJ) > 1e-10)
      ? [{ qI: ef.qI, qJ: ef.qJ, a: 0, b: ef.length }]
      : []
  );

  if (kind === 'moment') {
    let value = ef.mStart - ef.vStart * xi;
    // Distributed load contributions: -∫_a^min(xi,b) q(ξ)·(xi-ξ) dξ
    for (const dl of dLoads) {
      if (xi > dl.a + 1e-10) {
        const xEnd = Math.min(xi, dl.b);
        const s = xEnd - dl.a;
        const span = dl.b - dl.a;
        if (span < 1e-12 || s < 1e-12) continue;
        const dq = (dl.qJ - dl.qI) / span;
        const d = xi - dl.a;
        // ∫_0^s (qI + dq·u)·(d - u) du = qI·(d·s - s²/2) + dq·(d·s²/2 - s³/3)
        value -= dl.qI * (d * s - s * s / 2) + dq * (d * s * s / 2 - s * s * s / 3);
      }
    }
    for (const pl of sortedPL) {
      if (pl.a < xi - 1e-10) {
        value -= pl.p * (xi - pl.a);
        if (pl.mz) value -= pl.mz;
      }
    }
    return value;
  } else if (kind === 'shear') {
    let value = ef.vStart;
    // Distributed load contributions: ∫_a^min(xi,b) q(ξ) dξ
    for (const dl of dLoads) {
      if (xi > dl.a + 1e-10) {
        const xEnd = Math.min(xi, dl.b);
        const s = xEnd - dl.a;
        const span = dl.b - dl.a;
        if (span < 1e-12 || s < 1e-12) continue;
        const dq = (dl.qJ - dl.qI) / span;
        value += dl.qI * s + dq * s * s / 2;
      }
    }
    for (const pl of sortedPL) {
      if (pl.a < xi - 1e-10) {
        value += pl.p;
      }
    }
    return value;
  } else {
    let value = ef.nStart + t * (ef.nEnd - ef.nStart);
    for (const pl of sortedPL) {
      if (pl.px && pl.a < xi - 1e-10) {
        value += pl.px;
      }
    }
    return value;
  }
}

/**
 * Compute deformed shape points using Hermite cubic interpolation + particular solution.
 *
 * Shape functions:
 *   N1(ξ) = 1 - 3ξ² + 2ξ³,  N2(ξ) = (ξ - 2ξ² + ξ³)·L
 *   N3(ξ) = 3ξ² - 2ξ³,      N4(ξ) = (-ξ² + ξ³)·L
 *
 * The particular solution captures intra-element deflection from distributed
 * and point loads using fixed-fixed beam formulas (quartic correction with
 * v_p(0) = v_p(L) = v'_p(0) = v'_p(L) = 0).
 *
 * For hinged ends (M=0 → curvature=0), the element-end rotation is adjusted
 * so that v''_total = v''_Hermite + v''_particular = 0 at the hinge. This
 * accounts for the particular solution's nonzero curvature at the ends and
 * produces correct deflection curves for all boundary condition types:
 * fixed-fixed, pin-fixed, fixed-pin, and pin-pin (simply-supported).
 */
export function computeDeformedShape(
  nodeIx: number, nodeIy: number,
  nodeJx: number, nodeJy: number,
  uIx: number, uIy: number, rIz: number,
  uJx: number, uJy: number, rJz: number,
  scale: number,
  length: number,
  hingeStart: boolean = false,
  hingeEnd: boolean = false,
  /** EI in kN·m² — enables intra-element deflection from loads */
  EI?: number,
  /** Distributed load qI at node I (kN/m, local perpendicular) — legacy for full-length */
  loadQI?: number,
  /** Distributed load qJ at node J (kN/m, local perpendicular) — legacy for full-length */
  loadQJ?: number,
  /** Point loads on element [{a: distance from I (m), p: kN perpendicular}] */
  loadPoints?: Array<{ a: number; p: number }>,
  /** All distributed loads including partial (overrides loadQI/loadQJ when present) */
  distLoads?: Array<{ qI: number; qJ: number; a: number; b: number }>,
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const cos = (nodeJx - nodeIx) / length;
  const sin = (nodeJy - nodeIy) / length;

  // Transform displacements to local coordinates
  const vI = -uIx * sin + uIy * cos;
  const vJ = -uJx * sin + uJy * cos;
  const uI = uIx * cos + uIy * sin;
  const uJ = uJx * cos + uJy * sin;

  // ── Particular solution setup ──────────────────────────────────
  // The Hermite interpolation captures the cubic polynomial part
  // (from nodal displacements/rotations). When loads act between nodes,
  // the fixed-fixed particular solution adds the quartic correction
  // with v_p(0) = v_p(L) = v'_p(0) = v'_p(L) = 0.
  const L = length;
  const L2 = L * L;
  const L3 = L2 * L;
  const L4 = L3 * L;

  // Build list of distributed loads (new distLoads array or legacy loadQI/loadQJ)
  const allDistLoads: Array<{ qI: number; qJ: number; a: number; b: number }> = [];
  if (distLoads && distLoads.length > 0) {
    allDistLoads.push(...distLoads);
  } else {
    const q0 = loadQI ?? 0;
    const q1 = loadQJ ?? 0;
    if (Math.abs(q0) > 1e-10 || Math.abs(q1) > 1e-10) {
      allDistLoads.push({ qI: q0, qJ: q1, a: 0, b: L });
    }
  }
  const hasDistLoad = allDistLoads.length > 0;
  const hasPtLoads = loadPoints && loadPoints.length > 0;
  // Floor EI at 1e-6 kN·m² to prevent overflow in particular solution (q·L⁴/EI)
  const hasLoads = EI && EI > 1e-6 && (hasDistLoad || hasPtLoads);

  // Helper: compute v''_p(0) and v''_p(L) for a point load P at distance aP from node I
  const pointVpp = (P: number, aP: number) => {
    const bP = L - aP;
    return {
      vpp0: P * aP * bP * bP / (EI! * L2),
      vppL: P * aP * aP * bP / (EI! * L2),
    };
  };

  // Compute v''_p at x=0 and x=L for the fixed-fixed particular solution.
  let vpp_p0 = 0;
  let vpp_pL = 0;

  if (hasLoads) {
    for (const dl of allDistLoads) {
      const isFullLength = dl.a < 1e-10 && Math.abs(dl.b - L) < 1e-10;
      if (isFullLength) {
        // Exact analytical formula for full-length trapezoidal load
        vpp_p0 += L2 * (4 * dl.qI + dl.qJ) / (60 * EI!);
        vpp_pL += L2 * (dl.qI + 4 * dl.qJ) / (60 * EI!);
      } else {
        // Partial load: discretize into point loads via Simpson's rule
        const N = 20;
        const span = dl.b - dl.a;
        if (span < 1e-12) continue;
        const h = span / N;
        for (let j = 0; j <= N; j++) {
          const t = j / N;
          const xLoad = dl.a + t * span;
          const qAt = dl.qI + (dl.qJ - dl.qI) * t;
          let w: number;
          if (j === 0 || j === N) w = h / 3;
          else if (j % 2 === 1) w = 4 * h / 3;
          else w = 2 * h / 3;
          const dP = qAt * w;
          if (Math.abs(dP) < 1e-15) continue;
          const { vpp0, vppL } = pointVpp(dP, xLoad);
          vpp_p0 += vpp0;
          vpp_pL += vppL;
        }
      }
    }

    if (hasPtLoads) {
      for (const pl of loadPoints!) {
        const { vpp0, vppL } = pointVpp(pl.p, pl.a);
        vpp_p0 += vpp0;
        vpp_pL += vppL;
      }
    }
  }

  // Adjust local end rotations for hinges.
  // At a hinge, M = 0 → v''_total = v''_Hermite + v''_particular = 0.
  // The Hermite rotation must compensate for the particular solution's curvature.
  //
  // Hermite second derivatives at endpoints (dv = vJ - vI):
  //   v''_H(0) = (6dv - 4L·θI - 2L·θJ) / L²
  //   v''_H(L) = (-6dv + 2L·θI + 4L·θJ) / L²
  //
  // Hinge condition: v''_H(end) = -v''_p(end), giving:
  //   hingeStart: θI = 3dv/(2L) - θJ/2 + L·v''_p(0)/4
  //   hingeEnd:   θJ = 3dv/(2L) - θI/2 - L·v''_p(L)/4
  //   both hinges (simultaneous):
  //     θI = dv/L + L·v''_p(0)/3 + L·v''_p(L)/6
  //     θJ = dv/L - L·v''_p(0)/6 - L·v''_p(L)/3
  //
  // Without loads, v''_p = 0 and these reduce to the original formulas.
  let thetaI = rIz;
  let thetaJ = rJz;
  const dv = vJ - vI;

  if (hingeStart && hingeEnd) {
    thetaI = dv / L + L * vpp_p0 / 3 + L * vpp_pL / 6;
    thetaJ = dv / L - L * vpp_p0 / 6 - L * vpp_pL / 3;
  } else if (hingeStart) {
    thetaI = 3 * dv / (2 * L) - thetaJ / 2 + L * vpp_p0 / 4;
  } else if (hingeEnd) {
    thetaJ = 3 * dv / (2 * L) - thetaI / 2 - L * vpp_pL / 4;
  }

  const nPts = 21;
  for (let i = 0; i < nPts; i++) {
    const xi = i / (nPts - 1);
    const x = xi * L;
    const xi2 = xi * xi;
    const xi3 = xi2 * xi;

    // Hermite shape functions
    const N1 = 1 - 3 * xi2 + 2 * xi3;
    const N2 = (xi - 2 * xi2 + xi3) * L;
    const N3 = 3 * xi2 - 2 * xi3;
    const N4 = (-xi2 + xi3) * L;

    let vLocal = N1 * vI + N2 * thetaI + N3 * vJ + N4 * thetaJ;

    // Add particular solution (intra-element deflection from loads)
    if (hasLoads) {
      let vp = 0;

      if (hasDistLoad) {
        for (const dl of allDistLoads) {
          const isFullLength = dl.a < 1e-10 && Math.abs(dl.b - L) < 1e-10;
          if (isFullLength) {
            // Exact: Fixed-fixed beam under trapezoidal load q(x) = q0 + (q1-q0)·x/L
            const Lmx = L - x;
            const x2Lmx2 = x * x * Lmx * Lmx;
            vp += x2Lmx2 * (dl.qI / 24 + (dl.qJ - dl.qI) * (L + x) / (120 * L)) / EI!;
          } else {
            // Partial load: discretize into point loads via Simpson's rule
            const N = 20;
            const span = dl.b - dl.a;
            if (span < 1e-12) continue;
            const h = span / N;
            for (let j = 0; j <= N; j++) {
              const t = j / N;
              const xLoad = dl.a + t * span;
              const qAt = dl.qI + (dl.qJ - dl.qI) * t;
              let w: number;
              if (j === 0 || j === N) w = h / 3;
              else if (j % 2 === 1) w = 4 * h / 3;
              else w = 2 * h / 3;
              const dP = qAt * w;
              if (Math.abs(dP) < 1e-15) continue;
              const aP = xLoad, bP = L - xLoad;
              if (x <= xLoad) {
                vp += dP * bP * bP * x * x * (3 * aP * L - x * (3 * aP + bP)) / (6 * EI! * L3);
              } else {
                const Lmx = L - x;
                vp += dP * aP * aP * Lmx * Lmx * (3 * bP * L - Lmx * (3 * bP + aP)) / (6 * EI! * L3);
              }
            }
          }
        }
      }

      if (hasPtLoads) {
        for (const pl of loadPoints!) {
          const a = pl.a, P = pl.p, b = L - a;
          // Fixed-fixed beam with point load P at distance a:
          if (x <= a) {
            vp += P * b * b * x * x * (3 * a * L - x * (3 * a + b)) / (6 * EI! * L3);
          } else {
            const Lmx = L - x;
            vp += P * a * a * Lmx * Lmx * (3 * b * L - Lmx * (3 * b + a)) / (6 * EI! * L3);
          }
        }
      }

      vLocal += vp;
    }

    // Axial displacement (linear interpolation)
    const uLocal = uI + xi * (uJ - uI);

    // Transform back to global
    const baseX = nodeIx + xi * (nodeJx - nodeIx);
    const baseY = nodeIy + xi * (nodeJy - nodeIy);

    const dx = uLocal * cos - vLocal * sin;
    const dy = uLocal * sin + vLocal * cos;

    points.push({
      x: baseX + dx * scale,
      y: baseY + dy * scale,
    });
  }

  return points;
}

/**
 * Compute the actual displacement (ux, uy in metres) at parameter t ∈ [0,1]
 * along an element, using the same Hermite cubic + particular solution
 * as computeDeformedShape / drawDeformed.
 *
 * Unlike linear interpolation, this correctly captures mid-span deflection
 * even when both end-nodes have zero displacement (e.g. simply supported beam).
 */
export function computeDisplacementAt(
  t: number,
  nodeIx: number, nodeIy: number,
  nodeJx: number, nodeJy: number,
  uIx: number, uIy: number, rIz: number,
  uJx: number, uJy: number, rJz: number,
  length: number,
  hingeStart: boolean = false,
  hingeEnd: boolean = false,
  EI?: number,
  loadQI?: number,
  loadQJ?: number,
  loadPoints?: Array<{ a: number; p: number }>,
  distLoads?: Array<{ qI: number; qJ: number; a: number; b: number }>,
): { ux: number; uy: number } {
  const L = length;
  if (L < 1e-12) return { ux: uIx, uy: uIy };

  const cosA = (nodeJx - nodeIx) / L;
  const sinA = (nodeJy - nodeIy) / L;

  // Transform end displacements to local (axial u, transversal v)
  const vI = -uIx * sinA + uIy * cosA;
  const vJ = -uJx * sinA + uJy * cosA;
  const uI_loc = uIx * cosA + uIy * sinA;
  const uJ_loc = uJx * cosA + uJy * sinA;

  const L2 = L * L;
  const L3 = L2 * L;

  // ── Particular solution setup ──
  const allDistLoads: Array<{ qI: number; qJ: number; a: number; b: number }> = [];
  if (distLoads && distLoads.length > 0) {
    allDistLoads.push(...distLoads);
  } else {
    const q0 = loadQI ?? 0;
    const q1 = loadQJ ?? 0;
    if (Math.abs(q0) > 1e-10 || Math.abs(q1) > 1e-10) {
      allDistLoads.push({ qI: q0, qJ: q1, a: 0, b: L });
    }
  }
  const hasDistLoad = allDistLoads.length > 0;
  const hasPtLoads = loadPoints && loadPoints.length > 0;
  // Floor EI at 1e-6 kN·m² to prevent overflow in particular solution (q·L⁴/EI)
  const hasLoads = EI && EI > 1e-6 && (hasDistLoad || hasPtLoads);

  const pointVpp = (P: number, aP: number) => {
    const bP = L - aP;
    return {
      vpp0: P * aP * bP * bP / (EI! * L2),
      vppL: P * aP * aP * bP / (EI! * L2),
    };
  };

  let vpp_p0 = 0;
  let vpp_pL = 0;
  if (hasLoads) {
    for (const dl of allDistLoads) {
      const isFullLength = dl.a < 1e-10 && Math.abs(dl.b - L) < 1e-10;
      if (isFullLength) {
        vpp_p0 += L2 * (4 * dl.qI + dl.qJ) / (60 * EI!);
        vpp_pL += L2 * (dl.qI + 4 * dl.qJ) / (60 * EI!);
      } else {
        const N_SIMP = 20;
        const span = dl.b - dl.a;
        if (span < 1e-12) continue;
        const h = span / N_SIMP;
        for (let j = 0; j <= N_SIMP; j++) {
          const tt = j / N_SIMP;
          const xLoad = dl.a + tt * span;
          const qAt = dl.qI + (dl.qJ - dl.qI) * tt;
          let w: number;
          if (j === 0 || j === N_SIMP) w = h / 3;
          else if (j % 2 === 1) w = 4 * h / 3;
          else w = 2 * h / 3;
          const dP = qAt * w;
          if (Math.abs(dP) < 1e-15) continue;
          const { vpp0, vppL } = pointVpp(dP, xLoad);
          vpp_p0 += vpp0;
          vpp_pL += vppL;
        }
      }
    }
    if (hasPtLoads) {
      for (const pl of loadPoints!) {
        const { vpp0, vppL } = pointVpp(pl.p, pl.a);
        vpp_p0 += vpp0;
        vpp_pL += vppL;
      }
    }
  }

  // Adjust rotations for hinges
  let thetaI = rIz;
  let thetaJ = rJz;
  const dv = vJ - vI;

  if (hingeStart && hingeEnd) {
    thetaI = dv / L + L * vpp_p0 / 3 + L * vpp_pL / 6;
    thetaJ = dv / L - L * vpp_p0 / 6 - L * vpp_pL / 3;
  } else if (hingeStart) {
    thetaI = 3 * dv / (2 * L) - thetaJ / 2 + L * vpp_p0 / 4;
  } else if (hingeEnd) {
    thetaJ = 3 * dv / (2 * L) - thetaI / 2 - L * vpp_pL / 4;
  }

  // ── Evaluate at parameter t ──
  const xi = Math.max(0, Math.min(1, t));
  const x = xi * L;
  const xi2 = xi * xi;
  const xi3 = xi2 * xi;

  // Hermite shape functions
  const N1 = 1 - 3 * xi2 + 2 * xi3;
  const N2 = (xi - 2 * xi2 + xi3) * L;
  const N3 = 3 * xi2 - 2 * xi3;
  const N4 = (-xi2 + xi3) * L;

  let vLocal = N1 * vI + N2 * thetaI + N3 * vJ + N4 * thetaJ;

  // Add particular solution
  if (hasLoads) {
    let vp = 0;
    if (hasDistLoad) {
      for (const dl of allDistLoads) {
        const isFullLength = dl.a < 1e-10 && Math.abs(dl.b - L) < 1e-10;
        if (isFullLength) {
          const Lmx = L - x;
          const x2Lmx2 = x * x * Lmx * Lmx;
          vp += x2Lmx2 * (dl.qI / 24 + (dl.qJ - dl.qI) * (L + x) / (120 * L)) / EI!;
        } else {
          const N_SIMP = 20;
          const span = dl.b - dl.a;
          if (span < 1e-12) continue;
          const h = span / N_SIMP;
          for (let j = 0; j <= N_SIMP; j++) {
            const tt = j / N_SIMP;
            const xLoad = dl.a + tt * span;
            const qAt = dl.qI + (dl.qJ - dl.qI) * tt;
            let w: number;
            if (j === 0 || j === N_SIMP) w = h / 3;
            else if (j % 2 === 1) w = 4 * h / 3;
            else w = 2 * h / 3;
            const dP = qAt * w;
            if (Math.abs(dP) < 1e-15) continue;
            const aP = xLoad, bP = L - xLoad;
            if (x <= xLoad) {
              vp += dP * bP * bP * x * x * (3 * aP * L - x * (3 * aP + bP)) / (6 * EI! * L3);
            } else {
              const Lmx = L - x;
              vp += dP * aP * aP * Lmx * Lmx * (3 * bP * L - Lmx * (3 * bP + aP)) / (6 * EI! * L3);
            }
          }
        }
      }
    }
    if (hasPtLoads) {
      for (const pl of loadPoints!) {
        const a = pl.a, P = pl.p, b = L - a;
        if (x <= a) {
          vp += P * b * b * x * x * (3 * a * L - x * (3 * a + b)) / (6 * EI! * L3);
        } else {
          const Lmx = L - x;
          vp += P * a * a * Lmx * Lmx * (3 * b * L - Lmx * (3 * b + a)) / (6 * EI! * L3);
        }
      }
    }
    vLocal += vp;
  }

  // Axial (linear)
  const uLocal = uI_loc + xi * (uJ_loc - uI_loc);

  // Transform back to global
  const ux = uLocal * cosA - vLocal * sinA;
  const uy = uLocal * sinA + vLocal * cosA;

  return { ux, uy };
}
