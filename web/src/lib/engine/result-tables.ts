import { criticalMemberForceExtrema3D } from './member-force-extrema';
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
 * ends.
 *
 * Pure functions over solved results; the component wires them to the active combinations.
 */

import type { AnalysisResults3D, ElementForces3D } from './types-3d';
import type { Quantity } from '../utils/units';
import { csvCell, envelopeQuerySources, envelopeSourcesByMember } from './result-query';
import type { ElementDesignDemands, GoverningDemand } from './station-design-forces';
import { criticalForceStations, stationTs, type StationSpec } from './station-forces';
import { boundSpatialEnvelope, memberEndFace, memberSectionStation, requireConcurrentSectionForces, unavailableDiagramExtrema, type DiagramStation } from './member-diagram';
import { sameCutLocation } from './diagram-cut';
import { memberEndForces3D, prepareDiagramEvaluator3D, type Diagram3DKind } from './diagrams-3d';
import { resultComponents } from '../axes/result-components';
import { makeFrame, type AxesChoice } from '../axes/frame';

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
  axes: AxesChoice;
  signedOnly?: boolean;
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
export function columnsOf(kind: TableKind, opts: Pick<TableOptions, 'resultant'> = {}): Column[] {
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

export function extremaResultSources(sources: readonly Source[], signedOnly = false): readonly Source[] {
  const signed = sources.filter(source => !source.results.magnitude);
  return signedOnly || signed.length > 0 ? signed : sources;
}

/** One row of one result set: a node, or a member end or station (`x`, m from end i). */
export interface Row { entity: number; end?: 'i' | 'j'; x?: number; side?: Extreme['side']; values: number[] }

function usesMemberEnds(spec: StationSpec): boolean {
  return spec !== 'critical' && Math.max(2, Math.floor(spec)) === 2;
}

/**
 * Each row of one result set, in the order the tables list them, handed to `visit` without
 * building a row object. `values` is the row's own array (resultants included under `resultant`).
 *
 * The summary reads every station of every member of every source and keeps two values per
 * column; built as rows first, a 13-station summary of a 5 000-member frame over four
 * combinations allocated a quarter of a million rows, each copied once more for its resultants,
 * and the report spent nearly nine tenths of its time there (`scale-budget.test.ts`).
 */
function eachRow(kind: TableKind, r: AnalysisResults3D, opts: TableOptions, visit: (entity: number, end: 'i' | 'j' | undefined, x: number | undefined, values: number[], side?: Extreme['side']) => void, sharedStations?: ReadonlyMap<number, readonly DiagramStation[]>): void {
  const keep = (id: number) => !opts.entities || opts.entities.has(id);
  const fin = (v: number[]) => (opts.resultant ? withResultants(kind, v) : v);
  const { vec, rot } = resultComponents(makeFrame(opts.axes), r);
  if (kind === 'displacements') {
    for (const d of r.displacements) if (keep(d.nodeId)) visit(d.nodeId, undefined, undefined, fin([...vec(d.ux, d.uy, d.uz), ...rot(d.rx, d.ry, d.rz)]));
    return;
  }
  if (kind === 'reactions') {
    for (const x of r.reactions) if (keep(x.nodeId)) visit(x.nodeId, undefined, undefined, fin([...vec(x.fx, x.fy, x.fz), ...rot(x.mx, x.my, x.mz)]));
    return;
  }
  const spec = opts.stations ?? 2;
  const ends = usesMemberEnds(spec);
  for (const f of r.elementForces) {
    if (!keep(f.elementId)) continue;
    if (opts.resultant && (!r.magnitude || boundSpatialEnvelope(f))) requireConcurrentSectionForces(f);
    if (ends) {
      const endForces = forceDiagrams.map(kind => memberEndForces3D(f, kind));
      visit(f.elementId, 'i', 0, fin(endForces.map(([i]) => i)));
      visit(f.elementId, 'j', f.length, fin(endForces.map(([, j]) => j)));
      continue;
    }
    const stations: readonly DiagramStation[] | undefined = sharedStations ? sharedStations.get(f.elementId)
      : spec === 'critical' ? criticalForceStations(f) : stationTs(f, spec).map(t => ({ t }));
    if (!stations) throw unavailableDiagramExtrema();
    if (!stations.length) continue;
    const axial = prepareDiagramEvaluator3D(f, 'axial');
    const shearY = prepareDiagramEvaluator3D(f, 'shearY');
    const shearZ = prepareDiagramEvaluator3D(f, 'shearZ');
    const torsion = prepareDiagramEvaluator3D(f, 'torsion');
    const momentY = prepareDiagramEvaluator3D(f, 'momentY');
    const momentZ = prepareDiagramEvaluator3D(f, 'momentZ');
    stations.forEach((at, i) => {
      const station = memberSectionStation(at);
      const { t, distance, right } = station;
      const side = stations[i + 1]?.t === t ? 'left' : stations[i - 1]?.t === t && right ? 'right' : undefined;
      const v = [axial(station), shearY(station), shearZ(station), torsion(station), momentY(station), momentZ(station)];
      visit(f.elementId, t === 0 ? 'i' : t === 1 ? 'j' : undefined, distance ?? t * f.length, fin(v), side);
    });
  }
}

/** The rows of one result set, in the order the tables list them. */
export function rowsOf(kind: TableKind, r: AnalysisResults3D, opts: TableOptions): Row[] {
  const out: Row[] = [];
  eachRow(kind, r, opts, (entity, end, x, values, side) => {
    out.push(kind === 'forces' ? { entity, ...(end ? { end } : {}), x, ...(side && { side }), values } : { entity, values });
  });
  return out;
}

/**
 * Every source's rows, each tagged with its source. By source (the default): one source after
 * another. By entity: each node or member together, its ends or stations in order, every source
 * under each.
 */
export function allRows(kind: TableKind, sources: readonly Source[], opts: TableOptions, order: 'source' | 'entity' = 'source'): Array<Row & { source: Source }> {
  const rows = sources.flatMap((s, si) => rowsOf(kind, s.results, opts).map((row, ri) => ({ ...row, source: s, si, ri })));
  if (order === 'entity') rows.sort((a, b) => a.entity - b.entity || (a.x ?? 0) - (b.x ?? 0) || a.si - b.si || a.ri - b.ri);
  return rows.map(({ si: _s, ri: _r, ...row }) => row);
}

/** A value, where it is, and under which source. */
export interface Extreme { value: number; entity: number; end?: 'i' | 'j'; x?: number; side?: 'left' | 'right'; source: Source }

function extremeTieTolerance(value: number, previous: number): number {
  return 1e-9 * Math.max(Math.abs(value), Math.abs(previous), 1e-12);
}

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
  const tol = extremeTieTolerance(v, e.value);
  const d = sign * (v - e.value);
  if (d > tol) return true;
  if (d < -tol) return false;
  return earlierLocation(entity, x, e);
}

