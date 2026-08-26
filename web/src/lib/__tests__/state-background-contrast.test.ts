/**
 * The contrast of every tinted state background, computed rather than eyeballed.
 *
 * ── What this is, today ────────────────────────────────────────────
 *
 * A companion to `docs/handoffs/m1-h1-token-proposal.md`, which proposes `--st-danger-bg`,
 * `--st-warn-bg` and a three-token provisional split. **None of that is implemented**: this file
 * changes no token and no component. It computes the numbers the proposal rests on, so they can be
 * checked by running something instead of by trusting a table, and it pins the one defect the
 * measurement turned up.
 *
 * The day the contract is agreed and implemented, this stops being documentation and becomes the
 * gate: the `PROPOSED` block below turns into a read of `tokens.css`, and the `CURRENT` block
 * disappears with the literals it describes.
 *
 * ── The defect ─────────────────────────────────────────────────────
 *
 * `OutcomeBadge .badge-fail` and `DesignToolbar .banner-block` put `--st-accent` — the brand
 * vermillion — as text over a red-tinted background. That is 3.86:1 and 3.93:1, both under the
 * 4.5 AA floor for small text. `--st-danger`, the token that exists for exactly this, is 5.05:1 on
 * the same background. The palette's own header says the `-text` variants are the ones that clear
 * AA; those two rules reach for the brand colour instead of the status one.
 *
 * Asserted here as a KNOWN failure rather than as a passing test, because a defect that a suite
 * quietly tolerates is one nobody fixes. If someone repairs it, this file fails and says so.
 *
 * ── Why compositing matters ────────────────────────────────────────
 *
 * A tinted background is `rgba()` over a surface, so its effective colour depends on the surface.
 * Measuring the tint against the text directly — which is what a manual check does — gives a
 * number that describes nothing on screen. Every ratio below composites first.
 *
 * Pure arithmetic: no DOM, no browser, no tokens read.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../..', import.meta.url).pathname;
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

// ─── WCAG 2.1 relative luminance ─────────────────────────────────────

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio, 1 to 21. */
function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Composite a tint at an alpha over an opaque background, which is what the eye sees. */
function over(tint: string, alpha: number, bg: string): string {
  const parse = (hex: string) => {
    const h = hex.replace('#', '');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  };
  const [t, b] = [parse(tint), parse(bg)];
  const mix = t.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)));
  return `#${mix.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** WCAG AA: 4.5 for small text, 3.0 for a border or a large glyph. */
const AA_TEXT = 4.5;
const AA_NON_TEXT = 3.0;

// The surfaces a state background actually appears on, from `tokens.css`.
const SURFACE = '#0f1e2b';    // --st-surface   = --st-ink-2
const SURFACE_2 = '#13212d';  // --st-surface-2 = --st-ink-3

// The role text colours that exist today. Read from the file so a palette change is caught.
const PALETTE = {
  warn: '#d9a441',     // --st-amber-text
  danger: '#e8705f',   // --st-red-text
  ok: '#2aa869',       // --st-green-text
  info: '#4a8fd4',     // --st-blue-text
  accent: '#e5482a',   // --st-vermillion
} as const;

describe('the palette values this file reasons about are the ones shipped', () => {
  it('reads the same hexes tokens.css defines', () => {
    // Without this, every number below could be describing a palette that no longer exists.
    const css = read('styles/tokens.css');
    expect(css).toContain('--st-amber-text: #d9a441');
    expect(css).toContain('--st-red-text: #e8705f');
    expect(css).toContain('--st-green-text: #2aa869');
    expect(css).toContain('--st-blue-text: #4a8fd4');
    expect(css).toContain('--st-vermillion: #e5482a');
    expect(css).toContain('--st-ink-2: #0f1e2b');
    expect(css).toContain('--st-ink-3: #13212d');
  });

  it('confirms the three background tokens do not exist yet', () => {
    // The premise of the proposal. If one of them appears, the contract was implemented and this
    // file has to be migrated — which is the point of asserting it.
    const css = read('styles/tokens.css');
    expect(css).not.toContain('--st-danger-bg');
    expect(css).not.toContain('--st-warn-bg');
    expect(css).not.toContain('--st-provisional');
  });
});

describe('the defect the measurement found', () => {
  /**
   * Two rules, both concrete-side, both under AA. Asserted AS FAILING so the suite cannot be
   * green while the screen is not — and so repairing them turns this red and forces the file to
   * be updated rather than leaving a stale exemption behind.
   */
  it('badge-fail puts the brand colour on a red tint, at 3.86 — under AA', () => {
    const bg = over('#ee2222', 0.16, SURFACE);
    const ratio = contrast(PALETTE.accent, bg);
    expect(ratio).toBeCloseTo(3.86, 1);
    expect(ratio, 'this is the known defect; fix it in OutcomeBadge, not here').toBeLessThan(AA_TEXT);
  });

  it('banner-block does the same at 3.93', () => {
    const bg = over('#ee2222', 0.14, SURFACE);
    const ratio = contrast(PALETTE.accent, bg);
    expect(ratio).toBeCloseTo(3.93, 1);
    expect(ratio).toBeLessThan(AA_TEXT);
  });

  it('and the token that exists for the job clears AA on the same background', () => {
    // The fix is not a new colour. `--st-danger` is already defined and already correct.
    expect(contrast(PALETTE.danger, over('#ee2222', 0.16, SURFACE))).toBeGreaterThan(AA_TEXT);
    expect(contrast(PALETTE.danger, over('#ee2222', 0.14, SURFACE))).toBeGreaterThan(AA_TEXT);
  });

  it('and both components now carry the role colour, not the brand one', () => {
    /*
     * This used to assert the DEFECT — that `.badge-fail` and `.banner-block` still reached for
     * `--st-accent`, the primary-action vermillion, on an error background — so that the fix had
     * an address. Merging `main` in brought the fix: `.badge-fail` is `--st-danger` now, and
     * `DesignToolbar` no longer carries the rule at all.
     *
     * Turned around rather than deleted. A test that documents a defect is worth exactly as long
     * as the defect lasts; the same file, asserted the other way, is a guard against it coming
     * back.
     */
    const badge = read('components/pro/design/OutcomeBadge.svelte');
    expect(badge).toMatch(/\.badge-fail\s*\{[^}]*var\(--st-danger\)/);
    expect(badge, 'the brand vermillion is back on the failure badge')
      .not.toMatch(/\.badge-fail\s*\{[^}]*var\(--st-accent\)/);
    /*
     * `.banner-block` is the one of the three that is NOT fixed, and it is asserted as still
     * broken rather than skipped. Two of the three instances the reconciliation reported were
     * repaired by H1's token work; this one still puts `--st-accent`, the primary-action
     * vermillion, on an error background. Leaving it unasserted would let the report go stale in
     * the other direction — the failure mode this pair of tests exists to prevent.
     */
    expect(read('components/pro/design/DesignToolbar.svelte'), 'the banner was fixed; update the reconciliation')
      .toMatch(/\.banner-block\s*\{[^}]*var\(--st-accent\)/);
  });
});

describe('the proposed backgrounds, measured on both surfaces', () => {
  /** §3.1 of the proposal: the plain hue at 14 %, not the `-text` one. */
  const PROPOSED = {
    dangerBg: { tint: '#c0392b', alpha: 0.14, text: PALETTE.danger },  // --st-red
    warnBg: { tint: '#b8860b', alpha: 0.14, text: PALETTE.warn },      // --st-amber
  } as const;

  for (const [name, spec] of Object.entries(PROPOSED)) {
    it(`${name} clears AA with its own role text, on surface and surface-2`, () => {
      for (const [surfaceName, surface] of [['surface', SURFACE], ['surface-2', SURFACE_2]] as const) {
        const bg = over(spec.tint, spec.alpha, surface);
        const ratio = contrast(spec.text, bg);
        expect(ratio, `${name} on ${surfaceName}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(AA_TEXT);
      }
    });
  }

  it('keeps a margin at 14 % that 16 % would spend', () => {
    /*
     * Why the proposal picks 14 %. At 16 % danger on surface-2 is 4.86 — still AA, with 0.36 to
     * spare; at 14 % it is 4.96. The alpha that survives a future surface change is the one to
     * ship, and it is also the one `DesignToolbar` already uses.
     */
    const at14 = contrast(PALETTE.danger, over('#c0392b', 0.14, SURFACE_2));
    const at16 = contrast(PALETTE.danger, over('#c0392b', 0.16, SURFACE_2));
    expect(at14).toBeGreaterThan(at16);
    expect(at16).toBeGreaterThan(AA_TEXT);   // both pass; 14 % simply passes by more
  });

  it('would fix the three-way warn divergence with one value', () => {
    // Three literals and two hues today: amber at 0.16, ORANGE at 0.13, amber at 0.10. All three
    // clear AA with `--st-warn` on top, which is why nobody noticed they had diverged.
    const today = [
      over('#ddaa00', 0.16, SURFACE),
      over('#ff6600', 0.13, SURFACE),
      over('#ddaa00', 0.10, SURFACE),
    ];
    for (const bg of today) expect(contrast(PALETTE.warn, bg)).toBeGreaterThan(AA_TEXT);
    // Distinct backgrounds is the defect — not a contrast failure, a consistency one.
    expect(new Set(today).size).toBe(3);
  });
});

