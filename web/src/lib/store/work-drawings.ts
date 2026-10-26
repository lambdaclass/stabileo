/**
 * The construction drawings of the works, read from the model, its design and its document:
 * general notes, formwork plans by level, the column schedule, stirrup zones and bar breakdowns
 * by beam line, the foundation plan with its setting out, punching plans, the steel arrangement
 * by level and frame, the anchor plan, one sheet per steel joint, the consolidated bending
 * schedule and the construction details. Each comes out as a `DrawingInput` the sheet set
 * composes; the drawing itself is a pure builder in `lib/sheets/plans/`.
 */
import { modelStore } from './model.svelte';
import { detailingStore } from './detailing.svelte';
import { jointDesignStore } from './joint-design.svelte';
import { steelJoints } from './joint-typology';
import { physicalGroups, physicalThickness } from './physical';
import { memberNames, wallNames } from './member-names';
import { coverOf, designData } from './design-data';
import { resolveConcreteProperties } from './detailing-project-inputs';
import { regulationsStore } from './regulations.svelte';
import { gridFromModel, sortedLevels } from '../model/grid';
import { columnShapeOf } from '../engine/design/shaped-column';
import { columnStacks } from '../engine/design/column-stacks';
import { materialFamilyOf } from '../engine/steel/material-family';
import { catalogueGradeFamily } from '../engine/steel/grade-family';
import { rcShapeForMark } from '../engine/detailing/bar-shape-diagram';
import { teAt } from '../i18n/engine-text';
import type { DocumentModel } from '../engine/detailing/document-model';
import type { DrawingInput } from '../sheets/compose';
import type { SheetFormat } from '../sheets/formats';
import { boxOf, planScale, type PlanAxis } from '../sheets/plans/plan-common';
import { formworkPlan, mergeCollinearBeams, type PlanBeam, type PlanColumn, type PlanSlab, type PlanWall } from '../sheets/plans/formwork-plan';
import { columnSchedule, type ColumnLift, type ScheduleColumn } from '../sheets/plans/column-schedule';
import { foundationPlan, type PlanFooting } from '../sheets/plans/foundation-plan';
import { punchingPlan, type PunchingJoint } from '../sheets/plans/punching-plan';
import { anchorPlan, jointSheet, steelFrameElevation, steelLevelPlan, type SteelBase, type SteelMember } from '../sheets/plans/steel-plans';
import { barBreakdown, stirrupZones, type StirrupSpan } from '../sheets/plans/beam-plans';
import { appliedLoadsPlan, columnElevation, corbelDrawing, foundationLoadsTable, setoutPlan, wallElevation, type FloorLoads, type FoundationLoad, type SetoutColumn } from '../sheets/plans/extra-plans';
import { resultsStore } from './results.svelte';
import { verificationStore } from './verification.svelte';
import { columnLapOf } from './column-stack-store';
import { corbelChecks } from './special-elements';
import { anchorageFunctions } from '../codes/cirsoc201/anchorage';
import { CIRSOC201_DESIGN_EDITION } from '../engine/codes/argentina/cirsoc201-basis';
import { boundaryLoops } from '../model/mesh-boundary';
import { mergeBoxes, waffleVoids } from '../sheets/plans/waffle-voids';
import { SLAB_LAYERS, slabBreakdown, slabLayerPlan, slabMarks, type PlanSlabPanel } from '../sheets/plans/slab-plan';
import { storedDecisions } from './design-decisions';
import { savedLinePieces } from './beam-line-store';
import { bendingSchedule } from '../sheets/plans/bending-schedule';
import type { Tr } from '../sheets/details/def';
import { generalNotes } from '../sheets/plans/general-notes';
import { stairSchedule, stairSection, tendonPlan, tendonProfileDrawing, type TendonPanel } from '../sheets/plans/stair-pt-plans';
import { ptPanels, stairChecks, stressingPlan } from './stairs-pt';
import { expandKey, siteData } from './site.svelte';
import { builtBy, phaseEnd } from '../engine/site/phases';
import { phasePlan, phaseSchedule, type PhaseGeometry } from '../sheets/plans/phase-plans';

/** What a set can contain, in the order it is issued. `detailing` is the assemblies' own drawings. */
export const PLAN_KINDS = ['notes', 'loads', 'formwork', 'setout', 'columns', 'colElev', 'beams', 'slabs', 'walls', 'detailing', 'foundations', 'fdnLoads', 'punching', 'stairs', 'tendons', 'steel', 'anchors', 'joints', 'bbs', 'details', 'corbels', 'phases'] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

type V2 = { x: number; y: number };
type V3 = V2 & { z: number };
const TOL = 0.05;

export interface PlanContext {
  locale: string; format: SheetFormat; tr: Tr; fmt: (v: number, d: number) => string;
  /** The levels the entry covers, m; absent, all. */
  levels?: number[];
  /** The entry's kind-specific choices. */
  options?: Record<string, string | number | boolean>;
}

