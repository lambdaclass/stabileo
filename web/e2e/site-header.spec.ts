import { test, expect } from '@playwright/test';

/**
 * Every public page carries the same header (components/site/SiteHeader.svelte): the same items
 * in the same order, with the page's own section marked current.
 *
 *   npx playwright test --grep "@smoke site header"
 */
const ITEMS = ['basic', 'pro', 'ai', 'education', 'pricing', 'blog', 'research'];
const PAGES: Array<[string, string | null]> = [
  ['/en/', null],
  ['/en/blog/', 'blog'],
  ['/en/blog/the-determinism-boundary/', 'blog'],
  ['/en/cirsoc/', null],
  ['/en/research/', 'research'],
  ['/en/research/fracture/shauer-2025/', 'research'],
];

test.describe('@smoke site header', () => {
  for (const [path, current] of PAGES) {
    test(`${path} has the shared header${current ? `, ${current} current` : ''}`, async ({ page }) => {
      await page.goto(path);
      const header = page.locator('nav.site-header');
      await expect(header).toHaveCount(1);
      const items = await header.locator('[data-nav]').evaluateAll((els) => els.map((e) => e.getAttribute('data-nav')));
      expect(items).toEqual(ITEMS);
      const marked = await header.locator('[aria-current="page"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-nav')));
      expect(marked).toEqual(current ? [current] : []);
      await expect(page.locator('nav.nav')).toHaveCount(1);
    });
  }
});