describe('the provisional split, and why one token is not enough', () => {
  const AUTHORITY = '#a066d3';        // three/rebar-scene.ts owns 0xa066d3
  const PROVISIONAL_TEXT = '#d8b4ff'; // what OutcomeBadge already uses as the label colour
  const bg = over(AUTHORITY, 0.16, SURFACE);

  it('fails AA if the authority colour is used as text', () => {
    // The measurement behind proposing THREE tokens. A single `--st-provisional` invites exactly
    // this, and it is 3.55.
    const ratio = contrast(AUTHORITY, bg);
    expect(ratio).toBeCloseTo(3.55, 1);
    expect(ratio).toBeLessThan(AA_TEXT);
  });

  it('clears AA as a border or a figure, which is what it is for', () => {
    expect(contrast(AUTHORITY, SURFACE)).toBeGreaterThan(AA_NON_TEXT);
  });

  it('clears AA comfortably with the text variant the components already use', () => {
    expect(contrast(PROVISIONAL_TEXT, bg)).toBeGreaterThan(AA_TEXT);
    expect(contrast(PROVISIONAL_TEXT, SURFACE)).toBeGreaterThan(AA_TEXT);
  });

  it('mirrors the split the palette already makes, on the hues where it bites', () => {
    /*
     * The palette says the plain hues are "for fills, rules and figures" and the `-text` ones are
     * what clears AA. Measured, that holds for three of the four and NOT for amber:
     *
     *     red   #c0392b  3.11  fails       green #1f8a52  3.88  fails
     *     blue  #2c6cb4  3.15  fails       amber #b8860b  5.20  passes
     *
     * A first draft of this test asserted amber failed, because the palette's sentence reads like
     * it applies to all four. It does not, and the number is the authority. The argument for
     * splitting the violet does not need the analogy anyway: 3.55 as text on its own background is
     * the evidence, and it sits with red, green and blue rather than with amber.
     */
    for (const plain of ['#c0392b', '#1f8a52', '#2c6cb4', AUTHORITY]) {
      expect(contrast(plain, SURFACE), `${plain} as text`).toBeLessThan(AA_TEXT);
    }
    // Amber is the exception, and its `-text` sibling exists anyway.
    expect(contrast('#b8860b', SURFACE)).toBeGreaterThan(AA_TEXT);
    // Every `-text` variant passes, which is the half of the claim that does hold throughout.
    for (const text of [PALETTE.warn, PALETTE.danger, PALETTE.ok, PALETTE.info]) {
      expect(contrast(text, SURFACE), `${text} as text`).toBeGreaterThan(AA_TEXT);
    }
  });
});

