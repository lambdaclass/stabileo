/**
 * The result tables read across many combinations at once.
 *
 * The PRO tables showed one result set — the case, combination or envelope on screen. On a
 * project with dozens of combinations the questions are different ones:
 *
 *   · ALL: every combination's rows in one table, to read a node or a member across them.
 *   · SUMMARY: for each column, the largest and smallest value anywhere, where, and under which
 *     combination — the first thing checked after a solve.
 *   · ENVELOPE: for each node or member end, the largest and smallest value over the
 *     combinations, each with the combination that produced it.
 *   · MAX BY TYPE (members): the governing axial force, bending moment and shear of each member
 *     ALONG it, not only at its ends. These are the station demands design already computes
 *     (`verification-service.ts#computeStationDemands`) and are read from there, so the table
 *     and the design can never disagree.
 *
 * Every view takes the same options (`TableOptions`): which nodes or members (a selection or a
 * group), the resultant columns, and, for members, stations along each member instead of its two
 * ends. The station values are the diagram's (`station-forces.ts`), which at the ends are the end
 * forces themselves.
 *
 * Pure functions over solved results; the component wires them to the active combinations.
 */

import type { AnalysisResults3D } from './types-3d';
import type { Quantity } from '../utils/units';
import type { ElementDesignDemands, GoverningDemand } from './station-design-forces';
import { extractForcesAtStation, stationTs, type StationSpec } from './station-forces';

export type TableKind = 'displacements' | 'reactions' | 'forces';

/** A column: its key, label, SI unit, and the physical quantity its values are (for display units). */
export interface Column { key: string; label: string; unit: string; qty: Quantity }

export const COLUMNS: Readonly<Record<TableKind, readonly Column[]>> = Object.freeze({
  displacements: [
    { key: 'ux', label: 'ux', unit: 'm', qty: 'displacement' }, { key: 'uy', label: 'uy', unit: 'm', qty: 'displacement' }, { key: 'uz', label: 'uz', unit: 'm', qty: 'displacement' },
    { key: 'rx', label: 'θx', unit: 'rad', qty: 'rotation' }, { key: 'ry', label: 'θy', unit: 'rad', qty: 'rotation' }, { key: 'rz', label: 'θz', unit: 'rad', qty: 'rotation' },
  ],
  reactions: [
    { key: 'fx', label: 'Fx', unit: 'kN', qty: 'force' }, { key: 'fy', label: 'Fy', unit: 'kN', qty: 'force' }, { key: 'fz', label: 'Fz', unit: 'kN', qty: 'force' },
    { key: 'mx', label: 'Mx', unit: 'kN·m', qty: 'moment' }, { key: 'my', label: 'My', unit: 'kN·m', qty: 'moment' }, { key: 'mz', label: 'Mz', unit: 'kN·m', qty: 'moment' },
  ],
  forces: [
    { key: 'n', label: 'N', unit: 'kN', qty: 'force' }, { key: 'vy', label: 'Vy', unit: 'kN', qty: 'force' }, { key: 'vz', label: 'Vz', unit: 'kN', qty: 'force' },
    { key: 'mx', label: 'T', unit: 'kN·m', qty: 'moment' }, { key: 'my', label: 'My', unit: 'kN·m', qty: 'moment' }, { key: 'mz', label: 'Mz', unit: 'kN·m', qty: 'moment' },
  ],
});

/** The resultants a table can add after its six components. */
export const RESULTANTS: Readonly<Record<TableKind, readonly Column[]>> = Object.freeze({
  displacements: [{ key: 'u', label: '|u|', unit: 'm', qty: 'displacement' }],
  reactions: [{ key: 'f', label: '|F|', unit: 'kN', qty: 'force' }, { key: 'm', label: '|M|', unit: 'kN·m', qty: 'moment' }],
  forces: [{ key: 'v', label: 'V', unit: 'kN', qty: 'force' }, { key: 'm', label: 'M', unit: 'kN·m', qty: 'moment' }],
});

export interface TableOptions {
  /** Only these nodes (displacements, reactions) or members (forces). Absent: all. */
  entities?: ReadonlySet<number> | null;
  /** Add the resultant columns: |u|; |F| and |M|; V = √(Vy² + Vz²) and M = √(My² + Mz²). */
  resultant?: boolean;
  /**
   * Members: this many equally spaced stations along each, ends included, or the critical ones
   * (`station-forces.ts#buildCriticalStations`). 2 (or absent): the ends.
   */
  stations?: StationSpec;
}

