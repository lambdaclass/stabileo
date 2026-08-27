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

  it('the three panel-only states still have no token to go to', () => {
    /**
     * This assertion has already earned its keep: it used to read "no violet exists yet" and it
     * FAILED the moment `--st-provisional` was added, which is exactly what it was written to do.
     * So the premise is restated rather than relaxed.
     *
     * `unsupported`, `designed-not-modelled` and `not-evaluated` are not in the scene and still
     * have nowhere to go. The vocabulary is now five wide, and every one of the five is spoken
     * for: `--st-danger` is `failed`, `--st-warn` and `--st-ok` are taken, `--st-info` is not a
     * state here, and `--st-provisional` names a DIFFERENT violet — `#a066d3` for `provisional`,
     * not the `#b06ad6` this panel paints `unsupported` with. Two violets, two states.
     */
    const statusHues = [...TOKENS.matchAll(/--st-(warn|danger|ok|info|provisional):/g)]
      .map((m) => m[1]);
    expect(new Set(statusHues), 'the status vocabulary is now five wide')
      .toEqual(new Set(['warn', 'danger', 'ok', 'info', 'provisional']));

    // And the violet that DOES exist is not the one `unsupported` needs.
    const provisional = TOKENS.match(/--st-provisional:\s*(#[0-9a-fA-F]{6})/);
    expect(provisional, '--st-provisional must be defined').not.toBeNull();
    expect(provisional![1].toLowerCase(), 'the token is the scene provisional violet')
      .toBe('#a066d3');
    expect(panel(), 'and unsupported keeps its own, which no token names')
      .toContain('#b06ad6');

    // The three still written out, rather than having quietly picked a near-match.
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

/**
 * The same mirror, in the two other panels that hold it.
 *
 * `RebarStatusPanel` was not the only surface naming the scene's colours by value.
 * `RebarScenePanel` repeats the state dots plus the conflicted count and the unreinforced rule,
 * and `ConflictInspector` fills its warning band with the conflicted hue. Asserted here because
 * the last pass proved the contract for one file and the ceiling map alone cannot say WHICH of a
 * file's remaining literals are the contract and which are simply left.
 */
describe('the scene mirror holds across every panel that repeats it', () => {
  const scene = () => readFileSync(
    new URL('../three/rebar-scene.ts', import.meta.url).pathname, 'utf8');

  it('RebarScenePanel keeps the six dots, the conflicted count and the unreinforced rule', () => {
    const p = read('RebarScenePanel.svelte');
    for (const [cls, hex] of [
      ['.dot.failed', 'e0444a'], ['.dot.refused', 'd4762a'],
      ['.dot.unsupported', 'b06ad6'], ['.dot.designed-not-modelled', 'd9c04a'],
      ['.dot.not-evaluated', '8b93a3'], ['.dot.modelled', '4caf72'],
    ] as const) {
      expect(p, cls).toContain(`${cls} { background: #${hex}; }`);
    }
    // `.warn` is the CONFLICTED bar count, so it is the conflicted hue and not `--st-danger`,
    // which is a different red and would put two reds for one meaning in one panel.
    expect(p).toContain('.warn { color: #e0444a; }');
    expect(p).toMatch(/\.unreinforced \{\s*border-left: 3px solid #d4762a;/);
    expect(scene()).toMatch(/conflicted:\s*0xe0444a/);
    expect(scene()).toMatch(/unreinforced:\s*0xd4762a/);
  });

  it('ConflictInspector keeps the band fill and rule, and only those', () => {
    const css = read('ConflictInspector.svelte').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).toContain('border-left: 2px solid #e0444a');
    // The 0.14 fill is that same hue written as an rgba, so the two move together or not at all.
    expect(css).toContain('rgba(224, 68, 74, 0.14)');
    // And the pinks that were NOT the scene's are gone.
    for (const gone of ['#ffb0b6', '#ff6b74', '#ffd0d3']) {
      expect(css, `${gone} was a private pink`).not.toContain(gone);
    }
  });

  it('the two-level conflict header still has two levels', () => {
    // The whole point of the base going to `--st-text` rather than to `--st-danger`: had both
    // taken a status hue, interpenetration and a spacing shortfall would look the same.
    const css = read('ConflictInspector.svelte').replace(/\/\*[\s\S]*?\*\//g, '');
    const base = css.match(/\.head \{([^}]*)\}/);
    expect(base![1]).toContain('var(--st-text)');
    expect(css).toMatch(/\.head\.overlap strong \{ color: var\(--st-danger\); \}/);
  });
});

/**
 * The amber pair moved as a pair.
 *
 * `SelectionDetails` carried `#f2ddc6`/`#ffbe7a` under the comment "The same amber the workspace
 * banner uses. One colour, one meaning", and `TorsionBanner` carried the identical two. Doing one
 * of them would have broken exactly the equality that comment asserts, so this holds them equal
 * through the tokens instead of through two literals that happen to match.
 */
describe('the torsion amber is one colour with one meaning', () => {
  const FILES = ['SelectionDetails.svelte', 'TorsionBanner.svelte'];

  it('neither file carries the old pair', () => {
    for (const f of FILES) {
      const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
      for (const gone of ['#f2ddc6', '#ffbe7a']) {
        expect(css, `${f}: ${gone}`).not.toContain(gone);
      }
    }
  });

  it('and both reach for the same two tokens', () => {
    for (const f of FILES) {
      const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
      expect(css, `${f} body text`).toMatch(/color: var\(--st-text\)/);
      expect(css, `${f} emphasis`).toMatch(/strong \{ color: var\(--st-warn\)/);
    }
  });

  it('the banner no longer borrows the unreinforced orange for a torsion notice', () => {
    // `#d4762a` is `unreinforced: 0xd4762a`. A torsion advisory and an unreinforced bar are
    // unrelated states that happened to share an orange; only one of them is a scene contract.
    const css = read('TorsionBanner.svelte').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toContain('#d4762a');
    expect(css).not.toContain('rgba(212, 118, 42');
    expect(css).toMatch(/border-bottom: 1px solid var\(--st-warn\)/);
  });
});

/** Every role this pass introduced clears AA where it carries text. */
describe('the new roles are legible', () => {
  it('every role that carries TEXT clears 4.5:1 on the ground it sits on', () => {
    const cases: Array<[string, string, string]> = [
      // `.link` and the torsion emphasis sit on the panel, which is `--st-surface` — inside the
      // overlay `--panel` aliases to exactly that. Not `--st-surface-3`, which is the hover
      // well and a different measurement; see the next test.
      ['--st-interactive', '--st-surface', 'a link'],
      ['--st-warn', '--st-surface', 'the torsion emphasis'],
      ['--st-danger', '--st-surface', 'the overlap emphasis'],
      ['--st-text-on-accent', '--st-blue', 'the filled open-workspace button'],
    ];
    for (const [fg, bg, what] of cases) {
      expect(contrast(resolveToken(fg), resolveToken(bg)), `${what}: ${fg} on ${bg}`)
        .toBeGreaterThanOrEqual(4.5);
    }
  });

  it('and the hover border is measured as a border, which is a different bar', () => {
    /**
     * `--st-interactive` on `--st-surface-3` is **4.36:1** — under AA for text, over the 3:1
     * WCAG 2.1 §1.4.11 asks of a non-text boundary. The three panels use it only as
     * `border-color`, with `--st-text` beside it for the words, so this is the right threshold
     * and not a lowered one.
     *
     * Recorded because the literal it replaces, `#6fa8ff`, measured 6.17:1. Real headroom was
     * given up for system membership, which is a trade worth being able to see rather than
     * discover.
     */
    const asBorder = contrast(resolveToken('--st-interactive'), resolveToken('--st-surface-3'));
    expect(asBorder, 'clears the non-text bar').toBeGreaterThanOrEqual(3);
    expect(asBorder, 'and does NOT clear the text bar, so it must stay a border')
      .toBeLessThan(4.5);

    // So every hover rule that takes it pairs it with `--st-text` for the label.
    for (const f of ['ConflictInspector.svelte', 'SelectionDetails.svelte']) {
      const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
      expect(css, `${f} hover`).toMatch(
        /button:hover \{ border-color: var\(--st-interactive\); color: var\(--st-text\); \}/);
    }
  });

  it('the filled button did not silently change hue', () => {
    // `--st-accent` is the documented "primary action" token AND the fill the application uses
    // for destructive buttons. `--st-blue` is what the literal already was.
    expect(resolveToken('--st-blue')).toBe('#2c6cb4');
    const css = read('RebarScenePanel.svelte').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).toMatch(/\.open \{[^}]*background: var\(--st-blue\)/);
    expect(css, 'and did not take the danger fill').not.toMatch(
      /\.open \{[^}]*var\(--st-accent\)/);
  });
});

/**
 * The fallbacks that must survive, listed rather than inferred.
 *
 * `RebarScenePanel` mounts in `RebarWorkspace` AND in `DocumentsSection`. Outside the overlay
 * `--text-muted` is not defined at all, so its `#8b93a3` is the value that paints — the fallback
 * is load-bearing, not residue. That is why this pass left every one of them alone.
 */
describe('the overlay fallbacks are intact', () => {
  const WITH_FALLBACKS: Record<string, number> = {
    'RebarScenePanel.svelte': 3,
    'ConflictInspector.svelte': 3,
    'SelectionDetails.svelte': 5,
  };

  it('each panel keeps exactly the fallbacks it had', () => {
    for (const [f, n] of Object.entries(WITH_FALLBACKS)) {
      const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
      const calls = css.match(/var\(--(?:text|text-muted|st-border|panel)\b[^)]*\)/g) ?? [];
      expect(calls.length, `${f} fallback call count`).toBe(n);
      for (const c of calls) {
        expect(c, `${f}: ${c} must keep its fallback`).toMatch(/,\s*[^)]+\)$/);
      }
    }
  });

  it('and RebarScenePanel really does render outside the overlay', () => {
    // The premise of the line above. If this stops being true the fallbacks become dead weight
    // and the panel can join the others on `--st-text-2`.
    const docs = read('DocumentsSection.svelte');
    expect(docs, 'DocumentsSection mounts the scene panel').toContain('RebarScenePanel');
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

  it('the design table\'s red was a coincidence, not the scene contract', () => {
    /*
     * `#e0444a` in `DesignFamilyPanel` is also `conflicted: 0xe0444a`. The value matched; the
     * meaning did not. This is the design RESULTS table and the 3-D viewer paints nothing in it,
     * so the token applies here while the identical literal stays frozen in the three panels the
     * scene really does mirror.
     */
    const c = css('DesignFamilyPanel.svelte');
    expect(c).not.toContain('#e0444a');
    expect(c).toMatch(/tr\.failed td\.state \{ color: var\(--st-danger\); \}/);
    // And the frozen ones are still frozen, which is what makes the distinction real.
    expect(read('RebarStatusPanel.svelte')).toContain('#e0444a');
    expect(read('ConflictInspector.svelte')).toContain('#e0444a');
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
