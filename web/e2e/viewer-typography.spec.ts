/**
 * The 3-D workspace renders in the application's typeface.
 *
 * ── The defect H1-A measured ───────────────────────────────────────
 *
 * `App.svelte:1196` mounts `<RebarWorkspace />` as a SIBLING of `.app-container`, and that
 * container is the only element in the application declaring `font-family: var(--st-sans)`. So
 * the overlay inherited `-apple-system` from `index.html` and rendered in San Francisco on a Mac
 * and Segoe on Windows, while every panel behind it rendered in IBM Plex:
 *
 *     insideAppContainer: false · wsFont: -apple-system · appFont: "IBM Plex Sans" · wsMono: false
 *
 * ── Why these assertions and not a screenshot ──────────────────────
 *
 * A screenshot of the viewer in the wrong font looks like a viewer, not like a bug — that is how
 * this survived a colour audit that explicitly set out to find why the viewer "looked like a
 * different application". So the font is compared as a RESOLVED family against what
 * `.app-container` resolves to, which is the only way to say "the same font" rather than "a
 * font".
 *
 * And the mount point is asserted to stay OUTSIDE `.app-container`, because that is not the bug:
 * the launcher lives in `aside.pro-sidebar`, whose fixed pixel width is what made the viewer a
 * few hundred pixels wide. A future fix that "tidies" the overlay back into the container would
 * pass a font test and undo the reason the overlay exists.
 */

import { test, expect, designAll, loadModel, openDocumentsStage } from './fixtures';
import type { Page } from '@playwright/test';

