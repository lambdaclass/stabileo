/**
 * On a phone the armed tool's options sit in the modelling sheet, under the
 * tool buttons and above the table, in the ribbon's order; any other sheet
 * puts the pointer back to selecting; a toast sits on top of the sheet.
 */
import { test, expect } from './fixtures';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test.describe('@smoke modelling on a phone', () => {
  test('options in the sheet, ribbon order, other sheets disarm, toast above the sheet', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await expect(page.getByTestId('tool-options-bar')).toHaveCount(0);

    await page.getByTestId('rb-cmd-model').tap();
    const tabs = await page.locator('[data-testid^=dt-tab-]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    expect(tabs).toEqual(['dt-tab-nodes', 'dt-tab-elements', 'dt-tab-materials', 'dt-tab-sections', 'dt-tab-supports', 'dt-tab-loads']);
    const opts = page.getByTestId('dt-tool-options');
    await expect(opts).toBeVisible();
    // Between the tool buttons and the table: both measured in one frame, once
    // the sheet has finished sliding up.
    const gap = () => page.evaluate(() => {
      const tab = document.querySelector('[data-testid=dt-tab-nodes]')!.getBoundingClientRect();
      const opt = document.querySelector('[data-testid=dt-tool-options]')!.getBoundingClientRect();
      return Math.round(opt.top - tab.bottom);
    });
    await expect.poll(async () => { const a = await gap(); await page.waitForTimeout(150); return a === (await gap()); }).toBe(true);
    expect(await gap()).toBeGreaterThanOrEqual(-1);

    await page.getByTestId('dt-tab-materials').tap();
    await expect(opts).toHaveCount(0);
    await page.getByTestId('dt-tab-loads').tap();
    await expect(opts).toBeVisible();

    await page.evaluate(() => window.__stabileoActions.solve());
    const toast = page.locator('.toast').first();
    await expect(toast).toBeVisible();
    const overlap = () => page.evaluate(() => {
      const sheet = document.querySelector('[data-testid=basic-panel]')!.getBoundingClientRect();
      const t = document.querySelector('.toast')!.getBoundingClientRect();
      return Math.round(t.bottom - sheet.top);
    });
    await expect.poll(overlap).toBeLessThanOrEqual(1);

    await page.getByTestId('rb-cmd-advanced').tap();
    await expect.poll(() => page.evaluate(() => window.__stabileo.viewportPick().tool)).toBe('select');
  });
});
