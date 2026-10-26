/**
 * The budget of the structure: measured work items (partidas) priced from a price base, by
 * chapter, with the summary coefficient that turns cost into price.
 *
 *  · A work item is a code, a chapter, a unit, a description (an i18n key with its values) and
 *    a quantity, with its split by level. Items with one code are added together.
 *  · A price base is the person's: a name, where it applies, a currency, a date, a location
 *    factor and the unit price of each code. No price is ever assumed: an item without one is
 *    listed with no amount and named as missing.
 *  · The summary coefficient multiplies the direct cost by (1 + overheads)·(1 + financial
 *    costs)·(1 + profit)·(1 + tax), each a share the person states.
 *
 * Two exchange formats: a CSV for spreadsheets (the locale's separator and decimal mark), and
 * FIEBDC-3 (BC3), the text format budget programs exchange in, with the root, the chapters, the
 * items, their breakdown and their measurements.
 */

export type BudgetUnit = 'm3' | 'm2' | 'kg' | 'u' | 'm';
export type BudgetChapter = 'concrete' | 'formwork' | 'rebar' | 'steel' | 'connections' | 'postTensioning' | 'masonry' | 'site';
export const CHAPTERS: readonly BudgetChapter[] = ['concrete', 'formwork', 'rebar', 'steel', 'connections', 'postTensioning', 'masonry', 'site'];

export interface WorkItem {
  code: string; chapter: BudgetChapter; unit: BudgetUnit;
  desc: { key: string; params?: Record<string, string | number> };
  quantity: number;
  byLevel: Record<string, number>;
}

export interface PriceBase {
  id: string; name: string; location: string; currency: string;
  /** ISO date the prices are from. */
  date: string;
  /** Multiplies every unit price (a regional adjustment), 1 when not stated. */
  locationFactor: number;
  prices: Record<string, number>;
}

/** Shares of the direct cost, as fractions (0,15 for 15 %). */
export interface SummaryShares { overheads: number; financial: number; profit: number; tax: number }
export const NO_SHARES: SummaryShares = { overheads: 0, financial: 0, profit: 0, tax: 0 };

export interface BudgetLine { item: WorkItem; unitPrice: number | null; amount: number | null }
export interface Budget {
  chapters: Array<{ chapter: BudgetChapter; lines: BudgetLine[]; subtotal: number }>;
  directCost: number; coefficient: number; total: number;
  missing: string[];
  base: PriceBase | null; shares: SummaryShares;
}

/** Add up the items of one code, their levels too, in chapter order then code order. */
export function mergeItems(items: readonly WorkItem[]): WorkItem[] {
  const by = new Map<string, WorkItem>();
  for (const i of items) {
    if (!(i.quantity > 0)) continue;
    const prev = by.get(i.code);
    if (!prev) { by.set(i.code, { ...i, byLevel: { ...i.byLevel } }); continue; }
    prev.quantity += i.quantity;
    for (const [l, q] of Object.entries(i.byLevel)) prev.byLevel[l] = (prev.byLevel[l] ?? 0) + q;
  }
  return [...by.values()].sort((a, b) => CHAPTERS.indexOf(a.chapter) - CHAPTERS.indexOf(b.chapter) || a.code.localeCompare(b.code));
}

export const summaryCoefficient = (s: SummaryShares) => (1 + s.overheads) * (1 + s.financial) * (1 + s.profit) * (1 + s.tax);

export function priceBudget(items: readonly WorkItem[], base: PriceBase | null, shares: SummaryShares = NO_SHARES): Budget {
  const merged = mergeItems(items), missing: string[] = [];
  const chapters: Budget['chapters'] = [];
  for (const chapter of CHAPTERS) {
    const lines = merged.filter((i) => i.chapter === chapter).map((item) => {
      const p = base?.prices[item.code];
      const unitPrice = p !== undefined && Number.isFinite(p) ? p * (base!.locationFactor || 1) : null;
      if (unitPrice === null) missing.push(item.code);
      return { item, unitPrice, amount: unitPrice === null ? null : unitPrice * item.quantity };
    });
    if (lines.length) chapters.push({ chapter, lines, subtotal: lines.reduce((s, l) => s + (l.amount ?? 0), 0) });
  }
  const directCost = chapters.reduce((s, c) => s + c.subtotal, 0), coefficient = summaryCoefficient(shares);
  return { chapters, directCost, coefficient, total: directCost * coefficient, missing, base, shares };
}

/**
 * Unit prices from a CSV the person brings: a code and a price per line, separated by a
 * semicolon, a comma or a tab; a decimal comma is read when the separator is not a comma.
 * Lines that do not read are skipped and counted.
 */
