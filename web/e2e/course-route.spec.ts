import { test, expect } from './fixtures';

test('@smoke the app opens without the course chunk, and fetches it when the explained catalog opens', async ({ page }) => {
  const fetched: string[] = [];
  page.on('request', (r) => fetched.push(new URL(r.url()).pathname));
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 45_000 });
  await page.getByTestId('rb-cmd-advanced').click();
  await expect(page.getByTestId('adv-steps')).toBeVisible();
  expect(fetched.filter((p) => /course-route/.test(p))).toEqual([]);
  await page.getByTestId('adv-steps').click();
  await expect(page.getByTestId('steps-catalog')).toBeVisible();
  expect(fetched.some((p) => /course-route[^/]*\.js$/.test(p))).toBe(true);
});
