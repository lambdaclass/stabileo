import { test, expect } from './fixtures';
import { openAdvancedFunction, openStepsCatalog, expandStepsCatalog } from './advanced-panel';

test('@smoke the app opens without the course chunk, and fetches it when the Advanced course panel opens', async ({ page }) => {
  const fetched: string[] = [];
  page.on('request', (r) => fetched.push(new URL(r.url()).pathname));
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 45_000 });
  await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
  await page.getByTestId('rb-cmd-solve').click();
  await page.waitForTimeout(500);
  expect(fetched.filter((p) => /course-route/.test(p))).toEqual([]);
  await page.getByTestId('rb-cmd-advanced').click();
  await expect(page.getByTestId('adv-launcher')).toBeVisible();
  expect(fetched.some((p) => /course-route[^/]*\.js$/.test(p))).toBe(true);
  await openStepsCatalog(page);
});
