/**
 * The concrete surface's secondary copy clears AA, measured on the ground it actually sits on.
 *
 * ── The migration this pins ────────────────────────────────────────
 *
 * `--st-text-3` (`#64798a`) clears 4.5:1 on none of the four opaque grounds a panel can have:
 * 4.03 / 3.74 / 3.62 / 3.28. It cannot, either — preserving its hue, the first lightness that
 * does is 58 % while `--st-text-2` sits at 63 %, so a legal third level lands five points from
 * the second and stops being a level.
 *
 * Path C, approved: the token keeps its value and its meaning narrows to inactive and disabled
 * text, glyphs and rules. The 25 sites in the concrete design surface that were carrying COPY
 * moved to `--st-text-2`. The 464 elsewhere did not, and are listed in
 * `docs/handoffs/h1-text-3-contrast-proposal.md`.
 *
 * ── Why this measures rather than reads the source ─────────────────
 *
 * A source test can prove the declaration says `--st-text-2`. It cannot prove the element is
 * legible, because the ratio depends on the ground — and the ground is whatever ancestor
 * happens to paint a background. `--st-text-2` is 6.49 on `--st-surface` and 5.70 on
 * `--st-surface-3`; both pass, but a future well or card could put copy somewhere neither of
 * those numbers covers. So the ratio is computed in the page, against the resolved background of
 * the nearest opaque ancestor.
 *
 * Three languages because the elements that RENDER differ per locale — a Portuguese state name
 * can wrap onto a row an English one does not reach — so the set of measured nodes is not the
 * same set.
 */

import { test, expect, designAll, loadModel } from './fixtures';
import type { Page } from '@playwright/test';

/** Every text node in the subtree, with its computed ratio against its real ground. */
const AUDIT = `(rootSel) => {
  const root = document.querySelector(rootSel);
  if (!root) return null;

  const lum = (c) => {
    const m = c.match(/\\d+(\\.\\d+)?/g); if (!m) return null;
    const f = m.slice(0, 3).map(Number).map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const groundOf = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      const a = bg.match(/rgba?\\([^)]*?([\\d.]+)\\)/);
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && (!a || Number(a[1]) > 0.5)) return bg;
    }
    return getComputedStyle(document.body).backgroundColor;
  };

  const out = [];
  for (const el of [root, ...root.querySelectorAll('*')]) {
    if (el.namespaceURI !== 'http://www.w3.org/1999/xhtml') continue;
    if (el.classList.contains('sr-only') || el.closest('.sr-only')) continue;
    const hasOwnText = [...el.childNodes]
      .some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!hasOwnText) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const px = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    const large = px >= 24 || (px >= 18.66 && bold);
    const a = lum(cs.color), b = lum(groundOf(el));
    if (a === null || b === null) continue;
    const [x, y] = a > b ? [a, b] : [b, a];
    const ratio = (x + 0.05) / (y + 0.05);
    out.push({
      cls: (el.className || '').toString().split(' ')[0],
      testid: el.getAttribute('data-testid'),
      px: Math.round(px * 10) / 10,
      ratio: Math.round(ratio * 100) / 100,
      need: large ? 3 : 4.5,
      fg: cs.color, ground: groundOf(el),
      text: (el.textContent || '').trim().slice(0, 28),
    });
  }
  return out;
}`;

const audit = (page: Page, sel: string) =>
  page.evaluate(new Function('return ' + AUDIT)() as never, sel) as Promise<Array<{
    cls: string; testid: string | null; px: number; ratio: number; need: number;
    fg: string; ground: string; text: string;
  }> | null>;

/**
 * The glyph the migration deliberately LEFT on `--st-text-3`.
 *
 * `DesignTable`'s `.caret` is a disclosure triangle, not a sentence: §1.4.11 asks 3:1 of it and
 * it measures 3.74. Excluded by name rather than by a blanket "ignore anything under 4.5", so
 * the exclusion is a decision on the record and a NEW under-AA element still fails.
 */
const ALLOWED_BELOW_AA = new Set([
  // A disclosure triangle, not a sentence: §1.4.11 asks 3:1 and it measures 3.74.
  'caret',
  /*
   * `DesignOverview`'s census glyph and label, at 3.74 — they inherit `--st-text-3` from
   * `.tone-muted` on line 286 of a file H1 does not own: `DesignOverview` is shared PRO chrome
   * and M1 renders its metallic census through it.
   *
   * Listed by name with the reason, and NOT excluded by a blanket "ignore anything under 4.5",
   * so the exemption is on the record and a new under-AA element still fails this gate. The fix
   * is in `docs/handoffs/h1-shared-chrome-proposal.md`.
   */
  'glyph', 'label',
  /*
   * `DesignToolbar`'s command-group labels, at 3.74 — `--st-text-3` on line 341 of the PRO
   * command row, which M1's metallic commands share. Same proposal, same reason.
   */
  'group-label',
]);

