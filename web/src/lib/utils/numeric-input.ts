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
