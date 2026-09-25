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
 * Pure functions over solved results; the component wires them to the active combinations.
 */

import type { AnalysisResults3D } from './types-3d';
import type { ElementDesignDemands, GoverningDemand } from './station-design-forces';

export type TableKind = 'displacements' | 'reactions' | 'forces';

export interface Column { key: string; label: string; unit: string }

export const COLUMNS: Readonly<Record<TableKind, readonly Column[]>> = Object.freeze({
  displacements: [
    { key: 'ux', label: 'ux', unit: 'm' }, { key: 'uy', label: 'uy', unit: 'm' }, { key: 'uz', label: 'uz', unit: 'm' },
    { key: 'rx', label: 'θx', unit: 'rad' }, { key: 'ry', label: 'θy', unit: 'rad' }, { key: 'rz', label: 'θz', unit: 'rad' },
  ],
  reactions: [
    { key: 'fx', label: 'Fx', unit: 'kN' }, { key: 'fy', label: 'Fy', unit: 'kN' }, { key: 'fz', label: 'Fz', unit: 'kN' },
    { key: 'mx', label: 'Mx', unit: 'kN·m' }, { key: 'my', label: 'My', unit: 'kN·m' }, { key: 'mz', label: 'Mz', unit: 'kN·m' },
  ],
  forces: [
    { key: 'n', label: 'N', unit: 'kN' }, { key: 'vy', label: 'Vy', unit: 'kN' }, { key: 'vz', label: 'Vz', unit: 'kN' },
    { key: 'mx', label: 'T', unit: 'kN·m' }, { key: 'my', label: 'My', unit: 'kN·m' }, { key: 'mz', label: 'Mz', unit: 'kN·m' },
  ],
});

/** A result set with a name: a combination, or a case when nothing is combined. */
export interface Source { id: number; name: string; results: AnalysisResults3D }

/** One row of one result set: a node, or a member end. */
export interface Row { entity: number; end?: 'i' | 'j'; values: number[] }

/** The rows of one result set, in the order the tables list them. */
export function rowsOf(kind: TableKind, r: AnalysisResults3D): Row[] {
  if (kind === 'displacements') return r.displacements.map((d) => ({ entity: d.nodeId, values: [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz] }));
  if (kind === 'reactions') return r.reactions.map((x) => ({ entity: x.nodeId, values: [x.fx, x.fy, x.fz, x.mx, x.my, x.mz] }));
  const out: Row[] = [];
  for (const f of r.elementForces) {
    out.push({ entity: f.elementId, end: 'i', values: [f.nStart, f.vyStart, f.vzStart, f.mxStart, f.myStart, f.mzStart] });
    out.push({ entity: f.elementId, end: 'j', values: [f.nEnd, f.vyEnd, f.vzEnd, f.mxEnd, f.myEnd, f.mzEnd] });
  }
  return out;
}

/** Every source's rows, each tagged with its source. */
export function allRows(kind: TableKind, sources: readonly Source[]): Array<Row & { source: Source }> {
  return sources.flatMap((s) => rowsOf(kind, s.results).map((row) => ({ ...row, source: s })));
}

/** A value, where it is, and under which source. */
export interface Extreme { value: number; entity: number; end?: 'i' | 'j'; source: Source }

/** For each column, the largest and the smallest value over every row of every source. */
export function summaryRows(kind: TableKind, sources: readonly Source[]): Array<{ column: Column; max: Extreme | null; min: Extreme | null }> {
  const cols = COLUMNS[kind];
  const max: Array<Extreme | null> = cols.map(() => null);
  const min: Array<Extreme | null> = cols.map(() => null);
  for (const s of sources) {
    for (const row of rowsOf(kind, s.results)) {
      row.values.forEach((v, c) => {
        if (!Number.isFinite(v)) return;
        if (!max[c] || v > max[c]!.value) max[c] = { value: v, entity: row.entity, end: row.end, source: s };
        if (!min[c] || v < min[c]!.value) min[c] = { value: v, entity: row.entity, end: row.end, source: s };
      });
    }
  }
  return cols.map((column, c) => ({ column, max: max[c]!, min: min[c]! }));
}

/** One node or member end, enveloped: per column the largest and smallest value and their source. */
export interface EnvelopeRow { entity: number; end?: 'i' | 'j'; max: Array<{ value: number; source: Source }>; min: Array<{ value: number; source: Source }> }

/** For each node or member end, the largest and smallest value of each column over the sources. */
export function envelopeRows(kind: TableKind, sources: readonly Source[]): EnvelopeRow[] {
  const byKey = new Map<string, EnvelopeRow>();
  for (const s of sources) {
    for (const row of rowsOf(kind, s.results)) {
      const key = `${row.entity}:${row.end ?? ''}`;
      let e = byKey.get(key);
      if (!e) {
        e = { entity: row.entity, end: row.end, max: row.values.map((v) => ({ value: v, source: s })), min: row.values.map((v) => ({ value: v, source: s })) };
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

/** The three governing demands of one member along its length. */
export interface MaxByTypeRow { elementId: number; length: number; axial: GoverningDemand | null; bending: GoverningDemand | null; shear: GoverningDemand | null }

const AXIAL = new Set(['N_compression', 'N_tension']);
const BENDING = new Set(['Mz+', 'Mz-', 'My+', 'My-']);
const SHEAR = new Set(['Vy', 'Vz']);

/** Per member, the largest |N|, |M| and |V| along it, each with its station and combination. */
export function maxByType(demands: ReadonlyMap<number, ElementDesignDemands>): MaxByTypeRow[] {
  const pick = (list: readonly GoverningDemand[], cats: Set<string>) =>
    list.filter((d) => cats.has(d.category)).reduce<GoverningDemand | null>((best, d) => (!best || d.absValue > best.absValue ? d : best), null);
  return [...demands.values()]
    .map((d) => ({ elementId: d.elementId, length: d.length, axial: pick(d.demands, AXIAL), bending: pick(d.demands, BENDING), shear: pick(d.demands, SHEAR) }))
    .sort((a, b) => a.elementId - b.elementId);
}

/** A table as CSV, first line a header. Values are written in full precision. */
export function toCsv(header: readonly string[], rows: ReadonlyArray<ReadonlyArray<string | number>>): string {
  const cell = (v: string | number) => (typeof v === 'number' ? String(v) : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\n');
}
