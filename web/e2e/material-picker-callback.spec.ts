import { test, expect } from './fixtures';
import { createServer } from 'vite';

test.skip('known wrong result: #2491 — @smoke an open material draft survives a replacement save callback', async ({ page }) => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error' });
  try {
    await server.listen();
    const url = server.resolvedUrls!.local[0]!;
    await page.route(url + 'picker-test', async route => route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml('/picker-test',
      '<button id="replace">Replace callback</button><button id="toggle">Toggle</button><script type="module" src="/e2e/fixtures/material-picker.svelte.ts"></script>') }));
    await page.goto(url + 'picker-test');
    const field = page.getByTestId('mat-form-nu');
    await field.fill('0.271');
    await page.locator('#replace').evaluate((button: HTMLButtonElement) => button.click());
    await expect(field).toHaveValue('0.271');
    await page.locator('.preset-tabs button').first().click();
    await expect(field).toHaveCount(0);
    await page.locator('#replace').evaluate((button: HTMLButtonElement) => button.click());
    await expect(field).toHaveCount(0);
    await page.locator('#toggle').evaluate((button: HTMLButtonElement) => button.click());
    await expect(field).toHaveCount(0);
    await page.locator('#toggle').click();
    await expect(field).toBeVisible();
    await expect(field).not.toHaveValue('0.271');
  } finally {
    await server.close();
  }
});
