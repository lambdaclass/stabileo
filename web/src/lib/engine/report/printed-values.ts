import type { ReportConfig } from '../pro-report';
import type { PrintedManifest } from '../../provenance/result-provenance';
import { exactHash } from '../../provenance/exact-hash';

/** The numbers a report printed from its results, table by table, as text. */
export interface PrintedTable {
  key: string;
  headers: string[];
  rows: Array<{ label: string; cells: string[] }>;
}

export interface PrintedDifference { table: string; row: string; column: string; printed: string; recomputed: string }

/**
 * `labels`: whether row labels and column headers were compared too (only in the report's own language).
 * `manifest`: whether the set of tables was checked against the list the fingerprint records (reports from before it was recorded carry none).
 */
export interface PrintedComparison { compared: number; differences: PrintedDifference[]; structural: string[]; labels: boolean; manifest: boolean }

const CONFIG_ID = 'stabileo-report-config';

/** The report's choices of what to print and its language, embedded so a check can print the same tables again; the letterhead stays out. */
export function reportConfigScript(config: ReportConfig | undefined, locale?: string): string {
  if (!config) return '';
  const json = JSON.stringify(embeddedForm(reportChoices(config), locale ?? null)).replace(/</g, '\\u003c');
  return `<script type="application/json" id="${CONFIG_ID}">${json}</script>`;
}

/** The choices of what to print, without the letterhead. */
export function reportChoices(config: ReportConfig): Record<string, unknown> {
  const { companyName: _name, companyLogo: _logo, projectAddress: _address, engineerName: _engineer, revision: _revision, figures: _figures, ...rest } = config;
  return JSON.parse(JSON.stringify(rest)) as Record<string, unknown>;
}

function embeddedForm(choices: Record<string, unknown>, locale: string | null): Record<string, unknown> {
  return locale ? { ...choices, reportLocale: locale } : choices;
}

/** The embedded script's content exactly as the report with this manifest wrote it. */
export function embeddedMatches(html: string, manifest: PrintedManifest): boolean {
  const e = embedded(html);
  return !!e && exactHash(e) === exactHash(embeddedForm(manifest.choices, manifest.locale));
}

const TABLE_SECTION: Record<string, string> = {
  reactions: 'results', forces: 'results', displacements: 'results', shells: 'results',
  drift: 'storyDrift', summary: 'envelope', statics: 'statics', deflections: 'deflections',
};

/** The section of the report a printed table belongs to. */
export function tableSection(key: string): string {
  return TABLE_SECTION[key] ?? (key.startsWith('envelope-') ? 'envelope' : 'other');
}

/** What a report printed: its choices, its language and its marked tables in order, with their row counts. */
export function printedManifest(config: ReportConfig, locale: string | null, tables: readonly PrintedTable[]): PrintedManifest {
  return { choices: reportChoices(config), locale, tables: tables.map((t) => ({ section: tableSection(t.key), table: t.key, rows: t.rows.length })) };
}

/** The tables that differ from the manifest's list: missing, unexpected, out of place or with another row count. */
export function manifestDifferences(tables: readonly PrintedTable[], manifest: PrintedManifest): string[] {
  const out: string[] = [];
  const n = Math.max(tables.length, manifest.tables.length);
  for (let i = 0; i < n; i++) {
    const t = tables[i], m = manifest.tables[i];
    if (t && m && t.key === m.table && t.rows.length === m.rows && tableSection(t.key) === m.section) continue;
    if (t) out.push(t.key);
    if (m) out.push(m.table);
  }
  return [...new Set(out)];
}

function embedded(html: string): Record<string, unknown> | null {
  const m = new RegExp(`<script[^>]*id=["']${CONFIG_ID}["'][^>]*>([\\s\\S]*?)</script>`, 'i').exec(html);
  if (!m) return null;
  try { return JSON.parse(m[1]!) as Record<string, unknown>; } catch { return null; }
}

