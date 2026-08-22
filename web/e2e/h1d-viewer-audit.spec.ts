/**
 * H1-D — the 3-D workspace: rail, isolation, filters, focus, Escape, empty state, return.
 *
 * H1-A measured the overlay at rest and said it had not measured the interactive states. This is
 * those, and most of what it found was working. One thing was not, and it was a keyboard dead
 * end.
 *
 * ── What the fixture can and cannot exercise ───────────────────────
 *
 * `rc-design-qa-8` builds a scene with 200 column bars, 226 beam bars, 8 solids and — measured —
 * **zero conflicts and nothing unreinforced**. So `rebar-layer-conflicts` and
 * `rebar-hide-unreinforced` change no census here. They are not dead controls; they have nothing
 * to act on, and the difference matters: a test that called them broken would be wrong, and one
 * that silently passed would prove nothing. Both are annotated as unexercised.
 */

import { test, expect, designAll, loadModel, openDocumentsStage } from './fixtures';
import type { Page } from '@playwright/test';

async function openWorkspace(page: Page, withDetailing = true) {
  await loadModel(page, 'rc-design-qa-8');
  await designAll(page);
  if (withDetailing) {
    await page.getByTestId('detailing-disclosure').locator('> summary').click();
    const generate = page.getByTestId('cmd-generate-detailing');
    await expect(generate).toBeEnabled();
    await generate.click();
    await expect
      .poll(() => page.evaluate(() =>
        (window.__stabileo as unknown as { detailingAssemblies(): unknown[] })
          .detailingAssemblies().length), { timeout: 60_000 })
      .toBeGreaterThan(0);
  }
  await openDocumentsStage(page);
  const before = await page.evaluate(() =>
    (window.__stabileo as unknown as { rebarSceneBuilds(): number }).rebarSceneBuilds());
  await page.getByTestId('doc-3d').click();
  await expect(page.getByTestId('rebar-workspace')).toBeVisible();
  if (withDetailing) {
    await expect
      .poll(() => page.evaluate(() =>
        (window.__stabileo as unknown as { rebarSceneBuilds(): number }).rebarSceneBuilds()),
        { timeout: 120_000 })
      .toBeGreaterThan(before);
  }
}

const activeTestId = (page: Page) =>
  page.evaluate(() => (document.activeElement === document.body
    ? 'body'
    : document.activeElement?.getAttribute('data-testid') ?? 'other'));

test.describe('@slow isolation keeps the keyboard alive', () => {
  test.slow();
  test.use({ viewport: { width: 1280, height: 720 } });

  test('isolating and clearing do not drop focus to the document body',
    async ({ pro: page }) => {
      await openWorkspace(page);
      const rows = page.locator('[data-testid^="rebar-element-"]');
      expect(await rows.count(), 'the rail lists members').toBeGreaterThan(0);
      await rows.first().click();

      /**
       * The defect this pins.
       *
       * `Isolate` and `Clear isolation` were an `{#if}/{:else}` pair, so pressing one DESTROYED
       * the pressed button and created the other. The focused element left the DOM and focus fell
       * to `<body>` — measured, twice: once on isolating and again on clearing. For a keyboard
       * user that is a dead end whose next Tab restarts at the top of the document.
       *
       * One node now swaps its label, action and testid instead.
       */
      const isolate = page.getByTestId('rebar-isolate');
      await expect(isolate).toBeVisible();
      await isolate.focus();
      await isolate.click();

      await expect(page.getByTestId('rebar-clear-isolation'), 'the button became the other one')
        .toBeVisible();
      expect(await activeTestId(page), 'focus stayed on the control')
        .toBe('rebar-clear-isolation');

      await page.getByTestId('rebar-clear-isolation').click();
      await expect(page.getByTestId('rebar-isolate')).toBeVisible();
      expect(await activeTestId(page), 'and again on the way back').toBe('rebar-isolate');
    });

  test('the isolation reaches the scene', async ({ pro: page }) => {
    await openWorkspace(page);
    const rows = page.locator('[data-testid^="rebar-element-"]');
    await rows.first().click();
    const census = () => page.evaluate(() =>
      JSON.stringify((window.__stabileo as unknown as { rebarSceneCensus(): unknown })
        .rebarSceneCensus()));
    const before = await census();
    await page.getByTestId('rebar-isolate').click();
    await expect(page.getByTestId('rebar-clear-isolation')).toBeVisible();
    /*
     * The MEMBER LIST is not what isolation filters, and that is correct: the list is how you
     * choose what to isolate, so emptying it would take the way back out. What must change is the
     * scene. Asserted on the census rather than on the list, which is what the first probe of
     * this got wrong — it counted rows, saw 9 before and 9 after, and read that as isolation
     * doing nothing.
     */
    expect(await census(), 'the drawn scene changed').not.toBe(before);
    expect(await rows.count(), 'and the list is still a way back out').toBeGreaterThan(0);
  });
});

