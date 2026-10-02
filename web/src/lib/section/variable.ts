/**
 * A member whose section changes along it: its section at end I, another at end J, and the
 * section at any point between, as geometry (`Element.variableSection`).
 *
 * ── The section between the ends ──────────────────────────────────
 *
 * Interpolated as a shape, never as numbers: the properties at a point are the properties of the
 * outline there. Inertia goes with the cube of the depth, so the mean of two inertias is not the
 * inertia of the mean section: a solid rectangle from 300 to 600 mm deep has, at its middle, 3,4
 * times the shallow end's inertia, where the mean of the two inertias gives 4,5.
 *
 *   · Two drawn sections made of the same parts (the same shapes, materials and holes, in the
 *     same order) go part by part: each dimension, position and rotation runs from one end's
 *     value to the other's. A drawing keeps its materials this way.
 *   · Otherwise two sections whose canonical outlines have the same make-up (as many outlines and
 *     holes, each with as many vertices: two profiles of one catalogue family, two sections of
 *     one template) go vertex by vertex, about their centroids.
 *
 * Anything else has no transition that means something (an I into a tube), and is refused with
 * the reason.
 *
 * The member's axis runs through each station's centroid; a section that is not symmetric and
 * changes depth moves its centroid along the member, and that eccentricity is not modelled.
 *
 * Pure: no store. Each station's section is resolved once and cached by the ends' geometry.
 */
import type { Section } from '../store/model.svelte';
import type { DrawnPart, DrawnSection, DrawnShape, Pt } from './drawn';
import { drawingGeometry } from './drawing';
import { analyzeDrawn } from './drawn-properties';
import { catalogueOutline } from './canonical';
import { toSectionFields } from './section-choice';
import { resolveSectionState } from './state';

export type VariableProblem =
  | 'missing'       // a section is missing
  | 'same'          // both ends have the same section
  | 'noGeometry'    // a section has no outline (declared properties)
  | 'rotation'      // the two sections are rotated differently
  | 'makeUp'        // the outlines are not made of the same pieces
  | 'composite';    // a drawing of several materials whose parts do not match the other end's

export type VariablePlan =
  | { ok: true; mode: 'parts' | 'outline'; at: (t: number) => Section }
  | { ok: false; problem: VariableProblem };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The two drawings' parts match one for one, and how to blend them. */
function partsBlend(a: DrawnSection, b: DrawnSection): ((t: number) => DrawnSection) | null {
  if (a.parts.length !== b.parts.length || (a.refMaterialId ?? null) !== (b.refMaterialId ?? null)) return null;
  for (let k = 0; k < a.parts.length; k++) {
    const p = a.parts[k]!, q = b.parts[k]!;
    if (p.shape.kind !== q.shape.kind || !!p.void !== !!q.void || !!p.mirror !== !!q.mirror) return null;
    if ((p.materialId ?? null) !== (q.materialId ?? null)) return null;
    if (p.shape.kind === 'profile' && (p.shape.name !== (q.shape as typeof p.shape).name || !!p.shape.cut !== !!(q.shape as typeof p.shape).cut)) return null;
    if ('points' in p.shape && p.shape.points.length !== (q.shape as { points: Pt[] }).points.length) return null;
  }
  const shape = (s: DrawnShape, r: DrawnShape, t: number): DrawnShape => {
    const out: Record<string, unknown> = { ...s };
    for (const [k, v] of Object.entries(s)) {
      const w = (r as Record<string, unknown>)[k];
      if (typeof v === 'number' && typeof w === 'number') out[k] = lerp(v, w, t);
    }
    if ('points' in s) out.points = s.points.map((pt, i) => [lerp(pt[0], (r as { points: Pt[] }).points[i]![0], t), lerp(pt[1], (r as { points: Pt[] }).points[i]![1], t)]);
    if (s.kind === 'profile' && s.cut) out.cut = { ...s.cut, at: lerp(s.cut.at, (r as typeof s).cut!.at, t) };
    return out as DrawnShape;
  };
  return (t) => ({
    ...a,
    parts: a.parts.map((p, k): DrawnPart => {
      const q = b.parts[k]!;
      return {
        ...p, shape: shape(p.shape, q.shape, t),
        at: [lerp(p.at[0], q.at[0], t), lerp(p.at[1], q.at[1], t)],
        rotationDeg: lerp(p.rotationDeg, q.rotationDeg, t),
        ...(p.ratio && q.ratio ? { ratio: { e: lerp(p.ratio.e, q.ratio.e, t), g: lerp(p.ratio.g, q.ratio.g, t) } } : {}),
      };
    }),
  });
}

/** The canonical outlines match vertex for vertex, and how to blend them into a drawing. */
function outlineBlend(a: Section, b: Section): ((t: number) => DrawnSection) | null {
  if (a.canonical?.kind !== 'geometry-backed' || b.canonical?.kind !== 'geometry-backed') return null;
  const ga = drawingGeometry(a.canonical), gb = drawingGeometry(b.canonical);
  const same = (x: Array<Array<[number, number]>>, y: Array<Array<[number, number]>>) =>
    x.length === y.length && x.every((p, k) => p.length === y[k]!.length);
  if (!same(ga.solids, gb.solids) || !same(ga.holes, gb.holes)) return null;
  const blend = (x: Array<[number, number]>, y: Array<[number, number]>, t: number): Pt[] => x.map((v, i) => [lerp(v[0], y[i]![0], t), lerp(v[1], y[i]![1], t)]);
  return (t) => {
    let id = 1;
    const part = (points: Pt[], isVoid: boolean): DrawnPart => ({ id: id++, shape: { kind: 'polygon', points }, at: [0, 0], rotationDeg: 0, ...(isVoid ? { void: true } : {}) });
    return {
      version: 1,
      parts: [
        ...ga.solids.map((p, k) => part(blend(p, gb.solids[k]!, t), false)),
        ...ga.holes.map((p, k) => part(blend(p, gb.holes[k]!, t), true)),
      ],
    };
  };
}

