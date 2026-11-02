import type { ReportConfig } from '../pro-report';

/** The numbers a report printed from its results, table by table, as text. */
export interface PrintedTable {
  key: string;
  headers: string[];
  rows: Array<{ label: string; cells: string[] }>;
}

export interface PrintedDifference { table: string; row: string; column: string; printed: string; recomputed: string }

export interface PrintedComparison { compared: number; differences: PrintedDifference[]; structural: string[] }

const CONFIG_ID = 'stabileo-report-config';

/** The report's choices of what to print, embedded so a check can print the same tables again; the letterhead stays out. */
export function reportConfigScript(config: ReportConfig | undefined): string {
  if (!config) return '';
  const { companyName: _name, companyLogo: _logo, projectAddress: _address, engineerName: _engineer, revision: _revision, figures: _figures, ...rest } = config;
  const json = JSON.stringify(rest).replace(/</g, '\\u003c');
  return `<script type="application/json" id="${CONFIG_ID}">${json}</script>`;
}

export function embeddedReportConfig(html: string): ReportConfig | null {
  const m = new RegExp(`<script[^>]*id=["']${CONFIG_ID}["'][^>]*>([\\s\\S]*?)</script>`, 'i').exec(html);
  if (!m) return null;
  try { return { companyName: '', companyLogo: null, ...JSON.parse(m[1]!) } as ReportConfig; } catch { return null; }
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
export function comparePrinted(claimed: readonly PrintedTable[], fresh: readonly PrintedTable[]): PrintedComparison {
  const differences: PrintedDifference[] = [];
  const structural: string[] = [];
  let compared = 0;
  const freshByKey = new Map<string, PrintedTable[]>();
  for (const t of fresh) (freshByKey.get(t.key) ?? freshByKey.set(t.key, []).get(t.key)!).push(t);
  for (const t of claimed) {
    const f = freshByKey.get(t.key)?.shift();
    if (!f || f.rows.length !== t.rows.length) { structural.push(t.key); continue; }
    const numHeaders = t.headers.slice(t.headers.length - Math.max(0, ...t.rows.map((r) => r.cells.length)));
    t.rows.forEach((row, i) => {
      const other = f.rows[i]!;
      if (other.cells.length !== row.cells.length) { structural.push(t.key); return; }
      row.cells.forEach((printed, c) => {
        compared++;
        const recomputed = other.cells[c]!;
        if (printed !== recomputed) differences.push({ table: t.key, row: row.label, column: numHeaders[c] ?? String(c + 1), printed, recomputed });
      });
    });
  }
  return { compared, differences, structural: [...new Set(structural)] };
}
