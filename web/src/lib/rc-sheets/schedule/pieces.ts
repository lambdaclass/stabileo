/**
 * Every bar the sheets place, element by element, as the piece a bender makes: its shape and how
 * many an element takes. Beams give their line bars as laid out and the stirrups of each zone;
 * columns their bars per storey (lapped into the storey above, cranked where its faces step in by
 * 75 mm at most, hooked into the slab at the top or where they step in more, and dowels then),
 * their hoops and cross ties; slabs each layer's bars; walls their verticals, horizontals, edge
 * U-bars, boundary hoops and cross ties. Mandrels and hooks are the code's (`BendRules`).
 */
import type { LineBar, LineLayout } from '../beam-line';
import type { ColumnRow } from '../column-row';
import { columnTieLayout } from '../column-ties';
import { SLAB_FACES, type SlabRow } from '../slab-row';
import { wallDetail } from '../wall-detail';
import type { WallRow } from '../wall-row';
import { rulesFor } from '../codes';
import { closedHoop, crankedBar, crossTie, hookLeg, hookedStraight, uBar, type BarShape, type BendRules } from '../shape';
import type { SheetCode, SheetFamily, Stirrups } from '../types';

export type PieceKind = LineBar['kind'] | 'stirrup' | 'stirrupTie' | 'column' | 'cranked' | 'dowel' | 'hoop' | 'crossTie'
  | 'slabBottom' | 'slabTop' | 'vertical' | 'boundary' | 'horizontal' | 'ubar' | 'wallTie';

export interface Piece {
  kind: PieceKind;
  count: number;
  shape: BarShape;
  /** The mark the bar carries on its line's elevation. */
  elevation?: string;
}

export interface ScheduleElement { key: string; name: string; level?: string; family: SheetFamily; pieces: Piece[] }

export interface PieceRows { line: LineLayout[]; column: ColumnRow[]; slab: SlabRow[]; wall: WallRow[] }

export interface PieceOptions {
  code: SheetCode;
  /** Clear cover of the slabs' bars, m. */
  slabCover: number;
  /** The project's denser column ends, as the elevations draw them. */
  endZones?: boolean;
}

/** The largest offset a column bar is cranked through (§10.7.4.1; the same practice elsewhere), m. */
export const MAX_CRANK = 0.075;

/** Bars at a spacing over a length, both ends included. */
export const spread = (length: number, spacing: number): number => (spacing > 0 ? Math.max(2, Math.floor(length / spacing + 1e-9) + 1) : 0);

/** Stirrups over a zone as the elevation places them: the first at min(5 cm; s/2), then one each spacing. */
export const stirrupsOver = (from: number, to: number, spacing: number): number => {
  if (spacing <= 0 || to - from < 1e-6) return 0;
  const first = Math.min(0.05, spacing / 2);
  return Math.max(1, Math.floor((to - from - first) / spacing + 1e-9) + 1);
};

const hoop = (w: number, h: number, dia: number, R: BendRules): Piece['shape'] =>
  closedHoop(w, h, dia, R.mandrel(dia, 'transverse'), R.extension(dia, 135, 'transverse'));

const tieAcross = (len: number, dia: number, R: BendRules): BarShape =>
  crossTie(len, dia, R.mandrel(dia, 'transverse'), R.crossTieHooks, [R.extension(dia, R.crossTieHooks[0], 'transverse'), R.extension(dia, R.crossTieHooks[1], 'transverse')]);

const topHooked = (length: number, dia: number, R: BendRules): BarShape =>
  hookedStraight(0, length, 0, dia, R.mandrel(dia, 'longitudinal'), [false, true], 1, R.extension(dia, 90, 'longitudinal'));

const straight = (length: number, dia: number, R: BendRules): BarShape =>
  hookedStraight(0, length, 0, dia, R.mandrel(dia, 'longitudinal'), [false, false], 1, 0);

