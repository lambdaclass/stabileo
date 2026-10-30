import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 360, height: 780 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 810, height: 1080 }]) {
  test(`@smoke four-cable form at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/en/research/form-finding/pastrana-2026?e2e=1');
    await expect(page.getByRole('heading', { name: 'Four cables, one equilibrium' })).toBeVisible();
    await expect(page.getByTestId('form-result')).toContainText('3.000 kN');
    await expect(page.locator('.rs-viewer-host canvas').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const app = await page.locator('.form-app').boundingBox();
    const article = await page.locator('.rs-shell-article').boundingBox();
    expect(app!.y).toBeLessThan(article!.y);
    for (const button of await page.locator('.form-app button').all()) {
      const box = await button.boundingBox();
      if (box) expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole('textbox', { name: 'Force density', exact: true }).fill('2');
    await page.getByRole('button', { name: 'Recompute live' }).click();
    await expect(page.getByTestId('form-source')).toHaveText('Live Rust computation');
    await expect(page.getByTestId('form-result')).toContainText('−0.500 m');
    await expect(page.getByTestId('form-result')).toContainText('5.745 kN');
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Edit in Stabileo', exact: true }).click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(/app\/basic\?e2e=1#data=2\./);
    type Hooks = { hasDrawnResults(): boolean; nodePos(id: number): { x: number; y: number; z: number } };
    await expect.poll(() => popup.evaluate(() => (window as unknown as { __stabileo?: Hooks }).__stabileo?.hasDrawnResults()), { timeout: 60000 }).toBe(true);
    const center = await popup.evaluate(() => (window as unknown as { __stabileo: Hooks }).__stabileo.nodePos(1));
    expect(center.z).toBeCloseTo(-0.5, 12);
    await popup.close();
    await page.getByRole('button', { name: 'Restart', exact: true }).click();
    await expect(page.getByTestId('form-source')).toContainText('Precomputed replay');
  });
}
