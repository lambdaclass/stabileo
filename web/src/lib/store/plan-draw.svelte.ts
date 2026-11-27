import { uiStore } from './ui.svelte';
import { modelStore } from './model.svelte';
import { buildingUi } from './building-ui.svelte';
import { t, tp } from '../i18n';
import type { Level } from '../model/grid';
import { typologyFamily } from '../model/building/typology-defaults';
import { storeyAt } from '../model/storeys';
import {
  beamAxis, beamFromFaces, beamFromRect, footprintAt, footprintCorners, footprintFromCorners, footprintFromSide,
  placeBeamOnPlan, placeColumnOnPlan, rectCorners, type Footprint, type P2, type PlanPlaced,
} from '../model/building/draw-on-plan';
import { framingAt, placeSlabOnPlan, slabFraming, type FramingAt, type SlabEdge } from '../model/building/slab-on-plan';
import { placeWallOnPlan } from '../model/building/wall-on-plan';

export type PlanDrawKind = 'column' | 'beam' | 'slab' | 'wall';
export type ColumnMode = 'point' | 'corners' | 'side';
export type BeamMode = 'rect' | 'axis' | 'faces';

const NEED: Record<ColumnMode | BeamMode, number> = { point: 1, corners: 2, side: 3, rect: 2, axis: 2, faces: 3 };

/** What a point snaps to while drawing on the plan, each turned on or off; `on` is all of them at once (F3). */
export const STRUCTURE_SNAPS = ['column', 'beam', 'node', 'axes', 'grid'] as const;
export type StructureSnap = (typeof STRUCTURE_SNAPS)[number];
const SNAP_KEY = 'stabileo-plan-snaps';
const snapDefaults = { on: true, template: true, column: true, beam: true, node: true, axes: true, grid: false };
const snap = $state<typeof snapDefaults>((() => {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SNAP_KEY) : null;
    if (raw) return { ...snapDefaults, ...(JSON.parse(raw) as Partial<typeof snapDefaults>) };
  } catch { /* private mode, or a value from elsewhere */ }
  return { ...snapDefaults };
})());
function saveSnaps() { try { localStorage.setItem(SNAP_KEY, JSON.stringify(snap)); } catch { /* not kept */ } }

let kind = $state<PlanDrawKind | null>(null);
let points = $state<P2[]>([]);
let hover = $state<P2 | null>(null);
let typed = $state('');
let ortho = $state(false);
/** Ortho kept on (F8), as Shift holds it while pressed. */
let orthoLock = $state(false);
const column = $state({ mode: 'corners' as ColumnMode, b: 0.3, h: 0.3, angle: 0, fixedPoint: [0, 0] as [number, number], levelFrom: '', levelTo: '', fixBase: true, typology: 'concrete', sectionId: null as number | null });
const beam = $state({ mode: 'rect' as BeamMode, width: 0.2, height: 0.5, align: 0 as -1 | 0 | 1, topFlush: true, typology: 'dropped', sectionId: null as number | null });
const slab = $state({ thickness: 0.15, typology: 'solid' });
/** What can carry a slab on the level being drawn, read once per model change rather than on every pointer move. */
let framingCache: { key: string; at: FramingAt } | null = null;
const wall = $state({ typology: 'concrete', meshSize: 1, fixBase: true });
let modeBefore: 'wireframe' | 'solid' | 'sections' | null = null;

const levels = (): Level[] => [...(modelStore.grid?.levels ?? [])].sort((a, b) => a.z - b.z);
const levelHere = (): Level | undefined => levels().find((l) => Math.abs(l.z - uiStore.nodeCreateZ) < 1e-6);
/** A storey's beams frame its ceiling: the next level up, or the level itself on the top one. */
const beamLevel = (): Level | undefined => (levelHere() ? storeyAt(levels(), uiStore.nodeCreateZ).ceiling ?? levelHere() : undefined);

/** Whether the next point draws a line from the last one, which is what Shift squares. */
const linear = () => points.length === 1 && ((kind === 'beam' && beam.mode !== 'rect') || (kind === 'column' && column.mode === 'side'));

