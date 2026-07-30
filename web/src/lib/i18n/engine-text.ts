/**
 * The boundary where engine messages become sentences.
 *
 * Pure engines return `EngineMessage` — `{ key, params }` with raw numbers. Every surface
 * that shows one to a human goes through here: the PRO panels, the PDF report, the DXF
 * annotation writer and the XLSX bar schedule. That is the whole point of the split; if a
 * fifth surface appears it gets locale-correct text for free.
 *
 * Numbers are formatted with `Intl.NumberFormat` against the active locale, so the same
 * message reads "Wi = 1,234.5 kN" in English and "Wi = 1.234,5 kN" in Spanish without the
 * engine knowing either convention exists.
 */
import { isMessage, type EngineMessage } from '../codes/message';
import { i18n, tAt } from './store.svelte';

/**
 * Locale-aware number formatting for message parameters.
 *
 * Integers stay integers — "3 element(s)" must not become "3.0". Non-integers keep up to
 * three decimals, which is the most any engine currently emits (kPa to 3 dp).
 */
function formatNumber(value: number, locale: string): string {
  if (!Number.isFinite(value)) return String(value);
  const decimals = Number.isInteger(value)
    ? 0
    : Math.min(3, (String(value).split('.')[1] ?? '').length);
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Translate one engine message into the active locale. */
export function te(m: EngineMessage): string {
  return teAt(m, i18n.locale);
}

/** Translate a list, preserving order. */
export function teAll(messages: readonly EngineMessage[]): string[] {
  return messages.map(te);
}

/**
 * Translate for a non-reactive consumer at an explicit locale.
 *
 * The report and export writers run outside a component, and a user may want a Spanish PDF
 * while reading an English UI. They pass the locale in rather than reading the store.
 */
export function teAt(m: EngineMessage, locale: string): string {
  const raw = tAt(m.key, locale);
  if (!m.params) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = m.params![name];
    if (v === undefined || v === null) return whole;
    // Nested messages resolve inside-out, so a sentence can quote a regulation label.
    if (isMessage(v)) return teAt(v, locale);
    return typeof v === 'number' ? formatNumber(v, locale) : String(v);
  });
}

/** Translate a list at an explicit locale. */
export function teAllAt(messages: readonly EngineMessage[], locale: string): string[] {
  return messages.map((m) => teAt(m, locale));
}

/**
 * Render a load combination's factors with the reader's decimal separator.
 *
 * `LoadCombinationSpec.label` is canonical notation with a point, because it is also the
 * identity a stored combination is matched on. CIRSOC prints `1,2 D + 1,6 L`, and an
 * Argentine engineer reading `1.2 D` sees a different number, so the separator is applied
 * here rather than baked into the engine.
 *
 * Only the numeric coefficients are touched; the load symbols D, L, W, E are the
 * regulation's own notation and are not translated.
 */
export function formatCombinationLabel(
  spec: { terms: ReadonlyArray<{ symbol: string; factor: number }> },
  locale: string,
): string {
  const nf = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1, maximumFractionDigits: 1,
  });
  return spec.terms
    .filter((term) => term.factor !== 0)
    .map((term) => `${nf.format(term.factor)} ${term.symbol}`)
    .join(' + ');
}
