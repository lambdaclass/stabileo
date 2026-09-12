/**
 * Every right-hand panel has a title in every locale.
 *
 * ── The bug this prevents ──────────────────────────────────────────
 *
 * `BasicPanel` titles itself by looking up `ribbon.<panel>`, and `t()`
 * returns the KEY when it finds nothing. That is the right default for a
 * label inside a form — a stray key is obviously wrong and easy to spot —
 * and exactly wrong for a heading, where it renders as the panel's name.
 * Opening Stabileo AI showed a panel headed "ribbon.ai", because no such key
 * had ever been written.
 *
 * The component now refuses to print a key it did not find, but a blank
 * heading is only a better failure, not a fixed one. This is the fix: the
 * set of panels and the set of titles have to match, in all three locales,
 * and a new panel fails here before anyone sees it.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { allDictFor } from '../locales/all';
import { OFFERED_LOCALES } from '../store.svelte';

/**
 * The panels `BasicPanel` can show, read from the component itself.
 *
 * Hard-coding the list would make this test agree with a copy of the truth
 * rather than with the truth — add a panel, forget to add it here, and the
 * test keeps passing while the heading is blank.
 */
function panelsFromComponent(): string[] {
  const src = readFileSync(
    resolve(__dirname, '../../../components/ribbon/BasicPanel.svelte'),
    'utf8',
  );
  const found = new Set<string>();
  for (const m of src.matchAll(/panel === '([a-zA-Z0-9-]+)'/g)) found.add(m[1]);
  return [...found].sort();
}

describe('the right-hand panel', () => {
  const panels = panelsFromComponent();

  it('has panels to check, so a rename cannot quietly empty this test', () => {
    expect(panels.length).toBeGreaterThanOrEqual(6);
    /* The two that were missing when this was written. */
    expect(panels).toContain('ai');
    expect(panels).toContain('move');
  });

  /*
   * The locales actually OFFERED, not every dictionary shipped. The others
   * carry no `ribbon.*` at all and fall back, so asserting on them would be
   * asserting that the fallback does not exist.
   */
  for (const code of OFFERED_LOCALES) {
    const dict = allDictFor(code);
    it(`${code}: every panel has a heading`, () => {
      const missing = panels.filter((p) => !(`ribbon.${p}` in dict));
      expect(missing, `no ribbon.<panel> title for: ${missing.join(', ')}`).toEqual([]);
    });

    it(`${code}: no heading is left as its own key`, () => {
      /*
       * A key present but set to its own name would pass the check above and
       * render identically to the bug.
       */
      const echoed = panels.filter((p) => dict[`ribbon.${p}`] === `ribbon.${p}`);
      expect(echoed).toEqual([]);
    });
  }
});
