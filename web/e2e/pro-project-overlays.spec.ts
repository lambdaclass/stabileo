import { test, expect } from './fixtures';

/*
 * What opens over the Project tab sits over everything: the hover tips and the example
 * gallery are drawn on the document, not inside the right panel, whose stacking context put
 * the tips under the viewport and let the panel's resize handle light up through the gallery.
 */
test.use({ viewport: { width: 1440, height: 900 } });

test.describe('@smoke PRO project tab overlays', () => {
  test('a tip opens on the document, beside its button and inside the window', async ({ pro: page }) => {
    await page.getByTestId('pr-project').click();
    const save = page.getByTestId('pp-save');
    await save.hover();
    const tip = page.getByRole('tooltip');
    await expect(tip).toBeVisible();
    expect(await tip.evaluate((el) => el.parentElement === document.body)).toBe(true);
    const t = (await tip.boundingBox())!, b = (await save.boundingBox())!;
    expect(t.x + t.width).toBeLessThanOrEqual(b.x);       // to the left of the button
    expect(t.x).toBeGreaterThanOrEqual(0);
    // Over the viewport and above it: fixed on the document, at a z-index the page's panels do not reach.
    const style = await tip.evaluate((el) => ({ position: getComputedStyle(el).position, z: Number(getComputedStyle(el).zIndex) }));
    expect(style.position).toBe('fixed');
    expect(style.z).toBeGreaterThan(100);
  });

  test('pressing the button does the thing and leaves no tip pinned', async ({ pro: page }) => {
    await page.getByTestId('pr-project').click();
    await page.getByTestId('pp-examples').click();
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });

  test('the gallery covers the panel\'s resize handle', async ({ pro: page }) => {
    await page.getByTestId('pr-project').click();
    await page.getByTestId('pp-examples').click();
    const handle = (await page.locator('.pro-resize-handle').boundingBox())!;
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.className ?? '',
      [handle.x + handle.width / 2, handle.y + handle.height / 2]);
    expect(String(hit)).not.toContain('pro-resize-handle');
  });
});
