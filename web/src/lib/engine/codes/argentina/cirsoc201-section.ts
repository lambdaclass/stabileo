/**
 * One section engine, for every case the workbook solves — the Rust engine's.
 *
 * CIRSOC_FLEX has eight sheets and they are one problem: a rectangular beam, a T beam, a
 * rectangular column, a round column, a hollow pier and a skew-bent column differ only in the
 * outline of the concrete and where the bars are. Everything after that — the plane of strains,
 * the stress block, the yield check, φ, the axial cap — is the same clause on the same geometry,
 * and it is computed once, in `engine/src/postprocess/cirsoc201_section.rs`.
 *
 * This module describes the section (outline, bars, materials, edition), hands it to the
 * engine once (`prepareSection`) and converts the answers to the app's units. It holds no
 * clause and no fallback: without the engine it throws. The TypeScript integration it replaced
 * is a test oracle (`__tests__/differential/oracle/cirsoc201-section.ts`).
 *
 * ── Sign convention, stated once ───────────────────────────────────
 *
 * Compression positive, for forces and strains. Axes are the section's own, origin at the
 * centroid of the gross outline. `Mnx` bends about x and `Mny` about y; a compressed +y face
 * gives a negative Mnx. θ is the direction of the OUTWARD normal of the compressed face:
 * θ = −π/2 compresses the bottom, which is what a sagging beam has.
 *
 * Units: kN, kN·m, m, MPa (the engine's SI is converted here).
 */

import {
  ES_MPA, editionCode, confinementCode, type Cirsoc201EditionLike, type Confinement,
} from './cirsoc201-basis';
import { type Pt, rectPolygon, teePolygon, circlePolygon } from './section-polygon';
import { cirsoc201Engine, STATE_LEN, UTIL_LEN, type SectionKernelInstance } from './cirsoc201-engine';

/** A longitudinal bar: where it is, and how much steel. */
export interface Bar {
  /** Metres from the section centroid. */
  x: number;
  y: number;
  /** m². */
  area: number;
}

/** The concrete outline; holes are the workbook's `b_h`/`h_h` and `D int`. */
export type Outline =
  | { kind: 'rect'; b: number; h: number; hole?: { b: number; h: number } }
  | { kind: 'tee'; bf: number; hf: number; bw: number; h: number }
  | { kind: 'circle'; D: number; Dint?: number }
  /** Any outline, its vertices around it, in section coordinates about its centroid (an L column). */
  | { kind: 'polygon'; outer: Pt[] };

export interface Materials {
  /** MPa. */
  fc: number;
  fy: number;
  confinement?: Confinement;
  /**
   * Subtract the concrete a compression bar inside the stress block displaces. DEFAULTS TO ON:
   * leaving it out counts that area twice and overstates the capacity. A switch because the
   * workbook has one.
   */
  deductDisplacedConcrete?: boolean;
  /**
   * The CIRSOC 201 edition whose φ and caps apply. Defaults to 2005, the CIRSOC_FLEX
   * workbook's edition, which is what this module computed before the engine took it over.
   */
  edition?: Cirsoc201EditionLike;
}

/** Outer ring and holes, in section coordinates. */
export function outlineRings(o: Outline): { outer: Pt[]; holes: Pt[][] } {
  switch (o.kind) {
    case 'rect':
      return { outer: rectPolygon(o.b, o.h), holes: o.hole ? [rectPolygon(o.hole.b, o.hole.h)] : [] };
    case 'tee':
      return { outer: teePolygon(o.bf, o.hf, o.bw, o.h), holes: [] };
    case 'circle':
      return { outer: circlePolygon(o.D), holes: o.Dint && o.Dint > 0 ? [circlePolygon(o.Dint)] : [] };
    case 'polygon':
      return { outer: o.outer.map((p) => ({ ...p })), holes: [] };
  }
}

export interface SectionPoint {
  /** kN, positive in compression. */
  Pn: number;
  /** kN·m. */
  Mnx: number;
  Mny: number;
  /** Design values, φ applied; φPn capped at φPn,max. */
  phiPn: number;
  phiMnx: number;
  phiMny: number;
  phi: number;
  /** Net tensile strain in the most-stretched bar; 0 when none is in tension. */
  epsilonT: number;
  /** Depth of the neutral axis from the extreme compressed fibre, m. */
  c: number;
}

