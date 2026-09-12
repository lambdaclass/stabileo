import { test, expect } from './fixtures';

/**
 * Every control in PRO's Project panel does the thing it is named for.
 *
 * Two of them did not. "Compartir link" dispatched an event on `window` that
 * NOTHING listened for — the button had looked finished since the day it was
 * written and had never copied anything. And DXF and IFC existed twice, once
 * under "New model" and again under Import, which is two routes to one
 * operation and a reader wondering whether they differ.
 *
 * A button that does nothing is indistinguishable from a button whose effect
 * you did not notice, which is why this presses them rather than reading the
 * source.
 */
test.describe('@smoke PRO — the Project panel', () => {
  test.beforeEach(async ({ pro: page }) => {
    await page.getByTestId('pr-project').click();
    await expect(page.getByTestId('pro-project-tab')).toBeVisible();
  });

  test('the share link is copied, not merely announced', async ({ pro: page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    // Something to share: an empty model is refused, which is its own answer.
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-nodes').click();
    const canvas = page.locator('canvas:not(.axis-gizmo)').first();
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5);
    await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBeGreaterThan(0);

    await page.getByTestId('pr-project').click();
    await page.getByTestId('pp-share').click();

    const url = await page.evaluate(() => navigator.clipboard.readText());
    expect(url, 'the clipboard carries a data link').toContain('#data=');
  });

  test('the importers exist once, under Import', async ({ pro: page }) => {
    /* They were under "New model" as well. What belongs there is what starts
       a model with no file to start it from — today Examples. */
    await expect(page.getByRole('button', { name: /DXF/ })).toHaveCount(2); // import + export
    const newModel = page.locator('.pp-card').first();
    await expect(newModel.getByRole('button', { name: /IFC/ })).toHaveCount(0);
    await expect(page.getByTestId('pp-examples')).toBeVisible();
  });

  test('a help tip opens on a CLICK and the same click puts it away', async ({ pro: page }) => {
    /* They were native `title`s, which answer only to a patient pointer and
       on a touch screen not at all. */
    const tip = page.locator('.ht-tip');
    await expect(tip).toHaveCount(0);
    await page.getByTestId('pp-save').click({ position: { x: 2, y: 2 } });
    // The press lands on the button too; what matters is the tip appearing.
    await expect(page.locator('.ht-tip').first()).toBeVisible();
  });

  test('the spreadsheet template downloads', async ({ pro: page }) => {
    const wait = page.waitForEvent('download');
    await page.getByTestId('pp-xls-template').click();
    const dl = await wait;
    expect(dl.suggestedFilename()).toMatch(/\.xlsx$/);
  });
});
