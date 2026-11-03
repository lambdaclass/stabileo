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
import type { StructuredDiagnostic } from '../engine/types';
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

/**
 * The solver's own error sentences, which it writes in English, in the app's language.
 *
 * They reached the user as the engine wrote them: "Singular stiffness matrix — structure is a
 * mechanism" in a Spanish or Portuguese interface. The known sentences are replaced wherever
 * they appear in a message; anything else is left as it is.
 */
const ENGINE_SENTENCES: ReadonlyArray<[string, string]> = [
  ['Singular stiffness matrix — structure is a mechanism', 'svc.engine.mechanism'],
  ['All diagonal entries are zero — singular matrix', 'svc.engine.zeroDiagonal'],
  ['Singular stiffness matrix', 'svc.engine.singular'],
];

export function localizeEngineText(message: string): string {
  let out = message;
  for (const [en, key] of ENGINE_SENTENCES) if (out.includes(en)) out = out.split(en).join(tAt(key, i18n.locale));
  return out.replace(SELF_CHECK_REFUSAL, (whole, check: string, mode: string | undefined, rest: string) => {
    const name = selfCheckName(check, mode);
    if (!name) return whole;
    const exceeds = /^(\S+) exceeds (\S+)$/.exec(rest);
    const value = exceeds ? Number(exceeds[1]) : NaN;
    const limit = exceeds ? Number(exceeds[2]) : NaN;
    if (Number.isFinite(value) && Number.isFinite(limit)) return fill('selfCheck.refused', { check: name, value: scientific(value), threshold: scientific(limit) });
    return fill('selfCheck.refusedInvalid', { check: name, reason: selfCheckReason(rest) });
  });
}

const SELF_CHECKS = new Set(['static_residual', 'static_balance', 'modal_residual', 'modal_orthogonality', 'modal_mass']);
const SELF_CHECK_REFUSAL = /REFUSE: self-check ([a-z_]+)(?::(\d+))?: ([^\n]*)/g;

type Translate = (key: string) => string;
const active: Translate = (key) => tAt(key, i18n.locale);

function fill(key: string, params: Record<string, string>, translate: Translate = active): string {
  return translate(key).replace(/\{(\w+)\}/g, (whole, name: string) => params[name] ?? whole);
}

const SELF_CHECK_REASONS: ReadonlyArray<[RegExp, string]> = [
  [/^non-finite /, 'selfCheck.reason.nonFinite'],
  [/^non-positive modal mass$/, 'selfCheck.reason.nonPositiveMass'],
];

function selfCheckReason(reason: string): string {
  const known = SELF_CHECK_REASONS.find(([pattern]) => pattern.test(reason));
  return known ? active(known[1]) : reason;
}

function scientific(value: number): string {
  return value.toExponential(2);
}

function selfCheckName(check: string, mode: string | undefined, translate: Translate = active): string | null {
  return SELF_CHECKS.has(check) ? fill(`selfCheck.check.${check}`, { mode: mode ?? '' }, translate) : null;
}

/** A self-check diagnostic in the app's language, or `translate`'s; the engine's English text when it is not one. */
export function selfCheckWarningText(d: StructuredDiagnostic, translate: Translate = active): string {
  const [, check, mode] = d.phase?.split(':') ?? [];
  const name = check ? selfCheckName(check, mode, translate) : null;
  if (!name || d.value === undefined || d.threshold === undefined) return d.message;
  return fill('selfCheck.warning', { check: name, value: scientific(d.value), threshold: scientific(d.threshold) }, translate);
}
