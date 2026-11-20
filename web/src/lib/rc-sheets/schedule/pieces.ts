/**
 * Every bar the sheets place, element by element, as the piece a bender makes: its shape and how
 * many an element takes. Beams give their line bars as laid out, the stirrups of each zone and the
 * closed stirrups that hang an end bearing on another beam (placed in that beam);
 * columns their bars per storey as `column-run.ts` runs them (cranked into the storey above to lap
 * beside its bars, hooked into the slab at the top or where the faces step in 75 mm or more, and
 * dowels then),
 * their hoops and cross ties (the inner row's too); slabs each layer's bars; walls their verticals, horizontals, edge
 * U-bars, boundary hoops and cross ties; punching joints their single-leg stirrups (`punching-bars.ts`).
 * Mandrels and hooks are the code's (`BendRules`).
 */
import type { LineBar, LineLayout } from '../beam-line';
import { innerCrossties, type ColumnRow } from '../column-row';
import { CRANK_LIMIT, CRANK_SLOPE, lapOffset } from '../column-stack';
import { STOCK, above, columnBarPieces, columnDowel, columnStorey, runPieces, stockPieces, storeyBars, storeyRun, straightBar, type ColumnStorey } from '../column-run';
import { columnTieLayout, confinedTieCount } from '../column-ties';
import { SLAB_FACES, type SlabFace, type SlabRow } from '../slab-row';
import { layerPositions } from '../view-helpers';
import type { LevelPlan, SlabPackage } from '../slab-plan';
import { wallDetail, wallLevels, type WallDetail } from '../wall-detail';
import type { WallRow } from '../wall-row';
import type { PunchingRow } from '../punching-row';
import { punchingLegs } from '../punching-bars';
import { rulesFor } from '../codes';
import { closedHoop, crankedBar, crossTie, developedLength, hookLeg, hookedStraight, uBar, type BarShape, type BendRules } from '../shape';
import type { SheetCode, SheetFamily, Stirrups } from '../types';

export type PieceKind = LineBar['kind'] | 'stirrup' | 'stirrupTie' | 'hanger' | 'column' | 'cranked' | 'dowel' | 'hoop' | 'crossTie'
  | 'slabBottom' | 'slabTop' | 'vertical' | 'boundary' | 'horizontal' | 'ubar' | 'wallTie' | 'punchingLeg';

export interface Piece {
  kind: PieceKind;
  count: number;
  shape: BarShape;
  /** The mark the bar carries on its line's elevation. */
  elevation?: string;
}

export interface ScheduleElement { key: string; name: string; level?: string; family: SheetFamily; pieces: Piece[] }

export interface PieceRows { line: LineLayout[]; column: ColumnRow[]; slab: SlabRow[]; wall: WallRow[]; slabPlan?: readonly LevelPlan[]; punching?: readonly PunchingRow[] }

export interface PieceOptions {
  code: SheetCode;
  /** Clear cover of the slabs' bars, m. */
  slabCover: number;
  /** The project's denser column ends, as the elevations draw them. */
  endZones?: boolean;
}

/** The largest offset of a column's faces its bars are cranked through (§10.7.4.1; the same practice elsewhere), m. */
export const MAX_CRANK = CRANK_LIMIT;

/** Bars at a spacing over a length, both ends included, never farther apart than the spacing. */
export const spread = (length: number, spacing: number): number => (spacing > 0 ? Math.max(2, Math.ceil(length / spacing - 1e-9) + 1) : 0);

/** Stirrups over a zone as the elevation places them: the first at `first` (min(5 cm; s/2) when not given), then one each spacing. */
export const stirrupsOver = (from: number, to: number, spacing: number, first = Math.min(0.05, spacing / 2)): number => {
  if (spacing <= 0 || to - from < 1e-6) return 0;
  return Math.max(1, Math.floor((to - from - first) / spacing + 1e-9) + 1);
};