function stirrupPieces(line: LineLayout, R: BendRules): Piece[] {
  const out: Piece[] = [];
  for (const z of line.zones) {
    const sp = line.spans[z.span];
    if (!sp) continue;
    const n = stirrupsOver(z.from, z.to, z.stirrups.spacing);
    if (!n) continue;
    const st: Stirrups = z.stirrups, d = st.dia / 1000;
    const w = sp.b - 2 * line.cover - d, h = sp.h - 2 * line.cover - d;
    out.push({ kind: 'stirrup', count: n, shape: hoop(w, h, st.dia, R) });
    if (st.legs > 2) out.push({ kind: 'stirrupTie', count: n * (st.legs - 2), shape: tieAcross(h, st.dia, R) });
  }
  return out;
}

function linePieces(line: LineLayout, R: BendRules): ScheduleElement {
  const bars: Piece[] = line.bars.map((b) => ({ kind: b.kind, count: b.bars.count, shape: b.shape, elevation: b.mark }));
  return { key: line.key, name: line.name, level: line.level, family: 'beam', pieces: [...bars, ...stirrupPieces(line, R)] };
}

const stackOf = (key: string) => {
  const [, g, k] = key.split(':');
  return { group: g ?? key, index: Number(k ?? 0) };
};

function above<T extends { key: string }>(rows: readonly T[], row: T): T | undefined {
  const me = stackOf(row.key);
  return rows.find((r) => { const s = stackOf(r.key); return s.group === me.group && s.index === me.index + 1; });
}

function below<T extends { key: string }>(rows: readonly T[], row: T): T | undefined {
  const me = stackOf(row.key);
  return rows.find((r) => { const s = stackOf(r.key); return s.group === me.group && s.index === me.index - 1; });
}

const columnDias = (r: ColumnRow): Array<{ dia: number; count: number }> => {
  const a = r.adopted, m = new Map<number, number>();
  const add = (dia: number, n: number) => { if (n > 0 && dia > 0) m.set(dia, (m.get(dia) ?? 0) + n); };
  add(a.corner, 4); add(a.dx, 2 * a.nx); add(a.dy, 2 * a.ny);
  return [...m].map(([dia, count]) => ({ dia, count }));
};

const offsetTo = (r: ColumnRow, up: ColumnRow) => Math.max(0, (r.b - up.b) / 2, (r.h - up.h) / 2);

function columnPieces(rows: readonly ColumnRow[], r: ColumnRow, o: PieceOptions, R: BendRules): ScheduleElement {
  const pieces: Piece[] = [];
  const up = above(rows, r), down = below(rows, r);
  const H = r.length;
  for (const { dia, count } of columnDias(r)) {
    const mandrel = R.mandrel(dia, 'longitudinal');
    if (!up) { pieces.push({ kind: 'column', count, shape: topHooked(H - r.cover, dia, R) }); continue; }
    const lap = up.lap?.length ?? 0, e = offsetTo(r, up);
    if (e > MAX_CRANK) pieces.push({ kind: 'column', count, shape: topHooked(H - r.cover, dia, R) });
    else if (e > 1e-3) pieces.push({ kind: 'cranked', count, shape: crankedBar(H, e, lap, dia, mandrel) });
    else pieces.push({ kind: 'column', count, shape: straight(H + lap, dia, R) });
  }
  if (down && offsetTo(down, r) > MAX_CRANK) {
    const lap = r.lap?.length ?? 0;
    for (const { dia, count } of columnDias(r)) pieces.push({ kind: 'dowel', count, shape: straight(2 * lap, dia, R) });
  }
  const t = r.adopted.tieDia, d = t / 1000;
  const n = columnTieLayout(r, o.code, { endZones: o.endZones }).ties.length;
  const w = r.b - 2 * r.cover - d, h = r.h - 2 * r.cover - d;
  pieces.push({ kind: 'hoop', count: n, shape: hoop(w, h, t, R) });
  if (r.checks.crossties.x) pieces.push({ kind: 'crossTie', count: n * r.checks.crossties.x, shape: tieAcross(h, t, R) });
  if (r.checks.crossties.y) pieces.push({ kind: 'crossTie', count: n * r.checks.crossties.y, shape: tieAcross(w, t, R) });
  return { key: r.key, name: r.name, level: r.level, family: 'column', pieces };
}

