import { parseDecimal } from './numeric-input';

/**
 * A positive, finite number from a form field, or undefined.
 *
 * `bind:value` on `<input type="number">` hands over a number, or null when the field is
 * empty — not a string. Code written for a string (`s.replace(',', '.')`) threw on the first
 * keystroke. A text field still hands over a string, with a decimal comma or point.
 */
export function positiveInput(v: unknown): number | undefined {
  // `parseDecimal`: a comma or a point, thousands grouped by the other; parseFloat read "1,234.5" as 1.234.
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseDecimal(v) ?? NaN : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
