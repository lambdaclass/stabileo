/**
 * The properties of a drawn section, from the engine where it can answer and from the transformed
 * section where it cannot.
 *
 * ── Which number comes from where ──────────────────────────────────
 *
 *   one material     A, centroid, I, principal axes and S from the engine's bending pass over
 *                    the whole geometry; Z and Cw from its plastic pass. Both integrate any set
 *                    of polygons correctly, disjoint ones included.
 *   several          the same quantities of the transformed section, n = Eᵢ/E_ref per part,
 *                    integrated here: the engine's polygons carry a material id no property
 *                    reads. Z and Cw are not given, since a plastic modulus of a section of two
 *                    materials is a design question with its own rules, not a geometric property.
 *   J                Saint-Venant on each connected piece and summed. Each piece is weighted by
 *                    G of its material; a piece of two materials is solved as one outline and
 *                    weighted by its area-averaged G, which is said in `jBasis`.
 *   shear            shear centre and shear areas when the section is one connected piece of one
 *                    material. Pieces that are not joined have no common shear centre.
 */

import type { CanonicalGeometry } from '../engine/wasm-solver';
import {
  buildSectionGeometry, analyzeSectionBending, analyzeSectionTorsion, analyzeSectionShear,
  analyzeSectionPlastic, sectionGeometryDigest,
} from '../engine/wasm-solver';
import {
  assembleDrawn, momentsOf, areaOf, bboxOf, openRing,
  type AssembledSection, type DrawnSection, type ProfileOutline,
} from './drawn';
import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';

export interface DrawnPartRow {
  id: number;
  void: boolean;
  a: number;
  /** Centroid, section coordinates. */
  yc: number;
  zc: number;
  /** Own second moments about the part's centroid, parallel to the section axes. */
  iy: number;
  iz: number;
  /** E ratio the part is transformed with. */
  n: number;
}

export interface DrawnProperties {
  /** Transformed to the reference material when there is more than one. */
  a: number;
  yc: number;
  zc: number;
  iy: number;
  iz: number;
  iyz: number;
  i1: number;
  i2: number;
  thetaP: number;
  sTop: number;
  sBot: number;
  sLeft: number;
  sRight: number;
  zy: number | null;
  zz: number | null;
  cw: number | null;
  j: number | null;
  jBasis: 'saintVenant' | 'homogenised' | null;
  /** Section coordinates, not centroid-relative. */
  shearCentre: [number, number] | null;
  /** Paired as `Section.shearAreas` pairs them: asY with iy (shear along z), asZ with iz. */
  shearAreas: { asY: number; asZ: number } | null;
  /** kg/m, when the densities are known. */
  massPerM: number | null;
  bbox: [number, number, number, number];
  pieces: number;
  composite: boolean;
  parts: DrawnPartRow[];
}

export interface DrawnAnalysis {
  assembled: AssembledSection;
  /** Null when the assembly has errors or no area. */
  geometry: CanonicalGeometry | null;
  digest: string | null;
  properties: DrawnProperties | null;
}

/** One multipolygon piece as the engine's custom geometry. */
const pieceGeometry = (poly: Polygon) => buildSectionGeometry({
  kind: 'custom', outer: openRing(poly[0]!), holes: poly.slice(1).map(openRing),
}).geometry;

/** The real area of each material, m². */
export function materialAreas(asm: AssembledSection): Array<{ materialId: number | null; a: number }> {
  const out = new Map<number | null, number>();
  for (const r of asm.regions) out.set(r.materialId, (out.get(r.materialId) ?? 0) + areaOf(r.region));
  return [...out].map(([materialId, a]) => ({ materialId, a }));
}

/** The canonical geometry of the assembled regions: one solid per outline, holes as voids. */
export function drawnGeometry(asm: AssembledSection): CanonicalGeometry | null {
  const polygons: CanonicalGeometry['polygons'] = [];
  let base: CanonicalGeometry | null = null;
  for (const r of asm.regions) {
    for (const poly of r.region) {
      const g = pieceGeometry(poly);
      base ??= g;
      for (const p of g.polygons) polygons.push({ ...p, materialId: r.materialId ?? 0 });
    }
  }
  if (!base || polygons.length === 0) return null;
  // The engine types its provenance; a drawn section is custom geometry to it.
  return { ...base, polygons };
}

