/**
 * Sections from a CSV: a company's own list of profiles, brought into a project.
 *
 * Every row needs a shape and the dimensions that shape's outline is made of, because PRO does
 * not hold a section it cannot draw. The declared A and I, when the file has them, are kept only
 * to compare: the section's numbers come from its outline, and a row whose outline disagrees with
 * its own declared area by more than 5 % is reported, since that is usually a unit or a column
 * mistake in the file. The margin is wide on purpose: sharp corners alone put a tube's outline
 * a few percent over its rolled area.
 *
 * Columns, in any order, case-insensitive: `name`, `shape` (I, H, U, C, T, L, RHS, CHS, rect),
 * `h`, `b`, `tw`, `tf`, `t` in millimetres, and optionally `A` (cm²), `Iy`, `Iz`, `J` (cm⁴).
 * Comma or semicolon separated; with semicolons a decimal comma is read as a decimal point.
 * Corners are drawn sharp, since a list rarely carries both radii.
 */

import { resolveSectionState } from '../section/state';
import type { Section } from '../store/model.svelte';

export interface CsvSectionRow {
  line: number;
  name: string;
  shape: 'I' | 'H' | 'U' | 'C' | 'T' | 'L' | 'RHS' | 'CHS' | 'rect';
  /** Metres, the way `Section` stores them. */
  h: number;
  b?: number;
  tw?: number;
  tf?: number;
  t?: number;
  declared: { a?: number; iy?: number; iz?: number; j?: number };
}

export type CsvRefusal =
  | { line: number; kind: 'noHeader' }
  | { line: number; kind: 'unknownShape'; value: string }
  | { line: number; kind: 'missing'; fields: string[] }
  | { line: number; kind: 'notANumber'; field: string; value: string };

const SHAPES = new Set(['I', 'H', 'U', 'C', 'T', 'L', 'RHS', 'CHS', 'RECT']);

/** Which dimensions each shape's outline needs, as the canonical resolver asks for them. */
const NEEDS: Record<CsvSectionRow['shape'], Array<'h' | 'b' | 'tw' | 'tf' | 't'>> = {
  I: ['h', 'b', 'tw', 'tf'], H: ['h', 'b', 'tw', 'tf'], U: ['h', 'b', 'tw', 'tf'], C: ['h', 'b', 'tw', 'tf'],
  T: ['h', 'b', 'tw', 'tf'], L: ['h', 'b', 't'], RHS: ['h', 'b', 't'], CHS: ['h', 't'], rect: ['h', 'b'],
};

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') { if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted; }
    else if (c === sep && !quoted) { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

export function parseSectionsCsv(text: string): { rows: CsvSectionRow[]; refused: CsvRefusal[] } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim() !== '');
  if (first < 0) return { rows: [], refused: [{ line: 1, kind: 'noHeader' }] };
  const sep = (lines[first]!.match(/;/g)?.length ?? 0) > (lines[first]!.match(/,/g)?.length ?? 0) ? ';' : ',';
  const head = splitLine(lines[first]!, sep).map((h) => h.toLowerCase());
  const col = (k: string) => head.indexOf(k);
  if (col('name') < 0 || col('shape') < 0 || col('h') < 0) return { rows: [], refused: [{ line: first + 1, kind: 'noHeader' }] };

  const rows: CsvSectionRow[] = [];
  const refused: CsvRefusal[] = [];
  for (let i = first + 1; i < lines.length; i++) {
    if (lines[i]!.trim() === '') continue;
    const cells = splitLine(lines[i]!, sep);
    const line = i + 1;
    const cell = (k: string) => (col(k) >= 0 ? (cells[col(k)] ?? '').trim() : '');
    const shapeRaw = cell('shape').toUpperCase();
    if (!SHAPES.has(shapeRaw)) { refused.push({ line, kind: 'unknownShape', value: cell('shape') }); continue; }
    const shape = (shapeRaw === 'RECT' ? 'rect' : shapeRaw) as CsvSectionRow['shape'];
    let bad: CsvRefusal | null = null;
    const num = (k: string): number | undefined => {
      const raw = cell(k);
      if (raw === '') return undefined;
      const v = Number(sep === ';' ? raw.replace(',', '.') : raw);
      if (!Number.isFinite(v)) { bad ??= { line, kind: 'notANumber', field: k, value: raw }; return undefined; }
      return v;
    };
    const dims = { h: num('h'), b: num('b'), tw: num('tw'), tf: num('tf'), t: num('t') };
    const declared = { a: num('a'), iy: num('iy'), iz: num('iz'), j: num('j') };
    if (bad) { refused.push(bad); continue; }
    const missing = NEEDS[shape].filter((k) => !(dims[k] != null && dims[k]! > 0));
    if (missing.length > 0) { refused.push({ line, kind: 'missing', fields: missing }); continue; }
    const m = (v: number | undefined) => (v == null ? undefined : v / 1000);
    rows.push({
      line, name: cell('name') || `${shape} ${dims.h}`, shape,
      h: m(dims.h)!, b: m(dims.b), tw: m(dims.tw), tf: m(dims.tf), t: m(dims.t),
      declared: {
        ...(declared.a != null ? { a: declared.a * 1e-4 } : {}),
        ...(declared.iy != null ? { iy: declared.iy * 1e-8 } : {}),
        ...(declared.iz != null ? { iz: declared.iz * 1e-8 } : {}),
        ...(declared.j != null ? { j: declared.j * 1e-8 } : {}),
      },
    });
  }
  return { rows, refused };
}

