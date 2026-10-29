import { expect, type Page } from '@playwright/test';

export async function bootLanding(page: Page, opts: { locale?: string; manual?: boolean } = {}) {
  const { locale = 'en', manual = true } = opts;
  await page.addInitScript(
    ({ locale, manual }) => {
      try {
        localStorage.clear();
        if (manual) {
          localStorage.setItem('stabileo-lang', locale);
          localStorage.setItem('stabileo-lang-manual', '1');
        }
      } catch {
        /* private mode */
      }
    },
    { locale, manual },
  );
  await page.goto('/');
  await expect(page.locator('.landing')).toBeVisible();
}

