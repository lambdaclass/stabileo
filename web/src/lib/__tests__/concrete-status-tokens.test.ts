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
 *
 * **A dead fallback that looks like a token.** `RebarStatusPanel` had six calls of the shape
 * `var(--text-muted, #8b93a3)`. `--text-muted` IS defined — as an alias on `.workspace` in
 * `RebarWorkspace.svelte` — so the literal never painted anything, and
 * `design-tokens-resolve.test.ts` cannot see it either way: it checks that referenced `--st-*`
 * tokens exist and this is not one. The value was correct and the form was a trap, because it
 * only stays correct while the panel renders inside that one ancestor.
 *
 * ── And the part that stays literal on purpose ─────────────────────
 *
 * The seven state dots are NOT debt. Four are mirrored by value in `three/rebar-scene.ts`,
 * which feeds hex numbers to Three.js materials and cannot read a custom property. The mirror
 * is asserted here in both directions, which `viewer-design-system.test.ts` did for one of the
 * four.
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
  const h = hex.replace('#', '');
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
   *
   * `viewer-design-system.test.ts` requires the opposite for four names — `--text`,
   * `--text-muted`, `--st-border`, `--panel` — because those are declared only on
   * `.workspace`, so a viewer panel rendered outside it would lose them. Both rules hold at
   * once by not reaching for those four: `--st-text`, `--st-text-2` and `--st-hair-strong` are
   * on `:root` and cannot fail, which is a stronger guarantee than a fallback is.
   */
  const PANELS = ['RebarStatusPanel.svelte', 'FootingMatPhysicalPanel.svelte'];

  /**
   * Only two of the four are genuinely undefined at `:root`.
   *
   * `--text`, `--text-muted` and `--panel` exist nowhere but `.workspace`, so any panel using
   * them is betting on an ancestor. `--st-border` is different: it IS defined at `:root`, and
   * `.workspace` merely SHADOWS it with `--st-hair-strong`. So a panel outside the overlay may
   * use it freely — `FootingMatPhysicalPanel` does, for its card and cell borders — while one
   * inside must not, because there it silently means the stronger hairline.
   */
  const UNDEFINED_AT_ROOT = ['--text', '--text-muted', '--panel'];
  const SHADOWED_IN_OVERLAY = ['--st-border'];
  const VIEWER = new Set(['RebarStatusPanel.svelte']);

  it('neither of the two panels this pass tokenised carries a fallback literal', () => {
    const bad: string[] = [];
    for (const f of PANELS) {
      const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/var\(\s*--[a-z0-9-]+\s*,\s*(#[0-9a-fA-F]{3,8}|rgba?\()/g)) {
        bad.push(`${f}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('and neither depends on a property that only the overlay defines', () => {
    // Which is what makes dropping the fallbacks safe rather than a rule broken in the viewer's
    // favour: what is left cannot fail to resolve.
    for (const f of PANELS) {
      const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
      const forbidden = VIEWER.has(f)
        ? [...UNDEFINED_AT_ROOT, ...SHADOWED_IN_OVERLAY]
        : UNDEFINED_AT_ROOT;
      for (const name of forbidden) {
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

describe('the rebar state palette is a contract with the 3-D scene, not debt', () => {
  const panel = () => read('RebarStatusPanel.svelte');
  const scene = () => readFileSync(
    new URL('../three/rebar-scene.ts', import.meta.url).pathname, 'utf8');

  /** state class in the panel → the name Three.js gives the same colour. */
  const MIRRORED = [
    ['.st-failed', 'conflicted', 'e0444a'],
    ['.st-refused', 'unreinforced', 'd4762a'],
    ['.st-provisional', 'provisional', 'a066d3'],
  ] as const;

  it('every mirrored state holds the same value on both sides', () => {
    const p = panel();
    const s = scene();
    for (const [cls, sceneKey, hex] of MIRRORED) {
      expect(p, `${cls} in the panel`).toMatch(
        new RegExp(`${cls.replace('.', '\\.')} \\.dot \\{ background: #${hex};`));
      expect(s, `${sceneKey} in the scene`).toMatch(
        new RegExp(`${sceneKey}:\\s*0x${hex}`));
    }
  });

  it('the selected element agrees with the viewport highlight too', () => {
    // Not a state, but the same class of contract: `0xffd400` paints the selection in the
    // scene, so the panel row cannot become `--st-selected` (vermillion) without the list and
    // the picture disagreeing about which member is selected.
    expect(panel()).toContain('#ffd400');
    expect(scene()).toMatch(/selected:\s*0xffd400/);
    expect(panel(), 'and must not switch to the generic selection token')
      .not.toMatch(/\.element\.selected[^}]*var\(--st-selected\)/);
  });

  it('the three panel-only states have no token to go to, and that is why they stay', () => {
    /**
     * `unsupported`, `designed-not-modelled` and `not-evaluated` are not in the scene. They
     * stay literal because `tokens.css` offers exactly two status hues, `--st-warn` and
     * `--st-danger`, and `--st-danger` is already `failed`. Sending two of these to `--st-warn`
     * would merge states the panel's own comment forbids merging: "One colour per state, and
     * never two states sharing one."
     *
     * This asserts the PREMISE, so the day a violet or a second amber is added to the token
     * system this test fails and points at the work.
     */
    const statusHues = [...TOKENS.matchAll(/--st-(warn|danger|ok|info):/g)].map((m) => m[1]);
    expect(new Set(statusHues), 'the status vocabulary is still four wide')
      .toEqual(new Set(['warn', 'danger', 'ok', 'info']));
    expect(TOKENS, 'no violet exists yet').not.toMatch(/--st-(violet|purple|provisional):/);
    // And the panel still writes them out, rather than having quietly picked a near-match.
    for (const hex of ['#b06ad6', '#d9c04a', '#8b93a3']) {
      expect(panel()).toContain(hex);
    }
  });

  it('the state palette is documented in place as frozen, not merely left behind', () => {
    // A literal with no explanation is indistinguishable from one nobody got to.
    const p = panel();
    expect(p).toMatch(/Three\.js owns them|mirrored BY VALUE/);
  });
});
