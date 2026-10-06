/**
 * Reading a number out of a form field, without letting zero mean «empty».
 *
 * ── The defect this generalises ─────────────────────────────────────
 *
 * The batten gap was written `Number(value) || 10`. Zero is falsy in JavaScript, so a deliberate
 * `0` became `10` — and with it a user could not express chords in continuous contact, which is
 * §E.6.1's Group I: a real arrangement, joined by bolts or welds, that carries **no battens at
 * all**. The panel then claimed battens for a configuration the code places none on.
 *
 * That is worse than rejecting the input. The field looked accepted, the value was silently
 * something else, and the consequence was a component appearing where the clause says there is
 * none.
 *
 * The same shape appeared thirteen times across the connection forms, and the same shape has
 * appeared three times in this branch under other names: a missing `fy` read as an unclassified
 * material, an absent `NI` read as a zero force. **A plausible substitute for an absent datum is
 * the hardest defect to see**, because its symptom looks like an ordinary state.
 *
 * ── What this returns, and why three cases and not two ──────────────
 *
 * `empty` and `invalid` are different, and collapsing them loses the one a user can act on:
 *
 *   · **`empty`** — the field was cleared. A legitimate state on the way to typing, and the
 *     caller usually maps it to «not supplied».
 *   · **`invalid`** — a negative where negatives are meaningless, or text. Never reinterpreted:
 *     a negative plate thickness silently clamped to zero is a wrong answer wearing a right
 *     one's clothes.
 *   · **`value`** — a real number, and `0` is one of them whenever the caller says so.
 */

export type NumericInput =
  | { kind: 'value'; value: number }
  /** The field is blank. Not a zero. */
  | { kind: 'empty' }
  /** Text, or a number the field's own rules forbid. */
  | { kind: 'invalid'; reasonKey: string };

export interface NumericInputRules {
  /** Smallest accepted value. Defaults to 0 — most dimensions here cannot be negative. */
  min?: number;
  /** Largest accepted value, when the field has one. */
  max?: number;
  /**
   * What zero means for THIS field. Every call site declares it, because that is the whole
   * question this module exists to answer and it has no safe default across fields:
   *
   *   · `'valid'` (default) — a real configuration. A batten gap of 0 is continuous contact;
   *     an edge distance of 0 is a bolt at the plate edge, which §J.3.4 then rejects **as a
   *     check**, which is the honest place for it to be rejected.
   *   · `'invalid'` — physically meaningless. A 0 mm fillet leg, a 0 MPa electrode, a 0 mm
   *     plate: these are not thin, they are absent, and a design built on them is not a
   *     design. Refusing here keeps a zero out of a clause that would compute a capacity of
   *     zero and report it as an ordinary overstress.
   */
  zero?: 'valid' | 'invalid';
}

/**
 * Parse a form field's raw string.
 *
 * Deliberately takes the STRING, not a number: by the time a caller has written
 * `Number(el.value)` the distinction between `''` and `'0'` is already gone — both become
 * falsy, and that is exactly the confusion this exists to prevent.
 */
export function parseNumericInput(raw: string, rules: NumericInputRules = {}): NumericInput {
  const trimmed = raw.trim();
  if (trimmed === '') return { kind: 'empty' };

  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { kind: 'invalid', reasonKey: 'input.invalid.notANumber' };

  if (value === 0 && rules.zero === 'invalid') {
    return { kind: 'invalid', reasonKey: 'input.invalid.zeroNotMeaningful' };
  }

  const min = rules.min ?? 0;
  if (value < min) {
    return {
      kind: 'invalid',
      reasonKey: min === 0 ? 'input.invalid.negative' : 'input.invalid.belowMinimum',
    };
  }
  if (rules.max !== undefined && value > rules.max) {
    return { kind: 'invalid', reasonKey: 'input.invalid.aboveMaximum' };
  }
  return { kind: 'value', value };
}

/**
 * The value, or `undefined` for an empty field — and `undefined` for an invalid one too.
 *
 * For callers where «not supplied» is the right answer to both. A caller that has somewhere to
 * SHOW the invalidity should read the discriminated union instead: this helper is the convenient
 * form, not the complete one.
 */
export function numericOrUndefined(raw: string, rules: NumericInputRules = {}): number | undefined {
  const parsed = parseNumericInput(raw, rules);
  return parsed.kind === 'value' ? parsed.value : undefined;
}