function earlierLocation(entity: number, x: number | undefined, current: { entity: number; x?: number }): boolean {
  return entity < current.entity || (entity === current.entity && (x ?? 0) < (current.x ?? 0));
}

function beatsCriticalExtreme(sign: 1 | -1, value: number, entity: number, x: number | undefined, current: Extreme | null): boolean {
  return !current || (value === current.value ? earlierLocation(entity, x, current)
    : sign === 1 ? value > current.value : value < current.value);
}

const forceDiagrams: readonly Diagram3DKind[] = ['axial', 'shearY', 'shearZ', 'torsion', 'momentY', 'momentZ'];
const resultantDiagrams: readonly (readonly [Diagram3DKind, Diagram3DKind])[] = [['shearY', 'shearZ'], ['momentY', 'momentZ']];

function requireSignedEnvelopeMember(member: ElementForces3D, byMember: ReadonlyMap<number, ElementForces3D>): ElementForces3D {
  const signed = byMember.get(member.elementId);
  if (!signed || signed.length !== member.length) throw unavailableDiagramExtrema();
  requireConcurrentSectionForces(signed);
  return signed;
}

/** For each column, the largest and the smallest value over every row of every source. */
export function summaryRows(kind: TableKind, sources: readonly Source[], opts: TableOptions): Array<{ column: Column; max: Extreme | null; min: Extreme | null }> {
  const cols = columnsOf(kind, opts);
  const max: Array<Extreme | null> = cols.map(() => null);
  const min: Array<Extreme | null> = cols.map(() => null);
  const critical = kind === 'forces' && opts.stations === 'critical';
  const beats = critical ? beatsCriticalExtreme : beatsExtreme;
  const eligible = extremaResultSources(sources, opts.signedOnly);
  const named = critical ? new Set(eligible.map(source => source.results)) : undefined;
  for (const source of eligible) {
    const visit = (c: number, value: number, entity: number, end: Extreme['end'], x: number | undefined, side?: Extreme['side']) => {
      if (!Number.isFinite(value)) return;
      const newMax = beats(1, value, entity, x, max[c]!);
      const newMin = beats(-1, value, entity, x, min[c]!);
      if (!newMax && !newMin) return;
      const where = { value, entity, end, x, source, ...(side && { side }) };
      if (newMax) max[c] = where;
      if (newMin) min[c] = where;
    };
    if (critical) {
      const diagrams = opts.resultant ? [...forceDiagrams, ...resultantDiagrams] : forceDiagrams;
      const visitMember = (member: ElementForces3D) => {
        criticalMemberForceExtrema3D(member, diagrams).forEach((range, c) => {
          for (const { t, value, x, side } of [range.max, range.min]) {
            visit(c, value, member.elementId, t === 0 ? 'i' : t === 1 ? 'j' : undefined, x, side);
          }
        });
      };
      for (const member of source.results.elementForces) {
        if (opts.entities && !opts.entities.has(member.elementId)) continue;
        const envelope = boundSpatialEnvelope(member);
        if (!envelope) {
          visitMember(member);
          continue;
        }
        const cases = envelopeQuerySources(envelope);
        const membersByCase = envelopeSourcesByMember(envelope);
        if (!cases || !membersByCase) throw unavailableDiagramExtrema();
        for (const [index, result] of cases.entries()) {
          const signed = requireSignedEnvelopeMember(member, membersByCase[index]!);
          if (!named!.has(result)) visitMember(signed);
        }
      }
    } else {
      eachRow(kind, source.results, opts, (entity, end, x, values) => values.forEach((value, c) => visit(c, value, entity, end, x)));
    }
  }
  return cols.map((column, c) => ({ column, max: max[c]!, min: min[c]! }));
}

