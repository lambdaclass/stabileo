/**
 * The displaced shape of a member between its nodes, and its deflection relative to the chord.
 *
 * ── The shape ─────────────────────────────────────────────────────
 *
 * The solver returns displacements at the nodes. Along a member the transverse displacement is
 * the Hermite cubic of the end displacements and rotations, plus the fixed-fixed particular
 * solution of the span loads (zero displacement and rotation at both ends), with the end slopes
 * of a released end recovered from the other end and the loads:
 *
 *   Local Y plane: v(ξ) = Hermite(vI, θzI, vJ, θzJ) + v_p(x)
 *   Local Z plane: w(ξ) = Hermite(wI, −θyI, wJ, −θyJ) + w_p(x)     (θy = −dw/dx)
 *   Axial:         u(ξ) = uI + ξ·(uJ − uI)
 *
 * This is the computation the deformed-shape drawing always did; it lived there, twice. It is
 * here so the drawing and the serviceability check read one curve.
 *
 * ── Relative to the chord ─────────────────────────────────────────
 *
 * The deflection a span limit (L/240, L/360…) is written for is the member's own bending: the
 * transverse distance from the displaced curve to the straight line joining its displaced ends.
 * A node's absolute displacement is not that number — a beam on columns that shorten, or on a
 * floor that sways, moves as a whole without bending, and a simply supported beam bends with
 * both ends at rest. The check used to read an absolute displacement, estimate the midspan with
 * 5·M·L²/(48·E·I) when the ends did not move, or — in the report — take the largest vertical
 * displacement of the whole model for every beam. See `ProVerificationTab.svelte` and
 * `pro-report-inputs.ts`.
 */

import { computeLocalAxes3D } from './local-axes-3d';
import { solverProperties } from '../section/state';
import type { Displacement3D, ElementForces3D } from './types-3d';
import type { Section } from '../store/model.svelte';

/** EI of both bending planes. */
export interface ElementEI {
  EIy: number;  // kN·m² — E·Iy for local-Z-plane bending
  EIz: number;  // kN·m² — E·Iz for local-Y-plane bending
}

/**
 * EI from a member's material and section — the SAME properties the solver is given.
 *
 * A geometry-backed section carries two sets: the catalogue's declared values and the ones its
 * canonical polygons actually have, and the solver input reads the canonical ones
 * (`solver-service.ts`, the 3D section map). The drawing read the declared `iy`, which on an
 * IPN 300 is 0.15 % off the solver's; the particular solution then disagreed with the nodal
 * rotations it is added to, and a simply supported beam's midspan deflection came out 0.12 %
 * high. Reading `solverProperties` here makes the curve exact again.
 */
export function eiOf(material: { e: number } | undefined, section: Section | undefined): ElementEI | undefined {
  if (!material || !section) return undefined;
  const E = material.e * 1000; // MPa → kN/m²
  const props = solverProperties(section);
  const Iy = props.source === 'canonical'
    ? props.iy
    : (section.iy ?? (section.b && section.h ? (section.b * section.h ** 3) / 12 : section.iz));
  const Iz = props.source === 'canonical' ? props.iz : section.iz;
  return { EIy: E * Iy, EIz: E * Iz };
}

type Pt = { x: number; y: number; z: number };
type DistLoad = { qI: number; qJ: number; a: number; b: number };
type PointLoad = { a: number; p: number };

/** v''_p at 0 and L for a point load P at aP: fixed-fixed curvature at the ends. */
function pointVpp(P: number, aP: number, L: number, EI: number): { vpp0: number; vppL: number } {
  const bP = L - aP;
  const L2 = L * L;
  return { vpp0: P * aP * bP * bP / (EI * L2), vppL: P * aP * aP * bP / (EI * L2) };
}

/** Simpson's rule over a partial load: its points and weights. */
function simpson(dl: DistLoad, visit: (xLoad: number, dP: number) => void) {
  const N = 20;
  const span = dl.b - dl.a;
  if (span < 1e-12) return;
  const h = span / N;
  for (let j = 0; j <= N; j++) {
    const t = j / N;
    const qAt = dl.qI + (dl.qJ - dl.qI) * t;
    const w = j === 0 || j === N ? h / 3 : j % 2 === 1 ? 4 * h / 3 : 2 * h / 3;
    const dP = qAt * w;
    if (Math.abs(dP) >= 1e-15) visit(dl.a + t * span, dP);
  }
}

const isFullLength = (dl: DistLoad, L: number) => dl.a < 1e-10 && Math.abs(dl.b - L) < 1e-10;