/** A zone of stirrups: `first` from the end it is set out from, the start or, with `fromEnd`, the end. */
export interface StirrupZone { from: number; to: number; stirrups: { spacing: number }; first?: number; fromEnd?: boolean }

/** Where each stirrup of a zone stands, m, as the elevation, the schedule and the model all place them. */
export function zoneStirrups(z: StirrupZone): number[] {
  const s = z.stirrups.spacing, first = z.first ?? Math.min(0.05, s / 2), n = stirrupsOver(z.from, z.to, s, first);
  return Array.from({ length: n }, (_, i) => (z.fromEnd ? z.to - first - i * s : z.from + first + i * s));
}

export const hoop = (w: number, h: number, dia: number, R: BendRules): Piece['shape'] =>
  closedHoop(w, h, dia, R.mandrel(dia, 'transverse'), R.extension(dia, 135, 'transverse'));

export const tieAcross = (len: number, dia: number, R: BendRules): BarShape =>
  crossTie(len, dia, R.mandrel(dia, 'transverse'), R.crossTieHooks, [R.extension(dia, R.crossTieHooks[0], 'transverse'), R.extension(dia, R.crossTieHooks[1], 'transverse')]);

const straight = straightBar;

export { stockPieces, columnStorey, columnDowel };

/** A bar longer than a stock bar, lapped `lap` m where it is cut: into as few pieces as fit a stock bar, laps and all. */
export function lapped(shape: BarShape, lap: number): BarShape {
  const L = developedLength(shape);
  if (L <= STOCK + 1e-9 || !(lap > 0) || lap >= STOCK / 2) return shape;
  let n = 2;
  while ((L + (n - 1) * lap) / n > STOCK + 1e-9 && n < 40) n++;
  return { ...shape, laps: { count: n - 1, length: lap } };
}

function stirrupPieces(line: LineLayout, R: BendRules): Piece[] {
  const out: Piece[] = [];
  for (const z of line.zones) {
    const sp = line.spans[z.span];
    if (!sp) continue;
    const n = zoneStirrups(z).length;
    if (!n) continue;
    const st: Stirrups = z.stirrups, d = st.dia / 1000;
    const w = sp.b - 2 * line.cover - d, h = sp.h - 2 * line.cover - d;
    out.push({ kind: 'stirrup', count: n, shape: hoop(w, h, st.dia, R) });
    if (st.legs > 2) out.push({ kind: 'stirrupTie', count: n * (st.legs - 2), shape: tieAcross(h, st.dia, R) });
  }
  for (const hg of line.hangers ?? []) {
    const sp = line.spans[hg.end === 'start' ? 0 : line.spans.length - 1];
    if (!sp) continue;
    const d = hg.stirrups.dia / 1000;
    out.push({ kind: 'hanger', count: hg.count, shape: hoop(sp.b - 2 * line.cover - d, sp.h - 2 * line.cover - d, hg.stirrups.dia, R) });
  }
  return out;
}

function linePieces(line: LineLayout, R: BendRules): ScheduleElement {
  const bars: Piece[] = line.bars.map((b) => ({ kind: b.kind, count: b.bars.count, shape: b.shape, elevation: b.mark }));
  return { key: line.key, name: line.name, level: line.level, family: 'beam', pieces: [...bars, ...stirrupPieces(line, R)] };
}

const columnDias = (r: ColumnRow): Array<{ dia: number; count: number }> => {
  const a = r.adopted, m = new Map<number, number>();
  const add = (dia: number, n: number) => { if (n > 0 && dia > 0) m.set(dia, (m.get(dia) ?? 0) + n); };
  add(a.corner, 4); add(a.dx, 2 * a.nx); add(a.dy, 2 * a.ny);
  if (a.inner) add(a.inner.dia, 2 * Math.max(1, a.inner.rows ?? 1) * (a.inner.nx + a.inner.ny));
  return [...m].map(([dia, count]) => ({ dia, count }));
};

/**
 * How far each bar of a storey is cranked into the storey above (the step of the faces and one
 * bar's diameter in, `storeyBars`), by diameter and distance to the millimetre.
 */