export function planContext(locale: string, format: SheetFormat, entry?: { levels?: number[]; options?: Record<string, string | number | boolean> }): PlanContext {
  const tr: Tr = (key, params) => teAt({ key, ...(params ? { params } : {}) }, locale);
  const fmt = (v: number, d: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  return { locale, format, tr, fmt, ...(entry?.levels?.length ? { levels: entry.levels } : {}), ...(entry?.options ? { options: entry.options } : {}) };
}

// ─── What the model holds, read once per set ───

interface Frame { id: number; a: V3; b: V3; sectionId: number; materialId: number; name?: string }

function frames(): Frame[] {
  const m = modelStore.model, out: Frame[] = [];
  for (const e of m.elements.values()) {
    const a = m.nodes.get(e.nodeI), b = m.nodes.get(e.nodeJ);
    if (!a || !b) continue;
    out.push({ id: e.id, a: { x: a.x, y: a.y, z: a.z ?? 0 }, b: { x: b.x, y: b.y, z: b.z ?? 0 }, sectionId: e.sectionId, materialId: e.materialId, ...(e.name ? { name: e.name } : {}) });
  }
  return out.sort((p, q) => p.id - q.id);
}

const isVertical = (f: Frame) => Math.hypot(f.b.x - f.a.x, f.b.y - f.a.y) < TOL && Math.abs(f.b.z - f.a.z) > TOL;
const isLevel = (f: Frame) => Math.abs(f.b.z - f.a.z) < TOL;

function isSteelFrame(f: Frame): boolean {
  const mat = modelStore.model.materials.get(f.materialId);
  return materialFamilyOf(mat as never, catalogueGradeFamily).family === 'steel';
}

function gridOf(): { axes: PlanAxis[]; levels: Array<{ name: string; z: number }> } {
  const m = modelStore.model;
  const g = m.grid ?? gridFromModel(m.nodes.values(), m.elements.values());
  const levels = sortedLevels(g).map((l) => ({ name: l.name, z: l.z }));
  // Without declared levels, the elevations the beams sit at.
  if (levels.length === 0) {
    const zs = [...new Set(frames().filter((f) => isLevel(f) && !isVertical(f)).map((f) => Math.round(f.a.z * 100) / 100))].sort((a, b) => a - b);
    zs.filter((z) => z > TOL).forEach((z, i) => levels.push({ name: `N${i + 1}`, z }));
  }
  // The lowest level is the base the building stands on; every level above it is a floor, a
  // ground floor over a basement included.
  const base = Math.min(0, ...levels.map((l) => l.z));
  return { axes: g.axes.map((a) => ({ name: a.name, axis: a.axis, at: a.at })), levels: levels.filter((l) => l.z > base + TOL) };
}

function sectionOf(id: number): PlanColumn['section'] {
  const s = modelStore.model.sections.get(id);
  if (!s) return { kind: 'other', label: '?', b: 0.3, h: 0.3 };
  const shaped = columnShapeOf(s as never);
  if (shaped?.kind === 'circle') return { kind: 'circle', D: shaped.D };
  if (s.b && s.h && (!s.shape || s.shape === 'rect')) return { kind: 'rect', b: s.b, h: s.h, ...(s.rotation ? { rotDeg: s.rotation } : {}) };
  return { kind: 'other', label: s.name, b: s.b ?? 0.3, h: s.h ?? 0.3 };
}

/**
 * Column names by plan position: the physical column's where every position has one, the name
 * the desk and the listings give it (`member-names.ts`); otherwise by position, top row first and
 * left to right, the way plans are read.
 */
function columnNames(cols: readonly Frame[]): Map<string, string> {
  const at = [...new Map(cols.map((c) => [`${c.a.x.toFixed(2)},${c.a.y.toFixed(2)}`, { x: c.a.x, y: c.a.y, id: c.id }])).entries()];
  const names = memberNames();
  const physical = at.map(([k, p]) => [k, names.physical(p.id)] as const);
  if (physical.every(([, n]) => !!n) && new Set(physical.map(([, n]) => n)).size === physical.length) return new Map(physical as Array<[string, string]>);
  at.sort((p, q) => (Math.abs(q[1].y - p[1].y) > TOL ? q[1].y - p[1].y : p[1].x - q[1].x));
  return new Map(at.map(([k], i) => [k, `C${i + 1}`]));
}
const posKey = (p: V2) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;

/** The name the column schedule gives the column at a plan point («C8»), so the editor reads the same. */
export function planColumnName(): (x: number, y: number) => string | undefined {
  const names = columnNames(frames().filter(isVertical));
  return (x, y) => names.get(posKey({ x, y }));
}

// ─── The drawings ───

function formwork(c: PlanContext, axes: PlanAxis[], levels: Array<{ name: string; z: number }>): DrawingInput[] {
  const all = frames().filter((f) => !isSteelFrame(f));
  const cols = all.filter(isVertical), names = columnNames(cols);
  const groups = physicalGroups(), m = modelStore.model;
  const out: DrawingInput[] = [];
  levels.forEach((lv, li) => {
    const columns: PlanColumn[] = cols.filter((f) => Math.min(f.a.z, f.b.z) < lv.z - TOL && Math.max(f.a.z, f.b.z) > lv.z - TOL)
      .map((f) => ({ name: names.get(posKey(f.a)) ?? `C${f.id}`, at: f.a, section: sectionOf(f.sectionId) }));
    // One beam per span between supports, named as the desk names it (`member-names.ts`): the
    // pieces the slab's mesh cut it into are one beam on the plan.
    const named = memberNames(), spansDrawn = new Set<string>();
    const P = (id: number) => { const n = m.nodes.get(id)!; return { x: n.x, y: n.y, z: n.z ?? 0 }; };
    const beams: PlanBeam[] = mergeCollinearBeams(all.filter((f) => !isVertical(f) && isLevel(f) && Math.abs(f.a.z - lv.z) < TOL).flatMap((f) => {
      const s = m.sections.get(f.sectionId);
      const sp = named.span(f.id);
      if (sp && spansDrawn.has(sp.key)) return [];
      if (sp) spansDrawn.add(sp.key);
      return [{ name: named.name(f.id), a: sp ? P(sp.start) : f.a, b: sp ? P(sp.end) : f.b, width: s?.b ?? 0.2, depth: s?.h ?? 0.5 }];
    }));
    const slabs: PlanSlab[] = [], walls: PlanWall[] = [];
    for (const g of groups) {
      const ids = [...(g.members.quads ?? []).map((q) => m.quads.get(q)?.nodes), ...(g.members.plates ?? []).map((p) => m.plates.get(p)?.nodes)].flat().filter((n): n is number => n !== undefined);
      const pts = ids.map((n) => m.nodes.get(n)).filter((n): n is NonNullable<typeof n> => !!n).map((n) => ({ x: n.x, y: n.y, z: n.z ?? 0 }));
      if (pts.length < 3) continue;
      if (g.physical.kind === 'slab' && pts.every((p) => Math.abs(p.z - lv.z) < TOL)) {
        const loops = boundaryLoops(shellFaces(g.members), (n) => m.nodes.get(n));
        const waffle = loops.length ? waffleOf(g, loops) : undefined;
        slabs.push({ name: `L${(li + 1) * 100 + slabs.length + 1}`, outline: loops[0] ?? hull(pts), ...(loops.length > 1 ? { holes: loops.slice(1) } : {}), thickness: physicalThickness(g) ?? 0.12, ...(waffle ? { waffle } : {}) });
      } else if (g.physical.kind === 'wall' && Math.min(...pts.map((p) => p.z)) < lv.z - TOL && Math.max(...pts.map((p) => p.z)) > lv.z - TOL) {
        const [a, b] = farthest(pts);
        walls.push({ name: g.name || `T${walls.length + 1}`, a, b, thickness: physicalThickness(g) ?? 0.2 });
      }
    }
    if (!columns.length && !beams.length && !slabs.length) return;
    const box = boxOf([...columns.map((p) => ({ x: p.at.x * 1000, y: p.at.y * 1000 })), ...beams.flatMap((b) => [{ x: b.a.x * 1000, y: b.a.y * 1000 }, { x: b.b.x * 1000, y: b.b.y * 1000 }])]);
    out.push(formworkPlan({ level: lv, axes, columns, beams, slabs, walls, scale: planScale(box, c.format) }, c.tr('plan.fw.title', { level: lv.name }), (v) => c.fmt(v, 2)));
  });
  return out;
}

function columnScheduleOf(c: PlanContext, levels: Array<{ name: string; z: number }>): DrawingInput[] {
  const m = modelStore.model, all = frames().filter(isVertical), names = columnNames(all);
  const stacks = columnStacks({ nodes: m.nodes, elements: m.elements as never, columns: all.map((f) => f.id) });
  const levelName = (z: number) => levels.find((l) => Math.abs(l.z - z) < TOL)?.name ?? `+${c.fmt(z, 2)}`;
  const cols: ScheduleColumn[] = stacks.map((st) => ({
    name: names.get(posKey(st)) ?? st.key,
    lifts: st.lifts.map((l): ColumnLift => {
      const e = m.elements.get(l.id), r = e?.reinforcement, steel = e ? isSteelFrame({ materialId: e.materialId } as Frame) : false;
      const sec = sectionOf(l.sectionId);
      const section: ColumnLift['section'] = steel ? { kind: 'steel', profile: m.sections.get(l.sectionId)?.name ?? '?' } : sec.kind === 'other' ? { kind: 'other', label: sec.label } : sec.kind === 'rect' ? { kind: 'rect', b: sec.b, h: sec.h } : sec;
      const bars: ColumnLift['bars'] = r?.column ? { kind: 'faces', corner: r.column.cornerDia, face: r.column.faceDia, nB: r.column.nBottom, nT: r.column.nTop, nL: r.column.nLeft, nR: r.column.nRight }
        : r?.shaped ? { kind: 'count', count: r.shaped.count, diameter: r.shaped.diameter }
        : r?.longitudinal ? { kind: 'count', count: r.longitudinal.count, diameter: r.longitudinal.diameter } : undefined;
      const ties = r?.stirrups ? { diameter: r.stirrups.diameter, spacing: r.stirrups.spacing, ...(r.tieZones ? { endSpacing: r.tieZones.endSpacing, endLength: r.tieZones.endLength } : {}) } : undefined;
      return { level: levelName(l.zHi), zLo: l.zLo, zHi: l.zHi, section, ...(bars ? { bars } : {}), ...(ties ? { ties } : {}) };
    }),
  }));
  return columnSchedule(cols, c.tr);
}

/** Beam lines: level frames on one straight line at one level, in order along it. */
function beamLines(axes: PlanAxis[]): Array<{ id: string; spans: Frame[] }> {
  const beams = frames().filter((f) => !isVertical(f) && isLevel(f) && !isSteelFrame(f));
  const by = new Map<string, Frame[]>();
  for (const f of beams) {
    const dx = f.b.x - f.a.x, dy = f.b.y - f.a.y, L = Math.hypot(dx, dy) || 1;
    const along = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    const off = along === 'x' ? f.a.y : f.a.x;
    const ax = axes.find((a) => a.axis === (along === 'x' ? 'y' : 'x') && Math.abs(a.at - off) < TOL);
    const key = `${f.a.z.toFixed(2)}|${along}|${ax ? ax.name : off.toFixed(2)}`;
    if (Math.abs(dx / L) > 0.02 && Math.abs(dy / L) > 0.02) continue; // skewed beams have no line
    by.set(key, [...(by.get(key) ?? []), f]);
  }
  // Level by level from the bottom, and on each level by the axis's name, the way a set is read.
  const entries = [...by.entries()].sort(([a], [b]) => {
    const [za, , na] = a.split('|'), [zb, , nb] = b.split('|');
    return Number(za) - Number(zb) || na!.localeCompare(nb!, undefined, { numeric: true });
  });
  return entries.map(([k, fs]) => {
    const [z, along, name] = k.split('|');
    fs.sort((p, q) => (along === 'x' ? Math.min(p.a.x, p.b.x) - Math.min(q.a.x, q.b.x) : Math.min(p.a.y, p.b.y) - Math.min(q.a.y, q.b.y)));
    // The pieces the slab's mesh cut a span into are one span: its first piece stands for it.
    const named = memberNames(), seen = new Set<string>(), spans: Frame[] = [];
    for (const f of fs) {
      const sp = named.span(f.id);
      if (sp && seen.has(sp.key)) continue;
      if (sp) seen.add(sp.key);
      const P = (id: number) => { const n = modelStore.model.nodes.get(id)!; return { x: n.x, y: n.y, z: n.z ?? 0 }; };
      spans.push(sp ? { ...f, id: sp.representative, a: P(sp.start), b: P(sp.end), name: named.name(f.id) } : f);
    }
    return { id: `${name} +${Number(z).toFixed(2)}`, spans };
  });
}

function beams(c: PlanContext, doc: DocumentModel | null, axes: PlanAxis[]): DrawingInput[] {
  const m = modelStore.model, out: DrawingInput[] = [];
  // The zones a saved line draws, as drawn (`line-bars.ts`), each in its member's own sense.
  const drawn = savedLinePieces().pieces;
  for (const line of beamLines(axes)) {
    const spans: StirrupSpan[] = line.spans.map((f, i) => {
      const reg = m.elements.get(f.id)?.reinforcement?.regions;
      const len = Math.hypot(f.b.x - f.a.x, f.b.y - f.a.y);
      const own = drawn.get(f.id)?.stirrups;
      // The sheet lays each span from its low end (x, or y on a line along y); a member whose i
      // node is at the high end reads its zones mirrored.
      const el = m.elements.get(f.id), ni = el && m.nodes.get(el.nodeI), nj = el && m.nodes.get(el.nodeJ);
      const alongX = Math.abs(f.b.x - f.a.x) >= Math.abs(f.b.y - f.a.y);
      const flip = !!ni && !!nj && (alongX ? ni.x > nj.x : ni.y > nj.y);
      return {
        name: f.name && f.name.length <= 6 ? f.name : `${i + 1}`, length: len,
        ...(own?.length ? { drawn: own.map((z) => (flip ? { from: len - z.to, to: len - z.from, diameter: z.diameter, spacing: z.spacing } : { from: z.from, to: z.to, diameter: z.diameter, spacing: z.spacing })) } : {}),
        ...(reg?.stirrupsSupport ? { support: { diameter: reg.stirrupsSupport.diameter, spacing: reg.stirrupsSupport.spacing, length: reg.regionT ?? len / 4 } } : {}),
        ...(reg?.stirrupsSpan ? { span: { diameter: reg.stirrupsSpan.diameter, spacing: reg.stirrupsSpan.spacing } } : {}),
      };
    });
    // Each line on sheets of its own: its stirrups and its breakdown, never beside another line's.
    const group = c.tr('plan.beam.line', { line: line.id });
    const z = stirrupZones(line.id, spans, c.tr);
    if (z) out.push({ ...z, group });
    // The breakdown of the assemblies that hold this line's beams.
    // The line's own bars: those of its spans' pieces. An assembly holds a whole level, and its
    // every mark under each line was a breakdown of the level, the same on every line's sheet.
    const named = memberNames();
    const ids = new Set(line.spans.flatMap((f) => named.span(f.id)?.elements ?? [f.id]));
    const ownBar = (a: { bars: ReadonlyArray<{ id: string; ownerElementIds: readonly number[] }> }, barId: string) => a.bars.find((b) => b.id === barId)?.ownerElementIds.some((id) => ids.has(id)) ?? false;
    const marks = (doc?.assemblies ?? []).filter((a) => a.elementIds.some((id) => ids.has(id))).flatMap((a) => a.source.marks.filter((mk) => mk.barIds.some((b) => ownBar(a, b))).map((mk) => {
      const r = rcShapeForMark(mk.barIds, (id) => a.bars.find((b) => b.id === id));
      return { mark: mk.mark, count: mk.quantity, diameter: mk.diameterMm, cut: mk.cuttingLength, ...(r?.ok ? { shape: r.diagram } : {}) };
    }));
    const b = barBreakdown(line.id, marks, c.tr, c.fmt);
    if (b) out.push({ ...b, group });
  }
  return out;
}

/** The node lists of a physical group's shells. */
function shellFaces(members: { quads?: readonly number[]; plates?: readonly number[] }): number[][] {
  const m = modelStore.model;
  const faces: Array<readonly number[] | undefined> = [...(members.quads ?? []).map((q) => m.quads.get(q)?.nodes), ...(members.plates ?? []).map((p) => m.plates.get(p)?.nodes)];
  return faces.filter((f): f is readonly number[] => !!f).map((f) => [...f]);
}

/**
 * A waffle slab's voids and solid zones for its formwork plan, from the rib geometry chosen for it
 * (the special floors' system) and the elements as deep as the ribs (its drops and solid bands).
 */
function waffleOf(g: ReturnType<typeof physicalGroups>[number], loops: Array<Array<{ x: number; y: number }>>): PlanSlab['waffle'] {
  const rib = g.physical.typology === 'waffle' ? designData().specialFloors?.systems?.[`S${g.id}`]?.ribbed : undefined;
  if (!rib) return undefined;
  const m = modelStore.model;
  const solidBoxes = (g.members.quads ?? []).flatMap((id) => {
    const q = m.quads.get(id);
    if (!q || q.thickness < rib.h - 1e-3) return [];
    const ps = q.nodes.map((n) => m.nodes.get(n)!).filter(Boolean);
    return [{ x0: Math.min(...ps.map((p) => p.x)), x1: Math.max(...ps.map((p) => p.x)), y0: Math.min(...ps.map((p) => p.y)), y1: Math.max(...ps.map((p) => p.y)) }];
  });
  const solids = mergeBoxes(solidBoxes);
  const voids = waffleVoids({ loops, solids, spacingX: rib.spacingX, spacingY: rib.spacingY ?? rib.spacingX, ribWidth: rib.ribBottom });
  const cm = (v: number) => Math.round(v * 100);
  return { voids, solids, label: `${cm(rib.h - rib.c)}+${cm(rib.c)} · ${cm(rib.spacingX)}×${cm(rib.spacingY ?? rib.spacingX)}` };
}

/** The level's slab panels with the bars they hold: the person's where saved, else the design's. */
export function levelSlabPanels(): Array<PlanSlabPanel & { z: number }> {
  const m = modelStore.model, saved = storedDecisions().slabs ?? {};
  const out: Array<PlanSlabPanel & { z: number }> = [];
  for (const s of detailingStore.lastFloorRun?.slabs ?? []) {
    if (!s.panel) continue;
    // The panel's level, from the first element it reads (a quad or a plate of its mesh).
    const id = s.panel.input.elements[0]?.id ?? Number(s.panelId.replace(/^P/, ''));
    const shell = m.quads.get(id) ?? m.plates.get(id);
    const n = shell && m.nodes.get((shell as { nodes: number[] }).nodes[0]!);
    const i = s.panel.input;
    const outline = boundaryLoops(i.elements.map((e) => (m.quads.get(e.id) ?? m.plates.get(e.id))?.nodes ?? []), (k) => m.nodes.get(k));
    out.push({ id: s.panelId, x0: i.x0, x1: i.x1, y0: i.y0, y1: i.y1, reinforcement: saved[s.panelId] ?? s.panel.reinforcement, z: n?.z ?? 0, ...(outline.length ? { outline } : {}) });
  }
  return out;
}

function slabPlans(c: PlanContext, axes: PlanAxis[], levels: Array<{ name: string; z: number }>): DrawingInput[] {
  const panels = levelSlabPanels(), out: DrawingInput[] = [];
  const zs = [...new Set(panels.map((p) => Math.round(p.z * 100) / 100))].sort((a, b) => a - b).filter((z) => !c.levels || c.levels.some((w) => Math.abs(w - z) < TOL));
  for (const z of zs) {
    const here = panels.filter((p) => Math.abs(p.z - z) < TOL);
    const name = levels.find((l) => Math.abs(l.z - z) < TOL)?.name ?? `+${c.fmt(z, 2)}`;
    const marks = slabMarks(here);
    const box = boxOf(here.flatMap((p) => [{ x: p.x0 * 1000, y: p.y0 * 1000 }, { x: p.x1 * 1000, y: p.y1 * 1000 }]));
    const scale = planScale({ x0: box.x0 - 1500, y0: box.y0 - 1500, x1: box.x1 + 1500, y1: box.y1 + 1500 }, c.format);
    for (const layer of SLAB_LAYERS) { const d = slabLayerPlan(name, layer, here, marks, axes, scale, c.tr, c.fmt); if (d) out.push(d); }
    const b = slabBreakdown(name, marks, c.tr, c.fmt);
    if (b) out.push({ ...b, table: true });
  }
  return out;
}

// ─── The sheets the set lacked (`sheets/plans/extra-plans.ts`) ───

/** The columns standing on the lowest level, by their schedule names. */
function baseColumns(): SetoutColumn[] {
  const m = modelStore.model, cols = frames().filter(isVertical);
  if (!cols.length) return [];
  const names = columnNames(cols), z0 = Math.min(...cols.map((f) => Math.min(f.a.z, f.b.z)));
  return cols.filter((f) => Math.abs(Math.min(f.a.z, f.b.z) - z0) < TOL).map((f) => {
    const sec = sectionOf(f.sectionId), e = m.elements.get(f.id);
    const b = sec.kind === 'rect' || sec.kind === 'other' ? sec.b : sec.kind === 'circle' ? sec.D : 0.3, h = sec.kind === 'rect' || sec.kind === 'other' ? sec.h : sec.kind === 'circle' ? sec.D : 0.3;
    return { name: names.get(posKey(f.a)) ?? `#${f.id}`, x: f.a.x, y: f.a.y, b, h, ...(e?.rollAngle ? { rotDeg: e.rollAngle } : {}) };
  });
}

function setout(c: PlanContext, axes: PlanAxis[]): DrawingInput[] {
  const cols = baseColumns();
  if (!cols.length) return [];
  const box = boxOf(cols.map((p) => ({ x: p.x * 1000, y: p.y * 1000 })));
  const o = c.options ?? {};
  const ref = o.ref === 'fixed' ? { kind: 'fixed' as const, x: Number(o.fx ?? 0), y: Number(o.fy ?? 0) } : { kind: 'centre' as const };
  return setoutPlan(c.tr('plan.setout.base'), cols, axes, planScale({ x0: box.x0 - 1500, y0: box.y0 - 1500, x1: box.x1 + 1500, y1: box.y1 + 1500 }, c.format), ref, c.tr, c.fmt, o.table !== false);
}

/** The reactions under each column base, per load case: what goes to the foundation. */
export function foundationLoads(): FoundationLoad[] {
  const m = modelStore.model, cols = frames().filter(isVertical), names = columnNames(cols), out: FoundationLoad[] = [];
  const caseName = (id: number) => m.loadCases.find((lc) => lc.id === id)?.name ?? `#${id}`;
  for (const [cid, r] of resultsStore.perCase3D) {
    for (const re of r.reactions ?? []) {
      const n = m.nodes.get(re.nodeId);
      if (!n) continue;
      const name = names.get(posKey(n)) ?? `N${re.nodeId}`;
      out.push({ name, case: caseName(cid), n: re.fz, vx: re.fx, vy: re.fy, mx: re.mx, my: re.my });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) || a.case.localeCompare(b.case));
}

/** A floor's loads as applied, by case: on its beams, at its nodes, over its slabs. */
function appliedLoads(c: PlanContext, axes: PlanAxis[], levels: Array<{ name: string; z: number }>): DrawingInput[] {
  const m = modelStore.model, out: DrawingInput[] = [];
  const caseName = (id?: number) => m.loadCases.find((lc) => lc.id === (id ?? 1))?.name ?? '';
  const at = (id: number) => m.nodes.get(id);
  for (const lv of levels) {
    const on = (z?: number) => Math.abs((z ?? 0) - lv.z) < TOL;
    const loads: FloorLoads = { lines: [], points: [], areas: [] };
    for (const l of m.loads) {
      if (l.type === 'distributed3d') {
        const e = m.elements.get(l.data.elementId), a = e && at(e.nodeI), b = e && at(e.nodeJ);
        if (!a || !b || !on(a.z) || !on(b.z)) continue;
        const q = Math.max(Math.abs(l.data.qZI), Math.abs(l.data.qZJ), Math.abs(l.data.qYI), Math.abs(l.data.qYJ));
        loads.lines.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, text: `${c.fmt(q, 1)} kN/m · ${caseName(l.data.caseId)}` });
      } else if (l.type === 'nodal3d') {
        const n = at(l.data.nodeId);
        if (!n || !on(n.z)) continue;
        loads.points.push({ at: { x: n.x, y: n.y }, text: `${c.fmt(Math.hypot(l.data.fx, l.data.fy, l.data.fz), 1)} kN · ${caseName(l.data.caseId)}` });
      } else if (l.type === 'surface3d') {
        const q = m.quads.get(l.data.quadId) ?? m.plates.get(l.data.quadId);
        const pts = (q as { nodes?: number[] } | undefined)?.nodes?.map(at).filter((p): p is NonNullable<typeof p> => !!p) ?? [];
        if (pts.length < 3 || !pts.every((p) => on(p.z))) continue;
        loads.areas.push({ outline: pts.map((p) => ({ x: p.x, y: p.y })), text: `${c.fmt(l.data.q, 2)} kPa` });
      }
    }
    // Shells of one slab carry the same load: one text per value, not one per shell.
    const seen = new Set<string>();
    loads.areas = loads.areas.map((a) => { const t = seen.has(a.text) ? '' : a.text; seen.add(a.text); return { ...a, text: t }; });
    const pts = [...loads.lines.flatMap((l) => [l.a, l.b]), ...loads.points.map((p) => p.at), ...loads.areas.flatMap((a) => a.outline)];
    if (!pts.length) continue;
    const box = boxOf(pts.map((p) => ({ x: p.x * 1000, y: p.y * 1000 })));
    const d = appliedLoadsPlan(lv.name, loads, axes, planScale({ x0: box.x0 - 1500, y0: box.y0 - 1500, x1: box.x1 + 1500, y1: box.y1 + 1500 }, c.format), c.tr);
    if (d) out.push(d);
  }
  return out;
}