export function embeddedReportConfig(html: string): ReportConfig | null {
  const e = embedded(html);
  if (!e) return null;
  const { reportLocale: _locale, ...config } = e;
  return { companyName: '', companyLogo: null, ...config } as ReportConfig;
}

/** The language the report was written in, when it says. */
export function embeddedReportLocale(html: string): string | null {
  const l = embedded(html)?.reportLocale;
  return typeof l === 'string' ? l : null;
}

const text = (cell: string) => cell
  .replace(/<annotation[\s\S]*?<\/annotation>/gi, '')
  .replace(/<math[\s\S]*?<\/math>/gi, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ').trim();

/** Every table marked `data-printed`, its numeric cells (`class="num"`) by row and its other cells as the row's label. */
export function printedTables(html: string): PrintedTable[] {
  const out: PrintedTable[] = [];
  for (const t of html.matchAll(/<table[^>]*data-printed="([^"]+)"[^>]*>([\s\S]*?)<\/table>/gi)) {
    const body = t[2]!;
    const head = /<thead>([\s\S]*?)<\/thead>/i.exec(body)?.[1] ?? '';
    const headers = [...head.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => text(m[1]!));
    const rows: PrintedTable['rows'] = [];
    let spanLabel = '', spanLeft = 0;
    const rowsHtml = (/<tbody>([\s\S]*?)<\/tbody>/i.exec(body)?.[1] ?? body);
    for (const r of rowsHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...r[1]!.matchAll(/<t[dh]([^>]*)>([\s\S]*?)<\/t[dh]>/gi)].map((m) => ({
        num: /class="[^"]*\bnum\b/.test(m[1]!), span: Number(/rowspan="(\d+)"/.exec(m[1]!)?.[1] ?? 1), text: text(m[2]!),
      }));
      if (cells.length === 0) continue;
      const spanning = cells.find((c) => c.span > 1);
      const prefix = spanning ? [] : spanLeft > 0 ? [spanLabel] : [];
      if (spanning) { spanLabel = spanning.text; spanLeft = spanning.span - 1; } else if (spanLeft > 0) spanLeft--;
      rows.push({ label: [...prefix, ...cells.filter((c) => !c.num).map((c) => c.text)].join(' · '), cells: cells.filter((c) => c.num).map((c) => c.text) });
    }
    out.push({ key: t[1]!, headers, rows });
  }
  return out;
}

/** The printed numbers against the same tables printed again from a fresh solve: cell by cell. */
export function comparePrinted(claimed: readonly PrintedTable[], fresh: readonly PrintedTable[], labels = true): PrintedComparison {
  const differences: PrintedDifference[] = [];
  const structural: string[] = [];
  let compared = 0;
  const freshByKey = new Map<string, PrintedTable[]>();
  for (const t of fresh) (freshByKey.get(t.key) ?? freshByKey.set(t.key, []).get(t.key)!).push(t);
  for (const t of claimed) {
    const f = freshByKey.get(t.key)?.shift();
    if (!f || f.rows.length !== t.rows.length || (labels && f.headers.join('\u0000') !== t.headers.join('\u0000'))) { structural.push(t.key); continue; }
    const numCount = Math.max(0, ...t.rows.map((r) => r.cells.length));
    const numHeaders = t.headers.slice(t.headers.length - numCount);
    const labelHeader = t.headers.slice(0, t.headers.length - numCount).join(' · ');
    t.rows.forEach((row, i) => {
      const other = f.rows[i]!;
      if (other.cells.length !== row.cells.length) { structural.push(t.key); return; }
      if (labels && other.label !== row.label) differences.push({ table: t.key, row: other.label, column: labelHeader, printed: row.label, recomputed: other.label });
      row.cells.forEach((printed, c) => {
        compared++;
        const recomputed = other.cells[c]!;
        if (printed !== recomputed) differences.push({ table: t.key, row: row.label, column: numHeaders[c] ?? String(c + 1), printed, recomputed });
      });
    });
  }
  for (const [key, left] of freshByKey) if (left.length > 0) structural.push(key);
  return { compared, differences, structural: [...new Set(structural)], labels, manifest: false };
}
