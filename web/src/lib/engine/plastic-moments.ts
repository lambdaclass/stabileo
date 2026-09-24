/**
 * The plastic moment of each section, for the plastic collapse analysis.
 *
 * The engine takes Mp = fy·Zp, and when a section carries b and h it takes
 * Zp = b·h²/4 — a solid rectangle's. Every catalogue profile carries b and h,
 * so an IPN 300 (Zx ≈ 762 cm³) went in as a 125 × 300 mm block (2812 cm³):
 * Mp 3,7 times too large, and the collapse factor with it.
 *
 * Here Zp comes from the section itself and reaches the engine through
 * `mpOverrides`, which it already honours:
 *
 *   · geometry-backed sections (catalogue profiles, parametric shapes, custom
 *     outlines): Zp about the equal-area horizontal axis, from the section
 *     engine — the same number the section panel reports;
 *   · a rectangle declared only by b and h: b·h²/4, which is then right;
 *   · anything else — a section known only by A and I: Zp estimated as 1,15
 *     times the elastic modulus, and said so.
 *
 * A material without fy is analysed with 250 MPa, and said so too.
 */
import type { Section, Material, Element } from '../store/model.svelte';
import { resolveCanonicalSection, isGeometryBacked } from '../section/canonical';
import { analyzeSectionPlastic } from './wasm-solver';

export type MpSource = 'geometry' | 'rectangle' | 'estimated';

export interface SectionMp {
  sectionId: number;
  name: string;
  /** kN·m */
  mp: number;
  /** m³ */
  zp: number;
  /** MPa, as used */
  fy: number;
  source: MpSource;
  /** The material had no fy: 250 MPa was assumed. */
  fyAssumed: boolean;
}

export const DEFAULT_FY = 250;
/** Shape factor assumed when only A and I are known. */
const SHAPE_FACTOR_ESTIMATE = 1.15;

/** Zp about the horizontal axis, m³, and where it came from. */
export function plasticModulus(sec: Section): { zp: number; source: MpSource } {
  try {
    const r = resolveCanonicalSection(sec);
    if (isGeometryBacked(r)) {
      const zp = analyzeSectionPlastic({ geometry: r.geometry }).zy;
      if (Number.isFinite(zp) && zp > 0) return { zp, source: 'geometry' };
    }
  } catch {
    // No section engine (cold start, old build): fall through to what the section declares.
  }
  const i = sec.iy ?? sec.iz;
  if ((sec.shape === 'rect' || sec.shape === undefined) && sec.b && sec.h && Math.abs(sec.b * sec.h ** 3 / 12 - i) <= 1e-3 * i) {
    return { zp: (sec.b * sec.h ** 2) / 4, source: 'rectangle' };
  }
  const h = sec.h && sec.h > 0 ? sec.h : Math.sqrt((12 * i) / sec.a);
  return { zp: SHAPE_FACTOR_ESTIMATE * (i / (h / 2)), source: 'estimated' };
}

/** Mp of every section the model's members use, with the material of the first member using it. */
export function plasticMoments(
  sections: Map<number, Section>,
  materials: Map<number, Material>,
  elements: Map<number, Element>,
): SectionMp[] {
  const out: SectionMp[] = [];
  for (const [id, sec] of sections) {
    const elem = [...elements.values()].find((e) => e.sectionId === id);
    if (!elem) continue;
    const fyDeclared = materials.get(elem.materialId)?.fy;
    const fyAssumed = !(fyDeclared && fyDeclared > 0);
    const fy = fyAssumed ? DEFAULT_FY : fyDeclared!;
    const { zp, source } = plasticModulus(sec);
    out.push({ sectionId: id, name: sec.name, mp: fy * 1000 * zp, zp, fy, source, fyAssumed });
  }
  return out;
}

/** Zp about the vertical (weak) axis, m³, and where it came from. The 3-D counterpart of `plasticModulus`. */
export function plasticModulusWeak(sec: Section): { zp: number; source: MpSource } {
  try {
    const r = resolveCanonicalSection(sec);
    if (isGeometryBacked(r)) {
      const zp = analyzeSectionPlastic({ geometry: r.geometry }).zz;
      if (Number.isFinite(zp) && zp > 0) return { zp, source: 'geometry' };
    }
  } catch {
    // As above: fall through to what the section declares.
  }
  const i = sec.iz;
  if ((sec.shape === 'rect' || sec.shape === undefined) && sec.b && sec.h && Math.abs(sec.h * sec.b ** 3 / 12 - i) <= 1e-3 * i) {
    return { zp: (sec.h * sec.b ** 2) / 4, source: 'rectangle' };
  }
  const b = sec.b && sec.b > 0 ? sec.b : Math.sqrt((12 * i) / sec.a);
  return { zp: SHAPE_FACTOR_ESTIMATE * (i / (b / 2)), source: 'estimated' };
}

/** Both plastic moments of a section, kN·m — `[Mp about y (strong), Mp about z (weak)]`, the engine's 3-D `mpOverrides` pair. */
export interface SectionMp3D extends SectionMp { mpz: number; zpz: number; sourceZ: MpSource }

/**
 * Mp about both axes of every section the model's members use, for the 3-D plastic analysis.
 *
 * The engine's 3-D fallback is the same rectangle, `b·h²/4` and `h·b²/4`, and it reads a
 * section's material from a `materialId` the section does not have — so every section was
 * analysed with the default 250 MPa. Here the material is the first member's, as in 2-D.
 */
export function plasticMoments3D(
  sections: Map<number, Section>,
  materials: Map<number, Material>,
  elements: Map<number, Element>,
): SectionMp3D[] {
  return plasticMoments(sections, materials, elements).map((m) => {
    const w = plasticModulusWeak(sections.get(m.sectionId)!);
    return { ...m, zpz: w.zp, mpz: m.fy * 1000 * w.zp, sourceZ: w.source };
  });
}

/**
 * The engine's 3-D plastic payload: sections with their members' material, dimensions only when
 * present, and Mp about both axes as `mpOverrides`; plus the sections whose Mp rests on an
 * assumption, so a surface can say so.
 */
export function plasticInput3D(
  sections: Map<number, Section>,
  materials: Map<number, Material>,
  elements: Map<number, Element>,
): { sections: Record<string, unknown>; materials: Record<string, { fy: number }>; mpOverrides: Record<string, [number, number]>; assumed: string[] } {
  const mps = plasticMoments3D(sections, materials, elements);
  const out: Record<string, unknown> = {};
  const mpOverrides: Record<string, [number, number]> = {};
  for (const m of mps) {
    const sec = sections.get(m.sectionId)!;
    const member = [...elements.values()].find((e) => e.sectionId === m.sectionId)!;
    out[String(m.sectionId)] = {
      a: sec.a, iy: sec.iy ?? sec.iz, iz: sec.iz, materialId: member.materialId,
      ...(sec.b ? { b: sec.b } : {}), ...(sec.h ? { h: sec.h } : {}),
    };
    mpOverrides[String(m.sectionId)] = [m.mp, m.mpz];
  }
  const mats: Record<string, { fy: number }> = {};
  for (const [id, mat] of materials) mats[String(id)] = { fy: mat.fy && mat.fy > 0 ? mat.fy : DEFAULT_FY };
  const assumed = mps.filter((m) => m.fyAssumed || m.source === 'estimated' || m.sourceZ === 'estimated').map((m) => m.name);
  return { sections: out, materials: mats, mpOverrides, assumed };
}