export function crankOffsets(r: ColumnRow, s: ColumnStorey): Array<{ dia: number; e: number; count: number }> {
  const out = new Map<string, { dia: number; e: number; count: number }>();
  for (const { bar: p, e } of storeyBars(r, s)) {
    const k = `${p.dia}|${e}`;
    const g = out.get(k) ?? { dia: p.dia, e, count: 0 };
    g.count++;
    out.set(k, g);
  }
  return [...out.values()];
}

function columnPieces(rows: readonly ColumnRow[], r: ColumnRow, o: PieceOptions, R: BendRules): ScheduleElement {
  const pieces: Piece[] = [];
  const s = columnStorey(rows, r), run = storeyRun(r, s, o.code);
  const groups = s.cranked ? crankOffsets(r, s) : columnDias(r).map((g) => ({ ...g, e: 0 }));
  for (const { dia, count, e: eBar } of groups) {
    for (const pc of columnBarPieces(run, dia, eBar, R)) pieces.push({ kind: pc.kind, count: count * pc.count, shape: pc.shape });
  }
  if (s.dowels) for (const { dia, count } of columnDias(r)) pieces.push({ kind: 'dowel', count, shape: columnDowel(r, dia, R) });
  const t = r.adopted.tieDia, d = t / 1000;
  const layout = columnTieLayout(r, o.code, { endZones: o.endZones });
  const n = layout.ties.length, nc = confinedTieCount(layout);
  const w = r.b - 2 * r.cover - d, h = r.h - 2 * r.cover - d;
  const ct = r.checks.crossties, more = { x: Math.max(0, (ct.confined?.x ?? 0) - ct.x), y: Math.max(0, (ct.confined?.y ?? 0) - ct.y) };
  pieces.push({ kind: 'hoop', count: n, shape: hoop(w, h, t, R) });
  if (ct.x + more.x) pieces.push({ kind: 'crossTie', count: n * ct.x + nc * more.x, shape: tieAcross(h, t, R) });
  if (ct.y + more.y) pieces.push({ kind: 'crossTie', count: n * ct.y + nc * more.y, shape: tieAcross(w, t, R) });
  for (const tie of innerCrossties(r, r.adopted, r).ties) pieces.push({ kind: 'crossTie', count: n, shape: tieAcross(tie.length, t, R) });
  return r.pier ? { key: r.key, name: `${r.pier.name} (${r.name})`, level: r.level, family: 'wall', pieces } : { key: r.key, name: r.name, level: r.level, family: 'column', pieces };
}

export function slabLayer(r: SlabRow, f: SlabFace, cover: number, R: BendRules): { across: number[]; shape: BarShape } | null {
  const m = r.adopted[f];
  if (!m.dia || m.spacing <= 0) return null;
  const alongX = f.endsWith('X');
  const len = (alongX ? r.lx : r.ly) - 2 * cover;
  if (len <= 0) return null;
  const legs = r.h - 2 * cover;
  const shape = f.startsWith('top') && legs > hookLeg(90, m.dia, R.mandrel(m.dia, 'longitudinal'), 0)
    ? { pts: [[0, -legs], [0, 0], [len, 0], [len, -legs]] as Array<[number, number]>, mandrel: R.mandrel(m.dia, 'longitudinal'), dia: m.dia }
    : straight(len, m.dia, R);
  return { across: layerPositions(alongX ? r.ly : r.lx, m.spacing, cover + m.dia / 2000).at, shape };
}

function slabPieces(r: SlabRow, o: PieceOptions, R: BendRules): ScheduleElement {
  const pieces: Piece[] = [];
  for (const f of SLAB_FACES) {
    const l = slabLayer(r, f, o.slabCover, R);
    if (l) pieces.push({ kind: f.startsWith('top') ? 'slabTop' : 'slabBottom', count: l.across.length, shape: l.shape });
  }
  return { key: r.key, name: r.name, level: r.level, family: 'slab', pieces };
}

