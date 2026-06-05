/**
 * Result-query layer — pure selectors over solved 3D results.
 *
 * Turns the existing results store data (per-end element forces + the
 * governing-combo provenance map) into an interrogable surface: max/min/abs
 * extremes per component, threshold filtering, governing-value lookup with
 * source-combo label, and CSV serialization of the current query rows.
 *
 * Pure functions only — no store, no DOM, no solver/WASM dependency. The
 * ProResultsTab wires these to UI state and handles the CSV download.
 */

import type { ElementForces3D } from './types-3d';
import type { GoverningPerElement3D, GoverningComboRef } from './governing-case';

// ─── Components ───────────────────────────────────────────────

/** Queryable 3D force components (local axes). */
export type ForceComponent = 'N' | 'Vy' | 'Vz' | 'T' | 'My' | 'Mz';

export const FORCE_COMPONENTS: ForceComponent[] = ['N', 'Vy', 'Vz', 'T', 'My', 'Mz'];

/** Unit label per component (for tables/CSV). */
export function componentUnit(component: ForceComponent): string {
  return component === 'N' || component === 'Vy' || component === 'Vz' ? 'kN' : 'kN·m';
}

/** 3D diagram-type names a component maps to (subset of results store DiagramType). */
export type DiagramType3D = 'axial' | 'shearY' | 'shearZ' | 'torsion' | 'momentY' | 'momentZ';

/** Map a query component to the matching 3D diagram type (for "link with diagram"). */
export function componentToDiagramType(component: ForceComponent): DiagramType3D {
  switch (component) {
    case 'N':  return 'axial';
    case 'Vy': return 'shearY';
    case 'Vz': return 'shearZ';
    case 'T':  return 'torsion';
    case 'My': return 'momentY';
    case 'Mz': return 'momentZ';
  }
}

/** Extract the (i, j) end values of one component from an element's forces. */
export function componentEnds(ef: ElementForces3D, component: ForceComponent): { i: number; j: number } {
  switch (component) {
    case 'N':  return { i: ef.nStart,  j: ef.nEnd };
    case 'Vy': return { i: ef.vyStart, j: ef.vyEnd };
    case 'Vz': return { i: ef.vzStart, j: ef.vzEnd };
    case 'T':  return { i: ef.mxStart, j: ef.mxEnd };
    case 'My': return { i: ef.myStart, j: ef.myEnd };
    case 'Mz': return { i: ef.mzStart, j: ef.mzEnd };
  }
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
}

/**
 * Flatten element forces into per-end query rows for one component.
 * Emits an `i` row and a `j` row per element. When `elementIds` is given,
 * only those elements are included (silently skipping ids not in results).
 */
export function buildQueryRows(
  forces: ElementForces3D[],
  component: ForceComponent,
  opts: QueryRowsOptions = {},
): QueryRow[] {
  const rows: QueryRow[] = [];
  let source = forces;
  if (opts.elementIds) {
    const wanted = new Set(opts.elementIds);
    const byId = new Map(forces.map((ef) => [ef.elementId, ef]));
    source = [...wanted].map((id) => byId.get(id)).filter((ef): ef is ElementForces3D => ef != null);
  }
  for (const ef of source) {
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

// ─── Governing query (across all combinations) ────────────────

/** Governing-combo answer for one element + component. */
export interface GoverningQuery {
  elementId: number;
  component: ForceComponent;
  /** Max absolute value across all combos (from the governing map). */
  value: number;
  /** Combo that produced it. */
  comboId: number;
  /** Human label of the governing combo. */
  sourceLabel: string;
}

/** Map a component to its field on a GoverningPerElement3D record. */
function governingRef(g: GoverningPerElement3D, component: ForceComponent): GoverningComboRef | undefined {
  switch (component) {
    case 'N':  return g.axial;
    case 'Vy': return g.shearY;
    case 'Vz': return g.shearZ;
    case 'T':  return g.torsion;
    case 'My': return g.momentY;
    case 'Mz': return g.momentZ;
  }
}

/**
 * For each element, the governing combo for one component — preserving the
 * source-combo label from the governing map. Elements without a governing
 * entry for the component are skipped.
 */
export function governingForComponent(
  governing: Map<number, GoverningPerElement3D>,
  component: ForceComponent,
  opts: QueryRowsOptions = {},
): GoverningQuery[] {
  const wanted = opts.elementIds ? new Set(opts.elementIds) : null;
  const out: GoverningQuery[] = [];
  for (const [elementId, g] of governing) {
    if (wanted && !wanted.has(elementId)) continue;
    const ref = governingRef(g, component);
    if (!ref) continue;
    out.push({
      elementId,
      component,
      value: ref.value,
      comboId: ref.comboId,
      sourceLabel: ref.comboName,
    });
  }
  return out;
}

/** Pick the element whose governing value is the largest (by abs). */
export function topGoverning(list: GoverningQuery[]): GoverningQuery | null {
  if (list.length === 0) return null;
  let best = list[0];
  for (let k = 1; k < list.length; k++) {
    if (Math.abs(list[k].value) > Math.abs(best.value)) best = list[k];
  }
  return best;
}

// ─── CSV serialization ────────────────────────────────────────

/** Where the exported values came from. */
export type SourceKind = 'case' | 'combo' | 'envelope' | 'governing';
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
  /** case/combo name, or an envelope/governing label. */
  sourceName: string;
  scopeMode: ScopeMode;
  /** explicit element ids when scoped to selection/typed ids; [] for "all". */
  scopeIds: number[];
  threshold: number;
  extremeMode: ExtremeMode;
}

/** Flat, fully-denormalized CSV column order (shared by both export modes). */
const EXPORT_HEADER = [
  'sourceKind', 'sourceId', 'sourceName', 'component', 'scopeMode', 'scopeIds',
  'threshold', 'extremeMode', 'element', 'end', 'value', 'unit',
] as const;

function csvCell(s: string | number): string {
  const str = String(s);
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

/**
 * Serialize governing-query rows to the same flat CSV. sourceKind is forced to
 * "governing" and each row carries ITS OWN governing combo id/name (governing
 * spans multiple combos). There is no i/j end, so end = "governing".
 */
export function governingToCsv(list: GoverningQuery[], meta: QueryExportMeta): string {
  const lines = [EXPORT_HEADER.map(csvCell).join(',')];
  for (const g of list) {
    const cells = [
      ...metaPrefix(meta, 'governing', g.comboId, g.sourceLabel, g.component),
      g.elementId, 'governing', g.value, componentUnit(g.component),
    ];
    lines.push(cells.map(csvCell).join(','));
  }
  return lines.join('\n');
}
