/**
 * Decimal numbers typed in the page's language: a point in English, a comma in Spanish and
 * Portuguese. Either separator is accepted on input; anything that is not one plain decimal
 * number (two separators, digit grouping, stray characters) is refused rather than guessed, so
 * "0,0027" can never be read as 27 or 0.
 */
const PLAIN = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)([eE][+-]?\d+)?$/;

export function parseDecimal(text: string): number | null {
  const t = text.trim();
  if (!PLAIN.test(t)) return null;
  const v = Number(t.replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

export function formatDecimal(v: number, locale: string): string {
  const s = String(v);
  return locale === 'en' ? s : s.replace('.', ',');
}
