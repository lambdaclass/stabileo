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
  materialId: number;
  memberIds: number[];
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
  /*
   * About the axis the analysis bends it about. A rotated section is bent
   * about its rotated axis — `effectiveBendingInertia` gives the 2D wire
   * Iy·cos²α + Iz·sin²α — and the section engine ignores `geometry.rotation`
   * ("applied by consumers"), so Zp came from the unrotated strong axis: an
   * IPN 300 turned 90° took 762 cm³ where its weak axis has 122, and the
   * collapse factor came out six times too high. The outline is turned here
   * instead, and Zp read about the horizontal axis of what is left.
   */
  const alpha = ((sec.rotation ?? 0) * Math.PI) / 180;
  try {
    const r = resolveCanonicalSection(sec);
    // A section of several materials is not integrated as one: its outline would put the whole
    // area at the reference yield stress, a concrete core included. It takes the estimate from
    // its transformed inertia instead.
    if (isGeometryBacked(r) && !(r as { composite?: boolean }).composite) {
      const zp = analyzeSectionPlastic({ geometry: turned(r.geometry, alpha) }).zy;
      if (Number.isFinite(zp) && zp > 0) return { zp, source: 'geometry' };
    }
  } catch {
    // No section engine (cold start, old build): fall through to what the section declares.
  }
  const iStrong = sec.iy ?? sec.iz;
  const iWeak = sec.iz;
  const c = Math.cos(alpha) ** 2;
  const i = iStrong * c + iWeak * (1 - c);
  const quarterTurns = alpha / (Math.PI / 2);
  const square = Math.abs(quarterTurns - Math.round(quarterTurns)) < 1e-9;
  if (square && (sec.shape === 'rect' || sec.shape === undefined) && sec.b && sec.h
    && Math.abs(sec.b * sec.h ** 3 / 12 - iStrong) <= 1e-3 * iStrong) {
    const upright = Math.round(quarterTurns) % 2 === 0;
    const [w, d] = upright ? [sec.b, sec.h] : [sec.h, sec.b];
    return { zp: (w * d ** 2) / 4, source: 'rectangle' };
  }
  const h = !square || !(sec.h && sec.h > 0) ? Math.sqrt((12 * i) / sec.a)
    : Math.round(quarterTurns) % 2 === 0 ? sec.h : (sec.b && sec.b > 0 ? sec.b : Math.sqrt((12 * i) / sec.a));
  return { zp: SHAPE_FACTOR_ESTIMATE * (i / (h / 2)), source: 'estimated' };
}

/** The canonical outline turned by `alpha` (radians, counter-clockwise), carrying no rotation of its own. */
function turned<G extends { polygons: Array<{ vertices: Array<[number, number]> }>; rotation?: number }>(
  geometry: G, alpha: number,
): G {
  if (alpha === 0) return { ...geometry, rotation: 0 };
  const cs = Math.cos(alpha);
  const sn = Math.sin(alpha);
  return {
    ...geometry,
    rotation: 0,
    polygons: geometry.polygons.map((p) => ({
      ...p,
      vertices: p.vertices.map(([y, z]) => [y * cs - z * sn, y * sn + z * cs] as [number, number]),
    })),
  };
}

