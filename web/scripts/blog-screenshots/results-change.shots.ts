import { test, expect } from '../../e2e/fixtures';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = process.env.BLOG_SHOTS_OUT ?? 'e2e/.artifacts/blog-shots';
mkdirSync(OUT, { recursive: true });

test.use({ recheckNotice: 'assert' });

async function english(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stabileo-lang', 'en');
      localStorage.setItem('stabileo-lang-manual', '1');
    } catch { /* private mode */ }
  });
}

const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png` });

const hide = (page: Page, selectors: string) => page.addStyleTag({ content: `${selectors} { display: none !important; }` });

test('re-check notice on an example frame solved with results version 15', async ({ page }) => {
  await english(page);
  await page.goto('/app/basic?e2e=1');
  await page.evaluate(() => window.__stabileoActions.loadExample('frame-cirsoc-dl'));
  await page.waitForTimeout(2000);
  const file = JSON.parse(await page.evaluate(() => (window.__stabileo as unknown as { serializeProject(): string }).serializeProject()));
  file.snapshot.solvedWith = { id: 'blog', resultsVersion: 15, analyses: ['linear', 'buckling', 'pdelta'] };
  expect(await page.evaluate((f) => window.__stabileoActions.loadProject(f), file)).toBe(true);
  await expect(page.getByTestId('recheck-notice')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('recheck-ack')).toBeEnabled({ timeout: 30_000 });
  await hide(page, '.toast-container');
  await page.waitForTimeout(1500);
  await shot(page, 'blog-results-recheck');
});

test('refusal: the hidden mechanism example', async ({ page }) => {
  await english(page);
  await page.goto('/app/basic?e2e=1&example=hidden-mechanism');
  await page.waitForTimeout(4000);
  await page.evaluate(() => window.__stabileoActions.solve());
  await page.waitForTimeout(4000);
  await shot(page, 'blog-results-refusal');
});

test('changelog page', async ({ page }) => {
  await english(page);
  await page.goto('/en/changelog/');
  await page.waitForTimeout(5000);
  await shot(page, 'blog-results-changelog');
});
