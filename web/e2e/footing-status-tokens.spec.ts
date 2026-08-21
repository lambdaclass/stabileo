/**
 * The physical mat's status bands are on the token system, and stay legible in every language.
 *
 * ── What is measured, and why in a browser ─────────────────────────
 *
 * `concrete-status-tokens.test.ts` proves the SOURCE reaches for `--st-danger` / `--st-warn` /
 * `--st-surface-3` and computes the contrast arithmetic from `tokens.css`. Neither of those is
 * proof that the page paints it: a token can be shadowed by an ancestor, and a value can resolve
 * to something else entirely inside the panel's own cascade. So these compare the RESOLVED
 * colour against the RESOLVED token, which is the only assertion that cannot pass by accident.
 *
 * And the negative: the private literals — `#5c1a1a` blocking, `#7a5b00` advisory — must not be
 * what comes back. On a dark ground a `--st-surface-3` well and a dark-red band look close
 * enough that a screenshot comparison would accept either.
 *
 * ── Why three languages ────────────────────────────────────────────
 *
 * The bands hold translated sentences from the code messages, not labels. German-length
 * compounds are not the risk here; Portuguese and Spanish message text simply runs longer than
 * English, and this panel is a two-column grid of `.direction` cards inside the PRO rail at its
 * tightest width. A band that wraps to three lines is fine; a panel that grows past 1280 is the
 * defect, and only a browser can tell which happened.
 */

import { test, expect, loadModel, solveModel, computeDemands } from './fixtures';
import type { Page } from '@playwright/test';

const QA = 'rc-design-qa-8';

test.use({ viewport: { width: 1280, height: 720 } });

/** Resolve a colour string through the browser so a token and an `rgb()` compare equal. */
const resolve = (page: Page, colour: string) =>
  page.evaluate((c) => {
    const el = document.createElement('span');
    el.style.color = c;
    document.body.appendChild(el);
    const out = getComputedStyle(el).color;
    el.remove();
    return out;
  }, colour);

const token = (page: Page, name: string) =>
  page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

/** The token, as the browser finally paints it. */
const resolvedToken = async (page: Page, name: string) =>
  resolve(page, await token(page, name));

/**
 * Reach the physical mat.
 *
 * The chain is `foundations.spec.ts`'s, gesture for gesture, because the panel only exists once
 * a footing has a column, a stratum, a full geometry and a completed floor-design run. Shorter
 * routes reach a panel that renders its empty state, which would make every assertion below
 * vacuously true.
 */
async function openPhysicalMat(page: Page) {
  await loadModel(page, QA);
  await solveModel(page);
  await computeDemands(page);

  await page.evaluate(() => window.__stabileoActions.openDesignTab());
  const disclosure = page.getByTestId('floor-families-disclosure');
  await expect(disclosure).toBeVisible();
  await disclosure.locator('summary').first().click();
  await page.getByTestId('floor-family-foundations').click();
  await expect(page.getByTestId('foundations-panel')).toBeVisible();

  await page.getByTestId('soil-add').click();
  const bearing = page.locator('[data-testid^="soil-"][data-testid$="-bearing"]').first();
  await expect(bearing).toBeVisible();
  await bearing.fill('250');
  await bearing.blur();

  const addNode = page.getByTestId('footing-add-node');
  const node = await addNode.locator('option:not([value=""])').first().getAttribute('value');
  expect(node, 'the fixture must offer a supported node').not.toBeNull();
  await addNode.selectOption(node!);
  await expect(page.getByTestId('footing-editor')).toBeVisible();

  for (const [id, value] of [
    ['footing-B', '2.0'], ['footing-L', '2.0'], ['footing-thickness', '0.5'],
    ['footing-cover', '0.05'], ['footing-elevation', '-1.2'],
  ] as const) {
    const input = page.getByTestId(id);
    await input.fill(value);
    await input.blur();
  }

  const column = page.getByTestId('footing-column');
  const firstColumn = await column.locator('option:not([value=""])').first().getAttribute('value');
  await column.selectOption(firstColumn!);
  const soil = page.getByTestId('footing-soil');
  const firstSoil = await soil.locator('option:not([value=""])').first().getAttribute('value');
  await soil.selectOption(firstSoil!);

  await page.getByTestId('floor-design-run').click();
  await expect(page.getByTestId('footing-mat-physical')).toBeVisible();
}

const panel = (page: Page) => page.getByTestId('footing-mat-physical');

