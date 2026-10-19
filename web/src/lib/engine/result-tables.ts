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
import { csvCell } from './result-query';
import type { ElementDesignDemands, GoverningDemand } from './station-design-forces';
import { stationTs, type StationSpec } from './station-forces';
import { evaluateDiagramAt } from './diagrams-3d';

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

/** `v` with its resultants appended, in place: every caller hands it an array of its own. */
function withResultants(kind: TableKind, v: number[]): number[] {
  if (kind === 'displacements') v.push(Math.hypot(v[0]!, v[1]!, v[2]!));
  else if (kind === 'reactions') v.push(Math.hypot(v[0]!, v[1]!, v[2]!), Math.hypot(v[3]!, v[4]!, v[5]!));
  else v.push(Math.hypot(v[1]!, v[2]!), Math.hypot(v[4]!, v[5]!));
  return v;
}

/** A result set with a name: a combination, or a case when nothing is combined. */
export interface Source { id: number; name: string; results: AnalysisResults3D }

/** One row of one result set: a node, or a member end or station (`x`, m from end i). */
export interface Row { entity: number; end?: 'i' | 'j'; x?: number; values: number[] }

/**
 * Each row of one result set, in the order the tables list them, handed to `visit` without
 * building a row object. `values` is the row's own array (resultants included under `resultant`).
 *
 * The summary reads every station of every member of every source and keeps two values per
 * column; built as rows first, a 13-station summary of a 5 000-member frame over four
 * combinations allocated a quarter of a million rows, each copied once more for its resultants,
 * and the report spent nearly nine tenths of its time there (`scale-budget.test.ts`).
 */
function eachRow(kind: TableKind, r: AnalysisResults3D, opts: TableOptions, visit: (entity: number, end: 'i' | 'j' | undefined, x: number | undefined, values: number[]) => void): void {
  const keep = (id: number) => !opts.entities || opts.entities.has(id);
  const fin = (v: number[]) => (opts.resultant ? withResultants(kind, v) : v);
  if (kind === 'displacements') {
    for (const d of r.displacements) if (keep(d.nodeId)) visit(d.nodeId, undefined, undefined, fin([d.ux, d.uy, d.uz, d.rx, d.ry, d.rz]));
    return;
  }
  if (kind === 'reactions') {
    for (const x of r.reactions) if (keep(x.nodeId)) visit(x.nodeId, undefined, undefined, fin([x.fx, x.fy, x.fz, x.mx, x.my, x.mz]));
    return;
  }
  const spec = opts.stations ?? 2;
  const ends = spec !== 'critical' && Math.max(2, Math.floor(spec)) === 2;
  for (const f of r.elementForces) {
    if (!keep(f.elementId)) continue;
    if (ends) {
      visit(f.elementId, 'i', 0, fin([f.nStart, f.vyStart, f.vzStart, f.mxStart, f.myStart, f.mzStart]));
      visit(f.elementId, 'j', f.length, fin([f.nEnd, f.vyEnd, f.vzEnd, f.mxEnd, f.myEnd, f.mzEnd]));
      continue;
    }
    const ts = stationTs(f, spec);
    for (let k = 0; k < ts.length; k++) {
      const t = ts[k]!;
      // `extractForcesAtStation`'s six diagrams, without the station record it also builds.
      const v = [evaluateDiagramAt(f, 'axial', t), evaluateDiagramAt(f, 'shearY', t), evaluateDiagramAt(f, 'shearZ', t),
        evaluateDiagramAt(f, 'torsion', t), evaluateDiagramAt(f, 'momentY', t), evaluateDiagramAt(f, 'momentZ', t)];
      visit(f.elementId, k === 0 ? 'i' : k === ts.length - 1 ? 'j' : undefined, t * f.length, fin(v));
    }
  }
}

/** The rows of one result set, in the order the tables list them. */
export function rowsOf(kind: TableKind, r: AnalysisResults3D, opts: TableOptions = {}): Row[] {
  const out: Row[] = [];
  eachRow(kind, r, opts, (entity, end, x, values) => {
    out.push(kind === 'forces' ? { entity, ...(end ? { end } : {}), x, values } : { entity, values });
  });
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

/**
 * Whether `v` at `(entity, x)` takes the place of the current extreme `e`: beyond it by more than
 * round-off in the direction `sign` (+1 for a maximum, −1 for a minimum), or tied with it and at a
 * lower entity or position.
 *
 * Ties are common (a symmetric structure, two members of one row) and were broken by which came
 * first, and the engine assembles over hash maps whose order changes from one process to the
 * next: the last digit moved, and the table named a different member for the same value each
 * run. Within 1e-9 of the value two results are the same result, and the lowest id is named.
 */
export function beatsExtreme(sign: 1 | -1, v: number, entity: number, x: number | undefined, e: { value: number; entity: number; x?: number } | null): boolean {
  if (!e) return true;
  const tol = 1e-9 * Math.max(Math.abs(v), Math.abs(e.value), 1e-12);
  const d = sign * (v - e.value);
  if (d > tol) return true;
  if (d < -tol) return false;
  return entity < e.entity || (entity === e.entity && (x ?? 0) < (e.x ?? 0));
}

/** For each column, the largest and the smallest value over every row of every source. */
export function summaryRows(kind: TableKind, sources: readonly Source[], opts: TableOptions = {}): Array<{ column: Column; max: Extreme | null; min: Extreme | null }> {
  const cols = columnsOf(kind, opts);
  const max: Array<Extreme | null> = cols.map(() => null);
  const min: Array<Extreme | null> = cols.map(() => null);
  for (const s of sources) {
    eachRow(kind, s.results, opts, (entity, end, x, values) => {
      for (let c = 0; c < values.length; c++) {
        const v = values[c]!;
        if (!Number.isFinite(v)) continue;
        if (beatsExtreme(1, v, entity, x, max[c]!)) max[c] = { value: v, entity, end, x, source: s };
        if (beatsExtreme(-1, v, entity, x, min[c]!)) min[c] = { value: v, entity, end, x, source: s };
      }
    });
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
        // A tie within round-off keeps the earlier source: the sources' order is stable, the last digit is not.
        const tol = (a: number) => 1e-9 * Math.max(Math.abs(v), Math.abs(a), 1e-12);
        if (v - e!.max[c]!.value > tol(e!.max[c]!.value)) e!.max[c] = { value: v, source: s };
        if (e!.min[c]!.value - v > tol(e!.min[c]!.value)) e!.min[c] = { value: v, source: s };
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
  // csvCell also neutralises formula injection: case and combination names are user-editable
  // and travel in shared .ded files, and a spreadsheet evaluates a cell starting with = + - @.
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}
