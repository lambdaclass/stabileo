import { recoverMember } from './wasm-solver';
import { computeLocalAxes3D } from './local-axes-3d';
import { solverProperties } from '../section/state';
import { sectionShearAreas } from '../section/shear-areas';
import type { Displacement3D, ElementForces3D } from './types-3d';
import type { Section } from '../store/model.svelte';

/**
 * EI of both bending planes, and the shear stiffness G·As of each when the member is
 * shear-flexible (Timoshenko). The shear areas pair as the solver pairs them
 * (`section/shear-areas.ts`): As,y with Iy, As,z with Iz.
 */
export interface ElementEI {
  EIy: number;  // kN·m² — E·Iy for local-Z-plane bending
  EIz: number;  // kN·m² — E·Iz for local-Y-plane bending
  GAy?: number; // kN — G·As,y, the local-Z plane's shear stiffness (absent: no shear deformation)
  GAz?: number; // kN — G·As,z, the local-Y plane's shear stiffness
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
export function eiOf(
  material: { e: number; nu?: number } | undefined, section: Section | undefined,
  analysis?: { shearDeformation?: 'none' },
): ElementEI | undefined {
  if (!material || !section) return undefined;
  const E = material.e * 1000; // MPa → kN/m²
  const props = solverProperties(section);
  const Iy = props.source === 'canonical'
    ? props.iy
    : (section.iy ?? (section.b && section.h ? (section.b * section.h ** 3) / 12 : section.iz));
  const Iz = props.source === 'canonical' ? props.iz : section.iz;
  const out: ElementEI = { EIy: E * Iy, EIz: E * Iz };
  // The shear areas exactly when the 3D solve sends them (`solver-service.ts`, `shearOf`), with
  // its G = E / 2(1 + ν). The 2D solve never sends them, and reads no curve from here.
  const sa = analysis?.shearDeformation === 'none' ? null : sectionShearAreas(section);
  const nu = material.nu;
  if (sa && typeof nu === 'number' && Number.isFinite(nu)) {
    const G = E / (2 * (1 + nu));
    out.GAy = G * sa.asY;
    out.GAz = G * sa.asZ;
  }
  return out;
}

type Pt = { x: number; y: number; z: number };
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
 *
 * `segments`: that many equal segments, or the ξ ∈ [0, 1] to sample at, which a reading
 * relative to the chord needs to include 0 and 1.
 */
export function memberLocalCurve(
  nodeI: Pt, nodeJ: Pt, dispI: Displacement3D, dispJ: Displacement3D,
  ef: ElementForces3D | undefined, ei: ElementEI | undefined,
  localY?: Pt, rollAngle?: number, leftHand?: boolean, segments: number | readonly number[] = 20,
): LocalCurve | null {
  // A member of variable section: its pieces' own curves, each with its EI (`variable-members.ts`).
  const pieces = ef?.pieces;
  if (pieces?.length && pieces.every((p) => p.dI && p.dJ)) return piecewiseCurve(nodeI, nodeJ, ef!, ei, localY, rollAngle, leftHand, segments);
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

  const xis = typeof segments === 'number' ? Array.from({ length: segments + 1 }, (_, i) => i / segments) : segments;
  const plane = (vI: number, rI: number, vJ: number, rJ: number, ei: number | undefined, gas: number | undefined,
    hingeStart: boolean, hingeEnd: boolean, points: readonly { a: number; p: number }[],
    dist: readonly { qI: number; qJ: number; a: number; b: number }[]) => recoverMember({
      length: L, ei, gas, vI, rI, vJ, rJ, hingeStart, hingeEnd, points, dist, positions: xis,
    });
  const y = plane(vI, thZI, vJ, thZJ, ei?.EIz, ei?.GAz, !!ef?.releaseMzStart, !!ef?.releaseMzEnd,
    ef?.pointLoadsY ?? [], ef?.distributedLoadsY ?? []);
  const z = plane(wI, -thYI, wJ, -thYJ, ei?.EIy, ei?.GAy, !!ef?.releaseMyStart, !!ef?.releaseMyEnd,
    ef?.pointLoadsZ ?? [], ef?.distributedLoadsZ ?? []);
  const out: LocalCurve = { L, ex, ey, ez, xi: [...xis], u: xis.map(xi => uI + xi * (uJ - uI)),
    v: y.map(p => p.v), w: z.map(p => p.v) };
  return out;
}

/**
 * The curve of a member solved as pieces: each sample read on the piece it falls in, from that
 * piece's end displacements, forces and EI. The pieces share the member's axes, so their local
 * components are the member's.
 */
function piecewiseCurve(
  nodeI: Pt, nodeJ: Pt, ef: ElementForces3D, ei: ElementEI | undefined,
  localY: Pt | undefined, rollAngle: number | undefined, leftHand: boolean | undefined, segments: number | readonly number[],
): LocalCurve | null {
  const pieces = ef.pieces!;
  const L = ef.length;
  const at = (x: number): Pt => {
    const f = x / L;
    return { x: nodeI.x + f * (nodeJ.x - nodeI.x), y: nodeI.y + f * (nodeJ.y - nodeI.y), z: nodeI.z + f * (nodeJ.z - nodeI.z) };
  };
  const xis = typeof segments === 'number'
    ? [...new Set([...Array.from({ length: segments + 1 }, (_, i) => i / segments), ...pieces.map((p) => p.x1 / L)])].sort((a, b) => a - b)
    : segments;
  const groups = pieces.map(p => ({ p, samples: [] as number[], output: [] as number[] }));
  for (let i = 0; i < xis.length; i++) {
    const x = xis[i]! * L;
    const k = Math.max(0, pieces.findIndex(p => x <= p.x1 + 1e-9));
    const group = groups[k]!;
    group.samples.push(Math.min(1, Math.max(0, (x - group.p.x0) / Math.max(group.p.x1 - group.p.x0, 1e-12))));
    group.output.push(i);
  }
  let out: LocalCurve | null = null;
  // Process the first requested piece first, preserving the old axes choice
  // for an unsorted station list as well as ordinary increasing samples.
  groups.sort((a, b) => (a.output[0] ?? Infinity) - (b.output[0] ?? Infinity));
  for (const { p, samples, output } of groups) {
    if (!samples.length) continue;
    const c = memberLocalCurve(at(p.x0), at(p.x1), p.dI!, p.dJ!, p.forces, p.ei ?? ei,
      localY, rollAngle, leftHand, samples);
    if (!c) return null;
    out ??= { L, ex: c.ex, ey: c.ey, ez: c.ez, xi: [...xis], u: [], v: [], w: [] };
    output.forEach((j, i) => { out!.u[j] = c.u[i]!; out!.v[j] = c.v[i]!; out!.w[j] = c.w[i]!; });
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
 * A cantilever is the exception: with one end free, the chord runs through the tip it is
 * meant to measure, and the peak relative to it is about a fifth of the tip's deflection
 * (PL³/3EI under a tip load). A span limit for a cantilever is written for the tip relative
 * to its support, so with `supportedEnd` the reference is that end's displaced position —
 * a whole-frame translation still drops out, and the support's rotation, which the tip
 * really undergoes, stays in.
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

/**
 * The deflection of a cantilever: relative to the tangent at its root, not to its chord. The
 * chord of a cantilever runs through its tip, so the chord reading misses nearly all of it.
 *
 * `slopeV` and `slopeW` are the root's slopes in the curve's axes, dv/dx and dw/dx: from the
 * root node's rotation θ, θ·ez and −θ·ey.
 */
export function tangentDeflection(c: LocalCurve, root: 'start' | 'end', slopeV: number, slopeW: number): ChordDeflection {
  const n = c.xi.length;
  const k0 = root === 'start' ? 0 : n - 1;
  const xi0 = c.xi[k0]!;
  const rel = (arr: number[], sl: number) => c.xi.map((xi, i) => arr[i]! - (arr[k0]! + sl * (xi - xi0) * c.L));
  const vr = rel(c.v, slopeV), wr = rel(c.w, slopeW);
  const pick = (a: number[]) => {
    let k = 0;
    for (let i = 1; i < n; i++) if (Math.abs(a[i]!) > Math.abs(a[k]!)) k = i;
    return { value: Math.abs(a[k]!), x: c.xi[k]! * c.L };
  };
  const r = pick(vr.map((v, i) => Math.hypot(v, wr[i]!))), pv = pick(vr), pw = pick(wr);
  return { L: c.L, max: r.value, x: r.x, maxV: pv.value, xV: pv.x, maxW: pw.value, xW: pw.x };
}