/**
 * The value, or the previous one when the field is empty or invalid.
 *
 * For fields that must always hold something — a bolt count, a segment count. Keeping the last
 * good value is what stops a half-typed entry from momentarily redesigning the joint, and it
 * never substitutes a plausible number the user did not choose.
 */
export function numericOrKeep(
  raw: string, previous: number, rules: NumericInputRules = {},
): number {
  const parsed = parseNumericInput(raw, rules);
  return parsed.kind === 'value' ? parsed.value : previous;
}

/**
 * A decimal number as people type and paste it: a comma or a point for the decimals, and
 * thousands grouped by the other one. Null when it is not a number (text, a unit after it) or
 * when its separators contradict each other.
 *
 * It replaces `parseFloat(s.replace(',', '.'))`, which read only the first comma and stopped at
 * the next separator: "1,234.5" became 1.234 and "6,123,456.78" became 6.123, with no error.
 *
 *   "1,5" · "1.5"                → 1.5
 *   "1,234.5" · "1.234,5"        → 1234.5 (the last separator is the decimal one, the other groups by three)
 *   "1,234,567" · "1.234.567"    → 1234567 (one separator, repeated in groups of three)
 *   "1,234" · "1.234"            → 1.234
 *   "1,23,4" · "1.2.3" · "1,2.3" → null
 *
 * ONE separator, written once, is always the decimal one — even before exactly three digits,
 * where "1,234" could be an English thousand. That is a choice, not a guess: a length of
 * 1,234 m (three decimals, a millimetre) is how the app's Spanish and Portuguese users write it,
 * and the old `parseFloat(s.replace(',', '.'))` read it the same way. A thousand with its
 * grouping is read as one only when the text says so: a second group ("1,234,567") or the other
 * separator after it ("1,234.0").
 */
export function parseDecimal(raw: string): number | null {
  const s = raw.trim().replace(/\s+/g, '');
  if (s === '') return null;
  const commas = (s.match(/,/g) ?? []).length, points = (s.match(/\./g) ?? []).length;
  const grouped = (body: string, sep: string) => new RegExp(`^[+-]?\\d{1,3}(\\${sep}\\d{3})+$`).test(body);
  let clean: string;
  if (commas > 0 && points > 0) {
    const last = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
    const dec = s[last]!, group = dec === ',' ? '.' : ',';
    if ((dec === ',' ? commas : points) !== 1) return null;
    const intPart = s.slice(0, last);
    if (!grouped(intPart, group)) return null;
    clean = intPart.split(group).join('') + '.' + s.slice(last + 1);
  } else if (commas > 1 || points > 1) {
    const sep = commas > 1 ? ',' : '.';
    if (!grouped(s, sep)) return null;
    clean = s.split(sep).join('');
  } else {
    clean = s.replace(',', '.');
  }
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(clean)) return null;
  const v = Number(clean);
  return Number.isFinite(v) ? v : null;
}

/**
 * A typed decimal, or the previous value when the text cannot be read («12 kN», «1.2.3»).
 *
 * For cells that always hold a number, such as a load's components: unreadable text changes
 * nothing, where `parseDecimal(s) ?? 0` wrote a zero the user never typed. An empty cell is a
 * cleared component and reads as `empty` (0 unless the caller says otherwise).
 */
export function decimalOrKeep(raw: string, previous: number, empty = 0): number {
  if (raw.trim() === '') return empty;
  return parseDecimal(raw) ?? previous;
}

/**
 * The components typed into an add-load form: a blank field is a component not given (0), and
 * null when ANY field does not read («5 kN», «1.2.3») — the form then adds nothing, rather than
 * a load with a zero the user never typed. `parseFloat(s) || 0` read «1,5» as 1 and «1.234,5»
 * as 1.234.
 */
export function loadComponents(raws: readonly string[]): number[] | null {
  const out: number[] = [];
  for (const raw of raws) {
    const v = raw.trim() === '' ? 0 : parseDecimal(raw);
    if (v === null) return null;
    out.push(v);
  }
  return out;
}

/**
 * The two ends of a line load as typed. A BLANK J end is the same as I, a uniform load; a typed
 * 0 is a zero, so 10 → 0 is a triangle — `parseFloat(j) || i` added it as a uniform 10. Null
 * when either end does not read.
 */
export function lineLoadEnds(rawI: string, rawJ: string): [number, number] | null {
  const [i] = loadComponents([rawI]) ?? [];
  if (i === undefined) return null;
  if (rawJ.trim() === '') return [i, i];
  const j = parseDecimal(rawJ);
  return j === null ? null : [i, j];
}
