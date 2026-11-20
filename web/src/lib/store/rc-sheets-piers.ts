/**
 * The piers of the sheets: the walls and the columns inside them read from the demands, each
 * pier designed once its storey's walls come up (`pier-row.ts`).
 */
import { recognizePiers, type Pier, type PierColumn, type PierWall } from '../rc-sheets/piers';
import { legDemand, pierCombos, zoneCandidates, zoneHosts } from '../rc-sheets/pier-design';
import { columnOfPier, designPier, unloaded, type PierDesign } from '../rc-sheets/pier-row';
import { stackOver } from '../rc-sheets/column-stack';
import { boundaryBars, type WallContext, type WallDemand, type WallRow } from '../rc-sheets/wall-row';
import type { ColumnContext, ColumnDemand, ColumnRow, StackPlace } from '../rc-sheets/column-row';
import { computeLocalAxes3D, memberRoll } from '../engine/local-axes-3d';
import { modelStore } from './model.svelte';
import type { Fmt } from '../rc-sheets/format';
import { barArea } from '../rc-sheets/bars';
import { check, COLUMN_BAR_RANGE, listIn, type CheckLine, type ColumnAdopted, type WallAdopted } from '../rc-sheets/types';

export const pierWallOf = (d: WallDemand): PierWall | null =>
  (d.plan && d.z !== undefined ? { key: d.key, name: d.name, plan: d.plan, thickness: d.thickness, z: d.z, height: d.height } : null);

export const pierColumnOf = (d: ColumnDemand): PierColumn | null =>
  (d.plan ? { key: d.key, name: d.name, x: d.plan.x, y: d.plan.y, z: d.plan.z, height: d.length, b: d.b, h: d.h, ey: d.plan.ey, ez: d.plan.ez } : null);

/** Every storey's groups of walls that meet, with the columns inside them. */
export function storeyPiers(walls: readonly WallDemand[], columns: readonly ColumnDemand[]): Pier[] {
  return recognizePiers(walls.map(pierWallOf).filter((w): w is PierWall => !!w), columns.map(pierColumnOf).filter((c): c is PierColumn => !!c));
}

export interface PierHooks {
  fmt: Fmt;
  fy: number;
  diameters: readonly number[];
  wallCtx(d: WallDemand): WallContext;
  wallAdopted(key: string): WallAdopted | undefined;
  wallRow(d: WallDemand, c: WallContext, a: WallAdopted | undefined): WallRow;
  columnCtx(d: ColumnDemand): ColumnContext;
  columnAdopted(key: string): ColumnAdopted | undefined;
  columnRow(d: ColumnDemand, c: ColumnContext, a: ColumnAdopted | undefined, stack: StackPlace): ColumnRow;
  /** The column storey below as first designed, whose bars this one laps with. */
  below(d: ColumnDemand): ColumnRow | undefined;
}

const BOUNDARY_COUNTS = [2, 4, 6, 8, 10, 12];

/** One pier designed: its walls with their columns' shear, its column zones from their minimum, the section checked whole. */
export function designPierAt(pier: Pier, walls: readonly WallDemand[], columns: readonly ColumnDemand[], h: PierHooks): PierDesign {
  const wallDs = pier.walls.map((w) => walls.find((d) => d.key === w.key)!).filter(Boolean);
  const colDs = pier.columns.map((c) => columns.find((d) => d.key === c.key)!).filter(Boolean);
  const geo = new Map(wallDs.map((d) => [d.key, pierWallOf(d)!] as const));
  const { combos, missing } = pierCombos(pier, wallDs, colDs);
  const fc = Math.min(...wallDs.map((d) => h.wallCtx(d).mat.fc), ...colDs.map((d) => h.columnCtx(d).mat.fc));
  const boundaries = boundaryBars(h.diameters).flatMap((diameter) => BOUNDARY_COUNTS.map((count) => ({ count, diameter })))
    .sort((p, q) => p.count * barArea(p.diameter) - q.count * barArea(q.diameter));
  return designPier({
    pier, walls: geo, mat: { fc, fy: h.fy }, combos, missing, boundaries,
    legs: wallDs.map((d) => {
      const leg = legDemand(d, pier, colDs, geo), ctx = h.wallCtx(d);
      return { key: d.key, cover: ctx.cover, design: (b) => h.wallRow(leg, { ...ctx, pier: b ? { boundary: b } : {} }, h.wallAdopted(d.key)) };
    }),
    zones: colDs.map((d, i) => {
      const ctx = h.columnCtx(d), prev = h.below(d);
      const start = h.columnRow(unloaded(d), ctx, undefined, prev ? stackOver(prev, d) : {}).proposed;
      const corners = pier.columns[i]!.corners;
      const own = h.columnAdopted(d.key);
      return {
        key: d.key, name: d.name, column: d, corners, cover: ctx.cover, ...(ctx.aggregate !== undefined ? { aggregate: ctx.aggregate } : {}), start,
        host: zoneHosts(corners, [...geo.values()])[0] ?? wallDs[0]!.key, ...(own ? { adopted: own } : {}),
        candidates: (hoops) => zoneCandidates(d, start, listIn(ctx.diameters, COLUMN_BAR_RANGE), ctx.cover, ctx, hoops, ctx.aggregate ?? 0),
      };
    }),
  });
}

