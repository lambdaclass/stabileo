/**
 * Result-query layer — pure selectors over solved 3D results.
 *
 * Turns the existing results store data (per-end element forces) into an
 * interrogable surface: max/min/abs extremes per component, threshold
 * filtering, and CSV serialization of the current query rows.
 *
 * Pure functions only — no store, no DOM, no solver/WASM dependency. The
 * ProResultsTab wires these to UI state and handles the CSV download.
 */

import type { AnalysisResults3D, ElementForces3D, FullEnvelope3D } from './types-3d';
import { memberEndForces3D, type Diagram3DKind } from './diagrams-3d';
import { bindMemberEnvelopeEnds, boundSpatialEnvelope, requireConcurrentSectionForces, unavailableDiagramExtrema } from './member-diagram';

// ─── Components ───────────────────────────────────────────────

/** Queryable 3D force components (local axes). */
export type ForceComponent = 'N' | 'Vy' | 'Vz' | 'T' | 'My' | 'Mz';

/** Unit label per component (for tables/CSV). */
export function componentUnit(component: ForceComponent): string {
  return component === 'N' || component === 'Vy' || component === 'Vz' ? 'kN' : 'kN·m';
}

/**
 * Inverse map: the force component a diagram type queries, or null for
 * non-force diagrams (deformed, colorMap, verification, …). No fallback —
 * callers must show an empty state rather than silently picking a component.
 */
export function diagramTypeToComponent(diagramType: string): ForceComponent | null {
  switch (diagramType) {
    case 'axial':   return 'N';
    case 'shearY':  return 'Vy';
    case 'shearZ':  return 'Vz';
    case 'torsion': return 'T';
    case 'momentY': return 'My';
    case 'momentZ': return 'Mz';
    default:        return null;
  }
}

const forceDiagrams: Record<ForceComponent, Diagram3DKind> = {
  N: 'axial', Vy: 'shearY', Vz: 'shearZ', T: 'torsion', My: 'momentY', Mz: 'momentZ',
};

export function componentEnds(ef: ElementForces3D, component: ForceComponent): { i: number; j: number } {
  if (boundSpatialEnvelope(ef)) throw unavailableDiagramExtrema();
  const [i, j] = memberEndForces3D(ef, forceDiagrams[component]);
  return { i, j };
}

// ─── Query rows (active source: case / combo / envelope) ──────

/** One queryable value at a specific element end. */
export interface QueryRow {
  elementId: number;
  component: ForceComponent;
  /** Which end the value sits at. */
  end: 'i' | 'j';
  /** Signed value at that end. */
  value: number;
}

/** How to pick the single extreme out of a set of rows. */
export type ExtremeMode = 'max' | 'min' | 'absmax';

export interface QueryRowsOptions {
  /** If provided, only these element ids are included (in iteration order). */
  elementIds?: Iterable<number>;
  envelope?: FullEnvelope3D;
}

const envelopeCases = new WeakMap<FullEnvelope3D, {
  sources: readonly AnalysisResults3D[];
  index?: {
    byMember: readonly ReadonlyMap<number, ElementForces3D>[];
    duplicateIds: ReadonlySet<number>;
  };
}>();

export function bindEnvelopeQuerySources<E extends FullEnvelope3D | null>(
  envelope: E, sources: readonly AnalysisResults3D[],
): E {
  if (envelope && sources.length) envelopeCases.set(envelope, { sources: [...sources] });
  return envelope;
}

export function bindSpatialEnvelope<E extends FullEnvelope3D | null>(
  envelope: E, sources: readonly AnalysisResults3D[],
): E {
  return bindEnvelopeQuerySources(bindMemberEnvelopeEnds(envelope), sources);
}

export function envelopeQuerySources(envelope: FullEnvelope3D): readonly AnalysisResults3D[] | undefined {
  return envelopeCases.get(envelope)?.sources;
}

function indexedEnvelopeSources(envelope: FullEnvelope3D) {
  const binding = envelopeCases.get(envelope);
  if (!binding || binding.index) return binding;
  const duplicateIds = new Set<number>();
  const byMember = binding.sources.map(({ elementForces }) => {
    const index = new Map<number, ElementForces3D>();
    for (const member of elementForces) {
      if (index.has(member.elementId)) duplicateIds.add(member.elementId);
      index.set(member.elementId, member);
    }
    return index;
  });
  binding.index = { byMember, duplicateIds };
  return binding;
}

export function envelopeSourcesByMember(envelope: FullEnvelope3D) {
  return indexedEnvelopeSources(envelope)?.index?.byMember;
}

interface SignedEnvelopeMember {
  result: AnalysisResults3D;
  member: ElementForces3D;
}

function expandSignedEnvelopeMember(
  member: ElementForces3D, envelope = boundSpatialEnvelope(member),
): SignedEnvelopeMember[] | undefined {
  if (!envelope) return undefined;
  const binding = indexedEnvelopeSources(envelope);
  const index = binding?.index;
  if (!index || index.duplicateIds.has(member.elementId)) throw unavailableDiagramExtrema();
  return binding.sources.map((result, caseIndex) => {
    const signed = index.byMember[caseIndex]!.get(member.elementId);
    if (result.magnitude || !signed || signed.length !== member.length) throw unavailableDiagramExtrema();
    requireConcurrentSectionForces(signed);
    return { result, member: signed };
  });
}

export function expandSignedEnvelopeMembers(members: readonly ElementForces3D[]) {
  const bound = members.find(member => boundSpatialEnvelope(member));
  if (!bound) return undefined;
  const envelope = boundSpatialEnvelope(bound)!;
  let cases: { result: AnalysisResults3D; members: ElementForces3D[] }[] | undefined;
  for (const member of members) {
    if (boundSpatialEnvelope(member) !== envelope) throw unavailableDiagramExtrema();
    const constituents = expandSignedEnvelopeMember(member, envelope)!;
    if (!cases) {
      cases = constituents.map(({ result, member }) => ({ result, members: [member] }));
      continue;
    }
    constituents.forEach(({ member }, index) => cases![index]!.members.push(member));
  }
  return cases;
}