/** Each column stack at full height with its laps and its breakdown. */
function columnElevations(c: PlanContext, levels: Array<{ name: string; z: number }>): DrawingInput[] {
  const m = modelStore.model, cols = frames().filter(isVertical), names = columnNames(cols);
  const stacks = columnStacks({ nodes: m.nodes, elements: m.elements as never, columns: cols.map((f) => f.id) });
  const levelName = (z: number) => levels.find((l) => Math.abs(l.z - z) < TOL)?.name ?? `+${c.fmt(z, 2)}`;
  const dd = designData(), out: DrawingInput[] = [];
  for (const st of stacks) {
    const name = names.get(posKey(st)) ?? st.key;
    const lifts = st.lifts.map((l) => {
      const e = m.elements.get(l.id), r = e?.reinforcement, sec = sectionOf(l.sectionId);
      const n = r?.column ? 4 + r.column.nBottom + r.column.nTop + r.column.nLeft + r.column.nRight : r?.shaped?.count ?? r?.longitudinal?.count;
      const dia = r?.column?.cornerDia ?? r?.shaped?.diameter ?? r?.longitudinal?.diameter;
      const fc = verificationStore.contextFor(l.id)?.material.fc ?? 25;
      const lap = columnLapOf(l.id) ?? (dia ? anchorageFunctions({ fy: dd.rebarFy, fc, favourableSpacing: true, psiT: 1, edition: CIRSOC201_DESIGN_EDITION } as never).lapSplice(dia) : 0);
      // The joint above: the deepest beam framing in at the lift's top.
      const top = [...m.elements.values()].filter((x) => x.id !== l.id && (x.nodeI === (e?.nodeJ ?? -1) || x.nodeJ === (e?.nodeJ ?? -1) || x.nodeI === (e?.nodeI ?? -1) || x.nodeJ === (e?.nodeI ?? -1)))
        .filter((x) => { const a = m.nodes.get(x.nodeI), b = m.nodes.get(x.nodeJ); return !!a && !!b && Math.abs((a.z ?? 0) - (b.z ?? 0)) < 1e-6 && Math.abs((a.z ?? 0) - l.zHi) < TOL; })
        .map((x) => m.sections.get(x.sectionId)?.h ?? 0);
      const b = sec.kind === 'rect' || sec.kind === 'other' ? sec.b : sec.kind === 'circle' ? sec.D : 0.3;
      return {
        level: levelName(l.zHi), zLo: l.zLo, zHi: l.zHi, b,
        bars: n && dia ? `${n}Ø${dia}` : '—', ...(dia ? { barDia: dia } : {}), ...(n ? { barCount: n } : {}),
        ties: r?.stirrups ? `eØ${r.stirrups.diameter} c/${Math.round(r.stirrups.spacing * 100)}` : '—',
        lap, joint: top.length ? Math.max(...top) : 0,
      };
    });
    out.push(...columnElevation(name, lifts, c.tr, c.fmt, c.options?.table !== false));
  }
  return out;
}