export function plasticMoments(
  sections: Map<number, Section>,
  materials: Map<number, Material>,
  elements: Map<number, Element>,
): SectionMp[] {
  const groups = new Map<string, SectionMp>();
  const moduli = new Map<number, ReturnType<typeof plasticModulus>>();
  for (const e of elements.values()) {
    const key = `${e.sectionId}/${e.materialId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.memberIds.push(e.id);
      continue;
    }
    const section = sections.get(e.sectionId);
    if (!section) continue;
    const declared = materials.get(e.materialId)?.fy;
    const fyAssumed = !(declared !== undefined && declared > 0);
    const fy = fyAssumed ? DEFAULT_FY : declared;
    const modulus = moduli.get(e.sectionId) ?? plasticModulus(section);
    moduli.set(e.sectionId, modulus);
    groups.set(key, {
      sectionId: e.sectionId, materialId: e.materialId, memberIds: [e.id], name: section.name,
      mp: fy * 1000 * modulus.zp, ...modulus, fy, fyAssumed,
    });
  }
  return [...groups.values()];
}

export function capacitiesByMember<M extends SectionMp>(moments: M[]): Map<number, M> {
  const members = new Map<number, M>();
  for (const m of moments) for (const id of m.memberIds) members.set(id, m);
  return members;
}

/**
 * Zp about the section's own weak axis, m³, for the 3-D analysis.
 *
 * Not turned by `sec.rotation`, unlike `plasticModulus`: in 3-D the section's rotation reaches the
 * engine as a roll of the member's local axes (solver-service: roll = element roll + section
 * rotation), so the local y and z already follow the profile and its Mp about them are the
 * profile's own. Turning the outline as well would turn it twice.
 */
export function plasticModulusWeak(sec: Section): { zp: number; source: MpSource } {
  try {
    const r = resolveCanonicalSection(sec);
    if (isGeometryBacked(r) && !(r as { composite?: boolean }).composite) {
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

export function plasticMoments3D(
  sections: Map<number, Section>,
  materials: Map<number, Material>,
  elements: Map<number, Element>,
): SectionMp3D[] {
  return plasticMoments(sections, materials, elements).map((m) => {
    const sec = sections.get(m.sectionId)!;
    // The profile's own axes: see `plasticModulusWeak` for why 3-D does not turn the outline.
    const s = plasticModulus({ ...sec, rotation: 0 });
    const w = plasticModulusWeak(sec);
    return { ...m, zp: s.zp, mp: m.fy * 1000 * s.zp, source: s.source, zpz: w.zp, mpz: m.fy * 1000 * w.zp, sourceZ: w.source };
  });
}

export function plasticInput3D(
  sections: Map<number, Section>,
  materials: Map<number, Material>,
  elements: Map<number, Element>,
) {
  const moments = plasticMoments3D(sections, materials, elements);
  const assumed = moments.filter(m => m.fyAssumed || m.source === 'estimated' || m.sourceZ === 'estimated').map(m => m.name);
  return { moments, assumed, materials: plasticMaterials(materials) };
}

export function plasticMaterials(materials: Map<number, Material>) {
  return Object.fromEntries([...materials].map(([id, mat]) => [id, { fy: mat.fy && mat.fy > 0 ? mat.fy : DEFAULT_FY }]));
}

export function plasticWireSections<
  E extends { id: number; sectionId: number; materialId: number },
  S extends { id: number; a: number; iz: number },
  M extends SectionMp,
  V extends number | [number, number],
>(input: { elements: Map<number, E>; sections: Map<number, S> }, moments: M[], value: (m: M) => V) {
  const byMember = capacitiesByMember(moments);
  const byPair = new Map(moments.map(m => [`${m.sectionId}/${m.materialId}`, m]));
  const elements = new Map(input.elements);
  const elastic = new Map(input.sections);
  const sections: Record<string, S & { materialId: number }> = {};
  const mpOverrides: Record<string, V> = {};
  const ids = new Map<string, number>();
  let nextId = 0;
  for (const id of elastic.keys()) nextId = Math.max(nextId, id);
  for (const e of elements.values()) {
    const key = `${e.sectionId}/${e.materialId}`;
    const m = byMember.get(e.id) ?? byPair.get(key);
    const section = elastic.get(e.sectionId);
    if (!section || !m || m.materialId !== e.materialId) throw new Error(`Missing plastic capacity for member ${e.id}`);
    let id = ids.get(key);
    if (id === undefined) {
      id = sections[e.sectionId] ? ++nextId : e.sectionId;
      ids.set(key, id);
      elastic.set(id, { ...section, id });
      sections[id] = { ...section, id, materialId: e.materialId };
      mpOverrides[id] = value(m);
    }
    if (id !== e.sectionId) elements.set(e.id, { ...e, sectionId: id });
  }
  return { elements, elastic, sections, mpOverrides };
}
