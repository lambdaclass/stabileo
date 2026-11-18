import { dwellingFloorLoads } from './load-generator-inputs';
import { test, expect, loadModel, alSection, designAll, designPlace, open3D } from './fixtures';
import type { DedalFile } from '../src/lib/store/file';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 820, height: 1180 }]) {
  test(`@smoke known wrong result: #2228 RC results independently trigger the main-view notice at ${viewport.width}px`, async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    const checkManualLoads = async () => {
      const { snapshot } = JSON.parse(await page.evaluate(() => window.__stabileo.serializeProject())) as DedalFile;
      expect(snapshot.loads.length).toBeGreaterThan(0);
      expect(snapshot.loads.some(({ data }) => 'generatedBy' in data || 'fromDef' in data)).toBe(false);
      expect(snapshot.designData?.loadBasis).toBeUndefined();
      expect(snapshot.groups?.some(([, group]) => group.kind === 'floorLoad') ?? false).toBe(false);
    };
    await page.getByTestId('pr-stage-model').click();
    if (await page.getByTestId('pro-panel-close').isVisible()) await page.getByTestId('pro-panel-close').click();
    await checkManualLoads();
    await expect(page.getByTestId('under-audit-notice').filter({ visible: true })).toHaveCount(0);
    await designAll(page);
    expect(await page.evaluate(() => window.__stabileo.runCounts()?.total ?? 0)).toBeGreaterThan(0);
    await page.getByTestId('pr-stage-model').click();
    if (await page.getByTestId('pro-panel-close').isVisible()) await page.getByTestId('pro-panel-close').click();
    await page.setViewportSize(viewport);
    await checkManualLoads();
    const notice = page.getByTestId('under-audit-notice').filter({ visible: true });
    await expect(notice).toHaveCount(1);
    await expect(notice).toContainText('Check these results independently');
    await expect(page.getByTestId('design-desk')).not.toBeVisible();
    await expect(page.getByTestId('rebar-workspace')).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`rc-only-audit-${viewport.width}.png`) });
  });

  test(`@smoke known wrong result: #2199 wind and RC results retain the audit notice at ${viewport.width}px`, async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-loads').click();
    await page.getByTestId('pro-auto-loads-btn').click();
    await alSection(page, 'wind');
    await page.getByTestId('al-enable-wind').check();
    await dwellingFloorLoads(page);
    await page.getByTestId('al-preview-btn').click();
    await expect(page.getByTestId('al-preview').getByTestId('under-audit-notice')).toBeVisible();
    await expect(page.getByTestId('al-delta')).toBeVisible();
    await expect(page.getByTestId('al-apply')).toBeEnabled();
    await page.getByTestId('al-apply').click();
    await expect(page.getByTestId('al-apply')).toHaveCount(0);
    expect((await page.evaluate(() => window.__stabileo.loadCaseNames())).some((name) => /wind/i.test(name))).toBe(true);
    await page.getByTestId('pro-panel-close').click();
    await page.setViewportSize(viewport);
    const notice = page.getByTestId('under-audit-notice').filter({ visible: true }).first();
    await expect(notice).toBeVisible();
    const checkLayout = async (name: string, viewerSelector = '.viewport-container') => {
      const notice = viewerSelector.includes('rebar-canvas') ? page.getByTestId('rebar-workspace').getByTestId('under-audit-notice') : page.getByTestId('under-audit-notice').filter({ visible: true }).first();
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
      expect(await notice.getByRole('link').evaluate((el) => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el; })).toBe(true);
      const viewer = (await page.locator(viewerSelector).boundingBox())!;
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
    if (await page.getByTestId('pro-panel-close').isVisible()) await page.getByTestId('pro-panel-close').click();
    await page.setViewportSize(viewport);
    await checkLayout('rc-audit');
    await page.setViewportSize({ width: 1280, height: 900 });
    await open3D(page);
    await page.setViewportSize(viewport);
    await expect(page.getByTestId('rebar-canvas')).toBeVisible();
    await checkLayout('cage-audit', '[data-testid="rebar-canvas"]');
  });
}