function wallElevations(c: PlanContext): DrawingInput[] {
  const saved = storedDecisions().walls ?? {};
  const walls = detailingStore.lastFloorRun?.walls ?? [];
  const named = wallNames(walls);
  return walls.map((w) => {
    const r = saved[w.wallId] ?? w.reinforcement;
    return wallElevation({ id: w.wallId, name: named.get(w.wallId) ?? w.wallId, length: w.input.length, height: w.input.height, vertical: r.vertical, horizontal: r.horizontal, curtains: r.curtains, ...(r.boundary ? { boundary: r.boundary } : {}), ...(r.openings ? { openings: r.openings } : {}) }, c.tr, c.fmt);
  });
}

function corbels(c: PlanContext): DrawingInput[] {
  return corbelChecks().flatMap((k) => (k.design ? [corbelDrawing({
    name: k.entry.name, bw: k.entry.bw, h: k.entry.h, ...(k.entry.hEdge ? { hEdge: k.entry.hEdge } : {}), d: k.entry.d, av: k.entry.av,
    asPrimary: k.design.asPrimary, ah: k.design.ah, ...(k.entry.ascProvided !== undefined ? { ascProvided: k.entry.ascProvided } : {}), ...(k.entry.ahProvided !== undefined ? { ahProvided: k.entry.ahProvided } : {}),
    status: c.tr(`plan.corbel.status.${k.status}`),
  }, c.tr, c.fmt)] : []));
}

