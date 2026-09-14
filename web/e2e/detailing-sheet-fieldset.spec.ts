/**
 * The sheet's control group looks like every other control group.
 *
 * ── The defect, as PR20's handoff recorded it ──────────────────────
 *
 * "The `<fieldset>Sheet</fieldset>` keeps a native legend border, which is the one control
 * group in the panel that does not match the others."
 *
 * Measured rather than described: it carried `border: 1px solid rgba(143, 163, 179, 0.35)` —
 * `--st-hair-strong` (0.38) written out by hand — and its `legend` had no `color` at all, so
 * it inherited whatever was around it. `ProReportDialog` and `ProAutoLoadsDialog` both use
 * `1px solid var(--st-surface-3)` with the legend in `var(--st-text-2)`.
 *
 * So these assertions compare the RESOLVED colour against the resolved token, which is the
 * only way to prove a component is on the system rather than near it. A hand-written
 * approximation passes a screenshot and fails this.
 */

import { test, expect, designAll, loadModel } from './fixtures';
import type { Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 720 } });

/** The computed value of a design token, as the browser resolves it. */
const token = (page: Page, name: string) =>
  page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name,
  );

/** Resolve a colour string through the browser, so `rgba(...)` and a token compare equal. */
const resolve = (page: Page, colour: string) =>
  page.evaluate((c) => {
    const el = document.createElement('span');
    el.style.color = c;
    document.body.appendChild(el);
    const out = getComputedStyle(el).color;
    el.remove();
    return out;
  }, colour);

/**
 * The sheet controls exist only once there is detailing to draw.
 *
 * A fresh model shows `detailing-empty` and no `<fieldset>` at all, so every assertion below
 * needs the pipeline run first. That is why PR20's own sheet tests are `@slow` and call
 * `designAll` — this follows them rather than inventing a shortcut.
 */
async function openDetailing(page: Page) {
  // A model first: `designAll` solves and designs, and it polls `runCounts().total > 0`, which
  // an empty model can never satisfy.
  await loadModel(page, 'rc-design-qa-8');
  await designAll(page);
  await page.getByTestId('pr-stage-design').click();
  await page.getByTestId('pr-cmd-design').click();
  // By its disclosure's own testid. A text match on /detailing/ picks up the ribbon's
  // "3-D detailing" command, which is DISABLED on a fresh model, and waits for it forever.
  const disclosure = page.getByTestId('detailing-disclosure');
  await expect(disclosure).toBeAttached();
  if (await disclosure.getAttribute('open') === null) {
    // `.first()`: the stage body contains its own nested `<details>`, so the disclosure has
    // two summaries and only the outer one opens the section.
    await disclosure.locator('summary').first().click();
  }
  await expect(page.getByTestId('detailing-workflow')).toBeVisible();
}

const fieldset = (page: Page) =>
  page.getByTestId('detailing-workflow').locator('.sheet-controls fieldset');

test.describe('@slow the sheet fieldset is on the token system', () => {
  test('its border is the same colour as the other dialogs use', async ({ pro: page }) => {
    await openDetailing(page);
    const border = await fieldset(page).evaluate((el) => getComputedStyle(el).borderTopColor);
    const expected = await resolve(page, await token(page, '--st-surface-3'));
    expect(border).toBe(expected);
  });

  test('the legend has a colour of its own rather than inheriting', async ({ pro: page }) => {
    await openDetailing(page);
    const legend = fieldset(page).locator('legend');
    const colour = await legend.evaluate((el) => getComputedStyle(el).color);
    const expected = await resolve(page, await token(page, '--st-text-2'));
    expect(colour).toBe(expected);
    // And it is NOT the body colour, which is what inheriting gave it.
    const body = await page.evaluate(() => getComputedStyle(document.body).color);
    expect(colour).not.toBe(body);
  });

  test('the border is not the hand-written slate it used to be', async ({ pro: page }) => {
    await openDetailing(page);
    const border = await fieldset(page).evaluate((el) => getComputedStyle(el).borderTopColor);
    // The old literal, resolved. If someone reinstates it, this fails even though the two
    // look nearly identical on screen.
    const old = await resolve(page, 'rgba(143, 163, 179, 0.35)');
    expect(border).not.toBe(old);
  });
});

test.describe('@slow the panel still fits at 1280×720', () => {
  test('the panel itself does not overflow sideways', async ({ pro: page }) => {
    await openDetailing(page);
    /*
     * Measured on the CONTAINER, which is what `pro-design-workflow.spec.ts` already does.
     *
     * A first version of this walked every descendant and flagged 433 of them. That is not
     * overflow: a table with `overflow-x: auto` and a scroll well both report
     * `scrollWidth > clientWidth` by design, and that is what they are for. The defect is a
     * panel wider than its own box, not a scroller doing its job.
     */
    const box = await page.getByTestId('detailing-workflow')
      .evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(box.scroll, 'the detailing panel does not overflow sideways')
      .toBeLessThanOrEqual(box.client + 1);
  });

  test('the fieldset and its legend are both visible, not clipped', async ({ pro: page }) => {
    await openDetailing(page);
    await expect(fieldset(page)).toBeVisible();
    const box = await fieldset(page).boundingBox();
    expect(box!.width).toBeGreaterThan(40);
    await expect(fieldset(page).locator('legend')).toBeVisible();
  });
});

/*
 * One locale in the browser, not three.
 *
 * That the legend key exists and is translated in en/es/pt is already proven by
 * `locale-parity` and `pro-flow-coverage`, which read the dictionaries directly. What only a
 * browser can measure is that the STYLE survives a different word length — and one run of
 * `designAll` per locale is minutes of suite for a fact two unit gates already hold.
 */
for (const [locale, legend] of [
  ['es', /hoja|l.mina/i],
] as const) {
  test.describe(`@slow the sheet group is legible in ${locale}`, () => {
    test.use({ appLocale: locale, viewport: { width: 1280, height: 720 } });

    test('the legend is translated and still styled', async ({ pro: page }) => {
      await openDetailing(page);
      await expect(fieldset(page).locator('legend')).toHaveText(legend);
      // The styling is not language-dependent, and a longer word must not break the border.
      const colour = await fieldset(page).locator('legend')
        .evaluate((el) => getComputedStyle(el).color);
      expect(colour).toBe(await resolve(page, await token(page, '--st-text-2')));
    });
  });
}