/** Demand over capacity, and the section's state where the capacity is read. */
export interface SectionUtilisation {
  ratio: number;
  phiPn: number;
  phiMn: number;
  /** Absent where no neutral axis describes the answer (a purely axial demand). */
  c?: number;
  epsilonT?: number;
  phi: number;
  /** Outward normal of the compressed face at the capacity. */
  theta: number;
  axialOnly?: boolean;
}

export interface SectionInfo {
  /** m². */
  Ag: number;
  Ast: number;
  /** kN. */
  Po: number;
  phiPnMax: number;
  phiPntMax: number;
  beta1: number;
}

/** Run-scoped section, prepared once in the engine and asked many times. Call `free`. */
export interface PreparedSection {
  info(): SectionInfo;
  /** [section depth, depth of the farthest bar] along θ, m. */
  depths(theta: number): { depth: number; dt: number };
  point(theta: number, c: number): SectionPoint;
  points(theta: number, cs: readonly number[]): SectionPoint[];
  curve(theta: number, nPoints?: number): SectionPoint[];
  /** The state where φPn = Pu (kN), or null when the section cannot carry it. */
  atAxial(theta: number, Pu: number): SectionPoint | null;
  /** Uniaxial check about x along the ray of constant eccentricity (Mu > 0 compresses +y). */
  ray(Pu: number, Mu: number): SectionUtilisation;
  /** The axial limit on the demand's side. */
  axialLimit(theta: number, Pu: number): SectionUtilisation;
  /** Biaxial check on the load contour at Pu; Mx, My signed as the sheets sign them. */
  biaxial(Pu: number, Mx: number, My: number): SectionUtilisation;
  /** The same check with the verifier's coarser search (direction to 1e-5 rad). */
  biaxialFast(Pu: number, Mx: number, My: number): SectionUtilisation;
  momentCapacityAtAxial(Pu: number, Mx: number, My: number): {
    phiMn: number; phiMnx: number; phiMny: number; fi: number; state: SectionPoint;
  } | null;
  /** The six characteristic points: [φMn (sheet sign), φPn, φ, εt] each, kN·m / kN. */
  characteristicPoints(theta: number): Array<[number, number, number, number]>;
  free(): void;
}

function statesFrom(v: Float64Array): SectionPoint[] {
  const out: SectionPoint[] = [];
  for (let k = 0; k + STATE_LEN <= v.length; k += STATE_LEN) {
    out.push({
      Pn: v[k] / 1000, Mnx: v[k + 1] / 1000, Mny: v[k + 2] / 1000, epsilonT: v[k + 3], c: v[k + 4],
      phi: v[k + 5], phiPn: v[k + 6] / 1000, phiMnx: v[k + 7] / 1000, phiMny: v[k + 8] / 1000,
    });
  }
  return out;
}

function utilisationFrom(v: Float64Array): SectionUtilisation {
  const u: SectionUtilisation = {
    ratio: v[0], phiPn: v[1] / 1000, phiMn: v[2] / 1000, phi: v[5],
    theta: Math.atan2(v[7], v[6]), axialOnly: v[8] === 1,
  };
  if (Number.isFinite(v[3])) u.c = v[3];
  if (Number.isFinite(v[4])) u.epsilonT = v[4];
  return u;
}