function principal(iy: number, iz: number, iyz: number) {
  const m = (iy + iz) / 2, r = Math.hypot((iy - iz) / 2, iyz);
  return { i1: m + r, i2: m - r, thetaP: 0.5 * Math.atan2(-2 * iyz, iy - iz) };
}

/** Transformed centroidal properties over the material regions. */
function transformed(asm: AssembledSection) {
  let a = 0, sy = 0, sz = 0, iyy = 0, izz = 0, iyz = 0;
  for (const r of asm.regions) {
    const m = momentsOf(r.region), n = r.ratio.e;
    a += n * m.a; sy += n * m.sy; sz += n * m.sz; iyy += n * m.iyy; izz += n * m.izz; iyz += n * m.iyz;
  }
  const yc = sy / a, zc = sz / a;
  return { a, yc, zc, iy: iyy - a * zc * zc, iz: izz - a * yc * yc, iyz: iyz - a * yc * zc };
}

/** Distances from the centroid to the extreme fibres, for S. */
function fibres(mp: MultiPolygon, yc: number, zc: number) {
  const bb = bboxOf(mp);
  return { top: bb[3] - zc, bot: zc - bb[1], right: bb[2] - yc, left: yc - bb[0] };
}

/**
 * Everything the editor shows and the section stores, for a drawn section.
 *
 * `density` gives kg/m³ per material id (`null` for the reference material), or nothing when
 * the mass is not wanted.
 */
export function analyzeDrawn(
  sec: DrawnSection, profile: ProfileOutline,
  opts: { density?: (materialId: number | null) => number | undefined; torsion?: boolean } = {},
): DrawnAnalysis {
  const assembled = assembleDrawn(sec, profile);
  if (assembled.issues.some((i) => i.severity === 'error') || assembled.regions.length === 0) {
    return { assembled, geometry: null, digest: null, properties: null };
  }
  const geometry = drawnGeometry(assembled);
  if (!geometry) return { assembled, geometry: null, digest: null, properties: null };
  const digest = sectionGeometryDigest(geometry).digest;
  const composite = assembled.regions.length > 1 || assembled.regions.some((r) => r.ratio.e !== 1);
  const allSolid = assembled.pieces;

  let base: { a: number; yc: number; zc: number; iy: number; iz: number; iyz: number };
  let s: { sTop: number; sBot: number; sLeft: number; sRight: number };
  let pr: { i1: number; i2: number; thetaP: number };
  let zy: number | null = null, zz: number | null = null, cw: number | null = null;
  if (!composite) {
    const p = analyzeSectionBending({ geometry }).properties as Record<string, number> & { a: number };
    base = { a: p.a, yc: p.yc!, zc: p.zc!, iy: p.iy!, iz: p.iz!, iyz: p.iyz! };
    s = { sTop: p.syTop!, sBot: p.syBot!, sLeft: p.szLeft!, sRight: p.szRight! };
    pr = { i1: p.i1!, i2: p.i2!, thetaP: p.thetaP! };
    try {
      const pl = analyzeSectionPlastic({ geometry });
      zy = pl.zy; zz = pl.zz; cw = pl.cw ?? null;
    } catch { /* Plastic pass refused: Z and Cw stay unknown. */ }
  } else {
    base = transformed(assembled);
    const f = fibres(allSolid, base.yc, base.zc);
    s = { sTop: base.iy / f.top, sBot: base.iy / f.bot, sLeft: base.iz / f.left, sRight: base.iz / f.right };
    pr = principal(base.iy, base.iz, base.iyz);
  }

  // Torsion, piece by piece.
  let j: number | null = null;
  let jBasis: DrawnProperties['jBasis'] = null;
  if (opts.torsion !== false) {
    try {
      let sum = 0, mixed = false;
      for (const piece of allSolid) {
        const jp = analyzeSectionTorsion({ geometry: pieceGeometry(piece) }).j;
        if (!(Number.isFinite(jp) && jp > 0)) throw new Error('no J');
        // G of the piece: the area-weighted G ratio of the regions it contains.
        let wa = 0, wg = 0, kinds = 0;
        for (const r of assembled.regions) {
          const ar = areaOf(polygonClipping.intersection(r.region, piece));
          if (ar > 0) { wa += ar; wg += ar * r.ratio.g; kinds++; }
        }
        if (kinds > 1) mixed = true;
        sum += jp * (wa > 0 ? wg / wa : 1);
      }
      j = sum;
      jBasis = mixed ? 'homogenised' : 'saintVenant';
    } catch { j = null; jBasis = null; }
  }

  let shearCentre: [number, number] | null = null;
  let shearAreas: DrawnProperties['shearAreas'] = null;
  if (!composite && allSolid.length === 1 && opts.torsion !== false) {
    try {
      const sh = analyzeSectionShear({ geometry });
      shearCentre = [base.yc + sh.shearCentre[0], base.zc + sh.shearCentre[1]];
      shearAreas = { asY: sh.vz.kappa * base.a, asZ: sh.vy.kappa * base.a };
    } catch { /* No shear solve: the section keeps no shear centre. */ }
  }

  let massPerM: number | null = null;
  if (opts.density) {
    let m = 0, known = true;
    for (const r of assembled.regions) {
      const rho = opts.density(r.materialId);
      if (rho == null || !Number.isFinite(rho)) { known = false; break; }
      m += rho * areaOf(r.region);
    }
    massPerM = known ? m : null;
  }

  const ratioOf = (id: number) => {
    const p = sec.parts.find((x) => x.id === id);
    return p?.materialId == null ? 1 : (p.ratio?.e ?? 1);
  };
  const parts: DrawnPartRow[] = assembled.parts.map(({ id, outline, void: isVoid }) => {
    const m = momentsOf(outline);
    const yc = m.sy / m.a, zc = m.sz / m.a;
    return { id, void: isVoid, a: m.a, yc, zc, iy: m.iyy - m.a * zc * zc, iz: m.izz - m.a * yc * yc, n: ratioOf(id) };
  });

  return {
    assembled, geometry, digest,
    properties: {
      ...base, ...pr, ...s, zy, zz, cw, j, jBasis, shearCentre, shearAreas, massPerM,
      bbox: bboxOf(allSolid), pieces: allSolid.length, composite, parts,
    },
  };
}