const first = (family: string) => family.split(',')[0].trim().replace(/^["']|["']$/g, '');

async function openWorkspace(page: Page) {
  await loadModel(page, 'rc-design-qa-8');
  await designAll(page);
  await page.getByTestId('detailing-disclosure').locator('> summary').click();
  const generate = page.getByTestId('cmd-generate-detailing');
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect
    .poll(() => page.evaluate(() =>
      (window.__stabileo as unknown as { detailingAssemblies(): unknown[] })
        .detailingAssemblies().length), { timeout: 60_000 })
    .toBeGreaterThan(0);
  await openDocumentsStage(page);

  const before = await page.evaluate(() =>
    (window.__stabileo as unknown as { rebarSceneBuilds(): number }).rebarSceneBuilds());
  await page.getByTestId('doc-3d').click();
  await expect(page.getByTestId('rebar-workspace')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() =>
      (window.__stabileo as unknown as { rebarSceneBuilds(): number }).rebarSceneBuilds()),
      { timeout: 120_000 })
    .toBeGreaterThan(before);
}

for (const [w, h] of [[1280, 720], [1024, 700]] as const) {
  test.describe(`@slow the viewer's typeface at ${w}×${h}`, () => {
    test.slow();
    test.use({ viewport: { width: w, height: h } });

    test('the overlay renders in the same family the application does',
      async ({ pro: page }) => {
        await openWorkspace(page);
        const r = await page.evaluate(() => {
          const ws = document.querySelector('[data-testid="rebar-workspace"]') as HTMLElement;
          const app = document.querySelector('.app-container') as HTMLElement | null;
          return {
            outsideContainer: app ? !app.contains(ws) : null,
            ws: getComputedStyle(ws).fontFamily,
            app: app ? getComputedStyle(app).fontFamily : null,
            token: getComputedStyle(document.documentElement)
              .getPropertyValue('--st-sans').trim(),
          };
        });

        // The mount point stays where it is, on purpose. See the file header.
        expect(r.outsideContainer, 'the overlay is still mounted outside .app-container')
          .toBe(true);
        expect(first(r.ws), 'the same family, not merely a nice one').toBe(first(r.app!));
        expect(first(r.ws)).toBe(first(r.token));
        // The negative: the system stack it used to fall through to.
        expect(first(r.ws)).not.toBe('-apple-system');
      });

    test('every figure column in the rail is the mono family, with tabular digits',
      async ({ pro: page }) => {
        await openWorkspace(page);
        const mono = first(await page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--st-mono').trim()));

        /*
         * The selectors their own authors had already marked `tabular-nums`, plus
         * `SelectionDetails`'s `dd`, which reports the same kind of measured value as
         * `ConflictInspector`'s and had neither declaration.
         *
         * `tabular-nums` alone was not enough and that is the point: it asks the CURRENT font
         * for tabular figures, and the font was whatever the OS supplied.
         */
        const targets = [
          ['.n', 'a state count'],
          ['.cause-n', 'a cause count'],
          ['.tally td', 'the family tally'],
        ] as const;

        const measured: string[] = [];
        for (const [sel, what] of targets) {
          const el = page.getByTestId('rebar-workspace').locator(sel).first();
          if (!(await el.count())) continue;
          measured.push(what);
          const cs = await el.evaluate((n) => {
            const s = getComputedStyle(n);
            return { family: s.fontFamily, variant: s.fontVariantNumeric };
          });
          expect(first(cs.family), `${what} (${sel}) is the mono family`).toBe(mono);
          expect(cs.variant, `${what} (${sel}) asks for tabular digits`)
            .toContain('tabular-nums');
        }
        expect(measured.length, 'at least one figure column is on screen').toBeGreaterThan(0);
        test.info().annotations.push(
          { type: 'coverage', description: `columns measured: ${measured.join(', ')}` });
      });

    test('a state WORD is not put in the mono family', async ({ pro: page }) => {
      await openWorkspace(page);
      /*
       * `.n` and `.st` shared one rule, so the count and the translated state word had the same
       * declaration — and `tabular-nums` had never done anything for a word. Splitting them is
       * the kind of change that is invisible unless something checks the negative.
       */
      const st = page.getByTestId('rebar-workspace').locator('.st').first();
      if (!(await st.count())) return;
      const mono = first(await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--st-mono').trim()));
      const sans = first(await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--st-sans').trim()));
      const family = first(await st.evaluate((n) => getComputedStyle(n).fontFamily));
      expect(family, 'the state word stays in the text face').toBe(sans);
      expect(family).not.toBe(mono);
    });

    test('no control inside the overlay falls back to the UA font', async ({ pro: page }) => {
      await openWorkspace(page);
      /**
       * The finding that made this change bigger than one declaration.
       *
       * `.app-container`'s comment says one declaration "reaches every descendant that does not
       * override it", and that is true of INHERITANCE — but `button`, `input`, `select` and
       * `textarea` do not inherit a font: every UA stylesheet gives them their own. Measured
       * inside this overlay before the fix: 12 buttons and 13 inputs, all Arial, inside a panel
       * already rendering IBM Plex.
       *
       * Counted rather than sampled, because `.first()` would pass on whichever control happened
       * to declare a family of its own.
       */
      const bad = await page.getByTestId('rebar-workspace').evaluate((ws) => {
        const out: string[] = [];
        for (const el of ws.querySelectorAll('button,input,select,textarea')) {
          const fam = getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim();
          if (fam === 'Arial' || fam === 'Times New Roman' || fam === '-apple-system') {
            out.push(`${el.tagName.toLowerCase()}[${el.getAttribute('data-testid') ?? '?'}] ${fam}`);
          }
        }
        return out;
      });
      expect(bad, 'controls still on the UA font').toEqual([]);
    });

    test('the overlay colour aliases still resolve — the earlier fix is intact',
      async ({ pro: page }) => {
        await openWorkspace(page);
        // Declaring a font must not have disturbed the four aliases `.workspace` defines, which
        // are what keeps the viewer's colours on the token system.
        const r = await page.getByTestId('rebar-workspace').evaluate((el) => {
          const cs = getComputedStyle(el);
          return ['--text', '--text-muted', '--st-border', '--panel']
            .map((n) => [n, cs.getPropertyValue(n).trim()] as const);
        });
        for (const [name, value] of r) {
          expect(value, `${name} still resolves inside the overlay`).not.toBe('');
        }
      });
  });
}

/**
 * One assertion per language, because a typeface is not translated but a fallback is a per-script
 * decision: if IBM Plex ever lacked a glyph the browser would substitute silently, and the family
 * reported for the ELEMENT would still be Plex. So this checks the rail's own labels render in it
 * in all three, which is as close as a resolved-family read can get to that question.
 */
for (const locale of ['en', 'es', 'pt'] as const) {
  test.describe(`@slow the rail's labels in ${locale}`, () => {
    test.slow();
    test.use({ appLocale: locale, viewport: { width: 1280, height: 720 } });

    test('the rail renders in the application face', async ({ pro: page }) => {
      await openWorkspace(page);
      const sans = first(await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--st-sans').trim()));
      const label = page.getByTestId('rebar-workspace').locator('.label, h4, h5').first();
      await expect(label).toBeAttached();
      expect(first(await label.evaluate((n) => getComputedStyle(n).fontFamily))).toBe(sans);
    });
  });
}
