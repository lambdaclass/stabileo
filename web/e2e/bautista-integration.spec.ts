import { test, expect, loadModel, solveModel } from './fixtures';
import type { Page } from '@playwright/test';

const fits = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

for (const width of [375, 768]) {
  test(`@smoke Bautista public pages at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1024 });
    for (const [name, url, ready] of [
      ['tools', '/en/tools/', 'h1'],
      ['beam', '/en/tools/simply-supported-beam/?e2e=1', '[data-testid="agreement"]'],
      ['mohr', '/en/tools/mohr-2d/?e2e=1', '[data-testid="mohr2d"]'],
      ['register', '/en/register/', 'h1'],
    ]) {
      await page.goto(url!);
      await expect(page.locator(ready!).first()).toBeVisible();
      await fits(page);
      await page.screenshot({ path: info.outputPath(`${name}-${width}.png`), fullPage: true });
    }
    await page.goto('/en/diagram-game/?e2e=1&seed=12345');
    await page.getByTestId('dg-start').click();
    await expect(page.getByTestId('dg-options')).toBeVisible();
    await fits(page);
    for (const option of await page.getByTestId('dg-options').getByRole('button').all()) {
      const box = await option.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: info.outputPath(`game-${width}.png`), fullPage: true });
  });

  test(`@smoke Bautista axes and reinforcement sheets at ${width}px`, async ({ pro: page }, info) => {
    await loadModel(page, 'rc-qa-diagnostic');
    await page.evaluate(() => window.__stabileoActions.setMeshBeforeAnalysis(false));
    await solveModel(page);
    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('pr-cmd-rcSheets').click();
    await expect(page.getByTestId('rc-design')).toBeVisible();
    await page.getByTestId('rc-design').click();
    await expect(page.getByTestId('rc-open-beam')).toBeEnabled();
    await page.getByTestId('rc-open-beam').click();
    await page.setViewportSize({ width, height: 1024 });
    const workspace = page.getByTestId('rc-sheets-workspace');
    await expect(workspace).toBeVisible();
    await fits(page);
    const close = workspace.getByTestId('rc-close');
    await expect(close).toBeInViewport();
    expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    for (const family of ['beam', 'column', 'slab', 'wall', 'punching']) {
      const tab = workspace.getByTestId(`rc-tab-${family}`);
      await tab.scrollIntoViewIfNeeded();
      await expect(tab).toBeInViewport();
      await tab.click();
      await fits(page);
      await page.screenshot({ path: info.outputPath(`reinforcement-${family}-${width}.png`) });
    }
    await close.click();
    await page.getByTestId('axes-open-3d').click();
    const picker = page.getByTestId('axes-picker');
    await expect(picker).toBeVisible();
    const box = (await picker.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(1024);
    await page.screenshot({ path: info.outputPath(`axes-${width}.png`) });
    await picker.getByTestId('axes-done').click();
  });
}
