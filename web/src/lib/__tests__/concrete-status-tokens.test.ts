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
import { join } from 'node:path';

const DESIGN = new URL('../../components/pro/design', import.meta.url).pathname;
const read = (f: string) => readFileSync(join(DESIGN, f), 'utf8');
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

describe('the footing panel carries no private palette', () => {
  const src = () => read('FootingMatPhysicalPanel.svelte');
  const css = () => src().replace(/\/\*[\s\S]*?\*\//g, '');

  it('none of the eight band literals survive outside a comment', () => {
    // Kept as an explicit list: a regex for "any colour" would pass the day someone mixes a
    // ninth one, and these five are the specific values that were there.
    for (const lit of ['#5c1a1a', '#ffe4e4', '#7a5b00', '#fff6dd', 'rgba(128,128,128']) {
      expect(css(), `${lit} must be gone`).not.toContain(lit);
    }
  });

  it('blocking is danger and advisory is warn, and neither is the other', () => {
    const c = css();
    expect(c).toMatch(/\.issues li\.blocking\s*\{[^}]*border-left:[^;]*var\(--st-danger\)/);
    expect(c).toMatch(/\.issues li\.advisory\s*\{[^}]*border-left:[^;]*var\(--st-warn\)/);
    // Blocking is never green, which is the file's own rule and the one worth a test.
    expect(c).not.toMatch(/\.issues li\.blocking\s*\{[^}]*--st-ok/);
  });

  it('the MODELED badge stays neutral — no status hue, and above all not green', () => {
    // The panel header's own words: "One green badge must not be able to" stand in for a
    // verified result. A surface and nothing else.
    const rule = css().match(/\.badge\.geom-MODELED[^{]*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toContain('var(--st-surface-3)');
    for (const t of ['--st-ok', '--st-green', '--st-danger', '--st-warn']) {
      expect(rule![1], `MODELED must not reach for ${t}`).not.toContain(t);
    }
  });

  it('and the failed / not-evaluated badges do not share one hue', () => {
    const c = css();
    expect(c).toMatch(/\.badge\.geom-RECONCILIATION_FAILED[^}]*var\(--st-danger\)/);
    expect(c).toMatch(/\.badge\.geom-NOT_MODELED[^}]*var\(--st-warn\)/);
  });

  it('the resolved order is marked as a selection, not as a lighter grey', () => {
    expect(css()).toMatch(/tr\.chosen\s*\{[^}]*var\(--st-selected-bg\)/);
  });
});

describe('no concrete design panel hides a literal behind a fallback', () => {
  /**
   * `var(--anything, #literal)` is the shape that defeated the existing token gate. Either the
   * custom property resolves — and the literal is dead weight the next person reads as the
   * intended value — or it does not, and the panel is off the system while looking like it is
   * on it.
   */
  const PANELS = ['FootingMatPhysicalPanel.svelte'];

  const UNDEFINED_AT_ROOT = ['--text', '--text-muted', '--panel'];

  it('the panel this pass tokenised carries no fallback literal', () => {
    const bad: string[] = [];
    for (const f of PANELS) {
      const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/var\(\s*--[a-z0-9-]+\s*,\s*(#[0-9a-fA-F]{3,8}|rgba?\()/g)) {
        bad.push(`${f}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('and it does not depend on a property no ancestor defines', () => {
    for (const f of PANELS) {
      const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
      for (const name of UNDEFINED_AT_ROOT) {
        expect(css, `${f} must not depend on ${name}`)
          .not.toMatch(new RegExp(`var\\(\\s*${name}\\s*[,)]`));
      }
    }
  });

  it('every token these panels do reach for is defined at :root', () => {
    // The property `design-tokens-resolve` holds for `--st-*`, restated here over the exact set
    // this pass introduced — including the non-`--st-` names, which that gate does not see.
    for (const f of PANELS) {
      const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/g)) {
        expect(TOKENS, `${f}: ${m[1]}`).toMatch(new RegExp(`${m[1]}\\s*:`));
      }
    }
  });
});

/**
 * The rest of bucket 1, once the shared contract existed.
 *
 * Five of these six were waiting on a token that did not exist: `--st-danger-bg` for the CAD
 * failure band and `--st-warn-bg` for the advice band. Two things they were NOT waiting on are
 * the interesting part, so both are asserted as deliberate rather than left to look unfinished.
 */
describe('bucket 1 after the contract', () => {
  const css = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, '');

  it('the CAD failure band is the danger surface, not another hand-mixed red', () => {
    const c = css('FootingCadHandoffPanel.svelte');
    // `#5c1a1a`/`#ffe4e4` — the third and fourth appearance of the pair `FootingMatPhysicalPanel`
    // carried, in the same panel family.
    for (const gone of ['#5c1a1a', '#ffe4e4', '#3a3a3a']) {
      expect(c, gone).not.toContain(gone);
    }
    expect(c).toMatch(/\.failed li \{[^}]*var\(--st-danger-bg\)/);
    expect(c).toMatch(/\.failed li \{[^}]*border-left: 3px solid var\(--st-danger\)/);
    expect(c, 'and the words at full contrast').toMatch(/\.failed \{[^}]*var\(--st-text\)/);
  });

  it('the hair tokens stop being written out by hand', () => {
    // `rgba(143,163,179, α)` IS `--st-hair` at 0.22 and `--st-hair-strong` at 0.38. Three files
    // wrote it at 0.2, 0.25 and 0.3 — a token approximated three ways.
    for (const f of ['FootingMatPanel.svelte', 'FloorFamiliesPanel.svelte']) {
      expect(css(f), `${f} still approximates the hair token`)
        .not.toMatch(/rgba\(143,\s*163,\s*179/);
    }
    expect(css('FootingMatPanel.svelte')).toMatch(/border-top: 1px solid var\(--st-hair-strong\)/);
    expect(css('FloorFamiliesPanel.svelte')).toMatch(/border-bottom: 1px solid var\(--st-border\)/);
  });

  it('the DESIGNED badge stays neutral, like its sibling MODELED badge', () => {
    // Designed is not verified, and no status hue may suggest it is. Same rule the mat panel's
    // header states in as many words.
    const rule = css('FootingMatPanel.svelte').match(/\.badge\.status-DESIGNED \{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toContain('var(--st-surface-3)');
    for (const t of ['--st-ok', '--st-green', '--st-danger', '--st-warn']) {
      expect(rule![1], `DESIGNED must not reach for ${t}`).not.toContain(t);
    }
  });

  it('the design table\'s red is the danger token', () => {
    const c = css('DesignFamilyPanel.svelte');
    expect(c).not.toContain('#e0444a');
    expect(c).toMatch(/tr\.failed td\.state \{ color: var\(--st-danger\); \}/);
  });

  it('a violet that meant "no certificate" stops claiming to mean provisional', () => {
    // `rgba(180,120,220,.10)` sat in provisional's hue family on a badge whose border and label
    // were both neutral. `--st-provisional-bg` was the near match and the wrong answer.
    const c = css('VerificationDetail.svelte');
    expect(c).not.toContain('rgba(180,120,220');
    expect(c).toMatch(/\.cert-none \{[^}]*background: var\(--st-surface-3\)/);
    expect(c, 'and it did NOT take the provisional surface')
      .not.toMatch(/\.cert-none \{[^}]*--st-provisional/);
    // The advice band did take the token it was always approximating.
    expect(c).not.toContain('rgba(255,102,0');
    expect(c).toMatch(/\.advice \{[^}]*var\(--st-warn-bg\)/);
  });

  it('and the two that stayed, stayed for a stated reason', () => {
    /**
     * Neither is debt anybody forgot.
     *
     * `SectionAdviceDialog` writes `rgba(0,0,0,0.6)` twice — a modal scrim and a drop shadow —
     * and `tokens.css` has no scrim token and no shadow token. Three other dialogs write the
     * same value, so it is a shared gap and not this file's to invent.
     *
     * `VerificationDetail`'s `.cert-ok` is `rgba(34,204,102,0.10)`, and there is no
     * `--st-ok-bg`. The contract deliberately shipped two status surfaces, not four.
     */
    expect(css('SectionAdviceDialog.svelte')).toContain('rgba(0,0,0,0.6)');
    expect(TOKENS, 'no scrim token exists to move to').not.toMatch(/--st-(scrim|overlay|shadow):/);

    expect(css('VerificationDetail.svelte')).toContain('rgba(34,204,102,0.10)');
    expect(TOKENS, 'and no ok surface either').not.toMatch(/--st-ok-bg:/);
  });
});
