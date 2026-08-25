/**
 * One selection, one run, and the 3-D view beside the result.
 *
 * The workflow this pins: "Diseñar todo" designed beams and columns and stopped, while slabs,
 * walls and foundations came from a second command in a different disclosure. The button named
 * "all" produced a building with no floors and said nothing about it.
 *
 * Its own file: these load committed projects through the same path the other journeys use,
 * and stacking project loads into one describe block has already broken a whole spec through
 * leftover autosaved state.
 */
import { test, expect, designAll, loadModel } from './fixtures';

type Page = import('@playwright/test').Page;

async function ready(page: Page, example: string) {
  await loadModel(page, example);
  await designAll(page);
  await expect(page.getByTestId('design-families')).toBeVisible();
}

test.describe('the family selector drives the whole run', () => {
  /*
   * F2 changed two things here, and this test asserted the state before both.
   *
   * A family the model does not contain is no longer OFFERED at all — not disabled, not
   * ticked-and-inert: absent. A checkbox for something the building does not have is a question
   * with one answer, and it blurred "this model has no walls" into "the walls have not been
   * designed".
   *
   * And the default narrowed to beams and columns. What keeps that honest is the scope read-out
   * beside the command, which is asserted in `f2-design-stage.spec.ts` — an unticked family on
   * screen is a choice; an unticked family nobody can see is the old defect with a smaller
   * default.
   */
  test('offers the families this model has, with beams and columns ticked',
    async ({ pro: page }) => {
      await ready(page, 'rc-qa-diagnostic');
      for (const f of ['column', 'beam']) {
        await expect(page.getByTestId(`design-family-${f}`), `${f} is offered`).toBeVisible();
        await expect(page.getByTestId(`design-family-${f}`), `${f} is ticked`).toBeChecked();
      }
      // This model holds no shells and no footings, so those boxes are absent rather than
      // present-and-empty. The scope beside the command is what states the omission.
      for (const f of ['slab', 'wall', 'footing']) {
        await expect(page.getByTestId(`design-family-${f}`),
          `${f} is not offered by a model without them`).toHaveCount(0);
      }
      await expect(page.getByTestId('cmd-design-scope')).toBeVisible();
    });

  test('select all and clear move every box that exists', async ({ pro: page }) => {
    await ready(page, 'rc-qa-diagnostic');
    await page.getByTestId('design-family-all').click();
    // "All" means all the model HAS — there is no footing box on this model to tick.
    await expect(page.getByTestId('design-family-beam')).toBeChecked();
    await page.getByTestId('design-family-none').click();
    await expect(page.getByTestId('design-family-column')).not.toBeChecked();
    // Nothing selected means nothing to run, and the button says so by being unavailable.
    await expect(page.getByTestId('cmd-design-all')).toBeDisabled();
  });

  test('the summary names exactly what will be designed', async ({ pro: page }) => {
    await ready(page, 'rc-qa-diagnostic');
    await page.getByTestId('design-family-none').click();
    await page.getByTestId('design-family-column').check();
    const s = page.getByTestId('design-family-summary');
    await expect(s).toContainText(/Columnas|Columns/);
    await expect(s).not.toContainText(/Losas|Slabs/);
  });

  test('running reports every family, and skipped is not the same as empty',
    async ({ pro: page }) => {
      test.setTimeout(240_000);
      await ready(page, 'rc-qa-diagnostic');
      await page.getByTestId('design-family-none').click();
      await page.getByTestId('design-family-column').check();
      await page.getByTestId('design-family-beam').check();
      await page.getByTestId('cmd-design-all').click();

      const result = page.getByTestId('design-family-result');
      await expect(result).toBeVisible();
      await expect(page.getByTestId('design-result-column')).toContainText(/diseñada|designed/);
      // The families the user did not pick are reported as skipped rather than omitted.
      await expect(page.getByTestId('design-result-slab')).toContainText(/omitida|skipped/);
      await expect(page.getByTestId('design-family-totals')).toBeVisible();
    });

  test('a model with no footings says so instead of failing', async ({ pro: page }) => {
    test.setTimeout(240_000);
    await ready(page, 'rc-qa-diagnostic');
    await page.getByTestId('design-family-all').click();
    await page.getByTestId('cmd-design-all').click();
    // "You did not ask for them" and "there are none" are different facts.
    await expect(page.getByTestId('design-result-footing'))
      .toContainText(/sin elementos|no members/);
  });

  test('the 3-D view is one click from the result', async ({ pro: page }) => {
    test.setTimeout(240_000);
    await ready(page, 'rc-qa-diagnostic');
    await page.getByTestId('cmd-design-all').click();
    const view = page.getByTestId('design-result-view-3d');
    await expect(view).toBeVisible();
    await view.click();
    // No second panel, no hunting: the workspace opens from where the numbers are.
    await expect(page.getByTestId('rebar-workspace')).toBeVisible();
  });
});