/** The particular solution's end curvatures, for every load in one plane. */
function particularVpp(dist: readonly DistLoad[], pts: readonly PointLoad[], L: number, EI: number) {
  let vpp0 = 0, vppL = 0;
  const L2 = L * L;
  for (const dl of dist) {
    if (isFullLength(dl, L)) {
      vpp0 += L2 * (4 * dl.qI + dl.qJ) / (60 * EI);
      vppL += L2 * (dl.qI + 4 * dl.qJ) / (60 * EI);
    } else {
      simpson(dl, (xl, dP) => { const r = pointVpp(dP, xl, L, EI); vpp0 += r.vpp0; vppL += r.vppL; });
    }
  }
  for (const pl of pts) { const r = pointVpp(pl.p, pl.a, L, EI); vpp0 += r.vpp0; vppL += r.vppL; }
  return { vpp0, vppL };
}

/** Fixed-fixed deflection of a point load P at a, at x. */
function pointDeflection(P: number, a: number, x: number, L: number, EI: number): number {
  const b = L - a, L3 = L * L * L;
  if (x <= a) return P * b * b * x * x * (3 * a * L - x * (3 * a + b)) / (6 * EI * L3);
  const Lmx = L - x;
  return P * a * a * Lmx * Lmx * (3 * b * L - Lmx * (3 * b + a)) / (6 * EI * L3);
}

/** The particular solution at x, for every load in one plane. */
function particular(x: number, dist: readonly DistLoad[], pts: readonly PointLoad[], L: number, EI: number): number {
  let vp = 0;
  for (const dl of dist) {
    if (isFullLength(dl, L)) {
      const Lmx = L - x;
      vp += x * x * Lmx * Lmx * (dl.qI / 24 + (dl.qJ - dl.qI) * (L + x) / (120 * L)) / EI;
    } else {
      simpson(dl, (xl, dP) => { vp += pointDeflection(dP, xl, x, L, EI); });
    }
  }
  for (const pl of pts) vp += pointDeflection(pl.p, pl.a, x, L, EI);
  return vp;
}

/** A member's displaced curve in its local axes, sampled from I to J. */
export interface LocalCurve {
  L: number;
  ex: readonly number[]; ey: readonly number[]; ez: readonly number[];
  /** ξ ∈ [0, 1] of each sample. */
  xi: number[];
  /** Local axial, and transverse in the local Y and Z planes, at each sample (m). */
  u: number[]; v: number[]; w: number[];
}

/**
 * The displaced curve of one member.
 *
 * Without EI or forces there is no particular solution and no release correction: the curve is
 * the Hermite cubic of the nodal values alone — what "quick" asks for.
 */
