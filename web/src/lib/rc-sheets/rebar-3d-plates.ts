import { barPositions } from './slab-corner-integrity';
import { dowelGroupOf, dowelGroups, dowelPlaces, type ColumnAxes } from './footing-dowels';
import { footingDetail } from './footing-detail';
import { pileDetail } from './pile-cap-detail';
import { wallDetail, wallInward } from './wall-detail';
import { SLAB_FACES, type SlabFace } from './slab-row';
import { lineBars3d } from './rebar-3d-lines';
import { ownStrapResults, packageShape, slabLayer, wallAbove, wallGrid, wallHoop, wallHorizontalShapes, wallTie, wallVerticalPieces, type PieceOptions } from './schedule/pieces';
import { asFoundation, barOf, laid, type Frame, type Rebar3d, type Rebar3dFrames, type Rebar3dRows, type RebarTone, WORLD } from './rebar-3d-geometry';
import type { ColumnRow } from './column-row';
import type { FootingRow } from './footing-types';
import type { WallRow } from './wall-row';
import type { BendRules } from './shape';


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
    const { lap, crank, pieces } = wallVerticalPieces(r, up, v.dia, v.boundary, det.horizontals.dia, R);
    const towardMiddle = v.x < L / 2 ? 1 : -1, n = wallInward(v, r);
    let z = 0;
    for (const pc of pieces) for (let k = 0; k < pc.count; k++) {
      const z0 = z, [dx, dy] = crank > 0 && pc === pieces.at(-1) ? n : [towardMiddle, 0];
      out.push(barOf(pc.shape, laid(pc.shape, f, (u, w) => [v.x + dx * w, v.y - t / 2 + dy * w, z0 + u]), { ...base, kind: v.boundary ? 'boundary' : 'vertical', tone: 'vertical' }));
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

export function footingBars3d(r: FootingRow, all: readonly FootingRow[], columns: readonly ColumnRow[], frames: Rebar3dFrames, R: BendRules): Rebar3d[] {
  const out: Rebar3d[] = [];
  if (!(r.B > 0)) return out;
  const base = { element: r.key, rows: [r.key], family: 'footing' as const, ...levelOf(r.level) };
  const f = frames.footing(r);
  if (f && !r.uncovered) {
    const det = footingDetail(r, R);
    for (const l of [...det.layers, ...det.tops]) {
      const kind = det.tops.includes(l) ? 'footingTop' as const : l.dir === 'x' ? 'footingX' as const : 'footingY' as const;
      for (const p of l.positions) {
        const place = (u: number, v: number): [number, number, number] => (l.dir === 'x' ? [l.from + u, p, l.z + v] : [p, l.from + u, l.z + v]);
        out.push(barOf(l.shape, laid(l.shape, f, place), { ...base, kind, tone: kind, set: `${r.key}:${kind}` }));
      }
    }
    const piles = pileDetail(r, R);
    if (piles) for (const p of piles.piles) {
      for (const [bx, by] of piles.bar.ring) out.push(barOf(piles.bar.shape, laid(piles.bar.shape, f, (u) => [p.x + bx, p.y + by, piles.bar.z0 + u]), { ...base, kind: 'pileBar', tone: 'pileBar', set: `${r.key}:pileBar` }));
      for (const z of piles.hoop.zs) out.push(barOf(piles.hoop.shape, laid(piles.hoop.shape, f, (u, v) => [p.x + u, p.y + v, z]), { ...base, kind: 'pileHoop', tone: 'pileHoop', set: `${r.key}:pileHoop` }));
    }
    const rowOf = (key: string | undefined) => columns.find((c) => c.key === key);
    const axesOf = (row: ColumnRow): ColumnAxes | undefined => { const cf = frames.column(row); return cf ? { x: [cf.x[0], cf.x[1]], y: [cf.y[0], cf.y[1]] } : undefined; };
    const places = dowelPlaces(r, R, { first: rowOf(r.demand.column?.rowKey), second: rowOf(r.demand.carried?.column?.rowKey), axes: axesOf });
    const groups = new Map(dowelGroups(r, places, R).map((g) => [g.key, g]));
    for (const p of places) {
      const g = groups.get(dowelGroupOf(p))!;
      out.push(barOf(g.shape, laid(g.shape, f, (u, v) => [p.x + u * p.out[0], p.y + u * p.out[1], g.z + v]), { ...base, kind: 'dowel', tone: 'dowel' }));
    }
  }
  for (const s of ownStrapResults(r, all)) {
    const sf = frames.strap(r, s);
    if (sf && s.line) out.push(...lineBars3d(s.line, sf, R, base).map(asFoundation));
  }
  return out;
}
