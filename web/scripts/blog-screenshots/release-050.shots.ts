import { test, expect } from '../../e2e/fixtures';
import { mkdirSync } from 'node:fs';

const OUT = process.env.BLOG_SHOTS_OUT ?? 'e2e/.artifacts/blog-shots';
mkdirSync(OUT, { recursive: true });

test.use({ recheckNotice: 'assert', appLocale: 'de' });

test('re-check notice in German on an example frame solved with results version 15', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stabileo-lang', 'de');
      localStorage.setItem('stabileo-lang-manual', '1');
    } catch { /* private mode */ }
  });
  await page.goto('/app/basic?e2e=1');
  await page.evaluate(() => window.__stabileoActions.loadExample('frame-cirsoc-dl'));
  await page.waitForTimeout(2000);
  const file = JSON.parse(await page.evaluate(() => (window.__stabileo as unknown as { serializeProject(): string }).serializeProject()));
  file.snapshot.solvedWith = { id: 'blog', resultsVersion: 15, analyses: ['linear', 'buckling', 'pdelta'] };
  expect(await page.evaluate((f) => window.__stabileoActions.loadProject(f), file)).toBe(true);
  await expect(page.getByTestId('recheck-notice')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('recheck-ack')).toBeEnabled({ timeout: 30_000 });
  await page.addStyleTag({ content: '.toast-container { display: none !important; }' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/blog-release-050-recheck-de.png` });
});
