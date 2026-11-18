/**
 * A pier designed as one section: its forces are the walls' base resultants and the columns'
 * forces at the cut summed about the section's centroid; its bars are the walls' curtains and the
 * columns' bars, which stand where each column is as its boundary element. The axial load and the
 * biaxial bending are checked on the whole outline by strain compatibility (§22.4, the general
 * section engine). The column zone starts from the column's own minimum and grows, a thicker bar
 * first and then more bars, until the section holds; past that the walls' free ends take boundary
 * bars. Shear, the distributed minima, the bending out of the plane and chapter 18 stay with each
 * wall, the column's shear added to the wall it runs along.
 */
import { withSection, type Bar } from '../engine/codes/argentina/cirsoc201-section';
import { CIRSOC201_DESIGN_EDITION } from '../engine/codes/argentina/cirsoc201-basis';
import { barArea } from './bars';
import { barClearance, columnLayout, growColumn, rowClear } from './column-layout';
import { tieDiaFor, tieSpacingLimit, type ColumnDemand } from './column-row';
import { wallVerticalBars } from './wall-member';
import { insideConvex, overlapArea, wallCorners, type P, type Pier, type PierWall } from './piers';
import { allowedTie, tieDiametersOf, type ColumnAdopted, type Materials, type TransverseList, type WallAdopted } from './types';
import type { WallComboForces, WallDemand } from './wall-row';

export interface PierCombo { combo: string; n: number; mx: number; my: number; vx: number; vy: number }

export interface PierCheck { ratios: number[]; ratio: number; ok: boolean; combo: string; bars: number; ast: number }

const unit = (w: Pick<PierWall, 'plan'>): { u: P; n: P; mid: P; L: number } => {
  const dx = w.plan.x2 - w.plan.x1, dy = w.plan.y2 - w.plan.y1, L = Math.hypot(dx, dy) || 1;
  return { u: { x: dx / L, y: dy / L }, n: { x: -dy / L, y: dx / L }, mid: { x: (w.plan.x1 + w.plan.x2) / 2, y: (w.plan.y1 + w.plan.y2) / 2 }, L };
};

const planOf = (c: ColumnDemand) => c.plan ?? { x: 0, y: 0, z: 0, ey: [1, 0] as [number, number], ez: [0, 1] as [number, number] };

/**
 * The pier's forces in each combination about its centroid: N up on the storey above, Mx and My
 * as the section engine signs them (Mx compresses +y, My compresses −x) and the shears; with the
 * combinations some part lacks.
 */
export function pierCombos(pier: Pick<Pier, 'centroid'>, walls: readonly Pick<WallDemand, 'combos'>[], columns: readonly ColumnDemand[]): { combos: PierCombo[]; missing: string[] } {
  const names = [...new Set([...walls.flatMap((w) => w.combos.map((k) => k.combo)), ...columns.flatMap((c) => c.cases.map((k) => k.combo))])];
  const combos: PierCombo[] = [], missing: string[] = [];
  for (const name of names) {
    let n = 0, mx = 0, my = 0, vx = 0, vy = 0, lacks = false;
    for (const w of walls) {
      const g = w.combos.find((k) => k.combo === name)?.global;
      if (!g) { lacks = true; continue; }
      n += g.n; mx += g.mx; my += g.my; vx += g.vx; vy += g.vy;
    }
    for (const c of columns) {
      const b = c.cases.find((k) => k.combo === name)?.base, p = planOf(c);
      if (!b) { lacks = true; continue; }
      n += b.n; mx += b.mx + p.y * b.n; my += b.my - p.x * b.n; vx += b.vx; vy += b.vy;
    }
    if (lacks) missing.push(name);
    combos.push({ combo: name, n, mx: mx - pier.centroid.y * n, my: my + pier.centroid.x * n, vx, vy });
  }
  return { combos, missing };
}

