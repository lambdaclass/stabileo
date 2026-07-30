/**
 * The one currency the pure engines speak when they have something to say to a human.
 *
 * ── Why this exists ────────────────────────────────────────────────
 *
 * The load, wind, live-load and regulation engines all produced sentences. Spanish
 * sentences, hardcoded, in files that are otherwise pure functions of their inputs. That
 * is wrong twice over:
 *
 *   1. It makes the engines untranslatable. `t()` lives in a Svelte store; importing it
 *      into a pure module would drag reactive state into code that must stay callable from
 *      a test, a worker, a report generator or a DXF writer.
 *   2. It makes the engines the wrong place to decide how something reads. "Reducción del
 *      20 %" is a *fact* about a clause; how to phrase it is a UI concern, and the same
 *      fact appears in a panel, a PDF, a drawing note and a spreadsheet cell — each with
 *      its own space budget.
 *
 * So engines return `{ key, params }` and nothing else. Translation happens exactly at the
 * four boundaries that have a locale: UI, report, drawing, export.
 *
 * ── The rule ───────────────────────────────────────────────────────
 *
 * No module under `lib/codes/` or `lib/engine/loads/` may import from `lib/i18n`. A test
 * (`engine-purity.test.ts`) enforces it, and a second test enforces that every key an
 * engine can emit exists in every shipped locale.
 *
 * Numbers are formatted at the boundary too, which is why `params` carries raw numbers:
 * Spanish writes 1,25 where English writes 1.25, and only the boundary knows which.
 */

/**
 * A parameter value.
 *
 * Nesting matters: "CIRSOC 201 (2025) cannot be applied" is one sentence containing another
 * translatable fragment. Without nesting, an engine would have to either paste a
 * pre-rendered label (impossible — it has no locale) or emit the raw key as text (which is
 * how `maturity.validated` once leaked into a badge). So a param may itself be a message,
 * and the boundary resolves inside-out.
 */
export type MessageParam = string | number | EngineMessage;

export interface EngineMessage {
  /** i18n key. Must exist in every shipped locale. */
  readonly key: string;
  /** Interpolation values. Raw numbers — formatting belongs to the boundary. */
  readonly params?: Readonly<Record<string, MessageParam>>;
}

/** Construct a message. Terse because engines build a lot of these. */
export function msg(
  key: string, params?: Record<string, MessageParam>,
): EngineMessage {
  return params === undefined ? { key } : { key, params };
}

/** True for a value that is a nested message rather than a scalar. */
export function isMessage(v: unknown): v is EngineMessage {
  return typeof v === 'object' && v !== null && typeof (v as EngineMessage).key === 'string';
}

/**
 * Deduplicate messages by key AND params.
 *
 * `[...new Set(strings)]` used to do this. With structured messages the identity has to be
 * computed, and two messages with the same key but different levels are genuinely
 * different messages — the level number is in the params.
 */
/** Stable identity of a message, params included, for deduplication and assertions. */
export function messageIdentity(m: EngineMessage): string {
  if (m.params === undefined) return m.key;
  const parts = Object.keys(m.params).sort().map((k) => {
    const v = m.params![k];
    return k + '=' + (isMessage(v) ? '[' + messageIdentity(v) + ']' : String(v));
  });
  return m.key + '(' + parts.join(',') + ')';
}

export function dedupeMessages(messages: readonly EngineMessage[]): EngineMessage[] {
  const seen = new Set<string>();
  const out: EngineMessage[] = [];
  for (const m of messages) {
    const id = messageIdentity(m);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(m);
  }
  return out;
}

/**
 * Round a number for display inside message params.
 *
 * The engines used to bake `toFixed(1)` into a Spanish sentence, which fixed both the
 * precision and the decimal separator. Precision is an engineering decision and stays with
 * the engine; the separator is a locale decision and goes to the boundary. So the engine
 * rounds and passes a number, and the boundary formats it.
 */
export function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