/** One node or member end or station, enveloped: per column the largest and smallest value and their source. */
export interface EnvelopeRow { entity: number; end?: 'i' | 'j'; x?: number; side?: Extreme['side']; max: Array<{ value: number; source: Source }>; min: Array<{ value: number; source: Source }> }

function criticalEnvelopeStations(sources: readonly Source[], opts: TableOptions): Map<number, DiagramStation[]> {
  const members = new Map<number, Map<number, { station: DiagramStation; hasRight: boolean }>>();
  for (const { results } of sources) {
    for (const forces of results.elementForces) {
      const { elementId } = forces;
      if (opts.entities && !opts.entities.has(elementId)) continue;
      let cuts = members.get(elementId);
      if (!cuts) {
        cuts = new Map();
        members.set(elementId, cuts);
      }
      for (const { right, ...station } of criticalForceStations(forces)) {
        const previous = cuts.get(station.t);
        if (!previous) {
          cuts.set(station.t, { station, hasRight: right === true });
          continue;
        }
        const { distance, location } = station;
        const existing = previous.station;
        if (distance !== undefined) {
          if (existing.distance !== undefined && !sameCutLocation(
            existing.location ?? { x: existing.distance }, location ?? { x: distance },
          )) throw unavailableDiagramExtrema();
          if (existing.distance === undefined) previous.station = station;
        }
        previous.hasRight ||= right === true;
      }
    }
  }
  return new Map([...members].map(([id, cuts]) => [id, [...cuts.values()]
    .sort((a, b) => a.station.t - b.station.t)
    .flatMap(({ station, hasRight }) => memberEndFace(station.t) === undefined && hasRight
      ? [station, { ...station, right: true }]
      : [memberSectionStation(station)])]));
}

function requireEnvelopeMemberCoverage(sources: readonly Source[], entities: TableOptions['entities']): void {
  let expected: Set<number> | undefined;
  for (const { results } of sources) {
    const present = new Set<number>();
    for (const { elementId } of results.elementForces) {
      if (entities && !entities.has(elementId)) continue;
      if (present.has(elementId) || (expected && !expected.has(elementId))) throw unavailableDiagramExtrema();
      present.add(elementId);
    }
    if (expected && present.size !== expected.size) throw unavailableDiagramExtrema();
    expected ??= present;
  }
}

