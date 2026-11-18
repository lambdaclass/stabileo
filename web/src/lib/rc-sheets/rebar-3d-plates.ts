import { barPositions } from './slab-corner-integrity';
import { columnLayout } from './column-layout';
import { footingDetail } from './footing-detail';
import { wallDetail } from './wall-detail';
import { SLAB_FACES, type SlabFace } from './slab-row';
import { lineBars3d } from './rebar-3d-lines';
import { ownStrapResults, packageShape, slabLayer, wallAbove, wallGrid, wallHoop, wallHorizontalShapes, wallTie, wallVerticalPieces, type PieceOptions } from './schedule/pieces';
import { barOf, laid, type Frame, type Rebar3d, type Rebar3dFrames, type Rebar3dRows, type RebarTone } from './rebar-3d-geometry';
import type { ColumnRow } from './column-row';
import type { FootingRow } from './footing-types';
import type { WallRow } from './wall-row';
import type { BendRules } from './shape';

const WORLD: Frame = { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const DOWEL_INSET = 0.05;

const levelOf = (level: string | undefined) => (level !== undefined ? { level } : {});

export function slabBars3d(rows: Rebar3dRows, frames: Rebar3dFrames, o: PieceOptions, R: BendRules): Rebar3d[] {
  const out: Rebar3d[] = [];
  const byKey = new Map(rows.slab.map((r) => [r.key, r]));
  const plans = (rows.slabPlan ?? []).filter((p) => p.packages.length);
  const inPlan = new Set(plans.flatMap((p) => p.panels.map((x) => x.key)));
  for (const plan of plans) {
    for (const [pi, pk] of plan.packages.entries()) {
      const panel = byKey.get(pk.panels[0] ?? '');
      const soffit = panel ? frames.slabSoffit(panel) : null;
      if (soffit === null) continue;
      const shape = packageShape(plan, pk);
      const tone = `${pk.layer}${pk.dir.toUpperCase()}` as RebarTone;
      const base = { element: `slabplan:${plan.level}`, rows: [...pk.panels], family: 'slab' as const, ...levelOf(plan.level), kind: pk.layer === 'top' ? 'slabTop' as const : 'slabBottom' as const, tone, ...(pk.mark ? { mark: pk.mark } : {}), set: `slabplan:${plan.level}:${pi}` };
      for (const across of barPositions(pk)) {
        const place = (u: number, v: number): [number, number, number] => (pk.dir === 'x' ? [pk.from + u, across, soffit + v] : [across, pk.from + u, soffit + v]);
        out.push(barOf(shape, laid(shape, WORLD, place), base));
      }
    }
  }
  for (const r of rows.slab) {
    const b = r.demand.bounds, soffit = frames.slabSoffit(r);
    if (inPlan.has(r.key) || !b || soffit === null) continue;
    for (const f of SLAB_FACES) {
      const l = slabLayer(r, f, o.slabCover, R);
      if (!l) continue;
      const height = layerHeight(r.h, f, r.adopted, o.slabCover), alongX = f.endsWith('X');
      const base = { element: r.key, rows: [r.key], family: 'slab' as const, ...levelOf(r.level), kind: f.startsWith('top') ? 'slabTop' as const : 'slabBottom' as const, tone: f as RebarTone, set: `${r.key}:${f}` };
      for (const across of l.across) {
        const place = (u: number, v: number): [number, number, number] => (alongX ? [b.x0 + o.slabCover + u, b.y0 + across, soffit + height + v] : [b.x0 + across, b.y0 + o.slabCover + u, soffit + height + v]);
        out.push(barOf(l.shape, laid(l.shape, WORLD, place), base));
      }
    }
  }
  return out;
}

function layerHeight(h: number, f: SlabFace, a: Record<SlabFace, { dia: number }>, cover: number): number {
  const top = f.startsWith('top'), outer = f.endsWith('X');
  const od = a[top ? 'topX' : 'bottomX'].dia / 1000, own = a[f].dia / 1000;
  const fromFace = cover + (outer ? own / 2 : od + own / 2);
  return top ? h - fromFace : fromFace;
}

export function wallBars3d(rows: readonly WallRow[], r: WallRow, f: Frame, o: PieceOptions, R: BendRules): Rebar3d[] {
  const out: Rebar3d[] = [];
  const base = { element: r.key, rows: [r.key], family: 'wall' as const, ...levelOf(r.level) };
  const det = wallDetail(r, o.code), up = wallAbove(rows, r), t = r.thickness, c = r.cover, L = r.length;
  for (const v of det.verticals) {
    const { lap, pieces } = wallVerticalPieces(r, up, v.dia, v.boundary, det.horizontals.dia, R);
    const towardMiddle = v.x < L / 2 ? 1 : -1;
    let z = 0;
    for (const pc of pieces) for (let k = 0; k < pc.count; k++) {
      const z0 = z;
      out.push(barOf(pc.shape, laid(pc.shape, f, (u, w) => [v.x + towardMiddle * w, v.y - t / 2, z0 + u]), { ...base, kind: v.boundary ? 'boundary' : 'vertical', tone: 'vertical' }));
      z += pc.shape.pts.reduce((m, p) => Math.max(m, p[0]), 0) - lap;
    }
  }
  const grid = wallGrid(r, det), hd = det.horizontals.dia / 1000;
  const { horizontal, ubar } = wallHorizontalShapes(r, det, R);
  for (const z of grid.horizontals) {
    for (const y of det.horizontals.y) out.push(barOf(horizontal, laid(horizontal, f, (u, w) => [c + u, y - t / 2, z + w]), { ...base, kind: 'horizontal', tone: 'horizontal', set: `${r.key}:h:${y}` }));
    if (!ubar || det.horizontals.y.length < 2) continue;
    const xe = c + hd / 2, y0 = det.horizontals.y[0]! - t / 2;
    for (const end of [0, 1]) {
      const place = (u: number, w: number): [number, number, number] => [end === 0 ? xe + u : L - xe - u, y0 + w, z + hd];
      out.push(barOf(ubar, laid(ubar, f, place), { ...base, kind: 'ubar', tone: 'ubar' }));
    }
  }
  const hoop = wallHoop(r, det, R);
  if (hoop && det.boundary?.ties) {
    const d = det.boundary.ties.dia / 1000, x0 = c + d / 2, y0 = -(t - 2 * c - d) / 2;
    for (const z of grid.hoops) for (const end of [0, 1]) {
      out.push(barOf(hoop, laid(hoop, f, (u, w) => [end === 0 ? x0 + u : L - x0 - u, y0 + w, z]), { ...base, kind: 'hoop', tone: 'wallTie' }));
    }
  }
  const tie = wallTie(r, det, R);
  if (tie) {
    const len = t - 2 * c - hd;
    for (const z of grid.ties.up) for (const x of grid.ties.along) out.push(barOf(tie, laid(tie, f, (u, w) => [x, -len / 2 + u, z + w]), { ...base, kind: 'wallTie', tone: 'wallTie' }));
  }
  return out;
}

function dowelPlaces(at: [number, number], size: { b: number; h: number }, count: number, row: ColumnRow | undefined, frame: Frame | null): Array<[number, number]> {
  if (row && frame) {
    const bars = columnLayout(row, row.adopted, row.cover, row.aggregate).bars;
    if (bars.length === count) return bars.map((p) => [at[0] + frame.x[0] * p.x + frame.y[0] * p.y, at[1] + frame.x[1] * p.x + frame.y[1] * p.y]);
  }
  const hx = size.b / 2 - DOWEL_INSET, hy = size.h / 2 - DOWEL_INSET, per = 4 * (hx + hy);
  return Array.from({ length: count }, (_, i) => {
    let s = (i / count) * per;
    const side = [2 * hx, 2 * hy, 2 * hx, 2 * hy];
    const corners: Array<[number, number, number, number]> = [[-hx, -hy, 1, 0], [hx, -hy, 0, 1], [hx, hy, -1, 0], [-hx, hy, 0, -1]];
    for (let k = 0; k < 4; k++) {
      if (s <= side[k]! + 1e-12) { const [x, y, dx, dy] = corners[k]!; return [at[0] + x + dx * s, at[1] + y + dy * s]; }
      s -= side[k]!;
    }
    return at;
  });
}

export function footingBars3d(r: FootingRow, all: readonly FootingRow[], columns: readonly ColumnRow[], frames: Rebar3dFrames, R: BendRules): Rebar3d[] {
  const out: Rebar3d[] = [];
  if (!(r.B > 0)) return out;
  const base = { element: r.key, rows: [r.key], family: 'footing' as const, ...levelOf(r.level) };
  const f = frames.footing(r);
  if (f && !r.uncovered) {
    const det = footingDetail(r, R);
    for (const l of [...det.layers, ...(det.top ? [det.top] : [])]) {
      const kind = l === det.top ? 'footingTop' as const : l.dir === 'x' ? 'footingX' as const : 'footingY' as const;
      for (const p of l.positions) {
        const place = (u: number, v: number): [number, number, number] => (l.dir === 'x' ? [l.from + u, p, l.z + v] : [p, l.from + u, l.z + v]);
        out.push(barOf(l.shape, laid(l.shape, f, place), { ...base, kind, tone: kind, set: `${r.key}:${kind}` }));
      }
    }
    const dw = det.dowels;
    if (dw && det.column) {
      const rowOf = (key: string | undefined) => columns.find((c) => c.key === key);
      const sets: Array<{ rect: NonNullable<typeof det.column>; count: number; row?: ColumnRow }> = [{ rect: det.column, count: dw.count, row: rowOf(r.demand.column?.rowKey) }];
      if (det.second && r.adopted.dowels2?.count) sets.push({ rect: det.second, count: r.adopted.dowels2.count, row: rowOf(r.demand.carried?.column?.rowKey) });
      for (const s of sets) {
        const cx = (s.rect.x0 + s.rect.x1) / 2, cy = (s.rect.y0 + s.rect.y1) / 2;
        for (const [px, py] of dowelPlaces([cx, cy], { b: s.rect.x1 - s.rect.x0, h: s.rect.y1 - s.rect.y0 }, s.count, s.row, s.row ? frames.column(s.row) : null)) {
          const dx = px - cx, dy = py - cy, out1 = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy) || 1];
          out.push(barOf(dw.shape, laid(dw.shape, f, (u, v) => [px + u * out1[0]!, py + u * out1[1]!, dw.z + v]), { ...base, kind: 'dowel', tone: 'dowel' }));
        }
      }
    }
  }
  for (const s of ownStrapResults(r, all)) {
    const sf = frames.strap(r, s);
    if (sf && s.line) out.push(...lineBars3d(s.line, sf, R, base));
  }
  return out;
}
