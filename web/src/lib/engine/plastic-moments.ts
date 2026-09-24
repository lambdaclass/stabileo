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
