import { test, expect, loadModel, alSection, designAll, designPlace } from './fixtures';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 820, height: 1180 }]) {
  test.skip(`@smoke known wrong result: #2199 wind and RC results retain the audit notice at ${viewport.width}px`, async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-loads').click();
    await page.getByTestId('pro-auto-loads-btn').click();
    await alSection(page, 'wind');
    await page.getByTestId('al-enable-wind').check();
    await page.getByTestId('al-preview-btn').click();
    await expect(page.getByTestId('al-preview').getByTestId('under-audit-notice')).toBeVisible();
    await page.getByTestId('al-apply').click();
    await expect(page.getByTestId('al-apply')).toHaveCount(0);
    expect((await page.evaluate(() => window.__stabileo.loadCaseNames())).some((name) => /wind/i.test(name))).toBe(true);
    await page.getByTestId('pro-panel-close').click();
    await page.setViewportSize(viewport);
    const notice = page.getByTestId('under-audit-notice').filter({ visible: true }).first();
    await expect(notice).toBeVisible();
    const checkLayout = async (name: string) => {
      await expect(notice).toContainText('Check these results independently');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const box = (await notice.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(await notice.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(await notice.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
      const link = (await notice.getByRole('link').boundingBox())!;
      expect(link.height).toBeGreaterThanOrEqual(44);
      expect(link.width).toBeGreaterThanOrEqual(44);
      const viewer = (await page.locator('.viewport-container').boundingBox())!;
      expect(viewer.y + viewer.height).toBeLessThanOrEqual(viewport.height);
      expect(viewer.height).toBeGreaterThan(100);
      await page.screenshot({ path: test.info().outputPath(`${name}-${viewport.width}.png`) });
    };
    await checkLayout('wind-audit');
    await page.setViewportSize({ width: 1280, height: 900 });
    await designAll(page);
    await designPlace(page, 'list');
    await expect(page.getByTestId('design-desk').getByTestId('under-audit-notice')).toBeVisible();
    await page.getByTestId('pr-stage-model').click();
    await page.setViewportSize(viewport);
    await checkLayout('rc-audit');
  });
}
