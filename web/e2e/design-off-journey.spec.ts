import { test, expect, type Page } from '@playwright/test';
import { bootPro, loadModel, designAll, solveModel, PRO_URL } from './fixtures';

/**
 * The design switch as a behaviour, not a hidden stage (`uiStore.designInPro`, off by default).
 *
 * A browser with no preference: design is off; a project that holds design opens with all of it
 * kept and nothing of design run, computed or shown as current; a restored tab cannot bring the
 * verification colouring back; a link that names a place of design asks first and turns it on
 * for that visit only; and turning it on says it is in development, with its limits listed.
 */
test.describe.configure({ mode: 'serial' });

async function openFresh(page: Page, url = PRO_URL): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 45_000 });
  await expect.poll(() => page.evaluate(() => window.__stabileo.solverReady()), { timeout: 45_000 }).toBe(true);
}

const reinforced = (page: Page) => page.evaluate(() =>
  window.__stabileo.elementIds().filter((id) => !!window.__stabileo.reinforcement(id)).length);

test('@slow a designed project opened with design off: kept whole, nothing of design run or shown as current', async ({ browser }) => {
  test.setTimeout(240_000);
  // Designed in a browser that turned design on.
  const designer = await (await browser.newContext()).newPage();
  await bootPro(designer);
  await loadModel(designer, 'rc-design-qa-8');
  await designAll(designer);
  const bars = await reinforced(designer);
  expect(bars, 'the design wrote bars to save').toBeGreaterThan(0);
  const file = await designer.evaluate(() => window.__stabileo.serializeProject());
  await designer.context().close();

  // Opened in a browser that never chose: design is off.
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await openFresh(page);
  await expect(page.getByTestId('pr-stage-design')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('stabileo-design-in-pro'))).toBeNull();

  expect(await page.evaluate((f) => window.__stabileoActions.loadProject(JSON.parse(f)), file)).toBe(true);
  // Its design is offered, not switched on, and none of it is lost.
  await expect(page.getByTestId('toast-enable-design')).toBeVisible();
  await expect(page.getByTestId('pr-stage-design')).toHaveCount(0);
  expect(await reinforced(page)).toBe(bars);

  // Solving computes the analysis and nothing of design: no run, no verdict, no colouring.
  await solveModel(page);
  expect(await page.evaluate(() => window.__stabileo.designRunId())).toBeNull();
  expect(await page.evaluate(() => window.__stabileo.runCounts())).toBeNull();
  const counts = await page.evaluate(() => window.__stabileo.counts());
  expect((counts.ok ?? 0) + (counts.warn ?? 0) + (counts.fail ?? 0), 'no verdict reads current').toBe(0);
  expect(await page.evaluate(() => window.__stabileo.diagramType())).not.toBe('verification');

  // Saved again with design off, the file still holds every bar.
  const again = await page.evaluate(() => window.__stabileo.serializeProject());
  const reopened = await (await ctx.newPage());
  await openFresh(reopened);
  expect(await reopened.evaluate((f) => window.__stabileoActions.loadProject(JSON.parse(f)), again)).toBe(true);
  expect(await reinforced(reopened)).toBe(bars);
  await ctx.close();
});

test('@slow a restored tab cannot bring the verification colouring back while design is off', async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await (await browser.newContext()).newPage();
  await bootPro(page);
  await loadModel(page, 'rc-design-qa-8');
  await designAll(page);
  await expect.poll(() => page.evaluate(() => window.__stabileo.diagramType())).toBe('verification');

  // A second tab keeps the first one's state, verification colouring included.
  await page.locator('.tab-bar .tab-add').click();
  await expect(page.locator('.tab-bar .tab')).toHaveCount(2);
  await page.getByTestId('pro-settings').click();
  await page.getByTestId('cfg-design-in-pro').uncheck();
  await expect(page.getByTestId('pr-stage-design')).toHaveCount(0);

  await page.locator('.tab-bar .tab').first().click();
  await expect.poll(() => page.evaluate(() => window.__stabileo.diagramType())).toBe('none');
  await page.context().close();
});

test('@smoke a link to a place of design asks first, and turns design on for that visit only', async ({ browser }) => {
  // The address the CIRSOC 201 post links to (`blog/posts/cirsoc-201-flexure.ts`, `PostEmbed`).
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await openFresh(page, `${PRO_URL}&example=rc-beam-flexure&proTab=design`);
  // Nothing turned on by the link itself.
  await expect(page.getByTestId('toast-enable-design-link')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('pr-stage-design')).toHaveCount(0);

  await page.getByTestId('toast-enable-design-link').click();
  await expect(page.getByTestId('pr-stage-design')).toBeVisible();
  // The browser's saved choice is untouched: the next visit starts off again.
  expect(await page.evaluate(() => localStorage.getItem('stabileo-design-in-pro'))).toBeNull();
  await openFresh(page);
  await expect(page.getByTestId('pr-stage-design')).toHaveCount(0);

  // Embedded in the post, the same: asked, and nothing turned on or saved by the link.
  await openFresh(page, `/app/pro?embed&e2e=1&example=rc-beam-flexure&proTab=design`);
  await expect(page.getByTestId('toast-enable-design-link')).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => localStorage.getItem('stabileo-design-in-pro'))).toBeNull();
  await ctx.close();
});

test('@smoke turning design on says it is in development and lists what it does not cover yet', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await openFresh(page);
  await page.getByTestId('pro-settings').click();
  const limits = page.getByTestId('cfg-design-limits');
  // Closed until asked for, and there whether design is on or off.
  await expect(limits).toBeVisible();
  expect(await limits.evaluate((d) => (d as HTMLDetailsElement).open)).toBe(false);
  expect(await limits.locator('li').count()).toBe(8);

  await page.getByTestId('cfg-design-in-pro').check();
  await expect(page.locator('.toast').filter({ hasText: 'in development' })).toBeVisible();
  await expect(page.getByTestId('pr-stage-design')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('stabileo-design-in-pro'))).toBe('1');
  await ctx.close();
});
