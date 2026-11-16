import { test, expect } from '@playwright/test';
import { BUILD_FEATURES, ACCOUNTS_SKIP_REASON } from './build-features';

test.describe('@smoke account footer legal links', () => {
  test.skip(!BUILD_FEATURES.accounts, ACCOUNTS_SKIP_REASON);
  for (const path of ['/en/', '/en/tools/', '/en/blog/']) {
    test(`${path} links to both legal pages when accounts are built`, async ({ page }) => {
      await page.goto(path);
      for (const [label, href] of [['Terms', '/en/terms/'], ['Privacy', '/en/privacy/']]) {
        const link = page.locator('footer.lp-footer').getByRole('link', { name: label, exact: true });
        await expect(link).toHaveAttribute('href', href);
        await link.click();
        await expect(page).toHaveURL(new RegExp(`${href}$`));
        await expect(page.locator('#app h1').first()).toBeVisible();
        await expect(page.locator('#app h1').first()).not.toHaveText('That post does not exist.');
        await page.goto(path);
      }
    });
  }
});
