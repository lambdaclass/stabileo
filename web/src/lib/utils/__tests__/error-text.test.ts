import { readFileSync } from 'node:fs';
import { setLocale } from '../../i18n';
import { knownIssueRefusal } from '../../engine/known-issues';
/**
 * Reading a thrown value, including the ones WASM throws.
 *
 * Every `#[wasm_bindgen]` export in this engine returns `Result<String, JsValue>`
 * and builds its error with `JsValue::from_str`. wasm-bindgen throws that value
 * as-is, so what reaches a `catch` is a JS STRING PRIMITIVE, not an Error — and a
 * string has no `.message`. Code written as `e.message ?? 'Error'` therefore
 * reports the fallback for every engine refusal, discarding the sentence the
 * solver went to the trouble of writing.
 *
 * That is what these tests pin: the string case first, because it is the one the
 * engine actually produces.
 */
import { describe, it, expect } from 'vitest';
import { errorText } from '../error-text';

describe('the text of a thrown value', () => {
  it('returns a thrown string verbatim — the shape WASM throws', () => {
    expect(errorText('Guyan reduction does not support prescribed support displacements (node 3)', 'fallback'))
      .toBe('Guyan reduction does not support prescribed support displacements (node 3)');
  });

  it('reads .message from a real Error', () => {
    expect(errorText(new Error('boom'), 'fallback')).toBe('boom');
  });

  it('falls back when the thrown value carries no text', () => {
    expect(errorText(null, 'fallback')).toBe('fallback');
    expect(errorText(undefined, 'fallback')).toBe('fallback');
    expect(errorText({}, 'fallback')).toBe('fallback');
  });

  it('treats blank text as absent rather than reporting an empty line', () => {
    expect(errorText('   ', 'fallback')).toBe('fallback');
    expect(errorText(new Error('  '), 'fallback')).toBe('fallback');
  });

  it('does not invent text for a non-string, non-Error value', () => {
    // `String(42)` would read as an error message; it is not one.
    expect(errorText(42, 'fallback')).toBe('fallback');
  });
});

it('translates engine refusals through the production error formatter', () => {
  const raw = JSON.stringify({ structuredDiagnostics: [{ code: 'known_issue', severity: 'error', phase: 'PL-2D-INVARIANCE', value: 758, message: 'ENGINE' }] });
  for (const locale of ['en', 'es', 'pt'] as const) {
    setLocale(locale);
    for (const error of [raw, new Error(raw), `Failed to solve case 'A': ${raw}`]) {
      const text = errorText(error, 'fallback');
      expect(text).toBe(knownIssueRefusal(raw));
      expect(text).toContain('#758');
      expect(text).not.toMatch(/ENGINE|structuredDiagnostics|[{}]/);
    }
  }
  setLocale('en');
});

it('the Basic advanced handler uses the localized production formatter', () => {
  const source = readFileSync(new URL('../../../components/toolbar/ToolbarAdvanced.svelte', import.meta.url), 'utf8');
  expect(source).toContain("import { errorText } from '../../lib/utils/error-text'");
  expect(source).toContain('return errorText(e, t(fallbackKey));');
});
