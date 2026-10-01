/**
 * The PRO example gallery under Project › New model: its groups in order, a card that says what
 * to look at, a first load straight away, and a second one that asks before replacing the model.
 * The catalogue itself (sizes, texts, what a loaded example carries) is checked in
 * `pro-examples-catalogue.test.ts`; this checks the gallery reaches it.
 */
import { test, expect } from './fixtures';

test.describe('@smoke PRO example gallery', () => {
  test.describe.configure({ timeout: 180_000 });

  test('lists the groups in order, loads a card, and asks before replacing the open model', async ({ pro: page }) => {
    await page.getByTestId('pr-project').click();
    await page.getByTestId('pp-examples').click();
    const gallery = page.getByTestId('pp-gallery');
    await expect(gallery).toBeVisible();
    await expect(gallery.locator('.pg-group')).toHaveText([
      'First steps', 'Buildings', 'From CAD', 'Sheds and industrial buildings', 'Towers',
      'Bridges and long spans', 'Foundations', 'Scale showcase',
    ]);
    const frame = gallery.locator('[data-example="pro-plane-frame-seismic"]');
    await expect(frame).toContainText('What to look at');
    await expect(gallery.locator('[data-example="la-bombonera"]')).toContainText('heavy model');

    // Nothing open: the card loads at once.
    await frame.locator('.pp-ex').click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length), { timeout: 60_000 }).toBe(28);
    expect(await page.evaluate(() => window.__stabileo.loadCaseNames())).toContain('Sismo X');

    // A model open: the next card asks first; cancelling keeps it, loading replaces it.
    await page.getByTestId('pr-project').click();
    await page.getByTestId('pp-examples').click();
    const shed = page.getByTestId('pp-gallery').locator('[data-example="pro-simple-shed"]');
    await shed.locator('.pp-ex').click();
    const ask = page.getByTestId('pp-example-confirm');
    await expect(ask).toBeVisible();
    await ask.getByRole('button', { name: 'Cancel' }).click();
    await expect(ask).toHaveCount(0);
    expect(await page.evaluate(() => window.__stabileo.elementIds().length)).toBe(28);
    await shed.locator('.pp-ex').click();
    await page.getByTestId('pp-example-confirm').getByRole('button', { name: 'Load' }).click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length), { timeout: 60_000 }).toBe(197);
  });
});