/**
 * Normal stress at every vertex of a section of several materials, as a function of the member's
 * local N, My and Mz.
 *
 * The transformed section carries the stiffness, and the stress in a part is n times the
 * transformed stress at the same fibre. The convention is the engine's, pinned against it in the
 * tests: moments turned into the section frame by its rotation, σ = N/A + kz·z − ky·y about the
 * centroid, with the curvatures solved through the full tensor so an unsymmetric section is not
 * read on its geometric axes. Units follow the inputs (kN and m give kPa).
 */
export function compositeStress(
  analysis: DrawnAnalysis, rotationRad = 0,
): ((n: number, my: number, mz: number) => { max: number; min: number }) | null {
  const p = analysis.properties;
  if (!p) return null;
  const det = p.iy * p.iz - p.iyz * p.iyz;
  if (!(p.a > 0) || !(det > 0)) return null;
  const pts: Array<{ y: number; z: number; n: number }> = [];
  for (const r of analysis.assembled.regions) {
    for (const poly of r.region) for (const ring of poly) for (const [y, z] of ring) {
      pts.push({ y: y - p.yc, z: z - p.zc, n: r.ratio.e });
    }
  }
  const c = Math.cos(rotationRad), s = Math.sin(rotationRad);
  return (n, my, mz) => {
    const mys = c * my + s * mz, mzs = -s * my + c * mz;
    const kz = (mys * p.iz + mzs * p.iyz) / det, ky = (mzs * p.iy + mys * p.iyz) / det;
    let max = -Infinity, min = Infinity;
    for (const q of pts) {
      const sigma = q.n * (n / p.a + kz * q.z - ky * q.y);
      if (sigma > max) max = sigma;
      if (sigma < min) min = sigma;
    }
    return { max, min };
  };
}
