/**
 * The readable text of a thrown value.
 *
 * Written for the shape the engine throws. Every `#[wasm_bindgen]` export in
 * `engine/src/lib.rs` returns `Result<String, JsValue>` and builds its error with
 * `JsValue::from_str` — 76 exports, 216 such sites. wasm-bindgen throws that value
 * as-is, so a `catch` receives a JS STRING PRIMITIVE rather than an `Error`, and a
 * string has no `.message`.
 *
 * `e.message ?? fallback` therefore reports the fallback for every refusal the
 * solver writes, which is how "Guyan reduction does not support prescribed support
 * displacements (node 3)" reached the user as "Model Reduction: Error". The string
 * branch is checked FIRST because it is the case that actually occurs.
 *
 * A non-string, non-Error value returns the fallback rather than `String(value)`:
 * stringifying `42` or `[object Object]` into an error panel presents noise as if
 * it were the engine's explanation.
 */
export function errorText(e: unknown, fallback: string): string {
  // This utility is imported by workers: keep it free of i18n/store rune imports.
  if (typeof e === 'string') {
    try {
      const parsed = JSON.parse(e);
      const refused = parsed?.structuredDiagnostics?.filter((d: { code?: string; severity?: string; message?: unknown }) =>
        d.code === 'known_issue' && d.severity === 'error' && typeof d.message === 'string');
      if (refused?.length) return refused.map((d: { message: string }) => d.message).join('\n');
    } catch { /* An ordinary error string. */ }
  }
  if (typeof e === 'string') return e.trim() ? e : fallback;
  const message = (e as { message?: unknown } | null | undefined)?.message;
  if (typeof message === 'string' && message.trim()) return message;
  return fallback;
}
