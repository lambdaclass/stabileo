/**
 * The size ceilings for the detailing store family, made enforceable.
 *
 * ── Why this test exists, and why it is scoped rather than global ──
 *
 * `CLAUDE.md` states the ceilings — files under 500 lines, stores under 800 — and until now
 * nothing checked them, so `detailing.svelte.ts` reached 1566. A guideline that only a reader
 * can enforce is a guideline that loses to whoever is in a hurry.
 *
 * It is deliberately NOT a sweep over `lib/store/`. `model.svelte.ts` is 3299 lines, `file.ts`
 * and `ui.svelte.ts` are over 1100, and all three are named in `CLAUDE.md`'s own refactor
 * table. A gate that fails on day one gets skipped, and a skipped gate protects nothing. This
 * pins the files the concrete flow owns and is about to grow; the others need their own
 * extraction before they can be pinned, not a red assertion in the meantime.
 *
 * The numbers below are ceilings, not budgets. If a change needs more room, the answer is to
 * extract — not to raise the number here.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const loc = (rel: string) =>
  readFileSync(resolve(HERE, '..', rel), 'utf8').split('\n').length;

/** Store ceiling, per `CLAUDE.md`: a store holds state and routes intent, and little else. */
const STORE_MAX = 800;
/** File ceiling for everything that is not a store. */
const FILE_MAX = 500;

describe('the detailing store stays a store', () => {
  it.each([
    'detailing.svelte.ts',
    /*
     * The sheet surface left when objectives 7 and 8 gave it real geometry and a rótulo, and it
     * is pinned here for the reason the assembly store is: it holds state, so it is a store,
     * and a store that is not measured is a store that grows.
     */
    'detailing-sheet.svelte.ts',
  ])('%s is under the 800-line store ceiling', (file) => {
    expect(loc(file)).toBeLessThan(STORE_MAX);
  });

  /*
   * The readings that came out of it. Three files rather than one, because one was 820 lines
   * and that would only have moved the problem.
   */
  it.each([
    ['detailing-project-inputs.ts', FILE_MAX],
    ['detailing-floor-inputs.ts', FILE_MAX],
    /*
     * Footing readings get a wider ceiling and the reason is written down rather than
     * rounded up: `collectSlabColumns` alone is ~265 lines of joint reconstruction — the
     * delivered shear and unbalanced moment at a slab–column node, assembled from the column
     * legs meeting there. Splitting it from `collectFootingReactions` would separate it from
     * the reactions it reads. This ceiling is a statement about that one function, and it
     * should come down when the joint reconstruction moves to `lib/engine/detailing/`.
     */
    ['detailing-footing-inputs.ts', 560],
    /* The sheet's readings: member concrete, cover, station, rótulo codes. */
    ['detailing-sheet-inputs.ts', FILE_MAX],
  ])('%s is under %i lines', (file, max) => {
    expect(loc(file as string)).toBeLessThan(max as number);
  });

  /*
   * The invariant the split is FOR, and the one a future edit is most likely to break: a
   * readings module answers questions, it does not hold state. A rune DECLARED here would
   * mean the extraction had silently reversed itself.
   *
   * Matched on the assignment and not on the word: these files explain themselves in terms of
   * the store they came from, and `detailing-footing-inputs.ts` discusses at length why a
   * `$derived` is lazy and memoised. A gate that cannot tell a declaration from a sentence
   * about one would make the comment the thing that fails.
   */
  it.each([
    'detailing-project-inputs.ts',
    'detailing-floor-inputs.ts',
    'detailing-footing-inputs.ts',
    'detailing-sheet-inputs.ts',
  ])('%s declares no state', (file) => {
    const src = readFileSync(resolve(HERE, '..', file), 'utf8');
    expect(src, 'a readings module must not declare runes')
      .not.toMatch(/=\s*\$(state|derived)\b/);
  });
});
