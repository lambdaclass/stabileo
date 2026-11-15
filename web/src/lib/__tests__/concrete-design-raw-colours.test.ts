/**
 * Raw colours in the concrete design surface: a debt that can only go down.
 *
 * ── Why a ceiling and not a ban ────────────────────────────────────
 *
 * `design-tokens-resolve.test.ts` already asserts that every `--st-*` a component REFERENCES
 * is defined. It cannot see the opposite problem: a component that writes the colour out by
 * hand instead of referencing the token at all. Those are invisible to it, and there are 132
 * of them in `components/pro/design/`.
 *
 * Most are not arbitrary: `rgba(143, 163, 179, 0.35)` is `--st-hair-strong` (0.38) rewritten by
 * hand, and `rgba(143, 163, 179, 0.2)` is `--st-hair` (0.22) rewritten by hand. PR20's own regulations pass found the same thing and
 * said so: "`rgba(143, 163, 179, …)` appeared four times, hardcoded beside the tokens that
 * mean exactly that." A hand-written approximation drifts from the token the day the token
 * changes, and nothing reports it.
 *
 * Banning them outright today would fail on 132 pre-existing sites across eighteen files,
 * several of which are shared surfaces this branch must not touch unilaterally
 * (`DesignToolbar`, `OutcomeBadge`) or belong to the 3-D viewer. So this is a CEILING, the
 * same shape as `scripts/typecheck-baseline.json`: the count is recorded, it may fall, and it
 * may never rise. The debt is visible instead of remembered, and a new component cannot add
 * to it.
 *
 * A file at zero must stay at zero.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = new URL('../../components/pro/design', import.meta.url).pathname;

/**
 * A literal colour: `#rgb`, `#rrggbb`, `rgb(...)`, `rgba(...)`.
 *
 * Comments are stripped first. A comment that NAMES the old value — the one this file's own
 * fix leaves behind, explaining what it replaced — is documentation, not a colour, and
 * counting it would punish writing the reason down.
 */
const COLOUR = /rgba?\(\s*\d|#[0-9a-fA-F]{3,8}\b/g;

function rawColours(source: string): number {
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, '')   // CSS and JS block comments
    .replace(/<!--[\s\S]*?-->/g, '')    // markup comments
    .replace(/^\s*\/\/.*$/gm, '');      // JS line comments
  return (stripped.match(COLOUR) ?? []).length;
}

/** The recorded ceiling, per file. Lower it when you tokenise; never raise it. */
const CEILING: Record<string, number> = {};

// 132 at the start of this work; 24 before the RC design desk was deleted with every file left on
// this list.
const TOTAL_CEILING = 0;

const files = () => readdirSync(DIR).filter((f) => f.endsWith('.svelte'));

describe('the raw-colour debt does not grow', () => {
  it('no file exceeds its recorded ceiling', () => {
    const over: string[] = [];
    for (const f of files()) {
      const n = rawColours(readFileSync(join(DIR, f), 'utf8'));
      const ceiling = CEILING[f] ?? 0;
      if (n > ceiling) over.push(`${f}: ${n} raw colours, ceiling ${ceiling}`);
    }
    expect(over).toEqual([]);
  });

  it('the total does not exceed the recorded total', () => {
    const total = files()
      .reduce((s, f) => s + rawColours(readFileSync(join(DIR, f), 'utf8')), 0);
    expect(total).toBeLessThanOrEqual(TOTAL_CEILING);
  });

  it('a file the ceiling does not list must have none at all', () => {
    // This is the half that bites a NEW component: it is absent from the map, so its ceiling
    // is zero and it has to use tokens from the first line.
    const unlisted = files()
      .filter((f) => !(f in CEILING))
      .map((f) => [f, rawColours(readFileSync(join(DIR, f), 'utf8'))] as const)
      .filter(([, n]) => n > 0)
      .map(([f, n]) => `${f}: ${n}`);
    expect(unlisted).toEqual([]);
  });
});

/**
 * The files that are AT zero, listed by name.
 *
 * A file at zero is only protected by the ceiling map's "unlisted means zero" rule, which is
 * silent about which files that is. Naming them makes the set visible, so tokenising one is a
 * line in this list rather than a deletion nobody reads.
 */
describe('the files already at zero stay there', () => {
  const AT_ZERO = [
    'FootingMatPhysicalPanel.svelte', 'FootingCadHandoffPanel.svelte', 'FootingMatPanel.svelte',
  ];

  it('each of them still has none', () => {
    for (const f of AT_ZERO) {
      expect(rawColours(readFileSync(join(DIR, f), 'utf8')), f).toBe(0);
      expect(f in CEILING, `${f} must not be given a ceiling again`).toBe(false);
    }
  });
});