export const wallAbove = (rows: readonly WallRow[], r: WallRow): WallRow | undefined => (r.stack?.above ? rows.find((x) => x.key === r.stack!.above) : undefined) ?? above(rows, r);

/**
 * A wall's vertical bar as its pieces, bottom first: hooked into the slab at the top storey, else on
 * up through the floor, the top piece cranked in at 1:6 by one bar's diameter (`crank`, m) so it
 * laps in contact beside the bar above over the larger lap of the two.
 */
export function wallVerticalPieces(r: WallRow, up: WallRow | undefined, dia: number, boundary: boolean, horizontalDia: number, R: BendRules): { lap: number; crank: number; pieces: Array<{ shape: BarShape; count: number }> } {
  const own = r.vLaps?.find((x) => x.dia === dia)?.lap ?? r.hLap * dia / Math.max(1, horizontalDia);
  const upDia = up ? (boundary ? up.adopted.boundary?.diameter ?? up.adopted.vertical.diameter : up.adopted.vertical.diameter) : 0;
  const lap = Math.max(own, upDia > dia ? up?.vLaps?.find((x) => x.dia === upDia)?.lap ?? 0 : 0);
  if (!up) return { lap, crank: 0, pieces: stockPieces(r.height - r.cover, lap, dia, R, true) };
  const crank = lapOffset(dia, upDia), mandrel = R.mandrel(dia, 'longitudinal');
  return { lap, crank, pieces: runPieces(r.height + lap, lap, dia, R, (l) => crankedBar(l - lap, crank, lap, dia, mandrel, 1 / CRANK_SLOPE)) };
}

export function wallHorizontalShapes(r: WallRow, det: WallDetail, R: BendRules): { horizontal: BarShape; ubar: BarShape | null } {
  const hd = det.horizontals.dia, len = r.length - 2 * r.cover;
  if (det.ends.kind === 'ubar') return { horizontal: lapped(straight(len, hd, R), r.hLap), ubar: uBar(r.thickness - 2 * r.cover - hd / 1000, det.ends.lap, hd, R.mandrel(hd, 'longitudinal')) };
  return { horizontal: lapped(hookedStraight(0, len, 0, hd, R.mandrel(hd, 'longitudinal'), [true, true], 1, R.extension(hd, 90, 'longitudinal')), r.hLap), ubar: null };
}

export const wallHoop = (r: WallRow, det: WallDetail, R: BendRules): BarShape | null => {
  const t = det.boundary?.ties;
  if (!det.boundary || !t) return null;
  const d = t.dia / 1000;
  return hoop(det.boundary.length - r.cover - d, r.thickness - 2 * r.cover - d, t.dia, R);
};
export const wallTie = (r: WallRow, det: WallDetail, R: BendRules): BarShape | null =>
  (det.crossTies ? tieAcross(r.thickness - 2 * r.cover - det.horizontals.dia / 1000, det.crossTies.dia, R) : null);

export function wallGrid(r: WallRow, det: WallDetail): { horizontals: number[]; hoops: number[]; ties: { along: number[]; up: number[] } } {
  return {
    horizontals: wallLevels(r.height, det.horizontals.spacing),
    hoops: det.boundary?.ties ? wallLevels(r.height, det.boundary.ties.spacing) : [],
    ties: det.crossTies ? { along: wallLevels(r.length, det.crossTies.along), up: wallLevels(r.height, det.crossTies.up) } : { along: [], up: [] },
  };
}

