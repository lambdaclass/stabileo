/**
 * The model of calculation of a building read from an exchange file.
 *
 * A building's file carries its physical members: a column stops under the slab it carries, a
 * beam's axis is at half its depth and off the column's, a slab is its panels at mid-thickness, a
 * wall stops under the slab. Welded as they come, almost nothing meets and the model cannot be
 * solved. This reads them as the Building tools model a floor (`build-on-grid.ts`):
 *
 *   · a column runs from the level under its foot to the level over its head;
 *   · a beam lies on its level with its top flush (insertion −h/2). The pieces of one line are one
 *     line, cut where the line meets a column and where it crosses another; where it meets a
 *     column its node is on the column's axis and its eccentricity is the insertion, interpolated
 *     along between columns, so the physical beam stays straight and the design sees the column.
 *     A stub that runs less than half a metre past the column it ends at is part of the joint;
 *   · a wall runs from level to level;
 *   · a floor is one region per level: its slabs, and the beams and walls that border them (the
 *     file cuts a slab at a beam's face; the model's slab reaches the beam's axis). Its system is
 *     read from the slab's type: a waffle (depth and topping «30+5», rib width, rib spacing) with
 *     its drops as solid zones; a plain slab at its thickness.
 *
 * Pure: the import meshes the floors on the model once the bars are in (`ifc-floors.ts`).
 */
import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';
import type { IfcMember, IfcSurface } from './ifc-mapper';
import type { Level } from '../model/grid';
import type { RibbedGeometry } from '../engine/design/slabs/ribbed';

type P = { x: number; y: number };

export interface FloorRegion {
  level: Level;
  outer: P[];
  holes: P[][];
  /** The slab's analysis thickness, m: a waffle's is its concrete per m² (its weight). */
  thickness: number;
  /** A waffle's ribs, read from its type; absent for a plain slab. */
  ribbed?: RibbedGeometry;
  /** Solid zones (drops) inside the region, with their thickness. */
  zones: Array<{ outline: P[]; thickness: number }>;
  materialName?: string;
  /** The slabs of the file it gathers. */
  names: string[];
}

export interface AnalyticalIfc {
  members: IfcMember[];
  walls: IfcSurface[];
  floors: FloorRegion[];
  warnings: string[];
}

const LEVEL_REACH = 1.0;
const SNAP = 0.02;

/** The level a member's foot stands on: the highest at or under it, within reach. */
const levelBelow = (z: number, levels: readonly Level[]) => [...levels].filter((l) => l.z <= z + SNAP && z - l.z <= LEVEL_REACH).sort((a, b) => b.z - a.z)[0];
/** The level a member's head reaches: the lowest at or over it, within reach. */
const levelAbove = (z: number, levels: readonly Level[]) => [...levels].filter((l) => l.z >= z - SNAP && l.z - z <= LEVEL_REACH).sort((a, b) => a.z - b.z)[0];
const levelNear = (z: number, levels: readonly Level[], tol: number) => [...levels].filter((l) => Math.abs(l.z - z) <= tol).sort((a, b) => Math.abs(a.z - z) - Math.abs(b.z - z))[0];

/**
 * A waffle slab's system from its type, in the words a structural type is written in: depth and
 * topping as «30+5» (cm), and the rib width and spacing after «nervio»/«rib» and «intereje»/
 * «spacing» (cm). Null when the type does not state a ribbed system.
 */
export function ribbedFromType(type: string | undefined): RibbedGeometry | null {
  if (!type) return null;
  const t = type.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const dt = t.match(/(\d+(?:[.,]\d+)?)\s*\+\s*(\d+(?:[.,]\d+)?)/);
  const rib = t.match(/(?:nervio|rib)\D{0,20}?(\d+(?:[.,]\d+)?)/);
  const sp = t.match(/(?:intereje|spacing|separacion)\D{0,20}?(\d+(?:[.,]\d+)?)/);
  if (!dt || !rib || !sp) return null;
  const cm = (s: string) => Number(s.replace(',', '.')) / 100;
  const depth = cm(dt[1]!), c = cm(dt[2]!), bw = cm(rib[1]!), s = cm(sp[1]!);
  if (!(depth > 0 && c > 0 && bw > 0 && s > bw)) return null;
  return { h: depth + c, c, spacingX: s, spacingY: s, ribBottom: bw, filler: 'permanent' };
}