function foundations(c: PlanContext, axes: PlanAxis[]): DrawingInput[] {
  const m = modelStore.model, run = detailingStore.footingRunStale ? null : detailingStore.lastFootingRun;
  const fs: PlanFooting[] = [...m.footings.values()].sort((a, b) => a.id - b.id).map((f, i) => {
    const n = m.nodes.get(f.nodeId), col = f.columnElementId !== undefined ? m.elements.get(f.columnElementId) : undefined;
    const o = run?.outcomes.find((x) => x.footingId === f.id);
    const g = o?.general?.mats;
    const dir = (d?: { diameterMm: number; barCount: number; distributionWidth: number } | null) => (d && d.barCount > 1 ? { diameter: d.diameterMm, spacing: d.distributionWidth / (d.barCount - 1) } : undefined);
    const mats = f.mats ? { bottomX: { diameter: f.mats.bottomX.diameterMm, spacing: f.mats.bottomX.spacing }, bottomY: { diameter: f.mats.bottomY.diameterMm, spacing: f.mats.bottomY.spacing }, ...(f.mats.topX ? { topX: { diameter: f.mats.topX.diameterMm, spacing: f.mats.topX.spacing } } : {}), ...(f.mats.topY ? { topY: { diameter: f.mats.topY.diameterMm, spacing: f.mats.topY.spacing } } : {}) }
      : g ? { bottomX: { diameter: g.bottomX.diameterMm, spacing: g.bottomX.spacing }, bottomY: { diameter: g.bottomY.diameterMm, spacing: g.bottomY.spacing }, ...(g.topX ? { topX: { diameter: g.topX.diameterMm, spacing: g.topX.spacing } } : {}), ...(g.topY ? { topY: { diameter: g.topY.diameterMm, spacing: g.topY.spacing } } : {}) }
      : o?.mat ? { ...(dir(o.mat.x) ? { bottomX: dir(o.mat.x)! } : {}), ...(dir(o.mat.y) ? { bottomY: dir(o.mat.y)! } : {}) } : undefined;
    return {
      name: `Z${i + 1}`, at: { x: n?.x ?? 0, y: n?.y ?? 0 }, B: f.B, L: f.L, thickness: f.thickness, rotDeg: f.rotationDeg ?? 0,
      ecc: { x: f.eccentricityB ?? 0, y: f.eccentricityL ?? 0 }, founding: f.foundingElevation, kind: f.kind,
      ...(col && n ? { column: { name: '', at: { x: n.x, y: n.y }, section: sectionOf(col.sectionId) } } : {}),
      ...(mats ? { mats } : {}),
    };
  });
  if (fs.length === 0) return [];
  const box = boxOf(fs.map((f) => ({ x: f.at.x * 1000, y: f.at.y * 1000 })));
  return foundationPlan(fs, axes, planScale({ x0: box.x0 - 1500, y0: box.y0 - 1500, x1: box.x1 + 1500, y1: box.y1 + 1500 }, c.format), c.tr, (v) => c.fmt(v, 2));
}