function wallPieces(rows: readonly WallRow[], r: WallRow, o: PieceOptions, R: BendRules): ScheduleElement {
  const pieces: Piece[] = [];
  const det = wallDetail(r, o.code);
  const up = wallAbove(rows, r);
  const groups = new Map<string, { dia: number; boundary: boolean; count: number }>();
  for (const v of det.verticals) {
    const k = `${v.dia}|${v.boundary}`;
    const g = groups.get(k) ?? { dia: v.dia, boundary: v.boundary, count: 0 };
    g.count++;
    groups.set(k, g);
  }
  for (const g of groups.values()) {
    for (const pc of wallVerticalPieces(r, up, g.dia, g.boundary, det.horizontals.dia, R).pieces) pieces.push({ kind: g.boundary ? 'boundary' : 'vertical', count: g.count * pc.count, shape: pc.shape });
  }
  const grid = wallGrid(r, det), levels = grid.horizontals.length;
  const { horizontal, ubar } = wallHorizontalShapes(r, det, R);
  pieces.push({ kind: 'horizontal', count: levels * (ubar ? det.horizontals.y.length : 1), shape: horizontal });
  if (ubar) pieces.push({ kind: 'ubar', count: 2 * levels, shape: ubar });
  const h = wallHoop(r, det, R);
  if (h) pieces.push({ kind: 'hoop', count: 2 * grid.hoops.length, shape: h });
  const tie = wallTie(r, det, R);
  if (tie) pieces.push({ kind: 'wallTie', count: grid.ties.along.length * grid.ties.up.length, shape: tie });
  return { key: r.key, name: r.name, level: r.level, family: 'wall', pieces };
}

/** A level's slab bars as its plan lays them, packages crossing panels and lapped over supports. */
export const packageShape = (plan: Pick<LevelPlan, 'anchorage'>, p: Pick<SlabPackage, 'shape'>): BarShape => lapped(p.shape, plan.anchorage?.find((x) => x.dia === p.shape.dia)?.lap ?? 0);

function levelPieces(plan: LevelPlan): ScheduleElement {
  const pieces = plan.packages.map((p) => ({ kind: p.layer === 'top' ? 'slabTop' as const : 'slabBottom' as const, count: p.count, shape: packageShape(plan, p), elevation: p.mark }));
  return { key: `slabplan:${plan.level}`, name: plan.level, level: plan.level, family: 'slab', pieces };
}

/** A punching stirrup's leg: through the slab between its top and bottom bars, hooked over both. */
export const punchingLeg = (r: PunchingRow, o: Pick<PieceOptions, 'slabCover'>, R: BendRules): BarShape | null => {
  const s = r.figure?.reinforcement;
  return s ? tieAcross(Math.max(0.05, r.demand.thickness - 2 * o.slabCover), s.legDiameter, R) : null;
};

function punchingPieces(r: PunchingRow, o: PieceOptions, R: BendRules): ScheduleElement {
  const shape = punchingLeg(r, o, R);
  return { key: r.key, name: r.name, ...(r.level !== undefined ? { level: r.level } : {}), family: 'punching', pieces: shape && r.figure ? [{ kind: 'punchingLeg', count: punchingLegs(r.figure).length, shape }] : [] };
}

/** Every element's pieces, beams, columns, slabs, walls and punching joints in that order, each family in the rows' order; a level with a slab plan gives its packages instead of its panels' layers. */
export function scheduleElements(rows: PieceRows, o: PieceOptions): ScheduleElement[] {
  const R = rulesFor(o.code).bends;
  const planned = new Set((rows.slabPlan ?? []).filter((p) => p.packages.length).map((p) => p.level));
  const inPlan = new Set((rows.slabPlan ?? []).filter((p) => p.packages.length).flatMap((p) => p.panels.map((x) => x.key)));
  return [
    ...rows.line.map((l) => linePieces(l, R)),
    ...rows.column.map((r) => columnPieces(rows.column, r, o, R)),
    ...(rows.slabPlan ?? []).filter((p) => planned.has(p.level)).map(levelPieces),
    ...rows.slab.filter((r) => !inPlan.has(r.key)).map((r) => slabPieces(r, o, R)),
    ...rows.wall.map((r) => wallPieces(rows.wall, r, o, R)),
    ...(rows.punching ?? []).filter((r) => r.figure?.reinforcement).map((r) => punchingPieces(r, o, R)),
  ].map((e) => ({ ...e, pieces: e.pieces.filter((p) => p.count > 0) }));
}
