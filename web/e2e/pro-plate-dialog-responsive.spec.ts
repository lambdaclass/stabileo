import { expect, test } from './fixtures';

for (const [label, width, height] of [['phone', 390, 844], ['tablet', 820, 1180]] as const) {
  test.skip(`@smoke known wrong result: #1928 — the plate mesh dialog accepts a tap on a ${label}`, async ({ pro: page }) => {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.__stabileoActions.openProTab('shells'));
    if (await page.getByTestId('mobile-panel-toggle').isVisible() && !(await page.locator('.pro-content').isVisible())) {
      await page.getByTestId('mobile-panel-toggle').click();
    }
    await page.getByTestId('write-plate').click();
    await page.getByTestId('write-corners-circle').click();
    await page.getByTestId('plate-circle-center').fill('1; 2; 3');
    await page.getByTestId('write-plate-card-submit').click();
    await page.getByTestId('plate-mesh-open').click();
    const dialog = page.getByTestId('plate-mesh-dialog');
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
    await page.getByTestId('plate-mesh-apply').click();
    await expect(dialog).toBeHidden();
  });
}