test.describe('@slow the physical mat paints from tokens', () => {
  test('the section rule and the cell borders are the hairline tokens', async ({ pro: page }) => {
    await openPhysicalMat(page);
    const top = await panel(page).evaluate((el) => getComputedStyle(el).borderTopColor);
    expect(top, 'the sub-panel rule is the stronger hairline')
      .toBe(await resolvedToken(page, '--st-hair-strong'));

    const cell = panel(page).locator('table th').first();
    if (await cell.count()) {
      expect(await cell.evaluate((el) => getComputedStyle(el).borderTopColor))
        .toBe(await resolvedToken(page, '--st-border'));
      // And the header is filled with the same token `DesignTable` uses for a `thead th`.
      expect(await cell.evaluate((el) => getComputedStyle(el).backgroundColor))
        .toBe(await resolvedToken(page, '--st-surface-2'));
    }
  });

  test('the status badge is a token hue, never the private amber or red',
    async ({ pro: page }) => {
      await openPhysicalMat(page);
      const badge = page.getByTestId('footing-mat-geometry-status');
      await expect(badge).toBeVisible();
      const colour = await badge.evaluate((el) => getComputedStyle(el).color);
      const bg = await badge.evaluate((el) => getComputedStyle(el).backgroundColor);

      // Whatever state this fixture lands in, the badge is one of the three sanctioned looks.
      const [danger, warn, surface3] = await Promise.all([
        resolvedToken(page, '--st-danger'),
        resolvedToken(page, '--st-warn'),
        resolvedToken(page, '--st-surface-3'),
      ]);
      expect(bg, 'the badge sits on the well').toBe(surface3);
      const inherited = await panel(page).evaluate((el) => getComputedStyle(el).color);
      expect([danger, warn, inherited], `badge colour was ${colour}`).toContain(colour);

      // The negative. `#5c1a1a` and `#7a5b00` are close enough to a dark well on this ground
      // that a screenshot would not have noticed either way.
      for (const gone of ['#5c1a1a', '#7a5b00', '#ffe4e4', '#fff6dd']) {
        const literal = await resolve(page, gone);
        expect(bg, `${gone} must not be the fill`).not.toBe(literal);
        expect(colour, `${gone} must not be the text`).not.toBe(literal);
      }
    });

  test('each issue band carries full-contrast text and its own status rule',
    async ({ pro: page }) => {
      await openPhysicalMat(page);
      const [text, danger, warn] = await Promise.all([
        resolvedToken(page, '--st-text'),
        resolvedToken(page, '--st-danger'),
        resolvedToken(page, '--st-warn'),
      ]);

      /*
       * Asserted per CLASS, and the coverage is stated rather than implied.
       *
       * `rc-design-qa-8` produces two blocking findings and no advisory one, so the amber
       * branch is exercised at source by `concrete-status-tokens.test.ts` and not here. A
       * single `.first()` over both classes would have hidden that: it would have passed on
       * the blocking band and read as though both were checked.
       */
      const seen: string[] = [];
      for (const [cls, rule] of [['blocking', danger], ['advisory', warn]] as const) {
        const bands = panel(page).locator(`.issues li.${cls}`);
        const n = await bands.count();
        if (n === 0) continue;
        seen.push(`${cls}×${n}`);
        for (let i = 0; i < n; i++) {
          const band = bands.nth(i);
          // The message stays at full contrast; that is the whole point of the rule carrying
          // the status instead of the text.
          expect(await band.evaluate((el) => getComputedStyle(el).color),
            `${cls}[${i}] message contrast`).toBe(text);
          expect(await band.evaluate((el) => getComputedStyle(el).borderLeftColor),
            `${cls}[${i}] status rule`).toBe(rule);
        }
      }
      expect(seen.length, 'this fixture must show at least one band').toBeGreaterThan(0);
      test.info().annotations.push(
        { type: 'coverage', description: `bands measured in the browser: ${seen.join(', ')}` });
    });

  test('the resolved order reads as a selection', async ({ pro: page }) => {
    await openPhysicalMat(page);
    const chosen = panel(page).locator('tr.chosen').first();
    if (!(await chosen.count())) return;
    expect(await chosen.evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe(await resolvedToken(page, '--st-selected-bg'));
  });
});

for (const locale of ['en', 'es', 'pt'] as const) {
  test.describe(`@slow the mat panel holds 1280×720 in ${locale}`, () => {
    test.use({ appLocale: locale, viewport: { width: 1280, height: 720 } });

    test('the panel does not overflow, whatever the message length', async ({ pro: page }) => {
      await openPhysicalMat(page);
      /*
       * The container, not every descendant. A `.scroll` well and a wide table report
       * `scrollWidth > clientWidth` by design — that is what `overflow-x: auto` is for. The
       * defect is a panel wider than its own box.
       */
      const box = await panel(page)
        .evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
      expect(box.scroll, `the mat panel fits at 1280 in ${locale}`)
        .toBeLessThanOrEqual(box.client + 1);

      // And the status badge stayed inside it, rather than being pushed out by a longer word.
      const badge = await page.getByTestId('footing-mat-geometry-status').boundingBox();
      const panelBox = await panel(page).boundingBox();
      expect(badge!.x + badge!.width, `the badge stays in the panel in ${locale}`)
        .toBeLessThanOrEqual(panelBox!.x + panelBox!.width + 1);
    });
  });
}