function punching(c: PlanContext, axes: PlanAxis[]): DrawingInput[] {
  const m = modelStore.model, out: DrawingInput[] = [];
  for (const a of detailingStore.assemblies) {
    for (const r of a.families ?? []) {
      if (r.family !== 'slab' || r.punching.length === 0) continue;
      const joints: PunchingJoint[] = r.punching.map((p) => {
        const n = m.nodes.get(p.nodeId);
        return {
          name: `N${p.nodeId}`, at: p.at ?? { x: n?.x ?? 0, y: n?.y ?? 0 },
          ...(p.perimeter ? { halfX: p.perimeter.halfX, halfY: p.perimeter.halfY, d: p.perimeter.d } : {}),
          utilization: p.utilization, status: p.status,
          ...(p.reinforcement && !p.reinforcement.overCeiling ? { reinforcement: p.reinforcement } : {}),
        };
      });
      const box = boxOf(joints.map((j) => ({ x: j.at.x * 1000, y: j.at.y * 1000 })));
      const d = punchingPlan(c.tr('plan.punch.title', { slab: r.ownerId }), null, joints, axes, planScale({ x0: box.x0 - 2000, y0: box.y0 - 2000, x1: box.x1 + 2000, y1: box.y1 + 2000 }, c.format), c.tr, c.fmt);
      if (d) out.push(d);
    }
  }
  return out;
}

function steelMembers(): SteelMember[] {
  const m = modelStore.model;
  return frames().filter(isSteelFrame).map((f) => ({
    name: f.name && f.name.length <= 8 ? f.name : `${f.id}`, a: f.a, b: f.b, profile: m.sections.get(f.sectionId)?.name ?? '?',
    role: isVertical(f) ? 'column' : isLevel(f) ? 'beam' : 'brace',
  }));
}

function steel(c: PlanContext, axes: PlanAxis[], levels: Array<{ name: string; z: number }>): DrawingInput[] {
  const ms = steelMembers();
  if (ms.length === 0) return [];
  const box = boxOf(ms.flatMap((s) => [{ x: s.a.x * 1000, y: s.a.y * 1000 }, { x: s.b.x * 1000, y: s.b.y * 1000 }]));
  const s = planScale(box, c.format), out: DrawingInput[] = [];
  const zs = levels.length ? levels : [...new Set(ms.filter((x) => x.role === 'beam').map((x) => x.a.z))].map((z, i) => ({ name: `N${i + 1}`, z }));
  for (const lv of zs) { const d = steelLevelPlan(lv, ms, axes, s, c.tr('plan.steel.levelPlan', { level: lv.name }), (v) => c.fmt(v, 2)); if (d) out.push(d); }
  // Frames: one per axis; without axes, one per distinct column line.
  const lines = axes.length ? axes : [...new Set(ms.filter((x) => x.role === 'column').map((x) => x.a.x.toFixed(2)))].map((v, i) => ({ name: `${i + 1}`, axis: 'x' as const, at: Number(v) }));
  for (const a of lines) {
    const dir = a.axis === 'x' ? { x: 0, y: 1 } : { x: 1, y: 0 }, origin = a.axis === 'x' ? { x: a.at, y: 0 } : { x: 0, y: a.at };
    const inPlane = ms.filter((x) => (a.axis === 'x' ? Math.abs(x.a.x - a.at) < TOL && Math.abs(x.b.x - a.at) < TOL : Math.abs(x.a.y - a.at) < TOL && Math.abs(x.b.y - a.at) < TOL));
    if (inPlane.length < 2) continue;
    const fb = boxOf(inPlane.flatMap((x) => [{ x: (a.axis === 'x' ? x.a.y : x.a.x) * 1000, y: x.a.z * 1000 }, { x: (a.axis === 'x' ? x.b.y : x.b.x) * 1000, y: x.b.z * 1000 }]));
    const d = steelFrameElevation(a.name, origin, dir, ms, planScale(fb, c.format), c.tr('plan.steel.frame', { axis: a.name }));
    if (d) out.push(d);
  }
  return out;
}