/**
 * The fields a row becomes on a `Section`. `a` and `iz` are placeholders the canonical resolve
 * replaces with the outline's own values, so they start as the declared ones when given.
 */
export function rowToSectionFields(r: CsvSectionRow) {
  // A CHS is resolved from its outer diameter in `h`; the catalogue names it the same way.
  const b = r.shape === 'CHS' ? r.h : r.b;
  return {
    name: r.name,
    shape: r.shape,
    h: r.h, b,
    ...(r.tw != null ? { tw: r.tw } : {}),
    ...(r.tf != null ? { tf: r.tf } : {}),
    ...(r.t != null ? { t: r.t } : {}),
    a: r.declared.a ?? 1e-4,
    iz: r.declared.iz ?? 1e-8,
    ...(r.declared.iy != null ? { iy: r.declared.iy } : {}),
    ...(r.declared.j != null ? { j: r.declared.j } : {}),
  };
}

/** How far the outline's area sits from the row's own declared area, or null without one. */
export function declaredAreaGap(r: CsvSectionRow, outlineArea: number): number | null {
  return r.declared.a ? (outlineArea - r.declared.a) / r.declared.a : null;
}

export interface CsvImport {
  /** Ready for `addSection`, with the outline's own A, I and J written as the declared values. */
  sections: Array<Omit<Section, 'id'>>;
  refused: CsvRefusal[];
  /** Rows whose outline area differs from their declared area by more than 5 %. */
  disagreements: Array<{ line: number; name: string; gap: number }>;
}

/**
 * Parse and resolve. A row is kept only when its outline resolves, so what lands in the project
 * is drawable; its declared scalars are then the outline's, which is what a geometry-backed
 * section mirrors anyway.
 */
export function importSectionsCsv(text: string): CsvImport {
  const { rows, refused } = parseSectionsCsv(text);
  const sections: CsvImport['sections'] = [];
  const disagreements: CsvImport['disagreements'] = [];
  for (const r of rows) {
    const fields = rowToSectionFields(r) as Omit<Section, 'id'>;
    const st = resolveSectionState({ id: 0, ...fields } as Section);
    if (st.kind !== 'geometry-backed') {
      refused.push({ line: r.line, kind: 'missing', fields: [] });
      continue;
    }
    const gap = declaredAreaGap(r, st.a);
    if (gap != null && Math.abs(gap) > 0.05) disagreements.push({ line: r.line, name: r.name, gap });
    sections.push({ ...fields, a: st.a, iy: st.iy, iz: st.iz, ...(r.declared.j == null ? {} : { j: r.declared.j }) });
  }
  return { sections, refused: refused.sort((a, b) => a.line - b.line), disagreements };
}