/** The columns a table has under `opts`. */
export function columnsOf(kind: TableKind, opts: TableOptions = {}): Column[] {
  return [...COLUMNS[kind], ...(opts.resultant ? RESULTANTS[kind] : [])];
}

function withResultants(kind: TableKind, v: number[]): number[] {
  if (kind === 'displacements') return [...v, Math.hypot(v[0]!, v[1]!, v[2]!)];
  if (kind === 'reactions') return [...v, Math.hypot(v[0]!, v[1]!, v[2]!), Math.hypot(v[3]!, v[4]!, v[5]!)];
  return [...v, Math.hypot(v[1]!, v[2]!), Math.hypot(v[4]!, v[5]!)];
}

/** A result set with a name: a combination, or a case when nothing is combined. */
export interface Source { id: number; name: string; results: AnalysisResults3D }

/** One row of one result set: a node, or a member end or station (`x`, m from end i). */
export interface Row { entity: number; end?: 'i' | 'j'; x?: number; values: number[] }

/** The rows of one result set, in the order the tables list them. */
export function rowsOf(kind: TableKind, r: AnalysisResults3D, opts: TableOptions = {}): Row[] {
  const keep = (id: number) => !opts.entities || opts.entities.has(id);
  const fin = (row: Row): Row => (opts.resultant ? { ...row, values: withResultants(kind, row.values) } : row);
  if (kind === 'displacements') return r.displacements.filter((d) => keep(d.nodeId)).map((d) => fin({ entity: d.nodeId, values: [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz] }));
  if (kind === 'reactions') return r.reactions.filter((x) => keep(x.nodeId)).map((x) => fin({ entity: x.nodeId, values: [x.fx, x.fy, x.fz, x.mx, x.my, x.mz] }));
  const out: Row[] = [];
  const spec = opts.stations ?? 2;
  const ends = spec !== 'critical' && Math.max(2, Math.floor(spec)) === 2;
  for (const f of r.elementForces) {
    if (!keep(f.elementId)) continue;
    if (ends) {
      out.push(fin({ entity: f.elementId, end: 'i', x: 0, values: [f.nStart, f.vyStart, f.vzStart, f.mxStart, f.myStart, f.mzStart] }));
      out.push(fin({ entity: f.elementId, end: 'j', x: f.length, values: [f.nEnd, f.vyEnd, f.vzEnd, f.mxEnd, f.myEnd, f.mzEnd] }));
      continue;
    }
    const ts = stationTs(f, spec);
    ts.forEach((t, k) => {
      const s = extractForcesAtStation(f, t);
      out.push(fin({ entity: f.elementId, ...(k === 0 ? { end: 'i' as const } : k === ts.length - 1 ? { end: 'j' as const } : {}), x: t * f.length, values: [s.n, s.vy, s.vz, s.torsion, s.my, s.mz] }));
    });
  }
  return out;
}

/**
 * Every source's rows, each tagged with its source. By source (the default): one source after
 * another. By entity: each node or member together, its ends or stations in order, every source
 * under each.
 */
export function allRows(kind: TableKind, sources: readonly Source[], opts: TableOptions = {}, order: 'source' | 'entity' = 'source'): Array<Row & { source: Source }> {
  const rows = sources.flatMap((s, si) => rowsOf(kind, s.results, opts).map((row, ri) => ({ ...row, source: s, si, ri })));
  if (order === 'entity') rows.sort((a, b) => a.entity - b.entity || (a.x ?? 0) - (b.x ?? 0) || a.si - b.si || a.ri - b.ri);
  return rows.map(({ si: _s, ri: _r, ...row }) => row);
}

/** A value, where it is, and under which source. */
export interface Extreme { value: number; entity: number; end?: 'i' | 'j'; x?: number; source: Source }

/** For each column, the largest and the smallest value over every row of every source. */
export function summaryRows(kind: TableKind, sources: readonly Source[], opts: TableOptions = {}): Array<{ column: Column; max: Extreme | null; min: Extreme | null }> {
  const cols = columnsOf(kind, opts);
  const max: Array<Extreme | null> = cols.map(() => null);
  const min: Array<Extreme | null> = cols.map(() => null);
  for (const s of sources) {
    for (const row of rowsOf(kind, s.results, opts)) {
      row.values.forEach((v, c) => {
        if (!Number.isFinite(v)) return;
        if (!max[c] || v > max[c]!.value) max[c] = { value: v, entity: row.entity, end: row.end, x: row.x, source: s };
        if (!min[c] || v < min[c]!.value) min[c] = { value: v, entity: row.entity, end: row.end, x: row.x, source: s };
      });
    }
  }
  return cols.map((column, c) => ({ column, max: max[c]!, min: min[c]! }));
}