const base = (k: string) => k === 'basePinned' || k === 'baseFixed';

function jointDesigns() {
  return steelJoints().map((j) => ({ ...j, design: jointDesignStore.designFor(j.nodeId, j.elementIds).typology })).filter((j) => j.design && j.design.state !== 'unresolved');
}

function anchors(c: PlanContext, axes: PlanAxis[]): DrawingInput[] {
  const m = modelStore.model;
  const bases: SteelBase[] = jointDesigns().filter((j) => j.design!.kind === 'basePinned' || j.design!.kind === 'baseFixed').map((j, i) => {
    const n = m.nodes.get(j.nodeId), p = j.design!.params;
    return {
      name: `PB${i + 1}`, at: { x: n?.x ?? 0, y: n?.y ?? 0 }, N: p.plateN ?? 300, B: p.plateB ?? 300, t: p.plateT, anchorD: p.anchorD ?? 20,
      anchors: j.design!.parts.filter((q) => q.kind === 'anchor').map((q) => ({ x: q.center.x, y: q.center.y })), kind: c.tr(`joint.typ.kind.${j.design!.kind}`),
    };
  });
  if (bases.length === 0) return [];
  const box = boxOf(bases.map((b) => ({ x: b.at.x * 1000, y: b.at.y * 1000 })));
  return anchorPlan(bases, axes, planScale({ x0: box.x0 - 1000, y0: box.y0 - 1000, x1: box.x1 + 1000, y1: box.y1 + 1000 }, c.format), c.tr);
}

/**
 * One sheet per TYPE of joint: joints with the same typology, parameters and member profiles are
 * the same piece of fabrication, drawn once and listed by node, the way a joint schedule is read.
 */
function joints(c: PlanContext): DrawingInput[] {
  const m = modelStore.model, ms = new Map(frames().map((f) => [f.id, f]));
  const groups = new Map<string, Array<ReturnType<typeof jointDesigns>[number]>>();
  for (const j of jointDesigns()) {
    const d = j.design!;
    const profiles = j.elementIds.map((id) => m.sections.get(ms.get(id)?.sectionId ?? -1)?.name ?? '?').sort();
    const key = JSON.stringify([d.kind, d.params, profiles]);
    groups.set(key, [...(groups.get(key) ?? []), j]);
  }
  return [...groups.values()].flatMap((g, i) => {
    const j = g[0]!, n = m.nodes.get(j.nodeId), d = j.design!;
    const members = [d.mainId, ...j.elementIds.filter((x) => x !== d.mainId)].filter((x): x is number => x !== undefined).map((id) => ms.get(id)).filter((f): f is Frame => !!f)
      .map((f) => ({ name: `${f.id}`, a: f.a, b: f.b, profile: m.sections.get(f.sectionId)?.name ?? '?', role: 'beam' as const }));
    const p = d.params;
    const params: Array<[string, string]> = [
      [c.tr('plan.steel.p.nodes'), g.length > 8 ? `${g.slice(0, 8).map((x) => x.nodeId).join(', ')} … (${g.length})` : g.map((x) => x.nodeId).join(', ')],
      [c.tr('plan.steel.p.plateT'), `${p.plateT} mm`], [c.tr('plan.steel.p.bolts'), `Ø${p.boltD} ${p.boltGrade}`], [c.tr('plan.steel.p.rows'), String(p.rows)], [c.tr('plan.steel.p.weld'), `${p.weldLeg} mm`],
      // Plate plan and anchors are a base's; the other typologies carry them as defaults only.
      ...(base(d.kind) && p.plateN ? [[c.tr('plan.steel.p.plate'), `${p.plateN}×${p.plateB ?? p.plateN}`] as [string, string]] : []),
      ...(base(d.kind) && p.anchors ? [[c.tr('plan.steel.p.anchors'), `${p.anchors} Ø${p.anchorD ?? 20}`] as [string, string]] : []),
    ];
    return jointSheet({ name: `U${i + 1}`, kind: c.tr(`joint.typ.kind.${d.kind}`), parts: d.parts, members, at: { x: n?.x ?? 0, y: n?.y ?? 0, z: n?.z ?? 0 }, params }, c.tr);
  });
}

function notes(c: PlanContext, hasSteel: boolean): DrawingInput {
  const dd = designData(), conc = resolveConcreteProperties();
  const steelMat = hasSteel ? [...modelStore.model.materials.values()].find((x) => materialFamilyOf(x as never, catalogueGradeFamily).family === 'steel') : undefined;
  return generalNotes({
    ...(Number.isFinite(conc.fc) && conc.fc > 0 ? { concrete: `H-${Math.round(conc.fc)} (f'c = ${Math.round(conc.fc)} MPa)` } : {}),
    ...(dd.rebarGrade ? { rebar: `${dd.rebarGrade} (fy = ${dd.rebarFy ?? 420} MPa)` } : {}),
    ...(steelMat ? { steel: `${steelMat.name}${steelMat.fy ? ` (Fy = ${steelMat.fy} MPa)` : ''}` } : {}),
    covers: { beam: coverOf('beam'), column: coverOf('column'), slab: coverOf('slab'), wall: coverOf('wall'), footing: coverOf('footing') },
    ...(dd.exposure ? { exposure: String(dd.exposure) } : {}),
    codes: regulationsStore.stamps.map((s) => `${teAt(s.label, c.locale)} ${s.edition}`.trim()),
  }, c.tr);
}

function stairs(c: PlanContext): DrawingInput[] {
  const checks = stairChecks();
  const out = checks.map((s) => stairSection(`stair-${s.entry.id}`, c.tr('plan.stair.title', { name: s.entry.name }), s.entry, s.design, coverOf('slab'), c.tr, c.fmt));
  const schedule = stairSchedule(checks.map((s) => ({ name: s.entry.name, bars: s.design.bars })), c.tr, c.fmt);
  return schedule ? [...out, schedule] : out;
}

