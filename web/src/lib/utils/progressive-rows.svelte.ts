/**
 * Rows drawn in batches: the first ones at once, the rest a batch per frame.
 *
 * A table row is a dozen controls, and a large model's thousands at once held the main thread for
 * the better part of a second whenever its tab opened (Basic's members table on the shed, PRO's
 * members and loads tables on a building of 4,000 members). The first batch fills the panel; the
 * rest follow while the reader is already looking at it.
 *
 * Call it during a component's setup (it owns an effect). `reach(index)` draws at least up to a
 * row, for a row the model asks to bring into view before its batch has come.
 */
export const FIRST_ROWS = 30;
export const MORE_ROWS = 100;

/**
 * How many rows to draw, growing a batch per frame up to `count()`: one budget for a panel of
 * several tables, which take it in order (`slice`).
 */
export function progressiveLimit(count: () => number, first = FIRST_ROWS, more = MORE_ROWS) {
  let limit = $state(first);
  $effect(() => {
    const total = count();
    if (limit >= total) return;
    const id = requestAnimationFrame(() => { limit = Math.min(total, limit + more); });
    return () => cancelAnimationFrame(id);
  });
  return {
    get limit(): number { return limit; },
    /** The part of `rows` drawn when `before` rows of the tables above it come first. */
    slice<T>(rows: readonly T[], before = 0): readonly T[] {
      const n = Math.max(0, limit - before);
      return n >= rows.length ? rows : rows.slice(0, n);
    },
    /** Draw at least the rows up to `index` (0-based, over every table in order). */
    reach(index: number): void { if (index >= limit) limit = index + 1; },
  };
}

export function progressiveRows<T>(source: () => readonly T[], first = FIRST_ROWS, more = MORE_ROWS) {
  const budget = progressiveLimit(() => source().length, first, more);
  return {
    /** The rows drawn so far. */
    get rows(): readonly T[] { return budget.slice(source()); },
    /** Whether every row is drawn. */
    get complete(): boolean { return budget.limit >= source().length; },
    /** Draw at least the rows up to `index` (0-based). */
    reach(index: number): void { budget.reach(index); },
  };
}