/** One node or member end or station, enveloped: per column the largest and smallest value and their source. */
export interface EnvelopeRow { entity: number; end?: 'i' | 'j'; x?: number; max: Array<{ value: number; source: Source }>; min: Array<{ value: number; source: Source }> }

/** For each node or member end (or station), the largest and smallest value of each column over the sources. */
export function envelopeRows(kind: TableKind, sources: readonly Source[], opts: TableOptions = {}): EnvelopeRow[] {
  const byKey = new Map<string, EnvelopeRow>();
  for (const s of sources) {
    for (const row of rowsOf(kind, s.results, opts)) {
      const key = `${row.entity}:${row.end ?? ''}:${row.x?.toFixed(6) ?? ''}`;
      let e = byKey.get(key);
      if (!e) {
        e = { entity: row.entity, end: row.end, x: row.x, max: row.values.map((v) => ({ value: v, source: s })), min: row.values.map((v) => ({ value: v, source: s })) };
        byKey.set(key, e);
        continue;
      }
      row.values.forEach((v, c) => {
        if (v > e!.max[c]!.value) e!.max[c] = { value: v, source: s };
        if (v < e!.min[c]!.value) e!.min[c] = { value: v, source: s };
      });
    }
  }
  return [...byKey.values()];
}

/** The governing demands of one member along its length: N, and each axis's moment and shear. */
export interface MaxByTypeRow {
  elementId: number; length: number;
  axial: GoverningDemand | null;
  momentY: GoverningDemand | null; momentZ: GoverningDemand | null;
  shearY: GoverningDemand | null; shearZ: GoverningDemand | null;
}

/** The columns of the max-by-type table, in order, with the categories each one reads. */
export const MAX_TYPES = [
  { key: 'axial', label: 'N', unit: 'kN', qty: 'force', cats: ['N_compression', 'N_tension'] },
  { key: 'momentY', label: 'My', unit: 'kN·m', qty: 'moment', cats: ['My+', 'My-'] },
  { key: 'momentZ', label: 'Mz', unit: 'kN·m', qty: 'moment', cats: ['Mz+', 'Mz-'] },
  { key: 'shearY', label: 'Vy', unit: 'kN', qty: 'force', cats: ['Vy'] },
  { key: 'shearZ', label: 'Vz', unit: 'kN', qty: 'force', cats: ['Vz'] },
] as const;

/** Per member, the largest |N|, |My|, |Mz|, |Vy| and |Vz| along it, each with its station and combination. */
export function maxByType(demands: ReadonlyMap<number, ElementDesignDemands>, entities?: ReadonlySet<number> | null): MaxByTypeRow[] {
  const pick = (list: readonly GoverningDemand[], cats: readonly string[]) =>
    list.filter((d) => cats.includes(d.category)).reduce<GoverningDemand | null>((best, d) => (!best || d.absValue > best.absValue ? d : best), null);
  return [...demands.values()]
    .filter((d) => !entities || entities.has(d.elementId))
    .map((d) => {
      const row = { elementId: d.elementId, length: d.length } as MaxByTypeRow;
      for (const m of MAX_TYPES) row[m.key] = pick(d.demands, m.cats);
      return row;
    })
    .sort((a, b) => a.elementId - b.elementId);
}

/** Where a row is, as the tables write it: a node, a member end (12·i) or a station (12 @ 1,50). */
export function whereOf(r: { entity: number; end?: 'i' | 'j'; x?: number }, stations = false): string {
  if (stations && r.x !== undefined) return `${r.entity} @ ${r.x.toFixed(2)}`;
  return r.end ? `${r.entity}·${r.end}` : String(r.entity);
}

/** A table as CSV, first line a header. Values are written in full precision. */
export function toCsv(header: readonly string[], rows: ReadonlyArray<ReadonlyArray<string | number>>): string {
  const cell = (v: string | number) => (typeof v === 'number' ? String(v) : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\n');
}