export function parsePriceCsv(text: string): { prices: Record<string, number>; skipped: number } {
  const prices: Record<string, number> = {};
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const sep = line.includes(';') ? ';' : line.includes('\t') ? '\t' : ',';
    const [code, price] = line.split(sep).map((x) => x.trim().replace(/^"|"$/g, ''));
    // With a decimal comma the points are thousands; without one a point is the decimal mark.
    const p = price ?? '';
    const value = Number(sep !== ',' && p.includes(',') ? p.replace(/\./g, '').replace(',', '.') : p);
    if (!code || !Number.isFinite(value) || (price ?? '').trim() === '') { skipped++; continue; }
    prices[code] = value;
  }
  return { prices, skipped };
}

type Describe = (i: WorkItem) => string;
type ChapterName = (c: BudgetChapter) => string;

/** The budget as CSV rows: chapter, code, description, unit, quantity, unit price, amount; then the totals. */
export function budgetCsv(b: Budget, describe: Describe, chapterName: ChapterName, labels: { head: string[]; direct: string; coefficient: string; total: string }, locale = 'es'): string {
  const sep = locale.startsWith('en') ? ',' : ';';
  const num = (v: number | null, d = 2) => (v === null ? '' : locale.startsWith('en') ? v.toFixed(d) : v.toFixed(d).replace('.', ','));
  const cell = (s: string) => (s.includes(sep) || /["\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows: string[] = [labels.head.map(cell).join(sep)];
  for (const c of b.chapters) for (const l of c.lines) rows.push([chapterName(c.chapter), l.item.code, describe(l.item), l.item.unit, num(l.item.quantity, 3), num(l.unitPrice), num(l.amount)].map((x) => cell(String(x))).join(sep));
  rows.push(['', '', labels.direct, '', '', '', num(b.directCost)].map(cell).join(sep));
  rows.push(['', '', labels.coefficient, '', '', '', num(b.coefficient, 4)].map(cell).join(sep));
  rows.push(['', '', labels.total, '', '', '', num(b.total)].map(cell).join(sep));
  return rows.join('\n') + '\n';
}

const BC3_UNIT: Record<BudgetUnit, string> = { m3: 'm3', m2: 'm2', kg: 'kg', u: 'u', m: 'm' };
const bc3Text = (s: string) => s.replace(/[|~\\\n\r]/g, ' ');
/** DDMMYYYY from the ISO date as written, so no time zone moves it a day. */
const bc3Date = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${m[3]}${m[2]}${m[1]}` : ''; };

/**
 * The budget in FIEBDC-3 (BC3): ~V header, ~K decimals, ~C concepts (root ##, chapters #, items),
 * ~D breakdowns (root into chapters, chapters into items with their quantities), ~M one
 * measurement per item and level. Decimal point; prices in the base's currency, the summary
 * coefficient applied by the root's price.
 */
export function budgetBc3(b: Budget, describe: Describe, chapterName: ChapterName, meta: { title: string; program: string }): string {
  const date = bc3Date(b.base?.date ?? new Date().toISOString());
  const f = (v: number, d = 3) => (Math.round(v * 10 ** d) / 10 ** d).toString();
  const out: string[] = [];
  out.push(`~V|${bc3Text(meta.program)}|FIEBDC-3/2016|${bc3Text(meta.program)}||ANSI|${bc3Text(meta.title)}|2|||`);
  out.push(`~K|\\2\\2\\3\\2\\2\\2\\2\\${bc3Text(b.base?.currency ?? '')}\\|0|`);
  const root = 'STRUCT##', chap = (c: BudgetChapter) => `${c.toUpperCase()}#`;
  out.push(`~C|${root}||${bc3Text(meta.title)}|${f(b.total, 2)}|${date}|0|`);
  out.push(`~D|${root}|${b.chapters.map((c) => `${chap(c.chapter)}\\1\\1\\`).join('')}|`);
  for (const c of b.chapters) {
    out.push(`~C|${chap(c.chapter)}||${bc3Text(chapterName(c.chapter))}|${f(c.subtotal * b.coefficient, 2)}|${date}|0|`);
    out.push(`~D|${chap(c.chapter)}|${c.lines.map((l) => `${l.item.code}\\1\\${f(l.item.quantity)}\\`).join('')}|`);
    for (const l of c.lines) {
      out.push(`~C|${l.item.code}|${BC3_UNIT[l.item.unit]}|${bc3Text(describe(l.item))}|${l.unitPrice === null ? '' : f(l.unitPrice * b.coefficient, 2)}|${date}|0|`);
      const parts = Object.entries(l.item.byLevel).filter(([, q]) => q > 0).map(([level, q]) => `\\${bc3Text(level)}\\1\\${f(q)}\\\\\\`).join('');
      out.push(`~M|${chap(c.chapter)}\\${l.item.code}|||${f(l.item.quantity)}|${parts}|`);
    }
  }
  return out.join('\r\n') + '\r\n';
}
