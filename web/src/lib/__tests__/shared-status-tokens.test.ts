/**
 * The shared status-surface contract: five tokens, and the rules that keep them honest.
 *
 * ── What this is ───────────────────────────────────────────────────
 *
 * `tokens.css` had four status hues, all of them for text and trazo, and no status SURFACE. So
 * every component that needed a band mixed its own — `#5c1a1a`/`#7a5b00` in the footing mat,
 * `rgba(255,102,0,.13)` in the toolbar, `rgba(221,170,0,.16)` in the outcome badge — and none of
 * them was `--st-amber` or `--st-red`. Provisional had it worse: two surfaces named a violet by
 * value while a third sent the same state to `--st-warn`, so one state had two visual meanings.
 *
 * H1 owns the physical implementation; M1 supplied the measured starting values. This file is the
 * gate that makes the contract checkable rather than agreed.
 *
 * ── The four rules ─────────────────────────────────────────────────
 *
 *   1. text on a status surface ≥ 4.5:1, over EVERY ground the surface can sit on
 *   2. a hue used as a dot, rule or border ≥ 3:1 (WCAG 2.1 §1.4.11)
 *   3. `--st-provisional` equals the value Three.js paints, compared as a resolved colour
 *   4. no component writes a tinted background in a hue that now has a token, unless the
 *      exemption is declared here with its reason
 *
 * Rule 1 is measured on the COMPOSITE. A `rgba(…, 0.14)` fill has no colour of its own — it is
 * whatever it lands on — so contrast against the raw rgba would be arithmetic about nothing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const TOKENS = readFileSync(
  new URL('../../styles/tokens.css', import.meta.url).pathname, 'utf8');
const DESIGN = new URL('../../components/pro/design', import.meta.url).pathname;
const read = (f: string) => readFileSync(join(DESIGN, f), 'utf8');

/** Follow a token through its `var()` aliases until a literal falls out. */
function resolveToken(name: string, depth = 0): string {
  expect(depth, `${name} does not resolve to a literal`).toBeLessThan(8);
  const m = TOKENS.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  expect(m, `${name} must be defined in tokens.css`).not.toBeNull();
  const value = m![1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
  const alias = value.match(/^var\((--[a-z0-9-]+)\)$/);
  return alias ? resolveToken(alias[1], depth + 1) : value;
}

type RGB = [number, number, number];

function rgb(colour: string): RGB {
  const hex = colour.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
  }
  const f = colour.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  expect(f, `cannot read ${colour}`).not.toBeNull();
  return [1, 2, 3].map((i) => Number(f![i])) as RGB;
}

const alphaOf = (colour: string): number => {
  const m = colour.match(/rgba\([^)]*,\s*([\d.]+)\s*\)/);
  return m ? Number(m[1]) : 1;
};

/** Flatten a translucent colour onto an opaque one, as the compositor does. */
const composite = (fg: string, bg: string): RGB => {
  const a = alphaOf(fg);
  const [f, b] = [rgb(fg), rgb(bg)];
  return f.map((v, i) => Math.round(v * a + b[i] * (1 - a))) as RGB;
};

