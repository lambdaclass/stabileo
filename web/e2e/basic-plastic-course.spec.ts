import { test, expect } from './fixtures';
import { openAdvancedFunction, openStepsCatalog, expandStepsCatalog } from './advanced-panel';

test.describe('@slow plastic collapse, withheld', () => {
  test('the course unit refuses, says why and links #758', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await openAdvancedFunction(page, 'plastic');

    const withheld = page.getByTestId('plastic-withheld');
    await expect(withheld).toBeVisible();
    await expect(withheld).toContainText(/4[.,]6/);
    // A note that explains, never a link out to the tracker; it closes.
    await expect(withheld.locator('a')).toHaveCount(0);
    await expect(withheld).not.toContainText('#758');
    for (const id of ['plastic-verdict', 'plastic-trace', 'plastic-curve', 'plastic-mechanism', 'plastic-user']) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
    await page.getByTestId('plastic-withheld-close').click();
    await expect(withheld).toHaveCount(0);
    await page.getByTestId('adv-close').click();
    await openStepsCatalog(page);
    await expandStepsCatalog(page);
    for (const id of ['plasticKinematic', 'plasticStatic']) {
      const row = page.getByTestId(`steps-withheld-${id}`);
      await expect(row).toContainText(/4[.,]6/);
      await expect(row.locator('a')).toHaveCount(0);
      await expect(page.getByTestId(`steps-open-${id}`)).toBeDisabled();
    }
    expect(errors).toEqual([]);
  });
});
