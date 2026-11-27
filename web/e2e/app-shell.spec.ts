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

test.describe('@smoke examples and tutorials', () => {
  test('an empty tab offers examples with previews, and one loads from the card', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('stabileo-start-card', 'on'); } catch { /* private */ } });
    await openBasic(page);
    const card = page.getByTestId('start-card');
    await expect(card).toBeVisible();
    await expect(card.locator('[data-testid^="start-example-"]')).toHaveCount(3);
    await expect.poll(() => card.locator('svg[data-preview] path.xp-member').count()).toBe(3);
    await card.getByTestId('start-example-portal-frame').click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBeGreaterThan(0);
    await expect(card).toHaveCount(0);
  });

  test('"Don\'t show at start" is remembered', async ({ page }) => {
    await page.addInitScript(() => {
      try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('stabileo-start-card', 'on'); } } catch { /* private */ }
    });
    await openBasic(page);
    await page.getByTestId('start-off').click();
    await expect(page.getByTestId('start-card')).toHaveCount(0);
    await page.reload();
    await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 45_000 });
    await expect(page.getByTestId('start-card')).toHaveCount(0);
  });

  test('File › Open example opens the gallery with previews, and a 3D example loads', async ({ page }) => {
    await openBasic(page);
    await page.getByTestId('tb-file').click();
    await page.getByTestId('tb-open-example').click();
    const dialog = page.getByTestId('examples-dialog');
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.locator('svg[data-preview] path.xp-member').count()).toBeGreaterThan(10);
    await dialog.getByTestId('ex-group-3d').click();
    await dialog.getByTestId('example-3d-portal-frame').click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBeGreaterThan(0);
  });

  test('File › View tutorials lists every walkthrough and links the YouTube channel', async ({ page }) => {
    await openBasic(page);
    await page.getByTestId('tb-file').click();
    await page.getByTestId('tb-tutorials').click();
    const dialog = page.getByTestId('tutorials-dialog');
    await expect(dialog.locator('[data-testid^="demo-"]')).toHaveCount(8);
    await expect(dialog.getByTestId('tutorials-youtube')).toHaveAttribute('href', 'https://www.youtube.com/@stabileoapp');
    await expect(dialog.getByTestId('tutorials-youtube')).toHaveAttribute('target', '_blank');
  });

  test('Project no longer holds the examples or the tutorials', async ({ page }) => {
    await openBasic(page);
    await openBasicProjectPanel(page);
    const panel = page.getByTestId('basic-panel');
    await expect(panel.getByTestId('ex-group-2d')).toHaveCount(0);
    await expect(panel.getByTestId('demo-menu-toggle')).toHaveCount(0);
  });
});

test.describe('@smoke examples on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Project carries the doors a phone has no title bar for', async ({ page }) => {
    await openBasic(page);
    await page.getByTestId('hdr-project').click();
    await page.getByTestId('lib-open-examples').click();
    await expect(page.getByTestId('examples-dialog')).toBeVisible();
    await page.getByTestId('pp-gallery-close').click();
    await page.getByTestId('lib-open-tutorials').click();
    await expect(page.getByTestId('tutorials-youtube')).toBeVisible();
  });
});

test.describe('@smoke reporting a bug', () => {
  test('with sign-in off, the button opens a GitHub issue instead of doing nothing', async ({ page }) => {
    await openBasic(page);
    const bug = page.getByTestId('report-bug');
    await expect(bug).toBeVisible();
    expect(await bug.evaluate((n) => n.tagName), 'a link, since there is no form to open').toBe('A');
    await expect(bug).toHaveAttribute('href', 'https://github.com/lambdaclass/stabileo/issues/new');
    await expect(bug).toHaveAttribute('target', '_blank');
  });
});
