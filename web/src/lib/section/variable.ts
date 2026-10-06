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
 *   · Otherwise two sections of one kind (two profiles of one catalogue family, two sections of
 *     one template, two explicit outlines) whose canonical outlines have the same make-up (as many
 *     outlines and holes, each with as many vertices) go vertex by vertex, about their centroids.
 *     The kind is asked, not inferred from the count: an I and a T of one count, a C and an I, an
 *     HEB and a W, an RHS and an SHS have no transition that means something.
 *
 * Anything else has no transition that means something (an I into a tube), and is refused with
 * the reason: in the member's specification, and by the solve, which then solves the member
 * prismatic with end I's section and says so (`variableRefusal`, a model finding).
 *
 * The member's axis runs through each station's centroid; a section that is not symmetric and
 * changes depth moves its centroid along the member, and that eccentricity is not modelled.
 *
 * Pure: no store. Each station's section is resolved once and cached by the ends: their geometry
 * and every setting a station takes from end I (shear areas, a drawing's materials and ratios).
 */
import type { Section } from '../store/model.svelte';
import type { DrawnPart, DrawnSection, DrawnShape, Pt } from './drawn';
import { drawingGeometry } from './drawing';
import { analyzeDrawn } from './drawn-properties';
import { catalogueOutline, catalogueFamilyOf } from './canonical';
import { toSectionFields } from './section-choice';
import { resolveSectionState } from './state';
import { computeSectionProperties, generateSectionName, type ShapeType } from '../data/section-shapes';

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

/**
 * What a section's outline is an instance of: a template, a catalogue family, an explicit outline
 * (or, for a section of no template, its shape). A drawing has none: it blends part by part.
 */
function outlineKind(s: Section): string | null {
  if (s.drawn) return null;
  if (s.built) return `template:${s.built.shapeType}`;
  if (s.polygon && s.polygon.length >= 3) return 'polygon';
  const family = catalogueFamilyOf(s);
  if (family) return `catalogue:${family}`;
  return s.shape ? `shape:${s.shape}` : null;
}

/** The two are of one kind and their canonical outlines match vertex for vertex, and how to blend them into a drawing. */
function outlineBlend(a: Section, b: Section): ((t: number) => DrawnSection) | null {
  if (a.canonical?.kind !== 'geometry-backed' || b.canonical?.kind !== 'geometry-backed') return null;
  const kind = outlineKind(a);
  if (kind === null || kind !== outlineKind(b)) return null;
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

/**
 * An end as a station's section depends on it: its geometry, and the rest of it, which a station
 * takes from end I (`stationSection`) or names. Two pairs alike in outline but not in shear areas,
 * or in a drawing's modular ratios, must not share a station.
 */
const keyOf = (s: Section) => {
  const { id: _id, canonical, ...own } = s;
  return `${canonical?.kind === 'geometry-backed' ? canonical.digest : ''}:${JSON.stringify(own)}`;
};
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
 * The section at `t` along a member of variable section, as one a member's end can name, so that
 * each piece of the member cut there blends from its own ends exactly as the whole did: the outline
 * at s along the first piece is the whole's at s·t.
 *
 *   · Two sections of one template: the template with each parameter at t. Its outline is the
 *     blend of the ends' (a template's vertices run with its parameters), and it is a section of
 *     that template, so it blends with either end.
 *   · Two drawings of the same parts: the drawing blended part by part.
 *
 * Null for anything else, and a member is then not cut: between two profiles of a catalogue family
 * there is no profile of it to name, and a pair that does not blend has no section between. The
 * other settings (rotation, shear areas) are end I's, as every station's.
 */
export function variableCutSection(secI: Section | undefined, secJ: Section | undefined, t: number): Omit<Section, 'id'> | null {
  const plan = variableSectionPlan(secI, secJ);
  if (!plan.ok || !secI || !secJ) return null;
  if (plan.mode === 'parts') {
    const { id: _id, canonical: _c, ...station } = plan.at(t);
    return station;
  }
  const bi = secI.built, bj = secJ.built;
  if (!bi || !bj || bi.shapeType !== bj.shapeType) return null;
  // To twelve figures, so a cut at mid-depth is 450 mm and not 449,999…, and two cuts at one place name one section.
  const params = Object.fromEntries(Object.entries(bi.params).map(([k, v]) => [k, Number(lerp(v, bj.params[k] ?? v, t).toPrecision(12))]));
  const props = computeSectionProperties(bi.shapeType as ShapeType, params);
  if (!props) return null;
  const fields = toSectionFields({ kind: 'built', name: generateSectionName(bi.shapeType as ShapeType, params), shapeType: bi.shapeType, params, props, rotationDeg: secI.rotation ?? 0 }, 0);
  return fields ? ({ ...fields, ...(secI.shearAreas ? { shearAreas: secI.shearAreas } : {}) } as Omit<Section, 'id'>) : null;
}

/**
 * Whether a member states a section at J that a cut cannot carry (`variableCutSection`), so it is
 * not cut. A member the solve takes prismatic (`variableRefusal`: a truss, a pair that does not
 * blend) is cut as it is solved, into segments of end I's section, and is never refused.
 */
export function variableCutRefused(sections: ReadonlyMap<number, Section>, e: VariableMemberLike): boolean {
  return !!e.variableSection && variableRefusal(sections, e) === null
    && variableCutSection(sections.get(e.sectionId), sections.get(e.variableSection.sectionJ), 0.5) === null;
}

type VariableMemberLike = { type?: string; behaviour?: string; sectionId: number; variableSection?: { sectionJ: number; segments?: number } };

/** Why a member that states a section at J is solved prismatic: its sections, or what it is. */
export type VariableRefusal = VariableProblem | 'notFrame';

/**
 * Why a member that states a section at J is solved prismatic, with end I's section; null when it
 * states none, is solved as a member of variable section, or is out of the analysis. A truss, a
 * one-way or a cable member is solved by its axial stiffness, from end I's section; a member whose
 * two sections do not blend has no section between them.
 *
 * The solve (`engine/variable-members.ts`), design, the analyses that refuse members of variable
 * section and the model's findings all read this, so none of them takes a member for one the
 * solve did not make it.
 */
export function variableRefusal(sections: ReadonlyMap<number, Section>, e: VariableMemberLike): VariableRefusal | null {
  if (!e.variableSection || e.behaviour === 'inactive') return null;
  if ((e.type && e.type !== 'frame') || e.behaviour) return 'notFrame';
  const plan = variableSectionPlan(sections.get(e.sectionId), sections.get(e.variableSection.sectionJ));
  return plan.ok ? null : plan.problem;
}

/** Whether a member is solved as a member of variable section: it states a section at J, and nothing refuses it. */
export function isVariableMember(sections: ReadonlyMap<number, Section>, e: VariableMemberLike): boolean {
  return !!e.variableSection && e.behaviour !== 'inactive' && variableRefusal(sections, e) === null;
}

/**
 * A member's section at `t` along it (0 at I, 1 at J): its own section, or for a member of
 * variable section the blend there. What a reader of a station (a stress, a property) asks for.
 */
export function memberSectionAt(
  sections: ReadonlyMap<number, Section>, e: VariableMemberLike, t: number,
): Section | undefined {
  const own = sections.get(e.sectionId);
  if (!e.variableSection || !isVariableMember(sections, e)) return own;
  const plan = variableSectionPlan(own, sections.get(e.variableSection.sectionJ));
  return plan.ok ? plan.at(t) : own;
}

/**
 * The mean of a member's section area along it, for its weight and its mass: the stations at the
 * middle of each of the solve's pieces, as the solve reads them. A member of one section: its area.
 */
export function memberMeanArea(
  sections: ReadonlyMap<number, Section>, e: VariableMemberLike,
): number | undefined {
  const own = sections.get(e.sectionId);
  if (!e.variableSection || !isVariableMember(sections, e)) return own?.a;
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