export function memberLocalCurve(
  nodeI: Pt, nodeJ: Pt, dispI: Displacement3D, dispJ: Displacement3D,
  ef: ElementForces3D | undefined, ei: ElementEI | undefined,
  localY?: Pt, rollAngle?: number, leftHand?: boolean, segments = 20,
): LocalCurve | null {
  let axes;
  try {
    axes = computeLocalAxes3D({ id: 0, ...nodeI }, { id: 1, ...nodeJ }, localY, rollAngle, leftHand);
  } catch {
    return null; // zero length
  }
  const { L, ex, ey, ez } = axes;
  const dot = (a: readonly number[], x: number, y: number, z: number) => a[0]! * x + a[1]! * y + a[2]! * z;

  const uI = dot(ex, dispI.ux, dispI.uy, dispI.uz), uJ = dot(ex, dispJ.ux, dispJ.uy, dispJ.uz);
  const vI = dot(ey, dispI.ux, dispI.uy, dispI.uz), vJ = dot(ey, dispJ.ux, dispJ.uy, dispJ.uz);
  const wI = dot(ez, dispI.ux, dispI.uy, dispI.uz), wJ = dot(ez, dispJ.ux, dispJ.uy, dispJ.uz);
  const thYI = dot(ey, dispI.rx, dispI.ry, dispI.rz), thYJ = dot(ey, dispJ.rx, dispJ.ry, dispJ.rz);
  const thZI = dot(ez, dispI.rx, dispI.ry, dispI.rz), thZJ = dot(ez, dispJ.rx, dispJ.ry, dispJ.rz);

  // ── Local Y plane (Mz) ──
  const EIz = ei?.EIz;
  const yLoads = !!(ef && EIz && EIz > 0 && (ef.distributedLoadsY.length > 0 || ef.pointLoadsY.length > 0));
  const vppY = yLoads ? particularVpp(ef!.distributedLoadsY, ef!.pointLoadsY, L, EIz!) : { vpp0: 0, vppL: 0 };
  let sYI = thZI, sYJ = thZJ;
  const dv = vJ - vI;
  if (ef?.releaseMzStart && ef.releaseMzEnd) {
    sYI = dv / L + L * vppY.vpp0 / 3 + L * vppY.vppL / 6;
    sYJ = dv / L - L * vppY.vpp0 / 6 - L * vppY.vppL / 3;
  } else if (ef?.releaseMzStart) {
    sYI = 3 * dv / (2 * L) - thZJ / 2 + L * vppY.vpp0 / 4;
  } else if (ef?.releaseMzEnd) {
    sYJ = 3 * dv / (2 * L) - thZI / 2 - L * vppY.vppL / 4;
  }

  // ── Local Z plane (My); the slope is −θy ──
  const EIy = ei?.EIy;
  const zLoads = !!(ef && EIy && EIy > 0 && (ef.distributedLoadsZ.length > 0 || ef.pointLoadsZ.length > 0));
  const vppZ = zLoads ? particularVpp(ef!.distributedLoadsZ, ef!.pointLoadsZ, L, EIy!) : { vpp0: 0, vppL: 0 };
  let sZI = -thYI, sZJ = -thYJ;
  const dw = wJ - wI;
  if (ef?.releaseMyStart && ef.releaseMyEnd) {
    sZI = dw / L + L * vppZ.vpp0 / 3 + L * vppZ.vppL / 6;
    sZJ = dw / L - L * vppZ.vpp0 / 6 - L * vppZ.vppL / 3;
  } else if (ef?.releaseMyStart) {
    sZI = 3 * dw / (2 * L) + thYJ / 2 + L * vppZ.vpp0 / 4;
  } else if (ef?.releaseMyEnd) {
    sZJ = 3 * dw / (2 * L) + thYI / 2 - L * vppZ.vppL / 4;
  }

  const out: LocalCurve = { L, ex, ey, ez, xi: [], u: [], v: [], w: [] };
  for (let i = 0; i <= segments; i++) {
    const xi = i / segments, x = xi * L, xi2 = xi * xi, xi3 = xi2 * xi;
    const N1 = 1 - 3 * xi2 + 2 * xi3, N2 = (xi - 2 * xi2 + xi3) * L, N3 = 3 * xi2 - 2 * xi3, N4 = (-xi2 + xi3) * L;
    let v = N1 * vI + N2 * sYI + N3 * vJ + N4 * sYJ;
    if (yLoads) v += particular(x, ef!.distributedLoadsY, ef!.pointLoadsY, L, EIz!);
    let w = N1 * wI + N2 * sZI + N3 * wJ + N4 * sZJ;
    if (zLoads) w += particular(x, ef!.distributedLoadsZ, ef!.pointLoadsZ, L, EIy!);
    out.xi.push(xi);
    out.u.push(uI + xi * (uJ - uI));
    out.v.push(v);
    out.w.push(w);
  }
  return out;
}

/** The largest deflection of a member relative to its chord. */
export interface ChordDeflection {
  L: number;
  /** Largest resultant √(v_rel² + w_rel²), and where (m from I). */
  max: number; x: number;
  /** The two local planes on their own: largest |v_rel| and |w_rel|, and where. */
  maxV: number; xV: number; maxW: number; xW: number;
}

/**
 * The deflection of a curve relative to the chord of its displaced ends.
 *
 * The largest sampled value is refined with the parabola through it and its neighbours, so the
 * peak between two samples is not missed by the sampling.
 */
export function chordDeflection(c: LocalCurve): ChordDeflection {
  const n = c.xi.length;
  const rel = (arr: number[], i: number) => arr[i]! - (arr[0]! + c.xi[i]! * (arr[n - 1]! - arr[0]!));
  const vr = c.xi.map((_, i) => rel(c.v, i));
  const wr = c.xi.map((_, i) => rel(c.w, i));
  const res = vr.map((v, i) => Math.hypot(v, wr[i]!));
  const peak = (a: number[]) => {
    let k = 0;
    for (let i = 1; i < n; i++) if (Math.abs(a[i]!) > Math.abs(a[k]!)) k = i;
    let value = Math.abs(a[k]!), xi = c.xi[k]!;
    if (k > 0 && k < n - 1) {
      // The parabola through the three samples, which need not be evenly spaced: a span of
      // several elements is sampled per element.
      const x0 = c.xi[k - 1]! - xi, x2 = c.xi[k + 1]! - xi;
      const y0 = Math.abs(a[k - 1]!) - value, y2 = Math.abs(a[k + 1]!) - value;
      // y = A·x² + B·x through (x0, y0), (0, 0), (x2, y2).
      const A = (y2 / x2 - y0 / x0) / (x2 - x0);
      const B = y0 / x0 - A * x0;
      if (A < 0) {
        const d = Math.min(Math.max(-B / (2 * A), x0), x2);
        value += A * d * d + B * d;
        xi += d;
      }
    }
    return { value, x: xi * c.L };
  };
  const r = peak(res), pv = peak(vr), pw = peak(wr);
  return { L: c.L, max: r.value, x: r.x, maxV: pv.value, xV: pv.x, maxW: pw.value, xW: pw.x };
}