/** A drop, or another solid zone of a waffle floor, by its type or name. */
const isDrop = (s: IfcSurface) => /abaco|drop/.test(`${s.objectType ?? ''} ${s.name}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());

const ring = (pts: readonly P[]): [number, number][] => { const r = pts.map((p) => [p.x, p.y] as [number, number]); return [...r, r[0]!]; };
const toPts = (r: ReadonlyArray<readonly [number, number]>): P[] => r.slice(0, -1).map(([x, y]) => ({ x, y }));
const rect = (a: P, b: P, w: number): P[] => {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / L * w / 2, ny = (b.x - a.x) / L * w / 2;
  return [{ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny }, { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny }];
};
const area = (pts: readonly P[]) => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]!; return s + p.x * q.y - q.x * p.y; }, 0)) / 2;

export function analyticalFromIfc(members: readonly IfcMember[], surfaces: readonly IfcSurface[], levels: readonly Level[]): AnalyticalIfc {
  const warnings: string[] = [];
  const out: IfcMember[] = [];
  let nextId = Math.max(0, ...members.map((m) => m.id), ...surfaces.map((s) => s.id)) + 1;
  const isVertical = (m: IfcMember) => Math.hypot(m.end.x - m.start.x, m.end.y - m.start.y) < 1e-3 * Math.max(1e-6, Math.abs(m.end.z - m.start.z));
  const isLevel = (m: IfcMember) => Math.abs(m.end.z - m.start.z) < 0.01;
  const depthOf = (m: IfcMember) => (m.profileDims?.shape === 'rect' ? m.profileDims.h : m.profileDims?.shape === 'circle' ? m.profileDims.d : 0);
  const widthOf = (m: IfcMember) => (m.profileDims?.shape === 'rect' ? m.profileDims.b : m.profileDims?.shape === 'circle' ? m.profileDims.d : 0);

  // ── Columns: from the level under the foot to the level over the head.
  const columns: Array<{ x: number; y: number; z0: number; z1: number; r: number }> = [];
  for (const m of members.filter(isVertical)) {
    const [lo, hi] = m.start.z <= m.end.z ? [m.start, m.end] : [m.end, m.start];
    const z0 = levelBelow(lo.z, levels)?.z ?? lo.z, z1 = levelAbove(hi.z, levels)?.z ?? hi.z;
    out.push({ ...m, start: { ...lo, z: z0 }, end: { ...hi, z: z1 } });
    const d = m.profileDims;
    columns.push({ x: lo.x, y: lo.y, z0, z1, r: d?.shape === 'rect' ? Math.hypot(d.b, d.h) / 2 : d?.shape === 'circle' ? d.d / 2 : 0.15 });
  }

  // ── Beams: on their level, by lines.
  type Piece = { m: IfcMember; lv: Level; a: P; b: P; h: number; w: number };
  const pieces: Piece[] = [];
  for (const m of members.filter((x) => !isVertical(x))) {
    const h = depthOf(m);
    const lv = isLevel(m) ? levelNear(m.start.z + h / 2, levels, 0.15) : undefined;
    if (!lv) { out.push(m); continue; } // inclined, or off every level: as the file has it
    pieces.push({ m, lv, a: { x: m.start.x, y: m.start.y }, b: { x: m.end.x, y: m.end.y }, h, w: widthOf(m) });
  }
  const colsAt = (lv: Level) => columns.filter((c) => Math.abs(c.z1 - lv.z) < 1e-6 || Math.abs(c.z0 - lv.z) < 1e-6);
  for (const lv of levels) {
    const here = pieces.filter((p) => p.lv.id === lv.id);
    if (!here.length) continue;
    const cols = colsAt(lv);
    // Lines: pieces of one section on one line, end to end (or across a column between them).
    const lines: Piece[][] = [];
    const used = new Set<Piece>();
    for (const p of here) {
      if (used.has(p)) continue;
      const line = [p]; used.add(p);
      const L = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y) || 1, u = { x: (p.b.x - p.a.x) / L, y: (p.b.y - p.a.y) / L };
      const off = (q: P) => Math.abs(u.x * (q.y - p.a.y) - u.y * (q.x - p.a.x));
      const along = (q: P) => u.x * (q.x - p.a.x) + u.y * (q.y - p.a.y);
      for (let grew = true; grew;) {
        grew = false;
        const lo = Math.min(...line.flatMap((x) => [along(x.a), along(x.b)])), hi = Math.max(...line.flatMap((x) => [along(x.a), along(x.b)]));
        for (const q of here) {
          if (used.has(q) || q.m.profileName !== p.m.profileName || off(q.a) > 0.03 || off(q.b) > 0.03) continue;
          const qa = Math.min(along(q.a), along(q.b)), qb = Math.max(along(q.a), along(q.b));
          const gap = Math.max(qa - hi, lo - qb);
          const bridged = gap <= 0.06 || cols.some((c) => off(c) <= c.r + p.w / 2 + 0.02 && along(c) >= Math.min(hi, qb) - c.r - 0.02 && along(c) <= Math.max(lo, qa) + c.r + 0.02 && gap <= 2 * c.r + 0.1);
          if (!bridged) continue;
          line.push(q); used.add(q); grew = true;
        }
      }
      lines.push(line);
    }
    const segs = lines.map((line) => {
      const p = line[0]!;
      const L0 = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y) || 1, u = { x: (p.b.x - p.a.x) / L0, y: (p.b.y - p.a.y) / L0 };
      const along = (q: P) => u.x * (q.x - p.a.x) + u.y * (q.y - p.a.y);
      const ts = line.flatMap((x) => [along(x.a), along(x.b)]);
      const t0 = Math.min(...ts), t1 = Math.max(...ts);
      return { line, u, o: { x: p.a.x + u.x * t0, y: p.a.y + u.y * t0 }, L: t1 - t0, h: p.h, w: p.w };
    });
    for (const s of segs) {
      const at = (t: number): P => ({ x: s.o.x + s.u.x * t, y: s.o.y + s.u.y * t });
      const off = (q: P) => s.u.x * (q.y - s.o.y) - s.u.y * (q.x - s.o.x);
      const along = (q: P) => s.u.x * (q.x - s.o.x) + s.u.y * (q.y - s.o.y);
      type Cut = { t: number; p: P; col: P | null };
      const cuts: Cut[] = [{ t: 0, p: at(0), col: null }, { t: s.L, p: at(s.L), col: null }];
      for (const c of cols) {
        if (Math.abs(off(c)) > c.r + s.w / 2 + 0.02) continue;
        const t = along(c);
        if (t < -c.r - 0.02 || t > s.L + c.r + 0.02) continue;
        cuts.push({ t, p: at(t), col: { x: c.x, y: c.y } });
      }
      for (const o of segs) {
        if (o === s) continue;
        // Crossing: solve s.o + s.u·t = o.o + o.u·v.
        const den = s.u.x * o.u.y - s.u.y * o.u.x;
        if (Math.abs(den) < 1e-6) continue;
        const dx = o.o.x - s.o.x, dy = o.o.y - s.o.y;
        const t = (dx * o.u.y - dy * o.u.x) / den, v = (dx * s.u.y - dy * s.u.x) / den;
        if (t < -1e-6 || t > s.L + 1e-6 || v < -1e-6 || v > o.L + 1e-6) continue;
        cuts.push({ t, p: at(t), col: null });
      }
      cuts.sort((a, b) => a.t - b.t);
      let merged: Cut[] = [];
      for (const c of cuts) {
        const last = merged[merged.length - 1];
        if (last && Math.abs(c.t - last.t) < 0.3) { if (c.col && !last.col) merged[merged.length - 1] = c; continue; }
        merged.push(c);
      }
      // A stub past the column a line ends at is the joint's.
      if (merged.length >= 2 && merged[1]!.col && !merged[0]!.col && merged[1]!.t - merged[0]!.t < 0.5) merged = merged.slice(1);
      if (merged.length >= 2 && merged[merged.length - 2]!.col && !merged[merged.length - 1]!.col && merged[merged.length - 1]!.t - merged[merged.length - 2]!.t < 0.5) merged = merged.slice(0, -1);
      if (merged.length < 2) continue;
      // The eccentricity: physical minus analytical, at each column; interpolated between, constant past.
      const atCol = merged.filter((c) => c.col).map((c) => ({ t: c.t, d: { x: c.p.x - c.col!.x, y: c.p.y - c.col!.y } }));
      const d = (t: number) => {
        if (!atCol.length) return { x: 0, y: 0 };
        if (t <= atCol[0]!.t) return atCol[0]!.d;
        if (t >= atCol[atCol.length - 1]!.t) return atCol[atCol.length - 1]!.d;
        for (let k = 0; k + 1 < atCol.length; k++) {
          const A = atCol[k]!, B = atCol[k + 1]!;
          if (t >= A.t && t <= B.t) { const f = B.t > A.t ? (t - A.t) / (B.t - A.t) : 0; return { x: A.d.x + f * (B.d.x - A.d.x), y: A.d.y + f * (B.d.y - A.d.y) }; }
        }
        return { x: 0, y: 0 };
      };
      for (let k = 0; k + 1 < merged.length; k++) {
        const A = merged[k]!, B = merged[k + 1]!;
        const dA = d(A.t), dB = d(B.t);
        const mid = (A.t + B.t) / 2;
        // The file's piece the analytical piece lies along, for its name, section and material.
        const src = s.line.find((x) => { const ta = along(x.a), tb = along(x.b); return mid >= Math.min(ta, tb) - 1e-6 && mid <= Math.max(ta, tb) + 1e-6; }) ?? s.line[0]!;
        out.push({
          ...src.m, id: nextId++,
          start: { x: A.p.x - dA.x, y: A.p.y - dA.y, z: lv.z }, end: { x: B.p.x - dB.x, y: B.p.y - dB.y, z: lv.z },
          offset: { i: { x: dA.x, y: dA.y, z: -s.h / 2 }, j: { x: dB.x, y: dB.y, z: -s.h / 2 } },
        });
      }
    }
  }

  // ── Walls: level to level.
  const walls = surfaces.filter((s) => s.type === 'wall').map((w) => {
    const zs = w.outline.map((p) => p.z);
    const lo = Math.min(...zs), hi = Math.max(...zs);
    const z0 = levelBelow(lo, levels)?.z ?? lo, z1 = levelAbove(hi, levels)?.z ?? hi;
    return { ...w, outline: w.outline.map((p) => ({ ...p, z: Math.abs(p.z - lo) < 1e-6 ? z0 : Math.abs(p.z - hi) < 1e-6 ? z1 : p.z })) };
  });

  // ── Floors: one region per level, its slabs and the beams and walls that border them.
  const floors: FloorRegion[] = [];
  const slabs = surfaces.filter((s) => s.type === 'slab');
  for (const lv of levels) {
    const mine = slabs.filter((s) => {
      const top = Math.max(...s.outline.map((p) => p.z)) + s.thickness / 2;
      return (s.storey ? s.storey === lv.name : false) || Math.abs(top - lv.z) < 0.05;
    });
    if (!mine.length) continue;
    const polys: Polygon[] = mine.map((s) => [ring(s.outline)]);
    const base = polygonClipping.union(polys[0]!, ...polys.slice(1));
    const touching = (pts: P[]) => polygonClipping.intersection(base, [ring(pts.map((p) => ({ x: p.x, y: p.y })))]).length > 0
      || base.some((poly) => poly[0]!.some(([x, y]) => pts.some((q) => Math.hypot(q.x - x, q.y - y) < 0.05)));
    const feet: Polygon[] = [];
    for (const p of pieces.filter((x) => x.lv.id === lv.id)) {
      // Grown a little, so a foot that only meets the slab's edge still joins it.
      const f = rect(p.a, p.b, p.w + 0.01);
      if (touching(f)) feet.push([ring(f)]);
    }
    for (const w of walls) {
      if (Math.abs(Math.max(...w.outline.map((p) => p.z)) - lv.z) > 1e-6) continue;
      const lo = w.outline.filter((p) => Math.abs(p.z - Math.min(...w.outline.map((q) => q.z))) < 1e-6);
      if (lo.length < 2) continue;
      const f = rect(lo[0]!, lo[1]!, w.thickness + 0.01);
      if (touching(f)) feet.push([ring(f)]);
    }
    let U: MultiPolygon = feet.length ? polygonClipping.union(base, ...feet) : base;
    // The union of shapes cut at shared edges leaves slivers: let go of what has no area.
    U = U.filter((poly) => area(toPts(poly[0]!)) > 0.05);
    const ribs = mine.map((s) => ribbedFromType(s.objectType)).find((r): r is RibbedGeometry => !!r);
    const drops = ribs ? mine.filter(isDrop) : [];
    const plain = mine.filter((s) => !drops.includes(s));
    const mode = plain.reduce((acc, s) => { const a = area(s.outline); acc.set(s.thickness, (acc.get(s.thickness) ?? 0) + a); return acc; }, new Map<number, number>());
    const tSlab = [...mode].sort((a, b) => b[1] - a[1])[0]?.[0] ?? mine[0]!.thickness;
    const thickness = ribs ? ribbedVolume(ribs) : tSlab;
    for (const poly of U) {
      floors.push({
        level: lv, outer: toPts(poly[0]!), holes: poly.slice(1).map(toPts).filter((h) => area(h) > 0.05),
        thickness, ...(ribs ? { ribbed: ribs } : {}),
        zones: drops.map((s) => ({ outline: s.outline.map((p) => ({ x: p.x, y: p.y })), thickness: s.thickness })),
        ...(mine[0]!.materialName ? { materialName: mine[0]!.materialName } : {}),
        names: mine.map((s) => s.name),
      });
    }
    if (ribs) warnings.push(`${lv.name}: ${Math.round((ribs.h - ribs.c) * 100)}+${Math.round(ribs.c * 100)}, ${Math.round(ribs.ribBottom * 100)}/${Math.round(ribs.spacingX * 100)}`);
  }
  return { members: out, walls, floors, warnings };
}

/** Concrete per square metre of a waffle, m: the topping and the ribs both ways, the crossings once. */
export function ribbedVolume(g: RibbedGeometry): number {
  const hw = g.h - g.c, bw = g.ribBottom, sx = g.spacingX, sy = g.spacingY ?? g.spacingX;
  return g.c + (bw * hw) / sx + (bw * hw) / sy - (bw * bw * hw) / (sx * sy);
}
