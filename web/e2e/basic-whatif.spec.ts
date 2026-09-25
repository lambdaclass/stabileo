/**
 * Explore ("What if…?") keeps what is on screen, reports a mechanism, and
 * leaves the model and live calc as it found them.
 *
 * Every slider move used to land the canvas on the deformed shape; picking a
 * diagram in the ribbon took the panel off screen; and changing a support
 * into a mechanism silently kept the last good diagram.
 */
import { test, expect } from './fixtures';

test.describe('@smoke explore', () => {
  test('a slider keeps the diagram, a mechanism is said, closing restores', async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => { try { localStorage.setItem('liveCalc', 'false'); } catch { /* private mode */ } });
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await page.evaluate(() => window.__stabileoActions.solve());
    await page.getByTestId('rb-cmd-momentY').click();
    const diagram = () => page.evaluate(() => window.__stabileo.diagramType());
    await expect.poll(diagram).toBe('moment');

    await page.getByTestId('rb-cmd-advanced').click();
    await page.locator('button.adv-btn', { hasText: /Explore|Explorar/ }).first().click();
    const panel = page.getByTestId('whatif-panel');
    await expect(panel).toBeVisible();

    const version = await page.evaluate(() => window.__stabileo.modelVersion());
    await panel.locator('input.wif-range').first().evaluate((el: HTMLInputElement) => {
      el.value = '2';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect.poll(() => page.evaluate(() => window.__stabileo.modelVersion())).toBeGreaterThan(version);
    await expect.poll(() => page.evaluate(() => window.__stabileo.viewportPick().hasResults)).toBe(true);
    await expect.poll(diagram).toBe('moment');

    // The panel's own result row, and the ribbon, both leave the panel in view.
    await page.getByTestId('whatif-diagram-shear').click();
    await expect.poll(diagram).toBe('shear');
    await page.getByTestId('rb-cmd-axial').click();
    await expect.poll(diagram).toBe('axial');
    await expect(panel).toBeVisible();

    for (const s of await panel.locator('[data-testid^=whatif-support-]').all()) await s.selectOption('rollerX');
    await expect(page.getByTestId('whatif-error')).toBeVisible();
    await page.getByTestId('whatif-reset').click();
    await expect(page.getByTestId('whatif-error')).toHaveCount(0);

    await page.getByTestId('adv-close').click();
    await expect(panel).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('liveCalc'))).toBe('false');
    await expect.poll(() => page.evaluate(() => window.__stabileo.viewportPick().hasResults)).toBe(true);
  });
});