/** A wall of a pier with the shear of the columns it runs along added in each combination: a column's share goes to the walls parallel to it, split among them. */
export function legDemand(d: WallDemand, pier: Pick<Pier, 'columns'>, columns: readonly ColumnDemand[], walls: ReadonlyMap<string, Pick<PierWall, 'plan'>>): WallDemand {
  if (!d.plan) return d;
  const { u } = unit({ plan: d.plan });
  const mine = pier.columns.filter((c) => c.legs.includes(d.key));
  if (!mine.length) return d;
  const combos: WallComboForces[] = d.combos.map((k) => {
    if (!k.global) return k;
    let v = k.global.vx * u.x + k.global.vy * u.y;
    for (const part of mine) {
      const b = columns.find((c) => c.key === part.key)?.cases.find((x) => x.combo === k.combo)?.base;
      if (!b) continue;
      const parallel = part.legs.filter((l) => { const w = walls.get(l); if (!w) return false; const o = unit(w).u; return Math.abs(o.x * u.x + o.y * u.y) > 0.9; }).length;
      v += (b.vx * u.x + b.vy * u.y) / Math.max(1, parallel);
    }
    return { ...k, vu: Math.abs(v) };
  });
  return { ...d, combos };
}

export interface LegBars { wall: Pick<PierWall, 'plan' | 'thickness'>; cover: number; adopted: WallAdopted }
export interface ZoneBars { column: ColumnDemand; corners: P[]; adopted: ColumnAdopted; cover: number; aggregate?: number }

/** A column zone's bars in plan, m, with their diameters. */
export function zoneBarsInPlan(z: ZoneBars): Array<P & { dia: number }> {
  const p = planOf(z.column);
  const lb = Math.hypot(...p.ey) || 1, lh = Math.hypot(...p.ez) || 1;
  return columnLayout(z.column, z.adopted, z.cover, z.aggregate).bars.map((b) => ({
    x: p.x + (b.x * p.ey[0]) / lb + (b.y * p.ez[0]) / lh, y: p.y + (b.x * p.ey[1]) / lb + (b.y * p.ez[1]) / lh, dia: b.dia,
  }));
}

/** A wall's vertical bars in plan, m, with their diameters. */
export function legBarsInPlan(l: LegBars): Array<P & { dia: number; boundary: boolean }> {
  const { u, n, mid, L } = unit(l.wall);
  const own = wallVerticalBars(L, l.wall.thickness, l.cover, l.adopted);
  const nDist = (l.adopted.curtains === 2 ? 2 : 1) * Math.max(2, Math.floor(L / l.adopted.vertical.spacing) + 1);
  return own.map((b, i) => ({ x: mid.x + b.x * u.x + b.y * n.x, y: mid.y + b.x * u.y + b.y * n.y, dia: i < nDist ? l.adopted.vertical.diameter : l.adopted.boundary!.diameter, boundary: i >= nDist }));
}

/** The pier's bars about its centroid: the columns' and the walls' outside the columns, a wall bar dropped where another already stands. */
export function pierBars(pier: Pick<Pier, 'centroid'>, legs: readonly LegBars[], zones: readonly ZoneBars[]): Bar[] {
  const placed: Array<P & { dia: number }> = zones.flatMap(zoneBarsInPlan);
  for (const l of legs) for (const b of legBarsInPlan(l)) {
    if (zones.some((z) => insideConvex(b, z.corners))) continue;
    if (placed.some((q) => Math.hypot(q.x - b.x, q.y - b.y) < (q.dia + b.dia) / 2000)) continue;
    placed.push(b);
  }
  return placed.map((b) => ({ x: b.x - pier.centroid.x, y: b.y - pier.centroid.y, area: barArea(b.dia) * 1e-4 }));
}