const luminance = ([r, g, b]: RGB): number =>
  [r, g, b]
    .map((c) => c / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((s, c, i) => s + [0.2126, 0.7152, 0.0722][i] * c, 0);

const contrast = (a: RGB, b: RGB): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/** Every opaque ground a panel can sit on. A surface must work on all of them, not the best. */
const GROUNDS = ['--st-bg', '--st-surface', '--st-surface-2', '--st-surface-3'] as const;

/** Each status surface, with the text tone that belongs to it. */
const SURFACES = [
  { bg: '--st-danger-bg', tone: '--st-danger' },
  { bg: '--st-warn-bg', tone: '--st-warn' },
  { bg: '--st-provisional-bg', tone: '--st-provisional-text' },
] as const;

describe('the five tokens exist and resolve to literals', () => {
  it('each one is defined', () => {
    for (const n of [
      '--st-danger-bg', '--st-warn-bg',
      '--st-provisional', '--st-provisional-text', '--st-provisional-bg',
    ]) {
      expect(() => resolveToken(n), n).not.toThrow();
      expect(resolveToken(n), n).toMatch(/^(#[0-9a-fA-F]{3,6}|rgba?\()/);
    }
  });

  it('the two surfaces are derived from the palette, not invented', () => {
    // `--st-red` and `--st-amber` at `--st-vermillion-dim`'s alpha. Asserted so a later edit
    // cannot quietly drift the surface off the hue its `-text` twin belongs to.
    expect(rgb(resolveToken('--st-danger-bg'))).toEqual(rgb(resolveToken('--st-red')));
    expect(rgb(resolveToken('--st-warn-bg'))).toEqual(rgb(resolveToken('--st-amber')));
    expect(alphaOf(resolveToken('--st-danger-bg'))).toBe(0.14);
    expect(alphaOf(resolveToken('--st-warn-bg'))).toBe(0.14);
  });

  it('and provisional-bg keeps the alpha the two correct surfaces already shipped', () => {
    // 0.16, not 0.14: `ProvisionalBanner` and `OutcomeBadge`'s `.badge-provisional` were already
    // right, and matching them means adopting the token changes no pixel there.
    expect(alphaOf(resolveToken('--st-provisional-bg'))).toBe(0.16);
    expect(rgb(resolveToken('--st-provisional-bg'))).toEqual(rgb(resolveToken('--st-provisional')));
  });
});

describe('rule 1 — text on a status surface clears 4.5:1 on every ground', () => {
  for (const { bg, tone } of SURFACES) {
    for (const ground of GROUNDS) {
      it(`${bg} over ${ground}`, () => {
        const surface = composite(resolveToken(bg), resolveToken(ground));
        for (const fg of ['--st-text', '--st-text-2', tone]) {
          expect(contrast(rgb(resolveToken(fg)), surface), `${fg} on ${bg} over ${ground}`)
            .toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }

  it('and the tightest of the thirty-six is recorded, so a drift is visible', () => {
    /**
     * `--st-danger` on `--st-danger-bg` over `--st-surface-3` is the worst case: **4.54**. It
     * passes with 0.04 to spare, which is not a margin. Anything that darkens `--st-surface-3`
     * or lightens `--st-red` breaks it, and this assertion is what will say so.
     */
    const worst = contrast(
      rgb(resolveToken('--st-danger')),
      composite(resolveToken('--st-danger-bg'), resolveToken('--st-surface-3')));
    expect(worst).toBeGreaterThanOrEqual(4.5);
    expect(worst, 'still the tightest pair in the set').toBeLessThan(4.7);
  });
});

describe('rule 2 — a hue used as a dot, rule or border clears 3:1', () => {
  it('every status hue does, on every ground', () => {
    for (const t of ['--st-danger', '--st-warn', '--st-ok', '--st-info',
      '--st-provisional', '--st-interactive']) {
      for (const g of GROUNDS) {
        expect(contrast(rgb(resolveToken(t)), rgb(resolveToken(g))), `${t} on ${g}`)
          .toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('`--st-provisional` clears 3:1 and does NOT clear 4.5:1, which is why -text exists', () => {
    /**
     * The measurement behind the two-strength split, and the one qualification to the product
     * decision to align provisional with the scene's violet.
     *
     * `#a066d3` is 4.30 on `--st-surface` and 3.77 on `--st-surface-3`. Correct for a dot, where
     * area carries the meaning; wrong for a 0.7rem label. Recommending the flat value for every
     * role would have shipped a legibility regression under the banner of consistency.
     */
    const v = rgb(resolveToken('--st-provisional'));
    const onSurface = contrast(v, rgb(resolveToken('--st-surface')));
    expect(onSurface, 'fine as a dot').toBeGreaterThanOrEqual(3);
    expect(onSurface, 'not fine as small text').toBeLessThan(4.5);
    // And the label variant is, comfortably, on the surface its own band composites to.
    expect(contrast(
      rgb(resolveToken('--st-provisional-text')),
      composite(resolveToken('--st-provisional-bg'), resolveToken('--st-surface'))))
      .toBeGreaterThan(7);
  });

  it('the 3:1 bar is NOT applied to the tint itself, and the reason is arithmetic', () => {
    /**
     * A 14 % fill against the ground it sits on measures about **1.1:1**. That is not a defect
     * and no alpha fixes it: a tint that reached 3:1 against its own ground would not be a tint.
     * §1.4.11 is about the boundary of a control and about meaningful graphics — the border and
     * the dot, both covered above — while what a band must guarantee is the legibility of the
     * text on it, which is rule 1.
     *
     * Asserted rather than commented, so nobody "fixes" the surfaces by darkening them.
     */
    for (const { bg } of SURFACES) {
      const ratio = contrast(
        composite(resolveToken(bg), resolveToken('--st-surface')),
        rgb(resolveToken('--st-surface')));
      expect(ratio, `${bg} is a tint, by construction`).toBeLessThan(1.5);
    }
  });
});

describe('rule 3 — provisional equals what Three.js paints', () => {
  const scene = () => readFileSync(
    new URL('../three/rebar-scene.ts', import.meta.url).pathname, 'utf8');

  it('the token and the material agree, compared as a colour', () => {
    /**
     * By VALUE, not by literal text. `0xa066d3`, `0xA066D3` and `#a066d3` are one colour written
     * three ways, and a test that string-matched would fail on a case change and pass on
     * `#a166d3`. So both sides are parsed to a triplet.
     */
    const m = scene().match(/provisional:\s*0x([0-9a-fA-F]{6})/);
    expect(m, 'rebar-scene.ts must declare a provisional colour').not.toBeNull();
    expect(rgb(resolveToken('--st-provisional')), 'token === scene')
      .toEqual(rgb(`#${m![1]}`));
  });

  it('and the dot stays literal, because a var() and an 0x can drift in silence', () => {
    // The token exists and the panel still writes the hex. Deliberate: the mirror is only safe
    // while something compares the two, and that something is the test above.
    expect(read('RebarStatusPanel.svelte')).toContain('#a066d3');
    /*
     * `RebarScenePanel` is NOT checked here, and the reason is worth writing down: it lists six
     * states, not seven — failed, unsupported, refused, designed-not-modelled, not-evaluated,
     * modelled — and provisional is not one of them. Asserting the violet there would have
     * demanded a dot that does not exist.
     */
    expect(read('RebarScenePanel.svelte'), 'six dots, and provisional is not among them')
      .not.toContain('.dot.provisional');
  });
});

/**
 * Rule 4 — nobody re-mixes a surface that now has a token.
 *
 * ── Why hue, and not colour distance ───────────────────────────────
 *
 * The first version of this compared each tint's composite against each token's composite and
 * flagged anything closer than a threshold. It cannot work: `rgba(238,34,34,.16)` — a red that
 * IS `--st-danger-bg` — sits 11.4 away, and `rgba(255,255,255,.08)` — plain white, no status hue
 * at all — sits 12.3. No threshold separates them.
 *
 * Hue does, with a gap nothing lands in: every true equivalent is within **18.4°** of a token's
 * hue and the nearest false positive is **54.4°** away. Achromatic fills — scrims, white hovers,
 * slate wells — are excluded by saturation before hue is even considered, because the hue of a
 * grey is noise.
 */
describe('rule 4 — no component re-mixes a tinted status surface', () => {
  const TOKEN_HUES = [
    ['--st-danger-bg', 6], ['--st-warn-bg', 43], ['--st-provisional-bg', 272],
  ] as const;
  const HUE_TOLERANCE = 30;   // true equivalents ≤ 18.4°, nearest false positive 54.4°
  const CHROMA_FLOOR = 0.25;  // below this it is a grey and has no status hue to match

  /**
   * The declared exemptions.
   *
   * Two kinds, and the difference matters. A CONTRACT exemption is permanent: the value belongs
   * to `three/rebar-scene.ts` and a token would let the picture and the words drift. A PENDING
   * one is debt with an owner — it stays until the file's own migration, and the list shrinking
   * is the record of that happening.
   */
  const EXEMPT: Record<string, string> = {
    // ── contract: the 3-D scene owns these values ──
    'RebarStatusPanel.svelte|rgba(255,212,0,0.16)':
      'contract — `selected: 0xffd400`. The list and the viewport must agree on which member is selected.',
    'ConflictInspector.svelte|rgba(224,68,74,0.14)':
      'contract — the 0.14 fill of `conflicted: 0xe0444a`, which its own border also names.',

    // ── pending: has a token, not yet migrated (commit 3) ──
    //    Seven entries left this list when commit 2 migrated `OutcomeBadge`,
    //    `ProvisionalBanner` and `DesignToolbar`. The stale-exemption assertion below is what
    //    forced them out: it fails on a reason for a literal that is gone, so the register
    //    shrinks with the work instead of outliving it.
    'OutcomeBadge.svelte|rgba(180,120,220,0.16)':
      'open — `.badge-outcome-SEARCH_EXHAUSTED`. A violet in provisional\'s hue family for a '
      + 'state that is NOT provisional, on a badge whose border and label are already neutral. '
      + '`--st-provisional-bg` would be the near match and the wrong answer; there is no token '
      + 'for what it means. The last one standing.',

    // ── out of scope: an affordance rather than a status band ──
    'DesignToolbar.svelte|rgba(217,164,65,0.12)':
      'not a band — the diagnostics command\'s own fill, with a 0.22 hover level above it.',
    'DesignToolbar.svelte|rgba(217,164,65,0.22)': 'not a band — the hover level of the above.',
    'BatchEditDialog.svelte|rgba(255,204,102,0.08)':
      'not a band — an inline note inside a dialog, bordered with --st-hair-strong.',
  };

  /** Every translucent background in the design surface, with its hue. */
  function tints() {
    const out: Array<{ file: string; literal: string; hue: number; sat: number }> = [];
    for (const f of readdirSync(DESIGN).filter((n) => n.endsWith('.svelte'))) {
      const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
      const re = /background(?:-color)?:\s*rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/g;
      for (const m of css.matchAll(re)) {
        const [r, g, b, a] = [1, 2, 3, 4].map((i) => Number(m[i]));
        if (a >= 0.95) continue;
        const [mx, mn] = [Math.max(r, g, b), Math.min(r, g, b)];
        const l = (mx + mn) / 2 / 255;
        const sat = mx === mn ? 0 : (mx - mn) / 255 / (1 - Math.abs(2 * l - 1));
        let hue = 0;
        if (mx !== mn) {
          const d = mx - mn;
          hue = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g
            ? (b - r) / d + 2 : (r - g) / d + 4;
          hue *= 60;
        }
        out.push({ file: f, literal: `rgba(${r},${g},${b},${a})`, hue, sat });
      }
    }
    return out;
  }

  it('every tint in a token hue is either migrated or declared', () => {
    const undeclared: string[] = [];
    for (const t of tints()) {
      if (t.sat < CHROMA_FLOOR) continue;
      const near = TOKEN_HUES.find(([, h]) =>
        Math.min(Math.abs(t.hue - h), 360 - Math.abs(t.hue - h)) <= HUE_TOLERANCE);
      if (!near) continue;
      const key = `${t.file}|${t.literal}`;
      if (!(key in EXEMPT)) undeclared.push(`${key} → ${near[0]}`);
    }
    expect(undeclared, 'a tinted status surface with a token and no exemption').toEqual([]);
  });

  it('and the list carries no exemption for a literal that is gone', () => {
    // The half that makes the list shrink instead of rot: once a file migrates, its entry has to
    // come out, and this is what says so.
    const present = new Set(tints().map((t) => `${t.file}|${t.literal}`));
    const stale = Object.keys(EXEMPT).filter((k) => !present.has(k));
    expect(stale, 'exemptions for literals no longer in the source').toEqual([]);
  });

  it('the contract exemptions are the two the scene owns, and no more', () => {
    // A `pending` entry is debt. A `contract` entry is permanent, so the set of them is worth
    // pinning: adding a third means someone decided a new value belongs to Three.js.
    const contract = Object.entries(EXEMPT)
      .filter(([, why]) => why.startsWith('contract'))
      .map(([k]) => k.split('|')[0])
      .sort();
    expect(contract).toEqual(['ConflictInspector.svelte', 'RebarStatusPanel.svelte']);
  });

  it('the hue gap the rule depends on is real, not assumed', () => {
    // If a future colour lands between the tolerance and the nearest false positive, this rule
    // stops separating and someone has to think again rather than trust it.
    const hues = tints().filter((t) => t.sat >= CHROMA_FLOOR).map((t) => Math.min(
      ...TOKEN_HUES.map(([, h]) => Math.min(Math.abs(t.hue - h), 360 - Math.abs(t.hue - h)))));
    const inside = hues.filter((d) => d <= HUE_TOLERANCE);
    const outside = hues.filter((d) => d > HUE_TOLERANCE);
    expect(Math.max(...inside), 'the furthest true equivalent').toBeLessThan(20);
    expect(Math.min(...outside), 'the nearest false positive').toBeGreaterThan(50);
  });
});