function tendons(c: PlanContext, axes: PlanAxis[]): DrawingInput[] {
  const panels = ptPanels(), plan = stressingPlan();
  const tp: TendonPanel[] = panels.map((p) => {
    const of = (dir: 'x' | 'y') => plan.find((q) => q.key === p.key && q.dir === dir);
    const x = of('x'), y = of('y');
    return { name: p.name, box: p.readings.x!.box, ...(x ? { x: { layout: x.layout, order: x.order } } : {}), ...(y ? { y: { layout: y.layout, order: y.order } } : {}) };
  }).filter((p) => p.x || p.y);
  if (!tp.length) return [];
  const box = boxOf(tp.flatMap((p) => [{ x: p.box.x0 * 1000, y: p.box.y0 * 1000 }, { x: p.box.x1 * 1000, y: p.box.y1 * 1000 }]));
  const out: DrawingInput[] = [];
  const planDrawing = tendonPlan(c.tr('plan.pt.planTitle'), tp, axes, planScale(box, c.format), c.tr);
  if (planDrawing) out.push(planDrawing);
  for (const p of panels) for (const dir of ['x', 'y'] as const) {
    const l = p.choice?.[dir], r = p.readings[dir];
    if (l && r && l.count > 0) out.push(tendonProfileDrawing(`tendon-${p.key}-${dir}`, c.tr('plan.pt.profileTitle', { name: p.name, dir }), p.h, r.span, l, c.tr, c.fmt));
  }
  return out;
}

/** The schedule of the works and one plan per phase: what it builds on its level over what stands. */
function phases(c: PlanContext, axes: PlanAxis[]): DrawingInput[] {
  const b = builtBy(siteData());
  const out: DrawingInput[] = [];
  const schedule = phaseSchedule(b.map((x) => ({ name: x.phase.name, start: x.phase.start, end: phaseEnd(x.phase), days: x.phase.days, members: x.keys.length })), c.tr);
  if (schedule) out.push(schedule);
  const m = modelStore.model, P2 = (id: number) => { const n = m.nodes.get(id)!; return { x: n.x, y: n.y ?? 0, z: n.z ?? 0 }; };
  const geometry = (keys: readonly string[], z: number): PhaseGeometry => {
    const g: PhaseGeometry = { lines: [], points: [], outlines: [] };
    for (const k of keys) {
      const e = expandKey(k);
      for (const id of e.elements) {
        const el = m.elements.get(id); if (!el) continue;
        const a = P2(el.nodeI), bb = P2(el.nodeJ);
        if (Math.hypot(bb.x - a.x, bb.y - a.y) < TOL) { if (Math.max(a.z, bb.z) > z - TOL && Math.min(a.z, bb.z) < z - TOL) g.points.push(a); }
        else if (Math.abs(a.z - z) < TOL && Math.abs(bb.z - z) < TOL) g.lines.push([a, bb]);
      }
      for (const id of e.quads) {
        const q = m.quads.get(id); if (!q) continue;
        const ps = q.nodes.map(P2), zs = ps.map((p) => p.z);
        if (Math.max(...zs) - Math.min(...zs) < TOL) { if (Math.abs(zs[0]! - z) < TOL) g.outlines.push(ps); }
        else if (Math.max(...zs) > z - TOL && Math.min(...zs) < z - TOL) { const lo = ps.filter((p) => Math.abs(p.z - Math.min(...zs)) < TOL); if (lo.length >= 2) g.lines.push([lo[0]!, lo[lo.length - 1]!]); }
      }
    }
    return g;
  };
  for (const x of b) {
    if (!x.keys.length) continue;
    const zs = x.keys.flatMap((k) => { const e = expandKey(k); return [...e.elements.flatMap((id) => { const el = m.elements.get(id); return el ? [P2(el.nodeI).z, P2(el.nodeJ).z] : []; }), ...e.quads.flatMap((id) => (m.quads.get(id)?.nodes ?? []).map((n) => P2(n).z))]; });
    if (!zs.length) continue;
    const z = Math.max(...zs), now = geometry(x.keys, z), before = geometry(x.before, z);
    const pts = [...now.lines.flat(), ...now.points, ...now.outlines.flat(), ...before.lines.flat()].map((p) => ({ x: p.x * 1000, y: p.y * 1000 }));
    if (!pts.length) continue;
    const d = phasePlan(`phase-${x.phase.id}`, c.tr('site.sheet.phase', { name: x.phase.name }), now, before, axes, planScale(boxOf(pts), c.format));
    if (d) out.push(d);
  }
  return out;
}

/**
 * The construction drawings of the kinds asked for, except `detailing`, in the set's order.
 * Without a document (nothing detailed yet, or a steel-only project) the plans that read the
 * model alone still come out; the breakdown and the bending schedule need the document's marks.
 */
export function workDrawings(doc: DocumentModel | null, kinds: ReadonlySet<PlanKind>, c: PlanContext): Map<PlanKind, DrawingInput[]> {
  const { axes, levels: all } = gridOf();
  // An entry that covers some levels only draws those (`SheetEntry.levels`).
  const levels = c.levels ? all.filter((l) => c.levels!.some((z) => Math.abs(z - l.z) < TOL)) : all;
  const hasSteel = frames().some(isSteelFrame);
  const out = new Map<PlanKind, DrawingInput[]>();
  const add = (k: PlanKind, f: () => DrawingInput[]) => { if (kinds.has(k)) out.set(k, f()); };
  add('notes', () => [notes(c, hasSteel)]);
  add('formwork', () => formwork(c, axes, levels));
  add('columns', () => columnScheduleOf(c, levels));
  add('beams', () => beams(c, doc, axes));
  add('slabs', () => slabPlans(c, axes, levels));
  add('setout', () => setout(c, axes));
  add('fdnLoads', () => foundationLoadsTable(foundationLoads(), c.tr, c.fmt));
  add('loads', () => appliedLoads(c, axes, levels));
  add('colElev', () => columnElevations(c, levels));
  add('walls', () => wallElevations(c));
  add('corbels', () => corbels(c));
  add('foundations', () => foundations(c, axes));
  add('punching', () => punching(c, axes));
  add('stairs', () => stairs(c));
  add('tendons', () => tendons(c, axes));
  add('steel', () => steel(c, axes, levels));
  add('anchors', () => anchors(c, axes));
  add('joints', () => joints(c));
  add('bbs', () => (doc ? bendingSchedule(doc, c.tr, c.fmt) : []));
  // The details kind draws what the catalogue places on it (`store/sheet-set.ts`, `sheets/details/catalog.ts`).
  add('details', () => []);
  add('phases', () => phases(c, axes));
  return out;
}

// ─── Plan geometry helpers ───

function hull(ps: readonly V2[]): V2[] {
  const s = [...ps].sort((a, b) => a.x - b.x || a.y - b.y);
  const cr = (o: V2, a: V2, b: V2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: V2[] = [], hi: V2[] = [];
  for (const q of s) { while (lo.length >= 2 && cr(lo[lo.length - 2]!, lo[lo.length - 1]!, q) <= 1e-12) lo.pop(); lo.push(q); }
  for (const q of [...s].reverse()) { while (hi.length >= 2 && cr(hi[hi.length - 2]!, hi[hi.length - 1]!, q) <= 1e-12) hi.pop(); hi.push(q); }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)].map((p) => ({ x: p.x, y: p.y }));
}

function farthest(ps: readonly V2[]): [V2, V2] {
  let best: [V2, V2] = [ps[0]!, ps[0]!], d = -1;
  for (const a of ps) for (const b of ps) { const e = Math.hypot(a.x - b.x, a.y - b.y); if (e > d) { d = e; best = [a, b]; } }
  return [{ x: best[0].x, y: best[0].y }, { x: best[1].x, y: best[1].y }];
}