/** Demand over capacity of each combination on the whole section: the axial limits, then φMn along the demand's own moment direction at its axial load. */
export function checkPier(pier: Pick<Pier, 'outline' | 'centroid'>, bars: readonly Bar[], mat: Materials, combos: readonly PierCombo[]): PierCheck {
  const shift = (p: P) => ({ x: p.x - pier.centroid.x, y: p.y - pier.centroid.y });
  const outline = { kind: 'polygon' as const, outer: pier.outline.outer.map(shift), holes: pier.outline.holes.map((h) => h.map(shift)) };
  const ratios = withSection(outline, bars, { fc: mat.fc, fy: mat.fy, edition: CIRSOC201_DESIGN_EDITION }, (s) => {
    const info = s.info();
    return combos.map((k) => {
      if (k.n > info.phiPnMax) return k.n / Math.max(info.phiPnMax, 1e-9);
      if (k.n < info.phiPntMax) return k.n / Math.min(info.phiPntMax, -1e-9);
      const m = Math.hypot(k.mx, k.my);
      if (m < 1e-6) return k.n > 0 ? k.n / Math.max(info.phiPnMax, 1e-9) : k.n / Math.min(info.phiPntMax, -1e-9);
      const cap = s.momentCapacityAtAxial(k.n, k.mx, k.my);
      return cap && cap.phiMn > 1e-9 ? m / cap.phiMn : Number.POSITIVE_INFINITY;
    });
  });
  const worst = ratios.reduce((w, x, i) => (x > ratios[w]! ? i : w), 0);
  const ratio = Math.max(0, ...ratios);
  return { ratios, ratio, ok: ratio <= 1 + 1e-6, combo: combos[worst]?.combo ?? '', bars: bars.length, ast: bars.reduce((s, b) => s + b.area, 0) * 1e4 };
}

/** The ties a column zone takes: the column's for its thickest bar, at the column's spacing or closer, and the boundary hoops of its walls where closer or thicker. */
export function zoneTies(start: ColumnAdopted, a: ColumnAdopted, d: { b: number; h: number }, c: TransverseList, hoops?: { dia: number; spacing: number }): Pick<ColumnAdopted, 'tieDia' | 'tieSpacing'> {
  const dias = [a.corner, a.dx, a.dy, a.inner?.dia ?? a.corner];
  const tie = Math.max(allowedTie(c, tieDiaFor(Math.max(...dias))) ?? tieDiametersOf(c).at(-1)!, start.tieDia, hoops?.dia ?? 0);
  const limit = Math.floor(tieSpacingLimit(Math.min(...dias), tie, Math.min(d.b, d.h)) / 0.025 + 1e-9) * 0.025;
  return { tieDia: tie, tieSpacing: Math.round(Math.min(start.tieSpacing, limit, hoops?.spacing ?? Infinity) * 1000) / 1000 };
}

/** Every layout a column zone may grow through from its minimum, in order: each count of bars at each thicker bar of the list, then one bar more on a pair of faces. */
export function zoneCandidates(d: { b: number; h: number }, start: ColumnAdopted, diameters: readonly number[], cover: number, c: TransverseList, hoops?: { dia: number; spacing: number }, aggregate = 0): ColumnAdopted[] {
  const base = Math.max(start.corner, start.dx, start.dy);
  const dias = [...new Set(diameters)].filter((x) => x >= base).sort((p, q) => p - q);
  const fits = (a: ColumnAdopted) => barClearance(d, columnLayout(d, a, cover, aggregate).bars, cover, a.tieDia, (dia) => rowClear(dia, aggregate)).ok;
  const out: ColumnAdopted[] = [];
  let counts: ColumnAdopted | null = start;
  for (let k = 0; counts && k < 8; k++) {
    for (const dia of dias) {
      const raw: ColumnAdopted = { ...counts, corner: dia, dx: dia, dy: dia, ...(counts.inner ? { inner: { ...counts.inner, dia } } : {}) };
      const a = { ...raw, ...zoneTies(start, raw, d, c, hoops) };
      if (fits(a)) out.push(a);
    }
    counts = growColumn(d, counts, cover, base, fits, true, aggregate);
  }
  return out;
}

/** The walls a column zone overlaps, by key, the one it shares most with first. */
export function zoneHosts(corners: readonly P[], walls: readonly PierWall[]): string[] {
  return walls.map((w) => ({ k: w.key, a: overlapArea(corners, wallCorners(w)) })).filter((x) => x.a > 0).sort((p, q) => q.a - p.a).map((x) => x.k);
}