function appendEnvelopeQueryRows(
  rows: QueryRow[], elementId: number, component: ForceComponent,
  constituents: readonly SignedEnvelopeMember[],
): void {
  const starts = new Set<number>(), ends = new Set<number>();
  for (const { member } of constituents) {
    const { i, j } = componentEnds(member, component);
    if (!Number.isFinite(i) || !Number.isFinite(j)) throw unavailableDiagramExtrema();
    starts.add(i);
    ends.add(j);
  }
  for (const [end, values] of [['i', starts], ['j', ends]] as const) {
    for (const value of [...values].sort((a, b) => b - a)) {
      rows.push({ elementId, component, end, value });
    }
  }
}

/**
 * Flatten element forces into per-end query rows for one component.
 */
export function buildQueryRows(
  forces: ElementForces3D[],
  component: ForceComponent,
  opts: QueryRowsOptions = {},
): QueryRow[] {
  const members = opts.envelope?.maxAbsResults3D.elementForces ?? forces;
  let source = members;
  if (opts.elementIds) {
    const isEnvelope = Boolean(opts.envelope) || members.some(member => boundSpatialEnvelope(member));
    const byId = new Map(members.map(member => [member.elementId, member]));
    source = [];
    for (const id of new Set(opts.elementIds)) {
      const member = byId.get(id);
      if (member) source.push(member);
      else if (isEnvelope) throw unavailableDiagramExtrema();
    }
  }
  if (opts.envelope && !envelopeQuerySources(opts.envelope)) throw unavailableDiagramExtrema();
  const rows: QueryRow[] = [];
  for (const ef of source) {
    const constituents = expandSignedEnvelopeMember(ef, opts.envelope);
    if (constituents) {
      appendEnvelopeQueryRows(rows, ef.elementId, component, constituents);
      continue;
    }
    const { i, j } = componentEnds(ef, component);
    rows.push({ elementId: ef.elementId, component, end: 'i', value: i });
    rows.push({ elementId: ef.elementId, component, end: 'j', value: j });
  }
  return rows;
}

/** Pick the governing row by mode. Returns null for an empty input. */
export function extremeRow(rows: QueryRow[], mode: ExtremeMode = 'absmax'): QueryRow | null {
  if (rows.length === 0) return null;
  const score = (v: number) => (mode === 'absmax' ? Math.abs(v) : v);
  let best = rows[0];
  let bestScore = score(best.value);
  for (let k = 1; k < rows.length; k++) {
    const s = score(rows[k].value);
    if (mode === 'min' ? s < bestScore : s > bestScore) {
      best = rows[k];
      bestScore = s;
    }
  }
  return best;
}

/** Keep only rows whose absolute value is at or above the threshold. */
export function filterByAbsThreshold(rows: QueryRow[], threshold: number): QueryRow[] {
  if (!(threshold > 0)) return rows;
  return rows.filter((r) => Math.abs(r.value) >= threshold);
}

// ─── CSV serialization ────────────────────────────────────────

/** Where the exported values came from. */
export type SourceKind = 'case' | 'combo' | 'envelope';
/** How the element set was scoped. */
export type ScopeMode = 'all' | 'selected' | 'id';

/**
 * Self-contained export context, repeated on every CSV row so the file is
 * filterable in a spreadsheet without external context.
 */
export interface QueryExportMeta {
  sourceKind: SourceKind;
  /** case/combo id; null for envelope or the all-loads single solve. */
  sourceId: number | null;
  /** case/combo name, or the envelope label. */
  sourceName: string;
  scopeMode: ScopeMode;
  /** explicit element ids when scoped to selection/typed ids; [] for "all". */
  scopeIds: number[];
  threshold: number;
  extremeMode: ExtremeMode;
}

/** Flat, fully-denormalized CSV column order. */
const EXPORT_HEADER = [
  'sourceKind', 'sourceId', 'sourceName', 'component', 'scopeMode', 'scopeIds',
  'threshold', 'extremeMode', 'element', 'end', 'value', 'unit',
] as const;

export function csvCell(s: string | number): string {
  // Neutralize spreadsheet formula injection on string cells: combo/case
  // names are user-editable and shared via .ded files, and Excel evaluates
  // cells starting with = + - @ even when RFC4180-quoted. Numbers (e.g.
  // negative values) are not affected — they arrive as `number`.
  const str = typeof s === 'string' && /^[=+\-@\t\r]/.test(s) ? `'${s}` : String(s);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function metaPrefix(meta: QueryExportMeta, sourceKind: SourceKind, sourceId: number | null, sourceName: string, component: ForceComponent): (string | number)[] {
  return [
    sourceKind,
    sourceId ?? '',
    sourceName,
    component,
    meta.scopeMode,
    meta.scopeIds.join(' '),
    meta.threshold,
    meta.extremeMode,
  ];
}

/**
 * Serialize active-source query rows (case/combo/envelope) to a flat CSV.
 * Every row repeats the full source + query metadata.
 */
export function rowsToCsv(rows: QueryRow[], meta: QueryExportMeta): string {
  const lines = [EXPORT_HEADER.map(csvCell).join(',')];
  for (const r of rows) {
    const cells = [
      ...metaPrefix(meta, meta.sourceKind, meta.sourceId, meta.sourceName, r.component),
      r.elementId, r.end, r.value, componentUnit(r.component),
    ];
    lines.push(cells.map(csvCell).join(','));
  }
  return lines.join('\n');
}
