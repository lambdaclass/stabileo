import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../../', import.meta.url));

for (const mode of ['production', 'test']) {
  test('the ' + mode + ' mesh dialog applies only its current preview and respects stored cell sizes', async t => {
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
          if (!disabled) await expect.poll(() => page.evaluate(() => window.previewFixture.cells().some(count => count > 0))).toBe(true);
          const cells = await page.evaluate(() => window.previewFixture.cells());
          assert.deepEqual({ disabled, cells }, { disabled: true, cells: [0, 0] });
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
        await t.test('mixed and wholly refused batches keep the refusal visible', async () => {
          await page.goto(url.href + '?refused=2');
          await expect(page.locator('tr.refused')).toHaveCount(2);
          const apply = page.getByTestId('plate-mesh-apply');
          await expect(apply).toBeDisabled();
          assert.deepEqual(await page.evaluate(() => window.previewFixture.cells()), [0, 0]);
          await page.goto(url.href + '?refused=1');
          await expect(page.locator('tr.refused')).toHaveCount(1);
          await apply.click();
          if (mode === 'production') {
            await expect(page.getByTestId('plate-mesh-result')).toContainText('1');
            assert.equal(await page.evaluate(() => window.previewFixture.closed), false);
          } else {
            await expect.poll(() => page.evaluate(() => window.previewFixture.refusal())).toContain('1');
            assert.equal(await page.evaluate(() => window.previewFixture.closed), true);
          }
          assert.ok(await page.evaluate(() => window.previewFixture.cells()[0] > 0));
        });
        await t.test('an adopted shell keeps both explicit dimensions', async () => {
          for (const [a, b] of [[2, 1.5], [1, 1], [0.75, 0.5]]) {
            await page.goto(url.href + '?adopted&a=' + a + '&b=' + b);
            await expect(page.getByTestId('plate-mesh-size')).toHaveValue(String(a));
            await expect(page.getByTestId('plate-mesh-size-v')).toHaveValue(String(b));
          }
        });
        await t.test('a stopped batch never returns plans, including its last progress callback', async () => {
          await page.goto(url.href);
          await page.waitForFunction(() => !!window.previewFixture);
          for (const count of [1, 2]) {
            const run = stopAt => page.evaluate(([count, stopAt]) => window.previewFixture.batch(count, stopAt), [count, stopAt]);
            assert.equal((await run(-1)).length, count);
            for (let stopAt = 0; stopAt <= count; stopAt++) assert.equal(await run(stopAt), null);
          }
        });
      } finally { await browser.close(); }
    } finally { await server.close(); }
  });
}
