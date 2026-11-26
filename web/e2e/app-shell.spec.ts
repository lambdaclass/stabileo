import { test, expect, type Page } from '@playwright/test';
import { loadModel, openBasicProjectPanel } from './fixtures';

async function openBasic(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 45_000 });
}

async function sides(page: Page, panel: string) {
  const p = (await page.locator(panel).boundingBox())!;
  const v = (await page.locator('.viewport-container').boundingBox())!;
  return { panelLeftOfModel: p.x + p.width <= v.x + 1, panelRightOfModel: p.x >= v.x + v.width - 1 };
}

test.describe('@smoke the title bar and the panel side', () => {
  test('Basic: the document commands are in the title bar, the mode beside the ribbon', async ({ page }) => {
    await openBasic(page);
    const header = page.locator('.app-header');
    await expect(header.getByTestId('hdr-project')).toBeVisible();
    await expect(header.getByTestId('rb-save')).toBeVisible();
    await expect(header.getByTestId('tb-undo')).toBeVisible();
    await expect(page.getByTestId('ribbon').getByTestId('rb-quick')).toHaveCount(0);
    await expect(page.getByTestId('workspace-switch').locator('.mode-toggle button')).toHaveCount(2);

    await page.getByTestId('workspace-switch').locator('.pro-mode-btn').click();
    await expect(page.getByTestId('pro-ribbon')).toBeVisible();
    await expect(header.getByTestId('pr-project')).toBeVisible();
  });

  test('the panel opens on the left, moves right and remembers it', async ({ page }) => {
    await openBasic(page);
    await openBasicProjectPanel(page);
    expect((await sides(page, '[data-testid="basic-panel"]')).panelLeftOfModel).toBe(true);

    await page.getByTestId('panel-side').click();
    await expect(page.getByTestId('panel-side')).toHaveAttribute('data-side', 'right');
    expect((await sides(page, '[data-testid="basic-panel"]')).panelRightOfModel).toBe(true);

    await page.reload();
    await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 45_000 });
    await expect(page.getByTestId('panel-side')).toHaveAttribute('data-side', 'right');
  });

  test('PRO: the panel follows the same side', async ({ page }) => {
    await page.goto('/app/pro?e2e=1');
    await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 45_000 });
    expect((await sides(page, '.pro-sidebar')).panelLeftOfModel).toBe(true);
    await page.getByTestId('panel-side').click();
    expect((await sides(page, '.pro-sidebar')).panelRightOfModel).toBe(true);
  });

  test('File › New project opens a tab', async ({ page }) => {
    await openBasic(page);
    const tabs = page.locator('.tab-bar .tab');
    const before = await tabs.count();
    await page.getByTestId('tb-file').click();
    await page.getByTestId('tb-file-menu').getByRole('menuitem').first().click();
    await expect(tabs).toHaveCount(before + 1);
  });

  test('the history scrubber walks back to the start and forward again', async ({ page }) => {
    await openBasic(page);
    await loadModel(page, 'two-story-frame');
    const nodes = await page.evaluate(() => window.__stabileo.nodeCount());
    await page.getByTestId('rb-cmd-node').click();
    const canvas = page.locator('.viewport2d-wrapper canvas');
    const box = (await canvas.boundingBox())!;
    await canvas.click({ position: { x: box.width * 0.3, y: box.height * 0.3 } });
    await canvas.click({ position: { x: box.width * 0.6, y: box.height * 0.3 } });
    await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBeGreaterThan(nodes);
    const edited = await page.evaluate(() => window.__stabileo.nodeCount());

    await page.getByTestId('tb-history').click();
    const scrub = page.getByTestId('tb-history-scrub');
    await scrub.fill('0');
    await expect(page.getByTestId('tb-undo')).toBeDisabled();
    await page.getByTestId('tb-history-pop').getByRole('button').last().click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBe(edited);
  });
});
