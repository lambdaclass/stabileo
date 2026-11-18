/**
 * A level of the beams, the columns or the walls seen from above, in the model's plan coordinates
 * (m, y up): each element where the model has it with its name, its bars in short and its status,
 * over the level's slab outlines and the grid's axes. The workspace draws it and the plans export
 * draws it to scale, both from this.
 */
import { memberRoll } from '../engine/local-axes-3d';
import { columnSection } from './drawing';
import { lineSupports } from './line-geometry';
import { stirrupsLabel } from './bars';
import { lineRowStatus, type LineLayout } from './beam-line';
import type { BeamRow } from './beam-row';
import type { ColumnRow } from './column-row';
import type { WallRow } from './wall-row';
import type { LevelPlan, PlanRect } from './slab-plan';
import type { Box } from './slab-plan-labels';
import type { CheckLine, ColumnAdopted } from './types';

export type Pt = [number, number];
export type StructureFamily = 'beam' | 'column' | 'wall';
export const STRUCTURE_FAMILIES: readonly StructureFamily[] = ['beam', 'column', 'wall'];
export type PlanStatus = 'ok' | 'warn' | 'fail';

interface ItemBase { key: string; name: string; status: PlanStatus; bars: string; check?: CheckLine }

/** A line of beams: each span from axis to axis with its width, and where a bar is cut, m in plan. */
export interface PlanBeamItem extends ItemBase { kind: 'beam'; spans: Array<{ a: Pt; b: Pt; width: number }>; cuts: Pt[] }
/** A column cut at its base: its outline and bars turned as the model turns it. */
export interface PlanColumnItem extends ItemBase { kind: 'column'; at: Pt; rotDeg: number; b: number; h: number; outline: Pt[]; rebars: Array<{ at: Pt; dia: number }> }
export interface PlanWallItem extends ItemBase { kind: 'wall'; a: Pt; b: Pt; thickness: number; outline: Pt[] }
export type PlanItem = PlanBeamItem | PlanColumnItem | PlanWallItem;

export interface PlanAxisLine { name: string; a: Pt; b: Pt }

export interface StructurePlan {
  family: StructureFamily;
  level: string;
  items: PlanItem[];
  /** The rows of the level the model gave no place for. */
  unplaced: string[];
  slabs: PlanRect[];
  axes: PlanAxisLine[];
  bounds: Box;
}

export interface StructureModel {
  nodes: ReadonlyMap<number, { x: number; y: number; z?: number }>;
  elements: ReadonlyMap<number, { nodeI: number; nodeJ: number; sectionId: number; rollAngle?: number; type?: string }>;
  sections?: ReadonlyMap<number, { rotation?: number }>;
  axes?: ReadonlyArray<{ name: string; axis: 'x' | 'y'; at: number }>;
}

export interface StructureRows { line: LineLayout[]; beam: BeamRow[]; column: ColumnRow[]; wall: WallRow[]; slabPlan: Pick<LevelPlan, 'level' | 'panels'>[] }

/** The check that decides a member's status: the worst failing one, else the one nearest its capacity. */
export function governingCheck(checks: readonly CheckLine[]): CheckLine | undefined {
  const failing = checks.filter((c) => !c.ok);
  const pool = failing.length ? failing : checks.filter((c) => c.ratio !== undefined);
  const r = (c: CheckLine) => (c.ratio === undefined ? (c.ok ? -1 : Infinity) : Number.isFinite(c.ratio) ? c.ratio : Infinity);
  return pool.reduce<CheckLine | undefined>((best, c) => (!best || r(c) > r(best) ? c : best), undefined);
}

const groupCount = (bars: ReadonlyArray<{ dia: number }>): string => {
  const by = new Map<number, number>();
  for (const b of bars) by.set(b.dia, (by.get(b.dia) ?? 0) + 1);
  return [...by].sort((p, q) => q[0] - p[0]).map(([d, n]) => `${n}Ø${d}`).join(' + ');
};

/** "3Ø16 / 2Ø12 · Ø8 c/15": the bottom run, the top run and the stirrups. */
export function lineBarsShort(line: Pick<LineLayout, 'adopted'>): string {
  const a = line.adopted;
  const st = [...new Set((a.stirrups ?? []).map((s) => stirrupsLabel(s)))];
  return `${a.bottom.count}Ø${a.bottom.dia} / ${a.top.count}Ø${a.top.dia}${st.length ? ` · ${st.join(' / ')}` : ''}`;
}