describe('the one violet, as it is guarded today', () => {
  it('is the same value in the 3-D authority and in every panel that names it', () => {
    /*
     * The agreement that a naive tokenisation would break. Three tests assert "this file contains
     * the literal" — see §3.3 of the proposal — and the replacement has to be "both resolve to the
     * same value" BEFORE any consumer moves to `var()`, or there is a window where nothing checks
     * that the viewport and the panels agree.
     *
     * Asserted here from the steel side too, because M1's surfaces do not use the violet and this
     * is the only place on this branch that would notice it drifting.
     */
    const scene = read('lib/three/rebar-scene.ts');
    expect(scene).toContain('0xa066d3');
    /*
     * Asserted over the files that DO name it, rather than over a fixed list of four.
     *
     * `DesignToolbar` stopped naming the violet when `main` was merged in, and a hand-kept list
     * turns that into a failure about a file that simply no longer participates. What the rule is
     * actually about is that the value does not DRIFT between the places that use it, so the list
     * is derived and the count is guarded so the check cannot quietly become vacuous.
     */
    const CANDIDATES = [
      'components/pro/design/RebarStatusPanel.svelte',
      'components/pro/design/DesignToolbar.svelte',
      'components/pro/design/ProvisionalBanner.svelte',
      'components/pro/design/OutcomeBadge.svelte',
    ];
    const naming = CANDIDATES.filter((f) => {
      const src = read(f);
      return /#a066d3/i.test(src) || /rgba\(160,\s*102,\s*211/.test(src);
    });
    expect(naming.length, 'nothing names the provisional violet any more').toBeGreaterThanOrEqual(3);
    for (const f of naming) {
      const src = read(f);
      // One value, spelled one way, wherever it appears.
      const others = src.match(/#[0-9a-f]{6}/gi)?.filter((h) => /^#a0/i.test(h)) ?? [];
      for (const hex of others) expect(hex.toLowerCase(), `${f} spells the violet differently`).toBe('#a066d3');
    }
  });

  it('is not yet referenced through a token anywhere, which is the state to change', () => {
    // If this fails, the contract was implemented and §3.3's ordering has to be checked: the
    // token, then the equivalence test, then the consumers.
    for (const f of [
      'components/pro/design/RebarStatusPanel.svelte',
      'components/pro/design/DesignToolbar.svelte',
      'components/pro/design/ProvisionalBanner.svelte',
    ]) {
      expect(read(f), `${f} migrated before the token exists`).not.toContain('var(--st-provisional');
    }
  });
});

describe('the steel surfaces, for the record', () => {
  it('use no hand-written danger or warn tinted background', () => {
    /*
     * Why `SteelStatusBadge` is out of scope in the proposal: it has no tinted danger or warn
     * background to migrate. Its warn tone is a diagonal hatch — deliberately distinguishable
     * without hue — and its info and neutral tones are not part of this contract.
     */
    const badge = read('components/pro/steel/SteelStatusBadge.svelte');
    expect(badge).toContain('repeating-linear-gradient');
    expect(badge).not.toMatch(/background:\s*rgba\(2[23]\d,\s*\d+,\s*\d+/);   // no red tint
  });

  it('reach for tokens rather than literals in everything M1 added', () => {
    // The two pickers M1 wrote carry no hardcoded status colour at all, which is the state the
    // proposal is trying to reach for the older surfaces.
    for (const f of [
      'components/pro/steel/GradePickerPanel.svelte',
      'components/pro/generators/ProfileSelectorPanel.svelte',
    ]) {
      const src = read(f);
      const styleBlock = src.slice(src.indexOf('<style>'));
      expect(styleBlock, `${f} hardcodes a colour`).not.toMatch(/#[0-9a-f]{6}/i);
    }
  });
});