export function prepareSection(outline: Outline, bars: readonly Bar[], mat: Materials): PreparedSection {
  const Section = cirsoc201Engine('Section');
  /*
   * A circle goes to the engine as a circle — its compressed segment is computed exactly
   * (r²·acos(t/r) − t·√(r² − t²)) — and only the drawing uses the 360-gon.
   */
  const circles = outline.kind === 'circle'
    ? [0, 0, outline.D / 2, ...(outline.Dint && outline.Dint > 0 ? [0, 0, outline.Dint / 2] : [])]
    : [];
  const rings = outline.kind === 'circle' ? [] : (() => { const r = outlineRings(outline); return [r.outer, ...r.holes]; })();
  const offsets = new Uint32Array(rings.length + 1);
  for (let i = 0; i < rings.length; i++) offsets[i + 1] = offsets[i] + rings[i].length;
  const kernel: SectionKernelInstance = new Section(
    Float64Array.from(rings.flatMap((ring) => ring.flatMap((p) => [p.x, p.y]))), offsets,
    Float64Array.from(circles),
    Float64Array.from(bars.flatMap((b) => [b.x, b.y, b.area])),
    Float64Array.of(mat.fc * 1e6, mat.fy * 1e6, ES_MPA * 1e6, editionCode(mat.edition),
      confinementCode(mat.confinement), (mat.deductDisplacedConcrete ?? true) ? 1 : 0),
  );
  const dir = (theta: number) => [Math.cos(theta), Math.sin(theta)] as const;
  return {
    info() {
      const v = kernel.info();
      return { Ag: v[0], Ast: v[1], Po: v[2] / 1000, phiPnMax: v[3] / 1000, phiPntMax: v[4] / 1000, beta1: v[5] };
    },
    depths(theta) {
      const v = kernel.depths(...dir(theta));
      return { depth: v[0], dt: v[1] };
    },
    point: (theta, c) => statesFrom(kernel.points(...dir(theta), Float64Array.of(c)))[0],
    points: (theta, cs) => statesFrom(kernel.points(...dir(theta), Float64Array.from(cs))),
    curve: (theta, nPoints = 60) => statesFrom(kernel.curve(...dir(theta), nPoints)),
    atAxial(theta, Pu) {
      const s = statesFrom(kernel.atAxial(...dir(theta), Pu * 1000))[0];
      return Number.isFinite(s.c) ? s : null;
    },
    ray: (Pu, Mu) => utilisationFrom(kernel.ray(Pu * 1000, Mu * 1000)),
    axialLimit: (theta, Pu) => utilisationFrom(kernel.axialLimit(...dir(theta), Pu * 1000)),
    biaxial: (Pu, Mx, My) => utilisationFrom(kernel.biaxial(Pu * 1000, Mx * 1000, My * 1000)),
    biaxialFast: (Pu, Mx, My) => utilisationFrom(kernel.biaxialFast(Pu * 1000, Mx * 1000, My * 1000)),
    momentCapacityAtAxial(Pu, Mx, My) {
      const v = kernel.momentCapacityAtAxial(Pu * 1000, Mx * 1000, My * 1000);
      if (!Number.isFinite(v[0])) return null;
      return {
        phiMn: v[0] / 1000, phiMnx: v[1] / 1000, phiMny: v[2] / 1000, fi: v[3],
        state: statesFrom(v.subarray(4, 4 + STATE_LEN))[0],
      };
    },
    characteristicPoints(theta) {
      const v = kernel.characteristicPoints(...dir(theta));
      const out: Array<[number, number, number, number]> = [];
      for (let k = 0; k < v.length; k += 4) out.push([v[k] / 1000, v[k + 1] / 1000, v[k + 2], v[k + 3]]);
      return out;
    },
    free: () => kernel.free(),
  };
}

/** Run `f` on a prepared section and release it, whatever happens. */
export function withSection<T>(outline: Outline, bars: readonly Bar[], mat: Materials, f: (s: PreparedSection) => T): T {
  const s = prepareSection(outline, bars, mat);
  try { return f(s); } finally { s.free(); }
}

/** The section's state for one neutral axis (one engine call). */
export function sectionPoint(outline: Outline, bars: readonly Bar[], mat: Materials, theta: number, c: number): SectionPoint {
  return withSection(outline, bars, mat, (s) => s.point(theta, c));
}

/** The interaction diagram in one bending plane, from every fibre compressed to pure tension. */
export function interactionCurve(outline: Outline, bars: readonly Bar[], mat: Materials, theta: number, nPoints = 60): SectionPoint[] {
  return withSection(outline, bars, mat, (s) => s.curve(theta, nPoints));
}

/** Gross area, holes removed, m² (the engine's). */
export function grossArea(o: Outline): number {
  return withSection(o, [], { fc: 20, fy: 420 }, (s) => s.info().Ag);
}

/** The squash load this section reaches with its bars, kN. */
export function sectionSquashLoad(outline: Outline, bars: readonly Bar[], mat: Materials): number {
  return withSection(outline, bars, mat, (s) => s.info().Po);
}

/** Re-exported for the utilisation layout's consumers. */
export { UTIL_LEN };