/** "8Ø16 · Ø8 c/15": every bar of the section by diameter, and the ties. */
export function columnBarsShort(row: Pick<ColumnRow, 'b' | 'h' | 'cover'> & { adopted: ColumnAdopted }): string {
  const a = row.adopted;
  return `${groupCount(columnSection(row.b, row.h, row.cover, a).bars)} · Ø${a.tieDia} c/${Math.round(a.tieSpacing * 100)}`;
}

/** "Ø10 c/20 · Ø8 c/20 (2×)": verticals, horizontals, curtains and edge bars. */
export function wallBarsShort(row: Pick<WallRow, 'adopted'>): string {
  const a = row.adopted, cm = (s: number) => Math.round(s * 100);
  const edge = a.boundary && a.boundary.count > 0 ? ` + ${a.boundary.count}Ø${a.boundary.diameter}` : '';
  return `V Ø${a.vertical.diameter} c/${cm(a.vertical.spacing)} · H Ø${a.horizontal.diameter} c/${cm(a.horizontal.spacing)} (${a.curtains}×)${edge}`;
}

const rotate = ([u, v]: Pt, deg: number): Pt => {
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  return [u * c - v * s, u * s + v * c];
};
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];

/** A b × h rectangle centred on `at`, b along x before it is turned `rotDeg` counter-clockwise. */
export function sectionOutline(at: Pt, b: number, h: number, rotDeg: number): Pt[] {
  return ([[-b / 2, -h / 2], [b / 2, -h / 2], [b / 2, h / 2], [-b / 2, h / 2]] as Pt[]).map((p) => add(at, rotate(p, rotDeg)));
}

/** The band of width `t` along a–b. */
export function bandOutline(a: Pt, b: Pt, t: number): Pt[] {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = (-dy / L) * t / 2, ny = (dx / L) * t / 2;
  return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]];
}

const statusOf = (s: string): PlanStatus => (s === 'fail' ? 'fail' : s === 'warn' ? 'warn' : 'ok');

function columnRoll(m: StructureModel, node: number): number {
  const p = m.nodes.get(node);
  if (!p) return 0;
  for (const e of m.elements.values()) {
    if (e.type === 'truss' || (e.nodeI !== node && e.nodeJ !== node)) continue;
    const q = m.nodes.get(e.nodeI === node ? e.nodeJ : e.nodeI);
    if (q && Math.hypot(q.x - p.x, q.y - p.y) < 1e-3 && (q.z ?? 0) > (p.z ?? 0)) return memberRoll(e, m.sections);
  }
  return 0;
}

function beamItems(rows: StructureRows, level: string, m: StructureModel, unplaced: string[]): PlanBeamItem[] {
  const out: PlanBeamItem[] = [];
  for (const line of rows.line.filter((l) => (l.level ?? '') === level)) {
    const spans = rows.beam.filter((r) => r.demand.line?.group === line.group).sort((p, q) => (p.demand.line?.index ?? 0) - (q.demand.line?.index ?? 0));
    const axes = lineSupports(line);
    const drawn = spans.map((r) => {
      const a = m.nodes.get(r.demand.line?.startNode ?? -1), b = m.nodes.get(r.demand.line?.endNode ?? -1);
      return a && b ? { a: [a.x, a.y] as Pt, b: [b.x, b.y] as Pt, width: r.b } : null;
    });
    if (!drawn.length || drawn.some((d) => !d)) { unplaced.push(line.key); continue; }
    const placed = drawn as Array<{ a: Pt; b: Pt; width: number }>;
    const along = (x: number): Pt => {
      const i = axes.slice(1).findIndex((v) => x <= v + 1e-9), k = Math.min(placed.length - 1, i < 0 ? placed.length - 1 : i);
      const x0 = axes[k] ?? 0, x1 = axes[k + 1] ?? x0 + 1, t = x1 > x0 ? Math.max(0, Math.min(1, (x - x0) / (x1 - x0))) : 0;
      const s = placed[k]!;
      return [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t];
    };
    const checks = [...line.verifications, ...spans.flatMap((r) => r.verifications)];
    out.push({
      kind: 'beam', key: line.key, name: line.name, status: statusOf(lineRowStatus(line, spans)), bars: lineBarsShort(line),
      check: governingCheck(checks), spans: placed, cuts: line.cutoffs.filter((c) => c.legality !== 'illegal').map((c) => along(c.x)),
    });
  }
  return out;
}