/** A column storey of a pier as its row, laid over the storey below it as finally designed. */
export function pierColumnRow(p: PierDesign, d: ColumnDemand, prev: ColumnRow | undefined, h: Pick<PierHooks, 'columnCtx' | 'columnRow' | 'fmt'>): ColumnRow {
  const zone = p.zones.find((z) => z.key === d.key)!;
  const base = h.columnRow(unloaded(d), h.columnCtx(d), zone.adopted, prev ? stackOver(prev, d) : {});
  return columnOfPier(base, d, p, zone, h.fmt);
}

/** Under a code whose sections the piers are not checked with, the walls and columns that overlap say they were designed apart. */
export function withApart<R extends { key: string; verifications: CheckLine[] }>(rows: readonly R[], piers: readonly Pier[]): R[] {
  const names = new Map(piers.filter((p) => p.columns.length).flatMap((p) => [...p.walls.map((w) => w.key), ...p.columns.map((c) => c.key)].map((k) => [k, p.name] as const)));
  return rows.map((r) => (names.has(r.key) ? { ...r, verifications: [...r.verifications, check('rcSheets.v.pierApart', true, { demand: names.get(r.key)! })] } : r));
}

/** A member's local axes as the solve builds them, from its nodes, its local y and its roll. */
export function memberAxes(id: number): { ex: [number, number, number]; ey: [number, number, number]; ez: [number, number, number] } | null {
  const e = modelStore.elements.get(id);
  const a = e && modelStore.nodes.get(e.nodeI), b = e && modelStore.nodes.get(e.nodeJ);
  if (!e || !a || !b) return null;
  const ly = e.localYx !== undefined ? { x: e.localYx, y: e.localYy ?? 0, z: e.localYz ?? 0 } : undefined;
  try { return computeLocalAxes3D({ id: a.id, x: a.x, y: a.y, z: a.z ?? 0 }, { id: b.id, x: b.x, y: b.y, z: b.z ?? 0 }, ly, memberRoll(e, modelStore.sections)); } catch { return null; }
}

/**
 * The column rows with each storey inside a pier as the pier's, laid over the storey below as
 * finally designed, and a free storey right above one designed again over it (`free`).
 */
export function withPierColumns(demands: readonly ColumnDemand[], rows: readonly ColumnRow[], designs: ReadonlyMap<string, PierDesign>, h: PierHooks, free: (d: ColumnDemand, below: ColumnRow) => ColumnRow): ColumnRow[] {
  const designOf = new Map([...designs.values()].flatMap((p) => p.zones.map((z) => [z.key, p] as const)));
  const group = (k: string) => k.split(':')[1];
  let prev: ColumnRow | undefined;
  return demands.map((d, i) => {
    const before = i > 0 && group(demands[i - 1]!.key) === group(d.key) ? prev : undefined;
    const p = designOf.get(d.key);
    const row = p ? pierColumnRow(p, d, before, h) : before?.pier ? free(d, before) : rows.find((r) => r.key === d.key)!;
    prev = row;
    return row;
  });
}