function constrain(p: P2): P2 {
  const last = points[points.length - 1];
  if (!(ortho || orthoLock) || !last || !linear()) return p;
  return Math.abs(p.x - last.x) >= Math.abs(p.y - last.y) ? { x: p.x, y: last.y } : { x: last.x, y: p.y };
}

const mode = (): ColumnMode | BeamMode => (kind === 'column' ? column.mode : kind === 'beam' ? beam.mode : 'rect');

function band(a: P2, b: P2, width: number): P2[] {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1e-9) return [];
  const n = { x: -(b.y - a.y) / L * width / 2, y: (b.x - a.x) / L * width / 2 };
  return [{ x: a.x - n.x, y: a.y - n.y }, { x: b.x - n.x, y: b.y - n.y }, { x: b.x + n.x, y: b.y + n.y }, { x: a.x + n.x, y: a.y + n.y }];
}

function columnFootprint(pts: readonly P2[]): Footprint | null {
  if (column.mode === 'point') return pts[0] ? footprintAt(pts[0], column.b, column.h, column.angle, column.fixedPoint) : null;
  if (column.mode === 'corners') return pts.length >= 2 ? footprintFromCorners(pts[0]!, pts[1]!) : null;
  return pts.length >= 3 ? footprintFromSide(pts[0]!, pts[1]!, pts[2]!) : null;
}

function beamLine(pts: readonly P2[]): { a: P2; b: P2; width: number } | null {
  if (beam.mode === 'rect') return pts.length >= 2 ? beamFromRect(pts[0]!, pts[1]!) : null;
  if (beam.mode === 'axis') return pts.length >= 2 ? { ...beamAxis(pts[0]!, pts[1]!, beam.width, beam.align), width: beam.width } : null;
  return pts.length >= 3 ? beamFromFaces(pts[0]!, pts[1]!, pts[2]!) : null;
}

function report(r: PlanPlaced, what: 'column' | 'beam'): boolean {
  if (r.refused) uiStore.toast(t(`planDraw.refused.${r.refused}`), 'error');
  else if (r.created === 0) uiStore.toast(t('planDraw.nothing'), 'info');
  else uiStore.toast(tp(`planDraw.placed.${what}`, { n: r.bars.length }), 'success');
  return !r.refused;
}

function commit(pts: P2[]) {
  const level = levelHere();
  if (kind === 'column') {
    const f = columnFootprint(pts);
    points = [];
    if (!f) { uiStore.toast(t('planDraw.refused.size'), 'error'); return; }
    const all = levels();
    const from = column.levelFrom || level?.id || '';
    const start = all.find((l) => l.id === from);
    const to = column.levelTo || all.find((l) => l.z > (start?.z ?? Infinity) + 1e-6)?.id || '';
    const materialId = buildingUi.materialFor(typologyFamily('column', column.typology));
    const placed = report(placeColumnOnPlan({
      footprint: f, fixedPoint: column.fixedPoint, levels: all, levelFrom: from, levelTo: to, materialId,
      typology: column.typology, fixBase: column.fixBase, ...(column.sectionId !== null ? { sectionId: column.sectionId } : {}),
    }), 'column');
    if (placed && column.mode !== 'point' && column.sectionId === null) { column.b = Math.round(f.b * 100) / 100; column.h = Math.round(f.h * 100) / 100; }
    return;
  }
  const ceiling = beamLevel();
  if (kind === 'wall') {
    points = [];
    const line = beamFromRect(pts[0]!, pts[1]!);
    const top = storeyAt(levels(), uiStore.nodeCreateZ).ceiling;
    if (!level || !top) { uiStore.toast(t('planDraw.refused.levels'), 'error'); return; }
    if (!line) { uiStore.toast(t('planDraw.refused.size'), 'error'); return; }
    const r = placeWallOnPlan({ a: line.a, b: line.b, thickness: line.width, levels: levels(), levelFrom: level.id, levelTo: top.id,
      materialId: buildingUi.concreteId, meshSize: wall.meshSize, typology: wall.typology, fixBase: wall.fixBase });
    if (r.created === 0) uiStore.toast(t(r.refused === 'size' || r.refused === 'levels' ? `planDraw.refused.${r.refused}` : `building.refused.${r.refused ?? 'cannotMesh'}`), 'error');
    else uiStore.toast(tp('planDraw.placed.wall', { level: level.name, top: top.name, n: r.shells }), 'success');
    return;
  }
  if (kind === 'slab') {
    points = [];
    if (!ceiling) { uiStore.toast(t('planDraw.noLevel'), 'error'); return; }
    const r = placeSlabOnPlan({ corners: rectCorners(pts[0]!, pts[1]!), level: ceiling, thickness: slab.thickness, materialId: buildingUi.concreteId, typology: slab.typology });
    if (r.refused) { uiStore.toast(t(`planDraw.refused.${r.refused}`), 'error'); return; }
    const free = r.edges.filter((e) => e.support === 'free').length;
    uiStore.toast(free ? tp('planDraw.placed.slabFree', { n: free, level: ceiling.name }) : tp('planDraw.placed.slab', { level: ceiling.name }), free ? 'info' : 'success');
    return;
  }
  const line = beamLine(pts);
  if (!ceiling) { uiStore.toast(t('planDraw.noLevel'), 'error'); points = []; return; }
  if (!line) { uiStore.toast(t('planDraw.refused.size'), 'error'); points = []; return; }
  const materialId = buildingUi.materialFor(typologyFamily('beam', beam.typology));
  const placed = report(placeBeamOnPlan({
    a: line.a, b: line.b, width: line.width, height: beam.height, level: ceiling, materialId, typology: beam.typology, topFlush: beam.topFlush,
    ...(beam.sectionId !== null ? { sectionId: beam.sectionId } : {}),
  }), 'beam');
  if (placed && beam.mode !== 'axis' && beam.sectionId === null) beam.width = Math.round(line.width * 100) / 100;
  points = placed && beam.mode === 'axis' ? [pts[1]!] : [];
}

