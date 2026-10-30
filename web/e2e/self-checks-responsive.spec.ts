import { test, expect, type Page } from './fixtures';

async function warningInView(page: Page) {
  const alert = page.getByTestId('self-check-warning').first();
  // Do not scroll the alert into view: it must be visible as numbers are inspected.
  await expect(alert).toBeInViewport({ ratio: 1 });
  expect(await alert.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const width of [390, 810]) {
  test.describe(`@smoke self-check warnings at ${width}px`, () => {
    test.use({ viewport: { width, height: 844 }, hasTouch: true });

    test('static warning precedes a long results table on first opening', async ({ page }) => {
      await page.goto('/app/basic?e2e=1');
      await page.waitForFunction(() => !!window.__stabileoActions);
      await page.evaluate(async () => {
        await window.__stabileoActions.loadExample('two-story-frame');
        await window.__stabileoActions.solve();
        window.__stabileoActions.seedSelfCheckWarning(100, 10);
      });
      const axial = page.getByTestId('rb-cmd-axial');
      if (!(await axial.isVisible())) await page.getByTestId('rb-cluster-results').click();
      await axial.click();
      await warningInView(page);
      const alert = page.getByTestId('self-check-warning').first();
      const table = page.locator('.results-table-wrap').first();
      await expect(table).toBeInViewport();
      expect((await alert.boundingBox())!.height).toBeLessThanOrEqual(64);
      await expect(alert.locator('details')).not.toHaveAttribute('open', '');
      expect(await alert.locator('summary').textContent()).toContain('1000');
      const checksToggle = page.getByTestId('result-checks-toggle').first();
      expect((await checksToggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      for (const text of await checksToggle.locator('span').all()) {
        expect(await text.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
      }
      const toggle = alert.locator('summary');
      expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await toggle.click();
      expect((await alert.locator('.warning-details').boundingBox())!.height).toBeLessThanOrEqual(160);
      await toggle.click();
      expect((await alert.boundingBox())!.y).toBeLessThan((await table.boundingBox())!.y);
    });

    test('modal warning precedes numbers and mode controls are touch sized', async ({ page }) => {
      await page.goto('/app/basic?e2e=1');
      await page.waitForFunction(() => !!window.__stabileoActions);
      await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
      await page.getByTestId('rb-cmd-advanced').click();
      await page.getByRole('button', { name: /^Dynamic$/ }).first().click();
      const row = page.locator('.adv-result-row').filter({ has: page.locator('.small-btn') }).first();
      await expect(row).toBeVisible();
      await page.evaluate(() => window.__stabileoActions.seedSelfCheckWarning(100));
      // Warning volume must not push the controls outside the initial viewport.
      await expect(row).toBeInViewport({ ratio: 1 });
      await warningInView(page);
      for (const button of await row.locator('button').all()) {
        const box = (await button.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      for (const info of await page.locator('.adv-result-info, .adv-result-label').all()) {
        expect(await info.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
      }
      expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect((await page.getByTestId('self-check-warning').first().boundingBox())!.y).toBeLessThan((await row.boundingBox())!.y);
    });

    test('PRO modal warning appears above the mode table', async ({ pro: page }) => {
      await page.evaluate(() => window.__stabileoActions.loadExample('3d-portal-frame'));
      await page.getByTestId('pr-stage-analyse').click();
      await page.getByTestId('pr-cmd-advanced').click();
      const run = page.getByTestId('adv-run-modal');
      await run.click();
      const firstMode = page.getByTestId('adv-modal-row-0');
      await expect(firstMode).toBeVisible();
      await page.evaluate(() => window.__stabileoActions.seedSelfCheckWarning(100));
      await expect(firstMode).toBeInViewport({ ratio: 1 });
      const select = firstMode.getByRole('button');
      const box = (await select.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      for (const cell of await page.locator('.modal-table th, .modal-table td, .modal-table button, .modal-group .adv-inline, .modal-group .adv-label, .modal-group .adv-check').all()) {
        expect(await cell.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
      }
      await select.focus();
      await page.keyboard.press('Enter');
      await expect(select).toHaveAttribute('aria-pressed', 'true');
      await warningInView(page);
      const alert = page.getByTestId('self-check-warning').first();
      expect((await alert.boundingBox())!.height).toBeLessThanOrEqual(64);
      expect((await alert.boundingBox())!.y).toBeLessThan((await firstMode.boundingBox())!.y);
      expect(await page.locator('.modal-table').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    });
  });
}