function columnItems(rows: StructureRows, level: string, m: StructureModel, unplaced: string[]): PlanColumnItem[] {
  const out: PlanColumnItem[] = [];
  for (const r of rows.column.filter((c) => (c.level ?? '') === level)) {
    const node = r.demand.nodes?.bottom, p = node !== undefined ? m.nodes.get(node) : undefined;
    if (!p || node === undefined) { unplaced.push(r.key); continue; }
    const at: Pt = [p.x, p.y], rotDeg = columnRoll(m, node);
    const rebars = columnSection(r.b, r.h, r.cover, r.adopted, { aggregate: r.aggregate }).bars.map((x) => ({ at: add(at, rotate([x.x - r.b / 2, x.y - r.h / 2], rotDeg)), dia: x.dia }));
    out.push({ kind: 'column', key: r.key, name: r.name, status: statusOf(r.status), bars: columnBarsShort(r), check: governingCheck(r.verifications), at, rotDeg, b: r.b, h: r.h, outline: sectionOutline(at, r.b, r.h, rotDeg), rebars });
  }
  return out;
}

function wallItems(rows: StructureRows, level: string, unplaced: string[]): PlanWallItem[] {
  const out: PlanWallItem[] = [];
  for (const r of rows.wall.filter((w) => (w.level ?? '') === level)) {
    const pl = r.demand.plan;
    if (!pl) { unplaced.push(r.key); continue; }
    const a: Pt = [pl.x1, pl.y1], b: Pt = [pl.x2, pl.y2];
    out.push({ kind: 'wall', key: r.key, name: r.name, status: statusOf(r.status), bars: wallBarsShort(r), check: governingCheck(r.verifications), a, b, thickness: r.thickness, outline: bandOutline(a, b, r.thickness) });
  }
  return out;
}

export function itemPoints(it: PlanItem): Pt[] {
  if (it.kind === 'beam') return it.spans.flatMap((s) => bandOutline(s.a, s.b, s.width));
  return it.outline;
}

/** The levels a family's rows stand on, in the order the list gives them. */
export function familyLevels(family: StructureFamily, rows: Pick<StructureRows, 'line' | 'column' | 'wall'>): string[] {
  const list: ReadonlyArray<{ level?: string }> = family === 'beam' ? rows.line : family === 'column' ? rows.column : rows.wall;
  return [...new Set(list.map((r) => r.level ?? ''))];
}

/** The plan of one family on one level, over its level's slabs or, on a level with none, the first level's. Axes run 1 m past what is drawn at both ends. */
export function structurePlan(family: StructureFamily, level: string, rows: StructureRows, m: StructureModel): StructurePlan {
  const unplaced: string[] = [];
  const items: PlanItem[] = family === 'beam' ? beamItems(rows, level, m, unplaced) : family === 'column' ? columnItems(rows, level, m, unplaced) : wallItems(rows, level, unplaced);
  const slabs = (rows.slabPlan.find((p) => p.level === level && p.panels.length) ?? rows.slabPlan.find((p) => p.panels.length))?.panels.map((p) => p.rect) ?? [];
  const pts = [...items.flatMap(itemPoints), ...slabs.flatMap((r) => [[r.x0, r.y0], [r.x1, r.y1]] as Pt[])];
  const inner: Box = pts.length
    ? { x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])) }
    : { x0: 0, y0: 0, x1: 1, y1: 1 };
  const reach = 1;
  const axes: PlanAxisLine[] = (m.axes ?? []).filter((x) => (x.axis === 'x' ? x.at >= inner.x0 - reach && x.at <= inner.x1 + reach : x.at >= inner.y0 - reach && x.at <= inner.y1 + reach)).map((x) => (x.axis === 'x'
    ? { name: x.name, a: [x.at, inner.y0 - reach] as Pt, b: [x.at, inner.y1 + reach] as Pt }
    : { name: x.name, a: [inner.x0 - reach, x.at] as Pt, b: [inner.x1 + reach, x.at] as Pt }));
  const all = [...pts, ...axes.flatMap((x) => [x.a, x.b])];
  const bounds: Box = all.length ? { x0: Math.min(...all.map((p) => p[0])), y0: Math.min(...all.map((p) => p[1])), x1: Math.max(...all.map((p) => p[0])), y1: Math.max(...all.map((p) => p[1])) } : inner;
  return { family, level, items, unplaced, slabs, axes, bounds };
}

/** The length of a scale bar: 1, 2 or 5 times a power of ten metres, at least `minPx` long at `pxPerM`. */
export function scaleBarLength(pxPerM: number, minPx = 60): number {
  const target = minPx / Math.max(pxPerM, 1e-9);
  const p = 10 ** Math.floor(Math.log10(target));
  return [1, 2, 5, 10].map((f) => f * p).find((v) => v >= target - 1e-12)!;
}
