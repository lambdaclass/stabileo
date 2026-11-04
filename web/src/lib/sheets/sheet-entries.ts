/**
 * The sheet set as an ordered list of entries: each a kind of plan with its own options (scale,
 * the levels it covers, whether its tables go with it, its format, a label) so one kind can come
 * twice with two configurations. With the title block's template and the display, the list is
 * what a set template keeps and what another project generates again the same.
 *
 * Pure.
 */
import type { SheetFormat } from './formats';
import type { SheetDisplay } from './display';

export interface SheetEntry {
  id: string;
  /** A `PlanKind` (`store/work-drawings.ts`). */
  kind: string;
  /** Shown as the sheets' group name; absent, the kind's. */
  label?: string;
  /** A fixed scale (1:n); absent, the largest that fits. */
  scale?: number;
  /** The levels it covers, m; absent, all. */
  levels?: number[];
  /** Its tables drawn with it (coordinates, breakdowns); default yes. */
  tables?: boolean;
  /** Its own paper format; absent, the set's. */
  format?: SheetFormat;
  /** Kind-specific choices (e.g. setting-out from the column centre or a fixed point). */
  options?: Record<string, string | number | boolean>;
}

/** One entry per kind, in the kinds' order: the set before a person arranges it. */
export function defaultEntries(kinds: readonly string[]): SheetEntry[] {
  return kinds.map((kind) => ({ id: kind, kind }));
}

export function moveEntry(list: readonly SheetEntry[], id: string, to: number): SheetEntry[] {
  const i = list.findIndex((e) => e.id === id);
  if (i < 0) return [...list];
  const out = [...list];
  const [e] = out.splice(i, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, e!);
  return out;
}

/** A copy of an entry right after it, under a fresh id: the same kind with another configuration. */
export function duplicateEntry(list: readonly SheetEntry[], id: string): SheetEntry[] {
  const i = list.findIndex((e) => e.id === id);
  if (i < 0) return [...list];
  const ids = new Set(list.map((e) => e.id));
  let n = 2, nid = `${list[i]!.kind}-${n}`;
  while (ids.has(nid)) nid = `${list[i]!.kind}-${++n}`;
  const out = [...list];
  out.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(list[i]!)), id: nid });
  return out;
}

export function addEntry(list: readonly SheetEntry[], kind: string): SheetEntry[] {
  const ids = new Set(list.map((e) => e.id));
  let id = kind, n = 1;
  while (ids.has(id)) id = `${kind}-${++n}`;
  return [...list, { id, kind }];
}

export const removeEntry = (list: readonly SheetEntry[], id: string): SheetEntry[] => list.filter((e) => e.id !== id);
export const patchEntry = (list: readonly SheetEntry[], id: string, patch: Partial<SheetEntry>): SheetEntry[] =>
  list.map((e) => (e.id === id ? { ...e, ...patch } : e));

// ─── The title block as a template ───

/** The variables a title block template fills: the project's, the sheet's and the professional's. */
export const TITLE_VARIABLES = ['obra', 'expediente', 'ubicacion', 'propietario', 'planta', 'escala', 'plano', 'profesional', 'matricula', 'fecha'] as const;
export type TitleVariable = (typeof TITLE_VARIABLES)[number];

export interface TitleBlockTemplate {
  /** `standard`: the block every sheet carries; `blank`: no block, a sheet of free size. */
  layout: 'standard' | 'blank';
  /** Free size for a blank layout, mm. */
  size?: { width: number; height: number };
  /** Lines of the block, each a text with {variables}. */
  lines: string[];
  /** Values the project states once (the sheet's own, scale, number and floor, are filled per sheet). */
  values: Partial<Record<TitleVariable, string>>;
}

export const DEFAULT_TITLE_TEMPLATE: TitleBlockTemplate = {
  layout: 'standard',
  lines: ['{obra} · {expediente}', '{ubicacion} · {propietario}', '{profesional} · Mat. {matricula} · {fecha}'],
  values: {},
};

/** A template line with its variables filled; a variable with no value is left blank, never as its name. */
export function fillLine(line: string, values: Partial<Record<TitleVariable, string>>): string {
  return line.replace(/\{(\w+)\}/g, (_, k: string) => values[k as TitleVariable] ?? '').replace(/\s*·\s*(?=·|$)/g, '').replace(/^\s*·\s*/, '').replace(/\s{2,}/g, ' ').trim();
}

// ─── A set kept as a template ───

export interface SheetSetTemplate {
  kind: 'stabileo-sheet-set';
  version: 1;
  name: string;
  format: SheetFormat; prefix: string; start: number; language?: string;
  entries: SheetEntry[];
  display?: SheetDisplay;
  titleBlock?: TitleBlockTemplate;
}

export function parseSetTemplate(text: string): SheetSetTemplate {
  const t = JSON.parse(text) as SheetSetTemplate;
  if (t?.kind !== 'stabileo-sheet-set' || !Array.isArray(t.entries)) throw new Error('not a sheet set template');
  return t;
}