test.describe('@slow filters and layers', () => {
  test.slow();
  test.use({ viewport: { width: 1280, height: 720 } });

  test('the bars and concrete layers change what is drawn', async ({ pro: page }) => {
    await openWorkspace(page);
    const census = () => page.evaluate(() =>
      JSON.stringify((window.__stabileo as unknown as { rebarSceneCensus(): unknown })
        .rebarSceneCensus()));
    for (const id of ['rebar-layer-bars', 'rebar-layer-concrete']) {
      const before = await census();
      await page.getByTestId(id).click();
      await expect.poll(census, { timeout: 10_000 }).not.toBe(before);
      await page.getByTestId(id).click();      // and back, so each is independent
      await expect.poll(census, { timeout: 10_000 }).toBe(before);
    }
  });

  test('the conflict and unreinforced filters have nothing to act on here, and that is stated',
    async ({ pro: page }) => {
      await openWorkspace(page);
      const c = await page.evaluate(() =>
        (window.__stabileo as unknown as {
          rebarSceneCensus(): { markers: number };
        }).rebarSceneCensus());
      /*
       * The premise, asserted. If a future fixture DOES produce conflicts, this fails and the
       * two controls below have to be exercised properly instead of annotated away.
       */
      expect(c.markers, 'this fixture draws no conflict markers').toBe(0);
      for (const id of ['rebar-layer-conflicts', 'rebar-hide-unreinforced']) {
        await expect(page.getByTestId(id), `${id} is still offered`).toBeAttached();
      }
      test.info().annotations.push({
        type: 'coverage',
        description: 'conflicts and unreinforced: controls present, nothing to filter on '
          + 'rc-design-qa-8 — unexercised, not dead',
      });
    });

  test('opacity is a material property, so it moves no mesh count', async ({ pro: page }) => {
    await openWorkspace(page);
    const opacity = page.getByTestId('rebar-opacity');
    await expect(opacity).toBeAttached();
    const census = () => page.evaluate(() =>
      JSON.stringify((window.__stabileo as unknown as { rebarSceneCensus(): unknown })
        .rebarSceneCensus()));
    const before = await census();
    await opacity.fill('0.4');
    /*
     * Recorded because the first probe treated an unchanged census as a broken slider. Opacity
     * changes a material, not the number of things drawn — the census is the wrong instrument,
     * and saying so is worth more than a test that measures nothing.
     */
    expect(await census(), 'the census is not the instrument for this').toBe(before);
    expect(await opacity.inputValue()).toBe('0.4');
  });
});

test.describe('@slow the rail, and getting back out', () => {
  test.slow();

  test('at 1280×720 the rail is open and its toggle is hidden', async ({ pro: page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openWorkspace(page);
    await expect(page.getByTestId('rebar-rail')).toBeVisible();
    /*
     * `rebar-rail-toggle` is `display: none` at this width — a 0×0 box. So the rail cannot be
     * collapsed on a desktop, which is a product decision rather than a defect, and it is
     * recorded here because it cost a five-minute timeout to discover: Playwright's `click()`
     * waits for a hidden element forever.
     */
    const box = await page.getByTestId('rebar-rail-toggle')
      .evaluate((el) => { const b = el.getBoundingClientRect(); return { w: b.width, h: b.height }; });
    expect(box.w * box.h, 'the toggle is not rendered at this width').toBe(0);
  });

  test('Escape closes the overlay and lands back on the control that opened it',
    async ({ pro: page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await openWorkspace(page);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('rebar-workspace')).toHaveCount(0);
      expect(await activeTestId(page)).toBe('doc-3d');
      // And the workflow is where it was, not reset.
      await expect(page.getByTestId('documents-stage')).toBeVisible();
    });

  test('the close button is the only labelled way back — there is no Back', async ({ pro: page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openWorkspace(page);
    await expect(page.getByTestId('rebar-workspace-close')).toBeVisible();
    /*
     * `rebar-back` does not exist. Escape and the close button both return correctly, so the route
     * is there — what is missing is a labelled affordance that says "back to the workflow", which
     * is a content decision and not made here.
     */
    await expect(page.getByTestId('rebar-back')).toHaveCount(0);
  });
});

test.describe('@slow the empty state', () => {
  test.slow();
  test.use({ viewport: { width: 1280, height: 720 } });

  test('opening the viewer with no detailing says which families are missing',
    async ({ pro: page }) => {
      await openWorkspace(page, false);
      /*
       * `doc-3d` is enabled without any detailing and the overlay opens — which is consistent
       * with the documents stage, where the exports are enabled and build on demand.
       *
       * What comes up is `rebar-empty-families`, not `rebar-workspace-empty`: the rail names the
       * families that have nothing rather than the whole workspace claiming to be empty. Asserted
       * as it is, because the two messages mean different things and only one of them is true.
       */
      await expect(page.getByTestId('rebar-empty-families')).toBeVisible();
      const text = await page.getByTestId('rebar-empty-families').innerText();
      expect(text.trim().length, 'and it is a sentence, not a blank').toBeGreaterThan(5);
    });
});