function slabPieces(r: SlabRow, o: PieceOptions, R: BendRules): ScheduleElement {
  const pieces: Piece[] = [];
  const c = o.slabCover;
  for (const f of SLAB_FACES) {
    const m = r.adopted[f];
    if (!m.dia || m.spacing <= 0) continue;
    const alongX = f.endsWith('X');
    const len = (alongX ? r.lx : r.ly) - 2 * c, across = (alongX ? r.ly : r.lx) - 2 * c;
    if (len <= 0) continue;
    const count = spread(across, m.spacing);
    const legs = r.h - 2 * c;
    const shape = f.startsWith('top') && legs > hookLeg(90, m.dia, R.mandrel(m.dia, 'longitudinal'), 0)
      ? { pts: [[0, -legs], [0, 0], [len, 0], [len, -legs]] as Array<[number, number]>, mandrel: R.mandrel(m.dia, 'longitudinal'), dia: m.dia }
      : straight(len, m.dia, R);
    pieces.push({ kind: f.startsWith('top') ? 'slabTop' : 'slabBottom', count, shape });
  }
  return { key: r.key, name: r.name, level: r.level, family: 'slab', pieces };
}

function wallPieces(rows: readonly WallRow[], r: WallRow, o: PieceOptions, R: BendRules): ScheduleElement {
  const pieces: Piece[] = [];
  const det = wallDetail(r, o.code);
  const up = above(rows, r);
  const H = r.height, c = r.cover;
  const groups = new Map<string, { dia: number; boundary: boolean; count: number }>();
  for (const v of det.verticals) {
    const k = `${v.dia}|${v.boundary}`;
    const g = groups.get(k) ?? { dia: v.dia, boundary: v.boundary, count: 0 };
    g.count++;
    groups.set(k, g);
  }
  for (const g of groups.values()) {
    const lap = r.vLaps?.find((x) => x.dia === g.dia)?.lap ?? r.hLap * g.dia / Math.max(1, det.horizontals.dia);
    const shape = up ? straight(H + lap, g.dia, R) : topHooked(H - c, g.dia, R);
    pieces.push({ kind: g.boundary ? 'boundary' : 'vertical', count: g.count, shape });
  }
  const hd = det.horizontals.dia, levels = spread(H, det.horizontals.spacing);
  const len = r.length - 2 * c;
  if (det.ends.kind === 'ubar') {
    pieces.push({ kind: 'horizontal', count: levels * det.horizontals.y.length, shape: straight(len, hd, R) });
    pieces.push({ kind: 'ubar', count: 2 * levels, shape: uBar(r.thickness - 2 * c - hd / 1000, det.ends.lap, hd, R.mandrel(hd, 'longitudinal')) });
  } else {
    pieces.push({ kind: 'horizontal', count: levels, shape: hookedStraight(0, len, 0, hd, R.mandrel(hd, 'longitudinal'), [true, true], 1, R.extension(hd, 90, 'longitudinal')) });
  }
  const ties = det.boundary?.ties;
  if (det.boundary && ties) {
    const d = ties.dia / 1000;
    pieces.push({ kind: 'hoop', count: 2 * spread(H, ties.spacing), shape: hoop(det.boundary.length - c - d, r.thickness - 2 * c - d, ties.dia, R) });
  }
  if (det.crossTies) {
    const n = Math.max(1, Math.floor(r.length / det.crossTies.along)) * Math.max(1, Math.floor(H / det.crossTies.up));
    pieces.push({ kind: 'wallTie', count: n, shape: tieAcross(r.thickness - 2 * c - hd / 1000, det.crossTies.dia, R) });
  }
  return { key: r.key, name: r.name, level: r.level, family: 'wall', pieces };
}

/** Every element's pieces, beams, columns, slabs and walls in that order, each family in the rows' order. */
export function scheduleElements(rows: PieceRows, o: PieceOptions): ScheduleElement[] {
  const R = rulesFor(o.code).bends;
  return [
    ...rows.line.map((l) => linePieces(l, R)),
    ...rows.column.map((r) => columnPieces(rows.column, r, o, R)),
    ...rows.slab.map((r) => slabPieces(r, o, R)),
    ...rows.wall.map((r) => wallPieces(rows.wall, r, o, R)),
  ].map((e) => ({ ...e, pieces: e.pieces.filter((p) => p.count > 0) }));
}