export const planDraw = {
  get active() { return kind !== null; },
  get kind() { return kind; },
  get points() { return points; },
  get hover() { return hover; },
  set hover(p: P2 | null) { hover = p ? constrain(p) : null; },
  get typed() { return typed; },
  get ortho() { return ortho; },
  set ortho(v: boolean) { ortho = v; },
  get orthoLock() { return orthoLock; },
  set orthoLock(v: boolean) { orthoLock = v; },
  /** The snaps, read by the viewport; set through `setSnap`, which keeps them for the next visit. */
  get snap(): Readonly<typeof snapDefaults> { return snap; },
  setSnap(k: keyof typeof snapDefaults, v: boolean) { snap[k] = v; saveSnaps(); },
  column,
  beam,
  slab,
  wall,
  get levels() { return levels(); },
  /** The level the next click lands on: the storey's floor for a column, its ceiling for a beam. */
  get z(): number { return kind === 'beam' || kind === 'slab' ? beamLevel()?.z ?? uiStore.nodeCreateZ : uiStore.nodeCreateZ; },
  /** The level a beam or a slab is placed on, while drawing them. */
  get beamLevel(): Level | undefined { return kind === 'beam' || kind === 'slab' ? beamLevel() : undefined; },
  /** The sides of the slab the next click would place, and what carries each. */
  get slabEdges(): SlabEdge[] {
    if (kind !== 'slab' || points.length !== 1 || !hover) return [];
    const z = beamLevel()?.z;
    if (z === undefined) return [];
    const key = `${modelStore.modelVersion}:${z}`;
    if (framingCache?.key !== key) framingCache = { key, at: framingAt(z) };
    return slabFraming(rectCorners(points[0]!, hover), z, framingCache.at);
  },
  /** What a click needs next, as a key of `planDraw.step.*`. */
  get step(): string {
    const m = mode();
    return `${m}.${Math.min(points.length, NEED[m] - 1)}`;
  },
  start(k: PlanDrawKind) {
    kind = k; points = []; typed = ''; hover = null; ortho = false;
    uiStore.workingPlane = 'XY';
    uiStore.planView3D = true;
    uiStore.currentTool = 'pan';
    if (uiStore.renderMode3D !== 'sections') { modeBefore ??= uiStore.renderMode3D; uiStore.renderMode3D = 'sections'; }
  },
  stop() {
    if (kind === null) return;
    kind = null; points = []; typed = ''; hover = null; ortho = false;
    if (modeBefore) { uiStore.renderMode3D = modeBefore; modeBefore = null; }
  },
  /** What was half drawn is dropped: another storey was taken, and a rectangle cannot start on one and end on another. */
  drop() { points = []; typed = ''; },
  /** Another way of drawing: what was half drawn the other way is dropped. */
  setMode(m: ColumnMode | BeamMode) {
    if (kind === 'column') column.mode = m as ColumnMode; else if (kind === 'beam') beam.mode = m as BeamMode;
    points = []; typed = '';
  },
  /** Whether a key typed now belongs to the drawing: a length, from a point, along a line. */
  get typing() { return linear(); },
  add(p: P2) {
    if (!kind) return;
    const q = constrain(p);
    const last = points[points.length - 1];
    if (last && Math.hypot(q.x - last.x, q.y - last.y) < 1e-6) return;
    const next = [...points, q];
    typed = '';
    if (next.length >= NEED[mode()]) commit(next);
    else points = next;
  },
  /** Back one point, or out of the tool with none. */
  back() {
    if (typed) { typed = typed.slice(0, -1); return; }
    if (points.length) points = points.slice(0, -1);
    else this.stop();
  },
  cancel() { if (points.length || typed) { points = []; typed = ''; } else this.stop(); },
  type(ch: string) { if (linear()) typed = (typed + ch).replace(',', '.'); },
  /** The length typed, from the last point towards the pointer. */
  enter() {
    const last = points[points.length - 1], len = parseFloat(typed);
    if (!last || !hover || !Number.isFinite(len) || len <= 0) { typed = ''; return; }
    const d = Math.hypot(hover.x - last.x, hover.y - last.y);
    if (d < 1e-9) return;
    this.add({ x: last.x + (hover.x - last.x) / d * len, y: last.y + (hover.y - last.y) / d * len });
  },
  /** The outline the next click would place, in plan. */
  get preview(): P2[] {
    if (!kind) return [];
    const pts = hover ? [...points, hover] : [...points];
    if (kind === 'column') {
      const f = columnFootprint(pts);
      if (f) return footprintCorners(f);
      return pts.length === 2 ? pts : [];
    }
    if (kind === 'slab') return pts.length >= 2 ? rectCorners(pts[0]!, pts[1]!) : [];
    if (kind === 'wall') { if (pts.length < 2) return []; const l = beamFromRect(pts[0]!, pts[1]!); return l ? band(l.a, l.b, l.width) : rectCorners(pts[0]!, pts[1]!); }
    if (beam.mode === 'rect' && pts.length >= 2) { const l = beamFromRect(pts[0]!, pts[1]!); return l ? band(l.a, l.b, l.width) : rectCorners(pts[0]!, pts[1]!); }
    if (beam.mode === 'axis' && pts.length >= 2) { const a = beamAxis(pts[0]!, pts[1]!, beam.width, beam.align); return band(a.a, a.b, beam.width); }
    if (beam.mode === 'faces') {
      const l = pts.length >= 3 ? beamFromFaces(pts[0]!, pts[1]!, pts[2]!) : null;
      if (l) return band(l.a, l.b, l.width);
      return pts.length === 2 ? pts : [];
    }
    return [];
  },
  /** A rectangle's two sides, from the first corner to the pointer, while one is drawn. */
  get size(): string | null {
    const rect = kind === 'slab' || kind === 'wall' || (kind === 'beam' && beam.mode === 'rect') || (kind === 'column' && column.mode === 'corners');
    const p = points[0];
    return rect && points.length === 1 && p && hover ? `${Math.abs(hover.x - p.x).toFixed(2)} × ${Math.abs(hover.y - p.y).toFixed(2)} m` : null;
  },
  /** The length from the last point to the pointer, m. */
  get rubber(): number | null {
    const last = points[points.length - 1];
    return last && hover ? Math.hypot(hover.x - last.x, hover.y - last.y) : null;
  },
};
