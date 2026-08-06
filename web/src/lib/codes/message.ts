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

/**
 * Stable, UNIQUE list keys for rendering messages in a keyed `{#each}`.
 *
 * ── The crash this exists to prevent ────────────────────────────────
 *
 * A keyed each block needs an identity per item, and several panels were using the message KEY.
 * That is the i18n key, not the record: `validateFooting` legitimately raises two blocking issues
 * for an undimensioned footing — `footing.issue.planDimension` with `axis: 'B'` and the same key
 * with `axis: 'L'` — and Svelte refused the list outright:
 *
 *     each_key_duplicate: Keyed each block has duplicate key
 *     `footing.issue.planDimension` at indexes 0 and 1
 *
 * The panel did not render a wrong list; it threw, and "Design and detail floors" died with it.
 *
 * ── Why not deduplicate ─────────────────────────────────────────────
 *
 * Because both records are true. "B is not positive" and "L is not positive" are two findings with
 * two remedies, and collapsing them would hide one — the same class of dishonesty as dropping a
 * finding to make a list clean. So this makes the KEYS unique and leaves the LIST untouched:
 * same length, same order, every record rendered.
 *
 * ── The key, in order of preference ─────────────────────────────────
 *
 * `messageIdentity` first, which is the key plus every param sorted — so the two planDimension
 * issues differ by `axis=B` versus `axis=L`, which is exactly the semantic difference between
 * them. A positional suffix is appended ONLY where that still collides, i.e. where two records are
 * genuinely identical in key and params. Position is the last resort on purpose: a key that always
 * carried the index would reorder and remount every row whenever the list changed, which is the
 * thing keyed blocks exist to avoid.
 */
export function messageListKeys(messages: readonly EngineMessage[]): string[] {
  const seen = new Map<string, number>();
  return messages.map((m) => {
    const id = messageIdentity(m);
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    return n === 0 ? id : `${id}#${n}`;
  });
}

/**
 * The same, paired with the message, for a template that wants to iterate one array.
 *
 * `{#each identifyMessages(list) as m (m.id)}` reads better than threading a parallel key array
 * through the markup, and it cannot fall out of step with the list it keys.
 */
export function identifyMessages(
  messages: readonly EngineMessage[],
): Array<{ id: string; message: EngineMessage }> {
  const keys = messageListKeys(messages);
  return messages.map((message, i) => ({ id: keys[i], message }));
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