async function design(page: Page) {
  await loadModel(page, 'rc-design-qa-8');
  await designAll(page);
  await page.getByTestId('pr-stage-design').click();
  await page.getByTestId('pr-cmd-design').click();
  // The regulations panel holds nine of the migrated sites, and it is the one this pass
  // prioritised. Open it if it is behind a disclosure.
  const regs = page.getByTestId('regs-disclosure');
  if (await regs.count() && await regs.getAttribute('open') === null) {
    await regs.locator('> summary').click();
  }
}

for (const locale of ['en', 'es', 'pt'] as const) {
  for (const [w, h] of [[1280, 720], [1024, 700]] as const) {
    test.describe(`@slow copy contrast in ${locale} at ${w}×${h}`, () => {
      test.slow();
      test.use({ appLocale: locale, viewport: { width: w, height: h } });

      test('no copy in the design panel sits under AA', async ({ pro: page }) => {
        await design(page);
        const found = await audit(page, '.pro-panel');
        expect(found, 'the panel must be on screen').not.toBeNull();
        expect(found!.length, 'text was actually measured').toBeGreaterThan(20);

        const under = found!
          .filter((f) => f.ratio < f.need)
          .filter((f) => !ALLOWED_BELOW_AA.has(f.cls))
          .map((f) => `${f.ratio} (need ${f.need}) .${f.cls} ${f.px}px `
            + `${f.fg} on ${f.ground} — "${f.text}"`);

        expect(under, 'copy under its contrast bar').toEqual([]);
        test.info().annotations.push({
          type: 'coverage',
          description: `${found!.length} text nodes measured, `
            + `min ratio ${Math.min(...found!.map((f) => f.ratio))}`,
        });
      });
    });
  }
}

test.describe('@slow the migrated selectors, by name', () => {
  test.slow();
  test.use({ viewport: { width: 1280, height: 720 } });

  test('the ones that render resolve to --st-text-2, not to --st-text-3',
    async ({ pro: page }) => {
      await design(page);
      const [t2, t3] = await Promise.all([
        page.evaluate(() => getComputedStyle(document.documentElement)
          .getPropertyValue('--st-text-2').trim()),
        page.evaluate(() => getComputedStyle(document.documentElement)
          .getPropertyValue('--st-text-3').trim()),
      ]);
      const resolve = (c: string) => page.evaluate((v) => {
        const el = document.createElement('span');
        el.style.color = v; document.body.appendChild(el);
        const out = getComputedStyle(el).color; el.remove(); return out;
      }, c);
      const [want, gone] = [await resolve(t2), await resolve(t3)];
      expect(want, 'the two tokens are distinguishable on this page').not.toBe(gone);

      /*
       * Named selectors, so a failure says WHICH one regressed. Conditional per selector because
       * which of them renders depends on the model's state — and annotated, so a run that
       * measured three of eleven does not read as a run that measured all eleven.
       */
      const SELECTORS = [
        '.role-purpose', '.census', '.hint', '.lbl', '.refused',
        '.fam-scope dt', '.no-n', '.muted', '.desc', '.sub', '.dim',
      ];
      const seen: string[] = [];
      for (const sel of SELECTORS) {
        const el = page.locator(`.pro-panel ${sel}`).first();
        if (!(await el.count())) continue;
        seen.push(sel);
        expect(await el.evaluate((n) => getComputedStyle(n).color), `${sel} migrated`)
          .toBe(want);
      }
      expect(seen.length, 'at least some migrated selectors are on screen')
        .toBeGreaterThan(0);
      test.info().annotations.push(
        { type: 'coverage', description: `measured: ${seen.join(' ')}` });
    });

  test('and the caret is still the inactive token, on purpose', async ({ pro: page }) => {
    await design(page);
    const caret = page.locator('.pro-panel .caret').first();
    if (!(await caret.count())) {
      test.info().annotations.push(
        { type: 'coverage', description: 'no caret on screen — asserted at source only' });
      return;
    }
    const t3 = await page.evaluate(() => getComputedStyle(document.documentElement)
      .getPropertyValue('--st-text-3').trim());
    const resolved = await page.evaluate((v) => {
      const el = document.createElement('span');
      el.style.color = v; document.body.appendChild(el);
      const out = getComputedStyle(el).color; el.remove(); return out;
    }, t3);
    expect(await caret.evaluate((n) => getComputedStyle(n).color),
      'a glyph keeps the token the migration narrowed it to').toBe(resolved);
  });
});