function signedForceEnvelopeSources(sources: readonly Source[], entities: TableOptions['entities']): Source[] {
  let named: Set<AnalysisResults3D> | undefined;
  return sources.flatMap(source => {
    const selected = (member: ElementForces3D) => !entities || entities.has(member.elementId);
    const aggregate = source.results.elementForces.find(member => selected(member) && boundSpatialEnvelope(member));
    if (!aggregate) return [source];
    const envelope = boundSpatialEnvelope(aggregate)!;
    const members = source.results.elementForces.filter(selected);
    const cases = envelopeQuerySources(envelope);
    const byMember = envelopeSourcesByMember(envelope);
    if (!cases || !byMember || members.some(member => boundSpatialEnvelope(member) !== envelope)) throw unavailableDiagramExtrema();

    const constituents = cases.map(results => ({ ...source, results }));
    requireEnvelopeMemberCoverage([source, ...constituents], entities);
    for (const [i, result] of cases.entries()) {
      if (result.magnitude) throw unavailableDiagramExtrema();
      for (const member of members) requireSignedEnvelopeMember(member, byMember[i]!);
    }
    const namedResults = named ??= new Set(sources.map(source => source.results));
    return constituents.filter(({ results }) => !namedResults.has(results));
  });
}

/** For each node or member end (or station), the largest and smallest value of each column over the sources. */
export function envelopeRows(kind: TableKind, sources: readonly Source[], opts: TableOptions): EnvelopeRow[] {
  const eligible = extremaResultSources(sources, opts.signedOnly);
  const cases = kind === 'forces' && !opts.resultant ? signedForceEnvelopeSources(eligible, opts.entities) : eligible;
  if (kind === 'forces') requireEnvelopeMemberCoverage(cases, opts.entities);
  const byKey = new Map<number | string, EnvelopeRow>();
  const critical = opts.stations === 'critical';
  const spec = opts.stations ?? 2;
  const atStations = kind === 'forces' && !usesMemberEnds(spec);
  const sharedStations = kind === 'forces' && critical ? criticalEnvelopeStations(cases, opts) : undefined;
  for (const source of cases) {
    eachRow(kind, source.results, opts, (entity, end, x, values, side) => {
      const key = atStations || end === 'j' ? `${entity}:${end ?? ''}:${(critical ? x : x?.toFixed(6)) ?? ''}:${side ?? ''}` : entity;
      const row = byKey.get(key);
      if (!row) {
        const first: EnvelopeRow = {
          entity, end, x, ...(side && { side }),
          max: values.map(value => ({ value, source })),
          min: values.map(value => ({ value, source })),
        };
        byKey.set(key, first);
        return;
      }
      for (let c = 0; c < values.length; c++) {
        const value = values[c]!;
        const max = row.max[c]!, min = row.min[c]!;
        const rise = value - max.value;
        if (rise > 0 && (critical || rise > extremeTieTolerance(value, max.value))) {
          max.value = value;
          max.source = source;
        }
        const fall = min.value - value;
        if (fall > 0 && (critical || fall > extremeTieTolerance(value, min.value))) {
          min.value = value;
          min.source = source;
        }
      }
    }, sharedStations);
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

export function stationLabel(x: number, side?: Extreme['side']): string {
  const rounded = x.toFixed(2);
  const distance = side && Number(rounded) !== x ? String(x) : rounded;
  return distance + (side === 'right' ? '⁺' : side === 'left' ? '⁻' : '');
}

/** Where a row is, as the tables write it: a node, a member end (12·i) or a station (12 @ 1,50). */
export function whereOf(r: Pick<Extreme, 'entity' | 'end' | 'x' | 'side'>, stations = false): string {
  if ((stations || r.side) && r.x !== undefined) return `${r.entity} @ ${stationLabel(r.x, r.side)}`;
  return r.end ? `${r.entity}·${r.end}` : String(r.entity);
}

/** A table as CSV, first line a header. Values are written in full precision. */
export function toCsv(header: readonly string[], rows: ReadonlyArray<ReadonlyArray<string | number>>): string {
  // csvCell also neutralises formula injection: case and combination names are user-editable
  // and travel in shared .ded files, and a spreadsheet evaluates a cell starting with = + - @.
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}
