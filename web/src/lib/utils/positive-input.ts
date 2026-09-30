/**
 * A positive, finite number from a form field, or undefined.
 *
 * `bind:value` on `<input type="number">` hands over a number, or null when the field is
 * empty — not a string. Code written for a string (`s.replace(',', '.')`) threw on the first
 * keystroke. A text field still hands over a string, with a decimal comma or point.
 */
export function positiveInput(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
