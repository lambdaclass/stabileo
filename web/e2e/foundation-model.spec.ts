/**
 * Foundations placed in the model: footings under the supports, held at a property line, tie and
 * strap beams proposed on the plan and placed, sizing that says what it lacks. The arithmetic is
 * pinned in `model/foundation/__tests__`; this checks the panel drives it.
 */
import { test, expect, ribbonCmd, placeFrameFromGrid } from './fixtures';

test.use({ viewport: { width: 1280, height: 860 } });

test.describe('@smoke foundations in the model', () => {
  test('footings under the supports, beams proposed and placed, sizing asks for a solve', async ({ pro: page }) => {
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-grid').click();
    await page.getByTestId('grid-bays-x').fill('6; 6');
    await page.getByTestId('grid-generate-x').click();
    await page.getByTestId('grid-bays-y').fill('5');
    await page.getByTestId('grid-generate-y').click();
    await page.getByTestId('grid-heights').fill('3');
    await page.getByTestId('grid-generate-levels').click();
    await page.getByTestId('grid-open-building').click();
    await placeFrameFromGrid(page);

    await ribbonCmd(page, 'foundations');
    await expect(page.getByTestId('foundation-model-panel')).toBeVisible();
    await page.getByTestId('foundation-line-minX').check();
    await page.getByTestId('foundation-place').click();
    await expect(page.getByTestId('foundation-status')).toContainText('6');

    await page.getByTestId('foundation-max-distance').fill('6.5');
    await page.getByTestId('foundation-propose').click();
    // Two straps from the footings on the property line, five ties for the rest within 6.5 m.
    await expect(page.getByTestId('foundation-after')).toContainText('7');
    await expect(page.getByTestId('foundation-plan')).toBeVisible();
    const before = (await page.evaluate(() => window.__stabileo.modelCensus())).elements;
    await page.getByTestId('foundation-place-beams').click();
    expect((await page.evaluate(() => window.__stabileo.modelCensus())).elements).toBe(before + 7);

    await page.getByTestId('foundation-presize-run').click();
    await expect(page.getByTestId('foundation-presize')).toContainText(/solve|calcul/i);
  });
});
