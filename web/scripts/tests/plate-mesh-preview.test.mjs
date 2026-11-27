import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../../', import.meta.url));

for (const mode of ['production', 'test']) {
  test.skip('known wrong result: #1928 the ' + mode + ' mesh dialog applies only its current preview and respects stored cell sizes', async t => {
    const server = await createServer({ root, mode, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
    try {
      await server.listen();
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        const url = new URL('/scripts/tests/fixtures/plate-mesh-preview.html', server.resolvedUrls.local[0]);
        await t.test('stop invalidates the previous element type before Apply', async () => {
          await page.goto(url.href);
          const apply = page.getByTestId('plate-mesh-apply');
          await expect(apply).toBeEnabled();
          const disabled = await page.evaluate(() => window.previewFixture.stopReplacement());
          assert.equal(disabled, true);
          await expect(apply).toBeDisabled();
          assert.deepEqual(await page.evaluate(() => window.previewFixture.cells()), [0, 0]);
          await page.getByTestId('plate-mesh-quad').click();
          await expect(apply).toBeEnabled();
          await page.getByTestId('plate-mesh-tri').click();
          await expect(apply).toBeEnabled();
          await apply.click();
          await expect.poll(() => page.evaluate(() => window.previewFixture.cells()[1])).toBeGreaterThan(0);
          assert.equal(await page.evaluate(() => window.previewFixture.cells()[0]), 0);
        });
        await t.test('an adopted shell keeps both explicit dimensions', async () => {
          await page.goto(url.href + '?adopted');
          await expect(page.getByTestId('plate-mesh-size')).toHaveValue('2');
          await expect(page.getByTestId('plate-mesh-size-v')).toHaveValue('1.5');
        });
      } finally { await browser.close(); }
    } finally { await server.close(); }
  });
}
