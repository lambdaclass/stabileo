/**
 * The concrete panels take their status colours from the token system — and where they cannot,
 * they say so.
 *
 * ── The two defects this pins ──────────────────────────────────────
 *
 * **A private status palette.** `FootingMatPhysicalPanel` painted eight status bands from
 * `#5c1a1a`/`#ffe4e4` (blocking) and `#7a5b00`/`#fff6dd` (advisory) — a red and an amber that
 * exist nowhere else in the application. `tokens.css` has `--st-danger` and `--st-warn` and no
 * surface variants of either, so the band became a `--st-surface-3` well with the status on its
 * left rule. That trade is measured below rather than asserted: the obvious version, status
 * hue as the TEXT colour, would have cut a paragraph from 10.80:1 to 4.89:1.

 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const TOKENS = readFileSync(
  new URL('../../styles/tokens.css', import.meta.url).pathname, 'utf8');

/** Follow a token through its `var()` aliases until a literal falls out. */
function resolveToken(name: string, depth = 0): string {
  expect(depth, `${name} does not resolve to a literal`).toBeLessThan(8);
  const m = TOKENS.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  expect(m, `${name} must be defined in tokens.css`).not.toBeNull();
  const value = m![1].trim();
  const alias = value.match(/^var\((--[a-z0-9-]+)\)$/);
  return alias ? resolveToken(alias[1], depth + 1) : value;
}

/** sRGB → relative luminance, WCAG 2.1 §1.4.3. */
function luminance(hex: string): number {
  let h = hex.replace('#', '');
  // `--st-text-on-accent` is `#fff`. Slicing a shorthand two characters at a time yields NaN,
  // and `NaN >= 4.5` is false, so the assertion failed for the right reason and the wrong cause.
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  expect(h, `${hex} must be a 6-digit hex`).toHaveLength(6);
  const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('the trade the footing bands actually made', () => {
  it('the message keeps more contrast than the private band it replaced, not less', () => {
    const surface = resolveToken('--st-surface-3');
    const text = resolveToken('--st-text');
    const now = contrast(text, surface);
    // `#ffe4e4` on `#5c1a1a` — the literal pair that is gone.
    const before = contrast('#ffe4e4', '#5c1a1a');
    expect(now, 'full-contrast text on the well').toBeGreaterThan(before);
    expect(now).toBeGreaterThan(10);
  });

  it('and records why the status hue is NOT the text colour', () => {
    // This is the version that would have been the tidy one. It passes AA and still loses to
    // the band, which is the whole reason the rule carries the status instead.
    const tinted = contrast(resolveToken('--st-danger'), resolveToken('--st-surface-3'));
    expect(tinted, 'the tinted variant does clear AA').toBeGreaterThan(4.5);
    expect(tinted, 'and is still worse than what it replaced').toBeLessThan(
      contrast('#ffe4e4', '#5c1a1a'));
  });

  it('the badges DO use the status hue as text, and that still clears AA', () => {
    // A badge's content is the status word itself, at 0.68rem — the case `tokens.css` says the
    // `-text` variants exist for.
    for (const t of ['--st-danger', '--st-warn']) {
      expect(contrast(resolveToken(t), resolveToken('--st-surface-3')), t)
        .toBeGreaterThanOrEqual(4.5);
    }
  });
});
