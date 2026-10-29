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

// Below 1141px the nav collapses into its menu; from 1141px the links show (site-nav-width.spec.ts).
for (const locale of ['en', 'es', 'pt']) {
  for (const width of [1000, 1100]) {
    test(`@smoke site header bounds ${locale} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${locale}/research/`);
      const header = page.locator('.site-header');
      const toggle = header.locator('.nav-toggle');
      await expect(toggle).toBeVisible();
      await expect(header.locator('.nav-links')).toBeHidden();
      const brand = (await header.locator('.nav-brand').boundingBox())!;
      const actions = (await header.locator('.nav-actions').boundingBox())!;
      expect(brand.x + brand.width).toBeLessThanOrEqual(actions.x);
      expect(actions.x + actions.width).toBeLessThanOrEqual(width);
      await toggle.click();
      const links = header.locator('[data-nav]');
      let bottom = actions.y + actions.height;
      for (const link of await links.all()) {
        await expect(link).toBeVisible();
        const box = (await link.boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(bottom);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        await link.click({ trial: true });
        bottom = box.y + box.height;
      }
      await header.locator('[data-nav="blog"]').click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/blog/`));
    });
  }
}