const keyOf = (s: Section) => (s.canonical?.kind === 'geometry-backed' ? s.canonical.digest : JSON.stringify(s.drawn ?? s.name));
const stationCache = new Map<string, Section>();

/** A station's section: the drawing's properties, resolved, carrying the end I section's own settings. */
function stationSection(base: Section, drawn: DrawnSection, name: string): Section {
  const p = analyzeDrawn(drawn, catalogueOutline).properties;
  if (!p) return base;
  const fields = toSectionFields({ kind: 'drawn', name, drawn, props: { a: p.a, iy: p.iy, iz: p.iz, j: p.j, b: p.bbox[2] - p.bbox[0], h: p.bbox[3] - p.bbox[1] } }, 0)!;
  const { polygon: _p, holes: _h, declared: _d, canonical: _c, ...own } = base as Section & { polygon?: unknown; holes?: unknown; declared?: unknown };
  const sec = { ...own, ...fields, rotation: base.rotation ?? 0, ...(base.shearAreas ? { shearAreas: base.shearAreas } : {}) } as Section;
  sec.canonical = resolveSectionState(sec);
  return sec;
}

/**
 * The section along a member from `secI` at end I to `secJ` at end J, or why there is none.
 * `t` runs from 0 at end I to 1 at end J.
 */
export function variableSectionPlan(secI: Section | undefined, secJ: Section | undefined): VariablePlan {
  if (!secI || !secJ) return { ok: false, problem: 'missing' };
  if (secI.id === secJ.id) return { ok: false, problem: 'same' };
  if ((secI.rotation ?? 0) !== (secJ.rotation ?? 0)) return { ok: false, problem: 'rotation' };
  const parts = secI.drawn && secJ.drawn ? partsBlend(secI.drawn, secJ.drawn) : null;
  let blend = parts;
  let mode: 'parts' | 'outline' = 'parts';
  if (!blend) {
    const composite = (s: Section) => s.canonical?.kind === 'geometry-backed' && (s.canonical as { composite?: boolean }).composite;
    if (composite(secI) || composite(secJ)) return { ok: false, problem: 'composite' };
    if (secI.canonical?.kind !== 'geometry-backed' || secJ.canonical?.kind !== 'geometry-backed') return { ok: false, problem: 'noGeometry' };
    blend = outlineBlend(secI, secJ);
    mode = 'outline';
  }
  if (!blend) return { ok: false, problem: 'makeUp' };
  const b = blend;
  const key = `${keyOf(secI)}>${keyOf(secJ)}|${mode}`;
  return {
    ok: true, mode,
    at: (t) => {
      if (t <= 1e-9) return secI;
      if (t >= 1 - 1e-9) return secJ;
      const k = `${key}|${t.toFixed(5)}`;
      let s = stationCache.get(k);
      if (!s) {
        s = stationSection(secI, b(t), `${secI.name} → ${secJ.name} (${(t * 100).toFixed(0)} %)`);
        if (stationCache.size > 2000) stationCache.clear();
        stationCache.set(k, s);
      }
      return s;
    },
  };
}

/**
 * A member's section at `t` along it (0 at I, 1 at J): its own section, or for a member of
 * variable section the blend there. What a reader of a station (a stress, a property) asks for.
 */
export function memberSectionAt(
  sections: ReadonlyMap<number, Section>, e: { sectionId: number; variableSection?: { sectionJ: number } }, t: number,
): Section | undefined {
  const own = sections.get(e.sectionId);
  if (!e.variableSection) return own;
  const plan = variableSectionPlan(own, sections.get(e.variableSection.sectionJ));
  return plan.ok ? plan.at(t) : own;
}

/**
 * The mean of a member's section area along it, for its weight and its mass: the stations at the
 * middle of each of the solve's pieces, as the solve reads them. A member of one section: its area.
 */
export function memberMeanArea(
  sections: ReadonlyMap<number, Section>, e: { sectionId: number; variableSection?: { sectionJ: number; segments?: number } },
): number | undefined {
  const own = sections.get(e.sectionId);
  if (!e.variableSection) return own?.a;
  const plan = variableSectionPlan(own, sections.get(e.variableSection.sectionJ));
  if (!plan.ok) return own?.a;
  const n = Math.max(2, Math.min(50, Math.round(e.variableSection.segments ?? 12)));
  let sum = 0;
  for (let k = 0; k < n; k++) sum += plan.at((k + 0.5) / n).a;
  return sum / n;
}

/** How a member's section is named: its own, or for a member of variable section "I → J". */
export function memberSectionLabel(
  sections: ReadonlyMap<number, { name: string }> | ReadonlyArray<{ id: number; name: string }>,
  e: { sectionId: number; variableSection?: { sectionJ: number } },
): string {
  const get = (id: number) => (Array.isArray(sections) ? sections.find((x) => x.id === id) : (sections as ReadonlyMap<number, { name: string }>).get(id));
  const i = get(e.sectionId)?.name ?? String(e.sectionId);
  return e.variableSection ? `${i} → ${get(e.variableSection.sectionJ)?.name ?? String(e.variableSection.sectionJ)}` : i;
}
