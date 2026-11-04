import { test, expect, type Page } from './fixtures';

async function openPhonePanel(page: Page) {
  const toggle = page.getByTestId('mobile-panel-toggle');
  if (!(await toggle.isVisible())) return;
  if (!(await toggle.evaluate((el) => el.classList.contains('active')))) await toggle.click();
  const grid = page.getByTestId('pm-grid-toggle');
  if (await grid.getAttribute('aria-expanded') === 'true') await grid.click();
}

async function warningInView(page: Page) {
  const alert = page.getByTestId('self-check-warning').first();
  // Not scrolled into view: it must be visible as numbers are inspected. The phone
  // sheet is the exception, too short for the warning and the mode table together.
  if ((page.viewportSize()?.width ?? 0) <= 600 && await page.getByTestId('adv-modal-row-0').isVisible()) await alert.scrollIntoViewIfNeeded();
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

    test('PRO static warning precedes numerical results', async ({ pro: page }) => {
      await page.evaluate(async () => {
        await window.__stabileoActions.loadExample('3d-portal-frame');
        await window.__stabileoActions.solve();
        window.__stabileoActions.seedSelfCheckWarning(100, 10);
        window.__stabileoActions.openProTab('results');
      });
      await openPhonePanel(page);
      await warningInView(page);
      const warning = page.getByTestId('self-check-warning').first();
      const content = page.locator('.pro-viz-section').first();
      expect((await warning.boundingBox())!.y).toBeLessThan((await content.boundingBox())!.y);
    });

    test('PRO modal warning appears above the mode table', async ({ pro: page }) => {
      await page.evaluate(() => window.__stabileoActions.loadExample('3d-portal-frame'));
      if (width > 600) {
        await page.getByTestId('pr-stage-analyse').click();
        await page.getByTestId('pr-cmd-advanced').click();
      } else {
        await page.evaluate(() => window.__stabileoActions.openProTab('advanced'));
        await openPhonePanel(page);
      }
      const run = page.getByTestId('adv-run-modal');
      await run.click();
      const firstMode = page.getByTestId('adv-modal-row-0');
      await expect(firstMode).toBeVisible();
      await page.evaluate(() => window.__stabileoActions.seedSelfCheckWarning(100));
      if (width <= 600) await firstMode.scrollIntoViewIfNeeded();
      await expect(firstMode).toBeInViewport({ ratio: 1 });
      const select = firstMode.getByRole('button');
      const box = (await select.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      for (const cell of await page.locator('.modal-table th, .modal-table td, .modal-table button, .modal-group .adv-inline, .modal-group .adv-label, .modal-group .adv-check').all()) {
        expect(await cell.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
      }
      const recording = page.getByTestId('modal-record');
      await expect(recording).toBeVisible();
      await expect(recording.locator('button, input')).toHaveCount(2);
      for (const control of await recording.locator('button, input').all()) {
        const box = (await control.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(await control.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
      }
      for (const text of await recording.locator('label, span').all()) {
        expect(await text.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
      }
      expect(await recording.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await select.focus();
      await page.keyboard.press('Enter');
      await expect(select).toHaveAttribute('aria-pressed', 'true');
      await warningInView(page);
      const alert = page.getByTestId('self-check-warning').first();
      expect((await alert.boundingBox())!.height).toBeLessThanOrEqual(64);
      expect((await alert.boundingBox())!.y).toBeLessThan((await firstMode.boundingBox())!.y);
      expect(await page.locator('.modal-table').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.evaluate(() => window.__stabileoActions.openProTab('results'));
      await openPhonePanel(page);
      await warningInView(page);
    });
  });
}
